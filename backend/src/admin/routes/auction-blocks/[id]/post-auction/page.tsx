// NOTE: No defineRouteConfig here — only on top-level page.tsx files (Medusa Admin routing rule)
import { useEffect, useState, useCallback } from "react"
import { useParams } from "react-router-dom"

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
type BlockData = { id: string; title: string; status: string }
type PostAuctionResponse = { block: BlockData; lots: Lot[]; summary: Summary }
type FilterTab = "all" | "unpaid" | "paid" | "shipped"

// ─── Step logic ───────────────────────────────────────────────────────────────

type StepInfo = { step: number; label: string; color: string; bg: string }

function getCurrentStep(lot: Lot): StepInfo {
  const tx = lot.transaction
  if (!lot.winner || !tx) {
    return { step: 0, label: "No Bid", color: "#6b7280", bg: "#f3f4f6" }
  }
  const paid = tx.status === "paid"
  const packing = ["packing", "shipped"].includes(tx.fulfillment_status)
  const labeled = !!tx.label_printed_at
  const shipped = tx.fulfillment_status === "shipped"

  if (shipped)   return { step: 5, label: "✓ Shipped",       color: "#16a34a", bg: "#dcfce7" }
  if (labeled)   return { step: 4, label: "Label Printed",   color: "#2563eb", bg: "#dbeafe" }
  if (packing)   return { step: 3, label: "Packing",         color: "#9333ea", bg: "#f3e8ff" }
  if (paid)      return { step: 2, label: "Paid — Pack it",  color: "#d97706", bg: "#fef3c7" }
  return           { step: 1, label: "Awaiting Payment",    color: "#dc2626", bg: "#fee2e2" }
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
    border: "none", borderRadius: 6, padding: "5px 12px", fontWeight: 600, fontSize: 12,
    cursor: isLoading ? "not-allowed" : "pointer", opacity: isLoading ? 0.6 : 1,
    whiteSpace: "nowrap", transition: "opacity 0.15s",
  }

  if (step.step === 5) return (
    <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>Done ✓</span>
  )
  if (step.step === 1) return (
    <button disabled style={{ ...base, background: "#f3f4f6", color: "#9ca3af", cursor: "not-allowed" }}>
      Awaiting Payment
    </button>
  )
  if (step.step === 2) return (
    <button onClick={() => onAction(tx.id, "packing")} disabled={isLoading}
      style={{ ...base, background: "#6366f1", color: "#fff" }}>
      {isLoading ? "…" : "Mark Packing"}
    </button>
  )
  if (step.step === 3) return (
    <button onClick={() => window.open(`/admin/transactions/${tx.id}/shipping-label`, "_blank")}
      style={{ ...base, background: "#2563eb", color: "#fff" }}>
      Print Label ↗
    </button>
  )
  if (step.step === 4) return (
    <button onClick={() => onAction(tx.id, "ship")} disabled={isLoading}
      style={{ ...base, background: "#16a34a", color: "#fff" }}>
      {isLoading ? "…" : "Mark Shipped"}
    </button>
  )
  return null
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PostAuctionPage() {
  const { id: blockId } = useParams<{ id: string }>()
  const [data, setData] = useState<PostAuctionResponse | null>(null)
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

  useEffect(() => { fetchData() }, [fetchData])

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

  const filteredLots = (data?.lots ?? []).filter((lot) => {
    if (activeFilter === "all") return true
    const tx = lot.transaction
    if (activeFilter === "unpaid") return !!lot.winner && (!tx || tx.status !== "paid")
    if (activeFilter === "paid") return tx?.status === "paid" && tx?.fulfillment_status !== "shipped"
    if (activeFilter === "shipped") return tx?.fulfillment_status === "shipped"
    return true
  })

  const summary = data?.summary

  const filterTabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: "all",      label: "All",       count: summary?.total },
    { key: "unpaid",   label: "Unpaid",    count: summary?.unpaid },
    { key: "paid",     label: "Paid",      count: summary?.paid },
    { key: "shipped",  label: "Shipped",   count: summary?.shipped },
  ]

  // ── Colors (light admin theme) ───────────────────────────────────────────
  const C = {
    text:    "#111827",
    muted:   "#6b7280",
    border:  "#e5e7eb",
    bg:      "#f9fafb",
    gold:    "#b45309",
    primary: "#6366f1",
  }

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto", fontFamily: "inherit" }}>

      {/* Back */}
      <a href={`/app/auction-blocks/${blockId}`}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.muted, fontSize: 13, textDecoration: "none", marginBottom: 20 }}>
        ← Back to Block
      </a>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>Post-Auction Workflow</h1>
        {data?.block?.title && (
          <p style={{ margin: "4px 0 0", fontSize: 14, color: C.gold, fontWeight: 500 }}>{data.block.title}</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", color: "#dc2626", marginBottom: 20, fontSize: 13 }}>
          {error} <button onClick={fetchData} style={{ marginLeft: 8, color: C.primary, background: "none", border: "none", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>Retry</button>
        </div>
      )}

      {/* Summary bar */}
      {summary && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { label: "Total Lots",  value: summary.total,   color: C.text },
            { label: "Paid",        value: summary.paid,    color: "#16a34a" },
            { label: "Unpaid",      value: summary.unpaid,  color: "#dc2626" },
            { label: "No Bid",      value: summary.no_bid,  color: C.muted },
            { label: "Shipped",     value: summary.shipped, color: "#2563eb" },
          ].map((s) => (
            <div key={s.label} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 20px", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 90 }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</span>
              <span style={{ fontSize: 11, color: C.muted, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ background: "#f3f4f6", borderRadius: 8, height: 60, marginBottom: 8, animation: "pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
      )}

      {/* Content */}
      {data && (
        <>
          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center" }}>
            {filterTabs.map((tab) => {
              const isActive = activeFilter === tab.key
              return (
                <button key={tab.key} onClick={() => setActiveFilter(tab.key)} style={{
                  background: isActive ? C.primary : "#fff",
                  color: isActive ? "#fff" : C.muted,
                  border: `1px solid ${isActive ? C.primary : C.border}`,
                  borderRadius: 6, padding: "5px 14px", fontSize: 12,
                  fontWeight: isActive ? 700 : 400, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  {tab.label}
                  {tab.count !== undefined && (
                    <span style={{
                      background: isActive ? "rgba(255,255,255,0.25)" : "#f3f4f6",
                      borderRadius: 10, padding: "1px 6px", fontSize: 11, fontWeight: 600,
                      color: isActive ? "#fff" : C.muted,
                    }}>{tab.count}</span>
                  )}
                </button>
              )
            })}
            <button onClick={fetchData} disabled={loading} style={{
              marginLeft: "auto", background: "#fff", color: C.muted,
              border: `1px solid ${C.border}`, borderRadius: 6,
              padding: "5px 12px", fontSize: 12, cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}>↻ Refresh</button>
          </div>

          {/* Table */}
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>

            {/* Header row */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "52px 1fr 160px 80px 140px 150px",
              padding: "10px 16px", gap: 12,
              borderBottom: `1px solid ${C.border}`,
              background: C.bg,
            }}>
              {["Lot", "Release", "Winner", "Amount", "Status", "Action"].map((h) => (
                <span key={h} style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
              ))}
            </div>

            {/* Rows */}
            {filteredLots.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: C.muted, fontSize: 13 }}>
                No lots found.
              </div>
            ) : filteredLots.map((lot) => {
              const tx = lot.transaction
              const stepInfo = getCurrentStep(lot)

              return (
                <div key={lot.id} style={{
                  display: "grid",
                  gridTemplateColumns: "52px 1fr 160px 80px 140px 150px",
                  padding: "12px 16px", gap: 12, alignItems: "center",
                  borderBottom: `1px solid ${C.border}`,
                }}>
                  {/* Lot # */}
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.gold }}>#{lot.lot_number}</span>

                  {/* Release */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text, lineHeight: 1.3 }}>{lot.release_title || "—"}</div>
                    {lot.artist_name && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{lot.artist_name}</div>}
                    {tx?.order_number && <div style={{ fontSize: 10, color: C.muted, marginTop: 2, fontFamily: "monospace" }}>{tx.order_number}</div>}
                  </div>

                  {/* Winner */}
                  <div>
                    {lot.winner ? (
                      <>
                        <div style={{ fontSize: 12, color: C.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lot.winner.name}</div>
                        <div style={{ fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lot.winner.email}</div>
                        {tx?.shipping_city && <div style={{ fontSize: 10, color: C.muted }}>{tx.shipping_city}{tx.shipping_country ? `, ${tx.shipping_country}` : ""}</div>}
                      </>
                    ) : <span style={{ fontSize: 11, color: C.muted }}>—</span>}
                  </div>

                  {/* Amount */}
                  <span style={{ fontSize: 13, fontWeight: 600, color: lot.final_price !== null ? C.text : C.muted }}>
                    {lot.final_price !== null ? `€${Number(lot.final_price).toFixed(2)}` : "—"}
                  </span>

                  {/* Status badge */}
                  <span style={{
                    display: "inline-block",
                    fontSize: 11, fontWeight: 600,
                    color: stepInfo.color,
                    background: stepInfo.bg,
                    padding: "4px 10px", borderRadius: 20,
                    whiteSpace: "nowrap", width: "fit-content",
                  }}>
                    {stepInfo.label}
                  </span>

                  {/* Action */}
                  <ActionButton lot={lot} onAction={handleAction} loading={actionLoading} />
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
