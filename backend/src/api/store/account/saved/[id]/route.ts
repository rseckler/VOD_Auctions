import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { rudderTrack } from "../../../../../lib/rudderstack"

// DELETE /store/account/saved/:id — Remove saved item
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

  const item = await pgConnection("saved_item")
    .where({ id, user_id: customerId })
    .whereNull("deleted_at")
    .first()

  if (!item) {
    res.status(404).json({ message: "Saved item not found" })
    return
  }

  await pgConnection("saved_item")
    .where({ id })
    .update({ deleted_at: new Date() })

  rudderTrack(customerId, "Item Unsaved", { saved_item_id: id })

  res.json({ message: "Item removed from saved" })
}
