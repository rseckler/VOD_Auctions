import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/customers/list — Paginated customer list with local stats
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const q = (req.query.q as string) || ""
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const offset = Number(req.query.offset) || 0
  const sort = (req.query.sort as string) || "created_at"
  const order = (req.query.order as string) === "asc" ? "asc" : "desc"
  const segment = req.query.segment as string | undefined
  const isVip = req.query.is_vip === "true"
  const isDormant = req.query.is_dormant === "true"

  try {
    let query = pgConnection("customer as c")
      .leftJoin("customer_stats as cs", "cs.customer_id", "c.id")
      .whereNull("c.deleted_at")
      .select(
        "c.id",
        "c.email",
        "c.first_name",
        "c.last_name",
        "c.phone",
        "c.created_at",
        pgConnection.raw("COALESCE(cs.total_spent, 0) as total_spent"),
        pgConnection.raw("COALESCE(cs.total_purchases, 0) as total_purchases"),
        pgConnection.raw("COALESCE(cs.total_bids, 0) as total_bids"),
        pgConnection.raw("COALESCE(cs.total_wins, 0) as total_wins"),
        "cs.last_purchase_at",
        "cs.first_purchase_at",
        "cs.last_bid_at",
        pgConnection.raw("COALESCE(cs.tags, '{}') as tags"),
        pgConnection.raw("COALESCE(cs.is_vip, false) as is_vip"),
        pgConnection.raw("COALESCE(cs.is_dormant, false) as is_dormant"),
        "cs.updated_at as stats_updated_at"
      )

    // Search
    if (q) {
      query = query.where((builder: any) => {
        builder
          .whereILike("c.email", `%${q}%`)
          .orWhereILike("c.first_name", `%${q}%`)
          .orWhereILike("c.last_name", `%${q}%`)
      })
    }

    // Filters
    if (isVip) query = query.where("cs.is_vip", true)
    if (isDormant) query = query.where("cs.is_dormant", true)

    // Count query
    const countQuery = query.clone().clearSelect().clearOrder().count("c.id as total").first()
    const countResult = await countQuery
    const total = Number(countResult?.total || 0)

    // Apply sort + pagination
    const sortColumn = sort === "total_spent" ? "cs.total_spent"
      : sort === "total_purchases" ? "cs.total_purchases"
      : sort === "last_purchase_at" ? "cs.last_purchase_at"
      : "c.created_at"

    const customers = await query
      .orderBy(sortColumn, order)
      .orderBy("c.id", "asc") // stable secondary sort
      .limit(limit)
      .offset(offset)

    res.json({
      customers: customers.map((c: any) => ({
        id: c.id,
        email: c.email,
        name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email,
        first_name: c.first_name,
        last_name: c.last_name,
        phone: c.phone,
        created_at: c.created_at,
        total_spent: Number(c.total_spent),
        total_purchases: Number(c.total_purchases),
        total_bids: Number(c.total_bids),
        total_wins: Number(c.total_wins),
        last_purchase_at: c.last_purchase_at,
        first_purchase_at: c.first_purchase_at,
        last_bid_at: c.last_bid_at,
        tags: c.tags || [],
        is_vip: Boolean(c.is_vip),
        is_dormant: Boolean(c.is_dormant),
        stats_updated_at: c.stats_updated_at,
      })),
      total,
      limit,
      offset,
    })
  } catch (err: any) {
    console.error("[admin/customers/list] Error:", err.message)
    res.status(500).json({ message: "Failed to fetch customers" })
  }
}
