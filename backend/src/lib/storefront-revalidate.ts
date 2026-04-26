/**
 * Fire-and-forget on-demand-Revalidation für die Next.js-Storefront.
 *
 * Storefront-Detail-Seiten (`/catalog/[id]`, `/auctions/[slug]/[itemId]`, …)
 * laufen mit `revalidate: 60` (ISR). Ohne expliziten Bust dauert ein Edit
 * bis zu 60s bis er auf der Public-Seite sichtbar ist. Mit diesem Hook ist
 * es ~1s.
 *
 * Pattern gespiegelt von `backend/src/api/admin/content/[page]/[section]/route.ts`.
 * Bewusst fire-and-forget: schlägt der Storefront-Call fehl (Vercel-Hiccup,
 * lokale Storefront down beim Dev), darf das den DB-Write nicht rollbacken.
 */
export function revalidateStorefrontPath(path: string): void {
  const storefrontUrl = process.env.STOREFRONT_URL || "https://vod-auctions.com"
  const secret = process.env.REVALIDATE_SECRET
  if (!secret) return
  fetch(`${storefrontUrl}/api/revalidate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-revalidate-secret": secret },
    body: JSON.stringify({ path }),
    signal: AbortSignal.timeout(3000),
  }).catch((err) => {
    console.warn(
      JSON.stringify({
        event: "storefront_revalidate_failed",
        path,
        error: err?.message,
      })
    )
  })
}

/**
 * Convenience: revalidate the catalog detail page for a Release.
 * Storefront uses `release.id` as the URL slug for `/catalog/[id]`.
 */
export function revalidateReleaseCatalogPage(releaseId: string): void {
  revalidateStorefrontPath(`/catalog/${releaseId}`)
}
