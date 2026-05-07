import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as fs from "fs"
import * as path from "path"
import knex from "knex"
import { getScriptsDir } from "../../../../lib/paths"

const SCRIPTS_DIR = getScriptsDir()
const LOG_FILE = path.join(SCRIPTS_DIR, "import_legacy_mails.log")
const STATE_FILE = "/tmp/import_legacy_mails_v3.state.json"
const JSONL_TOTAL_LINES = 422755 // bekannt aus zcat | wc -l auf VPS, statisch

const PIPELINE = "import_legacy_mails_v3"
const SOURCE = "legacy_mail_archive"
const FOLDER = "LEGACY_ARCHIVE"

type State = {
  last_line: number
  pull_run_id: string | null
  started_at: string | null
  counts: {
    inserted: number
    skipped_in_batch_dup: number
    skipped_db_dup: number
    skipped_no_date: number
    skipped_error: number
    batches_processed: number
  }
  updated_at: string
}

function readState(): State | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as State
  } catch {
    return null
  }
}

function readLogTail(lines = 80): string[] {
  try {
    if (!fs.existsSync(LOG_FILE)) return []
    const raw = fs.readFileSync(LOG_FILE, "utf-8")
    const all = raw.split("\n")
    return all.slice(Math.max(0, all.length - lines))
  } catch {
    return []
  }
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
    // 1) Aktueller running pull_run (legacy_mail_archive pipeline)
    const running = await k("crm_pull_run")
      .where({ pipeline: PIPELINE, status: "running" })
      .where("started_at", ">", k.raw("NOW() - INTERVAL '90 minutes'"))
      .orderBy("started_at", "desc")
      .first()

    // 2) Run-Historie (last 20)
    const history = await k("crm_pull_run")
      .where({ pipeline: PIPELINE })
      .orWhere({ source: SOURCE })
      .orderBy("started_at", "desc")
      .limit(20)
      .select(
        "id",
        "source",
        "pipeline",
        "status",
        "started_at",
        "finished_at",
        "rows_inserted",
        "rows_skipped",
        "notes",
      )

    // 3) Total-Stats für LEGACY_ARCHIVE
    const totalsRow = await k("crm_imap_message")
      .where({ folder: FOLDER })
      .select(
        k.raw("COUNT(*) AS total_rows"),
        k.raw("COUNT(*) FILTER (WHERE body_excerpt IS NOT NULL AND length(body_excerpt) > 0) AS with_body"),
        k.raw("COUNT(*) FILTER (WHERE from_email IS NOT NULL AND from_email <> '') AS with_from"),
        k.raw("COUNT(*) FILTER (WHERE subject IS NOT NULL AND subject <> '') AS with_subject"),
        k.raw("COUNT(*) FILTER (WHERE message_id_header LIKE 'synthetic:%') AS synthetic_msgid"),
        k.raw("MIN(date_header) AS oldest_mail"),
        k.raw("MAX(date_header) AS newest_mail"),
      )
      .first()

    // 4) Account-Verteilung
    const accounts = await k("crm_imap_message")
      .where({ folder: FOLDER })
      .groupBy("account")
      .orderBy("rows", "desc")
      .select("account", k.raw("COUNT(*) AS rows"))

    // 5) State-File (Resume-Punkt)
    const state = readState()

    // 6) Log-Tail
    const log_tail = readLogTail(80)

    // 7) JSONL-Total + Progress
    const totalRows = Number(totalsRow?.total_rows ?? 0)
    const lastLine = state?.last_line ?? 0
    const lineProgressPct = JSONL_TOTAL_LINES > 0
      ? Math.round((lastLine / JSONL_TOTAL_LINES) * 1000) / 10
      : 0

    res.json({
      jsonl: {
        total_lines: JSONL_TOTAL_LINES,
        last_line: lastLine,
        progress_pct: lineProgressPct,
      },
      current_run: running ?? null,
      state: state ?? null,
      totals: {
        legacy_archive_rows: totalRows,
        with_body: Number(totalsRow?.with_body ?? 0),
        with_from: Number(totalsRow?.with_from ?? 0),
        with_subject: Number(totalsRow?.with_subject ?? 0),
        synthetic_msgid: Number(totalsRow?.synthetic_msgid ?? 0),
        oldest_mail: totalsRow?.oldest_mail ?? null,
        newest_mail: totalsRow?.newest_mail ?? null,
      },
      accounts,
      history,
      log_tail,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  } finally {
    await k.destroy()
  }
}
