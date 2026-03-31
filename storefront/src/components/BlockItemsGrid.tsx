"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Disc3, Clock, Gavel, Eye } from "lucide-react"
import { staggerContainer, staggerItem } from "@/lib/motion"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { getToken } from "@/lib/auth"
import { SaveForLaterButton } from "@/components/SaveForLaterButton"
import type { BlockItem } from "@/types"

type TimeUrgency = {
  text: string
  level: "critical" | "urgent" | "normal" | "ended"
}

function getTimeUrgency(endTime: string): TimeUrgency {
  const diff = new Date(endTime).getTime() - Date.now()
  if (diff <= 0) return { text: "Ended", level: "ended" }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  if (diff < 5 * 60 * 1000) {
    // <5 min: critical
    const text = diff < 60 * 1000 ? `${seconds}s left` : `${minutes}m ${seconds}s left`
    return { text, level: "critical" }
  }
  if (diff < 60 * 60 * 1000) {
    // <60 min: urgent — show seconds
    return { text: `${minutes}m ${seconds}s left`, level: "urgent" }
  }

  // normal — no seconds
  if (days > 0) return { text: `${days}d ${hours}h left`, level: "normal" }
  return { text: `${hours}h ${minutes}m left`, level: "normal" }
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
  previewMode = false,
}: {
  items: BlockItem[]
  blockSlug: string
  previewMode?: boolean
}) {
  const [sort, setSort] = useState<SortOption>("lot")
  const [search, setSearch] = useState("")
  const [userBidItemIds, setUserBidItemIds] = useState<Set<string>>(new Set())
  const [userWinningItemIds, setUserWinningItemIds] = useState<Set<string>>(new Set())
  // Tick every second so urgency indicators update in real time
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Fetch user's bids to show indicator on cards (not needed in preview mode)
  useEffect(() => {
    if (previewMode) return
    const token = getToken()
    if (!token) return
    fetch(`${MEDUSA_URL}/store/account/bids`, {
      headers: {
        "x-publishable-api-key": PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.bids) return
        const bidIds = new Set<string>()
        const winningIds = new Set<string>()
        data.bids.forEach((b: any) => {
          if (b.item?.id) {
            bidIds.add(b.item.id)
            if (b.is_winning) winningIds.add(b.item.id)
          }
        })
        setUserBidItemIds(bidIds)
        setUserWinningItemIds(winningIds)
      })
      .catch(() => {})
  }, [previewMode])

  const filtered = useMemo(() => {
    let result = [...items]

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (i) =>
          i.release?.title?.toLowerCase().includes(q) ||
          i.release?.artist_name?.toLowerCase().includes(q) ||
          i.release?.press_orga_name?.toLowerCase().includes(q) ||
          i.release?.label_name?.toLowerCase().includes(q) ||
          i.release?.catalogNumber?.toLowerCase().includes(q)
      )
    }

    result.sort((a, b) => {
      switch (sort) {
        case "lot":
          return (a.lot_number || 0) - (b.lot_number || 0)
        case "price_asc":
          return (Number(a.current_price) || Number(a.start_price)) - (Number(b.current_price) || Number(b.start_price))
        case "price_desc":
          return (Number(b.current_price) || Number(b.start_price)) - (Number(a.current_price) || Number(a.start_price))
        case "artist": {
          const getCtx = (item: BlockItem) => {
            const r = item.release
            if (!r) return ""
            const cat = r.product_category
            if (cat === "press_literature") return r.press_orga_name || ""
            if (cat === "label_literature") return r.label_name || ""
            return r.artist_name || ""
          }
          return getCtx(a).localeCompare(getCtx(b))
        }
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
              <motion.div key={item.id} variants={staggerItem} className="relative hover:z-10">
                <Link href={`/auctions/${blockSlug}/${item.id}`}>
                  {previewMode ? (
                    /* Preview mode card — amber accents, starting bid only, save to watchlist */
                    <div className="group overflow-hidden rounded-xl bg-[rgba(232,224,212,0.03)] border border-amber-500/20 hover:border-amber-500/40 opacity-90 transition-all duration-300 hover:-translate-y-0.5">
                      {/* Image */}
                      <div className="aspect-square bg-[#2a2520] overflow-hidden relative">
                        {item.release?.coverImage ? (
                          <Image
                            src={item.release.coverImage}
                            alt={item.release?.title || `Auction lot ${item.lot_number || ""}`}
                            fill
                            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Disc3 className="h-8 w-8 text-muted-foreground/10" />
                          </div>
                        )}
                        {/* Lot overlay — amber in preview mode */}
                        {item.lot_number && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-[rgba(28,25,21,0.85)] backdrop-blur-sm text-[11px] font-semibold text-amber-400">
                            #{String(item.lot_number).padStart(2, "0")}
                          </span>
                        )}
                        {/* Watchlist button — stop link propagation */}
                        <div
                          className="absolute bottom-2 right-2"
                          onClick={(e) => e.preventDefault()}
                        >
                          <SaveForLaterButton releaseId={item.release?.id || item.release_id} />
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-3">
                        {item.release?.format && (
                          <span className={`inline-block text-[9px] uppercase tracking-[1px] font-medium mb-1 ${FORMAT_COLORS[item.release.format] || "text-muted-foreground"}`}>
                            {item.release.format}
                          </span>
                        )}
                        <p className="text-xs text-muted-foreground/60 truncate">
                          {item.release?.product_category === "release" || item.release?.product_category === "band_literature"
  ? (item.release.artist_name || "")
  : item.release?.product_category === "press_literature"
    ? (item.release?.press_orga_name || "")
    : (item.release?.label_name || "")}
                        </p>
                        <p className="text-sm font-medium truncate group-hover:text-amber-400 transition-colors">
                          {item.release?.title || item.release_id}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <div>
                            <p className="text-[9px] text-muted-foreground/70 uppercase tracking-[0.5px]">Starting bid</p>
                            <span className="font-serif text-lg font-bold text-amber-400">
                              &euro;{Number(item.start_price).toFixed(0)}
                            </span>
                          </div>
                          {item.release?.year && (
                            <span className="text-[10px] text-muted-foreground/60">
                              {item.release.year}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Normal (active/ended) card */
                    (() => {
                      const urgency = item.lot_end_time ? getTimeUrgency(item.lot_end_time) : null
                      const isCritical = urgency?.level === "critical"
                      return (
                    <div className={`group overflow-hidden rounded-xl bg-[rgba(232,224,212,0.03)] border transition-all duration-300 hover:-translate-y-0.5 ${
                      isCritical
                        ? "border-red-500/40 hover:border-red-500/60"
                        : userWinningItemIds.has(item.id)
                        ? "border-green-500/40 hover:border-green-500/60"
                        : userBidItemIds.has(item.id)
                        ? "border-primary/40 hover:border-primary/60"
                        : "border-[rgba(232,224,212,0.06)] hover:border-[rgba(212,165,74,0.3)]"
                    }`}>
                      {/* Image */}
                      <div className="aspect-square bg-[#2a2520] overflow-hidden relative">
                        {item.release?.coverImage ? (
                          <Image
                            src={item.release.coverImage}
                            alt={item.release?.title || `Auction lot ${item.lot_number || ""}`}
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
                        {/* Bid status indicator */}
                        {userWinningItemIds.has(item.id) ? (
                          <span className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded bg-[rgba(34,197,94,0.9)] backdrop-blur-sm text-xs font-semibold text-[#1c1915] uppercase tracking-wide shadow-lg shadow-green-500/20 ring-2 ring-green-400/50 animate-pulse">
                            <Gavel className="h-2.5 w-2.5" />
                            Highest Bid
                          </span>
                        ) : userBidItemIds.has(item.id) ? (
                          <span className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded bg-[rgba(212,165,74,0.9)] backdrop-blur-sm text-xs font-semibold text-[#1c1915] uppercase tracking-wide shadow-lg shadow-primary/20 ring-2 ring-primary/50">
                            <Gavel className="h-2.5 w-2.5" />
                            Your Bid
                          </span>
                        ) : null}
                      </div>

                      {/* Info */}
                      <div className="p-3">
                        {item.release?.format && (
                          <span className={`inline-block text-[9px] uppercase tracking-[1px] font-medium mb-1 ${FORMAT_COLORS[item.release.format] || "text-muted-foreground"}`}>
                            {item.release.format}
                          </span>
                        )}
                        <p className="text-xs text-muted-foreground/60 truncate">
                          {item.release?.product_category === "release" || item.release?.product_category === "band_literature"
  ? (item.release.artist_name || "")
  : item.release?.product_category === "press_literature"
    ? (item.release?.press_orga_name || "")
    : (item.release?.label_name || "")}
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
                          const { text, level } = getTimeUrgency(item.lot_end_time)
                          if (level === "ended") return null
                          return (
                            <p className={`text-[10px] mt-0.5 flex items-center gap-1 ${
                              level === "critical"
                                ? "text-red-400 font-semibold animate-pulse"
                                : level === "urgent"
                                ? "text-amber-400"
                                : "text-muted-foreground/50"
                            }`}>
                              {level === "critical" && (
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                              )}
                              <Clock className="h-2.5 w-2.5 flex-shrink-0" />
                              {text}
                            </p>
                          )
                        })()}
                        {item.view_count != null && item.view_count > 10 && (
                          <p className="text-[9px] text-muted-foreground/70 mt-0.5 flex items-center gap-0.5">
                            <Eye className="h-2 w-2 flex-shrink-0" />
                            {item.view_count}
                          </p>
                        )}
                      </div>
                    </div>
                      )
                    })()
                  )}
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
