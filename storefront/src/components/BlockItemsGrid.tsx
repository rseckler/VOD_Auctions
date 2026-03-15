"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Disc3, Clock } from "lucide-react"
import { staggerContainer, staggerItem } from "@/lib/motion"
import type { BlockItem } from "@/types"

function formatTimeRemaining(endTime: string): string | null {
  const diff = new Date(endTime).getTime() - Date.now()
  if (diff <= 0) return null
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 0) return `${days}d ${hours}h left`
  if (hours > 0) return `${hours}h ${minutes}m left`
  return `${minutes}m left`
}

const FORMAT_COLORS: Record<string, string> = {
  LP: "text-format-vinyl",
  CD: "text-format-cd",
  CASSETTE: "text-format-cassette",
  "7\"": "text-format-vinyl",
  "10\"": "text-format-vinyl",
  "12\"": "text-format-vinyl",
}

type SortOption = "lot" | "price_asc" | "price_desc" | "artist"

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "lot", label: "Lot No." },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
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

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (i) =>
          i.release?.title?.toLowerCase().includes(q) ||
          i.release?.artist_name?.toLowerCase().includes(q) ||
          i.release?.catalogNumber?.toLowerCase().includes(q)
      )
    }

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
      {items.length > 3 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-[rgba(232,224,212,0.06)]">
          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
            <input
              type="text"
              placeholder={`Search in ${items.length} lots...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[rgba(232,224,212,0.04)] border border-[rgba(232,224,212,0.08)] rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-[rgba(212,165,74,0.3)] transition-colors"
            />
          </div>

          {/* Sort Pills */}
          <div className="flex gap-2">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSort(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  sort === opt.value
                    ? "bg-primary text-[#1c1915]"
                    : "text-muted-foreground border border-[rgba(232,224,212,0.08)] hover:border-[rgba(232,224,212,0.15)] hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {search.trim() && (
        <p className="text-sm text-muted-foreground mb-4">
          {filtered.length} of {items.length} lots
        </p>
      )}

      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-[rgba(232,224,212,0.08)] bg-[rgba(232,224,212,0.02)] p-16 text-center"
          >
            <Disc3 className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
            <p className="text-muted-foreground">
              {search.trim()
                ? "No lots found."
                : "No lots in this block yet."}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key={`${sort}-${search}`}
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4"
          >
            {filtered.map((item) => (
              <motion.div key={item.id} variants={staggerItem}>
                <Link href={`/auctions/${blockSlug}/${item.id}`}>
                  <div className="group overflow-hidden rounded-xl bg-[rgba(232,224,212,0.03)] border border-[rgba(232,224,212,0.06)] hover:border-[rgba(212,165,74,0.3)] transition-all duration-300 hover:-translate-y-0.5">
                    {/* Image */}
                    <div className="aspect-square bg-[#2a2520] overflow-hidden relative">
                      {item.release?.coverImage ? (
                        <Image
                          src={item.release.coverImage}
                          alt={item.release?.title || ""}
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Disc3 className="h-8 w-8 text-muted-foreground/10" />
                        </div>
                      )}
                      {/* Lot overlay */}
                      {item.lot_number && (
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-[rgba(28,25,21,0.85)] backdrop-blur-sm text-[11px] font-semibold text-primary">
                          #{String(item.lot_number).padStart(2, "0")}
                        </span>
                      )}
                      {/* Format overlay */}
                      {item.release?.format && (
                        <span className={`absolute top-2 right-2 px-2 py-0.5 rounded bg-[rgba(28,25,21,0.85)] backdrop-blur-sm text-[10px] uppercase tracking-[1px] font-medium ${FORMAT_COLORS[item.release.format] || "text-muted-foreground"}`}>
                          {item.release.format}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <p className="text-xs text-muted-foreground/60 truncate">
                        {item.release?.artist_name || "Unknown Artist"}
                      </p>
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {item.release?.title || item.release_id}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-serif text-lg font-bold text-primary">
                          &euro;{(item.current_price || item.start_price).toFixed(0)}
                        </span>
                        {item.release?.year && (
                          <span className="text-[10px] text-muted-foreground/60">
                            {item.release.year}
                          </span>
                        )}
                      </div>
                      {item.bid_count > 0 && (
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          {item.bid_count} {item.bid_count !== 1 ? "bids" : "bid"}
                        </p>
                      )}
                      {item.lot_end_time && (() => {
                        const remaining = formatTimeRemaining(item.lot_end_time)
                        return remaining ? (
                          <p className="text-[10px] text-muted-foreground/50 mt-0.5 flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {remaining}
                          </p>
                        ) : null
                      })()}
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
