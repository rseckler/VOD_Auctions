/**
 * Log-Stream-Helper mit Scrubbing + Rate-Limit (Observability Plan v2 §3.1, §3.3).
 *
 * Primärschutz: Allowlist (in log-sources.ts, nicht hier) + Datenminimierung (100-Zeilen-Cap).
 * Sekundärschutz: Regex-Scrubbing von known-secrets im Output-Stream.
 *
 * SSE pattern:
 *   1. Response-Headers (text/event-stream, CORS, keep-alive)
 *   2. Initial tail -n <lines> → emit line-by-line
 *   3. Follow-mode: tail -F → live-append
 *   4. Cleanup on client-close (child.kill)
 */

import { spawn, ChildProcess } from "node:child_process"
import type { MedusaResponse } from "@medusajs/framework/http"

// ─── Scrubbing ──────────────────────────────────────────────────────────────
// Sekundärschutz. Nicht exhaustiv — Hauptschutz ist Allowlist + Datenminimierung.

const SCRUB_PATTERNS: Array<[RegExp, string]> = [
  // Stripe
  [/sk_live_[a-zA-Z0-9_-]{10,}/g, "***STRIPE_LIVE_KEY***"],
  [/sk_test_[a-zA-Z0-9_-]{10,}/g, "***STRIPE_TEST_KEY***"],
  [/pk_live_[a-zA-Z0-9_-]{10,}/g, "***STRIPE_LIVE_PUBLISHABLE***"],
  [/rk_live_[a-zA-Z0-9_-]{10,}/g, "***STRIPE_LIVE_RESTRICTED***"],
  [/whsec_[a-zA-Z0-9_-]{10,}/g, "***STRIPE_WEBHOOK_SECRET***"],
  // Bearer / Auth / Basic
  [/Bearer\s+[a-zA-Z0-9._~+/=-]{20,}/gi, "Bearer ***MASKED***"],
  [/Basic\s+[a-zA-Z0-9+/=]{20,}/gi, "Basic ***MASKED***"],
  [/Authorization:\s*[^\s]+/gi, "Authorization: ***MASKED***"],
  // JWT
  [/eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, "***JWT***"],
  // Postgres connection strings (user:pass@host)
  [/postgres:\/\/[^:]+:[^@]+@/gi, "postgres://***USER***:***PASS***@"],
  [/postgresql:\/\/[^:]+:[^@]+@/gi, "postgresql://***USER***:***PASS***@"],
  // Generic passwords/api-keys in key=value
  [/password["']?\s*[:=]\s*["']?[^"'\s,}]+/gi, "password=***MASKED***"],
  [/api[_-]?key["']?\s*[:=]\s*["']?[^"'\s,}]+/gi, "api_key=***MASKED***"],
  [/secret["']?\s*[:=]\s*["']?[^"'\s,}]+/gi, "secret=***MASKED***"],
  [/token["']?\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/gi, "token=***MASKED***"],
  // AWS access keys
  [/AKIA[0-9A-Z]{16}/g, "***AWS_ACCESS_KEY***"],
  // Anthropic
  [/sk-ant-[a-zA-Z0-9_-]{20,}/g, "***ANTHROPIC_KEY***"],
]

export function scrubLine(line: string): string {
  let out = line
  for (const [pat, repl] of SCRUB_PATTERNS) {
    out = out.replace(pat, repl)
  }
  return out
}

// ─── Rate-Limit (in-memory, per actor) ──────────────────────────────────────

const MAX_CONCURRENT_STREAMS_PER_ACTOR = 3
const activeStreams = new Map<string, number>()  // actor_id -> count

export function canOpenStream(actorId: string): boolean {
  return (activeStreams.get(actorId) ?? 0) < MAX_CONCURRENT_STREAMS_PER_ACTOR
}

function incrementStream(actorId: string): void {
  activeStreams.set(actorId, (activeStreams.get(actorId) ?? 0) + 1)
}

function decrementStream(actorId: string): void {
  const cur = activeStreams.get(actorId) ?? 0
  if (cur <= 1) activeStreams.delete(actorId)
  else activeStreams.set(actorId, cur - 1)
}

// ─── SSE helper ─────────────────────────────────────────────────────────────

const IDLE_TIMEOUT_MS = 10 * 60 * 1000  // 10min max stream life

function writeSSE(res: MedusaResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

/**
 * Stream a log file via SSE. Initial tail + optional follow.
 * Scrubs every line before emitting.
 */
export async function streamLogFile(
  res: MedusaResponse,
  opts: {
    filePath: string
    actorId: string
    tailLines: number
    follow: boolean
  }
): Promise<void> {
  const { filePath, actorId, tailLines, follow } = opts

  if (!canOpenStream(actorId)) {
    res.status(429).json({ error: `max ${MAX_CONCURRENT_STREAMS_PER_ACTOR} concurrent streams per actor` })
    return
  }

  incrementStream(actorId)

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache, no-transform")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")  // disable nginx buffering
  res.flushHeaders?.()

  const tailArgs = follow
    ? ["-n", String(tailLines), "-F", filePath]
    : ["-n", String(tailLines), filePath]

  let child: ChildProcess | null = null
  try {
    child = spawn("tail", tailArgs, { stdio: ["ignore", "pipe", "pipe"] })
  } catch (e: any) {
    writeSSE(res, "error", { message: `tail spawn failed: ${e?.message}` })
    decrementStream(actorId)
    res.end()
    return
  }

  let idleTimer: NodeJS.Timeout | null = null
  let closed = false

  const cleanup = () => {
    if (closed) return
    closed = true
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
    if (child && !child.killed) {
      try { child.kill("SIGTERM") } catch { /* ignore */ }
    }
    decrementStream(actorId)
    try { res.end() } catch { /* ignore */ }
  }

  // Max lifetime
  idleTimer = setTimeout(() => {
    writeSSE(res, "timeout", { message: "Max stream duration (10min) reached. Reconnect to continue." })
    cleanup()
  }, IDLE_TIMEOUT_MS)

  // Client disconnect
  res.once("close", cleanup)
  res.once("error", cleanup)

  // Emit ready
  writeSSE(res, "ready", { file: filePath.split("/").pop(), tail_lines: tailLines, follow })

  // Buffer partial lines
  let buffer = ""
  child.stdout?.setEncoding("utf8")
  child.stdout?.on("data", (chunk: string) => {
    buffer += chunk
    let idx: number
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const rawLine = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 1)
      const scrubbed = scrubLine(rawLine)
      writeSSE(res, "line", { text: scrubbed, ts: new Date().toISOString() })
    }
  })

  child.stderr?.setEncoding("utf8")
  child.stderr?.on("data", (chunk: string) => {
    writeSSE(res, "stderr", { text: chunk.trim().slice(0, 500) })
  })

  child.on("exit", (code) => {
    writeSSE(res, "exit", { code })
    cleanup()
  })
  child.on("error", (err) => {
    writeSSE(res, "error", { message: err?.message || "child error" })
    cleanup()
  })
}

/**
 * Combined pm2-process log-stream: interleaves stdout + stderr files.
 * Caller passes both paths.
 */
export async function streamPm2Combined(
  res: MedusaResponse,
  opts: {
    outPath: string
    errorPath: string
    actorId: string
    tailLines: number
    follow: boolean
  }
): Promise<void> {
  const { outPath, errorPath, actorId, tailLines, follow } = opts

  if (!canOpenStream(actorId)) {
    res.status(429).json({ error: `max ${MAX_CONCURRENT_STREAMS_PER_ACTOR} concurrent streams per actor` })
    return
  }

  incrementStream(actorId)

  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache, no-transform")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")
  res.flushHeaders?.()

  const args = follow
    ? ["-n", String(tailLines), "-F", outPath, errorPath]
    : ["-n", String(tailLines), outPath, errorPath]
  let child: ChildProcess | null = null
  try {
    child = spawn("tail", args, { stdio: ["ignore", "pipe", "pipe"] })
  } catch (e: any) {
    writeSSE(res, "error", { message: `tail spawn failed: ${e?.message}` })
    decrementStream(actorId)
    res.end()
    return
  }

  let closed = false
  let idleTimer: NodeJS.Timeout | null = null
  const cleanup = () => {
    if (closed) return
    closed = true
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
    if (child && !child.killed) {
      try { child.kill("SIGTERM") } catch { /* ignore */ }
    }
    decrementStream(actorId)
    try { res.end() } catch { /* ignore */ }
  }

  idleTimer = setTimeout(() => {
    writeSSE(res, "timeout", { message: "Max stream duration (10min) reached. Reconnect to continue." })
    cleanup()
  }, IDLE_TIMEOUT_MS)

  res.once("close", cleanup)
  res.once("error", cleanup)

  writeSSE(res, "ready", { out: outPath.split("/").pop(), error: errorPath.split("/").pop(), tail_lines: tailLines, follow })

  let buffer = ""
  let currentSource: "out" | "error" = "out"  // tail prefixes each file's section with "==> path <=="

  child.stdout?.setEncoding("utf8")
  child.stdout?.on("data", (chunk: string) => {
    buffer += chunk
    let idx: number
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const rawLine = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 1)
      // Detect tail's file-section markers
      const headerMatch = /^==> (.+?) <==$/.exec(rawLine)
      if (headerMatch) {
        currentSource = headerMatch[1].includes("error") ? "error" : "out"
        continue
      }
      if (rawLine === "") continue
      const scrubbed = scrubLine(rawLine)
      writeSSE(res, "line", { text: scrubbed, source: currentSource, ts: new Date().toISOString() })
    }
  })

  child.stderr?.setEncoding("utf8")
  child.stderr?.on("data", (chunk: string) => {
    writeSSE(res, "stderr", { text: chunk.trim().slice(0, 500) })
  })

  child.on("exit", (code) => {
    writeSSE(res, "exit", { code })
    cleanup()
  })
  child.on("error", (err) => {
    writeSSE(res, "error", { message: err?.message || "child error" })
    cleanup()
  })
}
