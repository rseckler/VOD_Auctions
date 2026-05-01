import { useEffect, useState } from "react"
import { useAdminNav } from "../../../components/admin-nav"
import { C } from "../../../components/admin-tokens"
import { PageHeader, PageShell } from "../../../components/admin-layout"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Printer {
  id: string
  warehouse_location_id: string
  location_code: string
  location_name: string
  manufacturer: string
  model: string
  ip_address: string
  port: number
  label_type: string
  brother_ql_model: string | null
  is_active: boolean
  is_default_for_location: boolean
  display_name: string | null
  mac_address: string | null
  hostname: string | null
  notes: string | null
  sort_order: number
}

interface WarehouseLocation {
  id: string
  code: string
  name: string
  is_active: boolean
}

type PrinterForm = {
  warehouse_location_id: string
  manufacturer: string
  model: string
  ip_address: string
  port: number
  label_type: string
  brother_ql_model: string
  is_default_for_location: boolean
  display_name: string
  mac_address: string
  hostname: string
  notes: string
  sort_order: number
}

const EMPTY_FORM: PrinterForm = {
  warehouse_location_id: "",
  manufacturer: "Brother",
  model: "QL-820NWB",
  ip_address: "",
  port: 9100,
  label_type: "29",
  brother_ql_model: "QL-820NWB",
  is_default_for_location: false,
  display_name: "",
  mac_address: "",
  hostname: "",
  notes: "",
  sort_order: 0,
}

const LABEL_TYPES = [
  { value: "29", label: "29mm continuous (DK-22210)" },
  { value: "29x90", label: "29×90mm die-cut (DK-11201)" },
  { value: "62", label: "62mm continuous (DK-22205)" },
  { value: "62x100", label: "62×100mm die-cut (DK-11247)" },
]

// ─── API ──────────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.message || `${res.status}`)
  }
  return res.json()
}

// ─── Test-Druck (frontend → Bridge → Drucker) ─────────────────────────────────
// Der VPS-Backend kann Drucker-IPs (private LAN: 10.x / 192.168.1.x) nicht
// direkt erreichen. Test-Print läuft daher über die lokale Bridge auf dem Mac.

async function sendTestPrint(printer: Printer): Promise<void> {
  const BRIDGE = "https://127.0.0.1:17891"
  const TIMEOUT = 5000

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT)
  let healthOk = false
  try {
    const h = await fetch(`${BRIDGE}/health`, { signal: ctrl.signal })
    healthOk = h.ok
  } catch {
    throw new Error("Bridge nicht erreichbar — läuft die Bridge auf diesem Mac?")
  } finally {
    clearTimeout(t)
  }
  if (!healthOk) throw new Error("Bridge /health nicht OK")

  const labelResp = await fetch("/admin/print-bridge/sample-label", { credentials: "include" })
  if (!labelResp.ok) throw new Error(`Sample-Label-Fetch fehlgeschlagen: ${labelResp.status}`)
  const pdfBlob = await labelResp.blob()

  const params = new URLSearchParams({
    copies: "1",
    printer: "Brother_QL_820NWB",
    location: printer.location_code,
  })
  const ctrl2 = new AbortController()
  const t2 = setTimeout(() => ctrl2.abort(), 15000)
  try {
    const printResp = await fetch(`${BRIDGE}/print?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: pdfBlob,
      signal: ctrl2.signal,
    })
    if (!printResp.ok) {
      const detail = await printResp.text().catch(() => "")
      throw new Error(`Bridge: ${printResp.status} ${detail || printResp.statusText}`)
    }
    const result = await printResp.json().catch(() => ({ ok: false }))
    if (!result?.ok) throw new Error(result?.error || "Bridge meldet Fehler")
  } finally {
    clearTimeout(t2)
  }
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  label, value, onChange, type = "text", required, hint, mono, readOnly,
}: {
  label: string; value: string | number; onChange: (v: string) => void
  type?: string; required?: boolean; hint?: string; mono?: boolean; readOnly?: boolean
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 4 }}>
        {label}{required && <span style={{ color: C.error }}> *</span>}
      </label>
      {hint && <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{hint}</div>}
      <input
        type={type} value={value} readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box" as const,
          border: `1px solid rgba(0,0,0,0.15)`, borderRadius: 6,
          padding: "7px 10px", fontSize: 13,
          fontFamily: mono ? "monospace" : "inherit",
          background: readOnly ? "rgba(0,0,0,0.03)" : "var(--bg-field, #fff)",
          color: C.text, outline: "none",
        }}
      />
    </div>
  )
}

function CheckField({ label, checked, onChange, hint }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string
}) {
  return (
    <div style={{ marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 8 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2, cursor: "pointer" }} />
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: C.muted }}>{hint}</div>}
      </div>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function PrinterModal({ printer, locations, onClose, onSaved }: {
  printer: Printer | null
  locations: WarehouseLocation[]
  onClose: () => void
  onSaved: (p: Printer) => void
}) {
  const [form, setForm] = useState<PrinterForm>(
    printer ? {
      warehouse_location_id: printer.warehouse_location_id,
      manufacturer: printer.manufacturer,
      model: printer.model,
      ip_address: printer.ip_address,
      port: printer.port,
      label_type: printer.label_type,
      brother_ql_model: printer.brother_ql_model ?? "",
      is_default_for_location: printer.is_default_for_location,
      display_name: printer.display_name ?? "",
      mac_address: printer.mac_address ?? "",
      hostname: printer.hostname ?? "",
      notes: printer.notes ?? "",
      sort_order: printer.sort_order,
    } : { ...EMPTY_FORM }
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (key: keyof PrinterForm) => (value: string | boolean | number) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!form.warehouse_location_id || !form.model.trim() || !form.ip_address.trim()) {
      setError("Standort, Modell und IP-Adresse sind Pflichtfelder.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...form,
        brother_ql_model: form.brother_ql_model.trim() || null,
        display_name: form.display_name.trim() || null,
        mac_address: form.mac_address.trim() || null,
        hostname: form.hostname.trim() || null,
        notes: form.notes.trim() || null,
      }
      const result = printer
        ? await apiFetch<{ printer: Printer }>(`/admin/erp/printers/${printer.id}`, {
            method: "PATCH", body: JSON.stringify(payload),
          })
        : await apiFetch<{ printer: Printer }>("/admin/erp/printers", {
            method: "POST", body: JSON.stringify(payload),
          })
      onSaved(result.printer)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const activeLocations = locations.filter((l) => l.is_active)

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: "var(--bg-base, #fff)", borderRadius: 12, padding: 28, width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.15)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>
          {printer ? "Drucker bearbeiten" : "Neuen Drucker anlegen"}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 4 }}>
            Standort <span style={{ color: C.error }}>*</span>
          </label>
          <select
            value={form.warehouse_location_id}
            onChange={(e) => set("warehouse_location_id")(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box" as const, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "7px 10px", fontSize: 13, background: "var(--bg-field, #fff)", color: C.text }}
          >
            <option value="">— Standort wählen —</option>
            {activeLocations.map((l) => (
              <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
            ))}
          </select>
        </div>

        <Field label="Display-Name" value={form.display_name} onChange={set("display_name")} hint='z.B. "Etiketten-Drucker Alpenstraße"' />
        <Field label="Hersteller" value={form.manufacturer} onChange={set("manufacturer")} />
        <Field label="Modell" value={form.model} onChange={set("model")} required hint='z.B. "QL-820NWB"' />
        <Field label="brother_ql-Modell" value={form.brother_ql_model} onChange={set("brother_ql_model")} hint="Library-Name falls abweichend vom Modell-Feld (meist identisch)" mono />
        <Field label="IP-Adresse" value={form.ip_address} onChange={set("ip_address")} required hint='z.B. "10.1.1.136" oder "192.168.1.124"' mono />
        <Field label="Port" value={form.port} onChange={(v) => set("port")(parseInt(v) || 9100)} type="number" hint="Standard: 9100 (Brother Direct-Print)" />

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 4 }}>Label-Typ</label>
          <select
            value={form.label_type}
            onChange={(e) => set("label_type")(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box" as const, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "7px 10px", fontSize: 13, background: "var(--bg-field, #fff)", color: C.text }}
          >
            {LABEL_TYPES.map((lt) => <option key={lt.value} value={lt.value}>{lt.label}</option>)}
          </select>
        </div>

        <Field label="Hostname" value={form.hostname} onChange={set("hostname")} hint="Bonjour-Hostname, z.B. Brother-QL-820NWB.local (alternativ zur IP, DHCP-stabiler)" mono />
        <Field label="MAC-Adresse" value={form.mac_address} onChange={set("mac_address")} hint="Für DHCP-Reservation-Dokumentation, z.B. aa:bb:cc:dd:ee:ff" mono />
        <Field label="Sort-Order" value={form.sort_order} onChange={(v) => set("sort_order")(parseInt(v) || 0)} type="number" hint="Niedrigere Zahl = weiter oben in Listen" />
        <Field label="Notizen" value={form.notes} onChange={set("notes")} />
        <CheckField
          label="Default-Drucker für diesen Standort"
          checked={form.is_default_for_location}
          onChange={set("is_default_for_location")}
          hint="Wird verwendet wenn kein spezifischer Drucker ausgewählt ist"
        />

        {error && (
          <div style={{ fontSize: 12, color: C.error, background: C.error + "15", border: `1px solid ${C.error}40`, borderRadius: 6, padding: "8px 12px", marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 18px", fontSize: 13, borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", background: "transparent", cursor: "pointer", color: C.text }}>
            Abbrechen
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "8px 18px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "none", background: C.purple, color: "#fff", cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Speichern…" : printer ? "Änderungen speichern" : "Drucker anlegen"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function PrintersPage() {
  useAdminNav()
  const [printers, setPrinters] = useState<Printer[]>([])
  const [locations, setLocations] = useState<WarehouseLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Printer | null | "new">(undefined as any)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const [testPrinting, setTestPrinting] = useState<string | null>(null)

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t) }
  }, [toast])

  const load = async () => {
    setLoading(true)
    try {
      const [pd, ld] = await Promise.all([
        apiFetch<{ printers: Printer[] }>("/admin/erp/printers"),
        apiFetch<{ locations: WarehouseLocation[] }>("/admin/erp/locations"),
      ])
      setPrinters(pd.printers)
      setLocations(ld.locations)
    } catch (e: any) {
      setToast({ message: e.message, type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const handleSaved = (p: Printer) => {
    setPrinters((prev) => {
      const exists = prev.find((x) => x.id === p.id)
      return exists ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...prev]
    })
    setModal(undefined as any)
    setToast({ message: `${p.display_name || p.model} gespeichert.`, type: "success" })
  }

  const handleDeactivate = async (p: Printer) => {
    if (!confirm(`Drucker "${p.display_name || p.model}" deaktivieren?`)) return
    try {
      await apiFetch(`/admin/erp/printers/${p.id}`, { method: "DELETE" })
      setPrinters((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: false } : x)))
      setToast({ message: `${p.display_name || p.model} deaktiviert.`, type: "success" })
    } catch (e: any) {
      setToast({ message: e.message, type: "error" })
    }
  }

  const handleTestPrint = async (p: Printer) => {
    setTestPrinting(p.id)
    try {
      await sendTestPrint(p)
      setToast({ message: `Test-Etikett gesendet an ${p.display_name || p.location_name}.`, type: "success" })
    } catch (e: any) {
      setToast({ message: `Test-Druck fehlgeschlagen: ${e.message}`, type: "error" })
    } finally {
      setTestPrinting(null)
    }
  }

  const active = printers.filter((p) => p.is_active)
  const inactive = printers.filter((p) => !p.is_active)

  const colStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 140px 130px 60px 80px 80px 200px",
    gap: 10, alignItems: "center",
    padding: "10px 16px",
    borderBottom: "1px solid rgba(0,0,0,0.05)",
    fontSize: 13,
  }

  return (
    <PageShell>
      <PageHeader
        title="Drucker"
        subtitle="Netzwerkdrucker pro Lagerstandort verwalten"
        actions={
          <button
            onClick={() => setModal("new")}
            style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, background: C.purple, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
          >
            + Drucker hinzufügen
          </button>
        }
      />

      {/* Info-Hinweis Test-Druck */}
      <div style={{ fontSize: 12, color: C.muted, background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 7, padding: "10px 14px", marginBottom: 20 }}>
        <strong style={{ color: C.text }}>Test-Druck:</strong> Der Button sendet ein Sample-Etikett via der lokalen Bridge auf <em>diesem</em> Mac an den gewählten Drucker. Die Bridge muss laufen und das Netzwerk des Druckers erreichbar sein.
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 2000, background: toast.type === "success" ? C.success : C.error, color: "#fff", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
          {toast.message}
        </div>
      )}

      {loading ? (
        <p style={{ color: C.muted, fontSize: 13 }}>Laden…</p>
      ) : active.length === 0 && inactive.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted, fontSize: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🖨️</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Noch keine Drucker angelegt</div>
          <button onClick={() => setModal("new")} style={{ padding: "9px 20px", fontSize: 13, fontWeight: 600, background: C.purple, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", marginTop: 8 }}>
            + Ersten Drucker anlegen
          </button>
        </div>
      ) : (
        <div style={{ background: `var(--bg-component, ${C.card})`, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, overflow: "hidden" }}>
          {/* Header */}
          <div style={{ ...colStyle, fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase" as const, letterSpacing: "0.06em", background: "rgba(0,0,0,0.02)", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
            <span>Drucker / Standort</span>
            <span>IP-Adresse</span>
            <span>Modell</span>
            <span>Port</span>
            <span>Default</span>
            <span>Status</span>
            <span>Aktionen</span>
          </div>

          {active.map((p) => (
            <div key={p.id} style={colStyle}>
              <div>
                <div style={{ fontWeight: 600 }}>{p.display_name || `${p.manufacturer} ${p.model}`}</div>
                <div style={{ fontSize: 11, color: C.muted }}>
                  <span style={{ fontFamily: "monospace", color: C.gold }}>{p.location_code}</span>
                  {" · "}{p.location_name}
                </div>
              </div>
              <span style={{ fontFamily: "monospace", fontSize: 12 }}>{p.ip_address}</span>
              <span style={{ fontSize: 12 }}>{p.model}</span>
              <span style={{ fontSize: 12, color: C.muted }}>{p.port}</span>
              <span>
                {p.is_default_for_location
                  ? <span style={{ fontSize: 11, fontWeight: 700, color: C.success }}>● Default</span>
                  : <span style={{ fontSize: 11, color: C.muted }}>—</span>
                }
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.success }}>Aktiv</span>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
                <button
                  onClick={() => handleTestPrint(p)}
                  disabled={testPrinting === p.id}
                  style={{ fontSize: 11, padding: "4px 9px", borderRadius: 5, border: `1px solid ${C.gold}60`, background: testPrinting === p.id ? "rgba(0,0,0,0.04)" : "transparent", cursor: testPrinting === p.id ? "default" : "pointer", color: C.gold, opacity: testPrinting === p.id ? 0.6 : 1 }}
                >
                  {testPrinting === p.id ? "…" : "Test-Druck"}
                </button>
                <button
                  onClick={() => setModal(p)}
                  style={{ fontSize: 11, padding: "4px 9px", borderRadius: 5, border: "1px solid rgba(0,0,0,0.15)", background: "transparent", cursor: "pointer", color: C.text }}
                >
                  Bearbeiten
                </button>
                <button
                  onClick={() => handleDeactivate(p)}
                  style={{ fontSize: 11, padding: "4px 9px", borderRadius: 5, border: `1px solid ${C.error}40`, background: "transparent", cursor: "pointer", color: C.error }}
                >
                  Deaktivieren
                </button>
              </div>
            </div>
          ))}

          {inactive.length > 0 && (
            <>
              <div style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase" as const, letterSpacing: "0.06em", background: "rgba(0,0,0,0.02)", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                Inaktiv
              </div>
              {inactive.map((p) => (
                <div key={p.id} style={{ ...colStyle, opacity: 0.5 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.display_name || `${p.manufacturer} ${p.model}`}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{p.location_code} · {p.location_name}</div>
                  </div>
                  <span style={{ fontFamily: "monospace", fontSize: 12 }}>{p.ip_address}</span>
                  <span style={{ fontSize: 12 }}>{p.model}</span>
                  <span style={{ fontSize: 12, color: C.muted }}>{p.port}</span>
                  <span style={{ fontSize: 11, color: C.muted }}>—</span>
                  <span style={{ fontSize: 11, color: C.muted }}>Inaktiv</span>
                  <button onClick={() => setModal(p)} style={{ fontSize: 11, padding: "4px 9px", borderRadius: 5, border: "1px solid rgba(0,0,0,0.15)", background: "transparent", cursor: "pointer", color: C.text }}>
                    Bearbeiten
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {modal !== undefined && (
        <PrinterModal
          printer={modal === "new" ? null : modal}
          locations={locations}
          onClose={() => setModal(undefined as any)}
          onSaved={handleSaved}
        />
      )}
    </PageShell>
  )
}

export default PrintersPage
