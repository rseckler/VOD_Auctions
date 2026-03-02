import Link from "next/link"
import { notFound } from "next/navigation"

const MEDUSA_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

type Release = {
  id: string
  title: string
  slug: string
  format: string
  year: number | null
  country: string | null
  coverImage: string | null
  catalogNumber: string | null
  estimated_value: number | null
  artist_name: string | null
  label_name: string | null
}

type BlockItem = {
  id: string
  release_id: string
  start_price: number
  estimated_value: number | null
  current_price: number | null
  bid_count: number
  lot_number: number | null
  status: string
  release: Release | null
}

type AuctionBlock = {
  id: string
  title: string
  subtitle: string | null
  slug: string
  status: string
  block_type: string
  start_time: string
  end_time: string
  short_description: string | null
  long_description: string | null
  header_image: string | null
  video_url: string | null
  audio_url: string | null
  items: BlockItem[]
}

async function getBlock(slug: string): Promise<AuctionBlock | null> {
  try {
    const res = await fetch(`${MEDUSA_URL}/store/auction-blocks/${slug}`, {
      next: { revalidate: 30 },
      headers: { "x-publishable-api-key": PUBLISHABLE_KEY },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.auction_block || null
  } catch {
    return null
  }
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: "Laufend", color: "bg-green-900 text-green-300" },
  scheduled: { label: "Geplant", color: "bg-blue-900 text-blue-300" },
  preview: { label: "Vorschau", color: "bg-orange-900 text-orange-300" },
  ended: { label: "Beendet", color: "bg-zinc-800 text-zinc-400" },
}

const FORMAT_COLORS: Record<string, string> = {
  LP: "bg-amber-900/50 text-amber-300",
  CD: "bg-sky-900/50 text-sky-300",
  CASSETTE: "bg-purple-900/50 text-purple-300",
  "7\"": "bg-rose-900/50 text-rose-300",
  "10\"": "bg-rose-900/50 text-rose-300",
  "12\"": "bg-amber-900/50 text-amber-300",
  BOOK: "bg-emerald-900/50 text-emerald-300",
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
  const startDate = new Date(block.start_time)
  const endDate = new Date(block.end_time)

  const priceRange = block.items.length > 0
    ? {
        min: Math.min(...block.items.map((i) => i.start_price)),
        max: Math.max(...block.items.map((i) => i.start_price)),
      }
    : null

  return (
    <main>
      {/* Hero */}
      <section className="relative">
        {block.header_image ? (
          <div className="relative h-64 md:h-80">
            <img
              src={block.header_image}
              alt={block.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent" />
          </div>
        ) : (
          <div className="h-32 bg-gradient-to-b from-zinc-900 to-zinc-950" />
        )}
        <div className="relative mx-auto max-w-6xl px-6 -mt-20">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
            <span className="text-xs text-zinc-500 uppercase tracking-wider">
              {block.block_type}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold">{block.title}</h1>
          {block.subtitle && (
            <p className="text-xl text-zinc-400 mt-1">{block.subtitle}</p>
          )}
          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-zinc-400">
            <span>
              {startDate.toLocaleDateString("de-DE", { day: "numeric", month: "long" })}
              {" – "}
              {endDate.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}
            </span>
            <span>{block.items.length} Lots</span>
            {priceRange && (
              <span>
                ab &euro;{priceRange.min.toFixed(0)}
                {priceRange.min !== priceRange.max && ` – &euro;${priceRange.max.toFixed(0)}`}
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-zinc-500 mb-8">
          <Link href="/auctions" className="hover:text-zinc-300">
            Auktionen
          </Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-300">{block.title}</span>
        </nav>

        {/* Editorial Content */}
        {(block.long_description || block.video_url || block.audio_url) && (
          <section className="mb-10 max-w-3xl">
            {block.long_description && (
              <div className="prose prose-invert prose-zinc max-w-none">
                {block.long_description.split("\n").map((p, i) =>
                  p.trim() ? <p key={i}>{p}</p> : null
                )}
              </div>
            )}
            {block.video_url && (
              <div className="mt-6 aspect-video rounded-lg overflow-hidden bg-zinc-900">
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
          <h2 className="text-xl font-semibold mb-6">
            Lots ({block.items.length})
          </h2>

          {block.items.length === 0 ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-12 text-center">
              <p className="text-zinc-500">Noch keine Lots in diesem Block.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {block.items.map((item) => (
                <Link
                  key={item.id}
                  href={`/auctions/${block.slug}/${item.id}`}
                  className="group rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden hover:border-zinc-600 transition-colors"
                >
                  {/* Cover */}
                  <div className="aspect-square bg-zinc-800 overflow-hidden">
                    {item.release?.coverImage ? (
                      <img
                        src={item.release.coverImage}
                        alt={item.release?.title || ""}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                        Kein Bild
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      {item.lot_number && (
                        <span className="text-[10px] text-zinc-500 font-mono">
                          Lot {item.lot_number}
                        </span>
                      )}
                      {item.release?.format && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            FORMAT_COLORS[item.release.format] || "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {item.release.format}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 truncate">
                      {item.release?.artist_name || "Unknown Artist"}
                    </p>
                    <p className="text-sm font-medium truncate">
                      {item.release?.title || item.release_id}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm font-semibold text-white">
                        &euro;{item.start_price.toFixed(0)}
                      </span>
                      {item.release?.year && (
                        <span className="text-[10px] text-zinc-500">
                          {item.release.year}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
