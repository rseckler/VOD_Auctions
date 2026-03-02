"use client"

import Link from "next/link"
import { type AuctionBlock } from "@/data/blocks"
import { CountdownTimer } from "./CountdownTimer"
import { formatPrice } from "@/lib/utils"
import { Clock, Package, TrendingUp } from "lucide-react"

const statusConfig = {
  active: { label: "Laufend", color: "bg-status-active text-green-950" },
  scheduled: { label: "Demnächst", color: "bg-status-scheduled text-gray-950" },
  ended: { label: "Beendet", color: "bg-status-ended text-white" },
  preview: { label: "Vorschau", color: "bg-orange-500 text-orange-950" },
}

export function BlockCardVertical({ block }: { block: AuctionBlock }) {
  const status = statusConfig[block.status]
  return (
    <Link href={`/auctions/${block.slug}`} className="group block">
      <div className="overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
        <div className="relative aspect-[16/9] overflow-hidden">
          <img src={block.imageUrl} alt={block.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent" />
          <span className={`absolute top-3 left-3 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color}`}>
            {status.label}
          </span>
          {block.status === "active" && (
            <div className="absolute bottom-3 right-3">
              <CountdownTimer endDate={block.endDate} className="text-xs" />
            </div>
          )}
        </div>
        <div className="p-4">
          <h3 className="font-serif text-lg mb-1 group-hover:text-primary transition-colors">{block.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{block.subtitle}</p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{block.itemCount} Lots</span>
            <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />{block.totalBids} Gebote</span>
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />ab {formatPrice(block.minStartPrice)}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export function BlockCardHorizontal({ block }: { block: AuctionBlock }) {
  const status = statusConfig[block.status]
  return (
    <Link href={`/auctions/${block.slug}`} className="group block">
      <div className="flex overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
        <div className="relative w-48 sm:w-64 shrink-0 overflow-hidden">
          <img src={block.imageUrl} alt={block.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <span className={`absolute top-3 left-3 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color}`}>
            {status.label}
          </span>
        </div>
        <div className="flex flex-col justify-center p-4 sm:p-6 min-w-0">
          <h3 className="font-serif text-lg sm:text-xl mb-1 group-hover:text-primary transition-colors truncate">{block.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{block.subtitle}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{block.itemCount} Lots</span>
            <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />{block.totalBids} Gebote</span>
            {block.status === "active" && <CountdownTimer endDate={block.endDate} className="text-xs" />}
          </div>
        </div>
      </div>
    </Link>
  )
}
