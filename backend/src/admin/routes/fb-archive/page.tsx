import { useEffect, useState, useCallback } from "react"
import { useAdminNav } from "../../components/admin-nav"
import { C } from "../../components/admin-tokens"
import { PageHeader, PageShell } from "../../components/admin-layout"

type Job = {
  id: string
  kind: string
  display_name: string
  status: string
  progress_done: number
  progress_total: number | null
  started_at: string | null
  finished_at: string | null
  last_heartbeat: string | null
  pid: number | null
  hostname: string | null
  result_summary: any
  log_tail: string | null
  triggered_by: string | null
}

type ImageStats = {
  total_lines: number
  uploaded: number
  skipped_non_image: number
  missing: number
  errors: number
  bytes_in_total: number
  bytes_out_total: number
  had_exif_count: number
}

type MatchStats = {
  total_rows: number
  tier1: number
  tier2: number
  tier3: number
  reasons: Record<string, number>
}

type DbLoad = {
  db_size_bytes?: number
  db_size_pretty?: string
  max_connections?: number
  blks_hit?: number
  blks_read?: number
  cache_hit_pct?: number | null
  deadlocks?: number
  xact_commit?: number
  xact_rollback?: number
  temp_files?: number
  temp_bytes?: number
  connections?: { app: string; state: string; n: number }[]
  connections_total?: number
  slow_queries?: {
    pid: number
    app: string
    state: string
    wait_event_type: string | null
    wait_event: string | null
    seconds: number
    query: string
  }[]
  rates?: {
    interval_sec: number
    tx_per_sec: number
    blks_read_per_sec: number
    blks_hit_per_sec: number
    deadlocks_delta: number
    temp_files_delta: number
    temp_bytes_delta: number
    rollback_delta: number
  } | null
  health?: {
    level: "ok" | "warn" | "critical"
    reasons: string[]
  }
  error?: string
}

type StatusResponse = {
  phases: {
    p2: { kind: string; job: Job | null; log_tail: string[] }
    p3: { kind: string; job: Job | null; log_tail: string[] }
    p4: { kind: string; job: Job | null; log_tail: string[] }
  }
  manifests: {
    images: ImageStats | null
    matches: MatchStats | null
    images_mtime: string | null
    matches_mtime: string | null
  }
  history: Job[]
  db_load: DbLoad | null
}

function fmtNum(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return "–"
  const v = typeof n === "string" ? Number(n) : n
  if (!Number.isFinite(v)) return "–"
  return v.toLocaleString("de-DE")
}

function fmtBytes(b: number | null | undefined): string {
  if (b === null || b === undefined || !Number.isFinite(b)) return "–"
  if (b < 1024) return `${b} B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} kB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "–"
  try {
    return new Date(iso).toLocaleString("de-DE", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    })
  } catch {
    return iso
  }
}

function elapsedFrom(start: string | null | undefined, end?: string | null): string {
  if (!start) return "–"
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const ms = e - s
  if (ms < 0 || !Number.isFinite(ms)) return "–"
  const sec = Math.floor(ms / 1000)
  const m = Math.floor(sec / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m ${sec % 60}s`
  if (m > 0) return `${m}m ${sec % 60}s`
  return `${sec}s`
}

function statusColor(status: string): string {
  if (status === "running") return C.success
  if (status === "succeeded") return C.muted
  if (status === "queued" || status === "paused") return C.warning
  if (status === "failed" || status === "cancelled") return C.error
  return C.muted
}

function progressPct(done: number, total: number | null): number {
  if (!total || total <= 0) return 0
  return Math.round((done / total) * 100 * 10) / 10
}

function FBArchivePage() {
  useAdminNav()
  const [data, setData] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [, setTick] = useState(0)

  const load = useCallback(() => {
    fetch("/admin/fb-archive/status")
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

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(() => load(), 10_000)
    return () => clearInterval(id)
  }, [load])
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  if (loading && !data) {
    return (
      <PageShell>
        <PageHeader title="FB Archive Import" subtitle="Frank's Facebook Archive (P1–P5 Pipeline)" />
        <div style={{ color: C.muted }}>Loading…</div>
      </PageShell>
    )
  }

  if (err) {
    return (
      <PageShell>
        <PageHeader title="FB Archive Import" />
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

  const { phases, manifests, history, db_load } = data
  const anyRunning =
    phases.p2.job?.status === "running" ||
    phases.p3.job?.status === "running" ||
    phases.p4.job?.status === "running"

  return (
    <PageShell>
      <PageHeader
        title="FB Archive Import"
        subtitle="Frank's Facebook Archive · 5.819 Posts · 7.310 R2-Bilder · Annex §A10"
      />

      {/* Supabase DB Health Banner — prominent, an erster Stelle */}
      <DbHealthBanner load={db_load} />

      {/* Status banner */}
      <div style={{
        background: anyRunning
          ? `linear-gradient(135deg, ${C.success}, ${C.success}cc)`
          : C.subtle,
        color: anyRunning ? "#fff" : C.text,
        borderRadius: 10, padding: "16px 20px", marginBottom: 18,
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <div style={{
          width: 12, height: 12, borderRadius: "50%",
          background: anyRunning ? "#4ade80" : C.muted,
          flexShrink: 0,
          ...(anyRunning ? { animation: "pulse 1.5s ease-in-out infinite" } : {}),
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {anyRunning ? "Pipeline läuft" : "Idle — keine Phase aktiv"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
            P2 = Image-Preprocess (R2) · P3 = Tier-1 Match (Catalog) · P4 = AI Vision (Haiku) · P5 = Manual Review CSV
          </div>
        </div>
      </div>

      {/* Phase rows */}
      <div style={{
        display: "flex", flexDirection: "column", gap: 12, marginBottom: 18,
      }}>
        <PhaseCard label="P2 · Image Preprocess" job={phases.p2.job} />
        <PhaseCard label="P3 · Tier-1 Match" job={phases.p3.job} />
        <PhaseCard label="P4 · AI Vision (Haiku)" job={phases.p4.job} placeholder="not yet implemented" />
      </div>

      {/* Manifest Stats — Images + Matches */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: C.text }}>
            Image Manifest (P2)
          </div>
          {!manifests.images ? (
            <div style={{ fontSize: 12, color: C.muted }}>noch nicht erstellt</div>
          ) : (
            <>
              <Row label="Manifest rows" value={fmtNum(manifests.images.total_lines)} bold />
              <Row label="✓ Uploaded zu R2" value={fmtNum(manifests.images.uploaded)} />
              <Row label="Skipped (Video etc.)" value={fmtNum(manifests.images.skipped_non_image)} />
              <Row label="Missing source" value={fmtNum(manifests.images.missing)} />
              <Row label="Errors" value={fmtNum(manifests.images.errors)} />
              <Row label="EXIF stripped" value={fmtNum(manifests.images.had_exif_count)} />
              <Row label="Bytes in (Original)" value={fmtBytes(manifests.images.bytes_in_total)} />
              <Row label="Bytes out (WebP in R2)" value={fmtBytes(manifests.images.bytes_out_total)} />
              <Row
                label="Compression-Ratio"
                value={
                  manifests.images.bytes_in_total > 0
                    ? `${(
                        (manifests.images.bytes_out_total /
                          manifests.images.bytes_in_total) *
                        100
                      ).toFixed(1)}%`
                    : "–"
                }
                last
              />
            </>
          )}
        </div>

        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: C.text }}>
            Match Manifest (P3)
          </div>
          {!manifests.matches ? (
            <div style={{ fontSize: 12, color: C.muted }}>noch nicht erstellt</div>
          ) : (
            <>
              <Row label="Total rows" value={fmtNum(manifests.matches.total_rows)} bold />
              <Row
                label="Tier 1 (auto-renameable)"
                value={`${fmtNum(manifests.matches.tier1)} (${pct(manifests.matches.tier1, manifests.matches.total_rows)}%)`}
              />
              <Row
                label="Tier 2 (P4 AI Vision)"
                value={`${fmtNum(manifests.matches.tier2)} (${pct(manifests.matches.tier2, manifests.matches.total_rows)}%)`}
              />
              <Row
                label="Tier 3 (no match)"
                value={`${fmtNum(manifests.matches.tier3)} (${pct(manifests.matches.tier3, manifests.matches.total_rows)}%)`}
                last
              />
              {Object.keys(manifests.matches.reasons || {}).length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: C.muted }}>
                  <div style={{ marginBottom: 4 }}>Reasons:</div>
                  {Object.entries(manifests.matches.reasons)
                    .sort((a, b) => b[1] - a[1])
                    .map(([reason, n]) => (
                      <div key={reason} style={{
                        display: "flex", justifyContent: "space-between",
                        padding: "1px 0",
                      }}>
                        <span>{reason}</span>
                        <span>{fmtNum(n)}</span>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* DB-Load Card */}
      <DbLoadCard load={db_load} />

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
                <th style={{ padding: "6px 8px" }}>kind</th>
                <th style={{ padding: "6px 8px" }}>status</th>
                <th style={{ padding: "6px 8px" }}>elapsed</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>progress</th>
                <th style={{ padding: "6px 8px" }}>id</th>
                <th style={{ padding: "6px 8px" }}>summary</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{fmtDate(h.started_at)}</td>
                  <td style={{ padding: "6px 8px", color: C.muted, fontFamily: "monospace" }}>
                    {h.kind.replace("fb_import_", "")}
                  </td>
                  <td style={{ padding: "6px 8px", color: statusColor(h.status), fontWeight: 600 }}>{h.status}</td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{elapsedFrom(h.started_at, h.finished_at)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    {h.progress_total
                      ? `${fmtNum(h.progress_done)}/${fmtNum(h.progress_total)} (${progressPct(h.progress_done, h.progress_total)}%)`
                      : "–"}
                  </td>
                  <td style={{ padding: "6px 8px", color: C.muted, fontFamily: "monospace" }}>{h.id.slice(0, 12)}…</td>
                  <td style={{ padding: "6px 8px", color: C.muted, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {h.result_summary
                      ? Object.entries(h.result_summary)
                          .filter(([k]) => !["traceback"].includes(k))
                          .slice(0, 3)
                          .map(([k, v]) => `${k}=${typeof v === "object" ? "…" : v}`)
                          .join(" · ")
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log-Tails */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <LogPanel title="P2 Log-Tail" lines={phases.p2.log_tail} />
        <LogPanel title="P3 Log-Tail" lines={phases.p3.log_tail} />
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

function PhaseCard({ label, job, placeholder }: { label: string; job: Job | null; placeholder?: string }) {
  const isRunning = job?.status === "running"
  const isDone = job?.status === "succeeded"
  const isFailed = job?.status === "failed" || job?.status === "cancelled"

  let pct = 0
  if (job?.progress_total) {
    pct = Math.min(100, (job.progress_done / job.progress_total) * 100)
  }

  return (
    <div style={{
      background: C.card, border: `1px solid ${isRunning ? C.success : C.border}`,
      borderRadius: 10, padding: "14px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: isRunning ? C.success : isDone ? C.muted : isFailed ? C.error : C.subtle,
          ...(isRunning ? { animation: "pulse 1.5s ease-in-out infinite" } : {}),
        }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{label}</div>
        {job ? (
          <div style={{ fontSize: 11, color: statusColor(job.status), fontWeight: 600, marginLeft: "auto" }}>
            {job.status.toUpperCase()}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: C.muted, marginLeft: "auto" }}>
            {placeholder || "noch nicht gestartet"}
          </div>
        )}
      </div>

      {job && (
        <>
          <div style={{
            background: C.subtle, borderRadius: 4, height: 8, overflow: "hidden", marginBottom: 6,
          }}>
            <div style={{
              background: isRunning ? C.success : isDone ? C.muted : isFailed ? C.error : C.subtle,
              height: "100%", width: `${pct}%`, transition: "width 0.5s ease-out",
            }} />
          </div>
          <div style={{ display: "flex", fontSize: 11, color: C.muted, gap: 16, flexWrap: "wrap" }}>
            <span>
              {job.progress_total
                ? `${fmtNum(job.progress_done)} / ${fmtNum(job.progress_total)} (${pct.toFixed(1)}%)`
                : `${fmtNum(job.progress_done)} done`}
            </span>
            {job.started_at && <span>elapsed: {elapsedFrom(job.started_at, job.finished_at)}</span>}
            {job.last_heartbeat && job.status === "running" && (
              <span>heartbeat: {Math.round((Date.now() - new Date(job.last_heartbeat).getTime()) / 1000)}s ago</span>
            )}
            {job.hostname && <span>{job.hostname}{job.pid ? ` · pid ${job.pid}` : ""}</span>}
            <span style={{ marginLeft: "auto", fontFamily: "monospace" }}>{job.id.slice(0, 16)}</span>
          </div>
        </>
      )}
    </div>
  )
}

function DbHealthBanner({ load }: { load: DbLoad | null }) {
  if (!load || !load.health) return null
  const lvl = load.health.level
  const bg =
    lvl === "ok" ? C.success
      : lvl === "warn" ? C.warning
      : C.error
  const label =
    lvl === "ok" ? "DB Healthy"
      : lvl === "warn" ? "DB Warning"
      : "DB Critical"
  const icon =
    lvl === "ok" ? "✓"
      : lvl === "warn" ? "!"
      : "⚠"
  const r = load.rates

  return (
    <div style={{
      background: `linear-gradient(135deg, ${bg}, ${bg}cc)`,
      color: "#fff",
      borderRadius: 10, padding: "14px 18px", marginBottom: 14,
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "rgba(255,255,255,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, fontWeight: 700, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{label}</span>
          <span style={{ fontSize: 11, opacity: 0.85 }}>
            (Supabase Prod · vod-auctions)
          </span>
        </div>
        <div style={{ fontSize: 12, opacity: 0.95, marginTop: 4 }}>
          {(load.health.reasons || []).join(" · ")}
        </div>
      </div>
      {r && (
        <div style={{
          display: "flex", gap: 14, fontSize: 11,
          flexShrink: 0, textAlign: "right",
        }}>
          <div>
            <div style={{ opacity: 0.7, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              TX/s
            </div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{r.tx_per_sec}</div>
          </div>
          <div>
            <div style={{ opacity: 0.7, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Disk-Read
            </div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              {r.blks_read_per_sec > 0 ? `${r.blks_read_per_sec}/s` : "0"}
            </div>
            <div style={{ opacity: 0.6, fontSize: 9 }}>
              {r.blks_read_per_sec > 0
                ? `${((r.blks_read_per_sec * 8) / 1024).toFixed(1)} MB/s`
                : ""}
            </div>
          </div>
          <div>
            <div style={{ opacity: 0.7, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Cache
            </div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              {load.cache_hit_pct != null ? `${load.cache_hit_pct.toFixed(1)}%` : "–"}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DbLoadCard({ load }: { load: DbLoad | null }) {
  if (!load) {
    return null
  }
  if (load.error) {
    return (
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: 20, marginBottom: 18,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: C.text }}>
          DB-Load (Supabase Prod)
        </div>
        <div style={{ fontSize: 12, color: C.error }}>error: {load.error}</div>
      </div>
    )
  }
  const cacheHitColor =
    load.cache_hit_pct == null ? C.muted
      : load.cache_hit_pct >= 99 ? C.success
      : load.cache_hit_pct >= 95 ? C.warning
      : C.error
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: 20, marginBottom: 18,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: C.text }}>
        DB-Load (Supabase Prod) — Detail
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
        gap: 10, marginBottom: 14, fontSize: 11,
      }}>
        <Stat label="DB-Size" value={load.db_size_pretty || "–"} />
        <Stat
          label="Cache-Hit"
          value={load.cache_hit_pct != null ? `${load.cache_hit_pct.toFixed(2)}%` : "–"}
          color={cacheHitColor}
        />
        <Stat
          label="Connections"
          value={`${load.connections_total ?? "–"} / ${load.max_connections ?? "?"}`}
        />
        <Stat
          label="Deadlocks"
          value={fmtNum(load.deadlocks)}
          color={load.deadlocks && load.deadlocks > 0 ? C.warning : undefined}
        />
        <Stat
          label="Temp Files"
          value={
            load.temp_files != null && load.temp_files > 0
              ? `${fmtNum(load.temp_files)} (${fmtBytes(load.temp_bytes)})`
              : "0"
          }
          color={load.temp_files && load.temp_files > 100 ? C.warning : undefined}
        />
      </div>

      {/* Live rates row — what's happening RIGHT NOW (last interval) */}
      {load.rates && (
        <div style={{
          background: C.subtle, borderRadius: 6,
          padding: "8px 12px", marginBottom: 12,
          display: "flex", gap: 16, fontSize: 11, alignItems: "center",
        }}>
          <span style={{ color: C.muted, fontWeight: 600 }}>
            Live ({load.rates.interval_sec}s window):
          </span>
          <span><b>{load.rates.tx_per_sec}</b> tx/s</span>
          <span><b>{load.rates.blks_read_per_sec}</b> disk-reads/s</span>
          <span><b>{load.rates.blks_hit_per_sec}</b> cache-hits/s</span>
          {load.rates.rollback_delta > 0 && (
            <span style={{ color: C.warning }}>
              <b>{load.rates.rollback_delta}</b> rollbacks
            </span>
          )}
          {load.rates.deadlocks_delta > 0 && (
            <span style={{ color: C.error }}>
              <b>{load.rates.deadlocks_delta}</b> neue Deadlocks
            </span>
          )}
        </div>
      )}

      {/* Connection breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Connection-Breakdown
          </div>
          {(load.connections || []).length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted }}>(keine)</div>
          ) : (
            (load.connections || []).slice(0, 12).map((c, i) => (
              <div key={i} style={{
                display: "flex", padding: "3px 0", fontSize: 11,
                borderBottom: i === Math.min(11, (load.connections?.length ?? 1) - 1) ? "none" : `1px solid ${C.border}`,
              }}>
                <span style={{ color: C.text, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {c.app}
                </span>
                <span style={{ color: c.state === "active" ? C.success : C.muted, marginLeft: 8, marginRight: 8, minWidth: 60 }}>
                  {c.state}
                </span>
                <span style={{ color: C.text, fontWeight: 600, minWidth: 30, textAlign: "right" }}>
                  {c.n}
                </span>
              </div>
            ))
          )}
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Slow Queries (≥3s)
          </div>
          {(load.slow_queries || []).length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted }}>(keine)</div>
          ) : (
            (load.slow_queries || []).map((q, i) => (
              <div key={i} style={{
                fontSize: 11, padding: "6px 8px", marginBottom: 4,
                background: q.seconds > 30 ? C.error + "12" : q.seconds > 10 ? C.warning + "12" : C.subtle,
                borderRadius: 4,
              }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 2 }}>
                  <span style={{ color: C.muted, fontFamily: "monospace" }}>{q.app}</span>
                  <span style={{ color: q.seconds > 10 ? C.error : C.warning, fontWeight: 600, marginLeft: "auto" }}>
                    {q.seconds}s
                  </span>
                </div>
                <div style={{
                  color: C.text, fontFamily: "monospace", fontSize: 10,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {q.query}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function LogPanel({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: 16,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: C.text }}>
        {title}
      </div>
      <pre style={{
        background: "#0f0f0f", color: "#cbd5e1",
        padding: 10, borderRadius: 4, fontSize: 10,
        maxHeight: 300, overflow: "auto",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        margin: 0,
      }}>
{lines.length === 0 ? "(kein Log gefunden)" : lines.join("\n")}
      </pre>
    </div>
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

export default FBArchivePage
