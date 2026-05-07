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
