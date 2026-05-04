import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../../lib/inventory"

/**
 * GET /admin/erp/inventory/stats/quick
 *
 * "Above-the-fold"-Endpoint fuer den Inventory-Hub: nur die Werte die in
 * den oberen 4 Stat-Cards + der HEUTE-Card stehen. Ziel: <200ms damit die
 * Top-Bar fuer Frank quasi sofort erscheint, statt der 1-10s-Wartezeit
 * vom kompletten /stats-Endpoint.
 *
 * Konsolidierung: vorher 6 parallele Queries fuer denselben Datenkern,
 * jetzt 4 (counts+today+throughput in 1 SQL via FILTER, hourly minimal,
 * total_releases einzeln, missing+bulk_status). Pro-Person, Verlauf,
 * Format-Breakdown gehoeren NICHT hier rein — die laedt das UI parallel
 * via /stats (full).
 *
 * Frontend cached die Response in localStorage und rendert sie beim
 * naechsten Mount sofort (SWR-Pattern), parallel laeuft ein neuer Fetch.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const [
    counts,
    todayHourly,
    totalReleases,
    missingAndBulk,
  ] = await Promise.all([
    // Mega-Aggregate auf erp_inventory_item alleine — alle counts +
    // today + 60min-rolling in einem einzigen Sequential Scan.
    // Ohne JOIN + ohne COUNT(DISTINCT) → 11ms auf 15k Rows. Der vorige
    // distinct_releases-Count hat 578ms gekostet (Index-Scan mit
    // hash-distinct), wird aber im UI gar nicht gerendert.
    pg.raw(`
      SELECT
        COUNT(*)::int AS eligible,
        COUNT(*) FILTER (
          WHERE last_stocktake_at IS NOT NULL AND price_locked = true
        )::int AS verified,
        COUNT(*) FILTER (
          WHERE last_stocktake_at IS NULL
        )::int AS remaining,
        COUNT(*) FILTER (WHERE copy_number > 1)::int AS additional_copies,
        COALESCE(AVG(exemplar_price) FILTER (
          WHERE last_stocktake_at IS NOT NULL AND exemplar_price IS NOT NULL
        ), 0) AS avg_verified_price,
        COALESCE(SUM(exemplar_price) FILTER (
          WHERE last_stocktake_at IS NOT NULL
            AND price_locked = true
            AND exemplar_price IS NOT NULL
        ), 0) AS verified_value,
        COUNT(*) FILTER (
          WHERE last_stocktake_at >= CURRENT_DATE
        )::int AS today_verified,
        COUNT(*) FILTER (
          WHERE copy_number > 1 AND created_at >= CURRENT_DATE
        )::int AS today_copies_added,
        COUNT(*) FILTER (
          WHERE exemplar_price IS NOT NULL AND last_stocktake_at >= CURRENT_DATE
        )::int AS today_price_changed,
        COUNT(*) FILTER (
          WHERE last_stocktake_at >= NOW() - INTERVAL '60 minutes'
        )::int AS verified_60min
      FROM erp_inventory_item
      WHERE source = 'frank_collection'
    `),

    // Today's hourly histogram — nur fuer "Items/h Ø heute" + Peak.
    // Index idx_eii_last_stocktake_at sorgt fuer ~5-15ms.
    pg.raw(`
      SELECT
        EXTRACT(HOUR FROM last_stocktake_at AT TIME ZONE 'UTC')::int AS hour_utc,
        COUNT(*)::int AS verified
      FROM erp_inventory_item
      WHERE source = 'frank_collection'
        AND last_stocktake_at >= CURRENT_DATE
      GROUP BY 1
    `),

    // Total releases im Katalog — selten geaender, aber DB-COUNT auf 52k
    // ist via pg_class reltuples-Schaetzwert wenn Postgres das nutzt.
    // Sonst Sequential Scan einmalig ~50ms.
    pg.raw(`SELECT COUNT(*)::int AS total FROM "Release"`),

    // Missing-Count (verified items mit legacy_price=0) + letzter Bulk
    // in einem Roundtrip via UNION/CTE wuerde sich anbieten, aber zwei
    // separate sind klarer und immer noch schnell. Promise.all batched
    // sie eh parallel als Teil der oeren Promise.all-Liste.
    pg.raw(`
      WITH missing AS (
        SELECT COUNT(*)::int AS c
        FROM erp_inventory_item ii
        JOIN "Release" r ON r.id = ii.release_id
        WHERE ii.source = 'frank_collection'
          AND ii.last_stocktake_at IS NOT NULL
          AND ii.price_locked = true
          AND r.legacy_price = 0
      ),
      bulk AS (
        SELECT executed_at, executed_by, percentage, affected_rows
        FROM bulk_price_adjustment_log
        WHERE status = 'success'
        ORDER BY executed_at DESC
        LIMIT 1
      )
      SELECT
        (SELECT c FROM missing) AS missing_count,
        (SELECT executed_at FROM bulk) AS bulk_executed_at,
        (SELECT executed_by FROM bulk) AS bulk_executed_by,
        (SELECT percentage FROM bulk) AS bulk_percentage,
        (SELECT affected_rows FROM bulk) AS bulk_affected_rows
    `),
  ])

  const row = counts.rows[0]
  const meta = missingAndBulk.rows[0]

  // Throughput-KPIs aus hourly histogram ableiten (gleiche Logik wie /stats).
  const hourlyRows: Array<{ hour_utc: number; verified: number }> = todayHourly.rows.map(
    (r: any) => ({ hour_utc: Number(r.hour_utc), verified: Number(r.verified) })
  )
  const todayTotal = hourlyRows.reduce((sum, h) => sum + h.verified, 0)
  const peakRow = hourlyRows.reduce(
    (best, h) => (h.verified > best.verified ? h : best),
    { hour_utc: -1, verified: 0 }
  )
  const activeHours = hourlyRows.filter((h) => h.verified > 0).length
  const avgPerActiveHour = activeHours > 0 ? Math.round(todayTotal / activeHours) : 0

  const avgVerified = Number(row.avg_verified_price)
  const remaining = Number(row.remaining)
  const projectedRemainingValue = avgVerified * remaining

  res.json({
    total_releases: Number(totalReleases.rows[0].total),
    eligible: Number(row.eligible),
    verified: Number(row.verified),
    missing: Number(meta.missing_count),
    remaining: remaining,
    additional_copies: Number(row.additional_copies),
    avg_verified_price: Number(avgVerified.toFixed(2)),
    verified_value: Number(Number(row.verified_value).toFixed(2)),
    projected_remaining_value: Number(projectedRemainingValue.toFixed(2)),
    today: {
      verified: Number(row.today_verified),
      copies_added: Number(row.today_copies_added),
      price_changed: Number(row.today_price_changed),
    },
    throughput: {
      current_rate_per_hour: Number(row.verified_60min),
      today_avg_per_active_hour: avgPerActiveHour,
      today_active_hours: activeHours,
      today_peak_hour_utc: peakRow.hour_utc >= 0 ? peakRow.hour_utc : null,
      today_peak_count: peakRow.verified,
    },
    bulk_status: meta.bulk_executed_at
      ? {
          executed: true,
          executed_at: meta.bulk_executed_at,
          executed_by: meta.bulk_executed_by,
          percentage: meta.bulk_percentage,
          affected_rows: meta.bulk_affected_rows,
        }
      : { executed: false },
    // Server-Timestamp damit das Frontend "data is X seconds old" zeigen kann.
    generated_at: new Date().toISOString(),
  })
}
