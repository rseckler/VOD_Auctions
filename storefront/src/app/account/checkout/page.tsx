"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
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
import { brevoCheckoutStarted, brevoOrderCompleted } from "@/lib/brevo-tracking"
import type { WinEntry, Transaction, CartItem } from "@/types"

type ShippingMethod = {
  id: string
  carrier_name: string
  method_name: string
  delivery_days_min: number | null
  delivery_days_max: number | null
  has_tracking: boolean
  tracking_url_pattern: string | null
  is_default: boolean
}

type ShippingCountry = {
  code: string
  name: string
  zone_slug: string
  zone_name: string
}

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
  const [selectedCountry, setSelectedCountry] = useState("")
  const [countries, setCountries] = useState<ShippingCountry[]>([])
  const [shippingZones, setShippingZones] = useState<ShippingZoneInfo[]>([])
  const [hasCatchAll, setHasCatchAll] = useState(false)
  const [shippingMethods, setShippingMethods] = useState<Record<string, ShippingMethod[]>>({})
  const [selectedMethodId, setSelectedMethodId] = useState("")
  const [shippingCost, setShippingCost] = useState(0)
  const [shippingLabel, setShippingLabel] = useState("")
  const [estimating, setEstimating] = useState(false)
  const [freeThreshold, setFreeThreshold] = useState<number | null>(null)

  const [paymentSuccess, setPaymentSuccess] = useState(false)

  useEffect(() => {
    const payment = searchParams.get("payment")
    if (payment === "success") {
      setPaymentSuccess(true)
      toast.success("Payment successful! You will receive a confirmation email.")
      brevoOrderCompleted("checkout", 0, 0)
      // Optimistically clear local state
      setCartItems([])
      setWins([])
      refreshStatus()
      // Poll for webhook completion — orders page needs status=paid
      let attempts = 0
      const poll = setInterval(async () => {
        attempts++
        if (attempts > 12) { clearInterval(poll); return }
        try {
          const token = getToken()
          if (!token) { clearInterval(poll); return }
          const r = await fetch(`${MEDUSA_URL}/store/account/orders`, {
            headers: { "x-publishable-api-key": PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
          })
          const data = await r.json()
          if (data.orders?.length > 0) {
            clearInterval(poll)
            refreshStatus()
          }
        } catch { /* ignore */ }
      }, 3000)
      return () => clearInterval(poll)
    } else if (payment === "cancelled") {
      toast.info("Payment cancelled. You can try again anytime.")
      fetchData()
    } else {
      fetchData()
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

      if (shippingRes) {
        if (shippingRes.zones) setShippingZones(shippingRes.zones)
        if (shippingRes.countries) setCountries(shippingRes.countries)
        if (shippingRes.has_catch_all) setHasCatchAll(true)
        if (shippingRes.methods) setShippingMethods(shippingRes.methods)
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

  // Brevo tracking: fire once when checkout items are loaded
  const [checkoutTracked, setCheckoutTracked] = useState(false)
  useEffect(() => {
    if (!loading && hasItems && !checkoutTracked) {
      const totalItems = unpaidWins.length + cartItems.length
      brevoCheckoutStarted(totalItems, itemsTotal)
      setCheckoutTracked(true)
    }
  }, [loading, hasItems, checkoutTracked, unpaidWins.length, cartItems.length, itemsTotal])

  // Resolve zone from selected country
  const selectedZoneSlug = selectedCountry
    ? countries.find((c) => c.code === selectedCountry)?.zone_slug || "world"
    : ""

  // Auto-select default shipping method when zone changes
  useEffect(() => {
    if (!selectedZoneSlug || !shippingMethods) {
      setSelectedMethodId("")
      return
    }
    // Find the zone_id that matches selectedZoneSlug
    const zone = shippingZones.find((z) => z.slug === selectedZoneSlug)
    if (!zone) return
    const zoneMethods = shippingMethods[zone.id] || []
    const defaultMethod = zoneMethods.find((m) => m.is_default) || zoneMethods[0]
    if (defaultMethod) setSelectedMethodId(defaultMethod.id)
    else setSelectedMethodId("")
  }, [selectedZoneSlug, shippingMethods])

  // Estimate shipping when country changes
  useEffect(() => {
    if (!selectedCountry || !hasItems) {
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
      const zone = shippingZones.find((z) => z.slug === selectedZoneSlug)
      if (zone && zone.rates.length > 0) {
        const minRate = zone.rates[0]
        setShippingCost(minRate.price_standard)
        const countryName = countries.find((c) => c.code === selectedCountry)?.name || selectedCountry
        setShippingLabel(`${countryName} (${zone.name})`)
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
      body: JSON.stringify({ release_ids: releaseIds, country_code: selectedCountry }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.estimate) {
          if (freeThreshold && itemsTotal >= freeThreshold) {
            setShippingCost(0)
            setShippingLabel("Free Shipping")
          } else {
            setShippingCost(data.estimate.price)
            const countryName = countries.find((c) => c.code === selectedCountry)?.name || selectedCountry
            setShippingLabel(
              `${countryName} — ${data.estimate.carrier} (${data.estimate.shipping_weight_grams}g)`
            )
          }
        }
      })
      .catch(() => {
        const fallback: Record<string, number> = { de: 4.99, eu: 9.99, world: 14.99 }
        setShippingCost(fallback[selectedZoneSlug] || 14.99)
        setShippingLabel(selectedCountry)
      })
      .finally(() => setEstimating(false))
  }, [selectedCountry, unpaidWins.length, cartItems.length])

  async function handleCheckout() {
    const token = getToken()
    if (!token || !selectedCountry) return

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
        body: JSON.stringify({ items, country_code: selectedCountry, shipping_method_id: selectedMethodId || undefined }),
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
    if (paymentSuccess) {
      return (
        <div className="text-center py-16">
          <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <CreditCard className="h-6 w-6 text-green-500" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Payment Successful!</h3>
          <p className="text-muted-foreground mb-4">Your order has been placed. You will receive a confirmation email shortly.</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" asChild>
              <Link href="/account/orders">View Orders</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/catalog">Continue Shopping</Link>
            </Button>
          </div>
        </div>
      )
    }
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
                  <div className="relative w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-card">
                    {win.item.release_cover ? (
                      <Image src={win.item.release_cover} alt="" fill sizes="48px" className="object-cover" />
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
                  <div className="relative w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-card">
                    {item.coverImage ? (
                      <Image src={item.coverImage} alt="" fill sizes="48px" className="object-cover" />
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

      {/* Shipping */}
      <Card className="p-4 mb-4 border-primary/30">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" /> Shipping
        </h3>

        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground block mb-1.5">Ship to</label>
            <Select value={selectedCountry} onValueChange={setSelectedCountry}>
              <SelectTrigger className="w-full h-10">
                <SelectValue placeholder="Select your country..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {countries.length > 0
                  ? countries.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name}
                      </SelectItem>
                    ))
                  : ["DE", "AT", "FR", "NL", "US", "GB"].map((code) => {
                      const names: Record<string, string> = {
                        DE: "Germany", AT: "Austria", FR: "France",
                        NL: "Netherlands", US: "United States", GB: "United Kingdom",
                      }
                      return (
                        <SelectItem key={code} value={code}>
                          {names[code]}
                        </SelectItem>
                      )
                    })}
                {hasCatchAll && (
                  <SelectItem value="OTHER">Other country</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {selectedCountry && (() => {
            const zone = shippingZones.find((z) => z.slug === selectedZoneSlug)
            const zoneMethods = zone ? (shippingMethods[zone.id] || []) : []
            if (zoneMethods.length <= 1) return null
            return (
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground block">Shipping method</label>
                {zoneMethods.map((m) => (
                  <label
                    key={m.id}
                    className={`flex items-center gap-2 p-3 rounded border cursor-pointer text-sm transition-colors ${
                      selectedMethodId === m.id
                        ? "border-primary/50 bg-primary/5"
                        : "border-border hover:border-border/80"
                    }`}
                  >
                    <input
                      type="radio"
                      name="shipping_method"
                      value={m.id}
                      checked={selectedMethodId === m.id}
                      onChange={() => setSelectedMethodId(m.id)}
                      className="accent-primary"
                    />
                    <div className="flex-1">
                      <span className="font-medium">{m.carrier_name}</span>
                      <span className="text-muted-foreground"> — {m.method_name}</span>
                      {(m.delivery_days_min || m.delivery_days_max) && (
                        <span className="text-muted-foreground ml-1">
                          ({m.delivery_days_min && m.delivery_days_max
                            ? `${m.delivery_days_min}-${m.delivery_days_max} days`
                            : m.delivery_days_max
                              ? `up to ${m.delivery_days_max} days`
                              : `${m.delivery_days_min}+ days`})
                        </span>
                      )}
                    </div>
                    {m.has_tracking && (
                      <Badge variant="outline" className="text-[10px] border-primary/50 text-primary">Tracked</Badge>
                    )}
                  </label>
                ))}
              </div>
            )
          })()}

          {selectedCountry && (
            <div className="flex justify-between items-center p-3 rounded bg-muted/50">
              <span className="text-sm font-medium">
                {estimating ? "Calculating shipping..." : shippingLabel}
              </span>
              <span className="text-base font-bold font-mono">
                {shippingCost === 0 && freeThreshold
                  ? <span className="text-green-500">FREE</span>
                  : `\u20AC${shippingCost.toFixed(2)}`}
              </span>
            </div>
          )}

          {freeThreshold && itemsTotal < freeThreshold && (
            <p className="text-xs text-muted-foreground">
              Free shipping on orders over &euro;{freeThreshold.toFixed(2)}
            </p>
          )}
        </div>
      </Card>

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

          {selectedCountry && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span className="font-mono">
                {shippingCost === 0 && freeThreshold
                  ? "FREE"
                  : `\u20AC${shippingCost.toFixed(2)}`}
              </span>
            </div>
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
          disabled={!selectedCountry || paying}
          className="w-full mt-4 bg-primary hover:bg-primary/90 text-[#1c1915] h-11"
        >
          <CreditCard className="w-4 h-4 mr-2" />
          {paying ? "Redirecting to payment..." : `Pay €${grandTotal.toFixed(2)}`}
        </Button>

        <p className="text-xs text-muted-foreground text-center mt-3">
          You will be redirected to our secure payment provider (Stripe) to complete your purchase.
        </p>
      </Card>
    </div>
  )
}
