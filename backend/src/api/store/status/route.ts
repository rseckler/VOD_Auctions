/**
 * GET /store/status
 *
 * Public Status Page Backend (§P2.14 + §3.5 Public-Mapping).
 * Returns ONLY aggregated public-category severities. Never internal names,
 * never latencies, never messages.
 *
 * Auth: Medusa /store/* auto-checks publishable-api-key — storefront has that.
 * Cache: In-memory 60s TTL (no external Redis dependency needed for this TTL).
 * Flag: When SYSTEM_HEALTH_PUBLIC_PAGE is OFF, returns 404.
 */

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { getFeatureFlag } from "../../../lib/feature-flags"

// Public category mapping — §3.5 of plan
// Only these internal categories are exposed, aggregated.
const PUBLIC_CATEGORY_MAP: Record<string, string> = {
  infrastructure: "Platform",
  data_plane:     "Platform",
  payments:       "Checkout",
  communication:  "Notifications",
  business_flows: "Shopping Experience",
  // sync_pipelines, analytics, ai, edge_hardware intentionally omitted → internal-only
}

// Public-visible categories in render order
const PUBLIC_CATEGORIES_ORDER = ["Platform", "Checkout", "Shopping Experience", "Notifications"]

type PublicStatus = "operational" | "degraded_performance" | "outage" | "unknown"

// Internal severity → public status
function mapSeverity(internal: string): PublicStatus {
  if (internal === "ok" || internal === "insufficient_signal" || internal === "unconfigured") return "operational"
  if (internal === "degraded" || internal === "warning") return "degraded_performance"
  if (internal === "error" || internal === "critical") return "outage"
  return "unknown"
}

// Worst-status aggregator
function worst(a: PublicStatus, b: PublicStatus): PublicStatus {
  const rank: Record<PublicStatus, number> = { operational: 0, unknown: 1, degraded_performance: 2, outage: 3 }
  return rank[a] >= rank[b] ? a : b
}

// In-memory cache — 60s TTL is short enough for a single instance
type CachedResponse = { data: any; expires_at: number }
let CACHE: CachedResponse | null = null
const CACHE_TTL_MS = 60_000
// Staleness threshold per service — if last sample > 15min old, mark as unknown
const STALE_AFTER_MS = 15 * 60_000

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  // ── Flag-gated — default 404 when disabled ─────────────────────────
  const flagOn = await getFeatureFlag(pg, "SYSTEM_HEALTH_PUBLIC_PAGE")
  if (!flagOn) {
    res.status(404).json({ error: "not found" })
    return
  }

  // ── Serve from cache if fresh ───────────────────────────────────────
  if (CACHE && CACHE.expires_at > Date.now()) {
    res.setHeader("X-Cache", "HIT")
    res.setHeader("Cache-Control", "public, max-age=60")
    res.json(CACHE.data)
    return
  }

  // ── Compute fresh ──────────────────────────────────────────────────
  const environment = process.env.NODE_ENV === "production" ? "prod" : "dev"
  const { rows } = await pg.raw(
    `SELECT DISTINCT ON (service_name)
       service_name, category, severity, checked_at
     FROM health_check_log
     WHERE environment = ?
     ORDER BY service_name, checked_at DESC`,
    [environment]
  )

  // Init public-category map
  const publicStatuses: Record<string, PublicStatus> = {}
  for (const cat of PUBLIC_CATEGORIES_ORDER) publicStatuses[cat] = "operational"

  let overallStatus: PublicStatus = "operational"
  let newestSample = new Date(0)

  for (const row of rows as any[]) {
    const publicCat = PUBLIC_CATEGORY_MAP[row.category]
    if (!publicCat) continue  // skip internal-only categories

    const sampleAt = new Date(row.checked_at)
    if (sampleAt > newestSample) newestSample = sampleAt

    // Stale sample → unknown (mapped severity irrelevant)
    const isStale = Date.now() - sampleAt.getTime() > STALE_AFTER_MS
    const status: PublicStatus = isStale ? "unknown" : mapSeverity(row.severity)

    publicStatuses[publicCat] = worst(publicStatuses[publicCat], status)
    overallStatus = worst(overallStatus, status)
  }

  const response = {
    overall: overallStatus,
    categories: PUBLIC_CATEGORIES_ORDER.map((name) => ({ name, status: publicStatuses[name] })),
    last_updated: newestSample.getTime() > 0 ? newestSample.toISOString() : null,
  }

  CACHE = { data: response, expires_at: Date.now() + CACHE_TTL_MS }

  res.setHeader("X-Cache", "MISS")
  res.setHeader("Cache-Control", "public, max-age=60")
  res.json(response)
}
