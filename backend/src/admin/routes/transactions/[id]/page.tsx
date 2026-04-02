import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { useAdminNav } from "../../../components/admin-nav"

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
  refund_amount: number
  status: string
  shipping_status: string
  fulfillment_status: string
  payment_provider: string
  stripe_payment_intent_id: string | null
  paypal_order_id: string | null
  paypal_capture_id: string | null
  tracking_number: string | null
  carrier: string | null
  paid_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  label_printed_at: string | null
  created_at: string
  release_title: string | null
  release_artist: string | null
  article_number: string | null
  block_title: string | null
  block_slug: string | null
  lot_number: number | null
  shipping_name: string | null
  shipping_address_line1: string | null
  shipping_city: string | null
  shipping_postal_code: string | null
  shipping_country: string | null
  billing_name: string | null
  billing_address_line1: string | null
  billing_city: string | null
  billing_postal_code: string | null
  billing_country: string | null
  customer_name: string | null
  customer_email: string | null
  internal_note: string | null
  discount_amount: number | null
  promo_code: string | null
}

type OrderEvent = {
  id: string
  transaction_id: string
  event_type: string
  title: string
  description: string | null
  details?: string | null
  actor: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const CARRIERS = ["DHL", "DPD", "Hermes", "GLS", "UPS", "FedEx", "Deutsche Post"]

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function formatAmount(val: number | null | undefined): string {
  if (val == null) return "€0.00"
  return `€${Number(val).toFixed(2)}`
}

function getShippingZone(country: string | null): string {
  if (!country) return "—"
  const code = country.toUpperCase()
  if (code === "DE") return "DE (domestic)"
  const eu = ["AT","BE","BG","CY","CZ","DK","EE","ES","FI","FR","GR","HR","HU","IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK"]
  if (eu.includes(code)) return "EU"
  return "World"
}

function truncate(str: string | null, len = 12): string {
  if (!str) return "—"
  return str.length > len ? str.slice(0, len) + "…" : str
}

function getFulfillmentStep(tx: Transaction): number {
  if (tx.status !== "paid") return 1
  if (tx.fulfillment_status === "delivered") return 5
  if (tx.fulfillment_status === "shipped") return 4
  if (tx.label_printed_at) return 3
  if (tx.fulfillment_status === "packing") return 2
  return 1
}

function getStepDescription(step: number): { current: string; next: string } {
  switch (step) {
    case 1: return { current: "Payment received — pack the item and prepare for shipping.", next: "Next: Mark as packing" }
    case 2: return { current: "Packing in progress — prepare the item for shipment.", next: "Next: Print shipping label" }
    case 3: return { current: "Label printed — ready to hand off to carrier.", next: "Next: Mark as shipped" }
    case 4: return { current: "Package shipped — waiting for delivery confirmation.", next: "Next: Mark as delivered" }
    case 5: return { current: "Order delivered successfully.", next: "Complete" }
    default: return { current: "Awaiting payment.", next: "—" }
  }
}

function getEventDotColor(eventType: string): string {
  if (eventType === "payment") return "#16a34a"
  if (eventType === "refund" || eventType === "cancellation") return "#dc2626"
  return "#9ca3af"
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = {
  page: {
    padding: "28px 36px",
    background: "transparent",
    minHeight: "100vh",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
    fontSize: 14,
    color: "#d1d5db",
  } as React.CSSProperties,
  breadcrumb: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 20,
    display: "flex",
    alignItems: "center",
    gap: 6,
  } as React.CSSProperties,
  breadcrumbLink: {
    color: "#9ca3af",
    textDecoration: "none",
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 12,
  } as React.CSSProperties,
  sep: { color: "#d1d5db" } as React.CSSProperties,
  orderHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 24,
    flexWrap: "wrap" as const,
    gap: 12,
  } as React.CSSProperties,
  orderNum: {
    fontSize: 22,
    fontWeight: 800,
    color: "#d1d5db",
    fontFamily: "monospace",
  } as React.CSSProperties,
  headerLeft: { display: "flex", flexDirection: "column" as const, gap: 6 } as React.CSSProperties,
  pillRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const } as React.CSSProperties,
  pillPaid: {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "3px 10px", borderRadius: 12,
    fontSize: 11, fontWeight: 700,
    background: "rgba(34,197,94,0.15)", color: "#15803d",
  } as React.CSSProperties,
  pillPending: {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "3px 10px", borderRadius: 12,
    fontSize: 11, fontWeight: 700,
    background: "rgba(245,158,11,0.15)", color: "#b45309",
  } as React.CSSProperties,
  pillRed: {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "3px 10px", borderRadius: 12,
    fontSize: 11, fontWeight: 700,
    background: "rgba(239,68,68,0.15)", color: "#b91c1c",
  } as React.CSSProperties,
  pillBlue: {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "3px 10px", borderRadius: 12,
    fontSize: 11, fontWeight: 700,
    background: "#dbeafe", color: "#1d4ed8",
  } as React.CSSProperties,
  fulfillmentPill: {
    background: "rgba(245,158,11,0.15)", color: "#92400e",
    padding: "3px 10px", borderRadius: 12,
    fontSize: 11, fontWeight: 600,
  } as React.CSSProperties,
  orderMeta: {
    fontSize: 12, color: "#9ca3af",
    display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const,
  } as React.CSSProperties,
  metaSep: { color: "#e5e7eb" } as React.CSSProperties,
  headerActions: { display: "flex", gap: 8, flexWrap: "wrap" as const, alignItems: "center" } as React.CSSProperties,
  btn: (variant: "primary" | "secondary" | "blue" | "danger" | "green") => {
    const base: React.CSSProperties = {
      padding: "7px 13px", borderRadius: 6, fontSize: 12,
      fontWeight: 600, cursor: "pointer", border: "none",
    }
    const variants = {
      primary: { background: "#6366f1", color: "#fff" },
      secondary: { background: "var(--bg-component, #1a1714)", color: "#d1d5db", border: "1px solid rgba(255,255,255,0.1)" },
      blue: { background: "#2563eb", color: "#fff" },
      green: { background: "#16a34a", color: "#fff" },
      danger: { background: "var(--bg-component, #1a1714)", color: "#dc2626", border: "1px solid #fca5a5" },
    }
    return { ...base, ...variants[variant] }
  },
  btnSm: (variant: "primary" | "secondary" | "blue" | "danger" | "green") => {
    const base: React.CSSProperties = {
      padding: "5px 12px", borderRadius: 6, fontSize: 11,
      fontWeight: 600, cursor: "pointer", border: "none",
    }
    const variants = {
      primary: { background: "#6366f1", color: "#fff" },
      secondary: { background: "var(--bg-component, #1a1714)", color: "#d1d5db", border: "1px solid rgba(255,255,255,0.1)" },
      blue: { background: "#2563eb", color: "#fff" },
      green: { background: "#16a34a", color: "#fff" },
      danger: { background: "var(--bg-component, #1a1714)", color: "#dc2626", border: "1px solid #fca5a5" },
    }
    return { ...base, ...variants[variant] }
  },
  actionsBar: {
    background: "var(--bg-component, #1a1714)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
    padding: "16px 20px", display: "flex", alignItems: "center",
    gap: 10, flexWrap: "wrap" as const, marginBottom: 14,
  } as React.CSSProperties,
  actionsLabel: {
    fontSize: 10, fontWeight: 700, color: "#9ca3af",
    textTransform: "uppercase" as const, letterSpacing: "0.06em", marginRight: 4,
  } as React.CSSProperties,
  topGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
    gap: 14, marginBottom: 14,
  } as React.CSSProperties,
  wideGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr",
    gap: 14, marginBottom: 14,
  } as React.CSSProperties,
  panel: {
    background: "var(--bg-component, #1a1714)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10, padding: 18,
  } as React.CSSProperties,
  panelTitle: {
    fontSize: 10, fontWeight: 700, color: "#9ca3af",
    textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 12,
  } as React.CSSProperties,
  infoRow: {
    display: "flex", justifyContent: "space-between",
    padding: "5px 0", borderBottom: "1px solid #f9fafb",
    fontSize: 12,
  } as React.CSSProperties,
  infoLabel: { color: "#9ca3af" } as React.CSSProperties,
  infoValue: { fontWeight: 500, color: "#d1d5db" } as React.CSSProperties,
  infoValueMono: { fontWeight: 500, color: "#d1d5db", fontFamily: "monospace", fontSize: 11 } as React.CSSProperties,
  stepperWrap: {
    display: "flex", alignItems: "center", margin: "12px 0",
  } as React.CSSProperties,
  stepNode: {
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", position: "relative" as const, flex: 1,
  } as React.CSSProperties,
  stepCircle: (state: "done" | "current" | "todo") => {
    const base: React.CSSProperties = {
      width: 28, height: 28, borderRadius: "50%",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 11, fontWeight: 700,
    }
    const states = {
      done: { background: "rgba(34,197,94,0.15)", color: "#15803d", border: "2px solid #16a34a" },
      current: { background: "rgba(245,158,11,0.15)", color: "#b45309", border: "2px solid #d97706" },
      todo: { background: "transparent", color: "#9ca3af", border: "2px solid rgba(255,255,255,0.1)" },
    }
    return { ...base, ...states[state] }
  },
  stepLabel: {
    fontSize: 9, color: "#9ca3af", marginTop: 4,
    textAlign: "center" as const, whiteSpace: "nowrap" as const,
  } as React.CSSProperties,
  stepLine: (done: boolean) => ({
    flex: 1, height: 2,
    background: done ? "#16a34a" : "#e5e7eb",
    margin: "0 4px", marginTop: -12,
  }) as React.CSSProperties,
  stepInfoBox: {
    background: "rgba(245,158,11,0.15)", border: "1px solid #fde68a",
    borderRadius: 6, padding: "10px 14px",
    margin: "12px 0", fontSize: 12, color: "#92400e",
  } as React.CSSProperties,
  auditItem: {
    display: "flex", gap: 12, padding: "10px 0",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  } as React.CSSProperties,
  auditDot: (color: string) => ({
    width: 8, height: 8, borderRadius: "50%",
    background: color, flexShrink: 0, marginTop: 4,
  }) as React.CSSProperties,
  auditTitle: { fontSize: 12, fontWeight: 600, color: "#d1d5db" } as React.CSSProperties,
  auditDetail: { fontSize: 11, color: "#9ca3af", marginTop: 2 } as React.CSSProperties,
  auditTime: { marginLeft: "auto", fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" as const } as React.CSSProperties,
  formBox: {
    background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8, padding: 14, marginTop: 8,
  } as React.CSSProperties,
  input: {
    width: "100%", padding: "6px 10px",
    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
    fontSize: 12, color: "#d1d5db", background: "var(--bg-component, #1a1714)",
    outline: "none",
  } as React.CSSProperties,
  select: {
    width: "100%", padding: "6px 10px",
    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
    fontSize: 12, color: "#d1d5db", background: "var(--bg-component, #1a1714)",
    outline: "none",
  } as React.CSSProperties,
  label: {
    fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 4, display: "block",
  } as React.CSSProperties,
  itemCard: {
    display: "flex", gap: 14, padding: "14px 0",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  } as React.CSSProperties,
  itemCover: {
    width: 60, height: 60, borderRadius: 6,
    background: "transparent", overflow: "hidden",
    flexShrink: 0, display: "flex",
    alignItems: "center", justifyContent: "center",
    color: "#d1d5db", fontSize: 20,
  } as React.CSSProperties,
  link: {
    color: "#6366f1", textDecoration: "none", cursor: "pointer",
    fontSize: 11,
  } as React.CSSProperties,
}

// ── Component ────────────────────────────────────────────────────────────────

const TransactionDetailPage = () => {
  useAdminNav()
  const { id } = useParams<{ id: string }>()
  const [transaction, setTransaction] = useState<Transaction | null>(null)
  const [events, setEvents] = useState<OrderEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Ship form
  const [showShipForm, setShowShipForm] = useState(false)
  const [shipCarrier, setShipCarrier] = useState("")
  const [shipTracking, setShipTracking] = useState("")
  const [shipping, setShipping] = useState(false)

  // Note
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [savingNote, setSavingNote] = useState(false)

  // Cancel form
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [cancelReason, setCancelReason] = useState("")

  // Action loading
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchDetail = async () => {
    try {
      const res = await fetch(`/admin/transactions/${id}`, {
        credentials: "include",
      })
      if (!res.ok) {
        setError("Failed to load transaction")
        return
      }
      const data = await res.json()
      setTransaction(data.transaction || data)
      setEvents(data.events || [])
    } catch (err) {
      console.error("Fetch error:", err)
      setError("Failed to load transaction")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) fetchDetail()
  }, [id])

  const handleShip = async () => {
    if (!transaction) return
    setShipping(true)
    try {
      const res = await fetch(`/admin/transactions/${transaction.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipping_status: "shipped",
          carrier: shipCarrier || undefined,
          tracking_number: shipTracking || undefined,
        }),
      })
      if (res.ok) {
        setShowShipForm(false)
        setShipCarrier("")
        setShipTracking("")
        fetchDetail()
      } else {
        const data = await res.json()
        alert(`Failed: ${data.message || "Unknown error"}`)
      }
    } catch (err) {
      console.error("Ship error:", err)
    } finally {
      setShipping(false)
    }
  }

  const handleDelivered = async () => {
    if (!transaction) return
    setActionLoading("deliver")
    try {
      await fetch(`/admin/transactions/${transaction.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipping_status: "delivered" }),
      })
      fetchDetail()
    } catch (err) {
      console.error("Deliver error:", err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleRefund = async () => {
    if (!transaction) return
    if (!window.confirm("Are you sure you want to refund this order? This will refund the full amount and set the release(s) back to available.")) return
    setActionLoading("refund")
    try {
      const res = await fetch(`/admin/transactions/${transaction.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refund" }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Refund failed: ${data.message}`)
      } else {
        alert(`Refund successful (${data.transactions_refunded} item(s)). Refund: ${data.refund_status}`)
      }
      fetchDetail()
    } catch (err) {
      alert("Refund failed. Check console.")
      console.error("Refund error:", err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancel = async () => {
    if (!transaction) return
    if (!window.confirm("Are you sure you want to cancel this order?")) return
    setActionLoading("cancel")
    try {
      const res = await fetch(`/admin/transactions/${transaction.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel",
          reason: cancelReason || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Cancel failed: ${data.message}`)
      } else {
        setShowCancelForm(false)
        setCancelReason("")
      }
      fetchDetail()
    } catch (err) {
      console.error("Cancel error:", err)
      alert("Cancel failed. Check console.")
    } finally {
      setActionLoading(null)
    }
  }

  const handleAddNote = async () => {
    if (!transaction || !noteText.trim()) return
    setSavingNote(true)
    try {
      const res = await fetch(`/admin/transactions/${transaction.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "note", text: noteText.trim() }),
      })
      if (res.ok) {
        setNoteText("")
        setShowNoteForm(false)
        fetchDetail()
      } else {
        const data = await res.json()
        alert(`Failed: ${data.message || "Unknown error"}`)
      }
    } catch (err) {
      console.error("Note error:", err)
    } finally {
      setSavingNote(false)
    }
  }

  const handlePacking = async () => {
    if (!transaction) return
    setActionLoading("packing")
    try {
      const res = await fetch(`/admin/transactions/${transaction.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "packing" }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(`Failed: ${data.message || "Unknown error"}`)
      } else {
        fetchDetail()
      }
    } catch (err) {
      console.error("Packing error:", err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleLabelPrint = async () => {
    if (!transaction) return
    // Open label PDF in new tab
    window.open(`/admin/transactions/${transaction.id}/shipping-label`, "_blank")
    // Mark label_printed in DB
    try {
      await fetch(`/admin/transactions/${transaction.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "label_printed" }),
      })
      fetchDetail()
    } catch (err) {
      console.error("Label print error:", err)
    }
  }

  // ── Loading / Error states ──

  if (loading) {
    return (
      <div style={s.page}>
        <p style={{ color: "#9ca3af", textAlign: "center", paddingTop: 60 }}>Loading order…</p>
      </div>
    )
  }

  if (error || !transaction) {
    return (
      <div style={s.page}>
        <p style={{ color: "#dc2626", textAlign: "center", paddingTop: 60 }}>
          {error || "Order not found"}
        </p>
      </div>
    )
  }

  // ── Derived values ──

  const tx = transaction
  const fulfillment = tx.fulfillment_status || "unfulfilled"
  const isPaid = tx.status === "paid"
  const isUnfulfilled = fulfillment === "unfulfilled"
  const isPacking = fulfillment === "packing"
  const isShipped = fulfillment === "shipped"
  const isDelivered = fulfillment === "delivered"

  const currentStep = getFulfillmentStep(tx)
  const stepDesc = getStepDescription(currentStep)

  // Status pill style
  const statusPillStyle = (): React.CSSProperties => {
    if (tx.status === "paid") return s.pillPaid
    if (tx.status === "pending") return s.pillPending
    if (tx.status === "cancelled" || tx.status === "failed") return s.pillRed
    if (tx.status === "refunded" || tx.status === "partially_refunded") return s.pillPending
    return s.pillPending
  }

  // Fulfillment pill label
  const fulfillmentPillLabel = (): string => {
    if (!isPaid) return tx.status.charAt(0).toUpperCase() + tx.status.slice(1)
    if (isDelivered) return "Delivered ✓"
    if (isShipped) return "Shipped → Awaiting delivery"
    if (tx.label_printed_at) return "Label printed → Ship it"
    if (isPacking) return "Packing → Print label"
    return "Paid → Pack it"
  }

  const orderTitle = tx.order_number || tx.id.slice(0, 16)
  const itemTypeLabel = tx.item_type === "direct_purchase" ? "Direct Purchase" : "Auction Win"
  const providerLabel = tx.payment_provider
    ? tx.payment_provider.charAt(0).toUpperCase() + tx.payment_provider.slice(1)
    : "—"

  const createdLabel = tx.created_at
    ? new Date(tx.created_at).toLocaleString("de-DE", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      }).replace(",", " ·")
    : "—"

  // Step node state helper
  const stepState = (stepNum: number): "done" | "current" | "todo" => {
    if (stepNum < currentStep) return "done"
    if (stepNum === currentStep) return "current"
    return "todo"
  }

  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  // ── Render ──

  return (
    <div style={s.page}>

      {/* Breadcrumb */}
      <div style={s.breadcrumb}>
        <button
          style={s.breadcrumbLink}
          onClick={() => (window.location.href = "/app/transactions")}
        >
          ← Orders
        </button>
        <span style={s.sep}>›</span>
        <span style={{ color: "#d1d5db", fontWeight: 500 }}>{orderTitle}</span>
      </div>

      {/* Order Header */}
      <div style={s.orderHeader}>
        <div style={s.headerLeft}>
          <div style={s.pillRow}>
            <span style={s.orderNum}>{orderTitle}</span>
            <span style={statusPillStyle()}>
              ● {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
            </span>
            <span style={s.fulfillmentPill}>{fulfillmentPillLabel()}</span>
          </div>
          <div style={s.orderMeta}>
            <span>{itemTypeLabel}</span>
            <span style={s.metaSep}>|</span>
            <span>{providerLabel}</span>
            <span style={s.metaSep}>|</span>
            <span>{createdLabel}</span>
          </div>
        </div>

        <div style={s.headerActions}>
          <button style={s.btn("secondary")} onClick={() => setShowNoteForm(!showNoteForm)}>
            Add Note
          </button>
          {isPaid && (
            <button style={s.btn("blue")} onClick={handleLabelPrint}>
              Print Label ↗
            </button>
          )}
          {isPaid && isUnfulfilled && (
            <button
              style={s.btn("primary")}
              onClick={handlePacking}
              disabled={actionLoading === "packing"}
            >
              {actionLoading === "packing" ? "Updating…" : "Mark Packing"}
            </button>
          )}
          {isPaid && (
            <button
              style={s.btn("danger")}
              onClick={handleRefund}
              disabled={actionLoading === "refund"}
            >
              {actionLoading === "refund" ? "Refunding…" : "Refund"}
            </button>
          )}
        </div>
      </div>

      {/* Note form (collapsible) */}
      {showNoteForm && (
        <div style={{ ...s.formBox, marginBottom: 14 }}>
          <label style={s.label}>Internal note</label>
          {tx.internal_note && (
            <div style={{ marginBottom: 8, padding: "6px 10px", background: "transparent", borderRadius: 6, fontSize: 12, color: "#d1d5db" }}>
              {tx.internal_note}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...s.input, flex: 1 }}
              placeholder="Add a note…"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && noteText.trim()) handleAddNote() }}
            />
            <button
              style={s.btnSm("primary")}
              onClick={handleAddNote}
              disabled={savingNote || !noteText.trim()}
            >
              {savingNote ? "…" : "Save"}
            </button>
            <button
              style={s.btnSm("secondary")}
              onClick={() => { setShowNoteForm(false); setNoteText("") }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Cancel form (collapsible) */}
      {showCancelForm && (
        <div style={{ ...s.formBox, marginBottom: 14 }}>
          <label style={s.label}>Cancellation reason (optional)</label>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <input
              style={{ ...s.input, flex: 1 }}
              placeholder="Reason for cancellation…"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <button
              style={s.btnSm("danger")}
              onClick={handleCancel}
              disabled={actionLoading === "cancel"}
            >
              {actionLoading === "cancel" ? "Cancelling…" : "Confirm Cancel"}
            </button>
            <button
              style={s.btnSm("secondary")}
              onClick={() => { setShowCancelForm(false); setCancelReason("") }}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Ship form (collapsible) */}
      {showShipForm && (
        <div style={{ ...s.formBox, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={s.label}>Carrier</label>
              <select
                style={s.select}
                value={shipCarrier}
                onChange={(e) => setShipCarrier(e.target.value)}
              >
                <option value="">Select carrier…</option>
                {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Tracking Number</label>
              <input
                style={s.input}
                placeholder="e.g. 00340434…"
                value={shipTracking}
                onChange={(e) => setShipTracking(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={s.btnSm("green")} onClick={handleShip} disabled={shipping}>
              {shipping ? "Shipping…" : "Confirm Ship"}
            </button>
            <button style={s.btnSm("secondary")} onClick={() => { setShowShipForm(false); setShipCarrier(""); setShipTracking("") }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Actions Bar */}
      <div style={s.actionsBar}>
        <span style={s.actionsLabel}>Actions:</span>

        {isPaid && isUnfulfilled && (
          <button
            style={s.btnSm("primary")}
            onClick={handlePacking}
            disabled={actionLoading === "packing"}
          >
            {actionLoading === "packing" ? "Updating…" : "Mark Packing"}
          </button>
        )}

        {isPaid && (
          <button style={s.btnSm("blue")} onClick={handleLabelPrint}>
            Print Label ↗
          </button>
        )}

        {isPaid && (isUnfulfilled || isPacking || (tx.label_printed_at != null && !isShipped)) && (
          <button style={s.btnSm("secondary")} onClick={() => setShowShipForm(!showShipForm)}>
            Mark Shipped
          </button>
        )}

        {isPaid && isShipped && (
          <button
            style={s.btnSm("green")}
            onClick={handleDelivered}
            disabled={actionLoading === "deliver"}
          >
            {actionLoading === "deliver" ? "Updating…" : "Mark Delivered"}
          </button>
        )}

        <button
          style={s.btnSm("secondary")}
          onClick={() => alert("Send Confirmation Email — not yet implemented")}
        >
          Send Confirmation Email
        </button>

        {!isDelivered && !isShipped && (
          <button
            style={s.btnSm("secondary")}
            onClick={() => setShowCancelForm(!showCancelForm)}
          >
            Cancel Order
          </button>
        )}
      </div>

      {/* Top 3-column grid: Customer | Shipping | Payment */}
      <div style={s.topGrid}>

        {/* Customer */}
        <div style={s.panel}>
          <div style={s.panelTitle}>Customer</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#d1d5db", marginBottom: 2 }}>
            {tx.customer_name || tx.shipping_name || "—"}
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10 }}>
            {tx.customer_email || "—"}
          </div>
          <div style={{ ...s.infoRow }}>
            <span style={s.infoLabel}>Customer since</span>
            <span style={s.infoValue}>N/A</span>
          </div>
          <div style={{ ...s.infoRow }}>
            <span style={s.infoLabel}>Total orders</span>
            <span style={s.infoValue}>N/A</span>
          </div>
          <div style={{ ...s.infoRow, borderBottom: "none" }}>
            <span style={s.infoLabel}>Total spent</span>
            <span style={s.infoValue}>N/A</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <a
              href={`/app/customers?q=${encodeURIComponent(tx.customer_email || tx.user_id)}`}
              style={s.link}
            >
              View customer profile →
            </a>
          </div>
        </div>

        {/* Shipping Address */}
        <div style={s.panel}>
          <div style={s.panelTitle}>Shipping Address</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#d1d5db", marginBottom: 6 }}>
            {tx.shipping_name || "—"}
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.7 }}>
            {tx.shipping_address_line1 || "—"}<br />
            {[tx.shipping_postal_code, tx.shipping_city].filter(Boolean).join(" ") || "—"}<br />
            {tx.shipping_country ? `${tx.shipping_country}` : "—"}
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={s.infoRow}>
              <span style={s.infoLabel}>Shipping zone</span>
              <span style={s.infoValue}>{getShippingZone(tx.shipping_country)}</span>
            </div>
            <div style={s.infoRow}>
              <span style={s.infoLabel}>Shipping cost</span>
              <span style={s.infoValue}>{formatAmount(tx.shipping_cost)}</span>
            </div>
            <div style={{ ...s.infoRow, borderBottom: "none" }}>
              <span style={s.infoLabel}>Tracking #</span>
              <span style={{ ...s.infoValue, color: tx.tracking_number ? "#e8e0d4" : "#9ca3af" }}>
                {tx.tracking_number || "not yet"}
              </span>
            </div>
          </div>
        </div>

        {/* Payment */}
        <div style={s.panel}>
          <div style={s.panelTitle}>Payment</div>
          <div style={s.infoRow}>
            <span style={s.infoLabel}>Provider</span>
            <span style={s.infoValue}>{providerLabel}</span>
          </div>
          <div style={s.infoRow}>
            <span style={s.infoLabel}>Amount</span>
            <span style={{ fontWeight: 800, color: "#6366f1", fontSize: 14 }}>
              {formatAmount(tx.total_amount)}
            </span>
          </div>
          <div style={s.infoRow}>
            <span style={s.infoLabel}>Paid at</span>
            <span style={s.infoValue}>
              {tx.paid_at
                ? new Date(tx.paid_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                : "—"}
            </span>
          </div>
          {tx.stripe_payment_intent_id && (
            <div style={s.infoRow}>
              <span style={s.infoLabel}>Stripe PI</span>
              <span style={s.infoValueMono}>{truncate(tx.stripe_payment_intent_id)}</span>
            </div>
          )}
          {tx.paypal_order_id && (
            <div style={s.infoRow}>
              <span style={s.infoLabel}>PayPal Order</span>
              <span style={s.infoValueMono}>{truncate(tx.paypal_order_id)}</span>
            </div>
          )}
          {tx.paypal_capture_id && (
            <div style={s.infoRow}>
              <span style={s.infoLabel}>Capture ID</span>
              <span style={s.infoValueMono}>{truncate(tx.paypal_capture_id)}</span>
            </div>
          )}
          <div style={{ ...s.infoRow, borderBottom: "none" }}>
            <span style={s.infoLabel}>Verified</span>
            <span style={{ fontWeight: 500, color: "#16a34a" }}>✓ Server-side</span>
          </div>
          {tx.discount_amount != null && Number(tx.discount_amount) > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#9ca3af" }}>
                  Discount{tx.promo_code ? ` (${tx.promo_code})` : ""}
                </span>
                <span style={{ color: "#dc2626", fontWeight: 600 }}>−{formatAmount(tx.discount_amount)}</span>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* 2-column grid: Order Items | Fulfillment Pipeline */}
      <div style={s.wideGrid}>

        {/* Order Items */}
        <div style={s.panel}>
          <div style={s.panelTitle}>Order Items</div>
          <div style={s.itemCard}>
            <div style={s.itemCover}>💿</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#d1d5db" }}>
                {tx.release_title || "—"}
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>
                {tx.release_artist || ""}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                {tx.lot_number && tx.block_title && (
                  <>
                    <a
                      href={tx.block_slug ? `/app/auction-blocks/${tx.block_slug}` : "/app/auction-blocks"}
                      style={s.link}
                    >
                      Lot #{tx.lot_number} in {tx.block_title}
                    </a>
                    {" · "}
                  </>
                )}
                {tx.release_id && (
                  <a
                    href={`/app/catalog?release=${tx.release_id}`}
                    style={s.link}
                  >
                    View Release →
                  </a>
                )}
              </div>
              <div style={{ marginTop: 6 }}>
                <span style={{
                  display: "inline-block",
                  borderRadius: 4, padding: "2px 7px",
                  fontSize: 10, fontWeight: 600,
                  ...(tx.item_type === "direct_purchase"
                    ? { background: "#dbeafe", color: "#1d4ed8" }
                    : { background: "#f3e8ff", color: "#9333ea" })
                }}>
                  {itemTypeLabel}
                </span>
              </div>
            </div>
            <div>
              <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase" }}>Bid</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#d1d5db" }}>{formatAmount(tx.amount)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase" }}>Shipping</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#d1d5db" }}>{formatAmount(tx.shipping_cost)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase" }}>Total</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#6366f1" }}>{formatAmount(tx.total_amount)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Invoice link */}
          {isPaid && tx.order_group_id && (
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <a
                href={`/admin/transactions/${tx.id}/invoice`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...s.link, fontSize: 12 }}
              >
                📄 Download Invoice PDF →
              </a>
            </div>
          )}
        </div>

        {/* Fulfillment Pipeline */}
        <div style={s.panel}>
          <div style={s.panelTitle}>Fulfillment Pipeline</div>

          {/* Stepper */}
          <div style={s.stepperWrap}>
            <div style={s.stepNode}>
              <div style={s.stepCircle(stepState(1))}>
                {stepState(1) === "done" ? "✓" : "1"}
              </div>
              <div style={s.stepLabel}>Payment<br />Received</div>
            </div>
            <div style={s.stepLine(currentStep > 1)} />
            <div style={s.stepNode}>
              <div style={s.stepCircle(stepState(2))}>
                {stepState(2) === "done" ? "✓" : "2"}
              </div>
              <div style={s.stepLabel}>Pack It</div>
            </div>
            <div style={s.stepLine(currentStep > 2)} />
            <div style={s.stepNode}>
              <div style={s.stepCircle(stepState(3))}>
                {stepState(3) === "done" ? "✓" : "3"}
              </div>
              <div style={s.stepLabel}>Print Label</div>
            </div>
            <div style={s.stepLine(currentStep > 3)} />
            <div style={s.stepNode}>
              <div style={s.stepCircle(stepState(4))}>
                {stepState(4) === "done" ? "✓" : "4"}
              </div>
              <div style={s.stepLabel}>Ship</div>
            </div>
            <div style={s.stepLine(currentStep > 4)} />
            <div style={s.stepNode}>
              <div style={s.stepCircle(stepState(5))}>
                {stepState(5) === "done" ? "✓" : "5"}
              </div>
              <div style={s.stepLabel}>Delivered</div>
            </div>
          </div>

          {/* Current step info box */}
          <div style={s.stepInfoBox}>
            <strong>Current step:</strong> {stepDesc.current}<br />
            {stepDesc.next !== "Complete" && (
              <span style={{ opacity: 0.8 }}>{stepDesc.next}</span>
            )}
          </div>

          {/* Step dates */}
          <div style={{ marginTop: 4 }}>
            <div style={s.infoRow}>
              <span style={s.infoLabel}>Packed at</span>
              <span style={{ ...s.infoValue, color: isPacking || tx.label_printed_at ? "#e8e0d4" : "#9ca3af" }}>
                {isPacking || tx.label_printed_at || isShipped || isDelivered
                  ? (tx.paid_at ? formatDate(tx.paid_at) : "—")
                  : "—"}
              </span>
            </div>
            <div style={s.infoRow}>
              <span style={s.infoLabel}>Label printed</span>
              <span style={{ ...s.infoValue, color: tx.label_printed_at ? "#e8e0d4" : "#9ca3af" }}>
                {tx.label_printed_at ? formatDate(tx.label_printed_at) : "—"}
              </span>
            </div>
            <div style={s.infoRow}>
              <span style={s.infoLabel}>Shipped at</span>
              <span style={{ ...s.infoValue, color: tx.shipped_at ? "#e8e0d4" : "#9ca3af" }}>
                {tx.shipped_at ? formatDate(tx.shipped_at) : "—"}
              </span>
            </div>
            <div style={{ ...s.infoRow, borderBottom: "none" }}>
              <span style={s.infoLabel}>Tracking #</span>
              <span style={{ ...s.infoValue, color: tx.tracking_number ? "#e8e0d4" : "#9ca3af" }}>
                {tx.tracking_number
                  ? `${tx.carrier ? tx.carrier + " · " : ""}${tx.tracking_number}`
                  : "—"}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Audit Trail (full width) */}
      <div style={s.panel}>
        <div style={s.panelTitle}>Audit Trail</div>
        {sortedEvents.length === 0 ? (
          <p style={{ color: "#9ca3af", fontSize: 12 }}>No events recorded yet.</p>
        ) : (
          sortedEvents.map((event, idx) => {
            const detailText = event.description || event.details || null
            return (
              <div
                key={event.id || idx}
                style={{
                  ...s.auditItem,
                  ...(idx === sortedEvents.length - 1 ? { borderBottom: "none" } : {}),
                }}
              >
                <div style={s.auditDot(getEventDotColor(event.event_type))} />
                <div style={{ flex: 1 }}>
                  <div style={s.auditTitle}>{event.title}</div>
                  {detailText && (
                    <div style={s.auditDetail}>
                      {typeof detailText === "string"
                        ? detailText
                        : JSON.stringify(detailText)}
                    </div>
                  )}
                  {event.actor && (
                    <div style={{ fontSize: 10, color: "#c4b5fd", marginTop: 2 }}>
                      by {event.actor}
                    </div>
                  )}
                </div>
                <div style={s.auditTime}>{formatDateShort(event.created_at)}</div>
              </div>
            )
          })
        )}
      </div>

    </div>
  )
}

// NO defineRouteConfig on detail pages — causes routing conflicts
export default TransactionDetailPage
