"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/components/AuthProvider"
import { createReview, CommunityError } from "@/lib/community-mutations"

function textToHtml(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return `<p>${esc(text.trim()).replace(/\n/g, "<br>")}</p>`
}

// Interactive 1–5 star review composer for a release. One review per member
// per release — a repeat submit updates the existing review.
export function ReviewComposer({ releaseId }: { releaseId: string }) {
  const { isAuthenticated } = useAuth()
  const router = useRouter()
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!isAuthenticated) {
    return (
      <div className="cm-empty">
        <Link href="/account" className="cm-link-gold">
          Melde dich an
        </Link>{" "}
        um dieses Release zu bewerten.
      </div>
    )
  }

  if (done) {
    return <div className="cm-empty">Danke — deine Bewertung ist gespeichert ✓</div>
  }

  async function submit() {
    if (busy) return
    if (rating < 1) {
      setError("Bitte wähle 1–5 Sterne.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await createReview({
        release_id: releaseId,
        rating,
        body_html: text.trim() ? textToHtml(text) : undefined,
      })
      setDone(true)
      router.refresh()
    } catch (e) {
      setError(
        e instanceof CommunityError ? e.message : "Fehler — erneut versuchen."
      )
    } finally {
      setBusy(false)
    }
  }

  const shown = hover || rating

  return (
    <div className="cm-review-composer">
      <div className="cm-rating-picker">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={"cm-star-btn" + (n <= shown ? " is-filled" : "")}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            aria-label={`${n} Sterne`}
          >
            ★
          </button>
        ))}
        <span className="cm-rating-picker-label">
          {rating > 0 ? `${rating}/5` : "Bewerten"}
        </span>
      </div>
      <textarea
        className="cm-composer-input"
        placeholder="Optional: ein paar Worte zu diesem Release…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="cm-composer-actions">
        {error && <span className="cm-composer-error">{error}</span>}
        <button
          type="button"
          className="cm-btn cm-btn-primary cm-btn-sm"
          onClick={submit}
          disabled={busy}
          style={{ marginLeft: "auto" }}
        >
          {busy ? "Senden…" : "Bewertung abgeben"}
        </button>
      </div>
    </div>
  )
}
