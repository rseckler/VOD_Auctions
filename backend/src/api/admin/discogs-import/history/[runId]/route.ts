import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/discogs-import/history/:runId — detail view of one import run
// Returns: run metadata, aggregated stats, all releases with live DB state, event timeline
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { runId } = req.params as { runId: string }

  if (!runId || typeof runId !== "string") {
    res.status(400).json({ error: "runId required" })
    return
  }

  try {
    // (A) Run metadata + session — single row
    const runResult = await pgConnection.raw(
      `
      SELECT
        il.run_id,
        il.collection_name,
        il.import_source,
        (SELECT MIN(created_at) FROM import_log WHERE run_id = il.run_id) as started_at,
        (SELECT MAX(created_at) FROM import_log WHERE run_id = il.run_id) as ended_at,
        s.id as session_id,
        s.status as session_status,
        s.row_count,
        s.unique_count,
        s.format_detected,
        s.export_type,
        s.import_settings,
        s.filename
      FROM import_log il
      LEFT JOIN import_session s ON s.run_id = il.run_id
      WHERE il.run_id = ? AND il.import_type = 'discogs_collection'
      LIMIT 1
      `,
      [runId]
    )

    if (!runResult.rows?.[0]) {
      res.status(404).json({ error: "Run not found" })
      return
    }

    const run = runResult.rows[0]
    const sessionId = run.session_id as string | null

    // (B), (C), (D) Parallel: releases + stats + events
    const [releasesResult, statsResult, eventsResult] = await Promise.all([
      pgConnection.raw(
        `
        SELECT
          il.id as log_id,
          il.action,
          il.discogs_id,
          il.release_id,
          il.data_snapshot,
          il.created_at as logged_at,
          r.slug,
          r.title as current_title,
          r.format,
          r.year,
          r.country,
          r."coverImage",
          r.legacy_price,
          r.legacy_available,
          r.legacy_condition,
          r.sale_mode,
          r.direct_price,
          r.auction_status,
          a.name as artist_name,
          a.slug as artist_slug,
          l.name as label_name
        FROM import_log il
        LEFT JOIN "Release" r ON r.id = il.release_id
        LEFT JOIN "Artist" a ON a.id = r."artistId"
        LEFT JOIN "Label" l ON l.id = r."labelId"
        WHERE il.run_id = ? AND il.import_type = 'discogs_collection'
        ORDER BY il.created_at, il.id
        `,
        [runId]
      ),
      pgConnection.raw(
        `
        SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE il.action = 'inserted')::int as inserted,
          COUNT(*) FILTER (WHERE il.action = 'linked')::int as linked,
          COUNT(*) FILTER (WHERE il.action = 'updated')::int as updated,
          COUNT(*) FILTER (WHERE il.action = 'skipped')::int as skipped,
          COUNT(*) FILTER (WHERE r."coverImage" IS NOT NULL)::int as visible_now,
          COUNT(*) FILTER (WHERE r.legacy_price > 0 AND r.legacy_available = true)::int as purchasable_now,
          COUNT(*) FILTER (WHERE r.legacy_available = false)::int as unavailable_now
        FROM import_log il
        LEFT JOIN "Release" r ON r.id = il.release_id
        WHERE il.run_id = ? AND il.import_type = 'discogs_collection'
        `,
        [runId]
      ),
      sessionId
        ? pgConnection.raw(
            `
            SELECT id, phase, event_type, payload, created_at
            FROM import_event
            WHERE session_id = ?
            ORDER BY id ASC
            LIMIT 2000
            `,
            [sessionId]
          )
        : Promise.resolve({ rows: [] as unknown[] }),
    ])

    res.json({
      run,
      stats: statsResult.rows?.[0] || null,
      releases: releasesResult.rows || [],
      events: eventsResult.rows || [],
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch run detail"
    console.error("[discogs-import/history/:runId] Error:", err)
    res.status(500).json({ error: msg })
  }
}
