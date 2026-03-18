import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
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
  created_at: string
  release_title: string | null
  release_artist: string | null
  article_number: string | null
  block_title: string | null
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
  actor: string | null
  metadata: Record<string, unknown> | null
  created_at: string
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

const EVENT_ICONS: Record<string, string> = {
  status_change: "\uD83D\uDD04",
  note: "\uD83D\uDCDD",
  email_sent: "\u2709\uFE0F",
  refund: "\uD83D\uDCB0",
  shipment: "\uD83D\uDCE6",
  cancellation: "\u274C",
  payment: "\uD83D\uDCB3",
  created: "\u2795",
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  const diffHrs = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin} min ago`
  if (diffHrs < 24) return `${diffHrs}h ago`
  if (diffDays < 30) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString("de-DE")
}

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

function formatAmount(val: number | null | undefined): string {
  if (val == null) return "\u20AC0.00"
  return `\u20AC${Number(val).toFixed(2)}`
}

const TransactionDetailPage = () => {
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
  const [noteText, setNoteText] = useState("")
  const [savingNote, setSavingNote] = useState(false)

  // Actions
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Cancel
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [cancelReason, setCancelReason] = useState("")

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
    if (
      !window.confirm(
        "Are you sure you want to refund this order? This will refund the full amount and set the release(s) back to available."
      )
    )
      return
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
        alert(
          `Refund successful (${data.transactions_refunded} item(s)). Refund: ${data.refund_status}`
        )
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

  if (loading) {
    return (
      <Container>
        <Text className="text-ui-fg-subtle py-12 text-center">Loading transaction...</Text>
      </Container>
    )
  }

  if (error || !transaction) {
    return (
      <Container>
        <Text className="text-ui-fg-error py-12 text-center">
          {error || "Transaction not found"}
        </Text>
      </Container>
    )
  }

  const tx = transaction
  const fulfillment = tx.fulfillment_status || tx.shipping_status || "unfulfilled"
  const isPaid = tx.status === "paid"
  const isUnfulfilled = fulfillment === "unfulfilled" || tx.shipping_status === "pending"
  const isShipped = fulfillment === "shipped" || tx.shipping_status === "shipped"

  const itemLabel = () => {
    const parts: string[] = []
    if (tx.release_artist) parts.push(tx.release_artist)
    if (tx.release_title) parts.push(tx.release_title)
    return parts.length > 0 ? parts.join(" — ") : tx.id.slice(0, 16)
  }

  return (
    <Container>
      {/* Back Link */}
      <div className="mb-4">
        <button
          onClick={() => (window.location.href = "/app/transactions")}
          className="text-ui-fg-subtle hover:text-ui-fg-base text-sm flex items-center gap-1"
        >
          <span>{"\u2190"}</span> Back to Transactions
        </button>
      </div>

      {/* Order Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Heading level="h1">
              {tx.order_number || tx.id.slice(0, 16)}
            </Heading>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge color={STATUS_COLORS[tx.status] || "grey"}>
              {tx.status}
            </Badge>
            <Badge
              color={
                FULFILLMENT_COLORS[fulfillment] || "grey"
              }
            >
              {fulfillment}
            </Badge>
            {tx.payment_provider && (
              <Badge color="grey">
                {tx.payment_provider}
              </Badge>
            )}
            {tx.item_type && (
              <Badge color="grey">
                {tx.item_type === "direct_purchase" ? "Direct Purchase" : "Auction"}
              </Badge>
            )}
          </div>
          <Text className="text-ui-fg-subtle text-sm mt-2">
            Created {formatDate(tx.created_at)}
            {tx.paid_at && ` · Paid ${formatDate(tx.paid_at)}`}
          </Text>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column — 3/5 */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          {/* Item Section */}
          <div className="border border-ui-border-base rounded-lg p-4">
            <Heading level="h2" className="mb-3 text-base">
              Items
            </Heading>
            <div className="flex items-center justify-between py-2 border-b border-ui-border-base">
              <div>
                <Text className="font-medium">{itemLabel()}</Text>
                <div className="flex gap-3 mt-1">
                  {tx.article_number && (
                    <Text className="text-xs text-ui-fg-subtle">
                      {tx.article_number}
                    </Text>
                  )}
                  {tx.block_title && (
                    <Text className="text-xs text-ui-fg-subtle">
                      {tx.block_title}
                      {tx.lot_number ? ` · Lot ${tx.lot_number}` : ""}
                    </Text>
                  )}
                </div>
              </div>
              <Text className="font-mono font-medium">{formatAmount(tx.amount)}</Text>
            </div>
            {tx.order_group_id && (
              <Text className="text-xs text-ui-fg-subtle mt-2">
                Order Group: {tx.order_group_id}
              </Text>
            )}
          </div>

          {/* Shipping Address */}
          {(tx.shipping_name || tx.shipping_city) && (
            <div className="border border-ui-border-base rounded-lg p-4">
              <Heading level="h2" className="mb-3 text-base">
                Shipping Address
              </Heading>
              <div className="space-y-1">
                {tx.shipping_name && (
                  <Text className="font-medium">{tx.shipping_name}</Text>
                )}
                {tx.shipping_address_line1 && <Text className="text-sm">{tx.shipping_address_line1}</Text>}
                <Text className="text-sm">
                  {[tx.shipping_postal_code, tx.shipping_city].filter(Boolean).join(" ")}
                </Text>
                {tx.shipping_country && (
                  <Text className="text-sm text-ui-fg-subtle">{tx.shipping_country}</Text>
                )}
              </div>
            </div>
          )}

          {/* Billing Address */}
          {tx.billing_name && tx.billing_name !== tx.shipping_name && (
            <div className="border border-ui-border-base rounded-lg p-4">
              <Heading level="h2" className="mb-3 text-base">
                Billing Address
              </Heading>
              <div className="space-y-1">
                <Text className="font-medium">{tx.billing_name}</Text>
                {tx.billing_address_line1 && <Text className="text-sm">{tx.billing_address_line1}</Text>}
                <Text className="text-sm">
                  {[tx.billing_postal_code, tx.billing_city].filter(Boolean).join(" ")}
                </Text>
                {tx.billing_country && (
                  <Text className="text-sm text-ui-fg-subtle">{tx.billing_country}</Text>
                )}
              </div>
            </div>
          )}

          {/* Payment Details */}
          <div className="border border-ui-border-base rounded-lg p-4">
            <Heading level="h2" className="mb-3 text-base">
              Payment Details
            </Heading>
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <Badge color="grey" className="capitalize">
                  {tx.payment_provider || "—"}
                </Badge>
              </div>

              {tx.stripe_payment_intent_id && (
                <div className="flex justify-between text-sm">
                  <Text className="text-ui-fg-subtle">Stripe PI</Text>
                  <Text className="font-mono text-xs">
                    {tx.stripe_payment_intent_id}
                  </Text>
                </div>
              )}
              {tx.paypal_order_id && (
                <div className="flex justify-between text-sm">
                  <Text className="text-ui-fg-subtle">PayPal Order</Text>
                  <Text className="font-mono text-xs">{tx.paypal_order_id}</Text>
                </div>
              )}
              {tx.paypal_capture_id && (
                <div className="flex justify-between text-sm">
                  <Text className="text-ui-fg-subtle">PayPal Capture</Text>
                  <Text className="font-mono text-xs">{tx.paypal_capture_id}</Text>
                </div>
              )}

              <div className="border-t border-ui-border-base pt-2 mt-2 space-y-1">
                <div className="flex justify-between text-sm">
                  <Text>Subtotal</Text>
                  <Text className="font-mono">{formatAmount(tx.amount)}</Text>
                </div>
                <div className="flex justify-between text-sm">
                  <Text>Shipping</Text>
                  <Text className="font-mono">{formatAmount(tx.shipping_cost)}</Text>
                </div>
                {tx.discount_amount != null && Number(tx.discount_amount) > 0 && (
                  <div className="flex justify-between text-sm">
                    <Text>
                      Discount{tx.promo_code ? ` (${tx.promo_code})` : ""}
                    </Text>
                    <Text className="font-mono text-ui-fg-error">
                      -{formatAmount(tx.discount_amount)}
                    </Text>
                  </div>
                )}
                <div className="flex justify-between text-sm font-medium border-t border-ui-border-base pt-1">
                  <Text className="font-medium">Total</Text>
                  <Text className="font-mono font-medium">{formatAmount(tx.total_amount)}</Text>
                </div>
                {tx.refund_amount != null && Number(tx.refund_amount) > 0 && (
                  <div className="flex justify-between text-sm">
                    <Text className="text-ui-fg-error">Refunded</Text>
                    <Text className="font-mono text-ui-fg-error">
                      -{formatAmount(tx.refund_amount)}
                    </Text>
                  </div>
                )}
              </div>

              {/* Tracking info */}
              {tx.tracking_number && (
                <div className="border-t border-ui-border-base pt-2 mt-2">
                  <div className="flex justify-between text-sm">
                    <Text className="text-ui-fg-subtle">Carrier</Text>
                    <Text>{tx.carrier || "—"}</Text>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <Text className="text-ui-fg-subtle">Tracking</Text>
                    <Text className="font-mono text-xs">{tx.tracking_number}</Text>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Customer */}
          <div className="border border-ui-border-base rounded-lg p-4">
            <Heading level="h2" className="mb-3 text-base">
              Customer
            </Heading>
            <div className="space-y-1">
              <Text className="font-medium">
                {tx.customer_name || tx.shipping_name || "—"}
              </Text>
              {tx.customer_email && (
                <Text className="text-sm text-ui-fg-subtle">{tx.customer_email}</Text>
              )}
              <Text className="text-xs text-ui-fg-muted font-mono mt-1">
                ID: {tx.user_id}
              </Text>
            </div>
          </div>
        </div>

        {/* Right Column — 2/5 */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Action Buttons */}
          <div className="border border-ui-border-base rounded-lg p-4">
            <Heading level="h2" className="mb-3 text-base">
              Actions
            </Heading>
            <div className="flex flex-col gap-3">
              {/* Ship Order */}
              {isPaid && isUnfulfilled && (
                <>
                  {showShipForm ? (
                    <div className="flex flex-col gap-2 border border-ui-border-base rounded p-3 bg-ui-bg-subtle">
                      <div>
                        <Label size="xsmall">Carrier</Label>
                        <Select value={shipCarrier} onValueChange={setShipCarrier}>
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
                        <Label size="xsmall">Tracking Number</Label>
                        <Input
                          size="small"
                          placeholder="e.g. 00340434..."
                          value={shipTracking}
                          onChange={(e) => setShipTracking(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="small"
                          onClick={handleShip}
                          disabled={shipping}
                        >
                          {shipping ? "Shipping..." : "Confirm Ship"}
                        </Button>
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => {
                            setShowShipForm(false)
                            setShipCarrier("")
                            setShipTracking("")
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button onClick={() => setShowShipForm(true)}>
                      {"\uD83D\uDCE6"} Ship Order
                    </Button>
                  )}
                </>
              )}

              {/* Mark Delivered */}
              {isPaid && isShipped && (
                <Button
                  variant="secondary"
                  onClick={handleDelivered}
                  disabled={actionLoading === "deliver"}
                >
                  {actionLoading === "deliver" ? "Updating..." : "\u2705 Mark Delivered"}
                </Button>
              )}

              {/* Refund */}
              {isPaid && (
                <Button
                  variant="danger"
                  onClick={handleRefund}
                  disabled={actionLoading === "refund"}
                >
                  {actionLoading === "refund" ? "Refunding..." : "\uD83D\uDCB0 Refund Order"}
                </Button>
              )}

              {/* Cancel */}
              {isPaid && isUnfulfilled && (
                <>
                  {showCancelForm ? (
                    <div className="flex flex-col gap-2 border border-ui-border-base rounded p-3 bg-ui-bg-subtle">
                      <div>
                        <Label size="xsmall">Reason (optional)</Label>
                        <Input
                          size="small"
                          placeholder="Reason for cancellation..."
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="small"
                          variant="danger"
                          onClick={handleCancel}
                          disabled={actionLoading === "cancel"}
                        >
                          {actionLoading === "cancel" ? "Cancelling..." : "Confirm Cancel"}
                        </Button>
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => {
                            setShowCancelForm(false)
                            setCancelReason("")
                          }}
                        >
                          Back
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => setShowCancelForm(true)}
                    >
                      {"\u274C"} Cancel Order
                    </Button>
                  )}
                </>
              )}

              {/* Download Invoice */}
              {isPaid && tx.order_group_id && (
                <a
                  href={`/admin/transactions/${tx.id}/invoice`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block"
                >
                  <Button variant="secondary" className="w-full">
                    {"\uD83D\uDCC4"} Download Invoice
                  </Button>
                </a>
              )}
            </div>
          </div>

          {/* Admin Note */}
          <div className="border border-ui-border-base rounded-lg p-4">
            <Heading level="h2" className="mb-3 text-base">
              Admin Note
            </Heading>
            {tx.internal_note && (
              <div className="bg-ui-bg-subtle border border-ui-border-base rounded p-3 mb-3">
                <Text className="text-sm whitespace-pre-wrap">{tx.internal_note}</Text>
              </div>
            )}
            <div className="flex gap-2">
              <Input
                size="small"
                placeholder="Add a note..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && noteText.trim()) handleAddNote()
                }}
                className="flex-1"
              />
              <Button
                size="small"
                onClick={handleAddNote}
                disabled={savingNote || !noteText.trim()}
              >
                {savingNote ? "..." : "Add"}
              </Button>
            </div>
          </div>

          {/* Timeline */}
          <div className="border border-ui-border-base rounded-lg p-4">
            <Heading level="h2" className="mb-3 text-base">
              Activity
            </Heading>
            {events.length === 0 ? (
              <Text className="text-ui-fg-subtle text-sm">No events recorded yet.</Text>
            ) : (
              <div className="space-y-0">
                {events
                  .sort(
                    (a, b) =>
                      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                  )
                  .map((event, idx) => (
                    <div
                      key={event.id || idx}
                      className="flex gap-3 py-3 border-b border-ui-border-base last:border-b-0"
                    >
                      <div className="text-lg flex-shrink-0 mt-0.5">
                        {EVENT_ICONS[event.event_type] || "\u2022"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Text className="text-sm font-medium">{event.title}</Text>
                        {event.description && (
                          <Text className="text-xs text-ui-fg-subtle mt-0.5">
                            {event.description}
                          </Text>
                        )}
                        <div className="flex gap-2 mt-1">
                          {event.actor && (
                            <Text className="text-xs text-ui-fg-muted">{event.actor}</Text>
                          )}
                          <Text className="text-xs text-ui-fg-muted">
                            {relativeTime(event.created_at)}
                          </Text>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Dates Summary */}
          <div className="border border-ui-border-base rounded-lg p-4">
            <Heading level="h2" className="mb-3 text-base">
              Dates
            </Heading>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <Text className="text-ui-fg-subtle">Created</Text>
                <Text>{formatDate(tx.created_at)}</Text>
              </div>
              {tx.paid_at && (
                <div className="flex justify-between">
                  <Text className="text-ui-fg-subtle">Paid</Text>
                  <Text>{formatDate(tx.paid_at)}</Text>
                </div>
              )}
              {tx.shipped_at && (
                <div className="flex justify-between">
                  <Text className="text-ui-fg-subtle">Shipped</Text>
                  <Text>{formatDate(tx.shipped_at)}</Text>
                </div>
              )}
              {tx.delivered_at && (
                <div className="flex justify-between">
                  <Text className="text-ui-fg-subtle">Delivered</Text>
                  <Text>{formatDate(tx.delivered_at)}</Text>
                </div>
              )}
              {tx.cancelled_at && (
                <div className="flex justify-between">
                  <Text className="text-ui-fg-subtle text-ui-fg-error">Cancelled</Text>
                  <Text>{formatDate(tx.cancelled_at)}</Text>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Container>
  )
}

// NO defineRouteConfig on detail pages — causes routing conflicts
export default TransactionDetailPage
