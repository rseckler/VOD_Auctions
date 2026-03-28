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

  // For each item, get the top bids + release info
  const enriched = await Promise.all(items.map(async (item: any) => {
    const bids = await pgConnection("bid")
      .where({ block_item_id: item.id })
      .orderBy("amount", "desc")
      .limit(5)
      .select("id", "amount", "max_amount", "is_winning", "user_id", "created_at")

    const release = await pgConnection("Release")
      .where({ id: item.release_id })
      .select("title", "coverImage")
      .first()

    // Get user hints for each unique bidder
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
            user_hint: userHints[winningBid.user_id] || "Bidder",
            placed_at: winningBid.created_at,
          }
        : null,
      recent_bids: bids.slice(0, 3).map((b: any) => ({
        amount: b.amount,
        user_hint: userHints[b.user_id] || "Bidder",
        is_winning: b.is_winning,
        placed_at: b.created_at,
      })),
    }
  }))

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
