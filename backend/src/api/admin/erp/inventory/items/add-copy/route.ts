import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag, createMovement, assignBarcode } from "../../../../../../lib/inventory"
import { pushReleaseNow } from "../../../../../../lib/meilisearch-push"

/**
 * POST /admin/erp/inventory/items/add-copy
 *
 * Creates a new exemplar (copy) for a release that already has at least one
 * erp_inventory_item. Used when Frank finds a second (or third, etc.) physical
 * copy of the same release during stocktake.
 *
 * Body: {
 *   release_id: string (required),
 *   condition_media?: string,
 *   condition_sleeve?: string,
 *   exemplar_price?: number,
 *   notes?: string
 * }
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const body = req.body as Record<string, any>
  const { release_id, condition_media, condition_sleeve, exemplar_price, notes } = body

  if (!release_id) {
    res.status(400).json({ message: "release_id is required" })
    return
  }

  // Verify release exists
  const release = await pg("Release").where("id", release_id).select("id", "legacy_price").first()
  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  // Check if exemplars already exist (determines copy_number)
  // If none exist, this is the first exemplar for a non-Cohort-A release — that's OK.

  // Get admin email from auth
  const adminEmail = (req as any).auth_context?.actor_id
    ? await pg("user").where("id", (req as any).auth_context.actor_id).select("email").first().then((u: any) => u?.email || "admin")
    : "admin"

  // Determine next copy_number
  const maxCopy = await pg("erp_inventory_item")
    .where("release_id", release_id)
    .max("copy_number as max_cn")
    .first()
  const nextCopyNumber = (maxCopy?.max_cn || 0) + 1

  const itemId = generateEntityId()

  await pg.transaction(async (trx) => {
    // Warehouse-Default: wenn keine Location explizit, auf is_default=true.
    const defaultLoc = await trx("warehouse_location")
      .where({ is_default: true, is_active: true })
      .select("id")
      .first()

    // Create the new exemplar
    await trx("erp_inventory_item").insert({
      id: itemId,
      release_id,
      copy_number: nextCopyNumber,
      source: "frank_collection",
      quantity: 1,
      quantity_reserved: 0,
      status: "in_stock",
      tax_scheme: "margin_scheme_25a",
      condition_media: condition_media || null,
      condition_sleeve: condition_sleeve || null,
      exemplar_price: exemplar_price != null ? exemplar_price : null,
      warehouse_location_id: defaultLoc?.id || null,
      notes: notes || null,
      price_locked: true,
      price_locked_at: new Date(),
      last_stocktake_at: new Date(),
      last_stocktake_by: adminEmail,
      created_at: new Date(),
      updated_at: new Date(),
    })

    // Copy #1 Mirror auf Release: bei der ersten Erfassung dieses Releases
    // muessen Preis + Conditions auch in die Release-Felder.
    // Preis-Modell rc47.x: shop_price ist kanonisch, legacy_price wird
    // defensiv mit gespiegelt (Legacy-Sync-Konflikt-Schutz). sale_mode
    // default='both' wenn bisher NULL/auction_only.
    if (nextCopyNumber === 1) {
      const currentRel = await trx("Release")
        .where("id", release_id)
        .select("sale_mode")
        .first()
      const releaseUpdate: Record<string, unknown> = { updatedAt: new Date() }
      if (exemplar_price != null) {
        releaseUpdate.shop_price = exemplar_price
        releaseUpdate.legacy_price = exemplar_price
      }
      if (condition_media) releaseUpdate.media_condition = condition_media
      if (condition_sleeve) releaseUpdate.sleeve_condition = condition_sleeve
      if (!currentRel?.sale_mode || currentRel.sale_mode === "auction_only") {
        releaseUpdate.sale_mode = "both"
      }
      if (Object.keys(releaseUpdate).length > 1) {
        await trx("Release").where("id", release_id).update(releaseUpdate)
      }
    }

    // Create inbound movement
    await createMovement(trx, {
      inventoryItemId: itemId,
      type: "inbound",
      quantityChange: 1,
      reason: "stocktake_additional_copy",
      performedBy: adminEmail,
      reference: JSON.stringify({
        copy_number: nextCopyNumber,
        condition_media: condition_media || null,
        condition_sleeve: condition_sleeve || null,
        exemplar_price: exemplar_price != null ? exemplar_price : null,
        mirrored_to_release: nextCopyNumber === 1,
      }),
    })

    // Assign barcode
    await assignBarcode(trx, itemId)
  })

  // Fetch the created item with barcode
  const newItem = await pg("erp_inventory_item")
    .where("id", itemId)
    .select("id", "barcode", "copy_number", "condition_media", "condition_sleeve", "exemplar_price", "last_stocktake_at")
    .first()

  res.status(201).json({
    message: "Copy created",
    item: {
      id: newItem.id,
      barcode: newItem.barcode,
      copy_number: newItem.copy_number,
      condition_media: newItem.condition_media,
      condition_sleeve: newItem.condition_sleeve,
      exemplar_price: newItem.exemplar_price != null ? Number(newItem.exemplar_price) : null,
      is_verified: true,
    },
    label_url: `/admin/erp/inventory/items/${itemId}/label`,
  })

  // Klasse-B on-demand-Reindex (rc48 §3.8) — neue Copy soll sofort in
  // Admin-Tabs (v.a. "Mehrere Ex.") sichtbar sein.
  pushReleaseNow(pg, release_id).catch((err) => {
    console.warn(
      JSON.stringify({
        event: "meili_push_now_failed",
        handler: "inventory_add_copy",
        release_id,
        error: err?.message,
      })
    )
  })
}
