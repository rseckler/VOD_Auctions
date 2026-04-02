import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CogSixTooth } from "@medusajs/icons"
import { useEffect, useState } from "react"
import { useAdminNav } from "../../components/admin-nav"

// ─── Types ────────────────────────────────────────────────────────────────────

type LiveAuction = {
  id: string
  title: string
  status: string
  end_time: string | null
  items?: { id: string }[]
}

type ServiceCheck = {
  name: string
  label: string
  status: "ok" | "degraded" | "error" | "unconfigured"
  message: string
  latency_ms: number | null
}

type SystemHealthData = {
  summary: { total: number; ok: number; errors: number; unconfigured: number; degraded: number }
  services: ServiceCheck[]
}

type DiscogsHealthData = {
  health: {
    chunk_id: number | string | null
    updated: number
    updated_at: string
    status: string
  } | null
}

type LegacySyncData = {
  sync_logs: Array<{
    sync_date: string
    updated?: number
    records_updated?: number
    [key: string]: unknown
  }>
}

// ─── Card component ───────────────────────────────────────────────────────────

function HubCard({
  icon,
  title,
  description,
  statusLine,
  statusColor,
  meta,
  href,
  children,
  actionLabel,
}: {
  icon: string
  title: string
  description?: string
  statusLine?: string
  statusColor?: string
  meta?: string
  href: string
  children?: React.ReactNode
  actionLabel?: string
}) {
  return (
    <div
      onClick={() => { window.location.href = href }}
      style={{
        background: "var(--bg-component, #1a1714)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 10,
        padding: 20,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.07)"
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = "none"
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 22 }}>{icon}</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "inherit" }}>{title}</div>
          {statusLine && (
            <div style={{ fontSize: 11, color: statusColor || "#6b7280", fontWeight: 600, marginTop: 2 }}>
              {statusLine}
            </div>
          )}
        </div>
      </div>
      {description && (
        <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.5, marginBottom: 12 }}>
          {description}
        </div>
      )}
      {children}
      {meta && <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 10 }}>{meta}</div>}
      <button style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        background: "transparent", color: "#d1d5db",
        border: "none", borderRadius: 5,
        padding: "5px 12px", fontSize: 11, fontWeight: 500, cursor: "pointer",
      }}>
        {actionLabel || "Open →"}
      </button>
    </div>
  )
}

// ─── Helper: coloured dot ─────────────────────────────────────────────────────

function Dot({ color }: { color: "green" | "amber" | "red" | "grey" }) {
  const bg = { green: "#16a34a", amber: "#d97706", red: "#dc2626", grey: "#9ca3af" }[color]
  return (
    <span style={{
      display: "inline-block",
      width: 7, height: 7,
      borderRadius: "50%",
      background: bg,
      flexShrink: 0,
    }} />
  )
}

function serviceStatusColor(status: string): "green" | "amber" | "red" | "grey" {
  if (status === "ok") return "green"
  if (status === "degraded") return "amber"
  if (status === "error") return "red"
  return "grey"
}

// ─── System Health Card content ───────────────────────────────────────────────

function SystemHealthContent({ data, loading }: { data: SystemHealthData | null; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 12 }}>Checking services…</div>
    )
  }
  if (!data) {
    return (
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 12 }}>Status unavailable</div>
    )
  }

  const { summary, services } = data
  const allOk = summary.errors === 0 && summary.degraded === 0
  const hasErrors = summary.errors > 0
  const statusColor = hasErrors ? "#dc2626" : allOk ? "#16a34a" : "#d97706"
  const statusText = `${summary.ok}/${summary.total} services OK`

  // Display up to 9 services in the mini grid (show "important" ones first)
  const displayServices = services.slice(0, 9)

  // Issues to warn about
  const issues = services.filter((s) => s.status !== "ok" && s.status !== "unconfigured")

  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, color: statusColor, marginBottom: 8 }}>
        ● {statusText}
      </div>
      {/* Mini 3-column service grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
        gap: "6px 4px", marginBottom: issues.length > 0 ? 8 : 12,
      }}>
        {displayServices.map((s) => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#d1d5db" }}>
            <Dot color={serviceStatusColor(s.status)} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.label.split(" ")[0]}
            </span>
          </div>
        ))}
      </div>
      {/* Warning box for any non-ok service */}
      {issues.map((s) => (
        <div key={s.name} style={{
          fontSize: 10, color: "#d97706",
          background: "#fffbeb", border: "1px solid #fde68a",
          borderRadius: 4, padding: "4px 8px", marginBottom: 8,
        }}>
          ⚠ {s.label}: {s.message}
        </div>
      ))}
    </>
  )
}

// ─── Sync Status Card content ─────────────────────────────────────────────────

function SyncStatusContent({
  discogs,
  legacy,
  loading,
}: {
  discogs: DiscogsHealthData | null
  legacy: LegacySyncData | null
  loading: boolean
}) {
  function formatTime(iso: string | null | undefined): string {
    if (!iso) return "not yet"
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  function discogsAge(iso: string | null | undefined): "green" | "amber" | "grey" {
    if (!iso) return "grey"
    const ageH = (Date.now() - new Date(iso).getTime()) / 3600000
    if (ageH < 48) return "green"
    if (ageH < 96) return "amber"
    return "grey"
  }

  const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8,
    fontSize: 11, padding: "5px 0",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  }
  const lastRowStyle: React.CSSProperties = { ...rowStyle, borderBottom: "none" }

  if (loading) {
    return <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 12 }}>Loading sync status…</div>
  }

  const discogsHealth = discogs?.health ?? null
  const latestLegacy = legacy?.sync_logs?.[0] ?? null

  const discogsChunk = discogsHealth?.chunk_id != null ? `chunk ${discogsHealth.chunk_id}/5` : "chunk –/5"
  const discogsTime = discogsHealth ? formatTime(discogsHealth.updated_at) : "not yet"
  const discogsDot = discogsHealth ? discogsAge(discogsHealth.updated_at) : "grey"

  const legacyUpdates = latestLegacy
    ? (latestLegacy.updated ?? latestLegacy.records_updated ?? "–")
    : "–"
  const legacyTime = latestLegacy ? formatTime(latestLegacy.sync_date) : "not yet"
  const legacyDot: "green" | "grey" = latestLegacy ? "green" : "grey"

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={rowStyle}>
        <Dot color={discogsDot} />
        <span style={{ fontWeight: 600 }}>Discogs Daily</span>
        <span style={{ color: "#9ca3af", marginLeft: "auto" }}>
          {discogsHealth ? `${discogsChunk} · last: ${discogsTime}` : "not yet"}
        </span>
      </div>
      <div style={rowStyle}>
        <Dot color={legacyDot} />
        <span style={{ fontWeight: 600 }}>Legacy Sync</span>
        <span style={{ color: "#9ca3af", marginLeft: "auto" }}>
          {latestLegacy ? `${legacyUpdates} updates · last: ${legacyTime}` : "not yet"}
        </span>
      </div>
      <div style={lastRowStyle}>
        <Dot color="grey" />
        <span style={{ fontWeight: 600 }}>Entity Overhaul</span>
        <span style={{ color: "#9ca3af", marginLeft: "auto" }}>paused</span>
      </div>
    </div>
  )
}

// ─── Shipping Card content ────────────────────────────────────────────────────

function ShippingContent() {
  const rowStyle: React.CSSProperties = {
    display: "flex", justifyContent: "space-between",
    fontSize: 11, padding: "5px 0",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  }
  const lastRowStyle: React.CSSProperties = { ...rowStyle, borderBottom: "none" }

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={rowStyle}>
        <span>DE (domestic)</span>
        <span style={{ fontWeight: 600 }}>from €4.99</span>
      </div>
      <div style={rowStyle}>
        <span>EU</span>
        <span style={{ fontWeight: 600 }}>from €9.99</span>
      </div>
      <div style={lastRowStyle}>
        <span>World</span>
        <span style={{ fontWeight: 600 }}>from €14.99</span>
      </div>
    </div>
  )
}

// ─── Test Runner Card content ─────────────────────────────────────────────────

function TestRunnerContent() {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#d1d5db", marginBottom: 6 }}>
        <Dot color="grey" />
        No active tests
      </div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 10 }}>
        Last run: 2026-03-29 · Stripe ✓ PayPal ✓
      </div>
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function OperationsHub() {
  useAdminNav()
  const [liveAuctions, setLiveAuctions] = useState<LiveAuction[]>([])
  const [healthData, setHealthData] = useState<SystemHealthData | null>(null)
  const [discogsData, setDiscogsData] = useState<DiscogsHealthData | null>(null)
  const [legacyData, setLegacyData] = useState<LegacySyncData | null>(null)
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    // Live auctions fetch
    fetch("/admin/auction-blocks?status=active&limit=10")
      .then((r) => r.json())
      .then((d) => {
        const blocks: LiveAuction[] = d.auction_blocks ?? []
        setLiveAuctions(blocks.filter((b) => b.status === "active"))
      })
      .catch(() => {})

    // Hub data fetches in parallel — graceful per-fetch failure
    Promise.allSettled([
      fetch("/admin/system-health").then((r) => r.json()),
      fetch("/admin/sync/discogs-health").then((r) => r.json()),
      fetch("/admin/sync/legacy").then((r) => r.json()),
    ]).then(([healthResult, discogsResult, legacyResult]) => {
      if (healthResult.status === "fulfilled") setHealthData(healthResult.value as SystemHealthData)
      if (discogsResult.status === "fulfilled") setDiscogsData(discogsResult.value as DiscogsHealthData)
      if (legacyResult.status === "fulfilled") setLegacyData(legacyResult.value as LegacySyncData)
      setDataLoading(false)
    })
  }, [])

  const hasLive = liveAuctions.length > 0

  function timeLeft(endTime: string | null): string {
    if (!endTime) return ""
    const diff = new Date(endTime).getTime() - Date.now()
    if (diff <= 0) return "ended"
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`
  }

  // Derive system health status line for card header
  const healthStatusLine = dataLoading
    ? "checking…"
    : healthData
    ? `${healthData.summary.ok}/${healthData.summary.total} services OK`
    : "11 services monitored"

  const healthStatusColor = !healthData
    ? "#6b7280"
    : healthData.summary.errors > 0
    ? "#dc2626"
    : healthData.summary.degraded > 0
    ? "#d97706"
    : "#16a34a"

  return (
    <div style={{ padding: "32px 36px", maxWidth: 960, fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      {/* Header */}
      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 20 }}>Admin</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "inherit", marginBottom: 4 }}>
        ⚙️ Operations
      </div>
      <div style={{ fontSize: 14, color: "#9ca3af", marginBottom: 28 }}>
        Platform monitoring, configuration, and technical tools
      </div>

      {/* Live auction banner — shown when auctions are active */}
      {hasLive && (
        <div style={{
          background: "linear-gradient(135deg, #15803d, #166534)",
          borderRadius: 10, padding: "20px 24px", marginBottom: 24,
          color: "#fff", display: "flex", alignItems: "center", gap: 16,
        }}>
          <div style={{
            width: 12, height: 12, borderRadius: "50%", background: "#4ade80",
            flexShrink: 0, animation: "pulse 1.5s ease-in-out infinite",
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
              {liveAuctions.length} Auction{liveAuctions.length > 1 ? "s" : ""} Running Right Now
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              {liveAuctions.map((a) => (
                <div key={a.id} style={{ fontSize: 12, opacity: 0.85 }}>
                  <strong>{a.title}</strong>
                  {a.end_time && ` · ${timeLeft(a.end_time)}`}
                  {a.items && ` · ${a.items.length} lots`}
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); window.location.href = "/app/live-monitor" }}
            style={{
              background: "rgba(255,255,255,0.15)", color: "#fff",
              border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6,
              padding: "7px 16px", fontSize: 13, fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Open Live Monitor ↗
          </button>
        </div>
      )}

      {/* Section heading */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: "#9ca3af",
        textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12,
      }}>
        Platform Tools
      </div>

      {/* Cards — 2×2 grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>

        {/* System Health */}
        <HubCard
          icon="🩺"
          title="System Health"
          description="Live status for all platform services: database, payments, email providers, storefront, and analytics."
          statusLine={healthStatusLine}
          statusColor={healthStatusColor}
          href="/app/system-health"
          actionLabel="Full System Health →"
        >
          <SystemHealthContent data={healthData} loading={dataLoading} />
        </HubCard>

        {/* Shipping Configuration */}
        <HubCard
          icon="🚚"
          title="Shipping Configuration"
          description="Manage shipping zones, weight-based rates, item types, and methods. Includes a shipping calculator tool."
          statusLine="3 zones · 15 weight tiers · 13 item types"
          statusColor="#6b7280"
          href="/app/shipping"
          actionLabel="Configure Shipping →"
        >
          <ShippingContent />
        </HubCard>

        {/* Sync Status */}
        <HubCard
          icon="🔄"
          title="Sync Status"
          description="Monitor Discogs price sync (daily, 5 chunks) and legacy MySQL import status."
          statusLine="Discogs · Legacy MySQL"
          statusColor="#6b7280"
          href="/app/sync"
          actionLabel="View Sync Details →"
        >
          <SyncStatusContent discogs={discogsData} legacy={legacyData} loading={dataLoading} />
        </HubCard>

        {/* Test Runner */}
        <HubCard
          icon="🧪"
          title="Test Runner"
          description="Test Stripe and PayPal payments with test accounts. Verify webhook delivery and email templates in real send."
          statusLine="Payment & flow testing"
          statusColor="#6b7280"
          href="/app/test-runner"
          actionLabel="Open Test Runner →"
        >
          <TestRunnerContent />
        </HubCard>

      </div>

      {/* Live Monitor card — always visible even if no live auctions */}
      {!hasLive && (
        <>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "#9ca3af",
            textTransform: "uppercase", letterSpacing: "0.07em",
            marginTop: 24, marginBottom: 12,
          }}>
            Auction Monitoring
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
            <HubCard
              icon="📡"
              title="Live Monitor"
              description="Real-time auction dashboard — active bidders, live bid stream, lot countdown timers. Shown prominently when auctions are active."
              statusLine="No active auctions"
              statusColor="#9ca3af"
              meta="Auto-refresh 10s"
              href="/app/live-monitor"
            />
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.3); }
        }
      `}</style>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Operations",
  icon: CogSixTooth,
  rank: 5,
})

export default OperationsHub
