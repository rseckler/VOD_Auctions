import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag, createMovement, lockPrice, assignBarcode } from "../../../../../../lib/inventory"

/**
 * POST /admin/erp/inventory/items/:id/verify
 *
 * Verify an item during stocktake: confirm it exists, optionally adjust price.
 * Sets price_locked=true so the hourly sync won't overwrite.
 *
 * Body: { new_price?: number, notes?: string }
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const inventoryItemId = req.params.id
  const adminEmail = (req as any).auth_context?.actor_id || "admin"
  const body = req.body as { new_price?: number; notes?: string } | undefined

  const item = await pg("erp_inventory_item").where("id", inventoryItemId).first()
  if (!item) {
    res.status(404).json({ message: "Inventory item not found" })
    return
  }

  await pg.transaction(async (trx) => {
    // If new price provided, update Release.legacy_price
    if (body?.new_price != null && body.new_price >= 0) {
      // Get old price for the movement reference
      const release = await trx("Release")
        .where("id", item.release_id)
        .select("legacy_price")
        .first()

      await trx("Release")
        .where("id", item.release_id)
        .update({
          legacy_price: body.new_price,
          updatedAt: new Date(),
        })

      await createMovement(trx, {
        inventoryItemId,
        type: "adjustment",
        quantityChange: 0,
        reason: "stocktake_verify_price_change",
        performedBy: adminEmail,
        reference: JSON.stringify({
          old_price: release ? Number(release.legacy_price) : null,
          new_price: body.new_price,
        }),
      })
    } else {
      // Verify without price change
      await createMovement(trx, {
        inventoryItemId,
        type: "adjustment",
        quantityChange: 0,
        reason: "stocktake_verify",
        performedBy: adminEmail,
      })
    }

    // Assign barcode if not already set
    const barcode = await assignBarcode(trx, inventoryItemId)

    // Lock price + mark as stocktake'd
    await trx("erp_inventory_item")
      .where("id", inventoryItemId)
      .update({
        price_locked: true,
        price_locked_at: new Date(),
        last_stocktake_at: new Date(),
        last_stocktake_by: adminEmail,
        notes: body?.notes || item.notes,
        updated_at: new Date(),
      })
  })

  // Read back the assigned barcode
  const updated = await pg("erp_inventory_item")
    .where("id", inventoryItemId)
    .select("barcode")
    .first()

  res.json({
    message: "Verified",
    inventory_item_id: inventoryItemId,
    barcode: updated?.barcode || null,
    label_url: `/admin/erp/inventory/items/${inventoryItemId}/label`,
  })
}
