import { defineRouteConfig } from "@medusajs/admin-sdk"
import { House } from "@medusajs/icons"
import { useAdminNav } from "../../components/admin-nav"
import { useEffect, useState, useCallback, useRef } from "react"

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

// ── Color Palette ─────────────────────────────────────────────────────────────

const C = {
  bg: "transparent",
  card: "#f8f7f6",
  text: "#1a1714",
  muted: "#78716c",
  gold: "#b8860b",
  border: "#e7e5e4",
  hover: "#f5f4f3",
  success: "#16a34a",
  error: "#dc2626",
  blue: "#2563eb",
  purple: "#7c3aed",
  warning: "#d97706",
  orange: "#ea580c",
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtMoney(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value)
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtNum(n: number): string {
  return n.toLocaleString("de-DE")
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  return `${days} days ago`
}

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

// ── Platform mode badge ───────────────────────────────────────────────────────

function modeBadgeStyle(mode: string): React.CSSProperties {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    beta_test: { bg: "#fef3c7", text: "#92400e", border: "#fbbf24" },
    pre_launch: { bg: "#ede9fe", text: "#5b21b6", border: "#a78bfa" },
    preview: { bg: "#e0f2fe", text: "#075985", border: "#7dd3fc" },
    live: { bg: "#dcfce7", text: "#166534", border: "#4ade80" },
    maintenance: { bg: "#fee2e2", text: "#991b1b", border: "#f87171" },
  }
  const c = colors[mode] ?? colors.beta_test
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 12px",
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 20,
    backgroundColor: c.bg,
    color: c.text,
    border: `1px solid ${c.border}`,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  }
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

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  dotColor,
  label,
  value,
  valueColor,
  sub,
}: {
  dotColor: string
  label: string
  value: string | number
  valueColor?: string
  sub?: string
}) {
  return (
    <div style={{ background: "#fff", padding: "14px 16px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: dotColor,
            flexShrink: 0,
          }}
        />
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: C.muted,
          }}
        >
          {label}
        </div>
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: valueColor || C.text,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: C.muted,
        marginBottom: 10,
        marginTop: 28,
      }}
    >
      {children}
    </div>
  )
}

// ── Auction type badge ────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    themed: { bg: "#eff6ff", text: "#1d4ed8" },
    highlight: { bg: "#fef3c7", text: "#92400e" },
    clearance: { bg: "#f0fdf4", text: "#166534" },
    flash: { bg: "#fdf2f8", text: "#9d174d" },
  }
  const c = colors[type] ?? { bg: C.card, text: C.text }
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: c.bg,
        color: c.text,
      }}
    >
      {blockTypeLabel(type)}
    </span>
  )
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

  // ── Page wrapper style ──────────────────────────────────────────────────────

  const pageStyle: React.CSSProperties = {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
    backgroundColor: C.bg,
    minHeight: "100vh",
    padding: "20px 16px 48px",
    color: C.text,
  }

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={pageStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: C.text,
                margin: 0,
              }}
            >
              Dashboard
            </h1>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
              {currentDateLabel()}
            </div>
          </div>
        </div>
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
      </div>
    )
  }

  // ── Error state ─────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div style={pageStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: C.text,
                margin: 0,
              }}
            >
              Dashboard
            </h1>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
              {currentDateLabel()}
            </div>
          </div>
        </div>
        <div
          style={{
            background: "#fef2f2",
            border: `1px solid #fecaca`,
            borderRadius: 8,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: C.error, fontSize: 14 }}>
              Failed to load dashboard
            </div>
            <div style={{ fontSize: 12, color: "#991b1b", marginTop: 2 }}>
              {error}
            </div>
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
      </div>
    )
  }

  if (!data) return null

  const mode = data.platform_mode
  const s = data.stats
  const w = data.weekly

  // ── Determine which stats to show based on mode ─────────────────────────────

  type StatDef = {
    dotColor: string
    label: string
    value: string | number
    valueColor?: string
    sub?: string
  }

  function getStatsForMode(): StatDef[] {
    if (mode === "beta_test") {
      return [
        {
          dotColor: s.overdue_payments > 0 ? C.error : C.success,
          label: "Overdue Payments",
          value: s.overdue_payments > 0 ? s.overdue_payments : "\u2713",
          valueColor: s.overdue_payments > 0 ? C.error : C.success,
          sub: s.overdue_payments > 0 ? "Older than 3 days" : "None overdue",
        },
        {
          dotColor: s.ready_to_pack > 0 ? C.warning : C.success,
          label: "Ready to Pack",
          value: s.ready_to_pack,
          valueColor: s.ready_to_pack > 0 ? C.warning : C.success,
          sub: "Paid, not started",
        },
        {
          dotColor: s.labels_pending > 0 ? C.purple : C.success,
          label: "Labels Pending",
          value: s.labels_pending,
          valueColor: s.labels_pending > 0 ? C.purple : C.success,
          sub: "In packing, no label",
        },
        {
          dotColor: s.active_auctions > 0 ? C.success : C.muted,
          label: "Active Auctions",
          value: s.active_auctions,
          valueColor: s.active_auctions > 0 ? C.success : C.muted,
          sub: s.active_auctions > 0 ? `${fmtNum(s.active_items)} items live` : "None live",
        },
        {
          dotColor: w.shipped > 0 ? C.blue : C.muted,
          label: "Shipped This Week",
          value: w.shipped,
          valueColor: w.shipped > 0 ? C.blue : C.muted,
          sub: "Last 7 days",
        },
      ]
    }

    if (mode === "pre_launch") {
      return [
        {
          dotColor: (s.waitlist.pending || 0) > 0 ? C.orange : C.muted,
          label: "Waitlist Pending",
          value: s.waitlist.pending || 0,
          valueColor: (s.waitlist.pending || 0) > 0 ? C.orange : C.muted,
          sub: "Awaiting review",
        },
        {
          dotColor: (s.waitlist.invited || 0) > 0 ? C.blue : C.muted,
          label: "Invited",
          value: s.waitlist.invited || 0,
          valueColor: (s.waitlist.invited || 0) > 0 ? C.blue : C.muted,
          sub: "Invite sent",
        },
        {
          dotColor: (s.waitlist.registered || 0) > 0 ? C.success : C.muted,
          label: "Registered",
          value: s.waitlist.registered || 0,
          valueColor: (s.waitlist.registered || 0) > 0 ? C.success : C.muted,
          sub: "Account created",
        },
        {
          dotColor: s.active_auctions > 0 ? C.success : C.muted,
          label: "Active Auctions",
          value: s.active_auctions,
          valueColor: s.active_auctions > 0 ? C.success : C.muted,
          sub: s.active_auctions > 0 ? `${fmtNum(s.active_items)} items` : "None",
        },
        {
          dotColor: s.new_users_week > 0 ? C.purple : C.muted,
          label: "New Users",
          value: s.new_users_week,
          valueColor: s.new_users_week > 0 ? C.purple : C.muted,
          sub: "This week",
        },
      ]
    }

    // live / preview / maintenance — revenue-focused
    return [
      {
        dotColor: w.revenue > 0 ? C.gold : C.muted,
        label: "Revenue",
        value: fmtMoney(w.revenue),
        valueColor: C.gold,
        sub: "This week",
      },
      {
        dotColor: w.orders > 0 ? C.success : C.muted,
        label: "Orders",
        value: w.orders,
        valueColor: w.orders > 0 ? C.success : C.muted,
        sub: "This week",
      },
      {
        dotColor: s.active_auctions > 0 ? C.success : C.muted,
        label: "Active Auctions",
        value: s.active_auctions,
        valueColor: s.active_auctions > 0 ? C.success : C.muted,
        sub: `${fmtNum(s.active_items)} items`,
      },
      {
        dotColor: s.bids_today > 0 ? C.blue : C.muted,
        label: "Bids Today",
        value: s.bids_today,
        valueColor: s.bids_today > 0 ? C.blue : C.muted,
        sub: s.top_bid > 0 ? `Top: ${fmtMoney(s.top_bid)}` : "No bids",
      },
      {
        dotColor: w.shipped > 0 ? C.blue : C.muted,
        label: "Shipped",
        value: w.shipped,
        valueColor: w.shipped > 0 ? C.blue : C.muted,
        sub: "This week",
      },
    ]
  }

  const statCards = getStatsForMode()

  return (
    <div style={pageStyle}>
      {/* ── Header Row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.2 }}>
            Dashboard
          </h1>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
            {currentDateLabel()}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={modeBadgeStyle(mode)}>{modeLabel(mode)}</span>
          <span style={{ fontSize: 11, color: C.muted }}>
            Auto-refresh 60s{" \u00B7 "}Last:{" "}
            {lastRefreshed.toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 1,
          background: C.border,
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 0,
        }}
      >
        {statCards.map((card, i) => (
          <StatCard
            key={i}
            dotColor={card.dotColor}
            label={card.label}
            value={card.value}
            valueColor={card.valueColor}
            sub={card.sub}
          />
        ))}
      </div>

      {/* ── Action Required ── */}
      <SectionHeader>Action Required</SectionHeader>

      {data.actions.length === 0 ? (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 8,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
            color: C.success,
            fontWeight: 500,
          }}
        >
          <span style={{ fontSize: 16 }}>{"\u2713"}</span>
          Nothing needs your attention — all caught up!
        </div>
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
          <SectionHeader>Launch Readiness</SectionHeader>

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
          <SectionHeader>Live Auctions</SectionHeader>

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
          <SectionHeader>Recent Activity</SectionHeader>

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
          <SectionHeader>Catalog Health</SectionHeader>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 1,
              background: C.border,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {[
              { label: "Releases", count: s.releases, pct: 97 },
              { label: "Band Lit", count: s.band_lit, pct: 93 },
              { label: "Label Lit", count: s.label_lit, pct: 95 },
              { label: "Press Lit", count: s.press_lit, pct: 94 },
            ].map((cat) => (
              <div
                key={cat.label}
                style={{ background: "#fff", padding: "14px 16px" }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: C.muted,
                    marginBottom: 6,
                  }}
                >
                  {cat.label}
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: C.text,
                    lineHeight: 1,
                  }}
                >
                  {fmtNum(cat.count)}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                  {cat.pct}% images
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
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
    </div>
  )
}

// ── Route Config ──────────────────────────────────────────────────────────────

export const config = defineRouteConfig({
  label: "Dashboard",
  icon: House,
  rank: 0,
})

export default DashboardPage
