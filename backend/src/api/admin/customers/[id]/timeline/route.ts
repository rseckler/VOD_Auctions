import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

interface TimelineEvent {
  type: string
  title: string
  description: string
  timestamp: string
}

// GET /admin/customers/:id/timeline — Unified activity timeline
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const events: TimelineEvent[] = []

    // 1. Account created
    const customer = await pgConnection("customer")
      .where("id", id)
      .select("email", "created_at")
      .first()

    if (!customer) {
      res.status(404).json({ message: "Customer not found" })
      return
    }

    events.push({
      type: "account_created",
      title: "Account created",
      description: customer.email,
      timestamp: customer.created_at,
    })

    // 2. Bids (non-winning) + 3. Won bids
    const bids = await pgConnection("bid as b")
      .leftJoin("block_item as bi", "bi.id", "b.block_item_id")
      .leftJoin(
        pgConnection.raw('"Release" as r on r.id = bi.release_id')
      )
      .where("b.user_id", id)
      .orderBy("b.created_at", "desc")
      .limit(100)
      .select(
        "b.amount",
        "b.is_winning",
        "b.created_at",
        "bi.lot_number",
        pgConnection.raw('"r"."title" as release_title')
      )

    for (const bid of bids) {
      const itemLabel =
        bid.release_title || (bid.lot_number ? `Lot #${bid.lot_number}` : "Unknown item")
      const amount = Number(bid.amount).toFixed(2)

      if (bid.is_winning) {
        events.push({
          type: "auction_won",
          title: "Auction won",
          description: itemLabel,
          timestamp: bid.created_at,
        })
      } else {
        events.push({
          type: "bid_placed",
          title: "Bid placed",
          description: `\u20AC${amount} on ${itemLabel}`,
          timestamp: bid.created_at,
        })
      }
    }

    // 4. Transactions paid
    const paidTx = await pgConnection("transaction")
      .where("user_id", id)
      .where("status", "paid")
      .whereNull("deleted_at")
      .orderBy("updated_at", "desc")
      .limit(100)
      .select("order_number", "amount", "updated_at")

    for (const tx of paidTx) {
      events.push({
        type: "payment_completed",
        title: "Payment completed",
        description: `${tx.order_number || "Order"} \u00B7 \u20AC${Number(tx.amount).toFixed(2)}`,
        timestamp: tx.updated_at,
      })
    }

    // 5. Transactions shipped/delivered
    const shippedTx = await pgConnection("transaction")
      .where("user_id", id)
      .whereIn("fulfillment_status", ["shipped", "delivered"])
      .whereNull("deleted_at")
      .orderBy("updated_at", "desc")
      .limit(100)
      .select("order_number", "fulfillment_status", "updated_at")

    for (const tx of shippedTx) {
      events.push({
        type: "order_shipped",
        title: "Order shipped",
        description: tx.order_number || "Order",
        timestamp: tx.updated_at,
      })
    }

    // 6. Notes
    try {
      const notes = await pgConnection("customer_note")
        .where("customer_id", id)
        .whereNull("deleted_at")
        .orderBy("created_at", "desc")
        .limit(100)
        .select("body", "created_at")

      for (const note of notes) {
        events.push({
          type: "note_added",
          title: "Internal note",
          description: (note.body || "").substring(0, 100),
          timestamp: note.created_at,
        })
      }
    } catch {
      // customer_note table may not exist yet
    }

    // Sort all events by timestamp DESC, limit 100
    events.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    res.json({ events: events.slice(0, 100) })
  } catch (err: any) {
    console.error(`[admin/customers/${id}/timeline] Error:`, err.message)
    res.status(500).json({ message: "Failed to fetch timeline" })
  }
}
