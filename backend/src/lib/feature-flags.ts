import { Knex } from "knex"
import { generateEntityId } from "@medusajs/framework/utils"
import { getSiteConfig, invalidateConfigCache } from "./site-config"

// ─── Feature Flag Registry ─────────────────────────────────────────────────
//
// "Deploy early, activate when ready" — new capabilities ship deployed but
// inactive. A flag being `false` means:
//   • Tables / code may exist
//   • API endpoints may respond (with 404 / empty / fallback)
//   • Admin UI may be visible
//   • BUT: no effect on live business processes
//
// A flag being `true` is the operational activation switch — separate from
// the deployment. See docs/architecture/DEPLOYMENT_METHODOLOGY.md.
//
// Adding a new flag: extend `FEATURES` below. No DB migration needed — all
// flags live in the `site_config.features` JSONB column.
// ───────────────────────────────────────────────────────────────────────────

export interface FeatureFlagDefinition {
  key: string
  default: boolean
  description: string
  category: "erp" | "platform" | "experimental"
  requires?: string[]  // Keys of flags that must be enabled before this flag can be activated
}

export const FEATURES = {
  // ─── ERP flags — activation order is enforced via `requires` ────────────────
  // Sequence: INVENTORY → INVOICING → (SENDCLOUD, COMMISSION, TAX_25A) → MARKETPLACE
  ERP_INVENTORY: {
    key: "ERP_INVENTORY",
    default: false,
    description: "Artikelgenaue Bestandsführung (inventory_item) — Fundament aller ERP-Module",
    category: "erp",
    requires: [],  // no dependencies — activate first
  },
  ERP_INVOICING: {
    key: "ERP_INVOICING",
    default: false,
    description: "GoBD-konforme Rechnungsstellung via easybill",
    category: "erp",
    requires: ["ERP_INVENTORY"],
  },
  ERP_SENDCLOUD: {
    key: "ERP_SENDCLOUD",
    default: false,
    description: "Sendcloud Versandautomation (Labels, Tracking via DHL)",
    category: "erp",
    requires: ["ERP_INVENTORY", "ERP_INVOICING"],
  },
  ERP_COMMISSION: {
    key: "ERP_COMMISSION",
    default: false,
    description: "Kommissionsabrechnung für Konsignationsware",
    category: "erp",
    requires: ["ERP_INVENTORY", "ERP_INVOICING"],
  },
  ERP_TAX_25A: {
    key: "ERP_TAX_25A",
    default: false,
    description: "§25a Differenzbesteuerung mit margengenauem Tracking",
    category: "erp",
    requires: ["ERP_INVENTORY", "ERP_INVOICING"],
  },
  ERP_MARKETPLACE: {
    key: "ERP_MARKETPLACE",
    default: false,
    description: "Multi-Seller Marketplace (Stripe Connect, Seller-Onboarding)",
    category: "erp",
    requires: ["ERP_INVENTORY", "ERP_INVOICING", "ERP_COMMISSION", "ERP_TAX_25A", "ERP_SENDCLOUD"],
  },
  EXPERIMENTAL_STORE_SITE_MODE_DEBUG: {
    key: "EXPERIMENTAL_STORE_SITE_MODE_DEBUG",
    default: false,
    description: "Trial flag — adds a _debug field with server-time to GET /store/site-mode. Used to validate the feature-flag infrastructure end-to-end (registry → DB → backend handler → conditional response).",
    category: "experimental",
  },
  EXPERIMENTAL_SKIP_BID_CONFIRMATION: {
    key: "EXPERIMENTAL_SKIP_BID_CONFIRMATION",
    default: false,
    description: "Trial flag — when ON, skips the bid-confirmation modal and submits directly (power-user mode). Default OFF preserves current behavior so enabling this flag is strictly additive. Client-safe: exposed via /store/platform-flags. Used to validate the full client-side feature-flag stack end-to-end.",
    category: "experimental",
  },
} as const satisfies Record<string, FeatureFlagDefinition>

export type FeatureFlagKey = keyof typeof FEATURES

// ─── Client-Safe Flag Whitelist ────────────────────────────────────────────
//
// Flags listed here MAY be exposed to unauthenticated storefront clients via
// GET /store/platform-flags. Every other flag — especially every ERP_* flag —
// is considered server-only and will never leave the backend.
//
// Rules for adding a flag to this list:
//   1. The flag must be safe to know about publicly. An attacker seeing it
//      must not gain any advantage (no bypass potential, no enumeration of
//      unreleased business logic).
//   2. The flag's effect must be purely presentational OR the enabling
//      condition is already public knowledge.
//   3. ERP / billing / tax / payment / marketplace flags are NEVER safe.
//
// Keep this list short and deliberate. A flag is private by default.
export const CLIENT_SAFE_FLAGS: readonly FeatureFlagKey[] = [
  "EXPERIMENTAL_SKIP_BID_CONFIRMATION",
] as const

export function isClientSafeFlag(key: string): key is FeatureFlagKey {
  return (CLIENT_SAFE_FLAGS as readonly string[]).includes(key)
}

export function isKnownFlag(key: string): key is FeatureFlagKey {
  return Object.prototype.hasOwnProperty.call(FEATURES, key)
}

export function listFlagDefinitions(): FeatureFlagDefinition[] {
  return Object.values(FEATURES)
}

/**
 * Returns the list of flag keys that must be enabled before the given flag
 * can be activated. All returned keys are validated against the registry.
 */
export function getFlagDependencies(key: FeatureFlagKey): FeatureFlagKey[] {
  const deps = FEATURES[key].requires ?? []
  return deps.filter(isKnownFlag) as FeatureFlagKey[]
}

// ─── Read ──────────────────────────────────────────────────────────────────

/**
 * Read a single feature flag. Falls back to the registry default if the key
 * is not present in `site_config.features`. Uses the cached site_config read.
 */
export async function getFeatureFlag(
  pg: Knex,
  key: FeatureFlagKey
): Promise<boolean> {
  const config = await getSiteConfig(pg)
  const stored = config.features?.[key]
  if (typeof stored === "boolean") return stored
  return FEATURES[key].default
}

/**
 * Read all feature flags merged with registry defaults. Unknown keys that
 * somehow exist in the JSONB column are ignored (registry is source of truth).
 */
export async function getAllFeatureFlags(
  pg: Knex
): Promise<Record<FeatureFlagKey, boolean>> {
  const config = await getSiteConfig(pg)
  const stored = config.features || {}
  const result = {} as Record<FeatureFlagKey, boolean>
  for (const def of listFlagDefinitions()) {
    const val = stored[def.key]
    result[def.key as FeatureFlagKey] =
      typeof val === "boolean" ? val : def.default
  }
  return result
}

// ─── Write ─────────────────────────────────────────────────────────────────

/**
 * Set a single feature flag.
 *
 * Behavior:
 *   • Validates the key against the registry (defense-in-depth — the HTTP
 *     route also validates).
 *   • Reads the current value directly from the DB (bypasses the 5-min
 *     site_config cache) so the audit trail reflects real pre-write state
 *     even if another admin toggled recently.
 *   • Update + audit are wrapped in a single transaction — either both
 *     succeed or both roll back. Prevents the "flag flipped without audit
 *     trail" failure mode if the audit insert fails mid-operation.
 *   • No-ops (same value) return early without writing the audit log.
 *   • JSONB concatenation preserves other flag values in the same row.
 *   • Invalidates cache after the transaction commits so subsequent
 *     read-after-write sees the new value.
 */
export async function setFeatureFlag(
  pg: Knex,
  key: FeatureFlagKey,
  enabled: boolean,
  adminEmail: string
): Promise<Record<FeatureFlagKey, boolean>> {
  if (!isKnownFlag(key)) {
    throw new Error(`Unknown feature flag: ${key}`)
  }
  if (typeof enabled !== "boolean") {
    throw new Error(`Flag value must be boolean, got ${typeof enabled}`)
  }

  // Dependency check: before attempting the write, verify all required flags are on.
  // This is done OUTSIDE the transaction intentionally — it's a read-only pre-check,
  // and failing here produces a clean 400 without needing to roll back anything.
  if (enabled) {
    const deps = getFlagDependencies(key)
    if (deps.length > 0) {
      const currentFlags = await getAllFeatureFlags(pg)
      const unmet = deps.filter((dep) => !currentFlags[dep])
      if (unmet.length > 0) {
        throw new Error(
          `Cannot enable ${key}: required flags not active: ${unmet.join(", ")}`
        )
      }
    }
  }

  await pg.transaction(async (trx) => {
    // Direct DB read (NOT via getSiteConfig — that uses the 5-min cache).
    // `FOR UPDATE` is not strictly necessary since the config table has
    // one row and writes are rare, but it makes the semantics explicit:
    // we are about to modify this row atomically.
    const row = await trx("site_config")
      .where("id", "default")
      .select("features")
      .forUpdate()
      .first()

    const storedFeatures: Record<string, unknown> = (row?.features as any) || {}
    const storedVal = storedFeatures[key]
    const current = typeof storedVal === "boolean" ? storedVal : FEATURES[key].default

    if (current === enabled) {
      // No-op: value already matches. Skip write + audit.
      return
    }

    // JSONB merge: features = features || '{"KEY": enabled}'::jsonb
    // `||` is right-biased, so the new value wins on key collision.
    // COALESCE guards against a NULL column (should never happen after
    // the migration — column is NOT NULL DEFAULT '{}' — but defensive).
    await trx("site_config")
      .where("id", "default")
      .update({
        features: trx.raw(`COALESCE(features, '{}'::jsonb) || ?::jsonb`, [
          JSON.stringify({ [key]: enabled }),
        ]),
        updated_at: new Date(),
      })

    // Audit log. Key prefix `feature_flag:` makes these entries filterable
    // from other config changes via the existing audit-log endpoint.
    await trx("config_audit_log").insert({
      id: generateEntityId(),
      config_key: `feature_flag:${key}`,
      old_value: JSON.stringify(current),
      new_value: JSON.stringify(enabled),
      admin_email: adminEmail,
      changed_at: new Date(),
    })
  })

  // Invalidate only after the transaction commits — otherwise a failed
  // write would leave the cache empty and force unrelated reads to refetch
  // for no reason.
  invalidateConfigCache()
  return getAllFeatureFlags(pg)
}
