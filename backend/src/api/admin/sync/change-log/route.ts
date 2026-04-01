import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/sync/change-log
// Query: run_id?, field?, limit=50, offset=0
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { run_id, field, limit = "50", offset = "0" } = req.query as Record<string, string>
  const pageLimit = Math.min(parseInt(limit) || 50, 200)
  const pageOffset = parseInt(offset) || 0

  // Run summaries (last 60 runs)
  const runs = await pgConnection.raw(`
    SELECT
      sync_run_id,
      MIN(synced_at) AS synced_at,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE changes ? 'legacy_price')::int AS price_changes,
      COUNT(*) FILTER (WHERE changes ? 'legacy_available')::int AS avail_changes,
      COUNT(*) FILTER (WHERE changes ? 'title')::int AS title_changes,
      COUNT(*) FILTER (WHERE changes ? 'coverImage')::int AS cover_changes,
      COUNT(*) FILTER (WHERE change_type = 'inserted')::int AS inserted
    FROM sync_change_log
    GROUP BY sync_run_id
    ORDER BY MIN(synced_at) DESC
    LIMIT 60
  `)

  // Build entries query
  let entriesQuery = pgConnection("sync_change_log as cl")
    .select(
      "cl.id",
      "cl.sync_run_id",
      "cl.synced_at",
      "cl.release_id",
      "cl.change_type",
      "cl.changes",
      "Release.title as release_title",
      "Artist.name as artist_name"
    )
    .leftJoin("Release", "Release.id", "cl.release_id")
    .leftJoin("Artist", "Artist.id", "Release.artistId")
    .orderBy("cl.synced_at", "desc")

  let countQuery = pgConnection("sync_change_log as cl")

  if (run_id) {
    entriesQuery = entriesQuery.where("cl.sync_run_id", run_id)
    countQuery = countQuery.where("cl.sync_run_id", run_id)
  }

  if (field && ["legacy_price", "legacy_available", "title", "coverImage"].includes(field)) {
    entriesQuery = entriesQuery.whereRaw("cl.changes \\? ?", [field])
    countQuery = countQuery.whereRaw("changes \\? ?", [field])
  }

  const [entries, [{ count: total }]] = await Promise.all([
    entriesQuery.limit(pageLimit).offset(pageOffset),
    countQuery.count("id as count"),
  ])

  res.json({
    runs: runs.rows,
    entries,
    total: parseInt(String(total)),
    limit: pageLimit,
    offset: pageOffset,
  })
}
