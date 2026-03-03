import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"

type SyncOverview = {
  overview: {
    total_releases: number
    with_discogs: number
    with_price: number
  }
  last_legacy_sync: string | null
  last_discogs_sync: string | null
  recent_logs: SyncLogEntry[]
  monthly_stats: { month: string; legacy: number; discogs: number }[]
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
  format_coverage: { format: string; total: number; matched: number; percentage: number }[]
  price_stats: { min: number; max: number; avg: number; median: number } | null
  top_valued: {
    id: string
    title: string
    artist_name: string | null
    lowest_price: number
    discogs_id: number
  }[]
  recent_changes: {
    id: string
    title: string
    artist_name: string | null
    old_price: number | null
    new_price: number
    changed_at: string
  }[]
  unscanned: number
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
  const [overview, setOverview] = useState<SyncOverview | null>(null)
  const [legacyData, setLegacyData] = useState<LegacyData | null>(null)
  const [discogsData, setDiscogsData] = useState<DiscogsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [legacyLoading, setLegacyLoading] = useState(false)
  const [discogsLoading, setDiscogsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"log" | "legacy" | "discogs">("log")

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
      <div style={{ padding: "24px", background: COLORS.bg, minHeight: "100vh", color: COLORS.text }}>
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

  const withDiscogs = overview?.overview?.with_discogs || 0
  const totalReleases = overview?.overview?.total_releases || 1
  const coveragePercent = totalReleases > 0 ? Math.round((withDiscogs / totalReleases) * 100) : 0

  return (
    <div style={{ padding: "24px", background: COLORS.bg, minHeight: "100vh", color: COLORS.text }}>
      {/* Page Title */}
      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "20px" }}>Sync Dashboard</h1>

      {/* Header Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "28px" }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <div style={labelStyle}>Last Sync</div>
              <div style={valueStyle}>{formatDate(overview?.last_legacy_sync || null)}</div>
            </div>
            <div>
              <div style={labelStyle}>Total Releases</div>
              <div style={bigValueStyle}>{overview?.overview?.total_releases?.toLocaleString("en-US") || "0"}</div>
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
              <div style={valueStyle}>{formatDate(overview?.last_discogs_sync || null)}</div>
            </div>
            <div>
              <div style={labelStyle}>Coverage</div>
              <div style={valueStyle}>
                <span style={{ color: COLORS.gold, fontWeight: 600 }}>{withDiscogs.toLocaleString("en-US")}</span>
                {" / "}
                {totalReleases.toLocaleString("en-US")}
                {" = "}
                <span style={{ color: COLORS.gold }}>{coveragePercent}%</span>
              </div>
            </div>
            <div>
              <div style={labelStyle}>With Price</div>
              <div style={bigValueStyle}>{overview?.overview?.with_price?.toLocaleString("en-US") || "0"}</div>
            </div>
          </div>
        </div>
      </div>

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
                        <span style={{ fontWeight: 500 }}>{fc.format}</span>
                        <span style={{ color: COLORS.muted }}>
                          {fc.matched.toLocaleString("en-US")} / {fc.total.toLocaleString("en-US")} ({fc.percentage}%)
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
                            width: `${fc.percentage}%`,
                            background:
                              fc.percentage >= 80 ? COLORS.success : fc.percentage >= 50 ? COLORS.gold : COLORS.error,
                            borderRadius: "4px",
                            transition: "width 0.3s",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {discogsData.unscanned > 0 && (
                  <div style={{ marginTop: "16px", fontSize: "13px", color: COLORS.muted }}>
                    {discogsData.unscanned.toLocaleString("en-US")} releases not yet scanned
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
                              {formatPrice(r.lowest_price)}
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

              {/* Recent Price Changes */}
              <div style={cardStyle}>
                <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
                  Recent Price Changes
                </h3>
                {discogsData.recent_changes?.length > 0 ? (
                  <div style={{ overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Artist</th>
                          <th style={thStyle}>Title</th>
                          <th style={thStyle}>Old Price</th>
                          <th style={thStyle}>New Price</th>
                          <th style={thStyle}>Change</th>
                          <th style={thStyle}>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {discogsData.recent_changes.map((r) => {
                          const diff = r.old_price != null ? r.new_price - r.old_price : null
                          return (
                            <tr
                              key={r.id + r.changed_at}
                              style={{ cursor: "pointer" }}
                              onClick={() => (window.location.href = `/app/media/${r.id}`)}
                              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                              <td style={tdStyle}>{r.artist_name || "\u2014"}</td>
                              <td style={{ ...tdStyle, fontWeight: 500 }}>{r.title}</td>
                              <td style={{ ...tdStyle, color: COLORS.muted }}>
                                {r.old_price != null ? formatPrice(r.old_price) : "\u2014"}
                              </td>
                              <td style={{ ...tdStyle, color: COLORS.gold, fontWeight: 600 }}>
                                {formatPrice(r.new_price)}
                              </td>
                              <td style={tdStyle}>
                                {diff !== null ? (
                                  <span
                                    style={{
                                      color: diff > 0 ? COLORS.success : diff < 0 ? COLORS.error : COLORS.muted,
                                      fontWeight: 600,
                                      fontSize: "13px",
                                    }}
                                  >
                                    {diff > 0 ? "+" : ""}
                                    {formatPrice(diff)}
                                  </span>
                                ) : (
                                  <span style={{ color: COLORS.success, fontSize: "12px" }}>New</span>
                                )}
                              </td>
                              <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatDate(r.changed_at)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>
                    No price changes found.
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
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Sync Status",
})

export default SyncDashboardPage
