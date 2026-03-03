import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Component, useEffect, useState } from "react"
import type { ErrorInfo, ReactNode } from "react"

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("MediaPage error:", error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "#ef4444" }}>
          <h2>Fehler in Medien-Verwaltung:</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

type Release = {
  id: string
  title: string
  artist_name: string | null
  label_name: string | null
  format: string
  year: number | null
  country: string | null
  cat_no: string | null
  discogs_id: number | null
  lowest_price: number | null
  auction_status: string | null
  coverImage: string | null
  last_discogs_sync: string | null
}

type Stats = {
  total: number
  with_discogs: number
  with_price: number
  last_discogs_sync: string | null
  last_legacy_sync: string | null
  formats: { format: string; count: number }[]
  price_stats: { min: number; max: number; avg: number; median: number } | null
}

const COLORS = {
  bg: "#1c1915",
  card: "#2a2520",
  text: "#f5f0eb",
  muted: "#a09080",
  gold: "#d4a54a",
  border: "#3a3530",
  hover: "#353025",
}

const STATUS_COLORS: Record<string, string> = {
  available: "#22c55e",
  reserved: "#eab308",
  in_auction: "#3b82f6",
  sold: "#ef4444",
  unsold: "#a09080",
}

const FORMAT_OPTIONS = ["LP", "CD", "CASSETTE", "DVD", "7\"", "10\"", "12\"", "BOX SET", "OTHER"]

const formatDate = (d: string | null) => {
  if (!d) return "\u2014"
  return new Date(d).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const formatPrice = (p: number | null) => {
  if (p === null || p === undefined) return "\u2014"
  return `\u20AC${p.toFixed(2)}`
}

const MediaPage = () => {
  const [releases, setReleases] = useState<Release[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  // Filters
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFormat, setActiveFormat] = useState<string | null>(null)
  const [hasDiscogs, setHasDiscogs] = useState("")
  const [hasPrice, setHasPrice] = useState("")
  const [auctionStatus, setAuctionStatus] = useState("")
  const [sortField, setSortField] = useState("")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  // Pagination
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Reset page on filter change
  useEffect(() => {
    setPage(0)
  }, [searchQuery, activeFormat, hasDiscogs, hasPrice, auctionStatus, pageSize])

  // Fetch stats
  useEffect(() => {
    fetch("/admin/media/stats", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setStats(d)
        setStatsLoading(false)
      })
      .catch((err) => {
        console.error("Stats error:", err)
        setStatsLoading(false)
      })
  }, [])

  // Fetch releases
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (searchQuery) params.set("q", searchQuery)
    if (activeFormat) params.set("format", activeFormat)
    if (hasDiscogs) params.set("has_discogs", hasDiscogs)
    if (hasPrice) params.set("has_price", hasPrice)
    if (auctionStatus) params.set("auction_status", auctionStatus)
    if (sortField) params.set("sort", `${sortField}:${sortDir}`)
    params.set("limit", String(pageSize))
    params.set("offset", String(page * pageSize))

    fetch(`/admin/media?${params.toString()}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setReleases(d.releases || [])
        setCount(d.count || 0)
        setLoading(false)
      })
      .catch((err) => {
        console.error("Fetch error:", err)
        setLoading(false)
      })
  }, [searchQuery, activeFormat, hasDiscogs, hasPrice, auctionStatus, sortField, sortDir, page, pageSize])

  const totalPages = Math.ceil(count / pageSize)

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const sortIndicator = (field: string) => {
    if (sortField !== field) return ""
    return sortDir === "asc" ? " \u25B2" : " \u25BC"
  }

  const navigateToDetail = (id: string) => {
    window.location.href = `/app/media/${id}`
  }

  // Styles
  const cardStyle: React.CSSProperties = {
    background: COLORS.card,
    borderRadius: "8px",
    padding: "16px 20px",
    border: `1px solid ${COLORS.border}`,
  }

  const inputStyle: React.CSSProperties = {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "6px",
    padding: "8px 12px",
    color: COLORS.text,
    fontSize: "14px",
    outline: "none",
    width: "100%",
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    width: "auto",
    minWidth: "120px",
    cursor: "pointer",
  }

  const thStyle: React.CSSProperties = {
    padding: "10px 12px",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: `1px solid ${COLORS.border}`,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  }

  const tdStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: "14px",
    color: COLORS.text,
    borderBottom: `1px solid ${COLORS.border}`,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "200px",
  }

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px",
    borderRadius: "20px",
    border: `1px solid ${active ? COLORS.gold : COLORS.border}`,
    background: active ? COLORS.gold : "transparent",
    color: active ? "#1c1915" : COLORS.text,
    fontSize: "13px",
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    transition: "all 0.15s",
  })

  const pageBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    borderRadius: "4px",
    border: `1px solid ${active ? COLORS.gold : COLORS.border}`,
    background: active ? COLORS.gold : "transparent",
    color: active ? "#1c1915" : COLORS.text,
    fontSize: "13px",
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
  })

  return (
    <ErrorBoundary>
    <div style={{ padding: "24px", background: COLORS.bg, minHeight: "100vh", color: COLORS.text }}>
      {/* Page Title */}
      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "20px" }}>
        Medien-Verwaltung
      </h1>

      {/* Stats Header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
        <div style={cardStyle}>
          <div style={{ fontSize: "12px", color: COLORS.muted, marginBottom: "4px", textTransform: "uppercase" }}>
            Gesamt Releases
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: COLORS.gold }}>
            {statsLoading ? "..." : stats?.total?.toLocaleString("de-DE") || "0"}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "12px", color: COLORS.muted, marginBottom: "4px", textTransform: "uppercase" }}>
            Mit Discogs
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: COLORS.gold }}>
            {statsLoading ? "..." : stats?.with_discogs?.toLocaleString("de-DE") || "0"}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "12px", color: COLORS.muted, marginBottom: "4px", textTransform: "uppercase" }}>
            Mit Preis
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: COLORS.gold }}>
            {statsLoading ? "..." : stats?.with_price?.toLocaleString("de-DE") || "0"}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "12px", color: COLORS.muted, marginBottom: "4px", textTransform: "uppercase" }}>
            Letzter Sync
          </div>
          <div style={{ fontSize: "16px", fontWeight: 500 }}>
            {statsLoading ? "..." : formatDate(stats?.last_discogs_sync || null)}
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: "16px" }}>
        <input
          type="text"
          placeholder="Suche nach Artist, Titel, Label, CatNo..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ ...inputStyle, maxWidth: "500px", fontSize: "15px", padding: "10px 14px" }}
        />
      </div>

      {/* Format Pills */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        <button
          onClick={() => setActiveFormat(null)}
          style={btnStyle(activeFormat === null)}
        >
          Alle
        </button>
        {FORMAT_OPTIONS.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFormat(activeFormat === f ? null : f)}
            style={btnStyle(activeFormat === f)}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Filter Row */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "13px", color: COLORS.muted }}>Discogs:</label>
          <select
            value={hasDiscogs}
            onChange={(e) => setHasDiscogs(e.target.value)}
            style={selectStyle}
          >
            <option value="">Alle</option>
            <option value="true">Ja</option>
            <option value="false">Nein</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "13px", color: COLORS.muted }}>Preis:</label>
          <select
            value={hasPrice}
            onChange={(e) => setHasPrice(e.target.value)}
            style={selectStyle}
          >
            <option value="">Alle</option>
            <option value="true">Ja</option>
            <option value="false">Nein</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "13px", color: COLORS.muted }}>Auktions-Status:</label>
          <select
            value={auctionStatus}
            onChange={(e) => setAuctionStatus(e.target.value)}
            style={selectStyle}
          >
            <option value="">Alle</option>
            <option value="available">Verfuegbar</option>
            <option value="reserved">Reserviert</option>
            <option value="in_auction">In Auktion</option>
            <option value="sold">Verkauft</option>
            <option value="unsold">Unverkauft</option>
          </select>
        </div>
        <div style={{ marginLeft: "auto", fontSize: "13px", color: COLORS.muted }}>
          {count.toLocaleString("de-DE")} Ergebnis{count !== 1 ? "se" : ""}
        </div>
      </div>

      {/* Table */}
      <div style={{ ...cardStyle, padding: 0, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: "44px", cursor: "default" }}>Cover</th>
              <th style={thStyle} onClick={() => handleSort("artist_name")}>
                Artist{sortIndicator("artist_name")}
              </th>
              <th style={thStyle} onClick={() => handleSort("title")}>
                Titel{sortIndicator("title")}
              </th>
              <th style={thStyle} onClick={() => handleSort("format")}>
                Format{sortIndicator("format")}
              </th>
              <th style={thStyle} onClick={() => handleSort("year")}>
                Jahr{sortIndicator("year")}
              </th>
              <th style={thStyle} onClick={() => handleSort("label_name")}>
                Label{sortIndicator("label_name")}
              </th>
              <th style={{ ...thStyle, cursor: "default" }}>CatNo</th>
              <th style={thStyle} onClick={() => handleSort("lowest_price")}>
                Discogs Preis{sortIndicator("lowest_price")}
              </th>
              <th style={{ ...thStyle, cursor: "default" }}>Discogs ID</th>
              <th style={{ ...thStyle, cursor: "default" }}>Status</th>
              <th style={{ ...thStyle, cursor: "default" }}>Letzter Sync</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} style={{ ...tdStyle, textAlign: "center", padding: "40px", color: COLORS.muted }}>
                  Laden...
                </td>
              </tr>
            ) : releases.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ ...tdStyle, textAlign: "center", padding: "40px", color: COLORS.muted }}>
                  Keine Ergebnisse gefunden.
                </td>
              </tr>
            ) : (
              releases.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigateToDetail(r.id)}
                  style={{ cursor: "pointer", transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={tdStyle}>
                    {r.coverImage ? (
                      <img
                        src={r.coverImage}
                        alt=""
                        style={{
                          width: "32px",
                          height: "32px",
                          objectFit: "cover",
                          borderRadius: "4px",
                          border: `1px solid ${COLORS.border}`,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "4px",
                          background: COLORS.border,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "12px",
                          color: COLORS.muted,
                        }}
                      >
                        \u266B
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>{r.artist_name || "\u2014"}</td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{r.title || "\u2014"}</td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        background: COLORS.hover,
                        color: COLORS.text,
                      }}
                    >
                      {r.format || "\u2014"}
                    </span>
                  </td>
                  <td style={tdStyle}>{r.year || "\u2014"}</td>
                  <td style={tdStyle}>{r.label_name || "\u2014"}</td>
                  <td style={{ ...tdStyle, fontSize: "12px", color: COLORS.muted }}>{r.cat_no || "\u2014"}</td>
                  <td style={{ ...tdStyle, color: r.lowest_price ? COLORS.gold : COLORS.muted }}>
                    {formatPrice(r.lowest_price)}
                  </td>
                  <td style={tdStyle}>
                    {r.discogs_id ? (
                      <a
                        href={`https://www.discogs.com/release/${r.discogs_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: COLORS.gold, textDecoration: "none", fontSize: "13px" }}
                      >
                        {r.discogs_id} \u2197
                      </a>
                    ) : (
                      <span style={{ color: COLORS.muted }}>\u2014</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {r.auction_status ? (
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: 600,
                          background: `${STATUS_COLORS[r.auction_status] || COLORS.muted}20`,
                          color: STATUS_COLORS[r.auction_status] || COLORS.muted,
                          textTransform: "capitalize",
                        }}
                      >
                        {r.auction_status}
                      </span>
                    ) : (
                      <span style={{ color: COLORS.muted }}>\u2014</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontSize: "12px", color: COLORS.muted }}>
                    {formatDate(r.last_discogs_sync)}
                  </td>
                </tr>
              ))
            )}
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
            marginTop: "16px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              style={{
                ...pageBtnStyle(false),
                opacity: page === 0 ? 0.4 : 1,
                cursor: page === 0 ? "default" : "pointer",
              }}
            >
              \u2190 Zurueck
            </button>
            {(() => {
              const pages: number[] = []
              const start = Math.max(0, page - 2)
              const end = Math.min(totalPages - 1, page + 2)
              if (start > 0) pages.push(0)
              if (start > 1) pages.push(-1) // ellipsis marker
              for (let i = start; i <= end; i++) pages.push(i)
              if (end < totalPages - 2) pages.push(-2) // ellipsis marker
              if (end < totalPages - 1) pages.push(totalPages - 1)
              return pages.map((p, idx) =>
                p < 0 ? (
                  <span key={`ellipsis-${idx}`} style={{ color: COLORS.muted, padding: "0 4px" }}>
                    ...
                  </span>
                ) : (
                  <button key={p} onClick={() => setPage(p)} style={pageBtnStyle(p === page)}>
                    {p + 1}
                  </button>
                )
              )
            })()}
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              style={{
                ...pageBtnStyle(false),
                opacity: page >= totalPages - 1 ? 0.4 : 1,
                cursor: page >= totalPages - 1 ? "default" : "pointer",
              }}
            >
              Weiter \u2192
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label style={{ fontSize: "13px", color: COLORS.muted }}>Pro Seite:</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              style={{ ...selectStyle, minWidth: "70px" }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span style={{ fontSize: "13px", color: COLORS.muted }}>
              Seite {page + 1} von {totalPages}
            </span>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  )
}

export const config = defineRouteConfig({
  label: "Medien",
})

export default MediaPage
