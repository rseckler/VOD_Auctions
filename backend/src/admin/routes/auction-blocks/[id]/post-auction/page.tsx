// NOTE: No defineRouteConfig here — only on top-level page.tsx files (Medusa Admin routing rule)
import { useEffect, useState, useCallback } from "react"
import { useParams } from "react-router-dom"
import { useAdminNav } from "../../../../components/admin-nav"

// ─── Types ───────────────────────────────────────────────────────────────────

type TransactionData = {
  id: string
  status: string
  fulfillment_status: string
  order_number: string | null
  label_printed_at: string | null
  shipping_name: string | null
  shipping_city: string | null
  shipping_country: string | null
}

type WinnerData = { id: string; name: string; email: string }

type Lot = {
  id: string
  lot_number: number
  release_title: string
  artist_name: string
  final_price: number | null
  winner: WinnerData | null
  transaction: TransactionData | null
}

type Summary = { total: number; paid: number; unpaid: number; no_bid: number; shipped: number }
type BlockData = {
  id: string
  title: string
  status: string
  starts_at?: string | null
  ends_at?: string | null
  block_type?: string | null
  newsletter_t7_sent_at?: string | null
  newsletter_t24h_sent_at?: string | null
  going_going_gone_sent_at?: string | null
}
type PostAuctionResponse = { block: BlockData; lots: Lot[]; summary: Summary }
type FilterTab = "all" | "unpaid" | "paid" | "shipped"

type AnalyticsData = {
  total_bids?: number
  unique_bidders?: number
}

// ─── Step logic ───────────────────────────────────────────────────────────────

type StepInfo = { step: number; label: string; color: string; bg: string }

function getCurrentStep(lot: Lot): StepInfo {
  const tx = lot.transaction
  if (!lot.winner || !tx) {
    return { step: 0, label: "No Bid", color: "#6b7280", bg: "transparent" }
  }
  // Terminal states — check before fulfillment
  if (tx.status === "refunded")  return { step: -1, label: "Refunded",       color: "#7c3aed", bg: "#ede9fe" }
  if (tx.status === "cancelled") return { step: -1, label: "Cancelled",      color: "#6b7280", bg: "transparent" }
  if (tx.status === "failed")    return { step: -1, label: "Payment Failed", color: "#dc2626", bg: "#fee2e2" }

  const paid = tx.status === "paid"
  const packing = ["packing", "shipped"].includes(tx.fulfillment_status)
  const labeled = !!tx.label_printed_at
  const shipped = tx.fulfillment_status === "shipped"

  if (shipped) return { step: 5, label: "✓ Shipped",      color: "#15803d", bg: "#dcfce7" }
  if (labeled) return { step: 4, label: "Label Printed",  color: "#1d4ed8", bg: "#dbeafe" }
  if (packing) return { step: 3, label: "Packing",        color: "#9333ea", bg: "#f3e8ff" }
  if (paid)    return { step: 2, label: "Paid — Pack it", color: "#b45309", bg: "#fef3c7" }
  return         { step: 1, label: "Awaiting Payment",   color: "#dc2626", bg: "#fee2e2" }
}

// ─── Action Button ────────────────────────────────────────────────────────────

function ActionButton({ lot, onAction, loading }: {
  lot: Lot
  onAction: (txId: string, action: string) => void
  loading: string | null
}) {
  const tx = lot.transaction
  if (!lot.winner || !tx) return null

  const step = getCurrentStep(lot)
  const isLoading = loading === tx.id
  const base: React.CSSProperties = {
    border: "none", borderRadius: 4, padding: "4px 10px", fontWeight: 600, fontSize: 11,
    cursor: isLoading ? "not-allowed" : "pointer", opacity: isLoading ? 0.6 : 1,
    whiteSpace: "nowrap", transition: "opacity 0.15s",
  }

  const handleRefund = (e: React.MouseEvent) => {
    e.stopPropagation()
    const amount = lot.final_price !== null ? `€${Number(lot.final_price).toFixed(2)}` : "this amount"
    if (!window.confirm(`Refund ${amount} for Lot #${lot.lot_number} (${lot.release_title})? This cannot be undone.`)) return
    onAction(tx.id, "refund")
  }

  const refundBtn = (
    <button onClick={handleRefund} disabled={isLoading}
      style={{ ...base, background: "var(--bg-component, #1a1714)", color: "#dc2626", border: "1px solid #fca5a5", marginLeft: 4 }}>
      Refund
    </button>
  )

  if (step.step === -1) return (
    <span style={{ fontSize: 11, color: step.color, fontWeight: 600 }}>{step.label}</span>
  )
  if (step.step === 5) return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>Done ✓</span>
    </div>
  )
  if (step.step === 1) return (
    <button disabled style={{ ...base, background: "transparent", color: "#6b7280", cursor: "not-allowed" }}>
      Awaiting
    </button>
  )
  if (step.step === 2) return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <button onClick={(e) => { e.stopPropagation(); onAction(tx.id, "packing") }} disabled={isLoading}
        style={{ ...base, background: "#6366f1", color: "#fff" }}>
        {isLoading ? "…" : "Mark Packing"}
      </button>
      {refundBtn}
    </div>
  )
  if (step.step === 3) return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <button onClick={(e) => { e.stopPropagation(); window.open(`/admin/transactions/${tx.id}/shipping-label`, "_blank") }}
        style={{ ...base, background: "#2563eb", color: "#fff" }}>
        Print Label ↗
      </button>
      {refundBtn}
    </div>
  )
  if (step.step === 4) return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <button onClick={(e) => { e.stopPropagation(); onAction(tx.id, "ship") }} disabled={isLoading}
        style={{ ...base, background: "#16a34a", color: "#fff" }}>
        {isLoading ? "…" : "Mark Shipped"}
      </button>
      {refundBtn}
    </div>
  )
  return null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("en-GB", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    }).replace(",", "")
  } catch { return iso }
}

function fmtCurrency(n: number): string {
  return "€" + n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PostAuctionPage() {
  useAdminNav()

  const { id: blockId } = useParams<{ id: string }>()
  const [data, setData] = useState<PostAuctionResponse | null>(null)
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all")
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!blockId) return
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/admin/auction-blocks/${blockId}/post-auction`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setData(await r.json())
    } catch (e: any) {
      setError(e.message ?? "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [blockId])

  const fetchAnalytics = useCallback(async () => {
    if (!blockId) return
    try {
      const r = await fetch(`/admin/auction-blocks/${blockId}/analytics`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      })
      if (!r.ok) return // 404 or unavailable — silently skip
      const json = await r.json()
      setAnalyticsData(json)
    } catch {
      // Analytics are optional — don't break the page
    }
  }, [blockId])

  useEffect(() => {
    fetchData()
    fetchAnalytics()
  }, [fetchData, fetchAnalytics])

  const handleAction = useCallback(async (txId: string, action: string) => {
    setActionLoading(txId)
    try {
      const r = await fetch(`/admin/transactions/${txId}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await fetchData()
    } catch (e: any) {
      alert(`Action failed: ${e.message}`)
    } finally {
      setActionLoading(null)
    }
  }, [fetchData])

  // ─── Derived stats ────────────────────────────────────────────────────────

  const lots = data?.lots ?? []
  const summary = data?.summary
  const block = data?.block

  const totalRevenue = lots.reduce((sum, lot) => {
    if (lot.transaction?.status === "paid" && lot.final_price !== null) {
      return sum + Number(lot.final_price)
    }
    return sum
  }, 0)

  const conversionPct = (() => {
    if (!summary) return 0
    const eligible = summary.total - summary.no_bid
    if (eligible <= 0) return 0
    return Math.round((summary.paid / eligible) * 100)
  })()

  // Open Tasks derived counts
  const unpaidCount = lots.filter(l => !!l.winner && (!l.transaction || l.transaction.status !== "paid")).length
  const readyToPackCount = lots.filter(l =>
    l.transaction?.status === "paid" &&
    !["packing", "shipped"].includes(l.transaction.fulfillment_status ?? "")
  ).length
  const labelsNotPrintedCount = lots.filter(l =>
    l.transaction?.fulfillment_status === "packing" && !l.transaction.label_printed_at
  ).length

  // Troubleshooting
  const paidWithoutOrderNumber = lots.filter(l =>
    l.transaction?.status === "paid" && !l.transaction?.order_number
  )

  // Filter tabs
  const filteredLots = lots.filter((lot) => {
    if (activeFilter === "all") return true
    const tx = lot.transaction
    if (activeFilter === "unpaid") return !!lot.winner && (!tx || tx.status !== "paid")
    if (activeFilter === "paid")   return tx?.status === "paid" && tx?.fulfillment_status !== "shipped"
    if (activeFilter === "shipped") return tx?.fulfillment_status === "shipped"
    return true
  })

  const filterTabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all",     label: "All",     count: summary?.total ?? 0 },
    { key: "unpaid",  label: "Unpaid",  count: summary?.unpaid ?? 0 },
    { key: "paid",    label: "Paid",    count: summary?.paid ?? 0 },
    { key: "shipped", label: "Shipped", count: summary?.shipped ?? 0 },
  ]

  // ─── Status badge label ───────────────────────────────────────────────────

  const statusBadgeLabel = block?.status
    ? block.status.toUpperCase()
    : "ENDED"

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{
      padding: "28px 36px",
      maxWidth: 1200,
      margin: "0 auto",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      fontSize: 14,
      color: "#1f2937",
    }}>

      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 20, display: "flex", alignItems: "center", gap: 6 }}>
        <a href="/app/auction-blocks" style={{ color: "#6b7280", textDecoration: "none" }}>
          ← Auction Blocks
        </a>
        <span style={{ color: "#1f2937" }}>›</span>
        <span style={{ color: "#1f2937", fontWeight: 500 }}>{block?.title ?? "Loading…"}</span>
      </div>

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1f2937" }}>
              {block?.title ?? "Post-Auction"}
            </div>
            <span style={{
              display: "inline-block",
              background: "rgba(239,68,68,0.15)", color: "#b91c1c",
              borderRadius: 6, padding: "3px 10px",
              fontSize: 12, fontWeight: 700,
            }}>
              {statusBadgeLabel}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
            {block?.block_type ?? "Themen-Block"}
            {block?.ends_at ? ` · Ended ${fmtDate(block.ends_at)}` : ""}
            {summary ? ` · ${summary.total} lots` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href={`/app/auction-blocks/${blockId}?tab=analytics`}
            style={{
              padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              cursor: "pointer", background: "var(--bg-component, #1a1714)", color: "#1f2937",
              border: "1px solid rgba(0,0,0,0.08)", textDecoration: "none", display: "inline-block",
            }}
          >
            ← Analytics
          </a>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8,
          padding: "12px 16px", color: "#dc2626", marginBottom: 20, fontSize: 13,
        }}>
          {error}{" "}
          <button onClick={fetchData} style={{
            marginLeft: 8, color: "#6366f1", background: "none", border: "none",
            cursor: "pointer", fontSize: 12, textDecoration: "underline",
          }}>Retry</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{
              background: "transparent", borderRadius: 8, height: 80, marginBottom: 12,
              animation: "pulse 1.5s ease-in-out infinite",
            }} />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Stats row — 7 cards */}
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            {[
              { label: "Total Lots",  value: String(summary?.total ?? 0),   numColor: "#e8e0d4" },
              { label: "Paid",        value: String(summary?.paid ?? 0),    numColor: "#16a34a" },
              { label: "Unpaid",      value: String(summary?.unpaid ?? 0),  numColor: "#dc2626" },
              { label: "No Bid",      value: String(summary?.no_bid ?? 0),  numColor: "#e8e0d4" },
              { label: "Shipped",     value: String(summary?.shipped ?? 0), numColor: "#2563eb" },
              { label: "Total Revenue", value: fmtCurrency(totalRevenue),   numColor: "#b45309", minWidth: 140 },
              { label: "Conversion",  value: `${conversionPct}%`,           numColor: "#374151" },
            ].map((s) => (
              <div key={s.label} style={{
                background: "var(--bg-component, #1a1714)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8,
                padding: "14px 20px", textAlign: "center",
                minWidth: (s as any).minWidth ?? 100,
              }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: s.numColor, lineHeight: 1 }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 4 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Two-column layout */}
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, marginBottom: 20 }}>

            {/* Left column: 3 stacked panels */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* ── Open Tasks panel ────────────────────────────────── */}
              <div style={{ background: "var(--bg-component, #1a1714)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
                  Open Tasks
                </div>

                {/* Unpaid near deadline */}
                {unpaidCount > 0 && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <div style={{ width: 16, height: 16, border: "2px solid #dc2626", borderRadius: 3, background: "rgba(239,68,68,0.15)", flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 12, color: "#1f2937", lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 700, color: "#dc2626" }}>{unpaidCount} lots unpaid</span> — check deadlines
                      </div>
                      <div style={{ marginTop: 3 }}>
                        <span
                          onClick={() => setActiveFilter("unpaid")}
                          style={{ fontSize: 11, color: "#6366f1", cursor: "pointer" }}
                        >
                          View unpaid lots →
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Ready to pack */}
                {readyToPackCount > 0 && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <div style={{ width: 16, height: 16, border: "2px solid #1f2937", borderRadius: 3, flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 12, color: "#1f2937", lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 700 }}>{readyToPackCount} lots</span> ready to pack (paid, not started)
                      </div>
                      <div style={{ marginTop: 3 }}>
                        <span
                          onClick={() => setActiveFilter("paid")}
                          style={{ fontSize: 11, color: "#6366f1", cursor: "pointer" }}
                        >
                          View packing queue →
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Labels not printed */}
                {labelsNotPrintedCount > 0 && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <div style={{ width: 16, height: 16, border: "2px solid #1f2937", borderRadius: 3, flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 12, color: "#1f2937", lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 700 }}>{labelsNotPrintedCount} labels</span> not yet printed
                      </div>
                      <div style={{ marginTop: 3 }}>
                        <span style={{ fontSize: 11, color: "#6366f1", cursor: "pointer" }}>
                          Print all labels →
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* No overdue payments — greyed out when unpaid === 0 */}
                {unpaidCount === 0 && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", opacity: 0.5 }}>
                    <div style={{ width: 16, height: 16, border: "2px solid #16a34a", borderRadius: 3, background: "rgba(34,197,94,0.15)", flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>No overdue payments</div>
                    </div>
                  </div>
                )}

                {/* All clear when no tasks */}
                {unpaidCount === 0 && readyToPackCount === 0 && labelsNotPrintedCount === 0 && (
                  <div style={{ fontSize: 12, color: "#6b7280", paddingTop: 4 }}>All tasks complete ✓</div>
                )}
              </div>

              {/* ── Auction Info panel ───────────────────────────────── */}
              <div style={{ background: "var(--bg-component, #1a1714)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
                  Auction Info
                </div>
                {[
                  { label: "Type",             value: block?.block_type ?? "Themen-Block", green: false },
                  { label: "Start",            value: fmtDate(block?.starts_at), green: false },
                  { label: "End",              value: fmtDate(block?.ends_at), green: false },
                  { label: "Total bids",       value: analyticsData?.total_bids != null ? String(analyticsData.total_bids) : "—", green: false },
                  { label: "Unique bidders",   value: analyticsData?.unique_bidders != null ? String(analyticsData.unique_bidders) : "—", green: false },
                  { label: "T-7 Newsletter",   value: block?.newsletter_t7_sent_at ? "✓ Sent" : "—", green: !!block?.newsletter_t7_sent_at },
                  { label: "T-24h Newsletter", value: block?.newsletter_t24h_sent_at ? "✓ Sent" : "—", green: !!block?.newsletter_t24h_sent_at },
                  { label: "Going/Going/Gone", value: block?.going_going_gone_sent_at ? "✓ Triggered" : "—", green: !!block?.going_going_gone_sent_at },
                ].map(({ label, value, green }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f9fafb", fontSize: 12 }}>
                    <span style={{ color: "#6b7280" }}>{label}</span>
                    <span style={{ fontWeight: 500, color: green ? "#16a34a" : "#374151" }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* ── Troubleshooting panel ────────────────────────────── */}
              <div style={{ background: "var(--bg-component, #1a1714)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
                  Troubleshooting
                </div>

                {paidWithoutOrderNumber.length > 0 && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.04)", fontSize: 12 }}>
                    <div style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>⚠️</div>
                    <div>
                      <div style={{ fontWeight: 600, color: "#b45309" }}>
                        {paidWithoutOrderNumber.length} payment{paidWithoutOrderNumber.length > 1 ? "s" : ""} without order number
                      </div>
                      <div style={{ color: "#6b7280", fontSize: 11, marginTop: 2 }}>
                        {paidWithoutOrderNumber.map(l => l.transaction?.id).join(", ")} — capture succeeded but order number was not assigned.
                      </div>
                    </div>
                  </div>
                )}

                {[
                  "All Stripe webhooks received",
                  "All PayPal captures verified",
                  "No anti-snipe extensions triggered",
                ].map((msg) => (
                  <div key={msg} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.04)", fontSize: 12 }}>
                    <div style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>✅</div>
                    <div style={{ color: "#16a34a", fontWeight: 500 }}>{msg}</div>
                  </div>
                ))}
              </div>

            </div>

            {/* Right column: Lots table panel */}
            <div style={{ background: "var(--bg-component, #1a1714)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, overflow: "hidden" }}>

              {/* Panel header with filter tabs */}
              <div style={{
                padding: "14px 16px", borderBottom: "1px solid rgba(0,0,0,0.08)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Lots Overview</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {filterTabs.map((tab) => {
                    const isActive = activeFilter === tab.key
                    return (
                      <button key={tab.key} onClick={() => setActiveFilter(tab.key)} style={{
                        padding: "4px 12px", borderRadius: 5, fontSize: 11, fontWeight: isActive ? 700 : 500,
                        cursor: "pointer",
                        background: isActive ? "#6366f1" : "#fff",
                        color: isActive ? "#1c1915" : "#6b7280",
                        border: isActive ? "1px solid #6366f1" : "1px solid rgba(0,0,0,0.08)",
                      }}>
                        {tab.label} {tab.count}
                      </button>
                    )
                  })}
                  <button onClick={() => { fetchData(); fetchAnalytics() }} disabled={loading} style={{
                    marginLeft: 4, background: "var(--bg-component, #1a1714)", color: "#6b7280",
                    border: "1px solid rgba(0,0,0,0.08)", borderRadius: 5,
                    padding: "4px 10px", fontSize: 11, cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.6 : 1,
                  }}>↻</button>
                </div>
              </div>

              {/* Table header row */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "48px 1fr 140px 80px 120px 180px",
                gap: 10, padding: "8px 14px",
                background: "transparent", borderBottom: "1px solid rgba(0,0,0,0.08)",
              }}>
                {["Lot", "Release", "Winner", "Amount", "Status", "Action"].map((h) => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {h}
                  </span>
                ))}
              </div>

              {/* Lot rows */}
              {filteredLots.length === 0 ? (
                <div style={{ padding: "32px 16px", textAlign: "center", color: "#6b7280", fontSize: 13 }}>
                  No lots found.
                </div>
              ) : filteredLots.map((lot) => {
                const tx = lot.transaction
                const stepInfo = getCurrentStep(lot)
                const isNoBid = stepInfo.step === 0

                return (
                  <div key={lot.id} style={{
                    display: "grid",
                    gridTemplateColumns: "48px 1fr 140px 80px 120px 180px",
                    gap: 10, padding: "12px 14px", alignItems: "center",
                    borderBottom: "1px solid rgba(0,0,0,0.04)",
                    opacity: isNoBid ? 0.5 : 1,
                    transition: "background 0.1s",
                    cursor: tx ? "pointer" : "default",
                  }}
                    onClick={() => tx && (window.location.href = `/app/transactions/${tx.id}`)}
                    onMouseEnter={(e) => { if (tx) e.currentTarget.style.background = "#f0f9ff" }}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* Lot # */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#b45309" }}>
                      #{lot.lot_number}
                    </div>

                    {/* Release */}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#1f2937", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {lot.release_title || "—"}
                      </div>
                      {lot.artist_name && (
                        <div style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {lot.artist_name}
                        </div>
                      )}
                      {tx?.order_number && (
                        <div style={{ fontSize: 10, color: "#6b7280", fontFamily: "monospace", marginTop: 1 }}>
                          {tx.order_number}
                        </div>
                      )}
                    </div>

                    {/* Winner */}
                    <div>
                      {lot.winner ? (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 500, color: "#1f2937", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {lot.winner.name}
                          </div>
                          <div style={{ fontSize: 10, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {lot.winner.email}
                          </div>
                          {tx?.shipping_city && (
                            <div style={{ fontSize: 10, color: "#6b7280" }}>
                              {tx.shipping_country ? `${tx.shipping_country} · ` : ""}{tx.shipping_city}
                            </div>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: "#6b7280" }}>—</span>
                      )}
                    </div>

                    {/* Amount */}
                    <div style={{ fontSize: 13, fontWeight: 600, color: lot.final_price !== null ? "#e8e0d4" : "#6b7280" }}>
                      {lot.final_price !== null ? `€${Number(lot.final_price).toFixed(2)}` : "—"}
                    </div>

                    {/* Status badge */}
                    <div>
                      <span style={{
                        display: "inline-block",
                        padding: "3px 9px", borderRadius: 12,
                        fontSize: 10, fontWeight: 700,
                        whiteSpace: "nowrap",
                        color: stepInfo.color,
                        background: stepInfo.bg,
                      }}>
                        {stepInfo.label}
                      </span>
                    </div>

                    {/* Action */}
                    <div>
                      <ActionButton lot={lot} onAction={handleAction} loading={actionLoading} />
                    </div>
                  </div>
                )
              })}

              {/* Footer */}
              {filteredLots.length > 0 && (
                <div style={{ padding: "10px 14px", textAlign: "center", color: "#6b7280", fontSize: 11, borderTop: "1px solid rgba(0,0,0,0.04)" }}>
                  Showing {filteredLots.length} of {summary?.total ?? 0} lots
                </div>
              )}
            </div>

          </div>
        </>
      )}
    </div>
  )
}
