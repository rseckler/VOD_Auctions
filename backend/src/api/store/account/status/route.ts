import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /store/account/status — Account status (cart_count)
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const [cartResult, savedResult, ordersResult, winsResult, activeBidsResult, defaultAddress, customerResult] = await Promise.all([
    pgConnection("cart_item")
      .where("user_id", customerId)
      .whereNull("deleted_at")
      .count("id as count")
      .first(),
    pgConnection("saved_item")
      .where("user_id", customerId)
      .whereNull("deleted_at")
      .count("id as count")
      .first(),
    pgConnection("transaction")
      .where("user_id", customerId)
      .where("status", "paid")
      .countDistinct("order_group_id as count")
      .first(),
    pgConnection("bid")
      .join("block_item", "bid.block_item_id", "block_item.id")
      .where("bid.user_id", customerId)
      .where("bid.is_winning", true)
      .where("block_item.status", "sold")
      .count("bid.id as count")
      .first(),
    pgConnection("bid")
      .join("block_item", "bid.block_item_id", "block_item.id")
      .join("auction_block", "block_item.auction_block_id", "auction_block.id")
      .where("bid.user_id", customerId)
      .whereIn("auction_block.status", ["active"])
      .count("bid.id as count")
      .first(),
    pgConnection("customer_address")
      .where({ customer_id: customerId, is_default_shipping: true })
      .whereNull("deleted_at")
      .select("first_name", "last_name", "address_1", "address_2", "city", "postal_code", "country_code")
      .first(),
    pgConnection("customer")
      .where("id", customerId)
      .select("email_verified")
      .first(),
  ])

  res.json({
    cart_count: Number(cartResult?.count || 0),
    saved_count: Number(savedResult?.count || 0),
    orders_count: Number(ordersResult?.count || 0),
    wins_count: Number(winsResult?.count || 0),
    active_bids_count: Number(activeBidsResult?.count || 0),
    email_verified: customerResult?.email_verified || false,
    default_shipping_address: defaultAddress ? {
      first_name: defaultAddress.first_name || "",
      last_name: defaultAddress.last_name || "",
      line1: defaultAddress.address_1 || "",
      line2: defaultAddress.address_2 || "",
      city: defaultAddress.city || "",
      postal_code: defaultAddress.postal_code || "",
      country: defaultAddress.country_code || "",
    } : null,
  })
}
