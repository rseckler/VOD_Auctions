import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

/**
 * PATCH /admin/erp/bridges/:id
 * Allowed fields: person_label, display_name, is_mobile, default_location_id, notes, is_active.
 * api_token_hash is managed by Stage C (pairing/rotation) — not patchable here.
 */
export async function PATCH(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params
  const body = req.body as Record<string, unknown> | undefined

  if (!body || Object.keys(body).length === 0) {
    res.status(400).json({ message: "No fields to update" })
    return
  }

  const ALLOWED = new Set(["person_label", "display_name", "is_mobile", "default_location_id", "notes", "is_active"])
  const updates: Record<string, unknown> = { updated_at: new Date() }
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED.has(k)) updates[k] = v
  }

  try {
    const count = await pg("bridge_host").where("id", id).update(updates)
    if (!count) {
      res.status(404).json({ message: "Bridge not found" })
      return
    }
    const bridge = await pg("bridge_host as b")
      .leftJoin("warehouse_location as wl", "b.default_location_id", "wl.id")
      .select(
        "b.*",
        "wl.code as default_location_code",
        "wl.name as default_location_name"
      )
      .where("b.id", id)
      .first()
    res.json({ bridge })
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to update bridge" })
  }
}

/**
 * DELETE /admin/erp/bridges/:id
 * Soft-disable: is_active=false + Token revoken. Hash bleibt zur Audit-Trail
 * in DB, Bridge kann mit altem Token aber nicht mehr authen.
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params
  try {
    const now = new Date()
    const count = await pg("bridge_host")
      .where("id", id)
      .update({
        is_active: false,
        api_token_revoked_at: now,
        updated_at: now,
      })
    if (!count) {
      res.status(404).json({ message: "Bridge not found" })
      return
    }
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to disable bridge" })
  }
}
