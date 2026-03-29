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
  const checks: ServiceCheck[] = []

  // ── 1. PostgreSQL / Supabase DB ──────────────────────────────────────────
  try {
    const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    const { latency_ms, error } = await checkWithTimeout(() =>
      pgConnection.raw("SELECT 1")
    )
    checks.push({
      name: "postgresql",
      label: "PostgreSQL / Supabase",
      status: error ? "error" : "ok",
      message: error ? error : "Query OK",
      latency_ms,
      url: "https://supabase.com/dashboard/project/bofblwqieuvmqybzxapx",
    })
  } catch (e: any) {
    checks.push({ name: "postgresql", label: "PostgreSQL / Supabase", status: "error", message: e.message, latency_ms: null })
  }

  // ── 2. Stripe ────────────────────────────────────────────────────────────
  if (!process.env.STRIPE_SECRET_KEY) {
    checks.push({ name: "stripe", label: "Stripe", status: "unconfigured", message: "STRIPE_SECRET_KEY not set", latency_ms: null, url: "https://dashboard.stripe.com" })
  } else {
    const { result, error, latency_ms } = await checkWithTimeout(() =>
      stripe.balance.retrieve()
    )
    checks.push({
      name: "stripe",
      label: "Stripe",
      status: error ? "error" : "ok",
      message: error
        ? error
        : `Balance: ${Object.entries(result!.available[0] || {})
            .map(([k, v]) => `${k}=${v}`)
            .join(", ") || "OK"}`,
      latency_ms,
      url: "https://dashboard.stripe.com",
    })
  }

  // ── 3. PayPal ────────────────────────────────────────────────────────────
  const paypalClientId = process.env.PAYPAL_CLIENT_ID
  const paypalSecret = process.env.PAYPAL_CLIENT_SECRET
  const paypalMode = process.env.PAYPAL_MODE || "sandbox"

  if (!paypalClientId || !paypalSecret) {
    checks.push({ name: "paypal", label: "PayPal", status: "unconfigured", message: "PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET not set", latency_ms: null, url: "https://developer.paypal.com" })
  } else {
    const tokenUrl = paypalMode === "live"
      ? "https://api-m.paypal.com/v1/oauth2/token"
      : "https://api-m.sandbox.paypal.com/v1/oauth2/token"
    const { result, error, latency_ms } = await checkWithTimeout(async () => {
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
    checks.push({
      name: "paypal",
      label: "PayPal",
      status: error ? "error" : "ok",
      message: error ? error : `OAuth OK (${paypalMode} mode)`,
      latency_ms,
      url: "https://developer.paypal.com/dashboard",
    })
  }

  // ── 4. Resend (Email) ────────────────────────────────────────────────────
  if (!process.env.RESEND_API_KEY) {
    checks.push({ name: "resend", label: "Resend (Email)", status: "unconfigured", message: "RESEND_API_KEY not set", latency_ms: null, url: "https://resend.com/overview" })
  } else {
    const { result, error, latency_ms } = await checkWithTimeout(async () => {
      const r = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    const domainCount = (result as any)?.data?.length ?? 0
    checks.push({
      name: "resend",
      label: "Resend (Email)",
      status: error ? "error" : "ok",
      message: error ? error : `${domainCount} domain(s) configured`,
      latency_ms,
      url: "https://resend.com/overview",
    })
  }

  // ── 5. Brevo (CRM / Newsletter) ──────────────────────────────────────────
  if (!process.env.BREVO_API_KEY) {
    checks.push({ name: "brevo", label: "Brevo (CRM/Newsletter)", status: "unconfigured", message: "BREVO_API_KEY not set", latency_ms: null, url: "https://app.brevo.com" })
  } else {
    const { result, error, latency_ms } = await checkWithTimeout(async () => {
      const r = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": process.env.BREVO_API_KEY! },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    const plan = (result as any)?.plan?.[0]?.type ?? "unknown"
    checks.push({
      name: "brevo",
      label: "Brevo (CRM/Newsletter)",
      status: error ? "error" : "ok",
      message: error ? error : `Plan: ${plan}`,
      latency_ms,
      url: "https://app.brevo.com",
    })
  }

  // ── 6. Storefront ────────────────────────────────────────────────────────
  const storefrontUrl = process.env.STOREFRONT_URL || "http://localhost:3000"
  const { result: sfResult, error: sfError, latency_ms: sfLatency } = await checkWithTimeout(async () => {
    const r = await fetch(`${storefrontUrl}/api/health`, { signal: AbortSignal.timeout(4000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.text()
  })
  // Fallback: just check homepage responds
  if (sfError) {
    const { error: sfError2, latency_ms: sfLatency2 } = await checkWithTimeout(async () => {
      const r = await fetch(storefrontUrl, { signal: AbortSignal.timeout(4000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.text()
    })
    checks.push({
      name: "storefront",
      label: "Storefront",
      status: sfError2 ? "error" : "ok",
      message: sfError2 ? sfError2 : `HTTP 200 (${storefrontUrl})`,
      latency_ms: sfLatency2,
      url: storefrontUrl,
    })
  } else {
    checks.push({
      name: "storefront",
      label: "Storefront",
      status: "ok",
      message: `HTTP 200 (${storefrontUrl})`,
      latency_ms: sfLatency,
      url: storefrontUrl,
    })
  }

  // ── 7. Sentry ────────────────────────────────────────────────────────────
  const sentryDsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  const sentryOrg = process.env.SENTRY_ORG
  const sentryProject = process.env.SENTRY_PROJECT
  if (!sentryDsn) {
    checks.push({ name: "sentry", label: "Sentry (Error Tracking)", status: "unconfigured", message: "SENTRY_DSN not set", latency_ms: null, url: "https://sentry.io" })
  } else {
    checks.push({
      name: "sentry",
      label: "Sentry (Error Tracking)",
      status: "ok",
      message: `DSN configured — org: ${sentryOrg || "?"}, project: ${sentryProject || "?"}`,
      latency_ms: null,
      url: `https://vod-records.sentry.io/issues/?project=${sentryProject || ""}`,
    })
  }

  // ── 8. ContentSquare (UXA) ───────────────────────────────────────────────
  const csSiteId = process.env.NEXT_PUBLIC_CS_SITE_ID
  if (!csSiteId) {
    checks.push({ name: "contentsquare", label: "ContentSquare (UXA)", status: "unconfigured", message: "NEXT_PUBLIC_CS_SITE_ID not set", latency_ms: null, url: "https://app.contentsquare.com" })
  } else {
    checks.push({
      name: "contentsquare",
      label: "ContentSquare (UXA)",
      status: "ok",
      message: `Site ID: ${csSiteId} (loads on marketing consent)`,
      latency_ms: null,
      url: "https://app.contentsquare.com",
    })
  }

  // ── 9. GA4 Analytics ─────────────────────────────────────────────────────
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
  if (!gaMeasurementId) {
    checks.push({ name: "ga4", label: "Google Analytics 4", status: "unconfigured", message: "NEXT_PUBLIC_GA_MEASUREMENT_ID not set", latency_ms: null, url: "https://analytics.google.com" })
  } else {
    checks.push({
      name: "ga4",
      label: "Google Analytics 4",
      status: "ok",
      message: `Measurement ID: ${gaMeasurementId}`,
      latency_ms: null,
      url: `https://analytics.google.com/analytics/web/#/p${gaMeasurementId.replace("G-", "")}`,
    })
  }

  // ── 10. VPS / API Server ─────────────────────────────────────────────────
  const apiUrl = "https://api.vod-auctions.com"
  const { error: vpsError, latency_ms: vpsLatency } = await checkWithTimeout(async () => {
    const r = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.text()
  })
  // Fallback: check if API responds on any endpoint
  if (vpsError) {
    const { error: vpsError2, latency_ms: vpsLatency2 } = await checkWithTimeout(async () => {
      const r = await fetch(`${apiUrl}/store/auction-blocks?limit=1`, {
        signal: AbortSignal.timeout(5000),
        headers: { "x-publishable-api-key": process.env.MEDUSA_PUBLISHABLE_KEY || "" },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.text()
    })
    checks.push({
      name: "vps",
      label: "VPS / API Server (Hostinger)",
      status: vpsError2 ? "error" : "ok",
      message: vpsError2 ? vpsError2 : `API responding (${apiUrl})`,
      latency_ms: vpsLatency2,
      url: "https://manage.hostinger.com",
    })
  } else {
    checks.push({
      name: "vps",
      label: "VPS / API Server (Hostinger)",
      status: "ok",
      message: `Health OK (${apiUrl})`,
      latency_ms: vpsLatency,
      url: "https://manage.hostinger.com",
    })
  }

  // ── 11. Storefront on Vercel / VPS ───────────────────────────────────────
  const publicStorefrontUrl = "https://vod-auctions.com"
  const { error: sfPubError, latency_ms: sfPubLatency } = await checkWithTimeout(async () => {
    const r = await fetch(publicStorefrontUrl, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.text()
  })
  checks.push({
    name: "storefront_public",
    label: "Storefront (vod-auctions.com)",
    status: sfPubError ? "error" : "ok",
    message: sfPubError ? sfPubError : `HTTP 200 (${publicStorefrontUrl})`,
    latency_ms: sfPubLatency,
    url: publicStorefrontUrl,
  })

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
