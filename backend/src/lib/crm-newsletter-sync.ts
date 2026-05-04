// CRM ↔ Newsletter Hybrid Sync (Phase 3+4 of NEWSLETTER_CRM_HYBRID_PLAN).
//
// Two entry points keep three stores in sync:
//   * crm_master_communication_pref (channel='email_marketing')  — primary mirror
//   * newsletter_subscribers                                      — audit trail
//   * Brevo                                                       — canonical
//
// Direction matters:
//   - Webhook arrives    → Brevo is already authoritative for this event.
//                          mirrorBrevoEventToLocal() updates only local rows.
//   - Drawer toggle      → user-driven local change.
//                          applyLocalCommPrefChange() updates local + fires
//                          a fire-and-forget Brevo API call.
//
// Both paths use findOrCreateMasterByEmail() so unknown emails get an
// auto-master with lifecycle='lead' + tag='newsletter_only', matching the
// backfill convention. This is Q1+Q3 from Robin's plan-approval (2026-05-04).

import type { Knex } from "knex"
import {
  addContactToList,
  removeContactFromList,
  updateContactAttributes,
  isBrevoConfigured,
  BREVO_LIST_VOD_AUCTIONS,
} from "./brevo"

const CHANNEL = "email_marketing"
const TAG_NEWSLETTER_ONLY = "newsletter_only"
const LIFECYCLE_LEAD = "lead"
const ACQUISITION_NEWSLETTER = "newsletter_signup"

export type CommPrefSource =
  | "admin_ui"
  | "brevo_webhook"
  | "brevo_legacy_backfill"
  | "storefront_signup"
  | "system"

// ─── Master lookup / auto-create ───────────────────────────────────────────

/**
 * Look up master by email_lower, or auto-create a minimal one.
 *
 * Uses the same shape as the backfill: lifecycle='lead', tags=['newsletter_only'],
 * acquisition_channel='newsletter_signup', display_name=email. Caller is
 * responsible for the transaction — pass the Knex trx if the operation
 * is part of a larger atomic update.
 */
export async function findOrCreateMasterByEmail(
  trx: Knex,
  email: string
): Promise<{ masterId: string; created: boolean }> {
  const emailLower = email.toLowerCase().trim()

  const existing = await trx("crm_master_email")
    .where({ email_lower: emailLower })
    .first("master_id")

  if (existing?.master_id) {
    return { masterId: existing.master_id as string, created: false }
  }

  const [master] = await trx("crm_master_contact")
    .insert({
      display_name: email,
      primary_email: email,
      primary_email_lower: emailLower,
      lifecycle_stage: LIFECYCLE_LEAD,
      acquisition_channel: ACQUISITION_NEWSLETTER,
      acquisition_date: trx.raw("CURRENT_DATE"),
      tags: [TAG_NEWSLETTER_ONLY],
      manual_review_status: "auto",
    })
    .returning("id")

  await trx("crm_master_email").insert({
    master_id: master.id,
    email,
    is_primary: true,
    is_verified: false,
    source_count: 1,
    source_list: ["brevo_webhook"],
  })

  return { masterId: master.id as string, created: true }
}

// ─── Webhook → local mirrors ───────────────────────────────────────────────

export type WebhookEvent = "unsubscribed" | "hardBounce" | "spam" | "complaint"

/**
 * Apply a Brevo webhook event to local stores. Brevo has already updated
 * its own state — we just mirror.
 *
 * Idempotent: re-running with the same event is safe (UPSERT semantics).
 */
export async function mirrorBrevoEventToLocal(
  pg: Knex,
  email: string,
  event: WebhookEvent,
  rawPayload?: Record<string, unknown>
): Promise<{ masterId: string; masterCreated: boolean; changed: boolean }> {
  return pg.transaction(async (trx) => {
    const { masterId, created: masterCreated } = await findOrCreateMasterByEmail(trx, email)

    // 1. Mirror to crm_master_communication_pref (opted_in=false)
    const prefRows = await trx("crm_master_communication_pref")
      .insert({
        master_id: masterId,
        channel: CHANNEL,
        opted_in: false,
        opted_out_at: trx.fn.now(),
        source: "brevo_webhook",
        notes: event,
      })
      .onConflict(["master_id", "channel"])
      .merge({
        opted_in: false,
        opted_out_at: trx.fn.now(),
        source: "brevo_webhook",
        notes: event,
        updated_at: trx.fn.now(),
      })
      .returning(["id", "opted_in"])

    const changed = prefRows.length > 0

    // 2. Mirror to newsletter_subscribers (mark unsubscribed_at)
    await trx("newsletter_subscribers")
      .insert({
        email,
        source: "vod-records",
        status: "unsubscribed",
        subscribed_at: trx.fn.now(),
        unsubscribed_at: trx.fn.now(),
      })
      .onConflict(trx.raw("(lower(email))"))
      .merge({
        status: "unsubscribed",
        unsubscribed_at: trx.fn.now(),
      })

    // 3. Bounce-specific: mark email as bounced
    if (event === "hardBounce") {
      await trx("crm_master_email")
        .where({ master_id: masterId, email_lower: email.toLowerCase().trim() })
        .update({
          is_verified: false,
          bounced_at: trx.fn.now(),
          bounce_type: "hard",
        })
    }

    // 4. Audit-Log
    await trx("crm_master_audit_log").insert({
      master_id: masterId,
      action: `brevo_${event}`,
      details: {
        channel: CHANNEL,
        email,
        event,
        master_created: masterCreated,
        ...(rawPayload ? { brevo_payload: rawPayload } : {}),
      },
      source: "brevo_webhook",
      admin_email: "system_webhook",
    })

    return { masterId, masterCreated, changed }
  })
}

// ─── Drawer-Toggle → local + async Brevo ───────────────────────────────────

/**
 * Apply a user-driven email_marketing pref change. Updates local mirrors
 * synchronously, fires a Brevo API call asynchronously (Robin Q4 decision
 * 2026-05-04 — async, optimistic UI, badge on sync error).
 *
 * Returns the new pref state immediately. The Brevo sync result is logged
 * to audit_log when it lands; surface it in the UI by polling the audit
 * stream or via a follow-up read.
 */
export async function applyLocalCommPrefChange(
  pg: Knex,
  masterId: string,
  optedIn: boolean,
  adminEmail: string,
  source: CommPrefSource = "admin_ui"
): Promise<{ prefId: string; brevoQueued: boolean }> {
  const result = await pg.transaction(async (trx) => {
    const master = await trx("crm_master_contact")
      .where({ id: masterId })
      .first(["id", "primary_email"])
    if (!master) throw new Error(`Master ${masterId} not found`)
    if (!master.primary_email) throw new Error(`Master ${masterId} has no primary_email`)

    // 1. Upsert pref (existing endpoint already does this for non-newsletter
    //    channels — we duplicate the logic here so the helper is callable
    //    without going through the route layer)
    const existing = await trx("crm_master_communication_pref")
      .where({ master_id: masterId, channel: CHANNEL })
      .first()

    let prefId: string
    if (existing) {
      const updates: Record<string, unknown> = {
        opted_in: optedIn,
        source,
        updated_at: trx.fn.now(),
      }
      if (optedIn && !existing.opted_in) {
        updates.opted_in_at = trx.fn.now()
        updates.opted_out_at = null
      } else if (!optedIn && existing.opted_in) {
        updates.opted_out_at = trx.fn.now()
      }
      await trx("crm_master_communication_pref")
        .where({ id: existing.id })
        .update(updates)
      prefId = existing.id
    } else {
      const [row] = await trx("crm_master_communication_pref")
        .insert({
          master_id: masterId,
          channel: CHANNEL,
          opted_in: optedIn,
          opted_in_at: optedIn ? trx.fn.now() : null,
          opted_out_at: optedIn ? null : trx.fn.now(),
          source,
        })
        .returning("id")
      prefId = row.id
    }

    // 2. Upsert newsletter_subscribers — keep it as audit-trail mirror
    await trx("newsletter_subscribers")
      .insert({
        email: master.primary_email,
        source: "crm_admin",
        status: optedIn ? "subscribed" : "unsubscribed",
        subscribed_at: trx.fn.now(),
        unsubscribed_at: optedIn ? null : trx.fn.now(),
      })
      .onConflict(trx.raw("(lower(email))"))
      .merge({
        status: optedIn ? "subscribed" : "unsubscribed",
        unsubscribed_at: optedIn ? null : trx.fn.now(),
        subscribed_at: optedIn ? trx.fn.now() : trx.raw("newsletter_subscribers.subscribed_at"),
      })

    // 3. Audit-Log
    await trx("crm_master_audit_log").insert({
      master_id: masterId,
      action: optedIn ? "newsletter_optin_admin" : "newsletter_optout_admin",
      details: { channel: CHANNEL, email: master.primary_email, source },
      source,
      admin_email: adminEmail,
    })

    return { prefId, email: master.primary_email as string }
  })

  // 4. Fire-and-forget Brevo sync (does NOT block the response)
  let brevoQueued = false
  if (isBrevoConfigured()) {
    brevoQueued = true
    void (async () => {
      try {
        if (optedIn) {
          await addContactToList(result.email, BREVO_LIST_VOD_AUCTIONS)
          await updateContactAttributes(result.email, { NEWSLETTER_OPTIN: true })
        } else {
          await removeContactFromList(result.email, BREVO_LIST_VOD_AUCTIONS)
          await updateContactAttributes(result.email, { NEWSLETTER_OPTIN: false })
        }
        // Success log
        await pg("crm_master_audit_log").insert({
          master_id: masterId,
          action: "brevo_sync_success",
          details: { channel: CHANNEL, email: result.email, opted_in: optedIn },
          source: "system",
          admin_email: "system_brevo_sync",
        })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[crm-newsletter-sync] Brevo sync failed for ${result.email}:`, errMsg)
        // Failure log — UI can read this and show a "needs manual sync" badge
        await pg("crm_master_audit_log").insert({
          master_id: masterId,
          action: "brevo_sync_failed",
          details: { channel: CHANNEL, email: result.email, opted_in: optedIn, error: errMsg },
          source: "system",
          admin_email: "system_brevo_sync",
        }).catch(() => {})
      }
    })()
  }

  return { prefId: result.prefId, brevoQueued }
}
