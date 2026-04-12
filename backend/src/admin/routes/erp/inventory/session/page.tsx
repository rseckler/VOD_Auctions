import { useState, useEffect, useCallback, useRef } from "react"
import { useAdminNav } from "../../../../components/admin-nav"
import { C, T, S, fmtMoney } from "../../../../components/admin-tokens"
import { PageHeader, PageShell } from "../../../../components/admin-layout"
import { Btn, Toast, Modal, inputStyle, Badge } from "../../../../components/admin-ui"

// ─── Types ──────────────────────────────────────────────────────────────────

interface SearchResult {
  release_id: string
  artist_name: string | null
  title: string
  format: string
  catalog_number: string | null
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

async function checkQzTray(): Promise<boolean> {
  try {
    const ws = new WebSocket("wss://localhost:8181")
    return new Promise((resolve) => {
      ws.onopen = () => { ws.close(); resolve(true) }
      ws.onerror = () => resolve(false)
      setTimeout(() => { ws.close(); resolve(false) }, 1000)
    })
  } catch { return false }
}

async function printLabel(inventoryItemId: string): Promise<void> {
  window.open(`/admin/erp/inventory/items/${inventoryItemId}/label`, "_blank")
}

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
  const [autoPrint, setAutoPrint] = useState(true)
  const [recentItems, setRecentItems] = useState<Array<{ artist: string; title: string; copy: number }>>([])
  const [actionLoading, setActionLoading] = useState(false)

  // Scanner buffer
  const scanBuffer = useRef("")
  const scanTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Init ──

  useEffect(() => {
    checkQzTray().then((ok) => setPrinterStatus(ok ? "connected" : "browser"))
    apiFetch<any>("/admin/erp/inventory/stats").then((s) => {
      setStats({ eligible: s.eligible, verified: s.verified })
    }).catch(() => {})
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
        `/admin/erp/inventory/search?q=${encodeURIComponent(q.trim())}&limit=20`
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
    setConditionMedia(copy.condition_media as Grade || null)
    setConditionSleeve(copy.condition_sleeve as Grade || null)
    setPriceValue(copy.effective_price != null ? String(copy.effective_price) : "")
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

  const handleVerify = async () => {
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

        if (autoPrint) await printLabel(result.item.id)

        setToast({ message: `Copy #${result.item.copy_number} created — ${result.item.barcode}`, type: "success" })
        setRecentItems((prev) => [
          { artist: releaseDetail.artist_name || "?", title: releaseDetail.title, copy: result.item.copy_number },
          ...prev.slice(0, 4),
        ])
      } else if (editingCopy) {
        // Verify existing copy
        const body: any = {
          condition_media: conditionMedia || undefined,
          condition_sleeve: conditionSleeve || undefined,
          notes: noteText || undefined,
        }
        const price = parseFloat(priceValue.replace(",", "."))
        if (!isNaN(price) && price >= 0) {
          const rounded = Math.round(price)
          if (editingCopy.copy_number === 1) {
            // Copy #1: update Release.legacy_price
            if (rounded !== releaseDetail.legacy_price) body.new_price = rounded
          } else {
            // Copy #2+: update exemplar_price
            body.exemplar_price = rounded
          }
        }

        const result = await apiFetch<{ barcode: string; copy_number: number }>(
          `/admin/erp/inventory/items/${editingCopy.id}/verify`,
          { method: "POST", body: JSON.stringify(body) }
        )

        if (autoPrint) await printLabel(editingCopy.id)

        setToast({ message: `Verified #${result.copy_number} — ${result.barcode}`, type: "success" })
        setRecentItems((prev) => [
          { artist: releaseDetail.artist_name || "?", title: releaseDetail.title, copy: result.copy_number },
          ...prev.slice(0, 4),
        ])
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
          if (val.length >= 6 && /^VOD-/i.test(val)) {
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
          if (editingCopy || isNewCopy) handleVerify()
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
  }, [activeView, searchResults, selectedResultIndex, editingCopy, isNewCopy, releaseDetail, stats, doSearch, conditionMedia, conditionSleeve, priceValue, noteText, autoPrint])

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
        subtitle={stats ? `${stats.verified.toLocaleString()} verified · ${stats.eligible.toLocaleString()} im Inventar · ${(stats as any).total_releases?.toLocaleString() || "..."} im Katalog` : "Loading..."}
        actions={
          <div style={{ display: "flex", gap: S.gap.md, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", ...T.small }}>
              <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} />
              Auto-Print
            </label>
            <Badge
              label={printerStatus === "connected" ? "QZ Tray" : "Browser Print"}
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
          placeholder="Artist, Titel oder Katalognummer suchen..."
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

      {/* ── SEARCH RESULTS ── */}
      {activeView === "search" && searchResults.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: S.gap.lg, padding: 0, overflow: "hidden" }}>
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
                  {r.format} {r.catalog_number ? `· ${r.catalog_number}` : ""} {r.label_name ? `· ${r.label_name}` : ""}
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
              <div style={{ ...T.small, color: C.muted, marginTop: 8 }}>
                {releaseDetail.format}
                {releaseDetail.catalog_number ? ` · ${releaseDetail.catalog_number}` : ""}
                {releaseDetail.label_name ? ` · ${releaseDetail.label_name}` : ""}
              </div>
              <div style={{ ...T.small, color: C.muted, marginTop: 4 }}>
                {releaseDetail.country || ""}{releaseDetail.year ? ` · ${releaseDetail.year}` : ""}
              </div>
              <div style={{ marginTop: 12, fontSize: 24, fontWeight: 700, color: C.gold }}>
                {releaseDetail.legacy_price != null ? `€${releaseDetail.legacy_price}` : "—"}
              </div>
              {/* Discogs prices */}
              {releaseDetail.discogs_lowest != null && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ ...T.small, fontWeight: 600, color: C.muted, marginBottom: 4 }}>Discogs Market</div>
                  <div style={{ ...T.small, color: C.muted }}>
                    Low €{releaseDetail.discogs_lowest?.toFixed(2)} · Med €{releaseDetail.discogs_median?.toFixed(2)} · High €{releaseDetail.discogs_highest?.toFixed(2)} · {releaseDetail.discogs_num_for_sale} for sale
                  </div>
                  {releaseDetail.discogs_url && (
                    <a href={releaseDetail.discogs_url} target="_blank" rel="noopener noreferrer" style={{ ...T.small, color: C.gold, textDecoration: "underline" }}>
                      View on Discogs
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
                <div style={{ width: 100, fontFamily: "monospace", ...T.small }}>
                  {copy.barcode || "—"}
                </div>
                <div style={{ flex: 1 }}>
                  {copy.is_verified
                    ? <Badge label="Verified" variant="success" />
                    : <Badge label="Pending" variant="warning" />}
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
                    onKeyDown={(e) => { if (e.key === "Enter") handleVerify() }}
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
                    >
                      [D] Median €{Math.round(releaseDetail.discogs_median)}
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
                  onKeyDown={(e) => { if (e.key === "Enter") handleVerify() }}
                  style={{ ...inputStyle, width: "100%" }}
                  placeholder="Freitext..."
                />
              </div>

              <div style={{ display: "flex", gap: S.gap.md }}>
                <Btn
                  label={actionLoading ? "Saving..." : "[V] Bestätigen"}
                  variant="gold"
                  onClick={handleVerify}
                  disabled={actionLoading}
                />
                <Btn label="[Esc] Zurück" variant="ghost" onClick={backToSearch} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── RECENT ITEMS ── */}
      {recentItems.length > 0 && (
        <div style={{ ...T.small, color: C.muted, display: "flex", gap: 16, flexWrap: "wrap" }}>
          {recentItems.map((r, i) => (
            <span key={i}>✓ {r.artist} — {r.title} #{r.copy}</span>
          ))}
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
              <Btn label="Session beenden" variant="gold" onClick={() => window.location.href = "/app/erp/inventory"} />
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
