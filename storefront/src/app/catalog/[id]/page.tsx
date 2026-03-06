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
import { medusaFetch } from "@/lib/api"
import { CreditsTable } from "@/components/CreditsTable"
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

  // If tracklist is empty, try to extract from credits field (legacy data issue)
  const hasTracklist = release.tracklist && release.tracklist.length > 0
  const extracted = !hasTracklist && release.credits
    ? extractTracklistFromText(release.credits)
    : null
  const effectiveTracklist = hasTracklist
    ? release.tracklist!
    : extracted?.tracks.length ? extracted.tracks : null
  const effectiveCredits = extracted?.tracks.length
    ? extracted.remainingCredits
    : release.credits

  const images: string[] = []
  if (release.coverImage) images.push(release.coverImage)
  if (release.images) {
    for (const img of release.images) {
      if (img.url && img.url !== release.coverImage) {
        images.push(img.url)
      }
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground mb-8 flex items-center gap-1 flex-wrap">
        <Link href="/catalog" className="hover:text-foreground transition-colors">
          Catalog
        </Link>
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
            {release.artist_name || "Unknown Artist"}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mt-1">
            {release.title}
          </h1>

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
            {release.legacy_price && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Catalog Price</span>
                <span className="text-xl font-mono font-bold text-primary">
                  &euro;{Number(release.legacy_price).toFixed(2)}
                </span>
              </div>
            )}
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
            {release.estimated_value && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Estimated Value</span>
                <span className="text-sm font-mono">
                  &euro;{Number(release.estimated_value).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          <DirectPurchaseButton
            releaseId={release.id}
            saleMode={release.sale_mode || null}
            directPrice={release.direct_price || null}
            auctionStatus={release.auction_status || null}
          />

          <Separator className="my-6" />
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Details</h2>
            <dl className="space-y-2 text-sm">
              {release.article_number && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Article No.</dt>
                  <dd className="font-mono text-xs">{release.article_number}</dd>
                </div>
              )}
              {release.label_name && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Label</dt>
                  <dd>{release.label_name}</dd>
                </div>
              )}
              {release.pressorga_name && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Press / Org</dt>
                  <dd>{release.pressorga_name}</dd>
                </div>
              )}
              {release.catalogNumber && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Catalog No.</dt>
                  <dd className="font-mono text-xs">{release.catalogNumber}</dd>
                </div>
              )}
              {release.legacy_condition && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Condition</dt>
                  <dd className="font-mono text-xs uppercase">{release.legacy_condition}</dd>
                </div>
              )}
              {(release.format_name || release.legacy_format_detail) && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Format (Detail)</dt>
                  <dd>{release.format_name || release.legacy_format_detail}</dd>
                </div>
              )}
              {release.media_condition && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Media</dt>
                  <dd>{release.media_condition}</dd>
                </div>
              )}
              {release.sleeve_condition && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Sleeve</dt>
                  <dd>{release.sleeve_condition}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Various Artists */}
          {release.various_artists && release.various_artists.length > 0 && (
            <>
              <Separator className="my-6" />
              <div>
                <h2 className="text-lg font-semibold mb-2">Contributing Artists</h2>
                <div className="flex flex-wrap gap-1.5">
                  {release.various_artists.map((va, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {va.artist_name || "Unknown"}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Tracklist */}
          {effectiveTracklist && effectiveTracklist.length > 0 && (
            <>
              <Separator className="my-6" />
              <div>
                <h2 className="text-lg font-semibold mb-3">Tracklist</h2>
                <ol className="space-y-1.5">
                  {effectiveTracklist.map((track, i) => (
                    <li key={i} className="flex items-baseline gap-3 text-sm">
                      <span className="text-muted-foreground font-mono text-xs w-8 flex-shrink-0 text-right">
                        {track.position || `${i + 1}.`}
                      </span>
                      <span className="flex-1">{track.title}</span>
                      {track.duration && (
                        <span className="text-muted-foreground font-mono text-xs">
                          {track.duration}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}

          {/* Credits */}
          {effectiveCredits && (
            <>
              <Separator className="my-6" />
              <div>
                <h2 className="text-lg font-semibold mb-3">Credits</h2>
                <CreditsTable credits={effectiveCredits} />
              </div>
            </>
          )}

          {/* Comments */}
          {release.comments && release.comments.length > 0 && (
            <>
              <Separator className="my-6" />
              <div>
                <h2 className="text-lg font-semibold mb-3">
                  Reviews ({release.comments.length})
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
            </>
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
        <Link href="/catalog">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Catalog
        </Link>
      </Button>
    </main>
  )
}
