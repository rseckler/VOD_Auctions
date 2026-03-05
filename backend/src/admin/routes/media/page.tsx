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
          <h2>Error in Media Management:</h2>
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
  format_name: string | null
  format_group: string | null
  format_kat: number | null
  product_category: string
  year: number | null
  country: string | null
  cat_no: string | null
  article_number: string | null
  discogs_id: number | null
  lowest_price: number | null
  auction_status: string | null
  sale_mode: string | null
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
  categories: { value: string; count: number }[]
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

const FORMAT_OPTIONS = ["LP", "CD", "CASSETTE", "DVD", "REEL", "BOXSET", "MAGAZINE", "BOOK", "POSTER", "ZINE", "PHOTO", "POSTCARD", "MERCHANDISE", "OTHER"]

const CATEGORY_OPTIONS = [
  { value: "tapes", label: "Tapes" },
  { value: "vinyl", label: "Vinyl" },
  { value: "band_literature", label: "Artists/Bands Lit" },
  { value: "label_literature", label: "Labels Lit" },
  { value: "press_literature", label: "Press/Org Lit" },
]

const CATEGORY_LABELS: Record<string, string> = {
  tapes: "Tapes",
  vinyl: "Vinyl",
  band_literature: "Band Lit",
  label_literature: "Label Lit",
  press_literature: "Press Lit",
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
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [hasDiscogs, setHasDiscogs] = useState("")
  const [hasPrice, setHasPrice] = useState("")
  const [auctionStatus, setAuctionStatus] = useState("")
  const [countryFilter, setCountryFilter] = useState("")
  const [yearFrom, setYearFrom] = useState("")
  const [yearTo, setYearTo] = useState("")
  const [labelFilter, setLabelFilter] = useState("")
  const [labelInput, setLabelInput] = useState("")
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

  // Debounce label filter
  useEffect(() => {
    const timer = setTimeout(() => setLabelFilter(labelInput), 300)
    return () => clearTimeout(timer)
  }, [labelInput])

  // Reset page on filter change
  useEffect(() => {
    setPage(0)
  }, [searchQuery, activeFormat, activeCategory, hasDiscogs, hasPrice, auctionStatus, countryFilter, yearFrom, yearTo, labelFilter, pageSize])

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
    if (activeCategory) params.set("category", activeCategory)
    if (hasDiscogs) params.set("has_discogs", hasDiscogs)
    if (hasPrice) params.set("has_price", hasPrice)
    if (auctionStatus) params.set("auction_status", auctionStatus)
    if (countryFilter) params.set("country", countryFilter)
    if (yearFrom) params.set("year_from", yearFrom)
    if (yearTo) params.set("year_to", yearTo)
    if (labelFilter) params.set("label", labelFilter)
    if (sortField) params.set("sort", `${sortField}_${sortDir}`)
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
  }, [searchQuery, activeFormat, activeCategory, hasDiscogs, hasPrice, auctionStatus, countryFilter, yearFrom, yearTo, labelFilter, sortField, sortDir, page, pageSize])

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

  const smallInputStyle: React.CSSProperties = {
    ...inputStyle,
    width: "80px",
    minWidth: "80px",
    padding: "6px 10px",
    fontSize: "13px",
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
      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "20px" }}>
        Media Management
      </h1>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
        <div style={cardStyle}>
          <div style={{ fontSize: "12px", color: COLORS.muted, marginBottom: "4px", textTransform: "uppercase" }}>Total Releases</div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: COLORS.gold }}>
            {statsLoading ? "..." : stats?.total?.toLocaleString("en-US") || "0"}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "12px", color: COLORS.muted, marginBottom: "4px", textTransform: "uppercase" }}>With Discogs</div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: COLORS.gold }}>
            {statsLoading ? "..." : stats?.with_discogs?.toLocaleString("en-US") || "0"}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "12px", color: COLORS.muted, marginBottom: "4px", textTransform: "uppercase" }}>With Price</div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: COLORS.gold }}>
            {statsLoading ? "..." : stats?.with_price?.toLocaleString("en-US") || "0"}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "12px", color: COLORS.muted, marginBottom: "4px", textTransform: "uppercase" }}>Last Sync</div>
          <div style={{ fontSize: "16px", fontWeight: 500 }}>
            {statsLoading ? "..." : formatDate(stats?.last_discogs_sync || null)}
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: "16px" }}>
        <input
          type="text"
          placeholder="Search by artist, title, label, catalog no..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ ...inputStyle, maxWidth: "500px", fontSize: "15px", padding: "10px 14px" }}
        />
      </div>

      {/* Category Pills */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
        <button onClick={() => setActiveCategory(null)} style={btnStyle(activeCategory === null)}>All Categories</button>
        {CATEGORY_OPTIONS.map((c) => (
          <button key={c.value} onClick={() => setActiveCategory(activeCategory === c.value ? null : c.value)} style={btnStyle(activeCategory === c.value)}>
            {c.label}
            {stats?.categories?.find((sc: any) => sc.value === c.value) && (
              <span style={{ marginLeft: "6px", opacity: 0.7, fontSize: "11px" }}>
                ({stats.categories.find((sc: any) => sc.value === c.value)?.count.toLocaleString("en-US")})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Format Pills */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        <button onClick={() => setActiveFormat(null)} style={btnStyle(activeFormat === null)}>All Formats</button>
        {FORMAT_OPTIONS.map((f) => (
          <button key={f} onClick={() => setActiveFormat(activeFormat === f ? null : f)} style={btnStyle(activeFormat === f)}>{f}</button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "13px", color: COLORS.muted }}>Discogs:</label>
          <select value={hasDiscogs} onChange={(e) => setHasDiscogs(e.target.value)} style={selectStyle}>
            <option value="">All</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "13px", color: COLORS.muted }}>Price:</label>
          <select value={hasPrice} onChange={(e) => setHasPrice(e.target.value)} style={selectStyle}>
            <option value="">All</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "13px", color: COLORS.muted }}>Status:</label>
          <select value={auctionStatus} onChange={(e) => setAuctionStatus(e.target.value)} style={selectStyle}>
            <option value="">All</option>
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            <option value="in_auction">In Auction</option>
            <option value="sold">Sold</option>
            <option value="unsold">Unsold</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "13px", color: COLORS.muted }}>Country:</label>
          <input type="text" placeholder="e.g. Germany" value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} style={{ ...smallInputStyle, width: "110px" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "13px", color: COLORS.muted }}>Year:</label>
          <input type="number" placeholder="From" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} style={smallInputStyle} />
          <span style={{ color: COLORS.muted }}>&ndash;</span>
          <input type="number" placeholder="To" value={yearTo} onChange={(e) => setYearTo(e.target.value)} style={smallInputStyle} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "13px", color: COLORS.muted }}>Label:</label>
          <input type="text" placeholder="Search label..." value={labelInput} onChange={(e) => setLabelInput(e.target.value)} style={{ ...smallInputStyle, width: "140px" }} />
        </div>
        <div style={{ marginLeft: "auto", fontSize: "13px", color: COLORS.muted }}>
          {count.toLocaleString("en-US")} result{count !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Table */}
      <div style={{ ...cardStyle, padding: 0, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: "44px", cursor: "default" }}>Cover</th>
              <th style={thStyle} onClick={() => handleSort("artist_name")}>Artist{sortIndicator("artist_name")}</th>
              <th style={thStyle} onClick={() => handleSort("title")}>Title{sortIndicator("title")}</th>
              <th style={thStyle} onClick={() => handleSort("format")}>Format{sortIndicator("format")}</th>
              <th style={thStyle} onClick={() => handleSort("year")}>Year{sortIndicator("year")}</th>
              <th style={thStyle} onClick={() => handleSort("country")}>Country{sortIndicator("country")}</th>
              <th style={thStyle} onClick={() => handleSort("label")}>Label{sortIndicator("label")}</th>
              <th style={{ ...thStyle, cursor: "default" }}>Art. No.</th>
              <th style={{ ...thStyle, cursor: "default" }}>CatNo</th>
              <th style={thStyle} onClick={() => handleSort("lowest_price")}>Discogs Price{sortIndicator("lowest_price")}</th>
              <th style={{ ...thStyle, cursor: "default" }}>Discogs ID</th>
              <th style={{ ...thStyle, cursor: "default" }}>Status</th>
              <th style={{ ...thStyle, cursor: "default" }}>Last Sync</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={13} style={{ ...tdStyle, textAlign: "center", padding: "40px", color: COLORS.muted }}>Loading...</td></tr>
            ) : releases.length === 0 ? (
              <tr><td colSpan={13} style={{ ...tdStyle, textAlign: "center", padding: "40px", color: COLORS.muted }}>No results found.</td></tr>
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
                      <img src={r.coverImage} alt="" style={{ width: "32px", height: "32px", objectFit: "cover", borderRadius: "4px", border: `1px solid ${COLORS.border}` }} />
                    ) : (
                      <div style={{ width: "32px", height: "32px", borderRadius: "4px", background: COLORS.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: COLORS.muted }}>&#9835;</div>
                    )}
                  </td>
                  <td style={tdStyle}>{r.artist_name || "\u2014"}</td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{r.title || "\u2014"}</td>
                  <td style={tdStyle}>
                    <span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "12px", background: COLORS.hover, color: COLORS.text }}>{r.format_name || r.format || "\u2014"}</span>
                    {(() => {
                      const cat = r.product_category === "release"
                        ? (r.format_kat === 2 ? "vinyl" : "tapes")
                        : r.product_category
                      return cat !== "tapes" ? (
                        <span style={{ marginLeft: "6px", padding: "1px 6px", borderRadius: "8px", fontSize: "10px", background: `${COLORS.gold}20`, color: COLORS.gold }}>{CATEGORY_LABELS[cat] || cat}</span>
                      ) : null
                    })()}
                  </td>
                  <td style={tdStyle}>{r.year || "\u2014"}</td>
                  <td style={{ ...tdStyle, fontSize: "13px" }}>{r.country || "\u2014"}</td>
                  <td style={tdStyle}>{r.label_name || "\u2014"}</td>
                  <td style={{ ...tdStyle, fontSize: "12px", fontFamily: "monospace", color: COLORS.gold }}>{r.article_number || "\u2014"}</td>
                  <td style={{ ...tdStyle, fontSize: "12px", color: COLORS.muted }}>{r.cat_no || "\u2014"}</td>
                  <td style={{ ...tdStyle, color: r.lowest_price ? COLORS.gold : COLORS.muted }}>{formatPrice(r.lowest_price)}</td>
                  <td style={tdStyle}>
                    {r.discogs_id ? (
                      <a href={`https://www.discogs.com/release/${r.discogs_id}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: COLORS.gold, textDecoration: "none", fontSize: "13px" }}>{r.discogs_id} &#8599;</a>
                    ) : (<span style={{ color: COLORS.muted }}>{"\u2014"}</span>)}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                      {r.auction_status ? (
                        <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600, background: `${STATUS_COLORS[r.auction_status] || COLORS.muted}20`, color: STATUS_COLORS[r.auction_status] || COLORS.muted, textTransform: "capitalize" }}>{r.auction_status}</span>
                      ) : (<span style={{ color: COLORS.muted }}>{"\u2014"}</span>)}
                      {r.sale_mode === "direct_purchase" && (
                        <span style={{ padding: "2px 6px", borderRadius: "8px", fontSize: "10px", fontWeight: 600, background: "#22c55e20", color: "#22c55e" }}>Direct</span>
                      )}
                      {r.sale_mode === "both" && (
                        <span style={{ padding: "2px 6px", borderRadius: "8px", fontSize: "10px", fontWeight: 600, background: "#3b82f620", color: "#60a5fa" }}>Both</span>
                      )}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, fontSize: "12px", color: COLORS.muted }}>{formatDate(r.last_discogs_sync)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} style={{ ...pageBtnStyle(false), opacity: page === 0 ? 0.4 : 1, cursor: page === 0 ? "default" : "pointer" }}>&#8592; Previous</button>
            {(() => {
              const pages: number[] = []
              const start = Math.max(0, page - 2)
              const end = Math.min(totalPages - 1, page + 2)
              if (start > 0) pages.push(0)
              if (start > 1) pages.push(-1)
              for (let i = start; i <= end; i++) pages.push(i)
              if (end < totalPages - 2) pages.push(-2)
              if (end < totalPages - 1) pages.push(totalPages - 1)
              return pages.map((p, idx) =>
                p < 0 ? (<span key={`ellipsis-${idx}`} style={{ color: COLORS.muted, padding: "0 4px" }}>...</span>) : (<button key={p} onClick={() => setPage(p)} style={pageBtnStyle(p === page)}>{p + 1}</button>)
              )
            })()}
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} style={{ ...pageBtnStyle(false), opacity: page >= totalPages - 1 ? 0.4 : 1, cursor: page >= totalPages - 1 ? "default" : "pointer" }}>Next &#8594;</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label style={{ fontSize: "13px", color: COLORS.muted }}>Per page:</label>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ ...selectStyle, minWidth: "70px" }}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span style={{ fontSize: "13px", color: COLORS.muted }}>Page {page + 1} of {totalPages}</span>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  )
}

export const config = defineRouteConfig({
  label: "Media",
})

export default MediaPage
