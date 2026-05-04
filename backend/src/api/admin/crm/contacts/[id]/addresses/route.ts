import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  ADMIN_EMAIL_FALLBACK,
  syncPrimaryAddress,
} from "../../../../../../lib/crm-master-edit"

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

function pickAddrFields(body: AddressBody): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of STR_FIELDS) {
    if (body[f] !== undefined) {
      const v = body[f]
      out[f as string] = typeof v === "string" ? v.trim() || null : v
    }
  }
  return out
}

// POST /admin/crm/contacts/:id/addresses — Address hinzufügen
export async function POST(
  req: MedusaRequest<AddressBody, { id?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const masterId = (req.params as { id?: string })?.id
  const body = (req.body || {}) as AddressBody
  const admin = ADMIN_EMAIL_FALLBACK

  if (!masterId) {
    res.status(400).json({ ok: false, error: "id required" })
    return
  }

  try {
    const result = await pgConnection.transaction(async (trx) => {
      const master = await trx("crm_master_contact")
        .where({ id: masterId, deleted_at: null })
        .first()
      if (!master) throw new Error("Contact not found")

      const fields = pickAddrFields(body)
      const setPrimary = Boolean(body.is_primary) || !master.primary_postal_code

      const [inserted] = await trx("crm_master_address")
        .insert({
          ...fields,
          master_id: masterId,
          is_primary: setPrimary,
          source_count: 1,
          source_list: ["manual"],
        })
        .returning("*")

      if (setPrimary) {
        await syncPrimaryAddress(trx, masterId, inserted.id)
      }

      await trx("crm_master_audit_log").insert({
        master_id: masterId,
        action: "address_added",
        details: { address_id: inserted.id, is_primary: setPrimary },
        source: "admin_ui",
        admin_email: admin,
      })

      return inserted
    })

    res.json({ address: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message === "Contact not found" ? 404 : 500
    res.status(status).json({ ok: false, error: message })
  }
}
