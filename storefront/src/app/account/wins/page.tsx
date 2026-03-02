"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getToken } from "@/lib/auth"

const MEDUSA_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

type WinEntry = {
  bid_id: string
  final_price: number
  bid_date: string
  item: {
    id: string
    lot_number: number | null
    status: string
    release_title: string | null
    release_artist: string | null
    release_cover: string | null
    release_format: string | null
  }
  block: {
    id: string
    title: string
    slug: string
  }
}

export default function WinsPage() {
  const [wins, setWins] = useState<WinEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }

    fetch(`${MEDUSA_URL}/store/account/wins`, {
      headers: {
        "x-publishable-api-key": PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
    })
      .then((r) => r.json())
      .then((data) => {
        setWins(data.wins || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 bg-zinc-800 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (wins.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500">
          Sie haben noch keine Auktionen gewonnen.
        </p>
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
      <h2 className="text-xl font-semibold mb-6">
        Gewonnene Auktionen ({wins.length})
      </h2>

      <div className="space-y-3">
        {wins.map((win) => (
          <Link
            key={win.bid_id}
            href={`/auctions/${win.block.slug}/${win.item.id}`}
            className="flex gap-4 p-4 rounded-lg border border-zinc-800 bg-zinc-900 hover:border-zinc-600 transition-colors"
          >
            {/* Cover */}
            <div className="w-16 h-16 flex-shrink-0 rounded overflow-hidden bg-zinc-800">
              {win.item.release_cover ? (
                <img
                  src={win.item.release_cover}
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
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-900 text-green-300">
                Gewonnen
              </span>
              <p className="text-sm font-medium truncate mt-1">
                {win.item.release_artist && (
                  <span className="text-zinc-400">
                    {win.item.release_artist} —{" "}
                  </span>
                )}
                {win.item.release_title || "Unbekannt"}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {win.block.title} · Lot {win.item.lot_number || "—"}
              </p>
            </div>

            {/* Price */}
            <div className="text-right flex-shrink-0">
              <p className="text-lg font-bold">
                &euro;{win.final_price.toFixed(2)}
              </p>
              <p className="text-xs text-zinc-500">
                {new Date(win.bid_date).toLocaleDateString("de-DE")}
              </p>
              <button
                disabled
                className="mt-1 text-xs px-3 py-1 rounded bg-zinc-700 text-zinc-400 cursor-not-allowed"
              >
                Bezahlen (bald)
              </button>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
