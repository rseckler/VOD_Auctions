import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/customers/:id — Customer detail with full stats + order history
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    // Customer + stats
    const customer = await pgConnection("customer as c")
      .leftJoin("customer_stats as cs", "cs.customer_id", "c.id")
      .where("c.id", id)
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
      .first()

    if (!customer) {
      res.status(404).json({ message: "Customer not found" })
      return
    }

    // Recent orders (last 20 transactions)
    const orders = await pgConnection("transaction as t")
      .leftJoin("block_item as bi", "bi.id", "t.block_item_id")
      .leftJoin("auction_block as ab", "ab.id", "bi.auction_block_id")
      .where("t.user_id", id)
      .whereNull("t.deleted_at")
      .orderBy("t.created_at", "desc")
      .limit(20)
      .select(
        "t.id",
        "t.order_number",
        "t.amount",
        "t.status",
        "t.fulfillment_status",
        "t.item_type",
        "t.payment_provider",
        "t.created_at",
        "t.updated_at",
        "t.shipping_name",
        "t.shipping_country",
        "bi.lot_number",
        "ab.title as auction_title",
        pgConnection.raw(`COALESCE(bi.release_id, t.release_id) as release_id`)
      )

    // Recent bids (last 20)
    const bids = await pgConnection("bid as b")
      .leftJoin("block_item as bi", "bi.id", "b.block_item_id")
      .leftJoin("auction_block as ab", "ab.id", "bi.auction_block_id")
      .where("b.user_id", id)
      .orderBy("b.created_at", "desc")
      .limit(20)
      .select(
        "b.id",
        "b.amount",
        "b.is_winning",
        "b.is_outbid",
        "b.created_at",
        "bi.lot_number",
        "ab.title as auction_title",
        "ab.id as auction_block_id"
      )

    // Shipping addresses (unique, from transaction history)
    const addresses = await pgConnection("transaction")
      .where("user_id", id)
      .whereNotNull("shipping_address_line1")
      .whereNull("deleted_at")
      .orderBy("created_at", "desc")
      .limit(5)
      .select(
        "shipping_name",
        "shipping_address_line1",
        "shipping_address_line2",
        "shipping_city",
        "shipping_postal_code",
        "shipping_country",
        "created_at"
      )

    res.json({
      customer: {
        id: customer.id,
        email: customer.email,
        name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        phone: customer.phone,
        created_at: customer.created_at,
        total_spent: Number(customer.total_spent),
        total_purchases: Number(customer.total_purchases),
        total_bids: Number(customer.total_bids),
        total_wins: Number(customer.total_wins),
        last_purchase_at: customer.last_purchase_at,
        first_purchase_at: customer.first_purchase_at,
        last_bid_at: customer.last_bid_at,
        tags: customer.tags || [],
        is_vip: Boolean(customer.is_vip),
        is_dormant: Boolean(customer.is_dormant),
        stats_updated_at: customer.stats_updated_at,
      },
      orders: orders.map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        amount: Number(o.amount),
        status: o.status,
        fulfillment_status: o.fulfillment_status,
        item_type: o.item_type,
        payment_provider: o.payment_provider,
        created_at: o.created_at,
        updated_at: o.updated_at,
        shipping_name: o.shipping_name,
        shipping_country: o.shipping_country,
        lot_number: o.lot_number,
        auction_title: o.auction_title,
        release_id: o.release_id,
      })),
      bids: bids.map((b: any) => ({
        id: b.id,
        amount: Number(b.amount),
        is_winning: b.is_winning,
        is_outbid: b.is_outbid,
        created_at: b.created_at,
        lot_number: b.lot_number,
        auction_title: b.auction_title,
        auction_block_id: b.auction_block_id,
      })),
      addresses,
    })
  } catch (err: any) {
    console.error(`[admin/customers/${id}] Error:`, err.message)
    res.status(500).json({ message: "Failed to fetch customer" })
  }
}
