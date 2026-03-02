"use client"

import { useFlow } from "@/context/FlowContext"
import { formatPrice } from "@/lib/utils"
import Link from "next/link"
import { CheckCircle, ArrowRight } from "lucide-react"
import { motion } from "framer-motion"

export default function CheckoutSuccessPage() {
  const { userReBidAmount, userBidAmount } = useFlow()
  const finalPrice = userReBidAmount || userBidAmount || 92
  const shipping = 5.9
  const total = finalPrice + shipping

  return (
    <div className="max-w-lg mx-auto text-center">
      {/* Progress */}
      <div className="flex items-center gap-3 mb-12 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="h-6 w-6 rounded-full bg-status-active flex items-center justify-center text-green-950 font-bold">
            <CheckCircle className="h-3.5 w-3.5" />
          </div>
          <span className="text-status-active">Zusammenfassung</span>
        </div>
        <div className="h-px flex-1 bg-status-active" />
        <div className="flex items-center gap-1.5">
          <div className="h-6 w-6 rounded-full bg-status-active flex items-center justify-center text-green-950 font-bold">
            <CheckCircle className="h-3.5 w-3.5" />
          </div>
          <span className="text-status-active">Zahlung</span>
        </div>
        <div className="h-px flex-1 bg-status-active" />
        <div className="flex items-center gap-1.5">
          <div className="h-6 w-6 rounded-full bg-status-active flex items-center justify-center text-green-950 font-bold">
            <CheckCircle className="h-3.5 w-3.5" />
          </div>
          <span className="text-status-active">Bestätigung</span>
        </div>
      </div>

      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.1 }}>
        <CheckCircle className="h-16 w-16 text-status-active mx-auto mb-4" />
      </motion.div>

      <h1 className="font-serif text-3xl mb-2">Zahlung erfolgreich!</h1>
      <p className="text-muted-foreground mb-8">
        Vielen Dank für deinen Einkauf. Du erhältst eine Bestätigung per E-Mail.
      </p>

      <div className="rounded-xl border border-border bg-card p-4 mb-6 text-left">
        <div className="flex gap-4 mb-4">
          <img
            src="https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=80&h=80&fit=crop"
            alt=""
            className="h-16 w-16 rounded-lg object-cover"
          />
          <div>
            <p className="text-sm font-medium">Lustmord — The Place Where the Black Stars Hang</p>
            <p className="text-xs text-muted-foreground">Vinyl, NM/NM, 1994</p>
          </div>
        </div>
        <div className="space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Zuschlag</span>
            <span>{formatPrice(finalPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Versand</span>
            <span>{formatPrice(shipping)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t border-border pt-2 mt-2">
            <span>Gesamt bezahlt</span>
            <span className="text-primary">{formatPrice(total)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/account/wins"
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Meine Bestellungen
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/auctions"
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-sm hover:bg-secondary"
        >
          Weitere Auktionen
        </Link>
      </div>
    </div>
  )
}
