import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

const ADMIN = "admin@vod-auctions.com"

type Params = { id?: string }

type PatchBody = {
  name?: string
  description?: string | null
  query_json?: Record<string, unknown>
  icon?: string | null
  shared?: boolean
  is_pinned?: boolean
}

export async function PATCH(
  req: MedusaRequest<PatchBody, Params>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const id = (req.params as Params)?.id
  const payload = (req.body || {}) as PatchBody

  if (!id) {
    res.status(400).json({ ok: false, error: "id required" })
    return
  }

  try {
    const before = await pgConnection("crm_saved_filter").where({ id }).first()
    if (!before) {
      res.status(404).json({ ok: false, error: "Filter not found" })
      return
    }
    if (before.created_by !== ADMIN && before.created_by !== "system") {
      res.status(403).json({ ok: false, error: "Cannot edit other admin's filter" })
      return
    }
    if (before.created_by === "system") {
      res.status(403).json({ ok: false, error: "Cannot edit system filter" })
      return
    }

    const updates: Record<string, unknown> = {}
    if (typeof payload.name === "string" && payload.name.trim()) {
      updates.name = payload.name.trim()
    }
    if (payload.description !== undefined) {
      updates.description = payload.description ? String(payload.description).trim() : null
    }
    if (payload.query_json !== undefined) {
      updates.query_json = JSON.stringify(payload.query_json)
    }
    if (payload.icon !== undefined) {
      updates.icon = payload.icon ? String(payload.icon).trim() : null
    }
    if (typeof payload.shared === "boolean") updates.shared = payload.shared
    if (typeof payload.is_pinned === "boolean") updates.is_pinned = payload.is_pinned

    if (Object.keys(updates).length === 0) {
      res.json({ filter: before })
      return
    }

    const [after] = await pgConnection("crm_saved_filter")
      .where({ id })
      .update(updates)
      .returning("*")
    res.json({ filter: after })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

export async function DELETE(
  req: MedusaRequest<unknown, Params>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const id = (req.params as Params)?.id
  if (!id) {
    res.status(400).json({ ok: false, error: "id required" })
    return
  }
  try {
    const filter = await pgConnection("crm_saved_filter").where({ id }).first()
    if (!filter) {
      res.status(404).json({ ok: false, error: "Filter not found" })
      return
    }
    if (filter.created_by === "system") {
      res.status(403).json({ ok: false, error: "Cannot delete system filter" })
      return
    }
    if (filter.created_by !== ADMIN) {
      res.status(403).json({ ok: false, error: "Cannot delete other admin's filter" })
      return
    }
    await pgConnection("crm_saved_filter").where({ id }).delete()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
