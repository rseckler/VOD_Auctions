import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  ADMIN_EMAIL_FALLBACK,
  clearPrimaryPhoneIfMatch,
  syncPrimaryPhone,
} from "../../../../../../../lib/crm-master-edit"

type Params = { id?: string; phoneId?: string }

// PATCH /admin/crm/contacts/:id/phones/:phoneId
export async function PATCH(
  req: MedusaRequest<{ phone_raw?: string; phone_type?: string | null; is_primary?: boolean }, Params>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const params = req.params as Params
  const masterId = params?.id
  const phoneId = params?.phoneId
  const payload = (req.body || {}) as { phone_raw?: string; phone_type?: string | null; is_primary?: boolean }
  const admin = ADMIN_EMAIL_FALLBACK

  if (!masterId || !phoneId) {
    res.status(400).json({ ok: false, error: "id and phoneId required" })
    return
  }

  try {
    const result = await pgConnection.transaction(async (trx) => {
      const before = await trx("crm_master_phone")
        .where({ id: phoneId, master_id: masterId })
        .first()
      if (!before) throw new Error("Phone not found")

      const updates: Record<string, unknown> = {}
      if (typeof payload.phone_raw === "string" && payload.phone_raw.trim() !== before.phone_raw) {
        updates.phone_raw = payload.phone_raw.trim()
      }
      if (payload.phone_type !== undefined) {
        const v = payload.phone_type === null ? null : String(payload.phone_type).trim() || null
        if (v !== before.phone_type) updates.phone_type = v
      }
      if (typeof payload.is_primary === "boolean" && payload.is_primary !== before.is_primary) {
        updates.is_primary = payload.is_primary
      }

      if (Object.keys(updates).length === 0) return before

      const [after] = await trx("crm_master_phone")
        .where({ id: phoneId })
        .update(updates)
        .returning("*")

      if (updates.is_primary === true) {
        await syncPrimaryPhone(trx, masterId, phoneId)
      }

      const audits: Array<Record<string, unknown>> = [{
        master_id: masterId,
        action: "phone_updated",
        details: { phone_id: phoneId, fields: Object.keys(updates) },
        source: "admin_ui",
        admin_email: admin,
      }]
      if (updates.is_primary === true) {
        audits.push({
          master_id: masterId,
          action: "phone_primary_changed",
          details: { phone_id: phoneId },
          source: "admin_ui",
          admin_email: admin,
        })
      }
      await trx("crm_master_audit_log").insert(audits)

      return after
    })

    res.json({ phone: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message === "Phone not found" ? 404 : 500
    res.status(status).json({ ok: false, error: message })
  }
}

// DELETE /admin/crm/contacts/:id/phones/:phoneId
export async function DELETE(
  req: MedusaRequest<unknown, Params>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const params = req.params as Params
  const masterId = params?.id
  const phoneId = params?.phoneId
  const admin = ADMIN_EMAIL_FALLBACK

  if (!masterId || !phoneId) {
    res.status(400).json({ ok: false, error: "id and phoneId required" })
    return
  }

  try {
    await pgConnection.transaction(async (trx) => {
      const existing = await trx("crm_master_phone")
        .where({ id: phoneId, master_id: masterId })
        .first()
      if (!existing) throw new Error("Phone not found")

      await clearPrimaryPhoneIfMatch(trx, masterId, phoneId)
      await trx("crm_master_phone").where({ id: phoneId }).delete()

      await trx("crm_master_audit_log").insert({
        master_id: masterId,
        action: "phone_removed",
        details: { phone_id: phoneId, phone: existing.phone_raw },
        source: "admin_ui",
        admin_email: admin,
      })
    })

    res.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message === "Phone not found" ? 404 : 500
    res.status(status).json({ ok: false, error: message })
  }
}
