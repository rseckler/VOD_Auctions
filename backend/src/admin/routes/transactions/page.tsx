import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar } from "@medusajs/icons"
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
import { useEffect, useState } from "react"

type Transaction = {
  id: string
  user_id: string
  block_item_id: string | null
  release_id: string | null
  item_type: string
  order_group_id: string | null
  amount: number
  shipping_cost: number
  total_amount: number
  status: string
  shipping_status: string
  tracking_number: string | null
  carrier: string | null
  paid_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  created_at: string
  release_title: string | null
  release_artist: string | null
  block_title: string | null
  lot_number: number | null
  shipping_name: string | null
  shipping_city: string | null
  shipping_country: string | null
}

const CARRIERS = ["DHL", "DPD", "Hermes", "GLS", "UPS", "FedEx", "Deutsche Post"]

const STATUS_COLORS: Record<string, "green" | "orange" | "blue" | "grey" | "red"> = {
  pending: "grey",
  paid: "green",
  failed: "red",
  refunded: "orange",
}

const SHIPPING_COLORS: Record<string, "green" | "orange" | "blue" | "grey"> = {
  pending: "grey",
  shipped: "blue",
  delivered: "green",
}

const TransactionsPage = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("paid")
  const [shippingDialog, setShippingDialog] = useState<string | null>(null)
  const [trackingNumber, setTrackingNumber] = useState("")
  const [carrier, setCarrier] = useState("")
  const [updating, setUpdating] = useState(false)

  const fetchTransactions = async () => {
    try {
      const params = new URLSearchParams()
      if (filter) params.set("status", filter)
      const res = await fetch(`/admin/transactions?${params}`, {
        credentials: "include",
      })
      const data = await res.json()
      setTransactions(data.transactions || [])
    } catch (err) {
      console.error("Failed to fetch transactions:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchTransactions()
  }, [filter])

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

  const itemLabel = (tx: Transaction) => {
    const parts: string[] = []
    if (tx.release_artist) parts.push(tx.release_artist)
    if (tx.release_title) parts.push(tx.release_title)
    return parts.length > 0 ? parts.join(" — ") : tx.id.slice(0, 8)
  }

  return (
    <Container>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Heading level="h1">Transactions</Heading>
          <Text className="text-ui-fg-subtle mt-1">
            Manage payments and shipping
          </Text>
        </div>
        <div className="flex gap-2">
          {["all", "paid", "pending", "failed"].map((f) => (
            <Button
              key={f}
              variant={filter === (f === "all" ? "" : f) ? "primary" : "secondary"}
              size="small"
              onClick={() => setFilter(f === "all" ? "" : f)}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <Text>Loading...</Text>
      ) : transactions.length === 0 ? (
        <Container className="text-center py-12">
          <Text className="text-ui-fg-subtle">No transactions found.</Text>
        </Container>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Item</Table.HeaderCell>
              <Table.HeaderCell>Customer</Table.HeaderCell>
              <Table.HeaderCell>Amount</Table.HeaderCell>
              <Table.HeaderCell>Payment</Table.HeaderCell>
              <Table.HeaderCell>Shipping</Table.HeaderCell>
              <Table.HeaderCell>Tracking</Table.HeaderCell>
              <Table.HeaderCell>Date</Table.HeaderCell>
              <Table.HeaderCell></Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {transactions.map((tx) => (
              <Table.Row key={tx.id}>
                <Table.Cell>
                  <div>
                    <Text className="font-medium text-sm">
                      {itemLabel(tx)}
                    </Text>
                    {tx.block_title && (
                      <Text className="text-ui-fg-subtle text-xs">
                        {tx.block_title}
                        {tx.lot_number ? ` · Lot ${tx.lot_number}` : ""}
                      </Text>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <div>
                    <Text className="text-sm">{tx.shipping_name || "—"}</Text>
                    {tx.shipping_city && (
                      <Text className="text-ui-fg-subtle text-xs">
                        {tx.shipping_city}, {tx.shipping_country}
                      </Text>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <Text className="font-mono font-medium">
                    €{tx.total_amount.toFixed(2)}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Badge color={STATUS_COLORS[tx.status] || "grey"}>
                    {tx.status}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <Badge color={SHIPPING_COLORS[tx.shipping_status] || "grey"}>
                    {tx.shipping_status}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  {tx.tracking_number ? (
                    <div>
                      <Text className="text-xs font-mono">
                        {tx.tracking_number}
                      </Text>
                      {tx.carrier && (
                        <Text className="text-ui-fg-subtle text-xs">
                          {tx.carrier}
                        </Text>
                      )}
                    </div>
                  ) : (
                    <Text className="text-ui-fg-subtle text-xs">—</Text>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Text className="text-xs">
                    {tx.paid_at
                      ? new Date(tx.paid_at).toLocaleDateString("de-DE")
                      : new Date(tx.created_at).toLocaleDateString("de-DE")}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  {tx.status === "paid" && tx.shipping_status === "pending" && (
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
                            <Label size="xsmall">Tracking Number</Label>
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
                  {tx.status === "paid" && tx.shipping_status === "shipped" && (
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => markAsDelivered(tx.id)}
                    >
                      Delivered
                    </Button>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Transactions",
  icon: CurrencyDollar,
})

export default TransactionsPage
