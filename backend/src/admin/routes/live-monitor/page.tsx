import { ChartBar } from "@medusajs/icons"
import { useAdminNav } from "../../components/admin-nav"
import { Container, Heading, Text, Badge } from "@medusajs/ui"
import { useEffect, useState, useRef } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

type WinningBid = {
  amount: number
  user_hint: string
  placed_at: string
}

type LiveItem = {
  id: string
  lot_number: number | null
  status: string
  lot_end_time: string | null
  start_price: number
  current_price: number | null
  bid_count: number
  release_title: string | null
  release_cover: string | null
  winning_bid: WinningBid | null
  recent_bids: { amount: number; user_hint: string; placed_at: string }[]
}

type LiveBlockData = {
  block_id: string
  block_title?: string
  block_status: string
  end_time: string | null
  items: LiveItem[]
  total_bids: number
  active_items: number
  fetched_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCountdown(endTime: string | null): string {
  if (!endTime) return "—"
  const diff = new Date(endTime).getTime() - Date.now()
  if (diff <= 0) return "Ended"
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}

function formatLot(n: number | null): string {
  if (n == null) return "—"
  return `#${String(n).padStart(2, "0")}`
}

function formatPrice(p: number | null | undefined): string {
  if (p == null) return "—"
  return `€${Number(p).toFixed(2)}`
}

// ── Countdown component (ticks every second) ──────────────────────────────────

function Countdown({ endTime }: { endTime: string | null }) {
  const [label, setLabel] = useState(() => formatCountdown(endTime))
  useEffect(() => {
    if (!endTime) return
    const id = setInterval(() => setLabel(formatCountdown(endTime)), 1000)
    return () => clearInterval(id)
  }, [endTime])
  return <span className="font-mono text-xs">{label}</span>
}

// ── Lot card ──────────────────────────────────────────────────────────────────

function LotCard({ item }: { item: LiveItem }) {
  const noBids = item.bid_count === 0
  const healthy = item.bid_count >= 3

  let borderClass = "border border-ui-border-base"
  if (noBids) borderClass = "border-2 border-red-500/70"
  else if (healthy) borderClass = "border-2 border-green-500/50"

  return (
    <div className={`rounded-lg p-3 bg-ui-bg-base ${borderClass} flex flex-col gap-2`}>
      {/* Header row */}
      <div className="flex items-start gap-2">
        {/* Cover */}
        <div className="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-ui-bg-subtle">
          {item.release_cover ? (
            <img
              src={item.release_cover}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-ui-fg-muted text-xs">
              ✕
            </div>
          )}
        </div>

        {/* Title + lot */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-xs font-mono text-ui-fg-muted">{formatLot(item.lot_number)}</span>
            {noBids && (
              <Badge color="red" className="text-[10px] py-0 px-1">No Bids</Badge>
            )}
          </div>
          <Text className="text-xs font-medium leading-tight truncate" title={item.release_title || ""}>
            {item.release_title || "(untitled)"}
          </Text>
        </div>
      </div>

      {/* Price row */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-[#d4a54a]">
          {item.current_price && item.current_price > item.start_price
            ? formatPrice(item.current_price)
            : formatPrice(item.start_price)}
        </span>
        <span className="text-xs text-ui-fg-subtle">
          {item.bid_count} {item.bid_count === 1 ? "bid" : "bids"}
        </span>
      </div>

      {/* Winning bidder */}
      {item.winning_bid && (
        <div className="text-xs text-ui-fg-subtle truncate">
          <span className="text-green-400 font-medium">{item.winning_bid.user_hint}</span>
        </div>
      )}

      {/* Lot end countdown */}
      {item.lot_end_time && (
        <div className="text-xs text-ui-fg-muted flex items-center gap-1">
          <span>Ends:</span>
          <Countdown endTime={item.lot_end_time} />
        </div>
      )}
    </div>
  )
}

// ── Block section ─────────────────────────────────────────────────────────────

function BlockSection({ data }: { data: LiveBlockData }) {
  // Sort items: most bids first, then by lot number
  const sorted = [...data.items].sort((a, b) => {
    if (b.bid_count !== a.bid_count) return b.bid_count - a.bid_count
    return (a.lot_number ?? 999) - (b.lot_number ?? 999)
  })

  return (
    <div className="rounded-lg border-2 border-green-500/30 overflow-hidden bg-green-50 dark:bg-green-950/20">
      {/* Block header */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-green-500/20">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <Heading level="h2" className="text-base font-semibold">
            {data.block_title || data.block_id}
          </Heading>
        </div>

        <Badge color="green">LIVE</Badge>

        <div className="flex items-center gap-4 ml-auto text-sm text-ui-fg-subtle">
          <span>
            <strong className="text-ui-fg-base">{data.total_bids}</strong> total bids
          </span>
          <span>
            <strong className="text-ui-fg-base">{data.active_items}</strong> active lots
          </span>
          {data.end_time && (
            <span className="flex items-center gap-1">
              Block ends: <Countdown endTime={data.end_time} />
            </span>
          )}
          <a
            href={`/app/auction-blocks/${data.block_id}`}
            className="text-blue-400 hover:underline text-xs"
          >
            Manage →
          </a>
        </div>
      </div>

      {/* Items grid */}
      <div className="p-4">
        {sorted.length === 0 ? (
          <Text className="text-ui-fg-subtle text-sm">No items in this block.</Text>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {sorted.map((item) => (
              <LotCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const LiveMonitorPage = () => {
  useAdminNav()
  const [monitorData, setMonitorData] = useState<LiveBlockData[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = async () => {
    try {
      const blocksRes = await fetch("/admin/auction-blocks", { credentials: "include" })
      const blocksData = await blocksRes.json()
      const activeBlocks = (blocksData.auction_blocks || []).filter(
        (b: { id: string; title?: string; status: string }) => b.status === "active"
      )

      const liveData = await Promise.all(
        activeBlocks.map((block: { id: string; title?: string; status: string }) =>
          fetch(`/admin/auction-blocks/${block.id}/live-bids`, { credentials: "include" })
            .then((r) => r.json())
            .then((d) => ({ ...d, block_title: block.title }))
        )
      )

      setMonitorData(liveData)
      setLastUpdated(new Date())
      setSecondsAgo(0)
    } catch (err) {
      console.error("Live monitor fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  // Initial fetch + 10s refresh
  useEffect(() => {
    fetchData()
    intervalRef.current = setInterval(fetchData, 10000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // "X seconds ago" ticker
  useEffect(() => {
    tickRef.current = setInterval(() => {
      if (lastUpdated) {
        setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000))
      }
    }, 1000)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [lastUpdated])

  const hasActive = monitorData.length > 0

  return (
    <Container>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {hasActive && (
            <span className="inline-block w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          )}
          <div>
            <Heading level="h1">Live Auction Monitor</Heading>
            <Text className="text-ui-fg-subtle mt-1 text-sm">
              {hasActive
                ? `${monitorData.length} active auction${monitorData.length > 1 ? "s" : ""} running`
                : "No active auctions running"}
            </Text>
          </div>
        </div>

        {lastUpdated && (
          <Text className="text-xs text-ui-fg-muted">
            Last updated: {secondsAgo}s ago
          </Text>
        )}
      </div>

      {/* Content */}
      {loading && (
        <Text className="text-ui-fg-subtle">Loading...</Text>
      )}

      {!loading && !hasActive && (
        <div className="text-center py-16 border border-dashed border-ui-border-base rounded-lg">
          <Text className="text-ui-fg-muted text-lg mb-2">No Active Auctions</Text>
          <Text className="text-ui-fg-subtle text-sm">
            This page auto-refreshes every 10 seconds. Start an auction block to monitor it here.
          </Text>
          <a href="/app/auction-blocks" className="inline-block mt-4 text-blue-400 hover:underline text-sm">
            Go to Auction Blocks →
          </a>
        </div>
      )}

      {!loading && hasActive && (
        <div className="space-y-8">
          {monitorData.map((data) => (
            <BlockSection key={data.block_id} data={data} />
          ))}
        </div>
      )}
    </Container>
  )
}

export default LiveMonitorPage
