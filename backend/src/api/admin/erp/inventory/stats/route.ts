import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../lib/inventory"

/**
 * GET /admin/erp/inventory/stats
 * Aggregated stocktake statistics for the Inventory Hub page.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const [counts, todayStats, formatBreakdown, bulkLog] = await Promise.all([
    // Stocktake progress counts (Exemplar-level)
    pg.raw(`
      SELECT
        COUNT(*) AS eligible,
        COUNT(DISTINCT ii.release_id) AS distinct_releases,
        COUNT(*) FILTER (
          WHERE ii.last_stocktake_at IS NOT NULL AND ii.price_locked = true
        ) AS verified,
        COUNT(*) FILTER (
          WHERE ii.last_stocktake_at IS NOT NULL AND ii.price_locked = true
            AND r.legacy_price = 0
        ) AS missing,
        COUNT(*) FILTER (
          WHERE ii.last_stocktake_at IS NULL
        ) AS remaining,
        COUNT(*) FILTER (WHERE ii.copy_number > 1) AS additional_copies,
        COALESCE(AVG(COALESCE(ii.exemplar_price, r.legacy_price)) FILTER (
          WHERE ii.last_stocktake_at IS NOT NULL
        ), 0) AS avg_verified_price
      FROM erp_inventory_item ii
      JOIN "Release" r ON r.id = ii.release_id
      WHERE ii.source = 'frank_collection'
    `),

    // Today's activity
    pg.raw(`
      SELECT
        COUNT(*) FILTER (
          WHERE ii.last_stocktake_at >= CURRENT_DATE
        ) AS today_verified,
        COUNT(*) FILTER (
          WHERE ii.copy_number > 1 AND ii.created_at >= CURRENT_DATE
        ) AS today_copies_added,
        COUNT(*) FILTER (
          WHERE ii.exemplar_price IS NOT NULL AND ii.last_stocktake_at >= CURRENT_DATE
        ) AS today_price_changed
      FROM erp_inventory_item ii
      WHERE ii.source = 'frank_collection'
    `),

    // Format breakdown
    pg.raw(`
      SELECT
        CASE
          WHEN r.format = 'LP' THEN 'Vinyl'
          WHEN r.format IN ('CASSETTE', 'REEL') THEN 'Tape'
          WHEN r.format IN ('MAGAZINE', 'BOOK', 'ZINE', 'POSTER', 'PHOTO', 'POSTCARD') THEN 'Print'
          ELSE 'Other'
        END AS format_group,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE ii.last_stocktake_at IS NOT NULL) AS verified
      FROM erp_inventory_item ii
      JOIN "Release" r ON r.id = ii.release_id
      WHERE ii.source = 'frank_collection'
      GROUP BY 1
      ORDER BY 1
    `),

    // Bulk price adjustment status
    pg("bulk_price_adjustment_log")
      .where("status", "success")
      .orderBy("executed_at", "desc")
      .first(),
  ])

  const row = counts.rows[0]
  const today = todayStats.rows[0]

  res.json({
    eligible: Number(row.eligible),
    distinct_releases: Number(row.distinct_releases),
    verified: Number(row.verified),
    missing: Number(row.missing),
    remaining: Number(row.remaining),
    additional_copies: Number(row.additional_copies),
    avg_verified_price: Number(Number(row.avg_verified_price).toFixed(2)),
    today: {
      verified: Number(today.today_verified),
      copies_added: Number(today.today_copies_added),
      price_changed: Number(today.today_price_changed),
    },
    format_breakdown: formatBreakdown.rows.map((r: any) => ({
      format_group: r.format_group,
      total: Number(r.total),
      verified: Number(r.verified),
    })),
    bulk_status: bulkLog
      ? {
          executed: true,
          executed_at: bulkLog.executed_at,
          executed_by: bulkLog.executed_by,
          percentage: bulkLog.percentage,
          affected_rows: bulkLog.affected_rows,
        }
      : { executed: false },
  })
}
