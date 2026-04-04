"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { getToken } from "@/lib/auth"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { Disc3, Gavel } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { BidEntry } from "@/types"

function BidStatusBadge({ bid }: { bid: BidEntry }) {
  if (bid.item.status === "sold" && bid.is_winning) {
    return (
      <Badge variant="outline" className="bg-green-500/15 text-green-500 border-green-500/30">
        Won
      </Badge>
    )
  }
  if (bid.item.status === "sold" && !bid.is_winning) {
    return (
      <Badge variant="secondary">Lost</Badge>
    )
  }
  if (bid.item.status === "unsold") {
    return (
      <Badge variant="secondary">Unsold</Badge>
    )
  }
  if (bid.is_winning) {
    return (
      <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30">
        Highest Bid
      </Badge>
    )
  }
  if (bid.is_outbid) {
    return (
      <Badge variant="outline" className="bg-orange-500/15 text-orange-500 border-orange-500/30">
        Outbid
      </Badge>
    )
  }
  return null
}

function BidCard({ bid }: { bid: BidEntry }) {
  return (
    <Link href={`/auctions/${bid.block.slug}/${bid.item.id}`}>
      <Card className="!flex-row !gap-3 !py-0 p-3 hover:border-primary/20 transition-colors">
        <div className="w-14 h-14 flex-shrink-0 rounded overflow-hidden bg-card relative">
          {bid.item.release_cover ? (
            <Image
              src={bid.item.release_cover}
              alt=""
              fill
              sizes="56px"
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Disc3 className="h-5 w-5 text-muted-foreground/30" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <BidStatusBadge bid={bid} />
            {bid.item.release_format && (
              <span className="text-xs text-muted-foreground">{bid.item.release_format}</span>
            )}
          </div>
          <p className="text-sm font-medium truncate">
            {bid.item.release_artist && (
              <span className="text-muted-foreground">{bid.item.release_artist} — </span>
            )}
            {bid.item.release_title || "Unknown"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {bid.block.title} · Lot {bid.item.lot_number || "—"}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold font-mono">&euro;{bid.amount.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">
            Current: &euro;{bid.item.current_price.toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            {new Date(bid.created_at).toLocaleDateString("en-US")}
          </p>
        </div>
      </Card>
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
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
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
      <div className="text-center py-16">
        <Gavel className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
        <p className="text-muted-foreground mb-2">You have not placed any bids yet.</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/auctions">Go to Auctions</Link>
        </Button>
      </div>
    )
  }

  return (
    <div>
      <h2 className="heading-2 mb-6">My Bids</h2>

      {activeBids.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Active Auctions
            <Badge variant="secondary" className="ml-2">{activeBids.length}</Badge>
          </h3>
          <div className="space-y-4">
            {activeBids.map((bid) => (
              <BidCard key={bid.id} bid={bid} />
            ))}
          </div>
        </section>
      )}

      {endedBids.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Ended Auctions
            <Badge variant="secondary" className="ml-2">{endedBids.length}</Badge>
          </h3>
          <div className="space-y-4">
            {endedBids.map((bid) => (
              <BidCard key={bid.id} bid={bid} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
