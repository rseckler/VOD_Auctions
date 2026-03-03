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
          <h2>Error in Media Detail:</h2>
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
  catalogNumber: string | null
  article_number: string | null
  barcode: string | null
  genre: string | null
  styles: string | null
  tracklist: { position?: string; title?: string; duration?: string }[] | string | null
  description: string | null
  discogs_id: number | null
  discogs_lowest_price: number | null
  discogs_median_price: number | null
  discogs_highest_price: number | null
  discogs_num_for_sale: number | null
  discogs_have: number | null
  discogs_want: number | null
  estimated_value: number | null
  media_condition: string | null
  sleeve_condition: string | null
  auction_status: string | null
  current_block_id: string | null
  coverImage: string | null
  discogs_last_synced: string | null
  legacy_last_synced: string | null
  createdAt: string | null
  updatedAt: string | null
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
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const formatPrice = (p: number | string | null) => {
  if (p === null || p === undefined) return "\u2014"
  return `\u20AC${Number(p).toFixed(2)}`
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
        setSaveError(err.message || "Failed to save")
      }
    } catch {
      setSaveError("Network error")
    } finally {
      setSaving(false)
    }
  }

  const cardStyle: React.CSSProperties = { background: COLORS.card, borderRadius: "8px", padding: "20px", border: `1px solid ${COLORS.border}` }
  const labelStyle: React.CSSProperties = { fontSize: "12px", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }
  const valueStyle: React.CSSProperties = { fontSize: "14px", color: COLORS.text }
  const inputStyle: React.CSSProperties = { background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: "6px", padding: "8px 12px", color: COLORS.text, fontSize: "14px", outline: "none", width: "100%" }
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" }
  const thStyle: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${COLORS.border}`, whiteSpace: "nowrap" }
  const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: "13px", color: COLORS.text, borderBottom: `1px solid ${COLORS.border}`, verticalAlign: "top" }

  if (loading) {
    return (<div style={{ padding: "24px", background: COLORS.bg, minHeight: "100vh", color: COLORS.text }}><div style={{ color: COLORS.muted }}>Loading...</div></div>)
  }

  if (!release) {
    return (
      <div style={{ padding: "24px", background: COLORS.bg, minHeight: "100vh", color: COLORS.text }}>
        <div style={{ color: COLORS.error }}>Release not found.</div>
        <a href="/app/media" style={{ color: COLORS.gold, textDecoration: "none", marginTop: "12px", display: "inline-block" }}>&larr; Back to Overview</a>
      </div>
    )
  }

  const infoFields: [string, string | null | number][] = [
    ["Article No.", release.article_number],
    ["Artist", release.artist_name],
    ["Title", release.title],
    ["Format", release.format],
    ["Year", release.year != null ? String(release.year) : null],
    ["Country", release.country],
    ["Label", release.label_name],
    ["CatNo", release.catalogNumber],
    ["Barcode", release.barcode],
    ["Genre", release.genre],
    ["Styles", release.styles],
    ["Auction Status", release.auction_status],
    ["Block ID", release.current_block_id],
    ["Created", formatDate(release.createdAt)],
    ["Updated", formatDate(release.updatedAt)],
  ]

  return (
    <div style={{ padding: "24px", background: COLORS.bg, minHeight: "100vh", color: COLORS.text }}>
      <a href="/app/media" style={{ color: COLORS.gold, textDecoration: "none", fontSize: "14px", display: "inline-block", marginBottom: "16px" }}>&larr; Back to Overview</a>

      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>
        {release.artist_name ? `${release.artist_name} \u2014 ` : ""}{release.title}
      </h1>
      <div style={{ fontSize: "14px", color: COLORS.muted, marginBottom: "24px" }}>
        {[release.format, release.year, release.label_name].filter(Boolean).join(" \u00B7 ")}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "24px", marginBottom: "32px" }}>
        <div>
          {release.coverImage || images.length > 0 ? (
            <img src={release.coverImage || images[0]?.url} alt={release.title} style={{ width: "100%", borderRadius: "8px", border: `1px solid ${COLORS.border}`, aspectRatio: "1", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", aspectRatio: "1", borderRadius: "8px", background: COLORS.card, border: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "48px", color: COLORS.muted }}>&#9835;</div>
          )}
          {images.length > 1 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginTop: "8px" }}>
              {images.slice(1, 5).map((img) => (<img key={img.id} src={img.url} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "4px", border: `1px solid ${COLORS.border}` }} />))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={cardStyle}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>Release Information</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              {infoFields.map(([label, value]) => (<div key={label}><div style={labelStyle}>{label}</div><div style={valueStyle}>{value ?? "\u2014"}</div></div>))}
            </div>
          </div>

          <div style={{ ...cardStyle, border: `1px solid ${COLORS.gold}40` }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>Edit Valuation</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
              <div>
                <div style={labelStyle}>Estimated Value (&euro;)</div>
                <input type="number" step="0.01" min="0" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} placeholder="0.00" style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>Media Condition</div>
                <select value={mediaCondition} onChange={(e) => setMediaCondition(e.target.value)} style={selectStyle}>
                  <option value="">-- Select --</option>
                  {CONDITION_OPTIONS.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>
              <div>
                <div style={labelStyle}>Sleeve Condition</div>
                <select value={sleeveCondition} onChange={(e) => setSleeveCondition(e.target.value)} style={selectStyle}>
                  <option value="">-- Select --</option>
                  {CONDITION_OPTIONS.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "16px" }}>
              <button onClick={handleSave} disabled={saving} style={{ padding: "8px 24px", borderRadius: "6px", border: "none", background: COLORS.gold, color: "#1c1915", fontSize: "14px", fontWeight: 600, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving..." : "Save"}
              </button>
              {saveSuccess && <span style={{ color: COLORS.success, fontSize: "13px" }}>Saved successfully</span>}
              {saveError && <span style={{ color: COLORS.error, fontSize: "13px" }}>{saveError}</span>}
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>Discogs Data</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr 1fr", gap: "16px" }}>
              <div><div style={labelStyle}>Discogs ID</div><div style={valueStyle}>{release.discogs_id ? (<a href={`https://www.discogs.com/release/${release.discogs_id}`} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.gold, textDecoration: "none" }}>{release.discogs_id} &#8599;</a>) : "\u2014"}</div></div>
              <div><div style={labelStyle}>Low</div><div style={{ ...valueStyle, color: release.discogs_lowest_price ? COLORS.gold : COLORS.muted }}>{formatPrice(release.discogs_lowest_price)}</div></div>
              <div><div style={labelStyle}>Median</div><div style={{ ...valueStyle, color: release.discogs_median_price ? COLORS.gold : COLORS.muted }}>{formatPrice(release.discogs_median_price)}</div></div>
              <div><div style={labelStyle}>High</div><div style={{ ...valueStyle, color: release.discogs_highest_price ? COLORS.gold : COLORS.muted }}>{formatPrice(release.discogs_highest_price)}</div></div>
              <div><div style={labelStyle}>For Sale</div><div style={valueStyle}>{release.discogs_num_for_sale ?? "\u2014"}</div></div>
              <div><div style={labelStyle}>Have</div><div style={valueStyle}>{release.discogs_have ?? "\u2014"}</div></div>
              <div><div style={labelStyle}>Want</div><div style={valueStyle}>{release.discogs_want ?? "\u2014"}</div></div>
            </div>
            <div style={{ marginTop: "12px" }}><div style={labelStyle}>Last Discogs Sync</div><div style={{ ...valueStyle, fontSize: "13px" }}>{formatDate(release.discogs_last_synced)}</div></div>
          </div>
        </div>
      </div>

      {(release.description || release.tracklist) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>
          {release.description && (
            <div style={cardStyle}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px", color: COLORS.gold }}>Notes</h2>
              <div style={{ fontSize: "13px", color: COLORS.text, whiteSpace: "pre-wrap", lineHeight: "1.5" }}>{release.description}</div>
            </div>
          )}
          {release.tracklist && (
            <div style={cardStyle}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px", color: COLORS.gold }}>Tracklist</h2>
              <div style={{ fontSize: "13px", color: COLORS.text, lineHeight: "1.5" }}>
                {Array.isArray(release.tracklist)
                  ? release.tracklist.map((t: { position?: string; title?: string; duration?: string }, i: number) => (
                      <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "4px" }}>
                        <span style={{ color: COLORS.muted, minWidth: "30px", textAlign: "right" }}>{t.position || `${i + 1}.`}</span>
                        <span style={{ flex: 1 }}>{t.title}</span>
                        {t.duration && <span style={{ color: COLORS.muted }}>{t.duration}</span>}
                      </div>))
                  : typeof release.tracklist === "string" ? release.tracklist : JSON.stringify(release.tracklist, null, 2)}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={cardStyle}>
        <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>Sync History</h2>
        {syncHistory.length === 0 ? (
          <div style={{ color: COLORS.muted, fontSize: "14px", padding: "20px 0", textAlign: "center" }}>No sync entries yet.</div>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={thStyle}>Date</th><th style={thStyle}>Type</th><th style={thStyle}>Changes</th><th style={thStyle}>Status</th><th style={thStyle}>Error</th></tr></thead>
              <tbody>
                {syncHistory.slice(0, 20).map((entry) => (
                  <tr key={entry.id}>
                    <td style={tdStyle}>{formatDate(entry.sync_date)}</td>
                    <td style={tdStyle}><span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: entry.sync_type === "legacy" ? "#3b82f620" : "#a855f720", color: entry.sync_type === "legacy" ? "#60a5fa" : "#c084fc" }}>{entry.sync_type}</span></td>
                    <td style={{ ...tdStyle, maxWidth: "400px" }}>{entry.changes ? (<pre style={{ fontSize: "11px", color: COLORS.muted, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "monospace" }}>{JSON.stringify(entry.changes, null, 2)}</pre>) : (<span style={{ color: COLORS.muted }}>{"\u2014"}</span>)}</td>
                    <td style={tdStyle}><span style={{ color: entry.status === "success" ? COLORS.success : COLORS.error }}>{entry.status === "success" ? "\u2713" : "\u2717"} {entry.status}</span></td>
                    <td style={{ ...tdStyle, fontSize: "12px", color: COLORS.error }}>{entry.error_message || "\u2014"}</td>
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

const MediaDetailPageWithBoundary = () => (<ErrorBoundary><MediaDetailPage /></ErrorBoundary>)

export default MediaDetailPageWithBoundary
