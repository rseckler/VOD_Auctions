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

type WinnerData = {
  id: string
  name: string
  email: string
}

type Lot = {
  id: string
  lot_number: number
  release_title: string
  artist_name: string
  final_price: number | null
  winner: WinnerData | null
  transaction: TransactionData | null
}

type Summary = {
  total: number
  paid: number
  unpaid: number
  no_bid: number
  shipped: number
}

type BlockData = {
  id: string
  title: string
  status: string
}

type PostAuctionResponse = {
  block: BlockData
  lots: Lot[]
  summary: Summary
}

type FilterTab = "all" | "unpaid" | "paid" | "shipped"

// ─── Step logic ───────────────────────────────────────────────────────────────

type StepStatus = "done" | "active" | "pending"

function getStepStatuses(lot: Lot): [StepStatus, StepStatus, StepStatus, StepStatus, StepStatus] {
  const tx = lot.transaction
  if (!tx) {
    return ["done", "pending", "pending", "pending", "pending"]
  }

  const paid = tx.status === "paid"
  const packing = tx.fulfillment_status === "packing" || tx.fulfillment_status === "shipped"
  const labelPrinted = !!tx.label_printed_at
  const shipped = tx.fulfillment_status === "shipped"

  const step1: StepStatus = "done"
  const step2: StepStatus = paid ? "done" : "active"
  const step3: StepStatus = !paid ? "pending" : packing ? "done" : "active"
  const step4: StepStatus = !packing ? "pending" : labelPrinted ? "done" : "active"
  const step5: StepStatus = !labelPrinted ? "pending" : shipped ? "done" : "active"

  return [step1, step2, step3, step4, step5]
}

function getActiveStep(steps: StepStatus[]): number {
  // Returns 1-based index of the currently active step (or 6 if all done)
  for (let i = 0; i < steps.length; i++) {
    if (steps[i] === "active") return i + 1
  }
  return 6 // all done
}

// ─── Step Tracker Component ───────────────────────────────────────────────────

const STEP_LABELS = ["Ended", "Paid", "Packing", "Label", "Shipped"]

function StepTracker({ steps }: { steps: StepStatus[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {STEP_LABELS.map((label, i) => {
        const status = steps[i]
        const isLast = i === STEP_LABELS.length - 1

        const circleColor =
          status === "done" ? "#22c55e" :
          status === "active" ? "#d4a54a" :
          "#374151"

        const textColor =
          status === "done" ? "#22c55e" :
          status === "active" ? "#d4a54a" :
          "#6b7280"

        const lineColor = status === "done" ? "#22c55e" : "rgba(255,255,255,0.1)"

        return (
          <div key={label} style={{ display: "flex", alignItems: "center" }}>
            {/* Step circle + label */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: circleColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                color: status === "pending" ? "#6b7280" : "#1c1915",
                border: status === "pending" ? "1px solid rgba(255,255,255,0.15)" : "none",
                flexShrink: 0,
              }}>
                {status === "done" ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: 9, color: textColor, whiteSpace: "nowrap", fontWeight: status === "active" ? 600 : 400 }}>
                {label}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div style={{
                width: 24,
                height: 2,
                background: lineColor,
                marginBottom: 14,
                flexShrink: 0,
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Action Button Component ──────────────────────────────────────────────────

function ActionButton({
  lot,
  steps,
  onAction,
  loading,
}: {
  lot: Lot
  steps: StepStatus[]
  onAction: (lotId: string, txId: string, action: string) => void
  loading: string | null
}) {
  const tx = lot.transaction

  if (!lot.winner || !tx) {
    return (
      <span style={{
        fontSize: 11,
        color: "#6b7280",
        background: "rgba(107,114,128,0.12)",
        padding: "4px 10px",
        borderRadius: 4,
        fontWeight: 500,
      }}>
        No Bid
      </span>
    )
  }

  const activeStep = getActiveStep(steps)
  const isLoading = loading === tx.id

  if (activeStep === 6) {
    return (
      <span style={{
        fontSize: 11,
        color: "#22c55e",
        background: "rgba(34,197,94,0.12)",
        padding: "4px 10px",
        borderRadius: 4,
        fontWeight: 600,
      }}>
        Done ✓
      </span>
    )
  }

  const btnBase: React.CSSProperties = {
    border: "none",
    borderRadius: 6,
    padding: "5px 12px",
    fontWeight: 600,
    fontSize: 12,
    cursor: isLoading ? "not-allowed" : "pointer",
    opacity: isLoading ? 0.6 : 1,
    transition: "opacity 0.15s",
    whiteSpace: "nowrap",
  }

  if (activeStep === 2) {
    // Awaiting payment
    return (
      <button
        disabled
        style={{ ...btnBase, background: "rgba(107,114,128,0.15)", color: "#6b7280", cursor: "not-allowed" }}
      >
        Awaiting Payment
      </button>
    )
  }

  if (activeStep === 3) {
    // Mark as packing
    return (
      <button
        onClick={() => onAction(lot.id, tx.id, "packing")}
        disabled={isLoading}
        style={{ ...btnBase, background: "#d4a54a", color: "#1c1915" }}
      >
        {isLoading ? "…" : "Mark Packing"}
      </button>
    )
  }

  if (activeStep === 4) {
    // Print shipping label
    return (
      <button
        onClick={() => window.open(`/admin/transactions/${tx.id}/shipping-label`, "_blank")}
        style={{ ...btnBase, background: "#3b82f6", color: "#fff" }}
      >
        Print Label ↗
      </button>
    )
  }

  if (activeStep === 5) {
    // Mark as shipped
    return (
      <button
        onClick={() => onAction(lot.id, tx.id, "ship")}
        disabled={isLoading}
        style={{ ...btnBase, background: "#d4a54a", color: "#1c1915" }}
      >
        {isLoading ? "…" : "Mark Shipped"}
      </button>
    )
  }

  return null
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PostAuctionPage() {
  const { id: blockId } = useParams<{ id: string }>()

  const [data, setData] = useState<PostAuctionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all")
  const [actionLoading, setActionLoading] = useState<string | null>(null) // txId

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
      const json = await r.json()
      setData(json)
    } catch (e: any) {
      setError(e.message ?? "Failed to load post-auction data")
    } finally {
      setLoading(false)
    }
  }, [blockId])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAction = useCallback(async (lotId: string, txId: string, action: string) => {
    setActionLoading(txId)
    try {
      const r = await fetch(`/admin/transactions/${txId}`, {
        method: "POST",
        credentials: "include",
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

  // ── Filter lots ──────────────────────────────────────────────────────────
  const filteredLots = (data?.lots ?? []).filter((lot) => {
    if (activeFilter === "all") return true
    const tx = lot.transaction
    if (activeFilter === "unpaid") return !!lot.winner && (!tx || tx.status !== "paid")
    if (activeFilter === "paid") return tx?.status === "paid" && tx?.fulfillment_status !== "shipped"
    if (activeFilter === "shipped") return tx?.fulfillment_status === "shipped"
    return true
  })

  const summary = data?.summary

  // ── Render ───────────────────────────────────────────────────────────────

  const filterTabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: "all", label: "All", count: summary?.total },
    { key: "unpaid", label: "Unpaid ⚠", count: summary?.unpaid },
    { key: "paid", label: "Paid ✓", count: summary?.paid },
    { key: "shipped", label: "Shipped ✓", count: summary?.shipped },
  ]

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto" }}>

      {/* Back link */}
      <a
        href={`/app/auction-blocks/${blockId}`}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#9ca3af", fontSize: 13, textDecoration: "none", marginBottom: 20 }}
      >
        ← Back to Block
      </a>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#f5f0e8" }}>
          Post-Auction Workflow
        </h1>
        {data?.block?.title && (
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#d4a54a", fontWeight: 500 }}>
            {data.block.title}
          </p>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          background: "rgba(239,68,68,0.1)",
          border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 8,
          padding: "12px 16px",
          color: "#ef4444",
          marginBottom: 20,
          fontSize: 13,
        }}>
          Failed to load data: {error}
          <button
            onClick={fetchData}
            style={{ marginLeft: 12, fontSize: 12, color: "#d4a54a", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary bar */}
      {summary && (
        <div style={{
          display: "flex",
          gap: 0,
          marginBottom: 24,
          background: "#1c1915",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          overflow: "hidden",
        }}>
          {[
            { label: "Lots", value: summary.total, color: "#f5f0e8" },
            { label: "Paid ✓", value: summary.paid, color: "#22c55e" },
            { label: "Unpaid ⚠", value: summary.unpaid, color: "#f59e0b" },
            { label: "No Bid —", value: summary.no_bid, color: "#6b7280" },
            { label: "Shipped ✓", value: summary.shipped, color: "#3b82f6" },
          ].map((s, i) => (
            <div
              key={s.label}
              style={{
                flex: 1,
                padding: "14px 16px",
                borderRight: i < 4 ? "1px solid rgba(255,255,255,0.08)" : "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 24, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</span>
              <span style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ background: "#1c1915", borderRadius: 6, height: 34, width: 90, opacity: 0.5 }} />
            ))}
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ background: "#1c1915", borderRadius: 8, height: 68, marginBottom: 6, opacity: 0.5 }} />
          ))}
        </div>
      )}

      {/* Filter tabs + table */}
      {data && (
        <>
          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {filterTabs.map((tab) => {
              const isActive = activeFilter === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  style={{
                    background: isActive ? "#d4a54a" : "rgba(255,255,255,0.05)",
                    color: isActive ? "#1c1915" : "#9ca3af",
                    border: isActive ? "none" : "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 6,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: isActive ? 700 : 400,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span style={{
                      background: isActive ? "rgba(28,25,21,0.25)" : "rgba(255,255,255,0.08)",
                      borderRadius: 10,
                      padding: "1px 6px",
                      fontSize: 11,
                      fontWeight: 600,
                      color: isActive ? "#1c1915" : "#6b7280",
                    }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              )
            })}

            <button
              onClick={fetchData}
              disabled={loading}
              style={{
                marginLeft: "auto",
                background: "rgba(255,255,255,0.05)",
                color: "#9ca3af",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 12,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              ↻ Refresh
            </button>
          </div>

          {/* Table */}
          <div style={{
            background: "#1c1915",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            overflow: "hidden",
          }}>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "60px 1fr 160px 80px 120px 185px 160px",
              padding: "10px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              gap: 12,
            }}>
              {["Lot", "Release", "Winner", "Amount", "Payment", "Progress", "Action"].map((h) => (
                <span key={h} style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {h}
                </span>
              ))}
            </div>

            {/* Rows */}
            {filteredLots.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "#6b7280", fontSize: 13 }}>
                No lots found for this filter.
              </div>
            ) : (
              filteredLots.map((lot) => {
                const steps = getStepStatuses(lot)
                const tx = lot.transaction

                return (
                  <div
                    key={lot.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "60px 1fr 160px 80px 120px 185px 160px",
                      padding: "12px 16px",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    {/* Lot # */}
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#d4a54a" }}>
                      #{lot.lot_number}
                    </span>

                    {/* Release */}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#f5f0e8", lineHeight: 1.3 }}>
                        {lot.release_title || "—"}
                      </div>
                      {lot.artist_name && (
                        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                          {lot.artist_name}
                        </div>
                      )}
                      {tx?.order_number && (
                        <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2, fontFamily: "monospace" }}>
                          {tx.order_number}
                        </div>
                      )}
                    </div>

                    {/* Winner */}
                    <div>
                      {lot.winner ? (
                        <>
                          <div style={{ fontSize: 12, color: "#f5f0e8", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {lot.winner.name}
                          </div>
                          <div style={{ fontSize: 10, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {lot.winner.email}
                          </div>
                          {tx?.shipping_city && (
                            <div style={{ fontSize: 10, color: "#6b7280" }}>
                              {tx.shipping_city}{tx.shipping_country ? `, ${tx.shipping_country}` : ""}
                            </div>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: "#6b7280" }}>—</span>
                      )}
                    </div>

                    {/* Amount */}
                    <div>
                      {lot.final_price !== null ? (
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#f5f0e8" }}>
                          €{Number(lot.final_price).toFixed(2)}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: "#6b7280" }}>—</span>
                      )}
                    </div>

                    {/* Payment status */}
                    <div>
                      {tx ? (
                        <PaymentStatusBadge status={tx.status} />
                      ) : lot.winner ? (
                        <span style={{ fontSize: 11, color: "#f59e0b", background: "rgba(245,158,11,0.1)", padding: "3px 8px", borderRadius: 4, fontWeight: 500 }}>
                          Pending
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: "#6b7280" }}>—</span>
                      )}
                    </div>

                    {/* Step tracker */}
                    <StepTracker steps={steps} />

                    {/* Action */}
                    <div>
                      <ActionButton
                        lot={lot}
                        steps={steps}
                        onAction={handleAction}
                        loading={actionLoading}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Row count */}
          <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
            Showing {filteredLots.length} of {data.lots.length} lots
          </div>
        </>
      )}
    </div>
  )
}

// ─── Payment Status Badge ─────────────────────────────────────────────────────

function PaymentStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { color: string; bg: string; label: string }> = {
    paid:       { color: "#22c55e", bg: "rgba(34,197,94,0.12)",   label: "Paid" },
    pending:    { color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  label: "Pending" },
    refunded:   { color: "#9ca3af", bg: "rgba(156,163,175,0.12)", label: "Refunded" },
    partially_refunded: { color: "#9ca3af", bg: "rgba(156,163,175,0.12)", label: "Part. Refunded" },
    failed:     { color: "#ef4444", bg: "rgba(239,68,68,0.12)",   label: "Failed" },
    cancelled:  { color: "#6b7280", bg: "rgba(107,114,128,0.12)", label: "Cancelled" },
  }
  const c = cfg[status] ?? { color: "#9ca3af", bg: "rgba(156,163,175,0.1)", label: status }
  return (
    <span style={{
      fontSize: 11,
      color: c.color,
      background: c.bg,
      padding: "3px 8px",
      borderRadius: 4,
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {c.label}
    </span>
  )
}
