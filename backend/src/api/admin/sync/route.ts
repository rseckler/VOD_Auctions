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

  // Compute actual new-image counts directly from the Image table — this
  // bypasses the flaky `new_images` field in sync_log.changes (which is
  // cumulative attempted-inserts due to ON CONFLICT DO NOTHING, not per-run
  // new rows). The Image.createdAt timestamp is set via NOW() during the
  // INSERT, so each row is attributable to the sync run that inserted it.
  //
  // We report TWO counts for the UI:
  //   - new_images_last_24h: all images created in the rolling 24h window.
  //     This is the "did anything happen recently" metric — usually what
  //     the admin wants to see at a glance.
  //   - new_images_last_7d: same but 7 days, for longer-term context.
  //
  // We deliberately do NOT report "images in the last run's window"
  // because the window is short (1h for hourly sync) and the answer is
  // almost always 0, which misleads the operator into thinking no activity
  // is happening when it is. See SYNC_ROBUSTNESS_PLAN.md lesson 3.2.
  const [img24h, img7d] = await Promise.all([
    pgConnection("Image")
      .count("* as count")
      .where(
        "createdAt",
        ">=",
        pgConnection.raw("NOW() - INTERVAL '24 hours'")
      )
      .first(),
    pgConnection("Image")
      .count("* as count")
      .where(
        "createdAt",
        ">=",
        pgConnection.raw("NOW() - INTERVAL '7 days'")
      )
      .first(),
  ])
  const newImagesLast24h = Number(img24h?.count ?? 0)
  const newImagesLast7d = Number(img7d?.count ?? 0)

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
          // Server-computed rolling-window image counts. Replaces the flaky
          // `new_images` field in sync_log.changes. See query comment above.
          new_images_last_24h: newImagesLast24h,
          new_images_last_7d: newImagesLast7d,
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
