import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/media/:id — Single release detail with sync history
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const { id } = req.params

  // Fetch release with artist + label + format + pressorga (NO inventory join —
  // inventory is loaded separately as array to support multiple exemplars per release)
  const release = await pgConnection("Release")
    .select(
      "Release.*",
      "Artist.name as artist_name",
      "Label.name as label_name",
      "Format.name as format_name",
      "Format.format_group",
      "PressOrga.name as pressorga_name"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")
    .leftJoin("Format", "Release.format_id", "Format.id")
    .leftJoin("PressOrga", "Release.pressOrgaId", "PressOrga.id")
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
      .orderBy("erp_inventory_item.created_at", "asc")
  } catch {
    inventory_items = []
  }

  // Backward compatibility: flatten first item's fields onto release object
  // so existing UI code that reads release.inventory_item_id etc. still works.
  const firstItem = inventory_items[0] as Record<string, unknown> | undefined
  if (firstItem) {
    Object.assign(release, firstItem)
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

  // Only allow editing these fields
  const allowedFields = [
    "estimated_value",
    "media_condition",
    "sleeve_condition",
    "sale_mode",
    "direct_price",
    "inventory",
    "shipping_item_type_id",
    "warehouse_location_id",
  ]
  const updates: Record<string, any> = {}

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field]
    }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({
      message: "No valid fields to update",
    })
    return
  }

  // Validate sale_mode
  if (updates.sale_mode && !["auction_only", "direct_purchase", "both"].includes(updates.sale_mode)) {
    res.status(400).json({ message: "Invalid sale_mode. Must be: auction_only, direct_purchase, or both" })
    return
  }

  // If sale_mode requires direct_price, validate it exists
  if (updates.sale_mode && updates.sale_mode !== "auction_only") {
    const current = await pgConnection("Release").where("id", id).select("direct_price").first()
    if (!updates.direct_price && (!current?.direct_price || Number(current.direct_price) <= 0)) {
      res.status(400).json({ message: "direct_price is required when sale_mode is not auction_only" })
      return
    }
  }

  // Handle warehouse_location_id separately (lives on erp_inventory_item, not Release)
  const warehouseLocationId = req.body.warehouse_location_id
  delete updates.warehouse_location_id

  updates.updatedAt = new Date()

  await pgConnection("Release").where("id", id).update(updates)

  // Update erp_inventory_item(s) if warehouse_location_id was provided.
  // Applies to ALL exemplars of this release (warehouse is a physical location
  // that typically applies to all copies of the same release).
  if (warehouseLocationId !== undefined) {
    const existing = await pgConnection("erp_inventory_item").where("release_id", id).first()
    if (existing) {
      await pgConnection("erp_inventory_item").where("release_id", id).update({
        warehouse_location_id: warehouseLocationId || null,
        updated_at: new Date(),
      })
    }
    // Don't auto-create erp_inventory_item — that's done via ERP inventory session
  }

  const release = await pgConnection("Release")
    .where("Release.id", id)
    .first()
  res.json({ release })
}
