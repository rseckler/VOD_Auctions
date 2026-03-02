"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"

export const FLOW_STEPS = [
  { step: 0, name: "Besucher", description: "Nicht eingeloggt — Stöbern", path: "/" },
  { step: 1, name: "Registriert", description: "Account erstellt — Bieten möglich", path: "/auctions/dark-ambient-drone/07" },
  { step: 2, name: "Gebot abgegeben", description: "Erstes Gebot platziert", path: "/auctions/dark-ambient-drone/07" },
  { step: 3, name: "Überboten", description: "Ein anderer Bieter war schneller", path: "/auctions/dark-ambient-drone/07" },
  { step: 4, name: "Erneut geboten", description: "Höheres Gebot platziert", path: "/auctions/dark-ambient-drone/07" },
  { step: 5, name: "Auktion endet", description: "Countdown < 5 Minuten", path: "/auctions/dark-ambient-drone/07" },
  { step: 6, name: "Gewonnen!", description: "Zuschlag erhalten", path: "/auctions/dark-ambient-drone/07" },
  { step: 7, name: "Bezahlt", description: "Checkout abgeschlossen", path: "/account/wins/checkout/success" },
  { step: 8, name: "Versendet", description: "Paket unterwegs", path: "/account/wins" },
  { step: 9, name: "Zugestellt", description: "Lieferung abgeschlossen", path: "/account/wins" },
] as const

interface FlowContextType {
  step: number
  isLoggedIn: boolean
  userBidAmount: number | null
  userReBidAmount: number | null
  setStep: (step: number) => void
  advance: () => string
  reset: () => void
  login: () => void
  logout: () => void
  placeBid: (amount: number) => void
  placeReBid: (amount: number) => void
}

const FlowContext = createContext<FlowContextType | null>(null)

export function FlowProvider({ children }: { children: ReactNode }) {
  const [step, setStepState] = useState(0)
  const [userBidAmount, setUserBidAmount] = useState<number | null>(null)
  const [userReBidAmount, setUserReBidAmount] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("vod-flow-step")
    const savedBid = localStorage.getItem("vod-user-bid")
    const savedReBid = localStorage.getItem("vod-user-rebid")
    if (saved) setStepState(parseInt(saved, 10))
    if (savedBid) setUserBidAmount(parseFloat(savedBid))
    if (savedReBid) setUserReBidAmount(parseFloat(savedReBid))
    setMounted(true)
  }, [])

  const setStep = useCallback((s: number) => {
    setStepState(s)
    localStorage.setItem("vod-flow-step", String(s))
  }, [])

  const advance = useCallback((): string => {
    const next = Math.min(step + 1, 9)
    setStep(next)
    return FLOW_STEPS[next].path
  }, [step, setStep])

  const reset = useCallback(() => {
    setStep(0)
    setUserBidAmount(null)
    setUserReBidAmount(null)
    localStorage.removeItem("vod-user-bid")
    localStorage.removeItem("vod-user-rebid")
  }, [setStep])

  const login = useCallback(() => {
    if (step < 1) setStep(1)
  }, [step, setStep])

  const logout = useCallback(() => {
    reset()
  }, [reset])

  const placeBid = useCallback((amount: number) => {
    setUserBidAmount(amount)
    localStorage.setItem("vod-user-bid", String(amount))
    setStep(2)
  }, [setStep])

  const placeReBid = useCallback((amount: number) => {
    setUserReBidAmount(amount)
    localStorage.setItem("vod-user-rebid", String(amount))
    setStep(4)
  }, [setStep])

  if (!mounted) return <div className="min-h-screen bg-[#1c1915]" />

  return (
    <FlowContext.Provider
      value={{
        step,
        isLoggedIn: step >= 1,
        userBidAmount,
        userReBidAmount,
        setStep,
        advance,
        reset,
        login,
        logout,
        placeBid,
        placeReBid,
      }}
    >
      {children}
    </FlowContext.Provider>
  )
}

export function useFlow() {
  const ctx = useContext(FlowContext)
  if (!ctx) throw new Error("useFlow must be used within FlowProvider")
  return ctx
}
