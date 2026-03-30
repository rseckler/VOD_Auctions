import { defineRouteConfig } from "@medusajs/admin-sdk"
import { House } from "@medusajs/icons"
import { useAdminNav } from "../../components/admin-nav"
import { useEffect, useState, useCallback, useRef } from "react"

// ── Types ──────────────────────────────────────────────────────────────────────

type Transaction = {
  id: string
  order_number: string | null
  user_id: string
  block_item_id: string | null
  release_id: string | null
  item_type: string
  order_group_id: string | null
  amount: number
  shipping_cost: number
  total_amount: number
  status: string
  fulfillment_status: string
  payment_provider: string
  label_printed_at: string | null
  paid_at: string | null
  shipped_at: string | null
  created_at: string
  release_title: string | null
  release_artist: string | null
  lot_number: number | null
  block_title: string | null
  customer_name: string | null
  customer_email: string | null
  shipping_country: string | null
}

type AuctionBlock = {
  id: string
  title: string
  subtitle: string | null
  slug: string
  status: string
  block_type: string
  start_time: string
  end_time: string
  items?: { id: string }[]
  created_at: string
}

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtMoney(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value)
}

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtStartTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function currentDateLabel(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function daysSince(iso: string): number {
  const diff = Date.now() - new Date(iso).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function sevenDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString()
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

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  page: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
    backgroundColor: "#f9fafb",
    minHeight: "100vh",
    padding: "20px 16px 48px",
    color: "#111827",
  } as React.CSSProperties,

  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "12px",
    marginBottom: "24px",
  } as React.CSSProperties,

  title: {
    fontSize: "24px",
    fontWeight: 700,
    color: "#111827",
    margin: 0,
    lineHeight: "1.2",
  } as React.CSSProperties,

  subtitle: {
    fontSize: "13px",
    color: "#6b7280",
    marginTop: "4px",
  } as React.CSSProperties,

  refreshLabel: {
    fontSize: "11px",
    color: "#9ca3af",
    paddingTop: "4px",
  } as React.CSSProperties,

  kpiBar: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "12px",
    marginBottom: "28px",
  } as React.CSSProperties,

  kpiCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    padding: "16px 18px",
  } as React.CSSProperties,

  kpiLabel: {
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    color: "#6b7280",
    marginBottom: "6px",
  } as React.CSSProperties,

  kpiValue: (color: string): React.CSSProperties => ({
    fontSize: "26px",
    fontWeight: 700,
    color,
    lineHeight: "1",
  }),

  kpiSub: {
    fontSize: "11px",
    color: "#9ca3af",
    marginTop: "4px",
  } as React.CSSProperties,

  sectionLabel: {
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "#9ca3af",
    marginBottom: "10px",
    marginTop: "28px",
  } as React.CSSProperties,

  card: {
    backgroundColor: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    padding: "16px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    marginBottom: "8px",
  } as React.CSSProperties,

  cardLeft: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,

  dot: (color: string): React.CSSProperties => ({
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    backgroundColor: color,
    flexShrink: 0,
  }),

  cardTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#111827",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  } as React.CSSProperties,

  cardDesc: {
    fontSize: "12px",
    color: "#6b7280",
    marginTop: "2px",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  } as React.CSSProperties,

  cardButtons: {
    display: "flex",
    gap: "8px",
    flexShrink: 0,
    flexWrap: "wrap",
  } as React.CSSProperties,

  btn: (variant: "primary" | "secondary"): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 14px",
    fontSize: "12px",
    fontWeight: 600,
    borderRadius: "6px",
    border: "1px solid",
    cursor: "pointer",
    textDecoration: "none",
    whiteSpace: "nowrap" as const,
    lineHeight: "1.4",
    ...(variant === "primary"
      ? {
          backgroundColor: "#111827",
          borderColor: "#111827",
          color: "#ffffff",
        }
      : {
          backgroundColor: "#ffffff",
          borderColor: "#d1d5db",
          color: "#374151",
        }),
  }),

  emptyCard: {
    backgroundColor: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "10px",
    padding: "18px 20px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    color: "#16a34a",
    fontSize: "14px",
    fontWeight: 500,
    marginBottom: "8px",
  } as React.CSSProperties,

  typeBadge: (type: string): React.CSSProperties => {
    const colors: Record<string, { bg: string; text: string }> = {
      themed:    { bg: "#eff6ff", text: "#1d4ed8" },
      highlight: { bg: "#fef3c7", text: "#92400e" },
      clearance: { bg: "#f0fdf4", text: "#166534" },
      flash:     { bg: "#fdf2f8", text: "#9d174d" },
    }
    const c = colors[type] ?? { bg: "#f3f4f6", text: "#374151" }
    return {
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: "4px",
      fontSize: "11px",
      fontWeight: 600,
      backgroundColor: c.bg,
      color: c.text,
    }
  },

  statsBar: {
    borderTop: "1px solid #e5e7eb",
    marginTop: "32px",
    paddingTop: "14px",
    fontSize: "12px",
    color: "#9ca3af",
    display: "flex",
    gap: "6px",
    flexWrap: "wrap" as const,
  } as React.CSSProperties,

  loading: {
    color: "#9ca3af",
    fontSize: "14px",
    padding: "40px 0",
    textAlign: "center" as const,
  } as React.CSSProperties,
}

// ── Button helper (renders an anchor styled as button) ─────────────────────────

function ActionBtn({
  href,
  label,
  variant = "secondary",
}: {
  href: string
  label: string
  variant?: "primary" | "secondary"
}) {
  return (
    <a href={href} style={S.btn(variant)}>
      {label}
    </a>
  )
}

// ── KPI Card ───────────────────────────────────────────────────────────────────

function KpiCard({
  emoji,
  label,
  value,
  color,
  sub,
}: {
  emoji: string
  label: string
  value: string | number
  color: string
  sub?: string
}) {
  return (
    <div style={S.kpiCard}>
      <div style={S.kpiLabel}>
        {emoji} {label}
      </div>
      <div style={S.kpiValue(color)}>{value}</div>
      {sub && <div style={S.kpiSub}>{sub}</div>}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

function DashboardPage() {
  useAdminNav()

  const [loading, setLoading] = useState(true)
  const [pendingTx, setPendingTx] = useState<Transaction[]>([])
  const [unfulfilledTx, setUnfulfilledTx] = useState<Transaction[]>([])
  const [packingTx, setPackingTx] = useState<Transaction[]>([])
  const [blocks, setBlocks] = useState<AuctionBlock[]>([])
  const [weekTx, setWeekTx] = useState<Transaction[]>([])
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [cancelling, setCancelling] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAll = useCallback(async () => {
    const weekFrom = sevenDaysAgo()

    const [r1, r2, r3, r4, r5] = await Promise.allSettled([
      fetch("/admin/transactions?status=pending&limit=50", { credentials: "include" }).then((r) => r.json()),
      fetch("/admin/transactions?status=paid&fulfillment_status=unfulfilled&limit=50", { credentials: "include" }).then((r) => r.json()),
      fetch("/admin/transactions?status=paid&fulfillment_status=packing&limit=50", { credentials: "include" }).then((r) => r.json()),
      fetch("/admin/auction-blocks?limit=20", { credentials: "include" }).then((r) => r.json()),
      fetch(`/admin/transactions?date_from=${encodeURIComponent(weekFrom)}&limit=200`, { credentials: "include" }).then((r) => r.json()),
    ])

    if (r1.status === "fulfilled") setPendingTx(r1.value.transactions ?? [])
    if (r2.status === "fulfilled") setUnfulfilledTx(r2.value.transactions ?? [])
    if (r3.status === "fulfilled") setPackingTx(r3.value.transactions ?? [])
    if (r4.status === "fulfilled") setBlocks(r4.value.auction_blocks ?? [])
    if (r5.status === "fulfilled") setWeekTx(r5.value.transactions ?? [])

    setLastRefreshed(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    intervalRef.current = setInterval(fetchAll, 60000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchAll])

  const cancelTransaction = async (id: string) => {
    if (!window.confirm("Cancel this order? The release will be set back to available.")) return
    setCancelling(id)
    try {
      const res = await fetch(`/admin/transactions/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", reason: "No payment received" }),
      })
      if (res.ok) {
        setPendingTx(prev => prev.filter(tx => tx.id !== id))
      } else {
        const data = await res.json().catch(() => ({}))
        alert(`Cancel failed: ${data.message || "Unknown error"}`)
      }
    } catch {
      alert("Cancel failed. Check console.")
    } finally {
      setCancelling(null)
    }
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const overdueTx = pendingTx.filter((tx) => daysSince(tx.created_at) >= 3)
  const labelsPendingTx = packingTx.filter((tx) => !tx.label_printed_at)

  const activeBlocks = blocks.filter((b) => b.status === "active")
  const upcomingBlocks = blocks
    .filter((b) => b.status === "scheduled" || b.status === "preview")
    .slice(0, 3)

  const weekShipped = weekTx.filter((tx) => tx.fulfillment_status === "shipped").length
  const weekRevenue = weekTx
    .filter((tx) => tx.status === "paid")
    .reduce((sum, tx) => sum + Number(tx.total_amount ?? 0), 0)
  const weekOrders = weekTx.filter((tx) => tx.status === "paid").length
  const weekPending = weekTx.filter((tx) => tx.status === "pending").length

  // ── To-Do queue items ───────────────────────────────────────────────────────

  const hasActions =
    overdueTx.length > 0 || unfulfilledTx.length > 0 || labelsPendingTx.length > 0

  if (loading) {
    return (
      <div style={S.page}>
        <div style={S.loading}>Loading dashboard…</div>
      </div>
    )
  }

  return (
    <div style={S.page}>
      {/* ── Header ── */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Dashboard</h1>
          <div style={S.subtitle}>VOD Records Admin · {currentDateLabel()}</div>
        </div>
        <div style={S.refreshLabel}>
          Auto-refresh 60s · Last:{" "}
          {lastRefreshed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>
      </div>

      {/* ── KPI Bar ── */}
      <div style={S.kpiBar}>
        <KpiCard
          emoji="🔴"
          label="Unpaid Overdue"
          value={overdueTx.length > 0 ? overdueTx.length : "✓"}
          color={overdueTx.length > 0 ? "#dc2626" : "#16a34a"}
          sub={overdueTx.length > 0 ? "Older than 3 days" : "None overdue"}
        />
        <KpiCard
          emoji="📦"
          label="Ready to Pack"
          value={unfulfilledTx.length}
          color={unfulfilledTx.length > 0 ? "#b45309" : "#16a34a"}
          sub="Paid · not started"
        />
        <KpiCard
          emoji="🏷️"
          label="Labels Pending"
          value={labelsPendingTx.length}
          color={labelsPendingTx.length > 0 ? "#6366f1" : "#16a34a"}
          sub="In packing · no label"
        />
        <KpiCard
          emoji="🟢"
          label="Active Auctions"
          value={activeBlocks.length}
          color={activeBlocks.length > 0 ? "#059669" : "#6b7280"}
          sub={activeBlocks.length > 0 ? "Live right now" : "None live"}
        />
        <KpiCard
          emoji="📬"
          label="Shipped This Week"
          value={weekShipped}
          color={weekShipped > 0 ? "#2563eb" : "#6b7280"}
          sub="Last 7 days"
        />
      </div>

      {/* ── To-Do Queue ── */}
      <div style={S.sectionLabel}>ACTION REQUIRED</div>

      {!hasActions && (
        <div style={S.emptyCard}>
          <span style={{ fontSize: "18px" }}>✓</span>
          <span>Nothing needs your attention right now — all caught up!</span>
        </div>
      )}

      {/* Overdue payments — max 5 shown, then "+N more" */}
      {overdueTx.length > 0 && (() => {
        const shown = overdueTx.slice(0, 5)
        const more = overdueTx.length - shown.length
        return (
          <>
            {shown.map((tx) => {
              const days = daysSince(tx.created_at)
              return (
                <div key={tx.id} style={S.card}>
                  <div style={S.cardLeft}>
                    <div style={S.dot("#dc2626")} />
                    <div style={{ minWidth: 0 }}>
                      <div style={S.cardTitle}>
                        ⚠️ Overdue Payment · {days} {days === 1 ? "day" : "days"} ago
                      </div>
                      <div style={S.cardDesc}>
                        {tx.lot_number != null ? `Lot #${tx.lot_number} ` : ""}
                        {tx.release_title ?? "—"}
                        {tx.customer_name ? ` | ${tx.customer_name}` : ""}
                        {` | ${fmtMoney(Number(tx.total_amount ?? 0))}`}
                        {tx.order_number ? ` | ${tx.order_number}` : ""}
                      </div>
                    </div>
                  </div>
                  <div style={S.cardButtons}>
                    <ActionBtn href={`/app/transactions/${tx.id}`} label="View Order →" variant="primary" />
                    <button
                      onClick={() => cancelTransaction(tx.id)}
                      disabled={cancelling === tx.id}
                      style={{
                        padding: "5px 12px", fontSize: 12, fontWeight: 500, borderRadius: 6,
                        background: "#fff", color: "#6b7280",
                        border: "1px solid #e5e7eb", cursor: "pointer",
                      }}
                    >
                      {cancelling === tx.id ? "…" : "Cancel Order"}
                    </button>
                  </div>
                </div>
              )
            })}
            {more > 0 && (
              <div style={{ ...S.card, backgroundColor: "#fff7ed", borderColor: "#fed7aa" }}>
                <div style={S.cardLeft}>
                  <div style={S.dot("#f97316")} />
                  <div style={{ ...S.cardTitle, color: "#c2410c" }}>
                    +{more} more overdue {more === 1 ? "payment" : "payments"}
                  </div>
                </div>
                <div style={S.cardButtons}>
                  <ActionBtn href="/app/transactions" label="View All →" />
                </div>
              </div>
            )}
          </>
        )
      })()}

      {/* Ready to pack */}
      {unfulfilledTx.length > 0 && (
        <div style={{ ...S.card, borderLeftColor: "#f59e0b", borderLeftWidth: "3px" }}>
          <div style={S.cardLeft}>
            <div style={S.dot("#f59e0b")} />
            <div style={{ minWidth: 0 }}>
              <div style={S.cardTitle}>
                📦 {unfulfilledTx.length} {unfulfilledTx.length === 1 ? "order" : "orders"} ready to pack
              </div>
              <div style={S.cardDesc}>Payment received, not yet started</div>
            </div>
          </div>
          <div style={S.cardButtons}>
            <ActionBtn href="/app/transactions" label="Go to Orders →" variant="primary" />
          </div>
        </div>
      )}

      {/* Labels not printed */}
      {labelsPendingTx.length > 0 && (
        <div style={{ ...S.card, borderLeftColor: "#6366f1", borderLeftWidth: "3px" }}>
          <div style={S.cardLeft}>
            <div style={S.dot("#6366f1")} />
            <div style={{ minWidth: 0 }}>
              <div style={S.cardTitle}>
                🏷️ {labelsPendingTx.length} packing {labelsPendingTx.length === 1 ? "order needs a" : "orders need"} shipping label{labelsPendingTx.length > 1 ? "s" : ""} printed
              </div>
              <div style={S.cardDesc}>In packing · label not yet generated</div>
            </div>
          </div>
          <div style={S.cardButtons}>
            <ActionBtn href="/app/transactions" label="View →" variant="primary" />
          </div>
        </div>
      )}

      {/* ── Active Auctions ── */}
      {activeBlocks.length > 0 && (
        <>
          <div style={S.sectionLabel}>LIVE NOW</div>
          {activeBlocks.map((block) => (
            <div key={block.id} style={S.card}>
              <div style={S.cardLeft}>
                <div style={S.dot("#059669")} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <div style={S.cardTitle}>{block.title}</div>
                    <span style={S.typeBadge(block.block_type)}>{blockTypeLabel(block.block_type)}</span>
                  </div>
                  <div style={S.cardDesc}>
                    Ends {block.end_time ? fmtDatetime(block.end_time) : "—"}
                    {block.items ? ` · ${block.items.length} items` : ""}
                  </div>
                </div>
              </div>
              <div style={S.cardButtons}>
                <ActionBtn href="/app/live-monitor" label="Live Monitor →" />
                <ActionBtn href={`/app/auction-blocks/${block.id}`} label="Manage →" variant="primary" />
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── Upcoming Blocks ── */}
      {upcomingBlocks.length > 0 && (
        <>
          <div style={S.sectionLabel}>COMING SOON</div>
          {upcomingBlocks.map((block) => (
            <div key={block.id} style={S.card}>
              <div style={S.cardLeft}>
                <div style={S.dot("#6b7280")} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <div style={S.cardTitle}>{block.title}</div>
                    <span style={S.typeBadge(block.block_type)}>{blockTypeLabel(block.block_type)}</span>
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        backgroundColor: block.status === "preview" ? "#fff7ed" : "#eff6ff",
                        color: block.status === "preview" ? "#92400e" : "#1d4ed8",
                        fontWeight: 600,
                      }}
                    >
                      {block.status === "preview" ? "Preview" : "Scheduled"}
                    </span>
                  </div>
                  <div style={S.cardDesc}>
                    Starts {block.start_time ? fmtStartTime(block.start_time) : "—"}
                    {block.items ? ` · ${block.items.length} items` : ""}
                  </div>
                </div>
              </div>
              <div style={S.cardButtons}>
                <ActionBtn href={`/app/auction-blocks/${block.id}`} label="Edit →" />
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── This Week Stats Bar ── */}
      <div style={S.statsBar}>
        <span>This week:</span>
        <strong style={{ color: "#374151" }}>{fmtMoney(weekRevenue)}</strong>
        <span>revenue</span>
        <span>·</span>
        <strong style={{ color: "#374151" }}>{weekOrders}</strong>
        <span>{weekOrders === 1 ? "order" : "orders"}</span>
        <span>·</span>
        <strong style={{ color: "#374151" }}>{weekShipped}</strong>
        <span>shipped</span>
        <span>·</span>
        <strong style={{ color: "#374151" }}>{weekPending}</strong>
        <span>pending</span>
      </div>
    </div>
  )
}

// ── Route Config ───────────────────────────────────────────────────────────────

export const config = defineRouteConfig({
  label: "Dashboard",
  icon: House,
  rank: 0,
})

export default DashboardPage
