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
    <dl className="space-y-1.5">
      {entries.map((entry, i) =>
        entry.role ? (
          <div key={i} className="flex gap-3 text-sm">
            <dt className="text-muted-foreground flex-shrink-0 min-w-[120px] max-w-[200px]">
              {entry.role}
            </dt>
            <dd>{entry.name}</dd>
          </div>
        ) : (
          <div key={i} className="text-sm">
            {entry.name}
          </div>
        )
      )}
    </dl>
  )
}
