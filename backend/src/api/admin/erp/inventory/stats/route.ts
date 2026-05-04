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
    perUser,
    perWarehouse,
    todayHourly,
    todayHourlyByWarehouse,
    last60min,
    last60minByWarehouse,
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

    // Per-user breakdown — Frank's actor_id ist mal Email, mal user_*-ID
    // (zwei parallele Sessions/Tabs). Beide Varianten via LEFT JOIN auf
    // "user" auf eine kanonische user_id kollabieren, sonst doppelt
    // gezählt. Fallback display_name = raw actor_id wenn kein Match.
    pg.raw(`
      WITH normalized AS (
        SELECT
          ii.id,
          ii.last_stocktake_at,
          ii.last_stocktake_by,
          COALESCE(u_by_id.id, u_by_email.id, ii.last_stocktake_by) AS user_key,
          COALESCE(
            NULLIF(TRIM(CONCAT(u_by_id.first_name, ' ', u_by_id.last_name)), ''),
            NULLIF(TRIM(CONCAT(u_by_email.first_name, ' ', u_by_email.last_name)), ''),
            u_by_id.email,
            u_by_email.email,
            ii.last_stocktake_by
          ) AS display_name,
          COALESCE(u_by_id.email, u_by_email.email, ii.last_stocktake_by) AS email
        FROM erp_inventory_item ii
        LEFT JOIN "user" u_by_id ON u_by_id.id = ii.last_stocktake_by
        LEFT JOIN "user" u_by_email ON u_by_email.email = ii.last_stocktake_by
        WHERE ii.source = 'frank_collection'
          AND ii.last_stocktake_at IS NOT NULL
      )
      SELECT
        user_key,
        MAX(display_name) AS display_name,
        MAX(email) AS email,
        COUNT(*) FILTER (WHERE last_stocktake_at >= CURRENT_DATE)::int AS today,
        COUNT(*) FILTER (WHERE last_stocktake_at >= CURRENT_DATE - INTERVAL '7 days')::int AS last_7_days,
        COUNT(*)::int AS all_time,
        MAX(last_stocktake_at) AS last_active_at,
        MIN(last_stocktake_at) FILTER (WHERE last_stocktake_at >= CURRENT_DATE) AS first_today
      FROM normalized
      GROUP BY user_key
      ORDER BY today DESC, all_time DESC
    `),

    // Per-warehouse breakdown — De-facto Frank-vs-David-Proxy weil David
    // nur in der Eugenstrasse arbeitet. Beide Logins laufen aktuell auf
    // Frank's Account, deshalb ist warehouse_location der zuverlaessigere
    // User-Indikator als last_stocktake_by. NULL-Lager als "<kein Lager>"
    // ausgeworfen damit Frank den Edge-Case sieht (sollte 0 sein).
    pg.raw(`
      SELECT
        COALESCE(wl.code, 'UNASSIGNED') AS warehouse_code,
        COALESCE(wl.name, '<kein Lager>') AS warehouse_name,
        COUNT(*) FILTER (WHERE ii.last_stocktake_at >= CURRENT_DATE)::int AS today,
        COUNT(*) FILTER (WHERE ii.last_stocktake_at >= CURRENT_DATE - INTERVAL '7 days')::int AS last_7_days,
        COUNT(*)::int AS all_time,
        MAX(ii.last_stocktake_at) AS last_active_at,
        MIN(ii.last_stocktake_at) FILTER (WHERE ii.last_stocktake_at >= CURRENT_DATE) AS first_today
      FROM erp_inventory_item ii
      LEFT JOIN warehouse_location wl ON wl.id = ii.warehouse_location_id
      WHERE ii.source = 'frank_collection'
        AND ii.last_stocktake_at IS NOT NULL
      GROUP BY wl.code, wl.name
      ORDER BY today DESC, all_time DESC
    `),

    // Today's hourly histogram — UTC-basiert. Frontend rechnet auf
    // lokale Zeitzone um. Nutzt vorhandenen Index idx_eii_last_stocktake_at.
    pg.raw(`
      SELECT
        EXTRACT(HOUR FROM last_stocktake_at AT TIME ZONE 'UTC')::int AS hour_utc,
        COUNT(*)::int AS verified
      FROM erp_inventory_item
      WHERE source = 'frank_collection'
        AND last_stocktake_at >= CURRENT_DATE
      GROUP BY 1
      ORDER BY 1
    `),

    // Today's hourly histogram aufgesplittet nach Warehouse — fuer
    // gestackte Mini-Bars in der UI (Frank vs David Verlauf ueber den Tag).
    pg.raw(`
      SELECT
        EXTRACT(HOUR FROM ii.last_stocktake_at AT TIME ZONE 'UTC')::int AS hour_utc,
        COALESCE(wl.code, 'UNASSIGNED') AS warehouse_code,
        COUNT(*)::int AS verified
      FROM erp_inventory_item ii
      LEFT JOIN warehouse_location wl ON wl.id = ii.warehouse_location_id
      WHERE ii.source = 'frank_collection'
        AND ii.last_stocktake_at >= CURRENT_DATE
      GROUP BY 1, 2
      ORDER BY 1, 2
    `),

    // Last-60-min throughput — "current rate" KPI. Nicht hour-bucketed,
    // sondern rolling window damit der Wert sofort nach Session-Start
    // sinnvoll ist (statt "noch keine volle Stunde voll").
    pg.raw(`
      SELECT COUNT(*)::int AS verified_60min
      FROM erp_inventory_item
      WHERE source = 'frank_collection'
        AND last_stocktake_at >= NOW() - INTERVAL '60 minutes'
    `),

    // Last-60-min throughput pro Warehouse fuer Live-KPI je Lager.
    pg.raw(`
      SELECT
        COALESCE(wl.code, 'UNASSIGNED') AS warehouse_code,
        COUNT(*)::int AS verified_60min
      FROM erp_inventory_item ii
      LEFT JOIN warehouse_location wl ON wl.id = ii.warehouse_location_id
      WHERE ii.source = 'frank_collection'
        AND ii.last_stocktake_at >= NOW() - INTERVAL '60 minutes'
      GROUP BY wl.code
    `),
  ])

  const row = counts.rows[0]
  const total = totalReleases.rows[0]
  const today = todayStats.rows[0]
  const missing = missingCount.rows[0]

  const avgVerified = Number(row.avg_verified_price)
  const remaining = Number(row.remaining)
  const projectedRemainingValue = avgVerified * remaining

  // Throughput-KPIs aus der hourly histogram ableiten.
  const hourlyRows: Array<{ hour_utc: number; verified: number }> = todayHourly.rows.map(
    (r: any) => ({ hour_utc: Number(r.hour_utc), verified: Number(r.verified) })
  )
  const todayTotal = hourlyRows.reduce((sum, h) => sum + h.verified, 0)
  const peakRow = hourlyRows.reduce(
    (best, h) => (h.verified > best.verified ? h : best),
    { hour_utc: -1, verified: 0 }
  )
  // Avg/h berechnet sich nur über die Stunden in denen tatsächlich verifiziert
  // wurde — sonst dilutiert ein 14h-Tag mit 2h Aktivität die Rate auf Müll.
  const activeHours = hourlyRows.filter((h) => h.verified > 0).length
  const avgPerActiveHour = activeHours > 0 ? Math.round(todayTotal / activeHours) : 0

  // items_per_hour_today nur sinnvoll wenn der User heute schon eine Weile
  // dran war — first_today gibt den Start, NOW() den jetzigen Stand.
  // Mindestens 6 Min Aktivität voraussetzen (0.1h), sonst wird die Rate
  // bei 1 Item nach 30s zu 120/h hochgejagt.
  const itemsPerHourToday = (firstToday: string | null, today: number): number => {
    if (!firstToday || today <= 0) return 0
    const elapsedHours = (Date.now() - new Date(firstToday).getTime()) / 3_600_000
    if (elapsedHours < 0.1) return 0
    return Math.round(today / elapsedHours)
  }

  const perUserRows = perUser.rows.map((r: any) => ({
    user_key: r.user_key,
    display_name: r.display_name,
    email: r.email,
    today: Number(r.today),
    last_7_days: Number(r.last_7_days),
    all_time: Number(r.all_time),
    last_active_at: r.last_active_at,
    items_per_hour_today: itemsPerHourToday(r.first_today, Number(r.today)),
  }))

  // Per-Warehouse mit Live-Rate aus dem 60-min-Fenster mergen.
  const last60ByWarehouse = new Map<string, number>()
  for (const r of last60minByWarehouse.rows) {
    last60ByWarehouse.set(String(r.warehouse_code), Number(r.verified_60min))
  }
  const perWarehouseRows = perWarehouse.rows.map((r: any) => ({
    warehouse_code: String(r.warehouse_code),
    warehouse_name: r.warehouse_name,
    today: Number(r.today),
    last_7_days: Number(r.last_7_days),
    all_time: Number(r.all_time),
    last_active_at: r.last_active_at,
    items_per_hour_today: itemsPerHourToday(r.first_today, Number(r.today)),
    current_rate_per_hour: last60ByWarehouse.get(String(r.warehouse_code)) ?? 0,
  }))

  // Hourly Histogram nach Warehouse pivotieren — { hour_utc, ALPENSTRASSE: n, EUGENSTRASSE: n, ... }
  const hourlyByWarehouseMap = new Map<number, Record<string, number>>()
  for (const r of todayHourlyByWarehouse.rows) {
    const h = Number(r.hour_utc)
    const code = String(r.warehouse_code)
    const bucket = hourlyByWarehouseMap.get(h) ?? {}
    bucket[code] = Number(r.verified)
    hourlyByWarehouseMap.set(h, bucket)
  }
  const hourlyByWarehouse = Array.from(hourlyByWarehouseMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour_utc, byCode]) => ({ hour_utc, by_warehouse: byCode }))

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
    per_user: perUserRows,
    per_warehouse: perWarehouseRows,
    throughput: {
      today_hourly: hourlyRows,
      today_hourly_by_warehouse: hourlyByWarehouse,
      current_rate_per_hour: Number(last60min.rows[0].verified_60min),
      today_avg_per_active_hour: avgPerActiveHour,
      today_active_hours: activeHours,
      today_peak_hour_utc: peakRow.hour_utc >= 0 ? peakRow.hour_utc : null,
      today_peak_count: peakRow.verified,
    },
  })
}
