import { useMemo, useState } from "react"
import { C, T, S } from "../admin-tokens"
import { Btn, Modal } from "../admin-ui"

export type DiscogsPreviewResponse = {
  discogs_id: number
  current: Record<string, unknown>
  proposed: Record<string, unknown>
  diff: Record<string, { from: unknown; to: unknown }>
  has_changes: boolean
}

type Props = {
  preview: DiscogsPreviewResponse
  /** Field names that are currently locked — checkbox defaults to off, label badge shown. */
  lockedFields: string[]
  onClose: () => void
  /**
   * Called with selected field-names (subset of preview.diff keys) plus the new
   * discogs_id. Returns when the apply request finishes (the parent owns the
   * fetch + toast).
   */
  onApply: (selectedFields: string[]) => Promise<void>
}

const FIELD_LABELS: Record<string, string> = {
  discogs_id: "Discogs ID",
  title: "Title",
  year: "Year",
  country: "Country",
  catalogNumber: "Catalog No.",
  barcode: "Barcode",
  description: "Description",
  format_v2: "Format",
  format_descriptors: "Descriptors",
  genres: "Genres",
  styles: "Styles",
  credits: "Credits",
  discogs_lowest_price: "Discogs lowest price",
  discogs_median_price: "Discogs median price",
  discogs_highest_price: "Discogs highest price",
  discogs_num_for_sale: "Discogs # for sale",
}

function formatValue(v: unknown): string {
  if (v == null) return "—"
  if (Array.isArray(v)) return v.length > 0 ? v.join(", ") : "—"
  if (typeof v === "string") {
    if (v === "") return "—"
    return v.length > 140 ? v.slice(0, 140) + "…" : v
  }
  if (typeof v === "number") return String(v)
  return JSON.stringify(v)
}

export function DiscogsReviewModal({ preview, lockedFields, onClose, onApply }: Props) {
  const diffKeys = useMemo(() => Object.keys(preview.diff), [preview.diff])

  // Default: all changed fields selected EXCEPT locked ones (Frank explicitly
  // locked these — surfacing them as opt-in respects the lock semantics).
  const [selected, setSelected] = useState<Set<string>>(() => {
    const s = new Set<string>()
    for (const k of diffKeys) {
      if (!lockedFields.includes(k)) s.add(k)
    }
    return s
  })
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(diffKeys))
  const selectNone = () => setSelected(new Set())

  const handleApply = async () => {
    setApplying(true)
    setError(null)
    try {
      await onApply(Array.from(selected))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed")
    } finally {
      setApplying(false)
    }
  }

  if (!preview.has_changes) {
    return (
      <Modal
        title="No changes from Discogs"
        subtitle={`discogs_id ${preview.discogs_id} returned the same values that are already on this release.`}
        onClose={onClose}
        footer={
          <Btn label="Close" variant="ghost" onClick={onClose} style={{ padding: "7px 16px", fontSize: 13 }} />
        }
      >
        <div style={{ ...T.small, color: C.muted }}>
          Nothing to apply. Cover image, artist, and label are not part of this preview — use the artist/label pickers to change those.
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title="Review Discogs Changes"
      subtitle={`discogs_id ${preview.discogs_id} — ${diffKeys.length} field${diffKeys.length === 1 ? "" : "s"} would change. Pick which to apply.`}
      onClose={onClose}
      maxWidth={820}
      footer={
        <>
          <Btn label="Cancel" variant="ghost" onClick={onClose} disabled={applying} style={{ padding: "7px 16px", fontSize: 13 }} />
          <Btn
            label={applying ? "Applying…" : `Apply ${selected.size} field${selected.size === 1 ? "" : "s"}`}
            variant="gold"
            onClick={handleApply}
            disabled={applying || selected.size === 0}
            style={{ padding: "7px 20px", fontSize: 13 }}
          />
        </>
      }
    >
      <div style={{ display: "flex", gap: S.gap.sm, marginBottom: S.gap.md }}>
        <Btn label="Select all" variant="ghost" onClick={selectAll} disabled={applying} style={{ padding: "5px 12px", fontSize: 12 }} />
        <Btn label="Select none" variant="ghost" onClick={selectNone} disabled={applying} style={{ padding: "5px 12px", fontSize: 12 }} />
        <div style={{ ...T.small, color: C.muted, alignSelf: "center", marginLeft: "auto" }}>
          {selected.size} of {diffKeys.length} selected
        </div>
      </div>

      <div style={{ background: C.subtle, borderRadius: S.radius.sm, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "32px 160px 1fr 1fr",
          gap: S.gap.md,
          padding: "10px 14px",
          background: C.card,
          borderBottom: `1px solid ${C.border}`,
          ...T.micro,
          color: C.muted,
          fontWeight: 600,
        }}>
          <span></span>
          <span>Field</span>
          <span>Current</span>
          <span>Proposed</span>
        </div>
        {diffKeys.map((key) => {
          const d = preview.diff[key]
          const checked = selected.has(key)
          const isLocked = lockedFields.includes(key)
          return (
            <label
              key={key}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 160px 1fr 1fr",
                gap: S.gap.md,
                padding: "10px 14px",
                borderBottom: `1px solid ${C.border}`,
                cursor: applying ? "wait" : "pointer",
                background: checked ? C.gold + "08" : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(key)}
                disabled={applying}
                style={{ alignSelf: "start", marginTop: 2 }}
              />
              <span style={{ ...T.small, color: C.text, fontWeight: 600 }}>
                {FIELD_LABELS[key] || key}
                {isLocked && (
                  <span style={{
                    ...T.micro,
                    color: C.warning,
                    marginLeft: 6,
                    fontWeight: 500,
                    textTransform: "none",
                    letterSpacing: 0,
                  }}>
                    🔒 locked
                  </span>
                )}
              </span>
              <span style={{ ...T.small, color: C.muted, wordBreak: "break-word" }}>
                {formatValue(d.from)}
              </span>
              <span style={{ ...T.small, color: C.text, wordBreak: "break-word", fontWeight: checked ? 600 : 400 }}>
                {formatValue(d.to)}
              </span>
            </label>
          )
        })}
      </div>

      {error && (
        <div style={{
          ...T.small,
          color: C.error,
          background: C.error + "15",
          border: `1px solid ${C.error}40`,
          borderRadius: S.radius.sm,
          padding: "8px 12px",
          marginTop: S.gap.md,
        }}>
          {error}
        </div>
      )}

      <div style={{ ...T.micro, color: C.muted, marginTop: S.gap.md, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
        Locked fields default to off — uncheck or check explicitly.
        Artist, label, and cover image are not part of this preview (use the dedicated pickers).
        Apply writes through the same audit-logged path as a manual edit; hard fields auto-lock.
      </div>
    </Modal>
  )
}
