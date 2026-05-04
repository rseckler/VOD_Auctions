import { useEffect, useState, useCallback, useRef } from "react"
import { C, S, T, fmtMoney, fmtNum, relativeTime } from "../admin-tokens"
import { Badge, EmptyState, inputStyle, selectStyle } from "../admin-ui"

// ── Types ──────────────────────────────────────────────────────────────────

type Contact = {
  id: string
  display_name: string
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
  tags: string[]
  is_test: boolean
  is_blocked: boolean
  manual_review_status: string | null
  created_at: string | null
  sources: string[]
  source_link_count: number
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

export function ContactsTab() {
  const [data, setData] = useState<ContactsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<FilterKey>("all")
  const [sort, setSort] = useState("lifetime_revenue")
  const [order, setOrder] = useState<"asc" | "desc">("desc")
  const [offset, setOffset] = useState(0)

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
  }, [debouncedQ, filter, sort, order])

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      sort,
      order,
      filter,
    })
    if (debouncedQ) params.set("q", debouncedQ)

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
  }, [debouncedQ, filter, sort, order, offset])

  useEffect(() => {
    load()
  }, [load])

  const total = data?.total || 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div>
      {/* Search + Sort */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 280px", minWidth: 240 }}
        />
        <select
          value={`${sort}_${order}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split("_") as [string, "asc" | "desc"]
            setSort(s)
            setOrder(o)
          }}
          style={{ ...selectStyle, width: 240 }}
        >
          <option value="lifetime_revenue_desc">Revenue (high → low)</option>
          <option value="lifetime_revenue_asc">Revenue (low → high)</option>
          <option value="last_seen_at_desc">Last seen (recent)</option>
          <option value="last_seen_at_asc">Last seen (oldest)</option>
          <option value="total_transactions_desc">Transactions (most)</option>
          <option value="created_at_desc">Created (newest)</option>
          <option value="display_name_asc">Name (A → Z)</option>
        </select>
      </div>

      {/* Filter pills */}
      <div style={{ marginBottom: 16 }}>
        <FilterPills active={filter} onChange={setFilter} />
      </div>

      {/* Result counter */}
      <div style={{ ...T.small, marginBottom: 12 }}>
        {loading && !data ? "Loading…" : `${fmtNum(total)} contacts`}
        {data && total > 0 && (
          <span style={{ color: C.muted }}>
            {" "}
            · showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)}
          </span>
        )}
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
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: S.radius.lg,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.subtle }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Location</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Revenue</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Txns</th>
                <th style={thStyle}>Last seen</th>
                <th style={thStyle}>Sources</th>
                <th style={thStyle}>Tags</th>
              </tr>
            </thead>
            <tbody>
              {data?.contacts.map((c) => (
                <ContactRow key={c.id} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}

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
    </div>
  )
}

function ContactRow({ c }: { c: Contact }) {
  const handleClick = () => {
    // TODO S6: open detail drawer
    alert(
      `Contact detail drawer comes in Sprint S6.\n\n${c.display_name}\n${c.primary_email || "(no email)"}\nID: ${c.id}`
    )
  }
  return (
    <tr
      onClick={handleClick}
      style={{
        borderTop: `1px solid ${C.border}`,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.hover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <td style={tdStyle}>
        <div style={{ fontWeight: 500 }}>{c.display_name}</div>
        {c.medusa_customer_id && (
          <div style={{ ...T.small, fontSize: 10 }}>linked to vod-auctions</div>
        )}
      </td>
      <td style={tdStyle}>
        {c.primary_email ? (
          <span style={{ fontSize: 12 }}>{c.primary_email}</span>
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
