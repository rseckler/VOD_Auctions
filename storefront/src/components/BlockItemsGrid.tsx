"use client"

import { useState, useMemo } from "react"
import Link from "next/link"

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

const FORMAT_COLORS: Record<string, string> = {
  LP: "bg-amber-900/50 text-amber-300",
  CD: "bg-sky-900/50 text-sky-300",
  CASSETTE: "bg-purple-900/50 text-purple-300",
  "7\"": "bg-rose-900/50 text-rose-300",
  "10\"": "bg-rose-900/50 text-rose-300",
  "12\"": "bg-amber-900/50 text-amber-300",
  BOOK: "bg-emerald-900/50 text-emerald-300",
}

type SortOption = "lot" | "price_asc" | "price_desc" | "artist"

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "lot", label: "Lot-Nr." },
  { value: "price_asc", label: "Preis aufsteigend" },
  { value: "price_desc", label: "Preis absteigend" },
  { value: "artist", label: "Artist A-Z" },
]

export function BlockItemsGrid({
  items,
  blockSlug,
}: {
  items: BlockItem[]
  blockSlug: string
}) {
  const [sort, setSort] = useState<SortOption>("lot")
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    let result = [...items]

    // Filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (i) =>
          i.release?.title?.toLowerCase().includes(q) ||
          i.release?.artist_name?.toLowerCase().includes(q) ||
          i.release?.catalogNumber?.toLowerCase().includes(q)
      )
    }

    // Sort
    result.sort((a, b) => {
      switch (sort) {
        case "lot":
          return (a.lot_number || 0) - (b.lot_number || 0)
        case "price_asc":
          return a.start_price - b.start_price
        case "price_desc":
          return b.start_price - a.start_price
        case "artist":
          return (a.release?.artist_name || "").localeCompare(
            b.release?.artist_name || ""
          )
        default:
          return 0
      }
    })

    return result
  }, [items, sort, search])

  return (
    <div>
      {/* Controls */}
      {items.length > 3 && (
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="text"
            placeholder="Suche nach Artist, Titel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white focus:border-zinc-500 focus:outline-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Results count when filtering */}
      {search.trim() && (
        <p className="text-sm text-zinc-500 mb-4">
          {filtered.length} von {items.length} Lots
        </p>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-12 text-center">
          <p className="text-zinc-500">
            {search.trim()
              ? "Keine Lots gefunden."
              : "Noch keine Lots in diesem Block."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((item) => (
            <Link
              key={item.id}
              href={`/auctions/${blockSlug}/${item.id}`}
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
                        FORMAT_COLORS[item.release.format] ||
                        "bg-zinc-800 text-zinc-400"
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
                    &euro;{(item.current_price || item.start_price).toFixed(0)}
                  </span>
                  {item.release?.year && (
                    <span className="text-[10px] text-zinc-500">
                      {item.release.year}
                    </span>
                  )}
                </div>
                {item.bid_count > 0 && (
                  <p className="text-[10px] text-zinc-500 mt-1">
                    {item.bid_count} Gebot{item.bid_count !== 1 ? "e" : ""}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
