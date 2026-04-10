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

    // Drill-down: specific run details
    if (run_id) {
      const details = await pgConnection.raw(
        `SELECT id, release_id, discogs_id, action, data_snapshot, created_at
         FROM import_log WHERE run_id = ? ORDER BY created_at`,
        [run_id]
      )
      res.json({ entries: details.rows || [] })
      return
    }

    // Check if import_log table exists
    const tableCheck = await pgConnection.raw(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'import_log'
      ) as exists
    `)

    let runs: unknown[] = []
    if (tableCheck.rows[0]?.exists) {
      const result = await pgConnection.raw(`
        SELECT
          run_id,
          collection_name,
          import_source,
          MIN(created_at) as started_at,
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE action = 'inserted')::int as inserted,
          COUNT(*) FILTER (WHERE action = 'linked')::int as linked,
          COUNT(*) FILTER (WHERE action = 'updated')::int as updated,
          COUNT(*) FILTER (WHERE action = 'skipped')::int as skipped
        FROM import_log
        WHERE import_type = 'discogs_collection'
        GROUP BY run_id, collection_name, import_source
        ORDER BY MIN(created_at) DESC
        LIMIT 50
      `)
      runs = result.rows
    }

    // Active/in-progress sessions
    const activeSessions = await pgConnection.raw(`
      SELECT id, collection_name, filename, status, row_count, unique_count,
             fetch_progress, created_at, updated_at
      FROM import_session
      WHERE status NOT IN ('done')
      ORDER BY created_at DESC
      LIMIT 10
    `)

    res.json({
      runs,
      active_sessions: activeSessions.rows || [],
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch history"
    res.status(500).json({ error: msg })
  }
}
