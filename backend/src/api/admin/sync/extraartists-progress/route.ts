import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as fs from "fs"
import * as path from "path"
import { exec } from "child_process"
import { promisify } from "util"
import { getDataDir, getScriptsDir } from "../../../../lib/paths"

const execAsync = promisify(exec)

const PROGRESS_FILE = path.join(getDataDir(), "discogs_extraartists_progress.json")
const SCRIPTS_DIR = getScriptsDir()
const LOG_FILE = path.join(SCRIPTS_DIR, "discogs_extraartists.log")

type ProgressData = {
  processed: number
  updated: number
  skipped: number
  errors: number
  artists_created: number
  links_created: number
  links_deleted: number
  last_release_id: string | null
  started_at: string
  finished_at?: string
}

// GET /admin/sync/extraartists-progress — Read current import progress
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  let progress: ProgressData | null = null
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const raw = fs.readFileSync(PROGRESS_FILE, "utf-8")
      progress = JSON.parse(raw)
    }
  } catch {
    // File not found or invalid
  }

  // Check if the script is currently running
  let isRunning = false
  try {
    const { stdout } = await execAsync("pgrep -f import_discogs_extraartists || true")
    isRunning = stdout.trim().length > 0
  } catch {
    // pgrep not available or error
  }

  // Get last few lines of log
  let recentLog: string[] = []
  try {
    if (fs.existsSync(LOG_FILE)) {
      const { stdout } = await execAsync(`tail -5 ${LOG_FILE}`)
      recentLog = stdout.trim().split("\n").filter(Boolean)
    }
  } catch {
    // Log file not found
  }

  // Total releases with discogs_id (fixed count from the script)
  const totalReleases = 16590

  res.json({
    progress,
    is_running: isRunning,
    total_releases: totalReleases,
    recent_log: recentLog,
  })
}
