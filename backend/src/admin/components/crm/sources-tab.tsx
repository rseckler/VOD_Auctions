import { useEffect, useState, useCallback } from "react"
import { C, S, T, fmtNum, relativeTime } from "../admin-tokens"
import { Badge, EmptyState } from "../admin-ui"

// ── Types ──────────────────────────────────────────────────────────────────

type SourceHealth = "ok" | "warning" | "stale" | "failed" | "never_run"

type SourceRow = {
  source: string
  pipeline: string
  health: SourceHealth
  last_run_at: string | null
  last_successful_run_at: string | null
  total_runs: number
  successful_runs: number
  failed_runs: number
  active_runs: number
  stale_runs: number
  success_rate_pct: number | null
  total_rows_inserted: number
  total_rows_updated: number | null
  layout_review_open: number
  layout_review_resolved: number
  layout_review_skipped: number
}

type ResolverRunRow = {
  id: string
  algorithm_version: string | null
  status: string | null
  started_at: string | null
  finished_at: string | null
  duration_sec: number | null
  stage1_email_matches: number | null
  stage2_address_matches: number | null
  stage3_name_plz_matches: number | null
  stage4_imap_enriched: number | null
  total_master_contacts_existing: number | null
  total_master_contacts_created: number | null
  manual_review_cases_added: number | null
  notes: string | null
}

type SourcesData = {
  sources: SourceRow[]
  resolver_history: ResolverRunRow[]
  master_contacts_total: number
}

// ── Display helpers ────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  mo_pdf: "Monkey Office PDFs",
  vod_records_db1: "vod-records.com (db1, pre-2013)",
  vod_records_db2013: "vod-records.com (db2013, 2013+)",
  vod_records_db2013_alt: "vod-records.com (db2013-alt addresses)",
  vodtapes_members: "tape-mag.com Members",
  imap_vod_records: "IMAP — frank@vod-records.com",
  imap_vinyl_on_demand: "IMAP — frank@vinyl-on-demand.com",
}

const PIPELINE_LABELS: Record<string, string> = {
  d1_mo_pdf: "Pipeline D1",
  e1_legacy_db: "Pipeline E1",
  f1_imap: "Pipeline F1",
}

function healthBadge(h: SourceHealth) {
  switch (h) {
    case "ok":
      return <Badge label="✓ OK" variant="success" />
    case "warning":
      return <Badge label="⚠ Warning" variant="warning" />
    case "stale":
      return <Badge label="◷ Stale" variant="warning" />
    case "failed":
      return <Badge label="✗ Failed" variant="error" />
    case "never_run":
      return <Badge label="○ Never Run" variant="neutral" />
  }
}

// ── SourceCard ─────────────────────────────────────────────────────────────

function SourceCard({ row }: { row: SourceRow }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: S.radius.lg,
        padding: S.cardPadding,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ ...T.body, fontWeight: 600, marginBottom: 2 }}>
            {SOURCE_LABELS[row.source] || row.source}
          </div>
          <div style={T.small}>
            {PIPELINE_LABELS[row.pipeline] || row.pipeline}
            {row.layout_review_open > 0 && (
              <span style={{ marginLeft: 8, color: C.warning }}>
                · {row.layout_review_open} review queue
              </span>
            )}
          </div>
        </div>
        {healthBadge(row.health)}
      </div>

      {/* Stats grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          paddingTop: 8,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <Stat label="Last Run" value={row.last_run_at ? relativeTime(row.last_run_at) : "—"} />
        <Stat label="Total Runs" value={fmtNum(row.total_runs)} />
        <Stat
          label="Success"
          value={row.success_rate_pct === null ? "—" : `${row.success_rate_pct}%`}
          accent={row.failed_runs > 0 ? C.warning : undefined}
        />
        <Stat label="Rows Inserted" value={fmtNum(row.total_rows_inserted)} />
        <Stat
          label="Failed Runs"
          value={fmtNum(row.failed_runs)}
          accent={row.failed_runs > 0 ? C.error : undefined}
        />
        <Stat label="Active" value={fmtNum(row.active_runs)} />
      </div>

      {/* Footer */}
      <div style={{ ...T.small, paddingTop: 4 }}>
        Last success:{" "}
        <span style={{ color: row.last_successful_run_at ? C.text : C.muted }}>
          {row.last_successful_run_at ? relativeTime(row.last_successful_run_at) : "never"}
        </span>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={T.micro}>{label}</div>
      <div style={{ ...T.body, fontWeight: 600, color: accent || C.text, marginTop: 2 }}>{value}</div>
    </div>
  )
}

// ── ResolverHistorySection ─────────────────────────────────────────────────

function ResolverHistory({ runs, total }: { runs: ResolverRunRow[]; total: number }) {
  return (
    <div style={{ marginTop: S.sectionGap }}>
      <div style={T.sectionHead}>Master-Resolver History</div>
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: S.radius.lg,
          padding: S.cardPadding,
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div style={T.stat}>{fmtNum(total)}</div>
        <div style={{ ...T.body, color: C.muted }}>
          unique master contacts after deduplication
        </div>
      </div>

      {runs.length === 0 ? (
        <EmptyState title="No resolver runs yet" description="Once master-resolver stages run, history appears here." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {runs.map((r) => (
            <div
              key={r.id}
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: S.radius.md,
                padding: "10px 14px",
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 4 }}>
                <div style={{ fontWeight: 600 }}>
                  {r.algorithm_version || "(unversioned)"}
                  {r.status === "done" && <Badge label="done" variant="success" />}
                  {r.status === "running" && <Badge label="running" variant="info" />}
                  {r.status === "error" && <Badge label="error" variant="error" />}
                </div>
                <div style={{ color: C.muted }}>
                  {r.started_at ? relativeTime(r.started_at) : "—"}
                  {r.duration_sec !== null && <span> · {r.duration_sec}s</span>}
                </div>
              </div>
              {(r.stage1_email_matches || r.stage2_address_matches || r.stage3_name_plz_matches || r.stage4_imap_enriched) && (
                <div style={{ ...T.small, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {r.stage1_email_matches !== null && <span>S1 email: {fmtNum(r.stage1_email_matches)}</span>}
                  {r.stage2_address_matches !== null && <span>S2 addr: {fmtNum(r.stage2_address_matches)}</span>}
                  {r.stage3_name_plz_matches !== null && <span>S3 name+plz: {fmtNum(r.stage3_name_plz_matches)}</span>}
                  {r.stage4_imap_enriched !== null && <span>S4 imap: {fmtNum(r.stage4_imap_enriched)}</span>}
                </div>
              )}
              {r.notes && (
                <div style={{ ...T.small, marginTop: 4, color: C.muted, fontStyle: "italic" }}>
                  {r.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Tab ───────────────────────────────────────────────────────────────

export function SourcesTab() {
  const [data, setData] = useState<SourcesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch("/admin/crm/sources", { credentials: "include" })
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
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading && !data) {
    return <div style={{ padding: 32, color: C.muted }}>Loading sources…</div>
  }

  if (error) {
    return (
      <div style={{ padding: 32, color: C.error }}>
        <b>Error:</b> {error}
      </div>
    )
  }

  if (!data) return null

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={T.sectionHead}>Pipeline Health · {data.sources.length} sources</div>
        <button
          onClick={load}
          style={{
            background: "transparent",
            border: `1px solid ${C.border}`,
            borderRadius: S.radius.md,
            padding: "6px 12px",
            fontSize: 12,
            color: C.text,
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      {data.sources.length === 0 ? (
        <EmptyState title="No data sources registered" description="Run a CRM pipeline to populate this view." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 12 }}>
          {data.sources.map((s) => (
            <SourceCard key={s.source} row={s} />
          ))}
        </div>
      )}

      <ResolverHistory runs={data.resolver_history} total={data.master_contacts_total} />
    </div>
  )
}
