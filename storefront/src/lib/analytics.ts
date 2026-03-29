// Google Analytics 4 — event tracking helpers
// Usage: import { trackEvent } from "@/lib/analytics"

type GAEvent = {
  action: string
  category?: string
  label?: string
  value?: number
  [key: string]: string | number | undefined
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

function gtag(...args: unknown[]) {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag(...args)
  }
}

export function trackEvent({ action, category, label, value, ...rest }: GAEvent) {
  gtag("event", action, {
    event_category: category,
    event_label: label,
    value,
    ...rest,
  })
}

// ── Custom events per RSE-106 ──────────────────────────────────────

export function trackBidPlaced(amount: number, itemId: string, blockSlug: string) {
  trackEvent({
    action: "bid_placed",
    category: "auction",
    value: amount,
    item_id: itemId,
    block_slug: blockSlug,
  })
}

export function trackAuctionWon(finalPrice: number, itemId: string) {
  trackEvent({
    action: "auction_won",
    category: "auction",
    value: finalPrice,
    item_id: itemId,
  })
}

export function trackRegistration() {
  trackEvent({ action: "registration", category: "auth" })
}

export function trackLogin() {
  trackEvent({ action: "login", category: "auth" })
}

export function trackCatalogSearch(query: string, formatFilter?: string) {
  trackEvent({
    action: "catalog_search",
    category: "catalog",
    label: query,
    format_filter: formatFilter,
  })
}

export function trackCatalogView(releaseId: string) {
  trackEvent({
    action: "catalog_view",
    category: "catalog",
    item_id: releaseId,
  })
}

export function trackAuctionView(itemId: string) {
  trackEvent({
    action: "auction_view",
    category: "auction",
    item_id: itemId,
  })
}

// ── Gallery Events ──────────────────────────────────────

export function trackGalleryView() {
  trackEvent({
    action: "gallery_view",
    category: "gallery",
  })
}

export function trackGallerySection(section: string) {
  trackEvent({
    action: "gallery_section_view",
    category: "gallery",
    label: section,
  })
}

export function trackGalleryVisitClick() {
  trackEvent({
    action: "gallery_visit_click",
    category: "gallery",
    label: "plan_your_visit",
  })
}

// ── GA4 E-Commerce Events ──────────────────────────────────────

// view_item — auf Catalog/Lot-Detail-Seite aufrufen
export function trackViewItem(opts: {
  itemId: string
  itemName: string
  itemCategory: string
  price?: number
}) {
  if (typeof window === "undefined") return
  window.gtag?.("event", "view_item", {
    currency: "EUR",
    value: opts.price || 0,
    items: [{
      item_id: opts.itemId,
      item_name: opts.itemName,
      item_category: opts.itemCategory,
      price: opts.price || 0,
      quantity: 1,
    }],
  })
}

// add_to_cart — bei Direktkauf in den Warenkorb
export function trackAddToCart(opts: {
  itemId: string
  itemName: string
  price: number
}) {
  if (typeof window === "undefined") return
  window.gtag?.("event", "add_to_cart", {
    currency: "EUR",
    value: opts.price,
    items: [{
      item_id: opts.itemId,
      item_name: opts.itemName,
      price: opts.price,
      quantity: 1,
    }],
  })
}

// begin_checkout — wenn Checkout-Page geöffnet wird
export function trackBeginCheckout(opts: { value: number; itemCount: number }) {
  if (typeof window === "undefined") return
  window.gtag?.("event", "begin_checkout", {
    currency: "EUR",
    value: opts.value,
  })
}

// purchase — nach erfolgreicher Zahlung
export function trackPurchase(opts: {
  transactionId: string
  value: number
  items: Array<{ id: string; name: string; price: number }>
}) {
  if (typeof window === "undefined") return
  window.gtag?.("event", "purchase", {
    transaction_id: opts.transactionId,
    value: opts.value,
    currency: "EUR",
    items: opts.items.map((i) => ({
      item_id: i.id,
      item_name: i.name,
      price: i.price,
      quantity: 1,
    })),
  })
}
