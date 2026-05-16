import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { isPrepareRunning } from "../../../lib/discogs-backfill"

/**
 * GET /admin/discogs-backfill
 *
 * Listet die Backfill-Kandidaten für das Review-Tool. Joined `Release` für die
 * current-Werte (für die current → proposed Tabelle). Filterbar per `?status=`
 * (Default `pending` = gefetcht, wartet auf Frank).
 *
 * Konzept: docs/optimizing/DISCOGS_BACKFILL_TOOL_KONZEPT.md
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const status = ((req.query.status as string) || "pending").trim()
  const validStatus = ["fetch_pending", "pending", "applied", "rejected", "error"]

  // Status-Counts (für die Tabs + Job-Progress)
  const countRows = await pg("discogs_backfill_candidate")
    .select("status")
    .count<{ status: string; count: string }[]>("* as count")
    .groupBy("status")
  const counts: Record<string, number> = {
    fetch_pending: 0, pending: 0, applied: 0, rejected: 0, error: 0, total: 0,
  }
  for (const row of countRows) {
    counts[row.status] = Number(row.count)
    counts.total += Number(row.count)
  }

  let candidates: any[] = []
  if (validStatus.includes(status)) {
    const rows = await pg("discogs_backfill_candidate as c")
      .leftJoin("Release as r", "r.id", "c.release_id")
      .leftJoin("Artist as a", "r.artistId", "a.id")
      .leftJoin(
        pg("Track").select("releaseId").count("* as cnt").groupBy("releaseId").as("t"),
        "t.releaseId",
        "c.release_id"
      )
      .where("c.status", status)
      .select(
        "c.release_id",
        "c.discogs_id",
        "c.status",
        "c.gaps",
        "c.proposed",
        "c.error",
        "c.fetched_at",
        "c.applied_at",
        "r.title",
        "r.coverImage",
        "r.catalogNumber",
        "r.genres",
        "r.styles",
        "r.credits",
        pg.raw('COALESCE("r".artist_display_name, "a".name) AS artist_name'),
        pg.raw('COALESCE("t".cnt, 0) AS track_count')
      )
      .orderBy("r.title", "asc")

    candidates = rows.map((row: any) => ({
      release_id: row.release_id,
      discogs_id: row.discogs_id,
      status: row.status,
      gaps: row.gaps || [],
      proposed: row.proposed || null,
      error: row.error || null,
      fetched_at: row.fetched_at,
      applied_at: row.applied_at,
      release: {
        title: row.title,
        artist_name: row.artist_name,
        catalog_number: row.catalogNumber,
        cover_image: row.coverImage,
        discogs_url: row.discogs_id ? `https://www.discogs.com/release/${row.discogs_id}` : null,
        current: {
          genres: Array.isArray(row.genres) ? row.genres : [],
          styles: Array.isArray(row.styles) ? row.styles : [],
          credits: row.credits || null,
          track_count: Number(row.track_count) || 0,
        },
      },
    }))
  }

  // F2 (Codex-Review 2026-05-16): job_running ist der ECHTE Worker-State, nicht
  // `fetch_pending > 0`. Sonst meldete GET nach einem Backend-Restart ewig
  // job_running=true (Rows offen, aber kein Worker) und die UI sperrte den
  // Resume-Button. `stalled` = es gibt offene Rows, aber kein laufender Worker
  // → die UI bietet „Resume" an.
  const running = isPrepareRunning()
  res.json({
    counts,
    job_running: running,
    stalled: !running && counts.fetch_pending > 0,
    status,
    candidates,
  })
}
