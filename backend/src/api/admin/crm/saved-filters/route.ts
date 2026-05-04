import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

const ADMIN = "admin@vod-auctions.com"

// GET /admin/crm/saved-filters — eigene + shared (system + andere)
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  try {
    const filters = await pgConnection("crm_saved_filter")
      .where(function () {
        this.where("created_by", ADMIN).orWhere("shared", true)
      })
      .orderBy("is_pinned", "desc")
      .orderBy("name", "asc")
    res.json({ filters })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

// POST /admin/crm/saved-filters — neuen Filter speichern
type CreateBody = {
  name?: string
  description?: string
  query_json?: Record<string, unknown>
  icon?: string
  shared?: boolean
  is_pinned?: boolean
}

export async function POST(
  req: MedusaRequest<CreateBody>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const body = (req.body || {}) as CreateBody
  const name = (body.name || "").trim()
  if (!name || !body.query_json) {
    res.status(400).json({ ok: false, error: "name and query_json required" })
    return
  }
  try {
    const [filter] = await pgConnection("crm_saved_filter")
      .insert({
        name,
        description: body.description?.trim() || null,
        query_json: JSON.stringify(body.query_json),
        icon: body.icon?.trim() || null,
        shared: Boolean(body.shared),
        is_pinned: Boolean(body.is_pinned),
        created_by: ADMIN,
      })
      .returning("*")
    res.json({ filter })
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err)
    if (m.includes("duplicate") || m.includes("unique")) {
      res.status(409).json({ ok: false, error: "Filter name already exists" })
      return
    }
    res.status(500).json({ ok: false, error: m })
  }
}
