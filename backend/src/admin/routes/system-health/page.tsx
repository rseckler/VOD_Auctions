import { ServerStack } from "@medusajs/icons"
import { useAdminNav } from "../../components/admin-nav"
import { useEffect, useState, useCallback } from "react"

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ServiceStatus, { color: string; bg: string; dot: string; label: string }> = {
  ok:            { color: "#22c55e", bg: "rgba(34,197,94,0.12)",   dot: "#22c55e", label: "OK"           },
  degraded:      { color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  dot: "#f59e0b", label: "Degraded"     },
  error:         { color: "#ef4444", bg: "rgba(239,68,68,0.12)",   dot: "#ef4444", label: "Error"        },
  unconfigured:  { color: "#6b7280", bg: "rgba(107,114,128,0.12)", dot: "#6b7280", label: "Not set"      },
}

const SERVICE_ICONS: Record<string, string> = {
  postgresql:          "🗄️",
  stripe:              "💳",
  paypal:              "🅿️",
  resend:              "✉️",
  brevo:               "📧",
  storefront:          "🌐",
  sentry:              "🐛",
  contentsquare:       "👁️",
  ga4:                 "📊",
  rudderstack:         "📡",
  upstash:             "⚡",
  anthropic:           "🤖",
  vps:                 "🖥️",
  storefront_public:   "🌍",
}

function StatusDot({ status }: { status: ServiceStatus }) {
  const cfg = STATUS_CONFIG[status]
  const isActive = status === "ok"
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {isActive && (
        <span style={{
          position: "absolute",
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: cfg.dot,
          opacity: 0.25,
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

  return (
    <div style={{
      background: "#1c1915",
      border: `1px solid ${cfg.color}44`,
      borderRadius: 10,
      padding: "16px 18px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      transition: "border-color 0.2s",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{icon}</span>
          <span style={{ fontWeight: 600, color: "#f5f0e8", fontSize: 14 }}>{service.label}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LatencyBadge ms={service.latency_ms} />
          <StatusDot status={service.status} />
        </div>
      </div>

      {/* Status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: cfg.color,
          background: cfg.bg,
          padding: "2px 8px",
          borderRadius: 4,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}>
          {cfg.label}
        </span>
      </div>

      {/* Message */}
      <p style={{ margin: 0, fontSize: 12, color: "#9ca3af", lineHeight: 1.5 }}>
        {service.message}
      </p>

      {/* Link */}
      {service.url && (
        <a
          href={service.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: "#d4a54a", textDecoration: "none", marginTop: 2 }}
        >
          Open Dashboard →
        </a>
      )}
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

  // Initial load
  useEffect(() => { fetchHealth() }, [fetchHealth])

  // Auto-refresh every 30s
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchHealth, 30_000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchHealth])

  const checkedAt = data?.checked_at
    ? new Date(data.checked_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto" }}>
      {/* CSS for ping animation */}
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>System Health</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
            {checkedAt ? `Last checked: ${checkedAt}` : "Checking all services…"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9ca3af", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ accentColor: "#d4a54a" }}
            />
            Auto-refresh (30s)
          </label>
          <button
            onClick={fetchHealth}
            disabled={loading}
            style={{
              background: "#d4a54a",
              color: "#1c1915",
              border: "none",
              borderRadius: 6,
              padding: "8px 16px",
              fontWeight: 600,
              fontSize: 13,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
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
          display: "flex",
          gap: 12,
          marginBottom: 28,
          background: "#1c1915",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: "14px 20px",
          flexWrap: "wrap",
        }}>
          {[
            { label: "All Systems", value: data.summary.total, color: "#f5f0e8" },
            { label: "✓ Operational", value: data.summary.ok, color: "#22c55e" },
            { label: "✗ Errors", value: data.summary.errors, color: "#ef4444" },
            { label: "— Not Configured", value: data.summary.unconfigured, color: "#6b7280" },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 20, borderRight: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</span>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>{s.label}</span>
            </div>
          ))}

          {/* Overall status pill */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
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

      {/* Loading skeleton */}
      {loading && !data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {[...Array(9)].map((_, i) => (
            <div key={i} style={{ background: "#1c1915", borderRadius: 10, height: 110, animation: "pulse 1.5s ease-in-out infinite", opacity: 0.5 }} />
          ))}
        </div>
      )}

      {/* Service grid */}
      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {data.services.map((service) => (
            <ServiceCard key={service.name} service={service} />
          ))}
        </div>
      )}

      {/* Quick links */}
      <div style={{ marginTop: 32, padding: "16px 20px", background: "#1c1915", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}>
        <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "#f5f0e8" }}>Quick Links</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[
            { label: "Supabase Dashboard", url: "https://supabase.com/dashboard/project/bofblwqieuvmqybzxapx" },
            { label: "Stripe Dashboard", url: "https://dashboard.stripe.com" },
            { label: "PayPal Dashboard", url: "https://www.paypal.com/business" },
            { label: "Resend", url: "https://resend.com/overview" },
            { label: "Brevo", url: "https://app.brevo.com" },
            { label: "Sentry Issues", url: "https://vod-records.sentry.io/issues/" },
            { label: "ContentSquare", url: "https://app.contentsquare.com" },
            { label: "GA4 Analytics", url: "https://analytics.google.com" },
            { label: "RudderStack", url: "https://app.rudderstack.com" },
            { label: "Upstash Redis", url: "https://console.upstash.com" },
            { label: "Anthropic Console", url: "https://console.anthropic.com" },
          ].map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                color: "#d4a54a",
                textDecoration: "none",
                background: "rgba(212,165,74,0.08)",
                padding: "4px 10px",
                borderRadius: 5,
                border: "1px solid rgba(212,165,74,0.2)",
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
