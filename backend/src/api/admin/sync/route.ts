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

  const [discogsStats, lastLegacySync, lastDiscogsSync, recentLogs, monthlyAgg] =
    await Promise.all([
      // Discogs coverage
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
      with_discogs: Number(discogsStats?.with_discogs || 0),
      with_price: Number(discogsStats?.with_price || 0),
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
