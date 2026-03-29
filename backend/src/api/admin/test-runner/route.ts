import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exec } from "child_process"
import { readFileSync, existsSync, writeFileSync } from "fs"
import { join } from "path"

const REPORT_PATH = join(
  process.cwd(),
  "..",
  "tests",
  "playwright-report",
  "results.json"
)
const HISTORY_PATH = join(process.cwd(), "..", "tests", "test-history.json")

// GET /admin/test-runner — Return latest Playwright JSON report + history
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

  // Attach running job status if any
  const activeJob = Object.entries(runningJobs).find(
    ([, job]) => job.status === "running"
  )

  res.json({
    report,
    history,
    reportExists: !!report,
    runningJob: activeJob
      ? { jobId: activeJob[0], ...activeJob[1] }
      : null,
  })
}

const runningJobs: Record<
  string,
  { status: string; startTime: string; output: string }
> = {}

// POST /admin/test-runner — Start a new Playwright test run
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  // Prevent concurrent runs
  const alreadyRunning = Object.values(runningJobs).some(
    (j) => j.status === "running"
  )
  if (alreadyRunning) {
    res.status(409).json({ message: "A test run is already in progress." })
    return
  }

  const jobId = Date.now().toString()
  runningJobs[jobId] = {
    status: "running",
    startTime: new Date().toISOString(),
    output: "",
  }

  const projectRoot = join(process.cwd(), "..")
  // Write JSON results to tests/playwright-report/results.json
  const cmd = [
    `cd "${projectRoot}/storefront"`,
    `npx playwright test`,
    `--reporter=json`,
    `--output="${projectRoot}/tests/playwright-report"`,
    `2>&1`,
  ].join(" ")

  exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
    runningJobs[jobId].status = error ? "failed" : "completed"
    runningJobs[jobId].output = stdout.slice(0, 5000) // cap to avoid memory bloat

    // Parse JSON output line and append to history
    try {
      const jsonLine = stdout
        .split("\n")
        .find((l) => l.trimStart().startsWith("{"))
      if (jsonLine) {
        const result = JSON.parse(jsonLine)
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

        writeFileSync(
          HISTORY_PATH,
          JSON.stringify(existing.slice(0, 30), null, 2)
        )
      }
    } catch {
      // Non-fatal: history write failed
    }

    // Clean up old finished jobs (keep last 5)
    const finished = Object.entries(runningJobs).filter(
      ([, j]) => j.status !== "running"
    )
    if (finished.length > 5) {
      finished.slice(5).forEach(([id]) => delete runningJobs[id])
    }
  })

  res.json({ jobId, status: "started" })
}
