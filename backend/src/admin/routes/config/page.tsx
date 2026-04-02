import { useEffect, useState, useCallback } from "react"
import { useAdminNav } from "../../components/admin-nav"
import { C, S } from "../../components/admin-tokens"
import { PageHeader, SectionHeader, PageShell, Tabs } from "../../components/admin-layout"
import { Toggle, Toast, Btn, ConfigRow, Modal, Alert, ColorBadge, inputStyle, selectStyle } from "../../components/admin-ui"

// ─── Types ─────────────────────────────────────────────────────────────────

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
  config_key: string
  old_value: string | null
  new_value: string | null
  admin_email: string
  changed_at: string
}

interface GoLiveCheck {
  label: string
  ok: boolean
  detail?: string
}

// ─── Constants ─────────────────────────────────────────────────────────────

const TABS = ["Access / Launch", "Auction", "Change History"] as const

const MODE_OPTIONS = [
  { value: "beta_test", label: "BETA TEST", color: "#f97316" },
  { value: "pre_launch", label: "PRE-LAUNCH", color: C.warning },
  { value: "preview", label: "PREVIEW", color: C.blue },
  { value: "live", label: "LIVE", color: C.success },
  { value: "maintenance", label: "MAINTENANCE", color: C.error },
] as const

const SENSITIVE_KEYS = ["gate_password"]

function getModeInfo(mode: string) {
  return MODE_OPTIONS.find((m) => m.value === mode) || MODE_OPTIONS[0]
}

// ─── API Helper ────────────────────────────────────────────────────────────

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

// ─── Small Stat Badge (for stats row) ──────────────────────────────────────

function StatBadge({ on, label }: { on: boolean; label: string }) {
  const color = on ? C.success : C.muted
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        color,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          background: on ? C.success : C.border,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  )
}

// ─── Go Live Modal ─────────────────────────────────────────────────────────

function GoLiveModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (cfg: SiteConfig) => void }) {
  const [checks, setChecks] = useState<GoLiveCheck[] | null>(null)
  const [allPassed, setAllPassed] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  useEffect(() => {
    apiFetch<{ checks: GoLiveCheck[]; all_passed: boolean }>("/admin/site-config/go-live")
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
      const data = await apiFetch<{ config: SiteConfig; checks: GoLiveCheck[]; message: string }>("/admin/site-config/go-live", {
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

  const canConfirm = confirmation === "GO LIVE" && !submitting

  return (
    <Modal
      title="Pre-Flight Checklist"
      subtitle="Review these checks before making the storefront publicly accessible."
      onClose={onClose}
      footer={
        checks && !success ? (
          <>
            <Btn label="Cancel" variant="ghost" onClick={onClose} />
            <Btn
              label={submitting ? "Going live..." : "Remove Password Gate & Go Live"}
              variant="danger"
              disabled={!canConfirm}
              onClick={handleConfirm}
            />
          </>
        ) : undefined
      }
    >
      {loading && <p style={{ color: C.muted, fontSize: 13 }}>Running checks...</p>}

      {error && <p style={{ color: C.error, fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {success && <p style={{ color: C.success, fontSize: 14, fontWeight: 600 }}>{success}</p>}

      {checks && !success && (
        <>
          <div>
            {checks.map((c, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: i < checks.length - 1 ? "1px solid " + C.border + "60" : "none",
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: c.ok ? C.success + "20" : C.warning + "20",
                    color: c.ok ? C.success : C.warning,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {c.ok ? "\u2713" : "!"}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{c.label}</div>
                  {c.detail && (
                    <div style={{ fontSize: 11, color: c.ok ? C.muted : C.warning, marginTop: 1 }}>{c.detail}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!allPassed && (
            <Alert type="warning" style={{ marginTop: 14 }}>
              Some checks did not pass. You can still go live, but review the warnings above.
            </Alert>
          )}

          {/* Confirm input */}
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid " + C.border }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
              Type <strong style={{ color: C.text }}>GO LIVE</strong> to confirm
            </div>
            <input
              style={{
                ...inputStyle,
                maxWidth: "100%",
                fontFamily: "monospace",
                letterSpacing: "0.06em",
                boxSizing: "border-box" as const,
              }}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="GO LIVE"
              autoFocus
            />
          </div>
        </>
      )}
    </Modal>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────

function ConfigPage() {
  useAdminNav()

  const [config, setConfig] = useState<SiteConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<string>("Access / Launch")
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const [showGoLive, setShowGoLive] = useState(false)

  // Audit log
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [auditCount, setAuditCount] = useState(0)
  const [auditPage, setAuditPage] = useState(0)
  const [auditLoading, setAuditLoading] = useState(false)

  // Form state (explicit save fields)
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

  useEffect(() => { loadConfig() }, [loadConfig])

  // ── Load audit ──

  const loadAudit = useCallback(async (page: number) => {
    setAuditLoading(true)
    try {
      const data = await apiFetch<{ entries: AuditEntry[]; count: number }>(
        `/admin/site-config/audit-log?limit=50&offset=${page * 50}`
      )
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
      setToast({ message: "Saved", type: "success" })
    } catch (e: any) {
      setToast({ message: e.message, type: "error" })
    }
  }

  const toggleField = (key: keyof SiteConfig) => {
    if (!config) return
    saveField({ [key]: !config[key] } as any)
  }

  // ── Dirty check for auction numbers ──

  const auctionNumbersDirty =
    antiSnipe !== config?.auction_anti_snipe_minutes ||
    defaultDuration !== config?.auction_default_duration_hours ||
    staggerInterval !== config?.auction_stagger_interval_seconds

  // ── Loading / Error states ──

  if (loading) {
    return (
      <PageShell>
        <div style={{ color: C.muted, fontSize: 13 }}>Loading configuration...</div>
      </PageShell>
    )
  }

  if (error && !config) {
    return (
      <PageShell>
        <Alert type="error">
          <strong>Error:</strong> {error}
        </Alert>
      </PageShell>
    )
  }

  const isLive = config?.platform_mode === "live"
  const modeInfo = getModeInfo(config?.platform_mode || "pre_launch")

  // ── Tab: Access / Launch ──

  const renderAccess = () => (
    <div>
      {/* Live banner */}
      {isLive && (
        <Alert type="success" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                background: C.success + "20",
                color: C.success,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {"\u2713"}
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.success }}>Site is Live</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                The storefront is publicly accessible. Password gate is disabled.
              </div>
            </div>
          </div>
        </Alert>
      )}

      {/* Platform Mode */}
      <SectionHeader title="Platform Mode" />

      <ConfigRow label="Current Mode" hint="Controls the overall state of the storefront.">
        <select
          style={selectStyle}
          value={platformMode}
          onChange={(e) => setPlatformMode(e.target.value)}
        >
          {MODE_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <Btn
          label="Save"
          variant="gold"
          disabled={platformMode === config?.platform_mode}
          onClick={() => saveField({ platform_mode: platformMode })}
        />
      </ConfigRow>

      {/* Warning when not live */}
      {!isLive && (
        <Alert type="warning" style={{ marginTop: 10 }}>
          The storefront is not publicly accessible. Visitors must enter the gate password or have an invite.
        </Alert>
      )}

      <div style={{ height: 20 }} />

      {/* Password Gate */}
      <SectionHeader title="Password Gate" />

      <ConfigRow label="Gate Password" hint="Password visitors must enter to access the storefront.">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {showPassword ? (
              <input
                style={{ ...inputStyle, maxWidth: 160 }}
                value={gatePassword}
                onChange={(e) => setGatePassword(e.target.value)}
              />
            ) : (
              <span
                style={{
                  padding: "7px 11px",
                  borderRadius: 6,
                  border: "1px solid " + C.border,
                  background: C.bg,
                  color: C.muted,
                  fontSize: 14,
                  letterSpacing: "0.18em",
                  display: "inline-block",
                  minWidth: 90,
                }}
              >
                {"\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF"}
              </span>
            )}
          </div>
          <Btn
            label={showPassword ? "Hide" : "Show"}
            variant="ghost"
            onClick={() => setShowPassword(!showPassword)}
          />
          {showPassword && (
            <Btn
              label="Save"
              variant="gold"
              disabled={gatePassword === config?.gate_password}
              onClick={() => saveField({ gate_password: gatePassword })}
            />
          )}
        </div>
      </ConfigRow>

      <div style={{ height: 20 }} />

      {/* Invite System */}
      <SectionHeader title="Invite System" />

      <ConfigRow label="Invite Mode Active" hint="Only invited users can access the storefront.">
        <Toggle active={!!config?.invite_mode_active} onChange={() => toggleField("invite_mode_active")} />
      </ConfigRow>

      <ConfigRow label="/apply Page Visible" hint="Show the application page for early access.">
        <Toggle active={!!config?.apply_page_visible} onChange={() => toggleField("apply_page_visible")} />
      </ConfigRow>

      <ConfigRow label="Show Waitlist Counter" hint="Show how many people are on the waitlist.">
        <Toggle active={!!config?.waitlist_counter_visible} onChange={() => toggleField("waitlist_counter_visible")} />
      </ConfigRow>

      <div style={{ height: 20 }} />

      {/* Catalog */}
      <SectionHeader title="Catalog" />

      <ConfigRow
        label="Catalog Visibility"
        hint={'"visible" shows only releases with cover images. "all" shows everything.'}
      >
        <select
          style={selectStyle}
          value={catalogVis}
          onChange={(e) => setCatalogVis(e.target.value)}
        >
          <option value="visible">visible</option>
          <option value="all">all</option>
        </select>
        <Btn
          label="Save"
          variant="gold"
          disabled={catalogVis === config?.catalog_visibility}
          onClick={() => saveField({ catalog_visibility: catalogVis })}
        />
      </ConfigRow>

      {/* Go Live button */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          paddingTop: 20,
          marginTop: 12,
          borderTop: "1px solid " + C.border,
        }}
      >
        <button
          style={{
            background: isLive ? C.card : "linear-gradient(135deg, #d4a54a, #b8883a)",
            color: isLive ? C.muted : "#0d0b08",
            fontWeight: 700,
            fontSize: 13,
            padding: "10px 24px",
            borderRadius: 7,
            border: "none",
            cursor: isLive ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            opacity: isLive ? 0.5 : 1,
          }}
          disabled={isLive}
          onClick={() => setShowGoLive(true)}
        >
          {isLive ? "Already Live" : "Go Live \u2014 Launch Site \u2192"}
        </button>
      </div>
    </div>
  )

  // ── Tab: Auction ──

  const numInputStyle: React.CSSProperties = {
    ...inputStyle,
    width: 70,
    maxWidth: 70,
    textAlign: "center" as const,
  }

  const renderAuction = () => (
    <div>
      <SectionHeader title="Timing" />

      <ConfigRow label="Anti-Sniping Window" hint="Minutes added when a bid is placed near the end.">
        <input
          type="number"
          min={0}
          value={antiSnipe}
          onChange={(e) => setAntiSnipe(Number(e.target.value))}
          style={numInputStyle}
        />
        <span style={{ fontSize: 12, color: C.muted }}>minutes</span>
      </ConfigRow>

      <ConfigRow label="Default Block Duration" hint="Default auction block duration.">
        <input
          type="number"
          min={1}
          value={defaultDuration}
          onChange={(e) => setDefaultDuration(Number(e.target.value))}
          style={numInputStyle}
        />
        <span style={{ fontSize: 12, color: C.muted }}>
          hours ({Math.round((defaultDuration / 24) * 10) / 10}d)
        </span>
      </ConfigRow>

      <ConfigRow label="Lot Stagger Interval" hint="Seconds between lot end-times within a block.">
        <input
          type="number"
          min={0}
          value={staggerInterval}
          onChange={(e) => setStaggerInterval(Number(e.target.value))}
          style={numInputStyle}
        />
        <span style={{ fontSize: 12, color: C.muted }}>seconds</span>
      </ConfigRow>

      {/* Save bar for numbers */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          paddingTop: 14,
          marginTop: 8,
          borderTop: "1px solid " + C.border,
        }}
      >
        <Btn
          label="Save Timing"
          variant="gold"
          disabled={!auctionNumbersDirty}
          onClick={() =>
            saveField({
              auction_anti_snipe_minutes: antiSnipe,
              auction_default_duration_hours: defaultDuration,
              auction_stagger_interval_seconds: staggerInterval,
            })
          }
        />
      </div>

      <div style={{ height: 20 }} />

      <SectionHeader title="Features" />

      <ConfigRow label="Direct Purchase" hint="Allow users to buy items at fixed price outside of auctions.">
        <Toggle active={!!config?.auction_direct_purchase_enabled} onChange={() => toggleField("auction_direct_purchase_enabled")} />
      </ConfigRow>

      <ConfigRow label="Reserve Price Visible" hint="Show reserve prices on auction lots.">
        <Toggle active={!!config?.auction_reserve_price_visible} onChange={() => toggleField("auction_reserve_price_visible")} />
      </ConfigRow>

      <ConfigRow label="Bid Ending Reminders" hint="Send email reminders before lots end.">
        <Toggle active={!!config?.bid_ending_reminders_enabled} onChange={() => toggleField("bid_ending_reminders_enabled")} />
      </ConfigRow>
    </div>
  )

  // ── Tab: Change History ──

  const totalPages = Math.ceil(auditCount / 50)

  const formatAuditValue = (value: string | null, key: string) => {
    if (value === null || value === undefined) return <span style={{ color: C.muted }}>{"\u2014"}</span>
    if (SENSITIVE_KEYS.includes(key)) {
      return <span style={{ color: C.muted, letterSpacing: "0.12em", fontSize: 13 }}>{"\u25CF\u25CF\u25CF\u25CF\u25CF"}</span>
    }
    return (
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 11,
          background: C.bg,
          padding: "2px 6px",
          borderRadius: 3,
          color: C.gold,
        }}
      >
        {value}
      </span>
    )
  }

  const renderHistory = () => (
    <div>
      {auditLoading && <p style={{ color: C.muted, fontSize: 13 }}>Loading...</p>}

      {!auditLoading && auditEntries.length === 0 && (
        <p style={{ color: C.muted, fontSize: 13 }}>No changes recorded yet.</p>
      )}

      {!auditLoading && auditEntries.length > 0 && (
        <>
          <div style={{ border: "1px solid " + C.border, borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  {["Time", "Setting", "Old Value", "New Value", "Actor"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 14px",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase" as const,
                        color: C.muted,
                        textAlign: "left" as const,
                        background: "#f3f2f1",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((e, idx) => {
                  const date = new Date(e.changed_at)
                  return (
                    <tr
                      key={e.id}
                      style={{ transition: "background 0.1s" }}
                      onMouseEnter={(ev) => { (ev.currentTarget as HTMLElement).style.background = C.hover }}
                      onMouseLeave={(ev) => { (ev.currentTarget as HTMLElement).style.background = "transparent" }}
                    >
                      <td
                        style={{
                          padding: "10px 14px",
                          borderBottom: idx < auditEntries.length - 1 ? "1px solid " + C.border + "80" : "none",
                          verticalAlign: "top" as const,
                          whiteSpace: "nowrap" as const,
                        }}
                      >
                        <div style={{ color: C.text, fontSize: 12 }}>
                          {date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        </div>
                        <div style={{ fontSize: 11, color: C.muted }}>
                          {date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          color: C.text,
                          borderBottom: idx < auditEntries.length - 1 ? "1px solid " + C.border + "80" : "none",
                          verticalAlign: "top" as const,
                          fontSize: 12,
                        }}
                      >
                        {e.config_key}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          borderBottom: idx < auditEntries.length - 1 ? "1px solid " + C.border + "80" : "none",
                          verticalAlign: "top" as const,
                        }}
                      >
                        {formatAuditValue(e.old_value, e.config_key)}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          borderBottom: idx < auditEntries.length - 1 ? "1px solid " + C.border + "80" : "none",
                          verticalAlign: "top" as const,
                        }}
                      >
                        {formatAuditValue(e.new_value, e.config_key)}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          borderBottom: idx < auditEntries.length - 1 ? "1px solid " + C.border + "80" : "none",
                          verticalAlign: "top" as const,
                          fontSize: 11,
                          color: C.muted,
                        }}
                      >
                        {e.admin_email}
                      </td>
                    </tr>
                  )
                })}
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
                marginTop: 16,
                fontSize: 12,
                color: C.muted,
              }}
            >
              <span>
                Page {auditPage + 1} of {totalPages} ({auditCount} entries)
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn
                  label="Prev"
                  variant="ghost"
                  disabled={auditPage === 0}
                  onClick={() => loadAudit(auditPage - 1)}
                />
                <Btn
                  label="Next"
                  variant="ghost"
                  disabled={auditPage >= totalPages - 1}
                  onClick={() => loadAudit(auditPage + 1)}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )

  // ── Main Render ──

  return (
    <PageShell maxWidth={880}>
      {/* Page Header */}
      <PageHeader
        title="Configuration"
        subtitle="Platform settings, access control, and auction defaults."
        badge={{ label: modeInfo.label, color: modeInfo.color }}
      />

      {/* Stats Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          background: C.border,
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <div style={{ background: C.card, padding: "14px 18px", textAlign: "center" as const }}>
          <div style={{ marginBottom: 4 }}>
            <ColorBadge label={modeInfo.label} color={modeInfo.color} />
          </div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
            Platform Mode
          </div>
        </div>
        <div style={{ background: C.card, padding: "14px 18px", textAlign: "center" as const }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.gold, marginBottom: 4 }}>
            {config?.catalog_visibility === "all" ? "All" : "Visible"}
          </div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
            Catalog
          </div>
        </div>
        <div style={{ background: C.card, padding: "14px 18px", textAlign: "center" as const }}>
          <div style={{ marginBottom: 4 }}>
            <StatBadge on={!!config?.auction_direct_purchase_enabled} label={config?.auction_direct_purchase_enabled ? "ON" : "OFF"} />
          </div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
            Direct Purchase
          </div>
        </div>
        <div style={{ background: C.card, padding: "14px 18px", textAlign: "center" as const }}>
          <div style={{ marginBottom: 4 }}>
            <StatBadge on={!!config?.bid_ending_reminders_enabled} label={config?.bid_ending_reminders_enabled ? "ON" : "OFF"} />
          </div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
            Bid Reminders
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <Alert type="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}

      {/* Tabs */}
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {/* Tab content */}
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
            setToast({ message: "Platform is now LIVE!", type: "success" })
          }}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </PageShell>
  )
}

export default ConfigPage
