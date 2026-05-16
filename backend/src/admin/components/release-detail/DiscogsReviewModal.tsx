import { useMemo, useState } from "react"
import { C, T, S } from "../admin-tokens"
import { Btn, Modal } from "../admin-ui"

export type DiscogsPreviewResponse = {
  discogs_id: number
  current: Record<string, unknown>
  proposed: Record<string, unknown>
  diff: Record<string, { from: unknown; to: unknown }>
  has_changes: boolean
  /**
   * Fix 1 (2026-05-16): Discogs-Marktpreise — kein reviewbares Diff-Feld
   * (Markt-Referenz, kein Stammdatum). Werden beim Apply immer mitgeschrieben.
   */
  market?: {
    discogs_lowest_price: number | null
    discogs_median_price: number | null
    discogs_highest_price: number | null
    discogs_num_for_sale: number | null
  } | null
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
  artist_display_name: "Artist Display",
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
  coverImage: "Cover Image",
  label_name: "Label",
  gallery_images: "Gallery",
  tracklist: "Tracklist",
}

const IMAGE_FIELDS = new Set(["coverImage"])
const GALLERY_FIELDS = new Set(["gallery_images"])
const TRACKLIST_FIELDS = new Set(["tracklist"])

type TrackEntry = { position?: string; title?: string; duration?: string }

/** Fix 2 (2026-05-16): Tracklist-Diff-Zelle — Anzahl + die ersten Titel. */
function TracklistCell({ tracks }: { tracks: unknown }) {
  const list: TrackEntry[] = Array.isArray(tracks)
    ? (tracks.filter((t) => t && typeof t === "object") as TrackEntry[])
    : []
  if (list.length === 0) {
    return <span style={{ ...T.small, color: C.muted }}>— (none)</span>
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ ...T.micro, color: C.muted, textTransform: "none", letterSpacing: 0 }}>
        {list.length} track{list.length === 1 ? "" : "s"}
      </span>
      {list.slice(0, 6).map((t, i) => (
        <span key={i} style={{ ...T.small, color: C.text, wordBreak: "break-word" }}>
          {(t.position || "").trim() ? `${t.position} · ` : ""}{t.title || "—"}
          {(t.duration || "").trim() ? ` (${t.duration})` : ""}
        </span>
      ))}
      {list.length > 6 && (
        <span style={{ ...T.micro, color: C.muted, textTransform: "none", letterSpacing: 0 }}>
          +{list.length - 6} more
        </span>
      )}
    </div>
  )
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

function ImageCell({ url }: { url: unknown }) {
  if (typeof url !== "string" || !url) {
    return <span style={{ ...T.small, color: C.muted }}>—</span>
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <img
        src={url}
        alt=""
        style={{ width: 80, height: 80, objectFit: "cover", borderRadius: S.radius.sm, border: `1px solid ${C.border}` }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
      />
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...T.micro, color: C.muted, textTransform: "none", letterSpacing: 0 }}>
        open ↗
      </a>
    </div>
  )
}

function GalleryCell({ urls }: { urls: unknown }) {
  const list: string[] = Array.isArray(urls)
    ? (urls.filter((u) => typeof u === "string" && u.length > 0) as string[])
    : []
  if (list.length === 0) {
    return <span style={{ ...T.small, color: C.muted }}>— (none)</span>
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {list.slice(0, 8).map((url, i) => (
          <img
            key={i}
            src={url}
            alt=""
            style={{
              width: 48,
              height: 48,
              objectFit: "cover",
              borderRadius: S.radius.sm,
              border: `1px solid ${C.border}`,
            }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
          />
        ))}
      </div>
      <span style={{ ...T.micro, color: C.muted, textTransform: "none", letterSpacing: 0 }}>
        {list.length} image{list.length === 1 ? "" : "s"}
      </span>
    </div>
  )
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
    // Fix 1 (2026-05-16): auch wenn keine Stammdaten abweichen, sollen die
    // Marktpreise frisch geschrieben werden können (Refetch-Use-Case). Apply
    // mit leerer Feld-Auswahl schickt nur discogs_id + market in den Body.
    const hasMarket =
      !!preview.market &&
      (preview.market.discogs_lowest_price != null ||
        preview.market.discogs_median_price != null)
    return (
      <Modal
        title="No changes from Discogs"
        subtitle={`discogs_id ${preview.discogs_id} returned the same values that are already on this release.`}
        onClose={onClose}
        footer={
          <>
            <Btn label="Close" variant="ghost" onClick={onClose} disabled={applying} style={{ padding: "7px 16px", fontSize: 13 }} />
            {hasMarket && (
              <Btn
                label={applying ? "Refreshing…" : "Refresh market prices"}
                variant="gold"
                onClick={handleApply}
                disabled={applying}
                style={{ padding: "7px 20px", fontSize: 13 }}
              />
            )}
          </>
        }
      >
        <div style={{ ...T.small, color: C.muted }}>
          No metadata to apply. Artist and label are not part of this preview — use the dedicated pickers to change those.
        </div>
        {hasMarket && preview.market && (
          <div style={{
            ...T.small,
            color: C.muted,
            background: C.subtle,
            border: `1px solid ${C.border}`,
            borderRadius: S.radius.sm,
            padding: "8px 12px",
            marginTop: S.gap.md,
          }}>
            <strong style={{ color: C.text }}>Market prices</strong> from Discogs:
            {preview.market.discogs_lowest_price != null && ` ab €${preview.market.discogs_lowest_price.toFixed(2)}`}
            {preview.market.discogs_num_for_sale != null && ` · ${preview.market.discogs_num_for_sale} for sale`}
            {preview.market.discogs_median_price != null && ` · median €${preview.market.discogs_median_price.toFixed(2)}`}
            {preview.market.discogs_highest_price != null && ` · mint €${preview.market.discogs_highest_price.toFixed(2)}`}
          </div>
        )}
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
                  <span
                    title="Sync-locked: this field is protected from automatic Discogs/Tape-Mag sync. Tick the checkbox to apply this value manually anyway."
                    style={{
                      ...T.micro,
                      color: C.warning,
                      marginLeft: 6,
                      fontWeight: 500,
                      textTransform: "none",
                      letterSpacing: 0,
                      cursor: "help",
                    }}
                  >
                    🔒 sync-locked
                  </span>
                )}
              </span>
              {IMAGE_FIELDS.has(key) ? (
                <ImageCell url={d.from} />
              ) : GALLERY_FIELDS.has(key) ? (
                <GalleryCell urls={d.from} />
              ) : TRACKLIST_FIELDS.has(key) ? (
                <TracklistCell tracks={d.from} />
              ) : (
                <span style={{ ...T.small, color: C.muted, wordBreak: "break-word" }}>
                  {formatValue(d.from)}
                </span>
              )}
              {IMAGE_FIELDS.has(key) ? (
                <ImageCell url={d.to} />
              ) : GALLERY_FIELDS.has(key) ? (
                <GalleryCell urls={d.to} />
              ) : TRACKLIST_FIELDS.has(key) ? (
                <TracklistCell tracks={d.to} />
              ) : (
                <span style={{ ...T.small, color: C.text, wordBreak: "break-word", fontWeight: checked ? 600 : 400 }}>
                  {formatValue(d.to)}
                </span>
              )}
            </label>
          )
        })}
      </div>

      {preview.market &&
        (preview.market.discogs_lowest_price != null ||
          preview.market.discogs_median_price != null) && (
        <div style={{
          ...T.small,
          color: C.muted,
          background: C.subtle,
          border: `1px solid ${C.border}`,
          borderRadius: S.radius.sm,
          padding: "8px 12px",
          marginTop: S.gap.md,
        }}>
          <strong style={{ color: C.text }}>Market prices</strong> will be refreshed automatically:
          {preview.market.discogs_lowest_price != null && ` ab €${preview.market.discogs_lowest_price.toFixed(2)}`}
          {preview.market.discogs_num_for_sale != null && ` · ${preview.market.discogs_num_for_sale} for sale`}
          {preview.market.discogs_median_price != null && ` · median €${preview.market.discogs_median_price.toFixed(2)}`}
          {preview.market.discogs_highest_price != null && ` · mint €${preview.market.discogs_highest_price.toFixed(2)}`}
        </div>
      )}

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
        🔒 sync-locked = protected from auto-sync (Discogs/Tape-Mag). The field can still be applied manually by ticking the checkbox — it just doesn't apply by default.
        Cover image, when applied, is downloaded from Discogs, optimized to WebP, uploaded to R2, and replaces the current cover (the previous cover is kept as a thumbnail in the gallery).
        Label, when applied, is resolved by name (case-insensitive); a new Label row is created on demand.
        Gallery, when applied, replaces all existing source=&apos;discogs&apos; images for this release with the secondaries from the new Discogs ID. Cover stays untouched.
        Artist is not part of this preview — use the dedicated picker.
        Apply writes through the same audit-logged path as a manual edit; hard fields auto-lock.
      </div>
    </Modal>
  )
}
