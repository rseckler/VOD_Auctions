import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { Knex } from "knex"

// POST /admin/discogs-import/session/:id/resume
// Clears pause_requested. Running routes that were waiting will continue.

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const { id } = req.params as { id: string }
    const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

    const result = await pgConnection.raw(
      `UPDATE import_session
       SET pause_requested = false, updated_at = NOW(), last_event_at = NOW()
       WHERE id = ?
       RETURNING id, status`,
      [id]
    )

    if (!result.rows?.length) {
      res.status(404).json({ error: "Session not found" })
      return
    }

    await pgConnection.raw(
      `INSERT INTO import_event (session_id, phase, event_type, payload)
       VALUES (?, 'control', 'resume_requested', '{}'::jsonb)`,
      [id]
    )

    res.json({ ok: true, id, resumed: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Resume failed"
    res.status(500).json({ error: msg })
  }
}
