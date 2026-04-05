import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  CLIENT_SAFE_FLAGS,
  FeatureFlagKey,
  getFeatureFlag,
} from "../../../lib/feature-flags"

/**
 * GET /store/platform-flags
 *
 * Public read-only endpoint that returns only the flags explicitly
 * whitelisted in `CLIENT_SAFE_FLAGS` in backend/src/lib/feature-flags.ts.
 * Every other flag (in particular every ERP_* flag) is private and will
 * never appear in this response.
 *
 * Shape: { flags: { [key]: boolean } }
 *
 * Used by the storefront's FeatureFlagProvider to fetch the current state
 * of client-visible flags once per session. No auth required (publishable
 * API key still enforced at framework level).
 *
 * Security rationale: the whitelist is the single source of truth. Even
 * if a developer accidentally adds a sensitive flag to the registry, it
 * will NOT be exposed to clients unless it is also added to CLIENT_SAFE_FLAGS.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const flags: Record<string, boolean> = {}
  for (const key of CLIENT_SAFE_FLAGS) {
    flags[key] = await getFeatureFlag(pg, key as FeatureFlagKey)
  }

  res.json({ flags })
}
