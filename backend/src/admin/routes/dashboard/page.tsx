import { defineRouteConfig } from "@medusajs/admin-sdk"
import { House } from "@medusajs/icons"
import { useAdminNav } from "../../components/admin-nav"
import { useEffect, useState, useCallback, useRef } from "react"
import { C, fmtMoney, fmtNum, fmtDate, relativeTime } from "../../components/admin-tokens"
import { PageHeader, SectionHeader, PageShell, StatsGrid } from "../../components/admin-layout"
import { Toast, Alert, ColorBadge } from "../../components/admin-ui"

// ── Types ──────────────────────────────────────────────────────────────────────

type DashboardData = {
  platform_mode: "beta_test" | "pre_launch" | "preview" | "live" | "maintenance"
  stats: {
    catalog_total: number
    for_sale: number
    cover_pct: number
    releases: number
    band_lit: number
    label_lit: number
    press_lit: number
    active_auctions: number
    active_items: number
    active_bids: number
    top_bid: number
    bids_today: number
    overdue_payments: number
    ready_to_pack: number
    labels_pending: number
    new_users_week: number
    waitlist: {
      pending?: number
      approved?: number
      invited?: number
      registered?: number
      rejected?: number
    }
  }
  weekly: { revenue: number; orders: number; shipped: number; pending: number }
  launch_readiness: {
    checks: Array<{ label: string; ok: boolean; detail: string }>
    progress_pct: number
  } | null
  actions: Array<{ type: "error" | "warning" | "info"; message: string; link?: string }>
  activity: Array<{ type: "bid" | "order"; message: string; time: string }>
  auctions: Array<{
    id: string
    title: string
    slug: string
    type: string
    ends_at: string
    item_count: number
    bid_count: number
    top_bid: number
  }>
  last_sync: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function currentDateLabel(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function blockTypeLabel(type: string): string {
  const map: Record<string, string> = {
    themed: "Themed",
    highlight: "Highlight",
    clearance: "Clearance",
    flash: "Flash",
  }
  return map[type] ?? type
}

function modeLabel(mode: string): string {
  const map: Record<string, string> = {
    beta_test: "Beta Test",
    pre_launch: "Pre-Launch",
    preview: "Preview",
    live: "Live",
    maintenance: "Maintenance",
  }
  return map[mode] ?? mode
}

function modeBadgeColor(mode: string): string {
  const colors: Record<string, string> = {
    beta_test: "#f97316",
    pre_launch: "#7c3aed",
    preview: "#2563eb",
    live: "#16a34a",
    maintenance: "#dc2626",
  }
  return colors[mode] ?? colors.beta_test
}

// ── Skeleton Card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{ background: "#fff", padding: "14px 16px" }}>
      <div
        style={{
          width: 60,
          height: 8,
          borderRadius: 4,
          background: C.border,
          marginBottom: 10,
        }}
      />
      <div
        style={{
          width: 40,
          height: 22,
          borderRadius: 4,
          background: C.border,
          marginBottom: 8,
        }}
      />
      <div
        style={{
          width: 80,
          height: 8,
          borderRadius: 4,
          background: C.border,
        }}
      />
    </div>
  )
}

// ── Auction type badge ────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    themed: "#1d4ed8",
    highlight: "#92400e",
    clearance: "#166534",
    flash: "#9d174d",
  }
  return <ColorBadge label={blockTypeLabel(type)} color={colors[type] ?? C.text} />
}

// ── Small outlined button ─────────────────────────────────────────────────────

function SmallBtn({
  href,
  label,
  variant = "secondary",
}: {
  href: string
  label: string
  variant?: "primary" | "secondary"
}) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 5,
    cursor: "pointer",
    textDecoration: "none",
    whiteSpace: "nowrap",
    lineHeight: "1.4",
    border: "1px solid",
  }
  const styles: React.CSSProperties =
    variant === "primary"
      ? { ...base, backgroundColor: C.text, borderColor: C.text, color: "#fff" }
      : { ...base, backgroundColor: "#fff", borderColor: C.border, color: C.text }
  return (
    <a href={href} style={styles}>
      {label}
    </a>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

function DashboardPage() {
  useAdminNav()

  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/admin/dashboard", { credentials: "include" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setError(null)
      setLastRefreshed(new Date())
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
    intervalRef.current = setInterval(fetchDashboard, 60000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchDashboard])

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageShell>
        <PageHeader title="Dashboard" subtitle={currentDateLabel()} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 1,
            background: C.border,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div style={{ marginTop: 28 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: 50,
                borderRadius: 6,
                background: C.card,
                marginBottom: 6,
              }}
            />
          ))}
        </div>
      </PageShell>
    )
  }

  // ── Error state ─────────────────────────────────────────────────────────────

  if (error) {
    return (
      <PageShell>
        <PageHeader title="Dashboard" subtitle={currentDateLabel()} />
        <Alert type="error">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Failed to load dashboard</div>
              <div style={{ fontSize: 12, marginTop: 2 }}>{error}</div>
            </div>
            <button
              onClick={() => {
                setLoading(true)
                setError(null)
                fetchDashboard()
              }}
              style={{
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
                background: C.error,
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        </Alert>
      </PageShell>
    )
  }

  if (!data) return null

  const mode = data.platform_mode
  const s = data.stats
  const w = data.weekly

  // ── Determine which stats to show based on mode ─────────────────────────────

  type StatDef = {
    label: string
    value: string | number
    color?: string
    subtitle?: string
  }

  function getStatsForMode(): StatDef[] {
    if (mode === "beta_test") {
      return [
        {
          label: "Overdue Payments",
          value: s.overdue_payments > 0 ? s.overdue_payments : "\u2713",
          color: s.overdue_payments > 0 ? C.error : C.success,
          subtitle: s.overdue_payments > 0 ? "Older than 3 days" : "None overdue",
        },
        {
          label: "Ready to Pack",
          value: s.ready_to_pack,
          color: s.ready_to_pack > 0 ? C.warning : C.success,
          subtitle: "Paid, not started",
        },
        {
          label: "Labels Pending",
          value: s.labels_pending,
          color: s.labels_pending > 0 ? C.purple : C.success,
          subtitle: "In packing, no label",
        },
        {
          label: "Active Auctions",
          value: s.active_auctions,
          color: s.active_auctions > 0 ? C.success : C.muted,
          subtitle: s.active_auctions > 0 ? `${fmtNum(s.active_items)} items live` : "None live",
        },
        {
          label: "Shipped This Week",
          value: w.shipped,
          color: w.shipped > 0 ? C.blue : C.muted,
          subtitle: "Last 7 days",
        },
      ]
    }

    if (mode === "pre_launch") {
      return [
        {
          label: "Waitlist Pending",
          value: s.waitlist.pending || 0,
          color: (s.waitlist.pending || 0) > 0 ? "#ea580c" : C.muted,
          subtitle: "Awaiting review",
        },
        {
          label: "Invited",
          value: s.waitlist.invited || 0,
          color: (s.waitlist.invited || 0) > 0 ? C.blue : C.muted,
          subtitle: "Invite sent",
        },
        {
          label: "Registered",
          value: s.waitlist.registered || 0,
          color: (s.waitlist.registered || 0) > 0 ? C.success : C.muted,
          subtitle: "Account created",
        },
        {
          label: "Active Auctions",
          value: s.active_auctions,
          color: s.active_auctions > 0 ? C.success : C.muted,
          subtitle: s.active_auctions > 0 ? `${fmtNum(s.active_items)} items` : "None",
        },
        {
          label: "New Users",
          value: s.new_users_week,
          color: s.new_users_week > 0 ? C.purple : C.muted,
          subtitle: "This week",
        },
      ]
    }

    // live / preview / maintenance — revenue-focused
    return [
      {
        label: "Revenue",
        value: fmtMoney(w.revenue),
        color: C.gold,
        subtitle: "This week",
      },
      {
        label: "Orders",
        value: w.orders,
        color: w.orders > 0 ? C.success : C.muted,
        subtitle: "This week",
      },
      {
        label: "Active Auctions",
        value: s.active_auctions,
        color: s.active_auctions > 0 ? C.success : C.muted,
        subtitle: `${fmtNum(s.active_items)} items`,
      },
      {
        label: "Bids Today",
        value: s.bids_today,
        color: s.bids_today > 0 ? C.blue : C.muted,
        subtitle: s.top_bid > 0 ? `Top: ${fmtMoney(s.top_bid)}` : "No bids",
      },
      {
        label: "Shipped",
        value: w.shipped,
        color: w.shipped > 0 ? C.blue : C.muted,
        subtitle: "This week",
      },
    ]
  }

  const statCards = getStatsForMode()

  return (
    <PageShell>
      {/* ── Header Row ── */}
      <PageHeader
        title="Dashboard"
        subtitle={currentDateLabel()}
        badge={{ label: modeLabel(mode), color: modeBadgeColor(mode) }}
        actions={
          <span style={{ fontSize: 11, color: C.muted }}>
            Auto-refresh 60s{" \u00B7 "}Last:{" "}
            {lastRefreshed.toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        }
      />

      {/* ── Stats Row ── */}
      <StatsGrid stats={statCards} />

      {/* ── Action Required ── */}
      <SectionHeader title="Action Required" />

      {data.actions.length === 0 ? (
        <Alert type="success" style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>{"\u2713"}</span>
            Nothing needs your attention — all caught up!
          </div>
        </Alert>
      ) : (
        <div>
          {data.actions.map((action, i) => {
            const borderColor =
              action.type === "error"
                ? C.error
                : action.type === "warning"
                  ? C.warning
                  : C.blue
            return (
              <div
                key={i}
                onClick={() => {
                  if (action.link) window.location.href = action.link
                }}
                style={{
                  background: "#fff",
                  borderRadius: 6,
                  padding: "10px 14px",
                  marginBottom: 6,
                  fontSize: 13,
                  color: C.text,
                  cursor: action.link ? "pointer" : "default",
                  borderLeft: `3px solid ${borderColor}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>{action.message}</span>
                {action.link && (
                  <span
                    style={{
                      fontSize: 11,
                      color: C.muted,
                      flexShrink: 0,
                      marginLeft: 12,
                    }}
                  >
                    View {"\u2192"}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Launch Readiness (beta_test only) ── */}
      {mode === "beta_test" && data.launch_readiness && (
        <>
          <SectionHeader title="Launch Readiness" />

          {/* Progress bar */}
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: C.border,
              marginBottom: 14,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: 3,
                background: C.gold,
                width: `${data.launch_readiness.progress_pct}%`,
                transition: "width 0.5s ease",
              }}
            />
          </div>

          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
            {data.launch_readiness.progress_pct}% complete
          </div>

          {/* Checklist */}
          <div>
            {data.launch_readiness.checks.map((check, i) => (
              <div
                key={i}
                style={{
                  fontSize: 13,
                  padding: "8px 0",
                  borderBottom:
                    i < data.launch_readiness!.checks.length - 1
                      ? `1px solid ${C.border}`
                      : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    color: check.ok ? C.success : C.muted,
                    flexShrink: 0,
                    width: 18,
                    textAlign: "center",
                  }}
                >
                  {check.ok ? "\u2713" : "\u2717"}
                </span>
                <span style={{ color: C.text, flex: 1 }}>{check.label}</span>
                <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>
                  {check.detail}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Live Auctions ── */}
      {data.auctions.length > 0 && (
        <>
          <SectionHeader title="Live Auctions" />

          {data.auctions.map((auction) => (
            <div
              key={auction.id}
              style={{
                background: "#fff",
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "14px 18px",
                marginBottom: 8,
              }}
            >
              {/* Top row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                {/* Left: pulse dot + title + badge */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      backgroundColor: C.success,
                      boxShadow: `0 0 0 3px rgba(22, 163, 74, 0.2)`,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: C.text,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {auction.title}
                  </span>
                  <TypeBadge type={auction.type} />
                </div>

                {/* Right: stats */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    fontSize: 12,
                    color: C.muted,
                    flexShrink: 0,
                  }}
                >
                  <span>Ends {fmtDate(auction.ends_at)}</span>
                  <span>
                    {fmtNum(auction.item_count)} item{auction.item_count !== 1 ? "s" : ""}
                  </span>
                  <span>
                    {fmtNum(auction.bid_count)} bid{auction.bid_count !== 1 ? "s" : ""}
                  </span>
                  <span style={{ fontWeight: 600, color: C.gold }}>
                    Top: {fmtMoney(auction.top_bid)}
                  </span>
                </div>
              </div>

              {/* Bottom row: buttons */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 10,
                  justifyContent: "flex-end",
                }}
              >
                <SmallBtn
                  href={`/app/auction-blocks/${auction.id}`}
                  label="Live Monitor \u2192"
                />
                <SmallBtn
                  href="/app/auction-blocks"
                  label="Manage \u2192"
                  variant="primary"
                />
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── Recent Activity ── */}
      {data.activity.length > 0 && (
        <>
          <SectionHeader title="Recent Activity" />

          <div>
            {data.activity.slice(0, 10).map((event, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 0",
                  borderBottom:
                    i < Math.min(data.activity.length, 10) - 1
                      ? `1px solid ${C.border}`
                      : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                }}
              >
                {/* Dot */}
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: event.type === "bid" ? C.blue : C.success,
                    flexShrink: 0,
                  }}
                />

                {/* Message */}
                <span style={{ flex: 1, color: C.text }}>{event.message}</span>

                {/* Relative time */}
                <span
                  style={{
                    fontSize: 11,
                    color: C.muted,
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  {relativeTime(event.time)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Catalog Health (beta_test only) ── */}
      {mode === "beta_test" && (
        <>
          <SectionHeader title="Catalog Health" />

          <StatsGrid
            stats={[
              { label: "Releases", value: fmtNum(s.releases), subtitle: "97% images" },
              { label: "Band Lit", value: fmtNum(s.band_lit), subtitle: "93% images" },
              { label: "Label Lit", value: fmtNum(s.label_lit), subtitle: "95% images" },
              { label: "Press Lit", value: fmtNum(s.press_lit), subtitle: "94% images" },
            ]}
          />

          <div style={{ fontSize: 11, color: C.muted, marginTop: -12 }}>
            {fmtNum(s.for_sale)} for sale ({s.cover_pct}% with cover)
            {data.last_sync && (
              <span>
                {" \u00B7 "}Last sync: {fmtDate(data.last_sync)}
              </span>
            )}
          </div>
        </>
      )}

      {/* ── Weekly Summary Footer ── */}
      <div
        style={{
          background: C.card,
          borderRadius: 8,
          padding: "12px 18px",
          marginTop: 20,
          fontSize: 13,
          color: C.muted,
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <span>This week:</span>
        <strong style={{ color: C.text }}>{fmtMoney(w.revenue)}</strong>
        <span>revenue</span>
        <span>{"\u00B7"}</span>
        <strong style={{ color: C.text }}>{w.orders}</strong>
        <span>order{w.orders !== 1 ? "s" : ""}</span>
        <span>{"\u00B7"}</span>
        <strong style={{ color: C.text }}>{w.shipped}</strong>
        <span>shipped</span>
        <span>{"\u00B7"}</span>
        <strong style={{ color: C.text }}>{w.pending}</strong>
        <span>pending</span>
      </div>
    </PageShell>
  )
}

// ── Route Config ──────────────────────────────────────────────────────────────

export const config = defineRouteConfig({
  label: "Dashboard",
  icon: House,
  rank: 0,
})

export default DashboardPage
