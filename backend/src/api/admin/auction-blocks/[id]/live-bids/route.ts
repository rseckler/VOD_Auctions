import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/auction-blocks/:id/live-bids
// Returns all items with their current winning bid and top bidders
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  // Fetch block directly via Knex (avoids ORM relation issues)
  const block = await pgConnection("auction_block").where("id", id).first()
  if (!block) {
    res.status(404).json({ message: "Block not found" })
    return
  }

  // Fetch all items for this block
  const items = await pgConnection("block_item")
    .where("auction_block_id", id)
    .orderBy("lot_number", "asc")

  // Batch-load all bids, releases, and customers in 3 queries (no N+1)
  const itemIds = items.map((i: any) => i.id)
  const releaseIds = items.map((i: any) => i.release_id).filter(Boolean)

  // ONE query for all bids across all items
  const allBids = releaseIds.length > 0
    ? await pgConnection("bid")
        .whereIn("block_item_id", itemIds)
        .orderBy("amount", "desc")
        .select("id", "amount", "max_amount", "is_winning", "user_id", "block_item_id", "created_at")
    : []

  // ONE query for all releases
  const allReleases = releaseIds.length > 0
    ? await pgConnection("Release")
        .whereIn("id", releaseIds)
        .select("id", "title", "coverImage")
    : []

  // ONE query for all customers (based on unique user IDs across all bids)
  const allUserIds = [...new Set((allBids as any[]).map((b: any) => b.user_id).filter(Boolean))]
  const allCustomers = allUserIds.length > 0
    ? await pgConnection("customer")
        .whereIn("id", allUserIds)
        .select("id", "email", "first_name", "last_name")
    : []

  // Build O(1) lookup maps
  const bidsByItem: Record<string, any[]> = {}
  for (const bid of allBids as any[]) {
    if (!bidsByItem[bid.block_item_id]) bidsByItem[bid.block_item_id] = []
    bidsByItem[bid.block_item_id].push(bid)
  }
  const releaseMap: Record<string, any> = Object.fromEntries(
    (allReleases as any[]).map((r: any) => [r.id, r])
  )
  const customerMap: Record<string, string> = Object.fromEntries(
    (allCustomers as any[]).map((c: any) => [
      c.id,
      [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email,
    ])
  )

  // Enrich items without any additional DB calls
  const enriched = items.map((item: any) => {
    const bids = (bidsByItem[item.id] || []).slice(0, 5)
    const release = releaseMap[item.release_id]
    const winningBid = bids.find((b: any) => b.is_winning)

    return {
      id: item.id,
      lot_number: item.lot_number,
      status: item.status,
      lot_end_time: item.lot_end_time,
      start_price: item.start_price,
      current_price: item.current_price,
      bid_count: item.bid_count || bids.length,
      release_title: release?.title || item.release_id,
      release_cover: release?.coverImage || null,
      winning_bid: winningBid
        ? {
            amount: winningBid.amount,
            user_hint: customerMap[winningBid.user_id] || "Bidder",
            placed_at: winningBid.created_at,
          }
        : null,
      recent_bids: bids.slice(0, 3).map((b: any) => ({
        amount: b.amount,
        user_hint: customerMap[b.user_id] || "Bidder",
        is_winning: b.is_winning,
        placed_at: b.created_at,
      })),
    }
  })

  res.json({
    block_id: id,
    block_status: block.status,
    end_time: block.end_time,
    items: enriched,
    total_bids: enriched.reduce((sum, i) => sum + (i.bid_count || 0), 0),
    active_items: enriched.filter((i) => i.status === "active").length,
    fetched_at: new Date().toISOString(),
  })
}
