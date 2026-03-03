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

  const images: string[] = []
  if (release?.coverImage) images.push(release.coverImage)
  if (release?.images) {
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
            {release?.artist_name || "Unknown Artist"}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mt-1">
            {release?.title || item.release_id}
          </h1>

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
          </div>

          {item.estimated_value && (
            <div className="mt-3 flex items-center justify-between text-sm px-1">
              <span className="text-muted-foreground">Estimated Value</span>
              <span className="text-muted-foreground">
                &euro;{Number(item.estimated_value).toFixed(2)}
              </span>
            </div>
          )}

          <Separator className="my-6" />
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Details</h2>
            <dl className="space-y-2 text-sm">
              {release?.label_name && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Label</dt>
                  <dd>{release.label_name}</dd>
                </div>
              )}
              {release?.catalogNumber && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Catalog Number</dt>
                  <dd className="font-mono text-xs">{release.catalogNumber}</dd>
                </div>
              )}
              {release?.legacy_condition && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Condition</dt>
                  <dd className="font-mono text-xs uppercase">{release.legacy_condition}</dd>
                </div>
              )}
              {release?.media_condition && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Media</dt>
                  <dd>{release.media_condition}</dd>
                </div>
              )}
              {release?.sleeve_condition && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Sleeve</dt>
                  <dd>{release.sleeve_condition}</dd>
                </div>
              )}
              {release?.legacy_format_detail && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Format (Detail)</dt>
                  <dd>{release.legacy_format_detail}</dd>
                </div>
              )}
              {release?.legacy_price && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Catalog Price</dt>
                  <dd className="font-mono">&euro;{Number(release.legacy_price).toFixed(2)}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Various Artists (Compilations) */}
          {release?.various_artists && release.various_artists.length > 0 && (
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
          {release?.tracklist && release.tracklist.length > 0 && (
            <>
              <Separator className="my-6" />
              <div>
                <h2 className="text-lg font-semibold mb-3">Tracklist</h2>
                <ol className="space-y-1.5">
                  {release.tracklist.map((track, i) => (
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
          {release?.credits && (
            <>
              <Separator className="my-6" />
              <div>
                <h2 className="text-lg font-semibold mb-2">Credits</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {release.credits.replace(/\\r\\n/g, '\n').replace(/\\r/g, '\n').replace(/\\n/g, '\n')}
                </p>
              </div>
            </>
          )}

          {/* Description */}
          {release?.description && !release?.tracklist?.length && !release?.credits && (
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
    </main>
  )
}
