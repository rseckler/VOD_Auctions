"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Gavel, Shield, CreditCard, ChevronRight, ChevronLeft } from "lucide-react"

const STORAGE_KEY = "vod_onboarding_completed"

const slides = [
  {
    icon: Gavel,
    title: "How Proxy Bidding Works",
    description: "Set your maximum bid and our system automatically bids for you — using only the minimum increment needed to stay ahead. Your maximum amount is kept private from other bidders.",
    tip: "You only pay what's needed to win, not your maximum.",
  },
  {
    icon: Shield,
    title: "Anti-Sniping Protection",
    description: "If someone bids in the last 3 minutes before an auction ends, the timer automatically extends. This ensures the highest bid wins — not the fastest click.",
    tip: "No need to watch the clock. Bid early, bid your max.",
  },
  {
    icon: CreditCard,
    title: "Winning & Checkout",
    description: "Won an auction? You have 5 days to complete payment. You can combine multiple wins and catalog purchases into a single shipment to save on shipping costs.",
    tip: "Combined shipping means more records for less postage.",
  },
]

export function OnboardingModal() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const handler = () => {
      try {
        if (localStorage.getItem(STORAGE_KEY)) return
      } catch {}
      setStep(0)
      setOpen(true)
    }
    window.addEventListener("vod:registration-complete", handler)
    return () => window.removeEventListener("vod:registration-complete", handler)
  }, [])

  const complete = () => {
    try { localStorage.setItem(STORAGE_KEY, "true") } catch {}
    setOpen(false)
  }

  const slide = slides[step]
  const Icon = slide.icon
  const isLast = step === slides.length - 1

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) complete() }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden bg-background border-primary/20">
        {/* Progress */}
        <div className="flex gap-1 px-6 pt-5">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-secondary"}`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center">
            <Icon className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-serif mb-3">{slide.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            {slide.description}
          </p>
          <div className="bg-secondary/50 rounded-lg px-4 py-2.5 text-xs text-primary">
            {slide.tip}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-6 pb-5 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={complete}
            className="text-muted-foreground text-xs"
          >
            Skip
          </Button>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(step - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={complete}>
                Get Started
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep(step + 1)}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
