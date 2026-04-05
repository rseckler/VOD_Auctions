import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/sync — Sync dashboard overview data
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const [discogsStats, eligibleStats, lastTwoLegacySyncs, lastDiscogsSync, recentLogs, monthlyAgg] =
    await Promise.all([
      // Total + Discogs coverage (all releases)
      pgConnection("Release")
        .select(
          pgConnection.raw("COUNT(*) as total"),
          pgConnection.raw("COUNT(discogs_id) as with_discogs"),
          pgConnection.raw(
            "COUNT(discogs_lowest_price) as with_price"
          ),
          pgConnection.raw(
            "MAX(discogs_last_synced) as last_discogs_sync"
          ),
          pgConnection.raw(
            "MAX(legacy_last_synced) as last_legacy_sync"
          )
        )
        .first(),

      // Eligible music releases (excluding literature/merchandise)
      pgConnection("Release")
        .select(
          pgConnection.raw("COUNT(*) as eligible"),
          pgConnection.raw("COUNT(discogs_id) as eligible_matched"),
          pgConnection.raw("COUNT(discogs_lowest_price) as eligible_with_price")
        )
        .where("product_category", "release")
        .first(),

      // Last TWO legacy sync logs — we need both the current and the previous
      // run's sync_date to compute the exact time-window of the last run.
      // Images inserted BETWEEN (prev.sync_date, current.sync_date] are the
      // ones picked up by the last sync run.
      pgConnection("sync_log")
        .where("sync_type", "legacy")
        .orderBy("sync_date", "desc")
        .limit(2),

      // Last discogs sync log
      pgConnection("sync_log")
        .where("sync_type", "discogs")
        .orderBy("sync_date", "desc")
        .first(),

      // Recent 50 logs
      pgConnection("sync_log")
        .select("sync_log.*")
        .orderBy("sync_date", "desc")
        .limit(50),

      // Monthly aggregation
      pgConnection("sync_log")
        .select("sync_type", "status")
        .count("id as count")
        .where(
          "sync_date",
          ">=",
          pgConnection.raw("NOW() - INTERVAL '30 days'")
        )
        .groupBy("sync_type", "status"),
    ])

  const lastLegacySync = lastTwoLegacySyncs[0] || null
  const prevLegacySync = lastTwoLegacySyncs[1] || null

  // Compute ACTUAL new-image count for the last legacy sync run by querying
  // the Image table directly for the time window [prev_sync.sync_date, last_sync.sync_date].
  // This bypasses the flaky `new_images` field in sync_log.changes (which is
  // cumulative "attempted inserts" due to ON CONFLICT DO NOTHING — not actual
  // new rows). The Image.createdAt timestamp is set via NOW() during the
  // INSERT, so it uniquely identifies the sync run that inserted the row.
  let newImagesInLastRun: number | null = null
  if (lastLegacySync?.sync_date) {
    const windowEnd = lastLegacySync.sync_date
    const windowStart = prevLegacySync?.sync_date ?? null
    const imgQuery = pgConnection("Image").count("* as count").where(
      "createdAt",
      "<=",
      windowEnd
    )
    if (windowStart) {
      imgQuery.where("createdAt", ">", windowStart)
    } else {
      // No previous run — use a 2h window before last sync as a reasonable floor
      imgQuery.where(
        "createdAt",
        ">",
        pgConnection.raw("? - INTERVAL '2 hours'", [windowEnd])
      )
    }
    const imgResult = await imgQuery.first()
    newImagesInLastRun = Number(imgResult?.count ?? 0)
  }

  res.json({
    overview: {
      total: Number(discogsStats?.total || 0),
      eligible: Number(eligibleStats?.eligible || 0),
      with_discogs: Number(discogsStats?.with_discogs || 0),
      eligible_matched: Number(eligibleStats?.eligible_matched || 0),
      with_price: Number(discogsStats?.with_price || 0),
      eligible_with_price: Number(eligibleStats?.eligible_with_price || 0),
      last_discogs_sync: discogsStats?.last_discogs_sync,
      last_legacy_sync: discogsStats?.last_legacy_sync,
    },
    last_legacy_sync: lastLegacySync
      ? {
          ...lastLegacySync,
          // Computed server-side: actual new-image count in the last run's
          // time window. Replaces the flaky `new_images` field from
          // sync_log.changes. See query comment above for rationale.
          new_images_actual: newImagesInLastRun,
        }
      : null,
    last_discogs_sync: lastDiscogsSync,
    recent_logs: recentLogs,
    monthly_stats: monthlyAgg.map((r: any) => ({
      sync_type: r.sync_type,
      status: r.status,
      count: Number(r.count),
    })),
  })
}
