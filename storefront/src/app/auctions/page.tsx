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

async function getAllBlocks(): Promise<AuctionBlock[]> {
  try {
    const res = await fetch(`${MEDUSA_URL}/store/auction-blocks?status=all`, {
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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function formatTimeRange(start: string, end: string) {
  const s = new Date(start)
  const e = new Date(end)
  const startDate = s.toLocaleDateString("de-DE", { day: "numeric", month: "short" })
  const endDate = e.toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" })
  return `${startDate} – ${endDate}`
}

function daysUntil(dateStr: string): string {
  const now = new Date()
  const target = new Date(dateStr)
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diff <= 0) return ""
  if (diff === 1) return "Startet morgen"
  return `Startet in ${diff} Tagen`
}

function timeRemaining(endStr: string): string {
  const now = new Date()
  const end = new Date(endStr)
  const diff = end.getTime() - now.getTime()
  if (diff <= 0) return "Beendet"
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `Noch ${days}d ${hours}h`
  return `Noch ${hours}h`
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: "Laufend", color: "bg-green-900 text-green-300" },
  scheduled: { label: "Geplant", color: "bg-blue-900 text-blue-300" },
  preview: { label: "Vorschau", color: "bg-orange-900 text-orange-300" },
  ended: { label: "Beendet", color: "bg-zinc-800 text-zinc-400" },
}

const TYPE_LABELS: Record<string, string> = {
  theme: "Themen-Block",
  highlight: "Highlight",
  clearance: "Clearance",
  flash: "Flash",
}

function BlockCard({ block }: { block: AuctionBlock }) {
  const statusConfig = STATUS_CONFIG[block.status] || STATUS_CONFIG.ended

  return (
    <Link
      href={`/auctions/${block.slug}`}
      className="group flex flex-col sm:flex-row gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-600 transition-colors"
    >
      {block.header_image && (
        <div className="sm:w-48 sm:h-32 flex-shrink-0 overflow-hidden rounded">
          <img
            src={block.header_image}
            alt={block.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig.color}`}>
            {statusConfig.label}
          </span>
          <span className="text-xs text-zinc-500">
            {TYPE_LABELS[block.block_type] || block.block_type}
          </span>
        </div>
        <h3 className="text-lg font-semibold truncate">{block.title}</h3>
        {block.subtitle && (
          <p className="text-zinc-400 text-sm">{block.subtitle}</p>
        )}
        {block.short_description && (
          <p className="text-zinc-500 text-sm mt-1 line-clamp-2">
            {block.short_description}
          </p>
        )}
        <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
          <span>{block.items_count} Lots</span>
          <span>{formatTimeRange(block.start_time, block.end_time)}</span>
          {block.status === "scheduled" && (
            <span className="text-blue-400">{daysUntil(block.start_time)}</span>
          )}
          {block.status === "active" && (
            <span className="text-green-400">{timeRemaining(block.end_time)}</span>
          )}
        </div>
      </div>
    </Link>
  )
}

export default async function AuctionsPage() {
  const blocks = await getAllBlocks()

  const active = blocks.filter((b) => b.status === "active")
  const upcoming = blocks.filter((b) => ["scheduled", "preview"].includes(b.status))
  const ended = blocks.filter((b) => b.status === "ended")

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Auktionen</h1>
      <p className="text-zinc-400 mb-10">
        Alle laufenden, geplanten und vergangenen Auktionsblöcke.
      </p>

      {active.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Laufend
          </h2>
          <div className="flex flex-col gap-4">
            {active.map((b) => (
              <BlockCard key={b.id} block={b} />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Demnächst
          </h2>
          <div className="flex flex-col gap-4">
            {upcoming.map((b) => (
              <BlockCard key={b.id} block={b} />
            ))}
          </div>
        </section>
      )}

      {ended.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-zinc-600" />
            Beendet
          </h2>
          <div className="flex flex-col gap-4">
            {ended.map((b) => (
              <BlockCard key={b.id} block={b} />
            ))}
          </div>
        </section>
      )}

      {blocks.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-12 text-center">
          <p className="text-zinc-500">Aktuell keine Auktionen.</p>
        </div>
      )}
    </main>
  )
}
