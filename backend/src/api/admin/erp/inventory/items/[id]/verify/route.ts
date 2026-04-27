import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag, createMovement, lockPrice, assignBarcode } from "../../../../../../../lib/inventory"
import { pushReleaseNow } from "../../../../../../../lib/meilisearch-push"

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
    // rc52.2: explizite Lagerort-Wahl aus dem Inventur-UI. Wenn das Feld
    // im Body steht (auch wenn null) → verwenden statt Default-on-NULL.
    // Wenn Feld fehlt → bisherige Default-Logik.
    warehouse_location_id?: string | null
  } | undefined
  // Distinguish "Feld nicht im Body" vs. "Feld explizit null" — letzteres
  // soll erlaubt sein wenn der User das Lager bewusst entfernt.
  const warehouseExplicit = body !== undefined && Object.prototype.hasOwnProperty.call(body, "warehouse_location_id")

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
    // barcode-label.ts order is exemplar_price → shop_price → legacy_price).
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
        // Preis-Schreib-Modell (rc47.x): shop_price ist ab jetzt der
        // kanonische Shop-Preis. legacy_price bleibt nur noch als Info
        // erhalten (MySQL-Import-Historie). Wir spiegeln trotzdem auch auf
        // legacy_price damit bestehende Leser (Legacy-Sync-Konflikt-Detection
        // via price_locked, diverse Scripts) weiter funktionieren.
        const release = await trx("Release")
          .where("id", item.release_id)
          .select("shop_price", "legacy_price", "sale_mode")
          .first()

        releaseUpdate.shop_price = body.new_price
        releaseUpdate.legacy_price = body.new_price
        reference.old_shop_price = release?.shop_price != null ? Number(release.shop_price) : null
        reference.old_legacy_price = release?.legacy_price != null ? Number(release.legacy_price) : null
        reference.new_price = body.new_price

        // Sale-Mode-Default: wenn bisher NULL oder auction_only, auf 'both'
        // kippen. direct_purchase oder 'both' nie überschreiben — das waren
        // explizite User-Choices.
        if (!release?.sale_mode || release.sale_mode === "auction_only") {
          releaseUpdate.sale_mode = "both"
          reference.old_sale_mode = release?.sale_mode || null
          reference.new_sale_mode = "both"
        }
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

    // Warehouse-Resolution (rc52.2):
    //   1. Wenn body.warehouse_location_id explizit (auch null) → nutzen.
    //      Validierung: wenn non-null, muss die ID in warehouse_location existieren
    //      und is_active=true sein. Sonst 400.
    //   2. Sonst Fallback wie bisher: nur setzen wenn Item-Location NULL ist,
    //      auf is_default=true.
    if (warehouseExplicit) {
      const newLocId = body?.warehouse_location_id ?? null
      if (newLocId !== null) {
        const loc = await trx("warehouse_location")
          .where({ id: newLocId, is_active: true })
          .select("id", "code")
          .first()
        if (!loc) {
          // Hard-fail damit Frontend den Bug sieht statt stiller Fallback
          throw new Error(`warehouse_location_id '${newLocId}' nicht gefunden oder inaktiv`)
        }
        if (item.warehouse_location_id !== loc.id) {
          reference.old_warehouse_location_id = item.warehouse_location_id || null
          reference.new_warehouse_location_id = loc.id
          reference.new_warehouse_code = loc.code
        }
      } else if (item.warehouse_location_id !== null) {
        reference.old_warehouse_location_id = item.warehouse_location_id
        reference.new_warehouse_location_id = null
      }
      updateFields.warehouse_location_id = newLocId
    } else if (!item.warehouse_location_id) {
      // Default-on-NULL: wenn das Exemplar noch keine Location hat, beim
      // ersten Verify auf die als default markierte Location setzen.
      const defaultLoc = await trx("warehouse_location")
        .where({ is_default: true, is_active: true })
        .select("id")
        .first()
      if (defaultLoc?.id) {
        updateFields.warehouse_location_id = defaultLoc.id
      }
    }

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

  // Klasse-B on-demand-Reindex (rc48 §3.8) — fire-and-forget nach response.
  // Frank will das verifizierte Item sofort im Admin-Catalog + Inventory-Tabs
  // sehen, nicht erst nach 5-min-Delta-Cron.
  pushReleaseNow(pg, item.release_id).catch((err) => {
    console.warn(
      JSON.stringify({
        event: "meili_push_now_failed",
        handler: "inventory_verify",
        release_id: item.release_id,
        error: err?.message,
      })
    )
  })
}
