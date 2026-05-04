import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  ADMIN_EMAIL_FALLBACK,
  clearPrimaryEmailIfMatch,
  syncPrimaryEmail,
} from "../../../../../../../lib/crm-master-edit"

type Params = { id?: string; emailId?: string }

// PATCH /admin/crm/contacts/:id/emails/:emailId — set primary / mark verified
export async function PATCH(
  req: MedusaRequest<{ is_primary?: boolean; is_verified?: boolean }, Params>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const params = req.params as Params
  const masterId = params?.id
  const emailId = params?.emailId
  const payload = (req.body || {}) as { is_primary?: boolean; is_verified?: boolean }
  const admin = ADMIN_EMAIL_FALLBACK

  if (!masterId || !emailId) {
    res.status(400).json({ ok: false, error: "id and emailId required" })
    return
  }

  try {
    const result = await pgConnection.transaction(async (trx) => {
      const before = await trx("crm_master_email")
        .where({ id: emailId, master_id: masterId })
        .first()
      if (!before) throw new Error("Email not found")

      const updates: Record<string, unknown> = {}
      const audits: Array<Record<string, unknown>> = []

      if (typeof payload.is_primary === "boolean" && payload.is_primary !== before.is_primary) {
        updates.is_primary = payload.is_primary
        if (payload.is_primary) {
          audits.push({
            master_id: masterId,
            action: "email_primary_changed",
            details: { email: before.email },
            source: "admin_ui",
            admin_email: admin,
          })
        }
      }
      if (typeof payload.is_verified === "boolean" && payload.is_verified !== before.is_verified) {
        updates.is_verified = payload.is_verified
      }

      if (Object.keys(updates).length === 0) {
        return before
      }

      const [after] = await trx("crm_master_email")
        .where({ id: emailId })
        .update(updates)
        .returning("*")

      if (updates.is_primary === true) {
        await syncPrimaryEmail(trx, masterId, emailId)
      }

      if (audits.length > 0) await trx("crm_master_audit_log").insert(audits)

      return after
    })

    res.json({ email: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message === "Email not found" ? 404 : 500
    res.status(status).json({ ok: false, error: message })
  }
}

// DELETE /admin/crm/contacts/:id/emails/:emailId
export async function DELETE(
  req: MedusaRequest<unknown, Params>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const params = req.params as Params
  const masterId = params?.id
  const emailId = params?.emailId
  const admin = ADMIN_EMAIL_FALLBACK

  if (!masterId || !emailId) {
    res.status(400).json({ ok: false, error: "id and emailId required" })
    return
  }

  try {
    await pgConnection.transaction(async (trx) => {
      const existing = await trx("crm_master_email")
        .where({ id: emailId, master_id: masterId })
        .first()
      if (!existing) throw new Error("Email not found")

      await clearPrimaryEmailIfMatch(trx, masterId, emailId)
      await trx("crm_master_email").where({ id: emailId }).delete()

      await trx("crm_master_audit_log").insert({
        master_id: masterId,
        action: "email_removed",
        details: { email: existing.email },
        source: "admin_ui",
        admin_email: admin,
      })
    })

    res.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message === "Email not found" ? 404 : 500
    res.status(status).json({ ok: false, error: message })
  }
}
