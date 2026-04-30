import { Component, useCallback, useEffect, useState } from "react"
import type { ErrorInfo, ReactNode } from "react"
import { useParams } from "react-router-dom"
import { useAdminNav } from "../../../components/admin-nav"
import { C, T, S, fmtDate, fmtMoney, BADGE_VARIANTS } from "../../../components/admin-tokens"
import { PageHeader, PageShell, SectionHeader } from "../../../components/admin-layout"
import { Badge, Btn, Toast, EmptyState, inputStyle, selectStyle } from "../../../components/admin-ui"
import { printLabelAuto } from "../../../lib/print-client"
import { SourceBadge } from "../../../components/release-detail/SourceBadge"
import { LockBanner } from "../../../components/release-detail/LockBanner"
import { ArtistPickerModal, LabelPickerModal, CountryPickerModal, FormatPickerModal, DescriptorPickerModal, GenrePickerModal, StylesPickerModal } from "../../../components/release-detail/PickerModals"
import { DiscogsReviewModal, type DiscogsPreviewResponse } from "../../../components/release-detail/DiscogsReviewModal"
import { findCountry, isValidIsoCode, flagFor } from "../../../data/country-iso"
import { AuditHistory } from "../../../components/release-detail/AuditHistory"
import { TrackManagement } from "../../../components/release-detail/TrackManagement"
import { ReleaseImageGallery, type GalleryImage } from "../../../components/release-image-gallery"
import { ContributingArtistsSection, type ContributingArtist } from "../../../components/release-contributing-artists"
import { validateReleaseStammdaten } from "../../../../lib/release-validation"
import { displayFormat, FORMAT_VALUES, type FormatValue } from "../../../../lib/format-mapping"

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
  artistId: string | null
  labelId: string | null
  artist_name: string | null
  label_name: string | null
  format: string
  format_v2: string | null
  format_descriptors: string[] | null
  year: number | null
  country: string | null
  catalogNumber: string | null
  article_number: string | null
  barcode: string | null
  genres: string[] | null
  styles: string[] | null
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
  shop_price: number | null
  inventory: number | null
  shipping_item_type_id: string | null
  current_block_id: string | null
  current_block_title: string | null
  current_block_slug: string | null
  effective_price: number | null
  copy_number: number | null
  coverImage: string | null
  tape_mag_url: string | null
  discogs_last_synced: string | null
  legacy_last_synced: string | null
  legacy_price: number | string | null
  data_source: string | null
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
  alt?: string | null
  rang?: number | null
  source?: string | null
  type?: string | null
  sort_order?: number | null
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
  background: C.card,
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
  const [contributingArtists, setContributingArtists] = useState<ContributingArtist[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const [meta, setMeta] = useState<{ is_stammdaten_editable: boolean; source: string; locked_fields: string[] } | null>(null)
  const [unlockFieldPending, setUnlockFieldPending] = useState<string | null>(null)
  const [unlockingField, setUnlockingField] = useState(false)
  // Back-to-Inventur-Session: wenn Frank aus der Session hier her gesprungen ist,
  // zeigt die Session-Page setzt beim Mount sessionStorage["vod.inventory_session_active"].
  // Solange das Flag da ist, zeigen wir oben einen Back-Button.
  const [hasActiveSession, setHasActiveSession] = useState<boolean>(false)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("vod.inventory_session_active")
      if (raw) {
        const ts = Number(raw)
        // max 6h alt, sonst als stale ignorieren
        if (!isNaN(ts) && Date.now() - ts < 6 * 3600_000) setHasActiveSession(true)
      }
    } catch { /* ignore */ }
  }, [])

  const [estimatedValue, setEstimatedValue] = useState<string>("")
  const [mediaCondition, setMediaCondition] = useState<string>("")
  const [sleeveCondition, setSleeveCondition] = useState<string>("")
  // Default 2026-04-22: direct_purchase passt zum Walk-in-First-Workflow.
  // Frank's Standard ist Direkt-Verkauf; Auktionen sind die Ausnahme.
  const [saleMode, setSaleMode] = useState<string>("direct_purchase")
  const [shopPrice, setShopPrice] = useState<string>("")
  const [inventory, setInventory] = useState<string>("")
  const [shippingTypeId, setShippingTypeId] = useState<string>("")
  const [shippingTypes, setShippingTypes] = useState<Array<{ id: string; name: string; default_weight_grams: number }>>([])
  const [locations, setLocations] = useState<Array<{ id: string; code: string; name: string }>>([])
  const [locationId, setLocationId] = useState<string>("")
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Q8a: Discogs linking edit fields
  const [discogsIdInput, setDiscogsIdInput] = useState<string>("")
  const [genreInput, setGenreInput] = useState<string>("")
  const [stylesInput, setStylesInput] = useState<string>("")
  const [discogsLinkSaving, setDiscogsLinkSaving] = useState(false)
  // rc51.9.2: Discogs preview/review modal state — replaces the old direct-refetch flow
  const [discogsPreview, setDiscogsPreview] = useState<DiscogsPreviewResponse | null>(null)
  const [discogsPreviewLoading, setDiscogsPreviewLoading] = useState(false)

  // Q2: unlock-price loading state (by inventory_item_id)
  const [unlockingPriceId, setUnlockingPriceId] = useState<string | null>(null)

  // Edit Stammdaten (Phase 2 — Zone-1 fields for discogs_import releases)
  const [sdEditing, setSdEditing] = useState(false)
  const [sdTitle, setSdTitle] = useState("")
  const [sdYear, setSdYear] = useState("")
  const [sdCountry, setSdCountry] = useState("")
  const [sdCatalogNumber, setSdCatalogNumber] = useState("")
  const [sdBarcode, setSdBarcode] = useState("")
  const [sdDescription, setSdDescription] = useState("")
  const [sdCredits, setSdCredits] = useState("")
  const [sdArtistId, setSdArtistId] = useState("")
  const [sdArtistName, setSdArtistName] = useState("")
  const [sdLabelId, setSdLabelId] = useState("")
  const [sdLabelName, setSdLabelName] = useState("")
  const [sdFormatV2, setSdFormatV2] = useState<string>("")
  const [sdDescriptors, setSdDescriptors] = useState<string[]>([])
  const [sdGenres, setSdGenres] = useState<string[]>([])
  const [sdStyles, setSdStyles] = useState<string[]>([])
  const [sdSaving, setSdSaving] = useState(false)
  const [sdPicker, setSdPicker] = useState<"artist" | "label" | "country" | "format" | "descriptors" | "genres" | "styles" | null>(null)
  const [sdError, setSdError] = useState<string | null>(null)
  const [auditRefreshKey, setAuditRefreshKey] = useState(0)

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
        setMeta(d.meta || null)
        setSyncHistory(d.sync_history || [])
        setImportHistory(d.import_history || [])
        setImages(d.images || [])
        setContributingArtists(d.contributing_artists || [])
        setInventoryItems(d.inventory_items || [])
        setInventoryMovements(d.inventory_movements || [])
        setShippingTypes(st.item_types || [])
        setLocations((loc.locations || []).filter((l: { is_active: boolean }) => l.is_active))
        if (d.release) {
          setEstimatedValue(d.release.estimated_value != null ? String(d.release.estimated_value) : "")
          setMediaCondition(d.release.media_condition || "")
          setSleeveCondition(d.release.sleeve_condition || "")
          setSaleMode(d.release.sale_mode || "direct_purchase")
          setShopPrice(d.release.shop_price != null ? String(d.release.shop_price) : "")
          setInventory(d.release.inventory != null ? String(d.release.inventory) : "")
          setShippingTypeId(d.release.shipping_item_type_id || "")
          setLocationId(d.release.warehouse_location_id || "")
          setDiscogsIdInput(d.release.discogs_id != null ? String(d.release.discogs_id) : "")
          setGenreInput(Array.isArray(d.release.genres) ? d.release.genres.join(", ") : "")
          setStylesInput(Array.isArray(d.release.styles) ? d.release.styles.join(", ") : "")
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error("Fetch error:", err)
        setLoading(false)
      })
  }, [id])

  // Refetch nur Images + coverImage nach Galerie-Mutation (Upload/Reorder/Set-Cover/Delete)
  const reloadImages = useCallback(async () => {
    if (!id) return
    try {
      const r = await fetch(`/admin/media/${id}`, { credentials: "include" }).then((r) => r.json())
      setImages(r.images || [])
      setRelease((prev) => (prev ? { ...prev, coverImage: r.release?.coverImage ?? null } : prev))
    } catch (e) {
      console.error("reloadImages failed", e)
    }
  }, [id])

  const reloadContributingArtists = useCallback(async () => {
    if (!id) return
    try {
      const r = await fetch(`/admin/media/${id}/contributing-artists`, { credentials: "include" }).then((r) => r.json())
      setContributingArtists(r.contributing_artists || [])
    } catch (e) {
      console.error("reloadContributingArtists failed", e)
    }
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
      body.shop_price = shopPrice !== "" ? parseFloat(shopPrice) : null
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

  const handleStartEditStammdaten = () => {
    if (!release) return
    setSdTitle(release.title || "")
    setSdYear(release.year != null ? String(release.year) : "")
    setSdCountry(release.country || "")
    setSdCatalogNumber(release.catalogNumber || "")
    setSdBarcode(release.barcode || "")
    setSdDescription(release.description || "")
    setSdCredits(release.credits || "")
    setSdArtistId(release.artistId || "")
    setSdArtistName(release.artist_name || "")
    setSdLabelId(release.labelId || "")
    setSdLabelName(release.label_name || "")
    setSdFormatV2(release.format_v2 || "")
    setSdDescriptors(Array.isArray(release.format_descriptors) ? release.format_descriptors : [])
    setSdGenres(Array.isArray(release.genres) ? release.genres : [])
    setSdStyles(Array.isArray(release.styles) ? release.styles : [])
    setSdError(null)
    setSdEditing(true)
  }

  const handleCancelEditStammdaten = () => {
    setSdEditing(false)
    setSdError(null)
  }

  const handleUnlockField = async (field: string) => {
    if (!id || unlockingField) return
    setUnlockingField(true)
    try {
      const resp = await fetch(`/admin/media/${id}/unlock-field`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ field }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setToast({ message: err.message || "Unlock failed", type: "error" })
        return
      }
      const data = await resp.json()
      setMeta((prev) => prev ? { ...prev, locked_fields: data.locked_fields_remaining } : prev)
      setUnlockFieldPending(null)
    } catch {
      setToast({ message: "Unlock failed", type: "error" })
    } finally {
      setUnlockingField(false)
    }
  }

  const handleSaveStammdaten = async () => {
    if (!id) return
    setSdSaving(true)
    setSdError(null)
    try {
      const trimmedTitle = sdTitle.trim()

      const validationErrors = validateReleaseStammdaten({
        title: trimmedTitle,
        year: sdYear,
        country: sdCountry,
        catalogNumber: sdCatalogNumber,
        barcode: sdBarcode,
        description: sdDescription,
      })
      if (Object.keys(validationErrors).length > 0) {
        setSdError(Object.values(validationErrors)[0])
        return
      }

      const yearNum = sdYear !== "" ? parseInt(sdYear, 10) : null
      const body: Record<string, unknown> = {
        title: trimmedTitle,
        year: yearNum,
        country: sdCountry || null,
        catalogNumber: sdCatalogNumber || null,
        barcode: sdBarcode || null,
        description: sdDescription || null,
        credits: sdCredits || null,
        format_v2: sdFormatV2 || null,
        format_descriptors: sdDescriptors,
        genres: sdGenres,
        styles: sdStyles,
      }
      if (sdArtistId) body.artistId = sdArtistId
      if (sdLabelId) body.labelId = sdLabelId

      const res = await fetch(`/admin/media/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const d = await res.json()
        setRelease(d.release || release)
        // Sync locked_fields from the updated release (POST auto-locks hard fields)
        if (d.release?.locked_fields !== undefined) {
          setMeta((prev) => prev ? { ...prev, locked_fields: d.release.locked_fields || [] } : prev)
        }
        setSdEditing(false)
        setAuditRefreshKey(k => k + 1)
        setToast({ message: "Stammdaten saved", type: "success" })
      } else {
        const err = await res.json().catch(() => ({}))
        setSdError(err.message || "Failed to save")
      }
    } catch {
      setSdError("Network error — please retry")
    } finally {
      setSdSaving(false)
    }
  }

  // rc51.9.2: Open the Discogs review modal — fetches a diff against the
  // candidate discogs_id without writing. Used by both the "Save Linking"
  // (when discogs_id changed) and "Fetch from Discogs" buttons. The modal
  // owns the apply step; we just gate on a successful fetch here.
  const openDiscogsPreview = async (candidateId: string) => {
    if (!id || !candidateId) return
    setDiscogsPreviewLoading(true)
    try {
      const res = await fetch(`/admin/media/${id}/discogs-preview`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discogs_id: candidateId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setDiscogsPreview(data as DiscogsPreviewResponse)
      } else {
        setToast({ message: data.message || "Discogs preview failed", type: "error" })
      }
    } catch {
      setToast({ message: "Network error", type: "error" })
    } finally {
      setDiscogsPreviewLoading(false)
    }
  }

  // Q8a: Save Discogs linking fields (discogs_id, genre, styles).
  // rc51.9.2: When discogs_id is changed, route through the preview/review
  // modal instead of silently overwriting metadata. genre/styles-only edits
  // still save inline.
  const handleSaveDiscogsLink = async () => {
    if (!id) return

    const currentDiscogsIdStr = release?.discogs_id != null ? String(release.discogs_id) : ""
    const candidate = discogsIdInput.trim()
    const idChanged = candidate !== currentDiscogsIdStr

    if (idChanged && candidate !== "") {
      await openDiscogsPreview(candidate)
      return
    }

    setDiscogsLinkSaving(true)
    try {
      const genresArr = genreInput
        ? genreInput.split(",").map((s) => s.trim()).filter(Boolean)
        : null
      const stylesArr = stylesInput
        ? stylesInput.split(",").map((s) => s.trim()).filter(Boolean)
        : null
      const body: Record<string, unknown> = {
        discogs_id: candidate === "" ? null : candidate,
        genres: genresArr,
        styles: stylesArr,
      }
      const res = await fetch(`/admin/media/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const d = await res.json()
        setRelease((prev) => prev ? { ...prev, ...d.release } : d.release)
        setToast({ message: "Discogs linking saved", type: "success" })
      } else {
        const err = await res.json().catch(() => ({}))
        setToast({ message: err.message || "Failed to save Discogs linking", type: "error" })
      }
    } catch {
      setToast({ message: "Network error", type: "error" })
    } finally {
      setDiscogsLinkSaving(false)
    }
  }

  // Q8a: Fetch fresh metadata + prices from Discogs API (same discogs_id).
  // rc51.9.2: Routes through the same preview/review modal — no silent overwrite.
  const handleRefetchDiscogs = async () => {
    if (!id || !release?.discogs_id) return
    await openDiscogsPreview(String(release.discogs_id))
  }

  // rc51.9.2: Apply the selected proposed values from the review modal.
  // Builds a partial body from preview.proposed for the chosen fields plus
  // the new discogs_id, then POSTs through the standard Stammdaten path so
  // audit-log + auto-lock + Meili-push run normally.
  const handleApplyDiscogsPreview = async (selectedFields: string[]) => {
    if (!id || !discogsPreview) return
    const body: Record<string, unknown> = {
      discogs_id: discogsPreview.discogs_id,
    }
    for (const field of selectedFields) {
      body[field] = discogsPreview.proposed[field]
    }
    const res = await fetch(`/admin/media/${id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.message || `Apply failed (HTTP ${res.status})`)
    }
    setRelease((prev) => prev ? { ...prev, ...data.release } : data.release)
    if (data.release?.locked_fields !== undefined) {
      setMeta((prev) => prev ? { ...prev, locked_fields: data.release.locked_fields || [] } : prev)
    }
    if (data.release) {
      setGenreInput(Array.isArray(data.release.genres) ? data.release.genres.join(", ") : "")
      setStylesInput(Array.isArray(data.release.styles) ? data.release.styles.join(", ") : "")
      setDiscogsIdInput(data.release.discogs_id != null ? String(data.release.discogs_id) : "")
    }
    setAuditRefreshKey((k) => k + 1)
    setToast({
      message: selectedFields.length > 0
        ? `Applied ${selectedFields.length} field${selectedFields.length === 1 ? "" : "s"} from Discogs`
        : "discogs_id updated",
      type: "success",
    })
  }

  // Q2: unlock price lock on a specific exemplar
  const handleUnlockPrice = async (inventoryItemId: string) => {
    if (!window.confirm("Unlock price? Next legacy sync will overwrite it with the MySQL value.")) return
    setUnlockingPriceId(inventoryItemId)
    try {
      const res = await fetch(`/admin/erp/inventory/items/${inventoryItemId}/unlock-price`, {
        method: "POST",
        credentials: "include",
      })
      if (res.ok) {
        setToast({ message: "Price unlocked", type: "success" })
        // Reload release data
        const d = await fetch(`/admin/media/${id}`, { credentials: "include" }).then((r) => r.json())
        setRelease(d.release)
        setInventoryItems(d.inventory_items || [])
      } else {
        const err = await res.json().catch(() => ({}))
        setToast({ message: err.message || "Unlock failed", type: "error" })
      }
    } catch {
      setToast({ message: "Network error", type: "error" })
    } finally {
      setUnlockingPriceId(null)
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
  const formatLabel = release.format_v2 ? displayFormat(release.format_v2 as FormatValue) : release.format
  const formatDescriptors = Array.isArray(release.format_descriptors) ? release.format_descriptors : []
  const pageSubtitle = [formatLabel, release.year, release.label_name].filter(Boolean).join(" \u00B7 ")

  type InfoField = [string, ReactNode | string | null | number]
  const infoFields: InfoField[] = [
    ["Article No.", release.article_number],
    ["Artist", release.artist_name],
    ["Title", release.title],
    ["Format", formatDescriptors.length > 0 ? `${formatLabel} (${formatDescriptors.join(", ")})` : formatLabel],
    ["Year", release.year != null ? String(release.year) : null],
    ["Country", release.country ? (() => {
      const c = findCountry(release.country)
      return c ? `${flagFor(c.code)} ${c.nameEn} (${c.code})` : `⚠️ ${release.country} (non-ISO)`
    })() : null],
    ["Label", release.label_name],
    ["CatNo", release.catalogNumber],
    ["Barcode", release.barcode],
    ["Genre", Array.isArray(release.genres) && release.genres.length > 0 ? release.genres.join(", ") : null],
    ["Styles", Array.isArray(release.styles) && release.styles.length > 0 ? release.styles.join(", ") : null],
    ["Auction Status", release.auction_status],
    // Q6: Show Block Name + link when item is in an active auction.
    // Hidden entirely (not rendered as "—") when no block is set.
    ...(release.current_block_id ? [[
      "Active Auction",
      <a
        key="block-link"
        href={`/app/auction-blocks/${release.current_block_id}`}
        style={{ color: C.gold, textDecoration: "none" }}
      >{release.current_block_title || release.current_block_id}</a>,
    ] as InfoField] : []),
    ["Created", formatDate(release.createdAt)],
    ["Updated", formatDate(release.updatedAt)],
  ]

  return (
    <PageShell maxWidth={1100}>
      {/* Back-to-Inventur-Session-Banner — erscheint nur wenn der User
          gerade in einer laufenden Inventur-Session ist. sessionStorage-Flag
          wird von /app/erp/inventory/session beim Mount gesetzt und erst beim
          expliziten "Session beenden" wieder gelöscht. */}
      {hasActiveSession && (
        <div
          style={{
            background: C.gold + "15",
            border: `1px solid ${C.gold}40`,
            borderRadius: S.radius.md,
            padding: "10px 14px",
            marginBottom: S.gap.lg,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: S.gap.md,
          }}
        >
          <div style={{ ...T.small, color: C.text }}>
            Inventur-Session läuft — Änderungen an dieser Platte fließen auch
            zurück in die Session.
          </div>
          <Btn
            label="← Zurück zur Inventur-Session"
            variant="gold"
            onClick={() => (window.location.href = "/app/erp/inventory/session")}
          />
        </div>
      )}

      {/* LockBanner removed: all releases now editable (rc51.0 Sync-Lock-Modell) */}

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
          <div style={{ display: "flex", gap: S.gap.md, alignItems: "center" }}>
            {meta && <SourceBadge source={meta.source} syncedAt={release.discogs_last_synced || release.legacy_last_synced} lockedFields={meta.locked_fields} />}
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
          </div>
        }
      />

      {/* Image + Release Info */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: S.gap.xl, marginBottom: S.sectionGap }}>
        {/* Cover + Image-Galerie (rc52.6: Upload, Reorder, Set-Cover, Delete) */}
        <div>
          <ReleaseImageGallery
            releaseId={id || ""}
            images={images as GalleryImage[]}
            onChanged={reloadImages}
            onLightbox={(i) => setLightboxIndex(i)}
          />
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

      {/* Edit Stammdaten — Zone-1 fields; locked for legacy releases */}
      <div style={{ ...cardStyle, border: `1px solid ${C.border}`, marginBottom: S.sectionGap }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <SectionHeader title="Edit Stammdaten" style={{ marginTop: 0, marginBottom: 0 }} />
          {!sdEditing && (
            <Btn
              label="Edit Stammdaten"
              variant="gold"
              onClick={handleStartEditStammdaten}
              style={{ padding: "6px 16px", fontSize: 13 }}
            />
          )}
        </div>

        {sdEditing && (() => {
          // Helper: field label with optional 🔒 unlock button for locked fields
          const FieldLabel = ({ text, field, required }: { text: string; field?: string; required?: boolean }) => {
            const isLocked = field ? (meta?.locked_fields ?? []).includes(field) : false
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={labelStyle}>{text}{required ? " *" : ""}</span>
                {isLocked && (
                  <button
                    type="button"
                    title={`Field "${field}" is locked from sync. Click to unlock (next sync will overwrite).`}
                    onClick={() => setUnlockFieldPending(field!)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}
                  >
                    🔒
                  </button>
                )}
              </div>
            )
          }

          return (
            <div style={{ marginTop: S.gap.lg }}>
              {sdError && (
                <div style={{ ...T.small, color: C.error, background: C.error + "15", border: `1px solid ${C.error}40`, borderRadius: S.radius.sm, padding: "8px 12px", marginBottom: S.gap.md }}>
                  {sdError}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.gap.lg }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <FieldLabel text="Title" field="title" required />
                  <input type="text" value={sdTitle} onChange={(e) => setSdTitle(e.target.value)} style={localInputStyle} />
                </div>

                <div>
                  <FieldLabel text="Artist" field="artistId" />
                  <div style={{ display: "flex", gap: S.gap.sm, alignItems: "center" }}>
                    <input
                      type="text"
                      value={sdArtistName}
                      readOnly
                      placeholder="Click to select…"
                      style={{ ...localInputStyle, cursor: "pointer", flex: 1 }}
                      onClick={() => setSdPicker("artist")}
                    />
                    <Btn label="…" variant="ghost" onClick={() => setSdPicker("artist")} style={{ padding: "8px 12px", fontSize: 13 }} />
                  </div>
                </div>

                <div>
                  <FieldLabel text="Label" field="labelId" />
                  <div style={{ display: "flex", gap: S.gap.sm, alignItems: "center" }}>
                    <input
                      type="text"
                      value={sdLabelName}
                      readOnly
                      placeholder="Click to select…"
                      style={{ ...localInputStyle, cursor: "pointer", flex: 1 }}
                      onClick={() => setSdPicker("label")}
                    />
                    <Btn label="…" variant="ghost" onClick={() => setSdPicker("label")} style={{ padding: "8px 12px", fontSize: 13 }} />
                  </div>
                </div>

                <div>
                  <FieldLabel text="Year" field="year" />
                  <input type="number" value={sdYear} onChange={(e) => setSdYear(e.target.value)} min={1900} max={new Date().getFullYear()} placeholder="e.g. 1994" style={localInputStyle} />
                </div>

                <div>
                  <FieldLabel text="Country (ISO-3166-1 alpha-2)" field="country" />
                  {(() => {
                    const sel = findCountry(sdCountry)
                    const isInvalid = sdCountry !== "" && !isValidIsoCode(sdCountry)
                    return (
                      <div style={{ display: "flex", gap: S.gap.sm, alignItems: "center" }}>
                        <button
                          type="button"
                          onClick={() => setSdPicker("country")}
                          style={{
                            ...localInputStyle,
                            cursor: "pointer",
                            flex: 1,
                            textAlign: "left",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            // Yellow warning when current DB value is non-ISO (legacy dirty data)
                            borderColor: isInvalid ? C.warning : (localInputStyle as React.CSSProperties).border?.toString().split(" ")[2] || C.border,
                          } as React.CSSProperties}
                          title={isInvalid ? "Non-ISO value — click to select a canonical ISO code" : "Click to select country"}
                        >
                          {sel ? (
                            <>
                              <span style={{ fontSize: 16 }}>{flagFor(sel.code)}</span>
                              <span>{sel.nameEn}</span>
                              <span style={{ ...T.small, color: C.muted, marginLeft: "auto" }}>{sel.code}</span>
                            </>
                          ) : isInvalid ? (
                            <>
                              <span style={{ fontSize: 14 }}>⚠️</span>
                              <span style={{ color: C.warning }}>{sdCountry}</span>
                              <span style={{ ...T.small, color: C.muted, marginLeft: "auto" }}>non-ISO</span>
                            </>
                          ) : (
                            <span style={{ color: C.muted }}>Click to select…</span>
                          )}
                        </button>
                        {sdCountry && (
                          <Btn
                            label="×"
                            variant="ghost"
                            onClick={() => setSdCountry("")}
                            style={{ padding: "8px 10px", fontSize: 13 }}
                          />
                        )}
                      </div>
                    )
                  })()}
                </div>

                <div>
                  <FieldLabel text="Catalog No." field="catalogNumber" />
                  <input type="text" value={sdCatalogNumber} onChange={(e) => setSdCatalogNumber(e.target.value)} style={localInputStyle} />
                </div>

                <div>
                  <FieldLabel text="Barcode" field="barcode" />
                  <input
                    type="text"
                    value={sdBarcode}
                    onChange={(e) => setSdBarcode(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="UPC-A (12) or EAN-13 (13) digits"
                    inputMode="numeric"
                    style={localInputStyle}
                  />
                  <div style={{ ...T.micro, color: C.muted, marginTop: 2 }}>
                    8 (EAN-8), 12 (UPC-A), or 13 digits (EAN-13) with check digit
                  </div>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <FieldLabel text="Description" field="description" />
                  <textarea value={sdDescription} onChange={(e) => setSdDescription(e.target.value)} rows={4} style={{ ...localInputStyle, resize: "vertical" }} />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <FieldLabel text="Credits" field="credits" />
                  <textarea
                    value={sdCredits}
                    onChange={(e) => setSdCredits(e.target.value)}
                    rows={6}
                    placeholder="z.B.&#10;Producer: Name&#10;Recorded at: Studio&#10;Mixed by: Engineer"
                    style={{ ...localInputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
                  />
                </div>

                <div>
                  <FieldLabel text="Format (71-Wert-Whitelist)" field="format_v2" />
                  <div style={{ display: "flex", gap: S.gap.sm, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => setSdPicker("format")}
                      style={{
                        ...localInputStyle,
                        cursor: "pointer",
                        flex: 1,
                        textAlign: "left",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 6,
                      } as React.CSSProperties}
                      title="Click to select format from 71-value whitelist"
                    >
                      {sdFormatV2 ? (
                        <>
                          <span>{displayFormat(sdFormatV2 as FormatValue)}</span>
                          <span style={{ ...T.small, color: C.muted, fontFamily: "monospace", fontSize: 11 }}>{sdFormatV2}</span>
                        </>
                      ) : (
                        <span style={{ color: C.muted }}>Click to select…</span>
                      )}
                    </button>
                    {sdFormatV2 && (
                      <Btn
                        label="×"
                        variant="ghost"
                        onClick={() => setSdFormatV2("")}
                        style={{ padding: "8px 10px", fontSize: 13 }}
                      />
                    )}
                  </div>
                  <div style={{ ...T.micro, color: C.muted, marginTop: 2 }}>
                    Granular: e.g. <code>Vinyl-LP-2</code> (2× LP Box), <code>Tape-7</code> (7-Cassette Box)
                  </div>
                </div>

                <div>
                  <FieldLabel text="Descriptors (Multi-Tag)" field="format_descriptors" />
                  <div style={{ display: "flex", gap: S.gap.sm, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => setSdPicker("descriptors")}
                      style={{
                        ...localInputStyle,
                        cursor: "pointer",
                        flex: 1,
                        textAlign: "left",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flexWrap: "wrap",
                        minHeight: 38,
                      } as React.CSSProperties}
                      title="Click to manage descriptor tags"
                    >
                      {sdDescriptors.length > 0 ? (
                        sdDescriptors.map((d) => (
                          <span
                            key={d}
                            style={{
                              background: C.subtle,
                              border: `1px solid ${C.border}`,
                              borderRadius: S.radius.sm,
                              padding: "2px 8px",
                              fontSize: 12,
                            }}
                          >
                            {d}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: C.muted }}>Click to add descriptors…</span>
                      )}
                    </button>
                    {sdDescriptors.length > 0 && (
                      <Btn
                        label="×"
                        variant="ghost"
                        onClick={() => setSdDescriptors([])}
                        style={{ padding: "8px 10px", fontSize: 13 }}
                      />
                    )}
                  </div>
                  <div style={{ ...T.micro, color: C.muted, marginTop: 2 }}>
                    Picture Disc, Reissue, Limited Edition, Stereo, Mono, … (32 tags)
                  </div>
                </div>

                <div>
                  <FieldLabel text="Genres (Discogs Top-Level)" />
                  <div style={{ display: "flex", gap: S.gap.sm, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => setSdPicker("genres")}
                      style={{
                        ...localInputStyle,
                        cursor: "pointer",
                        flex: 1,
                        textAlign: "left",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flexWrap: "wrap",
                        minHeight: 38,
                      } as React.CSSProperties}
                      title="Click to manage genres"
                    >
                      {sdGenres.length > 0 ? (
                        sdGenres.map((g) => (
                          <span
                            key={g}
                            style={{
                              background: C.subtle,
                              border: `1px solid ${C.border}`,
                              borderRadius: S.radius.sm,
                              padding: "2px 8px",
                              fontSize: 12,
                            }}
                          >
                            {g}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: C.muted }}>Click to select genres…</span>
                      )}
                    </button>
                    {sdGenres.length > 0 && (
                      <Btn
                        label="×"
                        variant="ghost"
                        onClick={() => setSdGenres([])}
                        style={{ padding: "8px 10px", fontSize: 13 }}
                      />
                    )}
                  </div>
                  <div style={{ ...T.micro, color: C.muted, marginTop: 2 }}>
                    15 Discogs top-level genres · Pflicht-Whitelist
                  </div>
                </div>

                <div>
                  <FieldLabel text="Styles" />
                  <div style={{ display: "flex", gap: S.gap.sm, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => setSdPicker("styles")}
                      style={{
                        ...localInputStyle,
                        cursor: "pointer",
                        flex: 1,
                        textAlign: "left",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flexWrap: "wrap",
                        minHeight: 38,
                      } as React.CSSProperties}
                      title="Click to manage styles"
                    >
                      {sdStyles.length > 0 ? (
                        sdStyles.map((s) => (
                          <span
                            key={s}
                            style={{
                              background: C.subtle,
                              border: `1px solid ${C.border}`,
                              borderRadius: S.radius.sm,
                              padding: "2px 8px",
                              fontSize: 12,
                            }}
                          >
                            {s}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: C.muted }}>Click to select styles…</span>
                      )}
                    </button>
                    {sdStyles.length > 0 && (
                      <Btn
                        label="×"
                        variant="ghost"
                        onClick={() => setSdStyles([])}
                        style={{ padding: "8px 10px", fontSize: 13 }}
                      />
                    )}
                  </div>
                  <div style={{ ...T.micro, color: C.muted, marginTop: 2 }}>
                    DB-suggested + custom — Industrial, Experimental, Synth-pop, …
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: S.gap.md, marginTop: S.gap.lg, paddingTop: S.gap.lg, borderTop: `1px solid ${C.border}` }}>
                <Btn label={sdSaving ? "Saving…" : "Save Stammdaten"} variant="gold" onClick={handleSaveStammdaten} disabled={sdSaving} style={{ padding: "8px 24px", fontSize: 13 }} />
                <Btn label="Cancel" variant="ghost" onClick={handleCancelEditStammdaten} disabled={sdSaving} style={{ padding: "8px 16px", fontSize: 13 }} />
              </div>
            </div>
          )
        })()}
      </div>

      {/* Picker Modals */}
      {sdPicker === "artist" && (
        <ArtistPickerModal
          onSelect={(item) => { setSdArtistId(item.id); setSdArtistName(item.name) }}
          onClose={() => setSdPicker(null)}
        />
      )}
      {sdPicker === "label" && (
        <LabelPickerModal
          onSelect={(item) => { setSdLabelId(item.id); setSdLabelName(item.name) }}
          onClose={() => setSdPicker(null)}
        />
      )}
      {sdPicker === "country" && (
        <CountryPickerModal
          onSelect={(country) => setSdCountry(country.code)}
          onClose={() => setSdPicker(null)}
        />
      )}
      {sdPicker === "format" && (
        <FormatPickerModal
          current={sdFormatV2 || null}
          onSelect={(value) => setSdFormatV2(value)}
          onClose={() => setSdPicker(null)}
        />
      )}
      {sdPicker === "descriptors" && (
        <DescriptorPickerModal
          selected={sdDescriptors}
          onSave={(values) => setSdDescriptors(values)}
          onClose={() => setSdPicker(null)}
        />
      )}
      {sdPicker === "genres" && (
        <GenrePickerModal
          selected={sdGenres}
          onSave={(values) => setSdGenres(values)}
          onClose={() => setSdPicker(null)}
        />
      )}
      {sdPicker === "styles" && (
        <StylesPickerModal
          selected={sdStyles}
          onSave={(values) => setSdStyles(values)}
          onClose={() => setSdPicker(null)}
        />
      )}

      {/* rc51.9.2: Discogs Review Modal — opens on discogs_id change or refetch.
          Shows per-field diff with checkboxes; locked fields default to off. */}
      {discogsPreview && (
        <DiscogsReviewModal
          preview={discogsPreview}
          lockedFields={meta?.locked_fields || []}
          onClose={() => setDiscogsPreview(null)}
          onApply={handleApplyDiscogsPreview}
        />
      )}

      {/* Unlock Field Confirm Modal */}
      {unlockFieldPending && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: S.radius.lg, padding: 24, maxWidth: 420, width: "100%", margin: 16,
          }}>
            <div style={{ ...T.body, fontWeight: 700, marginBottom: S.gap.sm }}>
              🔓 Unlock "{unlockFieldPending}"?
            </div>
            <div style={{ ...T.small, color: C.muted, marginBottom: S.gap.lg }}>
              This removes the sync protection for this field. The <strong>next hourly legacy_sync run</strong> will
              overwrite it with the tape-mag value. Only unlock if you want the MySQL value to take over again.
            </div>
            <div style={{ display: "flex", gap: S.gap.md }}>
              <Btn
                label={unlockingField ? "Unlocking…" : "Yes, unlock field"}
                variant="danger"
                onClick={() => handleUnlockField(unlockFieldPending)}
                disabled={unlockingField}
                style={{ padding: "8px 16px", fontSize: 13 }}
              />
              <Btn
                label="Cancel"
                variant="ghost"
                onClick={() => setUnlockFieldPending(null)}
                disabled={unlockingField}
                style={{ padding: "8px 16px", fontSize: 13 }}
              />
            </div>
          </div>
        </div>
      )}

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
              {CONDITION_OPTIONS.map((c) => (<option key={c.value} value={c.value}>{`${c.value} — ${c.label}`}</option>))}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Sleeve Condition</div>
            <select value={sleeveCondition} onChange={(e) => setSleeveCondition(e.target.value)} style={localSelectStyle}>
              <option value="">-- Select --</option>
              {CONDITION_OPTIONS.map((c) => (<option key={c.value} value={c.value}>{`${c.value} — ${c.label}`}</option>))}
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
              <div style={labelStyle}>Shop Price (&euro;)</div>
              <input type="number" step="0.01" min="0.01" value={shopPrice} onChange={(e) => setShopPrice(e.target.value)} placeholder="0.00" style={localInputStyle} />
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
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button
                              style={{ background: "none", border: "none", color: C.gold, cursor: "pointer", fontSize: 12, textDecoration: "underline" }}
                              onClick={() => window.location.href = `/app/erp/inventory/session?item_id=${item.inventory_item_id}`}
                            >Session</button>
                            <button
                              style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12, textDecoration: "underline" }}
                              onClick={async () => {
                                const r = await printLabelAuto(item.inventory_item_id)
                                setToast({
                                  message: r.silent ? "Gedruckt" : "Druck-Dialog geöffnet",
                                  type: "success",
                                })
                              }}
                            >Label</button>
                            {item.price_locked && (
                              <button
                                disabled={unlockingPriceId === item.inventory_item_id}
                                style={{ background: "none", border: "none", color: C.warning, cursor: "pointer", fontSize: 12, textDecoration: "underline" }}
                                onClick={() => handleUnlockPrice(item.inventory_item_id)}
                                title="Allow the next legacy sync to overwrite Release.legacy_price"
                              >{unlockingPriceId === item.inventory_item_id ? "..." : "Unlock"}</button>
                            )}
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
              // Missing per F2 convention: price=0 + price_locked=true + no
              // stocktake means "in stock but not findable". Nach dem rc47.x
              // Preis-Modell ist shop_price die Quelle — aber nur dann "missing",
              // wenn wirklich KEIN Preis da ist (weder shop_price noch legacy_price).
              // Legacy-only Items ohne shop_price sind "nicht verifiziert", nicht "missing".
              const shopZero = release.shop_price != null && Number(release.shop_price) === 0
              const legacyZero = release.legacy_price == null || Number(release.legacy_price) === 0
              if (release.price_locked && shopZero && legacyZero) {
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
              <div style={{ ...valueStyle, ...T.small, display: "flex", alignItems: "center", gap: 8 }}>
                {formatDate(release.price_locked_at)}
                {release.price_locked && release.inventory_item_id && (
                  <button
                    disabled={unlockingPriceId === release.inventory_item_id}
                    onClick={() => release.inventory_item_id && handleUnlockPrice(release.inventory_item_id)}
                    style={{
                      background: "none",
                      border: `1px solid ${C.warning}`,
                      borderRadius: 4,
                      padding: "2px 8px",
                      color: C.warning,
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                    title="Allow the next legacy sync to overwrite Release.legacy_price"
                  >{unlockingPriceId === release.inventory_item_id ? "..." : "Unlock Price"}</button>
                )}
              </div>
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
              onClick={async () => {
                if (!release.inventory_item_id) return
                const r = await printLabelAuto(release.inventory_item_id)
                setToast({
                  message: r.silent ? "Gedruckt" : "Druck-Dialog geöffnet",
                  type: "success",
                })
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

      {/* Q8a: Discogs Linking — edit discogs_id, genre, styles + refetch button */}
      <div style={{ ...cardStyle, marginBottom: S.sectionGap, border: `1px solid ${C.gold}30` }}>
        <SectionHeader title="Discogs Linking" style={{ marginTop: 0 }} />
        <div style={{ ...T.small, color: C.muted, marginBottom: S.gap.md }}>
          Set the correct Discogs release ID here. Fetch pulls fresh metadata (genre, styles, market prices) from discogs.com.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr", gap: S.gap.lg, alignItems: "end" }}>
          <div>
            <div style={labelStyle}>Discogs ID</div>
            <input
              type="text"
              value={discogsIdInput}
              onChange={(e) => setDiscogsIdInput(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 1048274"
              style={localInputStyle}
            />
            {release.discogs_id && (
              <a
                href={`https://www.discogs.com/release/${release.discogs_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...T.small, color: C.gold, textDecoration: "none", marginTop: 4, display: "inline-block" }}
              >
                View on Discogs &#8599;
              </a>
            )}
          </div>
          <div>
            <div style={labelStyle}>Genre (comma-separated)</div>
            <input
              type="text"
              value={genreInput}
              onChange={(e) => setGenreInput(e.target.value)}
              placeholder="e.g. Electronic, Industrial"
              style={localInputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Styles (comma-separated)</div>
            <input
              type="text"
              value={stylesInput}
              onChange={(e) => setStylesInput(e.target.value)}
              placeholder="e.g. Experimental, Drone, Noise"
              style={localInputStyle}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: S.gap.md, marginTop: S.gap.lg }}>
          <Btn
            label={
              discogsPreviewLoading
                ? "Fetching from Discogs…"
                : discogsLinkSaving
                ? "Saving..."
                : (discogsIdInput.trim() !== "" && discogsIdInput.trim() !== (release.discogs_id != null ? String(release.discogs_id) : ""))
                ? "Fetch & Review"
                : "Save Linking"
            }
            variant="gold"
            onClick={handleSaveDiscogsLink}
            disabled={discogsLinkSaving || discogsPreviewLoading}
            style={{ padding: "8px 20px", fontSize: 13 }}
          />
          <Btn
            label={discogsPreviewLoading ? "Fetching..." : "Refetch from Discogs"}
            variant="ghost"
            onClick={handleRefetchDiscogs}
            disabled={discogsPreviewLoading || !release.discogs_id}
            style={{ padding: "8px 20px", fontSize: 13 }}
          />
          <div style={{ ...T.small, color: C.muted, alignSelf: "center" }}>
            Last sync: {formatDate(release.discogs_last_synced)}
          </div>
        </div>
        <div style={{ ...T.micro, color: C.muted, marginTop: S.gap.sm, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          Changing the Discogs ID opens a review with the new metadata before anything is written. Locked fields default to off.
        </div>
      </div>

      {/* Q9: Discogs — Marktpreis aktuell */}
      <div style={{ ...cardStyle, marginBottom: S.sectionGap }}>
        <SectionHeader title="Marktpreis aktuell" style={{ marginTop: 0 }} />
        <div style={{ ...T.small, color: C.muted, marginBottom: S.gap.md }}>
          Live Discogs-Marketplace: niedrigstes aktives Angebot, Anzahl aktiver Listings, Sammler-Statistik.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: S.gap.lg }}>
          <div>
            <div style={labelStyle} title="Niedrigster aktueller Angebotspreis über alle Zustände auf dem Discogs-Marketplace">Niedrigster aktiver Preis</div>
            <div style={{ ...valueStyle, color: release.discogs_lowest_price ? C.success : C.muted, fontSize: 20, fontWeight: 600 }}>
              {formatPrice(release.discogs_lowest_price)}
            </div>
          </div>
          <div>
            <div style={labelStyle}>For Sale (aktive Listings)</div>
            <div style={{ ...valueStyle, fontSize: 20, fontWeight: 600 }}>{release.discogs_num_for_sale ?? "—"}</div>
          </div>
          <div>
            <div style={labelStyle}>Have (Sammler)</div>
            <div style={valueStyle}>{release.discogs_have ?? "—"}</div>
          </div>
          <div>
            <div style={labelStyle}>Want (Sammler)</div>
            <div style={valueStyle}>{release.discogs_want ?? "—"}</div>
          </div>
        </div>
      </div>

      {/* Q9: Discogs — Historische Preis-Suggestions */}
      <div style={{ ...cardStyle, marginBottom: S.sectionGap }}>
        <SectionHeader title="Historische Preis-Suggestions" style={{ marginTop: 0 }} />
        <div style={{ ...T.small, color: C.muted, marginBottom: S.gap.md }}>
          Discogs price_suggestions: Median und höchste Empfehlung aus historischen Verkäufen je Zustand (G bis Mint).
          Achtung: nicht direkt vergleichbar mit „Marktpreis aktuell“ — verschiedene Quellen.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.gap.lg }}>
          <div>
            <div style={labelStyle} title="Median aller 7 Zustands-Suggestions">Median-Suggestion</div>
            <div style={{ ...valueStyle, color: release.discogs_median_price ? C.gold : C.muted, fontSize: 20, fontWeight: 600 }}>
              {formatPrice(release.discogs_median_price)}
            </div>
          </div>
          <div>
            <div style={labelStyle} title="Höchste Zustands-Suggestion (typisch Mint)">Höchste Suggestion (Mint)</div>
            <div style={{ ...valueStyle, color: release.discogs_highest_price ? C.blue : C.muted, fontSize: 20, fontWeight: 600 }}>
              {formatPrice(release.discogs_highest_price)}
            </div>
          </div>
        </div>
      </div>

      {/* Notes + Tracklist (read-only, parsed from Release.tracklist/credits) */}
      <NotesAndTracklist credits={release.credits} tracklist={release.tracklist} description={release.description} />

      {/* Contributing Artists — Mitwirkende mit Rolle (rc52.6.1) */}
      <div style={{ ...cardStyle, marginBottom: S.sectionGap }}>
        <SectionHeader title="Contributing Artists" count={contributingArtists.length} style={{ marginTop: 0 }} />
        <div style={{ ...T.micro, color: C.muted, marginBottom: S.gap.md }}>
          Bei Compilations / Various-Artists: Mitwirkende mit ihrer Rolle pflegen. Storefront zeigt sie unter „Contributing Artists".
        </div>
        {release && (
          <ContributingArtistsSection
            releaseId={release.id}
            artists={contributingArtists}
            onChanged={reloadContributingArtists}
          />
        )}
      </div>

      {/* Track Management — edit/add/delete via Track DB table */}
      <div style={{ ...cardStyle, marginBottom: S.sectionGap }}>
        <SectionHeader title="Track Management" style={{ marginTop: 0 }} />
        <div style={{ ...T.micro, color: C.muted, marginBottom: S.gap.md }}>
          Edits here write to the Track table and are reflected in the storefront tracklist.
          Track editing is always open (not locked by source).
        </div>
        <TrackManagement
          releaseId={release.id}
          onTrackChange={() => setAuditRefreshKey(k => k + 1)}
        />
      </div>

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

      {/* Edit History — stammdaten + track changes with revert */}
      <div style={{ ...cardStyle, marginBottom: S.sectionGap }}>
        <SectionHeader title="Edit History" style={{ marginTop: 0 }} />
        <div style={{ ...T.micro, color: C.muted, marginBottom: S.gap.md }}>
          All stammdaten and track edits for this release, newest first.
          Revert rolls back a single field change.
        </div>
        <AuditHistory releaseId={release.id} refreshKey={auditRefreshKey} />
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
