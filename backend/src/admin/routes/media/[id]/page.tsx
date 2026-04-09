import { Component, useCallback, useEffect, useState } from "react"
import type { ErrorInfo, ReactNode } from "react"
import { useParams } from "react-router-dom"
import { useAdminNav } from "../../../components/admin-nav"
import { C, T, S, fmtDate, fmtMoney, BADGE_VARIANTS } from "../../../components/admin-tokens"
import { PageHeader, PageShell, SectionHeader } from "../../../components/admin-layout"
import { Badge, Btn, Toast, EmptyState, inputStyle, selectStyle } from "../../../components/admin-ui"

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
        <div style={{ padding: 24, color: C.error }}>
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
  sale_mode: string | null
  direct_price: number | null
  inventory: number | null
  shipping_item_type_id: string | null
  current_block_id: string | null
  coverImage: string | null
  tape_mag_url: string | null
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

const CONDITION_OPTIONS: { value: string; label: string }[] = [
  { value: "M",   label: "Mint" },
  { value: "NM",  label: "Near Mint" },
  { value: "VG+", label: "Very Good Plus" },
  { value: "VG",  label: "Very Good" },
  { value: "G+",  label: "Good Plus" },
  { value: "G",   label: "Good" },
  { value: "F",   label: "Fair" },
  { value: "P",   label: "Poor" },
]

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

const AUCTION_STATUS_VARIANT: Record<string, keyof typeof BADGE_VARIANTS> = {
  available: "success",
  reserved: "warning",
  in_auction: "info",
  sold: "purple",
  unsold: "neutral",
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: S.radius.lg,
  padding: S.cardPadding,
  border: `1px solid ${C.border}`,
}

const labelStyle: React.CSSProperties = {
  ...T.micro,
  marginBottom: 4,
}

const valueStyle: React.CSSProperties = {
  ...T.body,
}

const localInputStyle: React.CSSProperties = {
  ...inputStyle,
  maxWidth: "none",
}

const localSelectStyle: React.CSSProperties = {
  ...selectStyle,
  maxWidth: "none",
}

const thStyle: React.CSSProperties = {
  padding: S.cellPadding,
  textAlign: "left",
  ...T.micro,
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: "nowrap",
}

const tdStyle: React.CSSProperties = {
  padding: S.cellPadding,
  ...T.body,
  borderBottom: `1px solid ${C.border}`,
  verticalAlign: "top",
}

// ─── Component ───────────────────────────────────────────────────────────────

const MediaDetailPage = () => {
  useAdminNav()
  const { id } = useParams<{ id: string }>()
  const [release, setRelease] = useState<Release | null>(null)
  const [syncHistory, setSyncHistory] = useState<SyncEntry[]>([])
  const [images, setImages] = useState<ImageEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  const [estimatedValue, setEstimatedValue] = useState<string>("")
  const [mediaCondition, setMediaCondition] = useState<string>("")
  const [sleeveCondition, setSleeveCondition] = useState<string>("")
  const [saleMode, setSaleMode] = useState<string>("auction_only")
  const [directPrice, setDirectPrice] = useState<string>("")
  const [inventory, setInventory] = useState<string>("")
  const [shippingTypeId, setShippingTypeId] = useState<string>("")
  const [shippingTypes, setShippingTypes] = useState<Array<{ id: string; name: string; default_weight_grams: number }>>([])
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const goLightbox = useCallback((dir: "prev" | "next") => {
    setLightboxIndex((i) => {
      if (i === null) return null
      return dir === "prev" ? (i - 1 + images.length) % images.length : (i + 1) % images.length
    })
  }, [images.length])

  useEffect(() => {
    if (lightboxIndex === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null)
      else if (e.key === "ArrowLeft") goLightbox("prev")
      else if (e.key === "ArrowRight") goLightbox("next")
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [lightboxIndex, goLightbox])

  useEffect(() => {
    if (!id) return
    Promise.all([
      fetch(`/admin/media/${id}`, { credentials: "include" }).then((r) => r.json()),
      fetch("/admin/shipping/item-types", { credentials: "include" }).then((r) => r.json()).catch(() => ({ item_types: [] })),
    ]).then(([d, st]) => {
        setRelease(d.release || null)
        setSyncHistory(d.sync_history || [])
        setImages(d.images || [])
        setShippingTypes(st.item_types || [])
        if (d.release) {
          setEstimatedValue(d.release.estimated_value != null ? String(d.release.estimated_value) : "")
          setMediaCondition(d.release.media_condition || "")
          setSleeveCondition(d.release.sleeve_condition || "")
          setSaleMode(d.release.sale_mode || "auction_only")
          setDirectPrice(d.release.direct_price != null ? String(d.release.direct_price) : "")
          setInventory(d.release.inventory != null ? String(d.release.inventory) : "")
          setShippingTypeId(d.release.shipping_item_type_id || "")
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
    setToast(null)
    try {
      const body: Record<string, unknown> = {}
      if (estimatedValue !== "") body.estimated_value = parseFloat(estimatedValue)
      else body.estimated_value = null
      body.media_condition = mediaCondition || null
      body.sleeve_condition = sleeveCondition || null
      body.sale_mode = saleMode
      body.direct_price = directPrice !== "" ? parseFloat(directPrice) : null
      body.inventory = inventory !== "" ? parseInt(inventory) : null
      body.shipping_item_type_id = shippingTypeId || null

      const res = await fetch(`/admin/media/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const d = await res.json()
        setRelease(d.release || release)
        setToast({ message: "Saved successfully", type: "success" })
      } else {
        const err = await res.json().catch(() => ({}))
        setToast({ message: err.message || "Failed to save", type: "error" })
      }
    } catch {
      setToast({ message: "Network error", type: "error" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <PageShell>
        <div style={{ color: C.muted, padding: "40px 0", textAlign: "center" }}>Loading...</div>
      </PageShell>
    )
  }

  if (!release) {
    return (
      <PageShell>
        <EmptyState icon="🔍" title="Release not found" description="This release does not exist or was removed." />
      </PageShell>
    )
  }

  const tapeMagUrl = release.tape_mag_url
  const pageTitle = release.artist_name ? `${release.artist_name} \u2014 ${release.title}` : release.title
  const pageSubtitle = [release.format, release.year, release.label_name].filter(Boolean).join(" \u00B7 ")

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
    <PageShell maxWidth={1100}>
      <PageHeader
        title={pageTitle}
        subtitle={pageSubtitle}
        badge={release.auction_status ? {
          label: release.auction_status.replace(/_/g, " "),
          color: AUCTION_STATUS_VARIANT[release.auction_status] === "success" ? C.success
            : AUCTION_STATUS_VARIANT[release.auction_status] === "warning" ? C.warning
            : AUCTION_STATUS_VARIANT[release.auction_status] === "info" ? C.blue
            : AUCTION_STATUS_VARIANT[release.auction_status] === "purple" ? C.purple
            : C.muted,
        } : undefined}
        actions={
          <div style={{ display: "flex", gap: S.gap.sm }}>
            <a href={`https://vod-auctions.com/catalog/${release.id}`} target="_blank" rel="noopener noreferrer" style={{ ...T.small, color: C.gold, textDecoration: "none" }}>
              View in Catalog &#8599;
            </a>
            {tapeMagUrl && (
              <a href={tapeMagUrl} target="_blank" rel="noopener noreferrer" style={{ ...T.small, color: C.gold, textDecoration: "none" }}>
                tape-mag.com &#8599;
              </a>
            )}
          </div>
        }
      />

      {/* Image + Release Info */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: S.gap.xl, marginBottom: S.sectionGap }}>
        {/* Cover Image */}
        <div>
          {release.coverImage || images.length > 0 ? (
            <div style={{ position: "relative", cursor: "pointer" }} onClick={() => setLightboxIndex(0)}>
              <img
                src={release.coverImage || images[0]?.url}
                alt={release.title}
                style={{ width: "100%", borderRadius: S.radius.lg, border: `1px solid ${C.border}`, aspectRatio: "1", objectFit: "cover" }}
              />
              {images.length > 1 && (
                <span style={{
                  position: "absolute", bottom: 8, right: 8,
                  fontSize: 11, fontFamily: "monospace",
                  background: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.9)",
                  padding: "2px 8px", borderRadius: 12, backdropFilter: "blur(4px)",
                }}>
                  1 / {images.length}
                </span>
              )}
            </div>
          ) : (
            <div style={{
              width: "100%", aspectRatio: "1", borderRadius: S.radius.lg,
              background: C.card, border: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 48, color: C.muted,
            }}>
              &#9835;
            </div>
          )}
          {images.length > 1 && (
            <>
              <div style={{ ...T.small, marginTop: 8, marginBottom: 4 }}>{images.length} images</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, maxHeight: 320, overflowY: "auto" }}>
                {images.slice(1).map((img, i) => (
                  <img
                    key={img.id}
                    src={img.url}
                    alt=""
                    style={{
                      width: "100%", aspectRatio: "1", objectFit: "cover",
                      borderRadius: S.radius.sm, border: `1px solid ${C.border}`, cursor: "pointer",
                    }}
                    onClick={() => setLightboxIndex(i + 1)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Release Information Card */}
        <div style={cardStyle}>
          <SectionHeader title="Release Information" style={{ marginTop: 0 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.gap.lg, marginTop: S.gap.md }}>
            {infoFields.map(([label, value]) => (
              <div key={label as string}>
                <div style={labelStyle}>{label}</div>
                <div style={valueStyle}>{value ?? "\u2014"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Edit Valuation */}
      <div style={{ ...cardStyle, border: `1px solid ${C.gold}30`, marginBottom: S.sectionGap }}>
        <SectionHeader title="Edit Valuation" style={{ marginTop: 0 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: S.gap.lg, marginTop: S.gap.md }}>
          <div>
            <div style={labelStyle}>Inventory (pcs)</div>
            <input type="number" step="1" min="0" value={inventory} onChange={(e) => setInventory(e.target.value)} placeholder="0" style={localInputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Estimated Value (&euro;)</div>
            <input type="number" step="0.01" min="0" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} placeholder="0.00" style={localInputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Media Condition</div>
            <select value={mediaCondition} onChange={(e) => setMediaCondition(e.target.value)} style={localSelectStyle}>
              <option value="">-- Select --</option>
              {CONDITION_OPTIONS.map((c) => (<option key={c.value} value={c.value}>{c.value} \u2014 {c.label}</option>))}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Sleeve Condition</div>
            <select value={sleeveCondition} onChange={(e) => setSleeveCondition(e.target.value)} style={localSelectStyle}>
              <option value="">-- Select --</option>
              {CONDITION_OPTIONS.map((c) => (<option key={c.value} value={c.value}>{c.value} \u2014 {c.label}</option>))}
            </select>
          </div>
        </div>
        <div style={{ ...T.small, marginTop: 6, lineHeight: 1.4 }}>
          Discogs/Goldmine grading: <strong style={{ color: C.text, fontWeight: 500 }}>M</strong> Mint &rarr; <strong style={{ color: C.text, fontWeight: 500 }}>NM</strong> Near Mint &rarr; <strong style={{ color: C.text, fontWeight: 500 }}>VG+</strong> Very Good Plus &rarr; <strong style={{ color: C.text, fontWeight: 500 }}>VG</strong> Very Good &rarr; <strong style={{ color: C.text, fontWeight: 500 }}>G+</strong> Good Plus &rarr; <strong style={{ color: C.text, fontWeight: 500 }}>G</strong> Good &rarr; <strong style={{ color: C.text, fontWeight: 500 }}>F</strong> Fair &rarr; <strong style={{ color: C.text, fontWeight: 500 }}>P</strong> Poor
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.gap.lg, marginTop: S.gap.lg }}>
          <div>
            <div style={labelStyle}>Sale Mode</div>
            <select value={saleMode} onChange={(e) => setSaleMode(e.target.value)} style={localSelectStyle}>
              <option value="auction_only">Auction Only</option>
              <option value="direct_purchase">Direct Purchase</option>
              <option value="both">Both (Auction + Direct)</option>
            </select>
          </div>
          {saleMode !== "auction_only" && (
            <div>
              <div style={labelStyle}>Direct Price (&euro;)</div>
              <input type="number" step="0.01" min="0.01" value={directPrice} onChange={(e) => setDirectPrice(e.target.value)} placeholder="0.00" style={localInputStyle} />
            </div>
          )}
        </div>
        {shippingTypes.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.gap.lg, marginTop: S.gap.lg }}>
            <div>
              <div style={labelStyle}>Shipping Type (override)</div>
              <select value={shippingTypeId} onChange={(e) => setShippingTypeId(e.target.value)} style={localSelectStyle}>
                <option value="">Auto (from format)</option>
                {shippingTypes.map((t) => (<option key={t.id} value={t.id}>{t.name} ({t.default_weight_grams}g)</option>))}
              </select>
            </div>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: S.gap.md, marginTop: S.gap.lg }}>
          <Btn label={saving ? "Saving..." : "Save"} variant="gold" onClick={handleSave} disabled={saving} style={{ padding: "8px 24px", fontSize: 13 }} />
        </div>
      </div>

      {/* Discogs Data */}
      <div style={{ ...cardStyle, marginBottom: S.sectionGap }}>
        <SectionHeader title="Discogs Data" style={{ marginTop: 0 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr 1fr", gap: S.gap.lg, marginTop: S.gap.md }}>
          <div>
            <div style={labelStyle}>Discogs ID</div>
            <div style={valueStyle}>
              {release.discogs_id ? (
                <a href={`https://www.discogs.com/release/${release.discogs_id}`} target="_blank" rel="noopener noreferrer" style={{ color: C.gold, textDecoration: "none" }}>
                  {release.discogs_id} &#8599;
                </a>
              ) : "\u2014"}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Low</div>
            <div style={{ ...valueStyle, color: release.discogs_lowest_price ? C.success : C.muted }}>{formatPrice(release.discogs_lowest_price)}</div>
          </div>
          <div>
            <div style={labelStyle}>Median</div>
            <div style={{ ...valueStyle, color: release.discogs_median_price ? C.gold : C.muted }}>{formatPrice(release.discogs_median_price)}</div>
          </div>
          <div>
            <div style={labelStyle}>High</div>
            <div style={{ ...valueStyle, color: release.discogs_highest_price ? C.error : C.muted }}>{formatPrice(release.discogs_highest_price)}</div>
          </div>
          <div>
            <div style={labelStyle}>For Sale</div>
            <div style={valueStyle}>{release.discogs_num_for_sale ?? "\u2014"}</div>
          </div>
          <div>
            <div style={labelStyle}>Have</div>
            <div style={valueStyle}>{release.discogs_have ?? "\u2014"}</div>
          </div>
          <div>
            <div style={labelStyle}>Want</div>
            <div style={valueStyle}>{release.discogs_want ?? "\u2014"}</div>
          </div>
        </div>
        <div style={{ marginTop: S.gap.md }}>
          <div style={labelStyle}>Last Discogs Sync</div>
          <div style={{ ...valueStyle, ...T.small }}>{formatDate(release.discogs_last_synced)}</div>
        </div>
      </div>

      {/* Notes + Tracklist */}
      {(release.description || release.tracklist) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.gap.xl, marginBottom: S.sectionGap }}>
          {release.description && (
            <div style={cardStyle}>
              <SectionHeader title="Notes" style={{ marginTop: 0 }} />
              <div style={{ ...T.body, whiteSpace: "pre-wrap", lineHeight: 1.5, marginTop: S.gap.md }}>{release.description}</div>
            </div>
          )}
          {release.tracklist && (
            <div style={cardStyle}>
              <SectionHeader title="Tracklist" style={{ marginTop: 0 }} />
              <div style={{ ...T.body, lineHeight: 1.5, marginTop: S.gap.md }}>
                {Array.isArray(release.tracklist)
                  ? release.tracklist.map((t, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                        <span style={{ color: C.muted, minWidth: 30, textAlign: "right" }}>{t.position || `${i + 1}.`}</span>
                        <span style={{ flex: 1 }}>{t.title}</span>
                        {t.duration && <span style={{ color: C.muted }}>{t.duration}</span>}
                      </div>))
                  : typeof release.tracklist === "string" ? release.tracklist : JSON.stringify(release.tracklist, null, 2)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sync History */}
      <div style={{ ...cardStyle, marginBottom: S.sectionGap }}>
        <SectionHeader title="Sync History" count={syncHistory.length} style={{ marginTop: 0 }} />
        {syncHistory.length === 0 ? (
          <EmptyState icon="🔄" title="No sync entries yet" description="Sync history will appear here after the first sync run." />
        ) : (
          <div style={{ overflow: "auto", marginTop: S.gap.md }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: C.card }}>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Changes</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Error</th>
                </tr>
              </thead>
              <tbody>
                {syncHistory.slice(0, 20).map((entry) => (
                  <tr key={entry.id} style={{ transition: "background 0.1s" }} onMouseOver={(e) => (e.currentTarget.style.background = C.hover)} onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td style={tdStyle}>{formatDate(entry.sync_date)}</td>
                    <td style={tdStyle}>
                      <Badge label={entry.sync_type} variant={entry.sync_type === "legacy" ? "info" : "purple"} />
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 400 }}>
                      {entry.changes ? (
                        <pre style={{ ...T.mono, color: C.muted, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {JSON.stringify(entry.changes, null, 2)}
                        </pre>
                      ) : (
                        <span style={{ color: C.muted }}>{"\u2014"}</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <Badge label={entry.status} variant={entry.status === "success" ? "success" : "error"} />
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12, color: C.error }}>{entry.error_message || "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Lightbox Overlay */}
      {lightboxIndex !== null && images.length > 0 && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.92)", backdropFilter: "blur(8px)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setLightboxIndex(null)}
        >
          <button
            onClick={() => setLightboxIndex(null)}
            style={{
              position: "absolute", top: 16, right: 16,
              background: "rgba(255,255,255,0.1)", border: "none", color: "white",
              fontSize: 24, width: 40, height: 40, borderRadius: 8, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            &times;
          </button>

          <div
            style={{ position: "relative", maxWidth: "85vw", maxHeight: "75vh", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <img src={images[lightboxIndex].url} alt="" style={{ maxWidth: "85vw", maxHeight: "75vh", objectFit: "contain", borderRadius: 8 }} />

            {images.length > 1 && (
              <>
                <button
                  onClick={() => goLightbox("prev")}
                  style={{
                    position: "absolute", left: -48, top: "50%", transform: "translateY(-50%)",
                    background: "rgba(255,255,255,0.1)", border: "none", color: "white",
                    fontSize: 20, width: 36, height: 36, borderRadius: "50%", cursor: "pointer",
                  }}
                >
                  &lsaquo;
                </button>
                <button
                  onClick={() => goLightbox("next")}
                  style={{
                    position: "absolute", right: -48, top: "50%", transform: "translateY(-50%)",
                    background: "rgba(255,255,255,0.1)", border: "none", color: "white",
                    fontSize: 20, width: 36, height: 36, borderRadius: "50%", cursor: "pointer",
                  }}
                >
                  &rsaquo;
                </button>
              </>
            )}
          </div>

          {images.length > 1 && (
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 12 }}>
              {lightboxIndex + 1} / {images.length}
            </div>
          )}

          {images.length > 1 && (
            <div
              style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto", maxWidth: "90vw", padding: 4 }}
              onClick={(e) => e.stopPropagation()}
            >
              {images.map((img, i) => (
                <img
                  key={img.id}
                  src={img.url}
                  alt=""
                  onClick={() => setLightboxIndex(i)}
                  style={{
                    width: 48, height: 48, objectFit: "cover",
                    borderRadius: 6, cursor: "pointer", flexShrink: 0,
                    border: i === lightboxIndex ? `2px solid ${C.gold}` : "2px solid transparent",
                    opacity: i === lightboxIndex ? 1 : 0.5,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </PageShell>
  )
}

const MediaDetailPageWithBoundary = () => (<ErrorBoundary><MediaDetailPage /></ErrorBoundary>)

export default MediaDetailPageWithBoundary
