import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag, createMovement, unlockPrice } from "../../../../../../../lib/inventory"

/**
 * POST /admin/erp/inventory/items/:id/reset
 *
 * Undo last stocktake action on an item:
 * - Restores price from the most recent movement.reference (if was missing)
 * - Clears price_locked, last_stocktake_at, last_stocktake_by
 * - Item returns to the stocktake queue
 *
 * No body required.
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

  if (!item.last_stocktake_at) {
    res.status(400).json({ message: "Item has not been stocktake'd — nothing to reset" })
    return
  }

  await pg.transaction(async (trx) => {
    // Find the most recent stocktake movement to check if we need to restore price
    const lastMovement = await trx("erp_inventory_movement")
      .where("inventory_item_id", inventoryItemId)
      .whereIn("reason", ["stocktake_missing", "stocktake_verify_price_change", "stocktake_verify"])
      .orderBy("created_at", "desc")
      .first()

    // If was missing, restore old price from movement reference
    if (lastMovement?.reason === "stocktake_missing" && lastMovement.reference) {
      try {
        const ref = JSON.parse(lastMovement.reference)
        if (ref.old_price != null) {
          await trx("Release")
            .where("id", item.release_id)
            .update({
              legacy_price: ref.old_price,
              updatedAt: new Date(),
            })
        }
      } catch {
        // Reference not parseable — skip price restore
      }
    }

    // If was verify with price change, restore old price
    if (lastMovement?.reason === "stocktake_verify_price_change" && lastMovement.reference) {
      try {
        const ref = JSON.parse(lastMovement.reference)
        if (ref.old_price != null) {
          await trx("Release")
            .where("id", item.release_id)
            .update({
              legacy_price: ref.old_price,
              updatedAt: new Date(),
            })
        }
      } catch {
        // Skip
      }
    }

    // Reset stocktake state
    await trx("erp_inventory_item")
      .where("id", inventoryItemId)
      .update({
        price_locked: false,
        price_locked_at: null,
        last_stocktake_at: null,
        last_stocktake_by: null,
        updated_at: new Date(),
      })

    // Record the undo movement
    await createMovement(trx, {
      inventoryItemId,
      type: "adjustment",
      quantityChange: 0,
      reason: "stocktake_undo",
      performedBy: adminEmail,
    })
  })

  res.json({ message: "Reset — item returned to queue", inventory_item_id: inventoryItemId })
}
