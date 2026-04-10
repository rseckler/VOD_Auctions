import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { Knex } from "knex"

// POST /admin/discogs-import/session/:id/pause
// Sets pause_requested=true. Running SSE routes poll this and wait until
// pause_requested is cleared (via /resume) or cancel is requested.

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const { id } = req.params as { id: string }
    const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

    const result = await pgConnection.raw(
      `UPDATE import_session
       SET pause_requested = true, updated_at = NOW(), last_event_at = NOW()
       WHERE id = ? AND status IN ('fetching', 'analyzing', 'importing')
       RETURNING id, status`,
      [id]
    )

    if (!result.rows?.length) {
      res.status(404).json({ error: "Session not found or not in a pausable state" })
      return
    }

    await pgConnection.raw(
      `INSERT INTO import_event (session_id, phase, event_type, payload)
       VALUES (?, 'control', 'pause_requested', '{}'::jsonb)`,
      [id]
    )

    res.json({ ok: true, id, paused: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Pause failed"
    res.status(500).json({ error: msg })
  }
}
