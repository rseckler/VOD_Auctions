import Link from "next/link"
import { medusaFetch } from "@/lib/api"
import { LiveCountdown } from "@/components/LiveCountdown"
import type { AuctionBlock } from "@/types"

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
  const totalLots = activeBlocks.reduce((sum, b) => sum + (b.items_count || 0), 0)
  const lotsLabel = `${totalLots} lot${totalLots !== 1 ? "s" : ""}`
  const multipleBlocks = activeBlocks.length > 1

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
            {multipleBlocks && (
              <span className="text-red-300/70 text-xs font-medium">
                {activeBlocks.length} auctions
              </span>
            )}
          </div>

          {/* Center: Block title */}
          <p className="text-white/90 text-sm font-medium truncate hidden sm:block">
            {block.title}
          </p>

          {/* Right: Lot count + end time + CTA */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-white/60 text-sm hidden md:flex items-center gap-1">
              {lotsLabel} &bull; ends in <LiveCountdown endTime={block.end_time} className="text-white/80" />
            </span>
            <span className="text-white/60 text-sm md:hidden flex items-center gap-1">
              ends in <LiveCountdown endTime={block.end_time} className="text-white/80" />
            </span>
            <Link
              href={multipleBlocks ? "/auctions" : `/auctions/${block.slug}`}
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
