# Discogs Import — Session Lock Refactoring Plan

**Status:** REVIEWED — Ready for implementation
**Author:** Robin + Claude (rc25 post-mortem analysis) + Codex Review (2026-04-12)
**Datum:** 2026-04-11 (geplante Umsetzung: 2026-04-12)
**Scope:** Ownership + Concurrency-Kontrolle für die drei Discogs-Import Loops (fetch, analyze, commit)
**Referenzen:**
- `docs/architecture/DISCOGS_IMPORT_SESSION_2026-04-11.md` — Part 1-3: rc17 bis rc24
- `docs/sessions/2026-04-11_discogs-race-analysis-and-lock-plan.md` — rc25 Post-Mortem + Analyse die zu diesem Plan geführt hat
- `backend/src/api/admin/discogs-import/commit/route.ts` — rc25 Current State
- `backend/src/lib/discogs-import.ts` — SSEStream + Helpers

---

## 1 Motivation

Zwischen rc24 und rc25 (beide am 2026-04-11) wurde der Discogs Importer mit einem immer komplexer werdenden Geflecht aus Timer-Thresholds, `run_token` CAS-Checks in JSONB-Feldern, und conditional Status-Writes versehen, um zwei parallele Commit-Loops zu verhindern die sich gegenseitig Daten überschrieben. Die rc25-Lösung funktioniert, aber sie ist **fragil**: die CAS-Invariante lebt in einem JSONB-Blob (`commit_progress.run_token`) der an 5 verschiedenen Codestellen explizit re-persistiert werden muss. Jeder neue Code-Pfad kann versehentlich den Token wipen und die Concurrency-Kontrolle aushebeln.

Zusätzlich sind 3 pre-existing Bugs durch die Überarbeitung sichtbarer geworden (siehe Analyse-Kapitel in der Session-Doku):

- **K1:** `effectiveRunId` Logik ist seit rc16 tot — Resume-Runs bekommen immer einen neuen `run_id`
- **K2:** `finalizeCancel` wiped `completed_batches_*` — Resume nach User-Cancel doppelt Arbeit
- **M4:** rc25's `row_progress` Events alle 100 rows fluten den Live-Log

Der vorliegende Plan löst **alle vier Probleme** in einem sauberen Refactoring statt in weiteren Patch-Layern.

## 2 Leitprinzipien

1. **Separation of Concerns:** Ownership, Progress-Tracking und Event-Log sind **drei verschiedene Dinge** und gehören in **drei verschiedene Tabellen**. Aktuell mischen sich Ownership (`run_token`) und Progress (`completed_batches_*`) im selben JSONB-Blob, und `last_event_at` ist Dual-Use für Event-Ordering + Liveness.
2. **Strukturelle Invarianten > Code-Invarianten:** Eine Invariante die als Unique-Constraint in der DB erzwungen wird, ist robuster als eine die an 5 Code-Stellen manuell aufrechterhalten werden muss.
3. **Single Source of Truth:** Jede Frage soll genau eine Antwort an genau einem Ort haben.
4. **Optimistisch auf DB-Hiccups:** Bei temporären DB-Fehlern im Heartbeat-Pfad nicht sofort bailen. Erst bei *beweisbar* verlorener Ownership abbrechen. rc25's `return true on error` ist zu aggressiv.
5. **Kein Feature-Creep:** Dieser Refactor fixt die identifizierten Probleme. Er führt **keine** neuen Features ein (keine Real-time Updates, keine Multi-User Conflict Resolution, keine fancy Metrics). Scope-Disziplin.

## 3 Aktueller Zustand (Ist)

### 3.1 Ownership-Tracking (rc25)

Im `commit_progress` JSONB-Feld der `import_session` Tabelle wird ein `run_token` UUID gespeichert. Jeder Commit-Loop:

- schreibt beim Start einen neuen `run_token` in `commit_progress.run_token`
- liest vor jedem `batchTrx.commit()` den aktuellen `run_token` und vergleicht mit dem eigenen (`isSupersededBy()`)
- bei Mismatch: `batchTrx.rollback()` + `return { cancelled: true, superseded: true }`

**Problem 1 — Invariante an 5 Stellen manuell:** Der Token muss persistiert werden in:
- `commit/route.ts:202` (Step 1 ownership claim)
- `commit/route.ts:585` (jedes batch_committed progress write)
- `commit/route.ts:395` (validation_failed)
- `commit/route.ts:927` (finalize)
- `commit/route.ts:959` (catch handler)

Jeder neue Write-Pfad muss diese Invariante manuell mitführen.

**Problem 2 — JSONB-Locks sind gefährlich:** `commit_progress` wird als Ganzes überschrieben. Wenn ein Path einen Partial-Write macht ohne den `run_token` einzufügen (z.B. `finalizeCancel` aktuell), ist der Token weg.

### 3.2 Stale-Detection (rc24 → rc25)

Client UI (page.tsx):
```typescript
const STALE_THRESHOLD_MS = 180_000  // rc25, war 60_000 in rc24
```

Server Idempotency (commit/route.ts, analog in fetch + analyze):
```typescript
const COMMIT_STALE_THRESHOLD_SEC = 180  // rc25, war 60 in rc24
```

Beide Systeme prüfen `last_event_at` der Session — aber dieses Feld wird **von jedem Event-Write gebumped** (via `SSEStream.emit()` und `emitDbEvent()` und `updateSession()`). Das heißt: `last_event_at` trägt zwei Bedeutungen gleichzeitig (Event-Ordering + Liveness), und jeder Update-Path muss an beide Bedeutungen denken.

### 3.3 In-Batch Heartbeats (rc25)

```typescript
// commit/route.ts:520-551 — in processInBatches, inside row loop:
const HEARTBEAT_EVERY = 25
const PROGRESS_EVERY = 100
...
if (rowsSinceHeartbeat >= HEARTBEAT_EVERY) {
  await pgConnection.raw(`UPDATE import_session SET last_event_at = NOW() WHERE id = ?`, [session_id])
}
```

Drei Probleme:
- Der Heartbeat ist fest an `processInBatches` gekoppelt. Wenn der Loop in einer Phase ohne Batches ist (z.B. preparing, validating), gibt's keinen Heartbeat und die Stale-Detection könnte fälschlich feuern.
- Die Frequenz (alle 25 rows) ist willkürlich — nicht zeitbasiert. Bei schnellen Batches (z.B. existing_updates) zu häufig, bei langsamen (new_inserts mit cold cache) kann 25 rows > 30s dauern.
- Jeder Heartbeat ist ein separater DB-Round-trip (nicht gepoolt).

### 3.4 Drei Failure-Modes, drei verschiedene Mechanismen

| Failure-Mode | Current Handling |
|---|---|
| Client disconnect (navigation) | Detached background task (rc18/rc20) |
| Backend pm2/OOM kill | rc24 Auto-Restart via Polling |
| Zwei parallele Loops (rc24 false-positive) | rc25 CAS run_token in JSONB |

Jeder Mode hat seinen eigenen Mechanismus. Das ist OK, aber die rc25 CAS-Logik ist der fragilste Teil davon.

## 4 Ziel-Architektur (Soll)

### 4.1 Neue Tabelle `session_locks`

```sql
CREATE TABLE session_locks (
  session_id    TEXT PRIMARY KEY REFERENCES import_session(id) ON DELETE CASCADE,
  owner_id      TEXT NOT NULL,                -- uuid per Loop-Invocation
  phase         TEXT NOT NULL,                -- 'fetching' | 'analyzing' | 'importing'
  acquired_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heartbeat_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_session_locks_heartbeat ON session_locks(heartbeat_at);
```

- `session_id` ist Primary Key → pro Session existiert **höchstens ein Lock**. Das ist die zentrale Invariante, erzwungen durch den PK.
- `owner_id` ist eine UUID die beim Lock-Acquire generiert wird und den Loop eindeutig identifiziert.
- `heartbeat_at` wird vom Loop periodisch (alle 30s) aktualisiert.
- `ON DELETE CASCADE` räumt Lock auf wenn Session gelöscht wird.

### 4.2 Lock Helper API

Neu in `backend/src/lib/discogs-import.ts`:

```typescript
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
  phase: "fetching" | "analyzing" | "importing",
  staleThresholdSec: number = 180
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
  if (result.rows.length === 0) return null  // another loop holds fresh lock
  return result.rows[0].owner_id  // always === ownerId we passed, sanity-returned
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
  return result.rowCount > 0
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
    return true  // optimistic: don't bail on transient DB errors
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
```

**Design-Notes zur API:**
- `validateLock` und `heartbeatLock` haben **unterschiedliches Error-Handling**: validate ist optimistisch (DB-Error → assume owned), heartbeat wirft (caller decidet). Das ist gewollt: Validate läuft an vielen Stellen zwischen Read-only-Work, heartbeat läuft in einem isolierten Interval.
- `acquireLock` verwendet `INSERT ... ON CONFLICT DO UPDATE WHERE ...` — das ist ein **atomarer Compare-and-Set**. Genau ein Concurrent-Call gewinnt.
- Der Heartbeat läuft in einem **setInterval** unabhängig von `processInBatches`. Das heißt: auch während der `preparing`-Phase (wo noch keine Batches laufen) bleibt das Lock frisch.

### 4.3 Commit-Route Integration

> **Codex-Amendment C1:** Lock wird im POST-Handler acquired und als `ownerId` an den detached Loop übergeben — nicht erst innerhalb des Loops. Sonst können zwei parallele POSTs beide `started: true` returnen bevor einer den Lock bekommt.

Der POST-Handler acquired den Lock **vor** dem Spawn:

```typescript
export async function POST(req, res) {
  // ... validate input + session check ...
  const ownerId = await acquireLock(pgConnection, session_id, "importing")
  if (!ownerId) {
    res.json({ ok: true, session_id, already_running: true })
    return
  }
  res.json({ ok: true, session_id, started: true })
  void runCommitLoop(pgConnection, session_id, ownerId, ...).catch(...)
}
```

Der Loop-Body empfängt `ownerId` als Parameter:

```typescript
async function runCommitLoop(pg, session_id, ownerId, ...) {

  // ── 2. Start Heartbeat Interval ──────────────────────────────────────
  let lostOwnership = false
  const stopHeartbeat = startHeartbeatLoop(pgConnection, session_id, ownerId, 30_000, () => {
    lostOwnership = true
  })

  try {
    // ── 3. Existing rc18/rc20 loop body (unverändert in den Phasen) ──
    // processInBatches() validiert jetzt via validateLock() statt isSupersededBy()
    // ...
  } finally {
    stopHeartbeat()
    if (!lostOwnership) {
      await releaseLock(pgConnection, session_id, ownerId)
    }
    // Wenn lostOwnership=true: das andere Loop hat den Lock schon übernommen —
    // nicht löschen (sonst löschen wir den Lock des neuen Owners).
  }
})().catch(...)
```

In `processInBatches`, statt `isSupersededBy(...)` wird `!(await validateLock(pg, sessionId, ownerId))` aufgerufen. Pre-commit check vor jedem `batchTrx.commit()`:

```typescript
if (!(await validateLock(pgConnection, session_id, ownerId))) {
  await batchTrx.rollback()
  // clean bail — finally block releases nothing (we don't own it anymore)
  return { cancelled: true, superseded: true }
}
await batchTrx.commit()
```

### 4.4 Fetch + Analyze Integration

Die gleiche Lock-Logik — aber simpler, weil diese Loops keine Transaktionen committen die rolled-back werden müssten:

**Fetch:**
```typescript
const ownerId = await acquireLock(pg, session_id, "fetching")
if (!ownerId) return  // handled by POST's idempotency response
const stopHeartbeat = startHeartbeatLoop(pg, session_id, ownerId, 30_000, () => {
  lostOwnership = true
})
try {
  for (...items) {
    if (lostOwnership) return  // cooperative bail on next iteration
    // ... fetch + cache write ...
  }
} finally {
  stopHeartbeat()
  if (!lostOwnership) await releaseLock(pg, session_id, ownerId)
}
```

**Analyze:** identisch, nur phase=`"analyzing"`.

> **Codex-Amendment C3:** Terminal-Writes in fetch/analyze mit `validateLock()` absichern. Die finalen Status-Writes (`fetched`/`analyzed`) sind aktuell unconditional — ein Loop der seinen Lock verloren hat soll nicht mehr den finalen Status schreiben.

```typescript
// Am Ende von fetch/analyze, VOR dem finalen updateSession():
if (!(await validateLock(pg, session_id, ownerId))) {
  // Lost ownership during run — don't write terminal status
  return
}
await updateSession(pg, session_id, { status: "fetched", ... })
```

### 4.5 POST Handler Idempotency (alle 3 Routes)

> **Codex-Amendment C1 (Fortsetzung):** Lock-Acquisition findet im POST-Handler statt, nicht im detached Loop. Der optimistische Pre-Check entfällt — `acquireLock()` selbst ist die Idempotency-Garantie.

```typescript
export async function POST(req, res) {
  // ... validate input ...
  const session = await getSession(pgConnection, session_id)

  // Acquire lock — atomic, handles concurrent POSTs
  const ownerId = await acquireLock(pgConnection, session_id, phase)
  if (!ownerId) {
    res.json({ ok: true, session_id, already_running: true })
    return
  }

  // Spawn loop with acquired ownerId
  res.json({ ok: true, session_id, started: true })
  void runLoop(pgConnection, session_id, ownerId, ...).catch(...)
}
```

**Kein separater Idempotency-Check mehr nötig.** `acquireLock()` ist atomar und entscheidet in einer einzigen Query ob der Lock vergeben wird oder nicht. Das ist einfacher und sicherer als der ursprüngliche Plan mit optimistischem Pre-Check + Lock im Loop.

### 4.6 Phase-Preconditions (Codex-Amendment C2)

> **Codex-Amendment C2:** Lock verhindert Overlap, aber nicht invalide Reihenfolge. Explizite Precondition-Checks in jedem POST-Handler.

Jeder POST-Handler prüft **vor** `acquireLock()` ob die Vorgänger-Phase abgeschlossen ist:

```typescript
// fetch/route.ts POST:
if (!["uploaded", "fetched"].includes(session.status)) {
  res.status(400).json({ error: `Cannot fetch: session is '${session.status}', expected 'uploaded' or 'fetched'` })
  return
}

// analyze/route.ts POST:
if (session.status !== "fetched") {
  res.status(400).json({ error: `Cannot analyze: session is '${session.status}', expected 'fetched'` })
  return
}

// commit/route.ts POST:
if (!["analyzed"].includes(session.status) && !isResumeFromCancelledCommit(session)) {
  res.status(400).json({ error: `Cannot commit: session is '${session.status}', expected 'analyzed'` })
  return
}
```

Diese Checks existieren teilweise schon, werden aber konsolidiert und explizit gemacht.

### 4.7 Control-Flag Preservation bei Takeover (Codex Edge Case)

> **Codex Edge Case:** `clearControlFlags()` am Loop-Start löscht einen eventuell schon angeforderten Cancel/Pause. Bei Stale-Lock-Takeover soll ein vorheriger Cancel-Request **erhalten bleiben**.

Lösung: `clearControlFlags()` wird **nicht** am Anfang eines Takeover-Loops aufgerufen. Stattdessen prüft der Loop beim Start ob `cancel_requested = true` und bailed sofort wenn ja:

```typescript
async function runCommitLoop(pg, sessionId, ownerId, ...) {
  const session = await getSession(pg, sessionId)
  if (session.cancel_requested) {
    await releaseLock(pg, sessionId, ownerId)
    return  // respect pre-existing cancel request
  }
  // ... normal loop body ...
}
```

`clearControlFlags()` wird nur noch nach **erfolgreichem Abschluss** oder **bei finalizeCancel** aufgerufen.

### 4.8 Removed Code (rc25 zurückgebaut)

Diese Konstrukte werden komplett entfernt:

1. `isSupersededBy()` helper function — ersetzt durch `validateLock()`
2. `run_token` in `commit_progress` JSONB — entfällt ganz
3. In-Batch Heartbeats in `processInBatches` (die `UPDATE import_session SET last_event_at` alle 25 rows) — ersetzt durch lock heartbeat
4. `COMMIT_STALE_THRESHOLD_SEC = 180` constants → bleibt als Lock-Threshold aber nicht mehr für `last_event_at`
5. Der ganze `preservedBatchesAtStart` + `preservedRunIdAtStart` Dance mit `let`-hoisted outer-scope vars — ersetzt durch einen einzigen Read in Step 1, Resultat in lokalem `const`.
6. 5× manuelle run_token Re-Persistence — entfällt

Das Deletion-Set ist ca. **200 Zeilen** aus commit/route.ts, plus die Helper-Function.

## 5 Gebündelte Bugfixes (unabhängig vom Lock-Refactor)

Diese 3 Bugs werden im selben PR mitgefixt, weil sie eng verwandt sind und der Lock-Refactor eh alle relevanten Code-Stellen anfasst:

### 5.1 K1 — `effectiveRunId` Resume-Logik (pre-existing seit rc16)

**Ist:** commit/route.ts:422-428 prüft `prevProgress.phase !== "preparing"` um zu entscheiden ob's ein Resume ist — aber Step 1 setzt `phase = "preparing"` immer → condition ist immer false → `effectiveRunId` ist immer eine neue UUID.

**Soll:**
```typescript
const startProgress = (session.commit_progress as Record<string, unknown>) || {}
const hasCompletedBatches = Object.keys(startProgress).some(k =>
  k.startsWith("completed_batches_") &&
  Array.isArray(startProgress[k]) &&
  (startProgress[k] as number[]).length > 0
)
const priorRunId = startProgress.run_id as string | undefined
const isResume = hasCompletedBatches && priorRunId
const effectiveRunId = isResume ? priorRunId : crypto.randomUUID()
```

Resume wird erkannt wenn **mindestens ein batch completed ist** UND **ein prior run_id existiert**. Beide Bedingungen müssen wahr sein — verhindert false-positive Resume bei leeren Progress-Objekten.

### 5.2 K2 — `finalizeCancel` preserviert completed_batches

**Ist:** commit/route.ts:983-988 wiped `commit_progress` auf `{ phase: "cancelled", counters }` und verliert alle `completed_batches_*` + run_id.

**Soll:**
```typescript
async function finalizeCancel(pg, sessionId, counters, preservedBatches, runId) {
  await updateSession(pg, sessionId, {
    status: "analyzed",
    error_message: "Cancelled by user — partial commit preserved. Click 'Approve & Import' to continue.",
    commit_progress: {
      phase: "cancelled",
      counters,
      ...(runId ? { run_id: runId } : {}),
      ...preservedBatches,  // all completed_batches_* keys
    },
  })
  await clearControlFlags(pg, sessionId)
}
```

Die `preservedBatches` + `runId` werden vom Caller (dem Haupt-Loop) übergeben — sie stehen dort eh schon zur Verfügung weil K1-Fix sie liest.

### 5.2b K2+ — `run_id` in ALLEN resumable Terminal-States (Codex-Amendment C4)

> **Codex-Amendment C4:** Nicht nur `finalizeCancel`, auch `done_with_errors` und `error` Pfade droppen aktuell `run_id` aus `commit_progress`. Bei Resume nach Partial-Failure wird sonst eine neue `run_id` geminted → History-Gruppierung bricht.

**Soll:** Jeder Terminal-Write der `commit_progress` setzt, muss `run_id` + `completed_batches_*` preserven:

```typescript
// Hilfsfunktion für alle Terminal-Writes:
function buildTerminalProgress(phase: string, counters: Record<string, number>, runId: string, preservedBatches: Record<string, unknown>) {
  return {
    phase,
    counters,
    run_id: runId,
    ...preservedBatches,
  }
}
```

Betrifft: `finalizeCancel`, `finalizeDone`, `finalizeError`, `done_with_errors` — alle 4 Pfade verwenden `buildTerminalProgress()`.

### 5.3 M4 — row_progress Event-Flut reduzieren

**Ist:** rc25 emittet `row_progress` alle 100 rows → bei einem 3000-row Import = 30 Events allein in new_inserts, plus batch_committed events, plus phase_start/done. Live-Log ist überlaufen.

**Soll:** `row_progress` komplett entfernen. Der Progress-Bar im UI basiert bereits auf `commit_progress.current` / `commit_progress.total`, die über die **ohnehin periodisch gebumped werden**: wir fügen im In-Loop stattdessen einen `UPDATE import_session SET commit_progress = ... WHERE id = ?` alle ~5 Sekunden hinzu (zeitbasiert, nicht row-basiert), der die Progress-Counter aktualisiert aber **kein** Event in `import_event` schreibt.

Resultat: Live-Log zeigt nur sinnvolle Events (phase_start, batch_committed, phase_done, errors). Progress-Bar läuft butterweich weil alle 5s die Zahlen im DB aktuell sind. Polling UI liest `session.commit_progress` und rendert den Fortschritt.

### 5.4 M2 — `rateLimit()` in fetch/route.ts soll Event emitten

**Ist:** fetch/route.ts:38-48 wartet bis zu 60s stumm. Im Live-Log sieht das aus wie ein Stuck-Loop.

**Soll:** Vor dem `setTimeout`:
```typescript
if (waitMs > 2000) {
  await emitDbEvent(pg, sessionId, "fetch", "rate_limit_wait", {
    wait_seconds: Math.round(waitMs / 1000),
    next_request_at: new Date(Date.now() + waitMs).toISOString(),
  })
}
```

Threshold 2s, damit nur echte Waits (nicht die sub-second Micro-Delays) gemeldet werden.

## 6 Was unverändert bleibt

Explizit im Scope ausgeschlossen — diese Dinge sind heute korrekt und werden nicht angefasst:

- **Detached background task pattern** (rc18/rc20) — detach via `void (async () => {...})().catch(...)` + `res.json()` vor dem loop
- **SSEStream Headless Mode** (rc20)
- **Per-batch Transactions** mit separaten `batchTrx` pro Batch
- **`completed_batches_*` Resume-Logic** in `processInBatches` (abgesehen vom K1/K2 Fix)
- **`ON CONFLICT DO NOTHING`** defensive Layer im new_inserts
- **Client-side Polling** alle 2s
- **Client-side Auto-Restart** in page.tsx — bleibt, wird aber **simpler**: POST triggert → Backend entscheidet per `acquireLock` ob neu gestartet wird. Kein Cooldown-Dance mehr, da Lock-Table die Invariante trägt.
- **Upload / Parse Phase** — komplett außerhalb des Scopes, funktioniert.
- **Analysis Result Storage** in `session.analysis_result` JSONB — bleibt.

## 7 Datenmodell-Änderungen

### 7.1 Neu: `session_locks`

Siehe §4.1.

### 7.2 Entfernt (nach Migration): `commit_progress.run_token`

Kein Schema-Change nötig (JSONB field), aber neue Runs schreiben `run_token` nicht mehr. Alte Sessions haben das Feld noch — das wird bei ihrem nächsten Resume-Cleanup entfernt oder bleibt einfach stehen (harmlos, ignoriert).

### 7.3 `last_event_at` Semantik-Cleanup

Nicht entfernt, aber die **Bedeutung wird präzisiert**: `last_event_at` ist nur noch "wann wurde der letzte Event ins import_event log geschrieben". Liveness wird ausschließlich über `session_locks.heartbeat_at` getracked.

Konsequenz: `updateSession()` bumped `last_event_at` nicht mehr automatisch (line 26 in lib/discogs-import.ts wird entfernt). Ein Event-Write bumped es nur noch explizit via `SSEStream.emit()`.

## 8 Migration: `session_locks` Tabelle

Neue Migration `backend/scripts/migrations/2026-04-12_session_locks.sql`:

```sql
-- Discogs Import Session Locks — Concurrent-Run Prevention
-- Applied: 2026-04-12 via Supabase SQL Editor oder MCP
-- Idempotent: IF NOT EXISTS
-- Plan: docs/architecture/DISCOGS_IMPORT_SESSION_LOCK_PLAN.md

CREATE TABLE IF NOT EXISTS session_locks (
  session_id    TEXT PRIMARY KEY REFERENCES import_session(id) ON DELETE CASCADE,
  owner_id      TEXT NOT NULL,
  phase         TEXT NOT NULL CHECK (phase IN ('fetching','analyzing','importing')),
  acquired_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heartbeat_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_locks_heartbeat ON session_locks(heartbeat_at);
CREATE INDEX IF NOT EXISTS idx_session_locks_phase ON session_locks(phase);

-- Comment for future archaeologists
COMMENT ON TABLE session_locks IS
  'Exclusive ownership lock per import_session. One row = one active loop. Stale locks (heartbeat > 3min old) can be atomically taken over via acquireLock(). See docs/architecture/DISCOGS_IMPORT_SESSION_LOCK_PLAN.md';
```

**Anwendung:** Via Supabase MCP `apply_migration` (empfohlen) oder SQL Editor. Idempotent, kann mehrfach laufen.

## 9 Deployment-Strategie

### 9.1 Reihenfolge

1. **Migration applizieren** (Supabase MCP `apply_migration`)
   — Neue Tabelle `session_locks` ist ab diesem Moment verfügbar.
   — Bestehende Sessions sind davon **nicht betroffen**.
2. **Code-Deploy** (Backend + Admin-UI Build + pm2 restart)
   — Neue Loops nutzen ab diesem Moment `session_locks`.
   — Noch laufende alte rc25-Loops? Siehe §9.2.
3. **Smoke-Test** mit einer kleinen Collection (~10 items, 1 Batch)
4. **CHANGELOG** Eintrag rc26

### 9.2 In-Flight Sessions zur Deploy-Zeit

Wenn zum Deploy-Zeitpunkt ein rc25-Commit-Loop läuft: dessen Prozess wird durch `pm2 restart` abgebrochen. Die Session bleibt in `status='importing'` mit stale `last_event_at`. Ein neuer Loop (via UI Auto-Restart oder User-Click auf Resume) wird gestartet und:

- liest `session.commit_progress` (noch rc25-format mit run_token → wird ignoriert)
- liest `completed_batches_*` (funktioniert weiter — gleiche Semantik)
- acquired lock via neue `acquireLock()` — das rc25 run_token in JSONB wird nicht weiter beachtet
- läuft normal weiter

Kein Daten-Verlust. Die rc25-era Sessions werden nur in einem Zombie-Zustand hängen bis sie durch den User gestartet werden.

**Empfehlung:** Vor dem Deploy checken ob aktive Sessions laufen:
```sql
SELECT id, status, collection_name, last_event_at
FROM import_session
WHERE status IN ('fetching','analyzing','importing')
  AND created_at > NOW() - INTERVAL '6 hours';
```
Wenn ja: **nicht deployen** bis sie fertig sind oder bewusst abgebrochen werden.

### 9.3 Rollback

Wenn rc26 Probleme macht:
1. Code-Revert via `git revert <commit>` und redeploy
2. Migration NICHT zurückrollen — `session_locks` als leere Tabelle stehen lassen (kein Schaden, alter Code ignoriert sie)
3. rc25-Code funktioniert wieder wie zuvor

Die Migration ist **additive** — kein schema-breaking change.

## 10 Testing-Plan

Alle Tests manuell (kein e2e-Framework in diesem Projekt).

### 10.1 Happy Path Tests

**Test 1: Fresh Fetch → Analyze → Commit (small collection)**
- Upload 10-row Test-CSV (z.B. Sub-Set von Frank Inventory)
- Fetch → erwartet: neuer Lock in `session_locks`, heartbeat bumped alle 30s, nach Done: Lock released (DELETE)
- Analyze → gleicher Check für phase='analyzing'
- Commit → gleicher Check für phase='importing' + completed_batches_* korrekt populiert

Verification SQL:
```sql
-- During run:
SELECT * FROM session_locks WHERE session_id = ?;
-- Expected: 1 row with fresh heartbeat_at

-- After run:
SELECT * FROM session_locks WHERE session_id = ?;
-- Expected: 0 rows (lock released)

SELECT commit_progress FROM import_session WHERE id = ?;
-- Expected: { phase: 'done', counters: {...}, completed_batches_*: [...] }
-- Should NOT have: run_token
```

**Test 2: Resume nach Cancel**
- Fetch → OK
- Analyze → OK
- Commit starten, nach 2 Batches cancel klicken
- `session_locks` Row: expected gelöscht
- `commit_progress`: expected `phase='cancelled'` + `completed_batches_*` preserved + `run_id` preserved (K2 fix)
- Re-click "Approve & Import"
- Expected: processInBatches skipped die 2 already-committed batches, läuft mit gleichem run_id weiter (K1 fix)
- `import_log` zeigt alle Einträge unter einem einzigen run_id

### 10.2 Concurrent-Run Tests

**Test 3: Double-POST von der UI**
- Commit starten
- Sofort in DevTools manuell einen zweiten POST an `/admin/discogs-import/commit` mit gleicher session_id schießen
- Expected: Zweiter POST returned `{ already_running: true }`, kein zweiter Loop wird gespawned
- Verification: `SELECT COUNT(*) FROM session_locks WHERE session_id = ?` → 1

**Test 4: Stale Lock Takeover**
- Commit starten
- Manuell via SQL `heartbeat_at` der session_locks Zeile auf `NOW() - INTERVAL '5 minutes'` setzen (simuliert gestorbenen Loop)
- UI Auto-Restart triggert neuen POST (nach 180s) oder manuell POST
- Expected: `acquireLock()` nimmt das alte Lock atomically über, neuer `owner_id`, läuft weiter
- Alter Loop (simuliert): sein nächster `validateLock()` call returned false → `batchTrx.rollback()` + clean exit, kein Doppel-Write

### 10.3 Crash-Recovery Tests

**Test 5: pm2 Restart während Commit**
- Commit mit ~500 Items starten
- Während new_inserts Phase: `ssh vps 'pm2 restart vodauction-backend'`
- Expected: Loop stirbt mit dem Prozess, `session_locks` Zeile bleibt mit alter `heartbeat_at`
- UI polled, erkennt `last_event_at > 180s`, fired Auto-Restart POST
- Backend: `acquireLock` sieht stale heartbeat, nimmt über, liest `completed_batches_*`, skipped die schon gecommitteten, läuft weiter
- Verification: `import_log` zeigt alle rows, keine Doppel-Einträge (wegen ON CONFLICT DO NOTHING)

**Test 6: Heartbeat Lost (weird case)**
- Commit starten, 1 Batch committen
- Manuell via SQL: `UPDATE session_locks SET owner_id='hostile' WHERE session_id=?` (simuliert hostile takeover)
- Nächster `validateLock()` vor dem nächsten batchTrx.commit(): returned false
- Loop rolled back pending batch, bails clean
- Session bleibt mit dem hostile-owner → in echten Szenarien passiert das nur durch echten Resume-Takeover, ist also safe

### 10.4 Data Integrity Tests

**Test 7: Keine Doppel-Einträge bei Resume**
- Kompletter Frank Collection 03 Import (~1000 items)
- Pro Phase einmal mid-phase pm2 kill + Resume
- Am Ende: `SELECT action, COUNT(*), COUNT(DISTINCT release_id) FROM import_log WHERE run_id = ? GROUP BY action`
- Expected: COUNT = COUNT(DISTINCT release_id) für jede action, keine Duplikate
- Expected: Release-Tabelle zeigt erwartete Counts (inserted + linked + existing = total)

## 11 Scope-Ausschlüsse (explizit nicht in diesem Plan)

- **Redis-basierte Locks** — aktuell nicht benötigt, Postgres-only ist einfacher
- **Multi-Session Parallel-Commits** — nur 1 Session-Lock pro session_id, aber verschiedene Sessions können parallel laufen (wurde bisher schon unterstützt, bleibt so)
- **Feature-Flag für Gradual Rollout** — zu klein für Flag, entweder alles oder nichts
- **Performance-Optimierung** der Fuzzy-Match Phase — out of scope
- **Neue UI-States oder Banner** — UI-Änderungen minimal: Auto-Restart-Logik bleibt, ggf. Cooldown entfernen
- **Retry-Policy bei Transient DB-Errors** — `validateLock` ist optimistisch, heartbeat ist tolerant, aber kein echter Retry-Loop
- **Metrics/Observability** — bleibt pm2 logs + Supabase MCP queries
- **Alte Sessions aufräumen** — Zombie-Cleanup-Job bleibt wie er ist (6h-Filter in history endpoint)

## 12 Abschätzung Implementierungs-Aufwand

| Schritt | Dauer | Dateien betroffen |
|---|---|---|
| SQL Migration schreiben | 15 min | `backend/scripts/migrations/2026-04-12_session_locks.sql` |
| Migration via Supabase MCP apply | 5 min | — |
| Lock Helper in `discogs-import.ts` schreiben | 30 min | `backend/src/lib/discogs-import.ts` |
| commit/route.ts Umbau | 90 min | `backend/src/api/admin/discogs-import/commit/route.ts` |
| fetch/route.ts Umbau | 20 min | `backend/src/api/admin/discogs-import/fetch/route.ts` |
| analyze/route.ts Umbau | 20 min | `backend/src/api/admin/discogs-import/analyze/route.ts` |
| K1 effectiveRunId Fix | 10 min | `commit/route.ts` |
| K2 finalizeCancel Fix | 15 min | `commit/route.ts` |
| K2+ run_id in allen Terminal-States (C4) | 10 min | `commit/route.ts` |
| Phase-Preconditions in POST-Handlers (C2) | 15 min | `fetch/analyze/commit route.ts` |
| Terminal-Write validateLock Guard (C3) | 10 min | `fetch/analyze route.ts` |
| Control-Flag Preservation bei Takeover (C7) | 10 min | `commit/fetch/analyze route.ts` |
| M4 row_progress entfernen + 5s Progress-Update | 20 min | `commit/route.ts` |
| M2 rateLimit event emit | 10 min | `fetch/route.ts` |
| Lokale Tests (alle 7 Szenarien) | 90 min | — |
| Deploy + Smoke-Test auf VPS | 20 min | — |
| CHANGELOG rc26 Eintrag | 10 min | `docs/architecture/CHANGELOG.md` |
| Session-Doku Update | 15 min | `docs/sessions/...` |

**Total: ~7 Stunden** Focused Work (inkl. Codex-Amendments C1-C4). Realistisch mit kleinen Pausen ein halber Arbeitstag. Nicht abends machen, nicht unter Zeitdruck.

## 13 Design-Entscheidungen (reviewed 2026-04-12, Codex + Robin)

1. **Lock-Phase Feld:** ✅ **Behalten.** Observability-Mehrwert bei minimalem Aufwand.

2. **Heartbeat-Interval:** ✅ **30s.** 5× Safety bei 150s Threshold. 15s wäre unnötige DB-Last, 60s zu langsam für Recovery.

3. **STALE_THRESHOLD:** ✅ **150s.** Echtes Heartbeat-Signal erlaubt niedrigeren Wert als die bisherigen 180s (die auf indirektem `last_event_at` basierten).

4. **`row_progress`:** ✅ **Komplett entfernen.** `batch_committed` + 5s `commit_progress` Refresh reichen. Weniger Event-Flut im Live-Log.

5. **`startHeartbeatLoop` API:** ✅ **Callback-based** (`onLost`). Loops sind nicht signal-aware, AbortController wäre Over-Engineering.

6. **Cancel-Resume:** ✅ **Continue where left off.** Architektur ist dafür designed (`completed_batches_*`). "Reset & Re-run" als nice-to-have in zukünftigem Release.

7. **Deploy-Timing:** ✅ **Migration zuerst** (Supabase MCP), dann Backend + Admin Build, dann Smoke-Test. Nie Code vor Migration deployen. Vorher aktive Sessions checken.

## 14 Review-Checklist

- [x] Plan-Text gelesen und verstanden
- [x] §13 Fragen 1-7 beantwortet (Codex-Review + Robin Bestätigung 2026-04-12)
- [x] Codex-Review eingeholt — 4 Amendments eingearbeitet (C1-C4)
- [x] Deploy-Zeitpunkt: nach Implementation, wenn keine aktiven Sessions laufen
- [x] Migration-Text reviewed
- [x] Happy-Path Tests (§10.1) als Minimum-Verification akzeptiert

Bereit für: `git checkout -b rc26-session-locks` und loslegen.

## 15 Erfolgskriterien

Der Refactor gilt als erfolgreich wenn:

1. Alle 7 Testszenarien (§10) pass
2. Eine echte Collection (Frank 04, ~1000 items) end-to-end durchläuft ohne manuelle Intervention
3. `SELECT COUNT(*) FROM session_locks` ist 0 wenn keine aktive Session läuft
4. Live-Log zeigt **keine** row_progress Events mehr, Progress-Bar bewegt sich trotzdem flüssig
5. rc25 Code (isSupersededBy, run_token, in-batch heartbeat, mutable hoisted vars) ist komplett entfernt
6. CHANGELOG rc26 Eintrag ist geschrieben
7. Dieses Dokument ist auf Status `IMPLEMENTED` aktualisiert + Link zum Session-Log

---

**Ende des Plans.** Dieses Dokument ist die **einzige** Source of Truth für die rc26-Implementation. Wenn während der Umsetzung Fragen auftauchen die hier nicht beantwortet sind: **stoppen**, hier dokumentieren, Robin fragen, dann weiter.
