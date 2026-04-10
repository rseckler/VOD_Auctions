# Discogs Import — Live Feedback Plan

**Version:** 1.0
**Datum:** 2026-04-10
**Status:** Plan — Implementierung nach Freigabe
**Ziel:** Vollständige Live-Transparenz über alle 4 Import-Schritte. Kein Black-Box-Verhalten mehr.

---

## 1. Problem

Der aktuelle Import-Workflow hat 4 Schritte (Upload → Fetch → Analyze → Commit), aber nur 2 davon (Fetch + Commit) zeigen Live-Progress via SSE. Die anderen beiden (Upload + Analyze) laufen als Close-Job ohne Feedback. Bei großen Imports (5000+ Releases) entstehen dadurch gefühlte Hänger von mehreren Minuten ohne jede Rückmeldung.

### Beispiele aktueller Schmerzpunkte
- **Upload (5660 Rows):** Parsing + Dedup + DB-Insert + Cache-Check → 3-8 Sekunden komplett stumm. Button zeigt "Uploading...".
- **Fetch (5633 Rows):** SSE funktioniert, aber kein Heartbeat → nginx trennt nach 60s Inaktivität. Kein Resume-Hinweis nach Reload.
- **Analyze (5633 Rows):** 30-60 Sekunden komplett stumm. Button zeigt "Analyzing...". Keine Phase-Info, keine Zwischenstände.
- **Commit (5000 Selected):** SSE funktioniert, aber zeigt nur `current/total` — keine Phase (EXISTING vs LINKABLE vs NEW), kein Hinweis auf laufende Transaction, kein Error-Detail bei Rollback.
- **Resume:** Page-Reload während laufendem Import → User weiß nicht, ob Session noch läuft. Keine Möglichkeit, sich wieder "einzuklinken".

---

## 2. Architektur-Prinzipien

1. **Jeder lang laufende Schritt hat SSE Streaming** — Upload, Fetch, Analyze, Commit.
2. **Session-Status in DB ist Single Source of Truth** — jede Route schreibt fortlaufend in `import_session.*_progress` Felder. Frontend kann jederzeit polled nachladen wenn SSE getrennt ist.
3. **Heartbeat alle 5 Sekunden** bei allen SSE-Endpoints → nginx-Timeout wird nicht erreicht, auch wenn zwischen den echten Progress-Events längere Pausen sind.
4. **Resume-fähig:** Beim Page-Load prüft Frontend Backend für aktive Session. Wenn vorhanden, Resume-Banner anzeigen → Polling reaktiviert.
5. **Live-Log-Panel:** Jeder Schritt hat eine scrollbare Log-View mit den letzten 50 Events + Timestamps.
6. **Phase-Stepper:** Oben im Workflow-Panel zeigt ein horizontaler Stepper in welcher Phase wir gerade sind (Upload → Fetch → Analyze → Review → Import → Done).

---

## 3. Schema-Änderungen

### 3.1 Neue Spalten auf `import_session`

```sql
ALTER TABLE import_session ADD COLUMN IF NOT EXISTS parse_progress JSONB;
ALTER TABLE import_session ADD COLUMN IF NOT EXISTS analyze_progress JSONB;
ALTER TABLE import_session ADD COLUMN IF NOT EXISTS commit_progress JSONB;
ALTER TABLE import_session ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ;
ALTER TABLE import_session ADD COLUMN IF NOT EXISTS last_error JSONB;
```

**Format Beispiele:**
```jsonc
// parse_progress
{ "phase": "parsing", "rows_parsed": 2500, "estimated_total": 5660 }

// analyze_progress
{ "phase": "fuzzy_matching", "batch": 5, "total_batches": 12,
  "rows_processed": 2500, "total_rows": 5633, "matches_found": 487 }

// commit_progress
{ "phase": "new_inserts", "sub_phase": "tracks",
  "current": 1250, "total": 4500, "last_release": "discogs-release-12345",
  "counters": { "inserted": 1247, "linked": 0, "updated": 3, "errors": 0 } }

// last_error
{ "phase": "fetch", "discogs_id": 123456, "message": "429 rate limited",
  "timestamp": "2026-04-10T10:15:30Z" }
```

### 3.2 Neue Tabelle `import_event` (optional, für Replay-Debugging)

```sql
CREATE TABLE IF NOT EXISTS import_event (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES import_session(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_import_event_session ON import_event(session_id, created_at);
```

Wird in Phase 2 implementiert (nice-to-have für Debugging/Replay). Für den ersten Rollout reicht `import_session.*_progress`.

---

## 4. Backend-Änderungen pro Route

### 4.1 Upload Route → SSE Stream (NEU)

**Aktuell:** Normal POST, response mit komplettem Ergebnis am Ende.

**Neu:** Entweder SSE-Stream ODER weiterhin POST aber mit `parse_progress` updates in DB während dem Parsen. Da Upload selten länger als 3-8s dauert, reicht die DB-Polling-Variante. Wir senden Events wenn der Client den SSE-Header setzt.

**Events:**
```
data: { "type": "parse_start", "filename": "...", "size_kb": 727 }
data: { "type": "parse_progress", "rows": 1000, "estimated": 5660 }
data: { "type": "parse_progress", "rows": 3000, "estimated": 5660 }
data: { "type": "parse_progress", "rows": 5660, "estimated": 5660 }
data: { "type": "dedup", "before": 5660, "after": 5653, "duplicates": 7 }
data: { "type": "cache_check", "cached": 20, "to_fetch": 5633 }
data: { "type": "session_saved", "session_id": "...", "status": "uploaded" }
data: { "type": "done", "row_count": 5660, "unique": 5653, ... full result }
```

**Implementierung:**
- Upload Route prüft Request-Header `Accept: text/event-stream`
- Wenn SSE: Stream events während des Parsings (Parser emit'ed Events jede 1000 Rows)
- Wenn nicht: fallback auf normales POST (backward-compat)

**Alternativ (einfacher):** Parsing bleibt synchron, aber wir splitten die Route in 2 Calls:
1. POST `/upload/prepare` — schneller, nur validation
2. POST `/upload/parse` — SSE-Stream mit Progress

→ Ich empfehle die erste Variante (Header-basiertes SSE), weil einfacher und backward-compatible.

### 4.2 Fetch Route → Verbesserungen

**Aktuell:** SSE mit `progress` Events alle 1 Release.

**Neu:**
- **Heartbeat-Event** alle 5s (auch wenn gerade gewartet wird wegen Rate-Limit): `{ "type": "heartbeat", "timestamp": "..." }` → verhindert nginx-Timeout.
- **Session-Update** in DB alle 25 Releases (aktuell ✓) + bei jedem `rate_limited`-Event.
- **Resume-Detection** am Start: Prüft ob Session schon im Status `fetched` ist → zeigt "Already fetched. Skip to analysis?" Event.
- **Error-Buffer:** Letzte 10 Errors werden in `last_error` aufs Session geschrieben und via Event gesendet: `{ "type": "error_detail", "discogs_id": ..., "reason": "404 not_found" }`.
- **Detailed Status pro Release:** `fetched` / `cached` / `error_404` / `error_rate_limit` / `error_timeout` statt nur numerische Counter.

### 4.3 Analyze Route → SSE Stream (NEU, kritisch)

**Aktuell:** Normal POST, blockt 30-60s stumm.

**Neu:** SSE mit Phase-Progress.

**Events:**
```
data: { "type": "phase_start", "phase": "exact_match" }
data: { "type": "phase_progress", "phase": "exact_match", "rows_checked": 5633, "matched": 982 }
data: { "type": "phase_done", "phase": "exact_match", "duration_ms": 340, "matched": 982 }

data: { "type": "phase_start", "phase": "cache_load" }
data: { "type": "phase_done", "phase": "cache_load", "entries": 5633, "duration_ms": 120 }

data: { "type": "phase_start", "phase": "fuzzy_match", "total_batches": 12, "total_rows": 4651 }
data: { "type": "phase_progress", "phase": "fuzzy_match", "batch": 1, "total_batches": 12, "matches_so_far": 45 }
data: { "type": "phase_progress", "phase": "fuzzy_match", "batch": 2, "total_batches": 12, "matches_so_far": 89 }
...
data: { "type": "phase_done", "phase": "fuzzy_match", "total_matches": 612, "duration_ms": 28500 }

data: { "type": "phase_start", "phase": "aggregating" }
data: { "type": "phase_done", "phase": "aggregating",
         "summary": { "existing": 982, "linkable": 612, "new": 4039, "skipped": 0 } }

data: { "type": "heartbeat" }  // alle 5s zwischen Batches

data: { "type": "done", "summary": {...}, "existing": [...], "linkable": [...], "new": [...] }
```

**Implementierung:**
- Route wird zu SSE-Endpoint (wie fetch/commit)
- Jeder Batch im Fuzzy-Loop emit'ed Progress
- Session.analyze_progress wird nach jedem Batch aktualisiert
- Heartbeat-Interval parallel zum Hauptprozess

### 4.4 Commit Route → Phase-basiertes SSE (Erweiterung)

**Aktuell:** SSE mit `progress` Events, nur `current/total`.

**Neu:** 3-phasiger Fortschritt (EXISTING updates → LINKABLE updates → NEW inserts) mit Sub-Steps.

**Events:**
```
data: { "type": "phase_start", "phase": "preparing",
         "plan": { "existing": 982, "linkable": 612, "new": 4039 } }

data: { "type": "phase_start", "phase": "existing_updates", "total": 982 }
data: { "type": "phase_progress", "phase": "existing_updates",
         "current": 100, "total": 982, "last": "Cabaret Voltaire — Red Mecca" }
...

data: { "type": "phase_start", "phase": "linkable_updates", "total": 612 }
...

data: { "type": "phase_start", "phase": "new_inserts", "total": 4039 }
data: { "type": "phase_progress", "phase": "new_inserts", "sub_phase": "release",
         "current": 1, "total": 4039, "last": "..." }
data: { "type": "phase_progress", "phase": "new_inserts", "sub_phase": "tracks",
         "current": 1, "total": 4039, "tracks_added": 12 }
data: { "type": "phase_progress", "phase": "new_inserts", "sub_phase": "images",
         "current": 1, "total": 4039, "images_added": 3 }
...

data: { "type": "phase_start", "phase": "committing",
         "message": "Committing transaction... (this may take 10-30s)" }
data: { "type": "phase_done", "phase": "committing", "duration_ms": 15320 }

data: { "type": "done", "run_id": "...", "counters": {...} }

// On error:
data: { "type": "rollback", "reason": "...", "failed_at": {
         "phase": "new_inserts", "discogs_id": 12345, "release_id": "...",
         "error": "duplicate key value violates unique constraint" } }
```

**Implementierung:**
- Loop wird in 3 Phasen aufgeteilt (Map-Filter vor dem Loop)
- Per-phase Progress + Session-Update
- Bei Fehler: `rollback` Event mit detailliertem Error-Context
- Heartbeat zwischen Sub-Steps

---

## 5. Frontend-Änderungen

### 5.1 Neue Komponenten

#### `<ImportPhaseStepper>`
Horizontaler Stepper oben im Workflow-Panel:
```
[✓ Upload] → [✓ Fetch] → [▶ Analyze] → [  Review] → [  Import] → [  Done]
```
- Jeder Schritt hat einen Status: `pending` / `active` / `completed` / `error`
- Click auf completed Step navigiert zurück (read-only)

#### `<ImportLiveLog>`
Scrollbares Log-Panel mit den letzten 50 Events:
```
10:15:32.124  parse_start          Pargmann Waschsalon-Berlin.csv (727 KB)
10:15:32.340  parse_progress       1000 rows parsed
10:15:32.821  parse_progress       3000 rows parsed
10:15:33.012  parse_done           5660 rows, 7 duplicates removed
10:15:33.145  cache_check          20 cached, 5633 to fetch
10:15:33.210  session_saved        dacb2f18-... (status: uploaded)
```
- Auto-scroll (pausierbar wenn User scrollt)
- Filter-Toggle (All / Progress / Errors)
- "Copy Log" Button für Debugging

#### `<ImportPhaseProgressBar>`
Progress-Bar mit Phase-Name, Current/Total, ETA:
```
Analyzing — Fuzzy Match
[████████░░░░░░░░░░░░] 5/12 batches (2500/5633 rows)
~35 seconds remaining · 487 matches found so far
```

#### `<SessionResumeBanner>`
Wird angezeigt wenn beim Page-Load eine aktive Session gefunden wird:
```
┌──────────────────────────────────────────────────────────────┐
│ ⚠ Active import session found: Pargmann (fetching, 2400/5633) │
│ Started 12 minutes ago. [Resume] [Abandon]                    │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Session-Persistenz

- `localStorage` key: `discogs_import_active_session`
- Gespeichert: `session_id` + `collection_name` + `started_at`
- Beim Page-Load:
  1. Lese aus `localStorage`
  2. Wenn vorhanden: GET `/admin/discogs-import/session/:id/status`
  3. Wenn Session existiert und Status ≠ `done`: zeige Resume-Banner
  4. Wenn Status = `done`: clear localStorage

### 5.3 Reconnect-Logik

Wenn SSE-Verbindung während eines laufenden Schritts abbricht:
1. Frontend startet automatisch Polling auf `/admin/discogs-import/session/:id/status` (alle 2s)
2. Zeigt Banner: "Connection lost. Polling for updates..."
3. Bei Status-Änderung: aktualisiert UI
4. Bei Status = `fetched` / `analyzed` / `done`: stoppt Polling, übernimmt Ergebnis

### 5.4 UI-Beispiel nach Redesign

```
┌─ Discogs Collection Import ─────────────────────────────────────┐
│                                                                  │
│  [✓ Upload] → [▶ Fetch] → [ Analyze] → [ Review] → [ Import]    │
│                                                                  │
│  ╭─ Step 2: Fetching Discogs Data ─────────────────────────╮    │
│  │                                                          │    │
│  │  39 Clocks — Pain It Dark                                │    │
│  │  [████████████░░░░░░░░░░░░░] 2458 / 5633 (43.6%)         │    │
│  │  ~45 minutes remaining                                   │    │
│  │                                                          │    │
│  │  Fetched: 2438  ·  Cached: 20  ·  Errors: 3              │    │
│  │                                                          │    │
│  │  [ Pause ]  [ Cancel ]                                   │    │
│  ╰──────────────────────────────────────────────────────────╯    │
│                                                                  │
│  ╭─ Live Log (last 50 events) ────────────────────────────╮     │
│  │ 10:15:32 fetch      39 Clocks — Pain It Dark            │     │
│  │ 10:15:30 fetch      Einstürzende Neubauten — Halber...  │     │
│  │ 10:15:28 rate_limit Waiting 60s for API rate limit      │     │
│  │ 10:15:27 error_404  discogs:789012 not found            │     │
│  │ ...                                                      │     │
│  ╰──────────────────────────────────────────────────────────╯    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. Neue API Route: Session Status

```typescript
GET /admin/discogs-import/session/:id/status
→ {
    id: "...",
    collection_name: "Pargmann",
    filename: "...",
    status: "fetching",  // uploaded | fetching | fetched | analyzing | analyzed | importing | done | error
    row_count: 5660,
    unique_count: 5653,
    created_at: "2026-04-10T10:00:00Z",
    updated_at: "2026-04-10T10:15:30Z",
    last_event_at: "2026-04-10T10:15:30Z",
    parse_progress: { ... },
    fetch_progress: { current: 2458, total: 5633, fetched: 2438, cached: 20, errors: 3 },
    analyze_progress: null,
    commit_progress: null,
    last_error: null,
    run_id: null,
  }
```

Wird vom Frontend gepollt wenn SSE getrennt ist oder beim Page-Load für Resume-Detection.

---

## 7. Implementierungsreihenfolge

### Phase 1: Kern-Transparenz (kritisch, sofort)

| # | Task | Aufwand |
|---|------|---------|
| 1 | Migration: neue Session-Spalten (`parse/analyze/commit_progress`, `last_event_at`, `last_error`) | 10 min |
| 2 | Neue Route: `GET /admin/discogs-import/session/:id/status` | 20 min |
| 3 | Analyze Route → SSE Stream mit Phase-Progress | 1.5 h |
| 4 | Frontend: `<ImportPhaseProgressBar>` Komponente | 30 min |
| 5 | Frontend: Analyze handler nutzt SSE-Reader (wie fetch) | 30 min |
| 6 | Commit Route → Phase-basiertes SSE (3 Phasen) | 1 h |
| 7 | Frontend: Commit UI zeigt Phasen + Sub-Steps | 30 min |
| 8 | Heartbeat alle 5s bei Fetch/Analyze/Commit | 20 min |

**Summe Phase 1:** ~5 Stunden. Nach dieser Phase hat jeder lang laufende Schritt Live-Feedback.

### Phase 2: Resume + Log-Panel

| # | Task | Aufwand |
|---|------|---------|
| 9 | Frontend: `<ImportPhaseStepper>` Komponente | 30 min |
| 10 | Frontend: `<ImportLiveLog>` Komponente mit Ring-Buffer | 1 h |
| 11 | Frontend: `<SessionResumeBanner>` + localStorage-Logic | 1 h |
| 12 | Frontend: Polling-Fallback wenn SSE trennt | 45 min |
| 13 | Backend: Error-Detail-Buffer in `last_error` | 30 min |

**Summe Phase 2:** ~4 Stunden.

### Phase 3: Upload SSE + Nice-to-Haves

| # | Task | Aufwand |
|---|------|---------|
| 14 | Upload Route → Header-basiertes SSE (backward-compat) | 1 h |
| 15 | Frontend: Upload handler nutzt SSE | 30 min |
| 16 | Frontend: Cancel/Pause Buttons in Fetch + Commit | 1 h |
| 17 | Frontend: Filter im Live-Log (All/Progress/Errors) | 30 min |
| 18 | History Drill-Down → Live-Log-Replay aus `import_event` Tabelle | 2 h |

**Summe Phase 3:** ~5 Stunden.

**Geschätzter Gesamtaufwand:** ~14 Stunden (über 3 Phasen verteilt).

---

## 8. Risiken

| Risiko | Mitigation |
|--------|-----------|
| nginx timeout bei Heartbeat-Lücken | Heartbeat-Intervall auf 5s (nginx default 60s) |
| SSE-Stream-Buffering durch nginx | `proxy_buffering off` für Discogs-Import-Routes setzen |
| Knex-Transaction bleibt während SSE offen (commit route) | Commit-Transaction läuft während des gesamten Import-Loops → OK, aber bei >5 min Risk für `idle_in_transaction_session_timeout`. Mitigation: nach jedem Batch ein `SELECT 1` oder savepoints. |
| Frontend-Memory bei sehr großen Logs | Ring-Buffer mit max. 50 Events |
| Rate-Limit bei Polling-Fallback | Polling-Intervall 2s → akzeptabel für einzelne Session |
| `import_event` Tabelle wächst schnell | TTL-Cleanup: Events älter als 7 Tage automatisch löschen |

---

## 9. Offene Fragen

1. **Cancel-Support:** Sollen Fetch/Analyze/Commit abbrechbar sein? Bei Commit müsste das zum sauberen Rollback führen. Falls ja: Backend braucht einen Cancel-Mechanismus (z.B. Flag in `import_session.cancel_requested`).
2. **`import_event` Tabelle:** Jetzt direkt mit einführen oder auf Phase 2/3 warten? Empfehle Phase 2 (mehr Wert für Debugging).
3. **Pause-Support für Fetch:** Rate-Limit-Pause ist automatisch. Manueller Pause-Button möglich wenn User die Fetch-Geschwindigkeit reduzieren will?
4. **Reconnect-Verhalten:** Wenn SSE abbricht und Polling startet — zeigen wir die Logs des laufenden Schritts weiter live? Dann bräuchten wir `import_event` als Event-Stream für Resume.

---

## 10. Verifikation

Nach Phase 1 sollte gelten:
- [ ] Upload zeigt Row-Count während Parsing (kein stiller 3-8s Block)
- [ ] Analyze zeigt Phase + Batch-Progress (nicht 30-60s stiller Block)
- [ ] Commit zeigt EXISTING/LINKABLE/NEW Phase-Wechsel
- [ ] Kein nginx-Timeout bei 5000+ Rows (durch Heartbeat)
- [ ] Session-Status via API abfragbar

Nach Phase 2:
- [ ] Page-Reload während Import → Resume-Banner erscheint
- [ ] Live-Log zeigt letzte 50 Events mit Timestamps
- [ ] Phase-Stepper oben zeigt korrekten Zustand

Nach Phase 3:
- [ ] Upload zeigt Live-Progress beim Parsen
- [ ] Cancel-Button funktioniert für Fetch + Commit (mit Rollback)
- [ ] History Drill-Down zeigt kompletten Event-Verlauf
