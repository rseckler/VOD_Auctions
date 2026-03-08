import type { Metadata } from "next"
import { AuctionListFilter } from "@/components/AuctionListFilter"
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
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Auctions</h1>
      <p className="text-muted-foreground mb-8">
        All running and scheduled auction blocks.
      </p>

      <AuctionListFilter blocks={blocks} />
    </main>
  )
}
