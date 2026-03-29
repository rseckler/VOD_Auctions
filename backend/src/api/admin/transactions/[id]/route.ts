import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  generateEntityId,
} from "@medusajs/framework/utils"
import { Knex } from "knex"
import { stripe } from "../../../../lib/stripe"
import { refundPayPalCapture } from "../../../../lib/paypal"
import { sendShippingEmail, sendFeedbackRequestEmail } from "../../../../lib/email-helpers"
import { crmSyncShippingUpdate } from "../../../../lib/crm-sync"
import { UpdateTransactionSchema, validateBody } from "../../../../lib/validation"

// GET /admin/transactions/:id — Transaction detail + order events timeline
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
        pgConnection.raw(
          "COALESCE(block_item.release_id, transaction.release_id) as release_id"
        ),
        "block_item.lot_number",
        "auction_block.title as block_title",
        "auction_block.slug as block_slug",
        "customer.email as customer_email",
        "customer.first_name as customer_first_name",
        "customer.last_name as customer_last_name",
        "Release.title as release_title",
        "Release.article_number",
        "Artist.name as release_artist"
      )
      .leftJoin("block_item", "block_item.id", "transaction.block_item_id")
      .leftJoin("auction_block", "auction_block.id", "block_item.auction_block_id")
      .leftJoin("customer", "customer.id", "transaction.user_id")
      .leftJoin(
        "Release",
        "Release.id",
        pgConnection.raw("COALESCE(block_item.release_id, transaction.release_id)")
      )
      .leftJoin("Artist", "Artist.id", "Release.artistId")
      .where("transaction.id", id)
      .first()

    if (!transaction) {
      res.status(404).json({ message: "Transaction not found" })
      return
    }

    // Parse decimal fields
    transaction.amount = parseFloat(transaction.amount)
    transaction.shipping_cost = parseFloat(transaction.shipping_cost)
    transaction.total_amount = parseFloat(transaction.total_amount)
    transaction.refund_amount = parseFloat(transaction.refund_amount || "0")

    const customerName = [transaction.customer_first_name, transaction.customer_last_name]
      .filter(Boolean)
      .join(" ")
    transaction.customer_name = customerName || transaction.shipping_name || null

    // Fetch order events for this transaction's order group
    const orderGroupId = transaction.order_group_id || transaction.id
    const events = await pgConnection("order_event")
      .where(function () {
        this.where("order_group_id", orderGroupId).orWhere(
          "transaction_id",
          id
        )
      })
      .orderBy("created_at", "desc")

    res.json({ transaction, events })
  } catch (error: any) {
    console.error("[admin/transactions] Error:", error)
    res.status(500).json({ message: "Failed to fetch transaction" })
  }
}

// POST /admin/transactions/:id — Update shipping status, refund, cancel, or add note
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params

  const validation = validateBody(UpdateTransactionSchema, req.body)
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

  const body = req.body as any
  const { action } = body

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  // ── NOTE ACTION ──
  if (action === "note") {
    const { text } = body
    if (!text?.trim()) {
      res.status(400).json({ message: "Note text is required" })
      return
    }

    try {
      const tx = await pgConnection("transaction").where("id", id).first()
      if (!tx) {
        res.status(404).json({ message: "Transaction not found" })
        return
      }

      const orderGroupId = tx.order_group_id || tx.id

      // Create order_event
      await pgConnection("order_event").insert({
        id: generateEntityId(),
        order_group_id: orderGroupId,
        transaction_id: id,
        event_type: "note",
        title: text.trim(),
        details: null,
        actor: "admin",
        created_at: new Date(),
      })

      // Also save as internal_note on transaction for quick access
      await pgConnection("transaction")
        .where("id", id)
        .update({ internal_note: text.trim(), updated_at: new Date() })

      res.json({ success: true })
    } catch (error: any) {
      console.error("[admin/transactions/note] Error:", error)
      res.status(500).json({ message: "Failed to save note" })
    }
    return
  }

  // ── CANCEL ACTION ──
  if (action === "cancel") {
    const { reason } = body

    try {
      const tx = await pgConnection("transaction").where("id", id).first()
      if (!tx) {
        res.status(404).json({ message: "Transaction not found" })
        return
      }

      if (
        tx.fulfillment_status !== "unfulfilled" &&
        tx.shipping_status !== "pending"
      ) {
        res
          .status(400)
          .json({ message: "Can only cancel unfulfilled orders" })
        return
      }

      const orderGroupId = tx.order_group_id || tx.id
      const transactions =
        tx.order_group_id
          ? await pgConnection("transaction").where(
              "order_group_id",
              orderGroupId
            )
          : [tx]

      // Refund if paid
      if (tx.status === "paid") {
        const paymentProvider = tx.payment_provider || "stripe"
        if (paymentProvider === "paypal") {
          const captureId = tx.paypal_capture_id
          if (captureId) {
            await refundPayPalCapture(captureId)
          }
        } else {
          const piId = tx.stripe_payment_intent_id
          if (piId && stripe) {
            await stripe.refunds.create({ payment_intent: piId })
          }
        }
      }

      // Update all transactions in group
      for (const t of transactions) {
        await pgConnection("transaction")
          .where("id", t.id)
          .update({
            status: "cancelled",
            cancelled_at: new Date(),
            cancel_reason: reason || null,
            fulfillment_status: "unfulfilled",
            updated_at: new Date(),
          })

        // Release items back to available
        const releaseId = t.release_id || null
        if (!releaseId && t.block_item_id) {
          const bi = await pgConnection("block_item")
            .where("id", t.block_item_id)
            .select("release_id")
            .first()
          if (bi?.release_id) {
            await pgConnection("Release")
              .where("id", bi.release_id)
              .update({ auction_status: "available", updatedAt: new Date() })
          }
        } else if (releaseId) {
          await pgConnection("Release")
            .where("id", releaseId)
            .update({ auction_status: "available", updatedAt: new Date() })
        }
      }

      // Create audit event
      await pgConnection("order_event").insert({
        id: generateEntityId(),
        order_group_id: orderGroupId,
        event_type: "cancellation",
        title: `Order cancelled${reason ? ": " + reason : ""}`,
        details: JSON.stringify({
          previous_status: tx.status,
          transactions_cancelled: transactions.length,
        }),
        actor: "admin",
        created_at: new Date(),
      })

      console.log(
        `[admin/cancel] Cancelled order ${orderGroupId}, ${transactions.length} transaction(s)`
      )

      res.json({ success: true, transactions_cancelled: transactions.length })
    } catch (error: any) {
      console.error("[admin/transactions/cancel] Error:", error)
      res.status(500).json({ message: error.message || "Cancellation failed" })
    }
    return
  }

  // ── REFUND ACTION ──
  if (action === "refund") {
    try {
      // Get all transactions in the same order group
      const transaction = await pgConnection("transaction")
        .where("id", id)
        .first()
      if (!transaction) {
        res.status(404).json({ message: "Transaction not found" })
        return
      }
      if (transaction.status !== "paid") {
        res
          .status(400)
          .json({ message: "Can only refund paid transactions" })
        return
      }

      const orderGroupId = transaction.order_group_id
      const transactions = orderGroupId
        ? await pgConnection("transaction")
            .where("order_group_id", orderGroupId)
            .where("status", "paid")
        : [transaction]

      const paymentProvider = transaction.payment_provider || "stripe"
      let refundId: string
      let refundStatus: string

      if (paymentProvider === "paypal") {
        // ── PayPal Refund (instant!) ──
        const captureId = transaction.paypal_capture_id
        if (!captureId) {
          res
            .status(400)
            .json({
              message: "No PayPal capture ID found for this transaction",
            })
          return
        }

        const refund = await refundPayPalCapture(captureId)
        refundId = refund.id
        refundStatus = refund.status
      } else {
        // ── Stripe Refund ──
        const paymentIntentId = transaction.stripe_payment_intent_id
        if (!paymentIntentId) {
          res
            .status(400)
            .json({
              message: "No Stripe payment intent found for this transaction",
            })
          return
        }

        if (!stripe) {
          res.status(503).json({ message: "Stripe not configured" })
          return
        }

        const refund = await stripe.refunds.create({
          payment_intent: paymentIntentId,
        })
        refundId = refund.id
        refundStatus = refund.status
      }

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

      // Create audit event for refund
      await pgConnection("order_event").insert({
        id: generateEntityId(),
        order_group_id: orderGroupId || transaction.id,
        event_type: "refund",
        title: `Refunded via ${paymentProvider} (${refundId})`,
        details: JSON.stringify({
          refund_id: refundId,
          refund_status: refundStatus,
          payment_provider: paymentProvider,
          transactions_refunded: transactions.length,
        }),
        actor: "admin",
        created_at: new Date(),
      })

      console.log(
        `[admin/refund] Refunded order ${orderGroupId} via ${paymentProvider}, refund: ${refundId}, status: ${refundStatus}`
      )

      res.json({
        success: true,
        refund_id: refundId,
        refund_status: refundStatus,
        payment_provider: paymentProvider,
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

  if (
    !shipping_status ||
    !["shipped", "delivered"].includes(shipping_status)
  ) {
    res
      .status(400)
      .json({ message: "shipping_status must be 'shipped' or 'delivered'" })
    return
  }

  try {
    const transaction = await pgConnection("transaction")
      .where("id", id)
      .first()

    if (!transaction) {
      res.status(404).json({ message: "Transaction not found" })
      return
    }

    if (transaction.status !== "paid") {
      res
        .status(400)
        .json({ message: "Can only update shipping for paid transactions" })
      return
    }

    const previousShippingStatus = transaction.shipping_status

    const updateData: Record<string, any> = {
      shipping_status,
      updated_at: new Date(),
    }

    if (shipping_status === "shipped") {
      updateData.shipped_at = new Date()
      updateData.fulfillment_status = "shipped"
      if (tracking_number) updateData.tracking_number = tracking_number
      if (carrier) updateData.carrier = carrier
    }
    if (shipping_status === "delivered") {
      updateData.delivered_at = new Date()
      updateData.fulfillment_status = "delivered"
    }

    await pgConnection("transaction").where("id", id).update(updateData)

    // Create audit event for shipment
    const orderGroupId = transaction.order_group_id || transaction.id
    await pgConnection("order_event").insert({
      id: generateEntityId(),
      order_group_id: orderGroupId,
      transaction_id: id,
      event_type: "shipment",
      title:
        shipping_status === "shipped"
          ? `Shipped via ${carrier || "carrier"}${tracking_number ? ", tracking: " + tracking_number : ""}`
          : "Marked as delivered",
      details: JSON.stringify({
        shipping_status,
        tracking_number: tracking_number || null,
        carrier: carrier || null,
      }),
      actor: "admin",
      created_at: new Date(),
    })

    // Send shipping email when status changes to "shipped" (async, non-blocking)
    if (shipping_status === "shipped" && previousShippingStatus !== "shipped") {
      sendShippingEmail(pgConnection, id).catch((err) => {
        console.error(
          "[admin/transactions] Failed to send shipping email:",
          err
        )
      })
      crmSyncShippingUpdate(pgConnection, id, "shipped").catch(() => {})
    }

    // Send feedback request email when status changes to "delivered" (async, non-blocking)
    if (
      shipping_status === "delivered" &&
      previousShippingStatus !== "delivered"
    ) {
      sendFeedbackRequestEmail(pgConnection, id).catch((err) => {
        console.error(
          "[admin/transactions] Failed to send feedback email:",
          err
        )
      })
      crmSyncShippingUpdate(pgConnection, id, "delivered").catch(() => {})
    }

    res.json({ success: true, shipping_status })
  } catch (error: any) {
    console.error("[admin/transactions] Error:", error)
    res.status(500).json({ message: "Failed to update transaction" })
  }
}
