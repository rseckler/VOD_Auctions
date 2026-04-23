/**
 * GET /admin/system-health/sentry/issues?service=<service_name>&limit=10
 *
 * Sentry-Issues Embed (Observability Plan v2 §P4-B).
 * Graceful-empty wenn SENTRY_AUTH_TOKEN nicht gesetzt — kein Crash,
 * UI zeigt "configure token" Empty-State.
 *
 * Cache: 60s in-memory. Sentry rate-limit ist 100/min — bei 25 Services
 * à 60s-refresh = 25/min, safely unter Limit.
 */

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

const SENTRY_ORG = process.env.SENTRY_ORG || "vod-records"
const SENTRY_PROJECT = process.env.SENTRY_PROJECT || "vod-auctions-storefront"
const CACHE_TTL_MS = 60_000

type CachedResponse = { data: any; expires_at: number }
const issueCache = new Map<string, CachedResponse>()

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const token = process.env.SENTRY_AUTH_TOKEN
  const service = (req.query?.service as string | undefined)?.trim()
  const limit = Math.min(25, Math.max(1, Number(req.query?.limit) || 10))

  if (!token) {
    res.json({
      configured: false,
      org: SENTRY_ORG,
      project: SENTRY_PROJECT,
      issues: [],
      message: "SENTRY_AUTH_TOKEN not configured in backend/.env. Create a Personal Access Token at https://sentry.io/settings/account/api/auth-tokens/ with scope 'project:read'.",
    })
    return
  }

  // Cache-key includes service to keep per-service caches independent.
  const cacheKey = `${service || "all"}|${limit}`
  const cached = issueCache.get(cacheKey)
  if (cached && cached.expires_at > Date.now()) {
    res.setHeader("X-Cache", "HIT")
    res.json(cached.data)
    return
  }

  // Build Sentry-API query. If a service name is provided, filter via tags.
  const queryParams = new URLSearchParams({
    limit: String(limit),
    sort: "date",
    statsPeriod: "14d",
  })
  if (service) {
    // Sentry-Query-Syntax: tag-based filter with "OR" fallback für message/culprit
    queryParams.set("query", `is:unresolved service:"${service}" OR "${service}"`)
  } else {
    queryParams.set("query", "is:unresolved")
  }

  const url = `https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?${queryParams.toString()}`

  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4500),
    })
    if (!r.ok) {
      res.json({
        configured: true,
        org: SENTRY_ORG,
        project: SENTRY_PROJECT,
        issues: [],
        error: `Sentry HTTP ${r.status}`,
      })
      return
    }
    const issues = (await r.json()) as any[]
    const data = {
      configured: true,
      org: SENTRY_ORG,
      project: SENTRY_PROJECT,
      issues: issues.map((i) => ({
        id: i.id,
        short_id: i.shortId,
        title: i.title,
        culprit: i.culprit,
        level: i.level,
        status: i.status,
        count: i.count,
        user_count: i.userCount,
        first_seen: i.firstSeen,
        last_seen: i.lastSeen,
        permalink: i.permalink,
      })),
    }
    issueCache.set(cacheKey, { data, expires_at: Date.now() + CACHE_TTL_MS })
    res.setHeader("X-Cache", "MISS")
    res.json(data)
  } catch (e: any) {
    res.json({
      configured: true,
      org: SENTRY_ORG,
      project: SENTRY_PROJECT,
      issues: [],
      error: e?.message || "Sentry unreachable",
    })
  }
}
