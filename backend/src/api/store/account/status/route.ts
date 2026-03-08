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

  const cartResult = await pgConnection("cart_item")
    .where("user_id", customerId)
    .whereNull("deleted_at")
    .count("id as count")
    .first()

  res.json({
    cart_count: Number(cartResult?.count || 0),
  })
}
