import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { getShippingZonesWithRates } from "../../../lib/shipping"

// GET /admin/shipping — Full shipping overview (config + types + zones + rates)
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  try {
    const [config, itemTypes, zonesWithRates] = await Promise.all([
      pg("shipping_config").where("id", "default").first(),
      pg("shipping_item_type").orderBy("sort_order", "asc"),
      getShippingZonesWithRates(pg),
    ])

    res.json({
      config: config || {},
      item_types: itemTypes,
      zones: zonesWithRates,
    })
  } catch (error: any) {
    console.error("[admin/shipping] Error:", error)
    res.status(500).json({ message: "Failed to fetch shipping config" })
  }
}
