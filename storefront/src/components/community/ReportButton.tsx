"use client"

import { useState } from "react"
import { reportContent, CommunityError } from "@/lib/community-mutations"

const REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "off_topic", label: "Off-topic" },
  { value: "illegal", label: "Illegal content" },
  { value: "other", label: "Other" },
]

// Report a post or comment for moderation. Compact inline reason picker.
export function ReportButton({
  targetKind,
  targetId,
}: {
  targetKind: "post" | "comment"
  targetId: string
}) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(reason: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await reportContent(targetKind, targetId, reason)
      setDone(true)
      setOpen(false)
    } catch (e) {
      setError(e instanceof CommunityError ? e.message : "Could not report.")
    } finally {
      setBusy(false)
    }
  }

  if (done) return <span className="cm-report-done">Reported ✓</span>

  return (
    <span className="cm-report">
      <button
        type="button"
        className="cm-report-btn"
        onClick={() => setOpen((o) => !o)}
      >
        Report
      </button>
      {open && (
        <span className="cm-report-menu">
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              disabled={busy}
              onClick={() => submit(r.value)}
            >
              {r.label}
            </button>
          ))}
        </span>
      )}
      {error && <span className="cm-composer-error">{error}</span>}
    </span>
  )
}
