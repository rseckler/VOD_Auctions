import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { Knex } from "knex"
import {
  getSession,
  updateSession,
  expandRow,
  isCancelRequested,
  awaitPauseClearOrCancel,
  clearControlFlags,
  pushLastError,
  emitDbEvent,
  acquireLock,
  validateLock,
  releaseLock,
  startHeartbeatLoop,
} from "../../../../lib/discogs-import"

const DISCOGS_BASE = "https://api.discogs.com"
const MAX_REQUESTS_PER_MIN = 40
const CONDITION_KEYS: Record<string, string> = {
  "Mint (M)": "M",
  "Near Mint (NM or M-)": "NM",
  "Very Good Plus (VG+)": "VG+",
  "Very Good (VG)": "VG",
  "Good Plus (G+)": "G+",
  "Good (G)": "G",
  "Fair (F)": "F",
  "Poor (P)": "P",
}

// ─── Rate limiter (shared state) ────────────────────────────────────────────
const callTimestamps: number[] = []

async function rateLimit(pg?: Knex, sessionId?: string): Promise<void> {
  const now = Date.now()
  while (callTimestamps.length && callTimestamps[0] < now - 60000) {
    callTimestamps.shift()
  }
  if (callTimestamps.length >= MAX_REQUESTS_PER_MIN) {
    const waitMs = callTimestamps[0] + 60000 - now + 100
    // M2 fix: emit event for long waits so they show in live-log
    if (waitMs > 2000 && pg && sessionId) {
      await emitDbEvent(pg, sessionId, "fetch", "rate_limit_wait", {
        wait_seconds: Math.round(waitMs / 1000),
        next_request_at: new Date(Date.now() + waitMs).toISOString(),
      })
    }
    await new Promise((r) => setTimeout(r, waitMs))
  }
  callTimestamps.push(Date.now())
}

// ─── POST /admin/discogs-import/fetch ────────────────────────────────────────
//
// DECOUPLED: Validates, acquires session lock, kicks off the fetch loop as a
// DETACHED background task, then returns 200 immediately. Lock handles
// idempotency — concurrent POSTs get already_running=true.

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { session_id } = req.body as { session_id: string }
  if (!session_id) {
    res.status(400).json({ error: "Missing session_id" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const session = await getSession(pgConnection, session_id)
  if (!session) {
    res.status(404).json({ error: "Session not found. Please re-upload." })
    return
  }

  // Phase-precondition (C2)
  if (!["uploaded", "fetched"].includes(session.status) && session.status !== "fetching") {
    res.status(400).json({ error: `Cannot fetch: session is '${session.status}', expected 'uploaded' or 'fetched'` })
    return
  }

  const token = process.env.DISCOGS_TOKEN
  if (!token) {
    res.status(500).json({ error: "DISCOGS_TOKEN not configured in backend .env" })
    return
  }

  // Acquire exclusive lock (C1)
  const ownerId = await acquireLock(pgConnection, session_id, "fetching")
  if (!ownerId) {
    res.json({ ok: true, session_id, already_running: true })
    return
  }

  // Pre-flight DB mutations
  try {
    await updateSession(pgConnection, session_id, { status: "fetching" })
    await emitDbEvent(pgConnection, session_id, "fetch", "start", { session_id })
  } catch (err: unknown) {
    await releaseLock(pgConnection, session_id, ownerId)
    const msg = err instanceof Error ? err.message : "Failed to start fetch"
    res.status(500).json({ error: msg })
    return
  }

  // Return 200 immediately — the loop continues detached below
  res.json({ ok: true, session_id, started: true })

  void runFetchLoop(pgConnection, session_id, session, token, ownerId).catch(async (err) => {
    console.error(`[discogs-import/fetch] Loop crashed for session ${session_id}:`, err)
    try {
      const msg = err instanceof Error ? err.message : "Unknown fetch error"
      if (await validateLock(pgConnection, session_id, ownerId)) {
        await updateSession(pgConnection, session_id, {
          status: "error",
          error_message: msg,
        })
      }
      await emitDbEvent(pgConnection, session_id, "fetch", "error", { error: msg })
    } catch (inner) {
      console.error(`[discogs-import/fetch] Also failed to mark session as error:`, inner)
    }
  })
}

// ─── The fetch loop (runs detached from HTTP) ────────────────────────────────

async function runFetchLoop(
  pg: Knex,
  sessionId: string,
  session: Record<string, unknown>,
  token: string,
  ownerId: string
): Promise<void> {
  let lostOwnership = false
  const stopHeartbeat = startHeartbeatLoop(pg, sessionId, ownerId, 30_000, () => {
    lostOwnership = true
  })

  try {
  const headers = {
    Authorization: `Discogs token=${token}`,
    "User-Agent": "VODAuctions/1.0 +https://vod-auctions.com",
  }

  const compactRows = session.rows as Array<Record<string, unknown>>
  const rows = compactRows.map(expandRow)
  const allDiscogsIds = rows.map((r) => r.discogs_id)

  // Check cache
  const cachedResult = await pg.raw(
    `SELECT discogs_id FROM discogs_api_cache
     WHERE discogs_id = ANY(?) AND expires_at > NOW() AND is_error = false`,
    [allDiscogsIds]
  )
  const cachedIds = new Set(
    (cachedResult.rows || []).map((r: { discogs_id: number }) => r.discogs_id)
  )

  const total = rows.length
  let fetched = 0
  let skippedCached = 0
  let errors = 0
  const startTime = Date.now()

  await emitDbEvent(pg, sessionId, "fetch", "plan", {
    total,
    already_cached: cachedIds.size,
    to_fetch: total - cachedIds.size,
  })

  for (let i = 0; i < total; i++) {
    // Cooperative bail on lost ownership (heartbeat callback)
    if (lostOwnership) {
      await emitDbEvent(pg, sessionId, "fetch", "superseded", {
        message: "Lost ownership — aborting cleanly.", current: i, total,
      })
      return
    }

    // Cancel check
    if (await isCancelRequested(pg, sessionId)) {
      await updateSession(pg, sessionId, {
        status: "fetched",
        fetch_progress: { current: i, total, fetched, cached: skippedCached, errors, cancelled: true },
      })
      await emitDbEvent(pg, sessionId, "fetch", "cancelled", {
        current: i, total, fetched, cached: skippedCached, errors,
      })
      return
    }
    // Pause check (awaits until cleared or cancelled; no stream available here)
    if (await awaitPauseClearOrCancel(pg, sessionId, null)) {
      await updateSession(pg, sessionId, {
        status: "fetched",
        fetch_progress: { current: i, total, fetched, cached: skippedCached, errors, cancelled: true },
      })
      await emitDbEvent(pg, sessionId, "fetch", "cancelled", {
        current: i, total, fetched, cached: skippedCached, errors,
      })
      return
    }

    const did = rows[i].discogs_id

    // Skip if already cached
    if (cachedIds.has(did)) {
      skippedCached++
      if (skippedCached % 50 === 0) {
        await emitDbEvent(pg, sessionId, "fetch", "progress", {
          current: i + 1, total,
          fetched, cached: skippedCached, errors,
          artist: rows[i].artist, title: rows[i].title,
          status: "cached",
        })
      }
      continue
    }

    // Fetch /releases/{id}
    await rateLimit(pg, sessionId)
    try {
      let releaseResp = await fetch(`${DISCOGS_BASE}/releases/${did}`, {
        headers, signal: AbortSignal.timeout(30000),
      })

      if (releaseResp.status === 429) {
        const retryAfter = parseInt(releaseResp.headers.get("Retry-After") || "60", 10)
        await emitDbEvent(pg, sessionId, "fetch", "rate_limited", { wait_s: retryAfter })
        await new Promise((r) => setTimeout(r, retryAfter * 1000))
        await rateLimit(pg, sessionId)
        releaseResp = await fetch(`${DISCOGS_BASE}/releases/${did}`, {
          headers, signal: AbortSignal.timeout(30000),
        })
      }

      if (releaseResp.status === 404) {
        await pg.raw(
          `INSERT INTO discogs_api_cache (discogs_id, api_data, is_error, error_message, fetched_at, expires_at)
           VALUES (?, '{}'::jsonb, true, 'not_found', NOW(), NOW() + INTERVAL '7 days')
           ON CONFLICT (discogs_id) DO UPDATE SET api_data = '{}'::jsonb, is_error = true, error_message = 'not_found', fetched_at = NOW(), expires_at = NOW() + INTERVAL '7 days'`,
          [did]
        )
        errors++
        fetched++
        await pushLastError(pg, sessionId, "fetch", {
          discogs_id: did, kind: "not_found",
          artist: rows[i].artist, title: rows[i].title,
        })
        await emitDbEvent(pg, sessionId, "fetch", "error_detail", {
          discogs_id: did, kind: "not_found",
          artist: rows[i].artist, title: rows[i].title,
        })
        await emitDbEvent(pg, sessionId, "fetch", "progress", {
          current: i + 1, total,
          fetched, cached: skippedCached, errors,
          artist: rows[i].artist, title: rows[i].title,
          status: "not_found",
        })
        continue
      }

      if (!releaseResp.ok) {
        errors++
        await pushLastError(pg, sessionId, "fetch", {
          discogs_id: did, kind: "http_error", status: releaseResp.status,
        })
        await emitDbEvent(pg, sessionId, "fetch", "error_detail", {
          discogs_id: did, kind: "http_error", status: releaseResp.status,
        })
        continue
      }

      const data = await releaseResp.json() as Record<string, unknown>

      const apiData: Record<string, unknown> = {
        title: data.title || "",
        year: data.year || 0,
        country: data.country || "",
        // RSE-320: store anv (artist name variant for this release) and join (separator
        // to next artist) so multi-artist releases can be displayed correctly. Pre-rendered
        // artists_sort comes from Discogs's release header. Pre-rc52.12 caches lack these
        // fields — see scripts/backfill_artist_display_name.py for backfill flow.
        artists_sort: data.artists_sort || "",
        artists: ((data.artists || []) as Array<Record<string, unknown>>).map((a) => ({
          name: a.name || "", id: a.id, anv: a.anv || "", join: a.join || "",
        })),
        extraartists: ((data.extraartists || []) as Array<Record<string, unknown>>).map((a) => ({
          name: a.name || "", id: a.id, role: a.role || "",
        })),
        labels: ((data.labels || []) as Array<Record<string, unknown>>).map((l) => ({
          name: l.name || "", catno: l.catno || "", id: l.id,
        })),
        formats: ((data.formats || []) as Array<Record<string, unknown>>).map((f) => ({
          name: f.name || "", descriptions: f.descriptions || [], qty: f.qty || "1",
        })),
        tracklist: ((data.tracklist || []) as Array<Record<string, unknown>>).map((t) => ({
          position: t.position || "", title: t.title || "", duration: t.duration || "",
        })),
        genres: data.genres || [],
        styles: data.styles || [],
        community: {
          have: ((data.community || {}) as Record<string, unknown>).have || 0,
          want: ((data.community || {}) as Record<string, unknown>).want || 0,
        },
        lowest_price: data.lowest_price ?? null,
        num_for_sale: data.num_for_sale || 0,
        images: ((data.images || []) as Array<Record<string, unknown>>).slice(0, 10).map((img) => ({
          uri: img.uri || "", type: img.type || "",
        })),
        notes: data.notes || "",
        data_quality: data.data_quality || "",
      }

      // Fetch price suggestions
      let suggestedPrices: Record<string, unknown> | null = null
      await rateLimit(pg, sessionId)
      try {
        const psResp = await fetch(`${DISCOGS_BASE}/marketplace/price_suggestions/${did}`, {
          headers, signal: AbortSignal.timeout(30000),
        })
        if (psResp.ok) {
          const psData = await psResp.json() as Record<string, Record<string, unknown>>
          const prices: Record<string, unknown> = {}
          for (const [key, val] of Object.entries(psData)) {
            const short = CONDITION_KEYS[key]
            if (short && val) prices[short] = val.value
          }
          if (Object.keys(prices).length > 0) {
            const firstVal = Object.values(psData)[0] as Record<string, unknown> | undefined
            prices.currency = firstVal?.currency || "EUR"
            suggestedPrices = prices
          }
        }
      } catch {
        // price suggestions failed — continue without them
      }

      await pg.raw(
        `INSERT INTO discogs_api_cache (discogs_id, api_data, suggested_prices, is_error, fetched_at, expires_at)
         VALUES (?, ?::jsonb, ?::jsonb, false, NOW(), NOW() + INTERVAL '30 days')
         ON CONFLICT (discogs_id) DO UPDATE SET api_data = EXCLUDED.api_data, suggested_prices = EXCLUDED.suggested_prices, is_error = false, error_message = NULL, fetched_at = NOW(), expires_at = NOW() + INTERVAL '30 days'`,
        [did, JSON.stringify(apiData), suggestedPrices ? JSON.stringify(suggestedPrices) : null]
      )

      fetched++
    } catch (err) {
      errors++
      await pushLastError(pg, sessionId, "fetch", {
        discogs_id: did, kind: "exception",
        message: err instanceof Error ? err.message : "unknown",
      })
      await emitDbEvent(pg, sessionId, "fetch", "error_detail", {
        discogs_id: did, kind: "exception",
        message: err instanceof Error ? err.message : "unknown",
      })
    }

    await emitDbEvent(pg, sessionId, "fetch", "progress", {
      current: i + 1, total,
      fetched, cached: skippedCached, errors,
      artist: rows[i].artist, title: rows[i].title,
      status: "fetched",
      eta_min: Math.round(((Date.now() - startTime) / Math.max(fetched, 1)) * (total - i - 1) / 60000),
    })

    // Update fetch_progress more frequently now that it's the primary UI source
    // (no SSE real-time anymore — polling every 2s reads this)
    if (fetched % 10 === 0 || (i + 1) % 10 === 0) {
      await updateSession(pg, sessionId, {
        fetch_progress: { current: i + 1, total, fetched, cached: skippedCached, errors },
      })
    }
  }

  // Terminal-Write guard (C3): only write if we still own the lock
  if (await validateLock(pg, sessionId, ownerId)) {
    await updateSession(pg, sessionId, {
      status: "fetched",
      fetch_progress: { current: total, total, fetched, cached: skippedCached, errors },
    })
    await clearControlFlags(pg, sessionId)
  }

  const durationMin = Math.round((Date.now() - startTime) / 60000)
  await emitDbEvent(pg, sessionId, "fetch", "done", {
    fetched, cached: skippedCached, errors, duration_min: durationMin,
  })

  } finally {
    stopHeartbeat()
    if (!lostOwnership) {
      await releaseLock(pg, sessionId, ownerId)
    }
  }
}
