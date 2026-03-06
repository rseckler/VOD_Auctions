import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/shipping/item-types — List all item types
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  try {
    const types = await pg("shipping_item_type").orderBy("sort_order", "asc")
    res.json({ item_types: types })
  } catch (error: any) {
    res.status(500).json({ message: "Failed to fetch item types" })
  }
}

// POST /admin/shipping/item-types — Create or update item type
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const body = req.body as any

  const { id, name, slug, default_weight_grams, is_oversized, format_group, sort_order } = body

  if (!name || !slug || default_weight_grams === undefined) {
    res.status(400).json({ message: "name, slug, and default_weight_grams are required" })
    return
  }

  try {
    if (id) {
      // Update existing
      await pg("shipping_item_type").where("id", id).update({
        name,
        slug,
        default_weight_grams,
        is_oversized: is_oversized || false,
        format_group: format_group || null,
        sort_order: sort_order || 0,
        updated_at: new Date(),
      })
    } else {
      // Create new
      const newId = `sit-${slug}`
      await pg("shipping_item_type").insert({
        id: newId,
        name,
        slug,
        default_weight_grams,
        is_oversized: is_oversized || false,
        format_group: format_group || null,
        sort_order: sort_order || 0,
      })
    }

    const types = await pg("shipping_item_type").orderBy("sort_order", "asc")
    res.json({ item_types: types })
  } catch (error: any) {
    console.error("[admin/shipping/item-types] Error:", error)
    res.status(500).json({ message: "Failed to save item type" })
  }
}

// DELETE /admin/shipping/item-types — Delete item type
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.query as { id?: string }

  if (!id) {
    res.status(400).json({ message: "id query param required" })
    return
  }

  try {
    // Check if any releases use this type
    const count = await pg("Release").where("shipping_item_type_id", id).count("* as cnt").first()
    if (count && Number(count.cnt) > 0) {
      res.status(400).json({ message: `Cannot delete: ${count.cnt} releases use this type` })
      return
    }

    await pg("shipping_item_type").where("id", id).delete()
    const types = await pg("shipping_item_type").orderBy("sort_order", "asc")
    res.json({ item_types: types })
  } catch (error: any) {
    res.status(500).json({ message: "Failed to delete item type" })
  }
}
