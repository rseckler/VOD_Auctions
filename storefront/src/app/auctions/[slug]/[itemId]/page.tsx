import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRight, ArrowLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ImageGallery } from "@/components/ImageGallery"
import { ItemBidSection } from "@/components/ItemBidSection"
import { RelatedSection } from "@/components/RelatedSection"
import { medusaFetch } from "@/lib/api"
import { CreditsTable } from "@/components/CreditsTable"
import { SaveForLaterButton } from "@/components/SaveForLaterButton"
import { ShareButton } from "@/components/ShareButton"
import { extractTracklistFromText } from "@/lib/utils"
import type { AuctionBlock, BlockItem, ReleaseImage, TracklistEntry, VariousArtist, ReleaseComment } from "@/types"

type BlockInfo = {
  id: string
  title: string
  slug: string
  status: string
}

type ItemWithImages = BlockItem & {
  release: (NonNullable<BlockItem["release"]> & {
    images?: ReleaseImage[]
    description?: string | null
    media_condition?: string | null
    sleeve_condition?: string | null
    legacy_price?: number | null
    legacy_condition?: string | null
    legacy_format_detail?: string | null
    tracklist?: TracklistEntry[] | null
    credits?: string | null
    various_artists?: VariousArtist[]
    comments?: ReleaseComment[]
  }) | null
}

async function getItem(
  slug: string,
  itemId: string
): Promise<{ block_item: ItemWithImages; auction_block: BlockInfo } | null> {
  return medusaFetch<{ block_item: ItemWithImages; auction_block: BlockInfo }>(
    `/store/auction-blocks/${slug}/items/${itemId}`,
    { revalidate: 30 }
  )
}

async function getBlockItems(slug: string): Promise<BlockItem[]> {
  const data = await medusaFetch<{ auction_block: AuctionBlock }>(
    `/store/auction-blocks/${slug}`,
    { revalidate: 60 }
  )
  return data?.auction_block?.items || []
}

const FORMAT_COLORS: Record<string, string> = {
  LP: "bg-format-vinyl/15 text-format-vinyl border-format-vinyl/30",
  CD: "bg-format-cd/15 text-format-cd border-format-cd/30",
  CASSETTE: "bg-format-cassette/15 text-format-cassette border-format-cassette/30",
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; itemId: string }>
}): Promise<Metadata> {
  const { slug, itemId } = await params
  const data = await getItem(slug, itemId)
  if (!data) return { title: "Item Not Found" }

  const { block_item: item, auction_block: block } = data
  const r = item.release
  const title = r?.artist_name
    ? `${r.artist_name} — ${r.title}`
    : r?.title || `Lot ${item.lot_number}`
  const description = [
    r?.format,
    r?.label_name,
    r?.year,
    r?.country,
    `Starting at €${item.start_price.toFixed(2)}`,
  ]
    .filter(Boolean)
    .join(" · ")

  return {
    title: `${title} | ${block.title}`,
    description: description || `${title} — auction lot on VOD Auctions`,
    openGraph: {
      title: `${title} — VOD Auctions`,
      description: description || `${title} — auction lot on VOD Auctions`,
      ...(r?.coverImage
        ? { images: [{ url: r.coverImage, alt: title }] }
        : {}),
    },
    twitter: {
      card: r?.coverImage ? "summary_large_image" : "summary",
      title: `${title} — VOD Auctions`,
      description: description || `${title} — auction lot on VOD Auctions`,
      ...(r?.coverImage ? { images: [r.coverImage] } : {}),
    },
  }
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ slug: string; itemId: string }>
}) {
  const { slug, itemId } = await params
  const [data, blockItems] = await Promise.all([
    getItem(slug, itemId),
    getBlockItems(slug),
  ])

  if (!data) notFound()

  const { block_item: item, auction_block: block } = data
  const release = item.release

  // Handle tracklist/credits separation from legacy data
  const hasTracklist = release?.tracklist && release.tracklist.length > 0
  const extracted = release?.credits
    ? extractTracklistFromText(release.credits)
    : null
  const effectiveTracklist = hasTracklist
    ? release!.tracklist!
    : extracted?.tracks.length ? extracted.tracks : null
  // Always strip tracklist data from credits, even when tracklist JSONB exists
  const effectiveCredits = extracted?.tracks.length
    ? extracted.remainingCredits
    : (release?.credits || null)

  // Use images in API sort order (by URL, matching legacy rang order)
  const images: string[] = []
  if (release?.images && release.images.length > 0) {
    for (const img of release.images) {
      if (img.url) images.push(img.url)
    }
  } else if (release?.coverImage) {
    images.push(release.coverImage)
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground mb-8 flex items-center gap-1 flex-wrap">
        <Link href="/auctions" className="hover:text-foreground transition-colors">
          Auctions
        </Link>
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        <Link href={`/auctions/${block.slug}`} className="hover:text-foreground transition-colors">
          {block.title}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="text-foreground truncate">
          {release?.artist_name
            ? `${release.artist_name} — ${release.title}`
            : release?.title || `Lot ${item.lot_number}`}
        </span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* Images */}
        <ImageGallery images={images} title={release?.title || ""} />

        {/* Details */}
        <div>
          {item.lot_number && (
            <p className="text-xs text-primary font-mono mb-2">
              Lot #{item.lot_number}
            </p>
          )}

          <p className="text-muted-foreground text-lg">
            {release?.artist_slug ? (
              <Link href={`/band/${release.artist_slug}`} className="hover:text-primary transition-colors">
                {release.artist_name}
              </Link>
            ) : (
              release?.artist_name || release?.label_name || "Unknown Artist"
            )}
          </p>
          <div className="flex items-start gap-3 mt-1">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex-1">
              {release?.title || item.release_id}
            </h1>
            {release && <SaveForLaterButton releaseId={release.id || item.release_id} />}
            <ShareButton
              url={`https://vod-auctions.com/auctions/${slug}/${itemId}`}
              title={release?.artist_name ? `${release.artist_name} — ${release.title}` : release?.title || `Lot ${item.lot_number}`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            {release?.format && (
              <Badge
                variant="outline"
                className={FORMAT_COLORS[release.format] || "bg-secondary text-muted-foreground"}
              >
                {release.format}
              </Badge>
            )}
            {release?.year && (
              <Badge variant="secondary">{release.year}</Badge>
            )}
            {release?.country && (
              <Badge variant="secondary">{release.country}</Badge>
            )}
          </div>

          {/* Bid Section */}
          <div className="mt-6">
            <ItemBidSection
              slug={slug}
              itemId={item.id}
              initialPrice={item.current_price}
              startPrice={item.start_price}
              initialBidCount={item.bid_count}
              lotEndTime={item.lot_end_time || null}
              blockStatus={block.status}
              itemStatus={item.status}
            />
            <p className="text-xs text-muted-foreground mt-2">incl. VAT, plus <a href="/agb" className="underline">shipping</a></p>
          </div>

          {item.estimated_value && (
            <div className="mt-3 flex items-center justify-between text-sm px-1">
              <span className="text-muted-foreground">Estimated Value</span>
              <span className="text-muted-foreground">
                &euro;{Number(item.estimated_value).toFixed(2)}
              </span>
            </div>
          )}

          {/* Details — Concept C "Vinyl Groove" */}
          <div className="relative pl-4 mt-8 mb-7">
            <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
            <h2 className="font-serif text-[15px] text-primary mb-3">Details</h2>
            <div>
              {[
                release?.article_number && { k: "Article No.", v: release.article_number, mono: true },
                release?.label_name && { k: "Label", v: release.label_name, link: release?.label_slug ? `/label/${release.label_slug}` : undefined },
                release?.catalogNumber && { k: "Catalog No.", v: release.catalogNumber, mono: true },
                release?.legacy_condition && { k: "Condition", v: release.legacy_condition, mono: true },
                release?.media_condition && { k: "Media", v: release.media_condition },
                release?.sleeve_condition && { k: "Sleeve", v: release.sleeve_condition },
                release?.legacy_format_detail && { k: "Format", v: release.legacy_format_detail },
                release?.legacy_price && { k: "Catalog Price", v: `€${Number(release.legacy_price).toFixed(2)}`, mono: true },
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

          {/* HIDDEN: Discogs prices temporarily disabled — data still in DB, re-enable later
          {(release?.discogs_lowest_price || release?.discogs_median_price || release?.discogs_highest_price) && (
            <div className="relative pl-4 mb-7">
              <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
              <h2 className="font-serif text-[15px] text-primary mb-2">Discogs Market</h2>
                <div className="flex gap-4 text-sm font-mono">
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
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-2"
                  >
                    View on Discogs &rarr;
                  </a>
                )}
            </div>
          )}
          */}

          {/* Contributing Artists */}
          {release?.various_artists && release.various_artists.length > 0 && (
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

          {/* Description */}
          {release?.description && !effectiveTracklist?.length && !effectiveCredits && (
            <>
              <Separator className="my-6" />
              <div>
                <h2 className="text-lg font-semibold mb-2">Description</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {release.description}
                </p>
              </div>
            </>
          )}

          {/* Comments */}
          {release?.comments && release.comments.length > 0 && (
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
      <RelatedSection
        blockSlug={block.slug}
        currentItemId={item.id}
        blockItems={blockItems}
        artistName={release?.artist_name || null}
        labelName={release?.label_name || null}
        variousArtists={release?.various_artists}
      />

      <Separator className="my-8" />
      <Button variant="ghost" asChild>
        <Link href={`/auctions/${block.slug}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to &quot;{block.title}&quot;
        </Link>
      </Button>

      {/* Product JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: release?.artist_name
              ? `${release.artist_name} — ${release.title}`
              : release?.title || `Lot ${item.lot_number}`,
            ...(images[0] ? { image: images[0] } : {}),
            description: [
              release?.format,
              release?.label_name,
              release?.year,
              release?.country,
            ]
              .filter(Boolean)
              .join(" · "),
            ...(release?.label_name
              ? { brand: { "@type": "Organization", name: release.label_name } }
              : {}),
            offers: {
              "@type": "Offer",
              price: Number(item.current_price || item.start_price).toFixed(2),
              priceCurrency: "EUR",
              availability:
                block.status === "active"
                  ? "https://schema.org/InStock"
                  : "https://schema.org/SoldOut",
              seller: {
                "@type": "Organization",
                name: "VOD Records",
              },
            },
          }),
        }}
      />
    </main>
  )
}
