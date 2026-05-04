import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

const ADMIN = "admin@vod-auctions.com"

// GET — Relationships für einen Master (entweder als person ODER company)
export async function GET(
  req: MedusaRequest<unknown, { id?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const id = (req.params as { id?: string })?.id
  if (!id) { res.status(400).json({ ok: false, error: "id required" }); return }
  try {
    // Master als Person (an Companies)
    const asPerson = await pgConnection("crm_master_relationship as r")
      .leftJoin("crm_master_contact as mc", "mc.id", "r.company_master_id")
      .where("r.person_master_id", id)
      .select(
        "r.*",
        "mc.display_name as other_name",
        "mc.contact_type as other_type",
      )
    // Master als Company (von Persons)
    const asCompany = await pgConnection("crm_master_relationship as r")
      .leftJoin("crm_master_contact as mc", "mc.id", "r.person_master_id")
      .where("r.company_master_id", id)
      .select(
        "r.*",
        "mc.display_name as other_name",
        "mc.contact_type as other_type",
      )
    res.json({ as_person: asPerson, as_company: asCompany })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

// POST — Relationship anlegen
type CreateBody = {
  other_master_id?: string
  direction?: "person_to_company" | "company_to_person"
  role?: string
  is_primary?: boolean
  started_at?: string
  ended_at?: string
}

export async function POST(
  req: MedusaRequest<CreateBody, { id?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const id = (req.params as { id?: string })?.id
  const body = (req.body || {}) as CreateBody
  if (!id || !body.other_master_id || !body.direction) {
    res.status(400).json({ ok: false, error: "id, other_master_id, direction required" })
    return
  }
  if (body.other_master_id === id) {
    res.status(400).json({ ok: false, error: "Cannot relate to self" })
    return
  }
  const personId = body.direction === "person_to_company" ? id : body.other_master_id
  const companyId = body.direction === "person_to_company" ? body.other_master_id : id
  try {
    const result = await pgConnection.transaction(async (trx) => {
      const [rel] = await trx("crm_master_relationship").insert({
        person_master_id: personId,
        company_master_id: companyId,
        role: body.role?.trim() || null,
        is_primary: Boolean(body.is_primary),
        started_at: body.started_at || null,
        ended_at: body.ended_at || null,
        created_by: ADMIN,
      }).returning("*")
      await trx("crm_master_audit_log").insert([
        { master_id: personId, action: "relationship_added", details: { with: companyId, role: body.role || null }, source: "admin_ui", admin_email: ADMIN },
        { master_id: companyId, action: "relationship_added", details: { with: personId, role: body.role || null }, source: "admin_ui", admin_email: ADMIN },
      ])
      return rel
    })
    res.json({ relationship: result })
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err)
    if (m.includes("duplicate") || m.includes("unique")) {
      res.status(409).json({ ok: false, error: "Relationship already exists" })
      return
    }
    res.status(500).json({ ok: false, error: m })
  }
}
