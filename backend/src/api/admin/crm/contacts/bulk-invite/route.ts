import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { sendBulkInviteEmailToMaster } from "../../../../../lib/email-helpers"
import { JobTracker } from "../../../../../lib/job-tracker"

// POST /admin/crm/contacts/bulk-invite
//
// Body: {
//   master_ids: string[]      // max 1000 per call
//   custom_note?: string      // optional 1-line Frank-handgeschriebener Satz
//   expires_days?: number     // default 21
//   skip_already_sent?: boolean  // default true: überspringt Master mit bulk_invite_sent_at NOT NULL
// }
//
// Returns 202 { job_id, total_eligible, skipped_already_sent, skipped_no_email,
//                skipped_blocked } — Email-Versand läuft im Background.
//
// Send-Throttle: 15 ms zwischen Sends → ~66 Mails/sec (Resend-Limit 100/sec).
// Cancel: PATCH background_job.cancel_requested = true → Loop bricht ab.
//
// Phase B Workstream §14, Robin-Decision 2026-05-08: §7(3) UWG Bestandskunden.

type BulkInviteBody = {
  master_ids?: string[]
  custom_note?: string
  expires_days?: number
  skip_already_sent?: boolean
}

const SEND_THROTTLE_MS = 15

export async function POST(
  req: MedusaRequest<BulkInviteBody>,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const adminEmail = (req as any).auth_context?.actor_id || "admin"
  const body = (req.body || {}) as BulkInviteBody

  const masterIds = Array.isArray(body.master_ids)
    ? body.master_ids.filter((x) => typeof x === "string" && x.length > 0)
    : []
  const customNote =
    typeof body.custom_note === "string" && body.custom_note.trim().length > 0
      ? body.custom_note.trim().slice(0, 500)
      : null
  const expiresDays =
    typeof body.expires_days === "number" && body.expires_days > 0 && body.expires_days <= 90
      ? body.expires_days
      : 21
  const skipAlreadySent = body.skip_already_sent !== false

  if (masterIds.length === 0) {
    res.status(400).json({ message: "master_ids required" })
    return
  }
  if (masterIds.length > 1000) {
    res.status(400).json({ message: "max 1000 master_ids per call" })
    return
  }

  // Pre-validate: classify masters into eligible vs skipped reasons
  const masters = await pg("crm_master_contact")
    .whereIn("id", masterIds)
    .whereNull("deleted_at")
    .select("id", "primary_email_lower", "is_blocked", "bulk_invite_sent_at")

  const eligible: string[] = []
  let skippedNoEmail = 0
  let skippedBlocked = 0
  let skippedAlreadySent = 0

  for (const m of masters) {
    if (m.is_blocked) {
      skippedBlocked++
      continue
    }
    if (!m.primary_email_lower) {
      skippedNoEmail++
      continue
    }
    if (skipAlreadySent && m.bulk_invite_sent_at) {
      skippedAlreadySent++
      continue
    }
    eligible.push(m.id)
  }

  const skippedNotFound = masterIds.length - masters.length

  // Create JobTracker row
  const tracker = await JobTracker.create(pg, {
    kind: "bulk_invite",
    display_name: `Bulk-Invite ${eligible.length} contacts (${customNote ? "with note" : "no note"})`,
    total: eligible.length,
    payload: {
      input_count: masterIds.length,
      eligible_count: eligible.length,
      skipped_no_email: skippedNoEmail,
      skipped_blocked: skippedBlocked,
      skipped_already_sent: skippedAlreadySent,
      skipped_not_found: skippedNotFound,
      expires_days: expiresDays,
      has_custom_note: !!customNote,
    },
    triggered_by: adminEmail,
  })

  // Respond 202 immediately
  res.status(202).json({
    job_id: tracker.id,
    eligible: eligible.length,
    skipped_no_email: skippedNoEmail,
    skipped_blocked: skippedBlocked,
    skipped_already_sent: skippedAlreadySent,
    skipped_not_found: skippedNotFound,
  })

  // Decouple from HTTP lifecycle (CLAUDE.md feedback_http_lifecycle_background_tasks)
  void (async () => {
    let sent = 0
    let failed = 0
    const errors: { master_id: string; error: string }[] = []

    for (const masterId of eligible) {
      if (await tracker.isCancelled()) {
        await tracker.appendLog("Cancelled by admin — stopping loop.")
        break
      }
      try {
        const result = await sendBulkInviteEmailToMaster(pg, {
          masterId,
          expiresDays,
          customNote,
          issuedBy: adminEmail,
        })
        sent++
        await tracker.tick(1)
        if (sent % 50 === 0) {
          await tracker.appendLog(`${sent}/${eligible.length} sent (last: ${result.email})`)
        }
      } catch (err: any) {
        failed++
        errors.push({ master_id: masterId, error: err.message || String(err) })
        await tracker.tick(1)
        if (errors.length <= 10) {
          await tracker.appendLog(`FAIL ${masterId}: ${err.message || String(err)}`)
        }
      }
      await sleep(SEND_THROTTLE_MS)
    }

    const finalStatus = failed > 0 && sent === 0 ? "failed" : "completed"
    await tracker.finish(finalStatus, {
      sent,
      failed,
      errors: errors.slice(0, 50),
    })
    console.log(
      `[bulk-invite] job ${tracker.id} done: ${sent} sent, ${failed} failed`
    )
  })().catch((err: any) => {
    console.error(`[bulk-invite] job ${tracker.id} crashed:`, err)
    tracker.finish("failed", { crash: err.message || String(err) }).catch(() => {})
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
