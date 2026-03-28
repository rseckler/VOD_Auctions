import Link from "next/link"
import { medusaFetch } from "@/lib/api"
import type { AuctionBlock } from "@/types"

function formatTimeRemaining(endTime: string): string {
  const diffMs = new Date(endTime).getTime() - Date.now()
  if (diffMs <= 0) return "ending soon"

  const totalMinutes = Math.floor(diffMs / 1000 / 60)
  const days = Math.floor(totalMinutes / 60 / 24)
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export async function LiveAuctionBanner() {
  const data = await medusaFetch<{ auction_blocks: AuctionBlock[] }>(
    "/store/auction-blocks",
    { revalidate: 60 }
  )
  const activeBlocks = (data?.auction_blocks || [])
    .filter((b) => b.status === "active")
    .sort(
      (a, b) => new Date(a.end_time).getTime() - new Date(b.end_time).getTime()
    )

  if (activeBlocks.length === 0) return null

  const block = activeBlocks[0]
  const timeRemaining = formatTimeRemaining(block.end_time)
  const lotsLabel = `${block.items_count} lot${block.items_count !== 1 ? "s" : ""}`

  return (
    <div className="w-full bg-gradient-to-r from-red-950/60 via-red-900/40 to-red-950/60 border-b border-red-500/30">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex items-center justify-between gap-4 py-2.5 min-h-[44px]">
          {/* Left: LIVE NOW indicator */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 font-bold text-sm tracking-wide uppercase">
              Live Now
            </span>
          </div>

          {/* Center: Block title */}
          <p className="text-white/90 text-sm font-medium truncate hidden sm:block">
            {block.title}
          </p>

          {/* Right: Lot count + end time + CTA */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-white/60 text-sm hidden md:block">
              {lotsLabel} &bull; ends in {timeRemaining}
            </span>
            <span className="text-white/60 text-sm md:hidden">
              ends in {timeRemaining}
            </span>
            <Link
              href={`/auctions/${block.slug}`}
              className="inline-flex items-center gap-1 px-3 py-1 rounded text-sm font-semibold bg-[#d4a54a] hover:bg-[#c4952a] text-[#1c1915] transition-colors whitespace-nowrap"
            >
              Bid Now →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
