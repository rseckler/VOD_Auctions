import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { stripe } from "../../../lib/stripe"

type ServiceStatus = "ok" | "degraded" | "error" | "unconfigured"

type ServiceCheck = {
  name: string
  label: string
  status: ServiceStatus
  message: string
  latency_ms: number | null
  url?: string
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
    const sentryDsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
    const sentryOrg = process.env.SENTRY_ORG
    const sentryProject = process.env.SENTRY_PROJECT
    if (!sentryDsn) {
      return { name: "sentry", label: "Sentry (Error Tracking)", status: "unconfigured", message: "SENTRY_DSN not set", latency_ms: null, url: "https://sentry.io" }
    }
    return {
      name: "sentry", label: "Sentry (Error Tracking)",
      status: "ok",
      message: `DSN configured — org: ${sentryOrg || "?"}, project: ${sentryProject || "?"}`,
      latency_ms: null,
      url: `https://vod-records.sentry.io/issues/?project=${sentryProject || ""}`,
    }
  }

  function checkContentSquare(): ServiceCheck {
    const csSiteId = process.env.NEXT_PUBLIC_CS_SITE_ID
    if (!csSiteId) {
      return { name: "contentsquare", label: "ContentSquare (UXA)", status: "unconfigured", message: "NEXT_PUBLIC_CS_SITE_ID not set", latency_ms: null, url: "https://app.contentsquare.com" }
    }
    return { name: "contentsquare", label: "ContentSquare (UXA)", status: "ok", message: `Site ID: ${csSiteId} (loads on marketing consent)`, latency_ms: null, url: "https://app.contentsquare.com" }
  }

  function checkGA4(): ServiceCheck {
    const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
    if (!gaMeasurementId) {
      return { name: "ga4", label: "Google Analytics 4", status: "unconfigured", message: "NEXT_PUBLIC_GA_MEASUREMENT_ID not set", latency_ms: null, url: "https://analytics.google.com" }
    }
    return {
      name: "ga4", label: "Google Analytics 4",
      status: "ok",
      message: `Measurement ID: ${gaMeasurementId}`,
      latency_ms: null,
      url: `https://analytics.google.com/analytics/web/#/p${gaMeasurementId.replace("G-", "")}`,
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
    Promise.resolve(checkContentSquare()),
    Promise.resolve(checkGA4()),
    checkVPS(),
    checkStorefrontPublic(),
  ])

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = checks.length
  const ok = checks.filter((c) => c.status === "ok").length
  const errors = checks.filter((c) => c.status === "error").length
  const unconfigured = checks.filter((c) => c.status === "unconfigured").length

  res.json({
    summary: { total, ok, errors, unconfigured, degraded: total - ok - errors - unconfigured },
    services: checks,
    checked_at: new Date().toISOString(),
  })
}
