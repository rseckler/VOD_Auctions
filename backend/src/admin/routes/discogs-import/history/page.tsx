import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useAdminNav } from "../../../components/admin-nav"
import { C, fmtDate, fmtNum } from "../../../components/admin-tokens"
import { PageHeader, PageShell, StatsGrid } from "../../../components/admin-layout"
import { Btn, EmptyState } from "../../../components/admin-ui"

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface HistoryRun {
  run_id: string
  collection_name: string | null
  import_source: string | null
  started_at: string | null
  ended_at: string | null
  total: number
  inserted: number
  linked: number
  updated: number
  skipped: number
  session_status: string | null
  session_id: string | null
  row_count: number | null
  unique_count: number | null
}

interface HistoryStats {
  total_runs: number
  total_releases: number
  total_inserted: number
  total_linked: number
  total_updated: number
  last_import_at: string | null
}

/* ─── Styles ────────────────────────────────────────────────────────────────── */

const cell: React.CSSProperties = { fontSize: 13, padding: "10px 14px", borderBottom: "1px solid " + C.border }
const th: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: C.muted, padding: "10px 14px", borderBottom: "1px solid " + C.border, textAlign: "left" as const, background: C.card }

/* ─── Page ──────────────────────────────────────────────────────────────────── */

const DiscogsHistoryListPage = () => {
  useAdminNav()
  const navigate = useNavigate()

  const [runs, setRuns] = useState<HistoryRun[] | null>(null)
  const [stats, setStats] = useState<HistoryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch("/admin/discogs-import/history", { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: { runs: HistoryRun[]; stats: HistoryStats | null }) => {
        setRuns(d.runs || [])
        setStats(d.stats || null)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filteredRuns = useMemo(() => {
    if (!runs) return []
    if (!search.trim()) return runs
    const q = search.toLowerCase()
    return runs.filter((r) =>
      (r.collection_name || "").toLowerCase().includes(q) ||
      (r.import_source || "").toLowerCase().includes(q) ||
      (r.run_id || "").toLowerCase().includes(q)
    )
  }, [runs, search])

  return (
    <PageShell>
      <PageHeader
        title="Imported Collections"
        subtitle="Browse, filter and export all past Discogs collection imports"
        actions={
          <Btn variant="secondary" onClick={() => navigate("/discogs-import")}>
            ← Back to Import Wizard
          </Btn>
        }
      />

      {error && (
        <div style={{ padding: 12, border: "1px solid " + C.error, background: C.error + "11", borderRadius: 4, color: C.error, fontSize: 13, marginBottom: 16 }}>
          Failed to load history: {error}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, padding: 20 }}>Loading...</div>
      ) : !runs || runs.length === 0 ? (
        <EmptyState icon="📀" title="No imports yet" description="Start a new import from the wizard to see it here." />
      ) : (
        <>
          {/* Stats header */}
          {stats && (
            <div style={{ marginBottom: 20 }}>
              <StatsGrid stats={[
                { label: "Total Imports", value: fmtNum(stats.total_runs) },
                { label: "Total Releases", value: fmtNum(stats.total_releases) },
                { label: "Inserted", value: fmtNum(stats.total_inserted), color: C.success },
                { label: "Linked", value: fmtNum(stats.total_linked), color: C.gold },
                { label: "Updated", value: fmtNum(stats.total_updated), color: C.blue },
                { label: "Last Import", value: stats.last_import_at ? fmtDate(stats.last_import_at) : "—" },
              ]} />
            </div>
          )}

          {/* Search bar */}
          <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              placeholder="Search collection, source file, or run ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: "1px solid " + C.border, borderRadius: 4, background: C.card }}
            />
            {search && (
              <span style={{ fontSize: 12, color: C.muted }}>
                {filteredRuns.length} of {runs.length}
              </span>
            )}
          </div>

          {/* Runs table */}
          {filteredRuns.length === 0 ? (
            <EmptyState icon="🔍" title="No matching runs" description="Try a different search term" />
          ) : (
            <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 6, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Date</th>
                    <th style={th}>Collection</th>
                    <th style={th}>Source</th>
                    <th style={{ ...th, textAlign: "right" }}>Total</th>
                    <th style={{ ...th, textAlign: "right" }}>Inserted</th>
                    <th style={{ ...th, textAlign: "right" }}>Linked</th>
                    <th style={{ ...th, textAlign: "right" }}>Updated</th>
                    <th style={{ ...th, textAlign: "right" }}>Skipped</th>
                    <th style={th}>Status</th>
                    <th style={th}></th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRuns.map((r) => (
                    <tr
                      key={r.run_id}
                      style={{ cursor: "pointer" }}
                      onClick={() => navigate(`/discogs-import/history/${encodeURIComponent(r.run_id)}`)}
                    >
                      <td style={cell}>{r.started_at ? fmtDate(r.started_at) : "—"}</td>
                      <td style={{ ...cell, fontWeight: 600 }}>{r.collection_name || "—"}</td>
                      <td style={{ ...cell, fontSize: 12, color: C.muted, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.import_source || "—"}
                      </td>
                      <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtNum(r.total)}</td>
                      <td style={{ ...cell, textAlign: "right", color: C.success, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtNum(r.inserted)}</td>
                      <td style={{ ...cell, textAlign: "right", color: C.gold, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtNum(r.linked)}</td>
                      <td style={{ ...cell, textAlign: "right", color: C.blue, fontVariantNumeric: "tabular-nums" }}>{fmtNum(r.updated)}</td>
                      <td style={{ ...cell, textAlign: "right", color: C.muted, fontVariantNumeric: "tabular-nums" }}>{fmtNum(r.skipped)}</td>
                      <td style={cell}>
                        {r.session_status && (
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "3px 8px", borderRadius: 3, background: (r.session_status === "done" ? C.success : C.muted) + "22", color: r.session_status === "done" ? C.success : C.muted }}>
                            {r.session_status}
                          </span>
                        )}
                      </td>
                      <td style={{ ...cell, color: C.gold, fontSize: 12 }}>Open →</td>
                      <td style={cell} onClick={(e) => e.stopPropagation()}>
                        <a
                          href={`/admin/discogs-import/history/${encodeURIComponent(r.run_id)}/export`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Download CSV"
                          style={{ color: C.gold, textDecoration: "none", fontSize: 12, fontWeight: 600 }}
                        >
                          ⬇ CSV
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </PageShell>
  )
}

export default DiscogsHistoryListPage
