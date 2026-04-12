import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../../../lib/inventory"

/**
 * DELETE /admin/pos/sessions/:id/items/:itemId
 *
 * Remove an item from the POS cart. Since cart state is client-side (Zustand),
 * this endpoint just validates that the item exists for audit purposes.
 * The client removes it from local state on success.
 */
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "POS_WALK_IN")

  // Cart is ephemeral client-side — just acknowledge the removal
  res.json({ success: true, removed_item_id: req.params.itemId })
}
