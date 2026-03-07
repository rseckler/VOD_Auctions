"use client"

import { parseCredits, cleanCredits } from "@/lib/utils"

export function CreditsTable({ credits }: { credits: string }) {
  const entries = parseCredits(credits)

  // Fallback: if parsing yields no structured entries, show cleaned text
  if (!entries || entries.every((e) => !e.role)) {
    const cleaned = cleanCredits(credits)
    if (!cleaned) return null
    return (
      <p className="text-sm text-muted-foreground whitespace-pre-line">
        {cleaned}
      </p>
    )
  }

  return (
    <div className="space-y-1.5">
      {entries.map((entry, i) =>
        entry.role ? (
          <div key={i} className="py-0.5">
            <span className="text-[11px] text-primary/70 font-medium">
              {entry.role}
            </span>
            <div className="text-sm border-b border-white/[0.04] pb-1">
              {entry.name}
            </div>
          </div>
        ) : (
          <div key={i} className="text-sm py-0.5">
            {entry.name}
          </div>
        )
      )}
    </div>
  )
}
