import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag, createMovement, lockPrice, assignBarcode } from "../../../../../../../lib/inventory"

/**
 * POST /admin/erp/inventory/items/:id/verify
 *
 * Verify an exemplar during stocktake: confirm it exists, set condition,
 * optionally adjust price. Sets price_locked=true so the hourly sync
 * won't overwrite.
 *
 * Body: {
 *   new_price?: number,          // Updates Release.legacy_price (for copy #1) or exemplar_price (for copy #2+)
 *   condition_media?: string,    // M|NM|VG+|VG|G+|G|F|P
 *   condition_sleeve?: string,   // M|NM|VG+|VG|G+|G|F|P
 *   exemplar_price?: number,     // Individual price for this copy (overrides legacy_price)
 *   notes?: string
 * }
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const inventoryItemId = req.params.id
  const adminEmail = (req as any).auth_context?.actor_id || "admin"
  const body = req.body as {
    new_price?: number
    condition_media?: string
    condition_sleeve?: string
    exemplar_price?: number
    notes?: string
  } | undefined

  const item = await pg("erp_inventory_item").where("id", inventoryItemId).first()
  if (!item) {
    res.status(404).json({ message: "Inventory item not found" })
    return
  }

  await pg.transaction(async (trx) => {
    // Build reference for movement audit trail
    const reference: Record<string, unknown> = {}

    // Price handling: new_price updates Release.legacy_price,
    // exemplar_price updates the individual copy's price
    if (body?.new_price != null && body.new_price >= 0) {
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

      reference.old_price = release ? Number(release.legacy_price) : null
      reference.new_price = body.new_price
    }

    if (body?.exemplar_price != null) {
      reference.exemplar_price = body.exemplar_price
      reference.old_exemplar_price = item.exemplar_price != null ? Number(item.exemplar_price) : null
    }

    if (body?.condition_media) {
      reference.condition_media = body.condition_media
    }
    if (body?.condition_sleeve) {
      reference.condition_sleeve = body.condition_sleeve
    }

    const hasChanges = Object.keys(reference).length > 0

    await createMovement(trx, {
      inventoryItemId,
      type: "adjustment",
      quantityChange: 0,
      reason: hasChanges ? "stocktake_verify_with_changes" : "stocktake_verify",
      performedBy: adminEmail,
      reference: hasChanges ? JSON.stringify(reference) : undefined,
    })

    // Assign barcode if not already set
    await assignBarcode(trx, inventoryItemId)

    // Update inventory item: lock price, mark stocktake, set condition + exemplar_price
    const updateFields: Record<string, unknown> = {
      price_locked: true,
      price_locked_at: new Date(),
      last_stocktake_at: new Date(),
      last_stocktake_by: adminEmail,
      updated_at: new Date(),
    }

    if (body?.condition_media) updateFields.condition_media = body.condition_media
    if (body?.condition_sleeve) updateFields.condition_sleeve = body.condition_sleeve
    if (body?.exemplar_price != null) updateFields.exemplar_price = body.exemplar_price
    if (body?.notes != null) updateFields.notes = body.notes || item.notes

    await trx("erp_inventory_item")
      .where("id", inventoryItemId)
      .update(updateFields)
  })

  // Read back the updated item
  const updated = await pg("erp_inventory_item")
    .where("id", inventoryItemId)
    .select("barcode", "condition_media", "condition_sleeve", "exemplar_price", "copy_number")
    .first()

  res.json({
    message: "Verified",
    inventory_item_id: inventoryItemId,
    barcode: updated?.barcode || null,
    copy_number: updated?.copy_number || 1,
    condition_media: updated?.condition_media || null,
    condition_sleeve: updated?.condition_sleeve || null,
    exemplar_price: updated?.exemplar_price != null ? Number(updated.exemplar_price) : null,
    label_url: `/admin/erp/inventory/items/${inventoryItemId}/label`,
  })
}
