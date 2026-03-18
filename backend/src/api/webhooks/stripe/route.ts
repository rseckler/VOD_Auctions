import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { stripe } from "../../../lib/stripe"
import { sendPaymentConfirmationEmail } from "../../../lib/email-helpers"
import { crmSyncPaymentCompleted } from "../../../lib/crm-sync"

// Get raw body: from rawBody middleware, Buffer body, or string body
function getRawBody(req: any): Buffer | null {
  // rawBody set by our middleware in middlewares.ts
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody
  // If req.body is a Buffer (some frameworks)
  if (Buffer.isBuffer(req.body)) return req.body
  // If req.body is a string
  if (typeof req.body === "string" && req.body.length > 0) return Buffer.from(req.body)
  // If req.body is a parsed object, stringify it back (last resort — may break signature)
  if (req.body && typeof req.body === "object") return Buffer.from(JSON.stringify(req.body))
  return null
}

// POST /webhooks/stripe — Stripe Webhook Handler
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const sig = req.headers["stripe-signature"] as string
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret || !stripe) {
    res.status(400).json({ message: "Missing signature or webhook configuration" })
    return
  }

  let event
  try {
    const rawBody = getRawBody(req)
    if (!rawBody || rawBody.length === 0) {
      console.error("[stripe-webhook] Empty raw body. req.body type:", typeof req.body, "rawBody:", typeof (req as any).rawBody)
      res.status(400).json({ message: "No webhook payload was provided" })
      return
    }
    console.log("[stripe-webhook] Raw body received, length:", rawBody.length)
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      webhookSecret
    )
  } catch (err: any) {
    console.error("[stripe-webhook] Signature verification failed:", err.message)
    res.status(400).json({ message: "Webhook signature verification failed" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object
        const orderGroupId = session.metadata?.order_group_id
        const transactionId = session.metadata?.transaction_id // legacy single-item

        const updateData: Record<string, any> = {
          status: "paid",
          stripe_payment_intent_id: (session as any).payment_intent as string,
          paid_at: new Date(),
          updated_at: new Date(),
        }

        // Save shipping address if collected
        const shipping = (session as any).shipping_details
        if (shipping?.address) {
          updateData.shipping_name = shipping.name || null
          updateData.shipping_address_line1 = shipping.address.line1 || null
          updateData.shipping_address_line2 = shipping.address.line2 || null
          updateData.shipping_city = shipping.address.city || null
          updateData.shipping_postal_code = shipping.address.postal_code || null
          updateData.shipping_country = shipping.address.country || null
        }

        // Fallback: use customer name from metadata if no shipping name
        if (!updateData.shipping_name && session.metadata?.customer_name) {
          updateData.shipping_name = session.metadata.customer_name
        }

        if (orderGroupId) {
          // Combined checkout: update all transactions in the group
          await pgConnection("transaction")
            .where("order_group_id", orderGroupId)
            .where("status", "pending")
            .update(updateData)

          // Handle direct purchase items: update Release status + clean cart
          const directPurchaseTxs = await pgConnection("transaction")
            .where("order_group_id", orderGroupId)
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

          console.log(`[stripe-webhook] Order group ${orderGroupId} marked as paid (${directPurchaseTxs.length} direct purchases)`)

          // Increment promo code used_count if applicable
          const promoTxLegacy = await pgConnection("transaction")
            .where("order_group_id", orderGroupId)
            .whereNotNull("promo_code_id")
            .first()
          if (promoTxLegacy?.promo_code_id) {
            await pgConnection("promo_code")
              .where("id", promoTxLegacy.promo_code_id)
              .update({
                used_count: pgConnection.raw("used_count + 1"),
                updated_at: new Date(),
              })
          }

          // Generate order number for all transactions in the group
          const [{ nextval: seqVal }] = await pgConnection.raw("SELECT nextval('order_number_seq')")
          const orderNumber = "VOD-ORD-" + String(seqVal).padStart(6, "0")
          await pgConnection("transaction")
            .where("order_group_id", orderGroupId)
            .update({ order_number: orderNumber })

          // Create audit trail event
          await pgConnection("order_event").insert({
            id: generateEntityId(),
            order_group_id: orderGroupId,
            event_type: "status_change",
            title: "Payment received via Stripe (Checkout Session)",
            details: JSON.stringify({
              payment_intent_id: (session as any).payment_intent || null,
              order_number: orderNumber,
              event_type: event.type,
            }),
            actor: "system",
            created_at: new Date(),
          })

          // Send payment confirmation email (async, non-blocking)
          sendPaymentConfirmationEmail(pgConnection, orderGroupId).catch((err) => {
            console.error("[stripe-webhook] Failed to send payment email:", err)
          })

          // Sync payment to Brevo CRM
          crmSyncPaymentCompleted(pgConnection, orderGroupId).catch(() => {})
        } else if (transactionId) {
          // Legacy single-item checkout
          await pgConnection("transaction")
            .where("id", transactionId)
            .update(updateData)

          console.log(`[stripe-webhook] Transaction ${transactionId} marked as paid`)

          // For legacy single-item, create a pseudo order_group_id from transaction
          const tx = await pgConnection("transaction").where("id", transactionId).first()
          if (tx?.order_group_id) {
            sendPaymentConfirmationEmail(pgConnection, tx.order_group_id).catch(() => {})
          }
        } else {
          console.error("[stripe-webhook] No order_group_id or transaction_id in session metadata")
        }

        break
      }

      // ── PaymentIntent succeeded (new embedded checkout flow) ──
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as any
        const orderGroupId = paymentIntent.metadata?.order_group_id

        if (!orderGroupId) {
          console.error("[stripe-webhook] payment_intent.succeeded: No order_group_id in metadata")
          break
        }

        // Check if already processed (idempotency)
        const alreadyPaid = await pgConnection("transaction")
          .where("order_group_id", orderGroupId)
          .where("status", "paid")
          .first()
        if (alreadyPaid) {
          console.log(`[stripe-webhook] Order group ${orderGroupId} already paid — skipping`)
          break
        }

        const updateData: Record<string, any> = {
          status: "paid",
          stripe_payment_intent_id: paymentIntent.id,
          paid_at: new Date(),
          updated_at: new Date(),
        }

        // Shipping address from PaymentIntent (already saved at create time for embedded flow,
        // but update from Stripe in case it was collected via PayPal/redirect)
        const shipping = paymentIntent.shipping
        if (shipping?.address) {
          updateData.shipping_name = shipping.name || null
          updateData.shipping_address_line1 = shipping.address.line1 || null
          updateData.shipping_address_line2 = shipping.address.line2 || null
          updateData.shipping_city = shipping.address.city || null
          updateData.shipping_postal_code = shipping.address.postal_code || null
          updateData.shipping_country = shipping.address.country || null
        }

        // Fallback name from metadata
        if (!updateData.shipping_name && paymentIntent.metadata?.customer_name) {
          updateData.shipping_name = paymentIntent.metadata.customer_name
        }

        // Update all transactions in the group
        await pgConnection("transaction")
          .where("order_group_id", orderGroupId)
          .where("status", "pending")
          .update(updateData)

        // Handle direct purchase items: update Release status + clean cart
        const directPurchaseTxs = await pgConnection("transaction")
          .where("order_group_id", orderGroupId)
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

        console.log(`[stripe-webhook] PaymentIntent ${paymentIntent.id} — Order ${orderGroupId} marked as paid (${directPurchaseTxs.length} direct purchases)`)

        // Generate order number for all transactions in the group
        const [{ nextval: piSeqVal }] = await pgConnection.raw("SELECT nextval('order_number_seq')")
        const piOrderNumber = "VOD-ORD-" + String(piSeqVal).padStart(6, "0")
        await pgConnection("transaction")
          .where("order_group_id", orderGroupId)
          .update({ order_number: piOrderNumber })

        // Create audit trail event
        await pgConnection("order_event").insert({
          id: generateEntityId(),
          order_group_id: orderGroupId,
          event_type: "status_change",
          title: "Payment received via Stripe (Payment Element)",
          details: JSON.stringify({
            payment_intent_id: paymentIntent.id,
            order_number: piOrderNumber,
            event_type: event.type,
          }),
          actor: "system",
          created_at: new Date(),
        })

        // Increment promo code used_count if applicable
        const promoTx = await pgConnection("transaction")
          .where("order_group_id", orderGroupId)
          .whereNotNull("promo_code_id")
          .first()
        if (promoTx?.promo_code_id) {
          await pgConnection("promo_code")
            .where("id", promoTx.promo_code_id)
            .increment("used_count", 1)
            .update({ updated_at: new Date() })
          console.log(`[stripe-webhook] Promo code ${promoTx.promo_code_id} used_count incremented`)
        }

        // Send payment confirmation email
        sendPaymentConfirmationEmail(pgConnection, orderGroupId).catch((err) => {
          console.error("[stripe-webhook] Failed to send payment email:", err)
        })

        // Sync payment to Brevo CRM
        crmSyncPaymentCompleted(pgConnection, orderGroupId).catch(() => {})

        break
      }

      // ── PaymentIntent failed (new embedded checkout flow) ──
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as any
        const orderGroupId = paymentIntent.metadata?.order_group_id

        if (orderGroupId) {
          const lastError = paymentIntent.last_payment_error
          console.error(`[stripe-webhook] PaymentIntent ${paymentIntent.id} failed — ${lastError?.message || "unknown error"}`)

          // Don't mark as failed immediately — user can retry on the same page
          // Only log for now. Transactions stay "pending" until they expire or succeed.
        }
        break
      }

      case "checkout.session.expired": {
        const session = event.data.object
        const orderGroupId = session.metadata?.order_group_id
        const transactionId = session.metadata?.transaction_id

        if (orderGroupId) {
          await pgConnection("transaction")
            .where("order_group_id", orderGroupId)
            .where("status", "pending")
            .update({ status: "failed", updated_at: new Date() })

          await pgConnection("order_event").insert({
            id: generateEntityId(),
            order_group_id: orderGroupId,
            event_type: "status_change",
            title: "Checkout session expired",
            details: JSON.stringify({ session_id: session.id }),
            actor: "system",
            created_at: new Date(),
          })

          console.log(`[stripe-webhook] Order group ${orderGroupId} expired`)
        } else if (transactionId) {
          await pgConnection("transaction")
            .where("id", transactionId)
            .where("status", "pending")
            .update({ status: "failed", updated_at: new Date() })

          await pgConnection("order_event").insert({
            id: generateEntityId(),
            order_group_id: transactionId,
            event_type: "status_change",
            title: "Checkout session expired",
            details: JSON.stringify({ session_id: session.id }),
            actor: "system",
            created_at: new Date(),
          })

          console.log(`[stripe-webhook] Transaction ${transactionId} expired`)
        }
        break
      }
    }

    res.json({ received: true })
  } catch (error: any) {
    console.error("[stripe-webhook] Error processing event:", error)
    res.status(500).json({ message: "Webhook processing failed" })
  }
}
