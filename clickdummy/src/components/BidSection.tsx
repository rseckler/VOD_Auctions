"use client"

import { useState } from "react"
import { useFlow } from "@/context/FlowContext"
import { formatPrice, timeAgo } from "@/lib/utils"
import { bidHistoryForLot7 } from "@/data/bids"
import { CountdownTimer } from "./CountdownTimer"
import { AuthModal } from "./AuthModal"
import { motion, AnimatePresence } from "framer-motion"
import { Gavel, Trophy, AlertTriangle, Check, PartyPopper, CreditCard } from "lucide-react"
import Link from "next/link"

export function BidSection() {
  const { step, isLoggedIn, userBidAmount, userReBidAmount, placeBid, placeReBid, setStep } = useFlow()
  const [bidInput, setBidInput] = useState("")
  const [showConfirm, setShowConfirm] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [pendingAmount, setPendingAmount] = useState(0)

  const currentHighest = step >= 4 && userReBidAmount ? userReBidAmount :
    step >= 3 ? 85 :
    step >= 2 && userBidAmount ? userBidAmount :
    78

  const isWon = step >= 6
  const isOutbid = step === 3
  const isUserHighest = (step === 2 || step >= 4) && !isOutbid
  const isEnding = step === 5

  const allBids = (() => {
    const bids = [...bidHistoryForLot7]
    if (step >= 2 && userBidAmount) {
      bids.push({ id: "bid-user-1", itemId: "itm-007", bidder: "Du", amount: userBidAmount, timestamp: "2026-03-09T10:00:00Z", isUser: true })
    }
    if (step >= 3) {
      bids.push({ id: "bid-outbid", itemId: "itm-007", bidder: "vinyl_hunter_88", amount: 85, timestamp: "2026-03-09T14:30:00Z" })
    }
    if (step >= 4 && userReBidAmount) {
      bids.push({ id: "bid-user-2", itemId: "itm-007", bidder: "Du", amount: userReBidAmount, timestamp: "2026-03-09T16:00:00Z", isUser: true })
    }
    return bids.sort((a, b) => b.amount - a.amount)
  })()

  const handleBidClick = () => {
    const amount = parseFloat(bidInput)
    if (!amount || amount <= currentHighest) return
    setPendingAmount(amount)
    setShowConfirm(true)
  }

  const confirmBid = () => {
    if (step < 2) {
      placeBid(pendingAmount)
    } else {
      placeReBid(pendingAmount)
    }
    setShowConfirm(false)
    setBidInput("")
  }

  const minBid = currentHighest + 1

  return (
    <div className="space-y-4">
      {/* Won overlay */}
      {isWon && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl border-2 border-status-active bg-green-500/5 p-6 text-center"
        >
          <PartyPopper className="h-10 w-10 text-status-active mx-auto mb-3" />
          <h3 className="font-serif text-2xl text-status-active mb-1">Glückwunsch!</h3>
          <p className="text-sm text-muted-foreground mb-2">Du hast dieses Lot gewonnen.</p>
          <p className="text-2xl font-bold text-primary mb-4">{formatPrice(currentHighest)}</p>
          <Link
            href="/account/wins/checkout"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <CreditCard className="h-4 w-4" />
            Jetzt bezahlen
          </Link>
        </motion.div>
      )}

      {/* Outbid alert */}
      {isOutbid && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="rounded-xl border border-bid-outbid/30 bg-orange-500/5 p-4 flex items-start gap-3"
        >
          <AlertTriangle className="h-5 w-5 text-bid-outbid shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-bid-outbid">Du wurdest überboten!</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              vinyl_hunter_88 hat {formatPrice(85)} geboten. Biete jetzt erneut!
            </p>
          </div>
        </motion.div>
      )}

      {/* Ending warning */}
      {isEnding && !isWon && (
        <div className="rounded-xl border border-destructive/30 bg-red-500/5 p-4 text-center animate-pulse">
          <p className="text-sm font-medium text-destructive">Auktion endet in Kürze!</p>
          <p className="text-xs text-muted-foreground mt-1">Auto-Extension: Gebot in letzten 5 Min. verlängert um 5 Min.</p>
        </div>
      )}

      {/* Price & Countdown */}
      {!isWon && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-muted-foreground">Aktuelles Gebot</p>
              <p className="text-2xl font-bold text-primary">{formatPrice(currentHighest)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-1">Endet in</p>
              <CountdownTimer endDate="2026-03-15T22:00:00Z" />
            </div>
          </div>

          {isUserHighest && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 mb-3">
              <Trophy className="h-4 w-4 text-status-active" />
              <span className="text-sm text-status-active font-medium">Du bist Höchstbietender</span>
            </div>
          )}

          {/* Bid form */}
          {isLoggedIn && !isWon && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  value={bidInput}
                  onChange={(e) => setBidInput(e.target.value)}
                  placeholder={`Min. ${formatPrice(minBid)}`}
                  min={minBid}
                  step={1}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">EUR</span>
              </div>
              <button
                onClick={handleBidClick}
                disabled={!bidInput || parseFloat(bidInput) <= currentHighest}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Gavel className="h-4 w-4" />
                Bieten
              </button>
            </div>
          )}

          {!isLoggedIn && (
            <button
              onClick={() => setShowAuth(true)}
              className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Anmelden zum Bieten
            </button>
          )}
        </div>
      )}

      {/* Bid history */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="text-sm font-medium mb-3">Gebotsverlauf ({allBids.length})</h4>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {allBids.map((bid, i) => (
            <div
              key={bid.id}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                bid.isUser ? "bg-green-500/10 border border-green-500/20" : i === 0 && !bid.isUser ? "bg-secondary" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={bid.isUser ? "font-medium text-status-active" : "text-muted-foreground"}>
                  {bid.bidder}
                </span>
                {i === 0 && (
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    Höchstgebot
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="font-medium">{formatPrice(bid.amount)}</span>
                <span className="block text-xs text-muted-foreground">{timeAgo(bid.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confirm dialog */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Gavel className="h-10 w-10 text-primary mx-auto mb-4" />
              <h3 className="font-serif text-xl text-center mb-2">Gebot bestätigen</h3>
              <p className="text-center text-muted-foreground text-sm mb-4">
                Du bietest <span className="text-primary font-bold">{formatPrice(pendingAmount)}</span> auf dieses Lot.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 rounded-lg border border-border py-2.5 text-sm hover:bg-secondary transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={confirmBid}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Check className="h-4 w-4" />
                  Bestätigen
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )
}
