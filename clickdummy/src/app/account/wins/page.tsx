"use client"

import { useFlow } from "@/context/FlowContext"
import { formatPrice } from "@/lib/utils"
import Link from "next/link"
import { CreditCard, Package, CheckCircle } from "lucide-react"

export default function WinsPage() {
  const { step, userReBidAmount, userBidAmount } = useFlow()
  const hasWins = step >= 6
  const isPaid = step >= 7
  const isShipped = step >= 8
  const isDelivered = step >= 9
  const finalPrice = userReBidAmount || userBidAmount || 92

  if (!hasWins) {
    return (
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl mb-8">Gewonnene Auktionen</h1>
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground mb-4">Du hast noch keine Auktionen gewonnen.</p>
          <Link href="/auctions" className="text-primary hover:underline text-sm">Aktive Auktionen ansehen</Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-serif text-2xl sm:text-3xl mb-8">Gewonnene Auktionen</h1>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4">
          <div className="flex items-start gap-4">
            <img
              src="https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=80&h=80&fit=crop"
              alt=""
              className="h-20 w-20 rounded-lg object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Lot #07 — Dark Ambient & Drone</p>
              <p className="font-medium">Lustmord — The Place Where the Black Stars Hang</p>
              <p className="text-xs text-muted-foreground mb-2">Side Effects, 1994, Vinyl, NM/NM</p>
              <p className="text-lg font-bold text-primary">{formatPrice(finalPrice)}</p>
            </div>
            <div className="shrink-0">
              {isDelivered ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-status-active/10 px-3 py-1 text-xs font-medium text-status-active">
                  <CheckCircle className="h-3.5 w-3.5" /> Zugestellt
                </span>
              ) : isShipped ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-400">
                  <Package className="h-3.5 w-3.5" /> Versendet
                </span>
              ) : isPaid ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-status-active/10 px-3 py-1 text-xs font-medium text-status-active">
                  <CheckCircle className="h-3.5 w-3.5" /> Bezahlt
                </span>
              ) : (
                <Link
                  href="/account/wins/checkout"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <CreditCard className="h-3.5 w-3.5" /> Bezahlen
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Progress */}
        {isPaid && (
          <div className="border-t border-border px-4 py-3 bg-secondary/30">
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-status-active" />
                <span className="text-status-active">Bezahlt</span>
              </div>
              <div className="h-px flex-1 bg-border" />
              <div className="flex items-center gap-1.5">
                <div className={`h-2 w-2 rounded-full ${isShipped ? "bg-status-active" : "bg-muted"}`} />
                <span className={isShipped ? "text-status-active" : "text-muted-foreground"}>Versendet</span>
              </div>
              <div className="h-px flex-1 bg-border" />
              <div className="flex items-center gap-1.5">
                <div className={`h-2 w-2 rounded-full ${isDelivered ? "bg-status-active" : "bg-muted"}`} />
                <span className={isDelivered ? "text-status-active" : "text-muted-foreground"}>Zugestellt</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
