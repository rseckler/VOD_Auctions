import { ServerStack } from "@medusajs/icons"
import { useAdminNav } from "../../components/admin-nav"
import { C } from "../../components/admin-tokens"
import { PageHeader, PageShell } from "../../components/admin-layout"
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

// P4-A: Alert-Dispatch-History
type AlertDispatchEntry = {
  id: number
  dispatched_at: string
  service_name: string
  severity: "warning" | "error" | "critical"
  message: string | null
  metadata: Record<string, unknown> | null
  channels_attempted: Record<string, { ok: boolean; error?: string }> | null
  status: "fired" | "acknowledged" | "auto_resolved" | "resolved" | "suppressed_by_silence"
  acknowledged_at: string | null
  acknowledged_by: string | null
  acknowledge_reason: string | null
  resolved_at: string | null
}

type AlertHistoryData = {
  window_days: number
  total_in_window: number
  counts: Record<string, number>
  rows: AlertDispatchEntry[]
}

// P4-B: Sentry-Issues-Embed
type SentryIssueEntry = {
  id: string
  short_id: string
  title: string
  culprit: string | null
  level: "fatal" | "error" | "warning" | "info" | "debug"
  status: string
  count: string | number
  user_count: number
  first_seen: string
  last_seen: string
  permalink: string
}

type SentryIssuesResponse = {
  configured: boolean
  org: string
  project: string
  issues: SentryIssueEntry[]
  message?: string
  error?: string
}

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
  category?: string
  check_class?: CheckClass
  runbook?: string
  metadata?: Record<string, unknown>
}

type HealthData = {
  summary: {
    total: number
    ok: number
    degraded: number
    warning: number
    error: number
    critical: number
    insufficient_signal: number
    unconfigured: number
    // legacy alias (kept for back-compat with cached clients)
    errors?: number
  }
  services: ServiceCheck[]
  checked_at: string
  registered_checks?: number
  deploy_info?: {
    sha: string
    sha_short: string
    node_version: string
    process_uptime_sec: number
    started_at: string
    platform: string
  }
  feature_flags?: Array<{
    key: string
    enabled: boolean
    description: string
    category: string
  }>
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
    description: "Database, API server, storefront hosting, VPS ops",
    services: ["postgresql", "vps", "storefront", "storefront_public", "disk_space", "ssl_expiry", "pm2_status"],
  },
  {
    id: "sync_pipelines",
    label: "Sync Pipelines",
    description: "Legacy sync, Meili drift & reindex backlog",
    services: ["sync_log_freshness", "meili_drift", "meili_backlog"],
  },
  {
    id: "business_flows",
    label: "Business Flows",
    description: "Orders, active auctions, payment webhooks (synthetic checks, 15min interval)",
    services: ["last_order", "active_auctions", "stripe_webhook_freshness"],
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
    id: "data_plane",
    label: "Data Plane",
    description: "Caching, search, media storage & external data sources",
    services: ["upstash", "meilisearch", "r2-images", "discogs_api", "supabase_realtime"],
  },
  {
    id: "ai",
    label: "AI",
    description: "Admin assistant & content tools",
    services: ["anthropic"],
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

// ─── Design Palette ──────────────────────────────────────────────────────────

// ─── Status helpers ───────────────────────────────────────────────────────────

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const STATUS_CONFIG: Record<ServiceStatus, { color: string; bg: string; dot: string; label: string; pulse?: boolean }> = {
  ok:                  { color: C.success,  bg: C.success + "1e", dot: C.success, label: "OK"          },
  degraded:            { color: C.gold,     bg: C.gold + "1e",    dot: C.gold,    label: "Degraded"    },
  warning:             { color: C.warning,  bg: C.warning + "1e", dot: C.warning, label: "Warning"     },
  error:               { color: C.error,    bg: C.error + "1e",   dot: C.error,   label: "Error"       },
  critical:            { color: C.error,    bg: C.error + "2a",   dot: C.error,   label: "Critical", pulse: true },
  insufficient_signal: { color: C.muted,    bg: C.muted + "1e",   dot: C.muted,   label: "No signal"   },
  unconfigured:        { color: C.muted,    bg: C.muted + "1e",   dot: C.muted,   label: "Not set"     },
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
  "r2-images":       "🖼️",
  meilisearch:       "🔎",
  disk_space:        "💾",
  ssl_expiry:        "🔐",
  pm2_status:        "📦",
  discogs_api:       "🎛️",
  supabase_realtime: "📡",
  sync_log_freshness: "🔄",
  meili_drift:       "📐",
  meili_backlog:     "📥",
  last_order:        "🛒",
  active_auctions:   "🔨",
  stripe_webhook_freshness: "💳",
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
  const color = ms < 300 ? C.success : ms < 1000 ? C.warning : C.error
  return (
    <span style={{ fontSize: 11, color, fontFamily: "monospace", background: "rgba(0,0,0,0.04)", padding: "2px 6px", borderRadius: 4 }}>
      {ms}ms
    </span>
  )
}

// P4-B — Sentry-Issues Tab (renders inside ServiceDrawer)
function SentryIssuesTab({ service }: { service: string }) {
  const [data, setData] = useState<SentryIssuesResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/admin/system-health/sentry/issues?service=${encodeURIComponent(service)}&limit=10`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) { setData(j); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [service])

  if (loading) return <div style={{ padding: 20, color: C.muted, fontSize: 12 }}>Loading Sentry issues…</div>
  if (!data) return <div style={{ padding: 20, color: C.error, fontSize: 12 }}>Failed to load.</div>
  if (!data.configured) {
    return (
      <div style={{ padding: 20, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
        <p style={{ margin: "0 0 8px", fontWeight: 600, color: C.warning }}>Sentry not configured</p>
        <p style={{ margin: 0 }}>{data.message}</p>
      </div>
    )
  }
  if (data.error) {
    return (
      <div style={{ padding: 20, fontSize: 12, color: C.error }}>
        Sentry API error: {data.error}
      </div>
    )
  }
  if (data.issues.length === 0) {
    return (
      <div style={{ padding: 20, fontSize: 12, color: C.success }}>
        ✓ No unresolved issues in last 14d for <code style={{ color: C.text }}>{service}</code>
      </div>
    )
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12 }}>
      {data.issues.map((issue) => {
        const levelColor =
          issue.level === "fatal" || issue.level === "error" ? C.error :
          issue.level === "warning" ? C.warning :
          C.muted
        const lastSeenAgo = (() => {
          const ms = Date.now() - new Date(issue.last_seen).getTime()
          const min = Math.round(ms / 60_000)
          if (min < 60) return `${min}min`
          const h = Math.round(min / 60)
          if (h < 24) return `${h}h`
          return `${Math.round(h / 24)}d`
        })()
        return (
          <a
            key={issue.id}
            href={issue.permalink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", flexDirection: "column", gap: 4,
              padding: "10px 12px",
              background: levelColor + "0d",
              border: `1px solid ${levelColor}33`,
              borderRadius: 6,
              textDecoration: "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 9, fontWeight: 700, color: levelColor,
                background: levelColor + "1e", padding: "2px 6px", borderRadius: 3,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                {issue.level}
              </span>
              <span style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>{issue.short_id}</span>
              <span style={{ fontSize: 10, color: C.muted }}>· {issue.count} events · {issue.user_count} users · {lastSeenAgo} ago</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: C.text, fontWeight: 600 }}>{issue.title}</p>
            {issue.culprit && (
              <p style={{ margin: 0, fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{issue.culprit}</p>
            )}
          </a>
        )
      })}
    </div>
  )
}

// P4-C — LogViewerTab (SSE via EventSource, client-side search/filter)
const LOG_SOURCES: Array<{ type: "pm2" | "file"; key: string; label: string }> = [
  { type: "pm2", key: "vodauction-backend", label: "Medusa Backend (PM2)" },
  { type: "pm2", key: "vodauction-storefront", label: "Next.js Storefront (PM2)" },
  { type: "file", key: "health_sampler", label: "Health Sampler Cron" },
  { type: "file", key: "legacy_sync", label: "Legacy Sync" },
  { type: "file", key: "discogs_daily", label: "Discogs Daily Sync" },
  { type: "file", key: "meilisearch_sync", label: "Meilisearch Delta Sync" },
]

function suggestLogSource(serviceName: string): string {
  const n = serviceName.toLowerCase()
  if (n.includes("storefront")) return "pm2:vodauction-storefront"
  if (n.includes("sync_log") || n.includes("legacy")) return "file:legacy_sync"
  if (n.includes("meili_drift") || n.includes("meili_backlog") || n.includes("meilisearch")) return "file:meilisearch_sync"
  if (n.includes("discogs")) return "file:discogs_daily"
  if (n.includes("sampler")) return "file:health_sampler"
  return "pm2:vodauction-backend"  // default for postgres/stripe/upstash/vps/etc
}

type LogLine = { text: string; ts: string; source?: "out" | "error" }

function LogViewerTab({ service }: { service: string }) {
  const initialSource = suggestLogSource(service)
  const [source, setSource] = useState<string>(initialSource)
  const [follow, setFollow] = useState(true)
  const [lines, setLines] = useState<LogLine[]>([])
  const [status, setStatus] = useState<"connecting" | "live" | "closed" | "error" | "rate_limited">("connecting")
  const [search, setSearch] = useState("")

  // Re-suggest if service changes
  useEffect(() => { setSource(suggestLogSource(service)); setLines([]) }, [service])

  useEffect(() => {
    setStatus("connecting")
    setLines([])
    const [type, key] = source.split(":")
    const base = type === "pm2"
      ? `/admin/system-health/logs/pm2/${encodeURIComponent(key)}`
      : `/admin/system-health/logs/file/${encodeURIComponent(key)}`
    const url = `${base}?tail=100&follow=${follow}`
    const es = new EventSource(url, { withCredentials: true })

    es.addEventListener("ready", () => setStatus("live"))
    es.addEventListener("line", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as LogLine
        setLines((prev) => {
          const next = [...prev, data]
          return next.length > 1000 ? next.slice(-1000) : next
        })
      } catch { /* ignore malformed */ }
    })
    es.addEventListener("timeout", () => setStatus("closed"))
    es.addEventListener("exit", () => setStatus("closed"))
    es.addEventListener("error", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data)
        if (data?.error?.includes("concurrent")) setStatus("rate_limited")
      } catch { /* ignore */ }
    })
    es.onerror = () => { if (status === "connecting") setStatus("error"); es.close() }

    return () => { es.close() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, follow])

  const filtered = search.trim()
    ? lines.filter((l) => l.text.toLowerCase().includes(search.toLowerCase()))
    : lines

  const statusColor =
    status === "live" ? C.success :
    status === "closed" ? C.muted :
    status === "rate_limited" ? C.warning :
    status === "error" ? C.error :
    C.blue

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, padding: 10, borderBottom: `1px solid ${C.border}`, background: "rgba(0,0,0,0.02)", flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          style={{ fontSize: 11, padding: "4px 6px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text }}
        >
          {LOG_SOURCES.map((s) => (
            <option key={`${s.type}:${s.key}`} value={`${s.type}:${s.key}`}>{s.label}</option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.muted, cursor: "pointer" }}>
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          Follow
        </label>
        <input
          type="text"
          placeholder="Filter…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ fontSize: 11, padding: "4px 8px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, flex: 1, minWidth: 120 }}
        />
        <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, background: statusColor + "1e", padding: "2px 6px", borderRadius: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {status}
        </span>
      </div>

      {/* Line list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0", background: "#0f0f0f", color: "#d4d4d4", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, lineHeight: 1.4 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 16, color: "#888" }}>
            {status === "connecting" ? "Connecting…" :
             status === "rate_limited" ? "Rate-Limit: Max 3 concurrent streams per user. Close another drawer tab to open this one." :
             status === "error" ? "Error opening stream. Check backend-logs." :
             search ? `No lines matching "${search}"` :
             "No log lines yet."}
          </div>
        ) : filtered.map((line, i) => {
          const isErr = line.source === "error" || /error|exception|traceback|fatal|failed/i.test(line.text)
          const isWarn = /warn|warning|deprecat/i.test(line.text)
          const color = isErr ? "#ef4444" : isWarn ? "#f59e0b" : "#d4d4d4"
          return (
            <div key={i} style={{ padding: "1px 12px", color, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {line.text}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// P4-B — ServiceDrawer (right-side slide-in, reusable for P4-C Logs too)
function ServiceDrawer({
  service,
  sentryEmbedOn,
  logViewerOn,
  onClose,
}: {
  service: ServiceCheck
  sentryEmbedOn: boolean
  logViewerOn: boolean
  onClose: () => void
}) {
  const availableTabs: string[] = []
  if (logViewerOn) availableTabs.push("logs")
  if (sentryEmbedOn) availableTabs.push("sentry")
  const [activeTab, setActiveTab] = useState<string>(availableTabs[0] || "overview")

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  const cfg = STATUS_CONFIG[service.status]

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          zIndex: 9998, cursor: "pointer",
        }}
      />
      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(600px, 100vw)",
        background: C.card, border: `1px solid ${C.border}`, borderLeft: `2px solid ${cfg.color}`,
        zIndex: 9999, display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 20px rgba(0,0,0,0.15)",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>{SERVICE_ICONS[service.name] ?? "⚙️"}</span>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text }}>{service.label}</p>
              <p style={{ margin: 0, fontSize: 10, color: C.muted, fontFamily: "monospace" }}>{service.name}</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color: cfg.color, background: cfg.bg,
              padding: "3px 9px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              {cfg.label}
            </span>
            <button onClick={onClose} style={{
              background: "transparent", border: "none", color: C.muted, fontSize: 20,
              cursor: "pointer", padding: "0 6px", lineHeight: 1,
            }}>×</button>
          </div>
        </div>

        {/* Tab bar */}
        {availableTabs.length > 1 && (
          <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: "rgba(0,0,0,0.02)" }}>
            {availableTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: "transparent", border: "none", padding: "10px 16px",
                  fontSize: 12, fontWeight: 600, color: activeTab === tab ? C.gold : C.muted,
                  borderBottom: activeTab === tab ? `2px solid ${C.gold}` : "2px solid transparent",
                  cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em",
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {availableTabs.length === 0 && (
            <div style={{ padding: 20, fontSize: 12, color: C.muted }}>
              No integrations enabled. Enable <code>SYSTEM_HEALTH_SENTRY_EMBED</code> or <code>SYSTEM_HEALTH_LOG_VIEWER</code> in <a href="/app/config" style={{ color: C.gold }}>Platform Config</a>.
            </div>
          )}
          {activeTab === "sentry" && <SentryIssuesTab service={service.name} />}
          {activeTab === "logs" && <LogViewerTab service={service.name} />}
        </div>

        {/* Footer with runbook link */}
        {service.runbook && (
          <div style={{ padding: "10px 18px", borderTop: `1px solid ${C.border}`, background: "rgba(0,0,0,0.02)" }}>
            <a href={service.runbook} target="_blank" rel="noopener noreferrer"
               style={{ fontSize: 12, color: C.gold, textDecoration: "none", fontWeight: 600 }}>
              📖 Open Runbook for {service.name} ↗
            </a>
          </div>
        )}
      </div>
    </>
  )
}

// P2.2/P2.3 — 24h uptime sparkline for one service
type HistoryBucket = { start: string; severity: ServiceStatus; sample_count: number; avg_latency_ms: number | null }
type HistoryResponse = { service: string; window: string; bucket_minutes: number; bucket_count: number; uptime_pct: number | null; buckets: HistoryBucket[] }

function UptimeSparkline({ service }: { service: string }) {
  const [hist, setHist] = useState<HistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/admin/system-health/history?service=${encodeURIComponent(service)}&window=24h`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) { setHist(j); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [service])

  if (loading) return <div style={{ height: 12, background: "rgba(0,0,0,0.04)", borderRadius: 2 }} />
  if (!hist || hist.bucket_count === 0) {
    return <div style={{ fontSize: 10, color: C.muted, fontStyle: "italic" }}>no history yet</div>
  }

  // Full 288 buckets for 24h (5min each) — fill gaps with "unknown"
  const TOTAL = 288
  const BUCKET_SEC = 5 * 60
  const now = Date.now()
  const cells: Array<{ severity: ServiceStatus | "unknown"; ts: number }> = []
  for (let i = TOTAL - 1; i >= 0; i--) {
    const ts = now - (i * BUCKET_SEC * 1000)
    const matching = hist.buckets.find((b) => {
      const bStart = new Date(b.start).getTime()
      return Math.abs(bStart - ts) < (BUCKET_SEC * 1000) / 2
    })
    cells.push(matching ? { severity: matching.severity, ts } : { severity: "unknown", ts })
  }

  const cellColor = (s: ServiceStatus | "unknown"): string => {
    if (s === "unknown") return "rgba(0,0,0,0.06)"
    return STATUS_CONFIG[s as ServiceStatus]?.dot || C.muted
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: C.muted }}>
        <span>24h</span>
        {hist.uptime_pct !== null && (
          <span style={{ fontWeight: 600, color: hist.uptime_pct >= 99 ? C.success : hist.uptime_pct >= 95 ? C.warning : C.error }}>
            {hist.uptime_pct.toFixed(1)}% uptime
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 1, height: 12, alignItems: "stretch" }}>
        {cells.map((c, i) => (
          <div
            key={i}
            title={`${new Date(c.ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} — ${c.severity}`}
            style={{
              flex: 1,
              background: cellColor(c.severity),
              minWidth: 1,
              borderRadius: 0,
            }}
          />
        ))}
      </div>
    </div>
  )
}

function ServiceCard({ service, onOpenDrawer }: { service: ServiceCheck; onOpenDrawer?: (service: ServiceCheck) => void }) {
  const cfg = STATUS_CONFIG[service.status]
  const icon = SERVICE_ICONS[service.name] ?? "⚙️"
  const meta = SERVICE_META[service.name]

  return (
    <div style={{
      background: C.card,
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
            <span style={{ fontWeight: 600, color: C.text, fontSize: 13 }}>{service.label}</span>
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
          <p style={{ margin: 0, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
            {service.message}
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {service.url && (
            <a href={service.url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: C.gold, textDecoration: "none" }}>
              Open Dashboard →
            </a>
          )}
          {service.runbook && (
            <a href={service.runbook} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: C.muted, textDecoration: "none", fontWeight: 500 }}
              title="Runbook: symptoms, diagnose, fixes">
              📖 Runbook ↗
            </a>
          )}
          {onOpenDrawer && (
            <button
              onClick={() => onOpenDrawer(service)}
              style={{
                fontSize: 11, color: C.blue, background: "transparent", border: `1px solid ${C.blue}33`,
                padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontWeight: 600,
                marginLeft: "auto",
              }}
              title="Open details drawer (Sentry + Logs)"
            >
              Details →
            </button>
          )}
        </div>
      </div>

      {/* Key Info section */}
      {meta && (
        <div style={{
          borderTop: "1px solid rgba(0,0,0,0.04)",
          background: "rgba(0,0,0,0.2)",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}>
          {/* Role */}
          <p style={{ margin: 0, fontSize: 11, color: C.gold, fontStyle: "italic", lineHeight: 1.4 }}>
            {meta.role}
          </p>

          {/* Key Functions */}
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Key Functions
            </p>
            <ul style={{ margin: 0, paddingLeft: 14, display: "flex", flexDirection: "column", gap: 2 }}>
              {meta.keyFunctions.map((fn) => (
                <li key={fn} style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{fn}</li>
              ))}
            </ul>
          </div>

          {/* Key Metrics */}
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Key Metrics
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px" }}>
              {meta.keyMetrics.map((m) => (
                <span key={m} style={{
                  fontSize: 10, color: C.muted, background: "rgba(0,0,0,0.03)",
                  padding: "2px 7px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.04)",
                }}>
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* P2.2 — 24h uptime sparkline */}
      <div style={{ padding: "8px 16px 12px", borderTop: "1px solid rgba(0,0,0,0.04)" }}>
        <UptimeSparkline service={service.name} />
      </div>
    </div>
  )
}

// ─── Architecture flow diagram ────────────────────────────────────────────────

function ArchitectureFlow() {
  const boxStyle = (accent?: string): React.CSSProperties => ({
    border: `1px solid ${accent ? accent + "44" : C.border}`,
    borderRadius: 8,
    padding: "8px 14px",
    textAlign: "center" as const,
    background: accent ? `${accent}0d` : "rgba(0,0,0,0.02)",
  })
  const labelStyle: React.CSSProperties = { fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }
  const nameStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: C.text }
  const subStyle: React.CSSProperties = { fontSize: 10, color: C.muted, marginTop: 2 }
  const arrowStyle: React.CSSProperties = { color: C.muted, fontSize: 16, textAlign: "center" }

  return (
    <div style={{
      marginBottom: 28,
      padding: "18px 20px",
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
    }}>
      <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        System Architecture
      </p>

      {/* Layer 1: Customer */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
        <div style={{ ...boxStyle(C.gold), padding: "7px 28px" }}>
          <p style={{ ...nameStyle, color: C.gold }}>👤 Customer Browser</p>
        </div>
      </div>

      <p style={{ ...arrowStyle, marginBottom: 6 }}>↓</p>

      {/* Layer 2: Storefront + Analytics */}
      <div style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "stretch" }}>
        <div style={{ ...boxStyle(), flex: "0 0 auto", minWidth: 150 }}>
          <p style={labelStyle}>Frontend</p>
          <p style={nameStyle}>🌐 Storefront</p>
          <p style={subStyle}>vod-auctions.com</p>
          <p style={{ ...subStyle, color: C.muted, marginTop: 4, fontSize: 10 }}>Next.js 16 · React 19</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 14, paddingTop: 4 }}>
          →
        </div>
        <div style={{ ...boxStyle(), flex: 1 }}>
          <p style={labelStyle}>Analytics Layer (client-side, consent-gated)</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", justifyContent: "center", marginTop: 4 }}>
            {[["📊", "GA4", "Traffic"], ["📡", "RudderStack", "CDP"], ["🔍", "Clarity", "UX"], ["🐛", "Sentry", "Errors"]].map(([icon, name, role]) => (
              <div key={name} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16 }}>{icon}</div>
                <div style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{name}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{role}</div>
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

      {/* Layer 4: Data / Payments / Communication / AI */}
      <div style={{ display: "flex", gap: 8 }}>
        {[
          {
            label: "Data Layer",
            items: [
              ["🗄️", "PostgreSQL", "Primary DB (Supabase)"],
              ["🔎", "Meilisearch", "Search (Docker/VPS)"],
              ["⚡", "Upstash Redis", "Cache"],
              ["🖼️", "Cloudflare R2", "Image CDN"],
              ["📡", "Supabase Realtime", "Live-Bidding WS"],
            ],
          },
          {
            label: "Payments",
            items: [["💳", "Stripe", "Cards + BNPL"], ["🅿️", "PayPal", "Wallet"]],
          },
          {
            label: "Communication",
            items: [["✉️", "Resend", "Transactional + Alerts"], ["📧", "Brevo", "CRM + Newsletter"]],
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
                <div style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{icon} {name}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{role}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Layer 5: External Sources + Sync Pipelines + Edge */}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {[
          {
            label: "External Sources",
            items: [
              ["🎛️", "Discogs API", "Metadata + Price Suggestions"],
              ["💾", "Legacy MySQL", "Hourly sync → PostgreSQL"],
            ],
          },
          {
            label: "Sync Pipelines (VPS Cron)",
            items: [
              ["🔄", "legacy_sync_v2", "hourly · 14 fields diff"],
              ["📥", "discogs_daily_sync", "Mo-Fr 02:00 UTC"],
              ["🔎", "meilisearch_sync", "every 5min · delta"],
              ["📐", "meili_drift_check", "every 30min"],
            ],
          },
          {
            label: "Edge Devices",
            items: [
              ["🖨️", "Print Bridge", "3 Macs · Python LaunchAgent"],
              ["📱", "Scanner (BCST-70)", "USB-HID · USB-tethered"],
            ],
          },
        ].map((col) => (
          <div key={col.label} style={{ ...boxStyle(), flex: 1 }}>
            <p style={labelStyle}>{col.label}</p>
            {col.items.map(([icon, name, role]) => (
              <div key={name} style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{icon} {name}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{role}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Layer 6: Planned Integrations (dimmed, dashed border) */}
      <div style={{
        marginTop: 8,
        padding: "10px 14px",
        border: `1px dashed ${C.border}`,
        borderRadius: 8,
        background: "rgba(0,0,0,0.015)",
      }}>
        <p style={{ ...labelStyle, marginBottom: 6 }}>
          Planned Integrations <span style={{ opacity: 0.7 }}>· deployed-ready, activation pending</span>
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", opacity: 0.7 }}>
          {[
            ["📦", "Sendcloud", "Shipping automation · DHL-GK 5115313430"],
            ["🧾", "easybill", "ERP_INVOICING · §14 UStG compliance"],
            ["🔐", "Fiskaly TSE", "POS_WALK_IN P1 · KassenSichV"],
          ].map(([icon, name, role]) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{name}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{role}</div>
              </div>
            </div>
          ))}
        </div>
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
  const [alertHistory, setAlertHistory] = useState<AlertHistoryData | null>(null)

  const fetchAlerts = useCallback(async () => {
    try {
      const r = await fetch("/admin/system-health/alerts", { credentials: "include" })
      if (r.ok) setAlerts(await r.json())
    } catch { /* silent */ }
  }, [])

  const fetchAlertHistory = useCallback(async () => {
    try {
      const r = await fetch("/admin/system-health/alerts/history?days=7&limit=50", { credentials: "include" })
      if (r.ok) setAlertHistory(await r.json())
    } catch { /* silent */ }
  }, [])

  const acknowledgeAlert = useCallback(async (id: number) => {
    const reason = window.prompt("Acknowledge reason (min 3 chars):")
    if (!reason || reason.trim().length < 3) return
    try {
      const r = await fetch(`/admin/system-health/alerts/${id}/acknowledge`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        window.alert(`Acknowledge failed: ${body.error || r.status}`)
        return
      }
      await fetchAlertHistory()
    } catch (e: any) {
      window.alert(`Acknowledge error: ${e?.message}`)
    }
  }, [fetchAlertHistory])

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

  useEffect(() => { fetchHealth(); fetchAlerts(); fetchAlertHistory() }, [fetchHealth, fetchAlerts, fetchAlertHistory])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => { fetchHealth(); fetchAlertHistory() }, 30_000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchHealth, fetchAlertHistory])

  const alertHistoryFlagOn = data?.feature_flags?.some((f) => f.key === "SYSTEM_HEALTH_ALERT_HISTORY" && f.enabled) ?? false
  const sentryEmbedFlagOn = data?.feature_flags?.some((f) => f.key === "SYSTEM_HEALTH_SENTRY_EMBED" && f.enabled) ?? false
  const logViewerFlagOn = data?.feature_flags?.some((f) => f.key === "SYSTEM_HEALTH_LOG_VIEWER" && f.enabled) ?? false
  const unresolvedAlerts = alertHistory?.rows.filter((r) => r.status === "fired") ?? []

  // P4-B/C: Drawer state — one service open at a time
  const [drawerService, setDrawerService] = useState<ServiceCheck | null>(null)
  const anyDrawerFlagOn = sentryEmbedFlagOn || logViewerFlagOn

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
    <PageShell maxWidth={1200}>
      <style>{`
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
      `}</style>

      <PageHeader
        title="System Health"
        subtitle={checkedAt ? `Last checked: ${checkedAt}` : "Checking all services…"}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {alertHistoryFlagOn && unresolvedAlerts.length > 0 && (
              <button
                onClick={() => {
                  const el = document.getElementById("alert-history-panel")
                  el?.scrollIntoView({ behavior: "smooth", block: "start" })
                }}
                style={{
                  background: C.error + "1f",
                  border: `1px solid ${C.error}55`,
                  color: C.error,
                  borderRadius: 20,
                  padding: "4px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
                title="Scroll to Alert-History"
              >
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", background: C.error, display: "inline-block",
                  animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
                }} />
                {unresolvedAlerts.length} unresolved
              </button>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, cursor: "pointer" }}>
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} style={{ accentColor: C.gold }} />
              Auto-refresh (30s)
            </label>
            <button
              onClick={fetchHealth}
              disabled={loading}
              style={{
                background: C.gold, color: "#fff", border: "none", borderRadius: 6,
                padding: "8px 16px", fontWeight: 600, fontSize: 13,
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
                transition: "opacity 0.2s",
              }}
            >
              {loading ? "Checking…" : "↻ Refresh"}
            </button>
          </div>
        }
      />

      {/* Error state */}
      {error && (
        <div style={{ background: C.error + "1a", border: `1px solid ${C.error}4d`, borderRadius: 8, padding: "12px 16px", color: C.error, marginBottom: 20, fontSize: 13 }}>
          Failed to load health data: {error}
        </div>
      )}

      {/* Deploy info + Feature flags panel */}
      {data?.deploy_info && (
        <div style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: "12px 18px",
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          alignItems: "center",
          fontSize: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: C.muted }}>Commit</span>
            <a
              href={`https://github.com/rseckler/VOD_Auctions/commit/${data.deploy_info.sha}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: C.gold, textDecoration: "none", fontFamily: "monospace", fontWeight: 600 }}
              title={data.deploy_info.sha}
            >
              {data.deploy_info.sha_short}
            </a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: C.muted }}>Uptime</span>
            <span style={{ color: C.text, fontFamily: "monospace" }}>
              {formatUptime(data.deploy_info.process_uptime_sec)}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: C.muted }}>Node</span>
            <span style={{ color: C.text, fontFamily: "monospace" }}>{data.deploy_info.node_version}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: C.muted }}>Registered checks</span>
            <span style={{ color: C.text, fontWeight: 600 }}>{data.registered_checks ?? "?"}</span>
          </div>
          {data.feature_flags && data.feature_flags.length > 0 && (
            <>
              <div style={{ borderLeft: `1px solid ${C.border}`, height: 16 }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <span style={{ color: C.muted, marginRight: 4 }}>Flags</span>
                {data.feature_flags.map((f) => (
                  <span
                    key={f.key}
                    title={f.description}
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "2px 7px",
                      borderRadius: 4,
                      background: f.enabled ? C.success + "24" : C.muted + "18",
                      color: f.enabled ? C.success : C.muted,
                      border: `1px solid ${f.enabled ? C.success + "4d" : C.border}`,
                      fontFamily: "monospace",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {f.enabled ? "●" : "○"} {f.key}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Summary bar */}
      {data && (
        <div style={{
          display: "flex", gap: 12, marginBottom: 24, background: C.card,
          border: `1px solid ${C.border}`, borderRadius: 10,
          padding: "14px 20px", flexWrap: "wrap",
        }}>
          {(() => {
            const s = data.summary
            const errorCount = (s.error ?? 0) + (s.critical ?? 0)
            const cells = [
              { label: "All Systems", value: s.total, color: C.text },
              { label: "✓ Operational", value: s.ok, color: C.success },
              ...(s.degraded > 0 ? [{ label: "◐ Degraded", value: s.degraded, color: C.gold }] : []),
              ...(s.warning > 0 ? [{ label: "⚠ Warning", value: s.warning, color: C.warning }] : []),
              ...(errorCount > 0 ? [{ label: "✗ Errors", value: errorCount, color: C.error }] : []),
              ...(s.insufficient_signal > 0 ? [{ label: "∅ No signal", value: s.insufficient_signal, color: C.muted }] : []),
              { label: "— Not Configured", value: s.unconfigured, color: C.muted },
            ]
            return cells.map((c) => (
              <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 20, borderRight: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: c.color, lineHeight: 1 }}>{c.value}</span>
                <span style={{ fontSize: 12, color: C.muted }}>{c.label}</span>
              </div>
            ))
          })()}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
            {(() => {
              const crit = data.summary.critical ?? 0
              const err = data.summary.error ?? 0
              const warn = data.summary.warning ?? 0
              const deg = data.summary.degraded ?? 0
              if (crit > 0) {
                return <span style={{ background: C.error + "26", color: C.error, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>⚠ {crit} CRITICAL</span>
              }
              if (err > 0) {
                return <span style={{ background: C.error + "26", color: C.error, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>⚠ {err} service{err > 1 ? "s" : ""} down</span>
              }
              if (warn > 0 || deg > 0) {
                return <span style={{ background: C.warning + "26", color: C.warning, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>⚠ {warn + deg} attention</span>
              }
              return <span style={{ background: C.success + "26", color: C.success, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>✓ All systems operational</span>
            })()}
          </div>
        </div>
      )}

      {/* ── P4-A: Alert-History Panel ─────────────────────────────────── */}
      {alertHistoryFlagOn && alertHistory && (alertHistory.total_in_window > 0) && (
        <div
          id="alert-history-panel"
          style={{
            marginBottom: 20,
            padding: "14px 18px",
            background: C.card,
            border: `1px solid ${unresolvedAlerts.length > 0 ? C.error + "59" : C.border}`,
            borderRadius: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15 }}>🚨</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Alert History</span>
              <span style={{ fontSize: 11, color: C.muted }}>
                last {alertHistory.window_days}d · {alertHistory.total_in_window} total
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: 11 }}>
              {unresolvedAlerts.length > 0 && (
                <span style={{ color: C.error, fontWeight: 700 }}>
                  {unresolvedAlerts.length} unresolved
                </span>
              )}
              <span style={{ color: C.muted }}>{alertHistory.counts.acknowledged ?? 0} ack</span>
              <span style={{ color: C.muted }}>{alertHistory.counts.auto_resolved ?? 0} auto-res</span>
            </div>
          </div>

          {alertHistory.rows.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic", padding: "8px 0" }}>
              No alerts in the last {alertHistory.window_days} days.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 360, overflowY: "auto" }}>
              {alertHistory.rows.slice(0, 20).map((a) => {
                const sevColor = a.severity === "critical" ? C.error : a.severity === "error" ? C.error : C.warning
                const statusColor =
                  a.status === "fired" ? C.error :
                  a.status === "acknowledged" ? C.blue :
                  a.status === "auto_resolved" ? C.success :
                  a.status === "suppressed_by_silence" ? C.muted :
                  C.muted
                const dispatchedAt = new Date(a.dispatched_at)
                const ageMin = Math.round((Date.now() - dispatchedAt.getTime()) / 60_000)
                const ageText = ageMin < 60 ? `${ageMin}min` : ageMin < 1440 ? `${Math.floor(ageMin / 60)}h` : `${Math.floor(ageMin / 1440)}d`
                return (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      background: a.status === "fired" ? C.error + "0d" : "rgba(0,0,0,0.02)",
                      border: `1px solid ${a.status === "fired" ? C.error + "33" : C.border}`,
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  >
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: sevColor, background: sevColor + "1e",
                      padding: "2px 6px", borderRadius: 3, textTransform: "uppercase", letterSpacing: "0.05em",
                      minWidth: 52, textAlign: "center" as const,
                    }}>
                      {a.severity}
                    </span>
                    <span style={{ fontFamily: "monospace", color: C.text, minWidth: 140 }}>{a.service_name}</span>
                    <span style={{ flex: 1, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {a.message || "—"}
                    </span>
                    <span style={{ fontSize: 10, color: C.muted, minWidth: 40, textAlign: "right" as const }}>{ageText} ago</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: statusColor, background: statusColor + "1e",
                      padding: "2px 6px", borderRadius: 3, textTransform: "uppercase" as const, letterSpacing: "0.05em",
                      minWidth: 70, textAlign: "center" as const,
                    }}>
                      {a.status.replace(/_/g, " ")}
                    </span>
                    {a.status === "fired" ? (
                      <button
                        onClick={() => acknowledgeAlert(a.id)}
                        style={{
                          background: C.gold, color: "#fff", border: "none", borderRadius: 4,
                          padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                        }}
                        title="Acknowledge this alert"
                      >
                        Ack
                      </button>
                    ) : a.status === "acknowledged" ? (
                      <span style={{ fontSize: 10, color: C.muted, minWidth: 70, textAlign: "right" as const }}
                            title={`by ${a.acknowledged_by}: ${a.acknowledge_reason}`}>
                        {(a.acknowledged_by || "").split("@")[0]}
                      </span>
                    ) : (
                      <span style={{ minWidth: 70 }}>&nbsp;</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Alerts Panel ─────────────────────────────────────────────────── */}
      {alerts && (
        <div style={{ marginBottom: 28 }}>
          {/* Sync Status */}
          <div style={{
            marginBottom: 12,
            padding: "14px 18px",
            background: C.card,
            border: `1px solid ${
              alerts.sync.status === "error" ? C.error + "59" :
              alerts.sync.status === "warning" ? C.warning + "59" :
              C.success + "40"
            }`,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap" as const,
          }}>
            <span style={{ fontSize: 16 }}>🔄</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.text }}>Daily Sync</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: C.muted }}>{alerts.sync.message || "No sync data"}</p>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const,
              padding: "3px 9px", borderRadius: 4,
              color: alerts.sync.status === "error" ? C.error : alerts.sync.status === "warning" ? C.warning : C.success,
              background: alerts.sync.status === "error" ? C.error + "1e" : alerts.sync.status === "warning" ? C.warning + "1e" : C.success + "1e",
            }}>
              {alerts.sync.status === "error" ? "ERROR" : alerts.sync.status === "warning" ? "WARNING" : "OK"}
            </span>
            {alerts.sync.last_run && (
              <a href="/app/sync" style={{ fontSize: 12, color: C.gold, textDecoration: "none" }}>
                View change log →
              </a>
            )}
          </div>

          {/* Sentry Issues */}
          <div style={{
            padding: "14px 18px",
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 16 }}>🐛</span>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.text }}>Sentry — Recent Issues (7 days)</p>
              {alerts.sentry.issues.length > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 11, color: C.error, background: C.error + "1a", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                  {alerts.sentry.issues.length} issue{alerts.sentry.issues.length > 1 ? "s" : ""}
                </span>
              )}
              {alerts.sentry.issues.length === 0 && !alerts.sentry.error && (
                <span style={{ marginLeft: "auto", fontSize: 11, color: C.success, background: C.success + "1a", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                  ✓ No issues
                </span>
              )}
              <a href="https://vod-records.sentry.io/issues/" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: C.gold, textDecoration: "none", marginLeft: alerts.sentry.issues.length === 0 && !alerts.sentry.error ? 8 : 0 }}>
                Open Sentry ↗
              </a>
            </div>

            {!alerts.sentry.configured && (
              <p style={{ margin: 0, fontSize: 12, color: C.muted }}>SENTRY_API_TOKEN not configured</p>
            )}

            {alerts.sentry.error && (
              <p style={{ margin: 0, fontSize: 12, color: C.error }}>API error: {alerts.sentry.error}</p>
            )}

            {alerts.sentry.issues.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {alerts.sentry.issues.map((issue) => {
                  const levelColor = issue.level === "fatal" ? C.error : issue.level === "error" ? C.error : issue.level === "warning" ? C.warning : C.muted
                  const levelBg = issue.level === "fatal" ? C.error + "26" : issue.level === "error" ? C.error + "1e" : issue.level === "warning" ? C.warning + "1e" : C.muted + "1a"
                  const lastSeen = new Date(issue.lastSeen).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                  return (
                    <div key={issue.id} style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "10px 12px",
                      background: "rgba(0,0,0,0.2)",
                      borderRadius: 6,
                      border: "1px solid rgba(0,0,0,0.04)",
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
                          style={{ fontSize: 12, color: C.text, textDecoration: "none", display: "block",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {issue.title}
                        </a>
                        <p style={{ margin: "3px 0 0", fontSize: 11, color: C.muted }}>
                          {issue.culprit}
                        </p>
                      </div>
                      <div style={{ textAlign: "right" as const, flexShrink: 0, fontSize: 11, color: C.muted }}>
                        <div>{Number(issue.count).toLocaleString()}×</div>
                        <div style={{ marginTop: 2, color: C.muted }}>{lastSeen}</div>
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
            <div key={i} style={{ background: C.card, borderRadius: 10, height: 200, animation: "pulse 1.5s ease-in-out infinite", opacity: 0.5 }} />
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
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12, borderBottom: "1px solid rgba(0,0,0,0.04)", paddingBottom: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "inherit" }}>{cat.label}</h2>
                  <p style={{ margin: 0, fontSize: 12, color: C.muted }}>{cat.description}</p>
                  {catErrors > 0 && (
                    <span style={{ marginLeft: "auto", fontSize: 11, color: C.error, background: C.error + "1a", padding: "2px 8px", borderRadius: 4 }}>
                      {catErrors} error{catErrors > 1 ? "s" : ""}
                    </span>
                  )}
                  {catErrors === 0 && catUnconfigured > 0 && (
                    <span style={{ marginLeft: "auto", fontSize: 11, color: C.muted, background: C.muted + "1a", padding: "2px 8px", borderRadius: 4 }}>
                      {catUnconfigured} not configured
                    </span>
                  )}
                  {catErrors === 0 && catUnconfigured === 0 && (
                    <span style={{ marginLeft: "auto", fontSize: 11, color: C.success, background: C.success + "1a", padding: "2px 8px", borderRadius: 4 }}>
                      ✓ All OK
                    </span>
                  )}
                </div>

                {/* Service grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
                  {services.map((service) => (
                    <ServiceCard key={service.name} service={service} onOpenDrawer={anyDrawerFlagOn ? setDrawerService : undefined} />
                  ))}
                </div>
              </div>
            )
          })}

          {/* Orphan services (safety net) */}
          {orphanServices.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12, borderBottom: "1px solid rgba(0,0,0,0.04)", paddingBottom: 10 }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "inherit" }}>Other</h2>
                <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Uncategorised services</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
                {orphanServices.map((service) => (
                  <ServiceCard key={service.name} service={service} onOpenDrawer={anyDrawerFlagOn ? setDrawerService : undefined} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick links */}
      <div style={{ marginTop: 36, padding: "16px 20px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
        <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: C.text }}>Quick Links</p>
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
            { label: "Meilisearch Flag", url: "/app/config" },
            { label: "Anthropic Console", url: "https://console.anthropic.com" },
            { label: "Hostinger VPS", url: "https://hpanel.hostinger.com" },
          ].map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12, color: C.gold, textDecoration: "none",
                background: C.gold + "14", padding: "4px 10px",
                borderRadius: 5, border: `1px solid ${C.gold}33`,
              }}
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      </div>

      {/* P4-B/C: ServiceDrawer (renders with position:fixed, doesn't affect layout) */}
      {drawerService && (
        <ServiceDrawer
          service={drawerService}
          sentryEmbedOn={sentryEmbedFlagOn}
          logViewerOn={logViewerFlagOn}
          onClose={() => setDrawerService(null)}
        />
      )}
    </PageShell>
  )
}
