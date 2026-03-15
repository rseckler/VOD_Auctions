"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { getToken } from "@/lib/auth"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import {
  Package,
  CreditCard,
  Truck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Disc3,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

type OrderItem = {
  transaction_id: string
  item_type: "auction" | "direct_purchase"
  amount: number
  shipping_cost: number
  title: string | null
  artist_name: string | null
  cover_image: string | null
  article_number: string | null
  block_title: string | null
  lot_number: number | null
}

type Order = {
  order_group_id: string
  order_date: string
  items: OrderItem[]
  items_count: number
  subtotal: number
  shipping_cost: number
  total: number
  shipping_status: "pending" | "shipped" | "delivered"
  tracking_number: string | null
  carrier: string | null
  tracking_url_pattern: string | null
  shipping_country: string | null
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: {
      label: "Processing",
      className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
    },
    shipped: {
      label: "Shipped",
      className: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    },
    delivered: {
      label: "Delivered",
      className: "bg-green-500/15 text-green-500 border-green-500/30",
    },
  }
  const c = config[status] || config.pending
  return (
    <Badge variant="outline" className={c.className}>
      {c.label}
    </Badge>
  )
}

function OrderProgressBar({ status }: { status: string }) {
  const stepIndex =
    status === "delivered" ? 2 : status === "shipped" ? 1 : 0

  const steps = [
    { label: "Paid", icon: CreditCard },
    { label: "Shipped", icon: Truck },
    { label: "Delivered", icon: CheckCircle2 },
  ]

  return (
    <div className="flex items-center w-full max-w-[200px]">
      {steps.map((s, i) => {
        const done = i <= stepIndex
        const Icon = s.icon
        return (
          <div
            key={s.label}
            className="flex items-center flex-1 last:flex-none"
          >
            <div className="flex flex-col items-center">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  done
                    ? i === stepIndex
                      ? "bg-primary text-[#1c1915]"
                      : "bg-primary/70 text-[#1c1915]"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="w-3 h-3" />
              </div>
              <span
                className={`text-[9px] mt-0.5 ${
                  done ? "text-primary font-medium" : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 mt-[-12px] ${
                  i < stepIndex ? "bg-primary/70" : "bg-muted"
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function OrderCard({ order }: { order: Order }) {
  const [expanded, setExpanded] = useState(false)
  const shortId = `VOD-${order.order_group_id.slice(-6).toUpperCase()}`
  const date = new Date(order.order_date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

  // Show up to 4 cover thumbnails
  const coverItems = order.items.filter((i) => i.cover_image).slice(0, 4)
  const extraCount = order.items_count - coverItems.length

  const panelId = `order-detail-${order.order_group_id}`

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="w-full p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-sm font-medium font-mono text-primary">
                #{shortId}
              </span>
              <span className="text-xs text-muted-foreground">{date}</span>
              <StatusBadge status={order.shipping_status} />
            </div>

            {/* Cover thumbnails */}
            <div className="flex items-center gap-1.5 mb-2">
              {coverItems.map((item) => (
                <div
                  key={item.transaction_id}
                  className="relative w-10 h-10 rounded overflow-hidden bg-card flex-shrink-0"
                >
                  <Image
                    src={item.cover_image!}
                    alt={item.artist_name ? `${item.artist_name} — ${item.title || "Unknown"}` : item.title || "Unknown"}
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                </div>
              ))}
              {extraCount > 0 && (
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground flex-shrink-0">
                  +{extraCount}
                </div>
              )}
              {coverItems.length === 0 && (
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                  <Disc3 className="w-4 h-4 text-muted-foreground/30" />
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {order.items_count} item{order.items_count !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Right side: total + progress + expand */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <p className="text-lg font-bold font-mono text-primary">
              &euro;{order.total.toFixed(2)}
            </p>
            <OrderProgressBar status={order.shipping_status} />
            {order.tracking_number && (
              <p className="text-[10px] text-muted-foreground">
                {order.carrier && <span>{order.carrier}: </span>}
                {order.tracking_url_pattern ? (
                  <a
                    href={order.tracking_url_pattern.replace("{tracking}", order.tracking_number)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-primary hover:underline"
                  >
                    {order.tracking_number}
                  </a>
                ) : (
                  <span className="font-mono">{order.tracking_number}</span>
                )}
              </p>
            )}
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div id={panelId} className="border-t border-border px-4 pb-4">
          <div className="divide-y divide-dotted divide-border/50">
            {order.items.map((item) => (
              <div
                key={item.transaction_id}
                className="flex items-center gap-3 py-3"
              >
                <div className="relative w-12 h-12 rounded overflow-hidden bg-card flex-shrink-0">
                  {item.cover_image ? (
                    <Image
                      src={item.cover_image}
                      alt={item.artist_name ? `${item.artist_name} — ${item.title || "Unknown"}` : item.title || "Unknown"}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Disc3 className="w-5 h-5 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">
                    {item.artist_name && (
                      <span className="text-muted-foreground">
                        {item.artist_name} —{" "}
                      </span>
                    )}
                    {item.title || "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.item_type === "auction"
                      ? `Auction${item.lot_number ? ` · Lot ${item.lot_number}` : ""}`
                      : "Direct Purchase"}
                    {item.article_number && ` · ${item.article_number}`}
                  </p>
                </div>
                <p className="text-sm font-mono font-medium text-right flex-shrink-0">
                  &euro;{item.amount.toFixed(2)}
                </p>
              </div>
            ))}
          </div>

          {/* Order summary */}
          <div className="mt-3 pt-3 border-t border-border space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Subtotal</span>
              <span>&euro;{order.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Shipping</span>
              <span>&euro;{order.shipping_cost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm font-medium pt-1">
              <span>Total</span>
              <span className="text-primary font-mono">
                &euro;{order.total.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchOrders() {
      const token = getToken()
      if (!token) {
        setLoading(false)
        return
      }

      try {
        const res = await fetch(`${MEDUSA_URL}/store/account/orders`, {
          headers: {
            "x-publishable-api-key": PUBLISHABLE_KEY,
            Authorization: `Bearer ${token}`,
          },
        })
        const data = await res.json()
        setOrders(data.orders || [])
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }

    fetchOrders()
  }, [])

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-16">
        <Package className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
        <p className="text-muted-foreground mb-2">No orders yet.</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/catalog">Browse Catalog</Link>
        </Button>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">
        My Orders
        <Badge variant="secondary" className="ml-2">
          {orders.length}
        </Badge>
      </h2>

      <div className="space-y-3">
        {orders.map((order) => (
          <OrderCard key={order.order_group_id} order={order} />
        ))}
      </div>
    </div>
  )
}
