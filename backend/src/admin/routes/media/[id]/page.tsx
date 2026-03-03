import { Component, useEffect, useState } from "react"
import type { ErrorInfo, ReactNode } from "react"
import { useParams } from "react-router-dom"

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("MediaDetailPage error:", error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "#ef4444" }}>
          <h2>Fehler in Medien-Detail:</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

type Release = {
  id: string
  title: string
  artist_name: string | null
  label_name: string | null
  format: string
  year: number | null
  country: string | null
  cat_no: string | null
  barcode: string | null
  genre: string | null
  styles: string | null
  tracklist: { position?: string; title?: string; duration?: string }[] | string | null
  notes: string | null
  discogs_id: number | null
  lowest_price: number | null
  num_for_sale: number | null
  have: number | null
  want: number | null
  estimated_value: number | null
  media_condition: string | null
  sleeve_condition: string | null
  auction_status: string | null
  current_block_id: string | null
  coverImage: string | null
  last_discogs_sync: string | null
  last_legacy_sync: string | null
  created_at: string | null
  updated_at: string | null
}

type SyncEntry = {
  id: string
  sync_type: string
  sync_date: string
  changes: Record<string, unknown> | null
  status: string
  error_message: string | null
}

type ImageEntry = {
  id: string
  url: string
  type: string | null
  sort_order: number | null
}

const COLORS = {
  bg: "#1c1915",
  card: "#2a2520",
  text: "#f5f0eb",
  muted: "#a09080",
  gold: "#d4a54a",
  border: "#3a3530",
  hover: "#353025",
  success: "#22c55e",
  error: "#ef4444",
}

const CONDITION_OPTIONS = ["M", "NM", "VG+", "VG", "G+", "G", "Fair", "Poor"]

const formatDate = (d: string | null) => {
  if (!d) return "\u2014"
  return new Date(d).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const formatPrice = (p: number | null) => {
  if (p === null || p === undefined) return "\u2014"
  return `\u20AC${p.toFixed(2)}`
}

const MediaDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const [release, setRelease] = useState<Release | null>(null)
  const [syncHistory, setSyncHistory] = useState<SyncEntry[]>([])
  const [images, setImages] = useState<ImageEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState("")

  // Editable fields
  const [estimatedValue, setEstimatedValue] = useState<string>("")
  const [mediaCondition, setMediaCondition] = useState<string>("")
  const [sleeveCondition, setSleeveCondition] = useState<string>("")

  useEffect(() => {
    if (!id) return
    fetch(`/admin/media/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setRelease(d.release || null)
        setSyncHistory(d.sync_history || [])
        setImages(d.images || [])
        if (d.release) {
          setEstimatedValue(d.release.estimated_value != null ? String(d.release.estimated_value) : "")
          setMediaCondition(d.release.media_condition || "")
          setSleeveCondition(d.release.sleeve_condition || "")
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error("Fetch error:", err)
        setLoading(false)
      })
  }, [id])

  const handleSave = async () => {
    if (!id) return
    setSaving(true)
    setSaveSuccess(false)
    setSaveError("")
    try {
      const body: Record<string, unknown> = {}
      if (estimatedValue !== "") body.estimated_value = parseFloat(estimatedValue)
      else body.estimated_value = null
      body.media_condition = mediaCondition || null
      body.sleeve_condition = sleeveCondition || null

      const res = await fetch(`/admin/media/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const d = await res.json()
        setRelease(d.release || release)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        const err = await res.json().catch(() => ({}))
        setSaveError(err.message || "Fehler beim Speichern")
      }
    } catch (err) {
      setSaveError("Netzwerkfehler")
    } finally {
      setSaving(false)
    }
  }

  // Styles
  const cardStyle: React.CSSProperties = {
    background: COLORS.card,
    borderRadius: "8px",
    padding: "20px",
    border: `1px solid ${COLORS.border}`,
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "4px",
  }

  const valueStyle: React.CSSProperties = {
    fontSize: "14px",
    color: COLORS.text,
  }

  const inputStyle: React.CSSProperties = {
    background: COLORS.bg,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "6px",
    padding: "8px 12px",
    color: COLORS.text,
    fontSize: "14px",
    outline: "none",
    width: "100%",
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: "pointer",
  }

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: `1px solid ${COLORS.border}`,
    whiteSpace: "nowrap",
  }

  const tdStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: "13px",
    color: COLORS.text,
    borderBottom: `1px solid ${COLORS.border}`,
    verticalAlign: "top",
  }

  if (loading) {
    return (
      <div style={{ padding: "24px", background: COLORS.bg, minHeight: "100vh", color: COLORS.text }}>
        <div style={{ color: COLORS.muted }}>Laden...</div>
      </div>
    )
  }

  if (!release) {
    return (
      <div style={{ padding: "24px", background: COLORS.bg, minHeight: "100vh", color: COLORS.text }}>
        <div style={{ color: COLORS.error }}>Release nicht gefunden.</div>
        <a href="/app/media" style={{ color: COLORS.gold, textDecoration: "none", marginTop: "12px", display: "inline-block" }}>
          \u2190 Zurueck zur Uebersicht
        </a>
      </div>
    )
  }

  const infoFields: [string, string | null | number][] = [
    ["Artist", release.artist_name],
    ["Titel", release.title],
    ["Format", release.format],
    ["Jahr", release.year != null ? String(release.year) : null],
    ["Land", release.country],
    ["Label", release.label_name],
    ["CatNo", release.cat_no],
    ["Barcode", release.barcode],
    ["Genre", release.genre],
    ["Styles", release.styles],
    ["Auktions-Status", release.auction_status],
    ["Block ID", release.current_block_id],
    ["Erstellt", formatDate(release.created_at)],
    ["Aktualisiert", formatDate(release.updated_at)],
  ]

  return (
    <div style={{ padding: "24px", background: COLORS.bg, minHeight: "100vh", color: COLORS.text }}>
      {/* Back Button */}
      <a
        href="/app/media"
        style={{
          color: COLORS.gold,
          textDecoration: "none",
          fontSize: "14px",
          display: "inline-block",
          marginBottom: "16px",
        }}
      >
        \u2190 Zurueck zur Uebersicht
      </a>

      {/* Header */}
      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>
        {release.artist_name ? `${release.artist_name} \u2014 ` : ""}
        {release.title}
      </h1>
      <div style={{ fontSize: "14px", color: COLORS.muted, marginBottom: "24px" }}>
        {[release.format, release.year, release.label_name].filter(Boolean).join(" \u00B7 ")}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "24px", marginBottom: "32px" }}>
        {/* Cover Image */}
        <div>
          {release.coverImage || images.length > 0 ? (
            <img
              src={release.coverImage || images[0]?.url}
              alt={release.title}
              style={{
                width: "100%",
                borderRadius: "8px",
                border: `1px solid ${COLORS.border}`,
                aspectRatio: "1",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                aspectRatio: "1",
                borderRadius: "8px",
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "48px",
                color: COLORS.muted,
              }}
            >
              \u266B
            </div>
          )}
          {/* Additional images */}
          {images.length > 1 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginTop: "8px" }}>
              {images.slice(1, 5).map((img) => (
                <img
                  key={img.id}
                  src={img.url}
                  alt=""
                  style={{
                    width: "100%",
                    aspectRatio: "1",
                    objectFit: "cover",
                    borderRadius: "4px",
                    border: `1px solid ${COLORS.border}`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Release Info */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
              Release-Informationen
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              {infoFields.map(([label, value]) => (
                <div key={label}>
                  <div style={labelStyle}>{label}</div>
                  <div style={valueStyle}>{value ?? "\u2014"}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Editable Section */}
          <div style={{ ...cardStyle, border: `1px solid ${COLORS.gold}40` }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
              Bewertung bearbeiten
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
              <div>
                <div style={labelStyle}>Schaetzwert (\u20AC)</div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={estimatedValue}
                  onChange={(e) => setEstimatedValue(e.target.value)}
                  placeholder="0.00"
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={labelStyle}>Media Condition</div>
                <select
                  value={mediaCondition}
                  onChange={(e) => setMediaCondition(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">-- Waehlen --</option>
                  {CONDITION_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={labelStyle}>Sleeve Condition</div>
                <select
                  value={sleeveCondition}
                  onChange={(e) => setSleeveCondition(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">-- Waehlen --</option>
                  {CONDITION_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "16px" }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: "8px 24px",
                  borderRadius: "6px",
                  border: "none",
                  background: COLORS.gold,
                  color: "#1c1915",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: saving ? "wait" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Speichern..." : "Speichern"}
              </button>
              {saveSuccess && (
                <span style={{ color: COLORS.success, fontSize: "13px" }}>
                  Erfolgreich gespeichert
                </span>
              )}
              {saveError && (
                <span style={{ color: COLORS.error, fontSize: "13px" }}>
                  {saveError}
                </span>
              )}
            </div>
          </div>

          {/* Discogs Section */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
              Discogs-Daten
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "16px" }}>
              <div>
                <div style={labelStyle}>Discogs ID</div>
                <div style={valueStyle}>
                  {release.discogs_id ? (
                    <a
                      href={`https://www.discogs.com/release/${release.discogs_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: COLORS.gold, textDecoration: "none" }}
                    >
                      {release.discogs_id} \u2197
                    </a>
                  ) : (
                    "\u2014"
                  )}
                </div>
              </div>
              <div>
                <div style={labelStyle}>Niedrigster Preis</div>
                <div style={{ ...valueStyle, color: release.lowest_price ? COLORS.gold : COLORS.muted }}>
                  {formatPrice(release.lowest_price)}
                </div>
              </div>
              <div>
                <div style={labelStyle}>Zum Verkauf</div>
                <div style={valueStyle}>{release.num_for_sale ?? "\u2014"}</div>
              </div>
              <div>
                <div style={labelStyle}>Have</div>
                <div style={valueStyle}>{release.have ?? "\u2014"}</div>
              </div>
              <div>
                <div style={labelStyle}>Want</div>
                <div style={valueStyle}>{release.want ?? "\u2014"}</div>
              </div>
            </div>
            <div style={{ marginTop: "12px" }}>
              <div style={labelStyle}>Letzter Discogs-Sync</div>
              <div style={{ ...valueStyle, fontSize: "13px" }}>{formatDate(release.last_discogs_sync)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Notes / Tracklist */}
      {(release.notes || release.tracklist) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>
          {release.notes && (
            <div style={cardStyle}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px", color: COLORS.gold }}>
                Notizen
              </h2>
              <div style={{ fontSize: "13px", color: COLORS.text, whiteSpace: "pre-wrap", lineHeight: "1.5" }}>
                {release.notes}
              </div>
            </div>
          )}
          {release.tracklist && (
            <div style={cardStyle}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px", color: COLORS.gold }}>
                Tracklist
              </h2>
              <div style={{ fontSize: "13px", color: COLORS.text, lineHeight: "1.5" }}>
                {Array.isArray(release.tracklist)
                  ? release.tracklist.map((t: { position?: string; title?: string; duration?: string }, i: number) => (
                      <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "4px" }}>
                        <span style={{ color: COLORS.muted, minWidth: "30px", textAlign: "right" }}>
                          {t.position || `${i + 1}.`}
                        </span>
                        <span style={{ flex: 1 }}>{t.title}</span>
                        {t.duration && <span style={{ color: COLORS.muted }}>{t.duration}</span>}
                      </div>
                    ))
                  : typeof release.tracklist === "string"
                    ? release.tracklist
                    : JSON.stringify(release.tracklist, null, 2)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sync History */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
          Sync-Verlauf
        </h2>
        {syncHistory.length === 0 ? (
          <div style={{ color: COLORS.muted, fontSize: "14px", padding: "20px 0", textAlign: "center" }}>
            Noch keine Sync-Eintraege vorhanden.
          </div>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Datum</th>
                  <th style={thStyle}>Typ</th>
                  <th style={thStyle}>Aenderungen</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Fehler</th>
                </tr>
              </thead>
              <tbody>
                {syncHistory.slice(0, 20).map((entry) => (
                  <tr key={entry.id}>
                    <td style={tdStyle}>{formatDate(entry.sync_date)}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 600,
                          background: entry.sync_type === "legacy" ? "#3b82f620" : "#a855f720",
                          color: entry.sync_type === "legacy" ? "#60a5fa" : "#c084fc",
                        }}
                      >
                        {entry.sync_type}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, maxWidth: "400px" }}>
                      {entry.changes ? (
                        <pre
                          style={{
                            fontSize: "11px",
                            color: COLORS.muted,
                            margin: 0,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            fontFamily: "monospace",
                          }}
                        >
                          {JSON.stringify(entry.changes, null, 2)}
                        </pre>
                      ) : (
                        <span style={{ color: COLORS.muted }}>\u2014</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ color: entry.status === "success" ? COLORS.success : COLORS.error }}>
                        {entry.status === "success" ? "\u2713" : "\u2717"} {entry.status}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: "12px", color: COLORS.error }}>
                      {entry.error_message || "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const MediaDetailPageWithBoundary = () => (
  <ErrorBoundary>
    <MediaDetailPage />
  </ErrorBoundary>
)

export default MediaDetailPageWithBoundary
