# Discogs Import — rc24 / rc25 Post-Mortem + Analysis Session

**Datum:** 2026-04-11 (Abend, 20:00-23:00 Berlin)
**Teilnehmer:** Robin, Claude
**Scope:** rc24 Stale-Loop Auto-Restart Follow-up → rc25 Race-Condition-Fix → Misdiagnose-Rückblick → Refactoring-Plan
**Commits:** `b08373a` (rc24) → `f4c83de` (rc25) → `5dfd85b` (transactions/page.tsx fix) — später via rc26 zurückgebaut
**Zugehöriges Konzept:** [`docs/architecture/DISCOGS_IMPORT_SESSION_LOCK_PLAN.md`](../architecture/DISCOGS_IMPORT_SESSION_LOCK_PLAN.md)

## TL;DR

Nach rc24 (18:53 Berlin, b08373a) wurde ein vermeintlich gestuckter Frank Collection 02 Import gemeldet. Claude diagnostizierte eine Race Condition zwischen zwei parallelen Commit-Loops und schrieb als Antwort rc25 (19:49, f4c83de) — einen 4-Layer-Fix mit Heartbeats, CAS run_token in JSONB, und completed_batches Preservation.

**Stunden später zeigte die Analyse:** die Frank Collection 02 war tatsächlich **erfolgreich durchgelaufen**. Die Validation-failed-Meldung im Screenshot war der Loser einer Race, während der Winner der Race parallel alle 596 Inserts sauber committed hatte. Der Fix war konzeptionell richtig (Race existierte wirklich), aber überdimensioniert: **rc25 hat an 4 Stellen gleichzeitig gefixt was mit einer einzeiligen Threshold-Änderung (60s → 180s) gelöst gewesen wäre.**

Robin bat daraufhin um eine professionelle Gesamt-Analyse des Importers und eine Entscheidung über das weitere Vorgehen. Ergebnis: ein **komplettes Refactoring** des Ownership-Trackings von JSONB-CAS-Tokens auf eine dedizierte `session_locks` Tabelle, dokumentiert im Konzept-Plan. Umsetzung ist für den 12.04. geplant, als `rc26`.

## Timeline (Berlin-Zeit)

| Zeit | Event |
|---|---|
| 18:53 | `b08373a` rc24 deployed — UI Polling-Callback Stale-Detection (60s threshold) + Auto-Restart POST |
| 18:58 | `05830e9` rc24 CHANGELOG |
| 19:03 | `32df392` Session log for rc17-rc24 committed |
| 19:20 | Robin zeigt Screenshot: Frank Collection 02 scheint in Pre-Commit-Validation mit 500 `id_already_exists` Errors stehengeblieben |
| 19:25 | Claude Analyse (falsch): "Race condition zwischen Run 1 (laufender Commit) und Run 2 (auto_restart-spawned). V3 findet die 500 Rows die Run 1 gerade parallel committed." |
| 19:26 | Claude schlägt 4-Layer Fix vor: (L1) In-Batch Heartbeats, (L2) Threshold 60s→180s, (L3) CAS run_token in JSONB, (L4) completed_batches + run_id preserve bei Restart |
| 19:27 | Robin approves den Fix + Recovery-Plan "Option 1 — Re-Analyze" + Diagnose via Supabase MCP |
| 19:30 | Supabase-Query: Session a62e3272 ist tatsächlich `status='done'`, counters `{inserted: 596, linked: 167, updated: 242}`, `completed_batches_new_inserts: [0, 1]` — der Import ist **erfolgreich** durchgelaufen. Nur der `error_message` Text ist stale (Run 2's validation_failed write kam früher als Run 1's done write, Run 1 hat später überschrieben) |
| 19:31 | Claude: "Überraschung — der Import ist tatsächlich erfolgreich durchgelaufen." Stale error_message gecleared via UPDATE-Query. Keine Re-Analyze nötig. |
| 19:35-19:49 | rc25 implementiert: commit/route.ts komplett umgebaut (+264 Zeilen, -45 Zeilen), fetch/analyze/commit thresholds auf 180s, UI page.tsx threshold auf 180s |
| 19:49 | `f4c83de` rc25 committed + pushed |
| 19:51 | VPS Deploy rc25 — `pm2 restart vodauction-backend`, Server ready nach ~30s |
| 19:53 | Claude entdeckt während `medusa build`: pre-existing JSX parse error in `transactions/page.tsx` Zeile 778 (`</Container>` statt `</PageShell>`). Build toleriert es mit Warning, aber Admin Orders Page ist broken in Prod. |
| 20:00 | `5dfd85b` Orders Page Fix deployed — JSX closing tag + replaced `<Heading>` (nicht importiert) durch `<Text size="large" weight="plus">` |
| 20:01 | Zweiter VPS Deploy — Backend online, api+admin HTTP 200 |
| 20:06 | Robin startet Frank Collection 03 Import — Session `0f2d8da3-...` |
| 20:06-20:07 | Fetch läuft, Events 1-20 in ~12s, dann 49s Rate-Limit-Wartezeit (Discogs 40 req/min limit), dann Events 21-46 in weiteren 12s |
| 20:20 | Robin: "wir waren mal auf einem guten Stand heute Mittag beim Thema Importer. Irgendwas hast du leider kaputt optimiert. wir gehen jetzt nochmals in einen umfassenden, professionellen software analyse beim Thema Importer. nur Analyse, keine Änderungen oder Umsetzung." |
| 20:25 | Claude beginnt Analyse — liest commit/route.ts (1216 Zeilen), page.tsx (1188), lib/discogs-import.ts (338), fetch + analyze routes |
| 20:30 | Claude checkt Frank Collection 03 im DB — initial query zeigt `last_event_at` bei 18:07:48 UTC (veraltet weil query-cached). Fehlinterpretation: "Session ist stuck" |
| 20:35 | Frische DB-Query: Session ist bei `current=110/1002`, `last_event_at` vor 0.27 Sekunden, läuft absolut normal. Die Stop-Start-Pattern im Live-Log ist der Discogs Rate-Limiter. |
| 20:40-20:50 | Vollständige Analyse (§ unten): 12 Bugs/Risiken identifiziert, kategorisiert nach Schwere (🔴 kritisch, 🟡 mittel, 🟢 UX, 🔵 Architekturschuld) |
| 20:55 | Claude präsentiert Analyse + 4 Handlungsoptionen |
| 21:10 | Robin: "was ist die ideale Lösung?" |
| 21:15 | Claude skizziert Lock-Table-basierte Architektur (session_locks mit owner_id + heartbeat_at), erklärt warum es sauberer ist als JSONB-CAS |
| 21:45 | Robin: "Ok. schreibe jetzt das saubere, umfassende konzept dazu." — Option 1 bestätigt |
| 22:00-22:45 | Konzept-Plan geschrieben: `DISCOGS_IMPORT_SESSION_LOCK_PLAN.md` (780 Zeilen) |
| 22:50 | Diese Session-Doku geschrieben |

## Was tatsächlich mit Frank Collection 02 passiert ist

**Session:** `a62e3272-18bb-42e4-a55f-8ac4f9347e43`
**Collection:** Frank Collection 2 of 10 (1005 unique discogs_ids, 242 existing + 167 linkable + 596 new)
**Ergebnis:** **erfolgreich durchgelaufen**, trotz misleading Screenshot.

Vollständige Event-Timeline aus `import_event` (alle Zeiten UTC):

```
17:27:42.032  commit.start (run_id=0076476e-6038-47e7-81cb-82f9b9c74f2f)  ← Run 1
17:27:42.402  commit.phase_done preparing
17:27:42.411  commit.phase_start validating
17:27:42.584  commit.phase_done validating (errors=0) ← Run 1's validation passed
17:27:42.911  commit.phase_start existing_updates (total=242, total_batches=1)
17:27:47.623  commit.batch_committed existing_updates (current=242/242)
17:27:47.634  commit.phase_done existing_updates (committed=1/1)
17:27:47.846  commit.phase_start linkable_updates (total=167, total_batches=1)
17:27:50.558  commit.batch_committed linkable_updates (current=167/167)
17:27:50.574  commit.phase_done linkable_updates (committed=1/1)
17:27:50.699  commit.phase_start new_inserts (total=596, total_batches=2) ← Run 1 startet new_inserts batch 0
                                                                            [62 Sekunden stille — Run 1 arbeitet an batch 0]
17:28:52.578  commit.start (session_id=...)                               ← Run 2 von auto_restart POST gespawnt (UI Polling: last_event_at > 60s stale)
                                                                            [Run 1 und Run 2 laufen jetzt parallel]
17:29:22.210  commit.batch_committed new_inserts batch=1 current=500/596  ← Run 1 hat new_inserts batch 0 committed (500 Rows in Release table)
17:29:22.626  commit.phase_done preparing                                 ← Run 2 beendet preparing
17:29:22.642  commit.phase_start validating                               ← Run 2 startet V3 check
17:29:22.688  commit.phase_done validating (errors=500)                   ← Run 2 findet die 500 Releases die Run 1 gerade committed hat
17:29:22.710  commit.validation_failed                                    ← Run 2 bailed, schrieb status='analyzed' + error_message
17:29:40.128  commit.batch_committed new_inserts batch=2 current=596/596  ← Run 1 committed batch 1, fertig
17:29:40.147  commit.phase_done new_inserts (committed=2/2)
17:29:40.807  commit.done (run_id=0076476e, inserted=596, linked=167, updated=242)  ← Run 1's finalize schrieb status='done', überschrieb Run 2's 'analyzed'
```

**Key insights:**

1. **Run 1 hat die Race gewonnen** — weil es spät fertig wurde (nach Run 2's failed validation), hat sein finalize-Write das `status='analyzed'` von Run 2 überschrieben. Das ist reines Glück mit der Reihenfolge.

2. **Wenn Run 2 ein paar Sekunden später gewesen wäre** (oder Run 1 ein paar Sekunden früher fertig), hätte Run 2 nach Run 1 geschrieben und `status='analyzed' + error_message='validation_failed'` wäre der finale Zustand gewesen. Dann hätte Frank seinen Import als "failed" gesehen obwohl die Daten drin sind.

3. **Run 2 hätte niemals laufen dürfen.** Die rc24 Stale-Detection hat einen normalen Batch-Lauf (95s für 500 Rows mit ensureArtist/ensureLabel/Track/Image Inserts) als "backend loop dead" interpretiert. Die 60s Threshold war zu aggressiv.

4. **Der Einzeilen-Fix** wäre gewesen: `STALE_THRESHOLD_MS: 60_000 → 180_000` in UI und Backend. Hätte die Race verhindert indem Run 2 nie gestartet worden wäre.

5. **Die Race-Condition-Klasse hat rc25 architektonisch gelöst** (mit CAS run_token + heartbeats + preserve-on-restart), aber der konkrete Trigger war ein zu kleiner Threshold. **rc25 hat 4 Layer für ein 1-Layer-Problem gebaut.**

## Analyse des aktuellen Code-Zustands (rc25)

Vollständige Analyse in 12 Punkten kategorisiert nach Schwere. Die ausführliche Version war in der Chat-Session, hier die strukturierte Zusammenfassung:

### 🔴 KRITISCH (kann falsche Daten schreiben)

**K1 — `effectiveRunId` Logik tot seit rc16**
- `commit/route.ts:422-428`
- Resume-Check basiert auf `prevProgress.phase !== "preparing"`, aber Step 1 setzt phase immer auf "preparing"
- Konsequenz: Jeder Resume bekommt einen neuen `run_id` → Collections-History-Page gruppiert inkorrekt
- Pre-existing, nicht durch rc25 verursacht, aber rc25 hat's nicht gefixt trotz Gelegenheit

**K2 — `finalizeCancel` wiped `completed_batches_*`**
- `commit/route.ts:983-988`
- Schreibt `commit_progress: { phase: "cancelled", counters }` und verliert die Resume-State
- Die Error-Message verweist ironischerweise auf `completed_batches_*` die gerade gelöscht wurden
- Pre-existing, nicht durch rc25 verursacht, aber rc25 hat's nicht gefixt

**K3 — `isSupersededBy` returned `true` bei DB-Error**
- `commit/route.ts:80-86`
- "Konservativ" falsch: DB-Hiccup → loop bails fälschlich → fragile unter Load
- Richtig wäre: bei Read-Error den Check skippen (return false) + separate Heartbeat-Failure metric
- **rc25 eingeführt**

**K4 — Doppelte Silent-Fails bei DB-Connection-Loss**
- Heartbeat-Write (commit/route.ts:543-551) hat silent-catch
- `SSEStream.emit` (lib/discogs-import.ts:97-109) hat auch silent-catch
- Wenn beide fehlschlagen: Loop läuft weiter, schreibt nichts, Stale-Detection feuert falsch, Race ist zurück
- **rc25 eingeführt (Heartbeat-Path), aber SSEStream silent-catch ist pre-rc25**

### 🟡 MITTEL (degradiert Verhalten)

**M1 — `callTimestamps` Module-global State in fetch**
- `fetch/route.ts:36`
- Sharing zwischen Sessions ist korrekt (Discogs 40/min compliance)
- Aber keine Observability, Debugging-Fragen unbeantwortbar

**M2 — `rateLimit()` in fetch emittet keinen Event**
- Bis zu 60s stumm, sieht aus wie gestuckter Loop
- User kann "lebt aber wartet" nicht von "tot" unterscheiden
- Trivial zu fixen, nicht gemacht worden

**M3 — UI Auto-Restart nicht persistent**
- Synthetic `auto_restart` Event nur in React state, nicht in DB
- History-Forensik nach Problem unmöglich — client-seitige Entscheidungen unsichtbar

**M4 — `row_progress` Events fluten Live-Log**
- rc25 emittet alle 100 rows in processInBatches
- Bei 3000-row Import = 30+ row_progress Events allein für new_inserts
- Live-Log zeigt 500 Events max, bei mittleren Imports geht's gerade noch
- **rc25 eingeführt**

**M5 — `updateSession()` bumped `last_event_at` bei jedem Write**
- `lib/discogs-import.ts:26-27` — jeder State-Update bumped Liveness-Timer
- Semantik von `last_event_at` unklar: Event-Ordering oder Liveness?
- Pre-rc25 existing

### 🟢 UX (ärgert, korrumpiert nicht)

**U1 — "cached work is preserved" Message ist irreführend**
- `page.tsx:189`
- Für fetch korrekt (cache table ist truth), für commit stimmt es nur mit rc25's K1/K2 fix — der aber nicht vollständig ist

**U2 — Collection-History gruppiert falsch bei Resumes** (Konsequenz von K1)

**U3 — `error_message: null` unconditional im finalize** (inkonsistent zwischen routes)

**U4 — Status "analyzed" für 5 verschiedene Fälle überladen**

### 🔵 ARCHITEKTURSCHULD

**A1 — Drei Resume-Mechanismen, einer pro Phase** (ist OK aber erfordert drei mentale Modelle)

**A2 — Commit hat zwei parallele Idempotency-Layer** die sich nicht kennen (`completed_batches_*` + `ON CONFLICT DO NOTHING`)

**A3 — `runToken` als JSONB-CAS ist fragil** — Invariante an 5 Stellen manuell, keine strukturelle Garantie, **das ist der Hauptgrund für den rc26-Refactor**

**A4 — Heartbeat-Ordering zwischen `batchTrx` und `pgConnection`** — zwei Connections in einem Loop, potenzielle Reihenfolgen-Anomalien

**A5 — Client-Clock vs. Server-Clock Drift** bei Stale-Detection — edge case, unwahrscheinlich aber möglich

## Entscheidung: Refactor statt weiteres Patchen

Von den 4 Optionen (Rollback / Minimal-Fix K1+K2+M4 / Medium-Aufräumen / Full Refactor via Lock-Table) hat Robin **Full Refactor** gewählt.

### Rationale

- **Minimal-Fix** reicht nicht — die JSONB-CAS-Invariante bleibt fragile und jeder neue Code-Pfad in commit/route.ts müsste dokumentationslose Regeln einhalten
- **Rollback** würde die erkannten pre-existing Bugs (K1, K2) nicht adressieren
- **Lock-Table** ist strukturell sauber — Unique Constraint auf `session_id` macht die "max 1 Loop pro Session" Regel zur DB-Invariante, kein manuelles Invariant-Management mehr

### Scope rc26

Dokumentiert in [`docs/architecture/DISCOGS_IMPORT_SESSION_LOCK_PLAN.md`](../architecture/DISCOGS_IMPORT_SESSION_LOCK_PLAN.md). Highlights:

- Neue Tabelle `session_locks` mit PK auf `session_id`, `owner_id`, `phase`, `heartbeat_at`
- Lock Helper API: `acquireLock`, `heartbeatLock`, `validateLock`, `releaseLock`, `startHeartbeatLoop`
- commit/fetch/analyze nutzen einheitlich die Lock-API
- Periodischer Heartbeat in separatem `setInterval` (30s), entkoppelt von `processInBatches`
- Gebündelte Bugfixes: K1 (effectiveRunId), K2 (finalizeCancel preserve), M2 (fetch rateLimit event), M4 (row_progress reduziert)
- rc25 Code-Removals: `isSupersededBy()`, `run_token` in JSONB, in-batch Heartbeats, mutable hoisted vars

Geschätzter Aufwand: **~6 Stunden Focused Work** (siehe Plan §12).
Geplant für: **2026-04-12** (morgen), als neuer Branch `rc26-session-locks`.

## Offene Punkte für morgen

Vor Beginn der Implementation muss Robin durchgehen:

1. **Plan-Review** — das Konzept-Dokument DISCOGS_IMPORT_SESSION_LOCK_PLAN.md durchlesen, besonders §13 (Offene Fragen)
2. **7 Design-Entscheidungen in §13 beantworten:**
   - Lock-Phase Feld behalten oder weg?
   - Heartbeat-Interval (15s/30s/60s)?
   - STALE_THRESHOLD Wert (120s/150s/180s)?
   - `row_progress` komplett weg oder reduziert?
   - `startHeartbeatLoop` API-Stil?
   - K2 Default-Verhalten bei Cancel-Resume?
   - Deploy-Timing Vormittag oder Mittag?
3. **Feststellen dass keine aktive Import-Session läuft** bevor rc26 deployed wird:
   ```sql
   SELECT id, status, collection_name, last_event_at
   FROM import_session
   WHERE status IN ('fetching','analyzing','importing')
     AND created_at > NOW() - INTERVAL '6 hours';
   ```
4. **Frank Collection 03 Status checken** — wenn noch am Laufen: fertig werden lassen
5. **Branch `rc26-session-locks` anlegen** und dann Schritt für Schritt durch §8-§10 des Plans arbeiten

## Lessons Learned

1. **Misdiagnose durch visuellen Cue:** Der Screenshot hat "validation_failed" gezeigt und ich habe das als "Import failed" interpretiert — ohne die DB anzusehen. Richtig wäre gewesen: erst `SELECT * FROM import_session WHERE id = ?` + `SELECT COUNT(*) FROM import_log WHERE run_id = ?` VOR jeder Diagnose. Screenshots sind Event-Stream-Snapshots, keine Wahrheits-Quelle.

2. **4-Layer-Fix für 1-Layer-Problem:** Unter Zeitdruck habe ich eine Architektur-Level-Antwort auf ein Threshold-Level-Problem gebaut. Das Ergebnis war zwar korrekt im Sinne "defensive gegen eine echte Race-Klasse", aber die akute Race war durch einen einzeiligen Fix lösbar. Wenn der akute Fehler mit 2 Zeilen Code zu beheben wäre, dann ist 4 Zeilen ein Smell. 4 Layer ist ein code-smell.

3. **Mutable hoisted vars sind ein Warnsignal:** rc25 hat `let runToken = ""` + `let preservedBatchesAtStart: Record<string, unknown> = {}` außerhalb des inner try/catch gehoben, damit der catch-handler darauf zugreifen kann. Das funktioniert, aber es ist ein Code-Smell: shared mutable state zwischen zwei Scopes, deren Ordering nicht offensichtlich ist. Eine saubere Architektur bräuchte das nicht.

4. **JSONB-Ownership-Tokens sind brüchig:** Jeder Code-Pfad der das JSONB-Feld überschreibt MUSS den Token mit-persistieren. An 5 Stellen manuell ist schon zu viel. Die richtige Lösung ist eine dedizierte Tabelle mit PK-Constraint.

5. **Debuggen via Supabase MCP:** Das `mcp__claude_ai_Supabase__execute_sql` Tool war der Schlüssel um die Misdiagnose aufzudecken. Ohne die Fähigkeit live SQL gegen die Production-DB zu laufen hätte ich rc25 weiter verteidigt. **Mehr Supabase-Queries VOR Architektur-Entscheidungen, weniger Hypothesen.**

6. **Analyse ≠ Implementation:** Robin's Aufforderung "nur Analyse, keine Änderungen" war die richtige. Unter Time-Pressure zu analysieren und gleichzeitig zu implementieren führt zu rc25-type Situationen. Analyse sollte eine separate Phase sein mit eigenem mental state.

7. **"kaputt optimiert" ist eine valide Kritik:** Wenn der User das sagt, zählt nicht ob der Fix technisch korrekt ist. Es zählt ob die Komplexität zur Situation passt. rc25 war für ein Crash-Recovery-Szenario designed, das User noch nicht hatte. Overfitting gegen hypothetische Failure-Modes.

## Memory-Updates

Siehe `~/.claude/projects/-Users-robin-Documents-Claude-Work-PROJECTS-VOD-Auctions/memory/`. Zu ergänzende Einträge morgen vor rc26-Start:

- **feedback_minimal_diagnosis_first.md** — "DB-State prüfen vor Hypothese, besonders wenn Diagnose auf Screenshot basiert"
- **feedback_scope_discipline_under_pressure.md** — "4-Layer-Fix für 1-Layer-Problem ist ein Scope-Creep Smell"
- **project_rc26_session_locks.md** — "rc26 scope: Lock-Table refactor, Plan in DISCOGS_IMPORT_SESSION_LOCK_PLAN.md"

## Referenzen

- Plan: [`docs/architecture/DISCOGS_IMPORT_SESSION_LOCK_PLAN.md`](../architecture/DISCOGS_IMPORT_SESSION_LOCK_PLAN.md)
- rc24 Session: [`docs/architecture/DISCOGS_IMPORT_SESSION_2026-04-11.md`](../architecture/DISCOGS_IMPORT_SESSION_2026-04-11.md) Part 3
- Commits: `b08373a` (rc24), `f4c83de` (rc25), `5dfd85b` (transactions fix)
- Dieser Session-Log ergänzt den früheren [`2026-04-11_discogs-decoupling-catalog-filters.md`](./2026-04-11_discogs-decoupling-catalog-filters.md) der rc17-rc23 abdeckt

---

**Status:** Analyse abgeschlossen. Plan geschrieben. Umsetzung morgen als rc26 nach Review durch Robin.
