import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { fetchDiscogsRelease, isPrepareRunning, setPrepareRunning } from "../../../../lib/discogs-backfill"

/**
 * POST /admin/discogs-backfill/prepare
 *
 * (1) Scan: ermittelt die Backfill-Kandidaten (verifiziert + discogs_id +
 *     mind. ein leeres Feld) und legt sie idempotent als `fetch_pending` an.
 * (2) Hintergrund-Job: zieht jede `fetch_pending`-Zeile von Discogs, füllt
 *     `proposed`, setzt `status='pending'`. Rate-limit 1,1 s/Call.
 *
 * HTTP-entkoppelt (memory feedback_http_lifecycle_background_tasks): die Route
 * returnt sofort 200, der Loop läuft danach weiter und schreibt in die DB; das
 * UI pollt GET /admin/discogs-backfill. Resume-fähig — ein erneuter Aufruf
 * verarbeitet übrig gebliebene `fetch_pending`-Zeilen.
 *
 * Konzept: docs/optimizing/DISCOGS_BACKFILL_TOOL_KONZEPT.md
 */

// F2 (Codex-Review 2026-05-16): Der prepareRunning-Guard lebt jetzt in
// lib/discogs-backfill.ts, damit die GET-Route den echten Worker-State lesen
// kann (vorher meldete GET fälschlich job_running anhand fetch_pending>0 —
// nach einem Backend-Restart hing das Tool dann unkündbar).
const RATE_LIMIT_MS = 1100

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  // ── (1) Scan — neue Kandidaten idempotent anlegen ──
  await pg.raw(`
    INSERT INTO discogs_backfill_candidate (id, release_id, discogs_id, gaps, status)
    SELECT
      'dbc_' || r.id, r.id, r.discogs_id,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN r.genres IS NULL OR cardinality(r.genres) = 0 THEN 'genres' END,
        CASE WHEN r.styles IS NULL OR cardinality(r.styles) = 0 THEN 'styles' END,
        CASE WHEN r.credits IS NULL OR r.credits = '' THEN 'credits' END,
        CASE WHEN COALESCE(t.cnt, 0) = 0 THEN 'tracklist' END
      ], NULL),
      'fetch_pending'
    FROM (
      SELECT DISTINCT release_id
      FROM erp_inventory_item
      WHERE last_stocktake_at IS NOT NULL
    ) vr
    JOIN "Release" r ON r.id = vr.release_id
    LEFT JOIN (
      SELECT "releaseId", COUNT(*) cnt FROM "Track" GROUP BY "releaseId"
    ) t ON t."releaseId" = r.id
    WHERE r.discogs_id IS NOT NULL
      AND (
        r.genres IS NULL OR cardinality(r.genres) = 0
        OR r.styles IS NULL OR cardinality(r.styles) = 0
        OR r.credits IS NULL OR r.credits = ''
        OR COALESCE(t.cnt, 0) = 0
      )
    ON CONFLICT (release_id) DO NOTHING
  `)

  const pendingRow = await pg("discogs_backfill_candidate")
    .where("status", "fetch_pending")
    .count<{ c: string }[]>("* as c")
    .first()
  const pendingCount = Number(pendingRow?.c || 0)

  if (isPrepareRunning()) {
    res.json({ message: "Fetch already running", job_running: true, fetch_pending: pendingCount })
    return
  }
  if (pendingCount === 0) {
    res.json({ message: "No candidates to fetch", job_running: false, fetch_pending: 0 })
    return
  }

  // ── (2) Hintergrund-Fetch — Route returnt sofort, Loop läuft entkoppelt ──
  setPrepareRunning(true)
  res.json({ message: "Scan done — fetch started", job_running: true, fetch_pending: pendingCount })

  void (async () => {
    try {
      // Eine Zeile pro Iteration frisch ziehen → resume-safe, kein stale state.
      for (;;) {
        const row = await pg("discogs_backfill_candidate")
          .where("status", "fetch_pending")
          .orderBy("created_at", "asc")
          .first()
        if (!row) break

        try {
          const proposed = await fetchDiscogsRelease(Number(row.discogs_id))
          await pg("discogs_backfill_candidate")
            .where("release_id", row.release_id)
            .update({
              status: "pending",
              proposed: JSON.stringify(proposed),
              fetched_at: new Date(),
              error: null,
              updated_at: new Date(),
            })
        } catch (e: any) {
          await pg("discogs_backfill_candidate")
            .where("release_id", row.release_id)
            .update({
              status: "error",
              error: String(e?.message || e).slice(0, 500),
              updated_at: new Date(),
            })
        }

        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS))
      }
    } catch (err: any) {
      console.error(
        JSON.stringify({ event: "discogs_backfill_prepare_crash", error: err?.message })
      )
    } finally {
      setPrepareRunning(false)
    }
  })().catch(() => {
    setPrepareRunning(false)
  })
}
