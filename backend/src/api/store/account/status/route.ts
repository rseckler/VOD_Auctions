import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { hasWonAuction } from "../../../../lib/auction-helpers"

// GET /store/account/status — Account status (has_won_auction + cart_count)
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

  const [won, cartResult] = await Promise.all([
    hasWonAuction(pgConnection, customerId),
    pgConnection("cart_item")
      .where("user_id", customerId)
      .whereNull("deleted_at")
      .count("id as count")
      .first(),
  ])

  res.json({
    has_won_auction: won,
    cart_count: Number(cartResult?.count || 0),
  })
}
