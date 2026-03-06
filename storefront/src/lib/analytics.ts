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
