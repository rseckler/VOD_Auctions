import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Component, useEffect, useState, useCallback, useRef } from "react"
import type { ErrorInfo, ReactNode } from "react"

// ─── ErrorBoundary ────────────────────────────────────────────────────────────

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("EntityContentPage error:", error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "#ef4444" }}>
          <h2>Error in Entity Content:</h2>
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

// ─── Types ────────────────────────────────────────────────────────────────────

type EntityContentItem = {
  id: string
  entity_type: string
  entity_id: string
  entity_name: string
  release_count: number
  description: string | null
  short_description: string | null
  country: string | null
  founded_year: string | null
  genre_tags: string[] | null
  external_links: Record<string, string> | null
  is_published: boolean
  ai_generated: boolean
  ai_generated_at: string | null
  created_at: string
  updated_at: string
}

type Stats = Record<string, { total: number; with_content: number }>

type OverhaulStatus = {
  pipeline: {
    status: string
    current_phase: string
    started_at: string
    entities_processed: number
    entities_total: number
    entities_accepted: number
    entities_revised: number
    entities_rejected: number
    current_entity: string | null
    errors: number
    last_updated: string
  } | null
  process_running: boolean
  quality: Record<
    string,
    {
      total_with_content: number
      total_in_db: number
      with_description: number
      with_short_desc: number
      with_genre_tags: number
      with_country: number
      with_year: number
      with_links: number
      published: number
      ai_generated: number
      avg_description_length: number
      first_generated: string | null
      last_generated: string | null
    }
  >
  totals: Record<string, number>
  priorities: Record<string, { p1: number; p2: number; p3: number }>
  musician_stats: {
    total_musicians: number
    total_roles: number
    musicians_with_roles: number
    artists_with_members: number
  } | null
}

type EditForm = {
  description: string
  short_description: string
  country: string
  founded_year: string
  genre_tags: string
  is_published: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = {
  bg: "#1c1915",
  card: "#2a2520",
  text: "#f5f0eb",
  muted: "#a09080",
  gold: "#d4a54a",
  border: "#3a3530",
  hover: "#353025",
}

const TABS = [
  { key: "artist", label: "Bands", entityLabel: "Bands" },
  { key: "label", label: "Labels", entityLabel: "Labels" },
  { key: "press_orga", label: "Press", entityLabel: "Press Orgs" },
] as const

const PAGE_SIZE = 25

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatus(item: EntityContentItem): {
  label: string
  color: string
} {
  if (item.is_published) return { label: "Published", color: "#22c55e" }
  if (item.ai_generated) return { label: "AI", color: "#3b82f6" }
  if (item.description && item.description.trim().length > 0)
    return { label: "Draft", color: "#eab308" }
  return { label: "Empty", color: "#6b7280" }
}

// ─── Inner Component ──────────────────────────────────────────────────────────

function EntityContentInner() {
  const [activeTab, setActiveTab] = useState<string>("artist")
  const [items, setItems] = useState<EntityContentItem[]>([])
  const [stats, setStats] = useState<Stats>({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [hasContent, setHasContent] = useState("")
  const [isPublished, setIsPublished] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [overhaulStatus, setOverhaulStatus] = useState<OverhaulStatus | null>(null)
  const [overhaulLoading, setOverhaulLoading] = useState(true)

  // Fetch overhaul status
  const fetchOverhaulStatus = useCallback(async () => {
    try {
      const resp = await fetch("/admin/entity-content/overhaul-status", {
        credentials: "include",
      })
      if (!resp.ok) return
      const data = await resp.json()
      setOverhaulStatus(data)
    } catch {
      // Silent fail — dashboard is informational
    } finally {
      setOverhaulLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOverhaulStatus()
    // Auto-refresh every 30s if pipeline is running
    const interval = setInterval(fetchOverhaulStatus, 30000)
    return () => clearInterval(interval)
  }, [fetchOverhaulStatus])

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [search])

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        entity_type: activeTab,
        page: String(page),
        limit: String(PAGE_SIZE),
      })
      if (debouncedSearch) params.set("q", debouncedSearch)
      if (hasContent) params.set("has_content", hasContent)
      if (isPublished) params.set("is_published", isPublished)

      const resp = await fetch(
        `/admin/entity-content?${params}`,
        { credentials: "include" }
      )
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setItems(data.items || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
      setStats(data.stats || {})
    } catch (err) {
      console.error("Failed to fetch entity content:", err)
    } finally {
      setLoading(false)
    }
  }, [activeTab, page, debouncedSearch, hasContent, isPublished])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Reset page when tab changes
  useEffect(() => {
    setPage(1)
    setExpandedId(null)
    setEditForm(null)
  }, [activeTab])

  // Expand row and load edit form
  const handleExpand = useCallback(
    (item: EntityContentItem) => {
      if (expandedId === item.id) {
        setExpandedId(null)
        setEditForm(null)
        return
      }
      setExpandedId(item.id)
      setEditForm({
        description: item.description || "",
        short_description: item.short_description || "",
        country: item.country || "",
        founded_year: item.founded_year || "",
        genre_tags: item.genre_tags ? item.genre_tags.join(", ") : "",
        is_published: item.is_published,
      })
    },
    [expandedId]
  )

  // Save entity content
  const handleSave = useCallback(
    async (item: EntityContentItem) => {
      if (!editForm) return
      setSaving(true)
      try {
        const genreTags = editForm.genre_tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)

        const resp = await fetch(
          `/admin/entity-content/${item.entity_type}/${item.entity_id}`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: editForm.description || null,
              short_description: editForm.short_description || null,
              country: editForm.country || null,
              founded_year: editForm.founded_year || null,
              genre_tags: genreTags.length > 0 ? genreTags : null,
              is_published: editForm.is_published,
            }),
          }
        )
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        setExpandedId(null)
        setEditForm(null)
        fetchData()
      } catch (err) {
        console.error("Failed to save:", err)
        alert("Failed to save entity content")
      } finally {
        setSaving(false)
      }
    },
    [editForm, fetchData]
  )

  // Generate AI content for a single entity
  const handleGenerate = useCallback(
    async (item: EntityContentItem) => {
      setGenerating(item.id)
      try {
        const resp = await fetch(
          `/admin/entity-content/${item.entity_type}/${item.entity_id}`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ generate_ai: true }),
          }
        )
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        fetchData()
      } catch (err) {
        console.error("Failed to generate AI content:", err)
        alert("AI generation failed (endpoint may not support generate_ai flag yet)")
      } finally {
        setGenerating(null)
      }
    },
    [fetchData]
  )

  const currentTab = TABS.find((t) => t.key === activeTab)!
  const currentStats = stats[activeTab]

  return (
    <div
      style={{
        padding: 24,
        background: COLORS.bg,
        minHeight: "100vh",
        color: COLORS.text,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          Entity Content
        </h1>
      </div>

      {/* Generation Progress Overview */}
      {Object.keys(stats).length > 0 && (
        <div
          style={{
            background: COLORS.card,
            borderRadius: 10,
            padding: "16px 20px",
            marginBottom: 20,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: COLORS.gold,
              marginBottom: 12,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            AI Content Generation Progress
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {TABS.map((tab) => {
              const s = stats[tab.key]
              if (!s) return null
              const pct = s.total > 0 ? (s.with_content / s.total) * 100 : 0
              const remaining = s.total - s.with_content
              return (
                <div
                  key={tab.key}
                  style={{
                    flex: "1 1 200px",
                    minWidth: 200,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: COLORS.text,
                      }}
                    >
                      {tab.entityLabel}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: COLORS.muted,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {s.with_content.toLocaleString()} /{" "}
                      {s.total.toLocaleString()}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div
                    style={{
                      height: 8,
                      borderRadius: 4,
                      background: COLORS.border,
                      overflow: "hidden",
                      marginBottom: 4,
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 4,
                        width: `${pct}%`,
                        background:
                          pct >= 100
                            ? "#22c55e"
                            : pct > 50
                              ? COLORS.gold
                              : "#ef8833",
                        transition: "width 0.5s ease",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 11,
                      color: COLORS.muted,
                    }}
                  >
                    <span>{pct.toFixed(1)}%</span>
                    <span>
                      {remaining > 0
                        ? `${remaining.toLocaleString()} remaining`
                        : "Complete ✓"}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          {/* Total summary */}
          {(() => {
            const totalAll = Object.values(stats).reduce(
              (sum, s) => sum + s.total,
              0
            )
            const withAll = Object.values(stats).reduce(
              (sum, s) => sum + s.with_content,
              0
            )
            const pctAll = totalAll > 0 ? (withAll / totalAll) * 100 : 0
            return (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: `1px solid ${COLORS.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: COLORS.muted,
                }}
              >
                <span>
                  <span style={{ fontWeight: 600, color: COLORS.text }}>
                    Total:
                  </span>{" "}
                  {withAll.toLocaleString()} / {totalAll.toLocaleString()}{" "}
                  entities with AI content
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    color: pctAll >= 100 ? "#22c55e" : COLORS.gold,
                  }}
                >
                  {pctAll.toFixed(1)}%
                </span>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Entity Content Overhaul Status ─────────────────────────────────── */}
      {overhaulStatus && !overhaulLoading && (
        <div
          style={{
            background: COLORS.card,
            borderRadius: 10,
            padding: "16px 20px",
            marginBottom: 20,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: COLORS.gold,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Content Overhaul Status
            </div>
            {/* Pipeline status badge */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 12px",
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
                background: overhaulStatus.process_running
                  ? "#22c55e22"
                  : overhaulStatus.pipeline
                    ? "#3b82f622"
                    : "#6b728022",
                color: overhaulStatus.process_running
                  ? "#22c55e"
                  : overhaulStatus.pipeline
                    ? "#3b82f6"
                    : "#6b7280",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: overhaulStatus.process_running
                    ? "#22c55e"
                    : overhaulStatus.pipeline
                      ? "#3b82f6"
                      : "#6b7280",
                  animation: overhaulStatus.process_running
                    ? "pulse 2s infinite"
                    : undefined,
                }}
              />
              {overhaulStatus.process_running
                ? "RUNNING"
                : overhaulStatus.pipeline
                  ? "PAUSED"
                  : "NOT STARTED"}
            </span>
          </div>

          {/* Pipeline progress (if running or has data) */}
          {overhaulStatus.pipeline && (
            <div
              style={{
                background: COLORS.bg,
                borderRadius: 8,
                padding: "12px 16px",
                marginBottom: 14,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text }}>
                  Phase: {overhaulStatus.pipeline.current_phase || "—"}
                </span>
                <span style={{ fontSize: 11, color: COLORS.muted }}>
                  {overhaulStatus.pipeline.entities_processed} / {overhaulStatus.pipeline.entities_total} entities
                </span>
              </div>
              {/* Progress bar */}
              <div
                style={{
                  height: 10,
                  borderRadius: 5,
                  background: COLORS.border,
                  overflow: "hidden",
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    borderRadius: 5,
                    width: `${
                      overhaulStatus.pipeline.entities_total > 0
                        ? (overhaulStatus.pipeline.entities_processed /
                            overhaulStatus.pipeline.entities_total) *
                          100
                        : 0
                    }%`,
                    background: `linear-gradient(90deg, ${COLORS.gold}, #22c55e)`,
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
              {/* Stats row */}
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  fontSize: 11,
                  color: COLORS.muted,
                  flexWrap: "wrap",
                }}
              >
                <span>
                  <span style={{ color: "#22c55e", fontWeight: 600 }}>
                    {overhaulStatus.pipeline.entities_accepted}
                  </span>{" "}
                  accepted
                </span>
                <span>
                  <span style={{ color: "#eab308", fontWeight: 600 }}>
                    {overhaulStatus.pipeline.entities_revised}
                  </span>{" "}
                  revised
                </span>
                <span>
                  <span style={{ color: "#ef4444", fontWeight: 600 }}>
                    {overhaulStatus.pipeline.entities_rejected}
                  </span>{" "}
                  rejected
                </span>
                <span>
                  <span style={{ color: "#ef4444", fontWeight: 600 }}>
                    {overhaulStatus.pipeline.errors}
                  </span>{" "}
                  errors
                </span>
                {overhaulStatus.pipeline.current_entity && (
                  <span style={{ marginLeft: "auto", color: COLORS.text }}>
                    Current: {overhaulStatus.pipeline.current_entity}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Data Quality Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
            {(["artist", "label", "press_orga"] as const).map((type) => {
              const q = overhaulStatus.quality[type]
              const total = overhaulStatus.totals[type] || 0
              const prio = overhaulStatus.priorities[type]
              const label = type === "artist" ? "Bands" : type === "label" ? "Labels" : "Press Orgs"
              if (!q && total === 0) return null
              const coverage = total > 0 ? ((q?.with_description || 0) / total) * 100 : 0

              return (
                <div
                  key={type}
                  style={{
                    background: COLORS.bg,
                    borderRadius: 8,
                    padding: "12px 14px",
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: COLORS.text,
                      marginBottom: 8,
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>{label}</span>
                    <span style={{ fontSize: 11, color: COLORS.muted }}>
                      {total.toLocaleString()} total
                    </span>
                  </div>

                  {/* Priority tiers */}
                  {prio && (
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginBottom: 8,
                        fontSize: 11,
                      }}
                    >
                      <span
                        style={{
                          padding: "1px 8px",
                          borderRadius: 8,
                          background: "#ef883322",
                          color: "#ef8833",
                          fontWeight: 600,
                        }}
                      >
                        P1: {prio.p1}
                      </span>
                      <span
                        style={{
                          padding: "1px 8px",
                          borderRadius: 8,
                          background: `${COLORS.gold}22`,
                          color: COLORS.gold,
                          fontWeight: 600,
                        }}
                      >
                        P2: {prio.p2}
                      </span>
                      <span
                        style={{
                          padding: "1px 8px",
                          borderRadius: 8,
                          background: "#6b728022",
                          color: "#9ca3af",
                          fontWeight: 600,
                        }}
                      >
                        P3: {prio.p3}
                      </span>
                    </div>
                  )}

                  {/* Data completeness bars */}
                  {q && (
                    <div style={{ fontSize: 11, color: COLORS.muted }}>
                      {[
                        { label: "Description", value: q.with_description, total },
                        { label: "Short Desc", value: q.with_short_desc, total },
                        { label: "Genre Tags", value: q.with_genre_tags, total },
                        { label: "Country", value: q.with_country, total },
                        { label: "Year", value: q.with_year, total },
                        { label: "Links", value: q.with_links, total },
                      ].map((field) => {
                        const pct = total > 0 ? (field.value / total) * 100 : 0
                        return (
                          <div
                            key={field.label}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 3,
                            }}
                          >
                            <span style={{ width: 70, flexShrink: 0 }}>{field.label}</span>
                            <div
                              style={{
                                flex: 1,
                                height: 4,
                                borderRadius: 2,
                                background: COLORS.border,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  width: `${pct}%`,
                                  borderRadius: 2,
                                  background:
                                    pct >= 80 ? "#22c55e" : pct >= 40 ? COLORS.gold : "#ef8833",
                                }}
                              />
                            </div>
                            <span
                              style={{
                                width: 36,
                                textAlign: "right",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                        )
                      })}
                      {q.avg_description_length && (
                        <div style={{ marginTop: 4, fontSize: 10, color: COLORS.muted }}>
                          Avg. length: {q.avg_description_length.toLocaleString()} chars
                        </div>
                      )}
                    </div>
                  )}
                  {!q && (
                    <div style={{ fontSize: 11, color: COLORS.muted, fontStyle: "italic" }}>
                      No content generated yet
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Musician DB stats (if table exists) */}
          {overhaulStatus.musician_stats && (
            <div
              style={{
                background: COLORS.bg,
                borderRadius: 8,
                padding: "10px 14px",
                border: `1px solid ${COLORS.border}`,
                display: "flex",
                gap: 24,
                fontSize: 12,
                color: COLORS.muted,
              }}
            >
              <span style={{ fontWeight: 600, color: COLORS.gold }}>Musician DB</span>
              <span>
                <span style={{ color: COLORS.text, fontWeight: 600 }}>
                  {overhaulStatus.musician_stats.total_musicians}
                </span>{" "}
                musicians
              </span>
              <span>
                <span style={{ color: COLORS.text, fontWeight: 600 }}>
                  {overhaulStatus.musician_stats.total_roles}
                </span>{" "}
                roles
              </span>
              <span>
                <span style={{ color: COLORS.text, fontWeight: 600 }}>
                  {overhaulStatus.musician_stats.artists_with_members}
                </span>{" "}
                bands with members
              </span>
            </div>
          )}
          {!overhaulStatus.musician_stats && (
            <div
              style={{
                background: COLORS.bg,
                borderRadius: 8,
                padding: "10px 14px",
                border: `1px solid ${COLORS.border}`,
                display: "flex",
                gap: 12,
                fontSize: 12,
                color: COLORS.muted,
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 600, color: COLORS.gold }}>Musician DB</span>
              <span style={{ fontStyle: "italic" }}>Not created yet — Phase 3 of overhaul plan</span>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "8px 20px",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
              background:
                activeTab === tab.key ? COLORS.gold : COLORS.card,
              color:
                activeTab === tab.key ? COLORS.bg : COLORS.muted,
              transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats Bar */}
      {currentStats && (
        <div
          style={{
            background: COLORS.card,
            borderRadius: 8,
            padding: "10px 16px",
            marginBottom: 16,
            display: "flex",
            gap: 24,
            fontSize: 13,
            color: COLORS.muted,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <span>
            <span style={{ color: COLORS.gold, fontWeight: 700 }}>
              {currentStats.with_content}
            </span>
            <span style={{ color: COLORS.muted }}> / </span>
            <span>{currentStats.total.toLocaleString()}</span>{" "}
            {currentTab.entityLabel} with content
          </span>
          <span>
            <span style={{ color: COLORS.text, fontWeight: 600 }}>
              {total}
            </span>{" "}
            matching filters
          </span>
        </div>
      )}

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {/* Search */}
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "8px 12px",
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            color: COLORS.text,
            fontSize: 13,
            width: 240,
            outline: "none",
          }}
        />

        {/* Has Content filter */}
        <select
          value={hasContent}
          onChange={(e) => {
            setHasContent(e.target.value)
            setPage(1)
          }}
          style={{
            padding: "8px 12px",
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            color: COLORS.text,
            fontSize: 13,
            outline: "none",
          }}
        >
          <option value="">Has Content: All</option>
          <option value="true">Has Content: Yes</option>
          <option value="false">Has Content: No</option>
        </select>

        {/* Published filter */}
        <select
          value={isPublished}
          onChange={(e) => {
            setIsPublished(e.target.value)
            setPage(1)
          }}
          style={{
            padding: "8px 12px",
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            color: COLORS.text,
            fontSize: 13,
            outline: "none",
          }}
        >
          <option value="">Published: All</option>
          <option value="true">Published: Yes</option>
          <option value="false">Published: No</option>
        </select>
      </div>

      {/* Table */}
      <div
        style={{
          background: COLORS.card,
          borderRadius: 8,
          border: `1px solid ${COLORS.border}`,
          overflow: "hidden",
        }}
      >
        {/* Table Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 80px 100px 140px",
            padding: "10px 16px",
            borderBottom: `1px solid ${COLORS.border}`,
            fontSize: 12,
            fontWeight: 600,
            color: COLORS.muted,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <span>Name</span>
          <span style={{ textAlign: "center" }}>Releases</span>
          <span style={{ textAlign: "center" }}>Status</span>
          <span style={{ textAlign: "right" }}>Actions</span>
        </div>

        {/* Loading */}
        {loading && (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: COLORS.muted,
              fontSize: 14,
            }}
          >
            Loading...
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: COLORS.muted,
              fontSize: 14,
            }}
          >
            No entity content found
          </div>
        )}

        {/* Rows */}
        {!loading &&
          items.map((item) => {
            const status = getStatus(item)
            const isExpanded = expandedId === item.id

            return (
              <div key={item.id}>
                {/* Row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 80px 100px 140px",
                    padding: "10px 16px",
                    borderBottom: `1px solid ${COLORS.border}`,
                    alignItems: "center",
                    background: isExpanded ? COLORS.hover : "transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isExpanded)
                      (e.currentTarget as HTMLDivElement).style.background =
                        COLORS.hover
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded)
                      (e.currentTarget as HTMLDivElement).style.background =
                        "transparent"
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: COLORS.text,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.entity_name || "(unknown)"}
                  </span>
                  <span
                    style={{
                      textAlign: "center",
                      fontSize: 13,
                      color: COLORS.muted,
                    }}
                  >
                    {item.release_count}
                  </span>
                  <span style={{ textAlign: "center" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 10px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 600,
                        background: `${status.color}22`,
                        color: status.color,
                      }}
                    >
                      {status.label}
                    </span>
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      display: "flex",
                      gap: 6,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      onClick={() => handleExpand(item)}
                      style={{
                        padding: "4px 12px",
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 4,
                        background: isExpanded ? COLORS.gold : "transparent",
                        color: isExpanded ? COLORS.bg : COLORS.text,
                        fontSize: 12,
                        cursor: "pointer",
                        fontWeight: 500,
                      }}
                    >
                      {isExpanded ? "Close" : "Edit"}
                    </button>
                    <button
                      onClick={() => handleGenerate(item)}
                      disabled={generating === item.id}
                      style={{
                        padding: "4px 12px",
                        border: `1px solid ${COLORS.gold}44`,
                        borderRadius: 4,
                        background: "transparent",
                        color: COLORS.gold,
                        fontSize: 12,
                        cursor:
                          generating === item.id
                            ? "not-allowed"
                            : "pointer",
                        fontWeight: 500,
                        opacity: generating === item.id ? 0.5 : 1,
                      }}
                    >
                      {generating === item.id ? "..." : "AI"}
                    </button>
                  </span>
                </div>

                {/* Expanded Edit Panel */}
                {isExpanded && editForm && (
                  <div
                    style={{
                      padding: "16px 24px 20px",
                      borderBottom: `1px solid ${COLORS.border}`,
                      background: COLORS.hover,
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 12,
                        marginBottom: 12,
                      }}
                    >
                      {/* Short description */}
                      <div>
                        <label
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: COLORS.muted,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            display: "block",
                            marginBottom: 4,
                          }}
                        >
                          Short Description
                        </label>
                        <input
                          type="text"
                          value={editForm.short_description}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              short_description: e.target.value,
                            })
                          }
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            background: COLORS.card,
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 4,
                            color: COLORS.text,
                            fontSize: 13,
                            outline: "none",
                            boxSizing: "border-box",
                          }}
                          placeholder="Brief tagline or summary..."
                        />
                      </div>

                      {/* Country */}
                      <div style={{ display: "flex", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <label
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: COLORS.muted,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              display: "block",
                              marginBottom: 4,
                            }}
                          >
                            Country
                          </label>
                          <input
                            type="text"
                            value={editForm.country}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                country: e.target.value,
                              })
                            }
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              background: COLORS.card,
                              border: `1px solid ${COLORS.border}`,
                              borderRadius: 4,
                              color: COLORS.text,
                              fontSize: 13,
                              outline: "none",
                              boxSizing: "border-box",
                            }}
                            placeholder="e.g. Germany"
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: COLORS.muted,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              display: "block",
                              marginBottom: 4,
                            }}
                          >
                            Founded Year
                          </label>
                          <input
                            type="text"
                            value={editForm.founded_year}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                founded_year: e.target.value,
                              })
                            }
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              background: COLORS.card,
                              border: `1px solid ${COLORS.border}`,
                              borderRadius: 4,
                              color: COLORS.text,
                              fontSize: 13,
                              outline: "none",
                              boxSizing: "border-box",
                            }}
                            placeholder="e.g. 1982"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Genre Tags */}
                    <div style={{ marginBottom: 12 }}>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: COLORS.muted,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          display: "block",
                          marginBottom: 4,
                        }}
                      >
                        Genre Tags (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={editForm.genre_tags}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            genre_tags: e.target.value,
                          })
                        }
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          background: COLORS.card,
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: 4,
                          color: COLORS.text,
                          fontSize: 13,
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                        placeholder="Industrial, Noise, Dark Ambient"
                      />
                    </div>

                    {/* Description */}
                    <div style={{ marginBottom: 12 }}>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: COLORS.muted,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          display: "block",
                          marginBottom: 4,
                        }}
                      >
                        Description
                      </label>
                      <textarea
                        value={editForm.description}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            description: e.target.value,
                          })
                        }
                        rows={5}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          background: COLORS.card,
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: 4,
                          color: COLORS.text,
                          fontSize: 13,
                          outline: "none",
                          resize: "vertical",
                          fontFamily: "inherit",
                          boxSizing: "border-box",
                        }}
                        placeholder="Full description of the entity..."
                      />
                    </div>

                    {/* Published toggle + Save */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          cursor: "pointer",
                          fontSize: 13,
                          color: COLORS.text,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={editForm.is_published}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              is_published: e.target.checked,
                            })
                          }
                          style={{ accentColor: COLORS.gold }}
                        />
                        Published
                      </label>
                      <button
                        onClick={() => handleSave(item)}
                        disabled={saving}
                        style={{
                          padding: "8px 24px",
                          background: COLORS.gold,
                          color: COLORS.bg,
                          border: "none",
                          borderRadius: 6,
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: saving ? "not-allowed" : "pointer",
                          opacity: saving ? 0.6 : 1,
                        }}
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            marginTop: 16,
          }}
        >
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            style={{
              padding: "6px 14px",
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 4,
              color: page <= 1 ? COLORS.muted : COLORS.text,
              fontSize: 13,
              cursor: page <= 1 ? "not-allowed" : "pointer",
            }}
          >
            Prev
          </button>
          <span style={{ fontSize: 13, color: COLORS.muted }}>
            Page {page} of {pages}
          </span>
          <button
            onClick={() => setPage(Math.min(pages, page + 1))}
            disabled={page >= pages}
            style={{
              padding: "6px 14px",
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 4,
              color: page >= pages ? COLORS.muted : COLORS.text,
              fontSize: 13,
              cursor: page >= pages ? "not-allowed" : "pointer",
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Page Component ───────────────────────────────────────────────────────────

const EntityContentPage = () => (
  <ErrorBoundary>
    <EntityContentInner />
  </ErrorBoundary>
)

export const config = defineRouteConfig({
  label: "Entity Content",
})

export default EntityContentPage
