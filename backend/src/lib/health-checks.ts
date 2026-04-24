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
import { getSiteConfig } from "./site-config"
import { statfs } from "node:fs/promises"
import { exec } from "node:child_process"
import { promisify } from "node:util"
import tls from "node:tls"

const execAsync = promisify(exec)

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
  /** Relative path from repo root to markdown runbook. Rendered as link in UI. */
  runbook?: string
  run: (ctx: CheckContext) => Promise<CheckRunResult>
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Class-specific default timeout per §3.2. Background bumped from 5s→10s
 * in rc49.3: COUNT(*) on "Release" (52k rows) can hit 3-5s under Postgres
 * cold cache, so 5s produced false-positive probe failures cascading with
 * the 2026-04-23 meili_sync incident. 10s gives real headroom without
 * compromising UX (background probes don't block rendering). */
export function timeoutForClass(cls: CheckClass): number {
  if (cls === "fast") return 500
  if (cls === "background") return 10_000
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
    runbook: "https://github.com/rseckler/VOD_Auctions/blob/main/docs/runbooks/postgresql.md",
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
    runbook: "https://github.com/rseckler/VOD_Auctions/blob/main/docs/runbooks/vps.md",
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
    runbook: "https://github.com/rseckler/VOD_Auctions/blob/main/docs/runbooks/storefront.md",
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
    runbook: "https://github.com/rseckler/VOD_Auctions/blob/main/docs/runbooks/upstash.md",
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
    runbook: "https://github.com/rseckler/VOD_Auctions/blob/main/docs/runbooks/meilisearch.md",
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
        const indexes: Record<string, any> = stats?.indexes ?? {}
        const totalDocs: number = Object.values(indexes).reduce<number>((sum, idx: any) => sum + (idx?.numberOfDocuments ?? 0), 0)
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
    runbook: "https://github.com/rseckler/VOD_Auctions/blob/main/docs/runbooks/stripe.md",
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

  // ── Infrastructure (P1.9 — VPS-local) ────────────────────────────────
  {
    name: "disk_space",
    label: "Disk Space (VPS /)",
    category: "infrastructure",
    check_class: "background",
    severity_note: "ok < 80%, warning 80-90%, error 90-95%, critical > 95%",
    async run() {
      const start = Date.now()
      try {
        const s = await statfs("/")
        const totalBytes = s.blocks * s.bsize
        const freeBytes = s.bavail * s.bsize
        const usedBytes = totalBytes - freeBytes
        const usedPct = (usedBytes / totalBytes) * 100
        const latency_ms = Date.now() - start
        const status: ServiceStatus =
          usedPct > 95 ? "critical" :
          usedPct > 90 ? "error" :
          usedPct > 80 ? "warning" :
          "ok"
        const fmtGB = (b: number) => (b / 1e9).toFixed(1)
        return {
          status,
          message: `${usedPct.toFixed(1)}% used · ${fmtGB(usedBytes)}/${fmtGB(totalBytes)} GB · ${fmtGB(freeBytes)} GB free`,
          latency_ms,
          metadata: { used_pct: Number(usedPct.toFixed(2)), used_gb: Number(fmtGB(usedBytes)), total_gb: Number(fmtGB(totalBytes)), free_gb: Number(fmtGB(freeBytes)) },
        }
      } catch (e: any) {
        return { status: "error", message: e?.message || "statfs failed", latency_ms: Date.now() - start }
      }
    },
  },
  {
    name: "ssl_expiry",
    label: "SSL Certificates (3 Domains)",
    category: "infrastructure",
    check_class: "background",
    severity_note: "ok > 30d, warning 14-30d, error 7-14d, critical < 7d · checks api./admin./vod-auctions.com",
    async run() {
      const hosts = ["vod-auctions.com", "api.vod-auctions.com", "admin.vod-auctions.com"]
      const start = Date.now()
      const getExpiry = (host: string): Promise<Date> =>
        new Promise((resolve, reject) => {
          const socket = tls.connect({ host, port: 443, servername: host, timeout: 4000 }, () => {
            const cert = socket.getPeerCertificate()
            socket.end()
            if (!cert?.valid_to) return reject(new Error(`no cert for ${host}`))
            resolve(new Date(cert.valid_to))
          })
          socket.on("error", reject)
          socket.on("timeout", () => { socket.destroy(); reject(new Error(`tls timeout for ${host}`)) })
        })
      try {
        const results = await Promise.allSettled(hosts.map((h) => getExpiry(h)))
        const perHost: Array<{ host: string; days?: number; error?: string }> = []
        let minDays = Infinity
        let anyError = false
        results.forEach((r, i) => {
          if (r.status === "fulfilled") {
            const days = Math.floor((r.value.getTime() - Date.now()) / 86_400_000)
            perHost.push({ host: hosts[i], days })
            if (days < minDays) minDays = days
          } else {
            anyError = true
            perHost.push({ host: hosts[i], error: r.reason?.message || "failed" })
          }
        })
        const latency_ms = Date.now() - start
        const status: ServiceStatus = anyError
          ? "error"
          : minDays < 7 ? "critical"
          : minDays < 14 ? "error"
          : minDays < 30 ? "warning"
          : "ok"
        const msg = anyError
          ? `check failed for ${perHost.filter((p) => p.error).map((p) => p.host).join(", ")}`
          : `min expiry ${minDays}d (${perHost.map((p) => `${p.host.split(".")[0]}:${p.days}d`).join(", ")})`
        return { status, message: msg, latency_ms, metadata: { hosts: perHost, min_days: minDays === Infinity ? null : minDays } }
      } catch (e: any) {
        return { status: "error", message: e?.message || "tls check failed", latency_ms: Date.now() - start }
      }
    },
  },
  {
    name: "pm2_status",
    label: "PM2 Processes",
    category: "infrastructure",
    check_class: "background",
    severity_note: "Primär: unstable_restarts (PM2 crash-loop-detection) + uptime. Lifetime restart_time ist nur informativ — steigt bei jedem legitimen Deploy, sagt nichts über aktuellen Zustand.",
    async run() {
      const start = Date.now()
      try {
        const { stdout } = await execAsync("pm2 jlist", { timeout: 4500 })
        const procs = JSON.parse(stdout) as any[]
        const latency_ms = Date.now() - start
        const vodApps = procs.filter((p) => p.name?.startsWith("vodauction"))
        const now = Date.now()
        const details = vodApps.map((p) => ({
          name: p.name,
          status: p.pm2_env?.status,
          restarts_lifetime: p.pm2_env?.restart_time ?? 0,
          unstable_restarts: p.pm2_env?.unstable_restarts ?? 0,
          uptime_sec: p.pm2_env?.pm_uptime ? Math.floor((now - p.pm2_env.pm_uptime) / 1000) : null,
        }))

        const anyDown = details.some((d) => d.status !== "online")
        const anyUnstable = details.some((d) => d.unstable_restarts > 0)
        const anyVeryYoung = details.some((d) => d.uptime_sec !== null && d.uptime_sec < 60)

        let status: ServiceStatus = "ok"
        let msgParts: string[] = []

        if (anyDown) {
          status = "critical"
          const down = details.filter((d) => d.status !== "online")
          msgParts.push(`DOWN: ${down.map((d) => d.name).join(", ")}`)
        } else if (anyUnstable) {
          status = "error"
          const unstable = details.filter((d) => d.unstable_restarts > 0)
          msgParts.push(`crash-loop: ${unstable.map((d) => `${d.name}(${d.unstable_restarts}×)`).join(", ")}`)
        } else if (anyVeryYoung) {
          status = "warning"
          const young = details.filter((d) => d.uptime_sec !== null && d.uptime_sec < 60)
          msgParts.push(`recently restarted: ${young.map((d) => d.name).join(", ")}`)
        } else {
          msgParts.push(`${details.length} online`)
        }
        // Informational suffix — lifetime restarts as context, not alarm
        const maxLifetime = Math.max(...details.map((d) => d.restarts_lifetime), 0)
        if (maxLifetime > 0) msgParts.push(`lifetime restarts: ${maxLifetime}`)

        return {
          status,
          message: msgParts.join(" · "),
          latency_ms,
          metadata: { vod_apps: details, total_procs: procs.length },
        }
      } catch (e: any) {
        return { status: "error", message: e?.message || "pm2 jlist failed", latency_ms: Date.now() - start }
      }
    },
  },

  // ── External APIs (P1.10) ────────────────────────────────────────────
  {
    name: "discogs_api",
    label: "Discogs API",
    category: "data_plane",
    check_class: "background",
    severity_note: "ok if reachable with rate-limit-remaining > 30 · warning if 10-30 · error if < 10 or unreachable",
    async run() {
      const start = Date.now()
      try {
        const r = await fetch("https://api.discogs.com/database/search?q=test&per_page=1", {
          headers: { "User-Agent": "VOD-Auctions-Health/1.0" },
          signal: AbortSignal.timeout(4500),
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const remaining = Number(r.headers.get("x-discogs-ratelimit-remaining") ?? NaN)
        const total = Number(r.headers.get("x-discogs-ratelimit") ?? NaN)
        const latency_ms = Date.now() - start
        const status: ServiceStatus =
          !Number.isFinite(remaining) ? "degraded" :
          remaining < 10 ? "error" :
          remaining < 30 ? "warning" :
          "ok"
        return {
          status,
          message: Number.isFinite(remaining)
            ? `rate-limit ${remaining}/${total} remaining`
            : "reachable (no rate-limit header)",
          latency_ms,
          metadata: { rate_limit_remaining: Number.isFinite(remaining) ? remaining : null, rate_limit_total: Number.isFinite(total) ? total : null },
        }
      } catch (e: any) {
        return { status: "error", message: e?.message || "unreachable", latency_ms: Date.now() - start }
      }
    },
  },
  {
    name: "supabase_realtime",
    label: "Supabase Realtime (Live-Bidding)",
    category: "data_plane",
    check_class: "background",
    severity_note: "2-step probe: (1) REST-API als Baseline — 401 mit apikey-header = Projekt lebt. (2) Realtime /websocket — 101/426 = healthy, 5xx = degraded (Cloudflare-1101 von Supabase-Workers oft bei Pre-Launch-Projekten mit nicht-aktivierter Realtime).",
    async run({ env }) {
      const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
      if (!anonKey) {
        return { status: "unconfigured", message: "SUPABASE_ANON_KEY not set in backend env", latency_ms: null }
      }
      const projectBase = "https://bofblwqieuvmqybzxapx.supabase.co"
      const start = Date.now()
      try {
        // Step 1: REST-API reachable? This tells us the Supabase project itself is live.
        const restRes = await fetch(`${projectBase}/rest/v1/`, {
          headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
          signal: AbortSignal.timeout(2500),
        })
        // 401 here is OK — means project routes work, just no table specified
        if (restRes.status >= 500) {
          const latency_ms = Date.now() - start
          return { status: "error", message: `Supabase REST HTTP ${restRes.status} (project down)`, latency_ms, metadata: { rest_status: restRes.status } }
        }

        // Step 2: Realtime endpoint probe. Upgrade-Required or similar = healthy.
        const rtRes = await fetch(`${projectBase}/realtime/v1/websocket?apikey=${encodeURIComponent(anonKey)}&vsn=1.0.0`, {
          headers: { apikey: anonKey },
          signal: AbortSignal.timeout(2500),
        })
        const latency_ms = Date.now() - start
        if (rtRes.status >= 500) {
          // Common case: Cloudflare-1101 from Supabase-Workers when Realtime isn't
          // initialized for the project. REST works → degraded, not error.
          return {
            status: "degraded",
            message: `Realtime HTTP ${rtRes.status} (Supabase project OK, Realtime service unhealthy — check project.realtime config)`,
            latency_ms,
            metadata: { rest_status: restRes.status, realtime_status: rtRes.status },
          }
        }
        return {
          status: "ok",
          message: `REST ${restRes.status}, Realtime ${rtRes.status} (${latency_ms}ms)`,
          latency_ms,
          metadata: { rest_status: restRes.status, realtime_status: rtRes.status },
        }
      } catch (e: any) {
        return { status: "error", message: e?.message || "unreachable", latency_ms: Date.now() - start }
      }
    },
  },

  // ── Sync Pipelines (P1.8) ─────────────────────────────────────────────
  {
    name: "sync_log_freshness",
    label: "Legacy Sync (sync_log)",
    category: "sync_pipelines",
    check_class: "background",
    runbook: "https://github.com/rseckler/VOD_Auctions/blob/main/docs/runbooks/sync_pipelines.md",
    severity_note: "ok < 1h, warning 1-3h, error > 3h (cron runs hourly)",
    async run({ pg }) {
      const start = Date.now()
      try {
        // rc49.9: age-Berechnung SQL-seitig. sync_log.ended_at ist
        // TIMESTAMP WITHOUT TIME ZONE — node-postgres parsed das als
        // lokaler CEST-Timestamp, nicht als UTC → 2h Offset auf VPS
        // (CEST=UTC+2), UI zeigte "last run 129min ago" für einen Run
        // der erst 12min alt war. EPOCH-Diff in Postgres umgeht die
        // JS-Date-Parsing-Falle.
        const { rows } = await pg.raw(
          `SELECT validation_status, run_id, rows_written,
                  EXTRACT(EPOCH FROM (NOW() - ended_at))::int AS age_sec,
                  (ended_at IS NOT NULL) AS has_ended_at
             FROM sync_log
            WHERE phase IS NOT NULL AND validation_status IS NOT NULL
            ORDER BY ended_at DESC NULLS LAST
            LIMIT 1`
        )
        const latency_ms = Date.now() - start
        if (!rows || rows.length === 0) {
          return { status: "warning", message: "no sync_log entries found", latency_ms }
        }
        const row = rows[0]
        if (!row.has_ended_at || row.age_sec == null) {
          return { status: "warning", message: "latest sync has no ended_at", latency_ms, metadata: row }
        }
        const ageMin = Math.round(Number(row.age_sec) / 60)
        const status: ServiceStatus =
          ageMin > 180 ? "error" :
          ageMin > 60 ? "warning" :
          row.validation_status !== "ok" ? "degraded" : "ok"
        return {
          status,
          message: `last run ${ageMin}min ago · validation: ${row.validation_status} · rows_written: ${row.rows_written}`,
          latency_ms,
          metadata: { age_min: ageMin, run_id: row.run_id, validation_status: row.validation_status, rows_written: row.rows_written },
        }
      } catch (e: any) {
        return { status: "error", message: e?.message || "query failed", latency_ms: Date.now() - start }
      }
    },
  },
  {
    name: "meili_drift",
    label: "Meilisearch Drift",
    category: "sync_pipelines",
    check_class: "background",
    runbook: "https://github.com/rseckler/VOD_Auctions/blob/main/docs/runbooks/sync_pipelines.md",
    severity_note: "maps drift_log.severity directly (ok/warning/critical) · cron every 30min",
    async run({ pg }) {
      const start = Date.now()
      try {
        const { rows } = await pg.raw(
          `SELECT timestamp, profile, db_count, meili_count, diff_pct, severity
             FROM meilisearch_drift_log
            ORDER BY timestamp DESC
            LIMIT 1`
        )
        const latency_ms = Date.now() - start
        if (!rows || rows.length === 0) {
          return { status: "warning", message: "no drift_log entries yet", latency_ms }
        }
        const row = rows[0]
        const ageMin = Math.round((Date.now() - new Date(row.timestamp).getTime()) / 60_000)
        if (ageMin > 90) {
          return { status: "error", message: `drift check stale: last run ${ageMin}min ago (expected every 30min)`, latency_ms, metadata: row }
        }
        const sev = row.severity as string
        const status: ServiceStatus =
          sev === "critical" ? "critical" :
          sev === "warning" ? "warning" :
          sev === "ok" ? "ok" : "degraded"
        return {
          status,
          message: `drift ${Number(row.diff_pct).toFixed(2)}% · db: ${row.db_count} / meili: ${row.meili_count} · ${ageMin}min ago`,
          latency_ms,
          metadata: { diff_pct: Number(row.diff_pct), db_count: row.db_count, meili_count: row.meili_count, severity: sev, age_min: ageMin },
        }
      } catch (e: any) {
        return { status: "error", message: e?.message || "query failed", latency_ms: Date.now() - start }
      }
    },
  },
  {
    name: "meili_backlog",
    label: "Meilisearch Backlog",
    category: "sync_pipelines",
    check_class: "background",
    runbook: "https://github.com/rseckler/VOD_Auctions/blob/main/docs/runbooks/sync_pipelines.md",
    severity_note: "rows with search_indexed_at IS NULL · ok < 100, warning 100-1000, error > 1000",
    async run({ pg }) {
      const start = Date.now()
      try {
        const { rows } = await pg.raw(`SELECT COUNT(*)::int AS backlog FROM "Release" WHERE search_indexed_at IS NULL`)
        const latency_ms = Date.now() - start
        const backlog: number = rows?.[0]?.backlog ?? 0
        const status: ServiceStatus =
          backlog > 1000 ? "error" :
          backlog > 100 ? "warning" :
          "ok"
        return {
          status,
          message: `${backlog.toLocaleString("de-DE")} rows pending reindex`,
          latency_ms,
          metadata: { backlog },
        }
      } catch (e: any) {
        return { status: "error", message: e?.message || "query failed", latency_ms: Date.now() - start }
      }
    },
  },

  // ── Business Flows (P2.5-P2.7) — synthetic, Platform-Mode-aware ─────
  {
    name: "last_order",
    label: "Last Order (transaction)",
    category: "business_flows",
    check_class: "synthetic",
    severity_note: "beta_test/pre_launch → insufficient_signal · live → ok<24h, warning<72h, error≥72h",
    async run({ pg }) {
      const start = Date.now()
      try {
        const cfg = await getSiteConfig(pg)
        const mode = cfg.platform_mode
        // SET LOCAL statement_timeout scoped to this transaction — prevents
        // lock-contention hangs (e.g. checkout holding row locks on "transaction")
        // from cascading into a 30s probe timeout. "transaction" must be quoted
        // because it is a reserved keyword in PostgreSQL.
        const txResult = await pg.transaction(async (trx) => {
          await trx.raw(`SET LOCAL statement_timeout = 8000`)
          return trx.raw(`SELECT MAX(created_at) AS last_at FROM "transaction"`)
        })
        const { rows } = (txResult as unknown) as { rows: any[] }
        const last = rows?.[0]?.last_at ? new Date(rows[0].last_at) : null
        const latency_ms = Date.now() - start
        if (!last) {
          return { status: "insufficient_signal", message: `no orders yet · platform_mode=${mode}`, latency_ms, metadata: { platform_mode: mode } }
        }
        const ageHr = (Date.now() - last.getTime()) / 3_600_000
        const ageText = ageHr < 1 ? `${Math.round(ageHr * 60)}min ago` : ageHr < 24 ? `${ageHr.toFixed(1)}h ago` : `${Math.floor(ageHr / 24)}d ${Math.round(ageHr % 24)}h ago`
        // Only live-mode expects continuous activity. Beta/pre_launch accept long gaps.
        if (mode !== "live") {
          return {
            status: "insufficient_signal",
            message: `last order ${ageText} · platform_mode=${mode} (traffic not expected)`,
            latency_ms,
            metadata: { last_order_at: last.toISOString(), age_hr: Number(ageHr.toFixed(2)), platform_mode: mode },
          }
        }
        const status: ServiceStatus =
          ageHr >= 72 ? "error" :
          ageHr >= 24 ? "warning" :
          "ok"
        return {
          status,
          message: `last order ${ageText}`,
          latency_ms,
          metadata: { last_order_at: last.toISOString(), age_hr: Number(ageHr.toFixed(2)), platform_mode: mode },
        }
      } catch (e: any) {
        return { status: "error", message: e?.message || "query failed", latency_ms: Date.now() - start }
      }
    },
  },
  {
    name: "active_auctions",
    label: "Active Auctions",
    category: "business_flows",
    check_class: "synthetic",
    severity_note: "live-mode expects >0 · beta_test/pre_launch: 0 is fine (insufficient_signal)",
    async run({ pg }) {
      const start = Date.now()
      try {
        const cfg = await getSiteConfig(pg)
        const mode = cfg.platform_mode
        const { rows } = await pg.raw(`SELECT COUNT(*)::int AS live_count FROM auction_block WHERE status = 'live'`)
        const liveCount: number = rows?.[0]?.live_count ?? 0
        const latency_ms = Date.now() - start
        if (mode !== "live") {
          return {
            status: "insufficient_signal",
            message: `${liveCount} live auction(s) · platform_mode=${mode}`,
            latency_ms,
            metadata: { live_count: liveCount, platform_mode: mode },
          }
        }
        // live mode — 0 is a warning, non-zero OK
        const status: ServiceStatus = liveCount === 0 ? "warning" : "ok"
        return {
          status,
          message: `${liveCount} auction(s) currently live`,
          latency_ms,
          metadata: { live_count: liveCount, platform_mode: mode },
        }
      } catch (e: any) {
        return { status: "error", message: e?.message || "query failed", latency_ms: Date.now() - start }
      }
    },
  },
  {
    name: "stripe_webhook_freshness",
    label: "Stripe Webhook (last event)",
    category: "business_flows",
    check_class: "synthetic",
    severity_note: "Stripe Events API /v1/events?limit=1 · insufficient_signal wenn platform_mode != live",
    async run({ pg, env }) {
      const start = Date.now()
      if (!env.STRIPE_SECRET_KEY) {
        return { status: "unconfigured", message: "STRIPE_SECRET_KEY not set", latency_ms: null }
      }
      try {
        const cfg = await getSiteConfig(pg)
        const mode = cfg.platform_mode
        const events = await stripe.events.list({ limit: 1 })
        const latency_ms = Date.now() - start
        const latest = events.data[0]
        if (!latest) {
          return { status: "insufficient_signal", message: "no Stripe events in account", latency_ms, metadata: { platform_mode: mode } }
        }
        const ageMin = (Date.now() / 1000 - latest.created) / 60
        const ageText = ageMin < 60 ? `${Math.round(ageMin)}min ago` : ageMin < 1440 ? `${(ageMin / 60).toFixed(1)}h ago` : `${Math.floor(ageMin / 1440)}d ago`
        if (mode !== "live") {
          return {
            status: "insufficient_signal",
            message: `last event ${ageText} (type=${latest.type}) · platform_mode=${mode}`,
            latency_ms,
            metadata: { last_event_type: latest.type, age_min: Math.round(ageMin), platform_mode: mode },
          }
        }
        // live mode — webhooks expected at regular intervals
        const status: ServiceStatus =
          ageMin >= 1440 ? "error" :     // >24h in live mode is problematic
          ageMin >= 360 ? "warning" :    // >6h degraded
          "ok"
        return {
          status,
          message: `last event ${ageText} (type=${latest.type})`,
          latency_ms,
          metadata: { last_event_type: latest.type, age_min: Math.round(ageMin), platform_mode: mode },
        }
      } catch (e: any) {
        return { status: "error", message: e?.message || "stripe events query failed", latency_ms: Date.now() - start }
      }
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
