import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../lib/inventory"

/**
 * GET /admin/pos/transactions
 *
 * Paginated POS transaction list with filters.
 * Query params:
 *   period: today | yesterday | week | all (date presets)
 *   date_from, date_to: YYYY-MM-DD (custom range, overrides period)
 *   payment_provider: sumup | cash | paypal | bank_transfer
 *   q: search order_number or customer name
 *   limit: number (default 50)
 *   offset: number (default 0)
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "POS_WALK_IN")

  const {
    period, date_from, date_to, payment_provider, q,
    limit: limitStr, offset: offsetStr,
  } = req.query as Record<string, string | undefined>

  const limit = Math.min(parseInt(limitStr || "50"), 200)
  const offset = parseInt(offsetStr || "0")

  // Build date filter
  let dateFilter = ""
  const params: any[] = []

  if (date_from && date_to) {
    dateFilter = "AND t.created_at::date >= ? AND t.created_at::date <= ?"
    params.push(date_from, date_to)
  } else if (period === "today") {
    dateFilter = "AND t.created_at::date = CURRENT_DATE"
  } else if (period === "yesterday") {
    dateFilter = "AND t.created_at::date = (CURRENT_DATE - INTERVAL '1 day')::date"
  } else if (period === "week") {
    dateFilter = "AND t.created_at::date >= date_trunc('week', CURRENT_DATE)"
  }
  // "all" = no date filter

  // Payment filter
  let paymentFilter = ""
  if (payment_provider) {
    paymentFilter = "AND t.payment_provider = ?"
    params.push(payment_provider)
  }

  // Search filter
  let searchFilter = ""
  if (q && q.trim()) {
    searchFilter = "AND (t.order_number ILIKE ? OR c.first_name ILIKE ? OR c.last_name ILIKE ?)"
    const pattern = `%${q.trim()}%`
    params.push(pattern, pattern, pattern)
  }

  // Count query
  const countResult = await pg.raw(`
    SELECT COUNT(*) AS total
    FROM transaction t
    LEFT JOIN customer c ON c.id = t.user_id
    WHERE t.item_type = 'walk_in_sale' AND t.status = 'paid'
    ${dateFilter} ${paymentFilter} ${searchFilter}
  `, params)

  const total = Number(countResult.rows[0].total)

  // Data query
  const dataParams = [...params, limit, offset]
  const dataResult = await pg.raw(`
    SELECT
      t.id,
      t.order_number,
      t.total_amount,
      t.amount AS subtotal,
      t.discount_amount,
      t.payment_provider,
      t.status,
      t.fulfillment_status,
      t.tse_signature,
      t.created_at,
      c.first_name AS customer_first_name,
      c.last_name AS customer_last_name,
      c.email AS customer_email,
      (SELECT COUNT(*) FROM erp_inventory_movement m WHERE m.transaction_id = t.id AND m.type = 'sale') AS items_count
    FROM transaction t
    LEFT JOIN customer c ON c.id = t.user_id
    WHERE t.item_type = 'walk_in_sale' AND t.status = 'paid'
    ${dateFilter} ${paymentFilter} ${searchFilter}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `, dataParams)

  res.json({
    transactions: dataResult.rows.map((r: any) => ({
      id: r.id,
      order_number: r.order_number,
      total: Number(r.total_amount),
      subtotal: Number(r.subtotal),
      discount: r.discount_amount ? Number(r.discount_amount) : 0,
      payment_provider: r.payment_provider,
      status: r.status,
      fulfillment_status: r.fulfillment_status,
      tse_signature: r.tse_signature,
      items_count: Number(r.items_count),
      customer_name: r.customer_first_name
        ? [r.customer_first_name, r.customer_last_name].filter(Boolean).join(" ")
        : null,
      customer_email: r.customer_email,
      created_at: r.created_at,
    })),
    total,
    limit,
    offset,
  })
}
