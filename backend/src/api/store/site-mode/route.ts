import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { getSiteConfig } from "../../../lib/site-config"

/**
 * GET /store/site-mode
 * Lightweight public endpoint for the storefront middleware.
 * No auth required. Returns only the fields the middleware needs.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const config = await getSiteConfig(pg)

  res.json({
    platform_mode: config.platform_mode,
    apply_page_visible: config.apply_page_visible,
    invite_mode_active: config.invite_mode_active,
  })
}
