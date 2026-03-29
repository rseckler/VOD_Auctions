import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { getPayPalOrder } from "../../../../lib/paypal"
import { sendPaymentConfirmationEmail } from "../../../../lib/email-helpers"
import { crmSyncPaymentCompleted } from "../../../../lib/crm-sync"

// POST /store/account/capture-paypal-order — Process PayPal payment after JS SDK capture
export async function POST(
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

  const { paypal_order_id, paypal_capture_id, order_group_id } = req.body as any

  if (!order_group_id) {
    res.status(400).json({ message: "order_group_id is required" })
    return
  }

  if (!paypal_order_id) {
    res.status(400).json({ message: "paypal_order_id is required" })
    return
  }

  try {
    // Verify that this order belongs to the authenticated user
    const transaction = await pgConnection("transaction")
      .where("order_group_id", order_group_id)
      .where("user_id", customerId)
      .first()

    if (!transaction) {
      res.status(403).json({ message: "Order not found or does not belong to you" })
      return
    }

    // Check if already captured (idempotency)
    if (transaction.status === "paid") {
      console.log(`[capture-paypal-order] Order ${order_group_id} already paid — skipping`)
      res.json({ success: true, already_captured: true, order_group_id })
      return
    }

    // ── Server-side amount verification via PayPal API ──
    // Fetch the order directly from PayPal — never trust client-supplied amounts.
    const allTxs = await pgConnection("transaction")
      .where("order_group_id", order_group_id)
      .where("status", "pending")
    const expectedTotal = allTxs.reduce((sum: number, tx: any) => sum + Number(tx.total_amount), 0)
    const expectedRounded = Math.round(expectedTotal * 100) / 100

    let paypalOrder: Awaited<ReturnType<typeof getPayPalOrder>>
    try {
      paypalOrder = await getPayPalOrder(paypal_order_id)
    } catch (err: any) {
      console.error(`[capture-paypal-order] Failed to verify order with PayPal:`, err.message)
      res.status(502).json({ message: "Could not verify payment with PayPal. Please contact support." })
      return
    }

    if (paypalOrder.status !== "COMPLETED") {
      console.error(`[capture-paypal-order] PayPal order ${paypal_order_id} status is ${paypalOrder.status}, expected COMPLETED`)
      res.status(400).json({ message: "PayPal payment has not been completed." })
      return
    }

    const capture = paypalOrder.purchase_units?.[0]?.payments?.captures?.[0]
    if (!capture) {
      console.error(`[capture-paypal-order] No capture found in PayPal order ${paypal_order_id}`)
      res.status(400).json({ message: "No capture record found for this PayPal payment." })
      return
    }

    const actualCapturedAmount = parseFloat(capture.amount.value)
    if (Math.abs(actualCapturedAmount - expectedRounded) > 0.02) {
      console.error(`[capture-paypal-order] Amount mismatch! Expected €${expectedRounded}, PayPal captured €${actualCapturedAmount}`)
      await pgConnection("transaction")
        .where("order_group_id", order_group_id)
        .where("status", "pending")
        .update({ status: "failed", updated_at: new Date() })
      res.status(400).json({ message: "Payment amount does not match order total. Transaction cancelled." })
      return
    }

    const verifiedCaptureId = capture.id || paypal_capture_id || null

    // Update all transactions in the order group
    await pgConnection("transaction")
      .where("order_group_id", order_group_id)
      .where("status", "pending")
      .update({
        status: "paid",
        paypal_order_id: paypal_order_id,
        paypal_capture_id: verifiedCaptureId,
        paid_at: new Date(),
        updated_at: new Date(),
      })

    // Handle direct purchase items: update Release status + clean cart
    const directPurchaseTxs = await pgConnection("transaction")
      .where("order_group_id", order_group_id)
      .where("item_type", "direct_purchase")
      .select("release_id", "user_id")

    for (const tx of directPurchaseTxs) {
      await pgConnection("Release")
        .where("id", tx.release_id)
        .update({ auction_status: "sold_direct", updatedAt: new Date() })

      await pgConnection("cart_item")
        .where({ user_id: tx.user_id, release_id: tx.release_id })
        .whereNull("deleted_at")
        .update({ deleted_at: new Date(), updated_at: new Date() })
    }

    // Increment promo code used_count if applicable
    const promoTx = await pgConnection("transaction")
      .where("order_group_id", order_group_id)
      .whereNotNull("promo_code_id")
      .first()
    if (promoTx?.promo_code_id) {
      await pgConnection("promo_code")
        .where("id", promoTx.promo_code_id)
        .update({
          used_count: pgConnection.raw("used_count + 1"),
          updated_at: new Date(),
        })
      console.log(`[capture-paypal-order] Promo code ${promoTx.promo_code_id} used_count incremented`)
    }

    // Generate order number
    const existingOrderNumber = await pgConnection("transaction")
      .where("order_group_id", order_group_id)
      .whereNotNull("order_number")
      .first()
    let orderNumber: string
    if (existingOrderNumber?.order_number) {
      orderNumber = existingOrderNumber.order_number
    } else {
      const seqResult = await pgConnection.raw("SELECT nextval('order_number_seq')")
      const seqVal = seqResult.rows[0].nextval
      orderNumber = "VOD-ORD-" + String(seqVal).padStart(6, "0")
      await pgConnection("transaction")
        .where("order_group_id", order_group_id)
        .update({ order_number: orderNumber })
    }

    // Create audit trail event
    await pgConnection("order_event").insert({
      id: generateEntityId(),
      order_group_id,
      event_type: "status_change",
      title: "Payment received via PayPal",
      details: JSON.stringify({
        paypal_order_id,
        paypal_capture_id: verifiedCaptureId,
        order_number: orderNumber,
      }),
      actor: "system",
      created_at: new Date(),
    })

    console.log(`[capture-paypal-order] Order ${order_group_id} marked as paid — ${orderNumber} — PayPal capture ${verifiedCaptureId} (${directPurchaseTxs.length} direct purchases)`)

    // Send payment confirmation email (async, non-blocking)
    sendPaymentConfirmationEmail(pgConnection, order_group_id).catch((err) => {
      console.error("[capture-paypal-order] Failed to send payment email:", err)
    })

    // Sync payment to Brevo CRM
    crmSyncPaymentCompleted(pgConnection, order_group_id).catch(() => {})

    res.json({
      success: true,
      capture_id: paypal_capture_id,
      order_group_id,
    })
  } catch (error: any) {
    console.error("[capture-paypal-order] Error:", error)
    res.status(500).json({ message: error.message || "Failed to process PayPal payment" })
  }
}
