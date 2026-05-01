import { useEffect, useState } from "react"
import { useAdminNav } from "../../../components/admin-nav"
import { C } from "../../../components/admin-tokens"
import { PageHeader, PageShell } from "../../../components/admin-layout"
import { Badge, Modal, Toast, Btn } from "../../../components/admin-ui"

// ─── Types ───────────────────────────────────────────────────────────────────

interface WarehouseLocation {
  id: string
  code: string
  name: string
  is_active: boolean
}

interface Bridge {
  id: string
  bridge_uuid: string
  person_label: string
  display_name: string
  is_mobile: boolean
  is_active: boolean
  hostname: string | null
  platform: string | null
  bridge_version: string | null
  last_known_ip: string | null
  last_seen_at: string | null
  last_print_at: string | null
  last_location_used: string | null
  notes: string | null
  paired_at: string
  default_location_id: string | null
  default_location_code: string | null
  default_location_name: string | null
}

type OnlineStatus = "online" | "recent" | "stale" | "offline" | "never"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOnlineStatus(lastSeenAt: string | null): OnlineStatus {
  if (!lastSeenAt) return "never"
  const diffMs = Date.now() - new Date(lastSeenAt).getTime()
  const diffMin = diffMs / 60_000
  if (diffMin < 5) return "online"
  if (diffMin < 60 * 24) return "recent"
  if (diffMin < 60 * 24 * 7) return "stale"
  return "offline"
}

const STATUS_COLORS: Record<OnlineStatus, string> = {
  online:  C.success,
  recent:  C.gold,
  stale:   C.warning,
  offline: C.error,
  never:   C.muted,
}

const STATUS_LABELS: Record<OnlineStatus, string> = {
  online:  "Online",
  recent:  "Recent",
  stale:   "Stale",
  offline: "Offline",
  never:   "Never seen",
}

function formatAgo(ts: string | null): string {
  if (!ts) return "—"
  const diffMs = Date.now() - new Date(ts).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 2) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  return `${diffD}d ago`
}

// ─── Status Dot ──────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: OnlineStatus }) {
  return (
    <span style={{
      display: "inline-block",
      width: 8, height: 8,
      borderRadius: "50%",
      background: STATUS_COLORS[status],
      flexShrink: 0,
      marginTop: 1,
    }} />
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditForm {
  person_label: string
  display_name: string
  is_mobile: boolean
  default_location_id: string
  notes: string
  is_active: boolean
}

function EditBridgeModal({
  bridge,
  locations,
  onClose,
  onSaved,
}: {
  bridge: Bridge
  locations: WarehouseLocation[]
  onClose: () => void
  onSaved: (updated: Bridge) => void
}) {
  const [form, setForm] = useState<EditForm>({
    person_label: bridge.person_label,
    display_name: bridge.display_name,
    is_mobile: bridge.is_mobile,
    default_location_id: bridge.default_location_id ?? "",
    notes: bridge.notes ?? "",
    is_active: bridge.is_active,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof EditForm>(k: K, v: EditForm[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  async function handleSave() {
    if (!form.person_label.trim()) { setError("Person Label is required"); return }
    if (!form.display_name.trim()) { setError("Display Name is required"); return }
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        person_label: form.person_label.trim(),
        display_name: form.display_name.trim(),
        is_mobile: form.is_mobile,
        default_location_id: form.default_location_id || null,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
      }
      const r = await fetch(`/admin/erp/bridges/${bridge.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.message || "Save failed")
      onSaved(d.bridge)
    } catch (e: any) {
      setError(e.message || "Unknown error")
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "7px 10px", borderRadius: 6,
    border: `1px solid ${C.border}`, background: C.card,
    color: C.text, fontSize: 13, boxSizing: "border-box",
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: C.muted,
    textTransform: "uppercase" as const, letterSpacing: "0.05em",
    display: "block", marginBottom: 4,
  }

  return (
    <Modal title={`Edit Bridge — ${bridge.display_name}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Person Label *</label>
            <input
              style={inputStyle}
              value={form.person_label}
              onChange={(e) => set("person_label", e.target.value)}
              placeholder="frank"
            />
          </div>
          <div>
            <label style={labelStyle}>Display Name *</label>
            <input
              style={inputStyle}
              value={form.display_name}
              onChange={(e) => set("display_name", e.target.value)}
              placeholder="Frank Mac Studio"
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Default Location</label>
          <select
            style={{ ...inputStyle, cursor: "pointer" }}
            value={form.default_location_id}
            onChange={(e) => set("default_location_id", e.target.value)}
          >
            <option value="">— none —</option>
            {locations.filter((l) => l.is_active).map((l) => (
              <option key={l.id} value={l.id}>{l.code} — {l.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Optional notes"
          />
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.is_mobile}
              onChange={(e) => set("is_mobile", e.target.checked)}
            />
            <span style={{ color: C.text }}>Mobile (MacBook)</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
            />
            <span style={{ color: C.text }}>Active</span>
          </label>
        </div>

        {error && (
          <div style={{ color: C.error, fontSize: 12, padding: "6px 10px", background: C.error + "15", borderRadius: 6 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
          <Btn label="Cancel" variant="ghost" onClick={onClose} />
          <Btn label={saving ? "Saving…" : "Save"} variant="primary" onClick={handleSave} />
        </div>
      </div>
    </Modal>
  )
}

// ─── Bridge Row ───────────────────────────────────────────────────────────────

function BridgeRow({
  bridge,
  onEdit,
  onDeactivate,
}: {
  bridge: Bridge
  onEdit: (b: Bridge) => void
  onDeactivate: (b: Bridge) => void
}) {
  const status = getOnlineStatus(bridge.last_seen_at)

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "200px 160px 130px 120px 110px 1fr 160px",
      alignItems: "center",
      gap: 8,
      padding: "10px 16px",
      borderBottom: `1px solid ${C.border}`,
      opacity: bridge.is_active ? 1 : 0.5,
    }}>

      {/* Person + display name */}
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{bridge.display_name}</div>
        <div style={{ fontSize: 11, color: C.muted }}>{bridge.person_label}</div>
      </div>

      {/* Online status */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <StatusDot status={status} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLORS[status] }}>
            {STATUS_LABELS[status]}
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>{formatAgo(bridge.last_seen_at)}</div>
        </div>
      </div>

      {/* Type */}
      <div>
        <Badge
          label={bridge.is_mobile ? "MacBook" : "Mac Studio"}
          color={bridge.is_mobile ? C.purple : C.blue}
        />
      </div>

      {/* Default location */}
      <div style={{ fontSize: 12, color: C.muted }}>
        {bridge.default_location_code
          ? <span style={{ color: C.text }}>{bridge.default_location_code}</span>
          : "—"}
      </div>

      {/* Last print */}
      <div style={{ fontSize: 11, color: C.muted }}>
        {bridge.last_print_at ? formatAgo(bridge.last_print_at) : "—"}
      </div>

      {/* System info */}
      <div>
        <div style={{ fontSize: 11, color: C.muted }}>
          {bridge.hostname || "—"}
          {bridge.platform ? ` · ${bridge.platform}` : ""}
          {bridge.bridge_version ? ` · v${bridge.bridge_version}` : ""}
        </div>
        {bridge.last_known_ip && (
          <div style={{ fontSize: 11, color: C.muted }}>{bridge.last_known_ip}</div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          disabled
          title="Verfügbar in Stage C / Phase 2.5"
          style={{
            padding: "5px 10px", borderRadius: 5, fontSize: 11, fontWeight: 600,
            border: `1px solid ${C.border}`, background: "transparent",
            color: C.muted, cursor: "not-allowed", opacity: 0.55,
          }}
        >
          Pair Code
        </button>
        <button
          onClick={() => onEdit(bridge)}
          style={{
            padding: "5px 10px", borderRadius: 5, fontSize: 11, fontWeight: 600,
            border: `1px solid ${C.border}`, background: "transparent",
            color: C.text, cursor: "pointer",
          }}
        >
          Edit
        </button>
        {bridge.is_active && (
          <button
            onClick={() => onDeactivate(bridge)}
            style={{
              padding: "5px 10px", borderRadius: 5, fontSize: 11, fontWeight: 600,
              border: `1px solid ${C.error}40`, background: "transparent",
              color: C.error, cursor: "pointer",
            }}
          >
            Disable
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Header Row ───────────────────────────────────────────────────────────────

function TableHeader() {
  const col: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: C.muted,
    textTransform: "uppercase", letterSpacing: "0.07em",
  }
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "200px 160px 130px 120px 110px 1fr 160px",
      gap: 8,
      padding: "8px 16px",
      borderBottom: `1px solid ${C.border}`,
    }}>
      <span style={col}>Mac / Person</span>
      <span style={col}>Status</span>
      <span style={col}>Type</span>
      <span style={col}>Default Loc</span>
      <span style={col}>Last Print</span>
      <span style={col}>System</span>
      <span style={col} />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BridgesPage() {
  useAdminNav()
  const [bridges, setBridges] = useState<Bridge[]>([])
  const [locations, setLocations] = useState<WarehouseLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Bridge | null>(null)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const [deactivating, setDeactivating] = useState<string | null>(null)

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function load() {
    try {
      const [br, lo] = await Promise.all([
        fetch("/admin/erp/bridges").then((r) => r.json()),
        fetch("/admin/erp/locations").then((r) => r.json()),
      ])
      setBridges(br.bridges ?? [])
      setLocations(lo.locations ?? [])
    } catch {
      showToast("Failed to load data", "error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDeactivate(bridge: Bridge) {
    if (!confirm(`Disable bridge "${bridge.display_name}"? The Bridge process on that Mac will lose its registration.`)) return
    setDeactivating(bridge.id)
    try {
      const r = await fetch(`/admin/erp/bridges/${bridge.id}`, { method: "DELETE" })
      if (!r.ok) {
        const d = await r.json()
        throw new Error(d.message || "Failed to disable")
      }
      setBridges((prev) => prev.map((b) => b.id === bridge.id ? { ...b, is_active: false } : b))
      showToast(`${bridge.display_name} disabled`)
    } catch (e: any) {
      showToast(e.message || "Failed to disable bridge", "error")
    } finally {
      setDeactivating(null)
    }
  }

  function handleSaved(updated: Bridge) {
    setBridges((prev) => prev.map((b) => b.id === updated.id ? updated : b))
    setEditing(null)
    showToast("Bridge saved")
  }

  const activeBridges = bridges.filter((b) => b.is_active)
  const inactiveBridges = bridges.filter((b) => !b.is_active)

  return (
    <PageShell>
      <PageHeader
        title="Print Bridges"
        subtitle="Registered Mac Bridge hosts — each runs the Print Bridge agent that routes jobs to local printers"
      />

      {/* Info banner */}
      <div style={{
        background: C.blue + "15",
        border: `1px solid ${C.blue}40`,
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
        color: C.text,
        marginBottom: 20,
        lineHeight: 1.5,
      }}>
        <strong>Stage A — Pre-Paired Mode.</strong> Bridges are pre-registered. Token pairing (Stage C) will allow onboarding new Macs via a one-time pairing code — button is disabled until then.
        Online status requires the Bridge to send heartbeats (Stage B+).
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 13 }}>Loading…</div>
      ) : bridges.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 13 }}>
          No bridges registered yet. Bridges are added via the pairing flow (Stage C).
        </div>
      ) : (
        <>
          {/* Active bridges */}
          <div style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            overflow: "hidden",
            marginBottom: 20,
          }}>
            <div style={{
              padding: "10px 16px 8px",
              borderBottom: `1px solid ${C.border}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Active — {activeBridges.length}
              </div>
              <button
                disabled
                title="Verfügbar in Stage C / Phase 2.5"
                style={{
                  padding: "5px 12px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                  border: `1px dashed ${C.border}`, background: "transparent",
                  color: C.muted, cursor: "not-allowed",
                }}
              >
                + Pair New Mac (Stage C)
              </button>
            </div>
            <TableHeader />
            {activeBridges.map((b) => (
              <BridgeRow
                key={b.id}
                bridge={b}
                onEdit={setEditing}
                onDeactivate={deactivating ? () => {} : handleDeactivate}
              />
            ))}
          </div>

          {/* Inactive bridges */}
          {inactiveBridges.length > 0 && (
            <div style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              overflow: "hidden",
            }}>
              <div style={{
                padding: "10px 16px 8px",
                borderBottom: `1px solid ${C.border}`,
                fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em",
              }}>
                Inactive — {inactiveBridges.length}
              </div>
              <TableHeader />
              {inactiveBridges.map((b) => (
                <BridgeRow
                  key={b.id}
                  bridge={b}
                  onEdit={setEditing}
                  onDeactivate={() => {}}
                />
              ))}
            </div>
          )}
        </>
      )}

      {editing && (
        <EditBridgeModal
          bridge={editing}
          locations={locations}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </PageShell>
  )
}
