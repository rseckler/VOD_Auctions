"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { getToken } from "@/lib/auth"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { useAuth } from "@/components/AuthProvider"
import { stripePromise } from "@/lib/stripe-client"
import { CreditCard, Disc3, Trophy, ShoppingCart, Package, MapPin, Truck, CheckCircle2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

type ShippingAddress = {
  name: string
  line1: string
  line2: string
  city: string
  postal_code: string
  country: string
}

// ── Payment Form (inside Elements provider) ──
function PaymentForm({
  amount,
  onSuccess,
  paying,
  setPaying,
}: {
  amount: number
  onSuccess: () => void
  paying: boolean
  setPaying: (v: boolean) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [paymentReady, setPaymentReady] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  async function handlePay() {
    if (!stripe || !elements) return

    setPaying(true)
    setErrorMessage("")

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/account/checkout?payment=success`,
      },
      redirect: "if_required",
    })

    if (error) {
      if (error.type === "card_error" || error.type === "validation_error") {
        setErrorMessage(error.message || "Payment failed.")
      } else {
        setErrorMessage("An unexpected error occurred.")
      }
      setPaying(false)
    } else {
      // Payment succeeded without redirect (card payments)
      onSuccess()
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement
        onReady={() => setPaymentReady(true)}
        options={{
          layout: "tabs",
        }}
      />

      {errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}

      <Button
        onClick={handlePay}
        disabled={!stripe || !paymentReady || paying}
        className="w-full bg-primary hover:bg-primary/90 text-[#1c1915] h-12 text-base font-semibold"
      >
        <CreditCard className="w-5 h-5 mr-2" />
        {paying ? "Processing..." : `Pay €${amount.toFixed(2)}`}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Your payment is processed securely by Stripe. Card details never touch our server.
      </p>
    </div>
  )
}

// ── Main Checkout Page ──
export default function CheckoutPage() {
  const searchParams = useSearchParams()
  const { refreshStatus, customer } = useAuth()

  // Items
  const [wins, setWins] = useState<WinEntry[]>([])
  const [transactions, setTransactions] = useState<Record<string, Transaction>>({})
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)

  // Shipping
  const [countries, setCountries] = useState<ShippingCountry[]>([])
  const [shippingZones, setShippingZones] = useState<ShippingZoneInfo[]>([])
  const [hasCatchAll, setHasCatchAll] = useState(false)
  const [shippingMethods, setShippingMethods] = useState<Record<string, ShippingMethod[]>>({})
  const [selectedMethodId, setSelectedMethodId] = useState("")
  const [shippingCost, setShippingCost] = useState(0)
  const [shippingLabel, setShippingLabel] = useState("")
  const [estimating, setEstimating] = useState(false)
  const [freeThreshold, setFreeThreshold] = useState<number | null>(null)

  // Address
  const [address, setAddress] = useState<ShippingAddress>({
    name: "",
    line1: "",
    line2: "",
    city: "",
    postal_code: "",
    country: "",
  })

  // Payment
  const [clientSecret, setClientSecret] = useState("")
  const [paymentIntentId, setPaymentIntentId] = useState("")
  const [orderGroupId, setOrderGroupId] = useState("")
  const [paying, setPaying] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [creatingIntent, setCreatingIntent] = useState(false)

  // Pre-fill name from customer
  useEffect(() => {
    if (customer && !address.name) {
      const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ")
      if (name) setAddress((a) => ({ ...a, name }))
    }
  }, [customer])

  // ── Load items + shipping data ──
  useEffect(() => {
    const payment = searchParams.get("payment")
    const redirectStatus = searchParams.get("redirect_status")

    if (payment === "success" || redirectStatus === "succeeded") {
      setPaymentSuccess(true)
      toast.success("Payment successful! You will receive a confirmation email.")
      brevoOrderCompleted("checkout", 0, 0)
      setCartItems([])
      setWins([])
      refreshStatus()
      return
    }
    if (payment === "cancelled") {
      toast.info("Payment cancelled. You can try again.")
    }

    fetchData()
  }, [searchParams])

  async function fetchData() {
    const token = getToken()
    if (!token) { setLoading(false); return }

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
    } catch { /* silent */ } finally {
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

  // Resolve zone from country
  const selectedZoneSlug = address.country
    ? countries.find((c) => c.code === address.country)?.zone_slug || "world"
    : ""

  // Auto-select default shipping method
  useEffect(() => {
    if (!selectedZoneSlug || !shippingMethods) { setSelectedMethodId(""); return }
    const zone = shippingZones.find((z) => z.slug === selectedZoneSlug)
    if (!zone) return
    const zoneMethods = shippingMethods[zone.id] || []
    const defaultMethod = zoneMethods.find((m) => m.is_default) || zoneMethods[0]
    if (defaultMethod) setSelectedMethodId(defaultMethod.id)
    else setSelectedMethodId("")
  }, [selectedZoneSlug, shippingMethods])

  // Estimate shipping when country changes
  useEffect(() => {
    if (!address.country || !hasItems) { setShippingCost(0); setShippingLabel(""); return }

    const releaseIds = [
      ...unpaidWins.map((w) => (w.item as any).release_id).filter(Boolean),
      ...cartItems.map((c) => c.release_id).filter(Boolean),
    ]

    if (releaseIds.length === 0) {
      const zone = shippingZones.find((z) => z.slug === selectedZoneSlug)
      if (zone && zone.rates.length > 0) {
        setShippingCost(zone.rates[0].price_standard)
        const cn = countries.find((c) => c.code === address.country)?.name || address.country
        setShippingLabel(`${cn} (${zone.name})`)
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
      body: JSON.stringify({ release_ids: releaseIds, country_code: address.country }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.estimate) {
          if (freeThreshold && itemsTotal >= freeThreshold) {
            setShippingCost(0)
            setShippingLabel("Free Shipping")
          } else {
            setShippingCost(data.estimate.price)
            const cn = countries.find((c) => c.code === address.country)?.name || address.country
            setShippingLabel(`${cn} — ${data.estimate.carrier} (${data.estimate.shipping_weight_grams}g)`)
          }
        }
      })
      .catch(() => {
        const fb: Record<string, number> = { de: 4.99, eu: 9.99, world: 14.99 }
        setShippingCost(fb[selectedZoneSlug] || 14.99)
        setShippingLabel(address.country)
      })
      .finally(() => setEstimating(false))
  }, [address.country, unpaidWins.length, cartItems.length])

  // Brevo tracking
  const [checkoutTracked, setCheckoutTracked] = useState(false)
  useEffect(() => {
    if (!loading && hasItems && !checkoutTracked) {
      brevoCheckoutStarted(unpaidWins.length + cartItems.length, itemsTotal)
      setCheckoutTracked(true)
    }
  }, [loading, hasItems, checkoutTracked])

  // ── Create PaymentIntent when address + shipping are ready ──
  const createPaymentIntent = useCallback(async () => {
    if (!address.country || !address.name || !address.line1 || !address.city || !address.postal_code) return
    if (!hasItems || creatingIntent) return

    const token = getToken()
    if (!token) return

    setCreatingIntent(true)
    try {
      const items: any[] = [
        ...unpaidWins.map((w) => ({ type: "auction_win", block_item_id: w.item.id })),
        ...cartItems.map((c) => ({ type: "cart", cart_item_id: c.id })),
      ]

      const res = await fetch(`${MEDUSA_URL}/store/account/create-payment-intent`, {
        method: "POST",
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items,
          country_code: address.country,
          shipping_address: address,
          shipping_method_id: selectedMethodId || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || "Failed to initialize payment")
        return
      }

      setClientSecret(data.client_secret)
      setPaymentIntentId(data.payment_intent_id)
      setOrderGroupId(data.order_group_id)
      setShippingCost(data.shipping_cost)
    } catch {
      toast.error("Failed to initialize payment. Please try again.")
    } finally {
      setCreatingIntent(false)
    }
  }, [address, hasItems, unpaidWins, cartItems, selectedMethodId, creatingIntent])

  // Address is complete?
  const addressComplete = !!(address.name && address.line1 && address.city && address.postal_code && address.country)

  function handleAddressField(field: keyof ShippingAddress, value: string) {
    setAddress((a) => ({ ...a, [field]: value }))
    // Reset payment intent when address changes (need new amount)
    if (field === "country" && clientSecret) {
      setClientSecret("")
      setPaymentIntentId("")
    }
  }

  function handlePaymentSuccess() {
    setPaymentSuccess(true)
    toast.success("Payment successful!")
    brevoOrderCompleted("checkout", grandTotal, unpaidWins.length + cartItems.length)
    setCartItems([])
    setWins([])
    refreshStatus()
  }

  // ── RENDER ──

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  // Success state
  if (paymentSuccess) {
    return (
      <div className="text-center py-16">
        <div className="h-14 w-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-7 w-7 text-green-500" />
        </div>
        <h3 className="text-xl font-semibold mb-2">Payment Successful!</h3>
        <p className="text-muted-foreground mb-6">Your order has been placed. You will receive a confirmation email shortly.</p>
        <div className="flex gap-3 justify-center">
          <Button asChild className="bg-primary hover:bg-primary/90 text-[#1c1915]">
            <Link href="/account/orders">View Orders</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/catalog">Continue Shopping</Link>
          </Button>
        </div>
      </div>
    )
  }

  // Empty state
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
    <div className="flex flex-col lg:flex-row gap-8">
      {/* ── LEFT COLUMN: Form Sections ── */}
      <div className="flex-1 space-y-6">
        <h2 className="text-xl font-semibold">Checkout</h2>

        {/* ── Section 1: Shipping Address ── */}
        <Card className="p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Shipping Address
          </h3>
          <div className="space-y-3">
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={address.name}
                onChange={(e) => handleAddressField("name", e.target.value)}
                placeholder="John Doe"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="line1">Address</Label>
              <Input
                id="line1"
                value={address.line1}
                onChange={(e) => handleAddressField("line1", e.target.value)}
                placeholder="Street and house number"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="line2">Apartment, suite, etc. (optional)</Label>
              <Input
                id="line2"
                value={address.line2}
                onChange={(e) => handleAddressField("line2", e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="postal_code">Postal Code</Label>
                <Input
                  id="postal_code"
                  value={address.postal_code}
                  onChange={(e) => handleAddressField("postal_code", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={address.city}
                  onChange={(e) => handleAddressField("city", e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="country">Country</Label>
              <Select value={address.country} onValueChange={(v) => handleAddressField("country", v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select your country..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {countries.length > 0
                    ? countries.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                      ))
                    : ["DE", "AT", "CH", "FR", "NL", "BE", "US", "GB"].map((code) => {
                        const names: Record<string, string> = {
                          DE: "Germany", AT: "Austria", CH: "Switzerland", FR: "France",
                          NL: "Netherlands", BE: "Belgium", US: "United States", GB: "United Kingdom",
                        }
                        return <SelectItem key={code} value={code}>{names[code]}</SelectItem>
                      })}
                  {hasCatchAll && <SelectItem value="OTHER">Other country</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* ── Section 2: Shipping Method ── */}
        {address.country && (
          <Card className="p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              Shipping Method
            </h3>

            {(() => {
              const zone = shippingZones.find((z) => z.slug === selectedZoneSlug)
              const zoneMethods = zone ? (shippingMethods[zone.id] || []) : []

              if (zoneMethods.length > 1) {
                return (
                  <div className="space-y-2">
                    {zoneMethods.map((m) => (
                      <label
                        key={m.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
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
                          <span className="font-medium text-sm">{m.carrier_name}</span>
                          <span className="text-sm text-muted-foreground"> — {m.method_name}</span>
                          {(m.delivery_days_min || m.delivery_days_max) && (
                            <span className="text-sm text-muted-foreground ml-1">
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
              }

              return null
            })()}

            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50 mt-2">
              <span className="text-sm">
                {estimating ? "Calculating shipping..." : shippingLabel || "Select a country"}
              </span>
              <span className="text-base font-bold font-mono">
                {shippingCost === 0 && freeThreshold
                  ? <span className="text-green-500">FREE</span>
                  : `€${shippingCost.toFixed(2)}`}
              </span>
            </div>

            {freeThreshold && itemsTotal < freeThreshold && (
              <p className="text-xs text-muted-foreground mt-2">
                Free shipping on orders over €{freeThreshold.toFixed(2)}
              </p>
            )}
          </Card>
        )}

        {/* ── Section 3: Payment ── */}
        {addressComplete && address.country && (
          <Card className="p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Payment
            </h3>

            {!clientSecret ? (
              <div className="text-center py-6">
                <Button
                  onClick={createPaymentIntent}
                  disabled={creatingIntent || estimating}
                  className="bg-primary hover:bg-primary/90 text-[#1c1915]"
                >
                  {creatingIntent ? "Initializing payment..." : "Continue to Payment"}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Verify your shipping details, then continue.
                </p>
              </div>
            ) : stripePromise ? (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: "night",
                    variables: {
                      colorPrimary: "#d4a54a",
                      colorBackground: "#1c1915",
                      colorText: "#e5e5e5",
                      colorDanger: "#ef4444",
                      fontFamily: "DM Sans, system-ui, sans-serif",
                      borderRadius: "8px",
                    },
                    rules: {
                      ".Input": {
                        border: "1px solid #333",
                        backgroundColor: "#0a0908",
                      },
                      ".Input:focus": {
                        borderColor: "#d4a54a",
                        boxShadow: "0 0 0 1px #d4a54a",
                      },
                      ".Tab": {
                        border: "1px solid #333",
                        backgroundColor: "#0a0908",
                      },
                      ".Tab--selected": {
                        borderColor: "#d4a54a",
                        backgroundColor: "#1c1915",
                      },
                    },
                  },
                }}
              >
                <PaymentForm
                  amount={grandTotal}
                  onSuccess={handlePaymentSuccess}
                  paying={paying}
                  setPaying={setPaying}
                />
              </Elements>
            ) : (
              <p className="text-sm text-destructive">Stripe is not configured. Please contact support.</p>
            )}
          </Card>
        )}
      </div>

      {/* ── RIGHT COLUMN: Order Summary (sticky sidebar) ── */}
      <div className="lg:w-[380px] flex-shrink-0">
        <div className="lg:sticky lg:top-24">
          <Card className="p-5 border-primary/30">
            <h3 className="font-semibold mb-4">Order Summary</h3>

            {/* Items */}
            <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto">
              {unpaidWins.map((win) => (
                <div key={win.bid_id} className="flex gap-3 items-center">
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
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Trophy className="h-3 w-3" /> Auction Win
                    </p>
                  </div>
                  <p className="text-sm font-bold font-mono text-primary flex-shrink-0">
                    €{win.final_price.toFixed(2)}
                  </p>
                </div>
              ))}

              {cartItems.map((item) => (
                <div key={item.id} className="flex gap-3 items-center">
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
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <ShoppingCart className="h-3 w-3" /> Direct Purchase
                    </p>
                  </div>
                  <p className="text-sm font-bold font-mono text-primary flex-shrink-0">
                    €{Number(item.price).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="space-y-2 text-sm border-t border-border pt-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Subtotal ({unpaidWins.length + cartItems.length} item{unpaidWins.length + cartItems.length !== 1 ? "s" : ""})
                </span>
                <span className="font-mono">€{itemsTotal.toFixed(2)}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="font-mono">
                  {!address.country
                    ? <span className="text-xs text-muted-foreground">Enter address</span>
                    : estimating
                      ? "..."
                      : shippingCost === 0 && freeThreshold
                        ? <span className="text-green-500">FREE</span>
                        : `€${shippingCost.toFixed(2)}`}
                </span>
              </div>

              <div className="border-t border-border pt-3 flex justify-between items-center">
                <span className="font-semibold text-base">Total</span>
                <span className="text-xl font-bold font-mono text-primary">
                  €{grandTotal.toFixed(2)}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
