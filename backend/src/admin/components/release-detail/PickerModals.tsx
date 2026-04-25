import { useState, useEffect, useRef, useMemo } from "react"
import { C, T, S } from "../admin-tokens"
import { Modal, Btn } from "../admin-ui"
import { ISO_COUNTRIES, filterCountries, flagFor, type IsoCountry } from "../../data/country-iso"
import {
  FORMAT_GROUPS,
  FORMAT_DESCRIPTOR_VALUES,
  displayFormat,
  type FormatValue,
  type FormatDescriptor,
} from "../../../lib/format-mapping"

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

/**
 * FormatPickerModal — 71-Wert-Whitelist aus FORMAT_GROUPS.
 * Gruppiert nach Vinyl LP / Vinyl 7" / Tape / CD / etc. mit Live-Search.
 */
export function FormatPickerModal({
  current,
  onSelect,
  onClose,
}: {
  current?: string | null
  onSelect: (value: FormatValue) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const groups = useMemo(() => {
    if (!query.trim()) return FORMAT_GROUPS
    const q = query.toLowerCase()
    return FORMAT_GROUPS.map((g) => ({
      label: g.label,
      values: g.values.filter(
        (v) => v.toLowerCase().includes(q) || displayFormat(v).toLowerCase().includes(q)
      ),
    })).filter((g) => g.values.length > 0)
  }, [query])

  return (
    <Modal title="Select Format (71 values · Vinyl/Tape/CD/Video/Digital/Literatur)" onClose={onClose}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type to search — e.g. LP, 7&quot;, Tape×3, CD, Flexi…"
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
          maxHeight: 480,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: S.gap.lg,
        }}
      >
        {groups.length === 0 && (
          <div style={{ ...T.small, color: C.muted, textAlign: "center", padding: S.gap.md }}>
            No formats match "{query}"
          </div>
        )}
        {groups.map((group) => (
          <div key={group.label}>
            <div
              style={{
                ...T.micro,
                color: C.muted,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 4,
                paddingLeft: 4,
              }}
            >
              {group.label}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 2 }}>
              {group.values.map((v) => {
                const isCurrent = v === current
                return (
                  <button
                    key={v}
                    onClick={() => {
                      onSelect(v)
                      onClose()
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: S.gap.sm,
                      width: "100%",
                      textAlign: "left",
                      padding: "6px 10px",
                      borderRadius: S.radius.sm,
                      border: isCurrent ? `1px solid ${C.gold}` : `1px solid transparent`,
                      background: isCurrent ? C.subtle : "transparent",
                      color: C.text,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = C.hover)}
                    onMouseOut={(e) => (e.currentTarget.style.background = isCurrent ? C.subtle : "transparent")}
                  >
                    <span>{displayFormat(v)}</span>
                    <span
                      style={{
                        ...T.small,
                        color: C.muted,
                        fontFamily: "monospace",
                        fontSize: 11,
                      }}
                    >
                      {v}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...T.micro, color: C.muted, textAlign: "center", marginTop: S.gap.md }}>
        71 format values · single source: format-mapping.ts
      </div>
    </Modal>
  )
}

/**
 * DescriptorPickerModal — Multi-Select aus FORMAT_DESCRIPTOR_VALUES (32 Tags).
 * Tags wie Picture Disc, Reissue, Limited Edition, Stereo, Mono, Promo, …
 */
export function DescriptorPickerModal({
  selected,
  onSave,
  onClose,
}: {
  selected: string[]
  onSave: (values: FormatDescriptor[]) => void
  onClose: () => void
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selected))
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    if (!query.trim()) return FORMAT_DESCRIPTOR_VALUES
    const q = query.toLowerCase()
    return FORMAT_DESCRIPTOR_VALUES.filter((d) => d.toLowerCase().includes(q))
  }, [query])

  const toggle = (d: string) => {
    const next = new Set(picked)
    if (next.has(d)) next.delete(d)
    else next.add(d)
    setPicked(next)
  }

  const save = () => {
    const out = FORMAT_DESCRIPTOR_VALUES.filter((d) => picked.has(d))
    onSave(out)
    onClose()
  }

  return (
    <Modal title={`Select Descriptors (${picked.size} selected)`} onClose={onClose}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type to filter — Picture Disc, Reissue, Limited Edition, Promo, …"
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
          maxHeight: 380,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 4,
        }}
      >
        {filtered.length === 0 && (
          <div style={{ ...T.small, color: C.muted, textAlign: "center", padding: S.gap.md, gridColumn: "1 / -1" }}>
            No descriptors match "{query}"
          </div>
        )}
        {filtered.map((d) => {
          const isPicked = picked.has(d)
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: S.gap.sm,
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                borderRadius: S.radius.sm,
                border: isPicked ? `1px solid ${C.gold}` : `1px solid ${C.border}`,
                background: isPicked ? C.subtle : "transparent",
                color: C.text,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <span style={{ fontFamily: "monospace", color: isPicked ? C.gold : C.muted }}>
                {isPicked ? "✓" : "○"}
              </span>
              <span>{d}</span>
            </button>
          )
        })}
      </div>

      <div style={{ display: "flex", gap: S.gap.md, marginTop: S.gap.lg, justifyContent: "flex-end" }}>
        <Btn label="Cancel" variant="ghost" onClick={onClose} />
        <Btn label={`Save (${picked.size})`} variant="gold" onClick={save} />
      </div>
    </Modal>
  )
}
