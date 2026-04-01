"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Clock, Gavel, AlertTriangle, Check, Info } from "lucide-react"
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
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { brevoBidPlaced } from "@/lib/brevo-tracking"
import { rudderTrack } from "@/lib/rudderstack"

/**
 * Tiered bid increment table (mirrors backend logic).
 */
function getMinIncrement(currentPrice: number): number {
  if (currentPrice < 10)   return 0.50
  if (currentPrice < 50)   return 1.00
  if (currentPrice < 200)  return 2.50
  if (currentPrice < 500)  return 5.00
  if (currentPrice < 2000) return 10.00
  return 25.00
}

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
  blockStartTime?: string | null
  extensionCount?: number
  suggestedBid?: number
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
  blockStartTime,
  extensionCount = 0,
  suggestedBid,
}: ItemBidSectionProps) {
  const { isAuthenticated, customer } = useAuth()
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [currentPrice, setCurrentPrice] = useState(initialPrice || startPrice)
  const [bidCount, setBidCount] = useState(initialBidCount)
  const [lotEndTime, setLotEndTime] = useState(initialLotEndTime)
  const [currentExtensionCount, setCurrentExtensionCount] = useState(extensionCount)
  const [bids, setBids] = useState<BidRecord[]>([])
  const [bidsLoaded, setBidsLoaded] = useState(false)
  const [newBidPulse, setNewBidPulse] = useState(false)
  // Own bid status: null = not loaded, true = winning, false = outbid/no bid
  const [userIsWinning, setUserIsWinning] = useState<boolean | null>(null)
  // Reactive status — ISR props may be up to 30s stale; refreshed on mount + via realtime
  const [liveBlockStatus, setLiveBlockStatus] = useState(blockStatus)
  const [liveItemStatus, setLiveItemStatus] = useState(itemStatus)

  // item.status is "open" when active (not "active") — check both to be safe
  const isActive = liveBlockStatus === "active" && (liveItemStatus === "active" || liveItemStatus === "open")
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  // Track time left for urgency banner
  useEffect(() => {
    if (!lotEndTime) return
    function updateTimeLeft() {
      setTimeLeft(new Date(lotEndTime!).getTime() - Date.now())
    }
    updateTimeLeft()
    const id = setInterval(updateTimeLeft, 1000)
    return () => clearInterval(id)
  }, [lotEndTime])

  // Fetch fresh status + price on mount to fix ISR-stale props (Fehler 1, 2, 6)
  useEffect(() => {
    fetch(`${MEDUSA_URL}/store/auction-blocks/${slug}/items/${itemId}`, {
      headers: { "x-publishable-api-key": PUBLISHABLE_KEY },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return
        const fi = data.block_item
        const fb = data.auction_block
        if (fb?.status) setLiveBlockStatus(fb.status)
        if (fi?.status) setLiveItemStatus(fi.status)
        if (fi?.current_price != null) setCurrentPrice(Number(fi.current_price))
        if (fi?.bid_count != null) setBidCount(fi.bid_count)
        if (fi?.lot_end_time) setLotEndTime(fi.lot_end_time)
      })
      .catch(() => {})
  }, [slug, itemId])

  // Fetch own bid status from authenticated account endpoint (mirrors BlockItemsGrid logic)
  useEffect(() => {
    if (!isAuthenticated) return
    const token = getToken()
    if (!token) return
    fetch(`${MEDUSA_URL}/store/account/bids`, {
      headers: {
        "x-publishable-api-key": PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.bids) return
        const ownBid = data.bids.find((b: any) => b.item?.id === itemId)
        // null = no bid placed (banner hidden); true/false = winning/outbid
        if (ownBid) setUserIsWinning(ownBid.is_winning === true)
      })
      .catch(() => {})
  }, [isAuthenticated, itemId])

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
    if (isActive || liveBlockStatus === "ended") {
      loadBids()
    }
  }, [isActive, liveBlockStatus, loadBids])

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
          const newBid = payload.new as { id: string; amount: number; is_winning: boolean; user_id: string; created_at: string }
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
            // If someone else placed a winning bid, we've been outbid
            if (customer && newBid.user_id !== customer.id) {
              setUserIsWinning((prev) => prev === true ? false : prev)
            }
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
          const updated = payload.new as { current_price?: number; lot_end_time?: string; bid_count?: number; status?: string }
          if (updated.current_price) setCurrentPrice(Number(updated.current_price))
          if (updated.lot_end_time) setLotEndTime(updated.lot_end_time)
          if (updated.bid_count !== undefined) setBidCount(updated.bid_count)
          if (updated.status) setLiveItemStatus(updated.status)
        }
      )
      .subscribe()

    // Broadcast channel: receives lot_extended events from the backend after anti-snipe kicks in
    const lotChannel = supabase
      .channel(`lot-${itemId}`)
      .on("broadcast", { event: "lot_extended" }, (payload) => {
        const { new_end_time, extension_count } = payload.payload as {
          item_id: string
          new_end_time: string
          extension_count: number
        }
        setLotEndTime(new_end_time)
        setCurrentExtensionCount(extension_count)
        toast("Time extended — auction still live", {
          duration: 5000,
          style: {
            background: "rgba(212, 165, 74, 0.15)",
            border: "1px solid rgba(212, 165, 74, 0.4)",
            color: "#d4a54a",
          },
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(bidChannel)
      supabase.removeChannel(itemChannel)
      supabase.removeChannel(lotChannel)
    }
  }, [itemId, isActive])

  return (
    <>
      <Card className="p-4">
        {/* Bid status indicator for authenticated user */}
        {isAuthenticated && userIsWinning !== null && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg mb-2.5 text-sm font-medium ${
            userIsWinning
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}>
            {userIsWinning ? (
              <><Check className="h-4 w-4" /> You are the highest bidder</>
            ) : (
              <><AlertTriangle className="h-4 w-4" /> You have been outbid</>
            )}
          </div>
        )}

        {/* Current Price */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-muted-foreground">
            {bidCount > 0 ? "Current Bid" : "Starting Price"}
          </span>
          <motion.span
            key={currentPrice}
            initial={newBidPulse ? { scale: 1.1 } : false}
            animate={{ scale: 1 }}
            className="text-2xl font-mono font-bold text-primary"
          >
            &euro;{currentPrice.toFixed(2)}
          </motion.span>
        </div>

        {bidCount > 0 && (
          <div className="flex items-center justify-between text-sm mb-0.5">
            <span className="text-muted-foreground">Bids</span>
            <Badge variant="secondary">{bidCount}</Badge>
          </div>
        )}

        {/* Countdown */}
        {lotEndTime && (
          <div className="mt-1.5 mb-1.5">
            <CountdownTimer endTime={lotEndTime} />
            {currentExtensionCount > 0 && (
              <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Extended {currentExtensionCount}&times;
              </p>
            )}
          </div>
        )}

        {/* Urgency banner for lots ending soon */}
        {isActive && timeLeft !== null && timeLeft > 0 && timeLeft < 5 * 60 * 1000 && (
          <div className={`mb-3 rounded-lg px-4 py-2 text-sm font-medium text-center animate-pulse ${
            timeLeft < 60 * 1000
              ? "bg-red-500/20 border border-red-500/50 text-red-400"
              : "bg-red-500/10 border border-red-500/30 text-red-400"
          }`}>
            {timeLeft < 60 * 1000
              ? "Final seconds — bid now!"
              : "Ending Soon — less than 5 minutes left"}
          </div>
        )}

        {/* Bid Form */}
        {isActive && (timeLeft === null || timeLeft > 0) ? (
          <BidForm
            slug={slug}
            itemId={itemId}
            currentPrice={currentPrice}
            startPrice={startPrice}
            bidCount={bidCount}
            isAuthenticated={isAuthenticated}
            onAuthRequired={() => setAuthModalOpen(true)}
            onBidPlaced={loadBids}
            onBidResult={(won) => setUserIsWinning(won)}
            onPriceUpdate={(price, count) => {
              if (price != null) setCurrentPrice(price)
              if (count != null) setBidCount(count)
            }}
            extensionCount={currentExtensionCount}
            suggestedBid={suggestedBid}
          />
        ) : liveBlockStatus === "ended" || (isActive && timeLeft !== null && timeLeft <= 0) ? (
          <div className="mt-3 py-4 px-4 rounded-lg bg-secondary text-center border border-primary/20">
            <p className="text-sm text-muted-foreground">Auction ended</p>
            {bidCount > 0 && (
              <p className="text-xl font-mono font-bold mt-1 text-primary">
                Sold for: &euro;{currentPrice.toFixed(2)}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <Button disabled className="w-full" variant="secondary">
              Auction not started yet
            </Button>
            {blockStartTime && (
              <p className="text-center text-xs text-muted-foreground">
                Starts{" "}
                {new Date(blockStartTime).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Europe/Berlin",
                })}{" "}
                CET
              </p>
            )}
          </div>
        )}
      </Card>

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
  onBidResult,
  onPriceUpdate,
  extensionCount,
  suggestedBid,
}: {
  slug: string
  itemId: string
  currentPrice: number
  startPrice: number
  bidCount: number
  isAuthenticated: boolean
  onAuthRequired: () => void
  onBidPlaced: () => void
  onBidResult?: (won: boolean) => void
  onPriceUpdate?: (price: number | null, count: number | null) => void
  extensionCount?: number
  suggestedBid?: number
}) {
  const basePrice = bidCount === 0 ? startPrice : currentPrice
  const minIncrement = getMinIncrement(basePrice)
  const minimumBid = bidCount === 0 ? startPrice : basePrice + minIncrement

  const [amount, setAmount] = useState("")
  const [showProxy, setShowProxy] = useState(false)
  const [maxAmount, setMaxAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Track whether the initial amount has been set once
  const suggestedBidUsed = useRef(false)

  useEffect(() => {
    if (!suggestedBidUsed.current) {
      // First mount: initialise with suggestedBid (from URL) or minimumBid
      setAmount(
        suggestedBid && suggestedBid >= minimumBid
          ? suggestedBid.toFixed(2)
          : minimumBid.toFixed(2)
      )
      suggestedBidUsed.current = true
      return
    }
    // Price changed via realtime: bump up only if user's current value is now below minimum
    setAmount((prev) => {
      const n = parseFloat(prev)
      return isNaN(n) || n < minimumBid ? minimumBid.toFixed(2) : prev
    })
  }, [minimumBid, suggestedBid])

  function handleSubmitClick() {
    if (!isAuthenticated) {
      onAuthRequired()
      return
    }

    const token = getToken()
    if (!token) {
      onAuthRequired()
      return
    }

    const val = parseFloat(amount)
    if (isNaN(val) || val < minimumBid) {
      toast.error(`Minimum bid is €${minimumBid.toFixed(2)}`, { duration: 5000 })
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
        if (data.code === "email_not_verified") {
          toast.error("Email not verified", {
            duration: 10000,
            description: "Please check your inbox and verify your email address before placing bids.",
          })
        } else {
          const msg = data.message || "Bid failed"
          toast.error(msg, { duration: 8000 })
        }
      } else if (data.outbid) {
        toast.error("You are not the highest bidder", {
          duration: 8000,
          description: `A proxy bid was already higher. Current bid: €${Number(data.current_price).toFixed(2)}.`,
        })
        onBidResult?.(false)
      } else if (data.max_updated) {
        if (data.current_price != null) onPriceUpdate?.(Number(data.current_price), data.bid_count ?? null)
        toast.success(`Maximum bid raised to €${Number(data.new_max_amount).toFixed(2)}`, {
          duration: 6000,
          description: "You remain the highest bidder.",
        })
        onBidResult?.(true)
        onBidPlaced()
      } else {
        toast.success(`Bid of €${data.amount.toFixed(2)} placed successfully!`, { duration: 6000 })
        brevoBidPlaced(itemId, data.amount, slug)
        rudderTrack("Bid Submitted", { amount: data.amount, block_item_id: itemId, slug })
        onBidResult?.(true)
        onBidPlaced()
      }
    } catch {
      toast.error("Network error — please try again", { duration: 6000 })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="mt-2 flex flex-col gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Your Bid</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              &euro;
            </span>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="pl-7 font-mono"
            />
          </div>
          <p className="text-xs text-muted-foreground/60 font-mono">
            Min. bid: &euro;{minimumBid.toFixed(2)}
            {bidCount > 0 && (
              <span className="ml-1.5 text-muted-foreground/40">
                (+&euro;{minIncrement.toFixed(2)})
              </span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowProxy(!showProxy)}
          className="flex items-center justify-center gap-1.5 w-full text-xs font-medium text-[#d4a54a]/80 hover:text-[#d4a54a] border border-[#d4a54a]/25 hover:border-[#d4a54a]/50 rounded-md py-1.5 transition-colors"
        >
          {showProxy
            ? "Hide maximum bid"
            : "↑ Set maximum bid (proxy bidding)"}
        </button>

        <AnimatePresence initial={false}>
          {showProxy && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
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
                <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug mt-1.5">
                  <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  Proxy bidding: The system will automatically bid on your behalf up to your maximum amount, using the minimum increment needed to stay ahead. Your maximum is kept private.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          type="button"
          disabled={loading}
          onClick={handleSubmitClick}
          className="w-full disabled:opacity-50 disabled:cursor-not-allowed"
          size="lg"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Processing...
            </span>
          ) : isAuthenticated
            ? `Place Bid: \u20ac${parseFloat(amount || "0").toFixed(2)}`
            : "Login to Bid"}
        </Button>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setConfirmOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Gavel className="h-10 w-10 text-primary mx-auto mb-4" />
              <h3 className="font-serif text-xl text-center mb-2">Confirm your bid</h3>
              <p className="text-center text-muted-foreground text-sm mb-4">
                You are bidding{" "}
                <span className="text-primary font-bold">
                  &euro;{parseFloat(amount || "0").toFixed(2)}
                </span>
                {showProxy && maxAmount && (
                  <span>
                    {" "}(Maximum: &euro;{parseFloat(maxAmount).toFixed(2)})
                  </span>
                )}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="flex-1 rounded-lg border border-border py-2.5 text-sm hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBid}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Processing...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Confirm Bid
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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

      if (diff < 60000) {
        setRemaining(`${seconds}s`)
      } else if (diff < 3600000) {
        // <60 min: show minutes + seconds
        setRemaining(`${minutes}m ${seconds}s`)
      } else if (days > 0) {
        setRemaining(`${days}d ${hours}h ${minutes}m`)
      } else {
        setRemaining(`${hours}h ${minutes}m`)
      }
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [endTime])

  const diff = new Date(endTime).getTime() - Date.now()
  const isUrgent = remaining !== "Ended" && diff < 300000
  const isCritical = remaining !== "Ended" && diff < 60000

  return (
    <div className={`flex items-center justify-between px-4 py-3 rounded-lg ${
      isCritical
        ? "bg-red-500/20 border border-red-500/50"
        : isUrgent
        ? "bg-destructive/10 border border-destructive/30"
        : "bg-[rgba(232,224,212,0.05)] border border-[rgba(232,224,212,0.12)]"
    }`}>
      <span className={`text-sm font-medium flex items-center gap-1.5 ${
        isCritical || isUrgent ? "text-red-400" : "text-muted-foreground"
      }`}>
        <Clock className="h-4 w-4" />
        Ends in
      </span>
      <div className="text-right">
        <span
          className={`font-mono font-bold tracking-tight ${
            isCritical
              ? "text-4xl text-red-400 animate-pulse"
              : isUrgent
              ? "text-2xl text-red-400 animate-pulse"
              : "text-2xl text-foreground"
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
