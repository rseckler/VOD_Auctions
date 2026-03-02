"use client"

import { useState } from "react"
import Link from "next/link"

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

type FilterTab = "all" | "active" | "upcoming" | "ended"

const TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "active", label: "Laufend" },
  { value: "upcoming", label: "Demnächst" },
  { value: "ended", label: "Beendet" },
]

function formatTimeRange(start: string, end: string) {
  const s = new Date(start)
  const e = new Date(end)
  const startDate = s.toLocaleDateString("de-DE", { day: "numeric", month: "short" })
  const endDate = e.toLocaleDateString("de-DE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  return `${startDate} – ${endDate}`
}

function timeRemaining(endStr: string): string {
  const diff = new Date(endStr).getTime() - Date.now()
  if (diff <= 0) return "Beendet"
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return `Noch ${days}d ${hours}h`
  return `Noch ${hours}h`
}

function daysUntil(dateStr: string): string {
  const diff = Math.ceil(
    (new Date(dateStr).getTime() - Date.now()) / 86400000
  )
  if (diff <= 0) return ""
  if (diff === 1) return "Startet morgen"
  return `Startet in ${diff} Tagen`
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
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${statusConfig.color}`}
          >
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
            <span className="text-blue-400">
              {daysUntil(block.start_time)}
            </span>
          )}
          {block.status === "active" && (
            <span className="text-green-400">
              {timeRemaining(block.end_time)}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

export function AuctionListFilter({ blocks }: { blocks: AuctionBlock[] }) {
  const [tab, setTab] = useState<FilterTab>("all")

  const filtered = blocks.filter((b) => {
    switch (tab) {
      case "active":
        return b.status === "active"
      case "upcoming":
        return ["scheduled", "preview"].includes(b.status)
      case "ended":
        return b.status === "ended"
      default:
        return true
    }
  })

  // Count per tab
  const counts = {
    all: blocks.length,
    active: blocks.filter((b) => b.status === "active").length,
    upcoming: blocks.filter((b) =>
      ["scheduled", "preview"].includes(b.status)
    ).length,
    ended: blocks.filter((b) => b.status === "ended").length,
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
              tab === t.value
                ? "bg-zinc-800 text-white font-medium"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            {t.label}
            {counts[t.value] > 0 && (
              <span className="ml-1.5 text-xs text-zinc-500">
                {counts[t.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-12 text-center">
          <p className="text-zinc-500">Keine Auktionen in dieser Kategorie.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((b) => (
            <BlockCard key={b.id} block={b} />
          ))}
        </div>
      )}
    </div>
  )
}
