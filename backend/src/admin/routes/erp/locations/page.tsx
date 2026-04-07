import { useEffect, useState } from "react"
import { useAdminNav } from "../../../components/admin-nav"
import { C } from "../../../components/admin-tokens"
import { PageHeader, PageShell } from "../../../components/admin-layout"


// ─── Types ────────────────────────────────────────────────────────────────────

interface WarehouseLocation {
  id: string
  code: string
  name: string
  description: string | null
  address: string | null
  contact_name: string | null
  contact_email: string | null
  is_active: boolean
  is_default: boolean
  sort_order: number
  notes: string | null
  created_at: string
  updated_at: string
}

type FormData = Omit<WarehouseLocation, "id" | "created_at" | "updated_at">

const EMPTY_FORM: FormData = {
  code: "",
  name: "",
  description: "",
  address: "",
  contact_name: "",
  contact_email: "",
  is_active: true,
  is_default: false,
  sort_order: 0,
  notes: "",
}

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

// ─── Field Row ────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  hint,
  mono,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  type?: string
  required?: boolean
  hint?: string
  mono?: boolean
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 4 }}>
        {label}{required && <span style={{ color: C.error }}> *</span>}
      </label>
      {hint && <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{hint}</div>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box",
          border: `1px solid rgba(0,0,0,0.15)`, borderRadius: 6,
          padding: "7px 10px", fontSize: 13,
          fontFamily: mono ? "monospace" : "inherit",
          background: "var(--bg-field, #fff)", color: C.text,
          outline: "none",
        }}
      />
    </div>
  )
}

function CheckField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <div style={{ marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 8 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2, cursor: "pointer" }}
      />
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: C.muted }}>{hint}</div>}
      </div>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function LocationModal({
  location,
  onClose,
  onSaved,
}: {
  location: WarehouseLocation | null  // null = create
  onClose: () => void
  onSaved: (loc: WarehouseLocation) => void
}) {
  const [form, setForm] = useState<FormData>(
    location
      ? { ...location }
      : { ...EMPTY_FORM }
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof FormData) => (value: string | boolean | number) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and Name are required.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = location
        ? await apiFetch<{ location: WarehouseLocation }>(`/admin/erp/locations/${location.id}`, {
            method: "PATCH",
            body: JSON.stringify(form),
          })
        : await apiFetch<{ location: WarehouseLocation }>("/admin/erp/locations", {
            method: "POST",
            body: JSON.stringify(form),
          })
      onSaved(result.location)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: "var(--bg-base, #fff)", borderRadius: 12,
        padding: 28, width: "100%", maxWidth: 560,
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>
          {location ? "Edit Location" : "Add Warehouse Location"}
        </div>

        <Field
          label="Code"
          value={form.code}
          onChange={set("code")}
          required
          hint="Short uppercase identifier, e.g. FRANK_MAIN. Unique, cannot be changed later easily."
          mono
        />
        <Field label="Name" value={form.name} onChange={set("name")} required />
        <Field label="Description" value={form.description ?? ""} onChange={set("description")} />
        <Field label="Address" value={form.address ?? ""} onChange={set("address")} />
        <Field label="Contact Name" value={form.contact_name ?? ""} onChange={set("contact_name")} />
        <Field label="Contact Email" value={form.contact_email ?? ""} onChange={set("contact_email")} type="email" />
        <Field
          label="Sort Order"
          value={form.sort_order}
          onChange={(v) => set("sort_order")(parseInt(v) || 0)}
          type="number"
          hint="Lower = listed first"
        />
        <Field label="Notes" value={form.notes ?? ""} onChange={set("notes")} />
        <CheckField
          label="Set as default location"
          checked={form.is_default}
          onChange={set("is_default")}
          hint="Only one location can be the default. This will clear the current default."
        />

        {error && (
          <div style={{
            fontSize: 12, color: C.error,
            background: C.error + "15", border: `1px solid ${C.error}40`,
            borderRadius: 6, padding: "8px 12px", marginBottom: 14,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 18px", fontSize: 13, borderRadius: 6,
              border: "1px solid rgba(0,0,0,0.15)", background: "transparent",
              cursor: "pointer", color: C.text,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 18px", fontSize: 13, fontWeight: 600, borderRadius: 6,
              border: "none", background: C.purple, color: "#fff",
              cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : location ? "Save Changes" : "Create Location"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function WarehouseLocationsPage() {
  useAdminNav()
  const [locations, setLocations] = useState<WarehouseLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [modalTarget, setModalTarget] = useState<WarehouseLocation | null | "new">(undefined as any)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  useEffect(() => {
    loadLocations()
  }, [])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [toast])

  const loadLocations = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ locations: WarehouseLocation[] }>("/admin/erp/locations")
      setLocations(data.locations)
    } catch (e: any) {
      setToast({ message: e.message, type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const handleSaved = (loc: WarehouseLocation) => {
    setLocations((prev) => {
      // If new default, clear others
      let updated = loc.is_default
        ? prev.map((l) => ({ ...l, is_default: l.id === loc.id ? true : false }))
        : prev
      const exists = updated.find((l) => l.id === loc.id)
      updated = exists
        ? updated.map((l) => (l.id === loc.id ? loc : l))
        : [loc, ...updated]
      return updated
    })
    setModalTarget(undefined as any)
    setToast({ message: loc.name + " saved.", type: "success" })
  }

  const handleSetDefault = async (loc: WarehouseLocation) => {
    try {
      const result = await apiFetch<{ location: WarehouseLocation }>(
        `/admin/erp/locations/${loc.id}`,
        { method: "PATCH", body: JSON.stringify({ is_default: true }) }
      )
      setLocations((prev) =>
        prev.map((l) => ({ ...l, is_default: l.id === result.location.id }))
      )
      setToast({ message: `${loc.name} set as default.`, type: "success" })
    } catch (e: any) {
      setToast({ message: e.message, type: "error" })
    }
  }

  const handleDeactivate = async (loc: WarehouseLocation) => {
    if (!confirm(`Deactivate "${loc.name}"? It will no longer appear in selection lists.`)) return
    try {
      await apiFetch(`/admin/erp/locations/${loc.id}`, { method: "DELETE" })
      setLocations((prev) =>
        prev.map((l) => (l.id === loc.id ? { ...l, is_active: false } : l))
      )
      setToast({ message: `${loc.name} deactivated.`, type: "success" })
    } catch (e: any) {
      setToast({ message: e.message, type: "error" })
    }
  }

  const active = locations.filter((l) => l.is_active)
  const inactive = locations.filter((l) => !l.is_active)

  const rowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "100px 1fr 1fr 80px 80px 140px",
    gap: 12, alignItems: "center",
    padding: "10px 16px",
    borderBottom: "1px solid rgba(0,0,0,0.05)",
    fontSize: 13,
  }

  return (
    <PageShell>
      <PageHeader
        title="Warehouse Locations"
        subtitle="Physical storage locations for inventory management"
        actions={
          <button
            onClick={() => setModalTarget("new")}
            style={{
              padding: "8px 16px", fontSize: 13, fontWeight: 600,
              background: C.purple, color: "#fff",
              border: "none", borderRadius: 6, cursor: "pointer",
            }}
          >
            + Add Location
          </button>
        }
      />

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 2000,
          background: toast.type === "success" ? C.success : C.error,
          color: "#fff", borderRadius: 8, padding: "10px 18px",
          fontSize: 13, fontWeight: 600,
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
        }}>
          {toast.message}
        </div>
      )}

      {loading ? (
        <p style={{ color: C.muted, fontSize: 13 }}>Loading…</p>
      ) : active.length === 0 && inactive.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "60px 20px",
          color: C.muted, fontSize: 14,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No warehouse locations yet</div>
          <div style={{ fontSize: 12, marginBottom: 20 }}>
            Add your first storage location to prepare for inventory tracking.
          </div>
          <button
            onClick={() => setModalTarget("new")}
            style={{
              padding: "9px 20px", fontSize: 13, fontWeight: 600,
              background: C.purple, color: "#fff",
              border: "none", borderRadius: 6, cursor: "pointer",
            }}
          >
            + Add First Location
          </button>
        </div>
      ) : (
        <div style={{
          background: `var(--bg-component, ${C.card})`,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 10, overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            ...rowStyle,
            fontSize: 11, fontWeight: 700, color: C.muted,
            textTransform: "uppercase", letterSpacing: "0.06em",
            background: "rgba(0,0,0,0.02)", borderBottom: "1px solid rgba(0,0,0,0.08)",
          }}>
            <span>Code</span>
            <span>Name / Description</span>
            <span>Address / Contact</span>
            <span>Default</span>
            <span>Active</span>
            <span>Actions</span>
          </div>

          {/* Active rows */}
          {active.map((loc) => (
            <div key={loc.id} style={rowStyle}>
              <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: C.gold }}>
                {loc.code}
              </span>
              <div>
                <div style={{ fontWeight: 600 }}>{loc.name}</div>
                {loc.description && (
                  <div style={{ fontSize: 11, color: C.muted }}>{loc.description}</div>
                )}
              </div>
              <div style={{ fontSize: 12 }}>
                {loc.address && <div>{loc.address}</div>}
                {loc.contact_name && (
                  <div style={{ color: C.muted }}>
                    {loc.contact_name}
                    {loc.contact_email && ` · ${loc.contact_email}`}
                  </div>
                )}
              </div>
              <span>
                {loc.is_default ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.success }}>● Default</span>
                ) : (
                  <span style={{ fontSize: 11, color: C.muted }}>—</span>
                )}
              </span>
              <span>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.success }}>Active</span>
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => setModalTarget(loc)}
                  style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 5,
                    border: "1px solid rgba(0,0,0,0.15)", background: "transparent",
                    cursor: "pointer", color: C.text,
                  }}
                >
                  Edit
                </button>
                {!loc.is_default && (
                  <button
                    onClick={() => handleSetDefault(loc)}
                    style={{
                      fontSize: 11, padding: "4px 10px", borderRadius: 5,
                      border: "1px solid rgba(0,0,0,0.15)", background: "transparent",
                      cursor: "pointer", color: C.muted,
                    }}
                  >
                    Set Default
                  </button>
                )}
                {!loc.is_default && (
                  <button
                    onClick={() => handleDeactivate(loc)}
                    style={{
                      fontSize: 11, padding: "4px 10px", borderRadius: 5,
                      border: `1px solid ${C.error}40`, background: "transparent",
                      cursor: "pointer", color: C.error,
                    }}
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Inactive section */}
          {inactive.length > 0 && (
            <>
              <div style={{
                padding: "8px 16px",
                fontSize: 11, fontWeight: 700, color: C.muted,
                textTransform: "uppercase", letterSpacing: "0.06em",
                background: "rgba(0,0,0,0.02)",
                borderTop: "1px solid rgba(0,0,0,0.06)",
              }}>
                Inactive
              </div>
              {inactive.map((loc) => (
                <div key={loc.id} style={{ ...rowStyle, opacity: 0.5 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{loc.code}</span>
                  <div style={{ fontWeight: 600 }}>{loc.name}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{loc.address ?? "—"}</div>
                  <span style={{ fontSize: 11, color: C.muted }}>—</span>
                  <span style={{ fontSize: 11, color: C.muted }}>Inactive</span>
                  <button
                    onClick={() => setModalTarget(loc)}
                    style={{
                      fontSize: 11, padding: "4px 10px", borderRadius: 5,
                      border: "1px solid rgba(0,0,0,0.15)", background: "transparent",
                      cursor: "pointer", color: C.text,
                    }}
                  >
                    Edit
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Modal */}
      {modalTarget !== undefined && (
        <LocationModal
          location={modalTarget === "new" ? null : modalTarget}
          onClose={() => setModalTarget(undefined as any)}
          onSaved={handleSaved}
        />
      )}
    </PageShell>
  )
}

export default WarehouseLocationsPage
