import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { Knex } from "knex"

// POST /admin/discogs-import/session/:id/cancel
// Sets cancel_requested=true. Running SSE routes poll this flag and abort cleanly.
// For commit in the middle of a transaction this triggers a rollback.

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const { id } = req.params as { id: string }
    const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

    const result = await pgConnection.raw(
      `UPDATE import_session
       SET cancel_requested = true, pause_requested = false, updated_at = NOW(), last_event_at = NOW()
       WHERE id = ? AND status NOT IN ('done')
       RETURNING id, status`,
      [id]
    )

    if (!result.rows?.length) {
      res.status(404).json({ error: "Session not found or already done" })
      return
    }

    // Emit a control event so log-panels see the cancel request
    await pgConnection.raw(
      `INSERT INTO import_event (session_id, phase, event_type, payload)
       VALUES (?, 'control', 'cancel_requested', '{}'::jsonb)`,
      [id]
    )

    res.json({ ok: true, id, cancelled: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Cancel failed"
    res.status(500).json({ error: msg })
  }
}
