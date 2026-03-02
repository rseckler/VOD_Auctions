import { AuctionListFilter } from "@/components/AuctionListFilter"

const MEDUSA_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

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

async function getAllBlocks(): Promise<AuctionBlock[]> {
  try {
    const res = await fetch(`${MEDUSA_URL}/store/auction-blocks?status=all`, {
      next: { revalidate: 60 },
      headers: { "x-publishable-api-key": PUBLISHABLE_KEY },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.auction_blocks || []
  } catch {
    return []
  }
}

export default async function AuctionsPage() {
  const blocks = await getAllBlocks()

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Auktionen</h1>
      <p className="text-zinc-400 mb-8">
        Alle laufenden, geplanten und vergangenen Auktionsblöcke.
      </p>

      <AuctionListFilter blocks={blocks} />
    </main>
  )
}
