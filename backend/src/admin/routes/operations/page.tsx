import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CogSixTooth } from "@medusajs/icons"
import { useEffect, useState } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

type LiveAuction = {
  id: string
  title: string
  status: string
  end_time: string | null
  items?: { id: string }[]
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
}: {
  icon: string
  title: string
  description: string
  statusLine?: string
  statusColor?: string
  meta?: string
  href: string
  children?: React.ReactNode
}) {
  return (
    <div
      onClick={() => { window.location.href = href }}
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
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
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{title}</div>
          {statusLine && (
            <div style={{ fontSize: 11, color: statusColor || "#6b7280", fontWeight: 600, marginTop: 2 }}>
              {statusLine}
            </div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5, marginBottom: 12 }}>
        {description}
      </div>
      {children}
      {meta && <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 10 }}>{meta}</div>}
      <button style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        background: "#f3f4f6", color: "#374151",
        border: "none", borderRadius: 5,
        padding: "5px 12px", fontSize: 11, fontWeight: 500, cursor: "pointer",
      }}>
        Open →
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function OperationsHub() {
  const [liveAuctions, setLiveAuctions] = useState<LiveAuction[]>([])

  useEffect(() => {
    fetch("/admin/auction-blocks?status=active&limit=10")
      .then((r) => r.json())
      .then((d) => {
        const blocks: LiveAuction[] = d.auction_blocks ?? []
        setLiveAuctions(blocks.filter((b) => b.status === "active"))
      })
      .catch(() => {})
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

  return (
    <div style={{ padding: "32px 36px", maxWidth: 960, fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      {/* Header */}
      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 20 }}>Admin</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginBottom: 4 }}>
        ⚙️ Operations
      </div>
      <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 28 }}>
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
        <HubCard
          icon="🩺"
          title="System Health"
          description="Live status for all platform services: database, payments, email providers, storefront, and analytics."
          statusLine="11 services monitored"
          statusColor="#16a34a"
          href="/app/system-health"
        />

        <HubCard
          icon="🚚"
          title="Shipping Configuration"
          description="Manage shipping zones, weight-based rates, item types, and methods. Includes a shipping calculator tool."
          meta="3 zones · 15 weight tiers · 13 item types"
          href="/app/shipping"
        />

        <HubCard
          icon="🔄"
          title="Sync Status"
          description="Monitor Discogs price sync (daily, 5 chunks) and legacy MySQL import status."
          meta="Discogs Daily (Mon–Fri) · Legacy MySQL (daily 04:00 UTC)"
          href="/app/sync"
        />

        <HubCard
          icon="🧪"
          title="Test Runner"
          description="Test Stripe and PayPal payments with test accounts. Verify webhook delivery and email templates in real send."
          meta="Stripe · PayPal · Webhooks · Email"
          href="/app/test-runner"
        />
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
})

export default OperationsHub
