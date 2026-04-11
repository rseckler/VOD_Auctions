import { useState, useEffect, useCallback, useRef } from "react"
import { useAdminNav } from "../../../../components/admin-nav"
import { C, S } from "../../../../components/admin-tokens"
import { PageHeader, PageShell } from "../../../../components/admin-layout"
import { Btn, Toast, Modal, inputStyle, Alert } from "../../../../components/admin-ui"

// ─── Types ──────────────────────────────────────────────────────────────────

interface QueueItem {
  inventory_item_id: string
  barcode: string | null
  release_id: string
  title: string
  artist_name: string | null
  label_name: string | null
  format: string
  format_group: number
  format_group_label: string
  coverImage: string | null
  catalogNumber: string | null
  legacy_price: number | null
  legacy_condition: string | null
  legacy_format_detail: string | null
  year: number | null
  country: string | null
  product_category: string
  discogs_id: number | null
  discogs_lowest_price: number | null
  discogs_median_price: number | null
  discogs_highest_price: number | null
  discogs_num_for_sale: number | null
  discogs_url: string | null
  inventory_notes: string | null
}

// ─── Printer Status ────────────────────────────────────────────────────────

type PrinterStatus = "connected" | "browser" | "none"

/** Try to connect to QZ Tray via WebSocket. Returns true if available. */
async function checkQzTray(): Promise<boolean> {
  try {
    const ws = new WebSocket("wss://localhost:8181")
    return new Promise((resolve) => {
      ws.onopen = () => { ws.close(); resolve(true) }
      ws.onerror = () => resolve(false)
      setTimeout(() => { ws.close(); resolve(false) }, 1000)
    })
  } catch {
    return false
  }
}

/**
 * Print a label PDF. Tries QZ Tray first (silent print), falls back to browser print.
 * Returns the barcode string for toast feedback.
 */
async function printLabel(inventoryItemId: string, printerStatus: PrinterStatus): Promise<string | null> {
  const labelUrl = `/admin/erp/inventory/items/${inventoryItemId}/label`

  if (printerStatus === "connected") {
    // QZ Tray silent print: fetch PDF as blob, send to QZ Tray
    // For now, we open in new tab — full QZ Tray integration in B6
    window.open(labelUrl, "_blank")
    return inventoryItemId
  }

  // Browser fallback: open PDF in new tab for Ctrl+P
  window.open(labelUrl, "_blank")
  return inventoryItemId
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

// ─── Main Session Page ──────────────────────────────────────────────────────

function StocktakeSessionPage() {
  useAdminNav()

  const [items, setItems] = useState<QueueItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const [totalProcessed, setTotalProcessed] = useState(0)

  // Price input state
  const [priceInputActive, setPriceInputActive] = useState(false)
  const [priceValue, setPriceValue] = useState("")
  const priceInputRef = useRef<HTMLInputElement>(null)

  // Note modal state
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [noteText, setNoteText] = useState("")

  // Exit modal state
  const [showExitModal, setShowExitModal] = useState(false)

  // Undo stack
  const [undoStack, setUndoStack] = useState<Array<{ itemId: string; action: string }>>([])

  // Printer status
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus>("none")
  const [autoPrint, setAutoPrint] = useState(true)

  // Check QZ Tray on mount
  useEffect(() => {
    checkQzTray().then((available) => {
      setPrinterStatus(available ? "connected" : "browser")
    })
  }, [])

  // ── Scanner detection ──

  const handleScanBarcode = useCallback(async (barcode: string) => {
    if (!barcode.startsWith("VOD-")) {
      setToast({ message: `Unknown barcode: ${barcode}`, type: "error" })
      return
    }
    try {
      const item = await apiFetch<QueueItem>(`/admin/erp/inventory/scan/${barcode}`)
      // Insert scanned item at current position for immediate display
      setItems((prev) => {
        const filtered = prev.filter((i) => i.inventory_item_id !== item.inventory_item_id)
        return [item, ...filtered]
      })
      setCurrentIndex(0)
      setToast({ message: `Scanned: ${barcode}`, type: "success" })
    } catch {
      setToast({ message: `Barcode ${barcode} not found`, type: "error" })
    }
  }, [])

  // ── Load queue ──

  const loadQueue = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ items: QueueItem[]; remaining: number }>("/admin/erp/inventory/queue?limit=50")
      setItems(data.items)
      setRemaining(data.remaining)
      setCurrentIndex(0)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadQueue() }, [loadQueue])

  // ── Current item ──

  const current = items[currentIndex] || null

  const advanceToNext = () => {
    setTotalProcessed((p) => p + 1)
    setPriceInputActive(false)
    setPriceValue("")
    if (currentIndex < items.length - 1) {
      setCurrentIndex((i) => i + 1)
    } else {
      // Reached end of batch — reload queue
      loadQueue()
    }
  }

  // Prefetch when approaching end of batch
  useEffect(() => {
    if (currentIndex >= items.length - 10 && items.length > 0 && !loading) {
      // Will reload when currentIndex reaches end via advanceToNext
    }
  }, [currentIndex, items.length, loading])

  // ── Actions ──

  const handleVerify = async (newPrice?: number) => {
    if (!current) return
    try {
      const body: Record<string, unknown> = {}
      if (newPrice != null) body.new_price = newPrice
      const result = await apiFetch<{ barcode: string | null; label_url: string }>(
        `/admin/erp/inventory/items/${current.inventory_item_id}/verify`,
        { method: "POST", body: JSON.stringify(body) }
      )

      // Auto-print label on verify
      if (autoPrint && printerStatus !== "none") {
        printLabel(current.inventory_item_id, printerStatus)
      }

      setUndoStack((s) => [...s, { itemId: current.inventory_item_id, action: "verify" }])
      const bc = result.barcode ? ` · ${result.barcode}` : ""
      setToast({ message: newPrice != null ? `Verified at €${newPrice}${bc}` : `Verified${bc}`, type: "success" })
      advanceToNext()
    } catch (e: any) {
      setToast({ message: e.message, type: "error" })
    }
  }

  const handleMissing = async (notes?: string) => {
    if (!current) return
    try {
      await apiFetch(`/admin/erp/inventory/items/${current.inventory_item_id}/missing`, {
        method: "POST",
        body: JSON.stringify({ notes }),
      })
      setUndoStack((s) => [...s, { itemId: current.inventory_item_id, action: "missing" }])
      setToast({ message: "Marked missing (price → €0)", type: "success" })
      advanceToNext()
    } catch (e: any) {
      setToast({ message: e.message, type: "error" })
    }
  }

  const handleUndo = async () => {
    const last = undoStack[undoStack.length - 1]
    if (!last) return
    try {
      await apiFetch(`/admin/erp/inventory/items/${last.itemId}/reset`, { method: "POST" })
      setUndoStack((s) => s.slice(0, -1))
      setToast({ message: "Undo — item returned to queue", type: "success" })
      loadQueue() // Reload to pick up the reset item
    } catch (e: any) {
      setToast({ message: e.message, type: "error" })
    }
  }

  const handleNote = async () => {
    if (!current || !noteText.trim()) return
    try {
      await apiFetch(`/admin/erp/inventory/items/${current.inventory_item_id}/note`, {
        method: "POST",
        body: JSON.stringify({ notes: noteText.trim() }),
      })
      setToast({ message: "Note saved", type: "success" })
      setShowNoteModal(false)
      setNoteText("")
    } catch (e: any) {
      setToast({ message: e.message, type: "error" })
    }
  }

  // ── Unified keyboard handler: Scanner detection + Shortcuts ─────────────
  //
  // Single keydown listener that handles BOTH USB HID barcode scanner input
  // AND single-key shortcuts (V/P/M/S/N/L/U, arrows, Esc).
  //
  // The trick that makes both coexist:
  //   - Scanner chars arrive every 5–15ms (one full VOD-XXXXXX scan in <60ms).
  //   - Human shortcuts are isolated keypresses with >80ms gaps.
  //
  // Every printable key schedules its shortcut action with a 40ms debounce.
  // If another key arrives within those 40ms (scanner case), the first
  // timer is cancelled. The scanner buffer absorbs ALL chars and fires
  // handleScanBarcode on Enter — the shortcut action never runs for
  // scanner input. For a human "V" press, 40ms pass with no follow-up,
  // so the shortcut fires (latency is imperceptible).
  //
  // Non-printable keys (Arrow, Esc, Enter) are handled immediately without
  // debounce.
  useEffect(() => {
    const scannerBuffer = { current: "" }
    let scannerResetTimer: ReturnType<typeof setTimeout> | null = null
    let shortcutTimer: ReturnType<typeof setTimeout> | null = null

    const handleKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      const isInput = tag === "INPUT" || tag === "TEXTAREA"

      // Esc works everywhere — closes modals, cancels price input, or opens exit
      if (e.key === "Escape") {
        if (showNoteModal) { setShowNoteModal(false); return }
        if (priceInputActive) { setPriceInputActive(false); setPriceValue(""); return }
        setShowExitModal(true)
        return
      }

      // When an input field is focused: only handle Enter (price confirm),
      // all other keys go to the input normally (including the scanner, which
      // is intentional — if you're in the price input and want to scan a
      // different item, hit Esc first).
      if (isInput) {
        if (e.key === "Enter" && priceInputActive) {
          e.preventDefault()
          const val = parseFloat(priceValue.replace(",", "."))
          if (!isNaN(val) && val >= 0) {
            handleVerify(Math.round(val))
          }
        }
        return
      }

      // Modals open → no shortcuts, no scanner
      if (showNoteModal || showExitModal) return

      // ── Scanner: End-of-scan detection ──
      // Enter with a full buffer = USB HID scanner finished a barcode
      if (e.key === "Enter" && scannerBuffer.current.length >= 8) {
        e.preventDefault()
        const barcode = scannerBuffer.current
        scannerBuffer.current = ""
        if (scannerResetTimer) { clearTimeout(scannerResetTimer); scannerResetTimer = null }
        if (shortcutTimer) { clearTimeout(shortcutTimer); shortcutTimer = null }
        handleScanBarcode(barcode)
        return
      }

      // ── Arrow keys: immediate navigation, no debounce needed ──
      if (e.key === "ArrowRight") {
        e.preventDefault()
        if (currentIndex < items.length - 1) setCurrentIndex((i) => i + 1)
        return
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        if (currentIndex > 0) setCurrentIndex((i) => i - 1)
        return
      }

      // ── Printable single character: scanner buffer + debounced shortcut ──
      if (e.key.length === 1) {
        // Append to scanner buffer, reset after 100ms idle
        scannerBuffer.current += e.key
        if (scannerResetTimer) clearTimeout(scannerResetTimer)
        scannerResetTimer = setTimeout(() => {
          scannerBuffer.current = ""
        }, 100)

        // Cancel any pending shortcut (new key arrived — either scan or new action)
        if (shortcutTimer) {
          clearTimeout(shortcutTimer)
          shortcutTimer = null
        }

        // Schedule shortcut action with 40ms debounce.
        // Scanner follow-up chars arrive in ≤15ms and will cancel this timer.
        // Human key-press has no follow-up → timer fires, action runs.
        const key = e.key.toLowerCase()
        shortcutTimer = setTimeout(() => {
          shortcutTimer = null
          switch (key) {
            case "v":
              handleVerify()
              break
            case "p":
              setPriceInputActive(true)
              setPriceValue(current?.legacy_price != null ? String(current.legacy_price) : "")
              setTimeout(() => priceInputRef.current?.focus(), 50)
              break
            case "m":
              handleMissing()
              break
            case "s":
              advanceToNext()
              break
            case "n":
              setNoteText("")
              setShowNoteModal(true)
              break
            case "l":
              if (current) printLabel(current.inventory_item_id, printerStatus)
              break
            case "u":
              handleUndo()
              break
          }
        }, 40)
      }
    }

    window.addEventListener("keydown", handleKey)
    return () => {
      window.removeEventListener("keydown", handleKey)
      if (scannerResetTimer) clearTimeout(scannerResetTimer)
      if (shortcutTimer) clearTimeout(shortcutTimer)
    }
  }, [current, priceInputActive, priceValue, showNoteModal, showExitModal, currentIndex, items.length, undoStack, printerStatus, handleScanBarcode])

  // ── Render ──

  if (loading && items.length === 0) {
    return (
      <PageShell>
        <div style={{ color: C.muted, fontSize: 13 }}>Loading stocktake queue...</div>
      </PageShell>
    )
  }

  if (error && items.length === 0) {
    return (
      <PageShell>
        <Alert type="error">{error}</Alert>
      </PageShell>
    )
  }

  if (!current) {
    return (
      <PageShell maxWidth={700}>
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 8 }}>
            Stocktake Complete
          </h2>
          <p style={{ color: C.muted, fontSize: 14 }}>
            All items have been verified or marked. {totalProcessed} items processed in this session.
          </p>
          <Btn
            label="← Back to Inventory Hub"
            variant="gold"
            style={{ marginTop: 24 }}
            onClick={() => { window.location.href = "/app/erp/inventory" }}
          />
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell maxWidth={900}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <PageHeader
          title="Stocktake Session"
          subtitle={`${current.format_group_label} · Item ${totalProcessed + 1}`}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Printer status indicator */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11, color: C.muted,
            padding: "4px 10px", borderRadius: S.radius.sm,
            background: printerStatus === "connected" ? "#e8f5e9" :
                        printerStatus === "browser" ? "#fff8e1" : "#fce4ec",
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: printerStatus === "connected" ? "#4caf50" :
                          printerStatus === "browser" ? "#ff9800" : "#f44336",
            }} />
            {printerStatus === "connected" ? "QZ Tray" :
             printerStatus === "browser" ? "Browser Print" : "No Printer"}
          </div>
          {/* Auto-print toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.muted, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoPrint}
              onChange={(e) => setAutoPrint(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Auto-Print
          </label>
          <span style={{ fontSize: 12, color: C.muted }}>
            {remaining} remaining
          </span>
          <Btn
            label="Exit Session"
            variant="ghost"
            onClick={() => setShowExitModal(true)}
          />
        </div>
      </div>

      {/* Main content: image + details */}
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24, marginBottom: 24 }}>
        {/* Cover image */}
        <div style={{ borderRadius: S.radius.lg, overflow: "hidden", background: "#f0eeec", aspectRatio: "1/1" }}>
          {current.coverImage ? (
            <img
              src={current.coverImage}
              alt={current.title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 13 }}>
              No image
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            {current.format_group_label} · {current.format} {current.legacy_format_detail ? `(${current.legacy_format_detail})` : ""}
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2, fontFamily: "var(--font-dm-serif)" }}>
            {current.artist_name || "Unknown Artist"}
          </h2>
          <h3 style={{ fontSize: 16, fontWeight: 400, color: C.text, marginBottom: 12 }}>
            {current.title}
          </h3>

          {/* Barcode badge */}
          <div style={{ marginBottom: 10 }}>
            {current.barcode ? (
              <span style={{
                display: "inline-block",
                fontFamily: "monospace", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em",
                padding: "3px 10px", borderRadius: S.radius.sm,
                background: "#f0eeec", color: C.text, border: `1px solid ${C.border}`,
              }}>
                {current.barcode}
              </span>
            ) : (
              <span style={{
                display: "inline-block",
                fontSize: 11, padding: "3px 10px", borderRadius: S.radius.sm,
                background: "#fff8e1", color: "#e65100",
              }}>
                No barcode — assigned on Verify
              </span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, marginBottom: 16 }}>
            {current.catalogNumber && <div><span style={{ color: C.muted }}>Cat #:</span> {current.catalogNumber}</div>}
            {current.label_name && <div><span style={{ color: C.muted }}>Label:</span> {current.label_name}</div>}
            {current.year && <div><span style={{ color: C.muted }}>Year:</span> {current.year}</div>}
            {current.country && <div><span style={{ color: C.muted }}>Country:</span> {current.country}</div>}
            {current.legacy_condition && <div><span style={{ color: C.muted }}>Condition:</span> {current.legacy_condition}</div>}
          </div>

          {/* Current price */}
          <div style={{ fontSize: 28, fontWeight: 700, color: C.gold, marginBottom: 16 }}>
            €{current.legacy_price != null ? current.legacy_price : "—"}
          </div>

          {/* Discogs panel (F4) */}
          {current.discogs_id ? (
            <div style={{ background: "#f8f7f6", borderRadius: S.radius.md, padding: "10px 14px", marginBottom: 16, fontSize: 12 }}>
              <div style={{ fontWeight: 600, color: C.text, marginBottom: 6 }}>Discogs Market</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                <div><span style={{ color: C.muted }}>Lowest:</span> <span style={{ color: C.success }}>€{current.discogs_lowest_price ?? "—"}</span></div>
                <div><span style={{ color: C.muted }}>Median:</span> €{current.discogs_median_price ?? "—"}</div>
                <div><span style={{ color: C.muted }}>Highest:</span> €{current.discogs_highest_price ?? "—"}</div>
                <div><span style={{ color: C.muted }}>For sale:</span> {current.discogs_num_for_sale ?? "—"}</div>
              </div>
              <a
                href={current.discogs_url!}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: C.blue, fontSize: 11, marginTop: 6, display: "inline-block" }}
              >
                View on Discogs →
              </a>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>No Discogs data</div>
          )}

          {/* Price input (activated by P key) */}
          {priceInputActive && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: C.muted }}>New price:</span>
              <input
                ref={priceInputRef}
                style={{ ...inputStyle, maxWidth: 120, fontSize: 18, fontWeight: 700, textAlign: "right" }}
                value={priceValue}
                onChange={(e) => setPriceValue(e.target.value)}
                placeholder="0"
                autoFocus
              />
              <span style={{ fontSize: 18, fontWeight: 700, color: C.text }}>€</span>
              <span style={{ fontSize: 11, color: C.muted }}>(Enter to confirm, Esc to cancel)</span>
            </div>
          )}

          {/* Notes (if any) */}
          {current.inventory_notes && (
            <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic", marginBottom: 8 }}>
              Notes: {current.inventory_notes}
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div style={{
        display: "flex",
        gap: 10,
        padding: "14px 0",
        borderTop: `1px solid ${C.border}`,
        flexWrap: "wrap",
      }}>
        <Btn label={autoPrint ? "[V] Verify + Print" : "[V] Verify"} variant="primary" onClick={() => handleVerify()} />
        <Btn label="[P] Adjust Price" variant="gold" onClick={() => {
          setPriceInputActive(true)
          setPriceValue(current.legacy_price != null ? String(current.legacy_price) : "")
          setTimeout(() => priceInputRef.current?.focus(), 50)
        }} />
        <Btn label="[M] Missing" variant="ghost" onClick={() => handleMissing()} />
        <Btn label="[S] Skip" variant="ghost" onClick={() => advanceToNext()} />
        <Btn label="[L] Print Label" variant="ghost" onClick={() => printLabel(current.inventory_item_id, printerStatus)} />
        <Btn label="[N] Note" variant="ghost" onClick={() => { setNoteText(""); setShowNoteModal(true) }} />
        {undoStack.length > 0 && (
          <Btn label="[U] Undo" variant="ghost" onClick={handleUndo} />
        )}
      </div>

      {/* Keyboard hint */}
      <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>
        Keyboard: V=Verify{autoPrint ? "+Print" : ""} · P=Price · M=Missing · S=Skip · L=Print Label · N=Note · U=Undo · ←/→=Nav · Esc=Exit · Scanner: auto-detect
      </div>

      {/* Note modal */}
      {showNoteModal && (
        <Modal title="Add Note" onClose={() => setShowNoteModal(false)} footer={
          <>
            <Btn label="Cancel" variant="ghost" onClick={() => setShowNoteModal(false)} />
            <Btn label="Save Note" variant="primary" onClick={handleNote} disabled={!noteText.trim()} />
          </>
        }>
          <textarea
            style={{ ...inputStyle, maxWidth: "100%", width: "100%", minHeight: 80, resize: "vertical" }}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note for this item..."
            autoFocus
          />
        </Modal>
      )}

      {/* Exit confirmation */}
      {showExitModal && (
        <Modal title="Exit Session?" onClose={() => setShowExitModal(false)} footer={
          <>
            <Btn label="Continue" variant="primary" onClick={() => setShowExitModal(false)} />
            <Btn label="Exit" variant="ghost" onClick={() => { window.location.href = "/app/erp/inventory" }} />
          </>
        }>
          <p style={{ fontSize: 13, color: C.text }}>
            Progress is saved automatically. You can resume from where you left off.
          </p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
            Processed in this session: {totalProcessed} items
          </p>
        </Modal>
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </PageShell>
  )
}

export default StocktakeSessionPage
