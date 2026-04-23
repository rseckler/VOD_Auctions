import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { createMovement } from "../../../../lib/inventory"

// GET /admin/media/:id — Single release detail with sync history
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const { id } = req.params

  // Fetch release with artist + label + format + pressorga + auction block
  // (NO inventory join — inventory is loaded separately as array to support
  // multiple exemplars per release). Auction block joined for Q6: show Block
  // Name + Link instead of raw ULID.
  //
  // Type-cast note: Release.current_block_id is uuid, auction_block.id is text
  // (ULID). Knex's default on() builder emits "r.current_block_id =
  // auction_block.id" which Postgres refuses with 42883 (uuid = text). Cast
  // to text on the uuid side so the JOIN resolves as a no-op when types
  // actually differ but matches for equal string values when compatible.
  const release = await pgConnection("Release")
    .select(
      "Release.*",
      "Artist.name as artist_name",
      "Label.name as label_name",
      "Format.name as format_name",
      "Format.format_group",
      "PressOrga.name as pressorga_name",
      "auction_block.title as current_block_title",
      "auction_block.slug as current_block_slug"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")
    .leftJoin("Format", "Release.format_id", "Format.id")
    .leftJoin("PressOrga", "Release.pressOrgaId", "PressOrga.id")
    .leftJoin("auction_block", function () {
      this.on(pgConnection.raw('"Release"."current_block_id"::text = "auction_block"."id"'))
    })
    .where("Release.id", id)
    .first()

  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  // Fetch ALL inventory items (exemplars) for this release as array.
  // Supports multi-exemplar model: each physical copy has its own row.
  let inventory_items: unknown[] = []
  try {
    inventory_items = await pgConnection("erp_inventory_item")
      .select(
        "erp_inventory_item.id as inventory_item_id",
        "erp_inventory_item.barcode as inventory_barcode",
        "erp_inventory_item.status as inventory_status",
        "erp_inventory_item.quantity as inventory_quantity",
        "erp_inventory_item.source as inventory_source",
        "erp_inventory_item.copy_number",
        "erp_inventory_item.condition_media as erp_condition_media",
        "erp_inventory_item.condition_sleeve as erp_condition_sleeve",
        "erp_inventory_item.exemplar_price",
        "erp_inventory_item.price_locked",
        "erp_inventory_item.price_locked_at",
        "erp_inventory_item.last_stocktake_at",
        "erp_inventory_item.last_stocktake_by",
        "erp_inventory_item.barcode_printed_at",
        "erp_inventory_item.notes as inventory_notes",
        "erp_inventory_item.warehouse_location_id",
        "warehouse_location.code as warehouse_location_code",
        "warehouse_location.name as warehouse_location_name"
      )
      .leftJoin("warehouse_location", "erp_inventory_item.warehouse_location_id", "warehouse_location.id")
      .where("erp_inventory_item.release_id", id)
      .orderBy("erp_inventory_item.copy_number", "asc")
  } catch {
    inventory_items = []
  }

  // Backward compatibility: flatten first item's fields onto release object
  // so existing UI code that reads release.inventory_item_id etc. still works.
  // Q1(b) COALESCE: when erp has values, surface them as the canonical
  // media_condition/sleeve_condition/inventory on the release object, so the
  // Catalog Edit-Valuation form shows the stocktake values instead of the
  // stale Release.* columns. Release.legacy_* remain the MySQL-owned fallback.
  const firstItem = inventory_items[0] as Record<string, unknown> | undefined
  if (firstItem) {
    Object.assign(release, firstItem)
    const relRec = release as Record<string, unknown>
    if (firstItem.erp_condition_media != null) relRec.media_condition = firstItem.erp_condition_media
    if (firstItem.erp_condition_sleeve != null) relRec.sleeve_condition = firstItem.erp_condition_sleeve
    if (firstItem.inventory_quantity != null) relRec.inventory = firstItem.inventory_quantity
    // Effective price: exemplar_price (Copy #2+) overrides legacy_price in display
    if (firstItem.exemplar_price != null) relRec.effective_price = firstItem.exemplar_price
  }

  // Fetch inventory movement history for ALL exemplars of this release
  let inventory_movements: unknown[] = []
  const itemIds = (inventory_items as Array<Record<string, unknown>>).map(i => i.inventory_item_id).filter(Boolean) as string[]
  if (itemIds.length > 0) {
    try {
      inventory_movements = await pgConnection("erp_inventory_movement")
        .whereIn("inventory_item_id", itemIds)
        .orderBy("created_at", "desc")
        .limit(50)
        .select(
          "id",
          "inventory_item_id",
          "type",
          "quantity_change",
          "reason",
          "reference",
          "performed_by",
          "created_at"
        )
    } catch {
      inventory_movements = []
    }
  }

  // Fetch sync history (last 20 entries)
  const sync_history = await pgConnection("sync_log")
    .where("release_id", id)
    .orderBy("sync_date", "desc")
    .limit(20)

  // Fetch images
  const images = await pgConnection("Image")
    .where("releaseId", id)
    .orderBy("rang", "asc")
    .orderBy("id", "asc")

  // Fetch import history — LEFT JOIN with import_session for collection metadata
  // A release can appear in multiple imports (inserted once, updated by later
  // runs) — return them ordered newest first.
  let import_history: unknown[] = []
  try {
    const importLogResult = await pgConnection.raw(
      `SELECT
         il.id,
         il.run_id,
         il.action,
         il.discogs_id,
         il.collection_name,
         il.import_source,
         il.created_at,
         s.id as session_id,
         s.status as session_status
       FROM import_log il
       LEFT JOIN import_session s ON s.run_id = il.run_id
       WHERE il.release_id = ? AND il.import_type = 'discogs_collection'
       ORDER BY il.created_at DESC
       LIMIT 10`,
      [id]
    )
    import_history = importLogResult.rows || []
  } catch {
    // import_log table doesn't exist yet → empty array (release pre-dates Discogs import service)
    import_history = []
  }

  res.json({ release, sync_history, images, import_history, inventory_items, inventory_movements })
}

// POST /admin/media/:id — Update editable fields
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const { id } = req.params
  const body = (req.body || {}) as Record<string, any>

  // Allowed Release fields (Q8a: discogs_id / genres / styles newly editable).
  // Note: Release.genres and Release.styles are TEXT[] in Postgres — accept
  // arrays (preferred) or comma-separated strings (for backward compat).
  const allowedReleaseFields = [
    "estimated_value",
    "sale_mode",
    "shop_price",
    "shipping_item_type_id",
    "discogs_id",
    "genres",
    "styles",
  ]
  const releaseUpdates: Record<string, any> = {}

  for (const field of allowedReleaseFields) {
    if (body[field] !== undefined) {
      releaseUpdates[field] = body[field]
    }
  }

  // Normalize genres/styles: accept string[] directly or split "a, b, c" string
  const normalizeArray = (v: unknown): string[] | null => {
    if (v == null) return null
    if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean)
    if (typeof v === "string") return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null
    return null
  }
  if (body.genres !== undefined) releaseUpdates.genres = normalizeArray(body.genres)
  if (body.styles !== undefined) releaseUpdates.styles = normalizeArray(body.styles)

  // Q1(b): media_condition, sleeve_condition, inventory are now owned by
  // erp_inventory_item when one exists. These fields are written to erp first,
  // then mirrored onto Release.* as fallback for Non-Cohort-A releases.
  const erpFields: Record<string, any> = {}
  if (body.media_condition !== undefined) erpFields.condition_media = body.media_condition || null
  if (body.sleeve_condition !== undefined) erpFields.condition_sleeve = body.sleeve_condition || null
  if (body.inventory !== undefined) erpFields.quantity = body.inventory !== "" && body.inventory !== null ? Number(body.inventory) : 1

  // warehouse_location_id also lives on erp_inventory_item
  const warehouseLocationId = body.warehouse_location_id

  const hasAnyUpdate =
    Object.keys(releaseUpdates).length > 0 ||
    Object.keys(erpFields).length > 0 ||
    warehouseLocationId !== undefined ||
    body.media_condition !== undefined ||
    body.sleeve_condition !== undefined ||
    body.inventory !== undefined

  if (!hasAnyUpdate) {
    res.status(400).json({ message: "No valid fields to update" })
    return
  }

  // Validate sale_mode
  if (releaseUpdates.sale_mode && !["auction_only", "direct_purchase", "both"].includes(releaseUpdates.sale_mode)) {
    res.status(400).json({ message: "Invalid sale_mode. Must be: auction_only, direct_purchase, or both" })
    return
  }

  // If sale_mode requires shop_price, validate it exists
  if (releaseUpdates.sale_mode && releaseUpdates.sale_mode !== "auction_only") {
    const current = await pgConnection("Release").where("id", id).select("shop_price").first()
    if (!releaseUpdates.shop_price && (!current?.shop_price || Number(current.shop_price) <= 0)) {
      res.status(400).json({ message: "shop_price is required when sale_mode is not auction_only" })
      return
    }
  }

  // Validate discogs_id is a positive integer if provided
  if (releaseUpdates.discogs_id !== undefined && releaseUpdates.discogs_id !== null && releaseUpdates.discogs_id !== "") {
    const parsed = parseInt(String(releaseUpdates.discogs_id), 10)
    if (isNaN(parsed) || parsed <= 0) {
      res.status(400).json({ message: "discogs_id must be a positive integer" })
      return
    }
    releaseUpdates.discogs_id = parsed
  } else if (releaseUpdates.discogs_id === "" || releaseUpdates.discogs_id === null) {
    releaseUpdates.discogs_id = null
  }

  // Q1(b): Also mirror the condition/inventory changes onto Release columns
  // as fallback for Non-Cohort-A releases (keeps legacy Release reads working).
  if (body.media_condition !== undefined) releaseUpdates.media_condition = body.media_condition || null
  if (body.sleeve_condition !== undefined) releaseUpdates.sleeve_condition = body.sleeve_condition || null
  if (body.inventory !== undefined) releaseUpdates.inventory = body.inventory !== "" && body.inventory !== null ? Number(body.inventory) : null

  releaseUpdates.updatedAt = new Date()

  await pgConnection.transaction(async (trx) => {
    if (Object.keys(releaseUpdates).length > 1) {
      // more than just updatedAt
      await trx("Release").where("id", id).update(releaseUpdates)
    }

    // Update erp_inventory_item(s) — applies to all exemplars of this release.
    // Condition/quantity/location are release-level concerns in the legacy
    // single-exemplar view. For proper per-exemplar edits, use the stocktake
    // session UI which targets a specific inventory_item_id.
    const erpUpdatePayload: Record<string, any> = {}
    if (Object.keys(erpFields).length > 0) Object.assign(erpUpdatePayload, erpFields)
    if (warehouseLocationId !== undefined) erpUpdatePayload.warehouse_location_id = warehouseLocationId || null

    // Single-exemplar price mirror: when Frank changes shop_price in the
    // Edit-Valuation form AND there is exactly one inventory_item for this
    // release, mirror the new price onto erp_inventory_item.exemplar_price.
    // This keeps the label print (COALESCE(exemplar, direct, legacy)) showing
    // the correct current price without forcing Frank back into the stocktake
    // session. Multi-exemplar releases are skipped — each copy has its own
    // price and a release-level change would be ambiguous.
    //
    // Audit-Trail: wenn Preis-Mirror passiert, legen wir ein Movement an
    // damit die Item-History im Catalog-Detail den Preis-Change zeigt
    // (Franks Request 2026-04-22 — auch Non-Session-Änderungen müssen in
    // der Item-History sichtbar sein).
    let priceChangeAudit: {
      itemId: string
      oldPrice: number | null
      newPrice: number
    } | null = null

    const shopPriceProvided =
      releaseUpdates.shop_price !== undefined && releaseUpdates.shop_price !== null
    if (shopPriceProvided) {
      const existingItems = await trx("erp_inventory_item")
        .where("release_id", id)
        .select("id", "exemplar_price")
      if (existingItems.length === 1) {
        const newPrice = Number(releaseUpdates.shop_price)
        const oldPrice =
          existingItems[0].exemplar_price != null
            ? Number(existingItems[0].exemplar_price)
            : null
        erpUpdatePayload.exemplar_price = newPrice
        erpUpdatePayload.price_locked = true
        erpUpdatePayload.price_locked_at = new Date()

        // Nur als Audit markieren wenn der Preis sich tatsächlich ändert
        if (oldPrice !== newPrice) {
          priceChangeAudit = {
            itemId: existingItems[0].id as string,
            oldPrice,
            newPrice,
          }
        }
      }
    }

    if (Object.keys(erpUpdatePayload).length > 0) {
      const existing = await trx("erp_inventory_item").where("release_id", id).first()
      if (existing) {
        erpUpdatePayload.updated_at = new Date()
        await trx("erp_inventory_item").where("release_id", id).update(erpUpdatePayload)
      }
      // Don't auto-create erp_inventory_item — that's done via ERP inventory session
    }

    // Preis-Change-Movement anlegen damit die Item-History im Catalog-Detail
    // (und im Session-Recent-Activity, sobald reasons auf "catalog_%" ebenfalls
    // aufgenommen werden) die Catalog-basierte Preisänderung zeigt.
    if (priceChangeAudit) {
      const actor = (req as any).auth_context?.actor_id || "admin"
      await createMovement(trx, {
        inventoryItemId: priceChangeAudit.itemId,
        type: "adjustment",
        quantityChange: 0,
        reason: "catalog_price_update",
        performedBy: actor,
        reference: JSON.stringify({
          old_price: priceChangeAudit.oldPrice,
          new_price: priceChangeAudit.newPrice,
          source: "catalog_detail",
        }),
      })
    }
  })

  // Response-Shape muss identisch zum GET sein — das Frontend (media/[id]/page.tsx)
  // setzt setRelease(d.release) direkt und Properties wie release.price_locked
  // und release.inventory_item_id sind conditional-gerendert (z.B. Label-
  // drucken-Button). Vorher gab POST nur das plain Release-Row zurück ohne
  // erp_inventory_item-Merge → price_locked=undefined → Button verschwand
  // nach Preis-Save. Frank hit this 2026-04-22.
  const release = await pgConnection("Release")
    .where("Release.id", id)
    .first()

  if (release) {
    const firstItem = await pgConnection("erp_inventory_item")
      .select(
        "id as inventory_item_id",
        "barcode as inventory_barcode",
        "status as inventory_status",
        "quantity as inventory_quantity",
        "source as inventory_source",
        "copy_number",
        "condition_media as erp_condition_media",
        "condition_sleeve as erp_condition_sleeve",
        "exemplar_price",
        "price_locked",
        "price_locked_at",
        "last_stocktake_at",
        "last_stocktake_by",
        "barcode_printed_at",
        "warehouse_location_id",
      )
      .where("release_id", id)
      .orderBy("copy_number", "asc")
      .first()

    if (firstItem) {
      Object.assign(release, firstItem)
      const relRec = release as Record<string, unknown>
      if (firstItem.erp_condition_media != null) relRec.media_condition = firstItem.erp_condition_media
      if (firstItem.erp_condition_sleeve != null) relRec.sleeve_condition = firstItem.erp_condition_sleeve
      if (firstItem.inventory_quantity != null) relRec.inventory = firstItem.inventory_quantity
      if (firstItem.exemplar_price != null) relRec.effective_price = firstItem.exemplar_price
    }
  }

  res.json({ release })
}
