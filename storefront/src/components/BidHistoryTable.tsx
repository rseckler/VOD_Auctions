"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Gavel, ChevronDown, ChevronUp } from "lucide-react"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"

type BidRecord = {
  id: string
  amount: number
  is_winning: boolean
  user_hint?: string
  user_id?: string
  created_at: string
}

export interface BidHistoryTableProps {
  blockSlug: string
  itemId: string
  itemStatus: string
  blockStatus: string
  initialBidCount?: number
}

/** Returns relative time string: "just now", "5m ago", "2h ago", "yesterday", "3 days ago" */
function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffSec < 60) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay === 1) return "yesterday"
  return `${diffDay} days ago`
}

const INITIAL_VISIBLE = 20

export function BidHistoryTable({
  blockSlug,
  itemId,
  blockStatus,
  initialBidCount = 0,
}: BidHistoryTableProps) {
  const [bids, setBids] = useState<BidRecord[]>([])
  const [count, setCount] = useState(initialBidCount)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const prevIdsRef = useRef<Set<string>>(new Set())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isActive = blockStatus === "active"

  const fetchBids = useCallback(async () => {
    try {
      const res = await fetch(
        `${MEDUSA_URL}/store/auction-blocks/${blockSlug}/items/${itemId}/bids`,
        { headers: { "x-publishable-api-key": PUBLISHABLE_KEY } }
      )
      if (!res.ok) return
      const data = await res.json()
      const fetched: BidRecord[] = data.bids || []

      // Detect new bid IDs for flash animation
      const incoming = new Set(fetched.map((b) => b.id))
      const fresh = new Set<string>()
      for (const id of incoming) {
        if (!prevIdsRef.current.has(id) && prevIdsRef.current.size > 0) {
          fresh.add(id)
        }
      }
      prevIdsRef.current = incoming

      if (fresh.size > 0) {
        setNewIds(fresh)
        setTimeout(() => setNewIds(new Set()), 1200)
      }

      setBids(fetched)
      setCount(data.count ?? fetched.length)
    } catch {
      // ignore fetch errors
    } finally {
      setLoading(false)
    }
  }, [blockSlug, itemId])

  // Initial load
  useEffect(() => {
    fetchBids()
  }, [fetchBids])

  // Poll every 30s while active
  useEffect(() => {
    if (!isActive) return
    intervalRef.current = setInterval(fetchBids, 30_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isActive, fetchBids])

  // Assign stable sequential "Bidder #N" labels based on first appearance order
  const bidderMap = useRef<Map<string, number>>(new Map())
  let nextBidderNum = bidderMap.current.size + 1

  // Rebuild from scratch on each render (bids array may reorder)
  // Walk chronologically (oldest first) to assign numbers
  const sortedForLabeling = [...bids].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  const freshBidderMap = new Map<string, number>()
  let counter = 1
  for (const bid of sortedForLabeling) {
    const key = bid.user_hint || bid.user_id || bid.id
    if (!freshBidderMap.has(key)) {
      freshBidderMap.set(key, counter++)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  bidderMap.current = freshBidderMap
  nextBidderNum = counter

  function getBidderLabel(bid: BidRecord): string {
    const key = bid.user_hint || bid.user_id || bid.id
    const n = bidderMap.current.get(key) ?? 0
    return `Bidder #${n}`
  }

  const visibleBids = expanded ? bids : bids.slice(0, INITIAL_VISIBLE)
  const hasMore = bids.length > INITIAL_VISIBLE

  if (loading) {
    return (
      <div className="mt-6 bg-[rgba(232,224,212,0.03)] border border-[rgba(232,224,212,0.06)] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Gavel className="h-4 w-4 text-[#d4a54a]" />
          <span className="text-sm font-semibold text-[#d4a54a]">Bid History</span>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-9 rounded-lg bg-[rgba(232,224,212,0.05)] animate-pulse"
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 bg-[rgba(232,224,212,0.03)] border border-[rgba(232,224,212,0.06)] rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gavel className="h-4 w-4 text-[#d4a54a]" />
          <span className="text-sm font-semibold text-[#d4a54a]">Bid History</span>
        </div>
        {count > 0 && (
          <span className="text-xs text-muted-foreground bg-[rgba(232,224,212,0.08)] px-2 py-0.5 rounded-full">
            {count} {count === 1 ? "bid" : "bids"}
          </span>
        )}
      </div>

      {/* Column headers */}
      {bids.length > 0 && (
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground/50 px-3 mb-1.5">
          <span>Bidder</span>
          <div className="flex items-center gap-8">
            <span>Amount</span>
            <span className="w-16 text-right">Time</span>
          </div>
        </div>
      )}

      {/* Bid rows */}
      {bids.length === 0 ? (
        <p className="text-sm text-muted-foreground/60 text-center py-6">
          No bids yet. Be the first to bid!
        </p>
      ) : (
        <div className="space-y-1">
          <AnimatePresence initial={false}>
            {visibleBids.map((bid, index) => {
              const isWinning = bid.is_winning
              const isNew = newIds.has(bid.id)

              return (
                <motion.div
                  key={bid.id}
                  initial={isNew ? { opacity: 0, y: -6 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={[
                    "relative flex items-center justify-between text-sm py-2 px-3 rounded-lg transition-colors",
                    isWinning
                      ? "bg-green-500/[0.08] border border-green-500/20"
                      : "bg-[rgba(232,224,212,0.04)] border border-transparent",
                    isNew ? "ring-1 ring-[#d4a54a]/40" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {/* Rank number */}
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground/30 w-4 text-right select-none">
                    {index + 1}
                  </span>

                  {/* Bidder label */}
                  <span className="font-mono text-xs text-muted-foreground/80 pl-6">
                    {getBidderLabel(bid)}
                  </span>

                  {/* Right side: amount + status badge + time */}
                  <div className="flex items-center gap-3">
                    <span className={`font-mono font-semibold text-sm ${isWinning ? "text-green-400" : "text-foreground"}`}>
                      &euro;{Number(bid.amount).toFixed(2)}
                    </span>

                    {isWinning && (
                      <span className="hidden sm:inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 border border-green-500/25 whitespace-nowrap">
                        Current
                      </span>
                    )}

                    <span className="text-[11px] text-muted-foreground/50 w-16 text-right tabular-nums">
                      {relativeTime(bid.created_at)}
                    </span>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Expand / collapse */}
      {hasMore && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors py-1.5"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              View all {bids.length} bids
            </>
          )}
        </button>
      )}
    </div>
  )
}
