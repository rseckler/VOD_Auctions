"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getToken } from "@/lib/auth"

const MEDUSA_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

type BidEntry = {
  id: string
  amount: number
  is_winning: boolean
  is_outbid: boolean
  created_at: string
  item: {
    id: string
    current_price: number
    status: string
    lot_number: number | null
    release_title: string | null
    release_artist: string | null
    release_cover: string | null
    release_format: string | null
  }
  block: {
    id: string
    title: string
    slug: string
    status: string
  }
}

function BidStatusBadge({ bid }: { bid: BidEntry }) {
  if (bid.item.status === "sold" && bid.is_winning) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-green-900 text-green-300">
        Gewonnen
      </span>
    )
  }
  if (bid.item.status === "sold" && !bid.is_winning) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
        Verloren
      </span>
    )
  }
  if (bid.item.status === "unsold") {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
        Nicht verkauft
      </span>
    )
  }
  if (bid.is_winning) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-green-900 text-green-300">
        Höchstgebot
      </span>
    )
  }
  if (bid.is_outbid) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-900 text-orange-300">
        Überboten
      </span>
    )
  }
  return null
}

function BidCard({ bid }: { bid: BidEntry }) {
  return (
    <Link
      href={`/auctions/${bid.block.slug}/${bid.item.id}`}
      className="flex gap-4 p-4 rounded-lg border border-zinc-800 bg-zinc-900 hover:border-zinc-600 transition-colors"
    >
      {/* Cover image */}
      <div className="w-16 h-16 flex-shrink-0 rounded overflow-hidden bg-zinc-800">
        {bid.item.release_cover ? (
          <img
            src={bid.item.release_cover}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
            Kein Bild
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <BidStatusBadge bid={bid} />
          {bid.item.release_format && (
            <span className="text-xs text-zinc-500">{bid.item.release_format}</span>
          )}
        </div>
        <p className="text-sm font-medium truncate">
          {bid.item.release_artist && (
            <span className="text-zinc-400">{bid.item.release_artist} — </span>
          )}
          {bid.item.release_title || "Unbekannt"}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {bid.block.title} · Lot {bid.item.lot_number || "—"}
        </p>
      </div>

      {/* Price */}
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold">&euro;{bid.amount.toFixed(2)}</p>
        <p className="text-xs text-zinc-500">
          Aktuell: &euro;{bid.item.current_price.toFixed(2)}
        </p>
        <p className="text-xs text-zinc-600 mt-0.5">
          {new Date(bid.created_at).toLocaleDateString("de-DE")}
        </p>
      </div>
    </Link>
  )
}

export default function MyBidsPage() {
  const [bids, setBids] = useState<BidEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }

    fetch(`${MEDUSA_URL}/store/account/bids`, {
      headers: {
        "x-publishable-api-key": PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
    })
      .then((r) => r.json())
      .then((data) => {
        setBids(data.bids || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-zinc-800 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  // Group bids: deduplicate by item (show latest bid per item)
  const latestByItem = new Map<string, BidEntry>()
  for (const bid of bids) {
    const existing = latestByItem.get(bid.item.id)
    if (!existing || new Date(bid.created_at) > new Date(existing.created_at)) {
      latestByItem.set(bid.item.id, bid)
    }
  }
  const uniqueBids = Array.from(latestByItem.values())

  const activeBids = uniqueBids.filter(
    (b) => b.item.status === "active" && b.block.status === "active"
  )
  const endedBids = uniqueBids.filter(
    (b) => b.item.status !== "active" || b.block.status !== "active"
  )

  if (uniqueBids.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500">Sie haben noch keine Gebote abgegeben.</p>
        <Link
          href="/auctions"
          className="text-sm text-zinc-400 hover:text-white mt-2 inline-block"
        >
          Zu den Auktionen
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Meine Gebote</h2>

      {activeBids.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm font-medium text-zinc-400 mb-3">
            Aktive Auktionen ({activeBids.length})
          </h3>
          <div className="space-y-3">
            {activeBids.map((bid) => (
              <BidCard key={bid.id} bid={bid} />
            ))}
          </div>
        </section>
      )}

      {endedBids.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">
            Beendete Auktionen ({endedBids.length})
          </h3>
          <div className="space-y-3">
            {endedBids.map((bid) => (
              <BidCard key={bid.id} bid={bid} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
