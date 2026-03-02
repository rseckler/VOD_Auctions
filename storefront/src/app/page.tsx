import Link from "next/link"
import { Disc3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { HomeContent } from "@/components/HomeContent"
import { medusaFetch } from "@/lib/api"
import type { AuctionBlock } from "@/types"

async function getBlocks(): Promise<AuctionBlock[]> {
  const data = await medusaFetch<{ auction_blocks: AuctionBlock[] }>(
    "/store/auction-blocks"
  )
  return data?.auction_blocks || []
}

export default async function Home() {
  const blocks = await getBlocks()
  const activeCount = blocks.filter((b) => b.status === "active").length

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,165,74,0.08)_0%,transparent_60%)]" />
        <div className="relative mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center py-20 md:py-28">
            {/* Left: Text */}
            <div>
              {activeCount > 0 && (
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[rgba(212,165,74,0.1)] border border-[rgba(212,165,74,0.25)] text-primary text-sm font-medium mb-6">
                  <span className="w-2 h-2 rounded-full bg-status-active animate-pulse" />
                  {activeCount} Live-Auktion{activeCount > 1 ? "en" : ""}
                </div>
              )}
              <h1 className="font-serif text-5xl md:text-6xl leading-[1.1] mb-5">
                Seltene Platten.
                <br />
                <span className="text-primary">Echte Sammler.</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-md mb-8 leading-relaxed">
                Kuratierte Vinyl-Auktionen für Kenner. Industrial, EBM, Dark
                Ambient und mehr — entdecke Raritäten und Erstpressungen.
              </p>
              <div className="flex gap-4">
                <Button size="lg" asChild className="bg-gradient-to-r from-primary to-[#b8860b]">
                  <Link href="/auctions">Jetzt entdecken</Link>
                </Button>
                <Button size="lg" variant="ghost" asChild className="text-muted-foreground border border-[rgba(232,224,212,0.12)]">
                  <Link href="/auctions">Wie es funktioniert</Link>
                </Button>
              </div>
            </div>

            {/* Right: Vinyl Graphic */}
            <div className="hidden lg:flex justify-center relative">
              <div className="relative w-80 h-80">
                {/* Album Cover */}
                <div className="absolute top-6 left-0 w-72 h-72 rounded bg-gradient-to-br from-[#3a3028] to-[#2a221a] border border-[rgba(232,224,212,0.08)] shadow-2xl flex items-center justify-center">
                  <Disc3 className="h-16 w-16 text-muted-foreground/10" />
                </div>
                {/* Vinyl Record */}
                <div className="absolute top-4 left-16 w-72 h-72 rounded-full border border-[rgba(232,224,212,0.06)] bg-[radial-gradient(circle,#2a2520_30%,#1c1915_31%,#1c1915_48%,#2a2520_49%,#2a2520_50%,#1c1915_51%)] animate-[spin_20s_linear_infinite]">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full bg-gradient-to-br from-primary to-[#8b6914]" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#1c1915]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Ticker */}
      {activeCount > 0 && (
        <div className="px-6 py-3 bg-[rgba(212,165,74,0.06)] border-y border-[rgba(212,165,74,0.12)]">
          <div className="mx-auto max-w-6xl flex items-center gap-3 text-sm text-primary">
            <span className="w-2 h-2 rounded-full bg-[#ef4444] animate-pulse" />
            <span className="opacity-80">
              {blocks
                .filter((b) => b.status === "active")
                .map((b) => `${b.title} — ${b.items_count} Lots`)
                .join(" · ")}
            </span>
          </div>
        </div>
      )}

      <HomeContent blocks={blocks} />

      {/* Empty State */}
      {blocks.length === 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="rounded-2xl border border-[rgba(232,224,212,0.08)] bg-[rgba(232,224,212,0.02)] p-16 text-center">
            <Disc3 className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
            <p className="text-muted-foreground">
              Aktuell keine aktiven Auktionen.
            </p>
            <p className="text-muted-foreground/60 mt-2 text-sm">
              Schaue bald wieder vorbei — neue Blöcke werden regelmäßig
              veröffentlicht.
            </p>
          </div>
        </section>
      )}
    </main>
  )
}
