import { ServerStack } from "@medusajs/icons"
import { useAdminNav } from "../../components/admin-nav"
import { useEffect, useState, useCallback } from "react"

// ─── Types ───────────────────────────────────────────────────────────────────

type SentryIssue = {
  id: string
  title: string
  level: "fatal" | "error" | "warning" | "info"
  culprit: string
  count: string
  lastSeen: string
  permalink: string
}

type AlertsData = {
  sentry: { issues: SentryIssue[]; error?: string; configured: boolean }
  sync: { last_run: { run_id: string; synced_at: string; total_changes: number } | null; status: "ok" | "warning" | "error"; message: string }
  checked_at: string
}

type ServiceStatus = "ok" | "degraded" | "error" | "unconfigured"

type ServiceCheck = {
  name: string
  label: string
  status: ServiceStatus
  message: string
  latency_ms: number | null
  url?: string
}

type HealthData = {
  summary: { total: number; ok: number; errors: number; unconfigured: number; degraded: number }
  services: ServiceCheck[]
  checked_at: string
}

// ─── Static architecture metadata ────────────────────────────────────────────

const CATEGORIES: Array<{
  id: string
  label: string
  description: string
  services: string[]
}> = [
  {
    id: "infrastructure",
    label: "Infrastructure",
    description: "Database, API server & storefront hosting",
    services: ["postgresql", "vps", "storefront", "storefront_public"],
  },
  {
    id: "payments",
    label: "Payments",
    description: "Checkout & payment processing",
    services: ["stripe", "paypal"],
  },
  {
    id: "communication",
    label: "Communication",
    description: "Transactional email & CRM",
    services: ["resend", "brevo"],
  },
  {
    id: "analytics",
    label: "Analytics & Monitoring",
    description: "Error tracking, UX analytics & user behaviour",
    services: ["sentry", "ga4", "rudderstack", "clarity"],
  },
  {
    id: "cache_ai",
    label: "Cache & AI",
    description: "Performance caching & AI admin assistant",
    services: ["upstash", "anthropic"],
  },
]

type ServiceMeta = {
  role: string
  keyFunctions: string[]
  keyMetrics: string[]
}

const SERVICE_META: Record<string, ServiceMeta> = {
  postgresql: {
    role: "Primary database for all commerce & catalog data",
    keyFunctions: [
      "Stores products, auctions, bids, orders, customers",
      "Legacy tape-mag catalog — 41.5k releases, 12k artists, 3k labels",
      "Medusa ORM tables (snake_case) + legacy Knex tables (camelCase)",
    ],
    keyMetrics: ["Target latency: < 100ms", "Supabase free tier — 500 MB", "Region: eu-central-1 (Frankfurt)"],
  },
  vps: {
    role: "Backend API server & process manager",
    keyFunctions: [
      "Runs Medusa.js backend on port 9000",
      "PM2 manages all Node.js processes (backend + storefront)",
      "nginx reverse proxy — routes api., admin., vod-auctions.com",
    ],
    keyMetrics: ["Hostinger VPS — 72.62.148.205", "Ubuntu 24.04 LTS", "api.vod-auctions.com / admin.vod-auctions.com"],
  },
  storefront: {
    role: "Internal reachability check (backend → storefront)",
    keyFunctions: [
      "Backend checks if Next.js storefront is responsive",
      "First tries /api/health, then homepage HTTP 200",
      "Detects PM2 crashes or out-of-memory restarts",
    ],
    keyMetrics: ["Port 3006 on VPS", "Memory limit: 600 MB (PM2)", "Max restarts before alert: 5"],
  },
  storefront_public: {
    role: "Public availability check (external)",
    keyFunctions: [
      "External HTTP check: VPS → vod-auctions.com",
      "Verifies nginx + SSL + Next.js are all working end-to-end",
      "Accepts 2xx and 3xx (password gate redirect counts as OK)",
    ],
    keyMetrics: ["vod-auctions.com", "SSL: Let's Encrypt (auto-renew)", "Target latency: < 500ms"],
  },
  stripe: {
    role: "Primary payment processor — cards & local methods",
    keyFunctions: [
      "Cards, Klarna, EPS (AT), Bancontact (BE), Link",
      "Webhooks: checkout.session.completed, payment_intent.*",
      "Live mode — EUR account (frank@vod-records.com)",
    ],
    keyMetrics: [
      "Webhook: /webhooks/stripe",
      "Account: acct_1T7WaYEyxqyK4DXF",
      "PaymentElement inline (no redirect for cards)",
    ],
  },
  paypal: {
    role: "Alternative checkout — PayPal wallet & Pay Later",
    keyFunctions: [
      "PayPal wallet, Pay Later, card via PayPal",
      "Client-side JS SDK order creation (sandbox EUR bug workaround)",
      "Webhooks: PAYMENT.CAPTURE.COMPLETED / DENIED / REFUNDED",
    ],
    keyMetrics: ["Live mode — EUR", "Webhook ID: 95847304EJ582074L", "/webhooks/paypal"],
  },
  resend: {
    role: "Transactional email delivery",
    keyFunctions: [
      "6 templates: welcome, bid-won, outbid, payment confirmed, shipped, feedback",
      "Admin copy of all order emails to frank@vod-records.com",
      "From: noreply@vod-auctions.com",
    ],
    keyMetrics: ["Free tier: 3k emails/month", "Domain: vod-auctions.com (verified)", "resend.com/overview"],
  },
  brevo: {
    role: "CRM & newsletter platform",
    keyFunctions: [
      "Newsletter campaigns — 4 templates (IDs 2–5)",
      "3.580 tape-mag contacts imported (List ID 5)",
      "Checkout opt-in syncs new subscribers automatically",
    ],
    keyMetrics: [
      "Free tier: 300 emails/day",
      "From: newsletter@vod-auctions.com",
      "List VOD Auctions: ID 4 | tape-mag: ID 5",
    ],
  },
  sentry: {
    role: "Error tracking & crash reporting",
    keyFunctions: [
      "Captures unhandled JS exceptions (client) + server errors (Node.js)",
      "Session replays on error — text masked, media blocked",
      "Global error boundary via global-error.tsx + instrumentation.ts",
    ],
    keyMetrics: [
      "Org: vod-records | Project: vod-auctions-storefront",
      "Tunnel route: /monitoring (bypasses ad-blockers)",
      "Replay sample rate: 10% sessions, 100% on error",
    ],
  },
  ga4: {
    role: "Web analytics — traffic & conversion",
    keyFunctions: [
      "Page views, sessions, user acquisition",
      "E-commerce events: bids placed, purchases, catalog views",
      "Loads after analytics cookie consent (consent mode v2)",
    ],
    keyMetrics: ["Measurement ID: G-M9BJGC5D69", "Free — unlimited hits", "google.com/analytics"],
  },
  rudderstack: {
    role: "Customer data platform (CDP)",
    keyFunctions: [
      "Identifies users on login & registration (rudderIdentify)",
      "Tracks events: bid placed, item saved/unsaved, purchase",
      "Routes event stream to GA4 and other destinations",
    ],
    keyMetrics: [
      "Data plane: secklerrovofrz.dataplane.rudderstack.com",
      "Free tier — 1k MTUs",
      "app.rudderstack.com",
    ],
  },
  clarity: {
    role: "UX analytics — session recordings & heatmaps",
    keyFunctions: [
      "Session recordings — replay user journeys",
      "Heatmaps, rage clicks & dead click detection",
      "Loads only after marketing cookie consent",
    ],
    keyMetrics: ["Free — no data limits, no sampling", "clarity.microsoft.com", "Replaces ContentSquare (enterprise)"],
  },
  upstash: {
    role: "Serverless Redis cache layer",
    keyFunctions: [
      "REST API — no persistent connection needed (serverless-friendly)",
      "Caches API responses to reduce DB load",
      "Planned: rate limiting, real-time session storage",
    ],
    keyMetrics: ["Free tier: 10k commands/day", "console.upstash.com", "Region: eu-west-1"],
  },
  anthropic: {
    role: "AI assistant powering the Admin AI Chat",
    keyFunctions: [
      "Admin AI Chat with SSE streaming responses",
      "5 read-only tools: catalog, orders, bids, customers, stats",
      "Model: Claude Haiku 4.5 (fast, low-cost for admin use)",
    ],
    keyMetrics: ["Pay-as-you-go — est. < €5/month", "console.anthropic.com", "Endpoint: /admin/ai-chat"],
  },
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ServiceStatus, { color: string; bg: string; dot: string; label: string }> = {
  ok:            { color: "#22c55e", bg: "rgba(34,197,94,0.12)",   dot: "#22c55e", label: "OK"       },
  degraded:      { color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  dot: "#f59e0b", label: "Degraded" },
  error:         { color: "#ef4444", bg: "rgba(239,68,68,0.12)",   dot: "#ef4444", label: "Error"    },
  unconfigured:  { color: "#9ca3af", bg: "rgba(107,114,128,0.12)", dot: "#6b7280", label: "Not set"  },
}

const SERVICE_ICONS: Record<string, string> = {
  postgresql:        "🗄️",
  stripe:            "💳",
  paypal:            "🅿️",
  resend:            "✉️",
  brevo:             "📧",
  storefront:        "🌐",
  sentry:            "🐛",
  clarity:           "🔍",
  ga4:               "📊",
  rudderstack:       "📡",
  upstash:           "⚡",
  anthropic:         "🤖",
  vps:               "🖥️",
  storefront_public: "🌍",
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ServiceStatus }) {
  const cfg = STATUS_CONFIG[status]
  const isActive = status === "ok"
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {isActive && (
        <span style={{
          position: "absolute", width: 20, height: 20, borderRadius: "50%",
          background: cfg.dot, opacity: 0.25,
          animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
        }} />
      )}
      <span style={{ width: 12, height: 12, borderRadius: "50%", background: cfg.dot, display: "inline-block", position: "relative" }} />
    </span>
  )
}

function LatencyBadge({ ms }: { ms: number | null }) {
  if (ms === null) return null
  const color = ms < 300 ? "#22c55e" : ms < 1000 ? "#f59e0b" : "#ef4444"
  return (
    <span style={{ fontSize: 11, color, fontFamily: "monospace", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4 }}>
      {ms}ms
    </span>
  )
}

function ServiceCard({ service }: { service: ServiceCheck }) {
  const cfg = STATUS_CONFIG[service.status]
  const icon = SERVICE_ICONS[service.name] ?? "⚙️"
  const meta = SERVICE_META[service.name]

  return (
    <div style={{
      background: "#1c1915",
      border: `1px solid ${cfg.color}44`,
      borderRadius: 10,
      display: "flex",
      flexDirection: "column",
      gap: 0,
      overflow: "hidden",
      transition: "border-color 0.2s",
    }}>
      {/* Main info section */}
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>{icon}</span>
            <span style={{ fontWeight: 600, color: "#f5f0e8", fontSize: 13 }}>{service.label}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LatencyBadge ms={service.latency_ms} />
            <StatusDot status={service.status} />
          </div>
        </div>

        {/* Status badge + message */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: cfg.color, background: cfg.bg,
            padding: "2px 7px", borderRadius: 4, letterSpacing: "0.06em",
            textTransform: "uppercase", flexShrink: 0, marginTop: 1,
          }}>
            {cfg.label}
          </span>
          <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>
            {service.message}
          </p>
        </div>

        {service.url && (
          <a href={service.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: "#d4a54a", textDecoration: "none" }}>
            Open Dashboard →
          </a>
        )}
      </div>

      {/* Key Info section */}
      {meta && (
        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(0,0,0,0.2)",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}>
          {/* Role */}
          <p style={{ margin: 0, fontSize: 11, color: "#d4a54a", fontStyle: "italic", lineHeight: 1.4 }}>
            {meta.role}
          </p>

          {/* Key Functions */}
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Key Functions
            </p>
            <ul style={{ margin: 0, paddingLeft: 14, display: "flex", flexDirection: "column", gap: 2 }}>
              {meta.keyFunctions.map((fn) => (
                <li key={fn} style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.4 }}>{fn}</li>
              ))}
            </ul>
          </div>

          {/* Key Metrics */}
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Key Metrics
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px" }}>
              {meta.keyMetrics.map((m) => (
                <span key={m} style={{
                  fontSize: 10, color: "#9ca3af", background: "rgba(255,255,255,0.04)",
                  padding: "2px 7px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)",
                }}>
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Architecture flow diagram ────────────────────────────────────────────────

function ArchitectureFlow() {
  const boxStyle = (accent?: string): React.CSSProperties => ({
    border: `1px solid ${accent ? accent + "44" : "rgba(255,255,255,0.1)"}`,
    borderRadius: 8,
    padding: "8px 14px",
    textAlign: "center" as const,
    background: accent ? `${accent}0d` : "rgba(255,255,255,0.02)",
  })
  const labelStyle: React.CSSProperties = { fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }
  const nameStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#f5f0e8" }
  const subStyle: React.CSSProperties = { fontSize: 10, color: "#9ca3af", marginTop: 2 }
  const arrowStyle: React.CSSProperties = { color: "#9ca3af", fontSize: 16, textAlign: "center" }

  return (
    <div style={{
      marginBottom: 28,
      padding: "18px 20px",
      background: "#1c1915",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
    }}>
      <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        System Architecture
      </p>

      {/* Layer 1: Customer */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
        <div style={{ ...boxStyle("#d4a54a"), padding: "7px 28px" }}>
          <p style={{ ...nameStyle, color: "#d4a54a" }}>👤 Customer Browser</p>
        </div>
      </div>

      <p style={{ ...arrowStyle, marginBottom: 6 }}>↓</p>

      {/* Layer 2: Storefront + Analytics */}
      <div style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "stretch" }}>
        <div style={{ ...boxStyle(), flex: "0 0 auto", minWidth: 150 }}>
          <p style={labelStyle}>Frontend</p>
          <p style={nameStyle}>🌐 Storefront</p>
          <p style={subStyle}>vod-auctions.com</p>
          <p style={{ ...subStyle, color: "#9ca3af", marginTop: 4, fontSize: 10 }}>Next.js 16 · React 19</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 14, paddingTop: 4 }}>
          →
        </div>
        <div style={{ ...boxStyle(), flex: 1 }}>
          <p style={labelStyle}>Analytics Layer (client-side, consent-gated)</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", justifyContent: "center", marginTop: 4 }}>
            {[["📊", "GA4", "Traffic"], ["📡", "RudderStack", "CDP"], ["🔍", "Clarity", "UX"], ["🐛", "Sentry", "Errors"]].map(([icon, name, role]) => (
              <div key={name} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16 }}>{icon}</div>
                <div style={{ fontSize: 11, color: "#f5f0e8", fontWeight: 600 }}>{name}</div>
                <div style={{ fontSize: 10, color: "#9ca3af" }}>{role}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p style={{ ...arrowStyle, textAlign: "left", paddingLeft: 90, marginBottom: 6 }}>↓</p>

      {/* Layer 3: API Backend */}
      <div style={{ ...boxStyle(), marginBottom: 6, padding: "10px 16px" }}>
        <p style={labelStyle}>Backend / API</p>
        <p style={nameStyle}>🖥️ Medusa.js 2.x on VPS (Hostinger)</p>
        <p style={subStyle}>api.vod-auctions.com · Node.js · PM2 · nginx</p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 6 }}>
        <p style={{ ...arrowStyle, margin: 0 }}>↙</p>
        <p style={{ ...arrowStyle, margin: 0 }}>↓</p>
        <p style={{ ...arrowStyle, margin: 0 }}>↓</p>
        <p style={{ ...arrowStyle, margin: 0 }}>↘</p>
      </div>

      {/* Layer 4: Data / Payments / Communication / Cache+AI */}
      <div style={{ display: "flex", gap: 8 }}>
        {[
          {
            label: "Data Layer",
            items: [["🗄️", "PostgreSQL", "Primary DB"], ["⚡", "Upstash Redis", "Cache"]],
          },
          {
            label: "Payments",
            items: [["💳", "Stripe", "Cards + BNPL"], ["🅿️", "PayPal", "Wallet"]],
          },
          {
            label: "Communication",
            items: [["✉️", "Resend", "Transactional"], ["📧", "Brevo", "CRM + Newsletter"]],
          },
          {
            label: "AI",
            items: [["🤖", "Anthropic", "Admin Chat"]],
          },
        ].map((col) => (
          <div key={col.label} style={{ ...boxStyle(), flex: 1 }}>
            <p style={labelStyle}>{col.label}</p>
            {col.items.map(([icon, name, role]) => (
              <div key={name} style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 11, color: "#f5f0e8", fontWeight: 600 }}>{icon} {name}</div>
                <div style={{ fontSize: 10, color: "#9ca3af" }}>{role}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SystemHealthPage() {
  useAdminNav()
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [alerts, setAlerts] = useState<AlertsData | null>(null)

  const fetchAlerts = useCallback(async () => {
    try {
      const r = await fetch("/admin/system-health/alerts", { credentials: "include" })
      if (r.ok) setAlerts(await r.json())
    } catch { /* silent */ }
  }, [])

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch("/admin/system-health", {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = await r.json()
      setData(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchHealth(); fetchAlerts() }, [fetchHealth, fetchAlerts])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchHealth, 30_000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchHealth])

  const checkedAt = data?.checked_at
    ? new Date(data.checked_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null

  // Build service lookup map
  const serviceMap = new Map<string, ServiceCheck>()
  data?.services.forEach((s) => serviceMap.set(s.name, s))

  // Find services not matched by any category (safety net)
  const categorisedNames = new Set(CATEGORIES.flatMap((c) => c.services))
  const orphanServices = data?.services.filter((s) => !categorisedNames.has(s.name)) ?? []

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto", minWidth: 0, width: "100%", overflowX: "hidden", boxSizing: "border-box" }}>
      <style>{`
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "inherit" }}>System Health</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9ca3af" }}>
            {checkedAt ? `Last checked: ${checkedAt}` : "Checking all services…"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9ca3af", cursor: "pointer" }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} style={{ accentColor: "#d4a54a" }} />
            Auto-refresh (30s)
          </label>
          <button
            onClick={fetchHealth}
            disabled={loading}
            style={{
              background: "#d4a54a", color: "#1c1915", border: "none", borderRadius: 6,
              padding: "8px 16px", fontWeight: 600, fontSize: 13,
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
              transition: "opacity 0.2s",
            }}
          >
            {loading ? "Checking…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "12px 16px", color: "#ef4444", marginBottom: 20, fontSize: 13 }}>
          Failed to load health data: {error}
        </div>
      )}

      {/* Summary bar */}
      {data && (
        <div style={{
          display: "flex", gap: 12, marginBottom: 24, background: "#1c1915",
          border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
          padding: "14px 20px", flexWrap: "wrap",
        }}>
          {[
            { label: "All Systems", value: data.summary.total, color: "#f5f0e8" },
            { label: "✓ Operational", value: data.summary.ok, color: "#22c55e" },
            { label: "✗ Errors", value: data.summary.errors, color: "#ef4444" },
            { label: "— Not Configured", value: data.summary.unconfigured, color: "#9ca3af" },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 20, borderRight: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</span>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>{s.label}</span>
            </div>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
            {data.summary.errors > 0 ? (
              <span style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                ⚠ {data.summary.errors} service{data.summary.errors > 1 ? "s" : ""} down
              </span>
            ) : (
              <span style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                ✓ All systems operational
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Alerts Panel ─────────────────────────────────────────────────── */}
      {alerts && (
        <div style={{ marginBottom: 28 }}>
          {/* Sync Status */}
          <div style={{
            marginBottom: 12,
            padding: "14px 18px",
            background: "#1c1915",
            border: `1px solid ${
              alerts.sync.status === "error" ? "rgba(239,68,68,0.35)" :
              alerts.sync.status === "warning" ? "rgba(245,158,11,0.35)" :
              "rgba(34,197,94,0.25)"
            }`,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap" as const,
          }}>
            <span style={{ fontSize: 16 }}>🔄</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#f5f0e8" }}>Daily Sync</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9ca3af" }}>{alerts.sync.message || "No sync data"}</p>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const,
              padding: "3px 9px", borderRadius: 4,
              color: alerts.sync.status === "error" ? "#ef4444" : alerts.sync.status === "warning" ? "#f59e0b" : "#22c55e",
              background: alerts.sync.status === "error" ? "rgba(239,68,68,0.12)" : alerts.sync.status === "warning" ? "rgba(245,158,11,0.12)" : "rgba(34,197,94,0.12)",
            }}>
              {alerts.sync.status === "error" ? "ERROR" : alerts.sync.status === "warning" ? "WARNING" : "OK"}
            </span>
            {alerts.sync.last_run && (
              <a href="/app/sync" style={{ fontSize: 12, color: "#d4a54a", textDecoration: "none" }}>
                View change log →
              </a>
            )}
          </div>

          {/* Sentry Issues */}
          <div style={{
            padding: "14px 18px",
            background: "#1c1915",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 16 }}>🐛</span>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#f5f0e8" }}>Sentry — Recent Issues (7 days)</p>
              {alerts.sentry.issues.length > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#ef4444", background: "rgba(239,68,68,0.1)", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                  {alerts.sentry.issues.length} issue{alerts.sentry.issues.length > 1 ? "s" : ""}
                </span>
              )}
              {alerts.sentry.issues.length === 0 && !alerts.sentry.error && (
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#22c55e", background: "rgba(34,197,94,0.1)", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                  ✓ No issues
                </span>
              )}
              <a href="https://vod-records.sentry.io/issues/" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: "#d4a54a", textDecoration: "none", marginLeft: alerts.sentry.issues.length === 0 && !alerts.sentry.error ? 8 : 0 }}>
                Open Sentry ↗
              </a>
            </div>

            {!alerts.sentry.configured && (
              <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>SENTRY_API_TOKEN not configured</p>
            )}

            {alerts.sentry.error && (
              <p style={{ margin: 0, fontSize: 12, color: "#ef4444" }}>API error: {alerts.sentry.error}</p>
            )}

            {alerts.sentry.issues.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {alerts.sentry.issues.map((issue) => {
                  const levelColor = issue.level === "fatal" ? "#ef4444" : issue.level === "error" ? "#f87171" : issue.level === "warning" ? "#f59e0b" : "#9ca3af"
                  const levelBg = issue.level === "fatal" ? "rgba(239,68,68,0.15)" : issue.level === "error" ? "rgba(248,113,113,0.12)" : issue.level === "warning" ? "rgba(245,158,11,0.12)" : "rgba(107,114,128,0.1)"
                  const lastSeen = new Date(issue.lastSeen).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                  return (
                    <div key={issue.id} style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "10px 12px",
                      background: "rgba(0,0,0,0.2)",
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.05)",
                    }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" as const,
                        color: levelColor, background: levelBg,
                        padding: "2px 6px", borderRadius: 3, flexShrink: 0, marginTop: 1,
                      }}>
                        {issue.level}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a href={issue.permalink} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: "#f5f0e8", textDecoration: "none", display: "block",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {issue.title}
                        </a>
                        <p style={{ margin: "3px 0 0", fontSize: 11, color: "#6b7280" }}>
                          {issue.culprit}
                        </p>
                      </div>
                      <div style={{ textAlign: "right" as const, flexShrink: 0, fontSize: 11, color: "#9ca3af" }}>
                        <div>{Number(issue.count).toLocaleString()}×</div>
                        <div style={{ marginTop: 2, color: "#6b7280" }}>{lastSeen}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Architecture flow */}
      <ArchitectureFlow />

      {/* Loading skeleton */}
      {loading && !data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
          {[...Array(14)].map((_, i) => (
            <div key={i} style={{ background: "#1c1915", borderRadius: 10, height: 200, animation: "pulse 1.5s ease-in-out infinite", opacity: 0.5 }} />
          ))}
        </div>
      )}

      {/* Grouped service sections */}
      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {CATEGORIES.map((cat) => {
            const services = cat.services.map((name) => serviceMap.get(name)).filter(Boolean) as ServiceCheck[]
            if (services.length === 0) return null
            const catErrors = services.filter((s) => s.status === "error").length
            const catUnconfigured = services.filter((s) => s.status === "unconfigured").length

            return (
              <div key={cat.id}>
                {/* Section header */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "inherit" }}>{cat.label}</h2>
                  <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>{cat.description}</p>
                  {catErrors > 0 && (
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#ef4444", background: "rgba(239,68,68,0.1)", padding: "2px 8px", borderRadius: 4 }}>
                      {catErrors} error{catErrors > 1 ? "s" : ""}
                    </span>
                  )}
                  {catErrors === 0 && catUnconfigured > 0 && (
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#9ca3af", background: "rgba(107,114,128,0.1)", padding: "2px 8px", borderRadius: 4 }}>
                      {catUnconfigured} not configured
                    </span>
                  )}
                  {catErrors === 0 && catUnconfigured === 0 && (
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#22c55e", background: "rgba(34,197,94,0.1)", padding: "2px 8px", borderRadius: 4 }}>
                      ✓ All OK
                    </span>
                  )}
                </div>

                {/* Service grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
                  {services.map((service) => (
                    <ServiceCard key={service.name} service={service} />
                  ))}
                </div>
              </div>
            )
          })}

          {/* Orphan services (safety net) */}
          {orphanServices.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 10 }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "inherit" }}>Other</h2>
                <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>Uncategorised services</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
                {orphanServices.map((service) => (
                  <ServiceCard key={service.name} service={service} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick links */}
      <div style={{ marginTop: 36, padding: "16px 20px", background: "#1c1915", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}>
        <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "#f5f0e8" }}>Quick Links</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[
            { label: "Supabase Dashboard", url: "https://supabase.com/dashboard/project/bofblwqieuvmqybzxapx" },
            { label: "Stripe Dashboard", url: "https://dashboard.stripe.com" },
            { label: "PayPal Dashboard", url: "https://www.paypal.com/business" },
            { label: "Resend", url: "https://resend.com/overview" },
            { label: "Brevo", url: "https://app.brevo.com" },
            { label: "Sentry Issues", url: "https://vod-records.sentry.io/issues/" },
            { label: "Microsoft Clarity", url: "https://clarity.microsoft.com" },
            { label: "GA4 Analytics", url: "https://analytics.google.com" },
            { label: "RudderStack", url: "https://app.rudderstack.com" },
            { label: "Upstash Redis", url: "https://console.upstash.com" },
            { label: "Anthropic Console", url: "https://console.anthropic.com" },
            { label: "Hostinger VPS", url: "https://hpanel.hostinger.com" },
          ].map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12, color: "#d4a54a", textDecoration: "none",
                background: "rgba(212,165,74,0.08)", padding: "4px 10px",
                borderRadius: 5, border: "1px solid rgba(212,165,74,0.2)",
              }}
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
