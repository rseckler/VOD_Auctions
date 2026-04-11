import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { Knex } from "knex"
import {
  SSEStream,
  getSession,
  updateSession,
  expandRow,
  isCancelRequested,
  awaitPauseClearOrCancel,
  clearControlFlags,
} from "../../../../lib/discogs-import"

// ─── Types ───────────────────────────────────────────────────────────────────

interface MatchResult {
  artist: string
  title: string
  catalog_number: string
  label: string
  format: string
  year: number | null
  discogs_id: number
  condition: number | null
  db_release_id?: string
  match_score?: number
  skip_reason?: string
  api_data?: Record<string, unknown>
}

// ─── POST /admin/discogs-import/analyze ──────────────────────────────────────
//
// DECOUPLED (rc19): validates + spawns the analyze loop as a detached
// background task, returns 200 immediately. Loop writes phase progress to
// import_event and analyze_progress; UI polls via /session/:id/status.
//
// Idempotent: if session is already in "analyzing" with recent activity
// (< 60s), returns { already_running: true } without spawning a second loop.

const ANALYZE_STALE_THRESHOLD_SEC = 60

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

  // Idempotency
  if (session.status === "analyzing") {
    const lastEvent = session.last_event_at
      ? new Date(session.last_event_at).getTime()
      : 0
    const ageSec = (Date.now() - lastEvent) / 1000
    if (ageSec < ANALYZE_STALE_THRESHOLD_SEC) {
      res.json({ ok: true, session_id, already_running: true })
      return
    }
    console.warn(
      `[discogs-import/analyze] Restarting stale loop for session ${session_id} ` +
      `(last event ${Math.round(ageSec)}s ago)`
    )
  }

  // Return 200 immediately — loop runs detached below
  res.json({ ok: true, session_id, started: true })

  // Headless stream — writes to DB only, no HTTP response
  const stream = new SSEStream(null, pgConnection, session_id)

  // Run the analyze loop as detached background task
  void (async () => {
  try {
    // Reset control flags + set status
    await clearControlFlags(pgConnection, session_id)
    await updateSession(pgConnection, session_id, { status: "analyzing", analyze_progress: null })
    await stream.emit("analyze", "start", { session_id })

    // Set trigram threshold for `%` operator (pre-filter in fuzzy matching)
    await pgConnection.raw(`SET pg_trgm.similarity_threshold = 0.3`)

    const compactRows = session.rows as Array<Record<string, unknown>>
    const rows = compactRows.map(expandRow)
    const allDiscogsIds = rows.map((r) => r.discogs_id)

    // ── Phase 1: Exact discogs_id match ─────────────────────────────────
    await stream.emit("analyze", "phase_start", { phase: "exact_match" })
    const phase1Start = Date.now()

    const exactResult = await pgConnection.raw(
      `SELECT id, discogs_id FROM "Release" WHERE discogs_id = ANY(?)`,
      [allDiscogsIds]
    )
    const exactMap = new Map<number, string>()
    for (const r of exactResult.rows || []) {
      exactMap.set(r.discogs_id, r.id)
    }

    await stream.emit("analyze", "phase_done", {
      phase: "exact_match",
      total: rows.length,
      matched: exactMap.size,
      duration_ms: Date.now() - phase1Start,
    })
    await updateSession(pgConnection, session_id, {
      analyze_progress: { phase: "exact_match", total: rows.length, matched: exactMap.size },
    })

    if (await isCancelRequested(pgConnection, session_id)) {
      await stream.emit("analyze", "cancelled", { at_phase: "exact_match" })
      stream.end()
      return
    }

    // ── Phase 2: API cache load ─────────────────────────────────────────
    await stream.emit("analyze", "phase_start", { phase: "cache_load" })
    const phase2Start = Date.now()

    const cacheResult = await pgConnection.raw(
      `SELECT discogs_id, api_data, suggested_prices, is_error, error_message
       FROM discogs_api_cache WHERE discogs_id = ANY(?)`,
      [allDiscogsIds]
    )
    const cacheMap = new Map<number, { api_data: Record<string, unknown>; suggested_prices: Record<string, unknown> | null; is_error: boolean; error_message: string | null }>()
    for (const r of cacheResult.rows || []) {
      cacheMap.set(r.discogs_id, r)
    }

    await stream.emit("analyze", "phase_done", {
      phase: "cache_load",
      entries: cacheMap.size,
      duration_ms: Date.now() - phase2Start,
    })

    // ── Distribute rows into buckets ────────────────────────────────────
    const existing: MatchResult[] = []
    const linkable: MatchResult[] = []
    const newReleases: MatchResult[] = []
    const skipped: MatchResult[] = []
    const unmatchedRows: Array<{ row: typeof rows[0]; base: MatchResult }> = []

    for (const row of rows) {
      const did = row.discogs_id
      const cached = cacheMap.get(did)
      const apiSummary = cached && !cached.is_error && cached.api_data
        ? { ...cached.api_data, suggested_prices: cached.suggested_prices }
        : undefined

      const base: MatchResult = {
        artist: row.artist,
        title: row.title,
        catalog_number: row.catalog_number,
        label: row.label,
        format: row.format,
        year: row.year,
        discogs_id: did,
        condition: row.condition,
        api_data: apiSummary,
      }

      if (cached?.is_error) {
        skipped.push({ ...base, skip_reason: cached.error_message || "api_error" })
        continue
      }

      if (exactMap.has(did)) {
        existing.push({ ...base, db_release_id: exactMap.get(did), match_score: 100 })
        continue
      }

      unmatchedRows.push({ row, base })
    }

    // ── Phase 3: Fuzzy matching (batched) ───────────────────────────────
    const BATCH_SIZE = 500
    const MIN_SCORE = 0.4
    const validUnmatched = unmatchedRows.filter(({ row }) => {
      return `${row.artist} ${row.title}`.trim().length >= 3
    })
    const totalBatches = Math.ceil(validUnmatched.length / BATCH_SIZE)
    const matchedMap = new Map<number, { db_release_id: string; match_score: number }>()

    await stream.emit("analyze", "phase_start", {
      phase: "fuzzy_match",
      total_rows: validUnmatched.length,
      total_batches: totalBatches,
    })
    const phase3Start = Date.now()

    for (let batchStart = 0, batchIdx = 0; batchStart < validUnmatched.length; batchStart += BATCH_SIZE, batchIdx++) {
      // Cancel check between batches
      if (await isCancelRequested(pgConnection, session_id)) {
        await stream.emit("analyze", "cancelled", { at_phase: "fuzzy_match", batch: batchIdx })
        stream.end()
        return
      }
      // Pause check between batches
      if (await awaitPauseClearOrCancel(pgConnection, session_id, stream)) {
        await stream.emit("analyze", "cancelled", { at_phase: "fuzzy_match", batch: batchIdx })
        stream.end()
        return
      }

      const batch = validUnmatched.slice(batchStart, batchStart + BATCH_SIZE)
      const valuesParts: string[] = []
      const params: unknown[] = []
      batch.forEach(({ row }, i) => {
        const title = row.title || ""
        const fullStr = `${row.artist} ${row.title}`.trim()
        valuesParts.push(`(?::int, ?::text, ?::text, ?::int)`)
        params.push(batchStart + i, title, fullStr, row.discogs_id)
      })

      try {
        const batchResult = await pgConnection.raw(
          `WITH q(idx, search_title, search_full, did) AS (VALUES ${valuesParts.join(",")})
           SELECT q.idx, q.did, m.id as match_id, m.score
           FROM q
           LEFT JOIN LATERAL (
             SELECT r.id,
                    similarity(lower(COALESCE(a.name, '') || ' ' || r.title), lower(q.search_full)) as score
             FROM "Release" r
             LEFT JOIN "Artist" a ON r."artistId" = a.id
             WHERE r.discogs_id IS NULL
               AND lower(r.title) % lower(q.search_title)
             ORDER BY similarity(lower(COALESCE(a.name, '') || ' ' || r.title), lower(q.search_full)) DESC
             LIMIT 1
           ) m ON m.score >= ?`,
          [...params, MIN_SCORE]
        )

        for (const m of batchResult.rows || []) {
          if (m.match_id && m.score != null) {
            matchedMap.set(m.did, {
              db_release_id: m.match_id,
              match_score: Math.round(Number(m.score) * 100),
            })
          }
        }
      } catch (err) {
        console.error(`[discogs-analyze] Batch fuzzy match failed (batch ${batchIdx}):`, err)
        await stream.emit("analyze", "batch_error", {
          batch: batchIdx,
          error: err instanceof Error ? err.message : "unknown",
        })
      }

      // Emit progress after each batch
      const rowsProcessed = Math.min(batchStart + BATCH_SIZE, validUnmatched.length)
      await stream.emit("analyze", "phase_progress", {
        phase: "fuzzy_match",
        batch: batchIdx + 1,
        total_batches: totalBatches,
        rows_processed: rowsProcessed,
        total_rows: validUnmatched.length,
        matches_so_far: matchedMap.size,
      })
      await updateSession(pgConnection, session_id, {
        analyze_progress: {
          phase: "fuzzy_match",
          batch: batchIdx + 1,
          total_batches: totalBatches,
          rows_processed: rowsProcessed,
          total_rows: validUnmatched.length,
          matches_so_far: matchedMap.size,
        },
      })
    }

    await stream.emit("analyze", "phase_done", {
      phase: "fuzzy_match",
      total_matches: matchedMap.size,
      duration_ms: Date.now() - phase3Start,
    })

    // Distribute into linkable / new
    for (const { row, base } of unmatchedRows) {
      const searchString = `${row.artist} ${row.title}`.trim()
      if (searchString.length < 3) {
        newReleases.push(base)
        continue
      }
      const match = matchedMap.get(row.discogs_id)
      if (match) {
        linkable.push({ ...base, db_release_id: match.db_release_id, match_score: match.match_score })
      } else {
        newReleases.push(base)
      }
    }

    // ── Phase 4: Aggregating ────────────────────────────────────────────
    await stream.emit("analyze", "phase_start", { phase: "aggregating" })
    const analysisResult = {
      summary: {
        total: rows.length,
        existing: existing.length,
        linkable: linkable.length,
        new: newReleases.length,
        skipped: skipped.length,
      },
      existing,
      linkable,
      new: newReleases,
      skipped,
    }

    await updateSession(pgConnection, session_id, {
      status: "analyzed",
      analysis_result: analysisResult,
      analyze_progress: { phase: "done", ...analysisResult.summary },
    })

    await stream.emit("analyze", "phase_done", {
      phase: "aggregating",
      summary: analysisResult.summary,
    })
    await stream.emit("analyze", "done", {
      summary: analysisResult.summary,
      existing: existing,
      linkable: linkable,
      new: newReleases,
      skipped: skipped,
    })
    stream.end()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Analysis failed"
    try {
      await updateSession(pgConnection, session_id, {
        status: "fetched",
        error_message: msg,
      })
    } catch { /* best effort */ }
    if (!stream.isClosed) {
      await stream.error(msg)
    }
  }
  })().catch((err) => {
    console.error(`[discogs-import/analyze] Detached loop crashed for session ${session_id}:`, err)
  })
}
