import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as fs from "fs"
import * as path from "path"
import { exec } from "child_process"
import { promisify } from "util"
import { getDataDir, getScriptsDir } from "../../../../lib/paths"

const execAsync = promisify(exec)

const HEALTH_FILE = path.join(getDataDir(), "discogs_sync_health.json")
const PROGRESS_FILE = path.join(getDataDir(), "discogs_daily_progress.json")
const SCRIPTS_DIR = getScriptsDir()

type HealthData = {
  status: string
  message: string | null
  severity: string
  alert: string | null
  chunk_id: number | string | null
  processed: number
  chunk_total: number
  updated: number
  errors: number
  errors_429: number
  errors_other: number
  retries_success: number
  error_rate_percent: number
  rate_limit: number
  price_increased: number
  price_decreased: number
  updated_at: string
}

// GET /admin/sync/discogs-health — Read current sync health status
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  let health: HealthData | null = null
  try {
    if (fs.existsSync(HEALTH_FILE)) {
      const raw = fs.readFileSync(HEALTH_FILE, "utf-8")
      health = JSON.parse(raw)
    }
  } catch {
    // File not found or invalid
  }

  // Build available actions based on health state
  const actions: {
    id: string
    label: string
    description: string
    variant: "default" | "warning" | "danger"
    disabled?: boolean
  }[] = []

  if (health) {
    const isRunning = health.status === "running"

    // Action 1: Reduce rate limit
    if (health.errors_429 > 0 || health.error_rate_percent > 10) {
      const suggestedRate = Math.max(20, Math.floor(health.rate_limit * 0.6))
      actions.push({
        id: "reduce_rate",
        label: `Reduce Rate to ${suggestedRate} req/min`,
        description: `Current rate: ${health.rate_limit} req/min. High 429 error rate suggests Discogs is throttling. Reducing to ${suggestedRate} will be slower but more reliable.`,
        variant: "warning",
        disabled: isRunning,
      })
    }

    // Action 2: Reset progress and restart
    actions.push({
      id: "reset_and_run",
      label: "Reset Progress & Run Now",
      description: "Delete progress file and start today's chunk fresh. Use this if the sync got stuck or corrupted.",
      variant: "danger",
      disabled: isRunning,
    })

    // Action 3: Run specific chunk
    if (!isRunning) {
      actions.push({
        id: "run_chunk",
        label: "Run Today's Chunk Now",
        description: "Start the daily sync for today's chunk immediately (without resetting progress).",
        variant: "default",
      })
    }

    // Action 4: Run with conservative rate
    if (!isRunning) {
      actions.push({
        id: "run_conservative",
        label: "Run Conservative (25 req/min)",
        description: "Run today's chunk with a very conservative rate limit of 25 req/min. Slower but avoids almost all 429 errors.",
        variant: "default",
      })
    }
  } else {
    // No health file — first run or never ran
    actions.push({
      id: "run_chunk",
      label: "Run Discogs Sync Now",
      description: "Start the daily Discogs price sync for today's chunk.",
      variant: "default",
    })
  }

  res.json({ health, actions })
}

// POST /admin/sync/discogs-health — Execute an action
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { action, params } = req.body as {
    action: string
    params?: Record<string, unknown>
  }

  if (!action) {
    res.status(400).json({ error: "Missing action parameter" })
    return
  }

  const pythonBin = path.join(SCRIPTS_DIR, "venv", "bin", "python3")
  const scriptPath = path.join(SCRIPTS_DIR, "discogs_daily_sync.py")
  const logFile = path.join(SCRIPTS_DIR, "discogs_daily.log")

  try {
    switch (action) {
      case "reduce_rate": {
        // Read current health to calculate suggested rate
        let suggestedRate = 25
        try {
          if (fs.existsSync(HEALTH_FILE)) {
            const h = JSON.parse(fs.readFileSync(HEALTH_FILE, "utf-8"))
            suggestedRate = Math.max(20, Math.floor((h.rate_limit || 40) * 0.6))
          }
        } catch { /* use default */ }
        const rate = (params?.rate as number) || suggestedRate

        // Reset progress and run with reduced rate
        try { fs.unlinkSync(PROGRESS_FILE) } catch { /* ok */ }

        const cmd = `cd ${SCRIPTS_DIR} && nohup ${pythonBin} ${scriptPath} --rate ${rate} >> ${logFile} 2>&1 &`
        await execAsync(cmd)

        res.json({
          success: true,
          message: `Sync started with rate limit ${rate} req/min`,
        })
        break
      }

      case "reset_and_run": {
        // Delete progress file
        try { fs.unlinkSync(PROGRESS_FILE) } catch { /* ok */ }

        const cmd = `cd ${SCRIPTS_DIR} && nohup ${pythonBin} ${scriptPath} >> ${logFile} 2>&1 &`
        await execAsync(cmd)

        res.json({
          success: true,
          message: "Progress reset. Sync started for today's chunk.",
        })
        break
      }

      case "run_chunk": {
        const chunk = (params?.chunk as string) || undefined
        const chunkArg = chunk ? `--chunk ${chunk}` : ""

        const cmd = `cd ${SCRIPTS_DIR} && nohup ${pythonBin} ${scriptPath} ${chunkArg} >> ${logFile} 2>&1 &`
        await execAsync(cmd)

        res.json({
          success: true,
          message: `Sync started${chunk ? ` for chunk ${chunk}` : " for today's chunk"}.`,
        })
        break
      }

      case "run_conservative": {
        // Reset + run with 25 req/min
        try { fs.unlinkSync(PROGRESS_FILE) } catch { /* ok */ }

        const cmd = `cd ${SCRIPTS_DIR} && nohup ${pythonBin} ${scriptPath} --rate 25 >> ${logFile} 2>&1 &`
        await execAsync(cmd)

        res.json({
          success: true,
          message: "Sync started with conservative rate (25 req/min).",
        })
        break
      }

      default:
        res.status(400).json({ error: `Unknown action: ${action}` })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
}
