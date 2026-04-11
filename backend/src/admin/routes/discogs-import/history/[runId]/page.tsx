import { useEffect, useMemo, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useAdminNav } from "../../../../components/admin-nav"
import { C, fmtDate, fmtNum } from "../../../../components/admin-tokens"
import { PageHeader, PageShell, StatsGrid } from "../../../../components/admin-layout"
import { EmptyState } from "../../../../components/admin-ui"
import { ImportLiveLog, type ImportEvent } from "../../../../components/discogs-import"

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface RunMeta {
  run_id: string
  collection_name: string | null
  import_source: string | null
  started_at: string | null
  ended_at: string | null
  session_id: string | null
  session_status: string | null
  row_count: number | null
  unique_count: number | null
  format_detected: string | null
  export_type: string | null
  import_settings: Record<string, unknown> | null
  filename: string | null
}

interface RunStats {
  total: number
  inserted: number
  linked: number
  updated: number
  skipped: number
  visible_now: number
  purchasable_now: number
  unavailable_now: number
}

interface ReleaseRow {
  log_id: string
  action: "inserted" | "linked" | "updated" | "skipped"
  discogs_id: number
  release_id: string | null
  data_snapshot: {
    excel?: {
      artist?: string
      title?: string
      catalog_number?: string
      year?: number | string
      format?: string
    }
    api?: Record<string, unknown>
  } | null
  logged_at: string
  slug: string | null
  current_title: string | null
  format: string | null
  year: number | null
  country: string | null
  coverImage: string | null
  legacy_price: number | string | null
  legacy_available: boolean | null
  legacy_condition: string | null
  sale_mode: string | null
  direct_price: number | string | null
  auction_status: string | null
  artist_name: string | null
  artist_slug: string | null
  label_name: string | null
}

interface DetailResponse {
  run: RunMeta
  stats: RunStats | null
  releases: ReleaseRow[]
  events: Array<{
    id: number
    phase: string
    event_type: string
    payload: Record<string, unknown>
    created_at: string
  }>
}

type ActionFilter = "all" | "inserted" | "linked" | "updated" | "skipped"

/* ─── Styles ────────────────────────────────────────────────────────────────── */

const cell: React.CSSProperties = { fontSize: 13, padding: "8px 12px", borderBottom: "1px solid " + C.border, verticalAlign: "middle" }
const th: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: C.muted, padding: "10px 12px", borderBottom: "1px solid " + C.border, textAlign: "left" as const, background: C.card, position: "sticky" as const, top: 0, zIndex: 1 }

const ACTION_COLORS: Record<string, string> = {
  inserted: C.success,
  linked: C.gold,
  updated: C.blue,
  skipped: C.muted,
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

const HistoryDetailPage = () => {
  useAdminNav()
  const { runId } = useParams<{ runId: string }>()
  const navigate = useNavigate()

  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState("")
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all")
  const [visibleOnly, setVisibleOnly] = useState(false)
  const [visibleCount, setVisibleCount] = useState(200)
  const [eventsExpanded, setEventsExpanded] = useState(false)
  const [copiedRunId, setCopiedRunId] = useState(false)

  useEffect(() => {
    if (!runId) return
    setLoading(true)
    setError(null)
    fetch(`/admin/discogs-import/history/${encodeURIComponent(runId)}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || `HTTP ${r.status}`))))
      .then((d: DetailResponse) => setData(d))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [runId])

  const filteredReleases = useMemo(() => {
    if (!data) return []
    let rows = data.releases
    if (actionFilter !== "all") rows = rows.filter((r) => r.action === actionFilter)
    if (visibleOnly) rows = rows.filter((r) => r.coverImage != null)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter((r) =>
        (r.artist_name || "").toLowerCase().includes(q) ||
        (r.current_title || r.data_snapshot?.excel?.title || "").toLowerCase().includes(q) ||
        String(r.discogs_id || "").includes(q) ||
        (r.release_id || "").toLowerCase().includes(q)
      )
    }
    return rows
  }, [data, actionFilter, visibleOnly, search])

  // Reset visibleCount when filters change
  useEffect(() => {
    setVisibleCount(200)
  }, [search, actionFilter, visibleOnly])

  const copyRunId = () => {
    if (!runId) return
    navigator.clipboard.writeText(runId).then(() => {
      setCopiedRunId(true)
      setTimeout(() => setCopiedRunId(false), 2000)
    }).catch(() => {/* ignore */})
  }

  if (loading) {
    return <PageShell><div style={{ fontSize: 13, padding: 20 }}>Loading...</div></PageShell>
  }

  // Shared button styles — the admin-ui Btn component uses a `label` prop (not children)
  // and doesn't have a "secondary" variant, so we inline a small helper style here.
  const btnSecondary: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "8px 14px", fontSize: 13, fontWeight: 600,
    background: C.card, color: C.text,
    border: "1px solid " + C.border, borderRadius: 4,
    cursor: "pointer", textDecoration: "none",
  }

  const backLink = (
    <button
      type="button"
      onClick={() => navigate("/discogs-import/history")}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        background: "transparent", border: "none", padding: 0,
        fontSize: 13, color: C.gold, cursor: "pointer", marginBottom: 12,
      }}
    >
      ← Back to Collections
    </button>
  )

  if (error || !data) {
    return (
      <PageShell>
        {backLink}
        <PageHeader title="Import Run" subtitle={runId} />
        <EmptyState icon="⚠" title="Failed to load run" description={error || "Run not found"} />
      </PageShell>
    )
  }

  const { run, stats, releases, events } = data
  const importSettings = run.import_settings as {
    media_condition?: string
    sleeve_condition?: string
    inventory?: number
    price_markup?: number
    selected_discogs_ids?: number[] | null
  } | null

  // Subtitle mit Source, Date, Status + Inventory-Info
  const subtitleParts = [
    run.import_source || run.filename || "—",
    run.started_at ? fmtDate(run.started_at) : null,
    run.session_status ? `status: ${run.session_status}` : null,
    importSettings?.inventory != null
      ? `inventory: ${Number(importSettings.inventory) > 0 ? `${importSettings.inventory} (yes)` : "0 (no)"}`
      : null,
  ].filter(Boolean).join(" · ")

  return (
    <PageShell>
      {backLink}
      <PageHeader
        title={run.collection_name || "Import Run"}
        subtitle={subtitleParts}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={copyRunId} style={btnSecondary}>
              {copiedRunId ? "✓ Copied" : "Copy Run ID"}
            </button>
            <a
              href={`/admin/discogs-import/history/${encodeURIComponent(run.run_id)}/export`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...btnSecondary, background: C.gold, color: "#1c1915", border: "1px solid " + C.gold }}
            >
              ⬇ Export CSV
            </a>
          </div>
        }
      />

      {/* Stats grid */}
      {stats && (
        <div style={{ marginBottom: 20 }}>
          <StatsGrid stats={[
            { label: "Total", value: fmtNum(stats.total) },
            { label: "Inserted", value: fmtNum(stats.inserted), color: C.success },
            { label: "Linked", value: fmtNum(stats.linked), color: C.gold },
            { label: "Updated", value: fmtNum(stats.updated), color: C.blue },
            { label: "Skipped", value: fmtNum(stats.skipped), color: C.muted },
            { label: "Visible now", value: fmtNum(stats.visible_now), color: C.success, subtitle: "has cover" },
            { label: "Purchasable now", value: fmtNum(stats.purchasable_now), color: C.gold, subtitle: "price + available" },
            { label: "Unavailable", value: fmtNum(stats.unavailable_now), color: C.muted },
          ]} />
        </div>
      )}

      {/* Import settings card */}
      {importSettings && (
        <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 6, padding: "12px 16px", marginBottom: 20, display: "flex", gap: 28, fontSize: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: C.muted, letterSpacing: "0.06em" }}>Import Settings:</div>
          {importSettings.media_condition && (
            <div><span style={{ color: C.muted }}>Media:</span> <strong>{importSettings.media_condition}</strong></div>
          )}
          {importSettings.sleeve_condition && (
            <div><span style={{ color: C.muted }}>Sleeve:</span> <strong>{importSettings.sleeve_condition}</strong></div>
          )}
          {importSettings.price_markup != null && (
            <div><span style={{ color: C.muted }}>Markup:</span> <strong>{Number(importSettings.price_markup).toFixed(2)}×</strong></div>
          )}
          {importSettings.inventory != null && (
            <div>
              <span style={{ color: C.muted }}>Inventory:</span>{" "}
              <strong style={{ color: Number(importSettings.inventory) > 0 ? C.success : C.muted }}>
                {Number(importSettings.inventory) > 0 ? `yes (${importSettings.inventory})` : "no (0)"}
              </strong>
            </div>
          )}
          {Array.isArray(importSettings.selected_discogs_ids) && (
            <div><span style={{ color: C.muted }}>Selected:</span> <strong>{fmtNum(importSettings.selected_discogs_ids.length)} IDs</strong></div>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search artist, title, discogs ID, release ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 260, padding: "8px 12px", fontSize: 13, border: "1px solid " + C.border, borderRadius: 4, background: C.card }}
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value as ActionFilter)}
          style={{ padding: "8px 12px", fontSize: 13, border: "1px solid " + C.border, borderRadius: 4, background: C.card }}
        >
          <option value="all">All actions</option>
          <option value="inserted">Inserted</option>
          <option value="linked">Linked</option>
          <option value="updated">Updated</option>
          <option value="skipped">Skipped</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={visibleOnly} onChange={(e) => setVisibleOnly(e.target.checked)} />
          Visible only
        </label>
        <span style={{ fontSize: 12, color: C.muted, marginLeft: "auto" }}>
          {fmtNum(filteredReleases.length)} of {fmtNum(releases.length)} releases
        </span>
      </div>

      {/* Release table */}
      {filteredReleases.length === 0 ? (
        <EmptyState icon="🔍" title="No matching releases" description="Try a different filter or search term" />
      ) : (
        <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 6, overflow: "hidden" }}>
          <div style={{ maxHeight: 720, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 64 }}></th>
                  <th style={th}>Artist / Title</th>
                  <th style={{ ...th, width: 140 }}>Meta</th>
                  <th style={{ ...th, width: 90 }}>Action</th>
                  <th style={{ ...th, width: 80, textAlign: "right" }}>Price</th>
                  <th style={{ ...th, width: 60, textAlign: "center" }}>Visible</th>
                  <th style={{ ...th, width: 130 }}>Links</th>
                </tr>
              </thead>
              <tbody>
                {filteredReleases.slice(0, visibleCount).map((r) => {
                  const title = r.current_title || r.data_snapshot?.excel?.title || "—"
                  const artist = r.artist_name || r.data_snapshot?.excel?.artist || "—"
                  const isDeleted = r.release_id && !r.slug && !r.current_title
                  const price = r.legacy_price != null ? Number(r.legacy_price) : null
                  const actionColor = ACTION_COLORS[r.action] || C.muted

                  return (
                    <tr key={r.log_id} style={{ opacity: r.action === "skipped" ? 0.55 : 1 }}>
                      <td style={cell}>
                        {r.coverImage ? (
                          <img src={r.coverImage} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4, border: "1px solid " + C.border }} />
                        ) : (
                          <div style={{ width: 48, height: 48, background: C.hover, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: C.muted }}>—</div>
                        )}
                      </td>
                      <td style={cell}>
                        <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>{artist}</div>
                        <div style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>{title}</div>
                        {isDeleted && <div style={{ fontSize: 10, color: C.error, fontWeight: 700, marginTop: 2 }}>DELETED</div>}
                      </td>
                      <td style={cell}>
                        <div style={{ fontSize: 12, color: C.muted }}>
                          {[r.format, r.year, r.legacy_condition].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td style={cell}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "3px 8px", borderRadius: 3, background: actionColor + "22", color: actionColor }}>
                          {r.action}
                        </span>
                      </td>
                      <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {price != null && price > 0 ? `€${Math.round(price)}` : <span style={{ color: C.muted }}>—</span>}
                      </td>
                      <td style={{ ...cell, textAlign: "center" }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: r.coverImage ? C.success : C.muted }} title={r.coverImage ? "Has cover" : "No cover"} />
                      </td>
                      <td style={cell}>
                        <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
                          {r.slug ? (
                            <a href={`https://vod-auctions.com/catalog/${r.slug}`} target="_blank" rel="noopener noreferrer" title="Storefront" style={{ color: C.gold, textDecoration: "none" }}>🌐</a>
                          ) : <span style={{ color: C.muted }}>🌐</span>}
                          {r.release_id ? (
                            <a href={`/app/media/${encodeURIComponent(r.release_id)}`} target="_blank" rel="noopener noreferrer" title="Admin Release Detail" style={{ color: C.blue, textDecoration: "none" }}>⚙</a>
                          ) : <span style={{ color: C.muted }}>⚙</span>}
                          <a href={`https://www.discogs.com/release/${r.discogs_id}`} target="_blank" rel="noopener noreferrer" title="Discogs" style={{ color: C.muted, textDecoration: "none", fontWeight: 700 }}>D</a>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filteredReleases.length > visibleCount && (
            <div style={{ padding: 12, borderTop: "1px solid " + C.border, textAlign: "center", background: C.card }}>
              <button type="button" onClick={() => setVisibleCount(visibleCount + 200)} style={btnSecondary}>
                Load more ({fmtNum(filteredReleases.length - visibleCount)} remaining)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Event timeline (collapsible) */}
      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          onClick={() => setEventsExpanded(!eventsExpanded)}
          style={{ background: "transparent", border: "none", color: C.text, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "8px 0", display: "flex", alignItems: "center", gap: 6 }}
        >
          <span style={{ color: C.muted }}>{eventsExpanded ? "▼" : "▶"}</span>
          Event Timeline ({events.length})
        </button>
        {eventsExpanded && events.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <ImportLiveLog
              events={events.map((e): ImportEvent => ({
                type: e.event_type,
                phase: e.phase as ImportEvent["phase"],
                timestamp: e.created_at,
                ...(e.payload || {}),
              }))}
              maxHeight={400}
              filter="all"
            />
          </div>
        )}
        {eventsExpanded && events.length === 0 && (
          <div style={{ fontSize: 12, color: C.muted, padding: 12 }}>
            Events not available for this run.
          </div>
        )}
      </div>
    </PageShell>
  )
}

export default HistoryDetailPage
