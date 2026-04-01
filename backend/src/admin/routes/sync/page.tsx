import { useEffect, useState, useCallback } from "react"
import { useAdminNav } from "../../components/admin-nav"

type SyncOverview = {
  overview: {
    total: number
    eligible: number
    with_discogs: number
    eligible_matched: number
    with_price: number
    eligible_with_price: number
    last_discogs_sync: string | null
    last_legacy_sync: string | null
  }
  last_legacy_sync: { sync_date: string; status: string; changes: Record<string, unknown> } | null
  last_discogs_sync: { sync_date: string; status: string; changes: Record<string, unknown> } | null
  recent_logs: SyncLogEntry[]
  monthly_stats: { sync_type: string; status: string; count: number }[]
}

type SyncLogEntry = {
  id: string
  release_id: string | null
  release_title: string | null
  sync_type: string
  sync_date: string
  changes: Record<string, unknown> | null
  status: string
  error_message: string | null
}

type LegacyData = {
  sync_logs: SyncLogEntry[]
  recent_added: {
    id: string
    title: string
    artist_name: string | null
    format: string
    created_at: string
  }[]
  counts: {
    artists: { legacy: number; supabase: number }
    labels: { legacy: number; supabase: number }
    releases: { legacy: number; supabase: number }
    images: { legacy: number; supabase: number }
  }
}

type DiscogsData = {
  format_coverage: { format: string; total: number; matched: number; with_price: number; match_rate: number }[]
  price_stats: { min: number; max: number; avg: number; median: number; count: number } | null
  top_valued: {
    id: string
    title: string
    artist_name: string | null
    discogs_lowest_price: number
    discogs_id: number
  }[]
  recent_changes: {
    id: string
    release_title: string | null
    artist_name: string | null
    changes: Record<string, unknown> | null
    sync_date: string
  }[]
  unscanned: { format: string; count: number }[]
}

type BatchProgress = {
  progress: {
    last_release_id: string
    processed: number
    matched: number
    with_price: number
    errors: number
    strategies: Record<string, number>
    updated_at: string
  } | null
  results_count: number
  total_unmatched: number
  last_batch: {
    sync_date: string
    changes: Record<string, unknown>
    status: string
  } | null
}

type ExtraartistsProgress = {
  progress: {
    processed: number
    updated: number
    skipped: number
    errors: number
    artists_created: number
    links_created: number
    links_deleted: number
    last_release_id: string | null
    started_at: string
    finished_at?: string
  } | null
  is_running: boolean
  total_releases: number
  recent_log: string[]
}

type DiscogsHealthAction = {
  id: string
  label: string
  description: string
  variant: "default" | "warning" | "danger"
  disabled?: boolean
}

type ChangeLogRun = {
  sync_run_id: string
  synced_at: string
  total: number
  price_changes: number
  avail_changes: number
  title_changes: number
  cover_changes: number
  inserted: number
}

type ChangeLogEntry = {
  id: string
  sync_run_id: string
  synced_at: string
  release_id: string
  change_type: "inserted" | "updated"
  changes: Record<string, { old: unknown; new: unknown }>
  release_title: string | null
  artist_name: string | null
}

type ChangeLogData = {
  runs: ChangeLogRun[]
  entries: ChangeLogEntry[]
  total: number
}

type DiscogsHealth = {
  health: {
    status: string
    message: string | null
    severity: string
    alert: string | null
    chunk_id: number | string | null
    processed: number
    chunk_total: number
    updated: number
    errors: number
    errors_429: number
    errors_other: number
    retries_success: number
    error_rate_percent: number
    rate_limit: number
    price_increased: number
    price_decreased: number
    updated_at: string
  } | null
  actions: DiscogsHealthAction[]
}

const COLORS = {
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
}

const formatDate = (d: string | null) => {
  if (!d) return "\u2014"
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const formatPrice = (p: number | null | undefined) => {
  if (p === null || p === undefined) return "\u2014"
  return `\u20AC${p.toFixed(2)}`
}

const SyncDashboardPage = () => {
  useAdminNav()
  const [overview, setOverview] = useState<SyncOverview | null>(null)
  const [legacyData, setLegacyData] = useState<LegacyData | null>(null)
  const [discogsData, setDiscogsData] = useState<DiscogsData | null>(null)
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const [discogsHealth, setDiscogsHealth] = useState<DiscogsHealth | null>(null)
  const [extraartistsProgress, setExtraartistsProgress] = useState<ExtraartistsProgress | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [legacyLoading, setLegacyLoading] = useState(false)
  const [discogsLoading, setDiscogsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"log" | "legacy" | "discogs" | "changes">("log")
  const [changeLogData, setChangeLogData] = useState<ChangeLogData | null>(null)
  const [changeLoading, setChangeLoading] = useState(false)
  const [changeRunFilter, setChangeRunFilter] = useState<string | null>(null)
  const [changeFieldFilter, setChangeFieldFilter] = useState<string>("all")
  const [changePage, setChangePage] = useState(0)

  // Fetch overview
  useEffect(() => {
    fetch("/admin/sync", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setOverview(d)
        setLoading(false)
      })
      .catch((err) => {
        console.error("Sync overview error:", err)
        setLoading(false)
      })
  }, [])

  // Fetch batch progress with auto-refresh every 15s
  const fetchBatchProgress = useCallback(() => {
    fetch("/admin/sync/batch-progress", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setBatchProgress(d))
      .catch((err) => console.error("Batch progress error:", err))
  }, [])

  useEffect(() => {
    fetchBatchProgress()
    const interval = setInterval(fetchBatchProgress, 15000)
    return () => clearInterval(interval)
  }, [fetchBatchProgress])

  // Fetch Discogs health status (with auto-refresh every 30s)
  const fetchDiscogsHealth = useCallback(() => {
    fetch("/admin/sync/discogs-health", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setDiscogsHealth(d))
      .catch((err) => console.error("Discogs health error:", err))
  }, [])

  useEffect(() => {
    fetchDiscogsHealth()
    const interval = setInterval(fetchDiscogsHealth, 30000)
    return () => clearInterval(interval)
  }, [fetchDiscogsHealth])

  // Fetch Extraartists import progress (with auto-refresh every 15s)
  const fetchExtraartistsProgress = useCallback(() => {
    fetch("/admin/sync/extraartists-progress", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setExtraartistsProgress(d))
      .catch((err) => console.error("Extraartists progress error:", err))
  }, [])

  useEffect(() => {
    fetchExtraartistsProgress()
    const interval = setInterval(fetchExtraartistsProgress, 15000)
    return () => clearInterval(interval)
  }, [fetchExtraartistsProgress])

  // Execute a Discogs sync action
  const executeAction = useCallback(async (actionId: string, params?: Record<string, unknown>) => {
    setActionLoading(actionId)
    setActionResult(null)
    try {
      const resp = await fetch("/admin/sync/discogs-health", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionId, params }),
      })
      const data = await resp.json()
      if (resp.ok) {
        setActionResult({ success: true, message: data.message })
        // Refresh health after action
        setTimeout(fetchDiscogsHealth, 3000)
      } else {
        setActionResult({ success: false, message: data.error || "Action failed" })
      }
    } catch (err) {
      setActionResult({ success: false, message: String(err) })
    } finally {
      setActionLoading(null)
    }
  }, [fetchDiscogsHealth])

  // Fetch legacy data on tab switch
  useEffect(() => {
    if (activeTab === "legacy" && !legacyData) {
      setLegacyLoading(true)
      fetch("/admin/sync/legacy", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => {
          setLegacyData(d)
          setLegacyLoading(false)
        })
        .catch((err) => {
          console.error("Legacy sync error:", err)
          setLegacyLoading(false)
        })
    }
  }, [activeTab, legacyData])

  // Fetch discogs data on tab switch
  useEffect(() => {
    if (activeTab === "discogs" && !discogsData) {
      setDiscogsLoading(true)
      fetch("/admin/sync/discogs", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => {
          setDiscogsData(d)
          setDiscogsLoading(false)
        })
        .catch((err) => {
          console.error("Discogs sync error:", err)
          setDiscogsLoading(false)
        })
    }
  }, [activeTab, discogsData])

  // Fetch change log data on tab switch or filter change
  const fetchChangeLog = useCallback(() => {
    if (activeTab !== "changes") return
    setChangeLoading(true)
    const params = new URLSearchParams({ limit: "100", offset: String(changePage * 100) })
    if (changeRunFilter) params.set("run_id", changeRunFilter)
    if (changeFieldFilter !== "all") params.set("field", changeFieldFilter)
    fetch(`/admin/sync/change-log?${params}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { setChangeLogData(d); setChangeLoading(false) })
      .catch((err) => { console.error("Change log error:", err); setChangeLoading(false) })
  }, [activeTab, changeRunFilter, changeFieldFilter, changePage])

  useEffect(() => {
    fetchChangeLog()
  }, [fetchChangeLog])

  // Styles
  const cardStyle: React.CSSProperties = {
    background: COLORS.card,
    borderRadius: "8px",
    padding: "20px",
    border: `1px solid ${COLORS.border}`,
  }

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: `1px solid ${COLORS.border}`,
    whiteSpace: "nowrap",
  }

  const tdStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: "13px",
    color: COLORS.text,
    borderBottom: `1px solid ${COLORS.border}`,
    verticalAlign: "top",
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "10px 20px",
    border: "none",
    borderBottom: `2px solid ${active ? COLORS.gold : "transparent"}`,
    background: "transparent",
    color: active ? COLORS.gold : COLORS.muted,
    fontSize: "14px",
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    transition: "all 0.15s",
  })

  const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "4px",
  }

  const valueStyle: React.CSSProperties = {
    fontSize: "14px",
    color: COLORS.text,
  }

  const bigValueStyle: React.CSSProperties = {
    fontSize: "28px",
    fontWeight: 700,
    color: COLORS.gold,
  }

  if (loading) {
    return (
      <div style={{ padding: "24px", background: COLORS.bg, minHeight: "100vh", color: COLORS.text, minWidth: 0, width: "100%", overflowX: "hidden", boxSizing: "border-box" }}>
        <div style={{ color: COLORS.muted }}>Loading...</div>
      </div>
    )
  }

  const syncTypeBadge = (type: string) => {
    const isLegacy = type === "legacy"
    return (
      <span
        style={{
          padding: "2px 8px",
          borderRadius: "4px",
          fontSize: "11px",
          fontWeight: 600,
          background: isLegacy ? "#3b82f620" : "#a855f720",
          color: isLegacy ? COLORS.blue : COLORS.purple,
        }}
      >
        {type}
      </span>
    )
  }

  const statusIcon = (status: string) => (
    <span style={{ color: status === "success" ? COLORS.success : COLORS.error }}>
      {status === "success" ? "\u2713" : "\u2717"}
    </span>
  )

  const eligible = overview?.overview?.eligible || 0
  const eligibleMatched = overview?.overview?.eligible_matched || 0
  const eligibleWithPrice = overview?.overview?.eligible_with_price || 0
  const coveragePercent = eligible > 0 ? Math.round((eligibleMatched / eligible) * 100) : 0
  const bp = batchProgress?.progress
  const batchRunning = bp && bp.processed > 0

  return (
    <div style={{ padding: "24px", background: COLORS.bg, minHeight: "100vh", color: COLORS.text, minWidth: 0, width: "100%", overflowX: "hidden", boxSizing: "border-box" }}>
      {/* Page Title */}
      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "20px" }}>Sync Dashboard</h1>

      {/* Header Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
        {/* Legacy Sync Card */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "4px",
                fontSize: "11px",
                fontWeight: 600,
                background: "#3b82f620",
                color: COLORS.blue,
              }}
            >
              LEGACY
            </span>
            <h2 style={{ fontSize: "16px", fontWeight: 600 }}>Legacy MySQL Sync</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
            <div>
              <div style={labelStyle}>Last Sync</div>
              <div style={valueStyle}>{formatDate(overview?.last_legacy_sync?.sync_date || overview?.overview?.last_legacy_sync || null)}</div>
            </div>
            <div>
              <div style={labelStyle}>Total Releases</div>
              <div style={bigValueStyle}>{(overview?.overview?.total || 0).toLocaleString("en-US")}</div>
            </div>
            <div>
              <div style={labelStyle}>Eligible (Music)</div>
              <div style={bigValueStyle}>{eligible.toLocaleString("en-US")}</div>
            </div>
          </div>
        </div>

        {/* Discogs Sync Card */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "4px",
                fontSize: "11px",
                fontWeight: 600,
                background: "#a855f720",
                color: COLORS.purple,
              }}
            >
              DISCOGS
            </span>
            <h2 style={{ fontSize: "16px", fontWeight: 600 }}>Discogs Enrichment</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
            <div>
              <div style={labelStyle}>Last Sync</div>
              <div style={valueStyle}>{formatDate(overview?.last_discogs_sync?.sync_date || overview?.overview?.last_discogs_sync || null)}</div>
            </div>
            <div>
              <div style={labelStyle}>Coverage (Eligible)</div>
              <div style={valueStyle}>
                <span style={{ color: COLORS.gold, fontWeight: 600 }}>{eligibleMatched.toLocaleString("en-US")}</span>
                {" / "}
                {eligible.toLocaleString("en-US")}
                {" = "}
                <span style={{ color: COLORS.gold }}>{coveragePercent}%</span>
              </div>
            </div>
            <div>
              <div style={labelStyle}>With Price</div>
              <div style={bigValueStyle}>{eligibleWithPrice.toLocaleString("en-US")}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Discogs Sync Health Alert */}
      {discogsHealth?.health && (discogsHealth.health.severity !== "ok" || discogsHealth.health.status === "running") && (
        <div
          style={{
            ...cardStyle,
            marginBottom: "20px",
            borderColor:
              discogsHealth.health.severity === "critical"
                ? COLORS.error + "80"
                : discogsHealth.health.severity === "warning"
                ? "#f59e0b80"
                : discogsHealth.health.status === "running"
                ? COLORS.success + "50"
                : COLORS.border,
            background:
              discogsHealth.health.severity === "critical"
                ? "#ef444410"
                : discogsHealth.health.severity === "warning"
                ? "#f59e0b10"
                : COLORS.card,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  background:
                    discogsHealth.health.status === "running"
                      ? "#22c55e20"
                      : discogsHealth.health.status === "rate_limited"
                      ? "#ef444420"
                      : discogsHealth.health.status === "completed"
                      ? "#22c55e20"
                      : "#f59e0b20",
                  color:
                    discogsHealth.health.status === "running"
                      ? COLORS.success
                      : discogsHealth.health.status === "rate_limited"
                      ? COLORS.error
                      : discogsHealth.health.status === "completed"
                      ? COLORS.success
                      : "#f59e0b",
                }}
              >
                {discogsHealth.health.status.toUpperCase().replace("_", " ")}
              </span>
              <h2 style={{ fontSize: "16px", fontWeight: 600 }}>Discogs Daily Sync Health</h2>
            </div>
            {discogsHealth.health.updated_at && (
              <span style={{ fontSize: "11px", color: COLORS.muted }}>
                Updated: {formatDate(discogsHealth.health.updated_at)}
              </span>
            )}
          </div>

          {/* Alert message */}
          {discogsHealth.health.alert && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "6px",
                marginBottom: "16px",
                fontSize: "13px",
                fontWeight: 500,
                background:
                  discogsHealth.health.severity === "critical" ? "#ef444418" : "#f59e0b18",
                color:
                  discogsHealth.health.severity === "critical" ? "#fca5a5" : "#fcd34d",
                border: `1px solid ${
                  discogsHealth.health.severity === "critical" ? "#ef444430" : "#f59e0b30"
                }`,
              }}
            >
              {discogsHealth.health.severity === "critical" ? "\u26A0" : "\u26A0"}{" "}
              {discogsHealth.health.alert}
              {discogsHealth.health.message && (
                <span style={{ display: "block", marginTop: "4px", fontSize: "12px", opacity: 0.8 }}>
                  {discogsHealth.health.message}
                </span>
              )}
            </div>
          )}

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "12px", marginBottom: "16px" }}>
            <div>
              <div style={labelStyle}>Chunk</div>
              <div style={valueStyle}>
                {discogsHealth.health.chunk_id || "\u2014"} / 5
              </div>
            </div>
            <div>
              <div style={labelStyle}>Processed</div>
              <div style={valueStyle}>
                {discogsHealth.health.processed.toLocaleString("en-US")}
                {discogsHealth.health.chunk_total > 0 && (
                  <span style={{ color: COLORS.muted }}> / {discogsHealth.health.chunk_total.toLocaleString("en-US")}</span>
                )}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Updated</div>
              <div style={{ ...valueStyle, color: COLORS.success }}>{discogsHealth.health.updated.toLocaleString("en-US")}</div>
            </div>
            <div>
              <div style={labelStyle}>429 Errors</div>
              <div style={{ ...valueStyle, color: discogsHealth.health.errors_429 > 0 ? COLORS.error : COLORS.success }}>
                {discogsHealth.health.errors_429.toLocaleString("en-US")}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Error Rate</div>
              <div
                style={{
                  ...valueStyle,
                  color:
                    discogsHealth.health.error_rate_percent > 30
                      ? COLORS.error
                      : discogsHealth.health.error_rate_percent > 10
                      ? "#f59e0b"
                      : COLORS.success,
                  fontWeight: 600,
                }}
              >
                {discogsHealth.health.error_rate_percent}%
              </div>
            </div>
            <div>
              <div style={labelStyle}>Rate Limit</div>
              <div style={valueStyle}>{discogsHealth.health.rate_limit} req/min</div>
            </div>
          </div>

          {/* Progress bar */}
          {discogsHealth.health.chunk_total > 0 && discogsHealth.health.status === "running" && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ height: "6px", borderRadius: "3px", background: COLORS.border, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, Math.round((discogsHealth.health.processed / discogsHealth.health.chunk_total) * 100))}%`,
                    background: discogsHealth.health.severity === "critical"
                      ? `linear-gradient(90deg, ${COLORS.error}, #f59e0b)`
                      : `linear-gradient(90deg, ${COLORS.gold}, ${COLORS.success})`,
                    borderRadius: "3px",
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {discogsHealth.actions.length > 0 && (
            <div>
              <div style={{ ...labelStyle, marginBottom: "10px" }}>Available Actions</div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {discogsHealth.actions.map((action) => {
                  const isLoading = actionLoading === action.id
                  const btnColors = {
                    default: { bg: COLORS.gold + "20", border: COLORS.gold + "40", color: COLORS.gold },
                    warning: { bg: "#f59e0b20", border: "#f59e0b40", color: "#fbbf24" },
                    danger: { bg: "#ef444420", border: "#ef444440", color: "#fca5a5" },
                  }
                  const c = btnColors[action.variant]
                  return (
                    <div key={action.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <button
                        onClick={() => executeAction(action.id)}
                        disabled={action.disabled || isLoading}
                        title={action.description}
                        style={{
                          padding: "8px 16px",
                          borderRadius: "6px",
                          border: `1px solid ${action.disabled ? COLORS.border : c.border}`,
                          background: action.disabled ? COLORS.border + "30" : c.bg,
                          color: action.disabled ? COLORS.muted : c.color,
                          fontSize: "13px",
                          fontWeight: 600,
                          cursor: action.disabled ? "not-allowed" : "pointer",
                          opacity: action.disabled ? 0.5 : 1,
                          transition: "all 0.15s",
                        }}
                      >
                        {isLoading ? "Starting..." : action.label}
                      </button>
                      <span style={{ fontSize: "11px", color: COLORS.muted, maxWidth: "260px" }}>
                        {action.description}
                      </span>
                    </div>
                  )
                })}
              </div>
              {/* Action result toast */}
              {actionResult && (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "8px 14px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    background: actionResult.success ? "#22c55e18" : "#ef444418",
                    color: actionResult.success ? "#86efac" : "#fca5a5",
                    border: `1px solid ${actionResult.success ? "#22c55e30" : "#ef444430"}`,
                  }}
                >
                  {actionResult.success ? "\u2713" : "\u2717"} {actionResult.message}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Extraartists Import Progress Card */}
      {extraartistsProgress?.progress && (
        <div
          style={{
            ...cardStyle,
            marginBottom: "20px",
            borderColor: extraartistsProgress.is_running ? COLORS.blue + "50" : COLORS.border,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  background: extraartistsProgress.is_running
                    ? "#22c55e20"
                    : extraartistsProgress.progress.finished_at
                    ? "#22c55e20"
                    : "#a0908020",
                  color: extraartistsProgress.is_running
                    ? COLORS.success
                    : extraartistsProgress.progress.finished_at
                    ? COLORS.success
                    : COLORS.muted,
                }}
              >
                {extraartistsProgress.is_running ? "RUNNING" : extraartistsProgress.progress.finished_at ? "COMPLETED" : "PAUSED"}
              </span>
              <h2 style={{ fontSize: "16px", fontWeight: 600 }}>Discogs Extraartists Import</h2>
            </div>
            {extraartistsProgress.progress.started_at && (
              <span style={{ fontSize: "11px", color: COLORS.muted }}>
                Started: {formatDate(extraartistsProgress.progress.started_at)}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ fontSize: "12px", color: COLORS.muted }}>
                {extraartistsProgress.progress.processed.toLocaleString("en-US")} / {extraartistsProgress.total_releases.toLocaleString("en-US")} releases
              </span>
              <span style={{ fontSize: "12px", color: COLORS.gold, fontWeight: 600 }}>
                {Math.round((extraartistsProgress.progress.processed / extraartistsProgress.total_releases) * 100)}%
              </span>
            </div>
            <div style={{ height: "6px", borderRadius: "3px", background: COLORS.border, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(100, Math.round((extraartistsProgress.progress.processed / extraartistsProgress.total_releases) * 100))}%`,
                  background: `linear-gradient(90deg, ${COLORS.blue}, ${COLORS.success})`,
                  borderRadius: "3px",
                  transition: "width 0.5s ease",
                }}
              />
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "12px", marginBottom: "16px" }}>
            <div>
              <div style={labelStyle}>With Extras</div>
              <div style={{ ...valueStyle, color: COLORS.success }}>{extraartistsProgress.progress.updated.toLocaleString("en-US")}</div>
            </div>
            <div>
              <div style={labelStyle}>No Extras</div>
              <div style={valueStyle}>{extraartistsProgress.progress.skipped.toLocaleString("en-US")}</div>
            </div>
            <div>
              <div style={labelStyle}>New Artists</div>
              <div style={{ ...valueStyle, color: COLORS.blue }}>{extraartistsProgress.progress.artists_created.toLocaleString("en-US")}</div>
            </div>
            <div>
              <div style={labelStyle}>Links Created</div>
              <div style={{ ...valueStyle, color: COLORS.success }}>+{extraartistsProgress.progress.links_created.toLocaleString("en-US")}</div>
            </div>
            <div>
              <div style={labelStyle}>Links Deleted</div>
              <div style={{ ...valueStyle, color: COLORS.error }}>-{extraartistsProgress.progress.links_deleted.toLocaleString("en-US")}</div>
            </div>
            <div>
              <div style={labelStyle}>Errors</div>
              <div style={{ ...valueStyle, color: extraartistsProgress.progress.errors > 0 ? COLORS.error : COLORS.success }}>
                {extraartistsProgress.progress.errors}
              </div>
            </div>
          </div>

          {/* Recent log lines */}
          {extraartistsProgress.recent_log.length > 0 && (
            <div>
              <div style={{ ...labelStyle, marginBottom: "6px" }}>Recent Log</div>
              <div
                style={{
                  background: "#1a1714",
                  borderRadius: "6px",
                  padding: "10px 12px",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  color: COLORS.muted,
                  lineHeight: "1.6",
                  maxHeight: "120px",
                  overflow: "auto",
                }}
              >
                {extraartistsProgress.recent_log.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </div>
          )}

          {/* Finished timestamp */}
          {extraartistsProgress.progress.finished_at && (
            <div style={{ marginTop: "12px", fontSize: "12px", color: COLORS.success }}>
              Finished: {formatDate(extraartistsProgress.progress.finished_at)}
            </div>
          )}
        </div>
      )}

      {/* Batch Progress Card */}
      {(batchRunning || batchProgress?.last_batch) && (
        <div style={{ ...cardStyle, marginBottom: "20px", borderColor: batchRunning ? COLORS.gold + "50" : COLORS.border }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  background: batchRunning ? "#22c55e20" : "#a09080" + "20",
                  color: batchRunning ? COLORS.success : COLORS.muted,
                }}
              >
                {batchRunning ? "RUNNING" : "IDLE"}
              </span>
              <h2 style={{ fontSize: "16px", fontWeight: 600 }}>Batch Matching</h2>
            </div>
            {bp?.updated_at && (
              <span style={{ fontSize: "11px", color: COLORS.muted }}>
                Updated: {formatDate(bp.updated_at)}
              </span>
            )}
          </div>

          {batchRunning && bp && (
            <>
              {/* Progress bar */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
                  <span style={{ color: COLORS.muted }}>
                    Processed: <span style={{ color: COLORS.text, fontWeight: 600 }}>{bp.processed.toLocaleString("en-US")}</span>
                    {" / "}
                    {(bp.processed + (batchProgress?.total_unmatched || 0)).toLocaleString("en-US")}
                  </span>
                  <span style={{ color: COLORS.gold, fontWeight: 600 }}>
                    {((bp.processed / (bp.processed + (batchProgress?.total_unmatched || 1))) * 100).toFixed(1)}%
                  </span>
                </div>
                <div style={{ height: "8px", borderRadius: "4px", background: COLORS.border, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${(bp.processed / (bp.processed + (batchProgress?.total_unmatched || 1))) * 100}%`,
                      background: `linear-gradient(90deg, ${COLORS.gold}, ${COLORS.success})`,
                      borderRadius: "4px",
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
              </div>

              {/* Stats grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <div style={labelStyle}>Matched</div>
                  <div style={{ ...bigValueStyle, fontSize: "22px" }}>
                    {bp.matched.toLocaleString("en-US")}
                    <span style={{ fontSize: "12px", color: COLORS.muted, fontWeight: 400, marginLeft: "4px" }}>
                      ({bp.processed > 0 ? Math.round((bp.matched / bp.processed) * 100) : 0}%)
                    </span>
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>With Price</div>
                  <div style={{ ...bigValueStyle, fontSize: "22px" }}>{bp.with_price.toLocaleString("en-US")}</div>
                </div>
                <div>
                  <div style={labelStyle}>Errors</div>
                  <div style={{ ...bigValueStyle, fontSize: "22px", color: bp.errors > 0 ? COLORS.error : COLORS.success }}>
                    {bp.errors}
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>Results File</div>
                  <div style={{ ...bigValueStyle, fontSize: "22px" }}>{(batchProgress?.results_count || 0).toLocaleString("en-US")}</div>
                </div>
              </div>

              {/* Strategy breakdown */}
              {bp.strategies && Object.keys(bp.strategies).length > 0 && (
                <div>
                  <div style={{ ...labelStyle, marginBottom: "8px" }}>Match Strategy Breakdown</div>
                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    {Object.entries(bp.strategies)
                      .sort(([, a], [, b]) => b - a)
                      .map(([strategy, count]) => {
                        const stratColors: Record<string, string> = {
                          catno: "#60a5fa",
                          barcode: "#a78bfa",
                          full: "#34d399",
                          basic: "#fbbf24",
                        }
                        return (
                          <div
                            key={strategy}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              background: (stratColors[strategy] || COLORS.muted) + "15",
                              border: `1px solid ${(stratColors[strategy] || COLORS.muted)}30`,
                              fontSize: "13px",
                            }}
                          >
                            <span style={{ color: stratColors[strategy] || COLORS.muted, fontWeight: 600 }}>
                              {strategy}
                            </span>
                            <span style={{ color: COLORS.text, marginLeft: "6px" }}>
                              {count.toLocaleString("en-US")}
                            </span>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Last batch info when idle */}
          {!batchRunning && batchProgress?.last_batch && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <div style={labelStyle}>Last Batch Run</div>
                <div style={valueStyle}>{formatDate(batchProgress.last_batch.sync_date)}</div>
              </div>
              <div>
                <div style={labelStyle}>Status</div>
                <div style={valueStyle}>
                  {statusIcon(batchProgress.last_batch.status)}{" "}
                  {batchProgress.last_batch.status}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{ borderBottom: `1px solid ${COLORS.border}`, marginBottom: "20px" }}>
        <button style={tabStyle(activeTab === "log")} onClick={() => setActiveTab("log")}>
          Sync Log
        </button>
        <button style={tabStyle(activeTab === "legacy")} onClick={() => setActiveTab("legacy")}>
          Legacy Details
        </button>
        <button style={tabStyle(activeTab === "discogs")} onClick={() => setActiveTab("discogs")}>
          Discogs Details
        </button>
        <button style={tabStyle(activeTab === "changes")} onClick={() => setActiveTab("changes")}>
          Change Log
        </button>
      </div>

      {/* Sync-Log Tab */}
      {activeTab === "log" && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
            Recent Sync Entries
          </h3>
          {!overview?.recent_logs || overview.recent_logs.length === 0 ? (
            <div style={{ color: COLORS.muted, textAlign: "center", padding: "30px 0" }}>
              No sync entries found.
            </div>
          ) : (
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Release</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recent_logs.slice(0, 50).map((entry) => (
                    <tr
                      key={entry.id}
                      onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatDate(entry.sync_date)}</td>
                      <td style={tdStyle}>{syncTypeBadge(entry.sync_type)}</td>
                      <td style={{ ...tdStyle, maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {entry.release_title ? (
                          entry.release_id ? (
                            <a
                              href={`/app/media/${entry.release_id}`}
                              style={{ color: COLORS.gold, textDecoration: "none" }}
                            >
                              {entry.release_title}
                            </a>
                          ) : (
                            entry.release_title
                          )
                        ) : (
                          <span style={{ color: COLORS.muted }}>{entry.release_id || "Batch"}</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {statusIcon(entry.status)}{" "}
                        <span style={{ fontSize: "12px" }}>{entry.status}</span>
                      </td>
                      <td style={{ ...tdStyle, maxWidth: "300px" }}>
                        {entry.changes ? (
                          <pre
                            style={{
                              fontSize: "11px",
                              color: COLORS.muted,
                              margin: 0,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              fontFamily: "monospace",
                            }}
                          >
                            {JSON.stringify(entry.changes, null, 2)}
                          </pre>
                        ) : entry.error_message ? (
                          <span style={{ color: COLORS.error, fontSize: "12px" }}>{entry.error_message}</span>
                        ) : (
                          <span style={{ color: COLORS.muted }}>\u2014</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Legacy Details Tab */}
      {activeTab === "legacy" && (
        <div>
          {legacyLoading ? (
            <div style={{ color: COLORS.muted, textAlign: "center", padding: "40px 0" }}>Loading...</div>
          ) : legacyData ? (
            <>
              {/* Count Comparison Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
                {(["artists", "labels", "releases", "images"] as const).map((key) => {
                  const counts = legacyData.counts?.[key]
                  const labelMap = {
                    artists: "Artists",
                    labels: "Labels",
                    releases: "Releases",
                    images: "Images",
                  }
                  return (
                    <div key={key} style={cardStyle}>
                      <div style={labelStyle}>{labelMap[key]}</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "4px" }}>
                        <span style={bigValueStyle}>{counts?.supabase?.toLocaleString("en-US") || "0"}</span>
                        <span style={{ fontSize: "13px", color: COLORS.muted }}>
                          / {counts?.legacy?.toLocaleString("en-US") || "0"} Legacy
                        </span>
                      </div>
                      {counts && counts.legacy > 0 && (
                        <div
                          style={{
                            marginTop: "8px",
                            height: "4px",
                            borderRadius: "2px",
                            background: COLORS.border,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${Math.min(100, Math.round((counts.supabase / counts.legacy) * 100))}%`,
                              background: COLORS.gold,
                              borderRadius: "2px",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Recently Added Releases */}
              <div style={cardStyle}>
                <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
                  Recently Added Releases
                </h3>
                {legacyData.recent_added?.length > 0 ? (
                  <div style={{ overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Artist</th>
                          <th style={thStyle}>Title</th>
                          <th style={thStyle}>Format</th>
                          <th style={thStyle}>Added</th>
                        </tr>
                      </thead>
                      <tbody>
                        {legacyData.recent_added.slice(0, 50).map((r) => (
                          <tr
                            key={r.id}
                            style={{ cursor: "pointer" }}
                            onClick={() => (window.location.href = `/app/media/${r.id}`)}
                            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            <td style={tdStyle}>{r.artist_name || "\u2014"}</td>
                            <td style={{ ...tdStyle, fontWeight: 500 }}>{r.title}</td>
                            <td style={tdStyle}>
                              <span
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  fontSize: "12px",
                                  background: COLORS.hover,
                                }}
                              >
                                {r.format}
                              </span>
                            </td>
                            <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatDate(r.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>
                    No recently added releases.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ color: COLORS.muted, textAlign: "center", padding: "40px 0" }}>
              No legacy data available.
            </div>
          )}
        </div>
      )}

      {/* Discogs Details Tab */}
      {activeTab === "discogs" && (
        <div>
          {discogsLoading ? (
            <div style={{ color: COLORS.muted, textAlign: "center", padding: "40px 0" }}>Loading...</div>
          ) : discogsData ? (
            <>
              {/* Format Coverage */}
              <div style={{ ...cardStyle, marginBottom: "20px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
                  Format Coverage
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {discogsData.format_coverage?.map((fc) => (
                    <div key={fc.format}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "4px",
                          fontSize: "13px",
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>{fc.format || "Unknown"}</span>
                        <span style={{ color: COLORS.muted }}>
                          {fc.matched.toLocaleString("en-US")} / {fc.total.toLocaleString("en-US")} ({fc.match_rate}%)
                        </span>
                      </div>
                      <div
                        style={{
                          height: "8px",
                          borderRadius: "4px",
                          background: COLORS.border,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${fc.match_rate}%`,
                            background:
                              fc.match_rate >= 80 ? COLORS.success : fc.match_rate >= 50 ? COLORS.gold : COLORS.error,
                            borderRadius: "4px",
                            transition: "width 0.3s",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {discogsData.unscanned?.length > 0 && (
                  <div style={{ marginTop: "16px", fontSize: "13px", color: COLORS.muted }}>
                    {discogsData.unscanned.reduce((sum, u) => sum + u.count, 0).toLocaleString("en-US")} eligible releases not yet scanned
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
                      {discogsData.unscanned.slice(0, 8).map((u) => (
                        <span key={u.format} style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "3px", background: COLORS.hover }}>
                          {u.format || "?"}: {u.count.toLocaleString("en-US")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Price Statistics */}
              {discogsData.price_stats && (
                <div style={{ ...cardStyle, marginBottom: "20px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
                    Price Statistics
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                    <div>
                      <div style={labelStyle}>Minimum</div>
                      <div style={bigValueStyle}>{formatPrice(discogsData.price_stats.min)}</div>
                    </div>
                    <div>
                      <div style={labelStyle}>Maximum</div>
                      <div style={bigValueStyle}>{formatPrice(discogsData.price_stats.max)}</div>
                    </div>
                    <div>
                      <div style={labelStyle}>Average</div>
                      <div style={bigValueStyle}>{formatPrice(discogsData.price_stats.avg)}</div>
                    </div>
                    <div>
                      <div style={labelStyle}>Median</div>
                      <div style={bigValueStyle}>{formatPrice(discogsData.price_stats.median)}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Top Valued Releases */}
              <div style={{ ...cardStyle, marginBottom: "20px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
                  Top 20 Most Valuable Releases
                </h3>
                {discogsData.top_valued?.length > 0 ? (
                  <div style={{ overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={{ ...thStyle, width: "40px" }}>#</th>
                          <th style={thStyle}>Artist</th>
                          <th style={thStyle}>Title</th>
                          <th style={thStyle}>Price</th>
                          <th style={thStyle}>Discogs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {discogsData.top_valued.slice(0, 20).map((r, idx) => (
                          <tr
                            key={r.id}
                            style={{ cursor: "pointer" }}
                            onClick={() => (window.location.href = `/app/media/${r.id}`)}
                            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            <td style={{ ...tdStyle, color: COLORS.muted, fontWeight: 600 }}>{idx + 1}</td>
                            <td style={tdStyle}>{r.artist_name || "\u2014"}</td>
                            <td style={{ ...tdStyle, fontWeight: 500 }}>{r.title}</td>
                            <td style={{ ...tdStyle, color: COLORS.gold, fontWeight: 600 }}>
                              {formatPrice(r.discogs_lowest_price)}
                            </td>
                            <td style={tdStyle}>
                              <a
                                href={`https://www.discogs.com/release/${r.discogs_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{ color: COLORS.gold, textDecoration: "none", fontSize: "13px" }}
                              >
                                {r.discogs_id} \u2197
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>
                    No valued releases yet.
                  </div>
                )}
              </div>

              {/* Recent Discogs Sync Entries */}
              <div style={cardStyle}>
                <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
                  Recent Discogs Sync Activity
                </h3>
                {discogsData.recent_changes?.length > 0 ? (
                  <div style={{ overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Artist</th>
                          <th style={thStyle}>Title</th>
                          <th style={thStyle}>Changes</th>
                          <th style={thStyle}>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {discogsData.recent_changes.map((r, idx) => (
                          <tr
                            key={r.id + idx}
                            style={{ cursor: "pointer" }}
                            onClick={() => (window.location.href = `/app/media/${r.id}`)}
                            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            <td style={tdStyle}>{r.artist_name || "\u2014"}</td>
                            <td style={{ ...tdStyle, fontWeight: 500 }}>{r.release_title || "\u2014"}</td>
                            <td style={{ ...tdStyle, maxWidth: "300px" }}>
                              {r.changes ? (
                                <pre
                                  style={{
                                    fontSize: "11px",
                                    color: COLORS.muted,
                                    margin: 0,
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                    fontFamily: "monospace",
                                  }}
                                >
                                  {JSON.stringify(r.changes, null, 2)}
                                </pre>
                              ) : (
                                <span style={{ color: COLORS.muted }}>{"\u2014"}</span>
                              )}
                            </td>
                            <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatDate(r.sync_date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>
                    No recent discogs sync activity found.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ color: COLORS.muted, textAlign: "center", padding: "40px 0" }}>
              No Discogs data available.
            </div>
          )}
        </div>
      )}
      {/* Change Log Tab */}
      {activeTab === "changes" && (
        <div>
          {/* Run selector */}
          <div style={{ ...cardStyle, marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", color: COLORS.muted, marginRight: "4px" }}>Run:</span>
              <button
                style={{
                  padding: "4px 12px", borderRadius: "4px", border: "none", cursor: "pointer", fontSize: "12px",
                  background: !changeRunFilter ? COLORS.gold : COLORS.border,
                  color: !changeRunFilter ? "#1c1915" : COLORS.text,
                  fontWeight: !changeRunFilter ? 600 : 400,
                }}
                onClick={() => { setChangeRunFilter(null); setChangePage(0) }}
              >
                All runs
              </button>
              {changeLogData?.runs.slice(0, 20).map((run) => (
                <button
                  key={run.sync_run_id}
                  style={{
                    padding: "4px 12px", borderRadius: "4px", border: "none", cursor: "pointer", fontSize: "12px",
                    background: changeRunFilter === run.sync_run_id ? COLORS.gold : COLORS.border,
                    color: changeRunFilter === run.sync_run_id ? "#1c1915" : COLORS.text,
                    fontWeight: changeRunFilter === run.sync_run_id ? 600 : 400,
                  }}
                  onClick={() => { setChangeRunFilter(run.sync_run_id); setChangePage(0) }}
                >
                  {new Date(run.synced_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  {" "}
                  <span style={{ opacity: 0.7 }}>({run.total})</span>
                </button>
              ))}
            </div>

            {/* Selected run stats */}
            {changeRunFilter && (() => {
              const run = changeLogData?.runs.find((r) => r.sync_run_id === changeRunFilter)
              if (!run) return null
              return (
                <div style={{ display: "flex", gap: "20px", marginTop: "12px", flexWrap: "wrap" }}>
                  {[
                    { label: "Total changes", value: run.total, color: COLORS.gold },
                    { label: "Price", value: run.price_changes, color: COLORS.blue },
                    { label: "Availability", value: run.avail_changes, color: run.avail_changes > 0 ? COLORS.error : COLORS.muted },
                    { label: "Title", value: run.title_changes, color: COLORS.muted },
                    { label: "New cover", value: run.cover_changes, color: COLORS.muted },
                    { label: "New releases", value: run.inserted, color: COLORS.success },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <div style={{ fontSize: "11px", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                      <div style={{ fontSize: "20px", fontWeight: 700, color }}>{value}</div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>

          {/* Field filter */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            {[
              { key: "all", label: "All fields" },
              { key: "legacy_price", label: "💰 Price" },
              { key: "legacy_available", label: "🔒 Availability" },
              { key: "title", label: "✏️ Title" },
              { key: "coverImage", label: "🖼 Cover" },
            ].map(({ key, label }) => (
              <button
                key={key}
                style={{
                  padding: "6px 14px", borderRadius: "20px", border: `1px solid ${changeFieldFilter === key ? COLORS.gold : COLORS.border}`,
                  background: changeFieldFilter === key ? "#d4a54a15" : "transparent",
                  color: changeFieldFilter === key ? COLORS.gold : COLORS.muted,
                  cursor: "pointer", fontSize: "13px", fontWeight: changeFieldFilter === key ? 600 : 400,
                }}
                onClick={() => { setChangeFieldFilter(key); setChangePage(0) }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Entries table */}
          <div style={cardStyle}>
            {changeLoading ? (
              <div style={{ color: COLORS.muted, textAlign: "center", padding: "40px 0" }}>Loading...</div>
            ) : !changeLogData?.entries.length ? (
              <div style={{ color: COLORS.muted, textAlign: "center", padding: "40px 0" }}>
                {changeRunFilter ? "No changes for this run." : "No changes logged yet. Changes appear after the next sync."}
              </div>
            ) : (
              <>
                <div style={{ fontSize: "13px", color: COLORS.muted, marginBottom: "12px" }}>
                  {changeLogData.total.toLocaleString("en-US")} entries
                  {changeLogData.total > 100 && (
                    <span> · Page {changePage + 1} of {Math.ceil(changeLogData.total / 100)}</span>
                  )}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Date</th>
                        <th style={thStyle}>Release</th>
                        <th style={thStyle}>Type</th>
                        <th style={thStyle}>Changes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changeLogData.entries.map((entry) => (
                        <tr
                          key={entry.id}
                          style={{ cursor: "pointer" }}
                          onClick={() => (window.location.href = `/app/media/${entry.release_id}`)}
                          onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <td style={{ ...tdStyle, whiteSpace: "nowrap", fontSize: "12px", color: COLORS.muted }}>
                            {formatDate(entry.synced_at)}
                          </td>
                          <td style={{ ...tdStyle, maxWidth: "220px" }}>
                            <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {entry.release_title || entry.release_id}
                            </div>
                            {entry.artist_name && (
                              <div style={{ fontSize: "12px", color: COLORS.muted }}>{entry.artist_name}</div>
                            )}
                          </td>
                          <td style={tdStyle}>
                            <span style={{
                              padding: "2px 7px", borderRadius: "4px", fontSize: "11px", fontWeight: 600,
                              background: entry.change_type === "inserted" ? "#22c55e20" : "#3b82f620",
                              color: entry.change_type === "inserted" ? COLORS.success : COLORS.blue,
                            }}>
                              {entry.change_type === "inserted" ? "NEW" : "UPDATED"}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, maxWidth: "340px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              {Object.entries(entry.changes).map(([field, delta]) => {
                                if (field === "_new") return null
                                const fieldLabel: Record<string, string> = {
                                  legacy_price: "Price",
                                  legacy_available: "Available",
                                  title: "Title",
                                  coverImage: "Cover",
                                }
                                const fmt = (v: unknown) => {
                                  if (field === "legacy_price") return v != null ? `€${Number(v).toFixed(2)}` : "—"
                                  if (field === "legacy_available") return v ? "✓ Available" : "✗ Blocked"
                                  if (field === "coverImage") return v ? "set" : "—"
                                  return String(v ?? "—").slice(0, 60)
                                }
                                return (
                                  <div key={field} style={{ fontSize: "12px", display: "flex", gap: "6px", alignItems: "center" }}>
                                    <span style={{ color: COLORS.muted, minWidth: "60px" }}>{fieldLabel[field] ?? field}</span>
                                    <span style={{ color: COLORS.error, textDecoration: "line-through" }}>{fmt((delta as any).old)}</span>
                                    <span style={{ color: COLORS.muted }}>→</span>
                                    <span style={{ color: COLORS.success }}>{fmt((delta as any).new)}</span>
                                  </div>
                                )
                              })}
                              {entry.change_type === "inserted" && (
                                <div style={{ fontSize: "12px", color: COLORS.muted }}>
                                  {entry.changes.legacy_price != null
                                    ? `€${Number((entry.changes.legacy_price as any)).toFixed(2)}`
                                    : "No price"}
                                  {" · "}
                                  {(entry.changes.legacy_available as any) ? "Available" : "Unavailable"}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {changeLogData.total > 100 && (
                  <div style={{ display: "flex", gap: "8px", marginTop: "16px", justifyContent: "center" }}>
                    <button
                      disabled={changePage === 0}
                      style={{
                        padding: "6px 16px", borderRadius: "4px", border: `1px solid ${COLORS.border}`,
                        background: "transparent", color: changePage === 0 ? COLORS.muted : COLORS.text,
                        cursor: changePage === 0 ? "not-allowed" : "pointer",
                      }}
                      onClick={() => setChangePage((p) => Math.max(0, p - 1))}
                    >
                      ← Prev
                    </button>
                    <span style={{ lineHeight: "34px", fontSize: "13px", color: COLORS.muted }}>
                      {changePage + 1} / {Math.ceil(changeLogData.total / 100)}
                    </span>
                    <button
                      disabled={(changePage + 1) * 100 >= changeLogData.total}
                      style={{
                        padding: "6px 16px", borderRadius: "4px", border: `1px solid ${COLORS.border}`,
                        background: "transparent", color: (changePage + 1) * 100 >= changeLogData.total ? COLORS.muted : COLORS.text,
                        cursor: (changePage + 1) * 100 >= changeLogData.total ? "not-allowed" : "pointer",
                      }}
                      onClick={() => setChangePage((p) => p + 1)}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

export default SyncDashboardPage
