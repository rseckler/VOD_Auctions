import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { C, S, T, fmtMoney, fmtNum, relativeTime } from "../admin-tokens"
import { Badge, Btn, EmptyState, inputStyle, selectStyle, Modal } from "../admin-ui"
import { ContactDetailDrawer } from "./contact-detail-drawer"

// Inject CSS für always-visible horizontal scrollbar (browser-overlay-default
// versteckt die scrollbar bis zum hover, was nicht discoverable ist)
const SCROLL_CSS = `
.vod-scroll-x {
  scrollbar-color: rgba(0,0,0,0.35) transparent;
  scrollbar-width: thin;
}
.vod-scroll-x::-webkit-scrollbar {
  height: 12px;
  background: rgba(0,0,0,0.04);
}
.vod-scroll-x::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.32);
  border-radius: 6px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.vod-scroll-x::-webkit-scrollbar-thumb:hover {
  background: rgba(0,0,0,0.55);
  background-clip: padding-box;
  border: 2px solid transparent;
}
`
if (typeof document !== "undefined" && !document.getElementById("vod-scrollbar-css")) {
  const s = document.createElement("style")
  s.id = "vod-scrollbar-css"
  s.textContent = SCROLL_CSS
  document.head.appendChild(s)
}

// ── Types ──────────────────────────────────────────────────────────────────

type Contact = {
  id: string
  display_name: string
  first_name: string | null
  last_name: string | null
  company: string | null
  contact_type: string | null
  primary_email: string | null
  primary_phone: string | null
  primary_country_code: string | null
  primary_postal_code: string | null
  primary_city: string | null
  lifetime_revenue: number
  total_transactions: number
  first_seen_at: string | null
  last_seen_at: string | null
  medusa_customer_id: string | null
  tier: string | null
  lifecycle_stage: string | null
  rfm_segment: string | null
  health_score: number | null
  acquisition_channel: string | null
  avatar_url: string | null
  tags: string[]
  is_test: boolean
  is_blocked: boolean
  manual_review_status: string | null
  created_at: string | null
  sources: string[]
  source_link_count: number
}

type SavedFilter = {
  id: string
  name: string
  description: string | null
  query_json: Record<string, string>
  icon: string | null
  shared: boolean
  is_pinned: boolean
  created_by: string
}

type ContactsResponse = {
  contacts: Contact[]
  total: number
  limit: number
  offset: number
}

type FilterKey =
  | "all"
  | "with_email"
  | "only_webshop"
  | "only_mo_pdf"
  | "test"
  | "internal_owner"
  | "blocked"

// ── Display helpers ────────────────────────────────────────────────────────

const SOURCE_ABBR: Record<string, { label: string; color: keyof typeof BADGE_COLOR }> = {
  mo_pdf: { label: "MO", color: "purple" },
  vod_records_db1: { label: "DB1", color: "info" },
  vod_records_db2013: { label: "DB13", color: "info" },
  vod_records_db2013_alt: { label: "ALT", color: "info" },
  vodtapes_members: { label: "TAP", color: "warning" },
  imap_vod_records: { label: "MV", color: "neutral" },
  imap_vinyl_on_demand: { label: "MX", color: "neutral" },
}

const BADGE_COLOR = {
  success: "success",
  error: "error",
  warning: "warning",
  info: "info",
  purple: "purple",
  neutral: "neutral",
} as const

function tierBadge(tier: string | null) {
  if (!tier) return null
  const variantMap: Record<string, keyof typeof BADGE_COLOR> = {
    platinum: "purple",
    gold: "warning",
    silver: "neutral",
    bronze: "neutral",
    standard: "neutral",
    dormant: "neutral",
  }
  return <Badge label={tier} variant={variantMap[tier] || "neutral"} />
}

// ── Filter Pills ───────────────────────────────────────────────────────────

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "with_email", label: "With email" },
  { key: "only_webshop", label: "Webshop only" },
  { key: "only_mo_pdf", label: "MO-PDF only" },
  { key: "test", label: "Test accounts" },
  { key: "internal_owner", label: "Internal" },
  { key: "blocked", label: "Blocked" },
]

function FilterPills({ active, onChange }: { active: FilterKey; onChange: (f: FilterKey) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {FILTERS.map((f) => {
        const isActive = active === f.key
        return (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            style={{
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: S.radius.md,
              cursor: "pointer",
              border: `1px solid ${isActive ? C.gold : C.border}`,
              background: isActive ? C.gold + "15" : "transparent",
              color: isActive ? C.gold : C.text,
            }}
          >
            {f.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Sources mini-badge bar ─────────────────────────────────────────────────

function SourceBadges({ sources }: { sources: string[] }) {
  return (
    <div style={{ display: "inline-flex", gap: 3, flexWrap: "wrap" }}>
      {sources.map((s) => {
        const cfg = SOURCE_ABBR[s] || { label: s.slice(0, 3).toUpperCase(), color: "neutral" }
        return (
          <span
            key={s}
            title={s}
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "1px 5px",
              borderRadius: 3,
              border: `1px solid ${C.border}`,
              background: C.subtle,
              color: C.muted,
              letterSpacing: "0.05em",
            }}
          >
            {cfg.label}
          </span>
        )
      })}
    </div>
  )
}

// ── Main Tab ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

type ExtendedFilter = {
  filter: FilterKey
  tier?: string
  lifecycle_stage?: string
  rfm_segment?: string
  acquisition_channel?: string
}

export function ContactsTab() {
  const [data, setData] = useState<ContactsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [q, setQ] = useState("")
  const [extFilter, setExtFilter] = useState<ExtendedFilter>({ filter: "all" })
  const [sort, setSort] = useState("lifetime_revenue")
  const [order, setOrder] = useState<"asc" | "desc">("desc")
  const [offset, setOffset] = useState(0)

  // Saved Filters
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([])
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null)
  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Multi-Select für Bulk-Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [allSelectedCount, setAllSelectedCount] = useState<number | null>(null) // wenn "Select all matching" geklickt
  const [bulkAction, setBulkAction] = useState<{ type: string; openModal: boolean } | null>(null)

  const filter = extFilter.filter

  // Debounce search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedQ, setDebouncedQ] = useState("")
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQ(q), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [q])

  // Reset offset when filter / search changes
  useEffect(() => {
    setOffset(0)
    setSelectedIds(new Set())
    setAllSelectedCount(null)
  }, [debouncedQ, extFilter, sort, order])

  // Saved-Filters laden
  useEffect(() => {
    fetch("/admin/crm/saved-filters", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d) => setSavedFilters(d.filters || []))
      .catch(() => { /* silent */ })
  }, [])

  const reloadSavedFilters = useCallback(() => {
    fetch("/admin/crm/saved-filters", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setSavedFilters(d.filters || []))
      .catch(() => {})
  }, [])

  const applySavedFilter = (f: SavedFilter) => {
    const qj = f.query_json || {}
    setExtFilter({
      filter: (qj.filter as FilterKey) || "all",
      tier: qj.tier,
      lifecycle_stage: qj.lifecycle_stage,
      rfm_segment: qj.rfm_segment,
      acquisition_channel: qj.acquisition_channel,
    })
    if (qj.sort) setSort(qj.sort)
    if (qj.order === "asc" || qj.order === "desc") setOrder(qj.order)
    if (qj.q !== undefined) setQ(qj.q)
    setActiveSavedId(f.id)
  }

  const buildParams = useCallback(() => {
    const params = new URLSearchParams({
      sort,
      order,
      filter,
    })
    if (debouncedQ) params.set("q", debouncedQ)
    if (extFilter.tier) params.set("tier", extFilter.tier)
    if (extFilter.lifecycle_stage) params.set("lifecycle_stage", extFilter.lifecycle_stage)
    if (extFilter.rfm_segment) params.set("rfm_segment", extFilter.rfm_segment)
    if (extFilter.acquisition_channel) params.set("acquisition_channel", extFilter.acquisition_channel)
    return params
  }, [debouncedQ, filter, extFilter, sort, order])

  const load = useCallback(() => {
    setLoading(true)
    const params = buildParams()
    params.set("limit", String(PAGE_SIZE))
    params.set("offset", String(offset))

    fetch(`/admin/crm/contacts?${params}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [buildParams, offset])

  useEffect(() => {
    load()
  }, [load])

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setAllSelectedCount(null)
  }

  const togglePage = () => {
    if (!data) return
    const visible = new Set(data.contacts.map((c) => c.id))
    const allSelected = data.contacts.every((c) => selectedIds.has(c.id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        for (const id of visible) next.delete(id)
      } else {
        for (const id of visible) next.add(id)
      }
      return next
    })
    setAllSelectedCount(null)
  }

  const selectAllMatching = async () => {
    const params = buildParams()
    params.set("ids_only", "true")
    params.set("limit", "10000")
    try {
      const r = await fetch(`/admin/crm/contacts?${params}`, { credentials: "include" })
      const d = await r.json()
      const next = new Set<string>(d.ids || [])
      setSelectedIds(next)
      setAllSelectedCount(next.size)
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setAllSelectedCount(null)
  }

  const toggleSort = (key: string) => {
    setActiveSavedId(null)
    if (sort === key) {
      // Same column → flip order
      setOrder(order === "asc" ? "desc" : "asc")
    } else {
      // New column → reasonable default (numeric desc, alpha asc)
      setSort(key)
      const numericKeys = ["lifetime_revenue", "total_transactions", "health_score", "last_seen_at", "created_at"]
      setOrder(numericKeys.includes(key) ? "desc" : "asc")
    }
  }

  const total = data?.total || 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  const activeFilter = savedFilters.find((f) => f.id === activeSavedId) || null

  return (
    <div>
      {/* Filter row: Saved-Filter dropdown + Search */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap", position: "relative" }}>
        <SavedFilterDropdown
          filters={savedFilters}
          active={activeFilter}
          open={filtersOpen}
          onToggle={() => setFiltersOpen(!filtersOpen)}
          onClose={() => setFiltersOpen(false)}
          onApply={(f) => { applySavedFilter(f); setFiltersOpen(false) }}
          onClear={() => { setActiveSavedId(null); setExtFilter({ filter: "all" }); setQ(""); setFiltersOpen(false) }}
          onSaveNew={() => { setFiltersOpen(false); setShowSaveFilterModal(true) }}
          onDeleted={reloadSavedFilters}
        />
        <input
          type="search"
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setActiveSavedId(null) }}
          style={{ ...inputStyle, flex: "1 1 240px", minWidth: 200 }}
        />
        <select
          value={`${sort}_${order}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split("_") as [string, "asc" | "desc"]
            setSort(s)
            setOrder(o)
            setActiveSavedId(null)
          }}
          style={{ ...selectStyle, width: 220 }}
          title="Sort by"
        >
          <option value="lifetime_revenue_desc">Revenue (high → low)</option>
          <option value="lifetime_revenue_asc">Revenue (low → high)</option>
          <option value="health_score_desc">Health score</option>
          <option value="last_seen_at_desc">Last seen (recent)</option>
          <option value="last_seen_at_asc">Last seen (oldest)</option>
          <option value="total_transactions_desc">Transactions</option>
          <option value="created_at_desc">Created (newest)</option>
          <option value="display_name_asc">Name (A → Z)</option>
        </select>
      </div>

      {/* Filter pills */}
      <div style={{ marginBottom: 16 }}>
        <FilterPills active={filter} onChange={(f) => { setExtFilter({ filter: f }); setActiveSavedId(null) }} />
      </div>

      {/* Result counter + Save filter / Export buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <div style={T.small}>
          {loading && !data ? "Loading…" : `${fmtNum(total)} contacts`}
          {data && total > 0 && (
            <span style={{ color: C.muted }}>
              {" "}
              · showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {!activeSavedId && (filter !== "all" || extFilter.tier || extFilter.lifecycle_stage || extFilter.rfm_segment || debouncedQ) && (
            <button
              onClick={() => setShowSaveFilterModal(true)}
              style={{
                fontSize: 12,
                background: "transparent",
                color: C.gold,
                border: `1px solid ${C.gold}`,
                padding: "4px 10px",
                borderRadius: S.radius.md,
                cursor: "pointer",
              }}
            >
              ⭐ Save as filter
            </button>
          )}
          <a
            href={`/admin/crm/contacts/export?${buildParams().toString()}&format=csv`}
            target="_blank"
            rel="noopener"
            style={{
              fontSize: 12,
              background: "transparent",
              color: C.text,
              border: `1px solid ${C.border}`,
              padding: "4px 10px",
              borderRadius: S.radius.md,
              cursor: "pointer",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            ⬇ Export CSV
          </a>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: 16, color: C.error, fontSize: 13 }}>
          <b>Error:</b> {error}
        </div>
      )}

      {/* Table */}
      {data && data.contacts.length === 0 && !loading ? (
        <EmptyState
          title="No contacts match"
          description="Try a different filter or clear the search."
        />
      ) : (
        <div
          className="vod-scroll-x"
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: S.radius.lg,
            overflowX: "scroll",      // forciert always-visible scrollbar
            overflowY: "hidden",
            maxWidth: "100%",
          }}
        >
          <table style={{ width: "100%", minWidth: 1180, borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.subtle }}>
                <th style={{ ...thStyle, width: 30, padding: "10px 0 10px 14px" }}>
                  <input
                    type="checkbox"
                    checked={!!data && data.contacts.length > 0 && data.contacts.every((c) => selectedIds.has(c.id))}
                    onChange={togglePage}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                <SortableTh label="Name"      sortKey="display_name"   sort={sort} order={order} onSort={(k) => toggleSort(k)} />
                <SortableTh label="Email"     sortKey="primary_email"  sort={sort} order={order} onSort={(k) => toggleSort(k)} />
                <SortableTh label="Location"  sortKey="city"           sort={sort} order={order} onSort={(k) => toggleSort(k)} />
                <SortableTh label="Revenue"   sortKey="lifetime_revenue" sort={sort} order={order} onSort={(k) => toggleSort(k)} align="right" />
                <SortableTh label="Txns"      sortKey="total_transactions" sort={sort} order={order} onSort={(k) => toggleSort(k)} align="right" />
                <SortableTh label="RFM"       sortKey="rfm_segment"    sort={sort} order={order} onSort={(k) => toggleSort(k)} />
                <SortableTh label="Last seen" sortKey="last_seen_at"   sort={sort} order={order} onSort={(k) => toggleSort(k)} />
                <th style={thStyle}>Sources</th>
                <th style={thStyle}>Tags</th>
              </tr>
            </thead>
            <tbody>
              {data?.contacts.map((c) => (
                <ContactRow
                  key={c.id}
                  c={c}
                  selected={selectedIds.has(c.id)}
                  onToggle={() => toggleId(c.id)}
                  onClick={() => setSelectedId(c.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Drawer */}
      <ContactDetailDrawer
        contactId={selectedId}
        onClose={() => {
          setSelectedId(null)
          // refresh list (e.g. after note add) — cheap reload
          load()
        }}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "center",
            marginTop: 16,
            alignItems: "center",
            fontSize: 12,
            color: C.muted,
          }}
        >
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            style={paginationBtnStyle(offset === 0)}
          >
            ← Prev
          </button>
          <span>
            Page {currentPage} / {totalPages}
          </span>
          <button
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            style={paginationBtnStyle(offset + PAGE_SIZE >= total)}
          >
            Next →
          </button>
        </div>
      )}

      {/* Floating-Action-Bar (Shopify-Pattern) */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          totalAvailable={total}
          allMatched={allSelectedCount !== null}
          onSelectAll={selectAllMatching}
          onClear={clearSelection}
          onAction={(type) => setBulkAction({ type, openModal: true })}
        />
      )}

      {/* Save-Filter-Modal */}
      {showSaveFilterModal && (
        <SaveFilterModal
          query={{
            filter,
            ...(extFilter.tier ? { tier: extFilter.tier } : {}),
            ...(extFilter.lifecycle_stage ? { lifecycle_stage: extFilter.lifecycle_stage } : {}),
            ...(extFilter.rfm_segment ? { rfm_segment: extFilter.rfm_segment } : {}),
            ...(extFilter.acquisition_channel ? { acquisition_channel: extFilter.acquisition_channel } : {}),
            ...(debouncedQ ? { q: debouncedQ } : {}),
            sort,
            order,
          }}
          onClose={() => setShowSaveFilterModal(false)}
          onSaved={() => { setShowSaveFilterModal(false); reloadSavedFilters() }}
        />
      )}

      {/* Bulk-Action-Modal */}
      {bulkAction?.openModal && (
        <BulkActionModal
          action={bulkAction.type}
          ids={Array.from(selectedIds)}
          onClose={() => setBulkAction(null)}
          onApplied={() => {
            setBulkAction(null)
            clearSelection()
            load()
          }}
        />
      )}
    </div>
  )
}

const RFM_ROW_LABELS: Record<string, { icon: string; short: string }> = {
  champions:           { icon: "💎", short: "Champ" },
  loyal_customers:     { icon: "💜", short: "Loyal" },
  potential_loyalists: { icon: "🌱", short: "Potl." },
  new_customers:       { icon: "🆕", short: "New" },
  promising:           { icon: "⭐", short: "Promis." },
  needs_attention:     { icon: "👀", short: "Attn." },
  at_risk:             { icon: "⚠️", short: "Risk" },
  cant_lose:           { icon: "🚨", short: "Can't lose" },
  hibernating:         { icon: "😴", short: "Hibern." },
  lost:                { icon: "💤", short: "Lost" },
}

function ContactRow({ c, selected, onToggle, onClick }: {
  c: Contact
  selected: boolean
  onToggle: () => void
  onClick: () => void
}) {
  return (
    <tr
      onClick={onClick}
      style={{
        borderTop: `1px solid ${C.border}`,
        cursor: "pointer",
        background: selected ? C.subtle : "transparent",
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = C.hover }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent" }}
    >
      <td style={{ ...tdStyle, width: 30, padding: "10px 0 10px 14px" }} onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          style={{ cursor: "pointer" }}
        />
      </td>
      <td style={tdStyle}>
        <div style={{ fontWeight: 500 }}>{c.display_name}</div>
        {c.medusa_customer_id && (
          <div style={{ ...T.small, fontSize: 10 }}>linked to vod-auctions</div>
        )}
      </td>
      <td style={{ ...tdStyle, maxWidth: 220 }}>
        {c.primary_email ? (
          <span
            title={c.primary_email}
            style={{
              fontSize: 12,
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "100%",
            }}
          >
            {c.primary_email}
          </span>
        ) : (
          <span style={{ color: C.muted, fontStyle: "italic", fontSize: 12 }}>—</span>
        )}
      </td>
      <td style={tdStyle}>
        {c.primary_country_code || c.primary_city ? (
          <span style={{ fontSize: 12 }}>
            {[c.primary_postal_code, c.primary_city].filter(Boolean).join(" ")}
            {c.primary_country_code && (
              <span style={{ color: C.muted }}> · {c.primary_country_code}</span>
            )}
          </span>
        ) : (
          <span style={{ color: C.muted, fontSize: 12 }}>—</span>
        )}
      </td>
      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {c.lifetime_revenue > 0 ? (
          <span style={{ fontWeight: 500, color: C.gold }}>{fmtMoney(c.lifetime_revenue)}</span>
        ) : (
          <span style={{ color: C.muted }}>—</span>
        )}
      </td>
      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {c.total_transactions > 0 ? (
          fmtNum(c.total_transactions)
        ) : (
          <span style={{ color: C.muted }}>—</span>
        )}
      </td>
      <td style={tdStyle}>
        {c.rfm_segment ? (
          <span title={c.rfm_segment} style={{ fontSize: 12 }}>
            {RFM_ROW_LABELS[c.rfm_segment]?.icon || "•"} {RFM_ROW_LABELS[c.rfm_segment]?.short || c.rfm_segment.slice(0, 6)}
          </span>
        ) : (
          <span style={{ color: C.muted, fontSize: 12 }}>—</span>
        )}
      </td>
      <td style={tdStyle}>
        {c.last_seen_at ? (
          <span style={{ fontSize: 12 }}>{relativeTime(c.last_seen_at)}</span>
        ) : (
          <span style={{ color: C.muted, fontSize: 12 }}>—</span>
        )}
      </td>
      <td style={tdStyle}>
        <SourceBadges sources={c.sources} />
      </td>
      <td style={tdStyle}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {c.tier && tierBadge(c.tier)}
          {c.is_test && <Badge label="test" variant="warning" />}
          {c.is_blocked && <Badge label="blocked" variant="error" />}
          {c.tags.includes("internal_owner") && <Badge label="internal" variant="purple" />}
        </div>
      </td>
    </tr>
  )
}

const thStyle: React.CSSProperties = {
  padding: S.cellPadding,
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: C.muted,
}

const tdStyle: React.CSSProperties = {
  padding: S.cellPadding,
  verticalAlign: "middle",
}

function SortableTh({
  label, sortKey, sort, order, onSort, align,
}: {
  label: string
  sortKey: string
  sort: string
  order: "asc" | "desc"
  onSort: (k: string) => void
  align?: "left" | "right"
}) {
  const active = sort === sortKey
  return (
    <th
      style={{
        ...thStyle,
        textAlign: align || "left",
        cursor: "pointer",
        userSelect: "none",
        color: active ? C.gold : C.muted,
      }}
      onClick={() => onSort(sortKey)}
    >
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        {label}
        <span style={{ fontSize: 9, opacity: active ? 1 : 0.3 }}>
          {active ? (order === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </span>
    </th>
  )
}

function paginationBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    background: "transparent",
    border: `1px solid ${C.border}`,
    borderRadius: S.radius.md,
    cursor: disabled ? "not-allowed" : "pointer",
    color: disabled ? C.muted : C.text,
    fontSize: 12,
  }
}

// ── SavedFilterDropdown (HubSpot/Shopify "Views"-Pattern) ──────────────────

function SavedFilterDropdown({
  filters,
  active,
  open,
  onToggle,
  onClose,
  onApply,
  onClear,
  onSaveNew,
  onDeleted,
}: {
  filters: SavedFilter[]
  active: SavedFilter | null
  open: boolean
  onToggle: () => void
  onClose: () => void
  onApply: (f: SavedFilter) => void
  onClear: () => void
  onSaveNew: () => void
  onDeleted: () => void
}) {
  const pinned = filters.filter((f) => f.is_pinned)
  const others = filters.filter((f) => !f.is_pinned)

  const handleDelete = async (f: SavedFilter, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete filter "${f.name}"?`)) return
    try {
      const r = await fetch(`/admin/crm/saved-filters/${f.id}`, {
        method: "DELETE", credentials: "include",
      })
      if (r.ok) onDeleted()
      else alert((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
    } catch (err) { alert(err instanceof Error ? err.message : String(err)) }
  }

  const renderItem = (f: SavedFilter) => {
    const isSystem = f.created_by === "system"
    const isActive = active?.id === f.id
    return (
      <div
        key={f.id}
        onClick={() => onApply(f)}
        style={{
          padding: "6px 10px",
          cursor: "pointer",
          background: isActive ? C.gold + "15" : "transparent",
          fontSize: 12.5,
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: isActive ? C.gold : C.text,
        }}
        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = C.subtle }}
        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent" }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {f.name}
        </span>
        {!isSystem && (
          <button
            onClick={(e) => handleDelete(f, e)}
            style={{
              background: "transparent",
              border: "none",
              color: C.muted,
              cursor: "pointer",
              fontSize: 14,
              opacity: 0.5,
              padding: 0,
            }}
            title="Delete filter"
          >
            ×
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          padding: "6px 12px",
          background: active ? C.gold + "15" : "transparent",
          border: `1px solid ${active ? C.gold : C.border}`,
          borderRadius: S.radius.md,
          color: active ? C.gold : C.text,
          cursor: "pointer",
          minWidth: 180,
          justifyContent: "space-between",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {active ? active.name : "All contacts"}
        </span>
        <span style={{ fontSize: 10, color: C.muted }}>▾</span>
      </button>

      {open && (
        <>
          <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              minWidth: 240,
              maxHeight: 420,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: S.radius.md,
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              zIndex: 51,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, ...T.micro }}>
              Saved Filters
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {/* Reset / All */}
              <div
                onClick={onClear}
                style={{
                  padding: "6px 10px",
                  cursor: "pointer",
                  background: !active ? C.gold + "15" : "transparent",
                  fontSize: 12.5,
                  color: !active ? C.gold : C.text,
                  borderBottom: `1px solid ${C.border}80`,
                }}
                onMouseEnter={(e) => { if (active) e.currentTarget.style.background = C.subtle }}
                onMouseLeave={(e) => { if (active) e.currentTarget.style.background = "transparent" }}
              >
                ☰ All contacts
              </div>
              {pinned.length > 0 && (
                <>
                  <div style={{ ...T.micro, padding: "8px 10px 4px" }}>Pinned</div>
                  {pinned.map(renderItem)}
                </>
              )}
              {others.length > 0 && (
                <>
                  <div style={{ ...T.micro, padding: "8px 10px 4px", marginTop: 4 }}>All</div>
                  {others.map(renderItem)}
                </>
              )}
              {filters.length === 0 && (
                <div style={{ ...T.small, fontStyle: "italic", color: C.muted, padding: 12 }}>
                  No saved filters yet
                </div>
              )}
            </div>
            <button
              onClick={onSaveNew}
              style={{
                padding: "8px 10px",
                background: "transparent",
                border: "none",
                borderTop: `1px solid ${C.border}`,
                cursor: "pointer",
                fontSize: 12,
                color: C.gold,
                textAlign: "left",
              }}
            >
              + Save current as filter
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── BulkActionBar (Floating, Shopify-Pattern) ─────────────────────────────

function BulkActionBar({
  count,
  totalAvailable,
  allMatched,
  onSelectAll,
  onClear,
  onAction,
}: {
  count: number
  totalAvailable: number
  allMatched: boolean
  onSelectAll: () => void
  onClear: () => void
  onAction: (type: string) => void
}) {
  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: "translateX(-50%)",
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: S.radius.lg,
      boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      padding: "10px 16px",
      display: "flex",
      gap: 12,
      alignItems: "center",
      fontSize: 13,
      zIndex: 50,
    }}>
      <span style={{ fontWeight: 600 }}>{count} selected</span>
      {!allMatched && totalAvailable > count && (
        <button
          onClick={onSelectAll}
          style={{
            background: "transparent",
            border: "none",
            color: C.gold,
            cursor: "pointer",
            fontSize: 12,
            textDecoration: "underline",
          }}
        >
          Select all {fmtNum(totalAvailable)} matching
        </button>
      )}
      <div style={{ width: 1, height: 24, background: C.border }} />
      <button onClick={() => onAction("tag_add")} style={bulkBtnStyle()}>+ Tag</button>
      <button onClick={() => onAction("tag_remove")} style={bulkBtnStyle()}>− Tag</button>
      <button onClick={() => onAction("tier_set")} style={bulkBtnStyle()}>Set tier</button>
      <button onClick={() => onAction("lifecycle_set")} style={bulkBtnStyle()}>Set lifecycle</button>
      <button onClick={() => onAction("is_test_set")} style={bulkBtnStyle()}>Test flag</button>
      <button onClick={() => onAction("block")} style={{ ...bulkBtnStyle(), color: C.error }}>Block</button>
      <button onClick={() => onAction("unblock")} style={bulkBtnStyle()}>Unblock</button>
      <div style={{ width: 1, height: 24, background: C.border }} />
      <button onClick={onClear} style={{ ...bulkBtnStyle(), color: C.muted }}>Clear</button>
    </div>
  )
}

function bulkBtnStyle(): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${C.border}`,
    borderRadius: S.radius.md,
    padding: "4px 10px",
    fontSize: 12,
    cursor: "pointer",
    color: C.text,
  }
}

// ── BulkActionModal — Konkretisiert die Action mit Value + Confirm ─────────

const BULK_TIERS = ["", "platinum", "gold", "silver", "bronze", "standard", "dormant"]
const BULK_LIFECYCLE = ["", "lead", "active", "engaged", "at_risk", "dormant", "churned", "lost"]

function BulkActionModal({
  action,
  ids,
  onClose,
  onApplied,
}: {
  action: string
  ids: string[]
  onClose: () => void
  onApplied: () => void
}) {
  const [textValue, setTextValue] = useState("")
  const [boolValue, setBoolValue] = useState(false)
  const [running, setRunning] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const titles: Record<string, string> = {
    tag_add: "Add tag to selected",
    tag_remove: "Remove tag from selected",
    tier_set: "Set tier for selected",
    lifecycle_set: "Set lifecycle stage for selected",
    is_test_set: "Set test-flag for selected",
    block: "Block selected contacts",
    unblock: "Unblock selected contacts",
  }

  const apply = async () => {
    setRunning(true)
    setErr(null)
    try {
      let value: unknown = textValue
      if (action === "is_test_set") value = boolValue
      else if (action === "block") value = { reason: textValue }
      else if (action === "unblock") value = null

      const r = await fetch("/admin/crm/contacts/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, action, value }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${r.status}`)
      }
      onApplied()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal
      title={titles[action] || "Bulk action"}
      subtitle={`${ids.length} contacts`}
      onClose={onClose}
      maxWidth={420}
      footer={
        <>
          <Btn label="Cancel" variant="ghost" onClick={onClose} />
          <Btn
            label={running ? "Applying…" : "Apply"}
            variant={action === "block" ? "danger" : "gold"}
            onClick={apply}
            disabled={running}
          />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {err && <div style={{ color: C.error, fontSize: 12 }}><b>Error:</b> {err}</div>}

        {(action === "tag_add" || action === "tag_remove") && (
          <div>
            <label style={{ ...T.small, display: "block", marginBottom: 4 }}>Tag name</label>
            <input
              autoFocus
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="vip"
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>
        )}

        {action === "tier_set" && (
          <div>
            <label style={{ ...T.small, display: "block", marginBottom: 4 }}>Tier</label>
            <select value={textValue} onChange={(e) => setTextValue(e.target.value)} style={{ ...selectStyle, width: "100%" }}>
              {BULK_TIERS.map((t) => <option key={t} value={t}>{t || "— clear —"}</option>)}
            </select>
          </div>
        )}

        {action === "lifecycle_set" && (
          <div>
            <label style={{ ...T.small, display: "block", marginBottom: 4 }}>Lifecycle stage</label>
            <select value={textValue} onChange={(e) => setTextValue(e.target.value)} style={{ ...selectStyle, width: "100%" }}>
              {BULK_LIFECYCLE.map((l) => <option key={l} value={l}>{l || "— clear —"}</option>)}
            </select>
          </div>
        )}

        {action === "is_test_set" && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={boolValue} onChange={(e) => setBoolValue(e.target.checked)} />
            Mark as test account
          </label>
        )}

        {action === "block" && (
          <div>
            <label style={{ ...T.small, display: "block", marginBottom: 4 }}>Reason (optional)</label>
            <input
              autoFocus
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="Why are these blocked?"
              style={{ ...inputStyle, width: "100%" }}
            />
            <div style={{ ...T.small, marginTop: 8, color: C.error }}>
              ⚠️ {ids.length} contacts will be blocked.
            </div>
          </div>
        )}

        {action === "unblock" && (
          <div style={T.small}>{ids.length} contacts will be unblocked.</div>
        )}
      </div>
    </Modal>
  )
}

// ── SaveFilterModal ────────────────────────────────────────────────────────

function SaveFilterModal({
  query,
  onClose,
  onSaved,
}: {
  query: Record<string, unknown>
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [pinned, setPinned] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    if (!name.trim()) {
      setErr("Name required")
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const r = await fetch("/admin/crm/saved-filters", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          query_json: query,
          is_pinned: pinned,
          shared: false,
        }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${r.status}`)
      }
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Save filter"
      onClose={onClose}
      maxWidth={420}
      footer={
        <>
          <Btn label="Cancel" variant="ghost" onClick={onClose} />
          <Btn label={saving ? "Saving…" : "Save"} variant="gold" onClick={save} disabled={saving || !name.trim()} />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {err && <div style={{ color: C.error, fontSize: 12 }}><b>Error:</b> {err}</div>}
        <div>
          <label style={{ ...T.small, display: "block", marginBottom: 4 }}>Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Top customers Q2"
            style={{ ...inputStyle, width: "100%" }}
          />
        </div>
        <div>
          <label style={{ ...T.small, display: "block", marginBottom: 4 }}>Description (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...inputStyle, width: "100%" }}
          />
        </div>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Pin to sidebar
        </label>
      </div>
    </Modal>
  )
}
