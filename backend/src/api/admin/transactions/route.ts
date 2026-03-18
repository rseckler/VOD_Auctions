import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/transactions — All transactions (admin) with pagination, search, filters, sort
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const {
      status,
      shipping_status,
      fulfillment_status,
      payment_provider,
      shipping_country,
      date_from,
      date_to,
      q,
      sort = "created_at",
      order = "desc",
      limit: limitStr = "25",
      offset: offsetStr = "0",
    } = req.query as Record<string, string>

    const limit = Math.min(parseInt(limitStr) || 25, 100)
    const offset = parseInt(offsetStr) || 0

    // Reusable filter function for both count and data queries
    function applyFilters(query: Knex.QueryBuilder): Knex.QueryBuilder {
      if (status) query.where("transaction.status", status)
      if (shipping_status) query.where("transaction.shipping_status", shipping_status)
      if (fulfillment_status) query.where("transaction.fulfillment_status", fulfillment_status)
      if (payment_provider) query.where("transaction.payment_provider", payment_provider)
      if (shipping_country) query.where("transaction.shipping_country", shipping_country)
      if (date_from) query.where("transaction.created_at", ">=", date_from)
      if (date_to) query.where("transaction.created_at", "<=", date_to + "T23:59:59Z")
      if (q) {
        query.where(function () {
          this.whereILike("customer.first_name", `%${q}%`)
            .orWhereILike("customer.last_name", `%${q}%`)
            .orWhereILike("customer.email", `%${q}%`)
            .orWhereILike("transaction.order_number", `%${q}%`)
            .orWhereILike("transaction.shipping_name", `%${q}%`)
            .orWhereILike("Release.article_number", `%${q}%`)
        })
      }
      return query
    }

    // Count query (total without pagination)
    const countQuery = applyFilters(
      pgConnection("transaction")
        .leftJoin("customer", "customer.id", "transaction.user_id")
        .leftJoin("block_item", "block_item.id", "transaction.block_item_id")
        .leftJoin(
          "Release",
          "Release.id",
          pgConnection.raw("COALESCE(block_item.release_id, transaction.release_id)")
        )
    )
    const [{ count: total }] = await countQuery.count("transaction.id as count")

    // Data query with all joins
    let dataQuery = pgConnection("transaction")
      .select(
        "transaction.*",
        pgConnection.raw(
          "COALESCE(block_item.release_id, transaction.release_id) as resolved_release_id"
        ),
        "block_item.lot_number",
        "auction_block.title as block_title",
        "auction_block.slug as block_slug",
        "customer.email as customer_email",
        "customer.first_name as customer_first_name",
        "customer.last_name as customer_last_name",
        "Release.title as release_title",
        "Release.article_number",
        "Artist.name as release_artist"
      )
      .leftJoin("block_item", "block_item.id", "transaction.block_item_id")
      .leftJoin("auction_block", "auction_block.id", "block_item.auction_block_id")
      .leftJoin("customer", "customer.id", "transaction.user_id")
      .leftJoin(
        "Release",
        "Release.id",
        pgConnection.raw("COALESCE(block_item.release_id, transaction.release_id)")
      )
      .leftJoin("Artist", "Artist.id", "Release.artistId")

    dataQuery = applyFilters(dataQuery)

    // Sort
    const sortMap: Record<string, string> = {
      created_at: "transaction.created_at",
      paid_at: "transaction.paid_at",
      total_amount: "transaction.total_amount",
      order_number: "transaction.order_number",
    }
    const sortCol = sortMap[sort] || "transaction.created_at"
    const sortDir = order === "asc" ? "asc" : "desc"
    dataQuery.orderBy(sortCol, sortDir)

    dataQuery.limit(limit).offset(offset)

    const transactions = await dataQuery

    const result = transactions.map((t: any) => {
      const customerName = [t.customer_first_name, t.customer_last_name]
        .filter(Boolean)
        .join(" ")
      return {
        ...t,
        amount: parseFloat(t.amount),
        shipping_cost: parseFloat(t.shipping_cost),
        total_amount: parseFloat(t.total_amount),
        refund_amount: parseFloat(t.refund_amount || "0"),
        customer_name: customerName || t.shipping_name || null,
        customer_email: t.customer_email || null,
      }
    })

    res.json({
      transactions: result,
      count: result.length,
      total: parseInt(String(total)),
      limit,
      offset,
    })
  } catch (error: any) {
    console.error("[admin/transactions] Error:", error)
    res.status(500).json({ message: "Failed to fetch transactions" })
  }
}
