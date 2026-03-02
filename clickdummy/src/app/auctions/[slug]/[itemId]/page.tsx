"use client"

import { use } from "react"
import { getItem } from "@/data/items"
import { getBlock } from "@/data/blocks"
import { ImageGallery } from "@/components/ImageGallery"
import { BidSection } from "@/components/BidSection"
import { formatPrice } from "@/lib/utils"
import { ArrowLeft, Tag, MapPin, Disc3, Star } from "lucide-react"
import Link from "next/link"

const conditionLabels: Record<string, string> = {
  M: "Mint", NM: "Near Mint", "VG+": "Very Good Plus", VG: "Very Good", G: "Good",
}

export default function ItemDetailPage({
  params,
}: {
  params: Promise<{ slug: string; itemId: string }>
}) {
  const { slug, itemId } = use(params)
  const item = getItem(itemId)
  const block = getBlock(slug)

  if (!item || !block) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center">
        <h1 className="font-serif text-3xl mb-4">Item nicht gefunden</h1>
        <Link href={`/auctions/${slug}`} className="text-primary hover:underline">Zurück zum Block</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
        <Link href="/auctions" className="hover:text-foreground">Auktionen</Link>
        <span>/</span>
        <Link href={`/auctions/${slug}`} className="hover:text-foreground">{block.title}</Link>
        <span>/</span>
        <span className="text-foreground">Lot #{String(item.lotNumber).padStart(2, "0")}</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left: Images */}
        <div>
          <ImageGallery />
        </div>

        {/* Right: Info + Bidding */}
        <div>
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-mono text-muted-foreground">
                Lot #{String(item.lotNumber).padStart(2, "0")}
              </span>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {item.format}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{item.artist}</p>
            <h1 className="font-serif text-2xl sm:text-3xl mt-1">{item.title}</h1>
          </div>

          {/* Bid section */}
          <BidSection />

          {/* Details */}
          <div className="mt-6 rounded-xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-medium">Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Label:</span>
                <span>{item.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Land:</span>
                <span>{item.country}</span>
              </div>
              <div className="flex items-center gap-2">
                <Disc3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Format:</span>
                <span>{item.format}</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Jahr:</span>
                <span>{item.year}</span>
              </div>
            </div>
            <div className="border-t border-border pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Media Condition</span>
                <span>{item.condition} ({conditionLabels[item.condition] || item.condition})</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sleeve Condition</span>
                <span>{item.sleeveCondition} ({conditionLabels[item.sleeveCondition] || item.sleeveCondition})</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Startpreis</span>
                <span>{formatPrice(item.startPrice)}</span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-medium mb-2">Beschreibung</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
