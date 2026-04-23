import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { stripe } from "../../../lib/stripe"
import { getFeatureFlag } from "../../../lib/feature-flags"

type ServiceStatus =
  | "ok"
  | "degraded"
  | "warning"
  | "error"
  | "critical"
  | "insufficient_signal"
  | "unconfigured"

type CheckClass = "fast" | "background" | "synthetic"

type ServiceCheck = {
  name: string
  label: string
  status: ServiceStatus
  message: string
  latency_ms: number | null
  url?: string
  // P1.1 additions (backward-compatible — legacy checks omit these)
  category?: string
  check_class?: CheckClass
  runbook?: string
  metadata?: Record<string, unknown>
}

async function checkWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs = 5000
): Promise<{ result?: T; error?: string; latency_ms: number }> {
  const start = Date.now()
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeoutMs)
      ),
    ])
    return { result, latency_ms: Date.now() - start }
  } catch (err: any) {
    return { error: err?.message || "Unknown error", latency_ms: Date.now() - start }
  }
}

// GET /admin/system-health
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  // ── Individual check functions (run in parallel) ──────────────────────────

  async function checkPostgres(): Promise<ServiceCheck> {
    try {
      const { latency_ms, error } = await checkWithTimeout(() =>
        pgConnection.raw("SELECT 1")
      )
      return {
        name: "postgresql", label: "PostgreSQL / Supabase",
        status: error ? "error" : "ok",
        message: error ? error : "Query OK",
        latency_ms,
        url: "https://supabase.com/dashboard/project/bofblwqieuvmqybzxapx",
      }
    } catch (e: any) {
      return { name: "postgresql", label: "PostgreSQL / Supabase", status: "error", message: e.message, latency_ms: null }
    }
  }

  async function checkStripe(): Promise<ServiceCheck> {
    if (!process.env.STRIPE_SECRET_KEY) {
      return { name: "stripe", label: "Stripe", status: "unconfigured", message: "STRIPE_SECRET_KEY not set", latency_ms: null, url: "https://dashboard.stripe.com" }
    }
    const { result, error, latency_ms } = await checkWithTimeout(() => stripe.balance.retrieve())
    return {
      name: "stripe", label: "Stripe",
      status: error ? "error" : "ok",
      message: error
        ? error
        : `Balance: ${Object.entries(result!.available[0] || {}).map(([k, v]) => `${k}=${v}`).join(", ") || "OK"}`,
      latency_ms,
      url: "https://dashboard.stripe.com",
    }
  }

  async function checkPayPal(): Promise<ServiceCheck> {
    const paypalClientId = process.env.PAYPAL_CLIENT_ID
    const paypalSecret = process.env.PAYPAL_CLIENT_SECRET
    const paypalMode = process.env.PAYPAL_MODE || "sandbox"
    if (!paypalClientId || !paypalSecret) {
      return { name: "paypal", label: "PayPal", status: "unconfigured", message: "PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET not set", latency_ms: null, url: "https://developer.paypal.com" }
    }
    const tokenUrl = paypalMode === "live"
      ? "https://api-m.paypal.com/v1/oauth2/token"
      : "https://api-m.sandbox.paypal.com/v1/oauth2/token"
    const { error, latency_ms } = await checkWithTimeout(async () => {
      const r = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${paypalClientId}:${paypalSecret}`).toString("base64")}`,
        },
        body: "grant_type=client_credentials",
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    return {
      name: "paypal", label: "PayPal",
      status: error ? "error" : "ok",
      message: error ? error : `OAuth OK (${paypalMode} mode)`,
      latency_ms,
      url: "https://developer.paypal.com/dashboard",
    }
  }

  async function checkResend(): Promise<ServiceCheck> {
    if (!process.env.RESEND_API_KEY) {
      return { name: "resend", label: "Resend (Email)", status: "unconfigured", message: "RESEND_API_KEY not set", latency_ms: null, url: "https://resend.com/overview" }
    }
    const { result, error, latency_ms } = await checkWithTimeout(async () => {
      const r = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    const domainCount = (result as any)?.data?.length ?? 0
    return {
      name: "resend", label: "Resend (Email)",
      status: error ? "error" : "ok",
      message: error ? error : `${domainCount} domain(s) configured`,
      latency_ms,
      url: "https://resend.com/overview",
    }
  }

  async function checkBrevo(): Promise<ServiceCheck> {
    if (!process.env.BREVO_API_KEY) {
      return { name: "brevo", label: "Brevo (CRM/Newsletter)", status: "unconfigured", message: "BREVO_API_KEY not set", latency_ms: null, url: "https://app.brevo.com" }
    }
    const { result, error, latency_ms } = await checkWithTimeout(async () => {
      const r = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": process.env.BREVO_API_KEY! },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    const plan = (result as any)?.plan?.[0]?.type ?? "unknown"
    return {
      name: "brevo", label: "Brevo (CRM/Newsletter)",
      status: error ? "error" : "ok",
      message: error ? error : `Plan: ${plan}`,
      latency_ms,
      url: "https://app.brevo.com",
    }
  }

  async function checkStorefront(): Promise<ServiceCheck> {
    const storefrontUrl = process.env.STOREFRONT_URL || "http://localhost:3000"
    const { error: e1, latency_ms: l1 } = await checkWithTimeout(async () => {
      const r = await fetch(`${storefrontUrl}/api/health`, { signal: AbortSignal.timeout(4000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.text()
    })
    if (!e1) {
      return { name: "storefront", label: "Storefront", status: "ok", message: `HTTP 200 (${storefrontUrl})`, latency_ms: l1, url: storefrontUrl }
    }
    // Fallback: check homepage
    const { error: e2, latency_ms: l2 } = await checkWithTimeout(async () => {
      const r = await fetch(storefrontUrl, { signal: AbortSignal.timeout(4000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.text()
    })
    return {
      name: "storefront", label: "Storefront",
      status: e2 ? "error" : "ok",
      message: e2 ? e2 : `HTTP 200 (${storefrontUrl})`,
      latency_ms: l2,
      url: storefrontUrl,
    }
  }

  function checkSentry(): ServiceCheck {
    // NEXT_PUBLIC_SENTRY_DSN is the storefront var; SENTRY_DSN is the backend mirror
    const sentryDsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
    const sentryOrg = process.env.SENTRY_ORG || "vod-records"
    const sentryProject = process.env.SENTRY_PROJECT || "vod-auctions-storefront"
    if (!sentryDsn) {
      return { name: "sentry", label: "Sentry (Error Tracking)", status: "unconfigured", message: "SENTRY_DSN not set in backend .env", latency_ms: null, url: "https://vod-records.sentry.io" }
    }
    return {
      name: "sentry", label: "Sentry (Error Tracking)",
      status: "ok",
      message: `Active — org: ${sentryOrg}, project: ${sentryProject}`,
      latency_ms: null,
      url: `https://vod-records.sentry.io/issues/`,
    }
  }

  function checkClarity(): ServiceCheck {
    const clarityId = process.env.CLARITY_ID || process.env.NEXT_PUBLIC_CLARITY_ID
    if (!clarityId) {
      return { name: "clarity", label: "Microsoft Clarity (UXA)", status: "unconfigured", message: "NEXT_PUBLIC_CLARITY_ID not set — get ID at clarity.microsoft.com", latency_ms: null, url: "https://clarity.microsoft.com" }
    }
    return { name: "clarity", label: "Microsoft Clarity (UXA)", status: "ok", message: `Project ID: ${clarityId} (session recordings + heatmaps, loads on marketing consent)`, latency_ms: null, url: `https://clarity.microsoft.com/projects/view/${clarityId}` }
  }

  async function checkR2Images(): Promise<ServiceCheck> {
    const r2Url = "https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev"
    const testImage = "tape-mag/standard/Die_Gesunden_kommen_live_Tempodrom.jpg"
    try {
      const start = Date.now()
      const res = await fetch(`${r2Url}/${testImage}`, { method: "HEAD", signal: AbortSignal.timeout(10000) })
      const latency = Date.now() - start
      if (res.ok) {
        return { name: "r2-images", label: "Cloudflare R2 (Image CDN)", status: "ok", message: `160,957 images — R2 public URL active (${latency}ms)`, latency_ms: latency, url: r2Url }
      }
      return { name: "r2-images", label: "Cloudflare R2 (Image CDN)", status: "error", message: `R2 returned HTTP ${res.status}`, latency_ms: latency, url: r2Url }
    } catch (e: any) {
      return { name: "r2-images", label: "Cloudflare R2 (Image CDN)", status: "error", message: `R2 unreachable: ${e.message}`, latency_ms: null, url: r2Url }
    }
  }

  function checkGA4(): ServiceCheck {
    // NEXT_PUBLIC_ vars are storefront-only; backend uses GA_MEASUREMENT_ID
    const gaMeasurementId = process.env.GA_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
    if (!gaMeasurementId) {
      return { name: "ga4", label: "Google Analytics 4", status: "unconfigured", message: "GA_MEASUREMENT_ID not set (add to backend .env)", latency_ms: null, url: "https://analytics.google.com" }
    }
    return {
      name: "ga4", label: "Google Analytics 4",
      status: "ok",
      message: `Measurement ID: ${gaMeasurementId} (active on storefront)`,
      latency_ms: null,
      url: `https://analytics.google.com/analytics/web/#/p${gaMeasurementId.replace("G-", "")}`,
    }
  }

  function checkRudderStack(): ServiceCheck {
    const writeKey = process.env.RUDDERSTACK_WRITE_KEY
    const dataPlaneUrl = process.env.RUDDERSTACK_DATA_PLANE_URL
    if (!writeKey || !dataPlaneUrl) {
      return { name: "rudderstack", label: "RudderStack (Analytics)", status: "unconfigured", message: "RUDDERSTACK_WRITE_KEY or DATA_PLANE_URL not set", latency_ms: null, url: "https://app.rudderstack.com" }
    }
    return {
      name: "rudderstack", label: "RudderStack (Analytics)",
      status: "ok",
      message: `Write key configured — plane: ${dataPlaneUrl}`,
      latency_ms: null,
      url: "https://app.rudderstack.com",
    }
  }

  async function checkMeilisearch(): Promise<ServiceCheck> {
    const url = process.env.MEILI_URL
    const apiKey = process.env.MEILI_ADMIN_API_KEY
    if (!url || !apiKey) {
      return {
        name: "meilisearch", label: "Meilisearch (Search)",
        status: "unconfigured",
        message: "MEILI_URL or MEILI_ADMIN_API_KEY not set",
        latency_ms: null,
        url: "/app/config",
      }
    }
    const { result, error, latency_ms } = await checkWithTimeout(async () => {
      const [healthRes, statsRes] = await Promise.all([
        fetch(`${url}/health`, { headers: { Authorization: `Bearer ${apiKey}` } }),
        fetch(`${url}/stats`, { headers: { Authorization: `Bearer ${apiKey}` } }),
      ])
      if (!healthRes.ok) throw new Error(`health HTTP ${healthRes.status}`)
      if (!statsRes.ok) throw new Error(`stats HTTP ${statsRes.status}`)
      return { health: await healthRes.json(), stats: await statsRes.json() }
    })
    if (error) {
      return { name: "meilisearch", label: "Meilisearch (Search)", status: "error", message: error, latency_ms, url: "/app/config" }
    }
    const r = result as any
    const indexes = r?.stats?.indexes ?? {}
    const indexNames = Object.keys(indexes)
    const totalDocs = indexNames.reduce((sum, k) => sum + (indexes[k]?.numberOfDocuments ?? 0), 0)
    let flagOn = false
    try {
      flagOn = await getFeatureFlag(pgConnection, "SEARCH_MEILI_CATALOG")
    } catch { /* flag unknown — omit from message */ }
    const healthStatus = r?.health?.status ?? "unknown"
    return {
      name: "meilisearch", label: "Meilisearch (Search)",
      status: "ok",
      message: `${healthStatus} — ${indexNames.length} index(es), ${totalDocs.toLocaleString("de-DE")} docs · flag SEARCH_MEILI_CATALOG: ${flagOn ? "ON" : "OFF"}`,
      latency_ms,
      url: "/app/config",
    }
  }

  async function checkUpstash(): Promise<ServiceCheck> {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    if (!url || !token) {
      return { name: "upstash", label: "Upstash Redis (Cache)", status: "unconfigured", message: "UPSTASH_REDIS_REST_URL or TOKEN not set", latency_ms: null, url: "https://console.upstash.com" }
    }
    const { result, error, latency_ms } = await checkWithTimeout(async () => {
      const r = await fetch(`${url}/ping`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    return {
      name: "upstash", label: "Upstash Redis (Cache)",
      status: error ? "error" : "ok",
      message: error ? error : `PONG — ${url.replace("https://", "").split(".")[0]}`,
      latency_ms,
      url: "https://console.upstash.com",
    }
  }

  function checkAnthropic(): ServiceCheck {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return { name: "anthropic", label: "Anthropic (AI Assistant)", status: "unconfigured", message: "ANTHROPIC_API_KEY not set", latency_ms: null, url: "https://console.anthropic.com" }
    }
    return {
      name: "anthropic", label: "Anthropic (AI Assistant)",
      status: "ok",
      message: `API key configured (Claude Haiku — Admin AI Chat)`,
      latency_ms: null,
      url: "https://console.anthropic.com",
    }
  }

  async function checkVPS(): Promise<ServiceCheck> {
    const apiUrl = "https://api.vod-auctions.com"
    const { error: e1, latency_ms: l1 } = await checkWithTimeout(async () => {
      const r = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.text()
    })
    if (!e1) {
      return { name: "vps", label: "VPS / API Server (Hostinger)", status: "ok", message: `Health OK (${apiUrl})`, latency_ms: l1, url: "https://manage.hostinger.com" }
    }
    // Fallback: check store endpoint
    const { error: e2, latency_ms: l2 } = await checkWithTimeout(async () => {
      const r = await fetch(`${apiUrl}/store/auction-blocks?limit=1`, {
        signal: AbortSignal.timeout(5000),
        headers: { "x-publishable-api-key": process.env.MEDUSA_PUBLISHABLE_KEY || "" },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.text()
    })
    return {
      name: "vps", label: "VPS / API Server (Hostinger)",
      status: e2 ? "error" : "ok",
      message: e2 ? e2 : `API responding (${apiUrl})`,
      latency_ms: l2,
      url: "https://manage.hostinger.com",
    }
  }

  async function checkStorefrontPublic(): Promise<ServiceCheck> {
    const publicStorefrontUrl = "https://vod-auctions.com"
    const { error, latency_ms } = await checkWithTimeout(async () => {
      // Accept 2xx and 3xx (password gate returns redirect) as "up"
      const r = await fetch(publicStorefrontUrl, { signal: AbortSignal.timeout(5000), redirect: "manual" })
      if (r.status >= 500) throw new Error(`HTTP ${r.status}`)
      return r.text()
    })
    return {
      name: "storefront_public", label: "Storefront (vod-auctions.com)",
      status: error ? "error" : "ok",
      message: error ? error : `Responding (${publicStorefrontUrl})`,
      latency_ms,
      url: publicStorefrontUrl,
    }
  }

  // ── Run all checks in parallel ────────────────────────────────────────────
  const checks = await Promise.all([
    checkPostgres(),
    checkStripe(),
    checkPayPal(),
    checkResend(),
    checkBrevo(),
    checkStorefront(),
    Promise.resolve(checkSentry()),
    Promise.resolve(checkClarity()),
    Promise.resolve(checkGA4()),
    Promise.resolve(checkRudderStack()),
    checkUpstash(),
    checkMeilisearch(),
    Promise.resolve(checkAnthropic()),
    checkVPS(),
    checkStorefrontPublic(),
    checkR2Images(),
  ])

  // ── Summary ───────────────────────────────────────────────────────────────
  const count = (s: ServiceStatus) => checks.filter((c) => c.status === s).length
  const summary = {
    total: checks.length,
    ok: count("ok"),
    degraded: count("degraded"),
    warning: count("warning"),
    error: count("error"),
    critical: count("critical"),
    insufficient_signal: count("insufficient_signal"),
    unconfigured: count("unconfigured"),
    // legacy alias for older clients
    errors: count("error") + count("critical"),
  }

  res.json({
    summary,
    services: checks,
    checked_at: new Date().toISOString(),
  })
}
