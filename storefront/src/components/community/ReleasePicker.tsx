"use client"

import { useEffect, useState } from "react"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"

export interface PickedRelease {
  id: string
  title: string | null
  artist_name?: string | null
  cover_image?: string | null
}

// Searchable catalog release picker for the composer — attaches a post to a
// release. Queries the public /store/catalog/suggest endpoint (debounced).
export function ReleasePicker({
  value,
  onChange,
}: {
  value: PickedRelease | null
  onChange: (r: PickedRelease | null) => void
}) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<PickedRelease[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `${MEDUSA_URL}/store/catalog/suggest?q=${encodeURIComponent(q)}&limit=8`,
          { headers: { "x-publishable-api-key": PUBLISHABLE_KEY } }
        )
        const d = await res.json()
        setResults(
          (d?.releases || []).map((r: any) => ({
            id: r.id,
            title: r.title,
            artist_name: r.artist_name,
            cover_image: r.coverImage,
          }))
        )
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  if (value) {
    return (
      <div className="cm-release-picked">
        <div
          className="cm-release-picked-cover"
          style={
            value.cover_image
              ? { backgroundImage: `url(${value.cover_image})` }
              : undefined
          }
        />
        <div className="cm-release-picked-info">
          <div className="cm-release-picked-label">Linked release</div>
          <div className="cm-release-picked-title">
            {value.title || value.id}
          </div>
          {value.artist_name && (
            <div className="cm-release-picked-artist">{value.artist_name}</div>
          )}
        </div>
        <button
          type="button"
          className="cm-btn cm-btn-ghost cm-btn-sm"
          onClick={() => onChange(null)}
        >
          Remove
        </button>
      </div>
    )
  }

  return (
    <div className="cm-release-picker">
      <input
        className="cm-release-picker-input"
        placeholder="Link a release — search the catalog…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
      />
      {open && (loading || results.length > 0) && (
        <div className="cm-release-results">
          {loading && results.length === 0 ? (
            <div className="cm-release-result-empty">Searching…</div>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                className="cm-release-result"
                onClick={() => {
                  onChange(r)
                  setQ("")
                  setOpen(false)
                }}
              >
                <div
                  className="cm-release-result-cover"
                  style={
                    r.cover_image
                      ? { backgroundImage: `url(${r.cover_image})` }
                      : undefined
                  }
                />
                <div className="cm-release-result-info">
                  <div className="cm-release-result-title">
                    {r.title || r.id}
                  </div>
                  {r.artist_name && (
                    <div className="cm-release-result-artist">
                      {r.artist_name}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
