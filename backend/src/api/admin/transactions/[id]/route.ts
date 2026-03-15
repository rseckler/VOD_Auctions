import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { stripe } from "../../../../lib/stripe"
import { sendShippingEmail, sendFeedbackRequestEmail } from "../../../../lib/email-helpers"
import { crmSyncShippingUpdate } from "../../../../lib/crm-sync"

// GET /admin/transactions/:id — Transaction detail
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const transaction = await pgConnection("transaction")
      .select(
        "transaction.*",
        pgConnection.raw("COALESCE(block_item.release_id, transaction.release_id) as release_id"),
        "block_item.lot_number",
        "auction_block.title as block_title",
        "auction_block.slug as block_slug"
      )
      .leftJoin("block_item", "block_item.id", "transaction.block_item_id")
      .leftJoin("auction_block", "auction_block.id", "block_item.auction_block_id")
      .where("transaction.id", id)
      .first()

    if (!transaction) {
      res.status(404).json({ message: "Transaction not found" })
      return
    }

    res.json({ transaction })
  } catch (error: any) {
    console.error("[admin/transactions] Error:", error)
    res.status(500).json({ message: "Failed to fetch transaction" })
  }
}

// POST /admin/transactions/:id — Update shipping status or refund
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params
  const body = req.body as any
  const { action } = body

  // ── REFUND ACTION ──
  if (action === "refund") {
    const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

    try {
      // Get all transactions in the same order group
      const transaction = await pgConnection("transaction").where("id", id).first()
      if (!transaction) {
        res.status(404).json({ message: "Transaction not found" })
        return
      }
      if (transaction.status !== "paid") {
        res.status(400).json({ message: "Can only refund paid transactions" })
        return
      }

      const orderGroupId = transaction.order_group_id
      const transactions = orderGroupId
        ? await pgConnection("transaction").where("order_group_id", orderGroupId).where("status", "paid")
        : [transaction]

      // Find payment intent ID
      const paymentIntentId = transaction.stripe_payment_intent_id
      if (!paymentIntentId) {
        res.status(400).json({ message: "No Stripe payment intent found for this transaction" })
        return
      }

      if (!stripe) {
        res.status(503).json({ message: "Stripe not configured" })
        return
      }

      // Issue refund via Stripe
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
      })

      // Update all transactions in the order group
      for (const tx of transactions) {
        await pgConnection("transaction")
          .where("id", tx.id)
          .update({ status: "refunded", updated_at: new Date() })

        // Set releases back to available
        if (tx.release_id) {
          await pgConnection("Release")
            .where("id", tx.release_id)
            .update({ auction_status: "available", updatedAt: new Date() })
        }
      }

      console.log(`[admin/refund] Refunded order ${orderGroupId}, Stripe refund: ${refund.id}, status: ${refund.status}`)

      res.json({
        success: true,
        refund_id: refund.id,
        refund_status: refund.status,
        transactions_refunded: transactions.length,
      })
    } catch (error: any) {
      console.error("[admin/refund] Error:", error)
      res.status(500).json({ message: error.message || "Refund failed" })
    }
    return
  }

  // ── SHIPPING STATUS UPDATE ──
  const { shipping_status, tracking_number, carrier } = body as {
    shipping_status: "shipped" | "delivered"
    tracking_number?: string
    carrier?: string
  }

  if (!shipping_status || !["shipped", "delivered"].includes(shipping_status)) {
    res.status(400).json({ message: "shipping_status must be 'shipped' or 'delivered'" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const transaction = await pgConnection("transaction")
      .where("id", id)
      .first()

    if (!transaction) {
      res.status(404).json({ message: "Transaction not found" })
      return
    }

    if (transaction.status !== "paid") {
      res.status(400).json({ message: "Can only update shipping for paid transactions" })
      return
    }

    const previousShippingStatus = transaction.shipping_status

    const updateData: Record<string, any> = {
      shipping_status,
      updated_at: new Date(),
    }

    if (shipping_status === "shipped") {
      updateData.shipped_at = new Date()
      if (tracking_number) updateData.tracking_number = tracking_number
      if (carrier) updateData.carrier = carrier
    }
    if (shipping_status === "delivered") updateData.delivered_at = new Date()

    await pgConnection("transaction").where("id", id).update(updateData)

    // Send shipping email when status changes to "shipped" (async, non-blocking)
    if (shipping_status === "shipped" && previousShippingStatus !== "shipped") {
      sendShippingEmail(pgConnection, id).catch((err) => {
        console.error("[admin/transactions] Failed to send shipping email:", err)
      })
      crmSyncShippingUpdate(pgConnection, id, "shipped").catch(() => {})
    }

    // Send feedback request email when status changes to "delivered" (async, non-blocking)
    if (shipping_status === "delivered" && previousShippingStatus !== "delivered") {
      sendFeedbackRequestEmail(pgConnection, id).catch((err) => {
        console.error("[admin/transactions] Failed to send feedback email:", err)
      })
      crmSyncShippingUpdate(pgConnection, id, "delivered").catch(() => {})
    }

    res.json({ success: true, shipping_status })
  } catch (error: any) {
    console.error("[admin/transactions] Error:", error)
    res.status(500).json({ message: "Failed to update transaction" })
  }
}
