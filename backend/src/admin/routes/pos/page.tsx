import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useState, useEffect, useCallback, useRef } from "react"
import { useAdminNav } from "../../components/admin-nav"
import { C, S, fmtMoney, BADGE_VARIANTS } from "../../components/admin-tokens"
import { Btn, Toast, Modal, Alert, inputStyle } from "../../components/admin-ui"

// ─── Types ──────────────────────────────────────────────────────────────────

interface CartItem {
  inventory_item_id: string
  barcode: string
  release_id: string
  title: string
  artist_name: string | null
  label_name: string | null
  format: string | null
  coverImage: string | null
  catalogNumber: string | null
  legacy_price: number
  legacy_condition: string | null
  year: number | null
  country: string | null
  product_category: string
  discogs_url: string | null
  price: number // actual sale price (= legacy_price, can be overridden later)
}

interface CustomerResult {
  id: string
  first_name: string
  last_name: string
  name: string
  email: string | null
  total_spent: number
  total_purchases: number
  is_vip: boolean
}

type PaymentProvider = "sumup" | "cash" | "paypal" | "bank_transfer"
type CustomerMode = "anonymous" | "search" | "new"
type CheckoutPhase = "idle" | "confirm" | "sumup_waiting" | "processing" | "success" | "error"

// ─── API Helper ─────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: `HTTP ${res.status}` }))
    throw body
  }
  return res.json()
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PAYMENT_OPTIONS: { value: PaymentProvider; label: string; icon: string }[] = [
  { value: "sumup", label: "SumUp Karte", icon: "💳" },
  { value: "cash", label: "Bar", icon: "💵" },
  { value: "paypal", label: "PayPal", icon: "🅿️" },
  { value: "bank_transfer", label: "Überweisung", icon: "🏦" },
]

const SUPABASE_URL = "https://bofblwqieuvmqybzxapx.supabase.co/storage/v1/object/public/images"

// ─── Main POS Page ──────────────────────────────────────────────────────────

function POSPage() {
  useAdminNav()

  // Session
  const [sessionId, setSessionId] = useState<string | null>(null)

  // Cart
  const [cart, setCart] = useState<CartItem[]>([])
  const [discount, setDiscount] = useState("")
  const [discountMode, setDiscountMode] = useState<"eur" | "percent">("eur")

  // Customer
  const [customerMode, setCustomerMode] = useState<CustomerMode>("anonymous")
  const [showCustomerDetailModal, setShowCustomerDetailModal] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([])
  const [newCustomer, setNewCustomer] = useState({ first_name: "", last_name: "", email: "", phone: "", address_line1: "", postal_code: "", city: "", country: "" })

  // Payment
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider>("sumup")
  const [cashReceived, setCashReceived] = useState("")

  // Checkout
  const [checkoutPhase, setCheckoutPhase] = useState<CheckoutPhase>("idle")
  const [checkoutResult, setCheckoutResult] = useState<any>(null)
  const [checkoutError, setCheckoutError] = useState("")

  // Swipe-to-remove state
  const [swipingItemId, setSwipingItemId] = useState<string | null>(null)
  const swipeStartRef = useRef<{ x: number; id: string } | null>(null)

  // Stats
  const [stats, setStats] = useState<any>(null)

  // UI
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const [scanAlert, setScanAlert] = useState<{ message: string; type: "error" | "warning" } | null>(null)
  const [lastScannedItem, setLastScannedItem] = useState<CartItem | null>(null)
  const scanInputRef = useRef<HTMLInputElement>(null)
  const scanBufferRef = useRef("")
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── PWA: inject manifest + meta tags + register service worker ──
  useEffect(() => {
    // Manifest link
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement("link")
      link.rel = "manifest"
      link.href = "/manifest.json"
      document.head.appendChild(link)
    }
    // iOS PWA meta
    if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
      const meta1 = document.createElement("meta")
      meta1.name = "apple-mobile-web-app-capable"
      meta1.content = "yes"
      document.head.appendChild(meta1)
      const meta2 = document.createElement("meta")
      meta2.name = "apple-mobile-web-app-status-bar-style"
      meta2.content = "black-translucent"
      document.head.appendChild(meta2)
    }
    // Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }
  }, [])

  // ── Initialize session + load stats on mount ──
  useEffect(() => {
    apiFetch<{ session_id: string }>("/admin/pos/sessions", { method: "POST" })
      .then((data) => setSessionId(data.session_id))
      .catch(() => setToast({ message: "Failed to create POS session", type: "error" }))
    apiFetch<any>("/admin/pos/stats").then(setStats).catch(() => {})
  }, [])

  // ── Focus scan input after mount and after checkout ──
  useEffect(() => {
    if (checkoutPhase === "idle") {
      setTimeout(() => scanInputRef.current?.focus(), 100)
    }
  }, [checkoutPhase])

  // ── Scanner detection (global keydown listener) ──
  // Barcode scanners type fast (>4 chars in <100ms) and end with Enter.
  // We buffer keystrokes and detect scanner vs. manual typing.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if a modal is open or checkout is in progress
      if (checkoutPhase !== "idle") return
      // Don't capture if typing in a text input (customer search, etc.)
      const tag = (e.target as HTMLElement)?.tagName
      const inputType = (e.target as HTMLInputElement)?.type
      if (tag === "INPUT" && inputType !== "text") return
      if (tag === "TEXTAREA") return
      // Allow the scan input to capture
      if (e.target === scanInputRef.current) return

      if (e.key === "Enter" && scanBufferRef.current.length >= 4) {
        e.preventDefault()
        const barcode = scanBufferRef.current.trim()
        scanBufferRef.current = ""
        if (barcode.startsWith("VOD-")) {
          handleScan(barcode)
        }
        return
      }

      // Buffer printable characters
      if (e.key.length === 1) {
        scanBufferRef.current += e.key
        // Clear buffer after 200ms of no input (manual typing)
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current)
        scanTimerRef.current = setTimeout(() => { scanBufferRef.current = "" }, 200)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [checkoutPhase])

  // ── Handle scan input field ──
  const handleScanInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const val = (e.target as HTMLInputElement).value.trim()
      if (val) {
        handleScan(val)
        ;(e.target as HTMLInputElement).value = ""
      }
    }
  }

  // ── Scan handler ──
  const handleScan = useCallback(async (barcode: string) => {
    setScanAlert(null)

    // Check if already in cart
    if (cart.some((item) => item.barcode === barcode)) {
      setScanAlert({ message: `${barcode} is already in the cart.`, type: "warning" })
      return
    }

    try {
      const data = await apiFetch<{ item: any }>(`/admin/pos/sessions/${sessionId}/items`, {
        method: "POST",
        body: JSON.stringify({ barcode }),
      })

      const item: CartItem = {
        ...data.item,
        price: data.item.legacy_price || 0,
      }

      setCart((prev) => [...prev, item])
      setLastScannedItem(item)
      setScanAlert(null)
      setToast({ message: `Added: ${item.artist_name || ""} — ${item.title}`, type: "success" })
    } catch (err: any) {
      if (err.error_code === "ALREADY_SOLD") {
        const soldAt = err.sold_at ? new Date(err.sold_at).toLocaleDateString("de-DE") : ""
        setScanAlert({
          message: `Already sold${soldAt ? ` on ${soldAt}` : ""}${err.order_number ? ` (${err.order_number})` : ""}`,
          type: "error",
        })
      } else if (err.error_code === "IN_AUCTION") {
        setScanAlert({
          message: `In active auction: "${err.block_title}"`,
          type: "error",
        })
      } else {
        setScanAlert({
          message: err.message || "Barcode not found",
          type: "warning",
        })
      }
    }
  }, [cart, sessionId])

  // ── Remove from cart ──
  const removeFromCart = (inventoryItemId: string) => {
    setCart((prev) => prev.filter((item) => item.inventory_item_id !== inventoryItemId))
    setToast({ message: "Item removed", type: "success" })
  }

  // ── Clear cart ──
  const [showClearModal, setShowClearModal] = useState(false)
  const clearCart = () => {
    setCart([])
    setDiscount("")
    setLastScannedItem(null)
    setScanAlert(null)
    setShowClearModal(false)
    setToast({ message: "Cart cleared", type: "success" })
    scanInputRef.current?.focus()
  }

  // ── Customer search (debounced) ──
  useEffect(() => {
    if (customerMode !== "search" || customerSearch.length < 2) {
      setCustomerResults([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const data = await apiFetch<{ customers: CustomerResult[] }>(
          `/admin/pos/customer-search?q=${encodeURIComponent(customerSearch)}`
        )
        setCustomerResults(data.customers)
      } catch {
        setCustomerResults([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [customerSearch, customerMode])

  // ── Create new customer ──
  const handleCreateCustomer = async () => {
    if (!newCustomer.first_name || !newCustomer.last_name) {
      setToast({ message: "First name and last name required", type: "error" })
      return
    }
    try {
      const data = await apiFetch<{ customer: CustomerResult }>("/admin/pos/customers", {
        method: "POST",
        body: JSON.stringify(newCustomer),
      })
      setSelectedCustomer(data.customer)
      setCustomerMode("search")
      setNewCustomer({ first_name: "", last_name: "", email: "", phone: "", address_line1: "", postal_code: "", city: "", country: "" })
      setToast({ message: `Created: ${data.customer.name}`, type: "success" })
    } catch (err: any) {
      if (err.existing_customer_id) {
        setToast({ message: err.message, type: "error" })
      } else {
        setToast({ message: err.message || "Failed to create customer", type: "error" })
      }
    }
  }

  // ── Calculations ──
  const subtotal = cart.reduce((sum, item) => sum + item.price, 0)
  const discountRaw = Math.max(0, parseFloat(discount.replace(",", ".")) || 0)
  const discountEur = discountMode === "percent"
    ? Number((subtotal * discountRaw / 100).toFixed(2))
    : discountRaw
  const total = Math.max(0, subtotal - discountEur)
  const canCheckout = cart.length > 0 && total > 0

  // ── Checkout ──
  const startCheckout = () => {
    if (!canCheckout) return
    if (paymentProvider === "sumup") {
      setCheckoutPhase("sumup_waiting")
    } else {
      setCheckoutPhase("confirm")
    }
  }

  const executeCheckout = async () => {
    setCheckoutPhase("processing")
    setCheckoutError("")

    try {
      // If creating new customer inline, create first
      let customerId = selectedCustomer?.id || null
      if (customerMode === "new" && newCustomer.first_name && newCustomer.last_name) {
        const data = await apiFetch<{ customer: CustomerResult }>("/admin/pos/customers", {
          method: "POST",
          body: JSON.stringify(newCustomer),
        })
        customerId = data.customer.id
      }

      const result = await apiFetch<any>(`/admin/pos/sessions/${sessionId}/checkout`, {
        method: "POST",
        body: JSON.stringify({
          payment_provider: paymentProvider,
          customer_id: customerId,
          discount_eur: discountEur > 0 ? discountEur : undefined,
          items: cart.map((item) => ({
            inventory_item_id: item.inventory_item_id,
            release_id: item.release_id,
            price: item.price,
            title: `${item.artist_name || ""} — ${item.title}`.trim(),
          })),
        }),
      })

      setCheckoutResult(result)
      setCheckoutPhase("success")
      // Refresh stats after successful sale
      apiFetch<any>("/admin/pos/stats").then(setStats).catch(() => {})
    } catch (err: any) {
      setCheckoutError(err.message || "Checkout failed")
      setCheckoutPhase("error")
    }
  }

  const resetForNextSale = async () => {
    setCart([])
    setDiscount("")
    setLastScannedItem(null)
    setScanAlert(null)
    setSelectedCustomer(null)
    setCustomerMode("anonymous")
    setCustomerSearch("")
    setNewCustomer({ first_name: "", last_name: "", email: "", phone: "", address_line1: "", postal_code: "", city: "", country: "" })
    setPaymentProvider("sumup")
    setCashReceived("")
    setCheckoutPhase("idle")
    setCheckoutResult(null)
    setCheckoutError("")

    // New session
    try {
      const data = await apiFetch<{ session_id: string }>("/admin/pos/sessions", { method: "POST" })
      setSessionId(data.session_id)
    } catch { /* keep old session */ }

    setTimeout(() => scanInputRef.current?.focus(), 100)
  }

  // ── Render ──

  return (
    <div style={{ padding: "16px 20px 48px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Dry-Run Banner */}
      <div style={{
        background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: S.radius.md,
        padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 16 }}>&#9888;</span>
        <span style={{ fontSize: 13, color: "#92400e", fontWeight: 500 }}>
          Dry-Run Mode — Transactions without TSE signature. Tax-Free Export disabled (pending Steuerberater).
        </span>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10,
          marginBottom: 16,
        }}>
          {([
            { label: "Today", count: stats.today.count, total: stats.today.total },
            { label: "Yesterday", count: stats.yesterday.count, total: stats.yesterday.total },
            { label: "This Week", count: stats.week.count, total: stats.week.total },
            { label: "All Time", count: stats.all_time.count, total: stats.all_time.total },
          ]).map((s) => (
            <div key={s.label} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: S.radius.md,
              padding: "10px 14px", textAlign: "center",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: C.muted, letterSpacing: "0.06em", marginBottom: 4 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.gold }}>
                {fmtMoney(s.total)}
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>
                {s.count} sale{s.count !== 1 ? "s" : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>POS / Walk-in Sale</h1>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            Session: {sessionId ? sessionId.slice(0, 8) + "..." : "loading..."}
          </div>
        </div>
        {cart.length > 0 && (
          <button
            onClick={() => setShowClearModal(true)}
            style={{
              background: "none", border: `1px solid ${C.error}30`, color: C.error,
              borderRadius: S.radius.md, padding: "6px 14px", fontSize: 12, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Clear All ({cart.length})
          </button>
        )}
      </div>

      {/* Main Layout — Split Screen */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, alignItems: "start" }}>

        {/* ─── LEFT: Scan Area ─── */}
        <div>
          {/* Scan Input */}
          <div style={{
            background: C.card, borderRadius: S.radius.lg, padding: 20,
            border: `2px solid ${C.gold}40`, marginBottom: 16,
          }}>
            <input
              ref={scanInputRef}
              type="text"
              placeholder="Scan barcode or type VOD-XXXXXX..."
              onKeyDown={handleScanInputKeyDown}
              autoFocus
              style={{
                width: "100%", padding: "14px 18px", fontSize: 18,
                fontFamily: "monospace", border: `2px solid ${C.gold}`,
                borderRadius: S.radius.md, outline: "none",
                background: "#fff", color: C.text, boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: C.muted }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: sessionId ? C.success : C.warning,
              }} />
              {sessionId ? "Scanner ready" : "Initializing..."}
            </div>
          </div>

          {/* Scan Alert */}
          {scanAlert && (
            <Alert type={scanAlert.type === "error" ? "error" : "warning"} onDismiss={() => setScanAlert(null)}>
              {scanAlert.message}
            </Alert>
          )}

          {/* Last Scanned Item Preview */}
          {lastScannedItem && (
            <div style={{
              background: C.card, borderRadius: S.radius.lg, padding: 16,
              border: `1px solid ${C.border}`, marginTop: 12,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: C.muted, marginBottom: 8, letterSpacing: "0.06em" }}>
                Last Scanned
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                {/* Cover image */}
                <div style={{
                  width: 80, height: 80, borderRadius: S.radius.sm, overflow: "hidden",
                  background: "#e7e5e4", flexShrink: 0,
                }}>
                  {lastScannedItem.coverImage && (
                    <img
                      src={`${SUPABASE_URL}/${lastScannedItem.coverImage}`}
                      alt=""
                      style={{ width: 80, height: 80, objectFit: "cover" }}
                    />
                  )}
                </div>
                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {lastScannedItem.artist_name && (
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 2 }}>
                      {lastScannedItem.artist_name}
                    </div>
                  )}
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                    {lastScannedItem.title}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted }}>
                    {[lastScannedItem.format, lastScannedItem.country, lastScannedItem.year, lastScannedItem.legacy_condition].filter(Boolean).join(" · ")}
                  </div>
                  {lastScannedItem.label_name && (
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {lastScannedItem.label_name}{lastScannedItem.catalogNumber ? ` · ${lastScannedItem.catalogNumber}` : ""}
                    </div>
                  )}
                </div>
                {/* Price */}
                <div style={{ fontSize: 18, fontWeight: 700, color: C.gold, flexShrink: 0 }}>
                  {fmtMoney(lastScannedItem.price)}
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!lastScannedItem && cart.length === 0 && (
            <div style={{
              textAlign: "center", padding: "60px 20px", color: C.muted,
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>&#128722;</div>
              <div style={{ fontSize: 15, fontWeight: 500 }}>Scan a barcode to start</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>
                Use the Inateck scanner or type a VOD-XXXXXX barcode above
              </div>
            </div>
          )}
        </div>

        {/* ─── RIGHT: Cart Sidebar ─── */}
        <div style={{
          background: C.card, borderRadius: S.radius.lg,
          border: `1px solid ${C.border}`, position: "sticky", top: 16,
        }}>
          {/* Cart Header */}
          <div style={{
            padding: "14px 18px", borderBottom: `1px solid ${C.border}`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
              Cart ({cart.length})
            </div>
          </div>

          {/* Cart Items */}
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {cart.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>
                No items yet
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {cart.map((item) => (
                  <div
                    key={item.inventory_item_id}
                    style={{
                      position: "relative", overflow: "hidden",
                      borderBottom: `1px solid ${C.border}`,
                    }}
                    onTouchStart={(e) => {
                      swipeStartRef.current = { x: e.touches[0].clientX, id: item.inventory_item_id }
                    }}
                    onTouchMove={(e) => {
                      if (!swipeStartRef.current || swipeStartRef.current.id !== item.inventory_item_id) return
                      const dx = e.touches[0].clientX - swipeStartRef.current.x
                      if (dx < -40) setSwipingItemId(item.inventory_item_id)
                      else setSwipingItemId(null)
                    }}
                    onTouchEnd={() => {
                      if (swipingItemId === item.inventory_item_id) {
                        removeFromCart(item.inventory_item_id)
                        setSwipingItemId(null)
                      }
                      swipeStartRef.current = null
                    }}
                  >
                    {/* Swipe-to-remove red background */}
                    {swipingItemId === item.inventory_item_id && (
                      <div style={{
                        position: "absolute", right: 0, top: 0, bottom: 0, width: 60,
                        background: C.error, display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: 18, fontWeight: 700,
                      }}>
                        &#128465;
                      </div>
                    )}
                    <div style={{
                      padding: "10px 18px",
                      display: "flex", alignItems: "center", gap: 10,
                      transform: swipingItemId === item.inventory_item_id ? "translateX(-60px)" : "none",
                      transition: "transform 0.15s ease",
                      background: C.card,
                    }}>
                      {/* Mini cover */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 3, overflow: "hidden",
                        background: "#e7e5e4", flexShrink: 0,
                      }}>
                        {item.coverImage && (
                          <img
                            src={`${SUPABASE_URL}/${item.coverImage}`}
                            alt="" style={{ width: 36, height: 36, objectFit: "cover" }}
                          />
                        )}
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.artist_name ? `${item.artist_name} — ` : ""}{item.title}
                        </div>
                        <div style={{ fontSize: 10, color: C.muted }}>
                          {[item.format, item.legacy_condition].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {/* Price */}
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, flexShrink: 0 }}>
                        {fmtMoney(item.price)}
                      </div>
                      {/* Remove (desktop fallback) */}
                      <button
                        onClick={() => removeFromCart(item.inventory_item_id)}
                        style={{
                          background: "none", border: "none", color: C.error,
                          cursor: "pointer", fontSize: 16, padding: "2px 4px",
                          flexShrink: 0, lineHeight: 1,
                        }}
                        title="Remove"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Totals */}
          <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.border}` }}>
            {cart.length > 1 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginBottom: 6 }}>
                <span>Subtotal</span>
                <span>{fmtMoney(subtotal)}</span>
              </div>
            )}

            {/* Discount with EUR/% toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>Discount</label>
              <input
                type="text"
                inputMode="decimal"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
                style={{
                  ...inputStyle, flex: 1, padding: "4px 8px", fontSize: 13,
                  textAlign: "right", maxWidth: 70,
                }}
              />
              {/* EUR / % toggle */}
              <div style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: S.radius.sm, overflow: "hidden", flexShrink: 0 }}>
                {(["eur", "percent"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setDiscountMode(mode)}
                    style={{
                      padding: "3px 8px", fontSize: 11, fontWeight: 600,
                      border: "none", cursor: "pointer",
                      background: discountMode === mode ? C.gold : "#fff",
                      color: discountMode === mode ? "#fff" : C.muted,
                    }}
                  >
                    {mode === "eur" ? "EUR" : "%"}
                  </button>
                ))}
              </div>
              {/* Show calculated EUR value when in % mode */}
              {discountMode === "percent" && discountRaw > 0 && (
                <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>
                  = {fmtMoney(discountEur)}
                </span>
              )}
            </div>

            {/* Total */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              fontSize: 20, fontWeight: 700, color: C.text, paddingTop: 8,
              borderTop: `2px solid ${C.gold}`,
            }}>
              <span>Total</span>
              <span style={{ color: C.gold }}>{fmtMoney(total)}</span>
            </div>
          </div>

          {/* Customer Panel */}
          <div style={{ padding: "0 18px 14px", borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: C.muted, marginBottom: 8, letterSpacing: "0.06em" }}>
              Customer
            </div>

            {/* Mode Toggle */}
            <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
              {([
                { mode: "anonymous" as const, label: "Anonymous" },
                { mode: "search" as const, label: "Search" },
                { mode: "new" as const, label: "+ New" },
              ]).map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => { setCustomerMode(mode); setSelectedCustomer(mode === "anonymous" ? null : selectedCustomer) }}
                  style={{
                    flex: 1, padding: "6px 0", fontSize: 11, fontWeight: 600,
                    border: `1px solid ${customerMode === mode ? C.gold : C.border}`,
                    borderRadius: S.radius.sm, cursor: "pointer",
                    background: customerMode === mode ? `${C.gold}15` : "#fff",
                    color: customerMode === mode ? C.gold : C.muted,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Selected customer display */}
            {selectedCustomer && (
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: `${C.success}10`, border: `1px solid ${C.success}30`,
                borderRadius: S.radius.sm, padding: "6px 10px", marginBottom: 8,
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{selectedCustomer.name}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>
                    {selectedCustomer.email || "No email"} · {selectedCustomer.total_purchases} orders · {fmtMoney(selectedCustomer.total_spent)}
                    {selectedCustomer.is_vip && " · VIP"}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  style={{ background: "none", border: "none", color: C.error, cursor: "pointer", fontSize: 14 }}
                >
                  &times;
                </button>
              </div>
            )}

            {/* Search input */}
            {customerMode === "search" && !selectedCustomer && (
              <div>
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Name or email..."
                  style={{ ...inputStyle, width: "100%", padding: "6px 10px", fontSize: 12, marginBottom: 4, boxSizing: "border-box" }}
                />
                {customerResults.length > 0 && (
                  <div style={{
                    border: `1px solid ${C.border}`, borderRadius: S.radius.sm,
                    maxHeight: 150, overflowY: "auto", background: "#fff",
                  }}>
                    {customerResults.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedCustomer(c); setCustomerSearch(""); setCustomerResults([]) }}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          padding: "8px 10px", border: "none", borderBottom: `1px solid ${C.border}`,
                          background: "none", cursor: "pointer", fontSize: 12,
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 10, color: C.muted }}>
                          {c.email || "No email"} · {c.total_purchases} orders{c.is_vip ? " · VIP" : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* New customer form */}
            {customerMode === "new" && !selectedCustomer && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="text" placeholder="First name *" value={newCustomer.first_name}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, first_name: e.target.value }))}
                    style={{ ...inputStyle, flex: 1, padding: "6px 8px", fontSize: 12 }} />
                  <input type="text" placeholder="Last name *" value={newCustomer.last_name}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, last_name: e.target.value }))}
                    style={{ ...inputStyle, flex: 1, padding: "6px 8px", fontSize: 12 }} />
                </div>
                <input type="email" placeholder="Email (optional)" value={newCustomer.email}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, email: e.target.value }))}
                  style={{ ...inputStyle, width: "100%", padding: "6px 8px", fontSize: 12, boxSizing: "border-box" }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={handleCreateCustomer}
                    style={{
                      flex: 1, background: C.gold, color: "#fff", border: "none",
                      borderRadius: S.radius.sm, padding: "7px 0", fontSize: 12,
                      fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Create Customer
                  </button>
                  <button
                    onClick={() => setShowCustomerDetailModal(true)}
                    style={{
                      padding: "7px 12px", fontSize: 12, fontWeight: 500,
                      border: `1px solid ${C.border}`, borderRadius: S.radius.sm,
                      background: "#fff", color: C.muted, cursor: "pointer",
                    }}
                  >
                    ...more
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Payment Selection */}
          <div style={{ padding: "0 18px 14px", borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: C.muted, marginBottom: 8, letterSpacing: "0.06em" }}>
              Payment
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {PAYMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPaymentProvider(opt.value)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 10px", fontSize: 12, fontWeight: 500,
                    border: `2px solid ${paymentProvider === opt.value ? C.gold : C.border}`,
                    borderRadius: S.radius.md, cursor: "pointer",
                    background: paymentProvider === opt.value ? `${C.gold}10` : "#fff",
                    color: paymentProvider === opt.value ? C.text : C.muted,
                  }}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>

            {/* Cash Quick-Amount Grid */}
            {paymentProvider === "cash" && cart.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: C.muted, marginBottom: 6, letterSpacing: "0.06em" }}>
                  Cash Received
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 6 }}>
                  {[5, 10, 20, 50].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setCashReceived(String(amt))}
                      style={{
                        padding: "8px 0", fontSize: 13, fontWeight: 600,
                        border: `1px solid ${cashReceived === String(amt) ? C.gold : C.border}`,
                        borderRadius: S.radius.sm, cursor: "pointer",
                        background: cashReceived === String(amt) ? `${C.gold}15` : "#fff",
                        color: cashReceived === String(amt) ? C.gold : C.text,
                      }}
                    >
                      {amt} EUR
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    onClick={() => setCashReceived(total.toFixed(2))}
                    style={{
                      padding: "6px 10px", fontSize: 11, fontWeight: 600,
                      border: `1px solid ${C.border}`, borderRadius: S.radius.sm,
                      cursor: "pointer", background: "#fff", color: C.muted,
                    }}
                  >
                    Exact
                  </button>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder="Amount"
                    style={{ ...inputStyle, flex: 1, padding: "6px 8px", fontSize: 12, textAlign: "right" }}
                  />
                  <span style={{ fontSize: 11, color: C.muted }}>EUR</span>
                </div>
                {/* Change display */}
                {(() => {
                  const received = parseFloat(cashReceived.replace(",", ".")) || 0
                  const change = received - total
                  if (received <= 0) return null
                  return (
                    <div style={{
                      marginTop: 8, padding: "8px 10px",
                      background: change >= 0 ? `${C.success}10` : `${C.error}10`,
                      border: `1px solid ${change >= 0 ? C.success : C.error}30`,
                      borderRadius: S.radius.sm, textAlign: "center",
                    }}>
                      {change >= 0 ? (
                        <div>
                          <div style={{ fontSize: 11, color: C.muted }}>Change</div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: C.success }}>
                            {fmtMoney(change)}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.error }}>
                          Still owed: {fmtMoney(Math.abs(change))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Tax Mode stub */}
            <div style={{
              marginTop: 10, padding: "6px 10px", background: "#f0f0f0",
              borderRadius: S.radius.sm, fontSize: 11, color: C.muted,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span>&#128274;</span>
              Tax-Free Export disabled — pending Steuerberater
            </div>
          </div>

          {/* Checkout Button */}
          <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.border}` }}>
            <button
              onClick={startCheckout}
              disabled={!canCheckout}
              style={{
                width: "100%", padding: "14px 0", fontSize: 16, fontWeight: 700,
                border: "none", borderRadius: S.radius.md, cursor: canCheckout ? "pointer" : "not-allowed",
                background: canCheckout ? C.gold : C.border,
                color: canCheckout ? "#fff" : C.muted,
                transition: "background 0.15s",
              }}
            >
              Complete Sale{cart.length > 0 ? ` · ${fmtMoney(total)}` : ""}
            </button>
          </div>
        </div>
      </div>

      {/* ─── MODALS ─── */}

      {/* Customer Detail Modal (full address) */}
      {showCustomerDetailModal && (
        <Modal title="New Customer — Full Details" onClose={() => setShowCustomerDetailModal(false)} footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn label="Cancel" variant="ghost" onClick={() => setShowCustomerDetailModal(false)} />
            <Btn label="Create Customer" variant="gold" onClick={() => {
              handleCreateCustomer()
              setShowCustomerDetailModal(false)
            }} />
          </div>
        }>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>First name *</label>
                <input type="text" value={newCustomer.first_name}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, first_name: e.target.value }))}
                  style={{ ...inputStyle, width: "100%", padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Last name *</label>
                <input type="text" value={newCustomer.last_name}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, last_name: e.target.value }))}
                  style={{ ...inputStyle, width: "100%", padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Email</label>
                <input type="email" value={newCustomer.email}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, email: e.target.value }))}
                  style={{ ...inputStyle, width: "100%", padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Phone</label>
                <input type="tel" value={newCustomer.phone}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))}
                  style={{ ...inputStyle, width: "100%", padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: C.muted, marginBottom: 8, letterSpacing: "0.06em" }}>
                Address
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Street</label>
              <input type="text" value={newCustomer.address_line1}
                onChange={(e) => setNewCustomer((p) => ({ ...p, address_line1: e.target.value }))}
                style={{ ...inputStyle, width: "100%", padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: "0 0 100px" }}>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Postal code</label>
                <input type="text" value={newCustomer.postal_code}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, postal_code: e.target.value }))}
                  style={{ ...inputStyle, width: "100%", padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>City</label>
                <input type="text" value={newCustomer.city}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, city: e.target.value }))}
                  style={{ ...inputStyle, width: "100%", padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Country</label>
              <input type="text" placeholder="e.g. DE, US, JP" value={newCustomer.country}
                onChange={(e) => setNewCustomer((p) => ({ ...p, country: e.target.value }))}
                style={{ ...inputStyle, width: "100%", padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }} />
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Modal */}
      {checkoutPhase === "confirm" && (
        <Modal title="Confirm Sale" onClose={() => setCheckoutPhase("idle")} footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn label="Cancel" variant="ghost" onClick={() => setCheckoutPhase("idle")} />
            <Btn label={`Complete · ${fmtMoney(total)}`} variant="gold" onClick={executeCheckout} />
          </div>
        }>
          <div style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 12 }}>
              <strong>{cart.length} item{cart.length > 1 ? "s" : ""}</strong> for <strong>{fmtMoney(total)}</strong>
            </div>
            <div style={{ marginBottom: 8, color: C.muted }}>
              Payment: {PAYMENT_OPTIONS.find((o) => o.value === paymentProvider)?.label}
            </div>
            <div style={{ color: C.muted }}>
              Customer: {selectedCustomer ? selectedCustomer.name : "Anonymous"}
            </div>
          </div>
        </Modal>
      )}

      {/* SumUp Waiting Modal */}
      {checkoutPhase === "sumup_waiting" && (
        <Modal title="SumUp Payment" onClose={() => setCheckoutPhase("idle")} footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn label="Cancel" variant="ghost" onClick={() => setCheckoutPhase("idle")} />
            <Btn label="Payment Received" variant="gold" onClick={executeCheckout} />
          </div>
        }>
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💳</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.gold, marginBottom: 8 }}>
              {fmtMoney(total)}
            </div>
            <div style={{ fontSize: 14, color: C.muted }}>
              Please collect payment on the SumUp terminal.
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>
              Press "Payment Received" once the terminal confirms.
            </div>
          </div>
        </Modal>
      )}

      {/* Processing */}
      {checkoutPhase === "processing" && (
        <Modal title="Processing..." onClose={() => {}}>
          <div style={{ textAlign: "center", padding: "30px 0", color: C.muted }}>
            Processing transaction...
          </div>
        </Modal>
      )}

      {/* Success */}
      {checkoutPhase === "success" && checkoutResult && (
        <Modal title="Sale Complete" onClose={resetForNextSale} footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <a
              href={checkoutResult.receipt_pdf_url}
              target="_blank"
              rel="noopener"
              style={{
                padding: "8px 16px", fontSize: 13, fontWeight: 600,
                border: `1px solid ${C.border}`, borderRadius: S.radius.md,
                color: C.text, textDecoration: "none", background: "#fff",
              }}
            >
              Download Receipt PDF
            </a>
            <Btn label="Next Sale" variant="gold" onClick={resetForNextSale} />
          </div>
        }>
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 8, color: C.success }}>&#10003;</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>
              {checkoutResult.order_number}
            </div>
            <div style={{ fontSize: 16, color: C.gold, fontWeight: 600 }}>
              {fmtMoney(checkoutResult.total)}
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>
              {checkoutResult.items_count} item{checkoutResult.items_count > 1 ? "s" : ""} · {PAYMENT_OPTIONS.find((o) => o.value === checkoutResult.payment_provider)?.label}
            </div>
          </div>
        </Modal>
      )}

      {/* Error */}
      {checkoutPhase === "error" && (
        <Modal title="Checkout Failed" onClose={() => setCheckoutPhase("idle")} footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn label="Close" variant="ghost" onClick={() => setCheckoutPhase("idle")} />
            <Btn label="Retry" variant="primary" onClick={executeCheckout} />
          </div>
        }>
          <Alert type="error">{checkoutError || "Unknown error"}</Alert>
        </Modal>
      )}

      {/* Clear cart confirm */}
      {showClearModal && (
        <Modal title="Clear Cart?" onClose={() => setShowClearModal(false)} footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn label="Keep Items" variant="ghost" onClick={() => setShowClearModal(false)} />
            <Btn label={`Clear All (${cart.length})`} variant="danger" onClick={clearCart} />
          </div>
        }>
          <div style={{ fontSize: 13, color: C.muted }}>
            Remove all {cart.length} items from the cart? This cannot be undone.
          </div>
        </Modal>
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "POS",
  icon: undefined,
})

export default POSPage
