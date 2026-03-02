"use client"

import { useState } from "react"
import { blocks } from "@/data/blocks"
import { BlockCardHorizontal } from "@/components/BlockCard"

const filters = [
  { key: "all", label: "Alle" },
  { key: "active", label: "Laufend" },
  { key: "scheduled", label: "Demnächst" },
  { key: "ended", label: "Beendet" },
]

export default function AuctionsPage() {
  const [filter, setFilter] = useState("all")

  const filtered = filter === "all" ? blocks : blocks.filter((b) => b.status === filter)

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="font-serif text-3xl sm:text-4xl mb-2">Auktionen</h1>
      <p className="text-muted-foreground mb-8">
        Kuratierte Themen-Auktionsblöcke mit seltenen Tonträgern
      </p>

      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filtered.map((block) => (
          <BlockCardHorizontal key={block.id} block={block} />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <p className="text-muted-foreground">Keine Auktionen in dieser Kategorie.</p>
          </div>
        )}
      </div>
    </div>
  )
}
