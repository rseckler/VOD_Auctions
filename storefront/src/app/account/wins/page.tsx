"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getToken } from "@/lib/auth"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { Disc3, Trophy } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { WinEntry } from "@/types"

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
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (wins.length === 0) {
    return (
      <div className="text-center py-16">
        <Trophy className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
        <p className="text-muted-foreground mb-2">
          You have not won any auctions yet.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/auctions">Go to Auctions</Link>
        </Button>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">
        Won Auctions
        <Badge variant="secondary" className="ml-2">{wins.length}</Badge>
      </h2>

      <div className="space-y-3">
        {wins.map((win) => (
          <Link
            key={win.bid_id}
            href={`/auctions/${win.block.slug}/${win.item.id}`}
          >
            <Card className="flex gap-4 p-4 hover:border-primary/30 transition-colors">
              <div className="w-16 h-16 flex-shrink-0 rounded overflow-hidden bg-card">
                {win.item.release_cover ? (
                  <img
                    src={win.item.release_cover}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Disc3 className="h-6 w-6 text-muted-foreground/30" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <Badge variant="outline" className="bg-green-500/15 text-green-500 border-green-500/30">
                  Won
                </Badge>
                <p className="text-sm font-medium truncate mt-1">
                  {win.item.release_artist && (
                    <span className="text-muted-foreground">
                      {win.item.release_artist} —{" "}
                    </span>
                  )}
                  {win.item.release_title || "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {win.block.title} · Lot {win.item.lot_number || "—"}
                </p>
              </div>

              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold font-mono text-primary">
                  &euro;{win.final_price.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(win.bid_date).toLocaleDateString("en-US")}
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="mt-1 text-xs h-7"
                    >
                      Pay
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Payment feature will be available soon</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
