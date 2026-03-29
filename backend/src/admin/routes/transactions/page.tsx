import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar } from "@medusajs/icons"
import { useAdminNav } from "../../components/admin-nav"
import {
  Container,
  Heading,
  Table,
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

const STATUS_COLORS: Record<string, "green" | "orange" | "blue" | "grey" | "red"> = {
  pending: "grey",
  paid: "green",
  failed: "red",
  refunded: "orange",
  cancelled: "red",
  partially_refunded: "orange",
}

const FULFILLMENT_COLORS: Record<string, "green" | "orange" | "blue" | "grey"> = {
  unfulfilled: "grey",
  packing: "blue",
  shipped: "blue",
  delivered: "green",
  returned: "orange",
}

const PAYMENT_STATUSES = [
  { value: "", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
]

const FULFILLMENT_STATUSES = [
  { value: "", label: "All" },
  { value: "unfulfilled", label: "Unfulfilled" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
]

const PROVIDERS = [
  { value: "", label: "All" },
  { value: "stripe", label: "Stripe" },
  { value: "paypal", label: "PayPal" },
]

const PAGE_SIZES = [25, 50, 100]

// Quick-view tabs — each sets a status+fulfillment combination
type QuickTab = "unfulfilled" | "packing" | "shipped" | "pending" | "all"

const QUICK_TABS: { id: QuickTab; label: string; status: string; fulfillment: string }[] = [
  { id: "unfulfilled", label: "Needs Shipping",   status: "paid",    fulfillment: "unfulfilled" },
  { id: "packing",     label: "Packing",           status: "paid",    fulfillment: "packing" },
  { id: "shipped",     label: "Shipped",           status: "",        fulfillment: "shipped" },
  { id: "pending",     label: "Awaiting Payment",  status: "pending", fulfillment: "" },
  { id: "all",         label: "All",               status: "",        fulfillment: "" },
]

const TransactionsPage = () => {
  useAdminNav()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  // Quick tab (sets status+fulfillment together)
  const [activeTab, setActiveTab] = useState<QuickTab>("unfulfilled")

  // Filters
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("paid")
  const [fulfillmentFilter, setFulfillmentFilter] = useState("unfulfilled")
  const [providerFilter, setProviderFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  // Pagination
  const [offset, setOffset] = useState(0)
  const [pageSize, setPageSize] = useState(25)

  // Shipping dialog
  const [shippingDialog, setShippingDialog] = useState<string | null>(null)
  const [trackingNumber, setTrackingNumber] = useState("")
  const [carrier, setCarrier] = useState("")
  const [updating, setUpdating] = useState(false)

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkShipDialog, setBulkShipDialog] = useState(false)
  const [bulkCarrier, setBulkCarrier] = useState("")
  const [bulkTracking, setBulkTracking] = useState("")
  const [bulkUpdating, setBulkUpdating] = useState(false)

  // Refund
  const [refunding, setRefunding] = useState<string | null>(null)

  const applyTab = (tab: QuickTab) => {
    const t = QUICK_TABS.find(t => t.id === tab)!
    setActiveTab(tab)
    setStatusFilter(t.status)
    setFulfillmentFilter(t.fulfillment)
    setOffset(0)
  }

  // Debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setOffset(0)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
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

      const res = await fetch(`/admin/transactions?${params}`, {
        credentials: "include",
      })
      const data = await res.json()
      setTransactions(data.transactions || [])
      setTotalCount(data.count ?? data.transactions?.length ?? 0)
    } catch (err) {
      console.error("Failed to fetch transactions:", err)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, statusFilter, fulfillmentFilter, providerFilter, dateFrom, dateTo, pageSize, offset])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0)
  }, [statusFilter, fulfillmentFilter, providerFilter, dateFrom, dateTo])

  // Clear selection when data changes
  useEffect(() => {
    setSelected(new Set())
  }, [transactions])

  const markAsShipped = async (id: string) => {
    setUpdating(true)
    try {
      const res = await fetch(`/admin/transactions/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipping_status: "shipped",
          tracking_number: trackingNumber || undefined,
          carrier: carrier || undefined,
        }),
      })
      if (res.ok) {
        setShippingDialog(null)
        setTrackingNumber("")
        setCarrier("")
        fetchTransactions()
      }
    } catch (err) {
      console.error("Failed to update:", err)
    } finally {
      setUpdating(false)
    }
  }

  const markAsDelivered = async (id: string) => {
    try {
      await fetch(`/admin/transactions/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipping_status: "delivered" }),
      })
      fetchTransactions()
    } catch (err) {
      console.error("Failed to update:", err)
    }
  }

  const refundTransaction = async (id: string) => {
    if (
      !window.confirm(
        "Are you sure you want to refund this order? This will refund the full amount and set the release(s) back to available."
      )
    )
      return
    setRefunding(id)
    try {
      const res = await fetch(`/admin/transactions/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refund" }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Refund failed: ${data.message}`)
      } else {
        alert(
          `Refund successful (${data.transactions_refunded} item(s)). Refund: ${data.refund_status}`
        )
      }
      fetchTransactions()
    } catch (err) {
      alert("Refund failed. Check console.")
      console.error("Refund error:", err)
    } finally {
      setRefunding(null)
    }
  }

  const bulkShip = async () => {
    if (selected.size === 0) return
    setBulkUpdating(true)
    try {
      const res = await fetch("/admin/transactions/bulk-ship", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_ids: Array.from(selected),
          carrier: bulkCarrier || undefined,
          tracking_number: bulkTracking || undefined,
        }),
      })
      if (res.ok) {
        setBulkShipDialog(false)
        setBulkCarrier("")
        setBulkTracking("")
        setSelected(new Set())
        fetchTransactions()
      } else {
        const data = await res.json()
        alert(`Bulk ship failed: ${data.message || "Unknown error"}`)
      }
    } catch (err) {
      console.error("Bulk ship error:", err)
      alert("Bulk ship failed. Check console.")
    } finally {
      setBulkUpdating(false)
    }
  }

  const exportTransactions = async (ids?: string[]) => {
    try {
      const params = new URLSearchParams()
      if (!ids) {
        // Export with current filters
        if (debouncedSearch) params.set("q", debouncedSearch)
        if (statusFilter) params.set("status", statusFilter)
        if (fulfillmentFilter) params.set("fulfillment_status", fulfillmentFilter)
        if (providerFilter) params.set("payment_provider", providerFilter)
        if (dateFrom) params.set("date_from", dateFrom)
        if (dateTo) params.set("date_to", dateTo)
      }

      const res = await fetch(`/admin/transactions/export`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_ids: ids || undefined,
          filters: !ids
            ? {
                q: debouncedSearch || undefined,
                status: statusFilter || undefined,
                fulfillment_status: fulfillmentFilter || undefined,
                payment_provider: providerFilter || undefined,
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
              }
            : undefined,
        }),
      })

      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        window.URL.revokeObjectURL(url)
      } else {
        alert("Export failed")
      }
    } catch (err) {
      console.error("Export error:", err)
      alert("Export failed. Check console.")
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === transactions.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(transactions.map((tx) => tx.id)))
    }
  }

  const itemLabel = (tx: Transaction) => {
    const parts: string[] = []
    if (tx.release_artist) parts.push(tx.release_artist)
    if (tx.release_title) parts.push(tx.release_title)
    return parts.length > 0 ? parts.join(" — ") : tx.id.slice(0, 12) + "..."
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  const currentPage = Math.floor(offset / pageSize) + 1
  const totalPages = Math.ceil(totalCount / pageSize)
  const showFrom = totalCount === 0 ? 0 : offset + 1
  const showTo = Math.min(offset + pageSize, totalCount)

  return (
    <Container>
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Heading level="h1">Transactions</Heading>
          {!loading && (
            <Badge color="grey">{totalCount}</Badge>
          )}
        </div>
        <Button
          variant="secondary"
          size="small"
          onClick={() => exportTransactions()}
        >
          Export All
        </Button>
      </div>

      {/* Quick-view Tabs (Shopify-style) */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e5e7eb", marginBottom: 16 }}>
        {QUICK_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => applyTab(tab.id)}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? "#111827" : "#6b7280",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid #111827" : "2px solid transparent",
              cursor: "pointer",
              marginBottom: -1,
              transition: "color 0.1s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <Input
          placeholder="Search by customer, email, order number, article..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
        />
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap gap-x-6 gap-y-3 mb-4 items-end">
        {/* Payment Status */}
        <div>
          <Label size="xsmall" className="mb-1 block text-ui-fg-subtle">Payment</Label>
          <div className="flex gap-1">
            {PAYMENT_STATUSES.map((s) => (
              <Button
                key={s.value}
                variant={statusFilter === s.value ? "primary" : "secondary"}
                size="small"
                onClick={() => setStatusFilter(s.value)}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Fulfillment Status */}
        <div>
          <Label size="xsmall" className="mb-1 block text-ui-fg-subtle">Fulfillment</Label>
          <div className="flex gap-1">
            {FULFILLMENT_STATUSES.map((s) => (
              <Button
                key={s.value}
                variant={fulfillmentFilter === s.value ? "primary" : "secondary"}
                size="small"
                onClick={() => setFulfillmentFilter(s.value)}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Payment Provider */}
        <div>
          <Label size="xsmall" className="mb-1 block text-ui-fg-subtle">Provider</Label>
          <div className="flex gap-1">
            {PROVIDERS.map((p) => (
              <Button
                key={p.value}
                variant={providerFilter === p.value ? "primary" : "secondary"}
                size="small"
                onClick={() => setProviderFilter(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Date Range */}
        <div className="flex gap-2 items-end">
          <div>
            <Label size="xsmall" className="mb-1 block text-ui-fg-subtle">From</Label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-ui-border-base rounded-md px-2 py-1 text-sm bg-ui-bg-field text-ui-fg-base"
            />
          </div>
          <div>
            <Label size="xsmall" className="mb-1 block text-ui-fg-subtle">To</Label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-ui-border-base rounded-md px-2 py-1 text-sm bg-ui-bg-field text-ui-fg-base"
            />
          </div>
          {(dateFrom || dateTo) && (
            <Button
              variant="secondary"
              size="small"
              onClick={() => {
                setDateFrom("")
                setDateTo("")
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <Container className="text-center py-12">
          <Text className="text-ui-fg-subtle">Loading transactions...</Text>
        </Container>
      ) : transactions.length === 0 ? (
        <Container className="text-center py-12">
          <Text className="text-ui-fg-subtle">No transactions found.</Text>
        </Container>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={selected.size === transactions.length && transactions.length > 0}
                  onChange={toggleSelectAll}
                  className="cursor-pointer"
                />
              </Table.HeaderCell>
              <Table.HeaderCell>Order #</Table.HeaderCell>
              <Table.HeaderCell>Item</Table.HeaderCell>
              <Table.HeaderCell>Customer</Table.HeaderCell>
              <Table.HeaderCell>Amount</Table.HeaderCell>
              <Table.HeaderCell>Payment</Table.HeaderCell>
              <Table.HeaderCell>Fulfillment</Table.HeaderCell>
              <Table.HeaderCell>Tracking</Table.HeaderCell>
              <Table.HeaderCell>Date</Table.HeaderCell>
              <Table.HeaderCell>Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {transactions.map((tx) => (
              <Table.Row
                key={tx.id}
                className="cursor-pointer hover:bg-ui-bg-base-hover"
                onClick={(e) => {
                  // Don't navigate if clicking on checkbox, button, input, select, or label
                  const target = e.target as HTMLElement
                  if (
                    target.tagName === "INPUT" ||
                    target.tagName === "BUTTON" ||
                    target.tagName === "SELECT" ||
                    target.tagName === "LABEL" ||
                    target.closest("button") ||
                    target.closest("input") ||
                    target.closest("[data-no-nav]")
                  )
                    return
                  window.location.href = `/app/transactions/${tx.id}`
                }}
              >
                <Table.Cell onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(tx.id)}
                    onChange={() => toggleSelect(tx.id)}
                    className="cursor-pointer"
                  />
                </Table.Cell>
                <Table.Cell>
                  <Text className="text-sm font-mono">
                    {tx.order_number || tx.id.slice(0, 12) + "..."}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <div style={{ maxWidth: 200 }}>
                    <Text className="font-medium text-sm truncate block">
                      {itemLabel(tx)}
                    </Text>
                    {tx.article_number && (
                      <Text className="text-ui-fg-subtle text-xs">{tx.article_number}</Text>
                    )}
                    {tx.block_title && (
                      <Text className="text-ui-fg-subtle text-xs truncate block">
                        {tx.block_title}
                        {tx.lot_number ? ` · Lot ${tx.lot_number}` : ""}
                      </Text>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <div>
                    <Text className="text-sm">
                      {tx.customer_name || tx.shipping_name || "—"}
                    </Text>
                    {tx.customer_email && (
                      <Text className="text-xs text-ui-fg-muted">{tx.customer_email}</Text>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <Text className="font-mono font-medium text-sm">
                    {"\u20AC"}{Number(tx.total_amount).toFixed(2)}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-col gap-1">
                    <Badge color={STATUS_COLORS[tx.status] || "grey"}>
                      {tx.status}
                    </Badge>
                    {tx.payment_provider && (
                      <Text className="text-xs text-ui-fg-subtle capitalize">
                        {tx.payment_provider}
                      </Text>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <Badge
                    color={
                      FULFILLMENT_COLORS[tx.fulfillment_status] ||
                      FULFILLMENT_COLORS[tx.shipping_status] ||
                      "grey"
                    }
                  >
                    {tx.fulfillment_status || tx.shipping_status || "unfulfilled"}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  {tx.tracking_number ? (
                    <div>
                      <Text className="text-xs font-mono">{tx.tracking_number}</Text>
                      {tx.carrier && (
                        <Text className="text-ui-fg-subtle text-xs">{tx.carrier}</Text>
                      )}
                    </div>
                  ) : (
                    <Text className="text-ui-fg-subtle text-xs">—</Text>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Text className="text-xs">
                    {formatDate(tx.paid_at || tx.created_at)}
                  </Text>
                </Table.Cell>
                <Table.Cell onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1 items-start" data-no-nav>
                    {tx.status === "paid" &&
                      (tx.fulfillment_status === "unfulfilled" ||
                        tx.shipping_status === "pending") && (
                        <>
                          {shippingDialog === tx.id ? (
                            <div className="flex flex-col gap-2 min-w-[220px]">
                              <div>
                                <Label size="xsmall">Carrier</Label>
                                <Select
                                  value={carrier}
                                  onValueChange={setCarrier}
                                >
                                  <Select.Trigger>
                                    <Select.Value placeholder="Select carrier..." />
                                  </Select.Trigger>
                                  <Select.Content>
                                    {CARRIERS.map((c) => (
                                      <Select.Item key={c} value={c}>
                                        {c}
                                      </Select.Item>
                                    ))}
                                  </Select.Content>
                                </Select>
                              </div>
                              <div>
                                <Label size="xsmall">Tracking #</Label>
                                <Input
                                  size="small"
                                  placeholder="e.g. 00340434..."
                                  value={trackingNumber}
                                  onChange={(e) => setTrackingNumber(e.target.value)}
                                />
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  size="small"
                                  onClick={() => markAsShipped(tx.id)}
                                  disabled={updating}
                                >
                                  {updating ? "Saving..." : "Confirm"}
                                </Button>
                                <Button
                                  size="small"
                                  variant="secondary"
                                  onClick={() => {
                                    setShippingDialog(null)
                                    setTrackingNumber("")
                                    setCarrier("")
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              size="small"
                              onClick={() => setShippingDialog(tx.id)}
                            >
                              Ship
                            </Button>
                          )}
                        </>
                      )}
                    {tx.status === "paid" &&
                      (tx.fulfillment_status === "shipped" ||
                        tx.shipping_status === "shipped") && (
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => markAsDelivered(tx.id)}
                        >
                          Delivered
                        </Button>
                      )}
                    {tx.status === "paid" && (
                      <Button
                        size="small"
                        variant="danger"
                        onClick={() => refundTransaction(tx.id)}
                        disabled={refunding === tx.id}
                      >
                        {refunding === tx.id ? "..." : "Refund"}
                      </Button>
                    )}
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      {/* Pagination */}
      {!loading && totalCount > 0 && (
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-3">
            <Text className="text-sm text-ui-fg-subtle">
              Showing {showFrom}–{showTo} of {totalCount}
            </Text>
            <div className="flex items-center gap-1">
              <Label size="xsmall" className="text-ui-fg-subtle">Per page:</Label>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setOffset(0)
                }}
                className="border border-ui-border-base rounded px-2 py-1 text-sm bg-ui-bg-field text-ui-fg-base"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="small"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
            >
              Previous
            </Button>
            <Text className="text-sm text-ui-fg-subtle self-center">
              Page {currentPage} of {totalPages}
            </Text>
            <Button
              variant="secondary"
              size="small"
              disabled={offset + pageSize >= totalCount}
              onClick={() => setOffset(offset + pageSize)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ui-bg-base border border-ui-border-base rounded-lg shadow-lg px-6 py-3 flex items-center gap-4 z-50">
          <Text className="font-medium text-sm">
            {selected.size} selected
          </Text>
          <div className="w-px h-5 bg-ui-border-base" />
          <Button
            size="small"
            onClick={() => setBulkShipDialog(true)}
          >
            Mark as Shipped
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => exportTransactions(Array.from(selected))}
          >
            Export Selected
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Bulk Ship Dialog (overlay) */}
      {bulkShipDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-ui-bg-base border border-ui-border-base rounded-lg shadow-xl p-6 w-full max-w-md">
            <Heading level="h2" className="mb-4">
              Ship {selected.size} Transaction{selected.size > 1 ? "s" : ""}
            </Heading>
            <div className="flex flex-col gap-3 mb-4">
              <div>
                <Label size="small">Carrier</Label>
                <Select
                  value={bulkCarrier}
                  onValueChange={setBulkCarrier}
                >
                  <Select.Trigger>
                    <Select.Value placeholder="Select carrier..." />
                  </Select.Trigger>
                  <Select.Content>
                    {CARRIERS.map((c) => (
                      <Select.Item key={c} value={c}>
                        {c}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
              <div>
                <Label size="small">Tracking Number (optional, shared)</Label>
                <Input
                  placeholder="e.g. 00340434..."
                  value={bulkTracking}
                  onChange={(e) => setBulkTracking(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setBulkShipDialog(false)
                  setBulkCarrier("")
                  setBulkTracking("")
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={bulkShip}
                disabled={bulkUpdating}
              >
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
