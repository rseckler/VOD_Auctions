import { useState, useEffect, useRef, useMemo } from "react"
import { C, T, S } from "../admin-tokens"
import { Modal, Btn } from "../admin-ui"
import { ISO_COUNTRIES, filterCountries, flagFor, type IsoCountry } from "../../data/country-iso"

type PickerItem = { id: string; name: string; slug?: string | null }

type EntityPickerModalProps = {
  title: string
  endpoint: string
  responseKey: string
  onSelect: (item: PickerItem) => void
  onClose: () => void
}

function EntityPickerModal({ title, endpoint, responseKey, onSelect, onClose }: EntityPickerModalProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PickerItem[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`${endpoint}?q=${encodeURIComponent(query)}&limit=20`, { credentials: "include" })
        const data = await res.json()
        setResults(data[responseKey] || [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [query, endpoint, responseKey])

  return (
    <Modal title={title} onClose={onClose}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type to search..."
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: S.radius.sm,
          border: `1px solid ${C.border}`,
          background: C.card,
          color: C.text,
          fontSize: 14,
          marginBottom: S.gap.md,
          boxSizing: "border-box",
        }}
      />

      {loading && (
        <div style={{ ...T.small, color: C.muted, textAlign: "center", padding: S.gap.md }}>
          Searching…
        </div>
      )}

      {!loading && query.length >= 2 && results.length === 0 && (
        <div style={{ ...T.small, color: C.muted, textAlign: "center", padding: S.gap.md }}>
          No results for "{query}"
        </div>
      )}

      {!loading && results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {results.map((item) => (
            <button
              key={item.id}
              onClick={() => { onSelect(item); onClose() }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: S.radius.sm,
                border: "none",
                background: "transparent",
                color: C.text,
                cursor: "pointer",
                fontSize: 14,
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = C.hover)}
              onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}

      {query.length < 2 && (
        <div style={{ ...T.micro, color: C.muted, textAlign: "center" }}>
          Type at least 2 characters to search
        </div>
      )}
    </Modal>
  )
}

export function ArtistPickerModal({ onSelect, onClose }: { onSelect: (item: PickerItem) => void; onClose: () => void }) {
  return (
    <EntityPickerModal
      title="Select Artist"
      endpoint="/admin/artists/suggest"
      responseKey="artists"
      onSelect={onSelect}
      onClose={onClose}
    />
  )
}

export function LabelPickerModal({ onSelect, onClose }: { onSelect: (item: PickerItem) => void; onClose: () => void }) {
  return (
    <EntityPickerModal
      title="Select Label"
      endpoint="/admin/labels/suggest"
      responseKey="labels"
      onSelect={onSelect}
      onClose={onClose}
    />
  )
}

/**
 * CountryPickerModal (rc51.1 R4) — ISO-3166-1 alpha-2 mit Flag + EN/DE-Search.
 * Keine API calls — statische Liste (249 Einträge), client-side Filter.
 */
export function CountryPickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (country: IsoCountry) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo(() => filterCountries(query), [query])

  return (
    <Modal title="Select Country (ISO-3166-1 alpha-2)" onClose={onClose}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type to search — English, Deutsch, or ISO code…"
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: S.radius.sm,
          border: `1px solid ${C.border}`,
          background: C.card,
          color: C.text,
          fontSize: 14,
          marginBottom: S.gap.md,
          boxSizing: "border-box",
        }}
      />

      <div
        style={{
          maxHeight: 400,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {results.length === 0 && (
          <div style={{ ...T.small, color: C.muted, textAlign: "center", padding: S.gap.md }}>
            No countries match "{query}"
          </div>
        )}
        {results.map((country) => (
          <button
            key={country.code}
            onClick={() => {
              onSelect(country)
              onClose()
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: S.gap.md,
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              borderRadius: S.radius.sm,
              border: "none",
              background: "transparent",
              color: C.text,
              cursor: "pointer",
              fontSize: 14,
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = C.hover)}
            onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{flagFor(country.code)}</span>
            <span style={{ flex: 1 }}>
              {country.nameEn}
              {country.nameDe !== country.nameEn && (
                <span style={{ ...T.small, color: C.muted, marginLeft: 6 }}>
                  · {country.nameDe}
                </span>
              )}
            </span>
            <span
              style={{
                ...T.small,
                color: C.muted,
                fontFamily: "monospace",
                background: C.subtle,
                padding: "2px 6px",
                borderRadius: S.radius.sm,
              }}
            >
              {country.code}
            </span>
          </button>
        ))}
      </div>

      <div style={{ ...T.micro, color: C.muted, textAlign: "center", marginTop: S.gap.md }}>
        {ISO_COUNTRIES.length} countries · ISO-3166-1 alpha-2
      </div>
    </Modal>
  )
}
