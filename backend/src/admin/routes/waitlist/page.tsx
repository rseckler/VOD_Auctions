import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Component, useEffect, useState, useCallback, useRef } from "react"
import { useAdminNav } from "../../components/admin-nav"

// ── Design System ───────────────────────────────────────────────────────────

const C = {
  bg: "#1c1915",
  card: "#2a2520",
  text: "#f5f0eb",
  muted: "#a09080",
  gold: "#d4a54a",
  border: "#3a3530",
  hover: "#353025",
  success: "#22c55e",
  error: "#ef4444",
  blue: "#60a5fa",
  purple: "#c084fc",
  warning: "#eab308",
}

// ── Error Boundary ──────────────────────────────────────────────────────────

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) {
    return { error: e.message || String(e) }
  }
  render() {
    if (this.state.error)
      return (
        <div
          style={{
            padding: 32,
            color: C.error,
            fontFamily: "monospace",
            fontSize: 13,
          }}
        >
          <b>Render Error:</b> {this.state.error}
        </div>
      )
    return this.props.children
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

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

// ── Status Badge Styles ─────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  pending:    { bg: C.warning + "20", color: C.warning, border: C.warning + "40" },
  approved:   { bg: C.blue + "20",    color: C.blue,    border: C.blue + "40" },
  invited:    { bg: C.purple + "20",  color: C.purple,  border: C.purple + "40" },
  registered: { bg: C.success + "20", color: C.success, border: C.success + "40" },
  rejected:   { bg: C.error + "20",   color: C.error,   border: C.error + "40" },
  active:     { bg: C.success + "20", color: C.success, border: C.success + "40" },
  used:       { bg: C.muted + "20",   color: C.muted,   border: C.muted + "40" },
  expired:    { bg: C.warning + "20", color: C.warning, border: C.warning + "40" },
  revoked:    { bg: C.error + "20",   color: C.error,   border: C.error + "40" },
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "\u2014"
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function fmtDateTime(d: string | null) {
  if (!d) return "\u2014"
  const dt = new Date(d)
  return (
    dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    " " +
    dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  )
}

// ── Micro Components ────────────────────────────────────────────────────────

function Badge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 4,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        backgroundColor: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
      }}
    >
      {status}
    </span>
  )
}

function Toast({
  message,
  type,
  onClose,
}: {
  message: string
  type: "success" | "error"
  onClose: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  const borderColor = type === "success" ? C.success : C.error
  const textColor = type === "success" ? C.success : C.error

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        background: C.bg,
        border: `1px solid ${borderColor}`,
        color: textColor,
        padding: "10px 18px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        zIndex: 9999,
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      }}
    >
      {message}
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        background: C.card,
        padding: "2px 8px",
        borderRadius: 3,
        fontSize: 11,
        color: C.text,
        marginRight: 4,
        marginBottom: 4,
      }}
    >
      {children}
    </span>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

function WaitlistPage() {
  useAdminNav()

  // ── State ───────────────────────────────────────────────────────────────────

  const [tab, setTab] = useState<"applications" | "tokens">("applications")
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  // Applications
  const [apps, setApps] = useState<WaitlistApplication[]>([])
  const [appCount, setAppCount] = useState(0)
  const [stats, setStats] = useState<WaitlistStats>({
    pending: 0,
    approved: 0,
    invited: 0,
    registered: 0,
    rejected: 0,
  })
  const [appStatus, setAppStatus] = useState("")
  const [appSearch, setAppSearch] = useState("")
  const [appOffset, setAppOffset] = useState(0)
  const [appLoading, setAppLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [bulkLoading, setBulkLoading] = useState(false)
  const appSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Tokens
  const [tokens, setTokens] = useState<InviteToken[]>([])
  const [tokenCount, setTokenCount] = useState(0)
  const [tokenStatus, setTokenStatus] = useState("")
  const [tokenSearch, setTokenSearch] = useState("")
  const [tokenOffset, setTokenOffset] = useState(0)
  const [tokenLoading, setTokenLoading] = useState(false)
  const tokenSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const LIMIT = 50

  // ── Fetch Applications ──────────────────────────────────────────────────────

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

  // ── Fetch Tokens ────────────────────────────────────────────────────────────

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

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchApps()
  }, [fetchApps])

  useEffect(() => {
    if (tab === "tokens") fetchTokens()
  }, [tab, fetchTokens])

  // ── Application Actions ─────────────────────────────────────────────────────

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
      setToast({
        message: `${action.charAt(0).toUpperCase() + action.slice(1)} successful`,
        type: "success",
      })
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
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
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

  // ── Token Actions ───────────────────────────────────────────────────────────

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

  // ── Checkbox Helpers ────────────────────────────────────────────────────────

  const pendingApps = apps.filter((a) => a.status === "pending" || a.status === "approved")
  const allSelectableSelected =
    pendingApps.length > 0 && pendingApps.every((a) => selectedIds.has(a.id))

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

  // ── Debounced Search ────────────────────────────────────────────────────────

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

  // ── Pagination Calc ─────────────────────────────────────────────────────────

  const appPages = Math.ceil(appCount / LIMIT)
  const appPage = Math.floor(appOffset / LIMIT) + 1
  const tokenPages = Math.ceil(tokenCount / LIMIT)
  const tokenPage = Math.floor(tokenOffset / LIMIT) + 1

  // ── Stat Cards Data ─────────────────────────────────────────────────────────

  const statCards = [
    { label: "Pending", count: stats.pending, color: C.warning },
    { label: "Approved", count: stats.approved, color: C.blue },
    { label: "Invited", count: stats.invited, color: C.purple },
    { label: "Registered", count: stats.registered, color: C.success },
  ]

  // ── App Status Filters ──────────────────────────────────────────────────────

  const appFilters = [
    { value: "", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "invited", label: "Invited" },
    { value: "registered", label: "Registered" },
    { value: "rejected", label: "Rejected" },
  ]

  const tokenFilters = [
    { value: "", label: "All" },
    { value: "active", label: "Active" },
    { value: "used", label: "Used" },
    { value: "expired", label: "Expired" },
    { value: "revoked", label: "Revoked" },
  ]

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        padding: "24px max(16px, min(36px, 4vw))",
        color: C.text,
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}
    >
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>
            Waitlist Management
          </h1>
          <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0" }}>
            Pre-launch applications and invite tokens
          </p>
        </div>
      </div>

      {/* ── Stats Cards ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          background: C.border,
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 20,
        }}
      >
        {statCards.map((s) => (
          <div
            key={s.label}
            style={{
              background: C.card,
              padding: "14px 18px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.count}</div>
            <div
              style={{
                fontSize: 11,
                color: C.muted,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginTop: 2,
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 20,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        {(["applications", "tokens"] as const).map((t) => {
          const isActive = tab === t
          const label =
            t === "applications" ? `Applications (${appCount})` : `Tokens (${tokenCount})`
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? C.gold : C.muted,
                borderBottom: isActive
                  ? `2px solid ${C.gold}`
                  : "2px solid transparent",
                background: "none",
                border: "none",
                borderBottomStyle: "solid",
                borderBottomWidth: 2,
                borderBottomColor: isActive ? C.gold : "transparent",
                cursor: "pointer",
                transition: "color 0.15s",
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Applications Tab
          ═══════════════════════════════════════════════════════════════════════ */}
      {tab === "applications" && (
        <div>
          {/* ── Search + Filter Bar ──────────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            <input
              type="text"
              placeholder="\u{1F50D} Search by name or email..."
              value={appSearch}
              onChange={(e) => onAppSearchChange(e.target.value)}
              style={{
                flex: 1,
                maxWidth: 320,
                padding: "7px 12px",
                fontSize: 13,
                borderRadius: 6,
                border: `1px solid ${C.border}`,
                background: C.bg,
                color: C.text,
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {appFilters.map((f) => {
                const isActive = appStatus === f.value
                return (
                  <button
                    key={f.value}
                    onClick={() => {
                      setAppStatus(f.value)
                      setAppOffset(0)
                    }}
                    style={{
                      background: isActive ? C.gold : "transparent",
                      color: isActive ? "#1c1915" : C.muted,
                      fontWeight: isActive ? 600 : 400,
                      borderRadius: 5,
                      padding: "4px 10px",
                      fontSize: 12,
                      border: isActive ? "none" : `1px solid ${C.border}`,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Table ────────────────────────────────────────────────────────── */}
          {!appLoading && apps.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "48px 20px",
                color: C.muted,
                fontSize: 13,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>{"\u{1F4CB}"}</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No applications yet</div>
              <div style={{ fontSize: 12 }}>
                Applications will appear here once users sign up for the waitlist.
              </div>
            </div>
          ) : (
            <div
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                  <thead>
                    <tr style={{ background: "#161310" }}>
                      <th
                        style={{
                          padding: "8px 14px",
                          fontSize: 10,
                          fontWeight: 700,
                          color: C.muted,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          borderBottom: `1px solid ${C.border}`,
                          textAlign: "left",
                          width: 36,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={allSelectableSelected && pendingApps.length > 0}
                          onChange={toggleAll}
                          style={{ cursor: "pointer", accentColor: C.gold }}
                        />
                      </th>
                      {["Name", "Email", "Country", "Status", "Source", "Wave", "Applied", "Actions"].map(
                        (h, i) => (
                          <th
                            key={h}
                            style={{
                              padding: "8px 14px",
                              fontSize: 10,
                              fontWeight: 700,
                              color: C.muted,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              borderBottom: `1px solid ${C.border}`,
                              textAlign: i === 7 ? "right" : "left",
                            }}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {appLoading && apps.length === 0 && (
                      <tr>
                        <td
                          colSpan={9}
                          style={{
                            padding: "40px 14px",
                            fontSize: 13,
                            color: C.muted,
                            textAlign: "center",
                          }}
                        >
                          Loading...
                        </td>
                      </tr>
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
            </div>
          )}

          {/* ── Pagination ───────────────────────────────────────────────────── */}
          {appPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 0",
                fontSize: 12,
                color: C.muted,
              }}
            >
              <span>
                Page {appPage} of {appPages} ({appCount} total)
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setAppOffset(Math.max(0, appOffset - LIMIT))}
                  disabled={appOffset === 0}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 5,
                    border: `1px solid ${C.border}`,
                    background: "transparent",
                    color: C.text,
                    cursor: appOffset === 0 ? "default" : "pointer",
                    opacity: appOffset === 0 ? 0.3 : 1,
                    fontSize: 12,
                  }}
                >
                  Prev
                </button>
                <button
                  onClick={() => setAppOffset(appOffset + LIMIT)}
                  disabled={appOffset + LIMIT >= appCount}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 5,
                    border: `1px solid ${C.border}`,
                    background: "transparent",
                    color: C.text,
                    cursor: appOffset + LIMIT >= appCount ? "default" : "pointer",
                    opacity: appOffset + LIMIT >= appCount ? 0.3 : 1,
                    fontSize: 12,
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* ── Bulk Actions Bar ─────────────────────────────────────────────── */}
          {selectedIds.size > 0 && (
            <div
              style={{
                position: "sticky",
                bottom: 0,
                background: C.card,
                borderTop: `1px solid ${C.border}`,
                padding: "10px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                zIndex: 10,
                borderRadius: "0 0 8px 8px",
              }}
            >
              <span style={{ fontSize: 13, color: C.muted }}>
                {selectedIds.size} selected
              </span>
              <button
                onClick={bulkApproveInvite}
                disabled={bulkLoading}
                style={{
                  background: C.gold,
                  color: "#1c1915",
                  border: "none",
                  padding: "6px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 5,
                  cursor: bulkLoading ? "wait" : "pointer",
                  opacity: bulkLoading ? 0.6 : 1,
                }}
              >
                {bulkLoading ? "Processing..." : `Approve & Invite Selected (${selectedIds.size})`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          Tokens Tab
          ═══════════════════════════════════════════════════════════════════════ */}
      {tab === "tokens" && (
        <div>
          {/* ── Search + Filter Bar ──────────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            <input
              type="text"
              placeholder="\u{1F50D} Search email or token..."
              value={tokenSearch}
              onChange={(e) => onTokenSearchChange(e.target.value)}
              style={{
                flex: 1,
                maxWidth: 320,
                padding: "7px 12px",
                fontSize: 13,
                borderRadius: 6,
                border: `1px solid ${C.border}`,
                background: C.bg,
                color: C.text,
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {tokenFilters.map((f) => {
                const isActive = tokenStatus === f.value
                return (
                  <button
                    key={f.value}
                    onClick={() => {
                      setTokenStatus(f.value)
                      setTokenOffset(0)
                    }}
                    style={{
                      background: isActive ? C.gold : "transparent",
                      color: isActive ? "#1c1915" : C.muted,
                      fontWeight: isActive ? 600 : 400,
                      borderRadius: 5,
                      padding: "4px 10px",
                      fontSize: 12,
                      border: isActive ? "none" : `1px solid ${C.border}`,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Token Table ──────────────────────────────────────────────────── */}
          {!tokenLoading && tokens.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "48px 20px",
                color: C.muted,
                fontSize: 13,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>{"\u{1F511}"}</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No tokens found</div>
              <div style={{ fontSize: 12 }}>
                Invite tokens are generated when you approve and invite applicants.
              </div>
            </div>
          ) : (
            <div
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                  <thead>
                    <tr style={{ background: "#161310" }}>
                      {[
                        "Token",
                        "Email",
                        "Status",
                        "Issued By",
                        "Issued At",
                        "Expires At",
                        "Used At",
                        "Actions",
                      ].map((h, i) => (
                        <th
                          key={h}
                          style={{
                            padding: "8px 14px",
                            fontSize: 10,
                            fontWeight: 700,
                            color: C.muted,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            borderBottom: `1px solid ${C.border}`,
                            textAlign: i === 7 ? "right" : "left",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tokenLoading && tokens.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          style={{
                            padding: "40px 14px",
                            fontSize: 13,
                            color: C.muted,
                            textAlign: "center",
                          }}
                        >
                          Loading...
                        </td>
                      </tr>
                    )}
                    {tokens.map((tok) => (
                      <tr
                        key={tok.id}
                        style={{
                          borderBottom: `1px solid ${C.border}80`,
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = C.hover)
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = "transparent")
                        }
                      >
                        <td
                          style={{
                            padding: "10px 14px",
                            fontFamily: "monospace",
                            fontWeight: 700,
                            color: C.gold,
                            fontSize: 13,
                            letterSpacing: "0.04em",
                            verticalAlign: "middle",
                          }}
                        >
                          {tok.token_display}
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            fontSize: 13,
                            color: C.text,
                            verticalAlign: "middle",
                          }}
                        >
                          {tok.email}
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            verticalAlign: "middle",
                          }}
                        >
                          <Badge status={tok.status} />
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            fontSize: 13,
                            color: C.muted,
                            verticalAlign: "middle",
                          }}
                        >
                          {tok.issued_by}
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            fontSize: 11,
                            color: C.muted,
                            verticalAlign: "middle",
                          }}
                        >
                          {fmtDateTime(tok.issued_at)}
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            fontSize: 11,
                            color: C.muted,
                            verticalAlign: "middle",
                          }}
                        >
                          {fmtDateTime(tok.expires_at)}
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            fontSize: 11,
                            color: C.muted,
                            verticalAlign: "middle",
                          }}
                        >
                          {fmtDateTime(tok.used_at)}
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            textAlign: "right",
                            verticalAlign: "middle",
                          }}
                        >
                          {tok.status === "active" && (
                            <button
                              onClick={() => revokeToken(tok.id)}
                              disabled={!!actionLoading[`${tok.id}-revoke`]}
                              style={{
                                padding: "3px 10px",
                                fontSize: 11,
                                fontWeight: 600,
                                borderRadius: 4,
                                border: `1px solid ${C.error}60`,
                                background: "transparent",
                                color: C.error,
                                cursor: actionLoading[`${tok.id}-revoke`]
                                  ? "wait"
                                  : "pointer",
                                opacity: actionLoading[`${tok.id}-revoke`] ? 0.5 : 1,
                              }}
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
            </div>
          )}

          {/* ── Token Pagination ──────────────────────────────────────────────── */}
          {tokenPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 0",
                fontSize: 12,
                color: C.muted,
              }}
            >
              <span>
                Page {tokenPage} of {tokenPages} ({tokenCount} total)
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setTokenOffset(Math.max(0, tokenOffset - LIMIT))}
                  disabled={tokenOffset === 0}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 5,
                    border: `1px solid ${C.border}`,
                    background: "transparent",
                    color: C.text,
                    cursor: tokenOffset === 0 ? "default" : "pointer",
                    opacity: tokenOffset === 0 ? 0.3 : 1,
                    fontSize: 12,
                  }}
                >
                  Prev
                </button>
                <button
                  onClick={() => setTokenOffset(tokenOffset + LIMIT)}
                  disabled={tokenOffset + LIMIT >= tokenCount}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 5,
                    border: `1px solid ${C.border}`,
                    background: "transparent",
                    color: C.text,
                    cursor: tokenOffset + LIMIT >= tokenCount ? "default" : "pointer",
                    opacity: tokenOffset + LIMIT >= tokenCount ? 0.3 : 1,
                    fontSize: 12,
                  }}
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

// ── Application Row ─────────────────────────────────────────────────────────

function AppRow({
  app,
  isExpanded,
  isSelectable,
  isSelected,
  actionLoading,
  onToggleExpand,
  onToggleSelect,
  onApprove,
  onReject,
  onInvite,
  onDelete,
}: {
  app: WaitlistApplication
  isExpanded: boolean
  isSelectable: boolean
  isSelected: boolean
  actionLoading: Record<string, boolean>
  onToggleExpand: () => void
  onToggleSelect: () => void
  onApprove: () => void
  onReject: () => void
  onInvite: () => void
  onDelete: () => void
}) {
  const rowBg = isExpanded ? C.hover + "60" : "transparent"

  const cellBase: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: 13,
    color: C.text,
    verticalAlign: "middle",
    borderBottom: `1px solid ${C.border}80`,
  }

  const actionBtnStyle = (
    color: string,
    filled?: boolean,
    loading?: boolean
  ): React.CSSProperties => ({
    padding: "3px 10px",
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 4,
    border: filled ? "none" : `1px solid ${color}60`,
    background: filled ? C.gold : "transparent",
    color: filled ? "#1c1915" : color,
    cursor: loading ? "wait" : "pointer",
    opacity: loading ? 0.5 : 1,
    transition: "all 0.15s",
  })

  return (
    <>
      <tr
        style={{
          cursor: "pointer",
          transition: "background 0.1s",
          backgroundColor: rowBg,
        }}
        onMouseEnter={(e) => {
          if (!isExpanded) e.currentTarget.style.backgroundColor = C.hover
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = isExpanded ? C.hover + "60" : "transparent"
        }}
      >
        {/* Checkbox */}
        <td style={cellBase} onClick={(e) => e.stopPropagation()}>
          {isSelectable ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              style={{ cursor: "pointer", accentColor: C.gold }}
            />
          ) : (
            <span style={{ display: "inline-block", width: 13 }} />
          )}
        </td>

        {/* Name */}
        <td style={cellBase} onClick={onToggleExpand}>
          {app.name || (
            <span style={{ color: C.muted, fontStyle: "italic" }}>{"\u2014"}</span>
          )}
        </td>

        {/* Email */}
        <td style={cellBase} onClick={onToggleExpand}>
          {app.email}
        </td>

        {/* Country */}
        <td style={{ ...cellBase, color: C.muted }} onClick={onToggleExpand}>
          {app.country || "\u2014"}
        </td>

        {/* Status */}
        <td style={cellBase} onClick={onToggleExpand}>
          <Badge status={app.status} />
        </td>

        {/* Source */}
        <td style={{ ...cellBase, color: C.muted }} onClick={onToggleExpand}>
          {app.source || "\u2014"}
        </td>

        {/* Wave */}
        <td style={{ ...cellBase, color: C.muted }} onClick={onToggleExpand}>
          {app.wave ?? "\u2014"}
        </td>

        {/* Applied */}
        <td style={{ ...cellBase, fontSize: 11, color: C.muted }} onClick={onToggleExpand}>
          {fmtDate(app.created_at)}
        </td>

        {/* Actions */}
        <td style={{ ...cellBase, textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
            {app.status === "pending" && (
              <>
                <button
                  onClick={onApprove}
                  disabled={!!actionLoading[`${app.id}-approve`]}
                  style={actionBtnStyle(C.success, false, !!actionLoading[`${app.id}-approve`])}
                >
                  {actionLoading[`${app.id}-approve`] ? "..." : "Approve"}
                </button>
                <button
                  onClick={onReject}
                  disabled={!!actionLoading[`${app.id}-reject`]}
                  style={actionBtnStyle(C.error, false, !!actionLoading[`${app.id}-reject`])}
                >
                  {actionLoading[`${app.id}-reject`] ? "..." : "Reject"}
                </button>
              </>
            )}
            {app.status === "approved" && (
              <button
                onClick={onInvite}
                disabled={!!actionLoading[`${app.id}-invite`]}
                style={actionBtnStyle(C.gold, true, !!actionLoading[`${app.id}-invite`])}
              >
                {actionLoading[`${app.id}-invite`] ? "..." : "Invite"}
              </button>
            )}
            <button
              onClick={onDelete}
              disabled={!!actionLoading[`${app.id}-delete`]}
              style={actionBtnStyle(C.error, false, !!actionLoading[`${app.id}-delete`])}
            >
              {actionLoading[`${app.id}-delete`] ? "..." : "Delete"}
            </button>
          </div>
        </td>
      </tr>

      {/* ── Expanded Detail Row ─────────────────────────────────────────── */}
      {isExpanded && (
        <tr>
          <td
            colSpan={9}
            style={{
              padding: 0,
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                background: C.bg,
                padding: "14px 18px 14px 48px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px 32px",
                fontSize: 13,
              }}
            >
              {/* Genres */}
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.muted,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 4,
                  }}
                >
                  Genres
                </div>
                <div>
                  {app.genres && app.genres.length > 0 ? (
                    app.genres.map((g) => <Tag key={g}>{g}</Tag>)
                  ) : (
                    <span style={{ color: C.muted }}>{"\u2014"}</span>
                  )}
                </div>
              </div>

              {/* Buy Channels */}
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.muted,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 4,
                  }}
                >
                  Buy Channels
                </div>
                <div>
                  {app.buy_channels && app.buy_channels.length > 0 ? (
                    app.buy_channels.map((ch) => <Tag key={ch}>{ch}</Tag>)
                  ) : (
                    <span style={{ color: C.muted }}>{"\u2014"}</span>
                  )}
                </div>
              </div>

              {/* Buy Volume */}
              <DetailField label="Buy Volume" value={app.buy_volume || "\u2014"} />

              {/* Referrer Info */}
              <DetailField label="Referrer Info" value={app.referrer_info || "\u2014"} />

              {/* Ref Code */}
              <DetailField label="Ref Code" value={app.ref_code} mono />

              {/* Referred By */}
              <DetailField label="Referred By" value={app.referred_by || "\u2014"} mono />

              {/* Timestamps */}
              <DetailField label="Applied" value={fmtDateTime(app.created_at)} />
              <DetailField label="Approved" value={fmtDateTime(app.approved_at)} />
              <DetailField label="Invited" value={fmtDateTime(app.invited_at)} />
              <DetailField label="Registered" value={fmtDateTime(app.registered_at)} />

              {/* Admin Notes (full width) */}
              <div style={{ gridColumn: "1 / -1" }}>
                <DetailField label="Admin Notes" value={app.admin_notes || "\u2014"} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Detail Field ────────────────────────────────────────────────────────────

function DetailField({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.muted,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: C.text,
          fontFamily: mono ? "monospace" : "inherit",
          fontSize: mono ? 12 : 13,
        }}
      >
        {value}
      </div>
    </div>
  )
}

// ── Export ───────────────────────────────────────────────────────────────────

export default function WaitlistPageWrapper() {
  return (
    <ErrorBoundary>
      <WaitlistPage />
    </ErrorBoundary>
  )
}

export const config = defineRouteConfig({
  label: "Waitlist",
})
