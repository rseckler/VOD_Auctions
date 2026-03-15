import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRight, ArrowLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ImageGallery } from "@/components/ImageGallery"
import { CatalogRelatedSection } from "@/components/CatalogRelatedSection"
import { DirectPurchaseButton } from "@/components/DirectPurchaseButton"
import { SaveForLaterButton } from "@/components/SaveForLaterButton"
import { ShareButton } from "@/components/ShareButton"
import { medusaFetch } from "@/lib/api"
import { CreditsTable } from "@/components/CreditsTable"
import { CatalogBackLink } from "@/components/CatalogBackLink"
import { extractTracklistFromText } from "@/lib/utils"
import type { Release } from "@/types"

type RelatedRelease = {
  id: string
  title: string
  slug: string
  format: string | null
  year: number | null
  country: string | null
  coverImage: string | null
  legacy_price: number | null
  legacy_condition: string | null
  artist_name: string | null
  artist_slug: string | null
  label_name: string | null
}

type CatalogRelease = Release & {
  images?: { id: string; url: string; alt: string }[]
  various_artists?: { artist_name: string | null; role: string }[]
  comments?: { id: string; content: string; rating: number | null; legacy_date: string | null }[]
  discogs_lowest_price?: number | null
  discogs_num_for_sale?: number | null
  related_by_artist?: RelatedRelease[]
  related_by_label?: RelatedRelease[]
}

async function getRelease(id: string): Promise<{ release: CatalogRelease } | null> {
  return medusaFetch<{ release: CatalogRelease }>(
    `/store/catalog/${id}`,
    { revalidate: 60 }
  )
}

const FORMAT_COLORS: Record<string, string> = {
  LP: "bg-format-vinyl/15 text-format-vinyl border-format-vinyl/30",
  CD: "bg-format-cd/15 text-format-cd border-format-cd/30",
  CASSETTE: "bg-format-cassette/15 text-format-cassette border-format-cassette/30",
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const data = await getRelease(id)
  if (!data) return { title: "Release Not Found" }

  const r = data.release
  const title = r.artist_name ? `${r.artist_name} — ${r.title}` : r.title
  const description = [
    r.format_name || r.format,
    r.label_name,
    r.year,
    r.country,
    r.legacy_condition,
  ]
    .filter(Boolean)
    .join(" · ")

  return {
    title,
    description: description || `${title} — available on VOD Auctions`,
    openGraph: {
      title: `${title} — VOD Auctions`,
      description: description || `${title} — available on VOD Auctions`,
      ...(r.coverImage ? { images: [{ url: r.coverImage, alt: title }] } : {}),
    },
    twitter: {
      card: r.coverImage ? "summary_large_image" : "summary",
      title: `${title} — VOD Auctions`,
      description: description || `${title} — available on VOD Auctions`,
      ...(r.coverImage ? { images: [r.coverImage] } : {}),
    },
  }
}

export default async function CatalogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getRelease(id)
  if (!data) notFound()

  const release = data.release

  // Handle tracklist/credits separation from legacy data
  const hasTracklist = release.tracklist && release.tracklist.length > 0
  const extracted = release.credits
    ? extractTracklistFromText(release.credits)
    : null
  const effectiveTracklist = hasTracklist
    ? release.tracklist!
    : extracted?.tracks.length ? extracted.tracks : null
  // Always strip tracklist data from credits, even when tracklist JSONB exists
  const effectiveCredits = extracted?.tracks.length
    ? extracted.remainingCredits
    : release.credits

  // Use images in API sort order (by URL, matching legacy rang order)
  // coverImage only used as fallback when no gallery images exist
  const images: string[] = []
  if (release.images && release.images.length > 0) {
    for (const img of release.images) {
      if (img.url) images.push(img.url)
    }
  } else if (release.coverImage) {
    images.push(release.coverImage)
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 pb-20 lg:pb-8">
      {/* Breadcrumb — preserves catalog filter state via sessionStorage */}
      <nav className="text-sm text-muted-foreground mb-8 flex items-center gap-1 flex-wrap">
        <CatalogBackLink className="hover:text-foreground transition-colors" />
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="text-foreground truncate">
          {release.artist_name
            ? `${release.artist_name} — ${release.title}`
            : release.title}
        </span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* Images */}
        <ImageGallery images={images} title={release.title} />

        {/* Details */}
        <div>
          <p className="text-muted-foreground text-lg">
            {release.artist_slug ? (
              <Link href={`/band/${release.artist_slug}`} className="hover:text-primary transition-colors">
                {release.artist_name}
              </Link>
            ) : (
              release.artist_name || release.label_name || "Unknown Artist"
            )}
          </p>
          <div className="flex items-start gap-3 mt-1">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex-1">
              {release.title}
            </h1>
            <SaveForLaterButton releaseId={release.id} />
            <ShareButton
              url={`https://vod-auctions.com/catalog/${release.id}`}
              title={release.artist_name ? `${release.artist_name} — ${release.title}` : release.title}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            {(release.format_name || release.format) && (
              <Badge
                variant="outline"
                className={FORMAT_COLORS[release.format] || "bg-secondary text-muted-foreground"}
              >
                {release.format_name || release.format}
              </Badge>
            )}
            {release.year && (
              <Badge variant="secondary">{release.year}</Badge>
            )}
            {release.country && (
              <Badge variant="secondary">{release.country}</Badge>
            )}
          </div>

          {/* Price info */}
          <div className="mt-6 bg-card border border-border/50 rounded-lg p-4 space-y-2">
            {release.is_purchasable ? (
              <div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">Catalog Price</span>
                  <div className="flex items-center gap-2">
                    {/* Stock indicator */}
                    {(release.auction_status === "sold" || release.auction_status === "sold_direct") ? (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">Sold</span>
                    ) : release.inventory != null && release.inventory > 0 ? (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        release.inventory === 1
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-green-500/15 text-green-400"
                      }`}>
                        {release.inventory === 1 ? "Last copy" : "In Stock"}
                      </span>
                    ) : null}
                    <span className="text-xl font-mono font-bold text-primary">
                      &euro;{Number(release.legacy_price).toFixed(2)}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-right">incl. VAT, plus <a href="/agb" className="underline">shipping</a> &middot; <a href="/widerruf" className="underline">14-day return policy</a></p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                This item is currently not available for purchase or in a planned auction.
              </p>
            )}
            {/* HIDDEN: Discogs prices temporarily disabled — data still in DB, re-enable later
            {(release.discogs_lowest_price || release.discogs_median_price || release.discogs_highest_price || release.discogs_id) && (
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">Discogs Prices</span>
                  {release.discogs_num_for_sale ? (
                    <span className="text-xs text-muted-foreground">
                      {release.discogs_num_for_sale} listings
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-3 text-sm font-mono">
                  {release.discogs_lowest_price && (
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] text-muted-foreground uppercase">Low</span>
                      <span>&euro;{Number(release.discogs_lowest_price).toFixed(2)}</span>
                    </div>
                  )}
                  {release.discogs_median_price && (
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] text-muted-foreground uppercase">Median</span>
                      <span className="font-semibold">&euro;{Number(release.discogs_median_price).toFixed(2)}</span>
                    </div>
                  )}
                  {release.discogs_highest_price && (
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] text-muted-foreground uppercase">High</span>
                      <span>&euro;{Number(release.discogs_highest_price).toFixed(2)}</span>
                    </div>
                  )}
                </div>
                {release.discogs_id && (
                  <a
                    href={`https://www.discogs.com/release/${release.discogs_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
                  >
                    View on Discogs &rarr;
                  </a>
                )}
              </div>
            )}
            */}
            {release.estimated_value && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Estimated Value</span>
                <span className="text-sm font-mono">
                  &euro;{Number(release.estimated_value).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {release.is_purchasable && (
            <DirectPurchaseButton
              releaseId={release.id}
              saleMode={release.sale_mode || null}
              directPrice={release.direct_price || null}
              auctionStatus={release.auction_status || null}
            />
          )}

          {/* Details — Concept C "Vinyl Groove" */}
          <div className="relative pl-4 mt-8 mb-7">
            <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
            <h2 className="font-serif text-[15px] text-primary mb-3">Details</h2>
            <div>
              {[
                release.article_number && { k: "Article No.", v: release.article_number, mono: true },
                release.label_name && { k: "Label", v: release.label_name, link: release.label_slug ? `/label/${release.label_slug}` : undefined },
                release.pressorga_name && { k: "Press / Org", v: release.pressorga_name, link: release.pressorga_slug ? `/press/${release.pressorga_slug}` : undefined },
                release.catalogNumber && { k: "Catalog No.", v: release.catalogNumber, mono: true },
                release.legacy_condition && { k: "Condition", v: release.legacy_condition, mono: true },
                (release.format_name || release.legacy_format_detail) && { k: "Format", v: release.format_name || release.legacy_format_detail },
                release.media_condition && { k: "Media", v: release.media_condition },
                release.sleeve_condition && { k: "Sleeve", v: release.sleeve_condition },
              ].filter(Boolean).map((row, i) => {
                const { k, v, mono, link } = row as { k: string; v: string; mono?: boolean; link?: string }
                return (
                  <div key={i} className={`flex justify-between py-1.5 ${i > 0 ? "border-t border-dotted border-white/[0.06]" : ""}`}>
                    <span className="text-xs text-muted-foreground">{k}</span>
                    <span className={`text-[13px] font-medium ${mono ? "font-mono text-xs font-normal" : ""}`}>
                      {link ? (
                        <Link href={link} className="hover:text-primary transition-colors">
                          {v}
                        </Link>
                      ) : v}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Contributing Artists */}
          {release.various_artists && release.various_artists.length > 0 && (
            <div className="relative pl-4 mb-7">
              <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
              <h2 className="font-serif text-[15px] text-primary mb-3">
                Contributing Artists{" "}
                <span className="font-sans text-[11px] text-muted-foreground font-normal ml-1.5">
                  {release.various_artists.length}
                </span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {release.various_artists.map((va, i) => (
                  <span
                    key={i}
                    className="relative text-xs py-1 pl-3.5 pr-3 rounded border border-primary/15 bg-gradient-to-br from-primary/[0.08] to-primary/[0.03]"
                  >
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[60%] bg-primary/60 rounded-r-sm" />
                    {va.artist_name || "Unknown"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tracklist */}
          {effectiveTracklist && effectiveTracklist.length > 0 && (
            <div className="relative pl-4 mb-7">
              <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
              <h2 className="font-serif text-[15px] text-primary mb-3">
                Tracklist{" "}
                <span className="font-sans text-[11px] text-muted-foreground font-normal ml-1.5">
                  {effectiveTracklist.length} tracks
                </span>
              </h2>
              <div className="bg-card rounded-lg p-3 border border-white/[0.06]">
                {effectiveTracklist.map((track, i) => {
                  const pos = track.position || `${i + 1}`
                  const prevPos = i > 0 ? (effectiveTracklist[i - 1].position || `${i}`) : null
                  const side = pos.match(/^[A-Za-z]/)?.[0]?.toUpperCase()
                  const prevSide = prevPos?.match(/^[A-Za-z]/)?.[0]?.toUpperCase()
                  const showSide = side && side !== prevSide
                  return (
                    <div key={i}>
                      {showSide && (
                        <>
                          {i > 0 && <div className="h-px bg-white/[0.06] my-1" />}
                          <div className="text-[10px] uppercase tracking-[0.15em] text-primary font-semibold mt-2 mb-1.5">
                            Side {side}
                          </div>
                        </>
                      )}
                      <div className="flex items-baseline gap-2.5 py-1">
                        <span className="font-mono text-[11px] text-primary w-6 text-right flex-shrink-0">
                          {pos}
                        </span>
                        <span className="flex-1 text-[13px]">{track.title}</span>
                        {track.duration && (
                          <span className="font-mono text-[11px] text-muted-foreground/60">
                            {track.duration}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Credits */}
          {effectiveCredits && (
            <div className="relative pl-4 mb-7">
              <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
              <h2 className="font-serif text-[15px] text-primary mb-3">Credits</h2>
              <CreditsTable credits={effectiveCredits} />
            </div>
          )}

          {/* Comments */}
          {release.comments && release.comments.length > 0 && (
            <div className="relative pl-4 mb-7">
              <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
              <h2 className="font-serif text-[15px] text-primary mb-3">
                Reviews{" "}
                <span className="font-sans text-[11px] text-muted-foreground font-normal ml-1.5">
                  {release.comments.length}
                </span>
              </h2>
                <div className="space-y-3">
                  {release.comments.map((comment) => (
                    <div key={comment.id} className="bg-secondary/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        {comment.rating && (
                          <span className="text-primary text-sm">
                            {"★".repeat(comment.rating)}{"☆".repeat(5 - comment.rating)}
                          </span>
                        )}
                        {comment.legacy_date && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(comment.legacy_date).toLocaleDateString("en-US")}
                          </span>
                        )}
                      </div>
                      <p className="text-sm">{comment.content}</p>
                    </div>
                  ))}
                </div>
            </div>
          )}
        </div>
      </div>

      {/* Related Section */}
      <Separator className="my-8" />
      <CatalogRelatedSection
        artistName={release.artist_name}
        labelName={release.label_name}
        relatedByArtist={release.related_by_artist || []}
        relatedByLabel={release.related_by_label || []}
      />

      <Separator className="my-8" />
      <Button variant="ghost" asChild>
        <CatalogBackLink>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Catalog
        </CatalogBackLink>
      </Button>

      {/* Sticky Mobile CTA */}
      {release.is_purchasable ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-[#1c1915] border-t border-border px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-lg font-mono font-bold text-primary">
            &euro;{Number(release.legacy_price).toFixed(2)}
          </span>
          <DirectPurchaseButton
            releaseId={release.id}
            saleMode={release.sale_mode || null}
            directPrice={release.direct_price || null}
            auctionStatus={release.auction_status || null}
          />
        </div>
      ) : (
        <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-[#1c1915] border-t border-border px-4 py-3">
          <p className="text-sm text-muted-foreground italic text-center">Not for sale</p>
        </div>
      )}

      {/* Product JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: release.artist_name
              ? `${release.artist_name} — ${release.title}`
              : release.title,
            ...(images[0] ? { image: images[0] } : {}),
            description: [
              release.format_name || release.format,
              release.label_name,
              release.year,
              release.country,
              release.legacy_condition,
            ]
              .filter(Boolean)
              .join(" · "),
            ...(release.label_name
              ? { brand: { "@type": "Organization", name: release.label_name } }
              : {}),
            ...(release.is_purchasable && release.legacy_price
              ? {
                  offers: {
                    "@type": "Offer",
                    price: Number(release.legacy_price).toFixed(2),
                    priceCurrency: "EUR",
                    availability: "https://schema.org/InStock",
                    seller: {
                      "@type": "Organization",
                      name: "VOD Records",
                    },
                  },
                }
              : {}),
          }),
        }}
      />
    </main>
  )
}
