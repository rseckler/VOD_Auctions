// Brevo behavior tracking helpers
// Usage: import { brevoTrack } from "@/lib/brevo-tracking"

function sendinblue() {
  if (typeof window !== "undefined" && window.sendinblue) {
    return window.sendinblue
  }
  return null
}

export function brevoTrack(event: string, properties?: Record<string, unknown>) {
  sendinblue()?.track(event, properties)
}

// ── E-Commerce Events ──────────────────────────────────────

export function brevoProductViewed(releaseId: string, title: string, price?: number) {
  brevoTrack("product_viewed", {
    id: releaseId,
    name: title,
    price,
    url: `${typeof window !== "undefined" ? window.location.origin : ""}/catalog/${releaseId}`,
  })
}

export function brevoAddToCart(releaseId: string, title: string, price: number) {
  brevoTrack("cart_updated", {
    id: releaseId,
    name: title,
    price,
    quantity: 1,
  })
}

export function brevoCartAbandoned(itemCount: number, total: number) {
  brevoTrack("cart_abandoned", {
    item_count: itemCount,
    total,
  })
}

export function brevoCheckoutStarted(itemCount: number, total: number) {
  brevoTrack("checkout_started", {
    item_count: itemCount,
    total,
  })
}

export function brevoOrderCompleted(orderId: string, total: number, itemCount: number) {
  brevoTrack("order_completed", {
    id: orderId,
    revenue: total,
    item_count: itemCount,
  })
}

// ── Auction Events ──────────────────────────────────────

export function brevoBidPlaced(itemId: string, amount: number, blockSlug?: string) {
  brevoTrack("bid_placed", {
    item_id: itemId,
    amount,
    block_slug: blockSlug,
  })
}

export function brevoAuctionViewed(itemId: string, blockSlug: string) {
  brevoTrack("auction_viewed", {
    item_id: itemId,
    block_slug: blockSlug,
  })
}

// ── Catalog Events ──────────────────────────────────────

export function brevoCatalogSearch(query: string, resultCount?: number) {
  brevoTrack("catalog_search", {
    query,
    result_count: resultCount,
  })
}
