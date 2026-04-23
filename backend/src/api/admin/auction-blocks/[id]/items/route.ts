import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import AuctionModuleService from "../../../../../modules/auction/service"
import { AUCTION_MODULE } from "../../../../../modules/auction"
import { CreateBlockItemSchema, validateBody } from "../../../../../lib/validation"

// GET /admin/auction-blocks/:id/items — List items in a block
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)

  const [items, count] = await auctionService.listAndCountBlockItems(
    { auction_block_id: req.params.id },
    { order: { lot_number: "ASC" } }
  )

  res.json({ block_items: items, count })
}

// POST /admin/auction-blocks/:id/items — Add item to block
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const validation = validateBody(CreateBlockItemSchema, req.body)
  if ("error" in validation) {
    res.status(400).json({
      message: validation.error,
      issues: validation.details.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    })
    return
  }

  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const blockId = req.params.id
  const releaseId = validation.data.release_id

  // Duplicate detection: check if release already in this block
  const existing = await auctionService.listBlockItems({
    auction_block_id: blockId,
    release_id: releaseId,
  })
  if (existing.length > 0) {
    res.status(409).json({ message: "Release is already in this block" })
    return
  }

  const { release_id, start_price: explicitStartPrice, reserve_price, lot_number } = validation.data
  // Pass through any extra fields (estimated_value, buy_now_price) from req.body as-is
  const { estimated_value, buy_now_price } = req.body as any

  // Start-Preis-Default (rc47.2 Preis-Modell, Phase 2):
  // Wenn der Client keinen expliziten start_price schickt, berechnen wir
  // server-seitig den Default aus `round(shop_price × default_start_price_percent / 100)`.
  // Fallback-Kette shop_price → Release.estimated_value → legacy_price. Wenn
  // nichts davon > 0, 400 zurück — ein Item ohne sinnvollen Start-Preis in eine
  // Auction zu packen ergibt keinen Sinn.
  let startPrice: number
  if (explicitStartPrice != null && explicitStartPrice > 0) {
    startPrice = explicitStartPrice
  } else {
    const release = await pgConnection("Release")
      .where("id", releaseId)
      .select("shop_price", "estimated_value", "legacy_price")
      .first()
    if (!release) {
      res.status(404).json({ message: "Release not found" })
      return
    }
    const block = await pgConnection("auction_block")
      .where("id", blockId)
      .select("default_start_price_percent")
      .first()
    const pct = block?.default_start_price_percent ?? 50

    const shop = release.shop_price != null ? Number(release.shop_price) : 0
    const estimated = release.estimated_value != null ? Number(release.estimated_value) : 0
    const legacy = release.legacy_price != null ? Number(release.legacy_price) : 0
    const basePrice = shop > 0 ? shop : estimated > 0 ? estimated : legacy > 0 ? legacy : 0

    if (basePrice <= 0) {
      res.status(400).json({
        message:
          "Cannot determine start_price: Release has no shop_price, estimated_value, or legacy_price. " +
          "Either verify the item in the Inventory Process first (sets shop_price) or pass start_price explicitly.",
      })
      return
    }
    startPrice = Math.max(1, Math.round(basePrice * pct / 100))
  }

  const item = await auctionService.createBlockItems({
    auction_block: blockId,
    release_id,
    start_price: startPrice,
    estimated_value: estimated_value ?? null,
    reserve_price: reserve_price ?? null,
    buy_now_price: buy_now_price ?? null,
    lot_number: lot_number ?? null,
  })

  // Update Release auction_status to 'reserved'
  try {
    await pgConnection("Release")
      .where("id", releaseId)
      .update({ auction_status: "reserved" })
  } catch (err) {
    // Non-critical: release status update failed, item was still added
    console.warn("Could not update Release auction_status:", err)
  }

  res.status(201).json({ block_item: item })
}
