import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// ─── GET /admin/discogs-import/history ───────────────────────────────────────

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const pgConnection: Knex = req.scope.resolve(
      ContainerRegistrationKeys.PG_CONNECTION
    )

    // Check if table exists
    const tableCheck = await pgConnection.raw(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'import_log'
      ) as exists
    `)
    if (!tableCheck.rows[0]?.exists) {
      res.json({ runs: [] })
      return
    }

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

    res.json({ runs: result.rows })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch history"
    res.status(500).json({ error: msg })
  }
}
