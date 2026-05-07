import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as fs from "fs"
import * as path from "path"
import knex from "knex"

const FB_ARCHIVE_DIR = "/root/VOD_Auctions/data/fb_archive_2026-05-07"
const MANIFEST_IMAGES = path.join(FB_ARCHIVE_DIR, "manifest_images.jsonl")
const MANIFEST_MATCHES = path.join(FB_ARCHIVE_DIR, "manifest_matches.jsonl")
const LOG_P2 = path.join(FB_ARCHIVE_DIR, "p2_image_preprocess.log")
const LOG_P3 = path.join(FB_ARCHIVE_DIR, "p3_tier1_match.log")
const LOG_P2_RUN = path.join(FB_ARCHIVE_DIR, "p2_run.log")

// Persistent snapshot for delta-rate calculation between API calls.
// Stored in /tmp (Medusa app process can read+write, lost on reboot — fine).
const DB_SNAPSHOT_FILE = "/tmp/fb_archive_db_load_snapshot.json"

const KIND_PREFIX = "fb_import_"
const KIND_P2 = "fb_import_p2_image_preprocess"
const KIND_P3 = "fb_import_p3_tier1_match"
const KIND_P4 = "fb_import_p4_ai_vision"

type ImageManifestStat = {
  total_lines: number
  uploaded: number
  skipped_non_image: number
  missing: number
  errors: number
  bytes_in_total: number
  bytes_out_total: number
  had_exif_count: number
}

type MatchManifestStat = {
  total_rows: number
  tier1: number
  tier2: number
  tier3: number
  reasons: Record<string, number>
}

function readJobs(k: knex.Knex) {
  return k("background_job")
    .where("kind", "like", `${KIND_PREFIX}%`)
    .orderBy("created_at", "desc")
    .limit(20)
    .select(
      "id",
      "kind",
      "display_name",
      "status",
      "progress_done",
      "progress_total",
      "started_at",
      "finished_at",
      "last_heartbeat",
      "pid",
      "hostname",
      "result_summary",
      "log_tail",
      "triggered_by",
    )
}

function findActive(jobs: any[], kind: string) {
  // First a running job; otherwise most-recent of any status
  const running = jobs.find((j) => j.kind === kind && j.status === "running")
  if (running) return running
  return jobs.find((j) => j.kind === kind) || null
}

function readLogTail(file: string, lines = 80): string[] {
  try {
    if (!fs.existsSync(file)) return []
    const raw = fs.readFileSync(file, "utf-8")
    const all = raw.split("\n")
    return all.slice(Math.max(0, all.length - lines))
  } catch {
    return []
  }
}

function statImageManifest(): ImageManifestStat | null {
  try {
    if (!fs.existsSync(MANIFEST_IMAGES)) return null
    const raw = fs.readFileSync(MANIFEST_IMAGES, "utf-8")
    const lines = raw.split("\n").filter(Boolean)
    const stat: ImageManifestStat = {
      total_lines: lines.length,
      uploaded: 0,
      skipped_non_image: 0,
      missing: 0,
      errors: 0,
      bytes_in_total: 0,
      bytes_out_total: 0,
      had_exif_count: 0,
    }
    for (const line of lines) {
      try {
        const r = JSON.parse(line)
        if (r.status === "uploaded") {
          stat.uploaded++
          if (typeof r.source_size === "number") stat.bytes_in_total += r.source_size
          if (typeof r.new_size === "number") stat.bytes_out_total += r.new_size
          if (r.had_exif) stat.had_exif_count++
        } else if (r.status === "skipped_non_image") {
          stat.skipped_non_image++
        } else if (r.status === "missing") {
          stat.missing++
        } else if (r.status === "error") {
          stat.errors++
        }
      } catch {
        // skip malformed lines silently
      }
    }
    return stat
  } catch {
    return null
  }
}

function statMatchManifest(): MatchManifestStat | null {
  try {
    if (!fs.existsSync(MANIFEST_MATCHES)) return null
    const raw = fs.readFileSync(MANIFEST_MATCHES, "utf-8")
    const lines = raw.split("\n").filter(Boolean)
    const stat: MatchManifestStat = {
      total_rows: lines.length,
      tier1: 0,
      tier2: 0,
      tier3: 0,
      reasons: {},
    }
    for (const line of lines) {
      try {
        const r = JSON.parse(line)
        if (r.tier === 1) stat.tier1++
        else if (r.tier === 2) stat.tier2++
        else if (r.tier === 3) stat.tier3++
        const reason = r.reason || "unknown"
        stat.reasons[reason] = (stat.reasons[reason] || 0) + 1
      } catch {
        // skip
      }
    }
    return stat
  } catch {
    return null
  }
}

function fileMtime(file: string): string | null {
  try {
    if (!fs.existsSync(file)) return null
    return fs.statSync(file).mtime.toISOString()
  } catch {
    return null
  }
}

async function readDbLoad(k: knex.Knex) {
  // System-catalog reads — alle in O(ms), minimaler Disk-IO.
  // pg_stat_activity, pg_stat_database, pg_database_size sind Memory-only Views.
  const out: any = {}

  // 1) DB-Size + cache-hit ratio
  const sizeRow = await k.raw(`
    SELECT
      pg_database_size(current_database())                 AS bytes,
      pg_size_pretty(pg_database_size(current_database())) AS pretty,
      (SELECT setting FROM pg_settings WHERE name='max_connections') AS max_connections
  `)
  out.db_size_bytes = Number(sizeRow.rows[0].bytes)
  out.db_size_pretty = sizeRow.rows[0].pretty
  out.max_connections = Number(sizeRow.rows[0].max_connections)

  const cacheRow = await k.raw(`
    SELECT
      COALESCE(sum(blks_hit), 0)  AS blks_hit,
      COALESCE(sum(blks_read), 0) AS blks_read,
      COALESCE(sum(deadlocks), 0) AS deadlocks,
      COALESCE(sum(xact_commit), 0)   AS xact_commit,
      COALESCE(sum(xact_rollback), 0) AS xact_rollback,
      COALESCE(sum(temp_files), 0) AS temp_files,
      COALESCE(sum(temp_bytes), 0) AS temp_bytes
    FROM pg_stat_database
    WHERE datname = current_database()
  `)
  const cr = cacheRow.rows[0]
  const hits = Number(cr.blks_hit)
  const reads = Number(cr.blks_read)
  const total = hits + reads
  out.blks_hit = hits
  out.blks_read = reads
  out.cache_hit_pct = total > 0 ? +((hits / total) * 100).toFixed(2) : null
  out.deadlocks = Number(cr.deadlocks)
  out.xact_commit = Number(cr.xact_commit)
  out.xact_rollback = Number(cr.xact_rollback)
  out.temp_files = Number(cr.temp_files)
  out.temp_bytes = Number(cr.temp_bytes)

  // 2) Connection breakdown
  const connRow = await k.raw(`
    SELECT
      COALESCE(application_name, '<unknown>') AS app,
      state,
      COUNT(*)::int AS n
    FROM pg_stat_activity
    WHERE datname = current_database()
    GROUP BY 1, 2
    ORDER BY n DESC
    LIMIT 20
  `)
  out.connections = connRow.rows.map((r: any) => ({
    app: r.app,
    state: r.state,
    n: Number(r.n),
  }))
  out.connections_total = out.connections.reduce(
    (s: number, r: any) => s + r.n,
    0,
  )

  // 3) Slow / long-running active queries
  const slowRow = await k.raw(`
    SELECT
      pid,
      COALESCE(application_name, '<unknown>') AS app,
      state,
      wait_event_type,
      wait_event,
      EXTRACT(EPOCH FROM (NOW() - query_start))::int AS sec,
      LEFT(REGEXP_REPLACE(query, '\\s+', ' ', 'g'), 200) AS query
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND state = 'active'
      AND pid <> pg_backend_pid()
      AND query NOT ILIKE '%pg_stat_activity%'
      AND NOW() - query_start > interval '3 seconds'
    ORDER BY query_start ASC
    LIMIT 8
  `)
  out.slow_queries = slowRow.rows.map((r: any) => ({
    pid: Number(r.pid),
    app: r.app,
    state: r.state,
    wait_event_type: r.wait_event_type,
    wait_event: r.wait_event,
    seconds: Number(r.sec),
    query: r.query,
  }))

  // 4) Delta rates from previous snapshot (TX/sec, blks_read/sec, blks_hit/sec).
  // Lets us see whether the DB is currently under load, vs. lifetime counters
  // that just go up forever and are useless for "is it busy right now?".
  const now = Date.now()
  let rates: any = null
  try {
    if (fs.existsSync(DB_SNAPSHOT_FILE)) {
      const prev = JSON.parse(fs.readFileSync(DB_SNAPSHOT_FILE, "utf-8"))
      const dt = (now - prev.ts) / 1000
      if (dt > 1 && dt < 600) {
        rates = {
          interval_sec: Math.round(dt),
          tx_per_sec: Math.max(
            0,
            Math.round(
              ((out.xact_commit + out.xact_rollback) -
                (prev.xact_commit + prev.xact_rollback)) /
                dt,
            ),
          ),
          blks_read_per_sec: Math.max(
            0,
            Math.round((out.blks_read - prev.blks_read) / dt),
          ),
          blks_hit_per_sec: Math.max(
            0,
            Math.round((out.blks_hit - prev.blks_hit) / dt),
          ),
          deadlocks_delta: Math.max(0, out.deadlocks - prev.deadlocks),
          temp_files_delta: Math.max(0, out.temp_files - prev.temp_files),
          temp_bytes_delta: Math.max(0, out.temp_bytes - prev.temp_bytes),
          rollback_delta: Math.max(0, out.xact_rollback - prev.xact_rollback),
        }
      }
    }
  } catch {
    // ignore — rates just stay null, snapshot still gets refreshed
  }
  try {
    fs.writeFileSync(
      DB_SNAPSHOT_FILE,
      JSON.stringify({
        ts: now,
        xact_commit: out.xact_commit,
        xact_rollback: out.xact_rollback,
        blks_read: out.blks_read,
        blks_hit: out.blks_hit,
        deadlocks: out.deadlocks,
        temp_files: out.temp_files,
        temp_bytes: out.temp_bytes,
      }),
    )
  } catch {
    // best-effort; continue
  }
  out.rates = rates

  // 5) Composite health classification — one ampel + reasons.
  // "ok"      = green, all clear
  // "warn"    = yellow, something elevated but not blocking
  // "critical" = red, we're stressing the DB / approaching the wall
  const reasons: string[] = []
  let level: "ok" | "warn" | "critical" = "ok"
  const bump = (l: "warn" | "critical") => {
    if (level === "ok") level = l
    else if (level === "warn" && l === "critical") level = l
  }

  // Cache-hit ratio (lifetime, but very low ratio == disk-pressure right now)
  if (out.cache_hit_pct != null) {
    if (out.cache_hit_pct < 90) {
      reasons.push(`Cache-Hit nur ${out.cache_hit_pct}% (heavy disk reads)`)
      bump("critical")
    } else if (out.cache_hit_pct < 95) {
      reasons.push(`Cache-Hit ${out.cache_hit_pct}% (Disk-Pressure)`)
      bump("warn")
    }
  }

  // Connection saturation
  if (out.connections_total && out.max_connections) {
    const usage = out.connections_total / out.max_connections
    if (usage > 0.85) {
      reasons.push(
        `Connections ${out.connections_total}/${out.max_connections} (${Math.round(
          usage * 100,
        )}% — approaching cap)`,
      )
      bump("critical")
    } else if (usage > 0.65) {
      reasons.push(
        `Connections ${out.connections_total}/${out.max_connections}`,
      )
      bump("warn")
    }
  }

  // Slow queries — count + worst-case duration
  const nSlow = (out.slow_queries || []).length
  const longRunning = (out.slow_queries || []).filter(
    (q: any) => q.seconds > 30,
  )
  const veryLongRunning = (out.slow_queries || []).filter(
    (q: any) => q.seconds > 120,
  )
  if (veryLongRunning.length > 0) {
    reasons.push(
      `${veryLongRunning.length} Queries laufen >2 min (${veryLongRunning
        .map((q: any) => `${q.seconds}s`)
        .join(", ")})`,
    )
    bump("critical")
  } else if (longRunning.length > 0) {
    reasons.push(`${longRunning.length} Queries laufen >30s`)
    bump("warn")
  } else if (nSlow >= 5) {
    reasons.push(`${nSlow} Slow-Queries (≥3s) parallel`)
    bump("warn")
  }

  // Live disk-read rate. Free-tier baseline ~43 Mbps = ~5 MB/s = ~640 blks_read/s
  // (8KB pages). Burst budget tops out around ~2 Gbit/s = 32k blks/s for 30 min/day.
  // We classify generously since we don't know exact tier:
  //   < 200 blks/s: ok
  //   200-1500   : warn
  //   > 1500     : critical (sustained heavy disk-read pressure)
  if (rates && rates.blks_read_per_sec != null) {
    if (rates.blks_read_per_sec > 1500) {
      reasons.push(
        `Disk-Reads ${rates.blks_read_per_sec}/s (~${(
          (rates.blks_read_per_sec * 8) /
          1024
        ).toFixed(1)} MB/s) — Burst-Budget!`,
      )
      bump("critical")
    } else if (rates.blks_read_per_sec > 200) {
      reasons.push(
        `Disk-Reads ${rates.blks_read_per_sec}/s (~${(
          (rates.blks_read_per_sec * 8) /
          1024
        ).toFixed(1)} MB/s)`,
      )
      bump("warn")
    }
  }

  // Deadlocks since previous snapshot — they're rare in healthy systems
  if (rates && rates.deadlocks_delta > 0) {
    reasons.push(
      `${rates.deadlocks_delta} neue Deadlocks in den letzten ${rates.interval_sec}s`,
    )
    bump("critical")
  }

  // Sustained temp-file generation since previous snapshot — query plans
  // spilling to disk because work_mem is too small for the workload.
  if (rates && rates.temp_bytes_delta > 100_000_000) {
    // > 100 MB temp in the last interval
    reasons.push(
      `${(rates.temp_bytes_delta / 1024 / 1024).toFixed(0)} MB Temp-Files in ${
        rates.interval_sec
      }s (Spill-to-Disk)`,
    )
    bump("warn")
  }

  if (reasons.length === 0) reasons.push("alle Indikatoren grün")

  out.health = { level, reasons }

  return out
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
  if (!databaseUrl) {
    res.status(500).json({ error: "DATABASE_URL not configured" })
    return
  }

  const k = knex({
    client: "pg",
    connection: { connectionString: databaseUrl, ssl: { rejectUnauthorized: false } },
  })

  try {
    const jobs = await readJobs(k)
    const p2 = findActive(jobs, KIND_P2)
    const p3 = findActive(jobs, KIND_P3)
    const p4 = findActive(jobs, KIND_P4)

    const imageStats = statImageManifest()
    const matchStats = statMatchManifest()

    // Log: prefer the run-log (p2_run.log) for P2 if present, else the
    // job-log written by JobTracker
    const logP2 = fs.existsSync(LOG_P2_RUN)
      ? readLogTail(LOG_P2_RUN)
      : readLogTail(LOG_P2)
    const logP3 = readLogTail(LOG_P3)

    let dbLoad: any = null
    try {
      dbLoad = await readDbLoad(k)
    } catch (e: any) {
      dbLoad = { error: String(e?.message || e) }
    }

    res.json({
      phases: {
        p2: { kind: KIND_P2, job: p2, log_tail: logP2 },
        p3: { kind: KIND_P3, job: p3, log_tail: logP3 },
        p4: { kind: KIND_P4, job: p4, log_tail: [] },
      },
      manifests: {
        images: imageStats,
        matches: matchStats,
        images_mtime: fileMtime(MANIFEST_IMAGES),
        matches_mtime: fileMtime(MANIFEST_MATCHES),
      },
      history: jobs,
      db_load: dbLoad,
    })
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) })
  } finally {
    await k.destroy()
  }
}
