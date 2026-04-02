import { useEffect, useState, useCallback } from "react"
import { useAdminNav } from "../../components/admin-nav"

// ─── Types ──────────────────────────────────────────────────────────────────

interface SiteConfig {
  catalog_visibility: string
  platform_mode: string
  gate_password: string
  invite_mode_active: boolean
  apply_page_visible: boolean
  waitlist_counter_visible: boolean
  auction_anti_snipe_minutes: number
  auction_default_duration_hours: number
  auction_stagger_interval_seconds: number
  auction_direct_purchase_enabled: boolean
  auction_reserve_price_visible: boolean
  bid_ending_reminders_enabled: boolean
}

interface AuditEntry {
  id: string
  setting: string
  old_value: string | null
  new_value: string | null
  changed_by: string
  created_at: string
}

interface GoLiveCheck {
  label: string
  passed: boolean
  detail?: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const COLORS = {
  text: "#d1d5db",
  muted: "#6b7280",
  gold: "#b8860b",
  success: "#22c55e",
  danger: "#dc2626",
  warning: "#eab308",
  border: "rgba(255,255,255,0.1)",
  blue: "#3b82f6",
}

const TABS = ["General", "Access / Launch", "Auction", "Change History"] as const
type Tab = (typeof TABS)[number]

const MODE_BADGES: Record<string, { color: string; label: string }> = {
  pre_launch: { color: COLORS.warning, label: "PRE-LAUNCH" },
  preview: { color: COLORS.blue, label: "PREVIEW" },
  live: { color: COLORS.success, label: "LIVE" },
  maintenance: { color: COLORS.danger, label: "MAINTENANCE" },
}

const MODE_ICONS: Record<string, string> = {
  pre_launch: "\uD83D\uDD12",
  preview: "\uD83D\uDC41",
  live: "\u2705",
  maintenance: "\uD83D\uDD27",
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const toggleStyle = (active: boolean) => ({
  width: 40,
  height: 22,
  borderRadius: 11,
  background: active ? "#22c55e" : "rgba(255,255,255,0.15)",
  position: "relative" as const,
  cursor: "pointer",
  border: "none",
  transition: "background 0.2s",
  flexShrink: 0,
})

const toggleKnobStyle = (active: boolean) => ({
  position: "absolute" as const,
  top: 2,
  left: active ? 20 : 2,
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "var(--bg-component, #1a1714)",
  transition: "left 0.2s",
})

const cardStyle: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${COLORS.border}`,
  borderRadius: 10,
  padding: 20,
  marginBottom: 16,
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: COLORS.text,
  marginBottom: 4,
}

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: COLORS.muted,
  marginTop: 2,
  marginBottom: 0,
}

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: `1px solid ${COLORS.border}`,
  borderRadius: 6,
  padding: "7px 10px",
  color: COLORS.text,
  fontSize: 13,
  outline: "none",
  width: "100%",
  maxWidth: 280,
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  maxWidth: 220,
}

const btnStyle: React.CSSProperties = {
  padding: "6px 16px",
  borderRadius: 6,
  border: "none",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  transition: "opacity 0.15s",
}

const saveBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: COLORS.gold,
  color: "#fff",
}

const dangerBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: COLORS.danger,
  color: "#fff",
}

const goldBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: COLORS.gold,
  color: "#fff",
  padding: "10px 28px",
  fontSize: 14,
}

const dividerStyle: React.CSSProperties = {
  borderTop: `1px solid ${COLORS.border}`,
  margin: "20px 0",
}

// ─── Helper: API fetch ──────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
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

// ─── Toast ──────────────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        background: "#1a1714",
        border: `1px solid ${COLORS.success}`,
        color: COLORS.success,
        padding: "10px 20px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        zIndex: 9999,
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      }}
    >
      {message}
    </div>
  )
}

// ─── Go Live Modal ──────────────────────────────────────────────────────────

function GoLiveModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: (cfg: SiteConfig) => void
}) {
  const [checks, setChecks] = useState<GoLiveCheck[] | null>(null)
  const [allPassed, setAllPassed] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  useEffect(() => {
    apiFetch<{ checks: GoLiveCheck[]; all_passed: boolean }>(
      "/admin/site-config/go-live"
    )
      .then((data) => {
        setChecks(data.checks)
        setAllPassed(data.all_passed)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleConfirm = async () => {
    setSubmitting(true)
    setError("")
    try {
      const data = await apiFetch<{
        config: SiteConfig
        checks: GoLiveCheck[]
        message: string
      }>("/admin/site-config/go-live", {
        method: "POST",
        body: JSON.stringify({ confirmation: "GO LIVE" }),
      })
      setSuccess(data.message || "Platform is now LIVE!")
      setTimeout(() => {
        onSuccess(data.config)
        onClose()
      }, 1500)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          background: "#1c1915",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 12,
          padding: 28,
          width: "100%",
          maxWidth: 520,
          maxHeight: "80vh",
          overflowY: "auto",
          color: COLORS.text,
        }}
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            margin: "0 0 20px",
            color: COLORS.gold,
          }}
        >
          Before you go live — Pre-Flight Checklist
        </h2>

        {loading && (
          <p style={{ color: COLORS.muted, fontSize: 13 }}>
            Running checks...
          </p>
        )}

        {error && (
          <p style={{ color: COLORS.danger, fontSize: 13, marginBottom: 12 }}>
            {error}
          </p>
        )}

        {success && (
          <p style={{ color: COLORS.success, fontSize: 14, fontWeight: 600 }}>
            {success}
          </p>
        )}

        {checks && !success && (
          <>
            <div style={{ marginBottom: 20 }}>
              {checks.map((c, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom:
                      i < checks.length - 1
                        ? `1px solid ${COLORS.border}`
                        : "none",
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }}>
                    {c.passed ? "\u2705" : "\u26A0\uFE0F"}
                  </span>
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: c.passed ? COLORS.text : COLORS.warning,
                      }}
                    >
                      {c.label}
                    </div>
                    {c.detail && (
                      <div style={{ fontSize: 12, color: COLORS.muted }}>
                        {c.detail}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {!allPassed && (
              <p
                style={{
                  fontSize: 12,
                  color: COLORS.warning,
                  marginBottom: 16,
                }}
              >
                Some checks did not pass. You can still go live, but review the
                warnings above.
              </p>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ ...labelStyle, marginBottom: 6, display: "block" }}>
                Type "GO LIVE" to confirm
              </label>
              <input
                style={inputStyle}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder='GO LIVE'
                autoFocus
              />
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                style={{ ...btnStyle, background: "rgba(255,255,255,0.08)", color: COLORS.muted }}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                style={{
                  ...goldBtnStyle,
                  opacity: confirmation === "GO LIVE" && !submitting ? 1 : 0.4,
                  cursor:
                    confirmation === "GO LIVE" && !submitting
                      ? "pointer"
                      : "not-allowed",
                }}
                disabled={confirmation !== "GO LIVE" || submitting}
                onClick={handleConfirm}
              >
                {submitting ? "Going live..." : "Confirm Go Live"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main Page Component ────────────────────────────────────────────────────

function ConfigPage() {
  useAdminNav()

  const [config, setConfig] = useState<SiteConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<Tab>("General")
  const [toast, setToast] = useState("")
  const [showGoLive, setShowGoLive] = useState(false)

  // Audit log state
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [auditCount, setAuditCount] = useState(0)
  const [auditPage, setAuditPage] = useState(0)
  const [auditLoading, setAuditLoading] = useState(false)

  // Form state for fields that need explicit save
  const [catalogVis, setCatalogVis] = useState("")
  const [platformMode, setPlatformMode] = useState("")
  const [gatePassword, setGatePassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [antiSnipe, setAntiSnipe] = useState(0)
  const [defaultDuration, setDefaultDuration] = useState(0)
  const [staggerInterval, setStaggerInterval] = useState(0)

  // ── Load config ──

  const loadConfig = useCallback(async () => {
    try {
      const data = await apiFetch<{ config: SiteConfig }>("/admin/site-config")
      const c = data.config
      setConfig(c)
      setCatalogVis(c.catalog_visibility)
      setPlatformMode(c.platform_mode)
      setGatePassword(c.gate_password)
      setAntiSnipe(c.auction_anti_snipe_minutes)
      setDefaultDuration(c.auction_default_duration_hours)
      setStaggerInterval(c.auction_stagger_interval_seconds)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // ── Load audit log ──

  const loadAudit = useCallback(async (page: number) => {
    setAuditLoading(true)
    try {
      const data = await apiFetch<{
        entries: AuditEntry[]
        count: number
        limit: number
        offset: number
      }>(`/admin/site-config/audit-log?limit=50&offset=${page * 50}`)
      setAuditEntries(data.entries)
      setAuditCount(data.count)
      setAuditPage(page)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAuditLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === "Change History") loadAudit(0)
  }, [tab, loadAudit])

  // ── Save helper ──

  const saveField = async (updates: Partial<SiteConfig>) => {
    try {
      const data = await apiFetch<{ config: SiteConfig }>("/admin/site-config", {
        method: "POST",
        body: JSON.stringify(updates),
      })
      const c = data.config
      setConfig(c)
      setCatalogVis(c.catalog_visibility)
      setPlatformMode(c.platform_mode)
      setGatePassword(c.gate_password)
      setAntiSnipe(c.auction_anti_snipe_minutes)
      setDefaultDuration(c.auction_default_duration_hours)
      setStaggerInterval(c.auction_stagger_interval_seconds)
      setToast("Saved \u2713")
    } catch (e: any) {
      setError(e.message)
    }
  }

  // ── Toggle helper (auto-save) ──

  const toggleField = (key: keyof SiteConfig) => {
    if (!config) return
    const newVal = !config[key]
    saveField({ [key]: newVal } as any)
  }

  // ── Render helpers ──

  const renderToggleRow = (
    key: keyof SiteConfig,
    label: string,
    hint: string
  ) => {
    if (!config) return null
    const active = !!config[key]
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 0",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>{label}</div>
          <p style={hintStyle}>{hint}</p>
        </div>
        <button style={toggleStyle(active)} onClick={() => toggleField(key)}>
          <span style={toggleKnobStyle(active)} />
        </button>
      </div>
    )
  }

  // ── Platform mode badge ──

  const renderModeBadge = () => {
    if (!config) return null
    const mode = config.platform_mode
    const badge = MODE_BADGES[mode] || MODE_BADGES.pre_launch
    const icon = MODE_ICONS[mode] || MODE_ICONS.pre_launch
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 14px",
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.5,
          color: "#fff",
          background: badge.color,
        }}
      >
        {icon} {badge.label}
      </span>
    )
  }

  // ── Tab: General ──

  const renderGeneral = () => (
    <div style={cardStyle}>
      <div style={labelStyle}>Catalog Visibility</div>
      <p style={hintStyle}>
        "visible" shows only releases with cover images. "all" shows everything.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
        <select
          style={selectStyle}
          value={catalogVis}
          onChange={(e) => setCatalogVis(e.target.value)}
        >
          <option value="visible">visible</option>
          <option value="all">all</option>
        </select>
        <button
          style={{
            ...saveBtnStyle,
            opacity: catalogVis !== config?.catalog_visibility ? 1 : 0.4,
          }}
          disabled={catalogVis === config?.catalog_visibility}
          onClick={() => saveField({ catalog_visibility: catalogVis })}
        >
          Save
        </button>
      </div>
    </div>
  )

  // ── Tab: Access / Launch ──

  const renderAccess = () => (
    <>
      {/* Platform Mode */}
      <div style={cardStyle}>
        <div style={labelStyle}>Platform Mode</div>
        <p style={hintStyle}>
          Controls the overall state of the storefront.
        </p>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginTop: 10,
          }}
        >
          <select
            style={selectStyle}
            value={platformMode}
            onChange={(e) => setPlatformMode(e.target.value)}
          >
            <option value="pre_launch">pre_launch</option>
            <option value="preview">preview</option>
            <option value="live">live</option>
            <option value="maintenance">maintenance</option>
          </select>
          <button
            style={{
              ...saveBtnStyle,
              opacity: platformMode !== config?.platform_mode ? 1 : 0.4,
            }}
            disabled={platformMode === config?.platform_mode}
            onClick={() => saveField({ platform_mode: platformMode })}
          >
            Save
          </button>
        </div>
        {platformMode === "live" && platformMode !== config?.platform_mode && (
          <p
            style={{
              fontSize: 12,
              color: COLORS.warning,
              marginTop: 8,
              fontWeight: 600,
            }}
          >
            Setting mode to "live" will remove the password gate and make the
            storefront publicly accessible.
          </p>
        )}
      </div>

      {/* Gate Password */}
      <div style={cardStyle}>
        <div style={labelStyle}>Gate Password</div>
        <p style={hintStyle}>
          Password visitors must enter to access the storefront in pre_launch /
          preview mode.
        </p>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginTop: 10,
          }}
        >
          <div style={{ position: "relative", maxWidth: 280, width: "100%" }}>
            <input
              style={inputStyle}
              type={showPassword ? "text" : "password"}
              value={gatePassword}
              onChange={(e) => setGatePassword(e.target.value)}
            />
            <button
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: COLORS.muted,
                cursor: "pointer",
                fontSize: 12,
              }}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <button
            style={{
              ...saveBtnStyle,
              opacity: gatePassword !== config?.gate_password ? 1 : 0.4,
            }}
            disabled={gatePassword === config?.gate_password}
            onClick={() => saveField({ gate_password: gatePassword })}
          >
            Save
          </button>
        </div>
      </div>

      {/* Toggles */}
      <div style={cardStyle}>
        {renderToggleRow(
          "invite_mode_active",
          "Invite Mode Active",
          "Only invited users can access the storefront."
        )}
        <div style={dividerStyle} />
        {renderToggleRow(
          "apply_page_visible",
          "Apply Page Visible",
          "Show the application page for early access."
        )}
        <div style={dividerStyle} />
        {renderToggleRow(
          "waitlist_counter_visible",
          "Waitlist Counter Visible",
          "Show how many people are on the waitlist."
        )}
      </div>

      {/* Go Live */}
      <div style={dividerStyle} />
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <button
          style={goldBtnStyle}
          onClick={() => setShowGoLive(true)}
        >
          {"\uD83D\uDE80"} Go Live
        </button>
        <p style={{ ...hintStyle, marginTop: 8 }}>
          Runs pre-flight checks and switches platform to live mode.
        </p>
      </div>
    </>
  )

  // ── Tab: Auction ──

  const renderAuction = () => (
    <>
      <div style={cardStyle}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 20,
          }}
        >
          {/* Anti-Sniping */}
          <div>
            <div style={labelStyle}>Anti-Sniping Window</div>
            <p style={hintStyle}>Minutes added when a bid is placed near the end.</p>
            <input
              style={{ ...inputStyle, maxWidth: 120, marginTop: 8 }}
              type="number"
              min={0}
              value={antiSnipe}
              onChange={(e) => setAntiSnipe(Number(e.target.value))}
            />
            <span style={{ fontSize: 12, color: COLORS.muted, marginLeft: 6 }}>
              min
            </span>
          </div>

          {/* Default Duration */}
          <div>
            <div style={labelStyle}>Default Block Duration</div>
            <p style={hintStyle}>Default auction block duration in hours.</p>
            <input
              style={{ ...inputStyle, maxWidth: 120, marginTop: 8 }}
              type="number"
              min={1}
              value={defaultDuration}
              onChange={(e) => setDefaultDuration(Number(e.target.value))}
            />
            <span style={{ fontSize: 12, color: COLORS.muted, marginLeft: 6 }}>
              hours
            </span>
          </div>

          {/* Stagger Interval */}
          <div>
            <div style={labelStyle}>Stagger Interval</div>
            <p style={hintStyle}>Seconds between lot end-times within a block.</p>
            <input
              style={{ ...inputStyle, maxWidth: 120, marginTop: 8 }}
              type="number"
              min={0}
              value={staggerInterval}
              onChange={(e) => setStaggerInterval(Number(e.target.value))}
            />
            <span style={{ fontSize: 12, color: COLORS.muted, marginLeft: 6 }}>
              sec
            </span>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button
            style={{
              ...saveBtnStyle,
              opacity:
                antiSnipe !== config?.auction_anti_snipe_minutes ||
                defaultDuration !== config?.auction_default_duration_hours ||
                staggerInterval !== config?.auction_stagger_interval_seconds
                  ? 1
                  : 0.4,
            }}
            disabled={
              antiSnipe === config?.auction_anti_snipe_minutes &&
              defaultDuration === config?.auction_default_duration_hours &&
              staggerInterval === config?.auction_stagger_interval_seconds
            }
            onClick={() =>
              saveField({
                auction_anti_snipe_minutes: antiSnipe,
                auction_default_duration_hours: defaultDuration,
                auction_stagger_interval_seconds: staggerInterval,
              })
            }
          >
            Save Numbers
          </button>
        </div>
      </div>

      {/* Toggles */}
      <div style={cardStyle}>
        {renderToggleRow(
          "auction_direct_purchase_enabled",
          "Direct Purchase Enabled",
          "Allow users to buy items at fixed price outside of auctions."
        )}
        <div style={dividerStyle} />
        {renderToggleRow(
          "auction_reserve_price_visible",
          "Reserve Price Visible",
          "Show reserve prices on auction lots."
        )}
        <div style={dividerStyle} />
        {renderToggleRow(
          "bid_ending_reminders_enabled",
          "Bid Ending Reminders",
          "Send email reminders before lots end."
        )}
      </div>
    </>
  )

  // ── Tab: Change History ──

  const totalPages = Math.ceil(auditCount / 50)

  const renderHistory = () => (
    <div style={cardStyle}>
      {auditLoading && (
        <p style={{ color: COLORS.muted, fontSize: 13 }}>Loading...</p>
      )}

      {!auditLoading && auditEntries.length === 0 && (
        <p style={{ color: COLORS.muted, fontSize: 13 }}>No changes recorded yet.</p>
      )}

      {!auditLoading && auditEntries.length > 0 && (
        <>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: `1px solid ${COLORS.border}`,
                    textAlign: "left",
                  }}
                >
                  {["Date", "Setting", "Old Value", "New Value", "Changed By"].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding: "8px 10px",
                          fontWeight: 600,
                          color: COLORS.muted,
                          fontSize: 12,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((e) => (
                  <tr
                    key={e.id}
                    style={{ borderBottom: `1px solid ${COLORS.border}` }}
                  >
                    <td
                      style={{
                        padding: "8px 10px",
                        color: COLORS.muted,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {new Date(e.created_at).toLocaleString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td style={{ padding: "8px 10px", color: COLORS.text }}>
                      {e.setting}
                    </td>
                    <td style={{ padding: "8px 10px", color: COLORS.danger }}>
                      {e.old_value ?? "—"}
                    </td>
                    <td style={{ padding: "8px 10px", color: COLORS.success }}>
                      {e.new_value ?? "—"}
                    </td>
                    <td style={{ padding: "8px 10px", color: COLORS.muted }}>
                      {e.changed_by}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 14,
                fontSize: 12,
                color: COLORS.muted,
              }}
            >
              <span>
                Page {auditPage + 1} of {totalPages} ({auditCount} entries)
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  style={{
                    ...btnStyle,
                    background: "rgba(255,255,255,0.08)",
                    color: COLORS.text,
                    opacity: auditPage === 0 ? 0.3 : 1,
                  }}
                  disabled={auditPage === 0}
                  onClick={() => loadAudit(auditPage - 1)}
                >
                  Prev
                </button>
                <button
                  style={{
                    ...btnStyle,
                    background: "rgba(255,255,255,0.08)",
                    color: COLORS.text,
                    opacity: auditPage >= totalPages - 1 ? 0.3 : 1,
                  }}
                  disabled={auditPage >= totalPages - 1}
                  onClick={() => loadAudit(auditPage + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )

  // ── Main render ──

  if (loading) {
    return (
      <div style={{ padding: 32, color: COLORS.muted }}>
        Loading configuration...
      </div>
    )
  }

  if (error && !config) {
    return (
      <div style={{ padding: 32, color: COLORS.danger }}>
        <strong>Error:</strong> {error}
      </div>
    )
  }

  return (
    <div style={{ padding: "24px max(16px, min(36px, 4vw))", maxWidth: 900 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: COLORS.text,
              margin: 0,
            }}
          >
            Configuration
          </h1>
          <p style={{ ...hintStyle, marginTop: 4 }}>
            Platform settings, access control, and auction defaults.
          </p>
        </div>
        {renderModeBadge()}
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            background: "rgba(220,38,38,0.1)",
            border: `1px solid ${COLORS.danger}`,
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 13,
            color: COLORS.danger,
          }}
        >
          {error}
          <button
            style={{
              background: "none",
              border: "none",
              color: COLORS.danger,
              cursor: "pointer",
              float: "right",
              fontWeight: 700,
            }}
            onClick={() => setError("")}
          >
            x
          </button>
        </div>
      )}

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: `1px solid ${COLORS.border}`,
          marginBottom: 20,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            style={{
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? COLORS.gold : COLORS.muted,
              background: "none",
              border: "none",
              borderBottom: tab === t ? `2px solid ${COLORS.gold}` : "2px solid transparent",
              cursor: "pointer",
              transition: "color 0.15s",
            }}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "General" && renderGeneral()}
      {tab === "Access / Launch" && renderAccess()}
      {tab === "Auction" && renderAuction()}
      {tab === "Change History" && renderHistory()}

      {/* Go Live Modal */}
      {showGoLive && (
        <GoLiveModal
          onClose={() => setShowGoLive(false)}
          onSuccess={(cfg) => {
            setConfig(cfg)
            setPlatformMode(cfg.platform_mode)
            setToast("Platform is now LIVE!")
          }}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
    </div>
  )
}

// ─── Route Config ───────────────────────────────────────────────────────────

import { defineRouteConfig } from "@medusajs/admin-sdk"

export const config = defineRouteConfig({
  label: "Configuration",
  icon: undefined,
})

export default ConfigPage
