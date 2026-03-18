import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { verifyWebhookSignature } from "../../../lib/paypal"

// POST /webhooks/paypal — PayPal Webhook Handler
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID

  if (!webhookId) {
    console.warn("[paypal-webhook] PAYPAL_WEBHOOK_ID not set")
    res.status(400).json({ message: "Webhook not configured" })
    return
  }

  // Get raw body for signature verification
  const rawBody = (req as any).rawBody
  if (!rawBody) {
    console.error("[paypal-webhook] No raw body available")
    res.status(400).json({ message: "No webhook payload" })
    return
  }

  const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody)

  // Verify signature
  try {
    const isValid = await verifyWebhookSignature({
      webhookId,
      headers: {
        "paypal-auth-algo": req.headers["paypal-auth-algo"] as string || "",
        "paypal-cert-url": req.headers["paypal-cert-url"] as string || "",
        "paypal-transmission-id": req.headers["paypal-transmission-id"] as string || "",
        "paypal-transmission-sig": req.headers["paypal-transmission-sig"] as string || "",
        "paypal-transmission-time": req.headers["paypal-transmission-time"] as string || "",
      },
      body: bodyString,
    })

    if (!isValid) {
      console.error("[paypal-webhook] Signature verification failed")
      res.status(400).json({ message: "Webhook signature verification failed" })
      return
    }
  } catch (err: any) {
    console.error("[paypal-webhook] Signature verification error:", err.message)
    res.status(400).json({ message: "Webhook signature verification failed" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const event = JSON.parse(bodyString)
  const eventType = event.event_type

  try {
    switch (eventType) {
      case "PAYMENT.CAPTURE.COMPLETED": {
        // Backup confirmation — the primary flow is capture-paypal-order endpoint
        const captureId = event.resource?.id
        if (!captureId) break

        // Check if we already processed this via the capture endpoint
        const alreadyPaid = await pgConnection("transaction")
          .where("paypal_capture_id", captureId)
          .where("status", "paid")
          .first()

        if (alreadyPaid) {
          console.log(`[paypal-webhook] Capture ${captureId} already processed — skipping`)
          break
        }

        // Find transactions by capture ID and mark as paid
        await pgConnection("transaction")
          .where("paypal_capture_id", captureId)
          .where("status", "pending")
          .update({
            status: "paid",
            paid_at: new Date(),
            updated_at: new Date(),
          })

        // Generate order number if not already set
        const paidTx = await pgConnection("transaction")
          .where("paypal_capture_id", captureId)
          .first()

        if (paidTx?.order_group_id) {
          const existingOrder = await pgConnection("transaction")
            .where("order_group_id", paidTx.order_group_id)
            .whereNotNull("order_number")
            .first()

          if (!existingOrder) {
            const [{ nextval: seqVal }] = await pgConnection.raw("SELECT nextval('order_number_seq')")
            const orderNumber = "VOD-ORD-" + String(seqVal).padStart(6, "0")
            await pgConnection("transaction")
              .where("order_group_id", paidTx.order_group_id)
              .update({ order_number: orderNumber })

            console.log(`[paypal-webhook] Generated order number ${orderNumber} for group ${paidTx.order_group_id}`)
          }

          // Create audit trail event
          await pgConnection("order_event").insert({
            id: generateEntityId(),
            order_group_id: paidTx.order_group_id,
            event_type: "status_change",
            title: "Payment received via PayPal",
            details: JSON.stringify({
              paypal_capture_id: captureId,
              paypal_order_id: paidTx.paypal_order_id || null,
              order_number: existingOrder?.order_number || null,
              event_type: eventType,
            }),
            actor: "system",
            created_at: new Date(),
          })
        }

        console.log(`[paypal-webhook] PAYMENT.CAPTURE.COMPLETED — capture ${captureId}`)
        break
      }

      case "PAYMENT.CAPTURE.DENIED": {
        const captureId = event.resource?.id
        if (!captureId) break

        // Find transaction before updating for audit trail
        const deniedTx = await pgConnection("transaction")
          .where("paypal_capture_id", captureId)
          .first()

        await pgConnection("transaction")
          .where("paypal_capture_id", captureId)
          .where("status", "pending")
          .update({
            status: "failed",
            updated_at: new Date(),
          })

        if (deniedTx?.order_group_id) {
          await pgConnection("order_event").insert({
            id: generateEntityId(),
            order_group_id: deniedTx.order_group_id,
            event_type: "status_change",
            title: "PayPal payment denied",
            details: JSON.stringify({
              paypal_capture_id: captureId,
              event_type: eventType,
            }),
            actor: "system",
            created_at: new Date(),
          })
        }

        console.log(`[paypal-webhook] PAYMENT.CAPTURE.DENIED — capture ${captureId}`)
        break
      }

      case "PAYMENT.CAPTURE.REFUNDED": {
        // External refund tracking (refund initiated from PayPal dashboard)
        const captureId = event.resource?.links
          ?.find((l: any) => l.rel === "up")
          ?.href?.split("/captures/")?.[1]

        if (captureId) {
          const tx = await pgConnection("transaction")
            .where("paypal_capture_id", captureId)
            .first()

          if (tx && tx.status !== "refunded") {
            const orderGroupId = tx.order_group_id
            if (orderGroupId) {
              await pgConnection("transaction")
                .where("order_group_id", orderGroupId)
                .update({ status: "refunded", updated_at: new Date() })

              // Set releases back to available
              const txs = await pgConnection("transaction")
                .where("order_group_id", orderGroupId)
                .select("release_id")

              for (const t of txs) {
                if (t.release_id) {
                  await pgConnection("Release")
                    .where("id", t.release_id)
                    .update({ auction_status: "available", updatedAt: new Date() })
                }
              }
            }
          }

          // Create audit trail event for refund
          if (tx?.order_group_id) {
            await pgConnection("order_event").insert({
              id: generateEntityId(),
              order_group_id: tx.order_group_id,
              event_type: "status_change",
              title: "Payment refunded via PayPal",
              details: JSON.stringify({
                paypal_capture_id: captureId,
                refund_id: event.resource?.id || null,
                event_type: eventType,
              }),
              actor: "system",
              created_at: new Date(),
            })
          }

          console.log(`[paypal-webhook] PAYMENT.CAPTURE.REFUNDED — capture ${captureId}`)
        }
        break
      }

      default:
        console.log(`[paypal-webhook] Unhandled event type: ${eventType}`)
    }

    res.json({ received: true })
  } catch (error: any) {
    console.error("[paypal-webhook] Error processing event:", error)
    res.status(500).json({ message: "Webhook processing failed" })
  }
}
