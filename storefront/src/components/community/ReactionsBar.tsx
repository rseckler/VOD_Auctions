"use client"

import { useState } from "react"
import { toggleReaction, CommunityError } from "@/lib/community-mutations"

const EMOJI = ["🔥", "❤️", "🤘", "👀", "💯", "🙏", "⚡"]

// Interactive reaction bar — the curated 7-emoji set with per-emoji counts.
// A click toggles the viewer's reaction; counts update optimistically.
export function ReactionsBar({
  targetKind,
  targetId,
  initialCount,
  initialBreakdown,
}: {
  targetKind: "post" | "comment"
  targetId: string
  initialCount: number
  initialBreakdown?: Record<string, number>
}) {
  const [count, setCount] = useState(initialCount)
  const [breakdown, setBreakdown] = useState<Record<string, number>>(
    initialBreakdown || {}
  )
  const [mine, setMine] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function react(emoji: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await toggleReaction(targetKind, targetId, emoji)
      setCount(r.count)
      setBreakdown((prev) => {
        const next = { ...prev }
        next[emoji] = Math.max(0, (next[emoji] || 0) + (r.reacted ? 1 : -1))
        if (next[emoji] === 0) delete next[emoji]
        return next
      })
      setMine((prev) => {
        const next = new Set(prev)
        if (r.reacted) next.add(emoji)
        else next.delete(emoji)
        return next
      })
    } catch (e) {
      setError(
        e instanceof CommunityError
          ? e.message
          : "Something went wrong — please try again."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cm-reactions-bar">
      {EMOJI.map((e) => {
        const n = breakdown[e] || 0
        return (
          <button
            key={e}
            type="button"
            className={"cm-react" + (mine.has(e) ? " is-active" : "")}
            onClick={() => react(e)}
            disabled={busy}
          >
            <span className="emoji">{e}</span>
            {n > 0 && <span>{n}</span>}
          </button>
        )
      })}
      <span className="cm-reactions-count">
        {error ? error : `${count} reaction${count === 1 ? "" : "s"}`}
      </span>
    </div>
  )
}
