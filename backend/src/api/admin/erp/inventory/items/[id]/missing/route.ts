import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag, createMovement } from "../../../../../../lib/inventory"

/**
 * POST /admin/erp/inventory/items/:id/missing
 *
 * Mark an item as missing during stocktake (Frank F2):
 * - Sets Release.legacy_price = 0 (item stays in catalog but is_purchasable = false)
 * - Sets price_locked = true (so sync doesn't overwrite with MySQL price)
 * - Stores old price in movement.reference for undo
 * - Status remains 'in_stock' (no written_off)
 * - Optional freetext note (Frank F3: no mandatory dropdown)
 *
 * Body: { notes?: string }
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const inventoryItemId = req.params.id
  const adminEmail = (req as any).auth_context?.actor_id || "admin"
  const body = req.body as { notes?: string } | undefined

  const item = await pg("erp_inventory_item").where("id", inventoryItemId).first()
  if (!item) {
    res.status(404).json({ message: "Inventory item not found" })
    return
  }

  await pg.transaction(async (trx) => {
    // Get current price before zeroing (needed for undo)
    const release = await trx("Release")
      .where("id", item.release_id)
      .select("legacy_price")
      .first()

    const oldPrice = release ? Number(release.legacy_price) : 0

    // Set price to 0 — item becomes not purchasable
    await trx("Release")
      .where("id", item.release_id)
      .update({
        legacy_price: 0,
        updatedAt: new Date(),
      })

    // Record movement with old price stored for undo
    await createMovement(trx, {
      inventoryItemId,
      type: "adjustment",
      quantityChange: 0,
      reason: "stocktake_missing",
      performedBy: adminEmail,
      reference: JSON.stringify({ old_price: oldPrice }),
    })

    // Lock price + mark stocktake'd
    await trx("erp_inventory_item")
      .where("id", inventoryItemId)
      .update({
        price_locked: true,
        price_locked_at: new Date(),
        last_stocktake_at: new Date(),
        last_stocktake_by: adminEmail,
        notes: body?.notes
          ? (item.notes ? item.notes + "\n" + body.notes : body.notes)
          : item.notes,
        updated_at: new Date(),
      })
  })

  res.json({ message: "Marked as missing (price set to 0)", inventory_item_id: inventoryItemId })
}
