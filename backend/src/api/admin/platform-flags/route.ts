import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  FEATURES,
  FeatureFlagKey,
  getAllFeatureFlags,
  getFlagDependencies,
  isKnownFlag,
  listFlagDefinitions,
  setFeatureFlag,
} from "../../../lib/feature-flags"

// Admin auth: inherited automatically by every /admin/* route via Medusa's
// built-in auth middleware. No explicit decoration required here — matches
// the pattern in /admin/site-config/route.ts.
//
// ⚠ Path choice: this route lives at /admin/platform-flags, NOT
// /admin/feature-flags. Medusa ships a NATIVE, unauthenticated, GET-only
// /admin/feature-flags route that returns its internal module-level feature
// flags. Per CLAUDE.md gotcha ("Admin Route Pfade: native Route gewinnt
// immer"), colliding on that path would silently shadow this handler.

interface FlagResponse {
  key: string
  enabled: boolean
  default: boolean
  description: string
  category: "erp" | "platform" | "experimental"
  requires: string[]  // Keys that must be enabled before this flag can be activated
}

function serializeFlags(values: Record<FeatureFlagKey, boolean>): FlagResponse[] {
  return listFlagDefinitions().map((def) => ({
    key: def.key,
    enabled: values[def.key as FeatureFlagKey],
    default: def.default,
    description: def.description,
    category: def.category,
    requires: getFlagDependencies(def.key as FeatureFlagKey),
  }))
}

/**
 * Detects the specific "features column doesn't exist yet" failure — i.e.
 * the admin deployed the code but hasn't applied the migration yet. Gives
 * a clearer error message than the raw Postgres error.
 */
function isMissingFeaturesColumn(err: any): boolean {
  const msg = String(err?.message || "")
  return /column.*features.*does not exist/i.test(msg)
}

/**
 * GET /admin/platform-flags
 * Returns the full registry merged with current DB state.
 * Shape: { flags: [{ key, enabled, default, description, category }, ...] }
 *
 * Safe even if the migration has not been applied — `getAllFeatureFlags`
 * falls back to registry defaults when `site_config.features` is absent.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  try {
    const values = await getAllFeatureFlags(pg)
    res.json({ flags: serializeFlags(values) })
  } catch (err: any) {
    // Unexpected read failure — surface as 500, not 400.
    res.status(500).json({ message: err?.message || "Failed to load feature flags" })
  }
}

/**
 * POST /admin/platform-flags
 * Body: { key: FeatureFlagKey, enabled: boolean }
 * Updates a single flag atomically (update + audit in one transaction).
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const adminEmail = (req as any).auth_context?.actor_id || "admin"
  const body = req.body as { key?: string; enabled?: boolean } | undefined

  // Body validation — reject malformed requests with 400.
  if (!body || typeof body.key !== "string" || typeof body.enabled !== "boolean") {
    res.status(400).json({
      message: "Body must be { key: string, enabled: boolean }",
    })
    return
  }

  if (!isKnownFlag(body.key)) {
    res.status(400).json({
      message: `Unknown feature flag '${body.key}'. Known flags: ${Object.keys(FEATURES).join(", ")}`,
    })
    return
  }

  try {
    const values = await setFeatureFlag(pg, body.key, body.enabled, adminEmail)
    res.json({ flags: serializeFlags(values) })
  } catch (err: any) {
    // Migration not yet applied → clear, actionable message.
    if (isMissingFeaturesColumn(err)) {
      res.status(503).json({
        message:
          "Feature flag column not found. Apply backend/scripts/migrations/2026-04-05_add_site_config_features.sql via Supabase SQL Editor before toggling flags.",
      })
      return
    }
    // Validation errors from setFeatureFlag → 400. Everything else → 500.
    const isValidation =
      /^Unknown feature flag|^Flag value must be boolean|^Cannot enable/.test(err?.message || "")
    res
      .status(isValidation ? 400 : 500)
      .json({ message: err?.message || "Failed to update feature flag" })
  }
}
