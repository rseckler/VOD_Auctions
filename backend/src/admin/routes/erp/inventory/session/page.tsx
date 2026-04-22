import { useState, useEffect, useCallback, useRef } from "react"
import { useAdminNav } from "../../../../components/admin-nav"
import { C, T, S, fmtMoney } from "../../../../components/admin-tokens"
import { PageHeader, PageShell } from "../../../../components/admin-layout"
import { Btn, Toast, Modal, inputStyle, Badge } from "../../../../components/admin-ui"
import { printerAvailable, printLabelAuto } from "../../../../lib/print-client"

// ─── Types ──────────────────────────────────────────────────────────────────

interface SearchResult {
  release_id: string
  artist_name: string | null
  title: string
  format: string
  catalog_number: string | null
  article_number: string | null
  cover_image: string | null
  legacy_price: number | null
  label_name: string | null
  year: number | null
  country: string | null
  exemplar_count: number
  verified_count: number
  discogs_median: number | null
  discogs_id: number | null
  matched_exemplar?: {
    inventory_item_id: string
    barcode: string | null
    copy_number: number
    condition_media: string | null
    condition_sleeve: string | null
    exemplar_price: number | null
    is_verified: boolean
  }
}

interface ReleaseDetail {
  id: string
  title: string
  artist_name: string | null
  label_name: string | null
  format: string
  year: number | null
  country: string | null
  cover_image: string | null
  catalog_number: string | null
  article_number: string | null
  legacy_price: number | null
  legacy_condition: string | null
  discogs_lowest: number | null
  discogs_median: number | null
  discogs_highest: number | null
  discogs_num_for_sale: number | null
  discogs_url: string | null
}

interface CopyItem {
  id: string
  barcode: string | null
  copy_number: number
  condition_media: string | null
  condition_sleeve: string | null
  exemplar_price: number | null
  effective_price: number | null
  status: string
  is_verified: boolean
  verified_at: string | null
  verified_by: string | null
  price_locked: boolean
  notes: string | null
  source: string | null
}

// ─── Constants ──────────────────────────────────────────────────────────────

const GRADES = ["M", "NM", "VG+", "VG", "G+", "G", "F", "P"] as const
type Grade = (typeof GRADES)[number]

const LEGACY_CONDITION_MAP: Record<string, Grade> = {
  m: "M", mint: "M",
  nm: "NM", "near mint": "NM", "n/m": "NM", "m-": "NM",
  "vg+": "VG+", "very good plus": "VG+", ex: "VG+", excellent: "VG+",
  vg: "VG", "very good": "VG",
  "g+": "G+", "good plus": "G+",
  g: "G", good: "G",
  f: "F", fair: "F",
  p: "P", poor: "P",
}

function parseLegacyCondition(legacy: string | null): { media: Grade | null; sleeve: Grade | null } {
  if (!legacy) return { media: null, sleeve: null }
  const parts = legacy.toLowerCase().split("/").map((s) => s.trim())
  return {
    media: LEGACY_CONDITION_MAP[parts[0]] || null,
    sleeve: parts[1] ? LEGACY_CONDITION_MAP[parts[1]] || null : null,
  }
}

// ─── Printer ────────────────────────────────────────────────────────────────

type PrinterStatus = "connected" | "browser" | "none"

// Session-local alias — the implementation lives in lib/print-client so
// it can be shared with the Catalog Detail Label-Print buttons.
const printLabel = printLabelAuto

// ─── API Helper ─────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`${res.status}: ${text}`)
  }
  return res.json()
}

// ─── Grade Selector Component ──────────────────────────────────────────────

function GradeSelector({ label, value, onChange }: { label: string; value: Grade | null; onChange: (g: Grade) => void }) {
  return (
    <div style={{ marginBottom: S.gap.md }}>
      <div style={{ ...T.small, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {GRADES.map((g) => (
          <button
            key={g}
            onClick={() => onChange(g)}
            style={{
              padding: "6px 12px",
              border: `1px solid ${value === g ? C.gold : C.border}`,
              borderRadius: 4,
              background: value === g ? C.gold : "transparent",
              color: value === g ? "#000" : C.text,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: value === g ? 700 : 400,
              transition: "all 0.15s",
            }}
          >
            {g}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main Session Page ──────────────────────────────────────────────────────

function StocktakeSessionPage() {
  useAdminNav()

  // Search
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedResultIndex, setSelectedResultIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Release detail + copies
  const [releaseDetail, setReleaseDetail] = useState<ReleaseDetail | null>(null)
  const [copies, setCopies] = useState<CopyItem[]>([])
  const [activeView, setActiveView] = useState<"search" | "detail">("search")

  // Evaluation form (for verifying or adding a copy)
  const [editingCopy, setEditingCopy] = useState<CopyItem | null>(null)
  const [isNewCopy, setIsNewCopy] = useState(false)
  const [conditionMedia, setConditionMedia] = useState<Grade | null>(null)
  const [conditionSleeve, setConditionSleeve] = useState<Grade | null>(null)
  const [priceValue, setPriceValue] = useState("")
  const [noteText, setNoteText] = useState("")

  // Stats
  const [stats, setStats] = useState<{ eligible: number; verified: number } | null>(null)

  // Image upload
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // UI state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const [showExitModal, setShowExitModal] = useState(false)
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus>("none")
  // Recent Items: zuletzt bearbeitete Platten (letzte 10), werden prominent
  // im Search-View angezeigt damit Frank den Kontext behält wenn er zwischen
  // Artikeln springt. Erweitert um Barcode, Preis, Condition für sinnvolle
  // Inline-Info + release_id zum Wiederaufrufen per Klick.
  const [recentItems, setRecentItems] = useState<Array<{
    release_id: string
    artist: string
    title: string
    copy: number
    barcode?: string | null
    price?: number | null
    condition?: string | null
    at: number
  }>>([])
  const [actionLoading, setActionLoading] = useState(false)

  // Scanner buffer
  const scanBuffer = useRef("")
  const scanTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Init ──

  useEffect(() => {
    // sessionStorage-Flag: markiert dass eine Inventur-Session gestartet wurde.
    // Catalog-Detail (media/[id]/page.tsx) checkt das Flag und zeigt dann einen
    // "← Zurück zur Inventur-Session"-Button oben an. Flag wird erst beim
    // expliziten "Session beenden" gelöscht — damit Frank zum Catalog springen,
    // recherchieren, und wieder zurückkommen kann.
    try {
      sessionStorage.setItem("vod.inventory_session_active", String(Date.now()))
    } catch { /* storage quota / private browsing — best-effort */ }

    printerAvailable().then((ok) => setPrinterStatus(ok ? "connected" : "browser"))
    apiFetch<any>("/admin/erp/inventory/stats").then((s) => {
      setStats({ eligible: s.eligible, verified: s.verified })
    }).catch(() => {})
    // Recent Activity aus DB laden — damit Frank auch nach Page-Reload die
    // letzten bearbeiteten Platten sieht (war vorher nur in-memory State).
    apiFetch<{ items: Array<{
      release_id: string
      artist: string
      title: string
      copy: number
      barcode: string | null
      price: number | null
      condition: string | null
      at: string
    }> }>("/admin/erp/inventory/recent-activity?limit=500")
      .then((r) => {
        setRecentItems(
          r.items.map((it) => ({
            release_id: it.release_id,
            artist: it.artist,
            title: it.title,
            copy: it.copy,
            barcode: it.barcode,
            price: it.price,
            condition: it.condition,
            at: new Date(it.at).getTime(),
          }))
        )
      })
      .catch(() => {})
    // Focus search on mount
    setTimeout(() => searchInputRef.current?.focus(), 100)
  }, [])

  // ── Search ──

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults([])
      return
    }
    setSearchLoading(true)
    try {
      const data = await apiFetch<{ results: SearchResult[]; match_type: string }>(
        `/admin/erp/inventory/search?q=${encodeURIComponent(q.trim())}&limit=500`
      )
      setSearchResults(data.results)
      setSelectedResultIndex(0)

      // Barcode direct hit: auto-open
      if (data.match_type === "barcode" && data.results.length === 1) {
        openRelease(data.results[0].release_id)
      }
    } catch {
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [])

  // Debounced search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchInput = (val: string) => {
    setSearchQuery(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => doSearch(val), 250)
  }

  // ── Open Release Detail ──

  const openRelease = useCallback(async (releaseId: string) => {
    try {
      const data = await apiFetch<{ release: ReleaseDetail; copies: CopyItem[] }>(
        `/admin/erp/inventory/release/${releaseId}/copies`
      )
      setReleaseDetail(data.release)
      setCopies(data.copies)
      setActiveView("detail")
      setEditingCopy(null)
      setIsNewCopy(false)
    } catch (e: any) {
      setToast({ message: `Error: ${e.message}`, type: "error" })
    }
  }, [])

  // ── Start Editing a Copy ──

  const startEditCopy = (copy: CopyItem) => {
    setEditingCopy(copy)
    setIsNewCopy(false)
    // P0.1: if erp values are NULL (Cohort-A backfill rows), seed from
    // Release.legacy_condition + Release.legacy_price so Frank sees sensible
    // defaults instead of empty dropdowns.
    const legacyParsed = parseLegacyCondition(releaseDetail?.legacy_condition || null)
    setConditionMedia((copy.condition_media as Grade) || legacyParsed.media)
    setConditionSleeve((copy.condition_sleeve as Grade) || legacyParsed.sleeve)
    const effective = copy.effective_price != null
      ? copy.effective_price
      : (releaseDetail?.legacy_price != null ? releaseDetail.legacy_price : null)
    setPriceValue(effective != null ? String(effective) : "")
    setNoteText(copy.notes || "")
  }

  const startNewCopy = () => {
    if (!releaseDetail) return
    // Pre-fill from legacy condition
    const parsed = parseLegacyCondition(releaseDetail.legacy_condition)
    setEditingCopy(null)
    setIsNewCopy(true)
    setConditionMedia(parsed.media)
    setConditionSleeve(parsed.sleeve)
    setPriceValue(releaseDetail.legacy_price != null ? String(releaseDetail.legacy_price) : "")
    setNoteText("")
  }

  // Auto-open first copy for editing if it's unverified
  useEffect(() => {
    if (activeView === "detail" && !editingCopy && !isNewCopy) {
      if (copies.length === 0) {
        // No inventory item yet (non-Cohort-A release) → auto-open new copy form
        startNewCopy()
      } else {
        const firstUnverified = copies.find((c) => !c.is_verified)
        if (firstUnverified) {
          startEditCopy(firstUnverified)
        }
      }
    }
  }, [activeView, copies])

  // ── Verify ──
  //
  // Zwei-Button-Flow seit 2026-04-22: Frank braucht eine bewusste Trennung
  // zwischen "Änderungen speichern" und "Label drucken". doPrint=true druckt
  // zusätzlich nach dem Save, false speichert nur. Shortcut 'S' = Save,
  // 'V' = Save+Print.

  const handleVerify = async (doPrint: boolean = false) => {
    if (!releaseDetail) return
    setActionLoading(true)

    try {
      if (isNewCopy) {
        // Add new copy
        const body: any = {
          release_id: releaseDetail.id,
          condition_media: conditionMedia || undefined,
          condition_sleeve: conditionSleeve || undefined,
          notes: noteText || undefined,
        }
        const price = parseFloat(priceValue.replace(",", "."))
        if (!isNaN(price) && price >= 0) body.exemplar_price = Math.round(price)

        const result = await apiFetch<{ item: any; label_url: string }>(
          "/admin/erp/inventory/items/add-copy",
          { method: "POST", body: JSON.stringify(body) }
        )

        let printResult: { silent: boolean } | null = null
        if (doPrint) printResult = await printLabel(result.item.id)
        const printSuffix = printResult ? (printResult.silent ? " · gedruckt" : " · Druck-Dialog") : ""

        setToast({
          message: `Copy #${result.item.copy_number} gespeichert — ${result.item.barcode}${printSuffix}`,
          type: "success",
        })
        {
          const pr = parseFloat(priceValue.replace(",", "."))
          const condition = conditionMedia && conditionSleeve && conditionMedia !== conditionSleeve
            ? `${conditionMedia}/${conditionSleeve}`
            : (conditionMedia || conditionSleeve || null)
          setRecentItems((prev) => [
            {
              release_id: releaseDetail.id,
              artist: releaseDetail.artist_name || "?",
              title: releaseDetail.title,
              copy: result.item.copy_number,
              barcode: result.item.barcode || null,
              price: !isNaN(pr) && pr >= 0 ? Math.round(pr) : null,
              condition,
              at: Date.now(),
            },
            // Dedupe: bei Mehrfach-Verify desselben Exemplars in einer Session
            // nur der neueste Eintrag bleibt (key = release_id + copy_number).
            ...prev.filter((p) => !(p.release_id === releaseDetail.id && p.copy === (isNewCopy ? result.item?.copy_number : result.copy_number))),
          ])
        }
      } else if (editingCopy) {
        // Verify existing copy
        const body: any = {
          condition_media: conditionMedia || undefined,
          condition_sleeve: conditionSleeve || undefined,
          notes: noteText || undefined,
        }
        // Preis immer senden wenn valid — Backend ist idempotent + mirror'd
        // auch exemplar_price für Copy #1 damit das Label den Wert zeigt.
        // Früherer Delta-Check (rounded !== releaseDetail.legacy_price) hat
        // Frank gefressen: Type-Mismatch zwischen parseFloat-Number und
        // DB-String-Number führte zu silent-skip, Preis landete nicht in DB.
        const price = parseFloat(priceValue.replace(",", "."))
        if (!isNaN(price) && price >= 0) {
          const rounded = Math.round(price)
          if (editingCopy.copy_number === 1) {
            body.new_price = rounded
          } else {
            body.exemplar_price = rounded
          }
        }

        const result = await apiFetch<{ barcode: string; copy_number: number }>(
          `/admin/erp/inventory/items/${editingCopy.id}/verify`,
          { method: "POST", body: JSON.stringify(body) }
        )

        let printResult: { silent: boolean } | null = null
        if (doPrint) printResult = await printLabel(editingCopy.id)
        const printSuffix = printResult ? (printResult.silent ? " · gedruckt" : " · Druck-Dialog") : ""

        setToast({
          message: `Exemplar #${result.copy_number} gespeichert — ${result.barcode}${printSuffix}`,
          type: "success",
        })
        {
          const pr = parseFloat(priceValue.replace(",", "."))
          const condition = conditionMedia && conditionSleeve && conditionMedia !== conditionSleeve
            ? `${conditionMedia}/${conditionSleeve}`
            : (conditionMedia || conditionSleeve || null)
          setRecentItems((prev) => [
            {
              release_id: releaseDetail.id,
              artist: releaseDetail.artist_name || "?",
              title: releaseDetail.title,
              copy: result.copy_number,
              barcode: result.barcode || null,
              price: !isNaN(pr) && pr >= 0 ? Math.round(pr) : null,
              condition,
              at: Date.now(),
            },
            // Dedupe: bei Mehrfach-Verify desselben Exemplars in einer Session
            // nur der neueste Eintrag bleibt (key = release_id + copy_number).
            ...prev.filter((p) => !(p.release_id === releaseDetail.id && p.copy === (isNewCopy ? result.item?.copy_number : result.copy_number))),
          ])
        }
      }

      // Update stats
      if (stats) setStats({ ...stats, verified: stats.verified + 1 })

      // Return to search
      backToSearch()
    } catch (e: any) {
      setToast({ message: `Error: ${e.message}`, type: "error" })
    } finally {
      setActionLoading(false)
    }
  }

  // ── Back to Search ──

  const backToSearch = () => {
    setActiveView("search")
    setReleaseDetail(null)
    setCopies([])
    setEditingCopy(null)
    setIsNewCopy(false)
    setSearchQuery("")
    setSearchResults([])
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

  // ── Image Upload ──

  const handleImageUpload = async (file: File) => {
    if (!releaseDetail) return
    setUploading(true)
    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const result = await apiFetch<{ url: string; optimized_size_kb: number; compression: string }>(
        "/admin/erp/inventory/upload-image",
        {
          method: "POST",
          body: JSON.stringify({
            release_id: releaseDetail.id,
            image_data: base64,
            filename: file.name,
          }),
        }
      )

      // Update local state with new image
      setReleaseDetail({ ...releaseDetail, cover_image: result.url })
      setToast({ message: `Bild hochgeladen (${result.optimized_size_kb} KB, ${result.compression} komprimiert)`, type: "success" })
    } catch (e: any) {
      setToast({ message: `Upload fehlgeschlagen: ${e.message}`, type: "error" })
    } finally {
      setUploading(false)
    }
  }

  // ── Discogs Price Override ──

  const applyDiscogsMedian = () => {
    if (releaseDetail?.discogs_median != null) {
      setPriceValue(String(Math.round(releaseDetail.discogs_median)))
    }
  }

  // ── Keyboard Shortcuts ──

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA"

      // Scanner detection: rapid keystrokes (< 40ms apart) = barcode scanner
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && activeView === "search" && !isInput) {
        scanBuffer.current += e.key
        if (scanTimeout.current) clearTimeout(scanTimeout.current)
        scanTimeout.current = setTimeout(() => {
          const val = scanBuffer.current.trim()
          scanBuffer.current = ""
          // Drei Scanner-Formate werden erkannt:
          //   1. <digits>VODe   — neues Exemplar-Format (2026-04-22+), z.B. 000001VODe
          //   2. VOD-<digits>   — tape-mag article_number (VOD-19586) UND
          //                       altes Exemplar-Format (VOD-000001) aus der Übergangsphase
          // Backend-Search handled all drei — probiert erst exact Exemplar-Barcode
          // (erp_inventory_item.barcode), dann article_number (Release.article_number).
          const newBarcodePattern = /^\d+VODe$/i
          const oldBarcodeOrArticle = /^VOD-\d+$/i
          if (val.length >= 5 && (newBarcodePattern.test(val) || oldBarcodeOrArticle.test(val))) {
            setSearchQuery(val)
            doSearch(val)
          }
        }, 80)
      }

      // Global shortcuts
      if (e.key === "Escape") {
        if (editingCopy || isNewCopy) {
          setEditingCopy(null)
          setIsNewCopy(false)
        } else if (activeView === "detail") {
          backToSearch()
        } else {
          setShowExitModal(true)
        }
        e.preventDefault()
        return
      }

      if (isInput) return // Don't intercept while typing

      if (e.key === "/" || e.key === "f") {
        e.preventDefault()
        if (activeView === "detail") backToSearch()
        else searchInputRef.current?.focus()
        return
      }

      // Search results navigation
      if (activeView === "search" && searchResults.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault()
          setSelectedResultIndex((i) => Math.min(i + 1, searchResults.length - 1))
          return
        }
        if (e.key === "ArrowUp") {
          e.preventDefault()
          setSelectedResultIndex((i) => Math.max(i - 1, 0))
          return
        }
        if (e.key === "Enter") {
          e.preventDefault()
          openRelease(searchResults[selectedResultIndex].release_id)
          return
        }
      }

      // Detail view shortcuts
      if (activeView === "detail") {
        if (e.key === "v" || e.key === "V") {
          if (editingCopy || isNewCopy) handleVerify(true)
        }
        if (e.key === "s" || e.key === "S") {
          if (editingCopy || isNewCopy) handleVerify(false)
          return
        }
        if (e.key === "a" || e.key === "A") {
          startNewCopy()
          return
        }
        if (e.key === "d" || e.key === "D") {
          applyDiscogsMedian()
          return
        }
        if (e.key === "l" || e.key === "L") {
          if (editingCopy?.id) printLabel(editingCopy.id)
          return
        }
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [activeView, searchResults, selectedResultIndex, editingCopy, isNewCopy, releaseDetail, stats, doSearch, conditionMedia, conditionSleeve, priceValue, noteText])

  // ─── RENDER ──────────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    background: C.card,
    borderRadius: S.radius.md,
    border: `1px solid ${C.border}`,
    padding: S.gap.lg,
  }

  return (
    <PageShell>
      <PageHeader
        title="Stocktake Session"
        subtitle={stats ? `${stats.verified.toLocaleString()} verified · ${stats.eligible.toLocaleString()} im Inventar · ${(stats as any).total_releases?.toLocaleString() || "..."} im Katalog` : "Startet..."}
        actions={
          <div style={{ display: "flex", gap: S.gap.md, alignItems: "center" }}>
            <Badge
              label={printerStatus === "connected" ? "Silent Print" : "Browser Print"}
              variant={printerStatus === "connected" ? "success" : "info"}
            />
            <Btn label="Dashboard" variant="ghost" onClick={() => window.location.href = "/app/erp/inventory"} />
            <Btn label="Exit Session" variant="ghost" onClick={() => setShowExitModal(true)} />
          </div>
        }
      />

      {/* ── SEARCH BAR ── */}
      <div style={{ marginBottom: S.gap.lg }}>
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && searchResults.length > 0) {
              e.preventDefault()
              openRelease(searchResults[selectedResultIndex].release_id)
            }
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setSelectedResultIndex((i) => Math.min(i + 1, searchResults.length - 1))
            }
            if (e.key === "ArrowUp") {
              e.preventDefault()
              setSelectedResultIndex((i) => Math.max(i - 1, 0))
            }
          }}
          placeholder="Artist, Titel, Katalognummer oder VOD-Nummer (z.B. VOD-19586) suchen..."
          style={{
            ...inputStyle,
            width: "100%",
            padding: "14px 16px",
            fontSize: 16,
            borderColor: activeView === "search" ? C.gold : C.border,
          }}
          autoFocus
        />
      </div>

      {/* ── SEARCH RESULTS ──
          Scrollbarer Container: bei generischen Tokens ("vanity", "music")
          kommen 50-500 Treffer. Ohne maxHeight wird die Page lang und Frank
          verliert die Recent-Items + Search-Bar aus dem Viewport. */}
      {activeView === "search" && searchResults.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: S.gap.lg, padding: 0, overflow: "hidden" }}>
          <div style={{
            padding: "8px 16px",
            background: C.hover,
            borderBottom: `1px solid ${C.border}`,
            ...T.small,
            color: C.muted,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}>
            Treffer · {searchResults.length}
          </div>
          <div style={{ maxHeight: 600, overflowY: "auto" }}>
          {searchResults.map((r, idx) => (
            <div
              key={r.release_id}
              onClick={() => openRelease(r.release_id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: S.gap.md,
                padding: "10px 16px",
                cursor: "pointer",
                background: idx === selectedResultIndex ? C.hover : "transparent",
                borderBottom: idx < searchResults.length - 1 ? `1px solid ${C.border}` : "none",
                transition: "background 0.1s",
              }}
              onMouseEnter={() => setSelectedResultIndex(idx)}
            >
              {r.cover_image ? (
                <img src={r.cover_image} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }} />
              ) : (
                <div style={{ width: 48, height: 48, background: C.border, borderRadius: 4 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.artist_name || "Unknown"} — {r.title}
                </div>
                <div style={{ ...T.small, color: C.muted }}>
                  {r.article_number ? <span style={{ fontFamily: "monospace", fontWeight: 600, marginRight: 6 }}>{r.article_number}</span> : null}
                  {r.format}
                  {r.catalog_number ? ` · ${r.catalog_number}` : ""}
                  {r.label_name ? ` · ${r.label_name}` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <div style={{ fontWeight: 600, color: C.gold }}>{r.legacy_price != null ? `€${r.legacy_price}` : ""}</div>
                <div style={{ ...T.small, color: C.muted }}>
                  {r.exemplar_count > 0
                    ? <>{r.exemplar_count} Ex. {r.verified_count > 0 && <span style={{ color: C.success }}>· {r.verified_count} done</span>}</>
                    : <span style={{ color: C.warning }}>NEU</span>}
                </div>
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      {activeView === "search" && searchQuery && !searchLoading && searchResults.length === 0 && (
        <div style={{ ...cardStyle, textAlign: "center", color: C.muted, padding: 40 }}>
          Kein Treffer für &quot;{searchQuery}&quot;
        </div>
      )}

      {/* ── RELEASE DETAIL + COPIES ── */}
      {activeView === "detail" && releaseDetail && (
        <div style={{ ...cardStyle, marginBottom: S.gap.lg }}>
          {/* Release header */}
          <div style={{ display: "flex", gap: S.gap.lg, marginBottom: S.gap.lg }}>
            <div style={{ position: "relative", width: 200, height: 200 }}>
              {releaseDetail.cover_image ? (
                <img src={releaseDetail.cover_image} alt="" style={{ width: 200, height: 200, objectFit: "cover", borderRadius: S.radius.md }} />
              ) : (
                <div style={{
                  width: 200, height: 200, background: C.border, borderRadius: S.radius.md,
                  display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
                  cursor: "pointer", border: `2px dashed ${C.muted}`,
                }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div style={{ fontSize: 32, marginBottom: 4 }}>📷</div>
                  <div style={{ ...T.small, color: C.muted }}>Foto aufnehmen</div>
                </div>
              )}
              {/* Upload button overlay (always visible) */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  position: "absolute", bottom: 6, right: 6,
                  background: C.gold, color: "#000", border: "none", borderRadius: 4,
                  padding: "4px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                  opacity: uploading ? 0.5 : 0.9,
                }}
              >
                {uploading ? "..." : "📷"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleImageUpload(file)
                  e.target.value = ""
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 22, color: C.text }}>{releaseDetail.artist_name || "Unknown"}</h2>
              <div style={{ fontSize: 16, color: C.muted, marginTop: 4 }}>{releaseDetail.title}</div>
              {releaseDetail.article_number && (
                <div style={{ ...T.small, fontFamily: "monospace", color: C.gold, marginTop: 4, fontWeight: 600 }}>
                  {releaseDetail.article_number}
                </div>
              )}
              <div style={{ ...T.small, color: C.muted, marginTop: 8 }}>
                {releaseDetail.format}
                {releaseDetail.catalog_number ? ` · ${releaseDetail.catalog_number}` : ""}
                {releaseDetail.label_name ? ` · ${releaseDetail.label_name}` : ""}
              </div>
              <div style={{ ...T.small, color: C.muted, marginTop: 4 }}>
                {releaseDetail.country || ""}{releaseDetail.year ? ` · ${releaseDetail.year}` : ""}
              </div>
              {/* Quick-Links zu Catalog (Admin) + Storefront (oeffentlich).
                  Beide oeffnen in neuem Tab, damit Frank seine Inventur-Session
                  nicht verlaesst. Storefront-URL ist die Prod-URL — Admin
                  laeuft praktisch nur auf Prod, lokale Dev-Sessions sind
                  selten Stocktake-Use-Case. */}
              <div style={{ ...T.small, marginTop: 8, display: "flex", gap: 12, alignItems: "center" }}>
                <a
                  href={`/app/media/${releaseDetail.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: C.gold, textDecoration: "underline" }}
                  title="Im Catalog (Admin) oeffnen"
                >
                  → Catalog
                </a>
                <a
                  href={`https://vod-auctions.com/catalog/${releaseDetail.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: C.gold, textDecoration: "underline" }}
                  title="Im Storefront (oeffentliche Ansicht) oeffnen"
                >
                  → Storefront
                </a>
              </div>
              <div style={{ marginTop: 12, fontSize: 24, fontWeight: 700, color: C.gold }}>
                {releaseDetail.legacy_price != null ? `€${releaseDetail.legacy_price}` : "—"}
              </div>
              {/* Discogs prices — 2 semantic sources, not a Low/Med/High triple:
                  1) Market: lowest active listing + count (from /marketplace/stats)
                  2) Suggestion range across 7 grades (from /marketplace/price_suggestions,
                     Median=middle grade, High=Mint). NOT sales-history — that data is
                     only on the Discogs website, link through for it. */}
              {(releaseDetail.discogs_lowest != null || releaseDetail.discogs_median != null) && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                  {releaseDetail.discogs_lowest != null && (
                    <div style={{ ...T.small, color: C.muted }}>
                      <strong style={{ color: C.text }}>Markt aktuell:</strong>{" "}
                      ab €{releaseDetail.discogs_lowest.toFixed(2)}
                      {releaseDetail.discogs_num_for_sale != null && ` · ${releaseDetail.discogs_num_for_sale} im Angebot`}
                    </div>
                  )}
                  {releaseDetail.discogs_median != null && releaseDetail.discogs_highest != null && (
                    <div style={{ ...T.small, color: C.muted }}>
                      <strong style={{ color: C.text }}>Discogs-Suggestion:</strong>{" "}
                      Median €{releaseDetail.discogs_median.toFixed(2)} · Mint €{releaseDetail.discogs_highest.toFixed(2)}
                      <span style={{ color: C.muted, opacity: 0.7 }}> (je Zustand)</span>
                    </div>
                  )}
                  {releaseDetail.discogs_url && (
                    <a href={releaseDetail.discogs_url} target="_blank" rel="noopener noreferrer" style={{ ...T.small, color: C.gold, textDecoration: "underline", marginTop: 2 }}>
                      Sales-History auf Discogs ansehen →
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Copies list */}
          <div style={{ marginBottom: S.gap.lg }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S.gap.md }}>
              <div style={{ fontWeight: 600, color: C.text }}>Exemplare ({copies.length})</div>
              <Btn label="[A] Weiteres Exemplar" variant="gold" onClick={startNewCopy} style={{ fontSize: 12, padding: "6px 12px" }} />
            </div>
            {copies.map((copy) => (
              <div
                key={copy.id}
                onClick={() => startEditCopy(copy)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: S.gap.md,
                  padding: "10px 12px",
                  borderRadius: S.radius.sm,
                  cursor: "pointer",
                  background: editingCopy?.id === copy.id ? `${C.gold}15` : "transparent",
                  border: editingCopy?.id === copy.id ? `1px solid ${C.gold}40` : `1px solid transparent`,
                  marginBottom: 4,
                  transition: "all 0.15s",
                }}
              >
                <div style={{ fontWeight: 700, width: 28, color: C.muted }}>#{copy.copy_number}</div>
                <div style={{ width: 80, ...T.small }}>
                  {copy.condition_media && copy.condition_sleeve
                    ? `${copy.condition_media}/${copy.condition_sleeve}`
                    : copy.condition_media || "—"}
                </div>
                <div style={{ width: 70, fontWeight: 600, color: C.gold }}>
                  €{copy.effective_price ?? "—"}
                </div>
                <div style={{ width: 120, fontFamily: "monospace", ...T.small }}>
                  {copy.barcode || "—"}
                </div>
                <div style={{ flex: 1 }}>
                  {copy.is_verified
                    ? <Badge label="Verified" variant="success" />
                    : <Badge label="Pending" variant="warning" />}
                </div>
                {/* P0.5: Re-Edit + Re-Print buttons, always available (even post-verify) */}
                <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={(e) => { e.stopPropagation(); startEditCopy(copy) }}
                    style={{
                      background: "none",
                      border: `1px solid ${C.border}`,
                      borderRadius: 4,
                      padding: "4px 10px",
                      color: C.text,
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                    title="Edit this copy again"
                  >
                    Edit
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation()
                      if (!copy.barcode) {
                        setToast({ message: "Copy has no barcode yet — verify first", type: "error" })
                        return
                      }
                      const r = await printLabel(copy.id)
                      setToast({
                        message: r.silent ? `Printed ${copy.barcode}` : `Print dialog opened for ${copy.barcode}`,
                        type: "success",
                      })
                    }}
                    style={{
                      background: "none",
                      border: `1px solid ${C.gold}`,
                      borderRadius: 4,
                      padding: "4px 10px",
                      color: C.gold,
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                    title="Re-print label"
                  >
                    Print
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Evaluation form */}
          {(editingCopy || isNewCopy) && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: S.gap.lg }}>
              <div style={{ fontWeight: 600, color: C.text, marginBottom: S.gap.md }}>
                {isNewCopy ? `Neues Exemplar #${copies.length + 1}` : `Exemplar #${editingCopy?.copy_number} bewerten`}
              </div>

              <GradeSelector label="Zustand Media" value={conditionMedia} onChange={setConditionMedia} />
              <GradeSelector label="Zustand Sleeve" value={conditionSleeve} onChange={setConditionSleeve} />

              <div style={{ marginBottom: S.gap.md }}>
                <div style={{ ...T.small, color: C.muted, marginBottom: 4 }}>Preis (EUR)</div>
                <div style={{ display: "flex", gap: S.gap.sm, alignItems: "center" }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceValue}
                    onChange={(e) => setPriceValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleVerify(true) }}
                    style={{ ...inputStyle, width: 120 }}
                    placeholder="0"
                  />
                  {releaseDetail?.discogs_median != null && (
                    <button
                      onClick={applyDiscogsMedian}
                      style={{
                        background: "none",
                        border: `1px solid ${C.border}`,
                        borderRadius: 4,
                        padding: "6px 12px",
                        color: C.gold,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                      title="Discogs Median-Suggestion übernehmen (über alle 7 Zustände gemittelt — für Mint eher Mint-Suggestion nehmen)"
                    >
                      [D] Sugg €{Math.round(releaseDetail.discogs_median)}
                    </button>
                  )}
                  {releaseDetail?.discogs_highest != null && releaseDetail.discogs_highest !== releaseDetail.discogs_median && (
                    <button
                      onClick={() => {
                        if (releaseDetail?.discogs_highest != null) {
                          setPriceValue(String(Math.round(releaseDetail.discogs_highest)))
                        }
                      }}
                      style={{
                        background: "none",
                        border: `1px solid ${C.border}`,
                        borderRadius: 4,
                        padding: "6px 12px",
                        color: C.gold,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                      title="Discogs Mint-Suggestion übernehmen (höchste Zustands-Empfehlung)"
                    >
                      Mint €{Math.round(releaseDetail.discogs_highest)}
                    </button>
                  )}
                  {releaseDetail?.discogs_lowest != null && (
                    <button
                      onClick={() => {
                        if (releaseDetail?.discogs_lowest != null) {
                          setPriceValue(String(Math.round(releaseDetail.discogs_lowest)))
                        }
                      }}
                      style={{
                        background: "none",
                        border: `1px solid ${C.border}`,
                        borderRadius: 4,
                        padding: "6px 12px",
                        color: C.gold,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                      title="Niedrigster aktiver Marktpreis (alle Zustände)"
                    >
                      Markt €{Math.round(releaseDetail.discogs_lowest)}
                    </button>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: S.gap.lg }}>
                <div style={{ ...T.small, color: C.muted, marginBottom: 4 }}>Notiz (optional)</div>
                <input
                  type="text"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleVerify(true) }}
                  style={{ ...inputStyle, width: "100%" }}
                  placeholder="Freitext..."
                />
              </div>

              <div style={{ display: "flex", gap: S.gap.md, flexWrap: "wrap" }}>
                <Btn
                  label={actionLoading ? "Speichert..." : "[S] Nur Speichern"}
                  variant="ghost"
                  onClick={() => handleVerify(false)}
                  disabled={actionLoading}
                />
                <Btn
                  label={actionLoading ? "Speichert..." : "[V] Speichern & Drucken"}
                  variant="gold"
                  onClick={() => handleVerify(true)}
                  disabled={actionLoading}
                />
                <Btn label="[Esc] Zurück" variant="ghost" onClick={backToSearch} />
              </div>
              <div style={{ ...T.small, color: C.muted, marginTop: S.gap.sm }}>
                "Nur Speichern" persistiert Zustand + Preis ohne Druck.
                "Speichern & Drucken" macht beides. Preis-Änderungen werden
                immer ins Label übernommen.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── RECENT ITEMS ── prominente Sektion im Search-View (alle bearbeiteten
          Platten der laufenden + vorherigen Sessions, scrollbar). Klick auf
          Eintrag öffnet das Release wieder. Cap 2026-04-22 entfernt — Backend
          liefert bis 1000 Eintraege, In-Memory unbegrenzt akkumuliert. */}
      {activeView === "search" && recentItems.length > 0 && (
        <div style={{ ...cardStyle, marginTop: S.gap.lg, padding: 0, overflow: "hidden" }}>
          <div style={{
            padding: "8px 16px",
            background: C.hover,
            borderBottom: `1px solid ${C.border}`,
            ...T.small,
            color: C.muted,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}>
            Zuletzt bearbeitet · {recentItems.length}
          </div>
          <div style={{ maxHeight: 600, overflowY: "auto" }}>
          {recentItems.map((r, i) => {
            const ageSec = Math.floor((Date.now() - r.at) / 1000)
            const ageLabel = ageSec < 60
              ? `${ageSec}s`
              : ageSec < 3600
              ? `${Math.floor(ageSec / 60)}m`
              : `${Math.floor(ageSec / 3600)}h`
            return (
              <div
                key={`${r.release_id}-${r.copy}-${r.at}`}
                onClick={() => openRelease(r.release_id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: S.gap.md,
                  padding: "10px 16px",
                  cursor: "pointer",
                  borderBottom: i < recentItems.length - 1 ? `1px solid ${C.border}` : "none",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = C.hover }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent" }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ color: C.success, marginRight: 6 }}>✓</span>
                    {r.artist} — {r.title}
                    <span style={{ color: C.muted, fontWeight: 400, marginLeft: 6 }}>#{r.copy}</span>
                  </div>
                  <div style={{ ...T.small, color: C.muted }}>
                    {r.barcode ? <span style={{ fontFamily: "monospace", marginRight: 6 }}>{r.barcode}</span> : null}
                    {r.condition ? <span style={{ marginRight: 6 }}>· {r.condition}</span> : null}
                  </div>
                </div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {r.price != null && (
                    <div style={{ fontWeight: 600, color: C.gold }}>€{r.price}</div>
                  )}
                  <div style={{ ...T.small, color: C.muted }}>vor {ageLabel}</div>
                </div>
              </div>
            )
          })}
          </div>
        </div>
      )}

      {/* ── SHORTCUTS HELP ── */}
      <div style={{ ...T.small, color: C.muted, marginTop: S.gap.lg, opacity: 0.6, textAlign: "center" }}>
        / Search · ↑↓ Navigate · Enter Open · V Verify · A Add Copy · D Discogs Median · L Print Label · Esc Back
      </div>

      {/* ── EXIT MODAL ── */}
      {showExitModal && (
        <Modal
          title="Session beenden?"
          onClose={() => setShowExitModal(false)}
          footer={
            <>
              <Btn
                label="Session beenden"
                variant="gold"
                onClick={() => {
                  try { sessionStorage.removeItem("vod.inventory_session_active") } catch { /* ignore */ }
                  window.location.href = "/app/erp/inventory"
                }}
              />
              <Btn label="Weiterarbeiten" variant="ghost" onClick={() => setShowExitModal(false)} />
            </>
          }
        >
          <p style={{ color: C.muted }}>Dein Fortschritt ist gespeichert. Du kannst jederzeit zurückkehren.</p>
        </Modal>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </PageShell>
  )
}

export default StocktakeSessionPage
