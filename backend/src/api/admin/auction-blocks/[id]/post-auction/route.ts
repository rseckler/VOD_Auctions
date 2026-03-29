import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/auction-blocks/:id/post-auction
// Returns all lots with winner info and transaction status for post-auction workflow
//
// Required DB column (run once if not exists):
// ALTER TABLE transaction ADD COLUMN IF NOT EXISTS label_printed_at TIMESTAMP;
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    // Fetch block info
    const block = await pgConnection("auction_block")
      .where("auction_block.id", id)
      .select("id", "title", "slug", "status")
      .first()

    if (!block) {
      res.status(404).json({ message: "Auction block not found" })
      return
    }

    // Fetch all block_items with Release + Artist data
    const items = await pgConnection("block_item")
      .select(
        "block_item.id",
        "block_item.lot_number",
        "block_item.release_id",
        "block_item.current_price",
        "block_item.bid_count",
        "Release.title as release_title",
        "Artist.name as artist_name"
      )
      .leftJoin("Release", "Release.id", "block_item.release_id")
      .leftJoin("Artist", "Artist.id", "Release.artistId")
      .where("block_item.auction_block_id", id)
      .orderBy("block_item.lot_number", "asc")

    if (items.length === 0) {
      res.json({
        block,
        lots: [],
        summary: { total: 0, paid: 0, unpaid: 0, no_bid: 0, shipped: 0 },
      })
      return
    }

    // Collect all block_item IDs to batch-fetch winning bids and transactions
    const itemIds = items.map((i: any) => i.id)

    // Fetch all winning bids for these items in one query
    const winningBids = await pgConnection("bid")
      .select("bid.id", "bid.block_item_id", "bid.user_id", "bid.amount")
      .where("bid.is_winning", true)
      .whereIn("bid.block_item_id", itemIds)

    const bidByItemId = new Map(winningBids.map((b: any) => [b.block_item_id, b]))

    // Fetch all customers for winning bidders in one query
    const winnerUserIds = [...new Set(winningBids.map((b: any) => b.user_id).filter(Boolean))]
    const customerMap = new Map<string, any>()
    if (winnerUserIds.length > 0) {
      const customers = await pgConnection("customer")
        .select("id", "email", "first_name", "last_name")
        .whereIn("id", winnerUserIds)
      for (const c of customers) {
        customerMap.set(c.id, c)
      }
    }

    // Fetch all transactions for these block_items in one query
    const transactions = await pgConnection("transaction")
      .select(
        "id",
        "block_item_id",
        "status",
        "fulfillment_status",
        "order_number",
        "label_printed_at",
        "shipping_name",
        "shipping_city",
        "shipping_country",
        "created_at"
      )
      .whereIn("block_item_id", itemIds)

    const txByItemId = new Map(transactions.map((t: any) => [t.block_item_id, t]))

    // Build lots array
    const lots = items.map((item: any) => {
      const bid = bidByItemId.get(item.id) || null
      const customer = bid ? customerMap.get(bid.user_id) : null
      const tx = txByItemId.get(item.id) || null

      const winner = customer
        ? {
            id: customer.id,
            name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null,
            email: customer.email,
          }
        : null

      const transaction = tx
        ? {
            id: tx.id,
            status: tx.status,
            fulfillment_status: tx.fulfillment_status,
            order_number: tx.order_number,
            label_printed_at: tx.label_printed_at || null,
            shipping_name: tx.shipping_name || null,
            shipping_city: tx.shipping_city || null,
            shipping_country: tx.shipping_country || null,
            created_at: tx.created_at,
          }
        : null

      return {
        id: item.id,
        lot_number: item.lot_number,
        release_id: item.release_id,
        release_title: item.release_title || null,
        artist_name: item.artist_name || null,
        final_price: item.bid_count > 0 ? parseFloat(item.current_price) : null,
        bid_count: item.bid_count || 0,
        winner,
        transaction,
      }
    })

    // Compute summary
    const summary = {
      total: lots.length,
      paid: lots.filter((l: any) => l.transaction?.status === "paid").length,
      unpaid: lots.filter(
        (l: any) => l.transaction && l.transaction.status === "pending"
      ).length,
      refunded: lots.filter(
        (l: any) => l.transaction && (l.transaction.status === "refunded" || l.transaction.status === "cancelled" || l.transaction.status === "failed")
      ).length,
      no_bid: lots.filter((l: any) => !l.winner).length,
      shipped: lots.filter(
        (l: any) => l.transaction?.fulfillment_status === "shipped" ||
                    l.transaction?.fulfillment_status === "delivered"
      ).length,
    }

    res.json({ block, lots, summary })
  } catch (error: any) {
    console.error("[admin/auction-blocks/post-auction] Error:", error)
    res.status(500).json({ message: "Failed to fetch post-auction data" })
  }
}
