import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/sync/discogs — Discogs sync details
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const [formatCoverage, priceStats, topValued, recentChanges, unscanned] =
    await Promise.all([
      // Coverage by format
      pgConnection("Release")
        .select("format")
        .count("id as total")
        .count(
          pgConnection.raw(
            "CASE WHEN discogs_id IS NOT NULL THEN 1 END as matched"
          )
        )
        .count(
          pgConnection.raw(
            "CASE WHEN discogs_lowest_price IS NOT NULL THEN 1 END as with_price"
          )
        )
        .groupBy("format")
        .orderBy("total", "desc"),

      // Price statistics
      pgConnection("Release")
        .select(
          pgConnection.raw(
            "MIN(discogs_lowest_price) as min_price"
          ),
          pgConnection.raw(
            "MAX(discogs_lowest_price) as max_price"
          ),
          pgConnection.raw(
            "AVG(discogs_lowest_price)::numeric(10,2) as avg_price"
          ),
          pgConnection.raw(
            "PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY discogs_lowest_price) as median_price"
          ),
          pgConnection.raw(
            "COUNT(discogs_lowest_price) as count"
          )
        )
        .whereNotNull("discogs_lowest_price")
        .first(),

      // Top 20 most valuable
      pgConnection("Release")
        .select(
          "Release.id",
          "Release.title",
          "Release.format",
          "Release.year",
          "Release.discogs_lowest_price",
          "Release.discogs_id",
          "Release.discogs_num_for_sale",
          "Artist.name as artist_name"
        )
        .leftJoin("Artist", "Release.artistId", "Artist.id")
        .whereNotNull("Release.discogs_lowest_price")
        .orderBy("Release.discogs_lowest_price", "desc")
        .limit(20),

      // Recent price changes (from sync_log)
      pgConnection("sync_log")
        .select(
          "sync_log.*",
          "Release.title as release_title",
          "Artist.name as artist_name"
        )
        .leftJoin("Release", "sync_log.release_id", "Release.id")
        .leftJoin("Artist", "Release.artistId", "Artist.id")
        .where("sync_log.sync_type", "discogs")
        .whereNotNull("sync_log.changes")
        .orderBy("sync_log.sync_date", "desc")
        .limit(20),

      // Unscanned by format
      pgConnection("Release")
        .select("format")
        .count("id as count")
        .whereNull("discogs_id")
        .whereNotIn("format", ["BOOK", "POSTER", "ZINE"])
        .groupBy("format")
        .orderBy("count", "desc"),
    ])

  res.json({
    format_coverage: formatCoverage.map((f: any) => ({
      format: f.format,
      total: Number(f.total),
      matched: Number(f.matched),
      with_price: Number(f.with_price),
      match_rate:
        f.total > 0
          ? Math.round((Number(f.matched) / Number(f.total)) * 100)
          : 0,
    })),
    price_stats: priceStats
      ? {
          min: Number(priceStats.min_price),
          max: Number(priceStats.max_price),
          avg: Number(priceStats.avg_price),
          median: Number(priceStats.median_price),
          count: Number(priceStats.count),
        }
      : null,
    top_valued: topValued,
    recent_changes: recentChanges,
    unscanned: unscanned.map((f: any) => ({
      format: f.format,
      count: Number(f.count),
    })),
  })
}
