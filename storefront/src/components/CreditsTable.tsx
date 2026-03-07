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
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      {entries.map((entry, i) =>
        entry.role ? (
          <div key={i} className="contents">
            <span className="text-xs text-primary/70 font-medium text-right py-0.5 whitespace-nowrap">
              {entry.role}
            </span>
            <span className="text-sm py-0.5 border-b border-white/[0.04]">
              {entry.name}
            </span>
          </div>
        ) : (
          <div key={i} className="col-span-2 text-sm py-0.5">
            {entry.name}
          </div>
        )
      )}
    </div>
  )
}
