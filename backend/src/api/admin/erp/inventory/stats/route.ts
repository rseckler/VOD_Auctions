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

  // Performance: Die urspruengliche main-counts-Query mit JOIN auf Release (fuer
  // legacy_price=0 Missing-Check + avg_verified_price Fallback) triggerte Seq
  // Scan auf 52k Release-Rows → 6.5s Latenz auf dem Inventory-Hub. Drei Fixes:
  //   1. Main-Aggregate ohne JOIN, nur erp_inventory_item (103ms statt 6540ms)
  //   2. Missing-Count separat, nutzt idx_release_legacy_price (~5ms)
  //   3. Format-Breakdown via MATERIALIZED CTE damit die kleine erp-Seite
  //      zuerst durchlaeuft und der Release-Lookup per Hash-Join danach
  //      (~70ms statt 373ms)
  const [
    counts,
    totalReleases,
    todayStats,
    formatBreakdown,
    missingCount,
    bulkLog,
  ] = await Promise.all([
    // Stocktake progress counts (Exemplar-level, NO JOIN auf Release).
    // avg_verified_price nutzt nur exemplar_price — in der Praxis ist das
    // nach Verify immer gesetzt. Fuer Edge-Cases (verified ohne exemplar_price)
    // faellt avg auf 0 zurueck, fuer's Dashboard tolerabel.
    pg.raw(`
      SELECT
        COUNT(*) AS eligible,
        COUNT(DISTINCT ii.release_id) AS distinct_releases,
        COUNT(*) FILTER (
          WHERE ii.last_stocktake_at IS NOT NULL AND ii.price_locked = true
        ) AS verified,
        COUNT(*) FILTER (
          WHERE ii.last_stocktake_at IS NULL
        ) AS remaining,
        COUNT(*) FILTER (WHERE ii.copy_number > 1) AS additional_copies,
        COALESCE(AVG(ii.exemplar_price) FILTER (
          WHERE ii.last_stocktake_at IS NOT NULL AND ii.exemplar_price IS NOT NULL
        ), 0) AS avg_verified_price,
        COALESCE(SUM(ii.exemplar_price) FILTER (
          WHERE ii.last_stocktake_at IS NOT NULL
            AND ii.price_locked = true
            AND ii.exemplar_price IS NOT NULL
        ), 0) AS verified_value
      FROM erp_inventory_item ii
      WHERE ii.source = 'frank_collection'
    `),

    // Total releases in the entire catalog (not just inventory)
    pg.raw(`SELECT COUNT(*)::int AS total FROM "Release"`),

    // Today's activity (no JOIN needed)
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

    // Format breakdown — MATERIALIZED CTE zwingt kleine erp-Seite zuerst
    pg.raw(`
      WITH erp AS MATERIALIZED (
        SELECT release_id, last_stocktake_at
        FROM erp_inventory_item
        WHERE source = 'frank_collection'
      )
      SELECT
        CASE
          WHEN r.format = 'LP' THEN 'Vinyl'
          WHEN r.format IN ('CASSETTE', 'REEL') THEN 'Tape'
          WHEN r.format IN ('MAGAZINE', 'BOOK', 'ZINE', 'POSTER', 'PHOTO', 'POSTCARD') THEN 'Print'
          ELSE 'Other'
        END AS format_group,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE erp.last_stocktake_at IS NOT NULL) AS verified
      FROM erp
      JOIN "Release" r ON r.id = erp.release_id
      GROUP BY 1
      ORDER BY 1
    `),

    // Missing-Count (items mit legacy_price=0 die verified sind — Franks F2
    // convention). Nutzt idx_release_legacy_price → Index-Nested-Loop statt
    // Seq Scan. 5ms statt des kompletten Seq-Scan-Anteils der alten Query.
    pg.raw(`
      SELECT COUNT(*)::int AS missing
      FROM erp_inventory_item ii
      JOIN "Release" r ON r.id = ii.release_id
      WHERE ii.source = 'frank_collection'
        AND ii.last_stocktake_at IS NOT NULL
        AND ii.price_locked = true
        AND r.legacy_price = 0
    `),

    // Bulk price adjustment status
    pg("bulk_price_adjustment_log")
      .where("status", "success")
      .orderBy("executed_at", "desc")
      .first(),
  ])

  const row = counts.rows[0]
  const total = totalReleases.rows[0]
  const today = todayStats.rows[0]
  const missing = missingCount.rows[0]

  const avgVerified = Number(row.avg_verified_price)
  const remaining = Number(row.remaining)
  const projectedRemainingValue = avgVerified * remaining

  res.json({
    total_releases: Number(total.total),
    eligible: Number(row.eligible),
    distinct_releases: Number(row.distinct_releases),
    verified: Number(row.verified),
    missing: Number(missing.missing),
    remaining: remaining,
    additional_copies: Number(row.additional_copies),
    avg_verified_price: Number(avgVerified.toFixed(2)),
    verified_value: Number(Number(row.verified_value).toFixed(2)),
    projected_remaining_value: Number(projectedRemainingValue.toFixed(2)),
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
