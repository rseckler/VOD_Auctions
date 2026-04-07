import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../../lib/inventory"

/**
 * POST /admin/erp/inventory/items/:id/note
 * Add a note to an inventory item without changing its status or price.
 * Body: { notes: string }
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const inventoryItemId = req.params.id
  const body = req.body as { notes?: string } | undefined

  if (!body?.notes) {
    res.status(400).json({ message: "notes field is required" })
    return
  }

  const item = await pg("erp_inventory_item").where("id", inventoryItemId).first()
  if (!item) {
    res.status(404).json({ message: "Inventory item not found" })
    return
  }

  const newNotes = item.notes
    ? item.notes + "\n" + body.notes
    : body.notes

  await pg("erp_inventory_item")
    .where("id", inventoryItemId)
    .update({ notes: newNotes, updated_at: new Date() })

  res.json({ message: "Note added", inventory_item_id: inventoryItemId })
}
