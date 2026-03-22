import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useEffect, useState, useCallback, useRef } from "react"

const COLORS = {
  bg: "#1c1915",
  card: "#2a2520",
  text: "#f5f0eb",
  muted: "#a09080",
  gold: "#d4a54a",
  border: "#3a3530",
  hover: "#353025",
}

type Musician = {
  id: string
  name: string
  slug: string
  real_name: string | null
  country: string | null
  birth_year: number | null
  death_year: number | null
  bio: string | null
  data_source: string | null
  confidence: number
  needs_review: boolean
  role_count: number
  band_count: number
  created_at: string
}

type Stats = {
  total_musicians: number
  needs_review: number
  from_discogs: number
  from_musicbrainz: number
  from_credits: number
  from_ai: number
  from_manual: number
  bands_with_members: number
}

function MusiciansPage() {
  const [musicians, setMusicians] = useState<Musician[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [reviewFilter, setReviewFilter] = useState("")
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" })
      if (debouncedSearch) params.set("q", debouncedSearch)
      if (reviewFilter) params.set("needs_review", reviewFilter)

      const resp = await fetch(`/admin/musicians?${params}`, { credentials: "include" })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setMusicians(data.items || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
      setStats(data.stats || null)
    } catch (err) {
      console.error("Failed to fetch musicians:", err)
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, reviewFilter])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div style={{ padding: 24, background: COLORS.bg, minHeight: "100vh", color: COLORS.text }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Musicians</h1>

      {/* Stats */}
      {stats && (
        <div style={{
          background: COLORS.card, borderRadius: 10, padding: "14px 20px",
          marginBottom: 20, border: `1px solid ${COLORS.border}`,
          display: "flex", gap: 20, flexWrap: "wrap", fontSize: 12, color: COLORS.muted,
        }}>
          <span>
            <span style={{ color: COLORS.gold, fontWeight: 700, fontSize: 18 }}>
              {stats.total_musicians.toLocaleString()}
            </span>{" "}musicians
          </span>
          <span>
            <span style={{ color: COLORS.text, fontWeight: 600 }}>{stats.bands_with_members}</span> bands with members
          </span>
          {stats.needs_review > 0 && (
            <span>
              <span style={{ color: "#ef8833", fontWeight: 600 }}>{stats.needs_review}</span> needs review
            </span>
          )}
          <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            {stats.from_discogs > 0 && <span>Discogs: {stats.from_discogs}</span>}
            {stats.from_musicbrainz > 0 && <span>MB: {stats.from_musicbrainz}</span>}
            {stats.from_credits > 0 && <span>Credits: {stats.from_credits}</span>}
            {stats.from_ai > 0 && <span>AI: {stats.from_ai}</span>}
            {stats.from_manual > 0 && <span>Manual: {stats.from_manual}</span>}
          </span>
        </div>
      )}

      {/* Empty state when no musicians yet */}
      {stats && stats.total_musicians === 0 && !loading && (
        <div style={{
          background: COLORS.card, borderRadius: 10, padding: 40,
          border: `1px solid ${COLORS.border}`, textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎵</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: COLORS.text }}>
            Musician Database Ready
          </div>
          <div style={{ fontSize: 13, color: COLORS.muted, maxWidth: 400, margin: "0 auto" }}>
            The musician tables are created and waiting for data.
            Musicians will be populated automatically during the Entity Content Overhaul
            (Phase 6+, Musician Mapper Agent) or can be added manually.
          </div>
        </div>
      )}

      {/* Filters */}
      {stats && stats.total_musicians > 0 && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text" placeholder="Search by name..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: "8px 12px", background: COLORS.card,
                border: `1px solid ${COLORS.border}`, borderRadius: 6,
                color: COLORS.text, fontSize: 13, width: 240, outline: "none",
              }}
            />
            <select
              value={reviewFilter}
              onChange={(e) => { setReviewFilter(e.target.value); setPage(1) }}
              style={{
                padding: "8px 12px", background: COLORS.card,
                border: `1px solid ${COLORS.border}`, borderRadius: 6,
                color: COLORS.text, fontSize: 13, outline: "none",
              }}
            >
              <option value="">Review: All</option>
              <option value="true">Needs Review</option>
              <option value="false">Reviewed</option>
            </select>
            <span style={{ fontSize: 12, color: COLORS.muted }}>
              {total} result{total !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Table */}
          <div style={{ background: COLORS.card, borderRadius: 8, border: `1px solid ${COLORS.border}`, overflow: "hidden" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "2fr 1fr 80px 80px 80px 80px",
              padding: "10px 16px", borderBottom: `1px solid ${COLORS.border}`,
              fontSize: 11, fontWeight: 600, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              <span>Name</span>
              <span>Country</span>
              <span style={{ textAlign: "center" }}>Bands</span>
              <span style={{ textAlign: "center" }}>Roles</span>
              <span style={{ textAlign: "center" }}>Source</span>
              <span style={{ textAlign: "center" }}>Review</span>
            </div>

            {loading && (
              <div style={{ padding: 40, textAlign: "center", color: COLORS.muted, fontSize: 14 }}>Loading...</div>
            )}

            {!loading && musicians.map((m) => (
              <div key={m.id} style={{
                display: "grid", gridTemplateColumns: "2fr 1fr 80px 80px 80px 80px",
                padding: "10px 16px", borderBottom: `1px solid ${COLORS.border}`,
                alignItems: "center", fontSize: 13,
              }}>
                <div>
                  <span style={{ fontWeight: 500, color: COLORS.text }}>{m.name}</span>
                  {m.real_name && m.real_name !== m.name && (
                    <span style={{ color: COLORS.muted, fontSize: 11, marginLeft: 6 }}>({m.real_name})</span>
                  )}
                  {m.death_year && (
                    <span style={{ color: "#ef4444", fontSize: 10, marginLeft: 6 }}>† {m.death_year}</span>
                  )}
                </div>
                <span style={{ color: COLORS.muted }}>{m.country || "—"}</span>
                <span style={{ textAlign: "center", color: COLORS.text, fontWeight: 600 }}>{m.band_count}</span>
                <span style={{ textAlign: "center", color: COLORS.muted }}>{m.role_count}</span>
                <span style={{ textAlign: "center" }}>
                  <span style={{
                    padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                    background: `${COLORS.gold}22`, color: COLORS.gold,
                  }}>
                    {m.data_source || "—"}
                  </span>
                </span>
                <span style={{ textAlign: "center" }}>
                  {m.needs_review ? (
                    <span style={{ color: "#ef8833", fontSize: 11, fontWeight: 600 }}>⚠ Review</span>
                  ) : (
                    <span style={{ color: "#22c55e", fontSize: 11 }}>✓</span>
                  )}
                </span>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 16 }}>
              <button
                onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
                style={{
                  padding: "6px 14px", background: COLORS.card,
                  border: `1px solid ${COLORS.border}`, borderRadius: 4,
                  color: page <= 1 ? COLORS.muted : COLORS.text, fontSize: 13,
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                }}
              >Prev</button>
              <span style={{ fontSize: 13, color: COLORS.muted }}>Page {page} of {pages}</span>
              <button
                onClick={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages}
                style={{
                  padding: "6px 14px", background: COLORS.card,
                  border: `1px solid ${COLORS.border}`, borderRadius: 4,
                  color: page >= pages ? COLORS.muted : COLORS.text, fontSize: 13,
                  cursor: page >= pages ? "not-allowed" : "pointer",
                }}
              >Next</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Musicians",
})

export default MusiciansPage
