// Shared utilities for Discogs Import SSE routes.
// Session helpers, SSE stream management, heartbeat, cancel/pause checks, event emission.

import type { MedusaResponse } from "@medusajs/framework/http"
import type { Knex } from "knex"

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
  setClauses.push(`last_event_at = NOW()`)
  values.push(id)
  await pg.raw(
    `UPDATE import_session SET ${setClauses.join(", ")} WHERE id = ?`,
    values
  )
}

// ─── SSE stream wrapper ─────────────────────────────────────────────────────

export class SSEStream {
  private res: MedusaResponse
  private pg: Knex
  private sessionId: string
  private heartbeatTimer: NodeJS.Timeout | null = null
  private closed = false

  constructor(res: MedusaResponse, pg: Knex, sessionId: string) {
    this.res = res
    this.pg = pg
    this.sessionId = sessionId

    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.setHeader("X-Accel-Buffering", "no") // disable nginx buffering
    res.flushHeaders()
  }

  /** Emit an SSE event and persist it to import_event table for replay. */
  async emit(phase: string, eventType: string, payload: Record<string, unknown> = {}): Promise<void> {
    if (this.closed) return
    const event = {
      type: eventType,
      phase,
      timestamp: new Date().toISOString(),
      ...payload,
    }
    try {
      this.res.write(`data: ${JSON.stringify(event)}\n\n`)
    } catch {
      // client disconnected
      this.closed = true
      return
    }
    // Persist to event log (fire and forget — don't block progress)
    try {
      await this.pg.raw(
        `INSERT INTO import_event (session_id, phase, event_type, payload) VALUES (?, ?, ?, ?::jsonb)`,
        [this.sessionId, phase, eventType, JSON.stringify(payload)]
      )
    } catch (err) {
      // Don't fail the stream on event persistence errors
      console.error("[import-event] failed to persist:", err)
    }
  }

  /** Start a heartbeat that emits a "heartbeat" event every interval ms.
   *  Important: keeps nginx/proxy connection alive during long operations. */
  startHeartbeat(intervalMs = 5000): void {
    if (this.heartbeatTimer) return
    this.heartbeatTimer = setInterval(() => {
      if (this.closed) return
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

  /** End the stream. */
  end(): void {
    this.stopHeartbeat()
    this.closed = true
    try {
      this.res.end()
    } catch {
      /* already ended */
    }
  }

  /** Error-out the stream with an error event. */
  async error(message: string, details?: Record<string, unknown>): Promise<void> {
    await this.emit("error", "error", { error: message, ...details })
    this.end()
  }

  get isClosed(): boolean {
    return this.closed
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
 *  Returns true if cancelled while waiting, false if resumed normally. */
export async function awaitPauseClearOrCancel(
  pg: Knex,
  sessionId: string,
  stream?: SSEStream
): Promise<boolean> {
  let emittedPausedEvent = false
  while (true) {
    const cancelled = await isCancelRequested(pg, sessionId)
    if (cancelled) return true
    const paused = await isPauseRequested(pg, sessionId)
    if (!paused) return false
    if (stream && !emittedPausedEvent) {
      await stream.emit("control", "paused", { message: "Paused by user — waiting for resume" })
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
