import { Knex } from "knex"
import { generateEntityId } from "@medusajs/framework/utils"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SiteConfig {
  id: string
  catalog_visibility: string
  platform_mode: string
  gate_password: string
  invite_mode_active: boolean
  apply_page_visible: boolean
  waitlist_counter_visible: boolean
  auction_anti_snipe_minutes: number
  auction_default_duration_hours: number
  auction_stagger_interval_seconds: number
  auction_direct_purchase_enabled: boolean
  auction_reserve_price_visible: boolean
  bid_ending_reminders_enabled: boolean
  updated_at: string
}

// Fields that can be updated via the admin API
export const ALLOWED_CONFIG_KEYS: (keyof SiteConfig)[] = [
  "catalog_visibility",
  "platform_mode",
  "gate_password",
  "invite_mode_active",
  "apply_page_visible",
  "waitlist_counter_visible",
  "auction_anti_snipe_minutes",
  "auction_default_duration_hours",
  "auction_stagger_interval_seconds",
  "auction_direct_purchase_enabled",
  "auction_reserve_price_visible",
  "bid_ending_reminders_enabled",
]

// Validation rules per key
const VALIDATORS: Partial<Record<keyof SiteConfig, (v: unknown) => boolean>> = {
  catalog_visibility: (v) => typeof v === "string" && ["all", "visible"].includes(v),
  platform_mode: (v) => typeof v === "string" && ["pre_launch", "preview", "live", "maintenance"].includes(v),
  gate_password: (v) => typeof v === "string" && v.length >= 1,
  invite_mode_active: (v) => typeof v === "boolean",
  apply_page_visible: (v) => typeof v === "boolean",
  waitlist_counter_visible: (v) => typeof v === "boolean",
  auction_anti_snipe_minutes: (v) => typeof v === "number" && v >= 0 && v <= 30,
  auction_default_duration_hours: (v) => typeof v === "number" && v >= 1 && v <= 720,
  auction_stagger_interval_seconds: (v) => typeof v === "number" && v >= 0 && v <= 600,
  auction_direct_purchase_enabled: (v) => typeof v === "boolean",
  auction_reserve_price_visible: (v) => typeof v === "boolean",
  bid_ending_reminders_enabled: (v) => typeof v === "boolean",
}

// ─── In-Memory Cache (upgradeable to Redis later) ──────────────────────────

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
let cachedConfig: SiteConfig | null = null
let cacheTimestamp = 0

export function invalidateConfigCache(): void {
  cachedConfig = null
  cacheTimestamp = 0
}

// ─── Read ───────────────────────────────────────────────────────────────────

export async function getSiteConfig(pg: Knex): Promise<SiteConfig> {
  if (cachedConfig && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedConfig
  }

  const config = await pg("site_config").where("id", "default").first()
  if (!config) {
    // Return sensible defaults if row somehow missing
    return { id: "default", catalog_visibility: "visible", platform_mode: "pre_launch" } as SiteConfig
  }

  cachedConfig = config as SiteConfig
  cacheTimestamp = Date.now()
  return cachedConfig
}

// ─── Update ─────────────────────────────────────────────────────────────────

export async function updateSiteConfig(
  pg: Knex,
  updates: Partial<SiteConfig>,
  adminEmail: string
): Promise<SiteConfig> {
  const current = await getSiteConfig(pg)

  // Filter to allowed keys and validate
  const safeUpdates: Record<string, unknown> = { updated_at: new Date() }
  const auditEntries: Array<{ key: string; oldVal: unknown; newVal: unknown }> = []

  for (const key of ALLOWED_CONFIG_KEYS) {
    if (updates[key] === undefined) continue

    const validator = VALIDATORS[key]
    if (validator && !validator(updates[key])) {
      throw new Error(`Invalid value for '${key}'`)
    }

    const oldVal = current[key]
    const newVal = updates[key]

    // Skip if unchanged
    if (oldVal === newVal) continue

    safeUpdates[key] = newVal
    auditEntries.push({ key, oldVal, newVal })
  }

  if (auditEntries.length === 0) {
    return current
  }

  // Apply update
  await pg("site_config").where("id", "default").update(safeUpdates)

  // Write audit log entries
  for (const entry of auditEntries) {
    await pg("config_audit_log").insert({
      id: generateEntityId(),
      config_key: entry.key,
      old_value: JSON.stringify(entry.oldVal),
      new_value: JSON.stringify(entry.newVal),
      admin_email: adminEmail,
      changed_at: new Date(),
    })
  }

  // Invalidate cache
  invalidateConfigCache()

  // Return fresh config
  return getSiteConfig(pg)
}
