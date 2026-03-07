import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  updateContactAttributes,
  isBrevoConfigured,
} from "../../../lib/brevo"

/**
 * POST /webhooks/brevo — Handle Brevo webhook events
 *
 * Brevo sends webhook notifications for email events:
 * - unsubscribed: contact opted out (Brevo handles list removal automatically)
 * - hardBounce: email address is invalid
 * - softBounce: temporary delivery failure
 * - complaint / spam: recipient marked as spam
 * - delivered, opened, click: engagement events (logged only)
 *
 * Webhook URL: https://api.vod-auctions.com/webhooks/brevo
 * Configure in Brevo Dashboard → Settings → Webhooks
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  if (!isBrevoConfigured()) {
    res.status(503).json({ message: "Brevo not configured" })
    return
  }

  const body = req.body as Record<string, any>
  const event = body?.event as string
  const email = body?.email as string

  if (!event || !email) {
    res.status(400).json({ message: "Missing event or email" })
    return
  }

  try {
    switch (event) {
      case "unsubscribed": {
        // Brevo automatically removes from list — we just update our attribute
        await updateContactAttributes(email, {
          NEWSLETTER_OPTIN: false,
        }).catch(() => {})

        console.log(`[brevo-webhook] Unsubscribed: ${email}`)
        break
      }

      case "hardBounce": {
        // Mark email as invalid
        await updateContactAttributes(email, {
          EMAIL_VALID: false,
          BOUNCE_TYPE: "hard",
        }).catch(() => {})

        console.log(`[brevo-webhook] Hard bounce: ${email}`)
        break
      }

      case "softBounce": {
        console.log(`[brevo-webhook] Soft bounce: ${email}`)
        break
      }

      case "complaint":
      case "spam": {
        // Mark as spam reporter, disable marketing
        await updateContactAttributes(email, {
          NEWSLETTER_OPTIN: false,
          SPAM_REPORTED: true,
        }).catch(() => {})

        console.log(`[brevo-webhook] Spam/complaint: ${email}`)
        break
      }

      case "delivered":
      case "opened":
      case "click": {
        // Engagement events — Brevo tracks these internally
        // Log only for debugging, no action needed
        console.log(`[brevo-webhook] ${event}: ${email}`)
        break
      }

      default: {
        console.log(`[brevo-webhook] Unknown event "${event}" for ${email}`)
      }
    }

    res.json({ received: true })
  } catch (err: any) {
    console.error(`[brevo-webhook] Error processing ${event}:`, err.message)
    res.status(500).json({ message: "Webhook processing failed" })
  }
}
