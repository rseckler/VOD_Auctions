"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/components/AuthProvider"
import { getToken } from "@/lib/auth"

const MEDUSA_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

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
        Willkommen, {customer?.first_name || customer?.email}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Link
          href="/account/bids"
          className="p-6 rounded-lg border border-zinc-800 bg-zinc-900 hover:border-zinc-600 transition-colors"
        >
          <p className="text-sm text-zinc-400">Aktive Gebote</p>
          <p className="text-3xl font-bold mt-1">
            {loaded ? activeBids : "—"}
          </p>
        </Link>
        <Link
          href="/account/wins"
          className="p-6 rounded-lg border border-zinc-800 bg-zinc-900 hover:border-zinc-600 transition-colors"
        >
          <p className="text-sm text-zinc-400">Gewonnene Auktionen</p>
          <p className="text-3xl font-bold mt-1">
            {loaded ? wins : "—"}
          </p>
        </Link>
      </div>
    </div>
  )
}
