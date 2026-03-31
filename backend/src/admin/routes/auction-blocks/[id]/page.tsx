import {
  Container,
  Heading,
  Text,
  Button,
  Input,
  Label,
  Textarea,
  Select,
  Badge,
  Table,
  IconButton,
} from "@medusajs/ui"
import { Trash, Plus } from "@medusajs/icons"
import React, { useEffect, useState, useRef, useCallback } from "react"
import { useParams } from "react-router-dom"
import RichTextEditor from "../../../components/rich-text-editor"

type BlockItem = {
  id: string
  release_id: string
  start_price: number
  estimated_value: number | null
  reserve_price: number | null
  buy_now_price: number | null
  current_price: number | null
  bid_count: number
  lot_number: number | null
  status: string
  release_title?: string | null
  release_artist?: string | null
  release_format?: string | null
  release_cover?: string | null
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
  preview_from: string | null
  short_description: string | null
  long_description: string | null
  header_image: string | null
  video_url: string | null
  audio_url: string | null
  staggered_ending: boolean
  stagger_interval_seconds: number
  default_start_price_percent: number
  auto_extend: boolean
  extension_minutes: number
  max_extensions: number
  total_revenue: number | null
  sold_items: number | null
  total_bids: number | null
  items: BlockItem[]
}

type Release = {
  id: string
  title: string
  artist_name: string | null
  label_name: string | null
  format: string
  year: number | null
  coverImage: string | null
  auction_status: string | null
  estimated_value: number | null
}

type FilterOption = { value: string | number; count: number }

type AnalyticsTopLot = {
  lot_number: number | null
  release_title: string
  release_cover: string | null
  start_price: number
  hammer_price: number
  price_multiple: number
  bid_count: number
  winning_bidder_hint: string | null
}

type AnalyticsNoBidLot = {
  lot_number: number | null
  release_title: string
  release_cover: string | null
  start_price: number
}

type AnalyticsData = {
  block_id: string
  block_title: string
  block_status: string
  total_lots: number
  lots_with_bids: number
  lots_sold: number
  lots_unsold: number
  conversion_rate: number
  total_bids: number
  total_revenue: number
  avg_hammer_price: number
  avg_start_price: number
  avg_price_multiple: number
  top_lots: AnalyticsTopLot[]
  no_bid_lots: AnalyticsNoBidLot[]
  bid_distribution: { "1": number; "2-5": number; "6-10": number; "10+": number }
}

type PostAuctionLot = {
  id: string
  lot_number: number
  release_id: string
  release_title: string
  artist_name: string
  final_price: number | null
  winner: { id: string; name: string; email: string } | null
  transaction: {
    id: string
    status: string
    fulfillment_status: string
    order_number: string | null
    label_printed_at: string | null
    shipping_name: string | null
    shipping_city: string | null
    shipping_country: string | null
  } | null
}

type PostAuctionResponse = {
  block: { id: string; title: string; status: string; ends_at?: string | null }
  lots: PostAuctionLot[]
  summary: { total: number; paid: number; unpaid: number; refunded: number; no_bid: number; shipped: number }
}

type FiltersData = {
  formats: FilterOption[]
  countries: FilterOption[]
  years: FilterOption[]
  total: number
}

const STATUS_COLORS: Record<string, "green" | "orange" | "blue" | "grey" | "red" | "purple"> = {
  draft: "grey",
  scheduled: "blue",
  preview: "orange",
  active: "green",
  ended: "red",
  archived: "purple",
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  preview: "Preview",
  active: "Active",
  ended: "Ended",
  archived: "Archived",
}

const BLOCK_TYPES = [
  { value: "theme", label: "Theme Block" },
  { value: "highlight", label: "Highlight Block" },
  { value: "clearance", label: "Clearance Block" },
  { value: "flash", label: "Flash Block" },
]

const SORT_OPTIONS = [
  { value: "title_asc", label: "Title A→Z" },
  { value: "title_desc", label: "Title Z→A" },
  { value: "artist_asc", label: "Artist A→Z" },
  { value: "artist_desc", label: "Artist Z→A" },
  { value: "year_desc", label: "Year ↓" },
  { value: "year_asc", label: "Year ↑" },
]

function useLiveCountdown(endTime: string | null) {
  const [remaining, setRemaining] = useState("")
  useEffect(() => {
    if (!endTime) return
    const tick = () => {
      const diff = new Date(endTime).getTime() - Date.now()
      if (diff <= 0) { setRemaining("Ended"); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      if (h > 0) setRemaining(`${h}h ${m}m ${s}s`)
      else if (m > 0) setRemaining(`${m}m ${s}s`)
      else setRemaining(`${s}s`)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [endTime])
  return remaining
}

function LiveItemCountdown({ endTime }: { endTime: string }) {
  const remaining = useLiveCountdown(endTime)
  const diff = new Date(endTime).getTime() - Date.now()
  const isUrgent = diff > 0 && diff < 5 * 60 * 1000
  return (
    <span className={`font-mono text-xs font-semibold ${
      remaining === "Ended" ? "text-red-400" :
      isUrgent ? "text-red-400 animate-pulse" :
      "text-ui-fg-subtle"
    }`}>
      {remaining}
    </span>
  )
}

function EndedStateDashboard({
  block,
  postAuctionData,
  postAuctionLoading,
  onMakeAvailable,
  onMakeAllAvailable,
  onOpenRelistModal,
  onHandleAction,
  actionLoading,
  relistModal,
  availableBlocks,
  relistTarget,
  setRelistTarget,
  onRelistConfirm,
  onRelistCancel,
  relistLoading,
  onArchive,
}: {
  block: Partial<AuctionBlock>
  postAuctionData: PostAuctionResponse | null
  postAuctionLoading: boolean
  onMakeAvailable: (lotId: string) => void
  onMakeAllAvailable: () => void
  onOpenRelistModal: (lot: PostAuctionLot) => void
  onHandleAction: (txId: string, action: string) => void
  actionLoading: string | null
  relistModal: { open: boolean; lot: PostAuctionLot | null }
  availableBlocks: { id: string; title: string; status: string }[]
  relistTarget: string
  setRelistTarget: (v: string) => void
  onRelistConfirm: () => void
  onRelistCancel: () => void
  relistLoading: boolean
  onArchive: () => void
}) {
  const [activeTab, setActiveTab] = React.useState<"won" | "nobid">("won")

  if (postAuctionLoading) {
    return (
      <div style={{ padding: "32px 0", textAlign: "center", color: "#6b7280" }}>
        Loading post-auction data…
      </div>
    )
  }

  const summary = postAuctionData?.summary ?? { total: 0, paid: 0, unpaid: 0, refunded: 0, no_bid: 0, shipped: 0 }
  const lots = postAuctionData?.lots ?? []
  const wonLots = lots.filter(l => !!l.winner)
  const noBidLots = lots.filter(l => !l.winner)

  const totalBiddable = summary.total - summary.no_bid
  // allPaid = no pending payments remaining (refunded/cancelled are resolved, not blocking)
  const allPaid = totalBiddable > 0 && summary.unpaid === 0
  const allShipped = allPaid && summary.shipped >= summary.paid

  // Status badge for a lot's transaction
  const getTxStatusLabel = (lot: PostAuctionLot): { label: string; color: string } => {
    if (!lot.transaction) return { label: "Awaiting Payment", color: "#ef4444" }
    const { status, fulfillment_status } = lot.transaction
    // Terminal states first — must be checked before fulfillment
    if (status === "refunded") return { label: "Refunded", color: "#7c3aed" }
    if (status === "cancelled") return { label: "Cancelled", color: "#6b7280" }
    if (status === "failed") return { label: "Payment Failed", color: "#dc2626" }
    // Fulfillment states
    if (fulfillment_status === "delivered") return { label: "Done ✓", color: "#22c55e" }
    if (fulfillment_status === "shipped") return { label: "Shipped ✓", color: "#22c55e" }
    if (fulfillment_status === "packing") {
      if (lot.transaction.label_printed_at) return { label: "Label Printed", color: "#3b82f6" }
      return { label: "Packing", color: "#f59e0b" }
    }
    if (status === "paid") return { label: "Paid — Pack it", color: "#b45309" }
    return { label: "Awaiting Payment", color: "#ef4444" }
  }

  const getPrimaryAction = (lot: PostAuctionLot): { label: string; action: string } | null => {
    if (!lot.transaction) return null
    const { status, fulfillment_status } = lot.transaction
    if (status !== "paid") return null
    if (fulfillment_status === "unfulfilled" || !fulfillment_status) return { label: "Mark Packing", action: "packing" }
    if (fulfillment_status === "packing" && !lot.transaction.label_printed_at) return { label: "Print Label", action: "label_printed" }
    if (fulfillment_status === "packing" && lot.transaction.label_printed_at) return { label: "Mark Shipped", action: "ship" }
    return null
  }

  const s: Record<string, React.CSSProperties> = {
    card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px", flex: 1, minWidth: 0 },
    stepNum: { width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 },
    tab: { padding: "6px 16px", borderRadius: 6, border: "1px solid #e5e7eb", cursor: "pointer", fontSize: 13, fontWeight: 500, background: "#f9fafb", color: "#374151" },
    tabActive: { padding: "6px 16px", borderRadius: 6, border: "1px solid #1c1915", cursor: "pointer", fontSize: 13, fontWeight: 600, background: "#1c1915", color: "#fff" },
    btn: { padding: "4px 12px", borderRadius: 6, border: "1px solid #e5e7eb", cursor: "pointer", fontSize: 12, fontWeight: 500, background: "#fff", color: "#374151" },
    btnPrimary: { padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: "#d4a54a", color: "#fff" },
    btnDanger: { padding: "4px 10px", borderRadius: 6, border: "1px solid #fca5a5", cursor: "pointer", fontSize: 12, fontWeight: 500, background: "#fff", color: "#ef4444" },
    th: { textAlign: "left" as const, padding: "6px 12px 6px 0", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.05em", borderBottom: "1px solid #e5e7eb" },
    td: { padding: "8px 12px 8px 0", fontSize: 13, borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" as const },
  }
  const badge = (color: string): React.CSSProperties => ({ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, color, background: color + "18", border: `1px solid ${color}40` })

  return (
    <div style={{ marginBottom: 24 }}>
      {/* SECTION 1: Next Steps */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#6b7280", textTransform: "uppercase", marginBottom: 10 }}>
          Next Steps
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {/* Step 1: Winner emails */}
          <div style={{ ...s.card }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ ...s.stepNum, background: "#dcfce7", color: "#16a34a" }}>1</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Winner Emails</span>
            </div>
            <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 500 }}>✓ Sent automatically</div>
          </div>

          {/* Step 2: Payments */}
          <div style={{ ...s.card }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ ...s.stepNum, background: allPaid ? "#dcfce7" : "#fee2e2", color: allPaid ? "#16a34a" : "#dc2626" }}>2</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Payments</span>
            </div>
            <div style={{ fontSize: 12, color: allPaid ? "#16a34a" : "#dc2626", fontWeight: 500 }}>
              {summary.paid}/{totalBiddable} paid
              {summary.unpaid > 0 && ` · ${summary.unpaid} pending`}
              {summary.refunded > 0 && (
                <span style={{ color: "#7c3aed", marginLeft: summary.unpaid > 0 ? 0 : undefined }}>
                  {summary.unpaid > 0 ? "" : " · "}{summary.refunded} refunded
                </span>
              )}
            </div>
          </div>

          {/* Step 3: Pack & Ship */}
          <div style={{ ...s.card }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ ...s.stepNum, background: !allPaid ? "#f3f4f6" : allShipped ? "#dcfce7" : "#fef3c7", color: !allPaid ? "#9ca3af" : allShipped ? "#16a34a" : "#d97706" }}>3</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: !allPaid ? "#9ca3af" : "#374151" }}>Pack &amp; Ship</span>
            </div>
            <div style={{ fontSize: 12, color: !allPaid ? "#9ca3af" : allShipped ? "#16a34a" : "#d97706", fontWeight: 500 }}>
              {summary.shipped}/{summary.paid} shipped
            </div>
          </div>

          {/* Step 4: Archive */}
          <div style={{ ...s.card }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ ...s.stepNum, background: "#f3f4f6", color: "#9ca3af" }}>4</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Archive Block</span>
            </div>
            {(allShipped || summary.paid === 0) ? (
              <button style={s.btnPrimary} onClick={onArchive}>Archive now →</button>
            ) : (
              <div style={{ fontSize: 12, color: "#9ca3af" }}>Available when all shipped</div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: Lots Table */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        {/* Tab header */}
        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderBottom: "1px solid #e5e7eb", alignItems: "center" }}>
          <button
            style={activeTab === "won" ? s.tabActive : s.tab}
            onClick={() => setActiveTab("won")}
          >
            Won ({wonLots.length})
          </button>
          <button
            style={activeTab === "nobid" ? s.tabActive : s.tab}
            onClick={() => setActiveTab("nobid")}
          >
            No Bid ({noBidLots.length})
          </button>
        </div>

        <div style={{ padding: "12px 16px" }}>
          {/* Won lots */}
          {activeTab === "won" && (
            <>
              {wonLots.length === 0 ? (
                <div style={{ color: "#9ca3af", fontSize: 13, padding: "16px 0" }}>No won lots.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={s.th}>Lot #</th>
                      <th style={s.th}>Release</th>
                      <th style={s.th}>Winner</th>
                      <th style={s.th}>Amount</th>
                      <th style={s.th}>Status</th>
                      <th style={s.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wonLots.map(lot => {
                      const txStatus = getTxStatusLabel(lot)
                      const primaryAction = getPrimaryAction(lot)
                      const hasTx = !!lot.transaction
                      const isLoadingThis = actionLoading === lot.transaction?.id
                      return (
                        <tr
                          key={lot.id}
                          style={{ cursor: hasTx ? "pointer" : "default" }}
                          onClick={() => hasTx && window.open(`/app/transactions/${lot.transaction!.id}`, "_blank")}
                        >
                          <td style={s.td}>
                            <span style={{ fontFamily: "monospace", fontSize: 12, color: "#6b7280" }}>
                              #{String(lot.lot_number).padStart(2, "0")}
                            </span>
                          </td>
                          <td style={s.td}>
                            <div style={{ maxWidth: 200 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lot.artist_name}</div>
                              <div style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lot.release_title}</div>
                            </div>
                          </td>
                          <td style={s.td}>
                            {lot.winner ? (
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 500, color: "#111827" }}>{lot.winner.name}</div>
                                <div style={{ fontSize: 11, color: "#6b7280" }}>{lot.winner.email}</div>
                              </div>
                            ) : <span style={{ color: "#9ca3af" }}>—</span>}
                          </td>
                          <td style={s.td}>
                            <span style={{ fontWeight: 600, color: "#374151", fontSize: 13 }}>
                              {lot.final_price != null ? `€${Number(lot.final_price).toFixed(2)}` : "—"}
                            </span>
                          </td>
                          <td style={s.td}>
                            <span style={badge(txStatus.color)}>{txStatus.label}</span>
                          </td>
                          <td style={{ ...s.td, whiteSpace: "nowrap" as const }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              {primaryAction && lot.transaction && (
                                <button
                                  style={{ ...s.btnPrimary, opacity: isLoadingThis ? 0.6 : 1 }}
                                  disabled={isLoadingThis}
                                  onClick={() => onHandleAction(lot.transaction!.id, primaryAction.action)}
                                >
                                  {isLoadingThis ? "…" : primaryAction.label}
                                </button>
                              )}
                              {lot.transaction?.status === "paid" && (
                                <button
                                  style={{ ...s.btnDanger, opacity: isLoadingThis ? 0.6 : 1 }}
                                  disabled={isLoadingThis}
                                  onClick={() => onHandleAction(lot.transaction!.id, "refund")}
                                >
                                  Refund
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* No-bid lots */}
          {activeTab === "nobid" && (
            <>
              {noBidLots.length === 0 ? (
                <div style={{ color: "#9ca3af", fontSize: 13, padding: "16px 0" }}>All lots received bids.</div>
              ) : (
                <>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={s.th}>Lot #</th>
                        <th style={s.th}>Release</th>
                        <th style={{ ...s.th, textAlign: "right" as const }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {noBidLots.map(lot => (
                        <tr key={lot.id}>
                          <td style={s.td}>
                            <span style={{ fontFamily: "monospace", fontSize: 12, color: "#6b7280" }}>
                              #{String(lot.lot_number).padStart(2, "0")}
                            </span>
                          </td>
                          <td style={s.td}>
                            <div style={{ maxWidth: 280 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lot.artist_name}</div>
                              <div style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lot.release_title}</div>
                            </div>
                          </td>
                          <td style={{ ...s.td, textAlign: "right" as const }}>
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <button style={s.btnPrimary} onClick={() => onOpenRelistModal(lot)}>Relist →</button>
                              <button style={s.btn} onClick={() => onMakeAvailable(lot.id)}>Make Available</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {noBidLots.length > 1 && (
                    <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #f3f4f6" }}>
                      <button style={s.btn} onClick={onMakeAllAvailable}>
                        Make all {noBidLots.length} available
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Relist Modal */}
      {relistModal.open && relistModal.lot && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 10, padding: 28, width: 440, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#111827" }}>Relist Lot</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
              {relistModal.lot.artist_name} — {relistModal.lot.release_title}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 14px", borderRadius: 6, border: `2px solid ${relistTarget === "available" ? "#d4a54a" : "#e5e7eb"}`, background: relistTarget === "available" ? "#fffbf0" : "#fff" }}>
                <input type="radio" name="relistTarget" value="available" checked={relistTarget === "available"} onChange={() => setRelistTarget("available")} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Make Available</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Return to catalog, available for future auctions</div>
                </div>
              </label>

              {availableBlocks.length > 0 && availableBlocks.map(ab => (
                <label key={ab.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 14px", borderRadius: 6, border: `2px solid ${relistTarget === ab.id ? "#d4a54a" : "#e5e7eb"}`, background: relistTarget === ab.id ? "#fffbf0" : "#fff" }}>
                  <input type="radio" name="relistTarget" value={ab.id} checked={relistTarget === ab.id} onChange={() => setRelistTarget(ab.id)} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{ab.title}</div>
                    <div style={{ fontSize: 11, color: "#6b7280", textTransform: "capitalize" }}>{ab.status}</div>
                  </div>
                </label>
              ))}

              {availableBlocks.length === 0 && relistTarget === "available" && (
                <div style={{ fontSize: 12, color: "#9ca3af", padding: "8px 0" }}>No draft or scheduled blocks available.</div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={s.btn} onClick={onRelistCancel}>Cancel</button>
              <button
                style={{ ...s.btnPrimary, opacity: relistLoading ? 0.6 : 1 }}
                disabled={relistLoading}
                onClick={onRelistConfirm}
              >
                {relistLoading ? "…" : "Confirm →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const BlockDetailPage = () => {
  const { id } = useParams()
  const isNew = id === "create"

  const [block, setBlock] = useState<Partial<AuctionBlock>>({
    title: "",
    subtitle: "",
    slug: "",
    status: "draft",
    block_type: "theme",
    start_time: "",
    end_time: "",
    short_description: "",
    long_description: "",
    header_image: "",
    staggered_ending: false,
    stagger_interval_seconds: 120,
    default_start_price_percent: 50,
    auto_extend: true,
    extension_minutes: 3,
    max_extensions: 10,
    items: [],
  })
  const [saving, setSaving] = useState(false)
  const [sendingNewsletter, setSendingNewsletter] = useState(false)
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState<"success" | "error">("success")
  const [editingUnlocked, setEditingUnlocked] = useState(false)

  const isFormLocked = block.status === "active" && !editingUnlocked

  // Live bids panel (active auctions)
  const [liveBids, setLiveBids] = useState<any[]>([])
  const liveBidsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchLiveBids = useCallback(async () => {
    if (!id || isNew) return
    try {
      const res = await fetch(`/admin/auction-blocks/${id}/live-bids`, { credentials: "include" })
      const data = await res.json()
      setLiveBids(data.items || [])
    } catch (err) {
      console.error("Failed to fetch live bids:", err)
    }
  }, [id, isNew])

  // Bids log (all bids, all statuses)
  const [bidsLog, setBidsLog] = useState<any[]>([])
  const [bidsLogTotal, setBidsLogTotal] = useState(0)

  const fetchBidsLog = useCallback(async () => {
    if (!id || isNew) return
    try {
      const res = await fetch(`/admin/auction-blocks/${id}/bids-log?limit=300`, { credentials: "include" })
      const data = await res.json()
      setBidsLog(data.bids || [])
      setBidsLogTotal(data.total || 0)
    } catch (err) {
      console.error("Failed to fetch bids log:", err)
    }
  }, [id, isNew])

  // Post-auction analytics
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState("")
  const [noBidLotsExpanded, setNoBidLotsExpanded] = useState(false)

  // Ended state dashboard
  const [postAuctionData, setPostAuctionData] = useState<PostAuctionResponse | null>(null)
  const [postAuctionLoading, setPostAuctionLoading] = useState(false)

  // Accordion open/closed (for ended blocks)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [editFormOpen, setEditFormOpen] = useState(false)

  // Relist modal
  const [relistModal, setRelistModal] = useState<{ open: boolean; lot: PostAuctionLot | null }>({ open: false, lot: null })
  const [availableBlocks, setAvailableBlocks] = useState<{ id: string; title: string; status: string }[]>([])
  const [relistTarget, setRelistTarget] = useState<string>("available")
  const [relistLoading, setRelistLoading] = useState(false)

  // Transaction action loading
  const [txActionLoading, setTxActionLoading] = useState<string | null>(null)

  const fetchAnalytics = useCallback(async () => {
    if (!id || isNew) return
    setAnalyticsLoading(true)
    setAnalyticsError("")
    try {
      const res = await fetch(`/admin/auction-blocks/${id}/analytics`, { credentials: "include" })
      const data = await res.json()
      if (res.ok) {
        setAnalyticsData(data)
      } else {
        setAnalyticsError(data.message || "Failed to load analytics")
      }
    } catch (err) {
      setAnalyticsError(`Error: ${err}`)
    } finally {
      setAnalyticsLoading(false)
    }
  }, [id, isNew])

  const fetchPostAuction = useCallback(async () => {
    if (!id || isNew) return
    setPostAuctionLoading(true)
    try {
      const r = await fetch(`/admin/auction-blocks/${id}/post-auction`, { credentials: "include" })
      if (r.ok) setPostAuctionData(await r.json())
    } catch { /* silent */ } finally {
      setPostAuctionLoading(false)
    }
  }, [id, isNew])

  const fetchAvailableBlocksForRelist = useCallback(async () => {
    try {
      const r = await fetch("/admin/auction-blocks?limit=50", { credentials: "include" })
      const data = await r.json()
      const blocks = (data.auction_blocks || []).filter(
        (b: any) => (b.status === "draft" || b.status === "scheduled") && b.id !== id
      )
      setAvailableBlocks(blocks)
    } catch { /* silent */ }
  }, [id])

  useEffect(() => {
    if (block.status === "active") {
      fetchLiveBids()
      fetchBidsLog()
      liveBidsIntervalRef.current = setInterval(() => {
        fetchLiveBids()
        fetchBidsLog()
      }, 10000)
    } else {
      if (liveBidsIntervalRef.current) clearInterval(liveBidsIntervalRef.current)
      // Fetch log once for non-active blocks (ended, draft etc.)
      if (block.status) fetchBidsLog()
    }
    // Fetch analytics for ended/archived blocks
    if (block.status === "ended" || block.status === "archived") {
      fetchAnalytics()
      fetchPostAuction()
    }
    return () => {
      if (liveBidsIntervalRef.current) clearInterval(liveBidsIntervalRef.current)
    }
  }, [block.status, fetchLiveBids, fetchBidsLog, fetchAnalytics, fetchPostAuction])

  // Release search & browser
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Release[]>([])
  const [searchCount, setSearchCount] = useState(0)
  const [searchOffset, setSearchOffset] = useState(0)
  const [searching, setSearching] = useState(false)
  const [onlyAvailable, setOnlyAvailable] = useState(true)
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")

  // Browser filters
  const [filtersData, setFiltersData] = useState<FiltersData | null>(null)
  const [selectedFormats, setSelectedFormats] = useState<string[]>([])
  const [selectedCountry, setSelectedCountry] = useState("")
  const [yearFrom, setYearFrom] = useState("")
  const [yearTo, setYearTo] = useState("")
  const [labelSearch, setLabelSearch] = useState("")
  const [sortBy, setSortBy] = useState("title_asc")
  const [browseMode, setBrowseMode] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch block data
  useEffect(() => {
    if (!isNew) {
      fetch(`/admin/auction-blocks/${id}`, { credentials: "include" })
        .then((r) => r.json())
        .then((data) => setBlock(data.auction_block))
        .catch(console.error)
    }
  }, [id, isNew])

  // Fetch filter options
  useEffect(() => {
    if (!isNew) {
      fetch(`/admin/releases/filters`, { credentials: "include" })
        .then((r) => r.json())
        .then((data) => setFiltersData(data))
        .catch(console.error)
    }
  }, [isNew])

  const showMessage = (text: string, type: "success" | "error" = "success") => {
    setMessage(text)
    setMessageType(type)
    if (type === "success") setTimeout(() => setMessage(""), 3000)
  }

  // Auto-generate slug from title
  const handleTitleChange = (title: string) => {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s]+/g, "-")
      .slice(0, 200)
    setBlock((b) => ({ ...b, title, slug }))
  }

  // Save block
  const handleSave = async () => {
    if (!block.title?.trim()) {
      showMessage("Title is required", "error")
      return
    }
    if (block.start_time && block.end_time && new Date(block.start_time) >= new Date(block.end_time)) {
      showMessage("Start time must be before end time", "error")
      return
    }

    setSaving(true)
    setMessage("")
    try {
      const url = isNew
        ? "/admin/auction-blocks"
        : `/admin/auction-blocks/${id}`
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(block),
      })
      const data = await res.json()
      if (res.ok) {
        showMessage("Saved!")
        if (isNew && data.auction_block?.id) {
          window.location.href = `/app/auction-blocks/${data.auction_block.id}`
        }
      } else {
        showMessage(data.message || "Unknown error", "error")
      }
    } catch (err) {
      showMessage(`Error: ${err}`, "error")
    } finally {
      setSaving(false)
    }
  }

  // Status change
  const handleStatusChange = async (newStatus: string) => {
    const labels: Record<string, string> = {
      scheduled: "Schedule block? It will be activated automatically at start time.",
      active: "Activate block now? Bidding will be possible immediately.",
      preview: "Set block to preview? Customers can see items but cannot bid yet.",
      archived: "Archive block?",
    }
    if (!window.confirm(labels[newStatus] || `Change status to "${newStatus}"?`)) return

    try {
      const res = await fetch(`/admin/auction-blocks/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (res.ok) {
        setBlock(data.auction_block)
        showMessage(`Status changed: ${STATUS_LABELS[newStatus] || newStatus}`)
      } else {
        showMessage(data.message || "Status change failed", "error")
      }
    } catch (err) {
      showMessage(`Error: ${err}`, "error")
    }
  }

  const handleSendNewsletter = async () => {
    if (!window.confirm("Send a newsletter announcement for this auction block to all subscribers?")) return
    setSendingNewsletter(true)
    try {
      const templateId = window.prompt("Enter Brevo template ID for the announcement email:")
      if (!templateId) {
        setSendingNewsletter(false)
        return
      }
      const res = await fetch("/admin/newsletter/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "block_announcement",
          block_id: id,
          templateId: Number(templateId),
          subject: `New Auction: ${block.title}`,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        showMessage("Newsletter announcement sent successfully!")
      } else {
        showMessage(data.message || "Failed to send newsletter", "error")
      }
    } catch (err) {
      showMessage(`Error: ${err}`, "error")
    } finally {
      setSendingNewsletter(false)
    }
  }

  // Build search URL from all filters
  const buildSearchUrl = useCallback((offset: number) => {
    let url = `/admin/releases?limit=20&offset=${offset}`
    if (searchQuery.trim()) url += `&q=${encodeURIComponent(searchQuery)}`
    if (selectedFormats.length === 1) {
      url += `&format=${encodeURIComponent(selectedFormats[0])}`
    } else if (selectedFormats.length > 1) {
      // API supports single format — use first selected for now
      url += `&format=${encodeURIComponent(selectedFormats[0])}`
    }
    if (selectedCountry) url += `&country=${encodeURIComponent(selectedCountry)}`
    if (yearFrom) url += `&year_from=${yearFrom}`
    if (yearTo) url += `&year_to=${yearTo}`
    if (labelSearch.trim()) url += `&label=${encodeURIComponent(labelSearch)}`
    if (onlyAvailable) url += `&auction_status=available`
    if (sortBy) url += `&sort=${sortBy}`
    return url
  }, [searchQuery, selectedFormats, selectedCountry, yearFrom, yearTo, labelSearch, onlyAvailable, sortBy])

  // Search releases
  const handleSearch = useCallback(async (append = false) => {
    setSearching(true)
    const offset = append ? searchOffset : 0
    try {
      const url = buildSearchUrl(offset)
      const res = await fetch(url, { credentials: "include" })
      const data = await res.json()

      if (append) {
        setSearchResults((prev) => [...prev, ...(data.releases || [])])
      } else {
        setSearchResults(data.releases || [])
      }
      setSearchCount(data.count || 0)
      setSearchOffset(offset + 20)
      setBrowseMode(true)
    } catch (err) {
      console.error(err)
    } finally {
      setSearching(false)
    }
  }, [buildSearchUrl, searchOffset])

  // Auto-search when filters change (debounced)
  const triggerFilterSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      handleSearch(false)
    }, 300)
  }, [handleSearch])

  // Watch filter changes for auto-search (only when browse mode is active)
  useEffect(() => {
    if (browseMode) {
      triggerFilterSearch()
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [selectedFormats, selectedCountry, yearFrom, yearTo, onlyAvailable, sortBy])

  // Toggle format in multi-select
  const toggleFormat = (fmt: string) => {
    setSelectedFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]
    )
  }

  // Add release to block
  const handleAddItem = async (release: Release) => {
    if (isNew) {
      showMessage("Save block first before adding items.", "error")
      return
    }
    try {
      const res = await fetch(`/admin/auction-blocks/${id}/items`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          release_id: release.id,
          start_price: release.estimated_value
            ? release.estimated_value * (block.default_start_price_percent || 50) / 100
            : 1,
          estimated_value: release.estimated_value,
          lot_number: (block.items?.length || 0) + 1,
        }),
      })
      if (res.ok) {
        const blockRes = await fetch(`/admin/auction-blocks/${id}`, { credentials: "include" })
        const data = await blockRes.json()
        setBlock(data.auction_block)
        setSearchResults((prev) => prev.filter((r) => r.id !== release.id))
        showMessage("Product added!")
      } else {
        const data = await res.json()
        showMessage(data.message || "Error adding product", "error")
      }
    } catch (err) {
      showMessage(`Error: ${err}`, "error")
    }
  }

  // Remove item from block
  const handleRemoveItem = async (itemId: string) => {
    if (!window.confirm("Remove product from block?")) return
    try {
      await fetch(`/admin/auction-blocks/${id}/items/${itemId}`, {
        method: "DELETE",
        credentials: "include",
      })
      setBlock((b) => ({
        ...b,
        items: b.items?.filter((i) => i.id !== itemId),
      }))
      showMessage("Product removed")
    } catch (err) {
      console.error(err)
    }
  }

  // Update item field
  const handleItemFieldChange = async (
    itemId: string,
    field: string,
    value: number | null
  ) => {
    try {
      await fetch(`/admin/auction-blocks/${id}/items/${itemId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      setBlock((b) => ({
        ...b,
        items: b.items?.map((i) =>
          i.id === itemId ? { ...i, [field]: value } : i
        ),
      }))
    } catch (err) {
      console.error(err)
    }
  }

  // Check if release is already in this block
  const isInBlock = (releaseId: string) =>
    block.items?.some((i) => i.release_id === releaseId) || false

  // Unique years from filtersData for dropdowns
  const yearOptions = filtersData?.years?.map((y) => Number(y.value)) || []

  // --- Bulk Price Editor state ---
  const [bulkPanelOpen, setBulkPanelOpen] = useState(false)
  const [bulkMode, setBulkMode] = useState<"percentage" | "fixed" | "manual">("percentage")
  const [bulkPercentage, setBulkPercentage] = useState(20)
  const [bulkFixed, setBulkFixed] = useState(1.00)
  const [bulkApplying, setBulkApplying] = useState(false)
  // Manual mode: track pending price changes keyed by item id
  const [manualPrices, setManualPrices] = useState<Record<string, number>>({})
  const [manualSaving, setManualSaving] = useState(false)

  // Count how many items have an estimated_value (for preview text)
  const itemsWithEstValue = (block.items || []).filter(
    (i) => i.estimated_value != null && Number(i.estimated_value) > 0
  ).length
  const itemsWithoutEstValue = (block.items?.length || 0) - itemsWithEstValue

  // Refresh block items from API
  const refreshBlock = async () => {
    if (!id || isNew) return
    const res = await fetch(`/admin/auction-blocks/${id}`, { credentials: "include" })
    const data = await res.json()
    setBlock(data.auction_block)
  }

  // Apply bulk price (percentage or fixed)
  const handleBulkApply = async () => {
    if (!id || isNew) return
    if (bulkMode === "manual") return

    if (bulkMode === "percentage" && (bulkPercentage <= 0 || bulkPercentage > 1000)) {
      showMessage("Percentage must be between 1 and 1000", "error")
      return
    }
    if (bulkMode === "fixed" && bulkFixed <= 0) {
      showMessage("Fixed price must be > 0", "error")
      return
    }

    const confirmMsg =
      bulkMode === "percentage"
        ? `Set all lot start prices to ${bulkPercentage}% of their estimated value? This will skip ${itemsWithoutEstValue} lot(s) without an estimated value.`
        : `Set all ${block.items?.length || 0} lot start prices to €${bulkFixed.toFixed(2)}?`

    if (!window.confirm(confirmMsg)) return

    setBulkApplying(true)
    try {
      const body =
        bulkMode === "percentage"
          ? { rule: "percentage", value: bulkPercentage }
          : { rule: "fixed", value: bulkFixed }

      const res = await fetch(`/admin/auction-blocks/${id}/items/bulk-price`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        showMessage(`Updated ${data.updated} lot(s)${data.skipped > 0 ? `, skipped ${data.skipped} (no estimated value)` : ""}.`)
        await refreshBlock()
        setBulkPanelOpen(false)
      } else {
        showMessage(data.message || "Bulk update failed", "error")
      }
    } catch (err) {
      showMessage(`Error: ${err}`, "error")
    } finally {
      setBulkApplying(false)
    }
  }

  // Save manual price changes
  const handleManualSave = async () => {
    if (!id || isNew) return
    const changed = Object.entries(manualPrices).filter(([, price]) => price > 0)
    if (changed.length === 0) {
      showMessage("No price changes to save", "error")
      return
    }

    setManualSaving(true)
    try {
      const items = changed.map(([itemId, start_price]) => ({ id: itemId, start_price }))
      const res = await fetch(`/admin/auction-blocks/${id}/items/bulk-price`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      if (res.ok) {
        showMessage(`Saved ${data.updated} price change(s).`)
        setManualPrices({})
        await refreshBlock()
        setBulkPanelOpen(false)
      } else {
        showMessage(data.message || "Save failed", "error")
      }
    } catch (err) {
      showMessage(`Error: ${err}`, "error")
    } finally {
      setManualSaving(false)
    }
  }

  const handleTransactionAction = useCallback(async (txId: string, action: string) => {
    setTxActionLoading(txId)
    try {
      const r = await fetch(`/admin/transactions/${txId}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await fetchPostAuction()
    } catch (e: any) {
      alert(`Action failed: ${e.message}`)
    } finally {
      setTxActionLoading(null)
    }
  }, [fetchPostAuction])

  const handleMakeAvailable = async (lotId: string) => {
    if (!window.confirm("Set this lot back to available? It will be removed from this block.")) return
    try {
      await fetch(`/admin/auction-blocks/${id}/items/${lotId}`, {
        method: "DELETE", credentials: "include"
      })
      setPostAuctionData(prev => prev ? {
        ...prev,
        lots: prev.lots.filter(l => l.id !== lotId)
      } : null)
      showMessage("Lot set to available")
    } catch { showMessage("Error", "error") }
  }

  const handleMakeAllAvailable = async () => {
    const noBidLots = postAuctionData?.lots.filter(l => !l.winner) || []
    if (!noBidLots.length) return
    if (!window.confirm(`Make all ${noBidLots.length} no-bid lots available? They will be removed from this block.`)) return
    try {
      await Promise.all(noBidLots.map(l =>
        fetch(`/admin/auction-blocks/${id}/items/${l.id}`, { method: "DELETE", credentials: "include" })
      ))
      setPostAuctionData(prev => prev ? { ...prev, lots: prev.lots.filter(l => !!l.winner) } : null)
      showMessage(`${noBidLots.length} lots set to available`)
    } catch { showMessage("Error making lots available", "error") }
  }

  const openRelistModal = (lot: PostAuctionLot) => {
    fetchAvailableBlocksForRelist()
    setRelistTarget("available")
    setRelistModal({ open: true, lot })
  }

  const handleRelistConfirm = async () => {
    const lot = relistModal.lot
    if (!lot) return
    setRelistLoading(true)
    try {
      if (relistTarget === "available") {
        // Delete directly (no confirm — user already confirmed in the modal)
        await fetch(`/admin/auction-blocks/${id}/items/${lot.id}`, { method: "DELETE", credentials: "include" })
        setPostAuctionData(prev => prev ? { ...prev, lots: prev.lots.filter(l => l.id !== lot.id) } : null)
        showMessage("Lot set to available")
      } else {
        await fetch(`/admin/auction-blocks/${relistTarget}/items`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ release_id: lot.release_id, start_price: lot.final_price || 1 })
        })
        await fetch(`/admin/auction-blocks/${id}/items/${lot.id}`, { method: "DELETE", credentials: "include" })
        setPostAuctionData(prev => prev ? { ...prev, lots: prev.lots.filter(l => l.id !== lot.id) } : null)
        showMessage("Lot relisted successfully")
      }
      setRelistModal({ open: false, lot: null })
    } catch { showMessage("Error relisting lot", "error") } finally {
      setRelistLoading(false)
    }
  }

  return (
    <Container>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 20, display: "flex", alignItems: "center", gap: 6 }}>
        <button
          onClick={() => (window.location.href = "/app/auction-blocks")}
          style={{ color: "#6b7280", textDecoration: "none", cursor: "pointer", background: "none", border: "none", padding: 0, fontSize: 12 }}
          onMouseEnter={e => (e.currentTarget.style.color = "#111827")}
          onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}
        >
          ← Auction Blocks
        </button>
        {!isNew && block.title && (
          <>
            <span style={{ color: "#d1d5db" }}>›</span>
            <span style={{ color: "#374151", fontWeight: 500 }}>{block.title}</span>
          </>
        )}
      </div>

      {/* Header with title, status badge, and action buttons */}
      <div className="flex flex-wrap items-start justify-between mb-6 gap-3">
        <div className="flex items-center gap-3">
          <div>
            <Heading level="h1">
              {isNew ? "Create New Block" : block.title}
            </Heading>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {!isNew && block.status && (
                <Badge color={STATUS_COLORS[block.status] || "grey"}>
                  {STATUS_LABELS[block.status] || block.status}
                </Badge>
              )}
              {!isNew && block.staggered_ending && (
                <Badge color="blue">
                  ⏱ Staggered ({block.stagger_interval_seconds >= 60
                    ? Math.round(block.stagger_interval_seconds / 60) + "m"
                    : block.stagger_interval_seconds + "s"} intervals)
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {!isNew && block.status === "draft" && (
            <Button
              variant="primary"
              onClick={() => handleStatusChange("scheduled")}
            >
              Schedule
            </Button>
          )}
          {!isNew && block.status === "scheduled" && (
            <>
              <Button onClick={() => handleStatusChange("active")}>
                Activate Now
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleStatusChange("preview")}
              >
                Preview
              </Button>
            </>
          )}
          {!isNew && block.status === "preview" && (
            <Button onClick={() => handleStatusChange("active")}>
              Activate Now
            </Button>
          )}
          {!isNew && block.status === "ended" && (
            <Button
              variant="secondary"
              onClick={() => handleStatusChange("archived")}
            >
              Archive
            </Button>
          )}

          {!isNew && (block.status === "scheduled" || block.status === "active" || block.status === "preview") && (
            <Button
              variant="secondary"
              onClick={handleSendNewsletter}
              isLoading={sendingNewsletter}
            >
              Send Newsletter
            </Button>
          )}

          {!isNew && block.slug && (
            <a
              href={`https://vod-auctions.com/auctions/${block.slug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="secondary">Storefront</Button>
            </a>
          )}

          <a href="/app/auction-blocks">
            <Button variant="secondary">Back</Button>
          </a>
          <Button onClick={handleSave} isLoading={saving}>
            Save
          </Button>
        </div>
      </div>

      {/* Message banner */}
      {message && (
        <div
          className={`mb-4 p-3 rounded ${
            messageType === "error"
              ? "bg-red-950 border border-red-800 text-red-300"
              : "bg-green-950 border border-green-800 text-green-300"
          }`}
        >
          <Text>{message}</Text>
        </div>
      )}

      {/* Ended State Dashboard */}
      {!isNew && block.status === "ended" && (
        <EndedStateDashboard
          block={block}
          postAuctionData={postAuctionData}
          postAuctionLoading={postAuctionLoading}
          onMakeAvailable={handleMakeAvailable}
          onMakeAllAvailable={handleMakeAllAvailable}
          onOpenRelistModal={openRelistModal}
          onHandleAction={handleTransactionAction}
          actionLoading={txActionLoading}
          relistModal={relistModal}
          availableBlocks={availableBlocks}
          relistTarget={relistTarget}
          setRelistTarget={setRelistTarget}
          onRelistConfirm={handleRelistConfirm}
          onRelistCancel={() => setRelistModal({ open: false, lot: null })}
          relistLoading={relistLoading}
          onArchive={() => handleStatusChange("archived")}
        />
      )}

      {/* Live Bids Panel — only when active */}
      {!isNew && block.status === "active" && (
        <Container className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Heading level="h2">Live Bids</Heading>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-green-400 text-xs font-medium">LIVE · auto-refresh 10s</span>
              </span>
            </div>
            <button
              onClick={fetchLiveBids}
              className="text-xs text-ui-fg-subtle hover:text-ui-fg-base underline"
            >
              Refresh now
            </button>
          </div>

          {liveBids.length === 0 ? (
            <Text className="text-ui-fg-subtle">No bids yet.</Text>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ui-border-base text-ui-fg-subtle text-xs uppercase tracking-wide">
                    <th className="text-left pb-2 pr-4">Lot</th>
                    <th className="text-left pb-2 pr-4">Item</th>
                    <th className="text-right pb-2 pr-4">Start</th>
                    <th className="text-right pb-2 pr-4">Current</th>
                    <th className="text-center pb-2 pr-4">Bids</th>
                    <th className="text-left pb-2 pr-4">Leader</th>
                    <th className="text-right pb-2">Ends in</th>
                  </tr>
                </thead>
                <tbody>
                  {liveBids.map((item: any) => {
                    const endTime = item.lot_end_time
                    return (
                      <tr key={item.id} className="border-b border-ui-border-base/50 hover:bg-ui-bg-subtle/50">
                        <td className="py-2 pr-4 text-ui-fg-subtle">#{item.lot_number || "—"}</td>
                        <td className="py-2 pr-4 max-w-[180px]">
                          <span className="truncate block text-ui-fg-base">{item.release_title || item.id}</span>
                        </td>
                        <td className="py-2 pr-4 text-right text-ui-fg-subtle">€{Number(item.start_price).toFixed(2)}</td>
                        <td className="py-2 pr-4 text-right">
                          <span className={item.bid_count > 0 ? "text-green-400 font-semibold" : "text-ui-fg-subtle"}>
                            €{Number(item.current_price || item.start_price).toFixed(2)}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-center">
                          {item.bid_count > 0 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-xs font-bold">
                              {item.bid_count}
                            </span>
                          ) : (
                            <span className="text-ui-fg-subtle">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          {item.winning_bid ? (
                            <span className="text-ui-fg-base">{item.winning_bid.user_hint}</span>
                          ) : (
                            <span className="text-ui-fg-subtle text-xs">No bids</span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          {endTime ? (
                            <LiveItemCountdown endTime={endTime} />
                          ) : (
                            <span className="text-ui-fg-subtle text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Container>
      )}

      {/* Post-Auction Analytics — shown for ended (accordion) + archived (always open) blocks */}
      {!isNew && block.status === "ended" && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setAnalyticsOpen(o => !o)}
            style={{
              width: "100%", textAlign: "left", padding: "12px 20px",
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: analyticsOpen ? "8px 8px 0 0" : 8,
              cursor: "pointer", fontWeight: 600, fontSize: 13, display: "flex",
              justifyContent: "space-between", alignItems: "center",
            }}
          >
            Post-Auction Analytics
            <span>{analyticsOpen ? "▲" : "▼"}</span>
          </button>
          {analyticsOpen && (
            <div style={{ border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden", padding: 16, marginBottom: 8 }}>
              <div className="flex items-center justify-between mb-5">
                <Heading level="h2">Post-Auction Analytics</Heading>
                <button
                  onClick={fetchAnalytics}
                  className="text-xs text-ui-fg-subtle hover:text-ui-fg-base underline"
                >
                  Refresh
                </button>
              </div>

          {analyticsLoading && (
            <Text className="text-ui-fg-subtle text-sm">Loading analytics…</Text>
          )}

          {analyticsError && (
            <Text className="text-red-400 text-sm">{analyticsError}</Text>
          )}

          {!analyticsLoading && !analyticsError && analyticsData && (
            <div className="space-y-6">

              {/* Summary stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-4 bg-ui-bg-subtle rounded-lg border border-ui-border-base">
                  <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide mb-1">Conversion Rate</Text>
                  <p className="text-2xl font-bold text-[#d4a54a]">{analyticsData.conversion_rate.toFixed(1)}%</p>
                  <Text className="text-ui-fg-muted text-xs mt-1">
                    {analyticsData.lots_sold} of {analyticsData.total_lots} lots sold
                  </Text>
                </div>
                <div className="p-4 bg-ui-bg-subtle rounded-lg border border-ui-border-base">
                  <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide mb-1">Total Revenue</Text>
                  <p className="text-2xl font-bold">€{analyticsData.total_revenue.toFixed(2)}</p>
                  <Text className="text-ui-fg-muted text-xs mt-1">
                    Ø €{analyticsData.avg_hammer_price.toFixed(2)} per lot
                  </Text>
                </div>
                <div className="p-4 bg-ui-bg-subtle rounded-lg border border-ui-border-base">
                  <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide mb-1">Total Bids</Text>
                  <p className="text-2xl font-bold">{analyticsData.total_bids}</p>
                  <Text className="text-ui-fg-muted text-xs mt-1">
                    {analyticsData.lots_with_bids} lots had bids
                  </Text>
                </div>
                <div className="p-4 bg-ui-bg-subtle rounded-lg border border-ui-border-base">
                  <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide mb-1">Avg Price Multiple</Text>
                  <p className="text-2xl font-bold">{analyticsData.avg_price_multiple.toFixed(2)}x</p>
                  <Text className="text-ui-fg-muted text-xs mt-1">
                    Ø start €{analyticsData.avg_start_price.toFixed(2)}
                  </Text>
                </div>
              </div>

              {/* Top performers table */}
              {analyticsData.top_lots.length > 0 && (
                <div>
                  <Heading level="h3" className="text-sm font-semibold mb-3 text-ui-fg-subtle uppercase tracking-wide">
                    Top Performers (by price multiple)
                  </Heading>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-ui-border-base text-ui-fg-subtle text-xs uppercase tracking-wide">
                          <th className="text-left pb-2 pr-4 font-medium">Lot</th>
                          <th className="text-left pb-2 pr-4 font-medium">Release</th>
                          <th className="text-right pb-2 pr-4 font-medium">Start</th>
                          <th className="text-right pb-2 pr-4 font-medium">Hammer</th>
                          <th className="text-right pb-2 pr-4 font-medium">Multiple</th>
                          <th className="text-center pb-2 pr-4 font-medium">Bids</th>
                          <th className="text-left pb-2 font-medium">Winner</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.top_lots.map((lot, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-ui-border-base/40 hover:bg-ui-bg-subtle/40"
                          >
                            <td className="py-2 pr-4 text-ui-fg-subtle text-xs font-mono">
                              #{String(lot.lot_number ?? "—").padStart(2, "0")}
                            </td>
                            <td className="py-2 pr-4">
                              <div className="flex items-center gap-2">
                                {lot.release_cover ? (
                                  <img
                                    src={lot.release_cover}
                                    alt=""
                                    className="w-7 h-7 object-cover rounded shrink-0"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="w-7 h-7 bg-ui-bg-subtle rounded shrink-0" />
                                )}
                                <span className="text-ui-fg-base text-xs max-w-[200px] truncate block">
                                  {lot.release_title}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 pr-4 text-right text-ui-fg-subtle text-xs">
                              €{lot.start_price.toFixed(2)}
                            </td>
                            <td className="py-2 pr-4 text-right">
                              <span className="text-green-400 font-semibold text-sm">
                                €{lot.hammer_price.toFixed(2)}
                              </span>
                            </td>
                            <td className="py-2 pr-4 text-right">
                              <Badge color={lot.price_multiple >= 3 ? "green" : lot.price_multiple >= 1.5 ? "orange" : "grey"}>
                                {lot.price_multiple.toFixed(2)}x
                              </Badge>
                            </td>
                            <td className="py-2 pr-4 text-center">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-ui-bg-subtle text-ui-fg-base text-xs font-bold">
                                {lot.bid_count}
                              </span>
                            </td>
                            <td className="py-2 text-ui-fg-base text-xs">
                              {lot.winning_bidder_hint || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Bid distribution */}
              <div>
                <Heading level="h3" className="text-sm font-semibold mb-3 text-ui-fg-subtle uppercase tracking-wide">
                  Bid Distribution
                </Heading>
                <div className="flex flex-wrap gap-3">
                  {(["1", "2-5", "6-10", "10+"] as const).map((bucket) => {
                    const count = analyticsData.bid_distribution[bucket]
                    return (
                      <div key={bucket} className="flex items-center gap-2 px-3 py-2 bg-ui-bg-subtle rounded border border-ui-border-base">
                        <span className="text-xs text-ui-fg-subtle font-medium">{bucket} bid{bucket === "1" ? "" : "s"}:</span>
                        <span className="text-sm font-bold text-ui-fg-base">{count}</span>
                        <span className="text-xs text-ui-fg-muted">
                          {analyticsData.total_lots > 0
                            ? `(${Math.round((count / analyticsData.total_lots) * 100)}%)`
                            : ""}
                        </span>
                      </div>
                    )
                  })}
                  {analyticsData.lots_unsold > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-950/40 rounded border border-red-900/50">
                      <span className="text-xs text-red-400 font-medium">No bids:</span>
                      <span className="text-sm font-bold text-red-300">{analyticsData.no_bid_lots.length}</span>
                      <span className="text-xs text-red-500">
                        {analyticsData.total_lots > 0
                          ? `(${Math.round((analyticsData.no_bid_lots.length / analyticsData.total_lots) * 100)}%)`
                          : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* No-bid lots (collapsible) */}
              {analyticsData.no_bid_lots.length > 0 && (
                <div>
                  <button
                    onClick={() => setNoBidLotsExpanded((v) => !v)}
                    className="flex items-center gap-2 text-sm text-ui-fg-subtle hover:text-ui-fg-base group"
                  >
                    <span className={`transition-transform ${noBidLotsExpanded ? "rotate-90" : ""}`}>▶</span>
                    <span className="font-medium">
                      {analyticsData.no_bid_lots.length} lot{analyticsData.no_bid_lots.length !== 1 ? "s" : ""} received no bids
                    </span>
                    <Badge color="red">{analyticsData.no_bid_lots.length}</Badge>
                  </button>

                  {noBidLotsExpanded && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-ui-border-base text-ui-fg-subtle text-xs uppercase tracking-wide">
                            <th className="text-left pb-2 pr-4 font-medium">Lot</th>
                            <th className="text-left pb-2 pr-4 font-medium">Release</th>
                            <th className="text-right pb-2 font-medium">Start Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsData.no_bid_lots.map((lot, idx) => (
                            <tr key={idx} className="border-b border-ui-border-base/30 hover:bg-ui-bg-subtle/30">
                              <td className="py-1.5 pr-4 text-ui-fg-subtle text-xs font-mono">
                                #{String(lot.lot_number ?? "—").padStart(2, "0")}
                              </td>
                              <td className="py-1.5 pr-4">
                                <div className="flex items-center gap-2">
                                  {lot.release_cover ? (
                                    <img
                                      src={lot.release_cover}
                                      alt=""
                                      className="w-6 h-6 object-cover rounded shrink-0"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="w-6 h-6 bg-ui-bg-subtle rounded shrink-0" />
                                  )}
                                  <span className="text-ui-fg-base text-xs max-w-[240px] truncate block">
                                    {lot.release_title}
                                  </span>
                                </div>
                              </td>
                              <td className="py-1.5 text-right text-ui-fg-subtle text-xs">
                                €{lot.start_price.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
            </div>
          )}
        </div>
      )}

      {/* Post-Auction Analytics — shown for archived blocks (always open) */}
      {!isNew && block.status === "archived" && (
        <Container className="mb-6">
          <div className="flex items-center justify-between mb-5">
            <Heading level="h2">Post-Auction Analytics</Heading>
            <button
              onClick={fetchAnalytics}
              className="text-xs text-ui-fg-subtle hover:text-ui-fg-base underline"
            >
              Refresh
            </button>
          </div>

          {analyticsLoading && (
            <Text className="text-ui-fg-subtle text-sm">Loading analytics…</Text>
          )}

          {analyticsError && (
            <Text className="text-red-400 text-sm">{analyticsError}</Text>
          )}

          {!analyticsLoading && !analyticsError && analyticsData && (
            <div className="space-y-6">

              {/* Summary stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-4 bg-ui-bg-subtle rounded-lg border border-ui-border-base">
                  <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide mb-1">Conversion Rate</Text>
                  <p className="text-2xl font-bold text-[#d4a54a]">{analyticsData.conversion_rate.toFixed(1)}%</p>
                  <Text className="text-ui-fg-muted text-xs mt-1">
                    {analyticsData.lots_sold} of {analyticsData.total_lots} lots sold
                  </Text>
                </div>
                <div className="p-4 bg-ui-bg-subtle rounded-lg border border-ui-border-base">
                  <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide mb-1">Total Revenue</Text>
                  <p className="text-2xl font-bold">€{analyticsData.total_revenue.toFixed(2)}</p>
                  <Text className="text-ui-fg-muted text-xs mt-1">
                    Ø €{analyticsData.avg_hammer_price.toFixed(2)} per lot
                  </Text>
                </div>
                <div className="p-4 bg-ui-bg-subtle rounded-lg border border-ui-border-base">
                  <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide mb-1">Total Bids</Text>
                  <p className="text-2xl font-bold">{analyticsData.total_bids}</p>
                  <Text className="text-ui-fg-muted text-xs mt-1">
                    {analyticsData.lots_with_bids} lots had bids
                  </Text>
                </div>
                <div className="p-4 bg-ui-bg-subtle rounded-lg border border-ui-border-base">
                  <Text className="text-ui-fg-subtle text-xs uppercase tracking-wide mb-1">Avg Price Multiple</Text>
                  <p className="text-2xl font-bold">{analyticsData.avg_price_multiple.toFixed(2)}x</p>
                  <Text className="text-ui-fg-muted text-xs mt-1">
                    Ø start €{analyticsData.avg_start_price.toFixed(2)}
                  </Text>
                </div>
              </div>

              {/* Top performers table */}
              {analyticsData.top_lots.length > 0 && (
                <div>
                  <Heading level="h3" className="text-sm font-semibold mb-3 text-ui-fg-subtle uppercase tracking-wide">
                    Top Performers (by price multiple)
                  </Heading>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-ui-border-base text-ui-fg-subtle text-xs uppercase tracking-wide">
                          <th className="text-left pb-2 pr-4 font-medium">Lot</th>
                          <th className="text-left pb-2 pr-4 font-medium">Release</th>
                          <th className="text-right pb-2 pr-4 font-medium">Start</th>
                          <th className="text-right pb-2 pr-4 font-medium">Hammer</th>
                          <th className="text-right pb-2 pr-4 font-medium">Multiple</th>
                          <th className="text-center pb-2 pr-4 font-medium">Bids</th>
                          <th className="text-left pb-2 font-medium">Winner</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.top_lots.map((lot, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-ui-border-base/40 hover:bg-ui-bg-subtle/40"
                          >
                            <td className="py-2 pr-4 text-ui-fg-subtle text-xs font-mono">
                              #{String(lot.lot_number ?? "—").padStart(2, "0")}
                            </td>
                            <td className="py-2 pr-4">
                              <div className="flex items-center gap-2">
                                {lot.release_cover ? (
                                  <img
                                    src={lot.release_cover}
                                    alt=""
                                    className="w-7 h-7 object-cover rounded shrink-0"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="w-7 h-7 bg-ui-bg-subtle rounded shrink-0" />
                                )}
                                <span className="text-ui-fg-base text-xs max-w-[200px] truncate block">
                                  {lot.release_title}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 pr-4 text-right text-ui-fg-subtle text-xs">
                              €{lot.start_price.toFixed(2)}
                            </td>
                            <td className="py-2 pr-4 text-right">
                              <span className="text-green-400 font-semibold text-sm">
                                €{lot.hammer_price.toFixed(2)}
                              </span>
                            </td>
                            <td className="py-2 pr-4 text-right">
                              <Badge color={lot.price_multiple >= 3 ? "green" : lot.price_multiple >= 1.5 ? "orange" : "grey"}>
                                {lot.price_multiple.toFixed(2)}x
                              </Badge>
                            </td>
                            <td className="py-2 pr-4 text-center">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-ui-bg-subtle text-ui-fg-base text-xs font-bold">
                                {lot.bid_count}
                              </span>
                            </td>
                            <td className="py-2 text-ui-fg-base text-xs">
                              {lot.winning_bidder_hint || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Bid distribution */}
              <div>
                <Heading level="h3" className="text-sm font-semibold mb-3 text-ui-fg-subtle uppercase tracking-wide">
                  Bid Distribution
                </Heading>
                <div className="flex flex-wrap gap-3">
                  {(["1", "2-5", "6-10", "10+"] as const).map((bucket) => {
                    const count = analyticsData.bid_distribution[bucket]
                    return (
                      <div key={bucket} className="flex items-center gap-2 px-3 py-2 bg-ui-bg-subtle rounded border border-ui-border-base">
                        <span className="text-xs text-ui-fg-subtle font-medium">{bucket} bid{bucket === "1" ? "" : "s"}:</span>
                        <span className="text-sm font-bold text-ui-fg-base">{count}</span>
                        <span className="text-xs text-ui-fg-muted">
                          {analyticsData.total_lots > 0
                            ? `(${Math.round((count / analyticsData.total_lots) * 100)}%)`
                            : ""}
                        </span>
                      </div>
                    )
                  })}
                  {analyticsData.lots_unsold > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-950/40 rounded border border-red-900/50">
                      <span className="text-xs text-red-400 font-medium">No bids:</span>
                      <span className="text-sm font-bold text-red-300">{analyticsData.no_bid_lots.length}</span>
                      <span className="text-xs text-red-500">
                        {analyticsData.total_lots > 0
                          ? `(${Math.round((analyticsData.no_bid_lots.length / analyticsData.total_lots) * 100)}%)`
                          : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* No-bid lots (collapsible) */}
              {analyticsData.no_bid_lots.length > 0 && (
                <div>
                  <button
                    onClick={() => setNoBidLotsExpanded((v) => !v)}
                    className="flex items-center gap-2 text-sm text-ui-fg-subtle hover:text-ui-fg-base group"
                  >
                    <span className={`transition-transform ${noBidLotsExpanded ? "rotate-90" : ""}`}>▶</span>
                    <span className="font-medium">
                      {analyticsData.no_bid_lots.length} lot{analyticsData.no_bid_lots.length !== 1 ? "s" : ""} received no bids
                    </span>
                    <Badge color="red">{analyticsData.no_bid_lots.length}</Badge>
                  </button>

                  {noBidLotsExpanded && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-ui-border-base text-ui-fg-subtle text-xs uppercase tracking-wide">
                            <th className="text-left pb-2 pr-4 font-medium">Lot</th>
                            <th className="text-left pb-2 pr-4 font-medium">Release</th>
                            <th className="text-right pb-2 font-medium">Start Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsData.no_bid_lots.map((lot, idx) => (
                            <tr key={idx} className="border-b border-ui-border-base/30 hover:bg-ui-bg-subtle/30">
                              <td className="py-1.5 pr-4 text-ui-fg-subtle text-xs font-mono">
                                #{String(lot.lot_number ?? "—").padStart(2, "0")}
                              </td>
                              <td className="py-1.5 pr-4">
                                <div className="flex items-center gap-2">
                                  {lot.release_cover ? (
                                    <img
                                      src={lot.release_cover}
                                      alt=""
                                      className="w-6 h-6 object-cover rounded shrink-0"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="w-6 h-6 bg-ui-bg-subtle rounded shrink-0" />
                                  )}
                                  <span className="text-ui-fg-base text-xs max-w-[240px] truncate block">
                                    {lot.release_title}
                                  </span>
                                </div>
                              </td>
                              <td className="py-1.5 text-right text-ui-fg-subtle text-xs">
                                €{lot.start_price.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </Container>
      )}

      {/* Lock banner for active auctions */}
      {!isNew && block.status === "active" && (
        <div className={`mb-4 p-3 rounded flex items-center justify-between ${
          editingUnlocked
            ? "bg-orange-950 border border-orange-700 text-orange-300"
            : "bg-yellow-950 border border-yellow-800 text-yellow-300"
        }`}>
          <Text>
            {editingUnlocked
              ? "⚠️ Editing unlocked — changes affect a live auction."
              : "🔒 Editing locked — auction is currently live."}
          </Text>
          <button
            onClick={() => setEditingUnlocked((v) => !v)}
            className="ml-4 px-3 py-1 rounded border text-xs font-medium border-current hover:opacity-80"
          >
            {editingUnlocked ? "Lock again" : "Unlock editing"}
          </button>
        </div>
      )}

      {/* Block Details + Settings accordion header — only for ended blocks */}
      {!isNew && block.status === "ended" && (
        <div style={{ marginBottom: 8 }}>
          <button
            onClick={() => setEditFormOpen(o => !o)}
            style={{
              width: "100%", textAlign: "left", padding: "12px 20px",
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: editFormOpen ? "8px 8px 0 0" : 8,
              cursor: "pointer", fontWeight: 600, fontSize: 13, display: "flex",
              justifyContent: "space-between", alignItems: "center",
            }}
          >
            Block Details &amp; Settings
            <span>{editFormOpen ? "▲" : "▼"}</span>
          </button>
        </div>
      )}

      {/* Block Details Form — shown when not ended, or when ended+accordion open */}
      {(isNew || block.status !== "ended" || editFormOpen) && (
      <div style={(!isNew && block.status === "ended" && editFormOpen) ? { border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "16px 0", marginBottom: 16 } : {}}>
      <>
      {/* Block Details Form */}
      <Container className="mb-6">
        <Heading level="h2" className="mb-4">
          Block Details
        </Heading>
        <div className={isFormLocked ? "opacity-60 pointer-events-none select-none" : ""}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Title *</Label>
            <Input
              value={block.title || ""}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. Industrial Classics 1980-1985"
              disabled={isFormLocked}
            />
          </div>
          <div>
            <Label>Slug</Label>
            <Input
              value={block.slug || ""}
              onChange={(e) => setBlock((b) => ({ ...b, slug: e.target.value }))}
              disabled={isFormLocked}
            />
          </div>
          <div>
            <Label>Subtitle</Label>
            <Input
              value={block.subtitle || ""}
              onChange={(e) =>
                setBlock((b) => ({ ...b, subtitle: e.target.value }))
              }
              placeholder="Optional subtitle"
              disabled={isFormLocked}
            />
          </div>
          <div>
            <Label>Block Type</Label>
            <Select
              value={block.block_type || "theme"}
              onValueChange={(val) =>
                !isFormLocked && setBlock((b) => ({ ...b, block_type: val }))
              }
            >
              <Select.Trigger disabled={isFormLocked}>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {BLOCK_TYPES.map((t) => (
                  <Select.Item key={t.value} value={t.value}>
                    {t.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div>
            <Label>Start *</Label>
            <Input
              type="datetime-local"
              value={block.start_time?.slice(0, 16) || ""}
              onChange={(e) =>
                setBlock((b) => ({ ...b, start_time: e.target.value }))
              }
              disabled={isFormLocked}
            />
          </div>
          <div>
            <Label>End *</Label>
            <Input
              type="datetime-local"
              value={block.end_time?.slice(0, 16) || ""}
              onChange={(e) =>
                setBlock((b) => ({ ...b, end_time: e.target.value }))
              }
              disabled={isFormLocked}
            />
          </div>
        </div>

        <div className="mt-4">
          <Label>Short Description</Label>
          <Textarea
            value={block.short_description || ""}
            onChange={(e) =>
              setBlock((b) => ({ ...b, short_description: e.target.value }))
            }
            placeholder="Max 300 characters"
            rows={2}
          />
        </div>
        <div className="mt-4">
          <Label>Long Description</Label>
          <RichTextEditor
            content={block.long_description || ""}
            onChange={(html) =>
              setBlock((b) => ({ ...b, long_description: html }))
            }
            placeholder="Editorial content for the block..."
          />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div>
            <Label>Header Image URL</Label>
            <Input
              value={block.header_image || ""}
              onChange={(e) =>
                setBlock((b) => ({ ...b, header_image: e.target.value }))
              }
              placeholder="https://..."
            />
          </div>
          <div>
            <Label>Video URL</Label>
            <Input
              value={block.video_url || ""}
              onChange={(e) =>
                setBlock((b) => ({ ...b, video_url: e.target.value }))
              }
              placeholder="YouTube/Vimeo URL"
            />
          </div>
          <div>
            <Label>Audio URL</Label>
            <Input
              value={block.audio_url || ""}
              onChange={(e) =>
                setBlock((b) => ({ ...b, audio_url: e.target.value }))
              }
            />
          </div>
        </div>
        </div>{/* end isFormLocked wrapper */}
      </Container>

      {/* Settings */}
      <Container className="mb-6">
        <Heading level="h2" className="mb-4">
          Settings
        </Heading>
        <div className={`grid grid-cols-4 gap-4 ${isFormLocked ? "opacity-60 pointer-events-none select-none" : ""}`}>
          <div>
            <Label>Start Price % of Estimated Value</Label>
            <Input
              type="number"
              value={block.default_start_price_percent || 50}
              onChange={(e) =>
                setBlock((b) => ({
                  ...b,
                  default_start_price_percent: parseInt(e.target.value),
                }))
              }
            />
          </div>
          <div>
            <Label>Auto-Extend on Late Bids</Label>
            <div className="flex items-center gap-2 mt-1.5">
              <input
                type="checkbox"
                id="auto_extend"
                checked={block.auto_extend !== false}
                onChange={(e) =>
                  setBlock((b) => ({ ...b, auto_extend: e.target.checked }))
                }
                className="w-4 h-4 accent-ui-fg-interactive"
              />
              <label htmlFor="auto_extend" className="text-sm text-ui-fg-subtle">
                Extend if bid in last N minutes
              </label>
            </div>
          </div>
          {block.auto_extend !== false && (
            <>
              <div>
                <Label>Extension Minutes (1–10)</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={block.extension_minutes || 3}
                  onChange={(e) =>
                    setBlock((b) => ({
                      ...b,
                      extension_minutes: parseInt(e.target.value),
                    }))
                  }
                />
              </div>
              <div>
                <Label>Max Extensions (1–20)</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={block.max_extensions || 10}
                  onChange={(e) =>
                    setBlock((b) => ({
                      ...b,
                      max_extensions: parseInt(e.target.value),
                    }))
                  }
                />
              </div>
            </>
          )}
          <div>
            <Label>Staggered Lot Endings</Label>
            <div className="flex items-center gap-2 mt-1.5">
              <input
                type="checkbox"
                id="staggered_ending"
                checked={block.staggered_ending === true}
                onChange={(e) =>
                  setBlock((b) => ({ ...b, staggered_ending: e.target.checked }))
                }
                className="w-4 h-4 accent-ui-fg-interactive"
              />
              <label htmlFor="staggered_ending" className="text-sm text-ui-fg-subtle">
                Lots end sequentially instead of all at once
              </label>
            </div>
          </div>
          {block.staggered_ending === true && (
            <>
              <div>
                <Label>Interval Between Lots (seconds)</Label>
                <Input
                  type="number"
                  min={30}
                  max={600}
                  value={block.stagger_interval_seconds || 120}
                  onChange={(e) =>
                    setBlock((b) => ({
                      ...b,
                      stagger_interval_seconds: parseInt(e.target.value),
                    }))
                  }
                />
                <Text className="text-ui-fg-muted text-xs mt-1">
                  Lot #1 ends at block end time. Each subsequent lot ends X seconds later.
                </Text>
              </div>
              {block.items.length > 1 && (
                <div className="col-span-2 flex items-start">
                  <div className="bg-ui-bg-subtle rounded-md p-3 text-sm text-ui-fg-subtle w-full">
                    With {block.items.length} lots and {block.stagger_interval_seconds || 120}s interval, the last lot ends{" "}
                    <strong className="text-ui-fg-base">
                      {Math.round((block.items.length - 1) * (block.stagger_interval_seconds || 120) / 60)} min
                    </strong>{" "}
                    after block end time.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Container>
      </>
      </div>
      )}

      {/* Product Browser — only for existing blocks */}
      {!isNew && (
        <>
          <Container className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <Heading level="h2">
                Product Browser
              </Heading>
              {filtersData && (
                <Text className="text-ui-fg-subtle text-sm">
                  {filtersData.total.toLocaleString("en-US")} releases in catalog
                </Text>
              )}
            </div>

            {/* Search bar */}
            <div className="flex gap-2 mb-3">
              <Input
                className="flex-1"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search releases (title, artist, catalog number)..."
              />
              <Button onClick={() => handleSearch()} isLoading={searching}>
                Search
              </Button>
              {!browseMode && (
                <Button
                  variant="secondary"
                  onClick={() => handleSearch()}
                >
                  Browse All
                </Button>
              )}
            </div>

            {/* Filter bar */}
            <div className="border border-ui-border-base rounded-lg p-3 mb-4 bg-ui-bg-subtle">
              {/* Row 1: Format pills */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="text-xs text-ui-fg-subtle self-center mr-1 font-medium">Format:</span>
                {filtersData?.formats?.map((f) => {
                  const isActive = selectedFormats.includes(String(f.value))
                  return (
                    <button
                      key={String(f.value)}
                      onClick={() => toggleFormat(String(f.value))}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-ui-fg-base text-ui-bg-base"
                          : "bg-ui-bg-base text-ui-fg-subtle border border-ui-border-base hover:border-ui-fg-muted"
                      }`}
                    >
                      {String(f.value)} ({Number(f.count).toLocaleString("en-US")})
                    </button>
                  )
                })}
                {selectedFormats.length > 0 && (
                  <button
                    onClick={() => setSelectedFormats([])}
                    className="px-2 py-1 text-xs text-ui-fg-subtle hover:text-ui-fg-base"
                  >
                    ✕ Reset
                  </button>
                )}
              </div>

              {/* Row 2: Country, Year, Label, Sort, Available */}
              <div className="flex flex-wrap gap-3 items-end">
                {/* Country */}
                <div className="w-44">
                  <label className="text-xs text-ui-fg-subtle font-medium mb-1 block">Country</label>
                  <select
                    value={selectedCountry}
                    onChange={(e) => setSelectedCountry(e.target.value)}
                    className="w-full h-8 px-2 text-sm rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base"
                  >
                    <option value="">All Countries</option>
                    {filtersData?.countries?.map((c) => (
                      <option key={String(c.value)} value={String(c.value)}>
                        {String(c.value)} ({Number(c.count).toLocaleString("en-US")})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Year from */}
                <div className="w-28">
                  <label className="text-xs text-ui-fg-subtle font-medium mb-1 block">Year From</label>
                  <select
                    value={yearFrom}
                    onChange={(e) => setYearFrom(e.target.value)}
                    className="w-full h-8 px-2 text-sm rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base"
                  >
                    <option value="">—</option>
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                {/* Year to */}
                <div className="w-28">
                  <label className="text-xs text-ui-fg-subtle font-medium mb-1 block">Year To</label>
                  <select
                    value={yearTo}
                    onChange={(e) => setYearTo(e.target.value)}
                    className="w-full h-8 px-2 text-sm rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base"
                  >
                    <option value="">—</option>
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                {/* Label search */}
                <div className="w-44">
                  <label className="text-xs text-ui-fg-subtle font-medium mb-1 block">Label</label>
                  <input
                    type="text"
                    value={labelSearch}
                    onChange={(e) => setLabelSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Search label..."
                    className="w-full h-8 px-2 text-sm rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base placeholder:text-ui-fg-muted"
                  />
                </div>

                {/* Sort */}
                <div className="w-36">
                  <label className="text-xs text-ui-fg-subtle font-medium mb-1 block">Sort</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full h-8 px-2 text-sm rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base"
                  >
                    {SORT_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Only available */}
                <label className="flex items-center gap-1.5 text-xs cursor-pointer self-end pb-1">
                  <input
                    type="checkbox"
                    checked={onlyAvailable}
                    onChange={(e) => setOnlyAvailable(e.target.checked)}
                    className="rounded"
                  />
                  Available only
                </label>

                {/* Reset all filters */}
                {(selectedFormats.length > 0 || selectedCountry || yearFrom || yearTo || labelSearch) && (
                  <button
                    onClick={() => {
                      setSelectedFormats([])
                      setSelectedCountry("")
                      setYearFrom("")
                      setYearTo("")
                      setLabelSearch("")
                    }}
                    className="text-xs text-ui-fg-subtle hover:text-ui-fg-base self-end pb-1 underline"
                  >
                    Reset all filters
                  </button>
                )}
              </div>
            </div>

            {/* Results header */}
            {browseMode && (
              <div className="flex items-center justify-between mb-3">
                <Text className="text-sm font-medium">
                  {searchCount.toLocaleString("en-US")} releases found
                </Text>
                <div className="flex gap-1">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      viewMode === "grid"
                        ? "bg-ui-fg-base text-ui-bg-base"
                        : "bg-ui-bg-base text-ui-fg-subtle border border-ui-border-base"
                    }`}
                  >
                    ▦ Grid
                  </button>
                  <button
                    onClick={() => setViewMode("table")}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      viewMode === "table"
                        ? "bg-ui-fg-base text-ui-bg-base"
                        : "bg-ui-bg-base text-ui-fg-subtle border border-ui-border-base"
                    }`}
                  >
                    ☰ Table
                  </button>
                </div>
              </div>
            )}

            {/* Grid View */}
            {searchResults.length > 0 && viewMode === "grid" && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {searchResults.map((r) => {
                    const alreadyInBlock = isInBlock(r.id)
                    return (
                      <div
                        key={r.id}
                        className={`group relative rounded-lg border overflow-hidden transition-all ${
                          alreadyInBlock
                            ? "border-green-600 bg-green-950/20"
                            : "border-ui-border-base bg-ui-bg-base hover:border-ui-fg-muted hover:shadow-md"
                        }`}
                      >
                        {/* Cover image */}
                        <div className="aspect-square bg-ui-bg-subtle relative overflow-hidden">
                          {r.coverImage ? (
                            <img
                              src={r.coverImage}
                              alt={r.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-ui-fg-muted">
                              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <path d="M21 15l-5-5L5 21" />
                              </svg>
                            </div>
                          )}

                          {/* Format badge overlay */}
                          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 text-white text-[10px] font-medium rounded">
                            {r.format}
                          </span>

                          {/* Year badge */}
                          {r.year && (
                            <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-black/70 text-white text-[10px] font-medium rounded">
                              {r.year}
                            </span>
                          )}

                          {/* Add button overlay */}
                          {!alreadyInBlock && (
                            <button
                              onClick={() => handleAddItem(r)}
                              className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <span className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center text-xl font-bold shadow-lg">
                                +
                              </span>
                            </button>
                          )}

                          {/* Already in block indicator */}
                          {alreadyInBlock && (
                            <div className="absolute inset-0 bg-green-900/30 flex items-center justify-center">
                              <span className="px-2 py-1 bg-green-700 text-white text-xs font-medium rounded">
                                In Block
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-2">
                          <p className="text-xs font-medium truncate" title={r.artist_name || undefined}>
                            {r.artist_name || "Unknown"}
                          </p>
                          <p className="text-xs text-ui-fg-subtle truncate" title={r.title}>
                            {r.title}
                          </p>
                          {r.label_name && (
                            <p className="text-[10px] text-ui-fg-muted truncate mt-0.5">
                              {r.label_name}
                            </p>
                          )}
                          {r.estimated_value && (
                            <p className="text-xs font-medium mt-1">
                              ~€{r.estimated_value.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Load more */}
                {searchResults.length < searchCount && (
                  <div className="mt-4 text-center">
                    <Button
                      variant="secondary"
                      onClick={() => handleSearch(true)}
                      isLoading={searching}
                    >
                      Load More ({searchResults.length} / {searchCount.toLocaleString("en-US")})
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* Table View */}
            {searchResults.length > 0 && viewMode === "table" && (
              <>
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Cover</Table.HeaderCell>
                      <Table.HeaderCell>Artist</Table.HeaderCell>
                      <Table.HeaderCell>Title</Table.HeaderCell>
                      <Table.HeaderCell>Label</Table.HeaderCell>
                      <Table.HeaderCell>Format</Table.HeaderCell>
                      <Table.HeaderCell>Year</Table.HeaderCell>
                      <Table.HeaderCell>Est. Value</Table.HeaderCell>
                      <Table.HeaderCell></Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {searchResults.map((r) => {
                      const alreadyInBlock = isInBlock(r.id)
                      return (
                        <Table.Row key={r.id}>
                          <Table.Cell>
                            {r.coverImage ? (
                              <img
                                src={r.coverImage}
                                alt={r.title}
                                className="w-10 h-10 object-cover rounded"
                              />
                            ) : (
                              <div className="w-10 h-10 bg-ui-bg-subtle rounded" />
                            )}
                          </Table.Cell>
                          <Table.Cell>{r.artist_name || "—"}</Table.Cell>
                          <Table.Cell>{r.title}</Table.Cell>
                          <Table.Cell>
                            <span className="text-xs text-ui-fg-subtle">{r.label_name || "—"}</span>
                          </Table.Cell>
                          <Table.Cell>
                            <Badge>{r.format}</Badge>
                          </Table.Cell>
                          <Table.Cell>{r.year || "—"}</Table.Cell>
                          <Table.Cell>
                            {r.estimated_value
                              ? `€${r.estimated_value.toFixed(2)}`
                              : "—"}
                          </Table.Cell>
                          <Table.Cell>
                            {alreadyInBlock ? (
                              <Badge color="green">In Block</Badge>
                            ) : (
                              <IconButton onClick={() => handleAddItem(r)}>
                                <Plus />
                              </IconButton>
                            )}
                          </Table.Cell>
                        </Table.Row>
                      )
                    })}
                  </Table.Body>
                </Table>

                {/* Load more */}
                {searchResults.length < searchCount && (
                  <div className="mt-3 text-center">
                    <Button
                      variant="secondary"
                      onClick={() => handleSearch(true)}
                      isLoading={searching}
                    >
                      Load More ({searchResults.length} / {searchCount.toLocaleString("en-US")})
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* Empty state */}
            {browseMode && searchResults.length === 0 && !searching && (
              <div className="text-center py-8">
                <Text className="text-ui-fg-subtle">
                  No releases found. Try different filters.
                </Text>
              </div>
            )}
          </Container>

          {/* Bids Log */}
          {bidsLogTotal > 0 && (
            <Container className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Heading level="h2">Bids Log</Heading>
                  <span className="text-ui-fg-subtle text-sm">{bidsLogTotal} total</span>
                  {block.status === "active" && (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-green-400 text-xs">live</span>
                    </span>
                  )}
                </div>
                <button
                  onClick={fetchBidsLog}
                  className="text-xs text-ui-fg-subtle hover:text-ui-fg-base underline"
                >
                  Refresh
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ui-border-base text-ui-fg-subtle text-xs uppercase tracking-wide">
                      <th className="text-left pb-2 pr-4 font-medium">Time</th>
                      <th className="text-left pb-2 pr-4 font-medium">Lot</th>
                      <th className="text-left pb-2 pr-4 font-medium">Item</th>
                      <th className="text-right pb-2 pr-4 font-medium">Amount</th>
                      <th className="text-left pb-2 pr-4 font-medium">Bidder</th>
                      <th className="text-left pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bidsLog.map((bid: any) => (
                      <tr
                        key={bid.id}
                        className={`border-b border-ui-border-base/30 hover:bg-ui-bg-subtle/30 ${
                          bid.is_winning ? "bg-green-500/5" : ""
                        }`}
                      >
                        <td className="py-1.5 pr-4 text-ui-fg-subtle text-xs whitespace-nowrap">
                          {new Date(bid.placed_at).toLocaleString("en-GB", {
                            day: "numeric", month: "short",
                            hour: "2-digit", minute: "2-digit", second: "2-digit",
                          })}
                        </td>
                        <td className="py-1.5 pr-4 text-ui-fg-subtle text-xs font-mono">
                          #{String(bid.lot_number ?? "—").padStart(2, "0")}
                        </td>
                        <td className="py-1.5 pr-4">
                          <div className="flex items-center gap-2">
                            {bid.release_cover ? (
                              <img
                                src={bid.release_cover}
                                alt=""
                                className="w-6 h-6 object-cover rounded shrink-0"
                              />
                            ) : (
                              <div className="w-6 h-6 bg-ui-bg-subtle rounded shrink-0" />
                            )}
                            <span className="text-ui-fg-base max-w-[180px] truncate block text-xs">
                              {bid.release_title || bid.item_id}
                            </span>
                          </div>
                        </td>
                        <td className="py-1.5 pr-4 text-right">
                          <span className={`font-medium text-sm ${bid.is_winning ? "text-green-400" : "text-ui-fg-base"}`}>
                            €{Number(bid.amount).toFixed(2)}
                          </span>
                          {bid.max_amount && Number(bid.max_amount) > Number(bid.amount) && (
                            <div className="text-[10px] text-ui-fg-subtle">
                              proxy €{Number(bid.max_amount).toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 pr-4 text-ui-fg-base text-xs">{bid.user_hint}</td>
                        <td className="py-1.5">
                          {bid.is_winning ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-400 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                              Winning
                            </span>
                          ) : bid.is_outbid ? (
                            <span className="text-xs text-ui-fg-subtle">outbid</span>
                          ) : (
                            <span className="text-xs text-ui-fg-subtle">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {bidsLog.length < bidsLogTotal && (
                <p className="mt-3 text-center text-xs text-ui-fg-subtle">
                  Showing {bidsLog.length} of {bidsLogTotal} bids
                </p>
              )}
            </Container>
          )}

          {/* Block Items */}
          <Container>
            <div className="flex items-center justify-between mb-4">
              <Heading level="h2">
                Block Items ({block.items?.length || 0})
              </Heading>
              {/* Bulk Price button — only for editable blocks */}
              {(block.status === "draft" || block.status === "preview") && (block.items?.length || 0) > 0 && (
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => {
                    setBulkPanelOpen((open) => !open)
                    setManualPrices({})
                  }}
                >
                  {bulkPanelOpen ? "Close Bulk Editor" : "Bulk Price"}
                </Button>
              )}
            </div>

            {/* Bulk Price Panel */}
            {bulkPanelOpen && (block.status === "draft" || block.status === "preview") && (
              <div className="mb-6 p-4 border border-ui-border-base rounded-lg bg-ui-bg-subtle space-y-4">
                <p className="text-sm font-semibold text-ui-fg-base">Bulk Start Price Editor</p>

                {/* Mode selector */}
                <div className="flex gap-4">
                  {(["percentage", "fixed", "manual"] as const).map((mode) => (
                    <label key={mode} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="bulkMode"
                        value={mode}
                        checked={bulkMode === mode}
                        onChange={() => {
                          setBulkMode(mode)
                          setManualPrices({})
                        }}
                        className="accent-[#d4a54a]"
                      />
                      <span className="text-sm text-ui-fg-base">
                        {mode === "percentage" && "% of estimated value"}
                        {mode === "fixed" && "Fixed price for all"}
                        {mode === "manual" && "Manual (edit table)"}
                      </span>
                    </label>
                  ))}
                </div>

                {/* Percentage mode */}
                {bulkMode === "percentage" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min={1}
                        max={1000}
                        step={1}
                        className="w-28"
                        value={bulkPercentage}
                        onChange={(e) => setBulkPercentage(Number(e.target.value) || 0)}
                        placeholder="e.g. 20"
                      />
                      <span className="text-sm text-ui-fg-subtle">% of estimated value</span>
                    </div>
                    <p className="text-xs text-ui-fg-subtle">
                      This will update <span className="font-semibold text-ui-fg-base">{itemsWithEstValue}</span> lot(s).
                      {itemsWithoutEstValue > 0 && (
                        <> <span className="text-amber-400">{itemsWithoutEstValue} lot(s) will be skipped</span> (no estimated value).</>
                      )}
                    </p>
                    <Button
                      variant="primary"
                      size="small"
                      onClick={handleBulkApply}
                      isLoading={bulkApplying}
                      disabled={bulkPercentage <= 0 || itemsWithEstValue === 0}
                    >
                      Apply to {itemsWithEstValue} lot(s)
                    </Button>
                  </div>
                )}

                {/* Fixed mode */}
                {bulkMode === "fixed" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-ui-fg-subtle">€</span>
                      <Input
                        type="number"
                        min={0.01}
                        step={0.01}
                        className="w-28"
                        value={bulkFixed}
                        onChange={(e) => setBulkFixed(parseFloat(e.target.value) || 0)}
                        placeholder="e.g. 1.00"
                      />
                    </div>
                    <p className="text-xs text-ui-fg-subtle">
                      This will set all <span className="font-semibold text-ui-fg-base">{block.items?.length || 0}</span> lot(s) to €{bulkFixed > 0 ? bulkFixed.toFixed(2) : "0.00"}.
                    </p>
                    <Button
                      variant="primary"
                      size="small"
                      onClick={handleBulkApply}
                      isLoading={bulkApplying}
                      disabled={bulkFixed <= 0}
                    >
                      Apply to all {block.items?.length || 0} lot(s)
                    </Button>
                  </div>
                )}

                {/* Manual mode instructions */}
                {bulkMode === "manual" && (
                  <div className="space-y-2">
                    <p className="text-xs text-ui-fg-subtle">
                      Edit the Start Price inputs in the table below. Changed values are highlighted.
                      Click <span className="font-semibold text-ui-fg-base">Save All Changes</span> to apply.
                    </p>
                    {Object.keys(manualPrices).length > 0 && (
                      <Button
                        variant="primary"
                        size="small"
                        onClick={handleManualSave}
                        isLoading={manualSaving}
                      >
                        Save {Object.keys(manualPrices).length} Change(s)
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {block.items && block.items.length > 0 ? (
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Lot</Table.HeaderCell>
                    <Table.HeaderCell>Cover</Table.HeaderCell>
                    <Table.HeaderCell>Artist / Title</Table.HeaderCell>
                    <Table.HeaderCell>Format</Table.HeaderCell>
                    <Table.HeaderCell>Est. Value</Table.HeaderCell>
                    <Table.HeaderCell>Start Price</Table.HeaderCell>
                    <Table.HeaderCell>Reserve Price</Table.HeaderCell>
                    <Table.HeaderCell>Buy Now</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                    <Table.HeaderCell></Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {block.items.map((item) => (
                    <Table.Row key={item.id}>
                      <Table.Cell>{item.lot_number || "—"}</Table.Cell>
                      <Table.Cell>
                        {item.release_cover ? (
                          <img
                            src={item.release_cover}
                            alt=""
                            className="w-8 h-8 object-cover rounded"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-ui-bg-subtle rounded" />
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <div className="max-w-48">
                          <p className="text-sm font-medium truncate">
                            {item.release_artist || "—"}
                          </p>
                          <p className="text-xs text-ui-fg-subtle truncate">
                            {item.release_title || item.release_id}
                          </p>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        {item.release_format && (
                          <Badge>{item.release_format}</Badge>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        {item.estimated_value
                          ? `€${item.estimated_value.toFixed(2)}`
                          : "—"}
                      </Table.Cell>
                      <Table.Cell>
                        <Input
                          type="number"
                          step="0.01"
                          className={`w-24${bulkPanelOpen && bulkMode === "manual" && manualPrices[item.id] !== undefined ? " ring-2 ring-[#d4a54a]" : ""}`}
                          value={
                            bulkPanelOpen && bulkMode === "manual" && manualPrices[item.id] !== undefined
                              ? manualPrices[item.id]
                              : item.start_price
                          }
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0
                            if (bulkPanelOpen && bulkMode === "manual") {
                              // Track change locally; only save on "Save All Changes"
                              setManualPrices((prev) => ({ ...prev, [item.id]: val }))
                            } else {
                              // Immediate per-item save (existing behavior)
                              handleItemFieldChange(item.id, "start_price", val)
                            }
                          }}
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Input
                          type="number"
                          step="0.01"
                          className="w-24"
                          value={item.reserve_price ?? ""}
                          placeholder="—"
                          onChange={(e) =>
                            handleItemFieldChange(
                              item.id,
                              "reserve_price",
                              e.target.value ? parseFloat(e.target.value) : null
                            )
                          }
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Input
                          type="number"
                          step="0.01"
                          className="w-24"
                          value={item.buy_now_price ?? ""}
                          placeholder="—"
                          onChange={(e) =>
                            handleItemFieldChange(
                              item.id,
                              "buy_now_price",
                              e.target.value ? parseFloat(e.target.value) : null
                            )
                          }
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color={STATUS_COLORS[item.status] || "grey"}>
                          {item.status}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        {item.status === "reserved" && (
                          <IconButton
                            variant="transparent"
                            onClick={() => handleRemoveItem(item.id)}
                          >
                            <Trash />
                          </IconButton>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            ) : (
              <Text className="text-ui-fg-subtle">
                No products assigned yet. Use the browser above.
              </Text>
            )}
          </Container>
        </>
      )}
    </Container>
  )
}

export default BlockDetailPage
