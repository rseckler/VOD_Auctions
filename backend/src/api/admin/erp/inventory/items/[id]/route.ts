import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../../lib/inventory"
import { revalidateReleaseCatalogPage } from "../../../../../../lib/storefront-revalidate"
import { pushReleaseNow } from "../../../../../../lib/meilisearch-push"

/**
 * GET /admin/erp/inventory/items/:id
 *
 * Load a single inventory item by its erp_inventory_item.id in the same
 * QueueItem format that the stocktake session screen consumes. Used by
 * the "Load in Stocktake Session" button on the Media Detail page to
 * pre-load a specific item without having to scan its barcode (the item
 * may not even have a barcode yet if it's never been verified).
 *
 * Response shape matches GET /admin/erp/inventory/scan/:barcode so the
 * session page's state handling works identically.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const itemId = req.params.id

  if (!itemId) {
    res.status(400).json({ message: "Missing inventory item ID" })
    return
  }

  const result = await pg.raw(`
    SELECT
      ii.id AS inventory_item_id,
      ii.barcode,
      ii.status,
      ii.price_locked,
      ii.last_stocktake_at,
      ii.barcode_printed_at,
      ii.notes AS inventory_notes,
      ii.warehouse_location_id,
      r.id AS release_id,
      r.title,
      r.slug,
      r.format,
      r.format_v2,
      r."coverImage",
      r."catalogNumber",
      r.legacy_price,
      r.legacy_condition,
      r.legacy_format_detail,
      r.year,
      r.country,
      r.product_category,
      r.discogs_id,
      r.discogs_lowest_price,
      r.discogs_median_price,
      r.discogs_highest_price,
      r.discogs_num_for_sale,
      a.name AS artist_name,
      l.name AS label_name,
      CASE
        WHEN r.format = 'LP' THEN 1
        WHEN r.format IN ('CASSETTE', 'REEL') THEN 2
        WHEN r.format IN ('MAGAZINE', 'BOOK', 'ZINE', 'POSTER', 'PHOTO', 'POSTCARD') THEN 3
        ELSE 4
      END AS format_group
    FROM erp_inventory_item ii
    JOIN "Release" r ON r.id = ii.release_id
    LEFT JOIN "Artist" a ON a.id = r."artistId"
    LEFT JOIN "Label" l ON l.id = r."labelId"
    WHERE ii.id = ?
    LIMIT 1
  `, [itemId])

  if (!result.rows.length) {
    res.status(404).json({ message: `No inventory item found for id ${itemId}` })
    return
  }

  const row = result.rows[0]
  res.json({
    ...row,
    legacy_price: row.legacy_price != null ? Number(row.legacy_price) : null,
    discogs_lowest_price: row.discogs_lowest_price != null ? Number(row.discogs_lowest_price) : null,
    discogs_median_price: row.discogs_median_price != null ? Number(row.discogs_median_price) : null,
    discogs_highest_price: row.discogs_highest_price != null ? Number(row.discogs_highest_price) : null,
    discogs_url: row.discogs_id ? `https://www.discogs.com/release/${row.discogs_id}` : null,
    format_group_label:
      row.format_group === 1 ? "Vinyl" :
      row.format_group === 2 ? "Tape" :
      row.format_group === 3 ? "Print" : "Other",
  })
}

/**
 * PATCH /admin/erp/inventory/items/:id
 *
 * Quick-Edit pro Exemplar aus der Catalog-Detail-Page (rc52.6.3).
 * Erlaubte Felder: exemplar_price, condition_media, condition_sleeve,
 * warehouse_location_id, notes. Schreibt nur was im body ist (partial update).
 *
 * Audit-Trail: erp_inventory_movement type='adjustment' mit JSON-Diff
 * im reference-Feld. quantity_change=0 (rein metadata-Edit).
 *
 * Single-Copy-Mirror: wenn der Release nur 1 erp_inventory_item hat UND
 * exemplar_price geändert wurde → mirror auf Release.shop_price (matcht
 * das rc47.x Verify-Pattern in lib/shop-price.ts).
 */
export async function PATCH(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const itemId = req.params.id
  if (!itemId) {
    res.status(400).json({ message: "Missing inventory item ID" })
    return
  }

  const body = req.body as {
    exemplar_price?: number | string | null
    condition_media?: string | null
    condition_sleeve?: string | null
    warehouse_location_id?: string | null
    notes?: string | null
  }

  const current = await pg("erp_inventory_item")
    .where({ id: itemId })
    .select(
      "id",
      "release_id",
      "status",
      "exemplar_price",
      "condition_media",
      "condition_sleeve",
      "warehouse_location_id",
      "notes",
      "price_locked"
    )
    .first()
  if (!current) {
    res.status(404).json({ message: `No inventory item found for id ${itemId}` })
    return
  }

  if (current.status === "sold" || current.status === "shipped") {
    res.status(409).json({
      message: `Item ist bereits ${current.status} — keine Quick-Edit möglich. Status zuerst zurücksetzen.`,
    })
    return
  }

  // Build patch — nur Felder die im body kamen
  const patch: Record<string, unknown> = {}
  const diff: Record<string, { from: unknown; to: unknown }> = {}

  if ("exemplar_price" in body) {
    const raw = body.exemplar_price
    let parsed: number | null
    if (raw === null || raw === "" || raw === undefined) {
      parsed = null
    } else {
      parsed = typeof raw === "number" ? raw : parseFloat(String(raw).replace(",", "."))
      if (!Number.isFinite(parsed) || parsed < 0) {
        res.status(400).json({ message: "exemplar_price must be a non-negative number or null" })
        return
      }
    }
    const old = current.exemplar_price != null ? Number(current.exemplar_price) : null
    if (old !== parsed) {
      patch.exemplar_price = parsed
      diff.exemplar_price = { from: old, to: parsed }
    }
  }

  if ("condition_media" in body) {
    const v = (body.condition_media ?? null) as string | null
    const norm = v ? v.trim() : null
    if (norm !== (current.condition_media ?? null)) {
      patch.condition_media = norm
      diff.condition_media = { from: current.condition_media, to: norm }
    }
  }
  if ("condition_sleeve" in body) {
    const v = (body.condition_sleeve ?? null) as string | null
    const norm = v ? v.trim() : null
    if (norm !== (current.condition_sleeve ?? null)) {
      patch.condition_sleeve = norm
      diff.condition_sleeve = { from: current.condition_sleeve, to: norm }
    }
  }
  if ("warehouse_location_id" in body) {
    const v = (body.warehouse_location_id ?? null) as string | null
    const norm = v ? v.trim() : null
    if (norm !== (current.warehouse_location_id ?? null)) {
      if (norm) {
        const loc = await pg("warehouse_location").where({ id: norm }).select("id").first()
        if (!loc) {
          res.status(400).json({ message: `Unknown warehouse_location_id: ${norm}` })
          return
        }
      }
      patch.warehouse_location_id = norm
      diff.warehouse_location_id = { from: current.warehouse_location_id, to: norm }
    }
  }
  if ("notes" in body) {
    const v = (body.notes ?? null) as string | null
    const norm = v ? v.trim() : null
    if (norm !== (current.notes ?? null)) {
      patch.notes = norm
      diff.notes = { from: current.notes, to: norm }
    }
  }

  if (Object.keys(patch).length === 0) {
    res.json({ ok: true, unchanged: true })
    return
  }

  patch.updated_at = new Date()

  const actor = (req as any).auth_context?.actor_id
    ? {
        id: (req as any).auth_context.actor_id,
        email: (req as any).auth_context.user?.email ?? null,
      }
    : { id: "admin", email: null }

  let priceMirrored = false

  await pg.transaction(async (trx) => {
    await trx("erp_inventory_item").where({ id: itemId }).update(patch)

    await trx("erp_inventory_movement").insert({
      id: generateEntityId(),
      inventory_item_id: itemId,
      type: "adjustment",
      quantity_change: 0,
      reason: "quick-edit",
      reference: JSON.stringify(diff),
      performed_by: actor.email ?? actor.id,
      created_at: new Date(),
    })

    // Single-Copy-Mirror: wenn nur 1 Item für den Release UND price geändert
    if ("exemplar_price" in patch) {
      const total = await trx("erp_inventory_item")
        .where({ release_id: current.release_id })
        .count<{ count: string }>("id as count")
        .first()
      const totalCount = Number(total?.count ?? 0)
      if (totalCount === 1) {
        await trx("Release")
          .where({ id: current.release_id })
          .update({
            shop_price: patch.exemplar_price,
            search_indexed_at: null,
            updatedAt: new Date(),
          })
        priceMirrored = true
      } else {
        // Multi-Copy: nur search_indexed_at bumpen
        await trx("Release")
          .where({ id: current.release_id })
          .update({ search_indexed_at: null, updatedAt: new Date() })
      }
    } else {
      await trx("Release")
        .where({ id: current.release_id })
        .update({ search_indexed_at: null, updatedAt: new Date() })
    }
  })

  pushReleaseNow(pg, current.release_id).catch(() => {})
  revalidateReleaseCatalogPage(current.release_id)

  res.json({
    ok: true,
    item_id: itemId,
    diff,
    price_mirrored_to_release: priceMirrored,
  })
}
