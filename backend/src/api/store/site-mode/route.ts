import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { getSiteConfig } from "../../../lib/site-config"
import { getFeatureFlag } from "../../../lib/feature-flags"

/**
 * GET /store/site-mode
 * Lightweight public endpoint for the storefront middleware.
 * No auth required (publishable API key still enforced at framework level).
 * Returns only the fields the middleware needs.
 *
 * Trial flag: EXPERIMENTAL_STORE_SITE_MODE_DEBUG
 * When enabled, the response includes a _debug object with server time.
 * Used to validate the feature-flag infrastructure end-to-end — toggle
 * the flag in /app/config → Feature Flags, then curl this endpoint to
 * observe the conditional field appear/disappear.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const config = await getSiteConfig(pg)

  const body: Record<string, unknown> = {
    platform_mode: config.platform_mode,
    apply_page_visible: config.apply_page_visible,
    invite_mode_active: config.invite_mode_active,
  }

  // Trial flag — see JSDoc above.
  const debugEnabled = await getFeatureFlag(pg, "EXPERIMENTAL_STORE_SITE_MODE_DEBUG")
  if (debugEnabled) {
    body._debug = {
      server_time: new Date().toISOString(),
      flag: "EXPERIMENTAL_STORE_SITE_MODE_DEBUG",
    }
  }

  res.json(body)
}
