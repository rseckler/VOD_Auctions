import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// PATCH /admin/crm/contacts/:id/notes/:noteId — Note ändern (body, pinned)
export async function PATCH(
  req: MedusaRequest<{ body?: string; pinned?: boolean }, { id?: string; noteId?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const params = req.params as { id?: string; noteId?: string }
  const masterId = params?.id
  const noteId = params?.noteId
  const payload = req.body as { body?: string; pinned?: boolean }
  const author = "admin@vod-auctions.com"

  if (!masterId || !noteId) {
    res.status(400).json({ ok: false, error: "id and noteId required" })
    return
  }

  try {
    const note = await pgConnection("crm_master_note")
      .where({ id: noteId, master_id: masterId, deleted_at: null })
      .first()
    if (!note) {
      res.status(404).json({ ok: false, error: "Note not found" })
      return
    }

    const updates: Record<string, unknown> = {}
    if (typeof payload.body === "string") updates.body = payload.body.trim()
    if (typeof payload.pinned === "boolean") updates.pinned = payload.pinned

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ ok: false, error: "no fields to update" })
      return
    }

    const [updated] = await pgConnection("crm_master_note")
      .where({ id: noteId })
      .update(updates)
      .returning("*")

    await pgConnection("crm_master_audit_log").insert({
      master_id: masterId,
      action: "note_updated",
      details: { note_id: noteId, fields: Object.keys(updates) },
      source: "admin_ui",
      admin_email: author,
    })

    res.json({ note: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ ok: false, error: message })
  }
}

// DELETE /admin/crm/contacts/:id/notes/:noteId — soft-delete
export async function DELETE(
  req: MedusaRequest<unknown, { id?: string; noteId?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const params = req.params as { id?: string; noteId?: string }
  const masterId = params?.id
  const noteId = params?.noteId
  const author = "admin@vod-auctions.com"

  if (!masterId || !noteId) {
    res.status(400).json({ ok: false, error: "id and noteId required" })
    return
  }

  try {
    const updated = await pgConnection("crm_master_note")
      .where({ id: noteId, master_id: masterId, deleted_at: null })
      .update({ deleted_at: pgConnection.fn.now() })

    if (updated === 0) {
      res.status(404).json({ ok: false, error: "Note not found" })
      return
    }

    await pgConnection("crm_master_audit_log").insert({
      master_id: masterId,
      action: "note_deleted",
      details: { note_id: noteId },
      source: "admin_ui",
      admin_email: author,
    })

    res.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ ok: false, error: message })
  }
}
