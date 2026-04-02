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

// ─── Constants ──────────────────────────────────────────────────────────────

const TABS = ["General", "Access / Launch", "Auction", "Change History"] as const
type Tab = (typeof TABS)[number]

const MODE_OPTIONS: {
  value: string
  label: string
  icon: string
  badgeClass: string
  color: string
  bgColor: string
  borderColor: string
}[] = [
  {
    value: "pre_launch",
    label: "PRE-LAUNCH",
    icon: "\uD83D\uDD12",
    badgeClass: "yellow",
    color: "#eab308",
    bgColor: "rgba(234, 179, 8, 0.15)",
    borderColor: "rgba(234, 179, 8, 0.3)",
  },
  {
    value: "preview",
    label: "PREVIEW",
    icon: "\uD83D\uDC41",
    badgeClass: "blue",
    color: "#3b82f6",
    bgColor: "rgba(59, 130, 246, 0.15)",
    borderColor: "rgba(59, 130, 246, 0.3)",
  },
  {
    value: "live",
    label: "LIVE",
    icon: "\u2705",
    badgeClass: "green",
    color: "#22c55e",
    bgColor: "rgba(34, 197, 94, 0.15)",
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  {
    value: "maintenance",
    label: "MAINTENANCE",
    icon: "\uD83D\uDD27",
    badgeClass: "red",
    color: "#ef4444",
    bgColor: "rgba(239, 68, 68, 0.15)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
]

const SENSITIVE_KEYS = ["gate_password"]

function getModeInfo(mode: string) {
  return MODE_OPTIONS.find((m) => m.value === mode) || MODE_OPTIONS[0]
}

// ─── Helper: API fetch ──────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
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
    const t = setTimeout(onDone, 2200)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        background: "#161310",
        border: "1px solid rgba(34, 197, 94, 0.4)",
        color: "#22c55e",
        padding: "10px 20px",
        borderRadius: 7,
        fontSize: 12.5,
        fontWeight: 600,
        zIndex: 9999,
        boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 14 }}>{"\u2713"}</span>
      {message}
    </div>
  )
}

// ─── Toggle ─────────────────────────────────────────────────────────────────

function Toggle({
  active,
  onClick,
}: {
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: active ? "#22c55e" : "#2a2520",
        position: "relative",
        cursor: "pointer",
        border: "none",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: active ? 19 : 3,
          width: 14,
          height: 14,
          borderRadius: 7,
          background: "#fff",
          transition: "left 0.2s",
        }}
      />
    </button>
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
        background: "rgba(13, 11, 8, 0.85)",
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
          border: "1px solid #2a2520",
          borderRadius: 12,
          width: "100%",
          maxWidth: 560,
          maxHeight: "80vh",
          overflowY: "auto",
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            background: "#161310",
            borderBottom: "1px solid #2a2520",
            padding: "20px 24px",
          }}
        >
          <h3
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: "#e8e0d4",
              margin: "0 0 4px",
            }}
          >
            Before you go live — Pre-Flight Checklist
          </h3>
          <p style={{ fontSize: 12.5, color: "#a39d96", margin: 0 }}>
            Review these checks before making the storefront publicly accessible.
          </p>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px 24px" }}>
          {loading && (
            <p style={{ color: "#6b6560", fontSize: 13 }}>
              Running checks...
            </p>
          )}

          {error && (
            <p
              style={{
                color: "#ef4444",
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              {error}
            </p>
          )}

          {success && (
            <p
              style={{
                color: "#22c55e",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {success}
            </p>
          )}

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
                      borderBottom:
                        i < checks.length - 1
                          ? "1px solid #1a1714"
                          : "none",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 15,
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      {c.ok ? "\u2705" : "\u26A0\uFE0F"}
                    </span>
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "#e8e0d4",
                        }}
                      >
                        {c.label}
                      </div>
                      {c.detail && (
                        <div
                          style={{
                            fontSize: 11.5,
                            color: c.ok ? "#6b6560" : "#eab308",
                            marginTop: 1,
                          }}
                        >
                          {c.detail}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {!allPassed && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    background: "rgba(234, 179, 8, 0.06)",
                    border: "1px solid rgba(234, 179, 8, 0.2)",
                    borderRadius: 6,
                    padding: "10px 14px",
                    fontSize: 11.5,
                    color: "#a39d96",
                    margin: "14px 0 0",
                  }}
                >
                  <span style={{ color: "#eab308", flexShrink: 0 }}>
                    {"\u26A0\uFE0F"}
                  </span>
                  <span>
                    Some checks did not pass. You can still go live, but
                    review the warnings above.
                  </span>
                </div>
              )}

              {/* Confirm input */}
              <div
                style={{
                  marginTop: 18,
                  paddingTop: 18,
                  borderTop: "1px solid #2a2520",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "#a39d96",
                    marginBottom: 8,
                  }}
                >
                  Type <strong style={{ color: "#e8e0d4" }}>GO LIVE</strong>{" "}
                  to confirm
                </div>
                <input
                  style={{
                    width: "100%",
                    background: "#0f0d0a",
                    border: "1px solid #2a2520",
                    borderRadius: 6,
                    padding: "9px 14px",
                    fontSize: 13,
                    color: "#e8e0d4",
                    fontFamily: "'Courier New', monospace",
                    letterSpacing: "0.06em",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="GO LIVE"
                  autoFocus
                />
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 14,
                }}
              >
                <button
                  style={{
                    background: "transparent",
                    border: "1px solid #2a2520",
                    color: "#a39d96",
                    fontSize: 13,
                    padding: "10px 20px",
                    borderRadius: 7,
                    cursor: "pointer",
                  }}
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  style={{
                    background:
                      confirmation === "GO LIVE" && !submitting
                        ? "rgba(239, 68, 68, 0.1)"
                        : "rgba(239, 68, 68, 0.05)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    color: "#ef4444",
                    fontWeight: 700,
                    fontSize: 13,
                    padding: "10px 24px",
                    borderRadius: 7,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    cursor:
                      confirmation === "GO LIVE" && !submitting
                        ? "pointer"
                        : "not-allowed",
                    opacity:
                      confirmation === "GO LIVE" && !submitting ? 1 : 0.4,
                  }}
                  disabled={confirmation !== "GO LIVE" || submitting}
                  onClick={handleConfirm}
                >
                  {submitting
                    ? "Going live..."
                    : "\uD83D\uDE80 Remove Password Gate & Go Live"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Reusable: Section Title ────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase" as const,
        color: "#6b6560",
        marginBottom: 14,
        paddingBottom: 8,
        borderBottom: "1px solid #2a2520",
      }}
    >
      {children}
    </div>
  )
}

// ─── Reusable: Config Row ───────────────────────────────────────────────────

function ConfigRow({
  label,
  hint,
  children,
  noBorder,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  noBorder?: boolean
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 0",
        borderBottom: noBorder ? "none" : "1px solid #1a1714",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            color: "#e8e0d4",
            fontWeight: 500,
          }}
        >
          {label}
        </div>
        {hint && (
          <div
            style={{
              fontSize: 11,
              color: "#6b6560",
              marginTop: 2,
            }}
          >
            {hint}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ─── Reusable: Section Divider ──────────────────────────────────────────────

function SectionDivider() {
  return (
    <hr
      style={{
        border: "none",
        borderTop: "1px solid #2a2520",
        margin: "16px 0",
      }}
    />
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
      setToast("Saved")
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

  // ── Platform mode badge ──

  const renderModeBadge = () => {
    if (!config) return null
    const info = getModeInfo(config.platform_mode)
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "4px 10px",
          borderRadius: 4,
          background: info.bgColor,
          color: info.color,
          border: `1px solid ${info.borderColor}`,
        }}
      >
        {info.icon} {info.label}
      </span>
    )
  }

  // ── Tab: General ──

  const renderGeneral = () => (
    <div>
      <SectionTitle>Catalog</SectionTitle>

      <ConfigRow
        label="Catalog Visibility"
        hint={`"visible" shows only releases with cover images. "all" shows everything.`}
        noBorder
      >
        <select
          style={{
            background: "#1c1915",
            border: "1px solid #2a2520",
            borderRadius: 5,
            padding: "5px 12px",
            fontSize: 12.5,
            color: "#e8e0d4",
            cursor: "pointer",
            outline: "none",
          }}
          value={catalogVis}
          onChange={(e) => setCatalogVis(e.target.value)}
        >
          <option value="visible">visible</option>
          <option value="all">all</option>
        </select>
        <button
          style={{
            background: "#1c1915",
            border: "1px solid #2a2520",
            borderRadius: 5,
            padding: "5px 10px",
            fontSize: 11,
            color:
              catalogVis !== config?.catalog_visibility
                ? "#e8e0d4"
                : "#6b6560",
            cursor:
              catalogVis !== config?.catalog_visibility
                ? "pointer"
                : "default",
            opacity: catalogVis !== config?.catalog_visibility ? 1 : 0.5,
          }}
          disabled={catalogVis === config?.catalog_visibility}
          onClick={() => saveField({ catalog_visibility: catalogVis })}
        >
          Save
        </button>
      </ConfigRow>
    </div>
  )

  // ── Tab: Access / Launch ──

  const renderAccess = () => (
    <div>
      {/* Platform Mode */}
      <SectionTitle>Platform Mode</SectionTitle>

      <ConfigRow
        label="Current Mode"
        hint="Controls the overall state of the storefront."
      >
        <select
          style={{
            background: "#1c1915",
            border: "1px solid #2a2520",
            borderRadius: 5,
            padding: "5px 12px",
            fontSize: 12.5,
            color: "#e8e0d4",
            cursor: "pointer",
            outline: "none",
          }}
          value={platformMode}
          onChange={(e) => setPlatformMode(e.target.value)}
        >
          {MODE_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          style={{
            background: "#1c1915",
            border: "1px solid #2a2520",
            borderRadius: 5,
            padding: "5px 10px",
            fontSize: 11,
            color:
              platformMode !== config?.platform_mode ? "#e8e0d4" : "#6b6560",
            cursor:
              platformMode !== config?.platform_mode ? "pointer" : "default",
            opacity: platformMode !== config?.platform_mode ? 1 : 0.5,
          }}
          disabled={platformMode === config?.platform_mode}
          onClick={() => saveField({ platform_mode: platformMode })}
        >
          Save
        </button>
      </ConfigRow>

      {/* Warning note */}
      {config?.platform_mode !== "live" && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            background: "rgba(234, 179, 8, 0.06)",
            border: "1px solid rgba(234, 179, 8, 0.2)",
            borderRadius: 6,
            padding: "10px 14px",
            fontSize: 11.5,
            color: "#a39d96",
            margin: "12px 0",
          }}
        >
          <span style={{ color: "#eab308", flexShrink: 0 }}>
            {"\u26A0\uFE0F"}
          </span>
          <span>
            The storefront is not publicly accessible. Visitors must enter the
            gate password or have an invite to access the site.
          </span>
        </div>
      )}

      <SectionDivider />

      {/* Password Gate */}
      <SectionTitle>Password Gate</SectionTitle>

      <ConfigRow
        label="Gate Password"
        hint="Password visitors must enter to access the storefront."
        noBorder
      >
        <div
          style={{
            background: "#1c1915",
            border: "1px solid #2a2520",
            borderRadius: 5,
            padding: "5px 10px",
            fontSize: 13,
            color: "#e8e0d4",
            letterSpacing: showPassword ? "normal" : "0.18em",
            display: "inline-flex",
            alignItems: "center",
            minWidth: 100,
          }}
        >
          {showPassword ? gatePassword : "\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF"}
        </div>
        {showPassword && (
          <input
            style={{
              background: "#1c1915",
              border: "1px solid #2a2520",
              borderRadius: 5,
              padding: "5px 10px",
              fontSize: 12.5,
              color: "#e8e0d4",
              outline: "none",
              width: 140,
            }}
            value={gatePassword}
            onChange={(e) => setGatePassword(e.target.value)}
          />
        )}
        <button
          style={{
            background: "#1c1915",
            border: "1px solid #2a2520",
            borderRadius: 5,
            padding: "5px 10px",
            fontSize: 11,
            color: "#a39d96",
            cursor: "pointer",
          }}
          onClick={() => setShowPassword(!showPassword)}
        >
          {showPassword ? "Hide" : "Show"}
        </button>
        {showPassword && (
          <button
            style={{
              background: "#1c1915",
              border: "1px solid #2a2520",
              borderRadius: 5,
              padding: "5px 10px",
              fontSize: 11,
              color:
                gatePassword !== config?.gate_password
                  ? "#e8e0d4"
                  : "#6b6560",
              cursor:
                gatePassword !== config?.gate_password
                  ? "pointer"
                  : "default",
              opacity: gatePassword !== config?.gate_password ? 1 : 0.5,
            }}
            disabled={gatePassword === config?.gate_password}
            onClick={() => saveField({ gate_password: gatePassword })}
          >
            Save
          </button>
        )}
      </ConfigRow>

      <SectionDivider />

      {/* Invite System */}
      <SectionTitle>Invite System</SectionTitle>

      <ConfigRow
        label="Invite Mode Active"
        hint="Only invited users can access the storefront."
      >
        <Toggle
          active={!!config?.invite_mode_active}
          onClick={() => toggleField("invite_mode_active")}
        />
      </ConfigRow>

      <ConfigRow
        label="/apply Page Visible"
        hint="Show the application page for early access."
      >
        <Toggle
          active={!!config?.apply_page_visible}
          onClick={() => toggleField("apply_page_visible")}
        />
      </ConfigRow>

      <ConfigRow
        label="Show Waitlist Counter"
        hint="Show how many people are on the waitlist."
        noBorder
      >
        <Toggle
          active={!!config?.waitlist_counter_visible}
          onClick={() => toggleField("waitlist_counter_visible")}
        />
      </ConfigRow>

      {/* Go Live row */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          paddingTop: 16,
          marginTop: 4,
          borderTop: "1px solid #2a2520",
        }}
      >
        <button
          style={{
            background: "linear-gradient(135deg, #d4a54a, #b8883a)",
            color: "#0d0b08",
            fontWeight: 700,
            fontSize: 13,
            padding: "10px 24px",
            borderRadius: 7,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            letterSpacing: "0.02em",
            border: "none",
          }}
          onClick={() => setShowGoLive(true)}
        >
          Go Live — Launch Site {"\u2192"}
        </button>
      </div>
    </div>
  )

  // ── Tab: Auction ──

  const auctionNumbersDirty =
    antiSnipe !== config?.auction_anti_snipe_minutes ||
    defaultDuration !== config?.auction_default_duration_hours ||
    staggerInterval !== config?.auction_stagger_interval_seconds

  const renderAuction = () => (
    <div>
      <SectionTitle>Auction Settings</SectionTitle>

      <ConfigRow
        label="Anti-Sniping Window"
        hint="Minutes added when a bid is placed near the end."
      >
        <input
          type="number"
          min={0}
          value={antiSnipe}
          onChange={(e) => setAntiSnipe(Number(e.target.value))}
          style={{
            background: "#1c1915",
            border: "1px solid #2a2520",
            borderRadius: 5,
            padding: "5px 10px",
            fontSize: 12.5,
            color: "#e8e0d4",
            width: 60,
            textAlign: "center",
            outline: "none",
          }}
        />
        <span style={{ fontSize: 12, color: "#6b6560" }}>minutes</span>
      </ConfigRow>

      <ConfigRow
        label="Default Block Duration"
        hint="Default auction block duration."
      >
        <input
          type="number"
          min={1}
          value={defaultDuration}
          onChange={(e) => setDefaultDuration(Number(e.target.value))}
          style={{
            background: "#1c1915",
            border: "1px solid #2a2520",
            borderRadius: 5,
            padding: "5px 10px",
            fontSize: 12.5,
            color: "#e8e0d4",
            width: 60,
            textAlign: "center",
            outline: "none",
          }}
        />
        <span style={{ fontSize: 12, color: "#6b6560" }}>
          hours ({Math.round(defaultDuration / 24 * 10) / 10} days)
        </span>
      </ConfigRow>

      <ConfigRow
        label="Lot Stagger Interval"
        hint="Seconds between lot end-times within a block."
      >
        <input
          type="number"
          min={0}
          value={staggerInterval}
          onChange={(e) => setStaggerInterval(Number(e.target.value))}
          style={{
            background: "#1c1915",
            border: "1px solid #2a2520",
            borderRadius: 5,
            padding: "5px 10px",
            fontSize: 12.5,
            color: "#e8e0d4",
            width: 60,
            textAlign: "center",
            outline: "none",
          }}
        />
        <span style={{ fontSize: 12, color: "#6b6560" }}>seconds</span>
      </ConfigRow>

      <ConfigRow
        label="Direct Purchase"
        hint="Allow users to buy items at fixed price outside of auctions."
      >
        <Toggle
          active={!!config?.auction_direct_purchase_enabled}
          onClick={() => toggleField("auction_direct_purchase_enabled")}
        />
      </ConfigRow>

      <ConfigRow
        label="Reserve Price Visible"
        hint="Show reserve prices on auction lots."
      >
        <Toggle
          active={!!config?.auction_reserve_price_visible}
          onClick={() => toggleField("auction_reserve_price_visible")}
        />
      </ConfigRow>

      <ConfigRow
        label="Bid Ending Reminders"
        hint="Send email reminders before lots end."
        noBorder
      >
        <Toggle
          active={!!config?.bid_ending_reminders_enabled}
          onClick={() => toggleField("bid_ending_reminders_enabled")}
        />
      </ConfigRow>

      {/* Save Changes row */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          paddingTop: 16,
          marginTop: 4,
          borderTop: "1px solid #2a2520",
        }}
      >
        <button
          style={{
            background: auctionNumbersDirty
              ? "linear-gradient(135deg, #d4a54a, #b8883a)"
              : "#2a2520",
            color: auctionNumbersDirty ? "#0d0b08" : "#6b6560",
            fontWeight: 700,
            fontSize: 13,
            padding: "10px 24px",
            borderRadius: 7,
            border: "none",
            cursor: auctionNumbersDirty ? "pointer" : "default",
            letterSpacing: "0.02em",
          }}
          disabled={!auctionNumbersDirty}
          onClick={() =>
            saveField({
              auction_anti_snipe_minutes: antiSnipe,
              auction_default_duration_hours: defaultDuration,
              auction_stagger_interval_seconds: staggerInterval,
            })
          }
        >
          Save Changes
        </button>
      </div>
    </div>
  )

  // ── Tab: Change History ──

  const totalPages = Math.ceil(auditCount / 50)

  const formatAuditValue = (
    value: string | null,
    key: string,
    isMasked: boolean
  ) => {
    if (value === null || value === undefined) return "\u2014"
    if (isMasked) {
      return (
        <span
          style={{
            color: "#6b6560",
            letterSpacing: "0.12em",
            fontSize: 13,
          }}
        >
          {"\u25CF\u25CF\u25CF\u25CF\u25CF"}
        </span>
      )
    }
    return (
      <span
        style={{
          fontFamily: "'Courier New', monospace",
          fontSize: 11.5,
          background: "#0f0d0a",
          padding: "2px 6px",
          borderRadius: 3,
          color: "#d4a54a",
        }}
      >
        {value}
      </span>
    )
  }

  const renderHistory = () => (
    <div>
      {auditLoading && (
        <p style={{ color: "#6b6560", fontSize: 13 }}>Loading...</p>
      )}

      {!auditLoading && auditEntries.length === 0 && (
        <p style={{ color: "#6b6560", fontSize: 13 }}>
          No changes recorded yet.
        </p>
      )}

      {!auditLoading && auditEntries.length > 0 && (
        <>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12.5,
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid #2a2520",
                  }}
                >
                  {["Time", "Setting", "Old Value", "New Value", "Actor"].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 14px",
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: "#6b6560",
                          textAlign: "left",
                          background: "#100e0b",
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((e) => {
                  const date = new Date(e.changed_at)
                  const isSensitive = SENSITIVE_KEYS.includes(e.config_key)
                  return (
                    <tr key={e.id}>
                      <td
                        style={{
                          padding: "11px 14px",
                          borderBottom: "1px solid #1a1714",
                          verticalAlign: "top",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <div
                          style={{
                            color: "#e8e0d4",
                            fontSize: 12.5,
                          }}
                        >
                          {date.toLocaleDateString("de-DE", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "#6b6560",
                          }}
                        >
                          {date.toLocaleTimeString("de-DE", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "11px 14px",
                          color: "#e8e0d4",
                          borderBottom: "1px solid #1a1714",
                          verticalAlign: "top",
                        }}
                      >
                        {e.config_key}
                      </td>
                      <td
                        style={{
                          padding: "11px 14px",
                          borderBottom: "1px solid #1a1714",
                          verticalAlign: "top",
                          color: "#a39d96",
                        }}
                      >
                        {formatAuditValue(e.old_value, e.config_key, isSensitive)}
                      </td>
                      <td
                        style={{
                          padding: "11px 14px",
                          borderBottom: "1px solid #1a1714",
                          verticalAlign: "top",
                          color: "#a39d96",
                        }}
                      >
                        {formatAuditValue(e.new_value, e.config_key, isSensitive)}
                      </td>
                      <td
                        style={{
                          padding: "11px 14px",
                          borderBottom: "1px solid #1a1714",
                          verticalAlign: "top",
                          fontSize: 11,
                          color: "#6b6560",
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
                paddingTop: 14,
                borderTop: "1px solid #1a1714",
                fontSize: 12,
                color: "#6b6560",
              }}
            >
              <span>
                Page {auditPage + 1} of {totalPages} ({auditCount} entries)
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  style={{
                    background: "transparent",
                    border: "1px solid #2a2520",
                    color: auditPage === 0 ? "#3a3530" : "#a39d96",
                    fontSize: 12,
                    padding: "5px 14px",
                    borderRadius: 5,
                    cursor: auditPage === 0 ? "default" : "pointer",
                  }}
                  disabled={auditPage === 0}
                  onClick={() => loadAudit(auditPage - 1)}
                >
                  Prev
                </button>
                <button
                  style={{
                    background: "transparent",
                    border: "1px solid #2a2520",
                    color:
                      auditPage >= totalPages - 1 ? "#3a3530" : "#a39d96",
                    fontSize: 12,
                    padding: "5px 14px",
                    borderRadius: 5,
                    cursor:
                      auditPage >= totalPages - 1 ? "default" : "pointer",
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
      <div style={{ padding: 32, color: "#6b6560", fontSize: 13 }}>
        Loading configuration...
      </div>
    )
  }

  if (error && !config) {
    return (
      <div style={{ padding: 32, color: "#ef4444", fontSize: 13 }}>
        <strong>Error:</strong> {error}
      </div>
    )
  }

  return (
    <div
      style={{
        padding: "20px 24px",
        maxWidth: 860,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#e8e0d4",
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            Configuration
          </h1>
          <p
            style={{
              fontSize: 12.5,
              color: "#a39d96",
              margin: "4px 0 0",
            }}
          >
            Platform settings, access control, and auction defaults.
          </p>
        </div>
        {renderModeBadge()}
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            background: "rgba(239, 68, 68, 0.06)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: 6,
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 12.5,
            color: "#ef4444",
          }}
        >
          <span style={{ flex: 1 }}>{error}</span>
          <button
            style={{
              background: "none",
              border: "none",
              color: "#ef4444",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 14,
              lineHeight: 1,
              padding: 0,
              flexShrink: 0,
            }}
            onClick={() => setError("")}
          >
            {"\u00D7"}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 2,
          borderBottom: "1px solid #2a2520",
          marginBottom: 24,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            style={{
              padding: "8px 16px",
              fontSize: 12.5,
              fontWeight: tab === t ? 500 : 400,
              color: tab === t ? "#d4a54a" : "#6b6560",
              background: "none",
              border: "none",
              borderBottom:
                tab === t
                  ? "2px solid #d4a54a"
                  : "2px solid transparent",
              cursor: "pointer",
              marginBottom: -1,
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "color 0.15s",
            }}
            onClick={() => setTab(t)}
          >
            {t}
            {t === "Change History" && auditCount > 0 && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#22c55e",
                  display: "inline-block",
                }}
              />
            )}
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
