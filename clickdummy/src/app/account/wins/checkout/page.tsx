"use client"

import { useFlow } from "@/context/FlowContext"
import { formatPrice } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { CreditCard, Truck, ShieldCheck } from "lucide-react"

export default function CheckoutPage() {
  const { step, setStep, userReBidAmount, userBidAmount } = useFlow()
  const router = useRouter()
  const finalPrice = userReBidAmount || userBidAmount || 92
  const shipping = 5.9
  const total = finalPrice + shipping

  const handlePay = () => {
    setStep(7)
    router.push("/account/wins/checkout/success")
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-2xl sm:text-3xl mb-2">Checkout</h1>
      <p className="text-muted-foreground mb-8">Zusammenfassung deiner gewonnenen Auktion</p>

      {/* Progress */}
      <div className="flex items-center gap-3 mb-8 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">1</div>
          <span className="text-primary font-medium">Zusammenfassung</span>
        </div>
        <div className="h-px flex-1 bg-border" />
        <div className="flex items-center gap-1.5">
          <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-muted-foreground font-bold">2</div>
          <span className="text-muted-foreground">Zahlung</span>
        </div>
        <div className="h-px flex-1 bg-border" />
        <div className="flex items-center gap-1.5">
          <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-muted-foreground font-bold">3</div>
          <span className="text-muted-foreground">Bestätigung</span>
        </div>
      </div>

      {/* Order summary */}
      <div className="rounded-xl border border-border bg-card p-4 mb-6">
        <h3 className="text-sm font-medium mb-4">Bestellübersicht</h3>
        <div className="flex gap-4 mb-4">
          <img
            src="https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=80&h=80&fit=crop"
            alt=""
            className="h-16 w-16 rounded-lg object-cover"
          />
          <div>
            <p className="text-sm font-medium">Lustmord — The Place Where the Black Stars Hang</p>
            <p className="text-xs text-muted-foreground">Side Effects, 1994, Vinyl, NM/NM</p>
            <p className="text-xs text-muted-foreground">Lot #07 — Dark Ambient & Drone</p>
          </div>
        </div>
        <div className="space-y-2 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Zuschlag</span>
            <span>{formatPrice(finalPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Versand (DHL Paket)</span>
            <span>{formatPrice(shipping)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 font-semibold">
            <span>Gesamt</span>
            <span className="text-primary">{formatPrice(total)}</span>
          </div>
        </div>
      </div>

      {/* Shipping address */}
      <div className="rounded-xl border border-border bg-card p-4 mb-6">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" /> Lieferadresse
        </h3>
        <div className="text-sm text-muted-foreground space-y-0.5">
          <p className="text-foreground font-medium">Max Mustermann</p>
          <p>Musterstraße 42</p>
          <p>10115 Berlin</p>
          <p>Deutschland</p>
        </div>
      </div>

      {/* Pay button */}
      <button
        onClick={handlePay}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <CreditCard className="h-4 w-4" />
        Weiter zur Zahlung (Stripe)
      </button>

      <div className="flex items-center justify-center gap-2 mt-4 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        Sichere Zahlung über Stripe
      </div>
    </div>
  )
}
