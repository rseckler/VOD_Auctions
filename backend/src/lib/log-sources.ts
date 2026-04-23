/**
 * Hart-kodierte Log-Quellen-Allowlist (Observability Plan v2 §3.2).
 *
 * PRIMÄRSCHUTZ: Endpoints akzeptieren NUR die hier gelisteten Keys.
 * Kein User-Input für Pfade, keine Wildcards. Path-Traversal ist
 * konstruktiv ausgeschlossen.
 *
 * Sekundärschutz: Regex-Scrubbing (log-streaming.ts) auf Output.
 */

import path from "node:path"

// VPS-production paths
const PM2_LOG_ROOT = "/root/.pm2/logs"
const SCRIPTS_ROOT = "/root/VOD_Auctions/scripts"

export type PM2LogKey = "vodauction-backend" | "vodauction-storefront"
export type FileLogKey = "health_sampler" | "legacy_sync" | "discogs_daily" | "meilisearch_sync"

export const PM2_ALLOWLIST: Record<PM2LogKey, { out: string; error: string; label: string }> = {
  "vodauction-backend": {
    out:   path.join(PM2_LOG_ROOT, "vodauction-backend-out.log"),
    error: path.join(PM2_LOG_ROOT, "vodauction-backend-error.log"),
    label: "Medusa Backend (PM2)",
  },
  "vodauction-storefront": {
    out:   path.join(PM2_LOG_ROOT, "vodauction-storefront-out.log"),
    error: path.join(PM2_LOG_ROOT, "vodauction-storefront-error.log"),
    label: "Next.js Storefront (PM2)",
  },
}

export const FILE_ALLOWLIST: Record<FileLogKey, { path: string; label: string }> = {
  health_sampler: {
    path: path.join(SCRIPTS_ROOT, "health_sampler.log"),
    label: "Health Sampler Cron",
  },
  legacy_sync: {
    path: path.join(SCRIPTS_ROOT, "legacy_sync.log"),
    label: "Legacy MySQL → Postgres Sync",
  },
  discogs_daily: {
    path: path.join(SCRIPTS_ROOT, "discogs_daily.log"),
    label: "Discogs Daily Sync",
  },
  meilisearch_sync: {
    path: path.join(SCRIPTS_ROOT, "meilisearch_sync.log"),
    label: "Meilisearch Delta Sync",
  },
}

export function isValidPm2Key(key: string): key is PM2LogKey {
  return Object.prototype.hasOwnProperty.call(PM2_ALLOWLIST, key)
}

export function isValidFileKey(key: string): key is FileLogKey {
  return Object.prototype.hasOwnProperty.call(FILE_ALLOWLIST, key)
}

/**
 * Returns the "best" log-source hint per service_name, used by the UI
 * to auto-select a sensible default source when opening the Logs tab.
 */
export function suggestSourceForService(serviceName: string): { type: "pm2" | "file"; key: string } | null {
  const name = serviceName.toLowerCase()
  if (name.includes("storefront")) return { type: "pm2", key: "vodauction-storefront" }
  if (name.includes("postgres") || name.includes("meili") || name.includes("vps") || name.includes("upstash")) return { type: "pm2", key: "vodauction-backend" }
  if (name.includes("sync_log") || name.includes("legacy")) return { type: "file", key: "legacy_sync" }
  if (name.includes("meili_drift") || name.includes("meili_backlog")) return { type: "file", key: "meilisearch_sync" }
  if (name.includes("discogs")) return { type: "file", key: "discogs_daily" }
  if (name.includes("sampler") || name.includes("cron")) return { type: "file", key: "health_sampler" }
  return { type: "pm2", key: "vodauction-backend" }  // sensible default
}
