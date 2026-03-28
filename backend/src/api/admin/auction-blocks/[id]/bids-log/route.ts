import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/auction-blocks/:id/bids-log
// Returns all bids for a block as a chronological log
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params
  const limit = Math.min(parseInt(String(req.query.limit || "300")), 500)
  const offset = parseInt(String(req.query.offset || "0"))

  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const block = await pgConnection("auction_block").where("id", id).first()
  if (!block) {
    res.status(404).json({ message: "Block not found" })
    return
  }

  // All bids with item info (newest first)
  const bids = await pgConnection("bid")
    .join("block_item", "bid.block_item_id", "block_item.id")
    .where("block_item.auction_block_id", id)
    .orderBy("bid.created_at", "desc")
    .limit(limit)
    .offset(offset)
    .select(
      "bid.id",
      "bid.amount",
      "bid.max_amount",
      "bid.is_winning",
      "bid.is_outbid",
      "bid.user_id",
      "bid.created_at",
      "block_item.lot_number",
      "block_item.id as item_id",
      "block_item.release_id"
    )

  // Total count
  const [{ count }] = await pgConnection("bid")
    .join("block_item", "bid.block_item_id", "block_item.id")
    .where("block_item.auction_block_id", id)
    .count("bid.id as count")

  // Batch-fetch releases (coverImage + title)
  const releaseIds = [...new Set(bids.map((b: any) => b.release_id).filter(Boolean))]
  const releaseMap: Record<string, any> = {}
  if (releaseIds.length > 0) {
    const releases = await pgConnection("Release")
      .whereIn("id", releaseIds as string[])
      .select("id", "title", "coverImage")
    releases.forEach((r: any) => { releaseMap[r.id] = r })
  }

  // Batch-fetch user hints
  const uniqueUserIds = [...new Set(bids.map((b: any) => b.user_id).filter(Boolean))]
  const userHints: Record<string, string> = {}
  if (uniqueUserIds.length > 0) {
    const customers = await pgConnection("customer")
      .whereIn("id", uniqueUserIds as string[])
      .select("id", "email", "first_name")
    customers.forEach((c: any) => {
      userHints[c.id] = c.first_name
        ? `${c.first_name.charAt(0).toUpperCase()}***`
        : c.email.split("@")[0].substring(0, 3) + "***"
    })
  }

  const enriched = bids.map((b: any) => {
    const release = releaseMap[b.release_id] || null
    return {
      id: b.id,
      amount: b.amount,
      max_amount: b.max_amount,
      is_winning: b.is_winning,
      is_outbid: b.is_outbid,
      user_hint: userHints[b.user_id] || "Bidder",
      placed_at: b.created_at,
      lot_number: b.lot_number,
      item_id: b.item_id,
      release_title: release?.title || null,
      release_cover: release?.coverImage || null,
    }
  })

  res.json({
    bids: enriched,
    total: parseInt(String(count)),
    showing: enriched.length,
    block_id: id,
    block_status: block.status,
  })
}
