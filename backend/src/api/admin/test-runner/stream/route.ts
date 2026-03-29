import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { runningJobs } from "../route"

/**
 * GET /admin/test-runner/stream?jobId=X
 *
 * Server-Sent Events endpoint — streams live Playwright output lines to the browser.
 * Client receives events like:
 *   data: {"type":"line","text":"  ✓ 01-discovery.spec.ts:13:7 › Password Gate (1.2s)"}
 *   data: {"type":"done","status":"completed","exitCode":0}
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const jobId = req.query.jobId as string
  if (!jobId) {
    res.status(400).json({ message: "jobId required" })
    return
  }

  const job = runningJobs[jobId]
  if (!job) {
    res.status(404).json({ message: "Job not found" })
    return
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no") // disable nginx buffering
  res.flushHeaders()

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  // Send all buffered lines that arrived before client connected
  let sentIndex = 0
  for (const line of job.lines) {
    send({ type: "line", text: line })
    sentIndex++
  }

  // If job already finished, send done and close
  if (job.status !== "running") {
    send({ type: "done", status: job.status, exitCode: job.exitCode })
    res.end()
    return
  }

  // Poll for new lines while job is running
  const interval = setInterval(() => {
    // Send any new lines
    const newLines = job.lines.slice(sentIndex)
    for (const line of newLines) {
      send({ type: "line", text: line })
      sentIndex++
    }

    if (job.status !== "running") {
      send({ type: "done", status: job.status, exitCode: job.exitCode })
      clearInterval(interval)
      res.end()
    }
  }, 300)

  // Clean up on client disconnect
  req.on("close", () => {
    clearInterval(interval)
  })
}
