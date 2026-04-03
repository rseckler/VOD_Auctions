import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { medusaFetch } from "@/lib/api"
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd"
import type { AuctionBlock } from "@/types"

type PastBlock = AuctionBlock & {
  total_bids?: number
  total_revenue?: number
  sold_count?: number
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Auction Archive | VOD Auctions",
    description:
      "Browse completed auction results and price history for rare Industrial, EBM, Dark Ambient and Experimental Music records at VOD Auctions.",
    openGraph: {
      title: "Auction Archive — VOD Auctions",
      description:
        "Browse completed auction results and price history for rare Industrial, EBM, Dark Ambient and Experimental Music records.",
    },
  }
}

async function getPastBlocks(): Promise<PastBlock[]> {
  const data = await medusaFetch<{ auction_blocks: PastBlock[] }>(
    "/store/auction-blocks?status=past"
  )
  return data?.auction_blocks || []
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export default async function AuctionArchivePage() {
  const blocks = await getPastBlocks()

  const jsonLdEvents = blocks.map((block) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: block.title,
    description: block.subtitle || block.short_description || undefined,
    eventStatus: "https://schema.org/EventCancelled",
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    startDate: block.start_time,
    endDate: block.end_time,
    url: `https://vod-auctions.com/auctions/${block.slug}`,
    organizer: {
      "@type": "Organization",
      name: "VOD Auctions",
      url: "https://vod-auctions.com",
    },
  }))

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "/" },
          { name: "Auctions", url: "/auctions" },
          { name: "Archive", url: "/auctions/archive" },
        ]}
      />
      {jsonLdEvents.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLdEvents),
          }}
        />
      )}

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-8">
          <Link
            href="/auctions"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            &larr; Back to Auctions
          </Link>
        </div>

        <h1 className="font-serif text-3xl font-bold tracking-tight mb-2">
          Auction Archive
        </h1>
        <p className="text-muted-foreground mb-10">
          Completed auctions with final results and price history.
        </p>

        {blocks.length === 0 ? (
          <div className="text-center py-20 border border-border/40 rounded-xl bg-card/50">
            <p className="text-muted-foreground text-lg">
              No completed auctions yet.
            </p>
            <Link
              href="/auctions"
              className="mt-4 inline-block text-primary hover:text-primary/80 transition-colors text-sm"
            >
              View current auctions &rarr;
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {blocks.map((block) => (
              <Link
                key={block.id}
                href={`/auctions/${block.slug}`}
                className="group block overflow-hidden rounded-xl border border-border/40 bg-card/50 hover:border-primary/40 transition-all duration-300"
              >
                {/* Cover Images */}
                <div className="relative aspect-[16/9] bg-muted/30 overflow-hidden">
                  {block.cover_images && block.cover_images.length > 0 ? (
                    <div className="grid h-full w-full" style={{
                      gridTemplateColumns: block.cover_images.length >= 3
                        ? "1fr 1fr 1fr"
                        : block.cover_images.length === 2
                          ? "1fr 1fr"
                          : "1fr",
                    }}>
                      {block.cover_images.slice(0, 3).map((img, i) => (
                        <div key={i} className="relative h-full overflow-hidden">
                          <Image
                            src={img}
                            alt=""
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground/40">
                      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                        <circle cx="9" cy="9" r="2" />
                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                      </svg>
                    </div>
                  )}
                  {/* Ended badge */}
                  <div className="absolute top-3 right-3">
                    <span className="inline-flex items-center rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
                      Ended {formatDate(block.end_time)}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5">
                  <h2 className="font-serif text-lg font-semibold tracking-tight group-hover:text-primary transition-colors line-clamp-1">
                    {block.title}
                  </h2>
                  {block.subtitle && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                      {block.subtitle}
                    </p>
                  )}

                  {/* Stats */}
                  <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{block.items_count} lots</span>
                    {typeof block.sold_count === "number" && block.sold_count > 0 && (
                      <span>{block.sold_count} sold</span>
                    )}
                    {typeof block.total_bids === "number" && block.total_bids > 0 && (
                      <span>{block.total_bids} bids</span>
                    )}
                    {typeof block.total_revenue === "number" && block.total_revenue > 0 && (
                      <span className="ml-auto font-medium text-primary">
                        {formatCurrency(block.total_revenue)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
