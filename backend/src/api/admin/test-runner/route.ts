import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { spawn } from "child_process"
import { readFileSync, existsSync, writeFileSync } from "fs"
import { join } from "path"

// playwright.config.ts writes JSON to storefront/playwright-report/results.json
const REPORT_PATH = join(
  process.cwd(),
  "..",
  "storefront",
  "playwright-report",
  "results.json"
)
const HISTORY_PATH = join(process.cwd(), "..", "tests", "test-history.json")

type Job = {
  status: "running" | "completed" | "failed"
  startTime: string
  lines: string[]      // live output lines for SSE streaming
  exitCode: number | null
}

const runningJobs: Record<string, Job> = {}

// ─── GET /admin/test-runner ───────────────────────────────────────────────────
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  let report = null
  let history: unknown[] = []

  if (existsSync(REPORT_PATH)) {
    try {
      report = JSON.parse(readFileSync(REPORT_PATH, "utf-8"))
    } catch {
      // malformed JSON — treat as no report
    }
  }

  if (existsSync(HISTORY_PATH)) {
    try {
      history = JSON.parse(readFileSync(HISTORY_PATH, "utf-8"))
    } catch {
      // malformed JSON — treat as empty history
    }
  }

  const activeJob = Object.entries(runningJobs).find(
    ([, job]) => job.status === "running"
  )

  res.json({
    report,
    history,
    reportExists: !!report,
    runningJob: activeJob
      ? { jobId: activeJob[0], status: activeJob[1].status, startTime: activeJob[1].startTime }
      : null,
  })
}

// ─── GET /admin/test-runner/stream?jobId=X (SSE) ─────────────────────────────
// This is handled by a separate route file at stream/route.ts — see below.
// Exported so stream/route.ts can import job state.
export { runningJobs }

// ─── POST /admin/test-runner — Start a test run ───────────────────────────────
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  // Prevent concurrent runs
  const alreadyRunning = Object.values(runningJobs).some(
    (j) => j.status === "running"
  )
  if (alreadyRunning) {
    const existing = Object.entries(runningJobs).find(([, j]) => j.status === "running")
    res.status(409).json({ message: "A test run is already in progress.", jobId: existing?.[0] })
    return
  }

  const jobId = Date.now().toString()
  runningJobs[jobId] = {
    status: "running",
    startTime: new Date().toISOString(),
    lines: [],
    exitCode: null,
  }

  const projectRoot = join(process.cwd(), "..")
  const storefrontDir = join(projectRoot, "storefront")

  // Use spawn so we can stream output line by line
  const child = spawn("npx", ["playwright", "test"], {
    cwd: storefrontDir,
    shell: true,
    env: { ...process.env, FORCE_COLOR: "0" }, // no ANSI codes in output
  })

  const job = runningJobs[jobId]

  const appendLine = (text: string) => {
    const lines = text.split("\n")
    for (const line of lines) {
      const trimmed = line.trimEnd()
      if (trimmed) job.lines.push(trimmed)
    }
    // Cap memory — keep last 1000 lines
    if (job.lines.length > 1000) job.lines = job.lines.slice(-1000)
  }

  child.stdout.on("data", (chunk: Buffer) => appendLine(chunk.toString()))
  child.stderr.on("data", (chunk: Buffer) => appendLine(chunk.toString()))

  child.on("close", (code) => {
    job.exitCode = code
    job.status = code === 0 ? "completed" : "failed"

    // Append to history from JSON report file
    try {
      if (existsSync(REPORT_PATH)) {
        const result = JSON.parse(readFileSync(REPORT_PATH, "utf-8"))
        const passed = result?.stats?.expected ?? 0
        const failed = result?.stats?.unexpected ?? 0
        const skipped = result?.stats?.skipped ?? 0
        const duration = result?.stats?.duration ?? 0

        const existing: unknown[] = existsSync(HISTORY_PATH)
          ? JSON.parse(readFileSync(HISTORY_PATH, "utf-8"))
          : []

        existing.unshift({
          jobId,
          date: new Date().toISOString(),
          passed,
          failed,
          skipped,
          total: passed + failed + skipped,
          duration: Math.round(duration / 1000),
          status: failed > 0 ? "failed" : "passed",
        })

        writeFileSync(HISTORY_PATH, JSON.stringify(existing.slice(0, 30), null, 2))
      }
    } catch {
      // Non-fatal
    }

    // Clean up old finished jobs — keep last 5
    const finished = Object.entries(runningJobs).filter(([, j]) => j.status !== "running")
    if (finished.length > 5) {
      finished.slice(5).forEach(([id]) => delete runningJobs[id])
    }
  })

  res.json({ jobId, status: "started" })
}
