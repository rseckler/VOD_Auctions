"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { getToken } from "@/lib/auth"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { useAuth } from "@/components/AuthProvider"
import { CreditCard, Disc3, Trophy, ShoppingCart, Package } from "lucide-react"
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
import type { WinEntry, Transaction, CartItem } from "@/types"

type ShippingZoneInfo = {
  id: string
  name: string
  slug: string
  rates: Array<{
    weight_from_grams: number
    weight_to_grams: number
    price_standard: number
    price_oversized: number
  }>
}

export default function CheckoutPage() {
  const searchParams = useSearchParams()
  const { refreshStatus } = useAuth()
  const [wins, setWins] = useState<WinEntry[]>([])
  const [transactions, setTransactions] = useState<Record<string, Transaction>>({})
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [shippingZone, setShippingZone] = useState("")
  const [shippingZones, setShippingZones] = useState<ShippingZoneInfo[]>([])
  const [shippingCost, setShippingCost] = useState(0)
  const [shippingLabel, setShippingLabel] = useState("")
  const [estimating, setEstimating] = useState(false)
  const [freeThreshold, setFreeThreshold] = useState<number | null>(null)

  useEffect(() => {
    fetchData()

    const payment = searchParams.get("payment")
    if (payment === "success") {
      toast.success("Payment successful! You will receive a confirmation email.")
      refreshStatus()
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

      const [winsRes, txRes, cartRes, shippingRes] = await Promise.all([
        fetch(`${MEDUSA_URL}/store/account/wins`, { headers }).then((r) => r.json()),
        fetch(`${MEDUSA_URL}/store/account/transactions`, { headers }).then((r) => r.json()),
        fetch(`${MEDUSA_URL}/store/account/cart`, { headers }).then((r) => r.json()),
        fetch(`${MEDUSA_URL}/store/shipping`, { headers }).then((r) => r.json()).catch(() => null),
      ])

      setWins(winsRes.wins || [])
      setCartItems(cartRes.items || [])

      if (shippingRes?.zones) {
        setShippingZones(shippingRes.zones)
        setFreeThreshold(shippingRes.free_shipping_threshold)
      }

      const txMap: Record<string, Transaction> = {}
      for (const tx of txRes.transactions || []) {
        if (tx.block_item_id) txMap[tx.block_item_id] = tx
      }
      setTransactions(txMap)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  // Unpaid auction wins
  const unpaidWins = wins.filter((w) => {
    const tx = transactions[w.item.id]
    return !tx || tx.status === "failed"
  })

  const winsSubtotal = unpaidWins.reduce((sum, w) => sum + w.final_price, 0)
  const cartSubtotal = cartItems.reduce((sum, item) => sum + item.price, 0)
  const itemsTotal = winsSubtotal + cartSubtotal
  const grandTotal = itemsTotal + shippingCost
  const hasItems = unpaidWins.length > 0 || cartItems.length > 0

  // Estimate shipping when zone changes
  useEffect(() => {
    if (!shippingZone || !hasItems) {
      setShippingCost(0)
      setShippingLabel("")
      return
    }

    const releaseIds = [
      ...unpaidWins.map((w) => (w.item as any).release_id).filter(Boolean),
      ...cartItems.map((c) => c.release_id).filter(Boolean),
    ]

    if (releaseIds.length === 0) {
      // No release_ids available, use zone info to show minimum price
      const zone = shippingZones.find((z) => z.slug === shippingZone)
      if (zone && zone.rates.length > 0) {
        const minRate = zone.rates[0]
        setShippingCost(minRate.price_standard)
        setShippingLabel(zone.name)
      }
      return
    }

    setEstimating(true)
    const token = getToken()
    fetch(`${MEDUSA_URL}/store/shipping`, {
      method: "POST",
      headers: {
        "x-publishable-api-key": PUBLISHABLE_KEY,
        Authorization: `Bearer ${token || ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ release_ids: releaseIds, zone_slug: shippingZone }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.estimate) {
          // Check free shipping
          if (freeThreshold && itemsTotal >= freeThreshold) {
            setShippingCost(0)
            setShippingLabel("Free Shipping")
          } else {
            setShippingCost(data.estimate.price)
            setShippingLabel(
              `${data.estimate.zone.name} — ${data.estimate.carrier} (${data.estimate.shipping_weight_grams}g)`
            )
          }
        }
      })
      .catch(() => {
        // Fallback
        const fallback: Record<string, number> = { de: 4.99, eu: 9.99, world: 14.99 }
        setShippingCost(fallback[shippingZone] || 14.99)
        setShippingLabel(shippingZone.toUpperCase())
      })
      .finally(() => setEstimating(false))
  }, [shippingZone, unpaidWins.length, cartItems.length])

  async function handleCheckout() {
    const token = getToken()
    if (!token || !shippingZone) return

    setPaying(true)
    try {
      const items: any[] = [
        ...unpaidWins.map((w) => ({ type: "auction_win", block_item_id: w.item.id })),
        ...cartItems.map((c) => ({ type: "cart", cart_item_id: c.id })),
      ]

      const res = await fetch(`${MEDUSA_URL}/store/account/checkout`, {
        method: "POST",
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items, shipping_zone: shippingZone }),
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
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (!hasItems) {
    return (
      <div className="text-center py-16">
        <Package className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
        <p className="text-muted-foreground mb-2">Nothing to check out.</p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" size="sm" asChild>
            <Link href="/auctions">Go to Auctions</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/catalog">Browse Catalog</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Checkout</h2>

      {/* Unpaid Auction Wins */}
      {unpaidWins.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4" /> Auction Wins ({unpaidWins.length})
          </h3>
          <div className="space-y-2">
            {unpaidWins.map((win) => (
              <Card key={win.bid_id} className="p-3">
                <div className="flex gap-3 items-center">
                  <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-card">
                    {win.item.release_cover ? (
                      <img src={win.item.release_cover} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc3 className="h-5 w-5 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {win.item.release_artist && (
                        <span className="text-muted-foreground">{win.item.release_artist} — </span>
                      )}
                      {win.item.release_title || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {win.block.title} · Lot {win.item.lot_number || "—"}
                    </p>
                  </div>
                  <p className="text-base font-bold font-mono text-primary flex-shrink-0">
                    &euro;{win.final_price.toFixed(2)}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Cart Items */}
      {cartItems.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" /> Cart Items ({cartItems.length})
          </h3>
          <div className="space-y-2">
            {cartItems.map((item) => (
              <Card key={item.id} className="p-3">
                <div className="flex gap-3 items-center">
                  <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-card">
                    {item.coverImage ? (
                      <img src={item.coverImage} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc3 className="h-5 w-5 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.artist_name && (
                        <span className="text-muted-foreground">{item.artist_name} — </span>
                      )}
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.format} · Direct Purchase
                    </p>
                  </div>
                  <p className="text-base font-bold font-mono text-primary flex-shrink-0">
                    &euro;{Number(item.price).toFixed(2)}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Order Summary */}
      <Card className="p-4 border-primary/30">
        <h3 className="font-semibold mb-4">Order Summary</h3>

        <div className="space-y-2 text-sm">
          {unpaidWins.length > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Auction Wins ({unpaidWins.length})</span>
              <span className="font-mono">&euro;{winsSubtotal.toFixed(2)}</span>
            </div>
          )}
          {cartItems.length > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cart Items ({cartItems.length})</span>
              <span className="font-mono">&euro;{cartSubtotal.toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <span className="text-muted-foreground">Shipping</span>
            <Select value={shippingZone} onValueChange={setShippingZone}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="Select destination..." />
              </SelectTrigger>
              <SelectContent>
                {shippingZones.length > 0
                  ? shippingZones.map((z) => (
                      <SelectItem key={z.slug} value={z.slug}>
                        {z.name}
                      </SelectItem>
                    ))
                  : ["de", "eu", "world"].map((key) => (
                      <SelectItem key={key} value={key}>
                        {key === "de" ? "Germany" : key === "eu" ? "Europe" : "Worldwide"}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
          </div>

          {shippingZone && (
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">
                {estimating ? "Calculating..." : shippingLabel}
              </span>
              <span className="font-mono">
                {shippingCost === 0 && freeThreshold
                  ? "FREE"
                  : `\u20AC${shippingCost.toFixed(2)}`}
              </span>
            </div>
          )}

          {freeThreshold && itemsTotal < freeThreshold && (
            <p className="text-xs text-muted-foreground">
              Free shipping on orders over &euro;{freeThreshold.toFixed(2)}
            </p>
          )}

          <div className="border-t border-border pt-3 mt-3 flex justify-between items-center">
            <span className="font-semibold">Total</span>
            <span className="text-xl font-bold font-mono text-primary">
              &euro;{grandTotal.toFixed(2)}
            </span>
          </div>
        </div>

        <Button
          onClick={handleCheckout}
          disabled={!shippingZone || paying}
          className="w-full mt-4 bg-primary hover:bg-primary/90 text-[#1c1915] h-11"
        >
          <CreditCard className="w-4 h-4 mr-2" />
          {paying ? "Redirecting to Stripe..." : `Pay €${grandTotal.toFixed(2)}`}
        </Button>
      </Card>
    </div>
  )
}
