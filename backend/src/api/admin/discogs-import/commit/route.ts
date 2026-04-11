import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import * as crypto from "crypto"
import {
  SSEStream,
  getSession,
  updateSession,
  expandRow,
  type ParsedRow,
  isCancelRequested,
  awaitPauseClearOrCancel,
  clearControlFlags,
  pushLastError,
} from "../../../../lib/discogs-import"

// ─── POST /admin/discogs-import/commit ───────────────────────────────────────
// SSE Stream with phase-based progress:
//   preparing → validating → existing_updates → linkable_updates → new_inserts → done
//
// Architecture (v5.1):
//
// (1) Pre-commit validation: Before any DB writes, check for missing API data,
//     duplicate slugs, existing release IDs. Bad data is rejected early without
//     opening any transaction — faster fail + clearer errors.
//
// (2) Per-batch transactions: Each phase is split into batches (BATCH_SIZE=500).
//     Each batch runs in its own transaction. A failing batch is rolled back to
//     savepoint-level only — the rest of the commit continues. Committed batches
//     persist immediately, so a server crash / cancel loses at most 500 rows
//     instead of all 5000.
//
// (3) Resume support: commit_progress tracks which batch indices of each phase
//     are committed. On resume, those batches are skipped. Combined with
//     persisted import_settings (including selected_ids), resumption is
//     automatic — no manual re-click needed.
//
// Trade-off vs. old all-or-nothing behavior: If the commit fails mid-way,
// partial data is left in the DB. The session's commit_progress shows exactly
// which batches succeeded. User can resume to finish or manually roll back.

const BATCH_SIZE = 500

type Counters = {
  inserted: number
  linked: number
  updated: number
  skipped: number
  errors: number
}

// Stale-threshold: session in "importing" with last_event_at older than this
// is treated as a dead loop → the next POST restarts it (Idempotency-check
// still accepts the request, stale loop data + completed_batches is reused).
//
// 180s (not 60s) because a single new_inserts batch (500 rows × ensureArtist
// + ensureLabel + INSERT Release + tracks + images) can legitimately take
// 90-120s on cold caches. With the in-batch heartbeats added in rc25, this
// threshold is effectively a safety net for truly dead processes (pm2
// restart, OOM kill, node crash), not normal slow batches.
const COMMIT_STALE_THRESHOLD_SEC = 180

// ─── CAS helper: session ownership ────────────────────────────────────────────
// A commit loop writes its runToken into commit_progress.run_token at start.
// Any later loop (auto-restart, manual retry) overwrites with a new token.
// Before each batch commit + terminal status write, a loop checks whether the
// session still has its token. If not, another loop has taken ownership —
// this loop must abort cleanly without stomping on the new owner's state.
async function isSupersededBy(
  pg: Knex,
  sessionId: string,
  myToken: string
): Promise<boolean> {
  try {
    const res = await pg.raw(
      `SELECT commit_progress->>'run_token' AS token FROM import_session WHERE id = ?`,
      [sessionId]
    )
    const currentToken = res.rows?.[0]?.token as string | undefined | null
    return !!currentToken && currentToken !== myToken
  } catch (err) {
    // If we can't read session state, bail out conservatively (assume
    // superseded) — a legitimate loop would have a valid connection.
    console.error("[isSupersededBy] read failed:", err)
    return true
  }
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const body = req.body as {
    session_id: string
    selected_discogs_ids?: number[]
    media_condition?: string
    sleeve_condition?: string
    inventory?: number
    price_markup?: number
  }
  const { session_id } = body

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

  // Idempotency: if already importing with recent activity, return early
  if (session.status === "importing") {
    const lastEvent = session.last_event_at
      ? new Date(session.last_event_at).getTime()
      : 0
    const ageSec = (Date.now() - lastEvent) / 1000
    if (ageSec < COMMIT_STALE_THRESHOLD_SEC) {
      res.json({ ok: true, session_id, already_running: true })
      return
    }
    console.warn(
      `[discogs-import/commit] Restarting stale loop for session ${session_id} ` +
      `(last event ${Math.round(ageSec)}s ago) — completed_batches will be reused`
    )
  }

  // ── Resolve settings: body values take precedence, else fall back to
  // session.import_settings (set by the INITIAL commit call). This enables
  // auto-restart scenarios where the UI only knows the session_id but the
  // user's original condition/markup/selection choices are persisted in DB.
  const persistedSettings = (session.import_settings || {}) as {
    media_condition?: string
    sleeve_condition?: string
    inventory?: number
    price_markup?: number
    selected_discogs_ids?: number[] | null
  }

  const media_condition = body.media_condition ?? persistedSettings.media_condition ?? "VG+"
  const sleeve_condition = body.sleeve_condition ?? persistedSettings.sleeve_condition ?? "VG+"
  const inventory = body.inventory ?? persistedSettings.inventory ?? 1
  const price_markup = body.price_markup ?? persistedSettings.price_markup ?? 1.2
  const selected_discogs_ids = body.selected_discogs_ids ?? persistedSettings.selected_discogs_ids ?? undefined

  // Return 200 immediately — loop runs detached below
  res.json({ ok: true, session_id, started: true })

  // Headless stream — writes to import_event table only, no HTTP response.
  // The existing loop code below is unchanged and continues to call
  // stream.emit() / stream.error() as before; the stream just routes all
  // events to DB instead of an HTTP response.
  const stream = new SSEStream(null, pgConnection, session_id)

  // Run the commit loop as detached background task
  //
  // runToken + preservedBatchesAtStart are hoisted outside the inner try/
  // catch so the catch handler can reference them for CAS checks. They get
  // their real values inside Step 1 below — before any work that could
  // throw, so the catch handler sees consistent state.
  let runToken = ""
  let preservedBatchesAtStart: Record<string, unknown> = {}
  let preservedRunIdAtStart: string | undefined = undefined

  void (async () => {
  try {
    await clearControlFlags(pgConnection, session_id)

    // ── Step 1: Persist selected_ids + settings BEFORE any work starts ──
    // This enables true importing-resume: if commit is interrupted, the
    // frontend can restore all user choices via GET /session/:id/status.
    const persistedSettingsUpdate = {
      media_condition,
      sleeve_condition,
      inventory,
      price_markup,
      selected_discogs_ids: selected_discogs_ids || null,
    }

    // ── Preserve prior progress + claim ownership via run_token ──────────
    // When a prior run was interrupted (pm2 restart, OOM, auto-restart),
    // its completed_batches_* + run_id must survive into the new run so
    // processInBatches() can skip already-committed batches.
    //
    // At the same time, we claim ownership by writing a fresh runToken.
    // Any still-alive prior loop will detect the token mismatch at its
    // next batch-commit checkpoint and abort cleanly instead of double-
    // writing data.
    const startProgress = (session.commit_progress as Record<string, unknown>) || {}
    for (const [k, v] of Object.entries(startProgress)) {
      if (k.startsWith("completed_batches_")) preservedBatchesAtStart[k] = v
    }
    preservedRunIdAtStart = startProgress.run_id as string | undefined
    runToken = crypto.randomUUID()

    await updateSession(pgConnection, session_id, {
      status: "importing",
      commit_progress: {
        phase: "preparing",
        run_token: runToken,
        ...(preservedRunIdAtStart ? { run_id: preservedRunIdAtStart } : {}),
        ...preservedBatchesAtStart,
      },
      import_settings: persistedSettingsUpdate,
    })
    await stream.emit("commit", "start", { session_id, run_token: runToken })

    // ── Ensure import_log table (cheap, runs once) ──
    await pgConnection.raw(`
      CREATE TABLE IF NOT EXISTS import_log (
        id TEXT PRIMARY KEY,
        import_type TEXT NOT NULL,
        collection_name TEXT,
        import_source TEXT NOT NULL,
        run_id TEXT NOT NULL,
        release_id TEXT,
        discogs_id INTEGER,
        action TEXT NOT NULL,
        data_snapshot JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await pgConnection.raw(`CREATE INDEX IF NOT EXISTS idx_import_log_run ON import_log(run_id)`)
    await pgConnection.raw(`CREATE INDEX IF NOT EXISTS idx_import_log_release ON import_log(release_id)`)
    await pgConnection.raw(`CREATE INDEX IF NOT EXISTS idx_import_log_collection ON import_log(collection_name)`)

    // ── Load analysis result from session ──
    const analysis = session.analysis_result as {
      existing: Array<{ discogs_id: number; db_release_id?: string }>
      linkable: Array<{ discogs_id: number; db_release_id?: string }>
      new: Array<{ discogs_id: number }>
    } | null

    if (!analysis) {
      await stream.error("No analysis result found. Please run analysis first.")
      return
    }

    const existingMap = new Map<number, string>()
    for (const r of analysis.existing || []) {
      if (r.db_release_id) existingMap.set(r.discogs_id, r.db_release_id)
    }
    const linkableMap = new Map<number, string>()
    for (const r of analysis.linkable || []) {
      if (r.db_release_id) linkableMap.set(r.discogs_id, r.db_release_id)
    }
    const newSet = new Set((analysis.new || []).map((r) => r.discogs_id))

    // ── Load API cache from DB ──
    const compactRows = session.rows as Array<Record<string, unknown>>
    const rows = compactRows.map(expandRow)
    const allDiscogsIds = rows.map((r) => r.discogs_id)

    const cacheResult = await pgConnection.raw(
      `SELECT discogs_id, api_data, suggested_prices FROM discogs_api_cache
       WHERE discogs_id = ANY(?) AND is_error = false`,
      [allDiscogsIds]
    )
    const cacheMap = new Map<number, { api_data: Record<string, unknown>; suggested_prices: Record<string, unknown> | null }>()
    for (const r of cacheResult.rows || []) {
      cacheMap.set(r.discogs_id, r)
    }

    // Counters shared across phases (mutated in closures by processInBatches)
    const counters: Counters = { inserted: 0, linked: 0, updated: 0, skipped: 0, errors: 0 }

    // Filter by selection
    const selectedSet = selected_discogs_ids ? new Set(selected_discogs_ids) : null

    // Partition rows by action type (deterministic order = stable resume)
    const existingRows: ParsedRow[] = []
    const linkableRows: ParsedRow[] = []
    const newRows: ParsedRow[] = []

    for (const row of rows.slice().sort((a, b) => a.discogs_id - b.discogs_id)) {
      const did = row.discogs_id
      if (selectedSet && !selectedSet.has(did)) {
        counters.skipped++
        continue
      }
      if (existingMap.has(did)) existingRows.push(row)
      else if (linkableMap.has(did)) linkableRows.push(row)
      else if (newSet.has(did)) newRows.push(row)
      else counters.skipped++
    }

    await stream.emit("commit", "phase_done", {
      phase: "preparing",
      plan: {
        existing: existingRows.length,
        linkable: linkableRows.length,
        new: newRows.length,
        skipped: counters.skipped,
      },
    })

    // ── Step 2: Pre-commit validation ────────────────────────────────────
    // Check for problems BEFORE opening any transaction. Fail fast with
    // detailed error events so the user can fix their data and retry.
    await stream.emit("commit", "phase_start", { phase: "validating" })

    const validationErrors: Array<{ kind: string; details: string }> = []

    // V1: all new rows must have cached API data (can't build full insert without it)
    for (const row of newRows) {
      if (!cacheMap.has(row.discogs_id)) {
        validationErrors.push({
          kind: "missing_api_data",
          details: `discogs:${row.discogs_id} (${row.artist} — ${row.title})`,
        })
      }
    }

    // V2: duplicate release slugs in new set would cause Release.slug unique
    // constraint violations. Detect them before we start inserting.
    //
    // NOTE: New imports use `{artist}-{title}-{discogs_id}` as the slug, so
    // different pressings of the same title (e.g. 3 pressings of Depeche Mode
    // "Leave In Silence") stay distinct by discogs_id. This check remains as
    // a safety net in case the slug generator is ever simplified.
    const slugMap = new Map<string, number[]>()
    for (const row of newRows) {
      const slug = buildImportSlug(row.artist, row.title, row.discogs_id)
      if (!slug) continue
      if (!slugMap.has(slug)) slugMap.set(slug, [])
      slugMap.get(slug)!.push(row.discogs_id)
    }
    for (const [slug, ids] of slugMap.entries()) {
      if (ids.length > 1) {
        validationErrors.push({
          kind: "duplicate_slug",
          details: `slug="${slug}" used by ${ids.length} releases: ${ids.slice(0, 3).join(", ")}${ids.length > 3 ? "…" : ""}`,
        })
      }
    }

    // V3: new release IDs that already exist in DB (means the analyze-step
    // misclassified them as "new" — they should have been "existing").
    //
    // Resume-aware: on a resume run, IDs from already-committed new_inserts
    // batches MUST be in the DB (that's the whole point of resume). We
    // compute which IDs they are by replaying the deterministic batch-slice
    // logic — `newRows` is sorted by discogs_id ascending, so batch-index →
    // row-slice mapping is stable across runs with identical BATCH_SIZE.
    if (newRows.length > 0) {
      const alreadyCommittedNewIds = new Set<string>()
      const completedNewBatches = preservedBatchesAtStart.completed_batches_new_inserts
      if (Array.isArray(completedNewBatches)) {
        for (const batchIdx of completedNewBatches) {
          if (typeof batchIdx !== "number") continue
          const slice = newRows.slice(batchIdx * BATCH_SIZE, (batchIdx + 1) * BATCH_SIZE)
          for (const row of slice) {
            alreadyCommittedNewIds.add(`discogs-release-${row.discogs_id}`)
          }
        }
      }
      const newIdsToCheck = newRows
        .map((r) => `discogs-release-${r.discogs_id}`)
        .filter((id) => !alreadyCommittedNewIds.has(id))
      if (newIdsToCheck.length > 0) {
        const existsResult = await pgConnection.raw(
          `SELECT id FROM "Release" WHERE id = ANY(?)`,
          [newIdsToCheck]
        )
        for (const r of existsResult.rows || []) {
          validationErrors.push({
            kind: "id_already_exists",
            details: String(r.id),
          })
        }
      }
    }

    await stream.emit("commit", "phase_done", {
      phase: "validating",
      errors: validationErrors.length,
      error_details: validationErrors.slice(0, 10),
    })

    if (validationErrors.length > 0) {
      const errorMsg = `Pre-commit validation failed: ${validationErrors.length} error(s). First few: ${validationErrors.slice(0, 3).map(e => e.details).join("; ")}`
      // CAS: only touch session state if we still own it. Otherwise another
      // loop has taken ownership and is (likely) successfully committing —
      // stomping on its state would corrupt the UI view.
      if (!(await isSupersededBy(pgConnection, session_id, runToken))) {
        await updateSession(pgConnection, session_id, {
          status: "analyzed",
          error_message: errorMsg,
          commit_progress: {
            phase: "validation_failed",
            run_token: runToken,
            ...(preservedRunIdAtStart ? { run_id: preservedRunIdAtStart } : {}),
            ...preservedBatchesAtStart,
            errors: validationErrors.slice(0, 20),
            total_errors: validationErrors.length,
          },
        })
        await clearControlFlags(pgConnection, session_id)
        await stream.emit("commit", "validation_failed", {
          errors: validationErrors.slice(0, 20),
          total_errors: validationErrors.length,
          message: errorMsg,
        })
      } else {
        await stream.emit("commit", "superseded", {
          phase: "validating",
          message: "Another loop took ownership during validation — aborting silently without stomping on its state.",
        })
      }
      stream.end()
      return
    }

    // ── Step 3: Setup for batched processing ─────────────────────────────
    const runId = crypto.randomUUID()
    const now = new Date().toISOString()

    // Load previously-committed batch indices (for resume across restarts)
    const freshSession = await getSession(pgConnection, session_id)
    const prevProgress = (freshSession?.commit_progress as Record<string, unknown>) || {}
    const prevRunId = (prevProgress.run_id as string | undefined) || runId
    const effectiveRunId = (prevProgress.phase as string) && (prevProgress.phase as string) !== "preparing"
      ? prevRunId
      : runId

    // Helper: run a partition in batches, each batch in its own transaction.
    // On failure of a batch: rollback, log, continue with next batch.
    // On cancel between batches: stop cleanly with "cancelled" event.
    // On CAS mismatch (another loop took ownership): rollback current batch,
    // emit "superseded", return with superseded=true so caller skips
    // finalizeCancel and the owning loop's state is preserved.
    async function processInBatches(
      phase: string,
      partition: ParsedRow[],
      processRow: (trx: Knex.Transaction, row: ParsedRow) => Promise<void>,
      onRowSuccess: () => void
    ): Promise<{ cancelled: boolean; superseded?: boolean }> {
      const totalBatches = Math.ceil(partition.length / BATCH_SIZE)

      if (totalBatches === 0) {
        await stream.emit("commit", "phase_start", { phase, total: 0, total_batches: 0 })
        await stream.emit("commit", "phase_done", { phase, committed_batches: 0, failed_batches: 0, total_batches: 0 })
        return { cancelled: false }
      }

      // Load already-committed batch indices for this phase (resume support)
      const freshState = await getSession(pgConnection, session_id)
      const progressKey = `completed_batches_${phase}`
      const progressData = (freshState?.commit_progress as Record<string, unknown>) || {}
      const alreadyDone = new Set<number>(
        ((progressData[progressKey] as number[]) || []).filter((n) => typeof n === "number")
      )
      const completed: number[] = Array.from(alreadyDone).sort((a, b) => a - b)
      let failedBatches = 0

      await stream.emit("commit", "phase_start", {
        phase,
        total: partition.length,
        total_batches: totalBatches,
        already_committed_batches: alreadyDone.size,
      })

      for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
        if (alreadyDone.has(batchIdx)) {
          // Resume: skip batches we already committed in a previous run
          continue
        }

        // Cancel check between batches
        if (await isCancelRequested(pgConnection, session_id)) {
          await stream.emit("commit", "cancelled", {
            phase,
            at_batch: batchIdx + 1,
            total_batches: totalBatches,
            committed_batches: completed.length,
          })
          return { cancelled: true }
        }
        if (await awaitPauseClearOrCancel(pgConnection, session_id, stream)) {
          await stream.emit("commit", "cancelled", {
            phase,
            at_batch: batchIdx + 1,
            total_batches: totalBatches,
            committed_batches: completed.length,
          })
          return { cancelled: true }
        }

        // CAS check BEFORE opening a transaction — if another loop has
        // already taken ownership, don't even start processing rows.
        if (await isSupersededBy(pgConnection, session_id, runToken)) {
          await stream.emit("commit", "superseded", {
            phase,
            at_batch: batchIdx + 1,
            total_batches: totalBatches,
            committed_batches: completed.length,
            message: "Another loop took ownership — aborting this run cleanly.",
          })
          return { cancelled: true, superseded: true }
        }

        const batch = partition.slice(batchIdx * BATCH_SIZE, (batchIdx + 1) * BATCH_SIZE)
        const batchTrx = await pgConnection.transaction()

        try {
          // In-batch heartbeat: update last_event_at every HEARTBEAT_EVERY
          // rows so stale-detection stays dormant during long batches (a
          // 500-row new_inserts batch with cold-cache artist/label ensures
          // can legitimately take 90-120s). The heartbeat write uses
          // pgConnection (not batchTrx) so it's visible immediately —
          // otherwise it would only land if the batch commits.
          //
          // Row-progress events (every PROGRESS_EVERY rows) also bump
          // last_event_at via stream.emit() and give the live-log useful
          // intra-batch visibility.
          const HEARTBEAT_EVERY = 25
          const PROGRESS_EVERY = 100
          let rowsSinceHeartbeat = 0
          let rowsSinceProgress = 0

          for (let i = 0; i < batch.length; i++) {
            const row = batch[i]
            await processRow(batchTrx, row)
            rowsSinceHeartbeat++
            rowsSinceProgress++

            if (rowsSinceProgress >= PROGRESS_EVERY) {
              await stream.emit("commit", "row_progress", {
                phase,
                batch: batchIdx + 1,
                total_batches: totalBatches,
                row_in_batch: i + 1,
                batch_size: batch.length,
                current: batchIdx * BATCH_SIZE + i + 1,
                total: partition.length,
              })
              rowsSinceProgress = 0
              rowsSinceHeartbeat = 0 // emit() also bumped last_event_at
            } else if (rowsSinceHeartbeat >= HEARTBEAT_EVERY) {
              try {
                await pgConnection.raw(
                  `UPDATE import_session SET last_event_at = NOW() WHERE id = ?`,
                  [session_id]
                )
              } catch { /* best-effort — real heartbeat will come via next emit */ }
              rowsSinceHeartbeat = 0
            }
          }

          // CAS check BEFORE committing the transaction. If another loop
          // took ownership mid-batch, roll back all row work (including
          // side-effect inserts into Artist/Label/Track) so the new owner
          // sees a clean DB state. The lost work is recovered by the new
          // owner when it re-runs this same phase.
          if (await isSupersededBy(pgConnection, session_id, runToken)) {
            try { await batchTrx.rollback() } catch { /* already rolled back */ }
            await stream.emit("commit", "superseded", {
              phase,
              at_batch: batchIdx + 1,
              total_batches: totalBatches,
              committed_batches: completed.length,
              message: "Another loop took ownership during batch processing — rolling back and aborting cleanly.",
            })
            return { cancelled: true, superseded: true }
          }

          await batchTrx.commit()

          // Batch succeeded — record and emit progress
          for (const _ of batch) onRowSuccess()
          completed.push(batchIdx)

          const progressPayload: Record<string, unknown> = {
            phase,
            batch: batchIdx + 1,
            total_batches: totalBatches,
            current: Math.min((batchIdx + 1) * BATCH_SIZE, partition.length),
            total: partition.length,
            counters: { ...counters },
            run_id: effectiveRunId,
            run_token: runToken, // CAS anchor — must survive every progress write
            [progressKey]: completed,
          }
          // Merge with all existing completed_batches_* keys so we don't lose prior phases
          for (const [k, v] of Object.entries(progressData)) {
            if (k.startsWith("completed_batches_") && k !== progressKey) {
              progressPayload[k] = v
            }
          }

          await updateSession(pgConnection, session_id, {
            commit_progress: progressPayload,
          })
          await stream.emit("commit", "batch_committed", {
            phase,
            batch: batchIdx + 1,
            total_batches: totalBatches,
            current: Math.min((batchIdx + 1) * BATCH_SIZE, partition.length),
            total: partition.length,
            counters: { ...counters },
            last: batch[batch.length - 1] ? `${batch[batch.length - 1].artist} — ${batch[batch.length - 1].title}` : undefined,
          })
        } catch (err) {
          try { await batchTrx.rollback() } catch { /* already rolled back */ }

          counters.errors += batch.length
          failedBatches++
          const msg = err instanceof Error ? err.message : "unknown"
          await pushLastError(pgConnection, session_id, phase, {
            batch: batchIdx,
            batch_size: batch.length,
            first_release_id: batch[0]?.discogs_id,
            last_release_id: batch[batch.length - 1]?.discogs_id,
            message: msg,
          })
          await stream.emit("commit", "batch_failed", {
            phase,
            batch: batchIdx + 1,
            total_batches: totalBatches,
            rows_lost: batch.length,
            message: msg,
          })
          // Continue with next batch — per-batch isolation is the whole point
        }
      }

      await stream.emit("commit", "phase_done", {
        phase,
        committed_batches: completed.length,
        failed_batches: failedBatches,
        total_batches: totalBatches,
      })
      return { cancelled: false }
    }

    // ── Step 4: Run the three phases ─────────────────────────────────────

    // Phase: existing updates (already-linked releases, just refresh prices/etc)
    const existingResult = await processInBatches(
      "existing_updates",
      existingRows,
      async (trx, row) => {
        const did = row.discogs_id
        const cache = cacheMap.get(did)
        const cached = cache?.api_data || null
        const suggestedPrices = cache?.suggested_prices || null
        const priceEntry = buildPriceEntry(cached, suggestedPrices, price_markup, now)
        const dbId = existingMap.get(did)!
        await trx.raw(
          `UPDATE "Release" SET
            discogs_lowest_price = ?,
            discogs_num_for_sale = ?,
            discogs_have = ?,
            discogs_want = ?,
            discogs_last_synced = ?,
            discogs_suggested_prices = COALESCE(?::jsonb, discogs_suggested_prices),
            estimated_value = COALESCE(?, estimated_value),
            genres = COALESCE(?, genres),
            styles = COALESCE(?, styles),
            discogs_price_history = COALESCE(discogs_price_history, '[]'::jsonb) || ?::jsonb,
            "updatedAt" = NOW()
          WHERE id = ?`,
          [
            priceEntry.lowest,
            priceEntry.num_for_sale,
            priceEntry.have,
            priceEntry.want,
            now,
            suggestedPrices ? JSON.stringify({ ...suggestedPrices as object, fetched_at: now }) : null,
            priceEntry.estimated_value,
            cached?.genres ? (cached.genres as string[]) : null,
            cached?.styles ? (cached.styles as string[]) : null,
            JSON.stringify([priceEntry]),
            dbId,
          ]
        )
        await logImport(trx, effectiveRunId, session, dbId, did, "updated", row, cached)
      },
      () => { counters.updated++ }
    )
    if (existingResult.cancelled) {
      if (existingResult.superseded) { stream.end(); return }
      await finalizeCancel(pgConnection, stream, session_id, counters)
      return
    }

    // Phase: linkable updates (matched via pg_trgm, set discogs_id + prices)
    const linkableResult = await processInBatches(
      "linkable_updates",
      linkableRows,
      async (trx, row) => {
        const did = row.discogs_id
        const cache = cacheMap.get(did)
        const cached = cache?.api_data || null
        const suggestedPrices = cache?.suggested_prices || null
        const priceEntry = buildPriceEntry(cached, suggestedPrices, price_markup, now)
        const dbId = linkableMap.get(did)!
        await trx.raw(
          `UPDATE "Release" SET
            discogs_id = ?,
            discogs_lowest_price = ?,
            discogs_num_for_sale = ?,
            discogs_have = ?,
            discogs_want = ?,
            discogs_last_synced = ?,
            discogs_suggested_prices = COALESCE(?::jsonb, discogs_suggested_prices),
            estimated_value = COALESCE(?, estimated_value),
            genres = COALESCE(?, genres),
            styles = COALESCE(?, styles),
            description = COALESCE(description, ?),
            discogs_price_history = COALESCE(discogs_price_history, '[]'::jsonb) || ?::jsonb,
            "updatedAt" = NOW()
          WHERE id = ?`,
          [
            did,
            priceEntry.lowest,
            priceEntry.num_for_sale,
            priceEntry.have,
            priceEntry.want,
            now,
            suggestedPrices ? JSON.stringify({ ...suggestedPrices as object, fetched_at: now }) : null,
            priceEntry.estimated_value,
            cached?.genres ? (cached.genres as string[]) : null,
            cached?.styles ? (cached.styles as string[]) : null,
            (cached?.notes as string) || null,
            JSON.stringify([priceEntry]),
            dbId,
          ]
        )
        await logImport(trx, effectiveRunId, session, dbId, did, "linked", row, cached)
      },
      () => { counters.linked++ }
    )
    if (linkableResult.cancelled) {
      if (linkableResult.superseded) { stream.end(); return }
      await finalizeCancel(pgConnection, stream, session_id, counters)
      return
    }

    // Phase: new inserts (full release + tracks + credits + images)
    const newResult = await processInBatches(
      "new_inserts",
      newRows,
      async (trx, row) => {
        const did = row.discogs_id
        const cache = cacheMap.get(did)
        const cached = cache?.api_data || null
        const suggestedPrices = cache?.suggested_prices || null
        const priceEntry = buildPriceEntry(cached, suggestedPrices, price_markup, now)
        const releaseId = `discogs-release-${did}`

        const artistId = await ensureArtist(trx, row.artist, cached)
        const labelId = await ensureLabel(trx, row.label, cached)
        const formatResult = mapDiscogsFormat(cached)
        const formatDetail = getFormatDetail(cached)
        const creditsText = buildCreditsText(cached)
        const additionalLabels = getAdditionalLabels(cached)

        // NOTE: These NOT NULL columns have DB defaults and are omitted:
        //   viewCount (0), ratingCount (0), favoriteCount (0),
        //   sale_mode ('auction_only'), label_enriched (false),
        //   product_category ('release' — we set it anyway for clarity)
        // We explicitly set legacy_available=false because its default is
        // TRUE (meant for legacy-synced releases), which would be wrong
        // for Discogs imports.
        await trx.raw(
          `INSERT INTO "Release" (
            id, title, slug, "artistId", "labelId",
            "catalogNumber", year, country, format, legacy_format_detail,
            description, credits, genres, styles,
            media_condition, sleeve_condition, inventory,
            estimated_value, discogs_suggested_prices,
            discogs_id, discogs_lowest_price, discogs_num_for_sale,
            discogs_have, discogs_want, discogs_last_synced,
            discogs_price_history, additional_labels, data_source,
            legacy_available, product_category, "createdAt", "updatedAt"
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?::"ReleaseFormat", ?,
            ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?::jsonb,
            ?, ?, ?,
            ?, ?, ?,
            ?::jsonb, ?::jsonb, 'discogs_import',
            false, 'release', NOW(), NOW()
          )
          ON CONFLICT (id) DO NOTHING`,
          [
            releaseId,
            (cached?.title as string) || row.title,
            buildImportSlug(row.artist, row.title, did),
            artistId,
            labelId,
            row.catalog_number,
            (cached?.year as number) || row.year,
            (cached?.country as string) || "",
            formatResult,
            formatDetail,
            (cached?.notes as string) || null,
            creditsText,
            cached?.genres ? (cached.genres as string[]) : null,
            cached?.styles ? (cached.styles as string[]) : null,
            media_condition,
            sleeve_condition,
            inventory,
            priceEntry.estimated_value,
            suggestedPrices ? JSON.stringify({ ...suggestedPrices as object, fetched_at: now }) : null,
            did,
            priceEntry.lowest,
            priceEntry.num_for_sale,
            priceEntry.have,
            priceEntry.want,
            now,
            JSON.stringify([priceEntry]),
            additionalLabels ? JSON.stringify(additionalLabels) : null,
          ]
        )

        // Tracklist (Track table has no createdAt/updatedAt columns)
        const tracks = (cached?.tracklist || []) as Array<{ position?: string; title?: string; duration?: string }>
        for (const track of tracks) {
          if (!track.title) continue
          await trx.raw(
            `INSERT INTO "Track" (id, "releaseId", position, title, duration)
            VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
            [
              `dt-${did}-${track.position || "0"}`,
              releaseId,
              track.position || "",
              track.title,
              track.duration || "",
            ]
          )
        }

        // Credits → ReleaseArtist
        const extraartists = (cached?.extraartists || []) as Array<{ name?: string; id?: number; role?: string }>
        for (const ea of extraartists) {
          if (!ea.name || !ea.id) continue
          const eaId = await ensureArtistByDiscogs(trx, ea)
          if (eaId) {
            await trx.raw(
              `INSERT INTO "ReleaseArtist" (id, "releaseId", "artistId", role, "createdAt")
              VALUES (?, ?, ?, ?, NOW()) ON CONFLICT ("releaseId", "artistId") DO NOTHING`,
              [`dra-${did}-${ea.id}`, releaseId, eaId, ea.role || "performer"]
            )
          }
        }

        // Images
        const images = (cached?.images || []) as Array<{ uri?: string; type?: string }>
        const maxImages = Math.min(images.length, 5)
        for (let imgIdx = 0; imgIdx < maxImages; imgIdx++) {
          const img = images[imgIdx]
          if (!img.uri) continue
          const imageId = `discogs-image-${did}-${imgIdx + 1}`
          await trx.raw(
            `INSERT INTO "Image" (id, url, alt, "releaseId", rang, source, "createdAt")
            VALUES (?, ?, ?, ?, ?, 'discogs', NOW()) ON CONFLICT (id) DO NOTHING`,
            [imageId, img.uri, `${row.artist} — ${row.title}`, releaseId, imgIdx + 1]
          )
          if (imgIdx === 0) {
            await trx.raw(
              `UPDATE "Release" SET "coverImage" = ? WHERE id = ? AND "coverImage" IS NULL`,
              [img.uri, releaseId]
            )
          }
        }

        await logImport(trx, effectiveRunId, session, releaseId, did, "inserted", row, cached)
      },
      () => { counters.inserted++ }
    )
    if (newResult.cancelled) {
      if (newResult.superseded) { stream.end(); return }
      await finalizeCancel(pgConnection, stream, session_id, counters)
      return
    }

    // ── Step 5: Finalize ─────────────────────────────────────────────────
    // Session-state logic:
    //   errors === 0                    → 'done'     (fully committed, no retry needed)
    //   errors > 0                       → 'analyzed' (partial success, retry possible)
    //                                                 Resume-Banner shows, completed_batches_*
    //                                                 keys are preserved so re-running skips
    //                                                 batches that already succeeded.
    //
    // CAS: if another loop has taken ownership during our commit (e.g. we
    // were slow, got auto-restarted, but our loop kept going), we MUST NOT
    // stomp on the new owner's state. Bail silently — the new owner will
    // write its own terminal status.
    if (await isSupersededBy(pgConnection, session_id, runToken)) {
      await stream.emit("commit", "superseded", {
        phase: "finalizing",
        message: "Another loop took ownership before finalize — skipping status write.",
      })
      stream.end()
      return
    }

    const hasErrors = counters.errors > 0
    const finalStatus = hasErrors ? "analyzed" : "done"

    // Preserve completed_batches_* keys across the terminal update so a retry
    // can skip already-committed batches via processInBatches() resume logic.
    const freshSessionEnd = await getSession(pgConnection, session_id)
    const existingProgress = (freshSessionEnd?.commit_progress as Record<string, unknown>) || {}
    const preservedBatches: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(existingProgress)) {
      if (k.startsWith("completed_batches_")) {
        preservedBatches[k] = v
      }
    }

    await updateSession(pgConnection, session_id, {
      status: finalStatus,
      run_id: effectiveRunId,
      error_message: null, // clear any stale error_message from superseded runs
      commit_progress: {
        phase: hasErrors ? "done_with_errors" : "done",
        counters,
        run_token: runToken,
        ...preservedBatches,
      },
      ...(hasErrors ? {
        error_message: `Commit completed with ${counters.errors} errors. ${counters.inserted + counters.linked + counters.updated} rows committed successfully. Click 'Approve & Import' again to retry failed batches.`,
      } : {}),
    })
    await clearControlFlags(pgConnection, session_id)

    await stream.emit("commit", hasErrors ? "completed_with_errors" : "done", {
      run_id: effectiveRunId,
      collection: session.collection_name,
      ...counters,
    })
    stream.end()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Commit failed"
    try {
      // CAS: only write error status if we still own the session. If
      // superseded, our crash is probably related to losing ownership
      // (e.g. DB connection torn down by another loop's transaction) —
      // the new owner will write its own terminal status.
      // Special case: if runToken is still "" (crash before ownership
      // claim in Step 1), there's no owner yet — write normally.
      const shouldWrite = !runToken || !(await isSupersededBy(pgConnection, session_id, runToken))
      if (shouldWrite) {
        await updateSession(pgConnection, session_id, {
          status: "analyzed",
          error_message: msg,
          commit_progress: {
            phase: "error",
            reason: msg,
            ...(runToken ? { run_token: runToken } : {}),
            ...(preservedRunIdAtStart ? { run_id: preservedRunIdAtStart } : {}),
            ...preservedBatchesAtStart,
          },
        })
        await clearControlFlags(pgConnection, session_id)
      }
    } catch { /* ignore — best effort */ }
    if (!stream.isClosed) await stream.error(msg)
  }
  })().catch((err) => {
    // Outer safety net — if ANY uncaught error escapes the inner try/catch,
    // log it loudly (the client is already long gone by this point).
    console.error(`[discogs-import/commit] Detached loop crashed for session ${session_id}:`, err)
  })
}

// Finalize after user cancel: leave session in a resumable state so user
// can decide whether to continue later. Partial committed data remains in DB.
async function finalizeCancel(
  pg: Knex,
  stream: SSEStream,
  sessionId: string,
  counters: Counters
): Promise<void> {
  await updateSession(pg, sessionId, {
    status: "analyzed",
    error_message: "Cancelled by user — partial commit preserved (see commit_progress.completed_batches_* for what succeeded)",
    commit_progress: { phase: "cancelled", counters },
  })
  await clearControlFlags(pg, sessionId)
  await stream.emit("commit", "rollback", {
    reason: "Cancelled by user — partial commit preserved",
    cancelled: true,
    counters,
  })
  stream.end()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPriceEntry(
  cached: Record<string, unknown> | null,
  suggestedPrices: Record<string, unknown> | null,
  priceMarkup: number,
  now: string
) {
  const community = (cached?.community || {}) as { have?: number; want?: number }
  const vgPlusPrice = (suggestedPrices as Record<string, unknown>)?.["VG+"] as number | null ?? null
  // Rounded to whole euros — plattform policy (BID_CONFIG.whole_euros_only = true).
  // All auction prices, estimated values, and direct prices must be integer euros.
  const estimatedValue = vgPlusPrice
    ? Math.round(vgPlusPrice * priceMarkup)
    : null
  return {
    date: now,
    source: "discogs_collection_import",
    lowest: (cached?.lowest_price as number) ?? null,
    median: null,
    highest: null,
    suggested_vgplus: vgPlusPrice,
    estimated_value: estimatedValue,
    num_for_sale: (cached?.num_for_sale as number) ?? 0,
    have: community.have ?? 0,
    want: community.want ?? 0,
  }
}

function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[-\s]+/g, "-")
    .substring(0, 200)
}

// Slug for new Discogs imports: "{artist}-{title}-{discogs_id}".
// The discogs_id suffix guarantees uniqueness across different pressings
// of the same title (e.g. Depeche Mode "Leave In Silence" has 3 distinct
// pressings with different Discogs IDs). Legacy releases keep their
// original shorter slugs untouched — only new imports get the suffix.
function buildImportSlug(artist: string, title: string, discogsId: number): string {
  // Reserve 12 chars for "-{discogs_id}" suffix, trim base to 188 chars
  const base = slugify(`${artist} ${title}`).substring(0, 188)
  return `${base}-${discogsId}`
}

const FORMAT_MAP: Record<string, string> = {
  Vinyl: "LP",
  CD: "CD",
  Cassette: "CASSETTE",
  DVD: "VHS",
  "Blu-ray": "VHS",
  "Box Set": "BOXSET",
  File: "DIGITAL",
  "Reel-To-Reel": "REEL",
  Shellac: "LP",
  "Lathe Cut": "LP",
  "8-Track Cartridge": "CASSETTE",
  Minidisc: "CD",
}

function mapDiscogsFormat(cached: Record<string, unknown> | null): string {
  if (!cached) return "OTHER"
  const formats = cached.formats as Array<{ name?: string }> | undefined
  if (!formats?.length) return "OTHER"
  return FORMAT_MAP[formats[0].name || ""] || "OTHER"
}

function getFormatDetail(cached: Record<string, unknown> | null): string | null {
  if (!cached) return null
  const formats = cached.formats as Array<{ name?: string; descriptions?: string[]; qty?: string }> | undefined
  if (!formats?.length) return null
  const f = formats[0]
  const parts = [f.name, ...(f.descriptions || [])].filter(Boolean)
  return parts.length ? parts.join(", ") : null
}

function buildCreditsText(cached: Record<string, unknown> | null): string | null {
  if (!cached) return null
  const extraartists = (cached.extraartists || []) as Array<{ name?: string; role?: string }>
  if (!extraartists.length) return null
  const byRole = new Map<string, string[]>()
  for (const ea of extraartists) {
    if (!ea.name || !ea.role) continue
    const name = ea.name.replace(/\s*\(\d+\)$/, "")
    if (!byRole.has(ea.role)) byRole.set(ea.role, [])
    byRole.get(ea.role)!.push(name)
  }
  return Array.from(byRole.entries())
    .map(([role, names]) => `${role}: ${names.join(", ")}`)
    .join("\n")
}

function getAdditionalLabels(cached: Record<string, unknown> | null): Array<{ name: string; catno: string; discogs_id: number }> | null {
  if (!cached) return null
  const labels = (cached.labels || []) as Array<{ name?: string; catno?: string; id?: number }>
  if (labels.length <= 1) return null
  return labels.slice(1).map((l) => ({
    name: (l.name || "").replace(/\s*\(\d+\)$/, ""),
    catno: l.catno || "",
    discogs_id: l.id || 0,
  }))
}

async function ensureArtist(
  pg: Knex.Transaction,
  name: string,
  cached: Record<string, unknown> | null
): Promise<string | null> {
  if (!name) return null
  const artists = (cached?.artists || []) as Array<{ name?: string; id?: number }>
  const discogsArtist = artists[0]
  const artistName = (discogsArtist?.name || name).replace(/\s*\(\d+\)$/, "")
  const slug = slugify(artistName)
  const existing = await pg.raw(`SELECT id FROM "Artist" WHERE slug = ? LIMIT 1`, [slug])
  if (existing.rows.length) return existing.rows[0].id
  const artistId = discogsArtist?.id
    ? `discogs-artist-${discogsArtist.id}`
    : `import-artist-${slug}`
  await pg.raw(
    `INSERT INTO "Artist" (id, name, slug, "createdAt", "updatedAt")
    VALUES (?, ?, ?, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
    [artistId, artistName, slug]
  )
  return artistId
}

async function ensureArtistByDiscogs(
  pg: Knex.Transaction,
  ea: { name?: string; id?: number }
): Promise<string | null> {
  if (!ea.name) return null
  const name = ea.name.replace(/\s*\(\d+\)$/, "")
  const slug = slugify(name)
  if (ea.id) {
    const byId = await pg.raw(`SELECT id FROM "Artist" WHERE id = ? LIMIT 1`, [`discogs-artist-${ea.id}`])
    if (byId.rows.length) return byId.rows[0].id
  }
  const existing = await pg.raw(`SELECT id FROM "Artist" WHERE slug = ? LIMIT 1`, [slug])
  if (existing.rows.length) return existing.rows[0].id
  const artistId = ea.id ? `discogs-artist-${ea.id}` : `import-artist-${slug}`
  await pg.raw(
    `INSERT INTO "Artist" (id, name, slug, "createdAt", "updatedAt")
    VALUES (?, ?, ?, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
    [artistId, name, slug]
  )
  return artistId
}

async function ensureLabel(
  pg: Knex.Transaction,
  name: string,
  cached: Record<string, unknown> | null
): Promise<string | null> {
  if (!name) return null
  const labels = (cached?.labels || []) as Array<{ name?: string; id?: number }>
  const discogsLabel = labels[0]
  const labelName = (discogsLabel?.name || name).replace(/\s*\(\d+\)$/, "")
  const slug = slugify(labelName)
  const existing = await pg.raw(`SELECT id FROM "Label" WHERE slug = ? LIMIT 1`, [slug])
  if (existing.rows.length) return existing.rows[0].id
  const labelId = discogsLabel?.id
    ? `discogs-label-${discogsLabel.id}`
    : `import-label-${slug}`
  await pg.raw(
    `INSERT INTO "Label" (id, name, slug, "createdAt", "updatedAt")
    VALUES (?, ?, ?, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
    [labelId, labelName, slug]
  )
  return labelId
}

async function logImport(
  pg: Knex.Transaction,
  runId: string,
  session: { filename: string; collection_name: string },
  releaseId: string,
  discogsId: number,
  action: string,
  row: ParsedRow,
  cached?: Record<string, unknown> | null
): Promise<void> {
  const logId = `ilog-${runId.substring(0, 8)}-${discogsId}`
  await pg.raw(
    `INSERT INTO import_log (id, import_type, collection_name, import_source, run_id, release_id, discogs_id, action, data_snapshot)
    VALUES (?, 'discogs_collection', ?, ?, ?, ?, ?, ?, ?::jsonb)
    ON CONFLICT (id) DO NOTHING`,
    [
      logId,
      session.collection_name,
      session.filename,
      runId,
      releaseId,
      discogsId,
      action,
      JSON.stringify({
        excel: { artist: row.artist, title: row.title, catalog_number: row.catalog_number, year: row.year, format: row.format },
        api: cached ? {
          title: cached.title,
          year: cached.year,
          country: cached.country,
          genres: cached.genres,
          styles: cached.styles,
          lowest_price: cached.lowest_price,
          num_for_sale: cached.num_for_sale,
          community: cached.community,
          images_count: ((cached.images || []) as unknown[]).length,
          tracks_count: ((cached.tracklist || []) as unknown[]).length,
          credits_count: ((cached.extraartists || []) as unknown[]).length,
        } : null,
      }),
    ]
  )
}
