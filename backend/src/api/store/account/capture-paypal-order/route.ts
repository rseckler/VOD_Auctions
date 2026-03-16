import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { capturePayPalOrder, paypalConfigured } from "../../../../lib/paypal"
import { sendPaymentConfirmationEmail } from "../../../../lib/email-helpers"
import { crmSyncPaymentCompleted } from "../../../../lib/crm-sync"

// POST /store/account/capture-paypal-order — Capture after PayPal popup approval
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  if (!paypalConfigured) {
    res.status(503).json({ message: "PayPal is not configured" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { paypal_order_id } = req.body as any

  if (!paypal_order_id) {
    res.status(400).json({ message: "paypal_order_id is required" })
    return
  }

  try {
    // Look up transaction by PayPal order ID and verify ownership
    const transaction = await pgConnection("transaction")
      .where("paypal_order_id", paypal_order_id)
      .where("user_id", customerId)
      .first()

    const order_group_id = transaction?.order_group_id

    if (!transaction) {
      res.status(403).json({ message: "Order not found or does not belong to you" })
      return
    }

    // Check if already captured (idempotency)
    if (transaction.status === "paid") {
      console.log(`[capture-paypal-order] Order ${order_group_id} already paid — skipping`)
      res.json({ success: true, already_captured: true })
      return
    }

    // Capture the PayPal order
    const captureResult = await capturePayPalOrder(paypal_order_id)

    if (captureResult.status !== "COMPLETED") {
      console.error(`[capture-paypal-order] Unexpected status: ${captureResult.status}`)
      res.status(400).json({ message: `PayPal capture failed: ${captureResult.status}` })
      return
    }

    // Extract capture ID from the response
    const captureId = captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.id
    if (!captureId) {
      console.error("[capture-paypal-order] No capture ID in response:", JSON.stringify(captureResult))
    }

    // Update all transactions in the order group
    await pgConnection("transaction")
      .where("order_group_id", order_group_id)
      .where("status", "pending")
      .update({
        status: "paid",
        paypal_capture_id: captureId || null,
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

    console.log(`[capture-paypal-order] Order ${order_group_id} captured — PayPal capture ${captureId} (${directPurchaseTxs.length} direct purchases)`)

    // Send payment confirmation email (async, non-blocking)
    sendPaymentConfirmationEmail(pgConnection, order_group_id).catch((err) => {
      console.error("[capture-paypal-order] Failed to send payment email:", err)
    })

    // Sync payment to Brevo CRM
    crmSyncPaymentCompleted(pgConnection, order_group_id).catch(() => {})

    res.json({
      success: true,
      capture_id: captureId,
      order_group_id,
    })
  } catch (error: any) {
    console.error("[capture-paypal-order] Error:", error)
    res.status(500).json({ message: error.message || "Failed to capture PayPal order" })
  }
}
