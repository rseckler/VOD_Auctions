import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/site-config — Read site configuration
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const config = await pg("site_config").where("id", "default").first()
  res.json({ config: config || { catalog_visibility: "all" } })
}

// POST /admin/site-config — Update site configuration
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const { catalog_visibility } = req.body as any

  if (
    catalog_visibility &&
    !["all", "visible"].includes(catalog_visibility)
  ) {
    res.status(400).json({ message: "Invalid catalog_visibility value. Use 'all' or 'visible'." })
    return
  }

  const updates: Record<string, any> = { updated_at: new Date() }
  if (catalog_visibility) {
    updates.catalog_visibility = catalog_visibility
  }

  await pg("site_config").where("id", "default").update(updates)
  const config = await pg("site_config").where("id", "default").first()
  res.json({ config })
}
