import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/shipping/methods — List all shipping methods
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  try {
    const methods = await pg("shipping_method").orderBy(["zone_id", "sort_order"])
    res.json({ methods })
  } catch (error: any) {
    console.error("[admin/shipping/methods] Error:", error)
    res.status(500).json({ message: "Failed to fetch shipping methods" })
  }
}

// POST /admin/shipping/methods — Create or update shipping method
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const body = req.body as any

  const {
    id,
    zone_id,
    carrier_name,
    method_name,
    delivery_days_min,
    delivery_days_max,
    has_tracking,
    tracking_url_pattern,
    is_default,
    is_active,
    sort_order,
  } = body

  if (!zone_id || !carrier_name || !method_name) {
    res.status(400).json({ message: "zone_id, carrier_name, and method_name are required" })
    return
  }

  try {
    // If setting as default, unset other defaults in the same zone
    if (is_default) {
      await pg("shipping_method")
        .where("zone_id", zone_id)
        .where("is_default", true)
        .update({ is_default: false, updated_at: new Date() })
    }

    if (id) {
      await pg("shipping_method").where("id", id).update({
        zone_id,
        carrier_name,
        method_name,
        delivery_days_min: delivery_days_min ?? null,
        delivery_days_max: delivery_days_max ?? null,
        has_tracking: has_tracking ?? false,
        tracking_url_pattern: tracking_url_pattern || null,
        is_default: is_default ?? false,
        is_active: is_active ?? true,
        sort_order: sort_order ?? 0,
        updated_at: new Date(),
      })
    } else {
      const newId = `sm-${zone_id.replace("zone-", "")}-${Date.now()}`
      await pg("shipping_method").insert({
        id: newId,
        zone_id,
        carrier_name,
        method_name,
        delivery_days_min: delivery_days_min ?? null,
        delivery_days_max: delivery_days_max ?? null,
        has_tracking: has_tracking ?? false,
        tracking_url_pattern: tracking_url_pattern || null,
        is_default: is_default ?? false,
        is_active: is_active ?? true,
        sort_order: sort_order ?? 0,
      })
    }

    const methods = await pg("shipping_method").orderBy(["zone_id", "sort_order"])
    res.json({ methods })
  } catch (error: any) {
    console.error("[admin/shipping/methods] Error:", error)
    res.status(500).json({ message: "Failed to save shipping method" })
  }
}

// DELETE /admin/shipping/methods — Delete shipping method
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
    await pg("shipping_method").where("id", id).delete()
    const methods = await pg("shipping_method").orderBy(["zone_id", "sort_order"])
    res.json({ methods })
  } catch (error: any) {
    res.status(500).json({ message: "Failed to delete shipping method" })
  }
}
