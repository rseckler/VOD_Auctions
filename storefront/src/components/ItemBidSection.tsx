"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Clock, Gavel, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "./AuthProvider"
import { AuthModal } from "./AuthModal"
import { getToken } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"

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
  const [newBidPulse, setNewBidPulse] = useState(false)

  const isActive = blockStatus === "active" && itemStatus === "active"

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
          setNewBidPulse(true)
          setTimeout(() => setNewBidPulse(false), 1000)
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
      <Card className="p-5">
        {/* Current Price */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">
            {bidCount > 0 ? "Current Bid" : "Starting Price"}
          </span>
          <motion.span
            key={currentPrice}
            initial={newBidPulse ? { scale: 1.1 } : false}
            animate={{ scale: 1 }}
            className="text-3xl font-mono font-bold text-primary"
          >
            &euro;{currentPrice.toFixed(2)}
          </motion.span>
        </div>

        {bidCount > 0 && (
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Bids</span>
            <Badge variant="secondary">{bidCount}</Badge>
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
          <div className="mt-3 py-4 px-4 rounded-lg bg-secondary text-center border border-primary/20">
            <p className="text-sm text-muted-foreground">Auction ended</p>
            {bidCount > 0 && (
              <p className="text-xl font-mono font-bold mt-1 text-primary">
                Sold for: &euro;{currentPrice.toFixed(2)}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <Button disabled className="w-full" variant="secondary">
              Auction not started yet
            </Button>
          </div>
        )}
      </Card>

      {/* Bid History */}
      {bidsLoaded && bids.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground flex items-center gap-1.5">
            <Gavel className="h-3.5 w-3.5" />
            Bid History
          </h3>
          <ScrollArea className="h-48">
            <div className="space-y-1">
              {bids.slice(0, 15).map((bid) => (
                <div
                  key={bid.id}
                  className={`flex items-center justify-between text-sm py-1.5 px-3 rounded ${
                    bid.user_id === customer?.id
                      ? "bg-primary/5 border-l-2 border-primary"
                      : "bg-secondary/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-mono text-xs">
                      {bid.user_hint || bid.user_id?.substring(0, 8) + "…"}
                    </span>
                    {bid.user_id === customer?.id && (
                      <Badge variant="outline" className="text-[10px] h-4 bg-primary/10 text-primary border-primary/30">
                        You
                      </Badge>
                    )}
                    {bid.is_winning && (
                      <Badge variant="outline" className="text-[10px] h-4 bg-bid-winning/10 text-bid-winning border-bid-winning/30">
                        Highest Bid
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-medium">
                      &euro;{bid.amount.toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground/60">
                      {new Date(bid.created_at).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
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
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    setAmount(minimumBid.toFixed(2))
  }, [minimumBid])

  function handleSubmitClick(e: React.FormEvent) {
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

    setConfirmOpen(true)
  }

  async function confirmBid() {
    setConfirmOpen(false)
    setLoading(true)

    const token = getToken()
    if (!token) return

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
        toast.error(data.message || "Bid failed")
      } else if (data.outbid) {
        toast.warning(data.message || "Outbid")
      } else {
        toast.success(`Bid of €${data.amount.toFixed(2)} placed successfully!`)
        onBidPlaced()
      }
    } catch {
      toast.error("Network error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmitClick} className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">
            Your Bid (min. &euro;{minimumBid.toFixed(2)})
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              &euro;
            </span>
            <Input
              type="number"
              step="0.01"
              min={minimumBid}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="pl-7 font-mono"
            />
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={() => setShowProxy(!showProxy)}
        >
          {showProxy
            ? "Hide maximum bid"
            : "Set maximum bid (proxy bidding)"}
        </Button>

        <AnimatePresence>
          {showProxy && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-1.5">
                <Label className="text-xs">Maximum Bid</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    &euro;
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    placeholder="System bids automatically"
                    className="pl-7 font-mono"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          type="submit"
          disabled={loading}
          className="w-full"
          size="lg"
        >
          {loading
            ? "Submitting…"
            : isAuthenticated
              ? `Bid: €${parseFloat(amount || "0").toFixed(2)}`
              : "Login to Bid"}
        </Button>
      </form>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Bid</DialogTitle>
            <DialogDescription>
              Are you sure you want to bid &euro;{parseFloat(amount || "0").toFixed(2)}?
              {showProxy &&
                maxAmount &&
                ` (Maximum bid: €${parseFloat(maxAmount).toFixed(2)})`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={confirmBid}>Place Bid</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// --- CountdownTimer ---

function CountdownTimer({ endTime }: { endTime: string }) {
  const [remaining, setRemaining] = useState("")
  const [extended, setExtended] = useState(false)
  const [prevEndTime, setPrevEndTime] = useState(endTime)

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
        setRemaining("Ended")
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
    remaining !== "Ended" &&
    new Date(endTime).getTime() - Date.now() < 300000

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" />
        Ends in
      </span>
      <div className="text-right">
        <span
          className={`text-sm font-mono font-bold ${
            isUrgent ? "text-destructive animate-pulse" : "text-foreground"
          }`}
        >
          {remaining}
        </span>
        {extended && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs mt-0.5 flex items-center justify-end gap-1"
          >
            <Badge
              variant="outline"
              className="text-[10px] h-4 border-primary text-primary"
            >
              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
              Extended!
            </Badge>
          </motion.p>
        )}
      </div>
    </div>
  )
}
