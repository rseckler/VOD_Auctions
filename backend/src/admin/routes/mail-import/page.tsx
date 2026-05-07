import { useEffect, useState, useCallback } from "react"
import { useAdminNav } from "../../components/admin-nav"
import { C } from "../../components/admin-tokens"
import { PageHeader, PageShell } from "../../components/admin-layout"

type Counts = {
  inserted: number
  skipped_in_batch_dup: number
  skipped_db_dup: number
  skipped_no_date: number
  skipped_error: number
  batches_processed: number
}

type State = {
  last_line: number
  pull_run_id: string | null
  started_at: string | null
  counts: Counts
  updated_at: string
}

type PullRunRow = {
  id: string
  source: string
  pipeline: string | null
  status: string
  started_at: string
  finished_at: string | null
  rows_inserted: number | null
  rows_skipped: number | null
  notes: string | null
}

type AccountRow = { account: string; rows: number | string }

type StatusResponse = {
  jsonl: { total_lines: number; last_line: number; progress_pct: number }
  current_run: PullRunRow | null
  state: State | null
  totals: {
    legacy_archive_rows: number
    with_body: number
    with_from: number
    with_subject: number
    synthetic_msgid: number
    oldest_mail: string | null
    newest_mail: string | null
  }
  accounts: AccountRow[]
  history: PullRunRow[]
  log_tail: string[]
}

function fmtNum(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return "–"
  const v = typeof n === "string" ? Number(n) : n
  if (!Number.isFinite(v)) return "–"
  return v.toLocaleString("de-DE")
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "–"
  try {
    const d = new Date(iso)
    return d.toLocaleString("de-DE", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    })
  } catch { return iso }
}

function elapsedFrom(startIso: string | null | undefined, endIso?: string | null): string {
  if (!startIso) return "–"
  const start = new Date(startIso).getTime()
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  const ms = end - start
  if (ms < 0 || !Number.isFinite(ms)) return "–"
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

function statusColor(status: string): string {
  if (status === "running") return C.success
  if (status === "done") return C.muted
  if (status === "partial") return C.warning
  if (status === "failed" || status === "error") return C.error
  if (status === "abandoned") return C.muted
  return C.muted
}

function MailImportPage() {
  useAdminNav()
  const [data, setData] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [, setTick] = useState(0)

  const load = useCallback(() => {
    fetch("/admin/mail-import/status")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => {
        setData(d as StatusResponse)
        setErr(null)
      })
      .catch((e) => setErr(String(e?.message || e)))
      .finally(() => setLoading(false))
  }, [])

  // Initial fetch + auto-refresh
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(() => load(), 10_000)
    return () => clearInterval(id)
  }, [load])
  // Tick once a second so "elapsed" updates without re-fetching
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  if (loading && !data) {
    return (
      <PageShell>
        <PageHeader title="Mail Import" subtitle="Frank's Legacy Mail Archive (Mac Studio JSONL)" />
        <div style={{ color: C.muted }}>Loading…</div>
      </PageShell>
    )
  }

  if (err) {
    return (
      <PageShell>
        <PageHeader title="Mail Import" />
        <div style={{
          background: C.error + "15", border: `1px solid ${C.error}40`,
          color: C.error, padding: 12, borderRadius: 6,
        }}>
          Error loading status: {err}
        </div>
      </PageShell>
    )
  }

  if (!data) return null

  const { jsonl, current_run, state, totals, accounts, history, log_tail } = data
  const isRunning = !!current_run

  // Counts vom State (live während laufendem Run) oder dem letzten partial/done in History
  const liveCounts: Counts | null = state?.counts || null

  return (
    <PageShell>
      <PageHeader
        title="Mail Import"
        subtitle="Frank's Legacy Mail Archive (Mac Studio JSONL → crm_imap_message)"
      />

      {/* Status banner */}
      <div style={{
        background: isRunning
          ? `linear-gradient(135deg, ${C.success}, ${C.success}cc)`
          : C.subtle,
        color: isRunning ? "#fff" : C.text,
        borderRadius: 10, padding: "16px 20px", marginBottom: 18,
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <div style={{
          width: 12, height: 12, borderRadius: "50%",
          background: isRunning ? "#4ade80" : C.muted,
          flexShrink: 0,
          ...(isRunning ? { animation: "pulse 1.5s ease-in-out infinite" } : {}),
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {isRunning ? "Import läuft" : "Idle — kein Import aktiv"}
          </div>
          {isRunning && current_run && (
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
              pull_run {current_run.id.slice(0, 8)}… · started {fmtDate(current_run.started_at)} · elapsed {elapsedFrom(current_run.started_at)}
            </div>
          )}
          {!isRunning && state && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              Letzter State: {fmtDate(state.updated_at)} · resume bei Line {fmtNum(state.last_line)}
            </div>
          )}
        </div>
      </div>

      {/* Progress */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: 20, marginBottom: 18,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            JSONL-Progress
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginLeft: "auto" }}>
            Line {fmtNum(jsonl.last_line)} / {fmtNum(jsonl.total_lines)} · {jsonl.progress_pct}%
          </div>
        </div>
        <div style={{
          background: C.subtle, borderRadius: 4, height: 12, overflow: "hidden",
        }}>
          <div style={{
            background: C.gold,
            height: "100%",
            width: `${Math.min(100, jsonl.progress_pct)}%`,
            transition: "width 0.5s ease-out",
          }} />
        </div>

        {liveCounts && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(6, 1fr)",
            gap: 8, marginTop: 14, fontSize: 11,
          }}>
            <Stat label="Inserted" value={fmtNum(liveCounts.inserted)} color={C.success} />
            <Stat label="DB-Dup" value={fmtNum(liveCounts.skipped_db_dup)} />
            <Stat label="Batch-Dup" value={fmtNum(liveCounts.skipped_in_batch_dup)} />
            <Stat label="No-Date" value={fmtNum(liveCounts.skipped_no_date)} />
            <Stat label="Error" value={fmtNum(liveCounts.skipped_error)} color={liveCounts.skipped_error > 0 ? C.warning : undefined} />
            <Stat label="Batches" value={fmtNum(liveCounts.batches_processed)} />
          </div>
        )}
      </div>

      {/* Totals + Accounts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: C.text }}>
            LEGACY_ARCHIVE Totals
          </div>
          <Row label="Total rows" value={fmtNum(totals.legacy_archive_rows)} bold />
          <Row label="With body" value={`${fmtNum(totals.with_body)} (${pct(totals.with_body, totals.legacy_archive_rows)}%)`} />
          <Row label="With from_email" value={`${fmtNum(totals.with_from)} (${pct(totals.with_from, totals.legacy_archive_rows)}%)`} />
          <Row label="With subject" value={`${fmtNum(totals.with_subject)} (${pct(totals.with_subject, totals.legacy_archive_rows)}%)`} />
          <Row label="Synthetic msgid" value={fmtNum(totals.synthetic_msgid)} />
          <Row label="Oldest mail" value={fmtDate(totals.oldest_mail)} />
          <Row label="Newest mail" value={fmtDate(totals.newest_mail)} last />
        </div>

        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: C.text }}>
            Account-Verteilung
          </div>
          {accounts.length === 0 && (
            <div style={{ fontSize: 12, color: C.muted }}>noch keine Daten</div>
          )}
          {accounts.map((a, i) => (
            <Row key={a.account} label={a.account} value={`${fmtNum(a.rows)} (${pct(Number(a.rows), totals.legacy_archive_rows)}%)`} last={i === accounts.length - 1} />
          ))}
        </div>
      </div>

      {/* Run-Historie */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: 20, marginBottom: 18,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: C.text }}>
          Run-Historie (last 20)
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.muted, textAlign: "left" }}>
                <th style={{ padding: "6px 8px" }}>started</th>
                <th style={{ padding: "6px 8px" }}>status</th>
                <th style={{ padding: "6px 8px" }}>elapsed</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>inserted</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>skipped</th>
                <th style={{ padding: "6px 8px" }}>id</th>
                <th style={{ padding: "6px 8px" }}>notes</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{fmtDate(h.started_at)}</td>
                  <td style={{ padding: "6px 8px", color: statusColor(h.status), fontWeight: 600 }}>{h.status}</td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{elapsedFrom(h.started_at, h.finished_at)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtNum(h.rows_inserted)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtNum(h.rows_skipped)}</td>
                  <td style={{ padding: "6px 8px", color: C.muted, fontFamily: "monospace" }}>{h.id.slice(0, 8)}…</td>
                  <td style={{ padding: "6px 8px", color: C.muted, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {h.notes || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log-Tail */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: 20, marginBottom: 18,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: C.text }}>
          Log-Tail (last 80 lines)
        </div>
        <pre style={{
          background: "#0f0f0f", color: "#cbd5e1",
          padding: 12, borderRadius: 6, fontSize: 11,
          maxHeight: 360, overflow: "auto",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          margin: 0,
        }}>
{log_tail.length === 0 ? "(kein Log gefunden)" : log_tail.join("\n")}
        </pre>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.3); }
        }
      `}</style>
    </PageShell>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: C.subtle, borderRadius: 6, padding: "8px 10px",
    }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || C.text, marginTop: 2 }}>
        {value}
      </div>
    </div>
  )
}

function Row({ label, value, bold, last }: { label: string; value: string; bold?: boolean; last?: boolean }) {
  return (
    <div style={{
      display: "flex", padding: "5px 0", fontSize: 12,
      borderBottom: last ? "none" : `1px solid ${C.border}`,
    }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ marginLeft: "auto", color: C.text, fontWeight: bold ? 700 : 500 }}>
        {value}
      </span>
    </div>
  )
}

function pct(n: number, total: number): string {
  if (!total || total <= 0) return "0"
  return ((n / total) * 100).toFixed(1)
}

export default MailImportPage
