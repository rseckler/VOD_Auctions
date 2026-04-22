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

    // Price handling: new_price updates Release.legacy_price (Copy #1 convention)
    // AND exemplar_price (so the label print pipeline reads the fresh value —
    // barcode-label.ts order is exemplar_price → direct_price → legacy_price).
    // Historically we only wrote legacy_price here, which made the label show
    // a stale exemplar_price from earlier stocktakes. Frank hit this 2026-04-22:
    // Preis geändert → Label zeigt alten Wert, DB hat auch alten Wert beim
    // Label-Pipeline-Read (COALESCE greift exemplar zuerst).
    // Release-Mirror fuer Copy #1: Preis + Conditions spiegeln auf
    // Release.legacy_price/media_condition/sleeve_condition, damit Catalog-
    // Listing + Storefront die Werte sehen (lesen Release-Felder, nicht
    // erp_inventory_item). price_locked=true (unten gesetzt) schuetzt vor
    // legacy_sync_v2 Overwrite. Wird nur fuer Copy #1 gemacht — Multi-Exemplar
    // hat eigene Preise/Conditions pro Stueck und ein Release-Mirror waere
    // ambig welche Copy gewinnt.
    if (item.copy_number === 1) {
      const releaseUpdate: Record<string, unknown> = {}

      if (body?.new_price != null && body.new_price >= 0) {
        const release = await trx("Release")
          .where("id", item.release_id)
          .select("legacy_price")
          .first()

        releaseUpdate.legacy_price = body.new_price
        reference.old_price = release ? Number(release.legacy_price) : null
        reference.new_price = body.new_price
      }

      if (body?.condition_media) {
        const current = await trx("Release")
          .where("id", item.release_id)
          .select("media_condition")
          .first()
        releaseUpdate.media_condition = body.condition_media
        reference.old_media_condition = current?.media_condition || null
        reference.new_media_condition = body.condition_media
      }

      if (body?.condition_sleeve) {
        const current = await trx("Release")
          .where("id", item.release_id)
          .select("sleeve_condition")
          .first()
        releaseUpdate.sleeve_condition = body.condition_sleeve
        reference.old_sleeve_condition = current?.sleeve_condition || null
        reference.new_sleeve_condition = body.condition_sleeve
      }

      if (Object.keys(releaseUpdate).length > 0) {
        releaseUpdate.updatedAt = new Date()
        await trx("Release").where("id", item.release_id).update(releaseUpdate)
      }

      // Mirror: new_price auch auf exemplar_price (Label-Pipeline liest
      // exemplar_price zuerst, COALESCE-Reihenfolge in barcode-label.ts).
      if (body?.new_price != null && body.new_price >= 0 && body.exemplar_price == null) {
        reference.old_exemplar_price = item.exemplar_price != null ? Number(item.exemplar_price) : null
        reference.exemplar_price_mirror = body.new_price
        // Wird unten in updateFields gesetzt (gemeinsam mit Copy-Row-Update)
      }
    } else if (body?.new_price != null && body.new_price >= 0) {
      // Copy #2+: kein Release-Mirror, aber legacy_price-Update bleibt fuer
      // Backwards-Compat (frueher hat verify das immer gemacht). Falls in
      // Zukunft Multi-Exemplar-Pricing haerter durchgezogen wird, kann das
      // hier weg.
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
    if (body?.exemplar_price != null) {
      updateFields.exemplar_price = body.exemplar_price
    } else if (
      item.copy_number === 1 &&
      body?.new_price != null &&
      body.new_price >= 0
    ) {
      // Copy #1 Mirror: new_price auch auf exemplar_price schreiben (siehe
      // Reason-Kommentar oben — Label-Pipeline liest exemplar_price zuerst)
      updateFields.exemplar_price = body.new_price
    }
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
