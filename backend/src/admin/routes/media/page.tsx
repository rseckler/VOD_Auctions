import { Component, useEffect, useState } from "react"
import { useAdminNav } from "../../components/admin-nav"
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
  legacy_price: number | null
  inventory: number | null
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

const FORMAT_OPTIONS = ["LP", "CD", "CASSETTE", "VHS", "REEL", "BOXSET", "MAGAZINE", "BOOK", "POSTER", "ZINE", "PHOTO", "POSTCARD", "MERCHANDISE", "OTHER"]

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

const CONDITION_OPTIONS = [
  "Mint (M)",
  "Near Mint (NM or M-)",
  "Very Good Plus (VG+)",
  "Very Good (VG)",
  "Good Plus (G+)",
  "Good (G)",
  "Fair (F)",
  "Poor (P)",
]

type GalleryRelease = {
  id: string
  title: string
  artist_name: string | null
  label_name: string | null
  format: string
  format_name: string | null
  year: number | null
  coverImage: string
  discogs_lowest_price: number | null
  legacy_price: number | null
  auction_status: string | null
}

const ImageGalleryOverlay = ({ onClose }: { onClose: () => void }) => {
  const [items, setItems] = useState<GalleryRelease[]>([])
  const [galleryCount, setGalleryCount] = useState(0)
  const [galleryLoading, setGalleryLoading] = useState(true)
  const [galleryPage, setGalleryPage] = useState(0)
  const [gallerySearch, setGallerySearch] = useState("")
  const [gallerySearchInput, setGallerySearchInput] = useState("")
  const [lightboxImage, setLightboxImage] = useState<GalleryRelease | null>(null)
  const galleryPageSize = 60

  useEffect(() => {
    const timer = setTimeout(() => setGallerySearch(gallerySearchInput), 300)
    return () => clearTimeout(timer)
  }, [gallerySearchInput])

  useEffect(() => { setGalleryPage(0) }, [gallerySearch])

  useEffect(() => {
    setGalleryLoading(true)
    const params = new URLSearchParams()
    params.set("has_image", "true")
    if (gallerySearch) params.set("q", gallerySearch)
    params.set("limit", String(galleryPageSize))
    params.set("offset", String(galleryPage * galleryPageSize))
    params.set("sort", "artist_name_asc")
    fetch(`/admin/media?${params.toString()}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setItems(d.releases || [])
        setGalleryCount(d.count || 0)
        setGalleryLoading(false)
      })
      .catch(() => setGalleryLoading(false))
  }, [gallerySearch, galleryPage])

  const totalGalleryPages = Math.ceil(galleryCount / galleryPageSize)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxImage) setLightboxImage(null)
        else onClose()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [lightboxImage, onClose])

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.85)", zIndex: 9999,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: `1px solid ${COLORS.border}`, background: COLORS.bg, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: COLORS.text, margin: 0 }}>Image Gallery</h2>
          <span style={{ fontSize: "13px", color: COLORS.muted }}>{galleryCount.toLocaleString("en-US")} items with images</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <input
            type="text"
            placeholder="Search artist, title, label..."
            value={gallerySearchInput}
            onChange={(e) => setGallerySearchInput(e.target.value)}
            autoFocus
            style={{
              background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: "6px",
              padding: "8px 14px", color: COLORS.text, fontSize: "14px", outline: "none", width: "300px",
            }}
          />
          <button onClick={onClose} style={{
            background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: "6px",
            color: COLORS.text, fontSize: "20px", cursor: "pointer", padding: "4px 12px", lineHeight: 1,
          }}>&times;</button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
        {galleryLoading ? (
          <div style={{ textAlign: "center", padding: "60px", color: COLORS.muted }}>Loading...</div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px", color: COLORS.muted }}>No images found.</div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "16px",
          }}>
            {items.map((r) => (
              <div
                key={r.id}
                style={{
                  background: COLORS.card, borderRadius: "8px", border: `1px solid ${COLORS.border}`,
                  overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s, transform 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = COLORS.gold
                  e.currentTarget.style.transform = "translateY(-2px)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border
                  e.currentTarget.style.transform = "translateY(0)"
                }}
                onClick={() => setLightboxImage(r)}
              >
                <div style={{ position: "relative", width: "100%", paddingTop: "100%", overflow: "hidden" }}>
                  <img
                    src={r.coverImage}
                    alt={r.title}
                    loading="lazy"
                    style={{
                      position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                      objectFit: "cover",
                    }}
                  />
                  {r.auction_status && (
                    <span style={{
                      position: "absolute", top: "6px", right: "6px",
                      padding: "2px 6px", borderRadius: "8px", fontSize: "10px", fontWeight: 600,
                      background: `${STATUS_COLORS[r.auction_status] || COLORS.muted}cc`,
                      color: "#fff", textTransform: "capitalize",
                    }}>{r.auction_status}</span>
                  )}
                </div>
                <div style={{ padding: "8px 10px" }}>
                  <div style={{
                    fontSize: "12px", fontWeight: 600, color: COLORS.text,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{r.artist_name || "Unknown"}</div>
                  <div style={{
                    fontSize: "11px", color: COLORS.muted,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{r.title}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                    <span style={{ fontSize: "10px", color: COLORS.muted }}>{r.format_name || r.format}{r.year ? ` \u00B7 ${r.year}` : ""}</span>
                    {r.legacy_price != null && (
                      <span style={{ fontSize: "10px", color: COLORS.gold, fontWeight: 600 }}>\u20AC{Number(r.legacy_price).toFixed(2)}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalGalleryPages > 1 && (
        <div style={{
          padding: "12px 24px", borderTop: `1px solid ${COLORS.border}`, background: COLORS.bg,
          display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", flexShrink: 0,
        }}>
          <button
            onClick={() => setGalleryPage(Math.max(0, galleryPage - 1))}
            disabled={galleryPage === 0}
            style={{
              padding: "6px 12px", borderRadius: "4px", border: `1px solid ${COLORS.border}`,
              background: "transparent", color: COLORS.text, fontSize: "13px",
              cursor: galleryPage === 0 ? "default" : "pointer", opacity: galleryPage === 0 ? 0.4 : 1,
            }}
          >&larr; Previous</button>
          <span style={{ fontSize: "13px", color: COLORS.muted }}>
            Page {galleryPage + 1} of {totalGalleryPages}
          </span>
          <button
            onClick={() => setGalleryPage(Math.min(totalGalleryPages - 1, galleryPage + 1))}
            disabled={galleryPage >= totalGalleryPages - 1}
            style={{
              padding: "6px 12px", borderRadius: "4px", border: `1px solid ${COLORS.border}`,
              background: "transparent", color: COLORS.text, fontSize: "13px",
              cursor: galleryPage >= totalGalleryPages - 1 ? "default" : "pointer",
              opacity: galleryPage >= totalGalleryPages - 1 ? 0.4 : 1,
            }}
          >Next &rarr;</button>
        </div>
      )}

      {/* Lightbox */}
      {lightboxImage && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.92)", zIndex: 10000,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
          onClick={() => setLightboxImage(null)}
        >
          <div
            style={{
              maxWidth: "90vw", maxHeight: "90vh", display: "flex", flexDirection: "column",
              alignItems: "center", gap: "16px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage.coverImage}
              alt={lightboxImage.title}
              style={{
                maxWidth: "80vw", maxHeight: "70vh", objectFit: "contain",
                borderRadius: "8px", border: `1px solid ${COLORS.border}`,
              }}
            />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "18px", fontWeight: 700, color: COLORS.text }}>
                {lightboxImage.artist_name ? `${lightboxImage.artist_name} \u2014 ` : ""}{lightboxImage.title}
              </div>
              <div style={{ fontSize: "14px", color: COLORS.muted, marginTop: "4px" }}>
                {[lightboxImage.format_name || lightboxImage.format, lightboxImage.year, lightboxImage.label_name].filter(Boolean).join(" \u00B7 ")}
              </div>
              <div style={{ marginTop: "12px", display: "flex", gap: "12px", justifyContent: "center" }}>
                <button
                  onClick={() => { window.location.href = `/app/media/${lightboxImage.id}` }}
                  style={{
                    padding: "8px 20px", borderRadius: "6px", border: "none",
                    background: COLORS.gold, color: "#1c1915", fontSize: "13px", fontWeight: 600, cursor: "pointer",
                  }}
                >Open Detail</button>
                <button
                  onClick={() => setLightboxImage(null)}
                  style={{
                    padding: "8px 20px", borderRadius: "6px", border: `1px solid ${COLORS.border}`,
                    background: "transparent", color: COLORS.text, fontSize: "13px", cursor: "pointer",
                  }}
                >Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const MediaPage = () => {
  useAdminNav()
  const [releases, setReleases] = useState<Release[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  // Catalog visibility setting
  const [catalogVisibility, setCatalogVisibility] = useState<string>("all")
  const [catalogVisibilityLoading, setCatalogVisibilityLoading] = useState(false)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<string | null>(null)
  const [bulkValue, setBulkValue] = useState("")
  const [bulkLoading, setBulkLoading] = useState(false)
  const [refetchTrigger, setRefetchTrigger] = useState(0)
  const [blocks, setBlocks] = useState<{ id: string; title: string; status: string }[]>([])
  const [galleryOpen, setGalleryOpen] = useState(false)

  const allOnPageSelected = releases.length > 0 && releases.every((r) => selectedIds.has(r.id))

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        releases.forEach((r) => next.delete(r.id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        releases.forEach((r) => next.add(r.id))
        return next
      })
    }
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setBulkAction(null)
    setBulkValue("")
  }

  const executeBulkUpdate = async () => {
    if (!bulkAction || selectedIds.size === 0) return
    setBulkLoading(true)

    const updates: Record<string, any> = {}
    if (bulkAction === "estimated_value") {
      updates.estimated_value = bulkValue === "" ? null : Number(bulkValue)
    } else if (bulkAction === "estimated_value_discogs") {
      // Set estimated_value from discogs median — handled per-release
      const releasesWithDiscogs = releases.filter(
        (r) => selectedIds.has(r.id) && r.lowest_price != null
      )
      if (releasesWithDiscogs.length === 0) {
        alert("None of the selected releases have a Discogs price.")
        setBulkLoading(false)
        return
      }
      // Batch update each with its own discogs price
      try {
        for (const r of releasesWithDiscogs) {
          await fetch(`/admin/media/${r.id}`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ estimated_value: Number(r.lowest_price) }),
          })
        }
        alert(`Updated ${releasesWithDiscogs.length} releases with Discogs prices.`)
        setRefetchTrigger((n) => n + 1)
      } catch (err) {
        alert("Error updating releases: " + (err as Error).message)
      }
      setBulkLoading(false)
      setBulkAction(null)
      setBulkValue("")
      return
    } else if (bulkAction === "assign_to_block") {
      const blockId = bulkValue
      let added = 0
      let skipped = 0
      let errors = 0
      try {
        for (const id of Array.from(selectedIds)) {
          const resp = await fetch(`/admin/auction-blocks/${blockId}/items`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ release_id: id }),
          })
          if (resp.ok) {
            added++
          } else if (resp.status === 409) {
            skipped++
          } else {
            errors++
          }
        }
        alert(`Assigned ${added} to block. ${skipped ? `${skipped} already in block. ` : ""}${errors ? `${errors} errors.` : ""}`)
        setRefetchTrigger((n) => n + 1)
      } catch (err) {
        alert("Error assigning to block: " + (err as Error).message)
      }
      setBulkLoading(false)
      setBulkAction(null)
      setBulkValue("")
      return
    } else if (bulkAction === "media_condition") {
      updates.media_condition = bulkValue || null
    } else if (bulkAction === "sleeve_condition") {
      updates.sleeve_condition = bulkValue || null
    } else if (bulkAction === "auction_status") {
      updates.auction_status = bulkValue || null
    }

    try {
      const resp = await fetch("/admin/media/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), updates }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        alert("Error: " + (data.message || "Bulk update failed"))
      } else {
        alert(`Updated ${data.updated_count} releases.`)
        setRefetchTrigger((n) => n + 1)
      }
    } catch (err) {
      alert("Error: " + (err as Error).message)
    }
    setBulkLoading(false)
    setBulkAction(null)
    setBulkValue("")
  }

  const exportCsv = async () => {
    if (selectedIds.size === 0) return
    try {
      const resp = await fetch("/admin/media/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      if (!resp.ok) {
        alert("Export failed")
        return
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `media-export-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert("Export error: " + (err as Error).message)
    }
  }

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
  const [visibilityFilter, setVisibilityFilter] = useState("")
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
  }, [searchQuery, activeFormat, activeCategory, hasDiscogs, hasPrice, auctionStatus, countryFilter, yearFrom, yearTo, labelFilter, visibilityFilter, pageSize])

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

  // Fetch catalog visibility setting
  useEffect(() => {
    fetch("/admin/site-config", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setCatalogVisibility(d.config?.catalog_visibility || "all"))
      .catch(() => {})
  }, [])

  const toggleCatalogVisibility = async () => {
    const newValue = catalogVisibility === "visible" ? "all" : "visible"
    setCatalogVisibilityLoading(true)
    try {
      const resp = await fetch("/admin/site-config", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalog_visibility: newValue }),
      })
      const d = await resp.json()
      setCatalogVisibility(d.config?.catalog_visibility || newValue)
    } catch (err) {
      console.error("Failed to update catalog visibility:", err)
    } finally {
      setCatalogVisibilityLoading(false)
    }
  }

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
    if (visibilityFilter) params.set("visibility", visibilityFilter)
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
  }, [searchQuery, activeFormat, activeCategory, hasDiscogs, hasPrice, auctionStatus, countryFilter, yearFrom, yearTo, labelFilter, visibilityFilter, sortField, sortDir, page, pageSize, refetchTrigger])

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
    <div style={{ padding: "24px", background: COLORS.bg, minHeight: "100vh", color: COLORS.text, minWidth: 0, width: "100%", overflowX: "hidden", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>
          Media Management
        </h1>
        <button
          onClick={() => setGalleryOpen(true)}
          style={{
            padding: "8px 18px", borderRadius: "6px",
            border: `1px solid ${COLORS.gold}`,
            background: "transparent", color: COLORS.gold,
            fontSize: "14px", fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", gap: "8px",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = `${COLORS.gold}15` }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
        >
          &#9635; Browse Images
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "16px", marginBottom: "24px" }}>
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

      {/* Catalog Visibility Toggle */}
      <div style={{
        ...cardStyle,
        marginBottom: "16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <span style={{ fontSize: "14px", fontWeight: 600 }}>Storefront Catalog Visibility</span>
          <span style={{ fontSize: "13px", color: COLORS.muted, marginLeft: "12px" }}>
            {catalogVisibility === "visible"
              ? "Customers see only items with image and price"
              : "Customers see all items"}
          </span>
        </div>
        <button
          onClick={toggleCatalogVisibility}
          disabled={catalogVisibilityLoading}
          style={{
            padding: "8px 20px",
            borderRadius: "6px",
            border: "none",
            fontWeight: 600,
            fontSize: "13px",
            cursor: catalogVisibilityLoading ? "wait" : "pointer",
            background: catalogVisibility === "visible" ? "#22c55e" : COLORS.gold,
            color: catalogVisibility === "visible" ? "#fff" : "#1c1915",
          }}
        >
          {catalogVisibilityLoading ? "..." : catalogVisibility === "visible" ? "Filter ON — Only with Image + Price" : "Filter OFF — Showing All"}
        </button>
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
          <label style={{ fontSize: "13px", color: COLORS.muted }}>Visibility:</label>
          <select value={visibilityFilter} onChange={(e) => setVisibilityFilter(e.target.value)} style={selectStyle}>
            <option value="">All</option>
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
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

      {/* Bulk Actions Toolbar */}
      {selectedIds.size > 0 && (
        <div style={{
          ...cardStyle,
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          background: `${COLORS.gold}10`,
          border: `1px solid ${COLORS.gold}40`,
        }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: COLORS.gold }}>
            {selectedIds.size} selected
          </span>
          <button onClick={clearSelection} style={{ ...btnStyle(false), fontSize: "12px", padding: "4px 10px" }}>Clear</button>
          <span style={{ width: "1px", height: "24px", background: COLORS.border }} />

          {/* Action selector */}
          <select
            value={bulkAction || ""}
            onChange={(e) => {
              const action = e.target.value || null
              setBulkAction(action)
              setBulkValue("")
              if (action === "assign_to_block") {
                fetch("/admin/auction-blocks", { credentials: "include" })
                  .then((r) => r.json())
                  .then((d) => setBlocks(
                    (d.auction_blocks || [])
                      .filter((b: any) => b.status === "draft" || b.status === "preview")
                      .map((b: any) => ({ id: b.id, title: b.title, status: b.status }))
                  ))
                  .catch(() => setBlocks([]))
              }
            }}
            style={{ ...selectStyle, minWidth: "180px" }}
          >
            <option value="">Choose action...</option>
            <option value="estimated_value">Set Estimated Value</option>
            <option value="estimated_value_discogs">Set Value from Discogs Price</option>
            <option value="media_condition">Set Media Condition</option>
            <option value="sleeve_condition">Set Sleeve Condition</option>
            <option value="auction_status">Set Auction Status</option>
            <option value="assign_to_block">Assign to Auction Block</option>
          </select>

          {/* Value input based on action */}
          {bulkAction === "estimated_value" && (
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Value in EUR"
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              style={{ ...smallInputStyle, width: "120px" }}
            />
          )}
          {(bulkAction === "media_condition" || bulkAction === "sleeve_condition") && (
            <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} style={{ ...selectStyle, minWidth: "200px" }}>
              <option value="">Select condition...</option>
              {CONDITION_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          {bulkAction === "auction_status" && (
            <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} style={selectStyle}>
              <option value="">Select status...</option>
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
            </select>
          )}
          {bulkAction === "assign_to_block" && (
            <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} style={{ ...selectStyle, minWidth: "220px" }}>
              <option value="">Select block...</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>{b.title} ({b.status})</option>
              ))}
              {blocks.length === 0 && <option disabled>No draft/preview blocks</option>}
            </select>
          )}

          {bulkAction && bulkAction !== "estimated_value_discogs" && bulkAction !== "assign_to_block" && (
            <button
              onClick={executeBulkUpdate}
              disabled={bulkLoading || !bulkValue}
              style={{
                padding: "6px 16px",
                borderRadius: "6px",
                border: "none",
                background: bulkLoading || !bulkValue ? COLORS.border : COLORS.gold,
                color: bulkLoading || !bulkValue ? COLORS.muted : "#1c1915",
                fontSize: "13px",
                fontWeight: 600,
                cursor: bulkLoading || !bulkValue ? "default" : "pointer",
              }}
            >
              {bulkLoading ? "Updating..." : "Apply"}
            </button>
          )}
          {bulkAction === "estimated_value_discogs" && (
            <button
              onClick={executeBulkUpdate}
              disabled={bulkLoading}
              style={{
                padding: "6px 16px",
                borderRadius: "6px",
                border: "none",
                background: bulkLoading ? COLORS.border : COLORS.gold,
                color: bulkLoading ? COLORS.muted : "#1c1915",
                fontSize: "13px",
                fontWeight: 600,
                cursor: bulkLoading ? "default" : "pointer",
              }}
            >
              {bulkLoading ? "Updating..." : "Apply Discogs Prices"}
            </button>
          )}
          {bulkAction === "assign_to_block" && (
            <button
              onClick={executeBulkUpdate}
              disabled={bulkLoading || !bulkValue}
              style={{
                padding: "6px 16px",
                borderRadius: "6px",
                border: "none",
                background: bulkLoading || !bulkValue ? COLORS.border : COLORS.gold,
                color: bulkLoading || !bulkValue ? COLORS.muted : "#1c1915",
                fontSize: "13px",
                fontWeight: 600,
                cursor: bulkLoading || !bulkValue ? "default" : "pointer",
              }}
            >
              {bulkLoading ? "Assigning..." : `Assign ${selectedIds.size} to Block`}
            </button>
          )}

          <span style={{ width: "1px", height: "24px", background: COLORS.border }} />
          <button
            onClick={exportCsv}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: `1px solid ${COLORS.border}`,
              background: "transparent",
              color: COLORS.text,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Export CSV
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ ...cardStyle, padding: 0, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: "36px", cursor: "pointer", textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleSelectAll}
                  style={{ cursor: "pointer", accentColor: COLORS.gold }}
                />
              </th>
              <th style={{ ...thStyle, width: "32px", cursor: "default", textAlign: "center" }} title="Visible to customers (has image + price)">Vis.</th>
              <th style={{ ...thStyle, width: "44px", cursor: "default" }}>Cover</th>
              <th style={{ ...thStyle, width: "40px", cursor: "default", textAlign: "center" }} title="Inventory (pieces in stock)">Inv.</th>
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
              <tr><td colSpan={16} style={{ ...tdStyle, textAlign: "center", padding: "40px", color: COLORS.muted }}>Loading...</td></tr>
            ) : releases.length === 0 ? (
              <tr><td colSpan={16} style={{ ...tdStyle, textAlign: "center", padding: "40px", color: COLORS.muted }}>No results found.</td></tr>
            ) : (
              releases.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigateToDetail(r.id)}
                  style={{
                    cursor: "pointer",
                    transition: "background 0.1s",
                    background: selectedIds.has(r.id) ? `${COLORS.gold}08` : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!selectedIds.has(r.id)) e.currentTarget.style.background = COLORS.hover
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = selectedIds.has(r.id) ? `${COLORS.gold}08` : "transparent"
                  }}
                >
                  <td style={{ ...tdStyle, textAlign: "center", width: "36px" }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleSelect(r.id)}
                      style={{ cursor: "pointer", accentColor: COLORS.gold }}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center", width: "32px" }} title={r.coverImage && r.legacy_price != null ? "Visible to customers" : `Hidden: ${!r.coverImage ? "no image" : ""}${!r.coverImage && r.legacy_price == null ? " + " : ""}${r.legacy_price == null ? "no price" : ""}`}>
                    <span style={{ fontSize: "16px", color: r.coverImage && r.legacy_price != null ? "#22c55e" : "#ef4444" }}>●</span>
                  </td>
                  <td style={tdStyle}>
                    {r.coverImage ? (
                      <img src={r.coverImage} alt="" style={{ width: "32px", height: "32px", objectFit: "cover", borderRadius: "4px", border: `1px solid ${COLORS.border}` }} />
                    ) : (
                      <div style={{ width: "32px", height: "32px", borderRadius: "4px", background: COLORS.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: COLORS.muted }}>&#9835;</div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center", fontFamily: "monospace", fontSize: "13px", color: r.inventory != null ? COLORS.text : COLORS.muted }}>{r.inventory ?? "\u2014"}</td>
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
    {galleryOpen && <ImageGalleryOverlay onClose={() => setGalleryOpen(false)} />}
    </ErrorBoundary>
  )
}

export default MediaPage
