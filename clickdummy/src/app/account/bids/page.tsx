"use client"

import { useFlow } from "@/context/FlowContext"
import { formatPrice } from "@/lib/utils"
import Link from "next/link"
import { ExternalLink } from "lucide-react"

export default function BidsPage() {
  const { step, userBidAmount, userReBidAmount } = useFlow()

  const hasBids = step >= 2

  if (!hasBids) {
    return (
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl mb-8">Meine Gebote</h1>
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground mb-4">Du hast noch keine Gebote abgegeben.</p>
          <Link href="/auctions" className="text-primary hover:underline text-sm">Auktionen durchstöbern</Link>
        </div>
      </div>
    )
  }

  const isOutbid = step === 3
  const isWinner = step >= 6
  const latestBid = step >= 4 && userReBidAmount ? userReBidAmount : userBidAmount || 82

  return (
    <div>
      <h1 className="font-serif text-2xl sm:text-3xl mb-8">Meine Gebote</h1>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border bg-secondary/50 px-4 py-3">
          <h3 className="text-sm font-medium">Dark Ambient & Drone</h3>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-4">
            <img
              src="https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=80&h=80&fit=crop"
              alt=""
              className="h-16 w-16 rounded-lg object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Lot #07</p>
              <p className="text-sm font-medium truncate">Lustmord — The Place Where the Black Stars Hang</p>
              <p className="text-xs text-muted-foreground">Side Effects, 1994, Vinyl</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-primary">{formatPrice(latestBid)}</p>
              {isWinner ? (
                <span className="inline-flex items-center rounded-full bg-status-active/10 px-2 py-0.5 text-xs font-medium text-status-active">
                  Gewonnen
                </span>
              ) : isOutbid ? (
                <span className="inline-flex items-center rounded-full bg-bid-outbid/10 px-2 py-0.5 text-xs font-medium text-bid-outbid">
                  Überboten
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-status-active/10 px-2 py-0.5 text-xs font-medium text-status-active">
                  Höchstgebot
                </span>
              )}
            </div>
            <Link href="/auctions/dark-ambient-drone/07" className="shrink-0">
              <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
