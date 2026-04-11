import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// ─── GET /admin/discogs-import/history ───────────────────────────────────────

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    const { run_id } = req.query as { run_id?: string }

    // Drill-down: specific run details (import_log entries + import_event timeline)
    if (run_id) {
      const details = await pgConnection.raw(
        `SELECT id, release_id, discogs_id, action, data_snapshot, created_at
         FROM import_log WHERE run_id = ? ORDER BY created_at`,
        [run_id]
      )
      // Find session for this run and fetch its event timeline
      const sessionLookup = await pgConnection.raw(
        `SELECT id FROM import_session WHERE run_id = ? LIMIT 1`,
        [run_id]
      )
      let events: unknown[] = []
      const sessionId = sessionLookup.rows?.[0]?.id
      if (sessionId) {
        const eventsResult = await pgConnection.raw(
          `SELECT id, phase, event_type, payload, created_at
           FROM import_event WHERE session_id = ? ORDER BY id ASC LIMIT 1000`,
          [sessionId]
        )
        events = eventsResult.rows || []
      }
      res.json({ entries: details.rows || [], events, session_id: sessionId || null })
      return
    }

    // Check if import_log table exists
    const tableCheck = await pgConnection.raw(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'import_log'
      ) as exists
    `)

    let runs: unknown[] = []
    let stats: Record<string, unknown> | null = null
    if (tableCheck.rows[0]?.exists) {
      // Parallel queries: list + aggregate stats
      const [result, statsResult] = await Promise.all([
        pgConnection.raw(`
          SELECT
            il.run_id,
            il.collection_name,
            il.import_source,
            MIN(il.created_at) as started_at,
            MAX(il.created_at) as ended_at,
            COUNT(*)::int as total,
            COUNT(*) FILTER (WHERE il.action = 'inserted')::int as inserted,
            COUNT(*) FILTER (WHERE il.action = 'linked')::int as linked,
            COUNT(*) FILTER (WHERE il.action = 'updated')::int as updated,
            COUNT(*) FILTER (WHERE il.action = 'skipped')::int as skipped,
            s.status as session_status,
            s.id as session_id,
            s.row_count,
            s.unique_count,
            s.import_settings
          FROM import_log il
          LEFT JOIN import_session s ON s.run_id = il.run_id
          WHERE il.import_type = 'discogs_collection'
          GROUP BY il.run_id, il.collection_name, il.import_source,
                   s.status, s.id, s.row_count, s.unique_count, s.import_settings
          ORDER BY MIN(il.created_at) DESC
          LIMIT 100
        `),
        pgConnection.raw(`
          SELECT
            COUNT(DISTINCT run_id)::int as total_runs,
            COUNT(*)::int as total_releases,
            COUNT(*) FILTER (WHERE action = 'inserted')::int as total_inserted,
            COUNT(*) FILTER (WHERE action = 'linked')::int as total_linked,
            COUNT(*) FILTER (WHERE action = 'updated')::int as total_updated,
            MAX(created_at) as last_import_at
          FROM import_log WHERE import_type = 'discogs_collection'
        `),
      ])
      runs = result.rows
      stats = statsResult.rows?.[0] || null
    }

    // Active/in-progress sessions
    //
    // Filter rules (see DISCOGS_COLLECTIONS_OVERVIEW_PLAN §Stale Sessions):
    // - Exclude terminal states: done, abandoned, error
    // - Exclude stale sessions (created > 6h ago) — these are almost
    //   certainly zombie sessions from a server restart mid-SSE. The live
    //   SSE connection is dead, the loop is not running; showing them as
    //   "resumable" is misleading.
    // - The 6h threshold is generous (normal fetch takes 1-2h for 5k releases)
    //   but short enough to auto-clean up after crashes without manual DB work.
    const activeSessions = await pgConnection.raw(`
      SELECT id, collection_name, filename, status, row_count, unique_count,
             fetch_progress, created_at, updated_at
      FROM import_session
      WHERE status NOT IN ('done', 'abandoned', 'error')
        AND created_at > NOW() - INTERVAL '6 hours'
      ORDER BY created_at DESC
      LIMIT 10
    `)

    res.json({
      stats,
      runs,
      active_sessions: activeSessions.rows || [],
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch history"
    res.status(500).json({ error: msg })
  }
}
