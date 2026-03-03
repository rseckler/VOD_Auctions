"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/components/AuthProvider"
import { getToken } from "@/lib/auth"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { Gavel, Trophy } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function AccountOverview() {
  const { customer } = useAuth()
  const [activeBids, setActiveBids] = useState(0)
  const [wins, setWins] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const token = getToken()
    if (!token) return

    const headers = {
      "x-publishable-api-key": PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    }

    Promise.all([
      fetch(`${MEDUSA_URL}/store/account/bids`, { headers }).then((r) => r.json()),
      fetch(`${MEDUSA_URL}/store/account/wins`, { headers }).then((r) => r.json()),
    ])
      .then(([bidsData, winsData]) => {
        const active = (bidsData.bids || []).filter(
          (b: any) => b.is_winning && b.item.status === "active"
        )
        setActiveBids(active.length)
        setWins(winsData.count || 0)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">
        Welcome, {customer?.first_name || customer?.email}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Link href="/account/bids">
          <Card className="p-6 hover:border-primary/30 transition-colors group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Gavel className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">Active Bids</p>
            </div>
            <p className="text-3xl font-bold font-mono">
              {loaded ? activeBids : <Skeleton className="h-9 w-12 inline-block" />}
            </p>
          </Card>
        </Link>
        <Link href="/account/wins">
          <Card className="p-6 hover:border-primary/30 transition-colors group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Trophy className="h-5 w-5 text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground">Won Auctions</p>
            </div>
            <p className="text-3xl font-bold font-mono">
              {loaded ? wins : <Skeleton className="h-9 w-12 inline-block" />}
            </p>
          </Card>
        </Link>
      </div>
    </div>
  )
}
