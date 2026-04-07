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

  const [counts, bulkLog] = await Promise.all([
    // Stocktake progress counts
    pg.raw(`
      SELECT
        COUNT(*) AS eligible,
        COUNT(*) FILTER (
          WHERE ii.last_stocktake_at IS NOT NULL AND ii.price_locked = true
        ) AS verified,
        COUNT(*) FILTER (
          WHERE ii.last_stocktake_at IS NOT NULL AND ii.price_locked = true
            AND r.legacy_price = 0
        ) AS missing,
        COUNT(*) FILTER (
          WHERE ii.last_stocktake_at IS NULL
        ) AS remaining
      FROM erp_inventory_item ii
      JOIN "Release" r ON r.id = ii.release_id
      WHERE ii.source = 'frank_collection'
    `),

    // Bulk price adjustment status
    pg("bulk_price_adjustment_log")
      .where("status", "success")
      .orderBy("executed_at", "desc")
      .first(),
  ])

  const row = counts.rows[0]

  res.json({
    eligible: Number(row.eligible),
    verified: Number(row.verified),
    missing: Number(row.missing),
    remaining: Number(row.remaining),
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
