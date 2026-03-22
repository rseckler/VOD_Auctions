import Link from "next/link"
import Image from "next/image"
import { Disc3, ChevronRight } from "lucide-react"
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

type CmsContent = Record<string, Record<string, unknown>>

async function getHomeContent(): Promise<CmsContent> {
  const data = await medusaFetch<{ sections: CmsContent }>(
    "/store/content?page=home",
    { revalidate: 120 }
  )
  return data?.sections || {}
}

async function getTotalReleaseCount(): Promise<number> {
  const data = await medusaFetch<{ total: number }>(
    "/store/catalog?limit=0",
    { revalidate: 3600 }
  )
  return data?.total || 0
}

export default async function Home() {
  const [blocks, cms, totalCount] = await Promise.all([getBlocks(), getHomeContent(), getTotalReleaseCount()])
  const activeCount = blocks.filter((b) => b.status === "active").length

  const hero = cms.hero as Record<string, unknown> | undefined
  const heroTitle = (hero?.title as string) || "Rare Records.\nTrue Collectors."
  const heroSubtitle =
    (hero?.subtitle as string) ||
    "Curated vinyl auctions for connoisseurs. Industrial, EBM, Dark Ambient and more — discover rarities and first pressings."
  const heroCta = (hero?.cta_text as string) || "Current Auctions"
  const heroCtaLink = (hero?.cta_link as string) || "/auctions"

  const teaser = cms.catalog_teaser as Record<string, unknown> | undefined
  const formattedCount = totalCount > 0
    ? totalCount.toLocaleString("en-US", { useGrouping: true })
    : "40,000+"
  const teaserTitle = `${formattedCount} Releases in Catalog`
  const teaserBody =
    (teaser?.body as string) ||
    "Browse our complete archive — Industrial, EBM, Dark Ambient, Noise, Experimental and more."
  const teaserCta = (teaser?.cta_text as string) || "Browse Catalog"
  const teaserCtaLink = (teaser?.cta_link as string) || "/catalog"

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,165,74,0.08)_0%,transparent_60%)]" />
        <div className="relative mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center pt-20 pb-10 md:pt-28 md:pb-14">
            {/* Left: Text */}
            <div>
              {activeCount > 0 && (
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[rgba(212,165,74,0.1)] border border-[rgba(212,165,74,0.25)] text-primary text-sm font-medium mb-6">
                  <span className="w-2 h-2 rounded-full bg-status-active animate-pulse" />
                  {activeCount} Live Auction{activeCount > 1 ? "s" : ""}
                </div>
              )}
              <h1 className="font-serif text-5xl md:text-6xl leading-[1.1] mb-5">
                {heroTitle.includes("\n") ? (
                  <>
                    {heroTitle.split("\n")[0]}
                    <br />
                    <span className="text-primary">{heroTitle.split("\n")[1]}</span>
                  </>
                ) : (
                  heroTitle
                )}
              </h1>
              <div className="text-lg text-muted-foreground max-w-md mb-8 leading-relaxed">
                {heroSubtitle.split("\n").map((line, i) => (
                  <p key={i} className={i > 0 ? "mt-3" : ""}>
                    {line}
                  </p>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button size="lg" asChild className="bg-gradient-to-r from-primary to-[#b8860b]">
                  <Link href={heroCtaLink}>{heroCta}</Link>
                </Button>
                <Button size="lg" variant="ghost" asChild className="text-muted-foreground border border-[rgba(232,224,212,0.12)]">
                  <Link href="/catalog">Browse Catalog</Link>
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

      {/* Empty State — no auctions */}
      {blocks.length === 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-8">
          <div className="rounded-2xl border border-[rgba(232,224,212,0.08)] bg-[rgba(232,224,212,0.02)] p-16 text-center">
            <Disc3 className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
            <p className="text-muted-foreground">
              Currently no active auctions.
            </p>
            <p className="text-muted-foreground/60 mt-2 text-sm">
              Check back soon — new blocks are published regularly.
            </p>
          </div>
        </section>
      )}

      {/* Gallery Teaser */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="relative overflow-hidden rounded-2xl border border-[rgba(232,224,212,0.08)]">
          {/* Background image grid */}
          <div className="grid grid-cols-3 h-64 md:h-80">
            <div className="relative">
              <Image
                src="/gallery/gallery-12.jpg"
                alt="Concert posters at VOD Gallery"
                fill
                className="object-cover"
                sizes="33vw"
              />
            </div>
            <div className="relative">
              <Image
                src="/gallery/gallery-06.jpg"
                alt="Throbbing Gristle artefacts"
                fill
                className="object-cover"
                sizes="33vw"
              />
            </div>
            <div className="relative">
              <Image
                src="/gallery/gallery-11.jpg"
                alt="Vinyl and cassette collection"
                fill
                className="object-cover"
                sizes="33vw"
              />
            </div>
          </div>
          {/* Overlay with text */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#1c1915] via-[#1c1915]/70 to-[#1c1915]/30 flex items-end">
            <div className="p-8 md:p-12 w-full">
              <p className="text-xs text-primary font-medium uppercase tracking-wider mb-2">
                Friedrichshafen, Germany
              </p>
              <h2 className="font-serif text-2xl md:text-3xl text-foreground mb-3">
                VOD Gallery
              </h2>
              <p className="text-muted-foreground max-w-lg mb-6 text-sm md:text-base">
                Archive, listening room and meeting point — 41,500+ records, artefacts
                and rare collectibles in one room. Visit us at Lake Constance.
              </p>
              <Link
                href="/gallery"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-primary/40 text-primary hover:bg-primary/10 transition-colors text-sm font-medium"
              >
                Explore the Gallery
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Catalog Teaser */}
      <section className="mx-auto max-w-6xl px-6 pt-8 pb-16">
        <div className="rounded-2xl border border-[rgba(232,224,212,0.08)] bg-[rgba(232,224,212,0.02)] p-12 text-center">
          <Disc3 className="h-12 w-12 mx-auto text-primary/40 mb-4" />
          <h2 className="font-serif text-2xl md:text-3xl mb-3">
            {teaserTitle}
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto mb-6">
            {teaserBody}
          </p>
          <Button size="lg" variant="outline" asChild className="border-primary/30 text-primary hover:bg-primary/10">
            <Link href={teaserCtaLink}>{teaserCta}</Link>
          </Button>
        </div>
      </section>

    </main>
  )
}
