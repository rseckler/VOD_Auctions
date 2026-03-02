"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "./AuthProvider"
import { AuthModal } from "./AuthModal"
import { getToken } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

const MEDUSA_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

type BidRecord = {
  id: string
  amount: number
  is_winning: boolean
  user_hint?: string
  user_id?: string
  created_at: string
}

type ItemBidSectionProps = {
  slug: string
  itemId: string
  initialPrice: number | null
  startPrice: number
  initialBidCount: number
  lotEndTime: string | null
  blockStatus: string
  itemStatus: string
}

export function ItemBidSection({
  slug,
  itemId,
  initialPrice,
  startPrice,
  initialBidCount,
  lotEndTime: initialLotEndTime,
  blockStatus,
  itemStatus,
}: ItemBidSectionProps) {
  const { isAuthenticated, customer } = useAuth()
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [currentPrice, setCurrentPrice] = useState(initialPrice || startPrice)
  const [bidCount, setBidCount] = useState(initialBidCount)
  const [lotEndTime, setLotEndTime] = useState(initialLotEndTime)
  const [bids, setBids] = useState<BidRecord[]>([])
  const [bidsLoaded, setBidsLoaded] = useState(false)

  const isActive = blockStatus === "active" && itemStatus === "active"

  // Fetch bid history
  const loadBids = useCallback(async () => {
    try {
      const res = await fetch(
        `${MEDUSA_URL}/store/auction-blocks/${slug}/items/${itemId}/bids`,
        { headers: { "x-publishable-api-key": PUBLISHABLE_KEY } }
      )
      if (res.ok) {
        const data = await res.json()
        setBids(data.bids || [])
        setBidsLoaded(true)
      }
    } catch {
      // ignore
    }
  }, [slug, itemId])

  useEffect(() => {
    if (isActive || blockStatus === "ended") {
      loadBids()
    }
  }, [isActive, blockStatus, loadBids])

  // Supabase Realtime subscriptions
  useEffect(() => {
    if (!isActive) return

    const bidChannel = supabase
      .channel(`bids-${itemId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bid",
          filter: `block_item_id=eq.${itemId}`,
        },
        (payload) => {
          const newBid = payload.new as any
          setBids((prev) => [
            {
              id: newBid.id,
              amount: newBid.amount,
              is_winning: newBid.is_winning,
              user_id: newBid.user_id,
              user_hint: newBid.user_id?.substring(0, 8) + "…",
              created_at: newBid.created_at,
            },
            ...prev,
          ])
          if (newBid.is_winning) {
            setCurrentPrice(newBid.amount)
          }
          setBidCount((c) => c + 1)
        }
      )
      .subscribe()

    const itemChannel = supabase
      .channel(`item-${itemId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "block_item",
          filter: `id=eq.${itemId}`,
        },
        (payload) => {
          const updated = payload.new as any
          if (updated.current_price) setCurrentPrice(updated.current_price)
          if (updated.lot_end_time) setLotEndTime(updated.lot_end_time)
          if (updated.bid_count !== undefined) setBidCount(updated.bid_count)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(bidChannel)
      supabase.removeChannel(itemChannel)
    }
  }, [itemId, isActive])

  return (
    <>
      <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900">
        {/* Current Price */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-zinc-400">
            {bidCount > 0 ? "Aktuelles Gebot" : "Startpreis"}
          </span>
          <span className="text-2xl font-bold">
            &euro;{currentPrice.toFixed(2)}
          </span>
        </div>

        {bidCount > 0 && (
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-zinc-500">Gebote</span>
            <span className="text-zinc-400">{bidCount}</span>
          </div>
        )}

        {/* Countdown */}
        {lotEndTime && (
          <div className="mt-3 mb-3">
            <CountdownTimer endTime={lotEndTime} />
          </div>
        )}

        {/* Bid Form */}
        {isActive ? (
          <BidForm
            slug={slug}
            itemId={itemId}
            currentPrice={currentPrice}
            startPrice={startPrice}
            bidCount={bidCount}
            isAuthenticated={isAuthenticated}
            onAuthRequired={() => setAuthModalOpen(true)}
            onBidPlaced={loadBids}
          />
        ) : blockStatus === "ended" ? (
          <div className="mt-3 py-3 px-4 rounded-lg bg-zinc-800 text-center">
            <p className="text-sm text-zinc-400">Auktion beendet</p>
            {bidCount > 0 && (
              <p className="text-lg font-bold mt-1">
                Zuschlag: &euro;{currentPrice.toFixed(2)}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <button
              disabled
              className="w-full py-3 rounded-lg bg-zinc-700 text-zinc-400 text-sm font-medium cursor-not-allowed"
            >
              Auktion noch nicht gestartet
            </button>
          </div>
        )}
      </div>

      {/* Bid History */}
      {bidsLoaded && bids.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2 text-zinc-400">
            Gebotsverlauf
          </h3>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {bids.slice(0, 15).map((bid) => (
              <div
                key={bid.id}
                className="flex items-center justify-between text-sm py-1.5 px-3 rounded bg-zinc-800/50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 font-mono text-xs">
                    {bid.user_hint || bid.user_id?.substring(0, 8) + "…"}
                  </span>
                  {bid.user_id === customer?.id && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900 text-blue-300">
                      Sie
                    </span>
                  )}
                  {bid.is_winning && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-900 text-green-300">
                      Höchstgebot
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium">
                    &euro;{bid.amount.toFixed(2)}
                  </span>
                  <span className="text-xs text-zinc-600">
                    {new Date(bid.created_at).toLocaleTimeString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </>
  )
}

// --- BidForm ---

function BidForm({
  slug,
  itemId,
  currentPrice,
  startPrice,
  bidCount,
  isAuthenticated,
  onAuthRequired,
  onBidPlaced,
}: {
  slug: string
  itemId: string
  currentPrice: number
  startPrice: number
  bidCount: number
  isAuthenticated: boolean
  onAuthRequired: () => void
  onBidPlaced: () => void
}) {
  const basePrice = bidCount === 0 ? startPrice : currentPrice
  const minIncrement = Math.max(1, basePrice * 0.05)
  const minimumBid = bidCount === 0 ? startPrice : basePrice + minIncrement

  const [amount, setAmount] = useState("")
  const [showProxy, setShowProxy] = useState(false)
  const [maxAmount, setMaxAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // Update minimum when price changes
  useEffect(() => {
    setAmount(minimumBid.toFixed(2))
  }, [minimumBid])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!isAuthenticated) {
      onAuthRequired()
      return
    }

    const token = getToken()
    if (!token) {
      onAuthRequired()
      return
    }

    setLoading(true)
    setError("")
    setSuccess("")

    try {
      const body: Record<string, number> = { amount: parseFloat(amount) }
      if (showProxy && maxAmount) body.max_amount = parseFloat(maxAmount)

      const res = await fetch(
        `${MEDUSA_URL}/store/auction-blocks/${slug}/items/${itemId}/bids`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-publishable-api-key": PUBLISHABLE_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        }
      )

      const data = await res.json()
      if (!res.ok) {
        setError(data.message || "Gebot fehlgeschlagen")
      } else if (data.outbid) {
        setError(data.message || "Überboten")
      } else {
        setSuccess(`Gebot von €${data.amount.toFixed(2)} erfolgreich!`)
        onBidPlaced()
      }
    } catch {
      setError("Netzwerkfehler")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <div>
        <label className="text-xs text-zinc-500">
          Ihr Gebot (min. &euro;{minimumBid.toFixed(2)})
        </label>
        <input
          type="number"
          step="0.01"
          min={minimumBid}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={() => setShowProxy(!showProxy)}
        className="text-xs text-zinc-400 hover:text-zinc-200"
      >
        {showProxy
          ? "Maximalgebot ausblenden"
          : "Maximalgebot setzen (Proxy-Bieten)"}
      </button>

      {showProxy && (
        <div>
          <label className="text-xs text-zinc-500">Maximalgebot</label>
          <input
            type="number"
            step="0.01"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            placeholder="System bietet automatisch bis zu diesem Betrag"
            className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:border-zinc-500 focus:outline-none placeholder:text-zinc-600"
          />
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {success && <p className="text-green-400 text-sm">{success}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-lg bg-white text-black text-sm font-semibold hover:bg-zinc-200 disabled:opacity-50 transition-colors"
      >
        {loading
          ? "Wird gesendet…"
          : isAuthenticated
            ? `Bieten: €${parseFloat(amount || "0").toFixed(2)}`
            : "Anmelden zum Bieten"}
      </button>
    </form>
  )
}

// --- CountdownTimer ---

function CountdownTimer({ endTime }: { endTime: string }) {
  const [remaining, setRemaining] = useState("")
  const [extended, setExtended] = useState(false)
  const [prevEndTime, setPrevEndTime] = useState(endTime)

  // Detect extension
  useEffect(() => {
    if (endTime !== prevEndTime) {
      setExtended(true)
      setPrevEndTime(endTime)
      const timer = setTimeout(() => setExtended(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [endTime, prevEndTime])

  useEffect(() => {
    function update() {
      const end = new Date(endTime).getTime()
      const now = Date.now()
      const diff = end - now

      if (diff <= 0) {
        setRemaining("Beendet")
        return
      }

      const days = Math.floor(diff / 86400000)
      const hours = Math.floor((diff % 86400000) / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)

      if (days > 0) {
        setRemaining(`${days}T ${hours}h ${minutes}m`)
      } else if (hours > 0) {
        setRemaining(`${hours}h ${minutes}m ${seconds}s`)
      } else {
        setRemaining(`${minutes}m ${seconds}s`)
      }
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [endTime])

  const isUrgent =
    remaining !== "Beendet" &&
    new Date(endTime).getTime() - Date.now() < 300000

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-500">Endet in</span>
      <div className="text-right">
        <span
          className={`text-sm font-mono font-bold ${
            isUrgent ? "text-red-400" : "text-zinc-300"
          }`}
        >
          {remaining}
        </span>
        {extended && (
          <p className="text-xs text-orange-400 mt-0.5">Verlängert!</p>
        )}
      </div>
    </div>
  )
}
