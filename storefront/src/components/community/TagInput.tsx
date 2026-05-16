"use client"

import { useState } from "react"

// Chip-based tag input for the composer. Enter or comma commits a tag;
// backspace on an empty input removes the last one. Lower-cased, max 8.
export function TagInput({
  value,
  onChange,
  max = 8,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  max?: number
}) {
  const [draft, setDraft] = useState("")

  function add(raw: string) {
    const tag = raw.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30)
    if (!tag || value.includes(tag) || value.length >= max) return
    onChange([...value, tag])
  }

  function commit() {
    if (draft.trim()) add(draft.trim())
    setDraft("")
  }

  return (
    <div className="cm-tag-input">
      {value.map((t) => (
        <span key={t} className="cm-tag-chip">
          #{t}
          <button
            type="button"
            aria-label={`Remove ${t}`}
            onClick={() => onChange(value.filter((x) => x !== t))}
          >
            ×
          </button>
        </span>
      ))}
      {value.length < max && (
        <input
          className="cm-tag-input-field"
          placeholder={value.length ? "Add tag…" : "Add tags…"}
          value={draft}
          onChange={(e) => {
            const v = e.target.value
            if (v.endsWith(",")) {
              add(v.slice(0, -1))
              setDraft("")
            } else {
              setDraft(v)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commit()
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={commit}
        />
      )}
    </div>
  )
}
