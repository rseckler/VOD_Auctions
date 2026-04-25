import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { rudderTrack } from "../../../../lib/rudderstack"
import { enrichWithShopPrice } from "../../../../lib/shop-price"

// GET /store/account/saved — List saved items
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const rawItems = await pgConnection("saved_item")
    .select(
      "saved_item.id",
      "saved_item.release_id",
      "saved_item.created_at",
      "Release.title",
      "Release.coverImage",
      "Release.format",
      "Release.format_v2",
      "Release.sale_mode",
      "Release.shop_price",
      "Release.legacy_available",
      "Release.auction_status",
      "Artist.name as artist_name",
      // Active auction lot — if this release is currently in an active block
      "block_item.id as block_item_id",
      "auction_block.slug as block_slug"
    )
    .join("Release", "Release.id", "saved_item.release_id")
    .leftJoin("Artist", "Artist.id", "Release.artistId")
    .leftJoin("block_item", function () {
      this.on("block_item.release_id", "=", "saved_item.release_id")
        .andOnIn("block_item.status", ["open", "active"])
    })
    .leftJoin("auction_block", function () {
      this.on("auction_block.id", "=", "block_item.auction_block_id")
        .andOnIn("auction_block.status", ["active", "preview", "scheduled"])
    })
    .where("saved_item.user_id", customerId)
    .whereNull("saved_item.deleted_at")
    .orderBy("saved_item.created_at", "desc")

  // rc49.6: enrich with effective_price / is_purchasable / is_verified per
  // PRICING_MODEL.md. Helper keys by Release.id, so we feed it release_id.
  const priceShape = rawItems.map((r) => ({
    id: r.release_id as string,
    shop_price: r.shop_price,
    legacy_available: r.legacy_available,
  }))
  const enriched = await enrichWithShopPrice(pgConnection, priceShape)
  const byReleaseId = new Map(enriched.map((e) => [e.id, e]))

  const items = rawItems.map((r) => {
    const e = byReleaseId.get(r.release_id)
    return {
      ...r,
      shop_price: e?.shop_price ?? null,
      effective_price: e?.effective_price ?? null,
      is_purchasable: e?.is_purchasable ?? false,
      is_verified: e?.is_verified ?? false,
    }
  })

  res.json({ items, count: items.length })
}

// POST /store/account/saved — Save item for later
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const { release_id } = req.body as { release_id: string }
  if (!release_id) {
    res.status(400).json({ message: "release_id is required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  // Verify release exists
  const release = await pgConnection("Release")
    .where("id", release_id)
    .first()

  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  // Check if already saved
  const existing = await pgConnection("saved_item")
    .where({ user_id: customerId, release_id })
    .whereNull("deleted_at")
    .first()

  if (existing) {
    res.status(409).json({ message: "Item is already saved" })
    return
  }

  const [item] = await pgConnection("saved_item")
    .insert({
      id: generateEntityId(),
      user_id: customerId,
      release_id,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning("*")

  rudderTrack(customerId, "Item Saved", { release_id })

  res.status(201).json({ item })
}
