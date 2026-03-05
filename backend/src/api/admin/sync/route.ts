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

  const [discogsStats, eligibleStats, lastLegacySync, lastDiscogsSync, recentLogs, monthlyAgg] =
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

      // Last legacy sync log
      pgConnection("sync_log")
        .where("sync_type", "legacy")
        .orderBy("sync_date", "desc")
        .first(),

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
    last_legacy_sync: lastLegacySync,
    last_discogs_sync: lastDiscogsSync,
    recent_logs: recentLogs,
    monthly_stats: monthlyAgg.map((r: any) => ({
      sync_type: r.sync_type,
      status: r.status,
      count: Number(r.count),
    })),
  })
}
