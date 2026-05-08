import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { generateMasterUnsubscribeToken } from "../../../../lib/email-helpers"

const STOREFRONT_URL = process.env.STOREFRONT_URL || "http://localhost:3000"

/**
 * GET /store/email-preferences/unsubscribe-master?token={token}&id={master_id}
 *
 * Master-ID-basierter Unsubscribe für CRM Bulk-Invite-Mails (§7(3) UWG-Konformität).
 * Validiert HMAC, setzt opted_in=false in crm_master_communication_pref für
 * channel='email_marketing' und redirected zur Confirmation-Page.
 *
 * Verleckt KEIN Master-Existenz: Bei ungültigem Token redirect, bei nicht-
 * existierendem Master ebenfalls redirect (kein 404).
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const token = req.query.token as string
  const masterId = req.query.id as string

  if (!token || !masterId) {
    res.status(400).json({ message: "Missing token or id parameter" })
    return
  }

  const expectedToken = generateMasterUnsubscribeToken(masterId)
  if (token !== expectedToken) {
    res.status(400).json({ message: "Invalid unsubscribe token" })
    return
  }

  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  // UPSERT comm-pref: existing → opt out; missing → insert opt-out row
  // Mirror to newsletter_subscribers if matching email exists.
  try {
    const master = await pg("crm_master_contact")
      .where({ id: masterId, deleted_at: null })
      .select("id", "primary_email_lower")
      .first()

    if (master) {
      await pg.raw(
        `INSERT INTO crm_master_communication_pref
           (master_id, channel, opted_in, source, updated_at)
         VALUES (?, 'email_marketing', false, 'unsubscribe_master_link', NOW())
         ON CONFLICT (master_id, channel) DO UPDATE
           SET opted_in = false,
               source = EXCLUDED.source,
               updated_at = NOW()`,
        [masterId]
      )

      if (master.primary_email_lower) {
        await pg("newsletter_subscribers")
          .where("email", master.primary_email_lower)
          .where("status", "active")
          .update({ status: "unsubscribed", unsubscribed_at: new Date() })
      }

      await pg("crm_master_audit_log").insert({
        master_id: masterId,
        action: "unsubscribe_email_marketing",
        details: { source: "unsubscribe_master_link", channel: "email_marketing" },
        source: "self_service",
        admin_email: null,
      })

      console.log(
        `[unsubscribe-master] master ${masterId} (${master.primary_email_lower}) unsubscribed via email link`
      )
    }
  } catch (err: any) {
    console.error("[unsubscribe-master] error:", err.message)
    // Redirect anyway — don't leak failure
  }

  res.redirect(`${STOREFRONT_URL}/email-preferences/unsubscribed`)
}
