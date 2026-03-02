import Link from "next/link"

const MEDUSA_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

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
  header_image: string | null
  items_count: number
}

async function getBlocks(): Promise<AuctionBlock[]> {
  try {
    const res = await fetch(`${MEDUSA_URL}/store/auction-blocks`, {
      next: { revalidate: 60 },
      headers: { "x-publishable-api-key": PUBLISHABLE_KEY },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.auction_blocks || []
  } catch {
    return []
  }
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Laufend", color: "bg-green-900 text-green-300" },
  scheduled: { label: "Geplant", color: "bg-blue-900 text-blue-300" },
  preview: { label: "Vorschau", color: "bg-orange-900 text-orange-300" },
}

export default async function Home() {
  const blocks = await getBlocks()
  const active = blocks.filter((b) => b.status === "active")
  const upcoming = blocks.filter((b) => ["scheduled", "preview"].includes(b.status))

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/50 to-zinc-950" />
        <div className="relative flex flex-col items-center justify-center py-24 md:py-32 px-6 text-center">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            VOD<span className="text-zinc-500">Auctions</span>
          </h1>
          <p className="mt-4 max-w-lg text-lg text-zinc-400">
            Kuratierte Auktionen für seltene Industrial, Experimental &amp; Electronic Music Tonträger.
          </p>
          <div className="flex gap-4 mt-8">
            <Link
              href="/auctions"
              className="px-6 py-3 rounded-lg bg-white text-zinc-950 font-medium text-sm hover:bg-zinc-200 transition-colors"
            >
              Alle Auktionen
            </Link>
          </div>
        </div>
      </section>

      {/* Active Auctions */}
      {active.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-16">
          <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Laufende Auktionen
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {active.map((block) => (
              <BlockCard key={block.id} block={block} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-16">
          <h2 className="text-2xl font-semibold mb-6">Demnächst</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {upcoming.map((block) => (
              <BlockCard key={block.id} block={block} />
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {blocks.length === 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-12 text-center">
            <p className="text-zinc-500">
              Aktuell keine aktiven Auktionen.
            </p>
            <p className="text-zinc-600 mt-2 text-sm">
              Schaue bald wieder vorbei — neue Blöcke werden regelmäßig veröffentlicht.
            </p>
          </div>
        </section>
      )}
    </main>
  )
}

function BlockCard({ block }: { block: AuctionBlock }) {
  const status = STATUS_LABELS[block.status]
  return (
    <Link
      href={`/auctions/${block.slug}`}
      className="group rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden hover:border-zinc-600 transition-colors"
    >
      {block.header_image ? (
        <div className="aspect-video overflow-hidden">
          <img
            src={block.header_image}
            alt={block.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        </div>
      ) : (
        <div className="aspect-video bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
          <span className="text-4xl text-zinc-700">&#9835;</span>
        </div>
      )}
      <div className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs uppercase tracking-wider text-zinc-500">
            {block.block_type}
          </span>
          {status && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${status.color}`}>
              {status.label}
            </span>
          )}
        </div>
        <h3 className="text-lg font-semibold">{block.title}</h3>
        {block.subtitle && (
          <p className="text-zinc-400 text-sm mt-1">{block.subtitle}</p>
        )}
        {block.short_description && (
          <p className="text-zinc-500 text-sm mt-2 line-clamp-2">
            {block.short_description}
          </p>
        )}
        <div className="flex items-center justify-between mt-4 text-xs text-zinc-500">
          <span>{block.items_count} Lots</span>
          <span>
            {new Date(block.start_time).toLocaleDateString("de-DE", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      </div>
    </Link>
  )
}
