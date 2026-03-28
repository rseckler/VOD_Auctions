import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import { ChevronRight, Calendar, Package, Clock, Disc3 } from "lucide-react"
import { BlockItemsGrid } from "@/components/BlockItemsGrid"
import { medusaFetch } from "@/lib/api"
import type { AuctionBlock } from "@/types"

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
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`
  return `${hours}h ${minutes}m ${seconds}s`
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

  const priceRange = items.length > 0
    ? {
        min: Math.min(...items.map((i) => i.start_price)),
        max: Math.max(...items.map((i) => i.start_price)),
      }
    : null

  return (
    <main>
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
          <h1 className="font-serif text-3xl md:text-5xl leading-[1.1]">
            {block.title}
          </h1>
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
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="text-muted-foreground/70">Starts:</span>
                  <span>{formatBlockTime(block.start_time)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-base font-medium text-primary">
                  <Clock className="h-4 w-4 flex-shrink-0" />
                  <span className="text-muted-foreground/70 text-sm font-normal">Ends:</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-primary/40 bg-primary/10 text-primary text-sm font-semibold">
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
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6 py-8">
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
              <div className="prose prose-invert max-w-none prose-p:text-muted-foreground prose-p:leading-relaxed">
                {block.long_description.split("\n").map((p, i) =>
                  p.trim() ? <p key={i}>{p}</p> : null
                )}
              </div>
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
          <h2 className="font-serif text-2xl mb-6 flex items-center gap-3">
            Lots
            <span className="text-sm font-sans text-muted-foreground font-normal">{items.length} items</span>
          </h2>
          <BlockItemsGrid items={items} blockSlug={block.slug} />
        </section>
      </div>
    </main>
  )
}
