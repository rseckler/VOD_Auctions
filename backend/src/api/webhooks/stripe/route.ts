import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { stripe } from "../../../lib/stripe"
import { sendPaymentConfirmationEmail } from "../../../lib/email-helpers.js"

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
    event = stripe.webhooks.constructEvent(
      req.body as unknown as Buffer,
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

          // Send payment confirmation email (async, non-blocking)
          sendPaymentConfirmationEmail(pgConnection, orderGroupId).catch((err) => {
            console.error("[stripe-webhook] Failed to send payment email:", err)
          })
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

      case "checkout.session.expired": {
        const session = event.data.object
        const orderGroupId = session.metadata?.order_group_id
        const transactionId = session.metadata?.transaction_id

        if (orderGroupId) {
          await pgConnection("transaction")
            .where("order_group_id", orderGroupId)
            .where("status", "pending")
            .update({ status: "failed", updated_at: new Date() })
          console.log(`[stripe-webhook] Order group ${orderGroupId} expired`)
        } else if (transactionId) {
          await pgConnection("transaction")
            .where("id", transactionId)
            .where("status", "pending")
            .update({ status: "failed", updated_at: new Date() })
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
