import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  ADMIN_EMAIL_FALLBACK,
  clearPrimaryAddressIfMatch,
  syncPrimaryAddress,
} from "../../../../../../../lib/crm-master-edit"

type Params = { id?: string; addressId?: string }

type AddressBody = {
  type?: string | null
  salutation?: string | null
  title?: string | null
  company?: string | null
  first_name?: string | null
  last_name?: string | null
  street?: string | null
  street_2?: string | null
  postal_code?: string | null
  city?: string | null
  region?: string | null
  country?: string | null
  country_code?: string | null
  is_primary?: boolean
}

const STR_FIELDS: (keyof AddressBody)[] = [
  "type", "salutation", "title", "company",
  "first_name", "last_name",
  "street", "street_2", "postal_code", "city", "region",
  "country", "country_code",
]

// PATCH /admin/crm/contacts/:id/addresses/:addressId
export async function PATCH(
  req: MedusaRequest<AddressBody, Params>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const params = req.params as Params
  const masterId = params?.id
  const addressId = params?.addressId
  const payload = (req.body || {}) as AddressBody
  const admin = ADMIN_EMAIL_FALLBACK

  if (!masterId || !addressId) {
    res.status(400).json({ ok: false, error: "id and addressId required" })
    return
  }

  try {
    const result = await pgConnection.transaction(async (trx) => {
      const before = await trx("crm_master_address")
        .where({ id: addressId, master_id: masterId })
        .first()
      if (!before) throw new Error("Address not found")

      const updates: Record<string, unknown> = {}
      const fieldsChanged: string[] = []

      for (const f of STR_FIELDS) {
        if (payload[f] !== undefined) {
          const v = typeof payload[f] === "string"
            ? (payload[f] as string).trim() || null
            : payload[f]
          if (v !== before[f]) {
            updates[f as string] = v
            fieldsChanged.push(f as string)
          }
        }
      }
      if (typeof payload.is_primary === "boolean" && payload.is_primary !== before.is_primary) {
        updates.is_primary = payload.is_primary
        fieldsChanged.push("is_primary")
      }

      if (Object.keys(updates).length === 0) return before

      const [after] = await trx("crm_master_address")
        .where({ id: addressId })
        .update(updates)
        .returning("*")

      if (updates.is_primary === true) {
        await syncPrimaryAddress(trx, masterId, addressId)
      }

      const audits: Array<Record<string, unknown>> = [{
        master_id: masterId,
        action: "address_updated",
        details: { address_id: addressId, fields_changed: fieldsChanged },
        source: "admin_ui",
        admin_email: admin,
      }]
      if (fieldsChanged.includes("is_primary") && updates.is_primary === true) {
        audits.push({
          master_id: masterId,
          action: "address_primary_changed",
          details: { address_id: addressId },
          source: "admin_ui",
          admin_email: admin,
        })
      }
      await trx("crm_master_audit_log").insert(audits)

      return after
    })

    res.json({ address: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message === "Address not found" ? 404 : 500
    res.status(status).json({ ok: false, error: message })
  }
}

// DELETE /admin/crm/contacts/:id/addresses/:addressId
export async function DELETE(
  req: MedusaRequest<unknown, Params>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const params = req.params as Params
  const masterId = params?.id
  const addressId = params?.addressId
  const admin = ADMIN_EMAIL_FALLBACK

  if (!masterId || !addressId) {
    res.status(400).json({ ok: false, error: "id and addressId required" })
    return
  }

  try {
    await pgConnection.transaction(async (trx) => {
      const existing = await trx("crm_master_address")
        .where({ id: addressId, master_id: masterId })
        .first()
      if (!existing) throw new Error("Address not found")

      await clearPrimaryAddressIfMatch(trx, masterId, addressId)
      await trx("crm_master_address").where({ id: addressId }).delete()

      await trx("crm_master_audit_log").insert({
        master_id: masterId,
        action: "address_removed",
        details: { address_id: addressId },
        source: "admin_ui",
        admin_email: admin,
      })
    })

    res.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message === "Address not found" ? 404 : 500
    res.status(status).json({ ok: false, error: message })
  }
}
