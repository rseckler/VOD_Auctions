"use client"

import Link from "next/link"
import { blocks } from "@/data/blocks"
import { BlockCardVertical } from "@/components/BlockCard"
import { motion } from "framer-motion"
import { Disc3, ArrowRight, Flame } from "lucide-react"

export default function HomePage() {
  const activeBlocks = blocks.filter((b) => b.status === "active")
  const scheduledBlocks = blocks.filter((b) => b.status === "scheduled")

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 opacity-[0.03]">
          <Disc3 className="h-[400px] w-[400px] animate-[spin_20s_linear_infinite]" />
        </div>
        <div className="relative mx-auto max-w-4xl px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="font-serif text-4xl sm:text-6xl lg:text-7xl leading-tight mb-6">
              Seltene Tonträger.{" "}
              <span className="bg-gradient-to-r from-primary via-amber-300 to-primary bg-clip-text text-transparent">
                Kuratierte Auktionen.
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground leading-relaxed mb-8">
              Industrial, Experimental & Electronic Music — handverlesen aus einer Sammlung von über 30.000 Tonträgern.
              Thematisch kuratierte Auktionsblöcke statt Einzellistings.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/auctions"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Zu den Auktionen
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/auctions/dark-ambient-drone"
                className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3.5 text-sm font-medium hover:bg-secondary transition-colors"
              >
                <Flame className="h-4 w-4 text-primary" />
                Dark Ambient & Drone ansehen
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Live Ticker */}
      <div className="border-y border-border bg-card/50 overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-4">
          <span className="shrink-0 flex items-center gap-2 text-xs font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-active opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-status-active" />
            </span>
            LIVE
          </span>
          <div className="overflow-hidden whitespace-nowrap">
            <div className="inline-block animate-[marquee_30s_linear_infinite]">
              <span className="text-xs text-muted-foreground mx-6">
                Lot #07 Lustmord — The Place Where the Black Stars Hang: neues Gebot 78,00 EUR
              </span>
              <span className="text-xs text-muted-foreground mx-6">
                Lot #50 William Basinski — The Disintegration Loops: neues Gebot 98,00 EUR
              </span>
              <span className="text-xs text-muted-foreground mx-6">
                Lot #26 Earth — Earth 2: neues Gebot 89,00 EUR
              </span>
              <span className="text-xs text-muted-foreground mx-6">
                Lot #10 Nurse With Wound — Soliloquy for Lilith: neues Gebot 95,00 EUR
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Active blocks */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="font-serif text-2xl sm:text-3xl">Laufende Auktionen</h2>
            <p className="text-sm text-muted-foreground mt-1">Jetzt mitbieten</p>
          </div>
          <Link href="/auctions" className="text-sm text-primary hover:underline flex items-center gap-1">
            Alle ansehen <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {activeBlocks.map((block) => (
            <BlockCardVertical key={block.id} block={block} />
          ))}
        </div>
      </section>

      {/* Scheduled blocks */}
      <section className="mx-auto max-w-7xl px-4 pb-16">
        <h2 className="font-serif text-2xl sm:text-3xl mb-2">Demnächst</h2>
        <p className="text-sm text-muted-foreground mb-8">Kommende Auktionsblöcke</p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {scheduledBlocks.map((block) => (
            <BlockCardVertical key={block.id} block={block} />
          ))}
        </div>
      </section>

      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
