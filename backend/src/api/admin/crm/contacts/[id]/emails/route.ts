import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  ADMIN_EMAIL_FALLBACK,
  syncPrimaryEmail,
} from "../../../../../../lib/crm-master-edit"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /admin/crm/contacts/:id/emails — Email hinzufügen
export async function POST(
  req: MedusaRequest<{ email?: string; is_primary?: boolean }, { id?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const masterId = (req.params as { id?: string })?.id
  const body = (req.body || {}) as { email?: string; is_primary?: boolean }
  const email = (body.email || "").trim().toLowerCase()
  const setPrimary = Boolean(body.is_primary)
  const admin = ADMIN_EMAIL_FALLBACK

  if (!masterId || !email || !EMAIL_RE.test(email)) {
    res.status(400).json({ ok: false, error: "valid email required" })
    return
  }

  try {
    const result = await pgConnection.transaction(async (trx) => {
      const master = await trx("crm_master_contact")
        .where({ id: masterId, deleted_at: null })
        .first()
      if (!master) throw new Error("Contact not found")

      const existing = await trx("crm_master_email")
        .where({ master_id: masterId, email_lower: email })
        .first()
      if (existing) {
        // Bereits vorhanden → ggf. nur primary togglen
        if (setPrimary && !existing.is_primary) {
          await trx("crm_master_email")
            .where({ id: existing.id })
            .update({ is_primary: true })
          await syncPrimaryEmail(trx, masterId, existing.id)
          await trx("crm_master_audit_log").insert({
            master_id: masterId,
            action: "email_primary_changed",
            details: { email },
            source: "admin_ui",
            admin_email: admin,
          })
        }
        return await trx("crm_master_email").where({ id: existing.id }).first()
      }

      const wantsPrimary =
        setPrimary || !master.primary_email_lower // wenn keine primary da → automatisch primary

      const [inserted] = await trx("crm_master_email")
        .insert({
          master_id: masterId,
          email,
          is_primary: wantsPrimary,
          is_verified: false,
          source_count: 1,
          source_list: ["manual"],
        })
        .returning("*")

      if (wantsPrimary) {
        await syncPrimaryEmail(trx, masterId, inserted.id)
      }

      await trx("crm_master_audit_log").insert({
        master_id: masterId,
        action: "email_added",
        details: { email, is_primary: wantsPrimary },
        source: "admin_ui",
        admin_email: admin,
      })

      return inserted
    })

    res.json({ email: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message === "Contact not found" ? 404 : 500
    res.status(status).json({ ok: false, error: message })
  }
}
