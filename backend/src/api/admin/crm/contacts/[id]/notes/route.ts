import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// POST /admin/crm/contacts/:id/notes — Note hinzufügen
export async function POST(
  req: MedusaRequest<{ body?: string; pinned?: boolean }, { id?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const masterId = (req.params as { id?: string })?.id
  const body = (req.body as { body?: string; pinned?: boolean })?.body?.trim()
  const pinned = Boolean((req.body as { pinned?: boolean })?.pinned)
  const author = (req as unknown as { auth_context?: { actor_id?: string } })
    .auth_context?.actor_id
    ? "admin"
    : "admin@vod-auctions.com"

  if (!masterId || !body) {
    res.status(400).json({ ok: false, error: "id and body required" })
    return
  }

  try {
    const master = await pgConnection("crm_master_contact")
      .where({ id: masterId, deleted_at: null })
      .first()
    if (!master) {
      res.status(404).json({ ok: false, error: "Contact not found" })
      return
    }

    const [note] = await pgConnection("crm_master_note")
      .insert({
        master_id: masterId,
        body,
        pinned,
        author_email: author,
      })
      .returning("*")

    await pgConnection("crm_master_audit_log").insert({
      master_id: masterId,
      action: "note_added",
      details: { note_id: note.id, body_preview: body.slice(0, 80) },
      source: "admin_ui",
      admin_email: author,
    })

    res.json({ note })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ ok: false, error: message })
  }
}
