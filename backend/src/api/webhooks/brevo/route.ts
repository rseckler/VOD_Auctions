import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  updateContactAttributes,
  isBrevoConfigured,
} from "../../../lib/brevo"
import { mirrorBrevoEventToLocal } from "../../../lib/crm-newsletter-sync"

/**
 * POST /webhooks/brevo — Handle Brevo webhook events.
 *
 * Phase 3 of NEWSLETTER_CRM_HYBRID_PLAN: events arrive from Brevo (canonical
 * SoT for list-membership) and we mirror them into:
 *   - crm_master_communication_pref (opted_in flag flipped to false)
 *   - newsletter_subscribers (unsubscribed_at timestamp)
 *   - crm_master_email (bounced_at + bounce_type for hardBounce)
 *   - crm_master_audit_log
 *
 * Auto-Master is created for unknown emails (Robin Q3 decision).
 *
 * Webhook URL: https://api.vod-auctions.com/webhooks/brevo
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  if (!isBrevoConfigured()) {
    res.status(503).json({ message: "Brevo not configured" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
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
        await updateContactAttributes(email, { NEWSLETTER_OPTIN: false }).catch(() => {})
        const r = await mirrorBrevoEventToLocal(pgConnection, email, "unsubscribed", body)
        console.log(
          `[brevo-webhook] Unsubscribed: ${email} (master=${r.masterId}, created=${r.masterCreated})`
        )
        break
      }

      case "hardBounce": {
        await updateContactAttributes(email, {
          EMAIL_VALID: false,
          BOUNCE_TYPE: "hard",
        }).catch(() => {})
        const r = await mirrorBrevoEventToLocal(pgConnection, email, "hardBounce", body)
        console.log(
          `[brevo-webhook] Hard bounce: ${email} (master=${r.masterId}, created=${r.masterCreated})`
        )
        break
      }

      case "softBounce": {
        // Soft bounces are transient — log only, don't flip opt-in
        console.log(`[brevo-webhook] Soft bounce: ${email}`)
        break
      }

      case "complaint":
      case "spam": {
        await updateContactAttributes(email, {
          NEWSLETTER_OPTIN: false,
          SPAM_REPORTED: true,
        }).catch(() => {})
        const r = await mirrorBrevoEventToLocal(pgConnection, email, "spam", body)
        console.log(
          `[brevo-webhook] Spam/complaint: ${email} (master=${r.masterId}, created=${r.masterCreated})`
        )
        break
      }

      case "delivered":
      case "opened":
      case "click": {
        // Engagement events — Brevo tracks these internally
        console.log(`[brevo-webhook] ${event}: ${email}`)
        break
      }

      default: {
        console.log(`[brevo-webhook] Unknown event "${event}" for ${email}`)
      }
    }

    res.json({ received: true })
  } catch (err: any) {
    console.error(`[brevo-webhook] Error processing ${event} for ${email}:`, err.message)
    res.status(500).json({ message: "Webhook processing failed" })
  }
}
