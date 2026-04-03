import type { Metadata } from "next"
import Link from "next/link"
import { AuctionListFilter } from "@/components/AuctionListFilter"
import { LiveAuctionBanner } from "@/components/LiveAuctionBanner"
import { medusaFetch } from "@/lib/api"
import type { AuctionBlock } from "@/types"

export const metadata: Metadata = {
  title: "Auctions",
  description:
    "Browse live, scheduled, and past auction blocks for rare Industrial, EBM, Dark Ambient and Experimental Music records.",
  openGraph: {
    title: "Auctions — VOD Auctions",
    description:
      "Browse live, scheduled, and past auction blocks for rare Industrial, EBM, Dark Ambient and Experimental Music records.",
  },
}

async function getAllBlocks(): Promise<AuctionBlock[]> {
  const data = await medusaFetch<{ auction_blocks: AuctionBlock[] }>(
    "/store/auction-blocks?status=all"
  )
  const blocks = data?.auction_blocks || []
  return blocks.filter((b) => b.status !== "ended")
}

export default async function AuctionsPage() {
  const blocks = await getAllBlocks()

  return (
    <>
      <LiveAuctionBanner />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-between mb-2">
          <h1 className="heading-1 tracking-tight">Auctions</h1>
          <Link href="/auctions/archive" className="text-sm text-primary hover:text-primary/80 transition-colors">
            View Past Auctions →
          </Link>
        </div>
        <p className="text-muted-foreground mb-8">
          All running and scheduled auction blocks.
        </p>
        <AuctionListFilter blocks={blocks} />
      </main>
    </>
  )
}
