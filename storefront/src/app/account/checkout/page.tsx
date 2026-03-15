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
import { CreditCard, Disc3, Trophy, ShoppingCart, Package, MapPin, Truck, CheckCircle2, ClipboardList, Mail, Lock, ChevronDown, Printer } from "lucide-react"
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
  first_name: string
  last_name: string
  line1: string
  line2: string
  city: string
  postal_code: string
  country: string
  phone: string
}

// Data preserved for the success page
type CompletedOrderData = {
  orderGroupId: string
  items: Array<{ artist: string | null; title: string; price: number; type: "auction" | "cart" }>
  grandTotal: number
  shippingCost: number
  shippingAddress: ShippingAddress
  email: string
  estimatedDelivery: string | null
}

// Format estimated delivery date range from shipping method
function formatEstimatedDelivery(method: ShippingMethod | undefined): string | null {
  if (!method) return null
  const minDays = method.delivery_days_min || 3
  const maxDays = method.delivery_days_max || 7
  const today = new Date()
  const estMin = new Date(today.getTime() + minDays * 86400000)
  const estMax = new Date(today.getTime() + maxDays * 86400000)
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return `${fmt(estMin)} - ${fmt(estMax)}`
}

const REQUIRED_ADDRESS_FIELDS: Array<keyof ShippingAddress> = [
  "first_name", "last_name", "line1", "city", "postal_code", "country",
]

const FIELD_LABELS: Record<string, string> = {
  first_name: "First Name",
  last_name: "Last Name",
  line1: "Address",
  city: "City",
  postal_code: "Postal Code",
  country: "Country",
}

// ── Payment Form (inside Elements provider) ──
function PaymentForm({
  amount,
  onSuccess,
  paying,
  setPaying,
  onPaymentMethodChange,
  agbAccepted,
}: {
  amount: number
  onSuccess: () => void
  paying: boolean
  setPaying: (v: boolean) => void
  onPaymentMethodChange?: (type: string) => void
  agbAccepted: boolean
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
        onChange={(event) => {
          if (onPaymentMethodChange && event.value?.type) {
            onPaymentMethodChange(event.value.type)
          }
        }}
        options={{
          layout: "accordion",
          wallets: {
            applePay: "auto",
            googlePay: "auto",
          },
        }}
      />

      {errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}

      {!agbAccepted && (
        <p className="text-xs text-amber-400">Please accept the Terms &amp; Conditions above to proceed.</p>
      )}

      <Button
        onClick={handlePay}
        disabled={!stripe || !paymentReady || paying || !agbAccepted}
        className="w-full bg-primary hover:bg-primary/90 text-[#1c1915] h-12 text-base font-semibold"
      >
        <CreditCard className="w-5 h-5 mr-2" />
        {paying ? "Processing..." : `Pay \u20AC${amount.toFixed(2)}`}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Your payment is processed securely by Stripe. Card details never touch our server.
      </p>
      <p className="text-xs text-muted-foreground/60 text-center flex items-center justify-center gap-1">
        <Lock className="h-3 w-3" /> Powered by Stripe
      </p>
    </div>
  )
}

// ── Reusable Address Form ──
function AddressForm({
  address,
  onChange,
  errors,
  onBlur,
  countries,
  hasCatchAll,
  idPrefix,
}: {
  address: ShippingAddress
  onChange: (field: keyof ShippingAddress, value: string) => void
  errors: Record<string, string>
  onBlur: (field: keyof ShippingAddress) => void
  countries: ShippingCountry[]
  hasCatchAll: boolean
  idPrefix: string
}) {
  const fieldClass = (field: string) =>
    `mt-1 ${errors[field] ? "border-destructive focus-visible:ring-destructive" : ""}`

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${idPrefix}_first_name`}>First Name *</Label>
          <Input
            id={`${idPrefix}_first_name`}
            value={address.first_name}
            onChange={(e) => onChange("first_name", e.target.value)}
            onBlur={() => onBlur("first_name")}
            placeholder="John"
            className={fieldClass("first_name")}
          />
          {errors.first_name && <p className="text-xs text-destructive mt-1">{errors.first_name}</p>}
        </div>
        <div>
          <Label htmlFor={`${idPrefix}_last_name`}>Last Name *</Label>
          <Input
            id={`${idPrefix}_last_name`}
            value={address.last_name}
            onChange={(e) => onChange("last_name", e.target.value)}
            onBlur={() => onBlur("last_name")}
            placeholder="Doe"
            className={fieldClass("last_name")}
          />
          {errors.last_name && <p className="text-xs text-destructive mt-1">{errors.last_name}</p>}
        </div>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}_line1`}>Address *</Label>
        <Input
          id={`${idPrefix}_line1`}
          value={address.line1}
          onChange={(e) => onChange("line1", e.target.value)}
          onBlur={() => onBlur("line1")}
          placeholder="Street and house number"
          className={fieldClass("line1")}
        />
        {errors.line1 && <p className="text-xs text-destructive mt-1">{errors.line1}</p>}
      </div>
      <div>
        <Label htmlFor={`${idPrefix}_line2`}>Apartment, suite, etc. (optional)</Label>
        <Input
          id={`${idPrefix}_line2`}
          value={address.line2}
          onChange={(e) => onChange("line2", e.target.value)}
          className="mt-1"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${idPrefix}_postal_code`}>Postal Code *</Label>
          <Input
            id={`${idPrefix}_postal_code`}
            value={address.postal_code}
            onChange={(e) => onChange("postal_code", e.target.value)}
            onBlur={() => onBlur("postal_code")}
            className={fieldClass("postal_code")}
          />
          {errors.postal_code && <p className="text-xs text-destructive mt-1">{errors.postal_code}</p>}
        </div>
        <div>
          <Label htmlFor={`${idPrefix}_city`}>City *</Label>
          <Input
            id={`${idPrefix}_city`}
            value={address.city}
            onChange={(e) => onChange("city", e.target.value)}
            onBlur={() => onBlur("city")}
            className={fieldClass("city")}
          />
          {errors.city && <p className="text-xs text-destructive mt-1">{errors.city}</p>}
        </div>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}_country`}>Country *</Label>
        <Select value={address.country} onValueChange={(v) => { onChange("country", v); onBlur("country") }}>
          <SelectTrigger className={fieldClass("country")}>
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
        {errors.country && <p className="text-xs text-destructive mt-1">{errors.country}</p>}
      </div>
      <div>
        <Label htmlFor={`${idPrefix}_phone`}>Phone (optional)</Label>
        <Input
          id={`${idPrefix}_phone`}
          type="tel"
          value={address.phone}
          onChange={(e) => onChange("phone", e.target.value)}
          placeholder="+49 123 456 7890"
          className="mt-1"
        />
      </div>
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

  // Shipping Address
  const [address, setAddress] = useState<ShippingAddress>({
    first_name: "",
    last_name: "",
    line1: "",
    line2: "",
    city: "",
    postal_code: "",
    country: "",
    phone: "",
  })

  // Billing Address
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true)
  const [billingAddress, setBillingAddress] = useState<ShippingAddress>({
    first_name: "",
    last_name: "",
    line1: "",
    line2: "",
    city: "",
    postal_code: "",
    country: "",
    phone: "",
  })

  // Form validation
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [billingFormErrors, setBillingFormErrors] = useState<Record<string, string>>({})

  // AGB acceptance
  const [agbAccepted, setAgbAccepted] = useState(false)

  // Payment
  const [clientSecret, setClientSecret] = useState("")
  const [paymentIntentId, setPaymentIntentId] = useState("")
  const [orderGroupId, setOrderGroupId] = useState("")
  const [paying, setPaying] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [creatingIntent, setCreatingIntent] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("")

  // Completed order data (preserved for success page)
  const [completedOrder, setCompletedOrder] = useState<CompletedOrderData | null>(null)

  // Mobile order summary collapsible
  const [summaryOpen, setSummaryOpen] = useState(false)

  // Pre-fill name from customer
  useEffect(() => {
    if (customer && !address.first_name && !address.last_name) {
      setAddress((a) => ({
        ...a,
        first_name: customer.first_name || "",
        last_name: customer.last_name || "",
      }))
    }
  }, [customer])

  // ── Validation ──
  function validateField(field: keyof ShippingAddress, value: string, isBilling = false) {
    const setter = isBilling ? setBillingFormErrors : setFormErrors
    if (REQUIRED_ADDRESS_FIELDS.includes(field)) {
      if (!value.trim()) {
        setter((prev) => ({ ...prev, [field]: `${FIELD_LABELS[field] || field} is required` }))
      } else {
        setter((prev) => {
          const next = { ...prev }
          delete next[field]
          return next
        })
      }
    }
  }

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
      const [winsRes, txRes, cartRes, shippingRes, statusRes] = await Promise.all([
        fetch(`${MEDUSA_URL}/store/account/wins`, { headers }).then((r) => r.json()),
        fetch(`${MEDUSA_URL}/store/account/transactions`, { headers }).then((r) => r.json()),
        fetch(`${MEDUSA_URL}/store/account/cart`, { headers }).then((r) => r.json()),
        fetch(`${MEDUSA_URL}/store/shipping`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${MEDUSA_URL}/store/account/status`, { headers }).then((r) => r.json()).catch(() => null),
      ])
      setWins(winsRes.wins || [])
      setCartItems(cartRes.items || [])

      // Pre-fill saved shipping address
      const savedAddr = statusRes?.default_shipping_address
      if (savedAddr && savedAddr.line1) {
        setAddress((prev) => ({
          first_name: savedAddr.first_name || prev.first_name,
          last_name: savedAddr.last_name || prev.last_name,
          line1: savedAddr.line1 || prev.line1,
          line2: savedAddr.line2 || prev.line2,
          city: savedAddr.city || prev.city,
          postal_code: savedAddr.postal_code || prev.postal_code,
          country: savedAddr.country || prev.country,
          phone: savedAddr.phone || prev.phone,
        }))
      }
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
    if (!address.country || !address.first_name || !address.last_name || !address.line1 || !address.city || !address.postal_code) return
    if (!hasItems || creatingIntent) return

    // Validate billing address if different
    if (!billingSameAsShipping) {
      const billingErrors: Record<string, string> = {}
      for (const field of REQUIRED_ADDRESS_FIELDS) {
        if (!billingAddress[field].trim()) {
          billingErrors[field] = `${FIELD_LABELS[field] || field} is required`
        }
      }
      if (Object.keys(billingErrors).length > 0) {
        setBillingFormErrors(billingErrors)
        toast.error("Please complete the billing address.")
        return
      }
    }

    const token = getToken()
    if (!token) return

    setCreatingIntent(true)
    try {
      const items: any[] = [
        ...unpaidWins.map((w) => ({ type: "auction_win", block_item_id: w.item.id })),
        ...cartItems.map((c) => ({ type: "cart", cart_item_id: c.id })),
      ]

      const body: any = {
        items,
        country_code: address.country,
        shipping_address: address,
        shipping_method_id: selectedMethodId || undefined,
      }

      if (!billingSameAsShipping) {
        body.billing_address = billingAddress
      }

      const res = await fetch(`${MEDUSA_URL}/store/account/create-payment-intent`, {
        method: "POST",
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401) {
          toast.error("Your session has expired. Please log in again.")
          window.location.href = "/?login=true"
          return
        }
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
  }, [address, billingAddress, billingSameAsShipping, hasItems, unpaidWins, cartItems, selectedMethodId, creatingIntent])

  // Address is complete?
  const addressComplete = !!(address.first_name && address.last_name && address.line1 && address.city && address.postal_code && address.country)

  function handleAddressField(field: keyof ShippingAddress, value: string) {
    setAddress((a) => ({ ...a, [field]: value }))
    // Clear error when user types
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
    // Reset payment intent when address changes (need new amount)
    if (field === "country" && clientSecret) {
      setClientSecret("")
      setPaymentIntentId("")
    }
  }

  function handleBillingField(field: keyof ShippingAddress, value: string) {
    setBillingAddress((a) => ({ ...a, [field]: value }))
    if (billingFormErrors[field]) {
      setBillingFormErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  // When user selects PayPal, auto-switch to tracked shipping method
  function handlePaymentMethodChange(type: string) {
    setSelectedPaymentMethod(type)
    if (type === "paypal" && selectedZoneSlug) {
      const zone = shippingZones.find((z) => z.slug === selectedZoneSlug)
      if (zone) {
        const zoneMethods = shippingMethods[zone.id] || []
        const trackedMethod = zoneMethods.find((m) => m.has_tracking)
        if (trackedMethod && trackedMethod.id !== selectedMethodId) {
          setSelectedMethodId(trackedMethod.id)
          toast.info("Switched to tracked shipping (required for PayPal buyer protection).")
        }
      }
    }
  }

  const requiresTrackedShipping = selectedPaymentMethod === "paypal"

  function handlePaymentSuccess() {
    // Preserve order data for success page BEFORE clearing
    setCompletedOrder({
      orderGroupId: orderGroupId,
      items: [
        ...unpaidWins.map((w) => ({
          artist: w.item.release_artist,
          title: w.item.release_title || "Unknown",
          price: w.final_price,
          type: "auction" as const,
        })),
        ...cartItems.map((c) => ({
          artist: c.artist_name,
          title: c.title,
          price: c.price,
          type: "cart" as const,
        })),
      ],
      grandTotal,
      shippingCost,
      shippingAddress: { ...address },
      email: customer?.email || "",
      estimatedDelivery,
    })

    setPaymentSuccess(true)
    toast.success("Payment successful!")
    brevoOrderCompleted("checkout", grandTotal, unpaidWins.length + cartItems.length)
    setCartItems([])
    setWins([])
    refreshStatus()
  }

  // Country name helper
  const countryName = (code: string) =>
    countries.find((c) => c.code === code)?.name || code

  // Shipping method name helper
  const selectedMethod = (() => {
    if (!selectedZoneSlug) return undefined
    const zone = shippingZones.find((z) => z.slug === selectedZoneSlug)
    if (!zone) return undefined
    const methods = shippingMethods[zone.id] || []
    return methods.find((m) => m.id === selectedMethodId)
  })()
  const selectedMethodName = selectedMethod ? `${selectedMethod.carrier_name} — ${selectedMethod.method_name}` : ""
  const estimatedDelivery = formatEstimatedDelivery(selectedMethod)

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

  // ── Success state (enhanced with order details) ──
  if (paymentSuccess) {
    const order = completedOrder
    const orderRef = order?.orderGroupId
      ? `VOD-${order.orderGroupId.slice(-6).toUpperCase()}`
      : null

    return (
      <div className="max-w-xl mx-auto py-12">
        <div className="text-center mb-8">
          <div className="h-14 w-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-7 w-7 text-green-500" />
          </div>
          <h3 className="text-xl font-semibold mb-1">Payment Successful!</h3>
          {orderRef && (
            <p className="text-sm text-primary font-mono font-semibold">Order #{orderRef}</p>
          )}
        </div>

        {order && (
          <Card className="p-5 mb-6 space-y-4">
            {/* Items */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Items Ordered</h4>
              <div className="space-y-1.5">
                {order.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="truncate mr-4">
                      {item.artist && <span className="text-muted-foreground">{item.artist} — </span>}
                      {item.title}
                    </span>
                    <span className="font-mono flex-shrink-0">{"\u20AC"}{Number(item.price).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Shipping Address */}
            <div className="border-t border-border pt-3">
              <h4 className="text-sm font-semibold text-muted-foreground mb-1">Shipping To</h4>
              <p className="text-sm">
                {order.shippingAddress.first_name} {order.shippingAddress.last_name},{" "}
                {order.shippingAddress.line1}
                {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ""},{" "}
                {order.shippingAddress.postal_code} {order.shippingAddress.city},{" "}
                {countryName(order.shippingAddress.country)}
              </p>
            </div>

            {/* Estimated Delivery */}
            {order.estimatedDelivery && (
              <div className="border-t border-border pt-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Estimated delivery</span>
                  <span>{order.estimatedDelivery}</span>
                </div>
              </div>
            )}

            {/* Total */}
            <div className="border-t border-border pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shipping</span>
                <span className="font-mono">
                  {order.shippingCost === 0 ? <span className="text-green-500">FREE</span> : `\u20AC${order.shippingCost.toFixed(2)}`}
                </span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Total Paid</span>
                <span className="text-primary font-mono text-lg">{"\u20AC"}{order.grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </Card>
        )}

        {/* Confirmation email note */}
        {order?.email && (
          <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground mb-6">
            <Mail className="h-4 w-4" />
            <span>A confirmation email has been sent to <span className="text-foreground">{order.email}</span></span>
          </div>
        )}

        <p className="text-muted-foreground text-center text-sm mb-6">
          You will receive a confirmation email shortly.
        </p>

        <div className="flex gap-3 justify-center flex-wrap">
          <Button asChild className="bg-primary hover:bg-primary/90 text-[#1c1915]">
            <Link href="/account/orders">View Orders</Link>
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            Print Receipt
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
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Checkout</h2>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 text-green-500" />
            <span>Secure Checkout</span>
          </div>
        </div>

        {/* ── Section 1: Shipping Address ── */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Shipping Address
            </h3>
            <Badge variant="outline" className="text-xs text-muted-foreground">Step 1 of 3</Badge>
          </div>
          <AddressForm
            address={address}
            onChange={handleAddressField}
            errors={formErrors}
            onBlur={(field) => validateField(field, address[field])}
            countries={countries}
            hasCatchAll={hasCatchAll}
            idPrefix="shipping"
          />

          {/* Optional confirmation email */}
          <div className="mt-4">
            <Label htmlFor="confirmation_email">Order confirmation email (optional)</Label>
            <Input
              id="confirmation_email"
              type="email"
              defaultValue={customer?.email || ""}
              disabled
              placeholder="your@email.com"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground/60 mt-1">
              Leave empty to use your account email
            </p>
          </div>
        </Card>

        {/* ── Billing Address Toggle ── */}
        {addressComplete && (
          <Card className="p-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={billingSameAsShipping}
                onChange={(e) => setBillingSameAsShipping(e.target.checked)}
                className="accent-primary"
              />
              <span className="text-sm font-medium">Billing address same as shipping</span>
            </label>

            {!billingSameAsShipping && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">Billing Address</h4>
                <AddressForm
                  address={billingAddress}
                  onChange={handleBillingField}
                  errors={billingFormErrors}
                  onBlur={(field) => validateField(field, billingAddress[field], true)}
                  countries={countries}
                  hasCatchAll={hasCatchAll}
                  idPrefix="billing"
                />
              </div>
            )}
          </Card>
        )}

        {/* ── Section 2: Shipping Method ── */}
        {address.country && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Truck className="h-4 w-4 text-primary" />
                Shipping Method
              </h3>
              <Badge variant="outline" className="text-xs text-muted-foreground">Step 2 of 3</Badge>
            </div>

            {(() => {
              const zone = shippingZones.find((z) => z.slug === selectedZoneSlug)
              const zoneMethods = zone ? (shippingMethods[zone.id] || []) : []

              if (zoneMethods.length > 1) {
                return (
                  <>
                  {requiresTrackedShipping && (
                    <p className="text-xs text-amber-400 mb-2">
                      PayPal buyer protection requires tracked shipping. Untracked options are disabled.
                    </p>
                  )}
                  <div className="space-y-2">
                    {zoneMethods.map((m) => {
                      const disabled = requiresTrackedShipping && !m.has_tracking
                      return (
                      <label
                        key={m.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          disabled
                            ? "opacity-50 cursor-not-allowed"
                            : "cursor-pointer"
                        } ${
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
                          onChange={() => !disabled && setSelectedMethodId(m.id)}
                          disabled={disabled}
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
                      )
                    })}
                  </div>
                  </>
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
                  : `\u20AC${shippingCost.toFixed(2)}`}
              </span>
            </div>

            {freeThreshold && itemsTotal < freeThreshold && (
              <p className="text-xs text-muted-foreground mt-2">
                Free shipping on orders over {"\u20AC"}{freeThreshold.toFixed(2)}
              </p>
            )}
          </Card>
        )}

        {/* ── Order Review Summary ── */}
        {addressComplete && address.country && (
          <Card className="p-5">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <ClipboardList className="h-4 w-4 text-primary" />
              Review Your Order
            </h3>

            {/* Compact items list */}
            <div className="space-y-1.5 mb-3">
              {unpaidWins.map((win) => (
                <div key={win.bid_id} className="flex justify-between text-sm">
                  <span className="truncate mr-3">
                    {win.item.release_artist && (
                      <span className="text-muted-foreground">{win.item.release_artist} — </span>
                    )}
                    {win.item.release_title || "Unknown"}
                  </span>
                  <span className="font-mono flex-shrink-0">{"\u20AC"}{win.final_price.toFixed(2)}</span>
                </div>
              ))}
              {cartItems.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="truncate mr-3">
                    {item.artist_name && (
                      <span className="text-muted-foreground">{item.artist_name} — </span>
                    )}
                    {item.title}
                  </span>
                  <span className="font-mono flex-shrink-0">{"\u20AC"}{Number(item.price).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-3 space-y-2 text-sm">
              {/* Shipping address summary */}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ship to</span>
                <span className="text-right max-w-[60%] truncate">
                  {address.first_name} {address.last_name}, {address.line1}, {address.postal_code} {address.city}, {countryName(address.country)}
                </span>
              </div>

              {/* Shipping method + cost */}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping{selectedMethodName ? ` (${selectedMethodName})` : ""}</span>
                <span className="font-mono">
                  {estimating
                    ? "..."
                    : shippingCost === 0 && freeThreshold
                      ? <span className="text-green-500">FREE</span>
                      : `\u20AC${shippingCost.toFixed(2)}`}
                </span>
              </div>

              {/* Estimated delivery */}
              {estimatedDelivery && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated delivery</span>
                  <span>{estimatedDelivery}</span>
                </div>
              )}

              {/* Total */}
              <div className="border-t border-border pt-2 flex justify-between font-semibold">
                <span>Total</span>
                <span className="text-primary font-mono">{"\u20AC"}{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </Card>
        )}

        {/* ── AGB / Widerruf Checkbox ── */}
        {addressComplete && address.country && (
          <label className="flex items-start gap-2 cursor-pointer px-1">
            <input
              type="checkbox"
              checked={agbAccepted}
              onChange={(e) => setAgbAccepted(e.target.checked)}
              className="mt-1 accent-primary"
            />
            <span className="text-xs text-muted-foreground leading-tight">
              I have read and accept the{" "}
              <a href="/agb" target="_blank" className="text-primary underline">Terms &amp; Conditions</a>{" "}
              and the{" "}
              <a href="/widerruf" target="_blank" className="text-primary underline">Right of Withdrawal</a>. *
            </span>
          </label>
        )}

        {/* ── Section 3: Payment ── */}
        {addressComplete && address.country && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                Payment
              </h3>
              <Badge variant="outline" className="text-xs text-muted-foreground">Step 3 of 3</Badge>
            </div>

            {!clientSecret ? (
              <div className="text-center py-6">
                {!agbAccepted && (
                  <p className="text-xs text-amber-400 mb-3">Please accept the Terms &amp; Conditions above to continue.</p>
                )}
                <Button
                  onClick={createPaymentIntent}
                  disabled={creatingIntent || estimating || !agbAccepted}
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
                  onPaymentMethodChange={handlePaymentMethodChange}
                  agbAccepted={agbAccepted}
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
            {/* Mobile: collapsible toggle */}
            <button
              onClick={() => setSummaryOpen((v) => !v)}
              className="w-full flex items-center justify-between lg:hidden"
            >
              <h3 className="font-semibold">
                Order Summary ({unpaidWins.length + cartItems.length} item{unpaidWins.length + cartItems.length !== 1 ? "s" : ""}) — {"\u20AC"}{grandTotal.toFixed(2)}
              </h3>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${summaryOpen ? "rotate-180" : ""}`} />
            </button>
            {/* Desktop: always-visible heading */}
            <h3 className="font-semibold mb-4 hidden lg:block">Order Summary</h3>

            {/* Items — hidden on mobile when collapsed, always visible on desktop */}
            <div className={`${summaryOpen ? "block" : "hidden"} lg:block`}>
            <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto mt-4 lg:mt-0">
              {unpaidWins.map((win) => (
                <div key={win.bid_id} className="flex gap-3 items-center">
                  <div className="relative w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-card">
                    {win.item.release_cover ? (
                      <Image src={win.item.release_cover} alt={win.item.release_artist ? `${win.item.release_artist} — ${win.item.release_title || "Unknown"}` : win.item.release_title || "Unknown"} fill sizes="48px" className="object-cover" />
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
                    {"\u20AC"}{win.final_price.toFixed(2)}
                  </p>
                </div>
              ))}

              {cartItems.map((item) => (
                <div key={item.id} className="flex gap-3 items-center">
                  <div className="relative w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-card">
                    {item.coverImage ? (
                      <Image src={item.coverImage} alt={item.artist_name ? `${item.artist_name} — ${item.title}` : item.title} fill sizes="48px" className="object-cover" />
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
                    {"\u20AC"}{Number(item.price).toFixed(2)}
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
                <span className="font-mono">{"\u20AC"}{itemsTotal.toFixed(2)}</span>
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
                        : `\u20AC${shippingCost.toFixed(2)}`}
                </span>
              </div>

              <div className="border-t border-border pt-3 flex justify-between items-center">
                <span className="font-semibold text-base">Total</span>
                <span className="text-xl font-bold font-mono text-primary">
                  {"\u20AC"}{grandTotal.toFixed(2)}
                </span>
              </div>
            </div>
            </div>{/* end collapsible wrapper */}
          </Card>
        </div>
      </div>
    </div>
  )
}
