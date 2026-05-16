"use client"

import { useState } from "react"
import { toggleSaved, CommunityError } from "@/lib/community-mutations"

// Bookmark toggle for a post. Optimistic; the initial state is not known
// server-side (per-viewer), so it starts un-saved and reflects the toggle.
export function SaveButton({ postId }: { postId: string }) {
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onClick() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await toggleSaved(postId)
      setSaved(r.saved)
    } catch (e) {
      setError(e instanceof CommunityError ? e.message : "Could not save.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={"cm-save-btn" + (saved ? " is-saved" : "")}
      onClick={onClick}
      disabled={busy}
      title={saved ? "Saved to your bookmarks" : "Save to bookmarks"}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill={saved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />
      </svg>
      {saved ? "Saved" : "Save"}
      {error && (
        <span className="cm-composer-error" style={{ marginLeft: 6 }}>
          {error}
        </span>
      )}
    </button>
  )
}
