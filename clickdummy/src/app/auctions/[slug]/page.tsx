"use client"

import { use, useState } from "react"
import { getBlock } from "@/data/blocks"
import { getItemsByBlock } from "@/data/items"
import { ItemCard } from "@/components/ItemCard"
import { CountdownTimer } from "@/components/CountdownTimer"
import { formatPrice } from "@/lib/utils"
import { Package, TrendingUp, Clock, Calendar, Search, ArrowLeft } from "lucide-react"
import Link from "next/link"

const sortOptions = [
  { key: "lot", label: "Lot #" },
  { key: "price-asc", label: "Preis aufsteigend" },
  { key: "price-desc", label: "Preis absteigend" },
  { key: "bids", label: "Meiste Gebote" },
]

export default function BlockDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const block = getBlock(slug)
  const allItems = getItemsByBlock(slug)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState("lot")

  if (!block) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center">
        <h1 className="font-serif text-3xl mb-4">Block nicht gefunden</h1>
        <Link href="/auctions" className="text-primary hover:underline">Zurück zu den Auktionen</Link>
      </div>
    )
  }

  const filtered = allItems
    .filter((item) => {
      if (!search) return true
      const q = search.toLowerCase()
      return item.artist.toLowerCase().includes(q) || item.title.toLowerCase().includes(q) || item.label.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      switch (sort) {
        case "price-asc": return a.currentPrice - b.currentPrice
        case "price-desc": return b.currentPrice - a.currentPrice
        case "bids": return b.bidCount - a.bidCount
        default: return a.lotNumber - b.lotNumber
      }
    })

  return (
    <div>
      {/* Hero */}
      <div className="relative h-64 sm:h-80 overflow-hidden">
        <img src={block.imageUrl} alt={block.title} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="mx-auto max-w-7xl">
            <Link href="/auctions" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
              <ArrowLeft className="h-3.5 w-3.5" /> Zurück
            </Link>
            <div className="flex items-center gap-3 mb-2">
              <span className="rounded-full bg-status-active px-2.5 py-0.5 text-xs font-medium text-green-950">
                Laufend
              </span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl">{block.title}</h1>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="rounded-xl border border-border bg-card p-4">
            <Package className="h-5 w-5 text-primary mb-2" />
            <p className="text-2xl font-bold">{block.itemCount}</p>
            <p className="text-xs text-muted-foreground">Lots</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <TrendingUp className="h-5 w-5 text-primary mb-2" />
            <p className="text-2xl font-bold">{block.totalBids}</p>
            <p className="text-xs text-muted-foreground">Gebote</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <Clock className="h-5 w-5 text-primary mb-2" />
            <p className="text-lg font-bold">ab {formatPrice(block.minStartPrice)}</p>
            <p className="text-xs text-muted-foreground">Startpreis</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <Calendar className="h-5 w-5 text-primary mb-2" />
            <CountdownTimer endDate={block.endDate} />
            <p className="text-xs text-muted-foreground mt-1">Verbleibend</p>
          </div>
        </div>

        {/* Editorial content */}
        <div className="rounded-xl border border-border bg-card p-6 mb-8">
          <p className="text-muted-foreground leading-relaxed">{block.description}</p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suche nach Artist, Titel, Label..."
              className="w-full rounded-lg border border-border bg-input pl-10 pr-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {sortOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSort(opt.key)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  sort === opt.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Item grid */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} blockSlug={slug} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <p className="text-muted-foreground">Keine Items gefunden.</p>
          </div>
        )}
      </div>
    </div>
  )
}
