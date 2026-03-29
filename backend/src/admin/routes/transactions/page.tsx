import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar } from "@medusajs/icons"
import { useAdminNav } from "../../components/admin-nav"
import {
  Container,
  Heading,
  Badge,
  Button,
  Text,
  Input,
  Label,
  Select,
} from "@medusajs/ui"
import { useEffect, useState, useRef, useCallback } from "react"

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
  tracking_number: string | null
  carrier: string | null
  paid_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  created_at: string
  release_title: string | null
  release_artist: string | null
  article_number: string | null
  block_title: string | null
  lot_number: number | null
  shipping_name: string | null
  shipping_city: string | null
  shipping_country: string | null
  customer_name: string | null
  customer_email: string | null
  internal_note: string | null
}

const CARRIERS = ["DHL", "DPD", "Hermes", "GLS", "UPS", "FedEx", "Deutsche Post"]

const STATUS_PILL: Record<string, { bg: string; color: string }> = {
  pending:            { bg: "#f3f4f6", color: "#4b5563" },
  paid:               { bg: "#dcfce7", color: "#15803d" },
  failed:             { bg: "#fee2e2", color: "#b91c1c" },
  refunded:           { bg: "#ede9fe", color: "#6d28d9" },
  cancelled:          { bg: "#f3f4f6", color: "#6b7280" },
  partially_refunded: { bg: "#fef3c7", color: "#92400e" },
}

const FULFILLMENT_PILL: Record<string, { bg: string; color: string }> = {
  unfulfilled: { bg: "#f3f4f6", color: "#6b7280" },
  packing:     { bg: "#dbeafe", color: "#1d4ed8" },
  shipped:     { bg: "#dbeafe", color: "#1d4ed8" },
  delivered:   { bg: "#dcfce7", color: "#15803d" },
  returned:    { bg: "#fef3c7", color: "#92400e" },
}

const PAYMENT_STATUSES = [
  { value: "",           label: "All" },
  { value: "paid",       label: "Paid" },
  { value: "pending",    label: "Pending" },
  { value: "failed",     label: "Failed" },
  { value: "refunded",   label: "Refunded" },
  { value: "cancelled",  label: "Cancelled" },
]

const FULFILLMENT_STATUSES = [
  { value: "",            label: "All" },
  { value: "unfulfilled", label: "Unfulfilled" },
  { value: "packing",     label: "Packing" },
  { value: "shipped",     label: "Shipped" },
  { value: "delivered",   label: "Delivered" },
]

const PROVIDERS = [
  { value: "",        label: "All" },
  { value: "stripe",  label: "Stripe" },
  { value: "paypal",  label: "PayPal" },
]

const PAGE_SIZES = [25, 50, 100]

type QuickTab = "unfulfilled" | "packing" | "shipped" | "pending" | "all"

const QUICK_TABS: { id: QuickTab; label: string; status: string; fulfillment: string }[] = [
  { id: "unfulfilled", label: "Needs Shipping",  status: "paid",    fulfillment: "unfulfilled" },
  { id: "packing",     label: "Packing",          status: "paid",    fulfillment: "packing" },
  { id: "shipped",     label: "Shipped",          status: "",        fulfillment: "shipped" },
  { id: "pending",     label: "Awaiting Payment", status: "pending", fulfillment: "" },
  { id: "all",         label: "All",              status: "",        fulfillment: "" },
]

function Pill({ label, style }: { label: string; style: { bg: string; color: string } }) {
  return (
    <span style={{
      display: "inline-block",
      background: style.bg,
      color: style.color,
      borderRadius: 12,
      padding: "2px 8px",
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>{label}</span>
  )
}

const TransactionsPage = () => {
  useAdminNav()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  const [activeTab, setActiveTab] = useState<QuickTab>("unfulfilled")
  const [showFilters, setShowFilters] = useState(false)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("paid")
  const [fulfillmentFilter, setFulfillmentFilter] = useState("unfulfilled")
  const [providerFilter, setProviderFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const [offset, setOffset] = useState(0)
  const [pageSize, setPageSize] = useState(25)

  const [shippingDialog, setShippingDialog] = useState<string | null>(null)
  const [trackingNumber, setTrackingNumber] = useState("")
  const [carrier, setCarrier] = useState("")
  const [updating, setUpdating] = useState(false)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkShipDialog, setBulkShipDialog] = useState(false)
  const [bulkCarrier, setBulkCarrier] = useState("")
  const [bulkTracking, setBulkTracking] = useState("")
  const [bulkUpdating, setBulkUpdating] = useState(false)

  const [refunding, setRefunding] = useState<string | null>(null)

  const applyTab = (tab: QuickTab) => {
    const t = QUICK_TABS.find(t => t.id === tab)!
    setActiveTab(tab)
    setStatusFilter(t.status)
    setFulfillmentFilter(t.fulfillment)
    setOffset(0)
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setOffset(0)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set("q", debouncedSearch)
      if (statusFilter) params.set("status", statusFilter)
      if (fulfillmentFilter) params.set("fulfillment_status", fulfillmentFilter)
      if (providerFilter) params.set("payment_provider", providerFilter)
      if (dateFrom) params.set("date_from", dateFrom)
      if (dateTo) params.set("date_to", dateTo)
      params.set("limit", String(pageSize))
      params.set("offset", String(offset))
      params.set("sort", "created_at")
      params.set("order", "desc")

      const res = await fetch(`/admin/transactions?${params}`, { credentials: "include" })
      const data = await res.json()
      setTransactions(data.transactions || [])
      setTotalCount(data.count ?? data.transactions?.length ?? 0)
    } catch (err) {
      console.error("Failed to fetch transactions:", err)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, statusFilter, fulfillmentFilter, providerFilter, dateFrom, dateTo, pageSize, offset])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  useEffect(() => { setOffset(0) }, [statusFilter, fulfillmentFilter, providerFilter, dateFrom, dateTo])
  useEffect(() => { setSelected(new Set()) }, [transactions])

  const markAsShipped = async (id: string) => {
    setUpdating(true)
    try {
      const res = await fetch(`/admin/transactions/${id}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipping_status: "shipped", tracking_number: trackingNumber || undefined, carrier: carrier || undefined }),
      })
      if (res.ok) {
        setShippingDialog(null)
        setTrackingNumber("")
        setCarrier("")
        fetchTransactions()
      }
    } finally { setUpdating(false) }
  }

  const markAsDelivered = async (id: string) => {
    await fetch(`/admin/transactions/${id}`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shipping_status: "delivered" }),
    })
    fetchTransactions()
  }

  const refundTransaction = async (id: string) => {
    if (!window.confirm("Refund this order? This will refund the full amount and set the release(s) back to available.")) return
    setRefunding(id)
    try {
      const res = await fetch(`/admin/transactions/${id}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refund" }),
      })
      const data = await res.json()
      if (!res.ok) alert(`Refund failed: ${data.message}`)
      else alert(`Refund successful (${data.transactions_refunded} item(s)). ${data.refund_status}`)
      fetchTransactions()
    } catch { alert("Refund failed. Check console.") }
    finally { setRefunding(null) }
  }

  const markRefunded = async (id: string) => {
    if (!window.confirm("Mark as refunded? Use this when the refund was already processed externally (e.g. via Stripe/PayPal dashboard) and the webhook didn't update the DB. This only updates the database — no money will be moved.")) return
    setRefunding(id)
    try {
      const res = await fetch(`/admin/transactions/${id}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_refunded" }),
      })
      const data = await res.json()
      if (!res.ok) alert(`Failed: ${data.message}`)
      else fetchTransactions()
    } catch { alert("Failed. Check console.") }
    finally { setRefunding(null) }
  }

  const bulkShip = async () => {
    if (selected.size === 0) return
    setBulkUpdating(true)
    try {
      const res = await fetch("/admin/transactions/bulk-ship", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_ids: Array.from(selected), carrier: bulkCarrier || undefined, tracking_number: bulkTracking || undefined }),
      })
      if (res.ok) {
        setBulkShipDialog(false); setBulkCarrier(""); setBulkTracking("")
        setSelected(new Set()); fetchTransactions()
      } else {
        const data = await res.json()
        alert(`Bulk ship failed: ${data.message || "Unknown error"}`)
      }
    } catch { alert("Bulk ship failed. Check console.") }
    finally { setBulkUpdating(false) }
  }

  const exportTransactions = async (ids?: string[]) => {
    try {
      const res = await fetch("/admin/transactions/export", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_ids: ids || undefined,
          filters: !ids ? {
            q: debouncedSearch || undefined,
            status: statusFilter || undefined,
            fulfillment_status: fulfillmentFilter || undefined,
            payment_provider: providerFilter || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
          } : undefined,
        }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        window.URL.revokeObjectURL(url)
      } else alert("Export failed")
    } catch { alert("Export failed. Check console.") }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected(selected.size === transactions.length ? new Set() : new Set(transactions.map(tx => tx.id)))
  }

  const itemLabel = (tx: Transaction) => {
    const parts: string[] = []
    if (tx.release_artist) parts.push(tx.release_artist)
    if (tx.release_title) parts.push(tx.release_title)
    return parts.length > 0 ? parts.join(" — ") : tx.id.slice(0, 12) + "..."
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

  const currentPage = Math.floor(offset / pageSize) + 1
  const totalPages = Math.ceil(totalCount / pageSize)
  const showFrom = totalCount === 0 ? 0 : offset + 1
  const showTo = Math.min(offset + pageSize, totalCount)

  const hasAdvancedFilters = !!(providerFilter || dateFrom || dateTo)

  return (
    <Container>
      {/* Top Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <Heading level="h1">Orders</Heading>
          <Text className="text-ui-fg-subtle mt-1">All auction wins and direct purchases</Text>
        </div>
        <button
          onClick={() => exportTransactions()}
          style={{
            padding: "6px 14px", fontSize: 13, fontWeight: 500,
            background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6,
            cursor: "pointer", color: "#374151",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
          onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
        >
          Export CSV
        </button>
      </div>

      {/* Quick Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", marginBottom: 16 }}>
        {QUICK_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => applyTab(tab.id)}
            style={{
              padding: "8px 16px", fontSize: 13,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? "#111827" : "#6b7280",
              background: "none", border: "none",
              borderBottom: activeTab === tab.id ? "2px solid #111827" : "2px solid transparent",
              cursor: "pointer", marginBottom: -1, transition: "color 0.1s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search + Filters toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: showFilters ? 12 : 16, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <input
            placeholder="Search by customer, email, order number, article..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "7px 12px", fontSize: 13,
              border: "1px solid #e5e7eb", borderRadius: 6,
              background: "#fff", color: "#111827", outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <button
          onClick={() => setShowFilters(v => !v)}
          style={{
            padding: "7px 14px", fontSize: 13, fontWeight: 500,
            background: showFilters || hasAdvancedFilters ? "#f0f0ff" : "#fff",
            border: showFilters || hasAdvancedFilters ? "1px solid #c7d2fe" : "1px solid #e5e7eb",
            borderRadius: 6, cursor: "pointer",
            color: showFilters || hasAdvancedFilters ? "#4338ca" : "#374151",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          Filters {hasAdvancedFilters ? "●" : "▾"}
        </button>
      </div>

      {/* Advanced Filters (collapsible) */}
      {showFilters && (
        <div style={{
          background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8,
          padding: "14px 16px", marginBottom: 16,
          display: "flex", flexWrap: "wrap", gap: "16px 32px", alignItems: "flex-end",
        }}>
          {/* Payment */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Payment</div>
            <div style={{ display: "flex", gap: 4 }}>
              {PAYMENT_STATUSES.map(s => (
                <button key={s.value} onClick={() => setStatusFilter(s.value)} style={{
                  padding: "4px 10px", fontSize: 12, borderRadius: 5, cursor: "pointer",
                  fontWeight: statusFilter === s.value ? 600 : 400,
                  background: statusFilter === s.value ? "#111827" : "#fff",
                  color: statusFilter === s.value ? "#fff" : "#374151",
                  border: statusFilter === s.value ? "1px solid #111827" : "1px solid #e5e7eb",
                }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fulfillment */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Fulfillment</div>
            <div style={{ display: "flex", gap: 4 }}>
              {FULFILLMENT_STATUSES.map(s => (
                <button key={s.value} onClick={() => setFulfillmentFilter(s.value)} style={{
                  padding: "4px 10px", fontSize: 12, borderRadius: 5, cursor: "pointer",
                  fontWeight: fulfillmentFilter === s.value ? 600 : 400,
                  background: fulfillmentFilter === s.value ? "#111827" : "#fff",
                  color: fulfillmentFilter === s.value ? "#fff" : "#374151",
                  border: fulfillmentFilter === s.value ? "1px solid #111827" : "1px solid #e5e7eb",
                }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Provider */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Provider</div>
            <div style={{ display: "flex", gap: 4 }}>
              {PROVIDERS.map(p => (
                <button key={p.value} onClick={() => setProviderFilter(p.value)} style={{
                  padding: "4px 10px", fontSize: 12, borderRadius: 5, cursor: "pointer",
                  fontWeight: providerFilter === p.value ? 600 : 400,
                  background: providerFilter === p.value ? "#111827" : "#fff",
                  color: providerFilter === p.value ? "#fff" : "#374151",
                  border: providerFilter === p.value ? "1px solid #111827" : "1px solid #e5e7eb",
                }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Date Range</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{ padding: "4px 8px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 5, background: "#fff" }}
              />
              <span style={{ fontSize: 12, color: "#9ca3af" }}>–</span>
              <input
                type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{ padding: "4px 8px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 5, background: "#fff" }}
              />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(""); setDateTo("") }} style={{
                  padding: "4px 8px", fontSize: 12, border: "1px solid #e5e7eb",
                  borderRadius: 5, cursor: "pointer", background: "#fff", color: "#6b7280",
                }}>Clear</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ padding: "48px 0", textAlign: "center" }}>
          <Text className="text-ui-fg-subtle">Loading orders...</Text>
        </div>
      ) : transactions.length === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center" }}>
          <Text className="text-ui-fg-subtle">No orders found.</Text>
        </div>
      ) : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
                <th style={{ width: 40, padding: "8px 14px", textAlign: "left" }}>
                  <input
                    type="checkbox"
                    checked={selected.size === transactions.length && transactions.length > 0}
                    onChange={toggleSelectAll}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                {["Order #", "Item", "Customer", "Amount", "Payment", "Fulfillment", "Tracking", "Date", ""].map(h => (
                  <th key={h} style={{
                    textAlign: "left", padding: "8px 14px",
                    fontSize: 10, fontWeight: 700, color: "#9ca3af",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr
                  key={tx.id}
                  style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer", background: "transparent", transition: "background 0.1s" }}
                  onClick={e => {
                    const target = e.target as HTMLElement
                    if (target.tagName === "INPUT" || target.tagName === "BUTTON" || target.tagName === "SELECT" || target.closest("button") || target.closest("input") || target.closest("[data-no-nav]")) return
                    window.location.href = `/app/transactions/${tx.id}`
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Checkbox */}
                  <td style={{ padding: "12px 14px" }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(tx.id)} onChange={() => toggleSelect(tx.id)} style={{ cursor: "pointer" }} />
                  </td>

                  {/* Order # */}
                  <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "#111827" }}>
                      {tx.order_number || tx.id.slice(0, 12) + "…"}
                    </span>
                  </td>

                  {/* Item */}
                  <td style={{ padding: "12px 14px", maxWidth: 200 }}>
                    <div style={{ fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {itemLabel(tx)}
                    </div>
                    {tx.article_number && (
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{tx.article_number}</div>
                    )}
                    {tx.block_title && (
                      <div style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {tx.block_title}{tx.lot_number ? ` · Lot #${tx.lot_number}` : ""}
                      </div>
                    )}
                  </td>

                  {/* Customer */}
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ fontWeight: 500, color: "#111827", fontSize: 13 }}>
                      {tx.customer_name || tx.shipping_name || "—"}
                    </div>
                    {tx.customer_email && (
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{tx.customer_email}</div>
                    )}
                    {tx.shipping_country && (
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{tx.shipping_city ? `${tx.shipping_city}, ` : ""}{tx.shipping_country}</div>
                    )}
                  </td>

                  {/* Amount */}
                  <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#111827" }}>
                      €{Number(tx.total_amount).toFixed(2)}
                    </span>
                    {tx.payment_provider && (
                      <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "capitalize" }}>{tx.payment_provider}</div>
                    )}
                  </td>

                  {/* Payment status */}
                  <td style={{ padding: "12px 14px" }}>
                    <Pill label={tx.status} style={STATUS_PILL[tx.status] || { bg: "#f3f4f6", color: "#6b7280" }} />
                  </td>

                  {/* Fulfillment status */}
                  <td style={{ padding: "12px 14px" }}>
                    {(() => {
                      const fs = tx.fulfillment_status || tx.shipping_status || "unfulfilled"
                      return <Pill label={fs} style={FULFILLMENT_PILL[fs] || { bg: "#f3f4f6", color: "#6b7280" }} />
                    })()}
                  </td>

                  {/* Tracking */}
                  <td style={{ padding: "12px 14px" }}>
                    {tx.tracking_number ? (
                      <div>
                        <div style={{ fontSize: 11, fontFamily: "monospace", color: "#374151" }}>{tx.tracking_number}</div>
                        {tx.carrier && <div style={{ fontSize: 11, color: "#9ca3af" }}>{tx.carrier}</div>}
                      </div>
                    ) : (
                      <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>
                    )}
                  </td>

                  {/* Date */}
                  <td style={{ padding: "12px 14px", whiteSpace: "nowrap", color: "#6b7280", fontSize: 12 }}>
                    {formatDate(tx.paid_at || tx.created_at)}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: "12px 14px" }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }} data-no-nav>
                      {tx.status === "paid" && (tx.fulfillment_status === "unfulfilled" || tx.shipping_status === "pending") && (
                        <>
                          {shippingDialog === tx.id ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
                              <Select value={carrier} onValueChange={setCarrier}>
                                <Select.Trigger><Select.Value placeholder="Carrier..." /></Select.Trigger>
                                <Select.Content>
                                  {CARRIERS.map(c => <Select.Item key={c} value={c}>{c}</Select.Item>)}
                                </Select.Content>
                              </Select>
                              <Input size="small" placeholder="Tracking #" value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} />
                              <div style={{ display: "flex", gap: 4 }}>
                                <Button size="small" onClick={() => markAsShipped(tx.id)} disabled={updating}>
                                  {updating ? "..." : "Confirm"}
                                </Button>
                                <Button size="small" variant="secondary" onClick={() => { setShippingDialog(null); setTrackingNumber(""); setCarrier("") }}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <span
                              onClick={() => setShippingDialog(tx.id)}
                              style={{ display: "inline-block", padding: "4px 10px", fontSize: 12, fontWeight: 600, background: "#111827", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", whiteSpace: "nowrap", lineHeight: "18px" }}
                            >
                              Ship →
                            </span>
                          )}
                        </>
                      )}
                      {tx.status === "paid" && (tx.fulfillment_status === "shipped" || tx.shipping_status === "shipped") && (
                        <span
                          onClick={() => markAsDelivered(tx.id)}
                          style={{ display: "inline-block", padding: "4px 10px", fontSize: 12, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 5, cursor: "pointer", color: "#374151", whiteSpace: "nowrap", lineHeight: "18px" }}
                        >
                          Delivered
                        </span>
                      )}
                      {tx.status === "paid" && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <span
                            onClick={() => !refunding && refundTransaction(tx.id)}
                            style={{ display: "inline-block", padding: "4px 10px", fontSize: 12, background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5", borderRadius: 5, cursor: refunding ? "default" : "pointer", whiteSpace: "nowrap", lineHeight: "18px", opacity: refunding === tx.id ? 0.5 : 1 }}
                          >
                            {refunding === tx.id ? "..." : "Refund"}
                          </span>
                          <span
                            onClick={() => !refunding && markRefunded(tx.id)}
                            title="Mark as refunded — refund was already processed externally (webhook missed)"
                            style={{ display: "inline-block", padding: "4px 10px", fontSize: 12, background: "#ede9fe", color: "#6d28d9", border: "1px solid #c4b5fd", borderRadius: 5, cursor: refunding ? "default" : "pointer", whiteSpace: "nowrap", lineHeight: "18px", opacity: refunding === tx.id ? 0.5 : 1 }}
                          >
                            {refunding === tx.id ? "..." : "Mark ✓"}
                          </span>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>
              {showFrom}–{showTo} of {totalCount}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>Per page:</span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setOffset(0) }}
                style={{ padding: "3px 6px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 4, background: "#fff" }}
              >
                {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
              style={{ padding: "5px 12px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 5, cursor: offset === 0 ? "not-allowed" : "pointer", background: "#fff", color: offset === 0 ? "#d1d5db" : "#374151" }}
            >← Prev</button>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Page {currentPage} of {totalPages}</span>
            <button
              disabled={offset + pageSize >= totalCount}
              onClick={() => setOffset(offset + pageSize)}
              style={{ padding: "5px 12px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 5, cursor: offset + pageSize >= totalCount ? "not-allowed" : "pointer", background: "#fff", color: offset + pageSize >= totalCount ? "#d1d5db" : "#374151" }}
            >Next →</button>
          </div>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#111827", color: "#fff", borderRadius: 10,
          padding: "12px 24px", display: "flex", alignItems: "center", gap: 16,
          boxShadow: "0 4px 24px rgba(0,0,0,0.2)", zIndex: 50, whiteSpace: "nowrap",
        }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.size} selected</span>
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.2)" }} />
          <button
            onClick={() => setBulkShipDialog(true)}
            style={{ padding: "6px 14px", fontSize: 13, fontWeight: 600, background: "#fff", color: "#111827", border: "none", borderRadius: 6, cursor: "pointer" }}
          >
            Mark as Shipped
          </button>
          <button
            onClick={() => exportTransactions(Array.from(selected))}
            style={{ padding: "6px 14px", fontSize: 13, background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, cursor: "pointer" }}
          >
            Export
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{ padding: "6px 14px", fontSize: 13, background: "none", color: "rgba(255,255,255,0.6)", border: "none", cursor: "pointer" }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Bulk Ship Dialog */}
      {bulkShipDialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: "100%", maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
            <Heading level="h2" className="mb-4">
              Ship {selected.size} Order{selected.size > 1 ? "s" : ""}
            </Heading>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              <div>
                <Label size="small">Carrier</Label>
                <Select value={bulkCarrier} onValueChange={setBulkCarrier}>
                  <Select.Trigger><Select.Value placeholder="Select carrier..." /></Select.Trigger>
                  <Select.Content>
                    {CARRIERS.map(c => <Select.Item key={c} value={c}>{c}</Select.Item>)}
                  </Select.Content>
                </Select>
              </div>
              <div>
                <Label size="small">Tracking Number (optional, shared)</Label>
                <Input placeholder="e.g. 00340434..." value={bulkTracking} onChange={e => setBulkTracking(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="secondary" onClick={() => { setBulkShipDialog(false); setBulkCarrier(""); setBulkTracking("") }}>
                Cancel
              </Button>
              <Button onClick={bulkShip} disabled={bulkUpdating}>
                {bulkUpdating ? "Shipping..." : "Confirm Ship"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Orders",
  icon: CurrencyDollar,
  rank: 2,
})

export default TransactionsPage
