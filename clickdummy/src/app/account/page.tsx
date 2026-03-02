"use client"

import Link from "next/link"
import { useFlow } from "@/context/FlowContext"
import { Gavel, Trophy, ArrowRight } from "lucide-react"

export default function AccountPage() {
  const { step } = useFlow()

  const activeBids = step >= 2 ? 1 : 0
  const wins = step >= 6 ? 1 : 0

  return (
    <div>
      <h1 className="font-serif text-2xl sm:text-3xl mb-2">Willkommen, Max!</h1>
      <p className="text-muted-foreground mb-8">Dein Account-Überblick</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/account/bids" className="group rounded-xl border border-border bg-card p-6 hover:border-primary/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="rounded-lg bg-primary/10 p-2.5">
              <Gavel className="h-5 w-5 text-primary" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <p className="text-3xl font-bold mb-1">{activeBids}</p>
          <p className="text-sm text-muted-foreground">Aktive Gebote</p>
        </Link>

        <Link href="/account/wins" className="group rounded-xl border border-border bg-card p-6 hover:border-primary/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="rounded-lg bg-status-active/10 p-2.5">
              <Trophy className="h-5 w-5 text-status-active" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <p className="text-3xl font-bold mb-1">{wins}</p>
          <p className="text-sm text-muted-foreground">Gewonnene Auktionen</p>
        </Link>
      </div>
    </div>
  )
}
