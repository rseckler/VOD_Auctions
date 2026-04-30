// ─── ExemplarQuickEditModal ─────────────────────────────────────────────────
// Quick-Edit pro erp_inventory_item aus der Catalog-Detail-Page (rc52.6.3).
// Felder: Preis · Media-Condition · Sleeve-Condition · Lagerort · Notes.
// Endpoint: PATCH /admin/erp/inventory/items/:id

import { useState } from "react"
import { C, T, S } from "./admin-tokens"
import { Btn, Modal } from "./admin-ui"

const GRADES = ["M", "NM", "VG+", "VG", "G+", "G", "F", "P"] as const

export type ExemplarQuickEditTarget = {
  inventory_item_id: string
  copy_number?: number | null
  inventory_barcode?: string | null
  exemplar_price?: number | string | null
  erp_condition_media?: string | null
  erp_condition_sleeve?: string | null
  warehouse_location_id?: string | null
  inventory_notes?: string | null
}

export type WarehouseLocationOption = {
  id: string
  code: string
  name: string
}

interface Props {
  target: ExemplarQuickEditTarget
  locations: WarehouseLocationOption[]
  onClose: () => void
  onSaved: () => void
}

function GradeRow({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div>
      <div style={{ ...T.small, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {GRADES.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => onChange(value === g ? null : g)}
            style={{
              padding: "6px 12px",
              border: `1px solid ${value === g ? C.gold : C.border}`,
              borderRadius: 4,
              background: value === g ? C.gold : "transparent",
              color: value === g ? "#000" : C.text,
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: 12,
            }}
          >
            {g}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ExemplarQuickEditModal({ target, locations, onClose, onSaved }: Props) {
  const [price, setPrice] = useState<string>(
    target.exemplar_price != null ? String(target.exemplar_price).replace(".", ",") : ""
  )
  const [conditionMedia, setConditionMedia] = useState<string | null>(target.erp_condition_media ?? null)
  const [conditionSleeve, setConditionSleeve] = useState<string | null>(target.erp_condition_sleeve ?? null)
  const [warehouseId, setWarehouseId] = useState<string>(target.warehouse_location_id ?? "")
  const [notes, setNotes] = useState<string>(target.inventory_notes ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setError(null)
    // Validate price
    let parsedPrice: number | null = null
    if (price.trim() !== "") {
      const normalized = price.replace(",", ".").trim()
      const n = parseFloat(normalized)
      if (!Number.isFinite(n) || n < 0) {
        setError("Preis muss eine nicht-negative Zahl sein (oder leer)")
        return
      }
      parsedPrice = n
    }
    setSaving(true)
    try {
      const res = await fetch(`/admin/erp/inventory/items/${target.inventory_item_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          exemplar_price: parsedPrice,
          condition_media: conditionMedia,
          condition_sleeve: conditionSleeve,
          warehouse_location_id: warehouseId || null,
          notes: notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => "")
        let msg = txt
        try {
          msg = JSON.parse(txt).message || txt
        } catch { /* ignore */ }
        throw new Error(`HTTP ${res.status}: ${msg}`)
      }
      onSaved()
    } catch (e: any) {
      setError(`Speichern fehlgeschlagen: ${e?.message ?? e}`)
    } finally {
      setSaving(false)
    }
  }

  const subtitle = target.copy_number
    ? `Copy #${target.copy_number}${target.inventory_barcode ? ` · ${target.inventory_barcode}` : ""}`
    : target.inventory_barcode || target.inventory_item_id

  return (
    <Modal
      title="Exemplar bearbeiten"
      subtitle={subtitle}
      onClose={onClose}
      maxWidth={560}
      footer={
        <div style={{ display: "flex", gap: S.gap.sm, justifyContent: "flex-end" }}>
          <Btn label="Abbrechen" variant="ghost" onClick={onClose} disabled={saving} />
          <Btn label={saving ? "Speichere…" : "Speichern"} variant="gold" onClick={handleSave} disabled={saving} />
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: S.gap.lg }}>
        {/* Preis */}
        <div>
          <div style={{ ...T.small, color: C.muted, marginBottom: 4 }}>Preis</div>
          <div style={{ display: "flex", alignItems: "center", gap: S.gap.sm }}>
            <input
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="z.B. 12,90"
              style={{
                flex: 1, padding: "8px 12px", fontSize: 14,
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: S.radius.sm, color: C.text,
              }}
            />
            <span style={{ ...T.body, color: C.muted }}>€</span>
          </div>
          <div style={{ ...T.micro, color: C.muted, marginTop: 4 }}>
            Bei Single-Copy wird der Preis automatisch auf Release.shop_price übernommen.
          </div>
        </div>

        {/* Conditions */}
        <GradeRow label="Media-Zustand" value={conditionMedia} onChange={setConditionMedia} />
        <GradeRow label="Sleeve-Zustand" value={conditionSleeve} onChange={setConditionSleeve} />

        {/* Warehouse */}
        <div>
          <div style={{ ...T.small, color: C.muted, marginBottom: 4 }}>Lagerort</div>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            style={{
              width: "100%", padding: "8px 12px", fontSize: 14,
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: S.radius.sm, color: C.text,
            }}
          >
            <option value="">— kein Lagerort —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.code} — {l.name}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div>
          <div style={{ ...T.small, color: C.muted, marginBottom: 4 }}>Notiz</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optional — wird auf der Storefront unter „Item Note" angezeigt"
            style={{
              width: "100%", padding: "8px 12px", fontSize: 13, fontFamily: "inherit",
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: S.radius.sm, color: C.text, resize: "vertical",
            }}
          />
        </div>

        {error && (
          <div style={{
            ...T.small, color: C.error, background: C.error + "15",
            border: `1px solid ${C.error}40`, borderRadius: S.radius.sm,
            padding: "8px 12px",
          }}>{error}</div>
        )}
      </div>
    </Modal>
  )
}
