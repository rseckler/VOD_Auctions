// Shared utilities for Discogs Import SSE routes.
// Session helpers, SSE stream management, heartbeat, cancel/pause checks, event emission.
// Session lock API for concurrent-run prevention (rc26).

import type { MedusaResponse } from "@medusajs/framework/http"
import type { Knex } from "knex"
import crypto from "crypto"

// ─── Session helpers ────────────────────────────────────────────────────────

export async function getSession(pg: Knex, id: string) {
  const rows = await pg.raw(`SELECT * FROM import_session WHERE id = ?`, [id])
  return rows.rows?.[0] || null
}

export async function updateSession(
  pg: Knex,
  id: string,
  updates: Record<string, unknown>
): Promise<void> {
  const setClauses: string[] = []
  const values: unknown[] = []
  for (const [key, val] of Object.entries(updates)) {
    setClauses.push(`${key} = ?`)
    values.push(typeof val === "object" && val !== null ? JSON.stringify(val) : val)
  }
  setClauses.push(`updated_at = NOW()`)
  // NOTE: last_event_at is NOT bumped here anymore (rc26 semantic cleanup).
  // Liveness is tracked via session_locks.heartbeat_at.
  // last_event_at is only bumped by SSEStream.emit() and emitDbEvent().
  values.push(id)
  await pg.raw(
    `UPDATE import_session SET ${setClauses.join(", ")} WHERE id = ?`,
    values
  )
}

// ─── SSE stream wrapper ─────────────────────────────────────────────────────

export class SSEStream {
  /**
   * Dual-mode stream: HTTP SSE + DB event log, OR pure DB event log
   * (when `res` is null — "headless mode" for detached background loops).
   *
   * In headless mode:
   * - `emit()` writes only to `import_event` (no HTTP write attempts)
   * - `startHeartbeat()` / `end()` are no-ops
   * - `error()` persists the event but doesn't try to end any response
   *
   * This lets long-running loops (commit, analyze) run as detached tasks
   * without any HTTP request coupling, while keeping the exact same API
   * the loop code expects. Polling on `/session/:id/status` is the UI
   * source of truth.
   *
   * Events are persisted to DB even when HTTP writes fail (client
   * disconnect) — a bug in the old implementation which short-circuited
   * on the first write error and lost all subsequent events.
   */
  private res: MedusaResponse | null
  private pg: Knex
  private sessionId: string
  private heartbeatTimer: NodeJS.Timeout | null = null
  private closed = false

  constructor(res: MedusaResponse | null, pg: Knex, sessionId: string) {
    this.res = res
    this.pg = pg
    this.sessionId = sessionId

    if (res) {
      res.setHeader("Content-Type", "text/event-stream")
      res.setHeader("Cache-Control", "no-cache")
      res.setHeader("Connection", "keep-alive")
      res.setHeader("X-Accel-Buffering", "no") // disable nginx buffering
      res.flushHeaders()
    }
  }

  /** Emit an event — writes to HTTP SSE stream (if alive) AND always to DB.
   *  Headless mode (res=null): DB only. */
  async emit(phase: string, eventType: string, payload: Record<string, unknown> = {}): Promise<void> {
    const event = {
      type: eventType,
      phase,
      timestamp: new Date().toISOString(),
      ...payload,
    }

    // Try HTTP stream write if alive
    if (this.res && !this.closed) {
      try {
        this.res.write(`data: ${JSON.stringify(event)}\n\n`)
      } catch {
        // Client disconnected — continue to DB write below (critical: old
        // code RETURNED here and lost the event to the DB too)
        this.closed = true
      }
    }

    // ALWAYS persist to import_event (primary source of truth for polling)
    try {
      await this.pg.raw(
        `INSERT INTO import_event (session_id, phase, event_type, payload) VALUES (?, ?, ?, ?::jsonb)`,
        [this.sessionId, phase, eventType, JSON.stringify(payload)]
      )
      // Bump last_event_at for stale-detection
      await this.pg.raw(
        `UPDATE import_session SET last_event_at = NOW() WHERE id = ?`,
        [this.sessionId]
      )
    } catch (err) {
      console.error("[import-event] failed to persist:", err)
    }
  }

  /** Heartbeat to keep nginx/proxy connection alive. No-op in headless mode. */
  startHeartbeat(intervalMs = 5000): void {
    if (!this.res) return  // headless mode — no HTTP connection to keep alive
    if (this.heartbeatTimer) return
    this.heartbeatTimer = setInterval(() => {
      if (this.closed || !this.res) return
      try {
        this.res.write(`: heartbeat ${Date.now()}\n\n`)
      } catch {
        this.closed = true
        this.stopHeartbeat()
      }
    }, intervalMs)
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /** End the stream. In headless mode only stops the (non-existent) heartbeat. */
  end(): void {
    this.stopHeartbeat()
    this.closed = true
    if (this.res) {
      try {
        this.res.end()
      } catch {
        /* already ended */
      }
    }
  }

  /** Emit an error event and end. */
  async error(message: string, details?: Record<string, unknown>): Promise<void> {
    await this.emit("error", "error", { error: message, ...details })
    this.end()
  }

  get isClosed(): boolean {
    return this.closed
  }

  get isHeadless(): boolean {
    return this.res === null
  }
}

// ─── Detached event emission (no SSE, just DB) ──────────────────────────────
//
// Background loops that run independent of any HTTP request use this instead
// of SSEStream.emit(). Writes the event to import_event; UI polls for changes
// via /admin/discogs-import/session/:id/status?since_id=X.
//
// Failures are logged but never thrown — a failed event insert must not
// interrupt the main loop.
export async function emitDbEvent(
  pg: Knex,
  sessionId: string,
  phase: string,
  eventType: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  try {
    await pg.raw(
      `INSERT INTO import_event (session_id, phase, event_type, payload) VALUES (?, ?, ?, ?::jsonb)`,
      [sessionId, phase, eventType, JSON.stringify(payload)]
    )
    // Also bump last_event_at on the session so stale-detection knows the
    // loop is alive (without rewriting the whole session row)
    await pg.raw(
      `UPDATE import_session SET last_event_at = NOW() WHERE id = ?`,
      [sessionId]
    )
  } catch (err) {
    console.error("[emitDbEvent] insert failed:", err)
  }
}

// ─── Cancel / Pause checks ──────────────────────────────────────────────────

/** Returns true if cancel_requested is set on the session.
 *  Running routes should check this periodically and abort cleanly. */
export async function isCancelRequested(pg: Knex, sessionId: string): Promise<boolean> {
  const rows = await pg.raw(
    `SELECT cancel_requested FROM import_session WHERE id = ?`,
    [sessionId]
  )
  return rows.rows?.[0]?.cancel_requested === true
}

/** Returns true if pause_requested is set. Running routes poll this and wait
 *  while paused, then resume when flag is cleared. */
export async function isPauseRequested(pg: Knex, sessionId: string): Promise<boolean> {
  const rows = await pg.raw(
    `SELECT pause_requested FROM import_session WHERE id = ?`,
    [sessionId]
  )
  return rows.rows?.[0]?.pause_requested === true
}

/** Await until pause is cleared or cancel is requested.
 *  Returns true if cancelled while waiting, false if resumed normally.
 *  When `stream` is null (background loop), pause notice is emitted via
 *  import_event instead. */
export async function awaitPauseClearOrCancel(
  pg: Knex,
  sessionId: string,
  stream?: SSEStream | null
): Promise<boolean> {
  let emittedPausedEvent = false
  while (true) {
    const cancelled = await isCancelRequested(pg, sessionId)
    if (cancelled) return true
    const paused = await isPauseRequested(pg, sessionId)
    if (!paused) return false
    if (!emittedPausedEvent) {
      if (stream) {
        await stream.emit("control", "paused", { message: "Paused by user — waiting for resume" })
      } else {
        await emitDbEvent(pg, sessionId, "control", "paused", { message: "Paused by user — waiting for resume" })
      }
      emittedPausedEvent = true
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
}

/** Clear cancel/pause flags after a session transitions to a final state. */
export async function clearControlFlags(pg: Knex, sessionId: string): Promise<void> {
  await pg.raw(
    `UPDATE import_session SET cancel_requested = false, pause_requested = false WHERE id = ?`,
    [sessionId]
  )
}

// ─── Session Lock API (rc26) ────────────────────────────────────────────────
//
// Exclusive ownership locks for import loops. One row in session_locks per
// active session — enforced by PRIMARY KEY on session_id.
// See docs/architecture/DISCOGS_IMPORT_SESSION_LOCK_PLAN.md

const LOCK_STALE_THRESHOLD_SEC = 150

export type LockPhase = "fetching" | "analyzing" | "importing"

/**
 * Attempt to acquire an exclusive lock on a session.
 * Returns a unique owner_id on success, or null if another loop holds a
 * fresh lock (heartbeat within STALE_THRESHOLD_SEC).
 *
 * Atomically takes over stale locks (heartbeat older than threshold).
 * This is the ONLY code path that writes owner_id — all other paths
 * validate via owner_id equality.
 */
export async function acquireLock(
  pg: Knex,
  sessionId: string,
  phase: LockPhase,
  staleThresholdSec: number = LOCK_STALE_THRESHOLD_SEC
): Promise<string | null> {
  const ownerId = crypto.randomUUID()
  const result = await pg.raw(
    `INSERT INTO session_locks (session_id, owner_id, phase, acquired_at, heartbeat_at)
     VALUES (?, ?, ?, NOW(), NOW())
     ON CONFLICT (session_id) DO UPDATE
       SET owner_id = EXCLUDED.owner_id,
           phase = EXCLUDED.phase,
           acquired_at = NOW(),
           heartbeat_at = NOW()
       WHERE session_locks.heartbeat_at < NOW() - (? || ' seconds')::interval
     RETURNING owner_id`,
    [sessionId, ownerId, phase, staleThresholdSec.toString()]
  )
  if (result.rows.length === 0) return null // another loop holds fresh lock
  return result.rows[0].owner_id
}

/**
 * Update heartbeat_at. Returns true if we still own the lock, false if we lost it.
 * False means: a different owner took over (stale takeover by competing loop).
 * Throws on DB errors — caller decides whether to retry or bail.
 */
export async function heartbeatLock(
  pg: Knex,
  sessionId: string,
  ownerId: string
): Promise<boolean> {
  const result = await pg.raw(
    `UPDATE session_locks SET heartbeat_at = NOW()
     WHERE session_id = ? AND owner_id = ?`,
    [sessionId, ownerId]
  )
  return (result.rowCount ?? 0) > 0
}

/**
 * Passive check: do we still own the lock?
 * Returns true on DB error (optimistic — don't bail on transient errors).
 * Returns false ONLY if we can prove another owner has it.
 */
export async function validateLock(
  pg: Knex,
  sessionId: string,
  ownerId: string
): Promise<boolean> {
  try {
    const result = await pg.raw(
      `SELECT 1 FROM session_locks WHERE session_id = ? AND owner_id = ? LIMIT 1`,
      [sessionId, ownerId]
    )
    return result.rows.length > 0
  } catch (err) {
    console.error("[validateLock] read failed — assuming still owned:", err)
    return true // optimistic: don't bail on transient DB errors
  }
}

/**
 * Release the lock on clean shutdown.
 * Idempotent — if we no longer own it, does nothing.
 */
export async function releaseLock(
  pg: Knex,
  sessionId: string,
  ownerId: string
): Promise<void> {
  try {
    await pg.raw(
      `DELETE FROM session_locks WHERE session_id = ? AND owner_id = ?`,
      [sessionId, ownerId]
    )
  } catch (err) {
    console.error("[releaseLock] delete failed — will be cleaned up by next acquire:", err)
  }
}

/**
 * Start a heartbeat interval that runs until stopped.
 * Returns a stop function (call it in the finally block).
 * If the heartbeat fails to update (we lost ownership), onLost is called
 * so the loop can bail cleanly.
 */
export function startHeartbeatLoop(
  pg: Knex,
  sessionId: string,
  ownerId: string,
  intervalMs: number = 30_000,
  onLost: () => void
): () => void {
  let stopped = false
  const timer = setInterval(async () => {
    if (stopped) return
    try {
      const stillOwn = await heartbeatLock(pg, sessionId, ownerId)
      if (!stillOwn) {
        stopped = true
        clearInterval(timer)
        onLost()
      }
    } catch (err) {
      // transient error — do not call onLost, will retry next tick
      console.error("[heartbeat] update failed (transient):", err)
    }
  }, intervalMs)
  return () => {
    stopped = true
    clearInterval(timer)
  }
}

// ─── Error detail buffer ────────────────────────────────────────────────────

/** Append an error to last_error buffer (kept as array of last 10 by insertion order).
 *  Read-modify-write in application code — simple and correct, no fancy SQL. */
export async function pushLastError(
  pg: Knex,
  sessionId: string,
  phase: string,
  error: Record<string, unknown>
): Promise<void> {
  const errorEntry = {
    phase,
    timestamp: new Date().toISOString(),
    ...error,
  }
  try {
    const current = await pg.raw(
      `SELECT last_error FROM import_session WHERE id = ?`,
      [sessionId]
    )
    const existing = (current.rows?.[0]?.last_error as Array<Record<string, unknown>> | null) || []
    // Keep last 9 existing + append new = max 10
    const updated = [...existing.slice(-9), errorEntry]
    await pg.raw(
      `UPDATE import_session SET last_error = ?::jsonb, updated_at = NOW(), last_event_at = NOW() WHERE id = ?`,
      [JSON.stringify(updated), sessionId]
    )
  } catch (err) {
    // Never let error-buffer failures crash the caller
    console.error("[pushLastError] failed:", err)
  }
}

// ─── Compact row helpers (shared between upload + consumers) ────────────────

export interface ParsedRow {
  artist: string
  title: string
  catalog_number: string
  label: string
  format: string
  condition: number | null
  year: number | null
  discogs_id: number
  collection_folder?: string
  date_added?: string
  media_condition?: string
  sleeve_condition?: string
  listing_price?: number | null
  status?: string
}

export function compactRow(r: ParsedRow): Record<string, unknown> {
  return {
    a: r.artist,
    t: r.title,
    cn: r.catalog_number,
    l: r.label,
    f: r.format,
    c: r.condition,
    y: r.year,
    d: r.discogs_id,
    ...(r.media_condition ? { mc: r.media_condition } : {}),
    ...(r.sleeve_condition ? { sc: r.sleeve_condition } : {}),
    ...(r.listing_price != null ? { lp: r.listing_price } : {}),
    ...(r.status ? { s: r.status } : {}),
    ...(r.collection_folder ? { cf: r.collection_folder } : {}),
    ...(r.date_added ? { da: r.date_added } : {}),
  }
}

export function expandRow(c: Record<string, unknown>): ParsedRow {
  return {
    artist: (c.a as string) || "",
    title: (c.t as string) || "",
    catalog_number: (c.cn as string) || "",
    label: (c.l as string) || "",
    format: (c.f as string) || "",
    condition: c.c as number | null,
    year: c.y as number | null,
    discogs_id: c.d as number,
    ...(c.mc ? { media_condition: c.mc as string } : {}),
    ...(c.sc ? { sleeve_condition: c.sc as string } : {}),
    ...(c.lp != null ? { listing_price: c.lp as number } : {}),
    ...(c.s ? { status: c.s as string } : {}),
    ...(c.cf ? { collection_folder: c.cf as string } : {}),
    ...(c.da ? { date_added: c.da as string } : {}),
  }
}
