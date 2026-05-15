"use client"

import { useState } from "react"
import { toggleReaction, CommunityError } from "@/lib/community-mutations"

const EMOJI = ["🔥", "❤️", "🤘", "👀", "💯", "🙏", "⚡"]

// Interactive reaction bar. Increment 1: shows the curated 7-emoji set + the
// total count. A click toggles the viewer's reaction for that emoji.
export function ReactionsBar({
  targetKind,
  targetId,
  initialCount,
}: {
  targetKind: "post" | "comment"
  targetId: string
  initialCount: number
}) {
  const [count, setCount] = useState(initialCount)
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
      setMine((prev) => {
        const next = new Set(prev)
        if (r.reacted) next.add(emoji)
        else next.delete(emoji)
        return next
      })
    } catch (e) {
      setError(e instanceof CommunityError ? e.message : "Fehler — erneut versuchen.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cm-reactions-bar">
      {EMOJI.map((e) => (
        <button
          key={e}
          type="button"
          className={"cm-react" + (mine.has(e) ? " is-active" : "")}
          onClick={() => react(e)}
          disabled={busy}
        >
          <span className="emoji">{e}</span>
        </button>
      ))}
      <span className="cm-reactions-count">
        {error ? error : `${count} reaction${count === 1 ? "" : "s"}`}
      </span>
    </div>
  )
}
