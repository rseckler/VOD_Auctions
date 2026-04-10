import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { Knex } from "knex"

// ─── GET /admin/discogs-import/session/:id/status ───────────────────────────
// Returns the full session state including progress fields and recent events.
// Used by the frontend for:
//   - Resume detection on page load
//   - Polling fallback when SSE connection drops
//   - History drill-down (reading import_event timeline)

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const { id } = req.params as { id: string }
    if (!id) {
      res.status(400).json({ error: "Missing session id" })
      return
    }

    const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

    const sessionResult = await pgConnection.raw(
      `SELECT
         id, collection_name, filename, row_count, unique_count,
         format_detected, export_type, status,
         parse_progress, fetch_progress, analyze_progress, commit_progress,
         cancel_requested, pause_requested,
         last_event_at, last_error, run_id, error_message,
         created_at, updated_at
       FROM import_session WHERE id = ?`,
      [id]
    )
    const session = sessionResult.rows?.[0]
    if (!session) {
      res.status(404).json({ error: "Session not found" })
      return
    }

    // Load recent events (last 100 for live log)
    const eventLimit = parseInt((req.query.limit as string) || "100", 10)
    const sinceId = req.query.since_id ? parseInt(req.query.since_id as string, 10) : null
    const eventsResult = await pgConnection.raw(
      `SELECT id, phase, event_type, payload, created_at
       FROM import_event
       WHERE session_id = ?
         ${sinceId ? "AND id > ?" : ""}
       ORDER BY id ${sinceId ? "ASC" : "DESC"}
       LIMIT ?`,
      sinceId ? [id, sinceId, eventLimit] : [id, eventLimit]
    )
    // Return events in chronological order
    const events = sinceId
      ? eventsResult.rows || []
      : (eventsResult.rows || []).reverse()

    res.json({
      session,
      events,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load session status"
    res.status(500).json({ error: msg })
  }
}
