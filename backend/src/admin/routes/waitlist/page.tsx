import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Component, useEffect, useState, useCallback, useRef } from "react"
import { useAdminNav } from "../../components/admin-nav"

// ── Error Boundary ───────────────────────────────────────────────────────────

class ErrorBoundary extends Component<{children: React.ReactNode},{error:string|null}> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e.message || String(e) } }
  render() {
    if (this.state.error) return <div style={{padding:"32px",color:"#ef4444",fontFamily:"monospace",fontSize:"13px"}}><b>Render Error:</b> {this.state.error}</div>
    return this.props.children
  }
}

export const config = defineRouteConfig({
  label: "Waitlist",
})

// ── Types ────────────────────────────────────────────────────────────────────

interface WaitlistApplication {
  id: string
  email: string
  name: string | null
  country: string | null
  genres: string[] | null
  buy_channels: string[] | null
  buy_volume: string | null
  referrer_info: string | null
  ref_code: string
  referred_by: string | null
  status: "pending" | "approved" | "invited" | "registered" | "rejected"
  wave: number | null
  source: string | null
  admin_notes: string | null
  created_at: string
  approved_at: string | null
  invited_at: string | null
  registered_at: string | null
}

interface InviteToken {
  id: string
  token: string
  token_display: string
  application_id: string | null
  email: string
  issued_by: string
  issued_at: string
  expires_at: string | null
  used_at: string | null
  used_ip: string | null
  status: "active" | "used" | "expired" | "revoked"
}

interface WaitlistStats {
  pending: number
  approved: number
  invited: number
  registered: number
  rejected: number
}

// ── Colors ───────────────────────────────────────────────────────────────────

const C = {
  text: "#d1d5db",
  muted: "#6b7280",
  gold: "#b8860b",
  success: "#22c55e",
  danger: "#dc2626",
  warning: "#eab308",
  border: "rgba(255,255,255,0.1)",
  bg: "#1c1917",
  bgCard: "#292524",
  bgHover: "#3a3532",
  blue: "#3b82f6",
  purple: "#a855f7",
}

// ── Status Badge Config ──────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; color: string; border: string }> = {
  pending:    { bg: "rgba(184,134,11,0.2)", color: "#eab308", border: "rgba(184,134,11,0.4)" },
  approved:   { bg: "rgba(59,130,246,0.2)", color: "#60a5fa", border: "rgba(59,130,246,0.4)" },
  invited:    { bg: "rgba(168,85,247,0.2)", color: "#c084fc", border: "rgba(168,85,247,0.4)" },
  registered: { bg: "rgba(34,197,94,0.2)",  color: "#4ade80", border: "rgba(34,197,94,0.4)" },
  rejected:   { bg: "rgba(220,38,38,0.2)",  color: "#f87171", border: "rgba(220,38,38,0.4)" },
  active:     { bg: "rgba(34,197,94,0.2)",  color: "#4ade80", border: "rgba(34,197,94,0.4)" },
  used:       { bg: "rgba(107,114,128,0.2)", color: "#9ca3af", border: "rgba(107,114,128,0.4)" },
  expired:    { bg: "rgba(234,179,8,0.2)",  color: "#eab308", border: "rgba(234,179,8,0.4)" },
  revoked:    { bg: "rgba(220,38,38,0.2)",  color: "#f87171", border: "rgba(220,38,38,0.4)" },
}

function Badge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.pending
  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 600,
      padding: "2px 8px", borderRadius: 4,
      backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}`,
      textTransform: "capitalize",
    }}>
      {status}
    </span>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function fmtDateTime(d: string | null) {
  if (!d) return "—"
  const dt = new Date(d)
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

// ── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div style={{
      position: "fixed", top: 16, right: 16, zIndex: 10000,
      padding: "12px 20px", borderRadius: 8,
      backgroundColor: type === "success" ? "rgba(34,197,94,0.15)" : "rgba(220,38,38,0.15)",
      border: `1px solid ${type === "success" ? "rgba(34,197,94,0.4)" : "rgba(220,38,38,0.4)"}`,
      color: type === "success" ? "#4ade80" : "#f87171",
      fontSize: 13, fontWeight: 500, maxWidth: 400,
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    }}>
      {message}
    </div>
  )
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{
      flex: "1 1 0", minWidth: 120, padding: "16px 20px",
      backgroundColor: C.bgCard, borderRadius: 8,
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>
        {count}
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

function WaitlistPage() {
  useAdminNav()

  // State
  const [tab, setTab] = useState<"applications" | "tokens">("applications")
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  // Applications state
  const [apps, setApps] = useState<WaitlistApplication[]>([])
  const [appCount, setAppCount] = useState(0)
  const [stats, setStats] = useState<WaitlistStats>({ pending: 0, approved: 0, invited: 0, registered: 0, rejected: 0 })
  const [appStatus, setAppStatus] = useState("")
  const [appSearch, setAppSearch] = useState("")
  const [appOffset, setAppOffset] = useState(0)
  const [appLoading, setAppLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [bulkLoading, setBulkLoading] = useState(false)
  const appSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Tokens state
  const [tokens, setTokens] = useState<InviteToken[]>([])
  const [tokenCount, setTokenCount] = useState(0)
  const [tokenStatus, setTokenStatus] = useState("")
  const [tokenSearch, setTokenSearch] = useState("")
  const [tokenOffset, setTokenOffset] = useState(0)
  const [tokenLoading, setTokenLoading] = useState(false)
  const tokenSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const LIMIT = 50

  // ── Fetch Applications ─────────────────────────────────────────────────────

  const fetchApps = useCallback(async () => {
    setAppLoading(true)
    try {
      const params = new URLSearchParams()
      if (appStatus) params.set("status", appStatus)
      if (appSearch) params.set("q", appSearch)
      params.set("sort", "created_at:desc")
      params.set("limit", String(LIMIT))
      params.set("offset", String(appOffset))

      const res = await fetch(`/admin/waitlist?${params}`, { credentials: "include" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setApps(data.applications || [])
      setAppCount(data.count || 0)
      if (data.stats) setStats(data.stats)
    } catch (e: any) {
      setToast({ message: `Failed to load applications: ${e.message}`, type: "error" })
    } finally {
      setAppLoading(false)
    }
  }, [appStatus, appSearch, appOffset])

  // ── Fetch Tokens ───────────────────────────────────────────────────────────

  const fetchTokens = useCallback(async () => {
    setTokenLoading(true)
    try {
      const params = new URLSearchParams()
      if (tokenStatus) params.set("status", tokenStatus)
      if (tokenSearch) params.set("q", tokenSearch)
      params.set("limit", String(LIMIT))
      params.set("offset", String(tokenOffset))

      const res = await fetch(`/admin/invite-tokens?${params}`, { credentials: "include" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setTokens(data.tokens || [])
      setTokenCount(data.count || 0)
    } catch (e: any) {
      setToast({ message: `Failed to load tokens: ${e.message}`, type: "error" })
    } finally {
      setTokenLoading(false)
    }
  }, [tokenStatus, tokenSearch, tokenOffset])

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => { fetchApps() }, [fetchApps])
  useEffect(() => { if (tab === "tokens") fetchTokens() }, [tab, fetchTokens])

  // ── Application Actions ────────────────────────────────────────────────────

  const doAppAction = async (id: string, action: string, extra?: Record<string, any>) => {
    const key = `${id}-${action}`
    setActionLoading((prev) => ({ ...prev, [key]: true }))
    try {
      const res = await fetch(`/admin/waitlist/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || `HTTP ${res.status}`)
      }
      setToast({ message: `${action.charAt(0).toUpperCase() + action.slice(1)} successful`, type: "success" })
      fetchApps()
    } catch (e: any) {
      setToast({ message: `Action failed: ${e.message}`, type: "error" })
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  const deleteApp = async (id: string) => {
    if (!confirm("Delete this application permanently?")) return
    setActionLoading((prev) => ({ ...prev, [`${id}-delete`]: true }))
    try {
      const res = await fetch(`/admin/waitlist/${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setToast({ message: "Application deleted", type: "success" })
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next })
      fetchApps()
    } catch (e: any) {
      setToast({ message: `Delete failed: ${e.message}`, type: "error" })
    } finally {
      setActionLoading((prev) => ({ ...prev, [`${id}-delete`]: false }))
    }
  }

  const bulkApproveInvite = async () => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    try {
      const res = await fetch("/admin/waitlist", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setToast({
        message: `${data.invited || 0} application(s) approved & invited${data.errors?.length ? ` (${data.errors.length} errors)` : ""}`,
        type: data.errors?.length ? "error" : "success",
      })
      setSelectedIds(new Set())
      fetchApps()
    } catch (e: any) {
      setToast({ message: `Bulk action failed: ${e.message}`, type: "error" })
    } finally {
      setBulkLoading(false)
    }
  }

  // ── Token Actions ──────────────────────────────────────────────────────────

  const revokeToken = async (id: string) => {
    setActionLoading((prev) => ({ ...prev, [`${id}-revoke`]: true }))
    try {
      const res = await fetch(`/admin/invite-tokens/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setToast({ message: "Token revoked", type: "success" })
      fetchTokens()
    } catch (e: any) {
      setToast({ message: `Revoke failed: ${e.message}`, type: "error" })
    } finally {
      setActionLoading((prev) => ({ ...prev, [`${id}-revoke`]: false }))
    }
  }

  // ── Checkbox helpers ───────────────────────────────────────────────────────

  const pendingApps = apps.filter((a) => a.status === "pending" || a.status === "approved")
  const allSelectableSelected = pendingApps.length > 0 && pendingApps.every((a) => selectedIds.has(a.id))

  const toggleAll = () => {
    if (allSelectableSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pendingApps.map((a) => a.id)))
    }
  }

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Search with debounce ───────────────────────────────────────────────────

  const onAppSearchChange = (val: string) => {
    setAppSearch(val)
    setAppOffset(0)
    if (appSearchTimer.current) clearTimeout(appSearchTimer.current)
    appSearchTimer.current = setTimeout(() => fetchApps(), 300)
  }

  const onTokenSearchChange = (val: string) => {
    setTokenSearch(val)
    setTokenOffset(0)
    if (tokenSearchTimer.current) clearTimeout(tokenSearchTimer.current)
    tokenSearchTimer.current = setTimeout(() => fetchTokens(), 300)
  }

  // ── Shared Styles ──────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px", fontSize: 13, borderRadius: 6,
    border: `1px solid ${C.border}`, backgroundColor: C.bg,
    color: C.text, outline: "none", width: 260,
  }

  const btnStyle = (active?: boolean): React.CSSProperties => ({
    padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer",
    border: `1px solid ${active ? C.gold : C.border}`,
    backgroundColor: active ? "rgba(184,134,11,0.15)" : "transparent",
    color: active ? C.gold : C.muted,
    transition: "all 0.15s",
  })

  const actionBtn = (color: string, loading?: boolean): React.CSSProperties => ({
    padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: 4, cursor: loading ? "wait" : "pointer",
    border: `1px solid ${color}40`,
    backgroundColor: `${color}15`,
    color,
    opacity: loading ? 0.5 : 1,
    transition: "all 0.15s",
  })

  const thStyle: React.CSSProperties = {
    padding: "10px 12px", fontSize: 11, fontWeight: 600, color: C.muted,
    textTransform: "uppercase", letterSpacing: "0.05em",
    borderBottom: `1px solid ${C.border}`, textAlign: "left",
  }

  const tdStyle: React.CSSProperties = {
    padding: "10px 12px", fontSize: 13, color: C.text,
    borderBottom: `1px solid ${C.border}`,
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const appPages = Math.ceil(appCount / LIMIT)
  const appPage = Math.floor(appOffset / LIMIT) + 1
  const tokenPages = Math.ceil(tokenCount / LIMIT)
  const tokenPage = Math.floor(tokenOffset / LIMIT) + 1

  return (
    <div style={{ padding: "24px max(16px, min(36px, 4vw))", color: C.text, fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f5f5f4", margin: 0 }}>Waitlist Management</h1>
        <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0" }}>Manage pre-launch waitlist applications and invite tokens</p>
      </div>

      {/* Stats Header */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard label="Pending" count={stats.pending} color={C.warning} />
        <StatCard label="Approved" count={stats.approved} color={C.blue} />
        <StatCard label="Invited" count={stats.invited} color={C.purple} />
        <StatCard label="Registered" count={stats.registered} color={C.success} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
        {(["applications", "tokens"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: "none", borderBottom: tab === t ? `2px solid ${C.gold}` : "2px solid transparent",
              backgroundColor: "transparent",
              color: tab === t ? C.gold : C.muted,
              transition: "all 0.15s",
              textTransform: "capitalize",
            }}
          >
            {t === "applications" ? `Applications (${appCount})` : `Tokens (${tokenCount})`}
          </button>
        ))}
      </div>

      {/* ═══ Applications Tab ═══ */}
      {tab === "applications" && (
        <div>
          {/* Toolbar */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Search name or email..."
              value={appSearch}
              onChange={(e) => onAppSearchChange(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {["", "pending", "approved", "invited", "registered", "rejected"].map((s) => (
                <button
                  key={s}
                  onClick={() => { setAppStatus(s); setAppOffset(0) }}
                  style={btnStyle(appStatus === s)}
                >
                  {s || "All"}
                </button>
              ))}
            </div>
            {selectedIds.size > 0 && (
              <button
                onClick={bulkApproveInvite}
                disabled={bulkLoading}
                style={{
                  ...actionBtn(C.success, bulkLoading),
                  padding: "6px 16px", fontSize: 12,
                  marginLeft: "auto",
                }}
              >
                {bulkLoading ? "Processing..." : `Approve & Invite Selected (${selectedIds.size})`}
              </button>
            )}
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.border}` }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr style={{ backgroundColor: C.bgCard }}>
                  <th style={{ ...thStyle, width: 36 }}>
                    <input
                      type="checkbox"
                      checked={allSelectableSelected && pendingApps.length > 0}
                      onChange={toggleAll}
                      style={{ cursor: "pointer", accentColor: C.gold }}
                    />
                  </th>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Country</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Source</th>
                  <th style={thStyle}>Wave</th>
                  <th style={thStyle}>Applied</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {appLoading && apps.length === 0 && (
                  <tr><td colSpan={9} style={{ ...tdStyle, textAlign: "center", color: C.muted, padding: 40 }}>Loading...</td></tr>
                )}
                {!appLoading && apps.length === 0 && (
                  <tr><td colSpan={9} style={{ ...tdStyle, textAlign: "center", color: C.muted, padding: 40 }}>No applications found</td></tr>
                )}
                {apps.map((app) => {
                  const isExpanded = expandedId === app.id
                  const isSelectable = app.status === "pending" || app.status === "approved"
                  return (
                    <AppRow
                      key={app.id}
                      app={app}
                      isExpanded={isExpanded}
                      isSelectable={isSelectable}
                      isSelected={selectedIds.has(app.id)}
                      actionLoading={actionLoading}
                      tdStyle={tdStyle}
                      actionBtn={actionBtn}
                      onToggleExpand={() => setExpandedId(isExpanded ? null : app.id)}
                      onToggleSelect={() => toggleOne(app.id)}
                      onApprove={() => doAppAction(app.id, "approve")}
                      onReject={() => doAppAction(app.id, "reject")}
                      onInvite={() => doAppAction(app.id, "invite")}
                      onDelete={() => deleteApp(app.id)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {appPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, fontSize: 12, color: C.muted }}>
              <span>Page {appPage} of {appPages} ({appCount} total)</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setAppOffset(Math.max(0, appOffset - LIMIT))}
                  disabled={appOffset === 0}
                  style={{ ...btnStyle(), opacity: appOffset === 0 ? 0.3 : 1 }}
                >
                  Previous
                </button>
                <button
                  onClick={() => setAppOffset(appOffset + LIMIT)}
                  disabled={appOffset + LIMIT >= appCount}
                  style={{ ...btnStyle(), opacity: appOffset + LIMIT >= appCount ? 0.3 : 1 }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Tokens Tab ═══ */}
      {tab === "tokens" && (
        <div>
          {/* Toolbar */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Search email or token..."
              value={tokenSearch}
              onChange={(e) => onTokenSearchChange(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {["", "active", "used", "expired", "revoked"].map((s) => (
                <button
                  key={s}
                  onClick={() => { setTokenStatus(s); setTokenOffset(0) }}
                  style={btnStyle(tokenStatus === s)}
                >
                  {s || "All"}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.border}` }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr style={{ backgroundColor: C.bgCard }}>
                  <th style={thStyle}>Token</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Issued By</th>
                  <th style={thStyle}>Issued At</th>
                  <th style={thStyle}>Expires At</th>
                  <th style={thStyle}>Used At</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tokenLoading && tokens.length === 0 && (
                  <tr><td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: C.muted, padding: 40 }}>Loading...</td></tr>
                )}
                {!tokenLoading && tokens.length === 0 && (
                  <tr><td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: C.muted, padding: 40 }}>No tokens found</td></tr>
                )}
                {tokens.map((tok) => (
                  <tr key={tok.id} style={{ transition: "background 0.1s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.bgHover)}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12 }}>{tok.token_display}</td>
                    <td style={tdStyle}>{tok.email}</td>
                    <td style={tdStyle}><Badge status={tok.status} /></td>
                    <td style={{ ...tdStyle, color: C.muted }}>{tok.issued_by}</td>
                    <td style={{ ...tdStyle, color: C.muted }}>{fmtDateTime(tok.issued_at)}</td>
                    <td style={{ ...tdStyle, color: C.muted }}>{fmtDateTime(tok.expires_at)}</td>
                    <td style={{ ...tdStyle, color: C.muted }}>{fmtDateTime(tok.used_at)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      {tok.status === "active" && (
                        <button
                          onClick={() => revokeToken(tok.id)}
                          disabled={!!actionLoading[`${tok.id}-revoke`]}
                          style={actionBtn(C.danger, !!actionLoading[`${tok.id}-revoke`])}
                        >
                          {actionLoading[`${tok.id}-revoke`] ? "..." : "Revoke"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {tokenPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, fontSize: 12, color: C.muted }}>
              <span>Page {tokenPage} of {tokenPages} ({tokenCount} total)</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setTokenOffset(Math.max(0, tokenOffset - LIMIT))}
                  disabled={tokenOffset === 0}
                  style={{ ...btnStyle(), opacity: tokenOffset === 0 ? 0.3 : 1 }}
                >
                  Previous
                </button>
                <button
                  onClick={() => setTokenOffset(tokenOffset + LIMIT)}
                  disabled={tokenOffset + LIMIT >= tokenCount}
                  style={{ ...btnStyle(), opacity: tokenOffset + LIMIT >= tokenCount ? 0.3 : 1 }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Application Row (extracted for clarity) ──────────────────────────────────

function AppRow({
  app, isExpanded, isSelectable, isSelected, actionLoading, tdStyle, actionBtn,
  onToggleExpand, onToggleSelect, onApprove, onReject, onInvite, onDelete,
}: {
  app: WaitlistApplication
  isExpanded: boolean
  isSelectable: boolean
  isSelected: boolean
  actionLoading: Record<string, boolean>
  tdStyle: React.CSSProperties
  actionBtn: (color: string, loading?: boolean) => React.CSSProperties
  onToggleExpand: () => void
  onToggleSelect: () => void
  onApprove: () => void
  onReject: () => void
  onInvite: () => void
  onDelete: () => void
}) {
  const C_local = { muted: "#6b7280", gold: "#b8860b", success: "#22c55e", danger: "#dc2626", blue: "#3b82f6", purple: "#a855f7", border: "rgba(255,255,255,0.1)", bgCard: "#292524", bgHover: "#3a3532", text: "#d1d5db" }

  return (
    <>
      <tr
        style={{ cursor: "pointer", transition: "background 0.1s" }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C_local.bgHover)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
          {isSelectable ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              style={{ cursor: "pointer", accentColor: C_local.gold }}
            />
          ) : (
            <span style={{ display: "inline-block", width: 13 }} />
          )}
        </td>
        <td style={tdStyle} onClick={onToggleExpand}>
          {app.name || <span style={{ color: C_local.muted, fontStyle: "italic" }}>—</span>}
        </td>
        <td style={tdStyle} onClick={onToggleExpand}>{app.email}</td>
        <td style={{ ...tdStyle, color: C_local.muted }} onClick={onToggleExpand}>{app.country || "—"}</td>
        <td style={tdStyle} onClick={onToggleExpand}><Badge status={app.status} /></td>
        <td style={{ ...tdStyle, color: C_local.muted }} onClick={onToggleExpand}>{app.source || "—"}</td>
        <td style={{ ...tdStyle, color: C_local.muted }} onClick={onToggleExpand}>{app.wave ?? "—"}</td>
        <td style={{ ...tdStyle, color: C_local.muted }} onClick={onToggleExpand}>{fmtDate(app.created_at)}</td>
        <td style={{ ...tdStyle, textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
            {(app.status === "pending") && (
              <button onClick={onApprove} disabled={!!actionLoading[`${app.id}-approve`]} style={actionBtn(C_local.blue, !!actionLoading[`${app.id}-approve`])}>
                {actionLoading[`${app.id}-approve`] ? "..." : "Approve"}
              </button>
            )}
            {(app.status === "pending") && (
              <button onClick={onReject} disabled={!!actionLoading[`${app.id}-reject`]} style={actionBtn(C_local.danger, !!actionLoading[`${app.id}-reject`])}>
                {actionLoading[`${app.id}-reject`] ? "..." : "Reject"}
              </button>
            )}
            {(app.status === "approved") && (
              <button onClick={onInvite} disabled={!!actionLoading[`${app.id}-invite`]} style={actionBtn(C_local.purple, !!actionLoading[`${app.id}-invite`])}>
                {actionLoading[`${app.id}-invite`] ? "..." : "Invite"}
              </button>
            )}
            <button onClick={onDelete} disabled={!!actionLoading[`${app.id}-delete`]} style={actionBtn(C_local.danger, !!actionLoading[`${app.id}-delete`])}>
              {actionLoading[`${app.id}-delete`] ? "..." : "Delete"}
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} style={{ padding: 0, borderBottom: `1px solid ${C_local.border}` }}>
            <div style={{
              padding: "16px 20px 16px 48px",
              backgroundColor: C_local.bgCard,
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 32px",
              fontSize: 13,
            }}>
              <DetailField label="Genres" value={app.genres?.join(", ") || "—"} />
              <DetailField label="Buy Channels" value={app.buy_channels?.join(", ") || "—"} />
              <DetailField label="Buy Volume" value={app.buy_volume || "—"} />
              <DetailField label="Referrer Info" value={app.referrer_info || "—"} />
              <DetailField label="Ref Code" value={app.ref_code} mono />
              <DetailField label="Referred By" value={app.referred_by || "—"} mono />
              <DetailField label="Approved At" value={fmtDateTime(app.approved_at)} />
              <DetailField label="Invited At" value={fmtDateTime(app.invited_at)} />
              <DetailField label="Registered At" value={fmtDateTime(app.registered_at)} />
              <div style={{ gridColumn: "1 / -1" }}>
                <DetailField label="Admin Notes" value={app.admin_notes || "—"} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      <div style={{ marginTop: 2, color: "#d1d5db", fontFamily: mono ? "monospace" : "inherit", fontSize: mono ? 12 : 13 }}>
        {value}
      </div>
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function WaitlistPageWrapper() {
  return (
    <ErrorBoundary>
      <WaitlistPage />
    </ErrorBoundary>
  )
}
