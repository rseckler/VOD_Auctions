import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// DELETE /store/account/addresses/:id — Soft-delete address
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const { id } = req.params

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  // Verify ownership
  const address = await pgConnection("customer_address")
    .where({ id, customer_id: customerId })
    .whereNull("deleted_at")
    .first()

  if (!address) {
    res.status(404).json({ message: "Address not found" })
    return
  }

  await pgConnection("customer_address")
    .where("id", id)
    .update({ deleted_at: new Date(), updated_at: new Date() })

  res.json({ success: true })
}
