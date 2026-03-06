"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { getToken } from "@/lib/auth"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { Disc3, Trophy, CreditCard, Truck, CheckCircle2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import type { WinEntry, Transaction } from "@/types"

const SHIPPING_RATES = {
  de: { label: "Germany — €4.99", price: 4.99 },
  eu: { label: "Europe — €9.99", price: 9.99 },
  world: { label: "Worldwide — €14.99", price: 14.99 },
}

export default function WinsPage() {
  const searchParams = useSearchParams()
  const [wins, setWins] = useState<WinEntry[]>([])
  const [transactions, setTransactions] = useState<Record<string, Transaction>>({})
  const [loading, setLoading] = useState(true)
  const [payingItemId, setPayingItemId] = useState<string | null>(null)
  const [shippingZones, setShippingZones] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchData()

    const payment = searchParams.get("payment")
    if (payment === "success") {
      toast.success("Payment successful! You will receive a confirmation email.")
    } else if (payment === "cancelled") {
      toast.info("Payment cancelled. You can try again anytime.")
    }
  }, [searchParams])

  async function fetchData() {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }

    try {
      const headers = {
        "x-publishable-api-key": PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      }

      const [winsRes, txRes] = await Promise.all([
        fetch(`${MEDUSA_URL}/store/account/wins`, { headers }).then((r) => r.json()),
        fetch(`${MEDUSA_URL}/store/account/transactions`, { headers }).then((r) => r.json()),
      ])

      setWins(winsRes.wins || [])

      const txMap: Record<string, Transaction> = {}
      for (const tx of txRes.transactions || []) {
        txMap[tx.block_item_id] = tx
      }
      setTransactions(txMap)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  async function handlePay(itemId: string) {
    const token = getToken()
    if (!token) return

    const zone = shippingZones[itemId]
    if (!zone) {
      toast.error("Please select a shipping destination first.")
      return
    }

    setPayingItemId(itemId)
    try {
      const res = await fetch(`${MEDUSA_URL}/store/account/checkout`, {
        method: "POST",
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          block_item_id: itemId,
          shipping_zone: zone,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.message || "Failed to start checkout")
        return
      }

      if (data.checkout_url) {
        window.location.href = data.checkout_url
      }
    } catch {
      toast.error("Failed to start checkout. Please try again.")
    } finally {
      setPayingItemId(null)
    }
  }

  function getStepIndex(tx: Transaction | undefined): number {
    if (!tx || tx.status !== "paid") return -1
    if (tx.shipping_status === "delivered") return 2
    if (tx.shipping_status === "shipped") return 1
    return 0
  }

  function OrderProgressBar({ tx }: { tx: Transaction | undefined }) {
    if (!tx) return null

    if (tx.status === "pending") {
      return <Badge variant="outline">Payment Pending</Badge>
    }
    if (tx.status === "failed") {
      return <Badge variant="destructive">Payment Failed</Badge>
    }

    const step = getStepIndex(tx)
    if (step < 0) return null

    const steps = [
      { label: "Paid", icon: CreditCard },
      { label: "Shipped", icon: Truck },
      { label: "Delivered", icon: CheckCircle2 },
    ]

    return (
      <div className="w-full mt-2">
        <div className="flex items-center">
          {steps.map((s, i) => {
            const done = i <= step
            const Icon = s.icon
            return (
              <div key={s.label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center ${
                      done
                        ? i === step
                          ? "bg-primary text-[#1c1915]"
                          : "bg-primary/70 text-[#1c1915]"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span
                    className={`text-[10px] mt-1 ${
                      done ? "text-primary font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-1.5 mt-[-14px] ${
                      i < step ? "bg-primary/70" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            )
          })}
        </div>
        {tx.shipping_status === "shipped" && tx.tracking_number && (
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {tx.carrier && <span>{tx.carrier}: </span>}
            <span className="font-mono">{tx.tracking_number}</span>
          </p>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (wins.length === 0) {
    return (
      <div className="text-center py-16">
        <Trophy className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
        <p className="text-muted-foreground mb-2">
          You have not won any auctions yet.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/auctions">Go to Auctions</Link>
        </Button>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">
        Won Auctions
        <Badge variant="secondary" className="ml-2">{wins.length}</Badge>
      </h2>

      {/* Combined checkout banner */}
      {wins.some((w) => {
        const tx = transactions[w.item.id]
        return !tx || tx.status === "failed"
      }) && (
        <Card className="p-4 mb-6 border-primary/30 bg-primary/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Pay for everything at once!</p>
              <p className="text-sm text-muted-foreground">
                Combine auction wins and cart items into a single payment.
              </p>
            </div>
            <Button asChild className="bg-primary hover:bg-primary/90 text-[#1c1915]">
              <Link href="/account/checkout">
                <CreditCard className="w-4 h-4 mr-1.5" /> Go to Checkout
              </Link>
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {wins.map((win) => {
          const tx = transactions[win.item.id]
          const isPaid = tx?.status === "paid" || tx?.shipping_status === "shipped" || tx?.shipping_status === "delivered"
          const needsPayment = !tx || tx.status === "failed"

          return (
            <Card key={win.bid_id} className="p-4">
              <div className="flex gap-4">
                {/* Cover */}
                <Link
                  href={`/auctions/${win.block.slug}/${win.item.id}`}
                  className="w-16 h-16 flex-shrink-0 rounded overflow-hidden bg-card"
                >
                  {win.item.release_cover ? (
                    <img
                      src={win.item.release_cover}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Disc3 className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                  )}
                </Link>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="bg-green-500/15 text-green-500 border-green-500/30">
                      Won
                    </Badge>
                    {!isPaid && <OrderProgressBar tx={tx} />}
                  </div>
                  <p className="text-sm font-medium truncate mt-1">
                    {win.item.release_artist && (
                      <span className="text-muted-foreground">
                        {win.item.release_artist} —{" "}
                      </span>
                    )}
                    {win.item.release_title || "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {win.block.title} · Lot {win.item.lot_number || "—"}
                  </p>
                  {isPaid && tx && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Total: &euro;{tx.total_amount.toFixed(2)} (incl. &euro;{tx.shipping_cost.toFixed(2)} shipping)
                    </p>
                  )}
                  {isPaid && <OrderProgressBar tx={tx} />}
                </div>

                {/* Price + Action */}
                <div className="text-right flex-shrink-0 flex flex-col items-end">
                  <p className="text-lg font-bold font-mono text-primary">
                    &euro;{win.final_price.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">
                    {new Date(win.bid_date).toLocaleDateString("en-US")}
                  </p>

                  {needsPayment && (
                    <div className="flex flex-col gap-1.5 items-end">
                      <Select
                        value={shippingZones[win.item.id] || ""}
                        onValueChange={(v) =>
                          setShippingZones((prev) => ({ ...prev, [win.item.id]: v }))
                        }
                      >
                        <SelectTrigger className="w-[170px] h-8 text-xs">
                          <SelectValue placeholder="Ship to..." />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(SHIPPING_RATES).map(([key, rate]) => (
                            <SelectItem key={key} value={key}>
                              {rate.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={() => handlePay(win.item.id)}
                        disabled={!shippingZones[win.item.id] || payingItemId === win.item.id}
                        className="bg-[#d4a54a] hover:bg-[#c49a3a] text-black h-8"
                      >
                        <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                        {payingItemId === win.item.id ? "Redirecting..." : "Pay Now"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
