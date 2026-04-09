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

  // Fetch release with artist + label + format + pressorga + erp location
  const release = await pgConnection("Release")
    .select(
      "Release.*",
      "Artist.name as artist_name",
      "Label.name as label_name",
      "Format.name as format_name",
      "Format.format_group",
      "PressOrga.name as pressorga_name",
      "erp_inventory_item.warehouse_location_id"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")
    .leftJoin("Format", "Release.format_id", "Format.id")
    .leftJoin("PressOrga", "Release.pressOrgaId", "PressOrga.id")
    .leftJoin("erp_inventory_item", "Release.id", "erp_inventory_item.release_id")
    .where("Release.id", id)
    .first()

  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
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

  res.json({ release, sync_history, images })
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

  // Update or create erp_inventory_item if warehouse_location_id was provided
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
    .select("Release.*", "erp_inventory_item.warehouse_location_id")
    .leftJoin("erp_inventory_item", "Release.id", "erp_inventory_item.release_id")
    .where("Release.id", id)
    .first()
  res.json({ release })
}
