"use client"

import Link from "next/link"
import { type AuctionItem } from "@/data/items"
import { formatPrice } from "@/lib/utils"

const formatColors: Record<string, string> = {
  Vinyl: "bg-[#d4a54a]/10 text-[#d4a54a]",
  CD: "bg-sky-400/10 text-sky-400",
  Cassette: "bg-purple-400/10 text-purple-400",
  CDr: "bg-purple-400/10 text-purple-400",
}

export function ItemCard({ item, blockSlug }: { item: AuctionItem; blockSlug: string }) {
  return (
    <Link href={`/auctions/${blockSlug}/${String(item.lotNumber).padStart(2, "0")}`} className="group block">
      <div className="overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
        <div className="relative aspect-square overflow-hidden bg-secondary">
          <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <span className="absolute top-2 left-2 rounded-full bg-black/60 backdrop-blur-sm px-2 py-0.5 text-xs font-mono text-white">
            #{String(item.lotNumber).padStart(2, "0")}
          </span>
          <span className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-xs font-medium ${formatColors[item.format] || ""}`}>
            {item.format}
          </span>
        </div>
        <div className="p-3">
          <p className="text-xs text-muted-foreground truncate">{item.artist}</p>
          <h4 className="text-sm font-medium truncate group-hover:text-primary transition-colors">{item.title}</h4>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-primary">{formatPrice(item.currentPrice)}</span>
            {item.bidCount > 0 && (
              <span className="text-xs text-muted-foreground">{item.bidCount} Gebote</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
