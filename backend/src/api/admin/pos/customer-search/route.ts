import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../lib/inventory"

/**
 * GET /admin/pos/customer-search?q=
 *
 * Live customer search for the POS customer panel.
 * Searches first_name, last_name, email. Returns top 10 matches
 * with customer_stats summary for quick identification.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "POS_WALK_IN")

  const q = (req.query.q as string || "").trim()

  if (!q || q.length < 2) {
    res.json({ customers: [] })
    return
  }

  const pattern = `%${q}%`
  const result = await pg.raw(`
    SELECT
      c.id,
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      cs.total_spent,
      cs.total_purchases,
      cs.is_vip,
      cs.last_purchase_at
    FROM customer c
    LEFT JOIN customer_stats cs ON cs.customer_id = c.id
    WHERE
      c.first_name ILIKE ? OR
      c.last_name ILIKE ? OR
      c.email ILIKE ? OR
      CONCAT(c.first_name, ' ', c.last_name) ILIKE ?
    ORDER BY cs.total_spent DESC NULLS LAST
    LIMIT 10
  `, [pattern, pattern, pattern, pattern])

  res.json({
    customers: result.rows.map((r: any) => ({
      id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      name: [r.first_name, r.last_name].filter(Boolean).join(" "),
      email: r.email,
      phone: r.phone,
      total_spent: r.total_spent != null ? Number(r.total_spent) : 0,
      total_purchases: r.total_purchases || 0,
      is_vip: r.is_vip || false,
      last_purchase_at: r.last_purchase_at,
    })),
  })
}
