import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import { ChevronRight, Calendar, Package, Clock, Disc3, Heart } from "lucide-react"
import { BlockItemsGrid } from "@/components/BlockItemsGrid"
import { CollapsibleDescription } from "@/components/CollapsibleDescription"
import { ShareButton } from "@/components/ShareButton"
import { PreviewCountdown } from "@/components/PreviewCountdown"
import { medusaFetch } from "@/lib/api"
import type { AuctionBlock } from "@/types"
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd"

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: "Live", className: "text-status-active" },
  scheduled: { label: "Scheduled", className: "text-muted-foreground" },
  preview: { label: "Preview", className: "text-status-preview" },
  ended: { label: "Ended", className: "text-muted-foreground/60" },
}

const TYPE_LABELS: Record<string, string> = {
  theme: "Theme Block",
  highlight: "Highlight",
  clearance: "Clearance",
  flash: "Flash",
}

function timeRemaining(endStr: string): string {
  const diff = new Date(endStr).getTime() - Date.now()
  if (diff <= 0) return "Ended"
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  if (diff < 3600000) return `${minutes}m ${seconds}s`
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  return `${hours}h ${minutes}m`
}

function formatBlockTime(dateStr: string): string {
  const date = new Date(dateStr)
  const day = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Berlin",
  })
  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  })
  // Determine CET vs CEST by reading the timezone name from Intl
  const berlinFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    timeZoneName: "short",
  })
  const parts = berlinFormatter.formatToParts(date)
  const tzAbbr = parts.find((p) => p.type === "timeZoneName")?.value || "CET"
  // Normalize: browsers may return "GMT+1" or "GMT+2"; convert to CET/CEST
  const tzLabel = tzAbbr.startsWith("GMT+2") ? "CEST" : tzAbbr.startsWith("GMT+1") ? "CET" : tzAbbr
  return `${day} at ${time} ${tzLabel}`
}

async function getBlock(slug: string): Promise<AuctionBlock | null> {
  const data = await medusaFetch<{ auction_block: AuctionBlock }>(
    `/store/auction-blocks/${slug}`,
    { revalidate: 30 }
  )
  return data?.auction_block || null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const block = await getBlock(slug)
  if (!block) return { title: "Auction Not Found" }

  const description = block.short_description ||
    `${block.title} — ${block.items_count || 0} lots. ${block.subtitle || "Rare music auction on VOD Auctions."}`

  return {
    title: block.title,
    description,
    openGraph: {
      title: `${block.title} — VOD Auctions`,
      description,
      ...(block.header_image
        ? { images: [{ url: block.header_image, alt: block.title }] }
        : {}),
    },
    twitter: {
      card: block.header_image ? "summary_large_image" : "summary",
      title: `${block.title} — VOD Auctions`,
      description,
      ...(block.header_image ? { images: [block.header_image] } : {}),
    },
    alternates: {
      canonical: `/auctions/${slug}`,
    },
  }
}

export default async function BlockDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const block = await getBlock(slug)

  if (!block) notFound()

  const statusConfig = STATUS_CONFIG[block.status] || STATUS_CONFIG.ended
  const items = block.items || []
  const isPreview = block.status === "preview" || block.status === "scheduled"

  const priceRange = items.length > 0
    ? {
        min: Math.min(...items.map((i) => i.start_price)),
        max: Math.max(...items.map((i) => i.start_price)),
      }
    : null

  return (
    <main>
      {/* Preview / Scheduled Banner */}
      {isPreview && (
        <div className="bg-amber-950/30 border-b border-amber-500/30">
          <div className="mx-auto max-w-6xl px-6 py-3 flex items-center gap-3">
            <span className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Preview
            </span>
            <p className="text-sm text-amber-300/80">
              Bidding not yet open. Browse the upcoming lots and save items to your watchlist.
            </p>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="relative">
        {block.header_image ? (
          <div className="relative h-72 md:h-[28rem]">
            <Image
              src={block.header_image}
              alt={block.title}
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1c1915] via-[rgba(28,25,21,0.6)] to-transparent" />
          </div>
        ) : (
          <div className="h-32 bg-gradient-to-b from-[rgba(212,165,74,0.06)] to-transparent" />
        )}
        <div className="relative mx-auto max-w-6xl px-6 -mt-24">
          <div className="flex items-center gap-3 mb-3">
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-md bg-[rgba(28,25,21,0.85)] backdrop-blur-sm text-xs font-semibold ${statusConfig.className}`}>
              {block.status === "active" && (
                <span className="w-1.5 h-1.5 rounded-full bg-status-active animate-pulse" />
              )}
              {statusConfig.label}
            </div>
            <span className="text-[11px] text-primary uppercase tracking-[2px] font-semibold">
              {TYPE_LABELS[block.block_type] || block.block_type}
            </span>
          </div>
          <div className="flex items-start gap-3">
            <h1 className="font-serif text-3xl md:text-5xl leading-[1.1] flex-1">
              {block.title}
            </h1>
            <div className="pt-1 flex-shrink-0">
              <ShareButton
                url={`https://vod-auctions.com/auctions/${block.slug}`}
                title={`${block.title} — VOD Auctions`}
                text={`${items.length} lots of industrial music available now`}
              />
            </div>
          </div>
          {block.subtitle && (
            <p className="text-xl text-muted-foreground mt-2">{block.subtitle}</p>
          )}

          {/* Stats Row */}
          <div className="flex flex-wrap items-center gap-6 mt-6 pt-5 border-t border-[rgba(232,224,212,0.08)]">
            <div>
              <div className="text-[11px] uppercase tracking-[1px] text-muted-foreground/60 font-medium mb-1">Lots</div>
              <div className="font-serif text-2xl">{items.length}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[1px] text-muted-foreground/60 font-medium mb-1">Schedule</div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-sm">
                  <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-white/10 bg-[rgba(28,25,21,0.85)] backdrop-blur-sm text-foreground text-sm font-medium">
                    {formatBlockTime(block.start_time)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <Clock className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-primary/60 bg-[rgba(28,25,21,0.85)] backdrop-blur-sm text-primary text-sm font-semibold">
                    {formatBlockTime(block.end_time)}
                  </span>
                </div>
              </div>
            </div>
            {priceRange && (
              <div>
                <div className="text-[11px] uppercase tracking-[1px] text-muted-foreground/60 font-medium mb-1">From</div>
                <div className="font-serif text-2xl text-primary">
                  &euro;{priceRange.min.toFixed(0)}
                </div>
              </div>
            )}
            {block.status === "active" && (
              <div className="ml-auto pl-6 border-l border-primary/20">
                <div className="text-[11px] uppercase tracking-[1px] text-muted-foreground/60 font-medium mb-1">Time Left</div>
                <div className="flex items-center gap-2 text-status-active font-bold">
                  <Clock className="h-5 w-5" />
                  <span className="font-serif text-3xl md:text-4xl leading-none">
                    {timeRemaining(block.end_time)}
                  </span>
                </div>
              </div>
            )}
            {isPreview && block.start_time && (
              <PreviewCountdown startTime={block.start_time} />
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <BreadcrumbJsonLd
          items={[
            { name: "Home", url: "/" },
            { name: "Auctions", url: "/auctions" },
            { name: block.title, url: `/auctions/${block.slug}` },
          ]}
        />
        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground mb-8 flex items-center gap-1">
          <Link href="/auctions" className="hover:text-primary transition-colors">
            Auctions
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">{block.title}</span>
        </nav>

        {/* Editorial Content */}
        {(block.long_description || block.video_url) && (
          <section className="mb-12 max-w-3xl">
            {block.long_description && (
              <CollapsibleDescription
                paragraphs={block.long_description.split("\n")}
              />
            )}
            {block.video_url && (
              <div className="mt-6 aspect-video rounded-lg overflow-hidden border border-[rgba(232,224,212,0.08)]">
                <iframe
                  src={block.video_url.replace("watch?v=", "embed/")}
                  className="w-full h-full"
                  allowFullScreen
                />
              </div>
            )}
          </section>
        )}

        {/* Items Grid */}
        <section>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <h2 className="font-serif text-2xl flex items-center gap-3">
              Lots
              <span className="text-sm font-sans text-muted-foreground font-normal">{items.length} items</span>
            </h2>
            {isPreview && items.length > 0 && (
              <p className="text-sm text-amber-400/80 flex items-center gap-1.5">
                <Heart className="h-4 w-4" />
                Click a lot to save it to your watchlist
              </p>
            )}
          </div>
          <BlockItemsGrid items={items} blockSlug={block.slug} previewMode={isPreview} />
        </section>
      </div>

      {/* Auction Block JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Event",
            name: block.title,
            description: block.short_description || block.subtitle || undefined,
            url: `https://vod-auctions.com/auctions/${block.slug}`,
            ...(block.header_image ? { image: block.header_image } : {}),
            ...(block.start_time ? { startDate: block.start_time } : {}),
            ...(block.end_time ? { endDate: block.end_time } : {}),
            eventStatus: block.status === "active"
              ? "https://schema.org/EventScheduled"
              : block.status === "ended"
              ? "https://schema.org/EventPast"
              : "https://schema.org/EventScheduled",
            eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
            location: {
              "@type": "VirtualLocation",
              url: "https://vod-auctions.com/auctions",
            },
            organizer: {
              "@type": "Organization",
              name: "VOD Auctions",
              url: "https://vod-auctions.com",
            },
            offers: priceRange ? {
              "@type": "AggregateOffer",
              priceCurrency: "EUR",
              lowPrice: priceRange.min,
              highPrice: priceRange.max,
              offerCount: items.length,
            } : undefined,
          }),
        }}
      />
    </main>
  )
}
