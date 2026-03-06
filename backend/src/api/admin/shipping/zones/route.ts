import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// POST /admin/shipping/zones — Create or update zone
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const body = req.body as any

  const { id, name, slug, countries, sort_order } = body

  if (!name || !slug) {
    res.status(400).json({ message: "name and slug are required" })
    return
  }

  try {
    if (id) {
      await pg("shipping_zone").where("id", id).update({
        name,
        slug,
        countries: countries || null,
        sort_order: sort_order || 0,
      })
    } else {
      const newId = `zone-${slug}`
      await pg("shipping_zone").insert({
        id: newId,
        name,
        slug,
        countries: countries || null,
        sort_order: sort_order || 0,
      })
    }

    const zones = await pg("shipping_zone").orderBy("sort_order", "asc")
    res.json({ zones })
  } catch (error: any) {
    console.error("[admin/shipping/zones] Error:", error)
    res.status(500).json({ message: "Failed to save zone" })
  }
}
