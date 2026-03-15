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

  const [cartResult, savedResult, defaultAddress, customerResult] = await Promise.all([
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
