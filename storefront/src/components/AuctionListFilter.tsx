"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { PackageOpen } from "lucide-react"
import { BlockCardHorizontal } from "./BlockCard"
import { staggerContainer } from "@/lib/motion"
import type { AuctionBlock } from "@/types"

type FilterTab = "all" | "active" | "upcoming" | "ended"

const TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "active", label: "Laufend" },
  { value: "upcoming", label: "Demnächst" },
  { value: "ended", label: "Beendet" },
]

export function AuctionListFilter({ blocks }: { blocks: AuctionBlock[] }) {
  const [tab, setTab] = useState<FilterTab>("all")

  const filtered = blocks.filter((b) => {
    switch (tab) {
      case "active":
        return b.status === "active"
      case "upcoming":
        return ["scheduled", "preview"].includes(b.status)
      case "ended":
        return b.status === "ended"
      default:
        return true
    }
  })

  const counts = {
    all: blocks.length,
    active: blocks.filter((b) => b.status === "active").length,
    upcoming: blocks.filter((b) =>
      ["scheduled", "preview"].includes(b.status)
    ).length,
    ended: blocks.filter((b) => b.status === "ended").length,
  }

  return (
    <div>
      {/* Filter Pills */}
      <div className="flex gap-2 mb-8">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.value
                ? "bg-primary text-[#1c1915]"
                : "text-muted-foreground border border-[rgba(232,224,212,0.08)] hover:border-[rgba(232,224,212,0.15)] hover:text-foreground"
            }`}
          >
            {t.label}
            {counts[t.value] > 0 && (
              <span className={`text-xs ${
                tab === t.value ? "opacity-70" : "text-muted-foreground/60"
              }`}>
                {counts[t.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-[rgba(232,224,212,0.08)] bg-[rgba(232,224,212,0.02)] p-16 text-center"
          >
            <PackageOpen className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
            <p className="text-muted-foreground">
              Keine Auktionen in dieser Kategorie.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key={tab}
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0 }}
            className="flex flex-col gap-4"
          >
            {filtered.map((b) => (
              <BlockCardHorizontal key={b.id} block={b} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
