import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../lib/inventory"

/**
 * GET /admin/pos/stats
 *
 * POS dashboard statistics: today, yesterday, this week, all time.
 * Returns transaction counts, totals, averages, items sold,
 * and payment method breakdown (counts + totals).
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  try {
    await requireFeatureFlag(pg, "POS_WALK_IN")
  } catch (err: any) {
    console.error("[POS Stats] Feature flag check failed:", err.message, err.statusCode)
    res.status(err.statusCode || 403).json({ message: err.message || "Feature not enabled" })
    return
  }

  try {
  const result = await pg.raw(`
    WITH pos_tx AS (
      SELECT
        t.id,
        t.total_amount,
        t.payment_provider,
        t.created_at,
        t.created_at::date AS sale_date,
        (SELECT COUNT(*) FROM erp_inventory_movement m WHERE m.transaction_id = t.id AND m.type = 'sale') AS item_count
      FROM transaction t
      WHERE t.item_type = 'walk_in_sale' AND t.status = 'paid'
    )
    SELECT
      -- Today
      COUNT(*) FILTER (WHERE sale_date = CURRENT_DATE) AS today_count,
      COALESCE(SUM(total_amount) FILTER (WHERE sale_date = CURRENT_DATE), 0) AS today_total,
      COALESCE(SUM(item_count) FILTER (WHERE sale_date = CURRENT_DATE), 0) AS today_items,
      -- Yesterday
      COUNT(*) FILTER (WHERE sale_date = CURRENT_DATE - 1) AS yesterday_count,
      COALESCE(SUM(total_amount) FILTER (WHERE sale_date = CURRENT_DATE - 1), 0) AS yesterday_total,
      COALESCE(SUM(item_count) FILTER (WHERE sale_date = CURRENT_DATE - 1), 0) AS yesterday_items,
      -- This week (Monday-based)
      COUNT(*) FILTER (WHERE sale_date >= date_trunc('week', CURRENT_DATE)) AS week_count,
      COALESCE(SUM(total_amount) FILTER (WHERE sale_date >= date_trunc('week', CURRENT_DATE)), 0) AS week_total,
      COALESCE(SUM(item_count) FILTER (WHERE sale_date >= date_trunc('week', CURRENT_DATE)), 0) AS week_items,
      -- Last week (for comparison)
      COUNT(*) FILTER (WHERE sale_date >= date_trunc('week', CURRENT_DATE) - 7 AND sale_date < date_trunc('week', CURRENT_DATE)) AS last_week_count,
      COALESCE(SUM(total_amount) FILTER (WHERE sale_date >= date_trunc('week', CURRENT_DATE) - 7 AND sale_date < date_trunc('week', CURRENT_DATE)), 0) AS last_week_total,
      -- All time
      COUNT(*) AS all_count,
      COALESCE(SUM(total_amount), 0) AS all_total,
      COALESCE(SUM(item_count), 0) AS all_items,
      -- Payment breakdown (counts + totals)
      COUNT(*) FILTER (WHERE payment_provider = 'cash') AS cash_count,
      COALESCE(SUM(total_amount) FILTER (WHERE payment_provider = 'cash'), 0) AS cash_total,
      COUNT(*) FILTER (WHERE payment_provider = 'sumup') AS sumup_count,
      COALESCE(SUM(total_amount) FILTER (WHERE payment_provider = 'sumup'), 0) AS sumup_total,
      COUNT(*) FILTER (WHERE payment_provider = 'paypal') AS paypal_count,
      COALESCE(SUM(total_amount) FILTER (WHERE payment_provider = 'paypal'), 0) AS paypal_total,
      COUNT(*) FILTER (WHERE payment_provider = 'bank_transfer') AS transfer_count,
      COALESCE(SUM(total_amount) FILTER (WHERE payment_provider = 'bank_transfer'), 0) AS transfer_total
    FROM pos_tx
  `)

  const r = result.rows[0]
  const n = (v: any) => Number(v)
  const avg = (total: number, count: number) => count > 0 ? Number((total / count).toFixed(2)) : 0

  const todayTotal = n(r.today_total)
  const todayCount = n(r.today_count)
  const yesterdayTotal = n(r.yesterday_total)
  const yesterdayCount = n(r.yesterday_count)
  const weekTotal = n(r.week_total)
  const weekCount = n(r.week_count)
  const lastWeekTotal = n(r.last_week_total)
  const allTotal = n(r.all_total)
  const allCount = n(r.all_count)

  res.json({
    today: { count: todayCount, total: todayTotal, items: n(r.today_items), avg: avg(todayTotal, todayCount) },
    yesterday: { count: yesterdayCount, total: yesterdayTotal, items: n(r.yesterday_items), avg: avg(yesterdayTotal, yesterdayCount) },
    week: { count: weekCount, total: weekTotal, items: n(r.week_items), avg: avg(weekTotal, weekCount) },
    last_week: { count: n(r.last_week_count), total: lastWeekTotal },
    all_time: { count: allCount, total: allTotal, items: n(r.all_items), avg: avg(allTotal, allCount) },
    // Delta percentages for comparison
    deltas: {
      today_vs_yesterday: yesterdayTotal > 0 ? Number(((todayTotal - yesterdayTotal) / yesterdayTotal * 100).toFixed(1)) : null,
      week_vs_last_week: lastWeekTotal > 0 ? Number(((weekTotal - lastWeekTotal) / lastWeekTotal * 100).toFixed(1)) : null,
    },
    payment_breakdown: [
      { method: "sumup", label: "SumUp Card", count: n(r.sumup_count), total: n(r.sumup_total) },
      { method: "cash", label: "Cash", count: n(r.cash_count), total: n(r.cash_total) },
      { method: "paypal", label: "PayPal", count: n(r.paypal_count), total: n(r.paypal_total) },
      { method: "bank_transfer", label: "Bank Transfer", count: n(r.transfer_count), total: n(r.transfer_total) },
    ].filter((p) => p.count > 0),
  })
  } catch (err: any) {
    console.error("[POS Stats] Query error:", err.message)
    res.status(500).json({ message: err.message || "Failed to load stats" })
  }
}
