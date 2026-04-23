/**
 * Health-Check Registry (System Health Evolution Plan §3.2-3.3)
 *
 * Shared by:
 *   - POST /health-sample  → runs checks, writes to health_check_log
 *   - GET /admin/system-health  → reads only, NEVER runs checks
 *
 * Definitions carry metadata (category, check_class, severity-mapping).
 * Run functions are pure async — no DB writes inside, no HTTP responses.
 */

import type { Knex } from "knex"
import { stripe } from "./stripe"
import { getFeatureFlag } from "./feature-flags"

// ─── Types ──────────────────────────────────────────────────────────────────

export type ServiceStatus =
  | "ok"
  | "degraded"
  | "warning"
  | "error"
  | "critical"
  | "insufficient_signal"
  | "unconfigured"

export type CheckClass = "fast" | "background" | "synthetic"

export type CheckRunResult = {
  status: ServiceStatus
  message: string
  latency_ms: number | null
  metadata?: Record<string, unknown>
}

export type CheckContext = {
  pg: Knex
  env: NodeJS.ProcessEnv
}

export type HealthCheckDefinition = {
  name: string
  label: string
  category:
    | "infrastructure"
    | "data_plane"
    | "sync_pipelines"
    | "payments"
    | "communication"
    | "analytics"
    | "ai"
    | "business_flows"
    | "edge_hardware"
  check_class: CheckClass
  url?: string
  /** Short doc-block explaining severity mapping, kept here for traceability. */
  severity_note?: string
  run: (ctx: CheckContext) => Promise<CheckRunResult>
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Class-specific default timeout per §3.2. */
export function timeoutForClass(cls: CheckClass): number {
  if (cls === "fast") return 500
  if (cls === "background") return 5000
  return 30_000
}

async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<{ result?: T; error?: string; latency_ms: number }> {
  const start = Date.now()
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs)),
    ])
    return { result, latency_ms: Date.now() - start }
  } catch (err: any) {
    return { error: err?.message || "Unknown error", latency_ms: Date.now() - start }
  }
}

/** Run a single check with class-appropriate timeout + error envelope. */
export async function runCheck(
  def: HealthCheckDefinition,
  ctx: CheckContext
): Promise<CheckRunResult> {
  const timeoutMs = timeoutForClass(def.check_class)
  try {
    const { result, error, latency_ms } = await withTimeout(() => def.run(ctx), timeoutMs)
    if (error) {
      return { status: "error", message: `probe failed: ${error}`, latency_ms }
    }
    return result as CheckRunResult
  } catch (err: any) {
    return { status: "error", message: `probe crashed: ${err?.message || err}`, latency_ms: null }
  }
}

// ─── Check Definitions ──────────────────────────────────────────────────────

export const CHECKS: HealthCheckDefinition[] = [
  // ── Infrastructure ────────────────────────────────────────────────────
  {
    name: "postgresql",
    label: "PostgreSQL / Supabase",
    category: "infrastructure",
    check_class: "fast",
    url: "https://supabase.com/dashboard/project/bofblwqieuvmqybzxapx",
    severity_note: "ok if SELECT 1 returns; critical if connection fails (DB is launch-blocker)",
    async run({ pg }) {
      const start = Date.now()
      try {
        await pg.raw("SELECT 1")
        const latency_ms = Date.now() - start
        const status: ServiceStatus = latency_ms > 500 ? "degraded" : "ok"
        return { status, message: `Query OK`, latency_ms }
      } catch (e: any) {
        return { status: "critical", message: e?.message || "connection failed", latency_ms: Date.now() - start }
      }
    },
  },
  {
    name: "vps",
    label: "VPS / API Server (Hostinger)",
    category: "infrastructure",
    check_class: "background",
    url: "https://manage.hostinger.com",
    async run() {
      const apiUrl = "https://api.vod-auctions.com"
      const start = Date.now()
      try {
        const r = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(4500) })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return { status: "ok", message: `Health OK (${apiUrl})`, latency_ms: Date.now() - start }
      } catch (e: any) {
        return { status: "critical", message: e?.message || "unreachable", latency_ms: Date.now() - start }
      }
    },
  },
  {
    name: "storefront",
    label: "Storefront (internal)",
    category: "infrastructure",
    check_class: "background",
    async run({ env }) {
      const url = env.STOREFRONT_URL || "http://localhost:3000"
      const start = Date.now()
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(4500), redirect: "manual" })
        if (r.status >= 500) throw new Error(`HTTP ${r.status}`)
        return { status: "ok", message: `Responding (${url})`, latency_ms: Date.now() - start, metadata: { http_status: r.status } }
      } catch (e: any) {
        return { status: "error", message: e?.message || "unreachable", latency_ms: Date.now() - start }
      }
    },
  },
  {
    name: "storefront_public",
    label: "Storefront (vod-auctions.com)",
    category: "infrastructure",
    check_class: "background",
    url: "https://vod-auctions.com",
    severity_note: "critical if 5xx — direct user-facing; ok on 3xx (gate redirect)",
    async run() {
      const url = "https://vod-auctions.com"
      const start = Date.now()
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "manual" })
        if (r.status >= 500) throw new Error(`HTTP ${r.status}`)
        return { status: "ok", message: `Responding (${url})`, latency_ms: Date.now() - start, metadata: { http_status: r.status } }
      } catch (e: any) {
        return { status: "critical", message: e?.message || "unreachable", latency_ms: Date.now() - start }
      }
    },
  },

  // ── Data Plane ────────────────────────────────────────────────────────
  {
    name: "upstash",
    label: "Upstash Redis (Cache)",
    category: "data_plane",
    check_class: "fast",
    url: "https://console.upstash.com",
    async run({ env }) {
      const url = env.UPSTASH_REDIS_REST_URL
      const token = env.UPSTASH_REDIS_REST_TOKEN
      if (!url || !token) {
        return { status: "unconfigured", message: "UPSTASH_REDIS_REST_URL or TOKEN not set", latency_ms: null }
      }
      const start = Date.now()
      try {
        const r = await fetch(`${url}/ping`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(450) })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return { status: "ok", message: `PONG — ${url.replace("https://", "").split(".")[0]}`, latency_ms: Date.now() - start }
      } catch (e: any) {
        return { status: "error", message: e?.message || "ping failed", latency_ms: Date.now() - start }
      }
    },
  },
  {
    name: "meilisearch",
    label: "Meilisearch (Search)",
    category: "data_plane",
    check_class: "background",
    url: "/app/config",
    severity_note: "degraded if flag OFF but index healthy; error if unreachable with flag ON",
    async run({ pg, env }) {
      const url = env.MEILI_URL
      const apiKey = env.MEILI_ADMIN_API_KEY
      if (!url || !apiKey) {
        return { status: "unconfigured", message: "MEILI_URL or MEILI_ADMIN_API_KEY not set", latency_ms: null }
      }
      const start = Date.now()
      try {
        const [healthRes, statsRes] = await Promise.all([
          fetch(`${url}/health`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(2500) }),
          fetch(`${url}/stats`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(2500) }),
        ])
        if (!healthRes.ok) throw new Error(`health HTTP ${healthRes.status}`)
        if (!statsRes.ok) throw new Error(`stats HTTP ${statsRes.status}`)
        const health = await healthRes.json() as any
        const stats = await statsRes.json() as any
        const indexes = stats?.indexes ?? {}
        const totalDocs = Object.values(indexes).reduce((sum: number, idx: any) => sum + (idx?.numberOfDocuments ?? 0), 0)
        let flagOn = false
        try { flagOn = await getFeatureFlag(pg, "SEARCH_MEILI_CATALOG") } catch { /* ignore */ }
        const status: ServiceStatus = flagOn ? "ok" : "degraded"
        return {
          status,
          message: `${health?.status ?? "unknown"} — ${Object.keys(indexes).length} index(es), ${totalDocs.toLocaleString("de-DE")} docs · flag: ${flagOn ? "ON" : "OFF"}`,
          latency_ms: Date.now() - start,
          metadata: { indexes: Object.keys(indexes), total_docs: totalDocs, flag_on: flagOn },
        }
      } catch (e: any) {
        return { status: "error", message: e?.message || "unreachable", latency_ms: Date.now() - start }
      }
    },
  },
  {
    name: "r2-images",
    label: "Cloudflare R2 (Image CDN)",
    category: "data_plane",
    check_class: "background",
    url: "https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev",
    async run() {
      const r2Url = "https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev"
      const testImage = "tape-mag/standard/Die_Gesunden_kommen_live_Tempodrom.jpg"
      const start = Date.now()
      try {
        const r = await fetch(`${r2Url}/${testImage}`, { method: "HEAD", signal: AbortSignal.timeout(4500) })
        const latency = Date.now() - start
        if (!r.ok) return { status: "error", message: `R2 returned HTTP ${r.status}`, latency_ms: latency }
        const status: ServiceStatus = latency > 1000 ? "degraded" : "ok"
        return { status, message: `R2 public URL active (${latency}ms)`, latency_ms: latency }
      } catch (e: any) {
        return { status: "error", message: e?.message || "R2 unreachable", latency_ms: Date.now() - start }
      }
    },
  },

  // ── Payments ──────────────────────────────────────────────────────────
  {
    name: "stripe",
    label: "Stripe",
    category: "payments",
    check_class: "background",
    url: "https://dashboard.stripe.com",
    severity_note: "critical on HTTP fail — checkout depends on this",
    async run({ env }) {
      if (!env.STRIPE_SECRET_KEY) {
        return { status: "unconfigured", message: "STRIPE_SECRET_KEY not set", latency_ms: null }
      }
      const start = Date.now()
      try {
        const bal = await stripe.balance.retrieve()
        const available = bal.available[0]
        const msg = available ? `Balance: ${available.currency}=${(available.amount / 100).toFixed(2)}` : "Balance OK"
        return { status: "ok", message: msg, latency_ms: Date.now() - start }
      } catch (e: any) {
        return { status: "critical", message: e?.message || "API error", latency_ms: Date.now() - start }
      }
    },
  },
  {
    name: "paypal",
    label: "PayPal",
    category: "payments",
    check_class: "background",
    url: "https://developer.paypal.com/dashboard",
    async run({ env }) {
      const id = env.PAYPAL_CLIENT_ID, secret = env.PAYPAL_CLIENT_SECRET, mode = env.PAYPAL_MODE || "sandbox"
      if (!id || !secret) {
        return { status: "unconfigured", message: "PAYPAL_CLIENT_ID or SECRET not set", latency_ms: null }
      }
      const tokenUrl = mode === "live" ? "https://api-m.paypal.com/v1/oauth2/token" : "https://api-m.sandbox.paypal.com/v1/oauth2/token"
      const start = Date.now()
      try {
        const r = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
          body: "grant_type=client_credentials",
          signal: AbortSignal.timeout(4500),
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return { status: "ok", message: `OAuth OK (${mode})`, latency_ms: Date.now() - start }
      } catch (e: any) {
        return { status: "error", message: e?.message || "OAuth failed", latency_ms: Date.now() - start }
      }
    },
  },

  // ── Communication ─────────────────────────────────────────────────────
  {
    name: "resend",
    label: "Resend (Email)",
    category: "communication",
    check_class: "background",
    url: "https://resend.com/overview",
    async run({ env }) {
      if (!env.RESEND_API_KEY) {
        return { status: "unconfigured", message: "RESEND_API_KEY not set", latency_ms: null }
      }
      const start = Date.now()
      try {
        const r = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
          signal: AbortSignal.timeout(4500),
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const d = await r.json() as any
        const domainCount = d?.data?.length ?? 0
        return { status: "ok", message: `${domainCount} domain(s) configured`, latency_ms: Date.now() - start }
      } catch (e: any) {
        return { status: "error", message: e?.message || "API error", latency_ms: Date.now() - start }
      }
    },
  },
  {
    name: "brevo",
    label: "Brevo (CRM/Newsletter)",
    category: "communication",
    check_class: "background",
    url: "https://app.brevo.com",
    async run({ env }) {
      if (!env.BREVO_API_KEY) {
        return { status: "unconfigured", message: "BREVO_API_KEY not set", latency_ms: null }
      }
      const start = Date.now()
      try {
        const r = await fetch("https://api.brevo.com/v3/account", {
          headers: { "api-key": env.BREVO_API_KEY },
          signal: AbortSignal.timeout(4500),
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const d = await r.json() as any
        return { status: "ok", message: `Plan: ${d?.plan?.[0]?.type ?? "unknown"}`, latency_ms: Date.now() - start }
      } catch (e: any) {
        return { status: "error", message: e?.message || "API error", latency_ms: Date.now() - start }
      }
    },
  },

  // ── Analytics (static env-only) ───────────────────────────────────────
  {
    name: "sentry",
    label: "Sentry (Error Tracking)",
    category: "analytics",
    check_class: "fast",
    url: "https://vod-records.sentry.io/issues/",
    async run({ env }) {
      const dsn = env.SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN
      if (!dsn) return { status: "unconfigured", message: "SENTRY_DSN not set in backend .env", latency_ms: null }
      const org = env.SENTRY_ORG || "vod-records"
      const project = env.SENTRY_PROJECT || "vod-auctions-storefront"
      return { status: "ok", message: `Active — org: ${org}, project: ${project}`, latency_ms: null }
    },
  },
  {
    name: "clarity",
    label: "Microsoft Clarity (UXA)",
    category: "analytics",
    check_class: "fast",
    url: "https://clarity.microsoft.com",
    async run({ env }) {
      const id = env.CLARITY_ID || env.NEXT_PUBLIC_CLARITY_ID
      if (!id) return { status: "unconfigured", message: "NEXT_PUBLIC_CLARITY_ID not set", latency_ms: null }
      return { status: "ok", message: `Project ID: ${id}`, latency_ms: null }
    },
  },
  {
    name: "ga4",
    label: "Google Analytics 4",
    category: "analytics",
    check_class: "fast",
    url: "https://analytics.google.com",
    async run({ env }) {
      const id = env.GA_MEASUREMENT_ID || env.NEXT_PUBLIC_GA_MEASUREMENT_ID
      if (!id) return { status: "unconfigured", message: "GA_MEASUREMENT_ID not set", latency_ms: null }
      return { status: "ok", message: `Measurement ID: ${id}`, latency_ms: null }
    },
  },
  {
    name: "rudderstack",
    label: "RudderStack (Analytics)",
    category: "analytics",
    check_class: "fast",
    url: "https://app.rudderstack.com",
    async run({ env }) {
      const key = env.RUDDERSTACK_WRITE_KEY
      const plane = env.RUDDERSTACK_DATA_PLANE_URL
      if (!key || !plane) return { status: "unconfigured", message: "RUDDERSTACK_WRITE_KEY or DATA_PLANE_URL not set", latency_ms: null }
      return { status: "ok", message: `Write key configured — plane: ${plane}`, latency_ms: null }
    },
  },

  // ── AI ────────────────────────────────────────────────────────────────
  {
    name: "anthropic",
    label: "Anthropic (AI Assistant)",
    category: "ai",
    check_class: "fast",
    url: "https://console.anthropic.com",
    async run({ env }) {
      if (!env.ANTHROPIC_API_KEY) return { status: "unconfigured", message: "ANTHROPIC_API_KEY not set", latency_ms: null }
      return { status: "ok", message: `API key configured (Claude Haiku — Admin AI Chat)`, latency_ms: null }
    },
  },
]

// ─── Lookups ────────────────────────────────────────────────────────────────

export function getChecksByClass(cls: CheckClass): HealthCheckDefinition[] {
  return CHECKS.filter((c) => c.check_class === cls)
}

export function getCheckByName(name: string): HealthCheckDefinition | undefined {
  return CHECKS.find((c) => c.name === name)
}
