import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  ADMIN_EMAIL_FALLBACK,
  syncPrimaryPhone,
} from "../../../../../../lib/crm-master-edit"

type PhoneBody = {
  phone_raw?: string
  phone_type?: string | null
  is_primary?: boolean
}

// POST /admin/crm/contacts/:id/phones — Phone hinzufügen
export async function POST(
  req: MedusaRequest<PhoneBody, { id?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const masterId = (req.params as { id?: string })?.id
  const body = (req.body || {}) as PhoneBody
  const phoneRaw = (body.phone_raw || "").trim()
  const phoneType = body.phone_type ? String(body.phone_type).trim() : null
  const setPrimary = Boolean(body.is_primary)
  const admin = ADMIN_EMAIL_FALLBACK

  if (!masterId || !phoneRaw) {
    res.status(400).json({ ok: false, error: "phone_raw required" })
    return
  }

  try {
    const result = await pgConnection.transaction(async (trx) => {
      const master = await trx("crm_master_contact")
        .where({ id: masterId, deleted_at: null })
        .first()
      if (!master) throw new Error("Contact not found")

      const wantsPrimary = setPrimary || !master.primary_phone

      const [inserted] = await trx("crm_master_phone")
        .insert({
          master_id: masterId,
          phone_raw: phoneRaw,
          phone_type: phoneType,
          is_primary: wantsPrimary,
          source_count: 1,
          source_list: ["manual"],
        })
        .returning("*")

      if (wantsPrimary) {
        await syncPrimaryPhone(trx, masterId, inserted.id)
      }

      await trx("crm_master_audit_log").insert({
        master_id: masterId,
        action: "phone_added",
        details: { phone: phoneRaw, is_primary: wantsPrimary },
        source: "admin_ui",
        admin_email: admin,
      })

      return inserted
    })

    res.json({ phone: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message === "Contact not found" ? 404 : 500
    res.status(status).json({ ok: false, error: message })
  }
}
