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
  credits: string | null
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
  // ERP inventory fields (from erp_inventory_item, left-joined — may be null for non-cohort-A items)
  inventory_item_id: string | null
  inventory_barcode: string | null
  inventory_status: string | null   // in_stock | sold | damaged | written_off
  inventory_quantity: number | null
  inventory_source: string | null   // e.g. 'frank_collection'
  price_locked: boolean | null
  price_locked_at: string | null
  last_stocktake_at: string | null
  last_stocktake_by: string | null
  barcode_printed_at: string | null
  inventory_notes: string | null
  warehouse_location_id: string | null
  warehouse_location_code: string | null
  warehouse_location_name: string | null
}

type InventoryItem = {
  inventory_item_id: string
  inventory_barcode: string | null
  inventory_status: string | null
  inventory_quantity: number | null
  inventory_source: string | null
  price_locked: boolean | null
  price_locked_at: string | null
  last_stocktake_at: string | null
  last_stocktake_by: string | null
  barcode_printed_at: string | null
  inventory_notes: string | null
  warehouse_location_id: string | null
  warehouse_location_code: string | null
  warehouse_location_name: string | null
}

type InventoryMovement = {
  id: string
  inventory_item_id?: string
  type: string           // inbound | outbound | adjustment | write_off | damaged | transfer
  quantity_change: number
  reason: string | null
  reference: Record<string, unknown> | null
  performed_by: string | null
  created_at: string
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

// ─── HTML Cleaning & Tracklist Parsing (ported from storefront/src/lib/utils.ts) ─

function cleanRawText(raw: string): string[] {
  let text = raw
    .replace(/\\r\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\xA0/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, '\u2013')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&amp;/g, '&')
    .replace(/&auml;/g, 'ä')
    .replace(/&ouml;/g, 'ö')
    .replace(/&uuml;/g, 'ü')
    .replace(/&Auml;/g, 'Ä')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')

  let lines = text.split('\n').map(line => line.replace(/\s+/g, ' ').trim())

  lines = lines.reduce<string[]>((acc, line) => {
    if (line === '') {
      if (acc.length > 0 && acc[acc.length - 1] !== '') acc.push('')
    } else {
      acc.push(line)
    }
    return acc
  }, [])

  // Merge Discogs fragment suffixes
  const prefixed: string[] = []
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k]
    if (line === '*' && prefixed.length > 0) {
      let prevIdx = prefixed.length - 1
      while (prevIdx >= 0 && prefixed[prevIdx] === '') prevIdx--
      if (prevIdx >= 0) { prefixed[prevIdx] += ' *'; continue }
    }
    if (line === '/' && prefixed.length > 0) {
      let prevIdx = prefixed.length - 1
      while (prevIdx >= 0 && prefixed[prevIdx] === '') prevIdx--
      let next = k + 1
      while (next < lines.length && lines[next] === '') next++
      if (prevIdx >= 0 && next < lines.length) { prefixed[prevIdx] += ' / ' + lines[next]; k = next; continue }
    }
    prefixed.push(line)
  }

  // Merge fragmented "Role \n – \n Name" patterns
  const merged: string[] = []
  for (let i = 0; i < prefixed.length; i++) {
    const line = prefixed[i]
    if (/^[\u2013\-\u2014]+$/.test(line) && merged.length > 0) {
      let next = i + 1
      while (next < prefixed.length && prefixed[next] === '') next++
      if (next < prefixed.length) {
        let prevIdx = merged.length - 1
        while (prevIdx >= 0 && merged[prevIdx] === '') prevIdx--
        if (prevIdx >= 0) merged[prevIdx] += ' \u2013 ' + prefixed[next]
        i = next
      }
    } else {
      merged.push(line)
    }
  }

  return merged.filter(Boolean)
}

// Matches: A1, B2, 1, 12, 1-1, 2-3, A1a
const POSITION_RE = /^([A-Z]{1,2}\d{0,2}[a-z]?|\d{1,2}(-\d{1,2})?)\.?$/
const DURATION_RE = /^\d{1,3}:\d{2}$/
// Section headers like -I-, -II-, -III-
const SECTION_RE = /^-[IVX]+[-.]?$/

type ParsedTrack = { position?: string; title: string; duration?: string }

function extractTracklistFromText(raw: string): { tracks: ParsedTrack[]; remainingCredits: string | null } {
  const lines = cleanRawText(raw)
  if (lines.length === 0) return { tracks: [], remainingCredits: null }

  const tracks: ParsedTrack[] = []
  const creditLines: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Skip section headers (-I-, -II-, "Tracklist" label)
    if (SECTION_RE.test(line) || /^tracklist$/i.test(line)) {
      i++; continue
    }

    if (DURATION_RE.test(line)) {
      let peek = i + 1
      while (peek < lines.length && lines[peek] === '') peek++
      if (peek < lines.length && (POSITION_RE.test(lines[peek]) || SECTION_RE.test(lines[peek]))) {
        if (tracks.length > 0 && !tracks[tracks.length - 1].duration) tracks[tracks.length - 1].duration = line
        i++; continue
      }
    }

    if (POSITION_RE.test(line)) {
      const position = line
      let title: string | null = null
      let duration: string | undefined

      let j = i + 1
      while (j < lines.length && lines[j] === '') j++
      if (j < lines.length && !POSITION_RE.test(lines[j]) && !DURATION_RE.test(lines[j]) && !SECTION_RE.test(lines[j])) {
        title = lines[j]; j++
        while (j < lines.length && lines[j] === '') j++
        if (j < lines.length && DURATION_RE.test(lines[j])) { duration = lines[j]; j++ }
      }

      if (title) { tracks.push({ position, title, duration }); i = j; continue }
    }

    if (line !== '') creditLines.push(line)
    i++
  }

  if (tracks.length > 0 && creditLines.length > 0) {
    const lastCredit = creditLines[creditLines.length - 1]
    if (DURATION_RE.test(lastCredit) && !tracks[tracks.length - 1].duration) {
      tracks[tracks.length - 1].duration = lastCredit
      creditLines.pop()
    }
  }

  if (tracks.length < 2) return { tracks: [], remainingCredits: raw }

  return { tracks, remainingCredits: creditLines.length > 0 ? creditLines.join('\n') : null }
}

// Matches: A, B, A1, B2, 1, 12, 1-1, 2-3
const FLAT_POS_RE = /^[A-Z]{0,2}\d{0,2}(-\d{1,2})?$/
const FLAT_DUR_RE = /^\d{1,3}:\d{2}$/
const FLAT_SECTION_RE = /^-[IVX]+[-.]?$/

function parseUnstructuredTracklist(
  tracks: { position?: string | null; title?: string | null; duration?: string | null }[]
): ParsedTrack[] | null {
  if (!tracks || tracks.length < 3) return null

  const result: ParsedTrack[] = []
  let i = 0

  while (i < tracks.length) {
    const t0 = (tracks[i]?.title || tracks[i]?.position || "").trim()

    // Skip section headers (-I-, -II-, "Tracklist" label)
    if (FLAT_SECTION_RE.test(t0) || /^tracklist$/i.test(t0)) {
      i++; continue
    }

    const t1 = (tracks[i + 1]?.title || tracks[i + 1]?.position || "").trim()
    const t2 = (tracks[i + 2]?.title || tracks[i + 2]?.position || "").trim()

    const t0isPos = t0.length > 0 && t0.length <= 5 && FLAT_POS_RE.test(t0)
    const t1isTitle = t1.length > 0 && !FLAT_POS_RE.test(t1) && !FLAT_DUR_RE.test(t1) && !FLAT_SECTION_RE.test(t1)
    const t2isDur = t2.length > 0 && FLAT_DUR_RE.test(t2)

    if (t0isPos && t1isTitle && t2isDur && i + 2 < tracks.length) {
      result.push({ position: t0, title: t1, duration: t2 }); i += 3; continue
    }
    if (t0isPos && t1isTitle && i + 1 < tracks.length) {
      result.push({ position: t0, title: t1 }); i += 2; continue
    }
    i++
  }

  return result.length >= 2 ? result : null
}

type CreditEntry = { role: string; name: string }

function parseCredits(raw: string): CreditEntry[] | null {
  const lines = cleanRawText(raw)
  if (lines.length === 0) return null

  const entries: CreditEntry[] = []

  for (const line of lines) {
    if (line === '') continue

    // Discogs-style: "Role – Name" or "Role — Name"
    const dashMatch = line.match(/^(.+?)\s+[\u2013\u2014]\s+(.+)$/)
    if (dashMatch) {
      entries.push({ role: dashMatch[1].trim(), name: dashMatch[2].trim() })
      continue
    }

    // "Role by Name"
    const byMatch = line.match(/^(.+?)\s+by\s+(.+)$/i)
    if (byMatch && byMatch[1].length < 40) {
      entries.push({ role: byMatch[1].trim(), name: byMatch[2].trim() })
      continue
    }

    // "Role: Name"
    const colonMatch = line.match(/^([^:]{2,40}):\s+(.+)$/)
    if (colonMatch) {
      entries.push({ role: colonMatch[1].trim(), name: colonMatch[2].trim() })
      continue
    }

    // Fallback: unstructured line
    entries.push({ role: '', name: line })
  }

  return entries.length > 0 ? entries : null
}

// ─── Data ─────────────────────────────────────────────────────────────────────

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
  fontWeight: 500,
  background: C.card,
  padding: "6px 10px",
  borderRadius: S.radius.sm,
  border: `1px solid ${C.border}`,
  minHeight: 32,
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

// ─── Tracklist Row ───────────────────────────────────────────────────────────

function TrackRow({ track, index }: { track: ParsedTrack; index: number }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
      <span style={{ color: C.muted, minWidth: 30, textAlign: "right", flexShrink: 0 }}>{track.position || `${index + 1}.`}</span>
      <span style={{ flex: 1, color: C.text }}>{track.title}</span>
      {track.duration && <span style={{ color: C.muted, flexShrink: 0 }}>{track.duration}</span>}
    </div>
  )
}

// ─── Notes + Tracklist Section ───────────────────────────────────────────────

function NotesAndTracklist({ credits, tracklist }: {
  credits: string | null
  tracklist: { position?: string; title?: string; duration?: string }[] | null
  description: string | null  // kept in signature for compat but NOT used (matches frontend)
}) {
  if (!credits && !tracklist) return null

  // === STEP 1: Tracklist — mirrors storefront/src/app/catalog/[id]/page.tsx lines 149-157 ===
  const extracted = credits ? extractTracklistFromText(credits) : null
  const effectiveTracklist: ParsedTrack[] =
    extracted?.tracks.length
      ? extracted.tracks
      : (tracklist?.length
          ? (parseUnstructuredTracklist(tracklist as { position?: string | null; title?: string | null; duration?: string | null }[])
              ?? tracklist.filter((t) => t.title).map((t) => ({
                   position: t.position,
                   title: cleanRawText(t.title || "").join(" "),
                   duration: t.duration,
                 })))
          : [])

  // === STEP 2: Credits — mirrors storefront lines 159-161 ===
  const effectiveCredits = extracted?.tracks.length
    ? extracted.remainingCredits
    : credits

  // === STEP 3: Parse credits for structured display (mirrors CreditsTable.tsx) ===
  let creditEntries: CreditEntry[] | null = null
  if (effectiveCredits) {
    creditEntries = parseCredits(effectiveCredits)
  }
  // NO description fallback — frontend never uses description for credits

  const hasCredits = creditEntries && creditEntries.length > 0
  const hasTracks = effectiveTracklist.length > 0
  if (!hasCredits && !hasTracks) return null

  const hasStructuredCredits = hasCredits && creditEntries!.some((e) => e.role)
  const columns = hasCredits && hasTracks ? "1fr 1fr" : "1fr"

  return (
    <div style={{ display: "grid", gridTemplateColumns: columns, gap: S.gap.xl, marginBottom: S.sectionGap }}>
      {hasCredits && (
        <div style={cardStyle}>
          <SectionHeader title="Credits" style={{ marginTop: 0 }} />
          <div style={{ marginTop: S.gap.md }}>
            {hasStructuredCredits ? (
              creditEntries!.map((entry, i) =>
                entry.role ? (
                  <div key={i} style={{ padding: "3px 0" }}>
                    <div style={{ ...T.micro, fontSize: 10, marginBottom: 1 }}>{entry.role}</div>
                    <div style={{ ...T.body, borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>{entry.name}</div>
                  </div>
                ) : (
                  <div key={i} style={{ ...T.body, padding: "3px 0" }}>{entry.name}</div>
                )
              )
            ) : (
              <div style={{ ...T.body, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {creditEntries!.map((e) => e.name).join('\n')}
              </div>
            )}
          </div>
        </div>
      )}
      {hasTracks && (
        <div style={cardStyle}>
          <SectionHeader title="Tracklist" count={effectiveTracklist.length} style={{ marginTop: 0 }} />
          <div style={{ ...T.body, lineHeight: 1.5, marginTop: S.gap.md }}>
            {effectiveTracklist.map((t, i) => <TrackRow key={i} track={t} index={i} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

const MediaDetailPage = () => {
  useAdminNav()
  const { id } = useParams<{ id: string }>()
  const [release, setRelease] = useState<Release | null>(null)
  const [syncHistory, setSyncHistory] = useState<SyncEntry[]>([])
  const [importHistory, setImportHistory] = useState<Array<{
    id: string
    run_id: string
    action: "inserted" | "linked" | "updated" | "skipped"
    discogs_id: number
    collection_name: string | null
    import_source: string | null
    created_at: string
    session_id: string | null
    session_status: string | null
  }>>([])
  const [images, setImages] = useState<ImageEntry[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([])
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
  const [locations, setLocations] = useState<Array<{ id: string; code: string; name: string }>>([])
  const [locationId, setLocationId] = useState<string>("")
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
      fetch("/admin/erp/locations", { credentials: "include" }).then((r) => r.json()).catch(() => ({ locations: [] })),
    ]).then(([d, st, loc]) => {
        setRelease(d.release || null)
        setSyncHistory(d.sync_history || [])
        setImportHistory(d.import_history || [])
        setImages(d.images || [])
        setInventoryItems(d.inventory_items || [])
        setInventoryMovements(d.inventory_movements || [])
        setShippingTypes(st.item_types || [])
        setLocations((loc.locations || []).filter((l: { is_active: boolean }) => l.is_active))
        if (d.release) {
          setEstimatedValue(d.release.estimated_value != null ? String(d.release.estimated_value) : "")
          setMediaCondition(d.release.media_condition || "")
          setSleeveCondition(d.release.sleeve_condition || "")
          setSaleMode(d.release.sale_mode || "auction_only")
          setDirectPrice(d.release.direct_price != null ? String(d.release.direct_price) : "")
          setInventory(d.release.inventory != null ? String(d.release.inventory) : "")
          setShippingTypeId(d.release.shipping_item_type_id || "")
          setLocationId(d.release.warehouse_location_id || "")
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
      body.warehouse_location_id = locationId || null

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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.gap.lg, marginTop: S.gap.lg }}>
          {shippingTypes.length > 0 && (
            <div>
              <div style={labelStyle}>Shipping Type (override)</div>
              <select value={shippingTypeId} onChange={(e) => setShippingTypeId(e.target.value)} style={localSelectStyle}>
                <option value="">Auto (from format)</option>
                {shippingTypes.map((t) => (<option key={t.id} value={t.id}>{t.name} ({t.default_weight_grams}g)</option>))}
              </select>
            </div>
          )}
          {locations.length > 0 && (
            <div>
              <div style={labelStyle}>Storage Location</div>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={localSelectStyle}>
                <option value="">-- Not assigned --</option>
                {locations.map((l) => (<option key={l.id} value={l.id}>{l.code} — {l.name}</option>))}
              </select>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: S.gap.md, marginTop: S.gap.lg }}>
          <Btn label={saving ? "Saving..." : "Save"} variant="gold" onClick={handleSave} disabled={saving} style={{ padding: "8px 24px", fontSize: 13 }} />
        </div>
      </div>

      {/* Inventory Status — ERP stocktake audit trail + quick actions */}
      {release.inventory_item_id && (
        <div style={{ ...cardStyle, marginBottom: S.sectionGap }}>
          <SectionHeader title={`Inventory Status${inventoryItems.length > 1 ? ` (${inventoryItems.length} Exemplare)` : ""}`} style={{ marginTop: 0 }} />

          {/* Multi-exemplar table — only shown when release has 2+ inventory items */}
          {inventoryItems.length > 1 && (
            <div style={{ marginTop: S.gap.md, marginBottom: S.gap.lg }}>
              <div style={{ overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: C.card }}>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Barcode</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Stocktake</th>
                      <th style={thStyle}>Preis gesperrt</th>
                      <th style={thStyle}>Lagerort</th>
                      <th style={thStyle}>Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryItems.map((item, idx) => (
                      <tr key={item.inventory_item_id}
                          style={{ transition: "background 0.1s" }}
                          onMouseOver={(e) => (e.currentTarget.style.background = C.hover)}
                          onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ ...tdStyle, fontFamily: "monospace", letterSpacing: "0.05em" }}>
                          {item.inventory_barcode || "\u2014"}
                        </td>
                        <td style={tdStyle}>
                          <Badge label={item.inventory_status || "unknown"} variant={
                            item.inventory_status === "in_stock" ? "success"
                              : item.inventory_status === "sold" ? "purple"
                                : "neutral"
                          } />
                        </td>
                        <td style={{ ...tdStyle, ...T.small }}>
                          {item.last_stocktake_at ? formatDate(item.last_stocktake_at) : "\u2014"}
                        </td>
                        <td style={tdStyle}>
                          {item.price_locked ? <Badge label="Locked" variant="info" /> : "\u2014"}
                        </td>
                        <td style={{ ...tdStyle, ...T.small }}>
                          {item.warehouse_location_code || "\u2014"}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              style={{ background: "none", border: "none", color: C.gold, cursor: "pointer", fontSize: 12, textDecoration: "underline" }}
                              onClick={() => window.location.href = `/app/erp/inventory/session?item_id=${item.inventory_item_id}`}
                            >Session</button>
                            <button
                              style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12, textDecoration: "underline" }}
                              onClick={() => window.open(`/admin/erp/inventory/items/${item.inventory_item_id}/label`, "_blank")}
                            >Label</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Status badges row */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: S.gap.md, marginBottom: S.gap.lg }}>
            {(() => {
              // Determine primary status badge
              if (release.inventory_status === "sold") {
                return <Badge label="🔴 Verkauft" variant="purple" />
              }
              if (release.inventory_status === "written_off" || release.inventory_status === "damaged") {
                const lbl = release.inventory_status === "damaged" ? "⚫ Beschädigt" : "⚫ Abgeschrieben"
                return <Badge label={lbl} variant="neutral" />
              }
              // Missing per F2 convention: price=0 + price_locked=true + no stocktake means "in stock but not findable"
              if (release.price_locked && release.direct_price === 0) {
                return <Badge label="🟠 Als missing markiert (Preis 0 €)" variant="warning" />
              }
              if (release.last_stocktake_at) {
                return <Badge label={`🟢 Verifiziert am ${formatDate(release.last_stocktake_at)}`} variant="success" />
              }
              return <Badge label="🟡 Noch nicht verifiziert" variant="warning" />
            })()}
            {release.last_stocktake_by && (
              <Badge label={`durch ${release.last_stocktake_by}`} variant="neutral" />
            )}
            {release.price_locked && (
              <Badge label="🔒 Preis gesperrt (Sync-Schutz aktiv)" variant="info" />
            )}
          </div>

          {/* Metadata grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S.gap.lg, marginBottom: S.gap.lg }}>
            <div>
              <div style={labelStyle}>Barcode</div>
              <div style={{ ...valueStyle, fontFamily: "monospace", letterSpacing: "0.05em" }}>
                {release.inventory_barcode || "\u2014 (wird beim ersten Verify vergeben)"}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Barcode gedruckt</div>
              <div style={{ ...valueStyle, ...T.small }}>{formatDate(release.barcode_printed_at)}</div>
            </div>
            <div>
              <div style={labelStyle}>Letzter Stocktake</div>
              <div style={{ ...valueStyle, ...T.small }}>{formatDate(release.last_stocktake_at)}</div>
            </div>
            <div>
              <div style={labelStyle}>Lagerbestand</div>
              <div style={valueStyle}>
                {release.inventory_quantity != null ? `${release.inventory_quantity} Stück` : "\u2014"}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Status</div>
              <div style={valueStyle}>{release.inventory_status || "\u2014"}</div>
            </div>
            <div>
              <div style={labelStyle}>Quelle</div>
              <div style={valueStyle}>{release.inventory_source || "\u2014"}</div>
            </div>
            <div>
              <div style={labelStyle}>Lagerort</div>
              <div style={{ ...valueStyle, ...T.small }}>
                {release.warehouse_location_name
                  ? `${release.warehouse_location_code || ""} · ${release.warehouse_location_name}`
                  : "Nicht zugeordnet"}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Preis gesperrt seit</div>
              <div style={{ ...valueStyle, ...T.small }}>{formatDate(release.price_locked_at)}</div>
            </div>
          </div>

          {/* Inventory notes (if any) */}
          {release.inventory_notes && (
            <div style={{ marginBottom: S.gap.lg }}>
              <div style={labelStyle}>Inventur-Notizen</div>
              <div style={{
                ...valueStyle,
                whiteSpace: "pre-wrap",
                fontStyle: "italic",
                color: C.muted,
                minHeight: 40,
              }}>
                {release.inventory_notes}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: S.gap.md, marginBottom: S.gap.lg, flexWrap: "wrap" }}>
            <Btn
              label="📋 In Stocktake-Session laden"
              variant="primary"
              onClick={() => {
                window.location.href = `/app/erp/inventory/session?item_id=${release.inventory_item_id}`
              }}
            />
            <Btn
              label="🏷️ Label drucken"
              variant="gold"
              onClick={() => {
                window.open(`/admin/erp/inventory/items/${release.inventory_item_id}/label`, "_blank")
              }}
            />
          </div>

          {/* Movement timeline */}
          {inventoryMovements.length > 0 && (
            <div>
              <div style={{ ...labelStyle, marginBottom: 8, marginTop: S.gap.md }}>
                Movement-Timeline ({inventoryMovements.length} Einträge)
              </div>
              <div style={{ overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: C.card }}>
                      <th style={thStyle}>Datum</th>
                      <th style={thStyle}>Typ</th>
                      <th style={thStyle}>Grund</th>
                      <th style={thStyle}>Menge</th>
                      <th style={thStyle}>Durch</th>
                      <th style={thStyle}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryMovements.map((m) => {
                      const typeVariant: "success" | "warning" | "info" | "neutral" | "purple" =
                        m.type === "inbound" ? "success"
                          : m.type === "outbound" ? "purple"
                            : m.type === "write_off" || m.type === "damaged" ? "neutral"
                              : m.type === "adjustment" ? "info" : "warning"
                      const refText = m.reference
                        ? Object.entries(m.reference)
                            .filter(([k]) => k !== "notes")
                            .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                            .join(", ")
                        : "\u2014"
                      return (
                        <tr key={m.id} style={{ transition: "background 0.1s" }}
                            onMouseOver={(e) => (e.currentTarget.style.background = C.hover)}
                            onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}>
                          <td style={{ ...tdStyle, ...T.small, whiteSpace: "nowrap" }}>{formatDate(m.created_at)}</td>
                          <td style={tdStyle}>
                            <Badge label={m.type} variant={typeVariant} />
                          </td>
                          <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>
                            {m.reason || "\u2014"}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
                            {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
                          </td>
                          <td style={{ ...tdStyle, ...T.small, color: C.muted }}>{m.performed_by || "system"}</td>
                          <td style={{ ...tdStyle, ...T.small, color: C.muted, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                              title={refText}>
                            {refText}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

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
      <NotesAndTracklist credits={release.credits} tracklist={release.tracklist} description={release.description} />

      {/* Import History — which Discogs imports touched this release */}
      {importHistory.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: S.sectionGap }}>
          <SectionHeader title="Import History" count={importHistory.length} style={{ marginTop: 0 }} />
          <div style={{ overflow: "auto", marginTop: S.gap.md }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: C.card }}>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Collection</th>
                  <th style={thStyle}>Source File</th>
                  <th style={thStyle}>Action</th>
                  <th style={thStyle}>Discogs ID</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {importHistory.map((entry) => {
                  const actionVariant: "success" | "warning" | "info" | "neutral" =
                    entry.action === "inserted" ? "success"
                      : entry.action === "linked" ? "warning"
                        : entry.action === "updated" ? "info"
                          : "neutral"
                  return (
                    <tr key={entry.id} style={{ transition: "background 0.1s" }} onMouseOver={(e) => (e.currentTarget.style.background = C.hover)} onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}>
                      <td style={tdStyle}>{formatDate(entry.created_at)}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{entry.collection_name || "\u2014"}</td>
                      <td style={{ ...tdStyle, fontSize: 12, color: C.muted, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.import_source || "\u2014"}</td>
                      <td style={tdStyle}>
                        <Badge label={entry.action} variant={actionVariant} />
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12 }}>
                        <a href={`https://www.discogs.com/release/${entry.discogs_id}`} target="_blank" rel="noopener noreferrer" style={{ color: C.muted, textDecoration: "none" }}>
                          {entry.discogs_id}
                        </a>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <a href={`/app/discogs-import/history/${encodeURIComponent(entry.run_id)}`} target="_blank" rel="noopener noreferrer" style={{ color: C.gold, textDecoration: "none", fontSize: 12, fontWeight: 600 }}>
                          View Run →
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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
