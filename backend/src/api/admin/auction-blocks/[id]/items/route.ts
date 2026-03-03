import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import AuctionModuleService from "../../../../../modules/auction/service"
import { AUCTION_MODULE } from "../../../../../modules/auction"

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
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const blockId = req.params.id
  const releaseId = req.body.release_id

  // Duplicate detection: check if release already in this block
  const existing = await auctionService.listBlockItems({
    auction_block_id: blockId,
    release_id: releaseId,
  })
  if (existing.length > 0) {
    res.status(409).json({ message: "Release is already in this block" })
    return
  }

  const { release_id, start_price, estimated_value, reserve_price, buy_now_price, lot_number } = req.body
  const item = await auctionService.createBlockItems({
    auction_block: blockId,
    release_id,
    start_price,
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
