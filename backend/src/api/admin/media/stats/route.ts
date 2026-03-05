import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/media/stats — Dashboard statistics
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const [total, withDiscogs, withPrice, syncDates, formats, priceStats, categories] =
    await Promise.all([
      pgConnection("Release").count("id as count").first(),
      pgConnection("Release")
        .count("id as count")
        .whereNotNull("discogs_id")
        .first(),
      pgConnection("Release")
        .count("id as count")
        .whereNotNull("discogs_lowest_price")
        .first(),
      pgConnection("Release")
        .select(
          pgConnection.raw(
            "MAX(discogs_last_synced) as last_discogs_sync"
          ),
          pgConnection.raw(
            "MAX(legacy_last_synced) as last_legacy_sync"
          )
        )
        .first(),
      pgConnection("Release")
        .select("format")
        .count("id as count")
        .groupBy("format")
        .orderBy("count", "desc"),
      pgConnection("Release")
        .select(
          pgConnection.raw(
            "MIN(discogs_lowest_price) as min_price"
          ),
          pgConnection.raw(
            "MAX(discogs_lowest_price) as max_price"
          ),
          pgConnection.raw(
            "AVG(discogs_lowest_price) as avg_price"
          ),
          pgConnection.raw(
            "PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY discogs_lowest_price) as median_price"
          )
        )
        .whereNotNull("discogs_lowest_price")
        .first(),
      pgConnection("Release")
        .select(
          pgConnection.raw(`
            CASE
              WHEN "Release".product_category = 'release' AND "Format".kat = 1 THEN 'tapes'
              WHEN "Release".product_category = 'release' AND "Format".kat = 2 THEN 'vinyl'
              WHEN "Release".product_category = 'band_literature' THEN 'band_literature'
              WHEN "Release".product_category = 'label_literature' THEN 'label_literature'
              WHEN "Release".product_category = 'press_literature' THEN 'press_literature'
              ELSE 'other'
            END as category
          `)
        )
        .count("Release.id as count")
        .leftJoin("Format", "Release.format_id", "Format.id")
        .groupBy("category")
        .orderBy("count", "desc"),
    ])

  res.json({
    total: Number(total?.count || 0),
    with_discogs: Number(withDiscogs?.count || 0),
    with_price: Number(withPrice?.count || 0),
    last_discogs_sync: syncDates?.last_discogs_sync,
    last_legacy_sync: syncDates?.last_legacy_sync,
    formats: formats.map((f: any) => ({
      value: f.format,
      count: Number(f.count),
    })),
    categories: categories.map((c: any) => ({
      value: c.category,
      count: Number(c.count),
    })),
    price_stats: priceStats
      ? {
          min: Number(priceStats.min_price),
          max: Number(priceStats.max_price),
          avg: Number(priceStats.avg_price),
          median: Number(priceStats.median_price),
        }
      : null,
  })
}
