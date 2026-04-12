import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../lib/inventory"

/**
 * GET /admin/pos/stats
 *
 * POS dashboard statistics: today, yesterday, this week, all time.
 * Returns transaction counts, totals, and payment method breakdown.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "POS_WALK_IN")

  const result = await pg.raw(`
    WITH pos_tx AS (
      SELECT
        total_amount,
        payment_provider,
        created_at,
        created_at::date AS sale_date
      FROM transaction
      WHERE item_type = 'walk_in_sale' AND status = 'paid'
    )
    SELECT
      -- Today
      COUNT(*) FILTER (WHERE sale_date = CURRENT_DATE) AS today_count,
      COALESCE(SUM(total_amount) FILTER (WHERE sale_date = CURRENT_DATE), 0) AS today_total,
      -- Yesterday
      COUNT(*) FILTER (WHERE sale_date = CURRENT_DATE - 1) AS yesterday_count,
      COALESCE(SUM(total_amount) FILTER (WHERE sale_date = CURRENT_DATE - 1), 0) AS yesterday_total,
      -- This week (Monday-based)
      COUNT(*) FILTER (WHERE sale_date >= date_trunc('week', CURRENT_DATE)) AS week_count,
      COALESCE(SUM(total_amount) FILTER (WHERE sale_date >= date_trunc('week', CURRENT_DATE)), 0) AS week_total,
      -- All time
      COUNT(*) AS all_count,
      COALESCE(SUM(total_amount), 0) AS all_total,
      -- Payment breakdown (all time)
      COUNT(*) FILTER (WHERE payment_provider = 'cash') AS cash_count,
      COUNT(*) FILTER (WHERE payment_provider = 'sumup') AS sumup_count,
      COUNT(*) FILTER (WHERE payment_provider = 'paypal') AS paypal_count,
      COUNT(*) FILTER (WHERE payment_provider = 'bank_transfer') AS transfer_count
    FROM pos_tx
  `)

  const row = result.rows[0]

  res.json({
    today: { count: Number(row.today_count), total: Number(row.today_total) },
    yesterday: { count: Number(row.yesterday_count), total: Number(row.yesterday_total) },
    week: { count: Number(row.week_count), total: Number(row.week_total) },
    all_time: { count: Number(row.all_count), total: Number(row.all_total) },
    payment_breakdown: {
      cash: Number(row.cash_count),
      sumup: Number(row.sumup_count),
      paypal: Number(row.paypal_count),
      bank_transfer: Number(row.transfer_count),
    },
  })
}
