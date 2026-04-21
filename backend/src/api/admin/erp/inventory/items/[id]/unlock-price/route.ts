import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag, createMovement } from "../../../../../../../lib/inventory"

/**
 * POST /admin/erp/inventory/items/:id/unlock-price
 *
 * Sets price_locked=false on an erp_inventory_item so the hourly legacy
 * sync will again overwrite Release.legacy_price. Used when Frank wants
 * to reset a price back to the MySQL-tracked value (e.g. after an
 * incorrect stocktake).
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const inventoryItemId = req.params.id
  const adminEmail = (req as any).auth_context?.actor_id || "admin"

  const item = await pg("erp_inventory_item").where("id", inventoryItemId).first()
  if (!item) {
    res.status(404).json({ message: "Inventory item not found" })
    return
  }

  if (!item.price_locked) {
    res.status(200).json({ message: "Already unlocked", price_locked: false })
    return
  }

  await pg.transaction(async (trx) => {
    await trx("erp_inventory_item")
      .where("id", inventoryItemId)
      .update({
        price_locked: false,
        price_locked_at: null,
        updated_at: new Date(),
      })

    await createMovement(trx, {
      inventoryItemId,
      type: "adjustment",
      quantityChange: 0,
      reason: "price_unlock",
      performedBy: adminEmail,
      reference: JSON.stringify({
        was_locked_at: item.price_locked_at,
        exemplar_price_at_unlock: item.exemplar_price != null ? Number(item.exemplar_price) : null,
      }),
    })
  })

  res.json({
    message: "Price unlocked — next legacy sync will overwrite Release.legacy_price",
    inventory_item_id: inventoryItemId,
    price_locked: false,
  })
}
