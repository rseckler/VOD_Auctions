import { Component, useEffect, useState, useCallback, useRef } from "react"
import { useAdminNav } from "../../components/admin-nav"
import { C } from "../../components/admin-tokens"
import { PageHeader, PageShell } from "../../components/admin-layout"
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

type BudgetSchedule = {
  total_estimated_cost: number
  currency: string
  spent: { period: string; amount: number; entities_processed: number; note: string }[]
  total_spent: number
  cost_per_entity: number
  schedule: { id: number; label: string; start: string; end: string; budget: number; spent: number; status: string; note: string }[]
  entities_remaining: { p2: number; p3: number; total: number }
  estimated_remaining_cost: number
  next_run: string
  pause_until: string
}

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
  quality: Record<string, {
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
  }>
  totals: Record<string, number>
  priorities: Record<string, { p1: number; p2: number; p3: number }>
  musician_stats: {
    total_musicians: number
    total_roles: number
    musicians_with_roles: number
    artists_with_members: number
  } | null
  project: {
    linear_issue: string
    last_updated: string
    phases: { id: number; name: string; description: string; status: string }[]
    model_strategy: { writer: string; estimated_cost: string }
    data_sources: { name: string; status: string }[]
  }
  budget: BudgetSchedule | null
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

const TABS = [
  { key: "artist", label: "Bands", entityLabel: "Bands" },
  { key: "label", label: "Labels", entityLabel: "Labels" },
  { key: "press_orga", label: "Press", entityLabel: "Press Orgs" },
] as const

const PAGE_SIZE = 25

function getStatus(item: EntityContentItem): { label: string; color: string } {
  if (item.is_published) return { label: "Published", color: C.success }
  if (item.ai_generated) return { label: "AI", color: C.blue }
  if (item.description && item.description.trim().length > 0)
    return { label: "Draft", color: C.warning }
  return { label: "Empty", color: "#6b7280" }
}

// ─── Inner Component ──────────────────────────────────────────────────────────

function EntityContentInner() {
  useAdminNav()
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
  const [os, setOs] = useState<OverhaulStatus | null>(null)

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search])

  // Fetch entity list
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ entity_type: activeTab, page: String(page), limit: String(PAGE_SIZE) })
      if (debouncedSearch) params.set("q", debouncedSearch)
      if (hasContent) params.set("has_content", hasContent)
      if (isPublished) params.set("is_published", isPublished)
      const resp = await fetch(`/admin/entity-content?${params}`, { credentials: "include" })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setItems(data.items || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
      setStats(data.stats || {})
    } catch (err) {
      console.error("Failed to fetch:", err)
    } finally {
      setLoading(false)
    }
  }, [activeTab, page, debouncedSearch, hasContent, isPublished])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1); setExpandedId(null); setEditForm(null) }, [activeTab])

  // Fetch overhaul status
  const fetchOverhaul = useCallback(async () => {
    try {
      const resp = await fetch("/admin/entity-content/overhaul-status", { credentials: "include" })
      if (resp.ok) setOs(await resp.json())
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchOverhaul()
    const iv = setInterval(fetchOverhaul, 15000)
    return () => clearInterval(iv)
  }, [fetchOverhaul])

  // Handlers
  const handleExpand = useCallback((item: EntityContentItem) => {
    if (expandedId === item.id) { setExpandedId(null); setEditForm(null); return }
    setExpandedId(item.id)
    setEditForm({
      description: item.description || "", short_description: item.short_description || "",
      country: item.country || "", founded_year: item.founded_year || "",
      genre_tags: item.genre_tags ? item.genre_tags.join(", ") : "", is_published: item.is_published,
    })
  }, [expandedId])

  const handleSave = useCallback(async (item: EntityContentItem) => {
    if (!editForm) return
    setSaving(true)
    try {
      const genreTags = editForm.genre_tags.split(",").map(t => t.trim()).filter(Boolean)
      const resp = await fetch(`/admin/entity-content/${item.entity_type}/${item.entity_id}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: editForm.description || null, short_description: editForm.short_description || null,
          country: editForm.country || null, founded_year: editForm.founded_year || null,
          genre_tags: genreTags.length > 0 ? genreTags : null, is_published: editForm.is_published,
        }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      setExpandedId(null); setEditForm(null); fetchData()
    } catch { alert("Failed to save") } finally { setSaving(false) }
  }, [editForm, fetchData])

  const handleGenerate = useCallback(async (item: EntityContentItem) => {
    setGenerating(item.id)
    try {
      const resp = await fetch(`/admin/entity-content/${item.entity_type}/${item.entity_id}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generate_ai: true }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      fetchData()
    } catch { alert("AI generation failed") } finally { setGenerating(null) }
  }, [fetchData])

  // Computed
  const totalAll = Object.values(os?.totals || {}).reduce((s, v) => s + v, 0)
  const withContentAll = Object.values(os?.quality || {}).reduce((s, v) => s + (v?.with_description || 0), 0)
  const pctAll = totalAll > 0 ? (withContentAll / totalAll) * 100 : 0
  const pipe = os?.pipeline
  const isRunning = os?.process_running || false
  const currentTab = TABS.find(t => t.key === activeTab)!
  const currentStats = stats[activeTab]

  // ─── Label helper ──────
  const inputStyle = {
    width: "100%", padding: "8px 10px", background: C.card,
    border: `1px solid ${C.border}`, borderRadius: 4, color: C.text,
    fontSize: 13, outline: "none", boxSizing: "border-box" as const,
  }
  const labelStyle = {
    fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase" as const,
    letterSpacing: "0.05em", display: "block", marginBottom: 4,
  }

  return (
    <PageShell>
      <PageHeader title="Entity Content" subtitle="AI-generated content for artists, labels, and press" />

      {/* ═══════════════════════════════════════════════════════════════════════
          PIPELINE PROGRESS — Hero section, always visible
          ═══════════════════════════════════════════════════════════════════════ */}
      {os && (
        <div style={{ background: C.card, borderRadius: 10, padding: "16px 20px", marginBottom: 20, border: `1px solid ${C.border}` }}>

          {/* Top bar: title + status badge */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.gold, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Content Overhaul
              </span>
              <span style={{ fontSize: 11, color: C.muted }}>RSE-227</span>
            </div>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "3px 12px", borderRadius: 12, fontSize: 11, fontWeight: 600,
              background: isRunning ? `${C.success}22` : pipe?.status === "completed" ? `${C.success}22` : "#6b728022",
              color: isRunning ? C.success : pipe?.status === "completed" ? C.success : "#6b7280",
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: isRunning ? C.success : pipe?.status === "completed" ? C.success : "#6b7280",
              }} />
              {isRunning ? "RUNNING" : pipe?.status === "completed" ? "COMPLETED" : os?.budget?.pause_until ? `PAUSED until ${os.budget.next_run}` : pipe ? "PAUSED" : "IDLE"}
            </span>
          </div>

          {/* ── Grand total progress ── */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                Overall Progress
              </span>
              <span style={{ fontSize: 24, fontWeight: 700, color: pctAll >= 95 ? C.success : C.gold, fontVariantNumeric: "tabular-nums" }}>
                {pctAll.toFixed(1)}%
              </span>
            </div>
            <div style={{ height: 12, borderRadius: 6, background: C.border, overflow: "hidden", marginBottom: 6 }}>
              <div style={{
                height: "100%", borderRadius: 6, width: `${pctAll}%`,
                background: pctAll >= 95 ? C.success : `linear-gradient(90deg, ${C.warning}, ${C.gold})`,
                transition: "width 0.5s ease",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted }}>
              <span>{withContentAll.toLocaleString()} / {totalAll.toLocaleString()} entities with content</span>
              <span>{(totalAll - withContentAll).toLocaleString()} remaining</span>
            </div>
          </div>

          {/* ── Per-type progress bars ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
            {(["artist", "label", "press_orga"] as const).map((type) => {
              const q = os.quality[type]
              const total = os.totals[type] || 0
              const withDesc = q?.with_description || 0
              const pct = total > 0 ? (withDesc / total) * 100 : 0
              const prio = os.priorities[type]
              const label = type === "artist" ? "Bands" : type === "label" ? "Labels" : "Press Orgs"

              return (
                <div key={type} style={{ background: C.bg, borderRadius: 8, padding: "10px 14px", border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{label}</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: pct >= 95 ? C.success : pct > 50 ? C.gold : C.warning, fontVariantNumeric: "tabular-nums" }}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden", marginBottom: 4 }}>
                    <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: pct >= 95 ? C.success : pct > 50 ? C.gold : C.warning, transition: "width 0.5s ease" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted }}>
                    <span>{withDesc.toLocaleString()} / {total.toLocaleString()}</span>
                    <span>{(total - withDesc).toLocaleString()} left</span>
                  </div>
                  {/* Priority tiers */}
                  {prio && (
                    <div style={{ display: "flex", gap: 4, marginTop: 6, fontSize: 9 }}>
                      <span style={{ padding: "0 5px", borderRadius: 4, background: `${C.warning}22`, color: C.warning, fontWeight: 600 }}>P1: {prio.p1}</span>
                      <span style={{ padding: "0 5px", borderRadius: 4, background: `${C.gold}22`, color: C.gold, fontWeight: 600 }}>P2: {prio.p2}</span>
                      <span style={{ padding: "0 5px", borderRadius: 4, background: "#6b728022", color: C.muted, fontWeight: 600 }}>P3: {prio.p3}</span>
                    </div>
                  )}
                  {/* Data quality mini-bars */}
                  {q && (
                    <div style={{ marginTop: 6, fontSize: 9, color: C.muted }}>
                      {[
                        { l: "Desc", v: q.with_description },
                        { l: "Tags", v: q.with_genre_tags },
                        { l: "Country", v: q.with_country },
                      ].map((f) => {
                        const fp = total > 0 ? (f.v / total) * 100 : 0
                        return (
                          <div key={f.l} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
                            <span style={{ width: 44, flexShrink: 0 }}>{f.l}</span>
                            <div style={{ flex: 1, height: 3, borderRadius: 1.5, background: C.border, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${fp}%`, borderRadius: 1.5, background: fp >= 80 ? C.success : fp > 0 ? C.gold : C.border }} />
                            </div>
                            <span style={{ width: 28, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fp.toFixed(0)}%</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* ── Live pipeline progress (when running) ── */}
          {pipe && (
            <div style={{
              background: isRunning ? C.bg : `${C.success}08`, borderRadius: 8, padding: "12px 16px",
              border: `1px solid ${isRunning ? `${C.gold}44` : `${C.success}33`}`, marginBottom: 14,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: isRunning ? C.gold : C.success }}>
                  {isRunning ? `Running: ${pipe.current_phase}` : `Completed: ${pipe.current_phase}`}
                </span>
                <span style={{ fontSize: 12, color: C.muted, fontVariantNumeric: "tabular-nums" }}>
                  {pipe.entities_processed.toLocaleString()} / {pipe.entities_total.toLocaleString()}
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: C.border, overflow: "hidden", marginBottom: 6 }}>
                <div style={{
                  height: "100%", borderRadius: 4,
                  width: `${pipe.entities_total > 0 ? (pipe.entities_processed / pipe.entities_total) * 100 : 0}%`,
                  background: `linear-gradient(90deg, ${C.gold}, ${C.success})`, transition: "width 0.5s ease",
                }} />
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
                <span><span style={{ color: C.success, fontWeight: 600 }}>{pipe.entities_accepted}</span> accepted</span>
                <span><span style={{ color: C.warning, fontWeight: 600 }}>{pipe.entities_revised}</span> revised</span>
                <span><span style={{ color: C.error, fontWeight: 600 }}>{pipe.entities_rejected}</span> rejected</span>
                <span><span style={{ color: C.error, fontWeight: 600 }}>{pipe.errors}</span> errors</span>
                {pipe.current_entity && isRunning && (
                  <span style={{ marginLeft: "auto", color: C.text }}>Current: {pipe.current_entity}</span>
                )}
              </div>
            </div>
          )}

          {/* ── Bottom stats row: Musicians + Model + Sources ── */}
          <div style={{ display: "flex", gap: 16, fontSize: 11, color: C.muted, flexWrap: "wrap", alignItems: "center" }}>
            {os.musician_stats && (
              <span>
                <span style={{ color: C.gold, fontWeight: 600 }}>Musicians:</span>{" "}
                {os.musician_stats.total_musicians.toLocaleString()} ({os.musician_stats.artists_with_members} bands)
              </span>
            )}
            <span>
              <span style={{ color: C.gold, fontWeight: 600 }}>Model:</span> {os.project?.model_strategy?.writer || "GPT-4o"} + mini
            </span>
            <span>
              <span style={{ color: C.gold, fontWeight: 600 }}>Sources:</span> {os.project?.data_sources?.filter(s => s.status === "ready").length || 0} active
            </span>
            <span style={{ marginLeft: "auto" }}>
              <span style={{ color: C.gold, fontWeight: 600 }}>Spent:</span> ${os.budget?.total_spent || 0} / ~${os.budget?.total_estimated_cost || 350}
            </span>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          BUDGET & SCHEDULE — Rollout timeline with monthly budget windows
          ═══════════════════════════════════════════════════════════════════════ */}
      {os?.budget && (() => {
        const b = os.budget
        const now = new Date().toISOString().slice(0, 10)
        const isPaused = now < b.next_run
        const daysUntilResume = isPaused ? Math.ceil((new Date(b.next_run).getTime() - Date.now()) / 86400000) : 0
        const totalBudgetAllocated = b.schedule.reduce((s, p) => s + p.budget, 0)
        const pctSpentTotal = totalBudgetAllocated > 0 ? (b.total_spent / totalBudgetAllocated) * 100 : 0

        return (
          <div style={{ background: C.card, borderRadius: 10, padding: "16px 20px", marginBottom: 20, border: `1px solid ${C.border}` }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.gold, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Budget & Schedule
                </span>
              </div>
              {isPaused && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "3px 12px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                  background: `${C.warning}22`, color: C.warning,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.warning }} />
                  PAUSED — resumes {b.next_run} ({daysUntilResume}d)
                </span>
              )}
            </div>

            {/* Summary stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
              {[
                { label: "Total Spent", value: `$${b.total_spent}`, sub: `of ~$${b.total_estimated_cost} est.`, color: C.gold },
                { label: "Cost / Entity", value: `$${b.cost_per_entity.toFixed(3)}`, sub: `~${Math.round(1 / b.cost_per_entity)} entities/$1`, color: C.text },
                { label: "Entities Done", value: b.spent.reduce((s, p) => s + p.entities_processed, 0).toLocaleString(), sub: `${b.entities_remaining.total.toLocaleString()} remaining`, color: C.success },
                { label: "Est. Remaining", value: `$${b.estimated_remaining_cost}`, sub: `${Math.ceil(b.estimated_remaining_cost / 100)} months @ $100/mo`, color: C.warning },
              ].map((stat, i) => (
                <div key={i} style={{ background: C.bg, borderRadius: 8, padding: "10px 14px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{stat.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: stat.color, fontVariantNumeric: "tabular-nums" }}>{stat.value}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{stat.sub}</div>
                </div>
              ))}
            </div>

            {/* Schedule timeline */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Monthly Budget Windows
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {b.schedule.map((period) => {
                  const isActive = now >= period.start && now <= period.end && !isPaused
                  const isDone = period.status === "paused" || (period.spent > 0 && period.spent >= period.budget * 0.8)
                  const isNext = period.status === "scheduled" && period.start === b.next_run
                  const pctUsed = period.budget > 0 ? (period.spent / period.budget) * 100 : 0

                  return (
                    <div key={period.id} style={{
                      flex: 1, background: C.bg, borderRadius: 8, padding: "12px 14px",
                      border: `1px solid ${isActive ? C.gold : isNext ? `${C.gold}66` : C.border}`,
                      opacity: isDone && !isActive ? 0.7 : 1,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isActive ? C.gold : isNext ? C.text : C.muted }}>{period.label}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 600, padding: "1px 8px", borderRadius: 8,
                          background: period.status === "paused" ? `${C.warning}22` : period.status === "scheduled" ? `${C.blue}22` : `${C.success}22`,
                          color: period.status === "paused" ? C.warning : period.status === "scheduled" ? C.blue : C.success,
                          textTransform: "uppercase",
                        }}>{period.status}</span>
                      </div>
                      {/* Budget bar */}
                      <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden", marginBottom: 4 }}>
                        <div style={{ height: "100%", width: `${Math.min(pctUsed, 100)}%`, borderRadius: 3, background: pctUsed >= 80 ? C.warning : C.gold, transition: "width 0.3s" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted }}>
                        <span>${period.spent} / ${period.budget}</span>
                        <span>{pctUsed > 0 ? `${pctUsed.toFixed(0)}%` : "—"}</span>
                      </div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{period.note}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Entities remaining breakdown */}
            <div style={{ display: "flex", gap: 16, fontSize: 11, color: C.muted, flexWrap: "wrap", alignItems: "center" }}>
              <span><span style={{ color: C.gold, fontWeight: 600 }}>P2 remaining:</span> {b.entities_remaining.p2.toLocaleString()} (~${Math.round(b.entities_remaining.p2 * b.cost_per_entity)})</span>
              <span><span style={{ color: C.gold, fontWeight: 600 }}>P3 remaining:</span> {b.entities_remaining.p3.toLocaleString()} (~${Math.round(b.entities_remaining.p3 * b.cost_per_entity)})</span>
              <span style={{ marginLeft: "auto" }}>
                <span style={{ color: C.gold, fontWeight: 600 }}>Projection:</span> Complete by {b.schedule.length > 0 ? b.schedule[b.schedule.length - 1].label : "TBD"}
              </span>
            </div>
          </div>
        )
      })()}

      {/* ═══════════════════════════════════════════════════════════════════════
          ENTITY BROWSER — Tabs, filters, table, edit
          ═══════════════════════════════════════════════════════════════════════ */}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "8px 20px", border: "none", borderRadius: 6, cursor: "pointer",
              fontWeight: 600, fontSize: 14,
              background: activeTab === tab.key ? C.gold : C.card,
              color: activeTab === tab.key ? "#fff" : C.muted,
              transition: "all 0.15s",
            }}
          >{tab.label}</button>
        ))}
      </div>

      {/* Stats Bar */}
      {currentStats && (
        <div style={{
          background: C.card, borderRadius: 8, padding: "10px 16px", marginBottom: 16,
          display: "flex", gap: 24, fontSize: 13, color: C.muted, border: `1px solid ${C.border}`,
        }}>
          <span>
            <span style={{ color: C.gold, fontWeight: 700 }}>{currentStats.with_content}</span>
            <span style={{ color: C.muted }}> / </span>
            <span>{currentStats.total.toLocaleString()}</span>{" "}{currentTab.entityLabel} with content
          </span>
          <span><span style={{ color: C.text, fontWeight: 600 }}>{total}</span> matching filters</span>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input type="text" placeholder="Search by name..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, width: 240 }}
        />
        <select value={hasContent} onChange={(e) => { setHasContent(e.target.value); setPage(1) }}
          style={{ padding: "8px 12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 13, outline: "none" }}>
          <option value="">Has Content: All</option>
          <option value="true">Has Content: Yes</option>
          <option value="false">Has Content: No</option>
        </select>
        <select value={isPublished} onChange={(e) => { setIsPublished(e.target.value); setPage(1) }}
          style={{ padding: "8px 12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 13, outline: "none" }}>
          <option value="">Published: All</option>
          <option value="true">Published: Yes</option>
          <option value="false">Published: No</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 80px 100px 140px",
          padding: "10px 16px", borderBottom: `1px solid ${C.border}`,
          fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          <span>Name</span>
          <span style={{ textAlign: "center" }}>Releases</span>
          <span style={{ textAlign: "center" }}>Status</span>
          <span style={{ textAlign: "right" }}>Actions</span>
        </div>

        {loading && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 14 }}>Loading...</div>}
        {!loading && items.length === 0 && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 14 }}>No entity content found</div>}

        {!loading && items.map((item) => {
          const status = getStatus(item)
          const isExpanded = expandedId === item.id
          return (
            <div key={item.id}>
              <div style={{
                display: "grid", gridTemplateColumns: "2fr 80px 100px 140px",
                padding: "10px 16px", borderBottom: `1px solid ${C.border}`,
                alignItems: "center", background: isExpanded ? C.hover : "transparent", transition: "background 0.1s",
              }}
                onMouseEnter={(e) => { if (!isExpanded) (e.currentTarget as HTMLDivElement).style.background = C.hover }}
                onMouseLeave={(e) => { if (!isExpanded) (e.currentTarget as HTMLDivElement).style.background = "transparent" }}
              >
                <span style={{ fontSize: 14, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.entity_name || "(unknown)"}
                </span>
                <span style={{ textAlign: "center", fontSize: 13, color: C.muted }}>{item.release_count}</span>
                <span style={{ textAlign: "center" }}>
                  <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: `${status.color}22`, color: status.color }}>
                    {status.label}
                  </span>
                </span>
                <span style={{ textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button onClick={() => handleExpand(item)} style={{
                    padding: "4px 12px", border: `1px solid ${C.border}`, borderRadius: 4,
                    background: isExpanded ? C.gold : "transparent", color: isExpanded ? "#fff" : C.text,
                    fontSize: 12, cursor: "pointer", fontWeight: 500,
                  }}>{isExpanded ? "Close" : "Edit"}</button>
                  <button onClick={() => handleGenerate(item)} disabled={generating === item.id} style={{
                    padding: "4px 12px", border: `1px solid ${C.gold}44`, borderRadius: 4,
                    background: "transparent", color: C.gold, fontSize: 12,
                    cursor: generating === item.id ? "not-allowed" : "pointer",
                    fontWeight: 500, opacity: generating === item.id ? 0.5 : 1,
                  }}>{generating === item.id ? "..." : "AI"}</button>
                </span>
              </div>

              {/* Expanded edit panel */}
              {isExpanded && editForm && (
                <div style={{ padding: "16px 24px 20px", borderBottom: `1px solid ${C.border}`, background: C.hover }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={labelStyle}>Short Description</label>
                      <input type="text" value={editForm.short_description}
                        onChange={(e) => setEditForm({ ...editForm, short_description: e.target.value })}
                        style={inputStyle} placeholder="Brief tagline or summary..." />
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Country</label>
                        <input type="text" value={editForm.country}
                          onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                          style={inputStyle} placeholder="e.g. Germany" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Founded Year</label>
                        <input type="text" value={editForm.founded_year}
                          onChange={(e) => setEditForm({ ...editForm, founded_year: e.target.value })}
                          style={inputStyle} placeholder="e.g. 1982" />
                      </div>
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Genre Tags (comma-separated)</label>
                    <input type="text" value={editForm.genre_tags}
                      onChange={(e) => setEditForm({ ...editForm, genre_tags: e.target.value })}
                      style={inputStyle} placeholder="Industrial, Noise, Dark Ambient" />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Description</label>
                    <textarea value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={5} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                      placeholder="Full description of the entity..." />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: C.text }}>
                      <input type="checkbox" checked={editForm.is_published}
                        onChange={(e) => setEditForm({ ...editForm, is_published: e.target.checked })}
                        style={{ accentColor: C.gold }} /> Published
                    </label>
                    <button onClick={() => handleSave(item)} disabled={saving} style={{
                      padding: "8px 24px", background: C.gold, color: "#fff", border: "none",
                      borderRadius: 6, fontWeight: 600, fontSize: 13,
                      cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1,
                    }}>{saving ? "Saving..." : "Save"}</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 16 }}>
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
            style={{ padding: "6px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, color: page <= 1 ? C.muted : C.text, fontSize: 13, cursor: page <= 1 ? "not-allowed" : "pointer" }}>
            Prev
          </button>
          <span style={{ fontSize: 13, color: C.muted }}>Page {page} of {pages}</span>
          <button onClick={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages}
            style={{ padding: "6px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, color: page >= pages ? C.muted : C.text, fontSize: 13, cursor: page >= pages ? "not-allowed" : "pointer" }}>
            Next
          </button>
        </div>
      )}
    </PageShell>
  )
}

// ─── Page Component ───────────────────────────────────────────────────────────

const EntityContentPage = () => (
  <ErrorBoundary>
    <EntityContentInner />
  </ErrorBoundary>
)

export default EntityContentPage
