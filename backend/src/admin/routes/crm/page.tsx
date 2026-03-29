import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Component, useEffect, useState, useCallback, useRef } from "react"
import { useAdminNav } from "../../components/admin-nav"

class ErrorBoundary extends Component<{children: React.ReactNode},{error:string|null}> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e.message || String(e) } }
  render() {
    if (this.state.error) return <div style={{padding:"32px",color:"#ef4444",fontFamily:"monospace",fontSize:"13px"}}><b>Render Error:</b> {this.state.error}</div>
    return this.props.children
  }
}

export const config = defineRouteConfig({
  label: "Customers",
})

// ── Types ─────────────────────────────────────────────────────────────────────

type CRMData = {
  configured: boolean
  overview?: {
    total_contacts: number
    vod_auctions: number
    tape_mag: number
    newsletter_optins: number
    medusa_customers: number
  }
  segments?: Record<string, number>
  top_customers?: TopCustomer[]
  recent_contacts?: RecentContact[]
  recent_medusa_customers?: MedusaCustomer[]
  campaigns?: Campaign[]
  total_campaigns?: number
}

type TopCustomer = {
  email: string
  name: string
  platform: string
  segment: string
  total_spent: number
  total_purchases: number
  total_bids: number
  total_wins: number
}

type RecentContact = {
  email: string
  name: string
  platform: string
  segment: string
  newsletter: boolean
}

type MedusaCustomer = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  created_at: string
}

type Campaign = {
  id: number
  name: string
  subject: string
  sentDate: string
  stats: {
    sent: number
    opens: number
    clicks: number
    openRate: string
    clickRate: string
  } | null
}

type CustomerListItem = {
  id: string
  email: string
  name: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  created_at: string
  total_spent: number
  total_purchases: number
  total_bids: number
  total_wins: number
  last_purchase_at: string | null
  first_purchase_at: string | null
  last_bid_at: string | null
  tags: string[]
  is_vip: boolean
  is_dormant: boolean
  stats_updated_at: string | null
}

type CustomerDetail = CustomerListItem & {
  // extended with orders, bids, addresses in detail view
}

type CustomerDetailData = {
  customer: CustomerDetail
  orders: Array<{
    id: string
    order_number: string | null
    amount: number
    status: string
    fulfillment_status: string
    item_type: string
    payment_provider: string
    created_at: string
    updated_at: string
    shipping_name: string | null
    shipping_country: string | null
    lot_number: number | null
    auction_title: string | null
    release_id: string | null
  }>
  bids: Array<{
    id: string
    amount: number
    is_winning: boolean
    is_outbid: boolean
    created_at: string
    lot_number: number | null
    auction_title: string | null
    auction_block_id: string | null
  }>
  addresses: Array<{
    shipping_name: string | null
    shipping_address_line1: string | null
    shipping_address_line2: string | null
    shipping_city: string | null
    shipping_postal_code: string | null
    shipping_country: string | null
    created_at: string
  }>
}

// ── Constants ────────────────────────────────────────────────────────────────

const COLORS = {
  bg: "#1c1915",
  card: "#2a2520",
  text: "#f5f0eb",
  muted: "#a09080",
  gold: "#d4a54a",
  border: "#3a3530",
  hover: "#353025",
  success: "#22c55e",
  error: "#ef4444",
  blue: "#60a5fa",
  purple: "#c084fc",
  orange: "#fb923c",
}

const SEGMENT_COLORS: Record<string, string> = {
  registered: COLORS.blue,
  bidder: COLORS.orange,
  buyer: COLORS.success,
  vip: COLORS.gold,
  imported: COLORS.muted,
  unknown: COLORS.muted,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (d: string | null) => {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

const formatDateTime = (d: string | null) => {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const formatPrice = (p: number | null | undefined) => {
  if (p === null || p === undefined || p === 0) return "—"
  return `€${p.toFixed(2)}`
}

const SegmentBadge = ({ segment }: { segment: string }) => (
  <span
    style={{
      padding: "2px 8px",
      borderRadius: "4px",
      fontSize: "11px",
      fontWeight: 600,
      background: (SEGMENT_COLORS[segment] || COLORS.muted) + "20",
      color: SEGMENT_COLORS[segment] || COLORS.muted,
      textTransform: "capitalize" as const,
    }}
  >
    {segment}
  </span>
)

const PlatformBadge = ({ platform }: { platform: string }) => (
  <span
    style={{
      padding: "2px 8px",
      borderRadius: "4px",
      fontSize: "11px",
      fontWeight: 600,
      background:
        platform === "vod-auctions"
          ? COLORS.gold + "20"
          : platform === "tape-mag"
            ? COLORS.purple + "20"
            : COLORS.muted + "20",
      color:
        platform === "vod-auctions"
          ? COLORS.gold
          : platform === "tape-mag"
            ? COLORS.purple
            : COLORS.muted,
    }}
  >
    {platform}
  </span>
)

// ── Customer Detail Drawer ───────────────────────────────────────────────────

function CustomerDetailDrawer({
  customerId,
  onClose,
}: {
  customerId: string | null
  onClose: () => void
}) {
  const [data, setData] = useState<CustomerDetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [drawerTab, setDrawerTab] = useState<"overview" | "orders" | "bids">("overview")

  useEffect(() => {
    if (!customerId) {
      setData(null)
      return
    }
    setLoading(true)
    setDrawerTab("overview")
    fetch(`/admin/customers/${customerId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [customerId])

  const isOpen = !!customerId

  const drawerStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: "540px",
    background: COLORS.card,
    borderLeft: `1px solid ${COLORS.border}`,
    zIndex: 1000,
    transform: isOpen ? "translateX(0)" : "translateX(100%)",
    transition: "transform 0.25s ease",
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
  }

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    zIndex: 999,
    opacity: isOpen ? 1 : 0,
    pointerEvents: isOpen ? "all" : "none",
    transition: "opacity 0.25s ease",
  }

  const c = data?.customer

  const drawerTabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: active ? 600 : 400,
    color: active ? COLORS.gold : COLORS.muted,
    borderBottom: active ? `2px solid ${COLORS.gold}` : "2px solid transparent",
    cursor: "pointer",
    background: "none",
    border: "none",
    borderBottomColor: active ? COLORS.gold : "transparent",
    borderBottomWidth: "2px",
    borderBottomStyle: "solid",
  })

  return (
    <>
      {isOpen && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999 }} onClick={onClose} />}
      <div style={drawerStyle}>
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: `1px solid ${COLORS.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            {loading ? (
              <div style={{ color: COLORS.muted, fontSize: "14px" }}>Loading...</div>
            ) : c ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <h2 style={{ fontSize: "18px", fontWeight: 700, color: COLORS.text }}>
                    {c.name}
                  </h2>
                  {c.is_vip && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 700,
                        background: COLORS.gold + "20",
                        color: COLORS.gold,
                      }}
                    >
                      VIP
                    </span>
                  )}
                  {c.is_dormant && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        background: COLORS.muted + "20",
                        color: COLORS.muted,
                      }}
                    >
                      Dormant
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "13px", color: COLORS.muted, fontFamily: "monospace" }}>
                  {c.email}
                </div>
                <div style={{ fontSize: "12px", color: COLORS.muted, marginTop: "4px" }}>
                  Customer since {formatDate(c.created_at)}
                </div>
              </>
            ) : null}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: COLORS.muted,
              cursor: "pointer",
              fontSize: "20px",
              lineHeight: 1,
              padding: "4px",
            }}
          >
            ✕
          </button>
        </div>

        {/* KPI Row */}
        {c && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "1px",
              background: COLORS.border,
              borderBottom: `1px solid ${COLORS.border}`,
            }}
          >
            {[
              { label: "Spent", value: formatPrice(c.total_spent) },
              { label: "Purchases", value: c.total_purchases },
              { label: "Bids", value: c.total_bids },
              { label: "Wins", value: c.total_wins },
            ].map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  background: COLORS.card,
                  padding: "12px 16px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "18px", fontWeight: 700, color: COLORS.gold }}>
                  {kpi.value}
                </div>
                <div style={{ fontSize: "11px", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {kpi.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Drawer Tabs */}
        {c && (
          <div style={{ borderBottom: `1px solid ${COLORS.border}`, display: "flex", gap: "0" }}>
            <button style={drawerTabStyle(drawerTab === "overview")} onClick={() => setDrawerTab("overview")}>Overview</button>
            <button style={drawerTabStyle(drawerTab === "orders")} onClick={() => setDrawerTab("orders")}>
              Orders ({data?.orders.length || 0})
            </button>
            <button style={drawerTabStyle(drawerTab === "bids")} onClick={() => setDrawerTab("bids")}>
              Bids ({data?.bids.length || 0})
            </button>
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto" }}>
          {loading && <div style={{ color: COLORS.muted }}>Loading customer data...</div>}

          {/* Overview Tab */}
          {!loading && c && drawerTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Tags */}
              {c.tags && c.tags.length > 0 && (
                <div>
                  <div style={{ fontSize: "11px", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Tags</div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {c.tags.map((tag: string) => (
                      <span
                        key={tag}
                        style={{
                          padding: "3px 10px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          background: COLORS.blue + "20",
                          color: COLORS.blue,
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div>
                <div style={{ fontSize: "11px", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Timeline</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {[
                    { label: "Registered", value: formatDateTime(c.created_at) },
                    { label: "First Purchase", value: formatDateTime(c.first_purchase_at) },
                    { label: "Last Purchase", value: formatDateTime(c.last_purchase_at) },
                    { label: "Last Bid", value: formatDateTime(c.last_bid_at) },
                  ].map((row) => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                      <span style={{ color: COLORS.muted }}>{row.label}</span>
                      <span style={{ color: COLORS.text }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Addresses */}
              {data?.addresses && data.addresses.length > 0 && (
                <div>
                  <div style={{ fontSize: "11px", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                    Known Addresses
                  </div>
                  {data.addresses.slice(0, 3).map((addr, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "10px 12px",
                        background: COLORS.bg,
                        borderRadius: "6px",
                        marginBottom: "8px",
                        fontSize: "12px",
                        lineHeight: "1.6",
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>{addr.shipping_name}</div>
                      <div style={{ color: COLORS.muted }}>
                        {[addr.shipping_address_line1, addr.shipping_address_line2].filter(Boolean).join(", ")}
                      </div>
                      <div style={{ color: COLORS.muted }}>
                        {[addr.shipping_postal_code, addr.shipping_city, addr.shipping_country].filter(Boolean).join(" ")}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Phone */}
              {c.phone && (
                <div>
                  <div style={{ fontSize: "11px", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Phone</div>
                  <div style={{ fontSize: "13px" }}>{c.phone}</div>
                </div>
              )}

              {/* Stats freshness */}
              {c.stats_updated_at && (
                <div style={{ fontSize: "11px", color: COLORS.muted, marginTop: "8px" }}>
                  Stats last updated: {formatDateTime(c.stats_updated_at)}
                </div>
              )}
            </div>
          )}

          {/* Orders Tab */}
          {!loading && c && drawerTab === "orders" && (
            <div>
              {data?.orders.length === 0 ? (
                <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>No orders yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {data?.orders.map((order) => (
                    <div
                      key={order.id}
                      style={{
                        padding: "12px",
                        background: COLORS.bg,
                        borderRadius: "6px",
                        fontSize: "13px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 600, color: COLORS.gold }}>
                          {order.order_number || order.id.slice(-8)}
                        </span>
                        <span style={{ color: COLORS.gold, fontWeight: 600 }}>
                          {formatPrice(order.amount)}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <span
                          style={{
                            padding: "1px 6px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            background: order.status === "paid" ? COLORS.success + "20" : COLORS.muted + "20",
                            color: order.status === "paid" ? COLORS.success : COLORS.muted,
                          }}
                        >
                          {order.status}
                        </span>
                        <span
                          style={{
                            padding: "1px 6px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            background: COLORS.blue + "20",
                            color: COLORS.blue,
                          }}
                        >
                          {order.fulfillment_status}
                        </span>
                        <span style={{ fontSize: "11px", color: COLORS.muted }}>{order.payment_provider}</span>
                      </div>
                      {order.auction_title && (
                        <div style={{ fontSize: "11px", color: COLORS.muted, marginTop: "4px" }}>
                          {order.auction_title}{order.lot_number ? ` · Lot #${order.lot_number}` : ""}
                        </div>
                      )}
                      <div style={{ fontSize: "11px", color: COLORS.muted, marginTop: "4px" }}>
                        {formatDate(order.created_at)}
                        {order.shipping_country ? ` · ${order.shipping_country}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Bids Tab */}
          {!loading && c && drawerTab === "bids" && (
            <div>
              {data?.bids.length === 0 ? (
                <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>No bids yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {data?.bids.map((bid) => (
                    <div
                      key={bid.id}
                      style={{
                        padding: "10px 12px",
                        background: COLORS.bg,
                        borderRadius: "6px",
                        fontSize: "13px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "12px", color: COLORS.muted }}>
                          {bid.auction_title}{bid.lot_number ? ` · Lot #${bid.lot_number}` : ""}
                        </div>
                        <div style={{ fontSize: "11px", color: COLORS.muted }}>{formatDate(bid.created_at)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 600, color: bid.is_winning ? COLORS.success : COLORS.text }}>
                          {formatPrice(bid.amount)}
                        </div>
                        <div style={{ fontSize: "11px", color: bid.is_winning ? COLORS.success : bid.is_outbid ? COLORS.error : COLORS.muted }}>
                          {bid.is_winning ? "Winning" : bid.is_outbid ? "Outbid" : "Active"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Customers List Tab ───────────────────────────────────────────────────────

function CustomersListTab({
  onSelectCustomer,
}: {
  onSelectCustomer: (id: string) => void
}) {
  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [offset, setOffset] = useState(0)
  const [sort, setSort] = useState("created_at")
  const [order, setOrder] = useState("desc")
  const limit = 50
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchCustomers = useCallback((query: string, offsetVal: number, sortVal: string, orderVal: string) => {
    setLoading(true)
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      offset: String(offsetVal),
      sort: sortVal,
      order: orderVal,
    })
    fetch(`/admin/customers/list?${params}`, { credentials: "include", cache: "no-store" })
      .then((r) => {
        if (!r.ok) { setLoading(false); return }
        return r.json()
      })
      .then((d) => {
        if (!d) return
        setCustomers(d.customers || [])
        setTotal(d.total || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchCustomers(q, offset, sort, order)
  }, [fetchCustomers, offset, sort, order])

  function handleSearch(value: string) {
    setQ(value)
    setOffset(0)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      fetchCustomers(value, 0, sort, order)
    }, 300)
  }

  function handleSort(col: string) {
    if (sort === col) {
      setOrder(order === "desc" ? "asc" : "desc")
    } else {
      setSort(col)
      setOrder("desc")
    }
    setOffset(0)
  }

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: `1px solid ${COLORS.border}`,
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
  }

  const tdStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: "13px",
    color: COLORS.text,
    borderBottom: `1px solid ${COLORS.border}`,
    verticalAlign: "middle",
  }

  const sortIndicator = (col: string) => sort === col ? (order === "desc" ? " ↓" : " ↑") : ""

  return (
    <div>
      {/* Search + Summary */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px" }}>
        <input
          type="text"
          placeholder="Search by name or email..."
          value={q}
          onChange={(e) => handleSearch(e.target.value)}
          style={{
            flex: 1,
            maxWidth: "360px",
            padding: "8px 12px",
            borderRadius: "6px",
            border: `1px solid ${COLORS.border}`,
            background: COLORS.card,
            color: COLORS.text,
            fontSize: "14px",
            outline: "none",
          }}
        />
        <div style={{ fontSize: "13px", color: COLORS.muted }}>
          {loading ? "Loading..." : `${total.toLocaleString("en-US")} customers`}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle} onClick={() => handleSort("created_at")}>
                Customer{sortIndicator("created_at")}
              </th>
              <th style={thStyle} onClick={() => handleSort("total_spent")}>
                Spent{sortIndicator("total_spent")}
              </th>
              <th style={thStyle} onClick={() => handleSort("total_purchases")}>
                Orders{sortIndicator("total_purchases")}
              </th>
              <th style={thStyle}>Bids</th>
              <th style={thStyle} onClick={() => handleSort("last_purchase_at")}>
                Last Order{sortIndicator("last_purchase_at")}
              </th>
              <th style={thStyle}>Tags</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: COLORS.muted, padding: "32px" }}>
                  Loading...
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: COLORS.muted, padding: "32px" }}>
                  {q ? "No customers match your search." : "No customers yet."}
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => onSelectCustomer(c.id)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: "6px" }}>
                          {c.name}
                          {c.is_vip && (
                            <span style={{ padding: "1px 5px", borderRadius: "3px", fontSize: "10px", fontWeight: 700, background: COLORS.gold + "20", color: COLORS.gold }}>
                              VIP
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "11px", color: COLORS.muted, fontFamily: "monospace" }}>{c.email}</div>
                        <div style={{ fontSize: "11px", color: COLORS.muted }}>{formatDate(c.created_at)}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: COLORS.gold, fontWeight: 600 }}>
                    {formatPrice(c.total_spent)}
                  </td>
                  <td style={tdStyle}>{c.total_purchases}</td>
                  <td style={tdStyle}>
                    <span style={{ color: COLORS.text }}>{c.total_bids}</span>
                    {c.total_wins > 0 && (
                      <span style={{ color: COLORS.success, fontSize: "11px", marginLeft: "4px" }}>
                        ({c.total_wins}W)
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontSize: "12px", color: COLORS.muted }}>
                    {formatDate(c.last_purchase_at)}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {c.is_dormant && (
                        <span style={{ padding: "1px 6px", borderRadius: "4px", fontSize: "10px", background: COLORS.muted + "20", color: COLORS.muted }}>
                          dormant
                        </span>
                      )}
                      {c.tags?.slice(0, 2).map((tag: string) => (
                        <span key={tag} style={{ padding: "1px 6px", borderRadius: "4px", fontSize: "10px", background: COLORS.blue + "20", color: COLORS.blue }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > limit && (
        <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "16px" }}>
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            style={{
              padding: "6px 14px",
              borderRadius: "5px",
              border: `1px solid ${COLORS.border}`,
              background: COLORS.card,
              color: offset === 0 ? COLORS.muted : COLORS.text,
              cursor: offset === 0 ? "default" : "pointer",
              fontSize: "13px",
            }}
          >
            ← Previous
          </button>
          <span style={{ fontSize: "13px", color: COLORS.muted, padding: "6px 8px" }}>
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            style={{
              padding: "6px 14px",
              borderRadius: "5px",
              border: `1px solid ${COLORS.border}`,
              background: COLORS.card,
              color: offset + limit >= total ? COLORS.muted : COLORS.text,
              cursor: offset + limit >= total ? "default" : "pointer",
              fontSize: "13px",
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

// ── CRM Dashboard Tab ────────────────────────────────────────────────────────

function CRMDashboardTab() {
  const [data, setData] = useState<CRMData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/admin/customers", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const cardStyle: React.CSSProperties = {
    background: COLORS.card,
    borderRadius: "8px",
    padding: "20px",
    border: `1px solid ${COLORS.border}`,
  }

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: `1px solid ${COLORS.border}`,
    whiteSpace: "nowrap",
  }

  const tdStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: "13px",
    color: COLORS.text,
    borderBottom: `1px solid ${COLORS.border}`,
    verticalAlign: "top",
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "4px",
  }

  const bigValueStyle: React.CSSProperties = {
    fontSize: "28px",
    fontWeight: 700,
    color: COLORS.gold,
  }

  if (loading) {
    return <div style={{ color: COLORS.muted }}>Loading CRM data...</div>
  }

  if (!data?.configured) {
    return (
      <div style={cardStyle}>
        <p style={{ color: COLORS.muted }}>
          Brevo is not configured. Set <code style={{ color: COLORS.gold }}>BREVO_API_KEY</code> in your environment to enable CRM features.
        </p>
      </div>
    )
  }

  const overview = data.overview!
  const segments = data.segments || {}
  const segmentEntries = Object.entries(segments).sort(([, a], [, b]) => b - a)
  const totalSegmented = segmentEntries.reduce((sum, [, count]) => sum + count, 0)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Overview Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px" }}>
        {[
          { label: "Total Contacts", value: overview.total_contacts.toLocaleString("en-US") },
          { label: "VOD Auctions", value: overview.vod_auctions.toLocaleString("en-US") },
          { label: "TAPE-MAG", value: overview.tape_mag.toLocaleString("en-US") },
          {
            label: "Newsletter Opt-ins",
            value: overview.newsletter_optins.toLocaleString("en-US"),
            color: COLORS.success,
          },
          { label: "Medusa Customers", value: overview.medusa_customers.toLocaleString("en-US") },
        ].map((card) => (
          <div key={card.label} style={cardStyle}>
            <div style={labelStyle}>{card.label}</div>
            <div style={{ ...bigValueStyle, color: card.color || COLORS.gold }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Segments + Recent */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "20px" }}>
        {/* Segment Distribution */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
            Customer Segments
          </h2>
          {segmentEntries.length === 0 ? (
            <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>No segment data yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {segmentEntries.map(([segment, count]) => {
                const pct = totalSegmented > 0 ? Math.round((count / totalSegmented) * 100) : 0
                const color = SEGMENT_COLORS[segment] || COLORS.muted
                return (
                  <div key={segment}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "13px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, display: "inline-block" }} />
                        <span style={{ fontWeight: 500, textTransform: "capitalize" }}>{segment}</span>
                      </span>
                      <span style={{ color: COLORS.muted }}>{count} ({pct}%)</span>
                    </div>
                    <div style={{ height: "6px", borderRadius: "3px", background: COLORS.border, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "3px", transition: "width 0.3s" }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent Contacts */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
            Recent CRM Contacts
          </h2>
          {!data.recent_contacts?.length ? (
            <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>No contacts yet.</div>
          ) : (
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Platform</th>
                    <th style={thStyle}>Segment</th>
                    <th style={thStyle}>Newsletter</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_contacts.map((c) => (
                    <tr key={c.email} onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{c.name}</td>
                      <td style={{ ...tdStyle, fontSize: "12px", fontFamily: "monospace" }}>{c.email}</td>
                      <td style={tdStyle}><PlatformBadge platform={c.platform} /></td>
                      <td style={tdStyle}><SegmentBadge segment={c.segment} /></td>
                      <td style={tdStyle}>
                        <span style={{ color: c.newsletter ? COLORS.success : COLORS.muted }}>
                          {c.newsletter ? "✓" : "✗"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Top Customers */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
          Top Customers by Spend
        </h2>
        {!data.top_customers?.length ? (
          <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>No purchase data yet.</div>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: "40px" }}>#</th>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Platform</th>
                  <th style={thStyle}>Segment</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Spent</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Purchases</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Bids</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Wins</th>
                </tr>
              </thead>
              <tbody>
                {data.top_customers.map((c, idx) => (
                  <tr key={c.email} onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ ...tdStyle, color: COLORS.muted, fontWeight: 600 }}>{idx + 1}</td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{c.name}</td>
                    <td style={{ ...tdStyle, fontSize: "12px", fontFamily: "monospace" }}>{c.email}</td>
                    <td style={tdStyle}><PlatformBadge platform={c.platform} /></td>
                    <td style={tdStyle}><SegmentBadge segment={c.segment} /></td>
                    <td style={{ ...tdStyle, textAlign: "right", color: COLORS.gold, fontWeight: 600 }}>{formatPrice(c.total_spent)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.total_purchases}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.total_bids}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.total_wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Campaign Performance */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
          Campaign Performance
          {data.total_campaigns ? (
            <span style={{ fontSize: "13px", fontWeight: 400, color: COLORS.muted, marginLeft: "8px" }}>
              ({data.total_campaigns} total)
            </span>
          ) : null}
        </h2>
        {!data.campaigns?.length ? (
          <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>No campaigns sent yet.</div>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Campaign</th>
                  <th style={thStyle}>Date</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Sent</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Opens</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Open Rate</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Clicks</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Click Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c) => (
                  <tr key={c.id} onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ ...tdStyle, fontWeight: 500, maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatDateTime(c.sentDate)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.stats?.sent?.toLocaleString("en-US") || "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.stats?.opens?.toLocaleString("en-US") || "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: COLORS.gold }}>{c.stats?.openRate ? `${c.stats.openRate}%` : "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.stats?.clicks?.toLocaleString("en-US") || "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: COLORS.gold }}>{c.stats?.clickRate ? `${c.stats.clickRate}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

const CustomersPage = () => {
  useAdminNav()
  const [activeTab, setActiveTab] = useState<"crm" | "customers">("customers")
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 20px",
    fontSize: "14px",
    fontWeight: active ? 600 : 400,
    color: active ? COLORS.gold : COLORS.muted,
    borderBottom: `2px solid ${active ? COLORS.gold : "transparent"}`,
    cursor: "pointer",
    background: "none",
    border: "none",
    borderBottomColor: active ? COLORS.gold : "transparent",
    borderBottomWidth: "2px",
    borderBottomStyle: "solid",
  })

  return (
    <div style={{ padding: "24px", background: COLORS.bg, minHeight: "100vh", color: COLORS.text }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700 }}>Customers</h1>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: `1px solid ${COLORS.border}`, marginBottom: "24px", display: "flex" }}>
        <button style={tabStyle(activeTab === "customers")} onClick={() => setActiveTab("customers")}>
          Customers
        </button>
        <button style={tabStyle(activeTab === "crm")} onClick={() => setActiveTab("crm")}>
          CRM Dashboard
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "customers" && (
        <CustomersListTab onSelectCustomer={setSelectedCustomerId} />
      )}
      {activeTab === "crm" && <CRMDashboardTab />}

      {/* Customer Detail Drawer */}
      <CustomerDetailDrawer
        customerId={selectedCustomerId}
        onClose={() => setSelectedCustomerId(null)}
      />
    </div>
  )
}

function CustomersPageWithBoundary() {
  return <ErrorBoundary><CustomersPage /></ErrorBoundary>
}

export default CustomersPageWithBoundary
