import { useState, useEffect, useCallback, useRef } from "react"
import { useAdminNav } from "../../../../components/admin-nav"
import { C, S } from "../../../../components/admin-tokens"
import { PageHeader, PageShell } from "../../../../components/admin-layout"
import { Btn, Toast, Modal, inputStyle, Alert } from "../../../../components/admin-ui"

// ─── Types ──────────────────────────────────────────────────────────────────

interface QueueItem {
  inventory_item_id: string
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
      await apiFetch(`/admin/erp/inventory/items/${current.inventory_item_id}/verify`, {
        method: "POST",
        body: JSON.stringify(body),
      })
      setUndoStack((s) => [...s, { itemId: current.inventory_item_id, action: "verify" }])
      setToast({ message: newPrice != null ? `Verified at €${newPrice}` : "Verified", type: "success" })
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

  // ── Keyboard shortcuts ──

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Ignore shortcuts when an input is focused (except Esc and Enter)
      const tag = (document.activeElement as HTMLElement)?.tagName
      const isInput = tag === "INPUT" || tag === "TEXTAREA"

      if (e.key === "Escape") {
        if (showNoteModal) { setShowNoteModal(false); return }
        if (priceInputActive) { setPriceInputActive(false); setPriceValue(""); return }
        setShowExitModal(true)
        return
      }

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

      if (showNoteModal || showExitModal) return

      switch (e.key.toLowerCase()) {
        case "v":
          e.preventDefault()
          handleVerify()
          break
        case "p":
          e.preventDefault()
          setPriceInputActive(true)
          setPriceValue(current?.legacy_price != null ? String(current.legacy_price) : "")
          setTimeout(() => priceInputRef.current?.focus(), 50)
          break
        case "m":
          e.preventDefault()
          handleMissing()
          break
        case "s":
          e.preventDefault()
          advanceToNext()
          break
        case "n":
          e.preventDefault()
          setNoteText("")
          setShowNoteModal(true)
          break
        case "u":
          e.preventDefault()
          handleUndo()
          break
        case "arrowright":
          e.preventDefault()
          if (currentIndex < items.length - 1) setCurrentIndex((i) => i + 1)
          break
        case "arrowleft":
          e.preventDefault()
          if (currentIndex > 0) setCurrentIndex((i) => i - 1)
          break
      }
    }

    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [current, priceInputActive, priceValue, showNoteModal, showExitModal, currentIndex, items.length, undoStack])

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
        <Btn label="[V] Verify" variant="primary" onClick={() => handleVerify()} />
        <Btn label="[P] Adjust Price" variant="gold" onClick={() => {
          setPriceInputActive(true)
          setPriceValue(current.legacy_price != null ? String(current.legacy_price) : "")
          setTimeout(() => priceInputRef.current?.focus(), 50)
        }} />
        <Btn label="[M] Missing" variant="ghost" onClick={() => handleMissing()} />
        <Btn label="[S] Skip" variant="ghost" onClick={() => advanceToNext()} />
        <Btn label="[N] Note" variant="ghost" onClick={() => { setNoteText(""); setShowNoteModal(true) }} />
        {undoStack.length > 0 && (
          <Btn label="[U] Undo" variant="ghost" onClick={handleUndo} />
        )}
      </div>

      {/* Keyboard hint */}
      <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>
        Keyboard: V=Verify · P=Price · M=Missing · S=Skip · N=Note · U=Undo · ←/→=Navigate · Esc=Exit
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
