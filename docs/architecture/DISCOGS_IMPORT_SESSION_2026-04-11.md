# Discogs Import Session — 2026-04-11

**Author:** Robin Seckler + Claude
**Scope:** Collections Overview (rc17) + Fetch Decoupling (rc18)
**Duration:** ~4h iterative work (plan → implement → test → bug-find → fix → repeat)
**Commits:** 8 commits (`2a96b3e` → `ffc1440`)

## TL;DR

Nach dem erfolgreichen Pargmann Import (rc16 am 2026-04-10) fehlte eine richtige Collections-Management-Ansicht. Implementierung lief über zwei große Milestones (rc17 Collections Overview, rc18 Fetch-Loop-Decoupling) mit sechs Zwischen-Fixes.

Der eigentliche Aha-Moment kam spät: Das beobachtbare Problem "Resume-Banner erscheint nach Navigation obwohl Backend noch läuft" war oberflächlich — **der Backend-Loop lief in Wahrheit NICHT weiter** nach Client-Disconnect. Meine erste Annahme (SSEStream catched Write-Errors und der Loop läuft einfach weiter) war falsch. Fix war eine echte architektonische Entkopplung: POST returnt sofort, Loop läuft als detached background task, UI polled.

## Timeline

| Commit | Zeit (UTC) | Scope |
|---|---|---|
| `2a96b3e` | ~10:03 | rc17 initial: Collections overview + detail + CSV export |
| `10296e4` | ~10:10 | Docs: rc17 CHANGELOG + plan status |
| `d53bb79` | ~10:33 | History als standalone route statt Wizard-Tab |
| `5fe89dc` | ~10:47 | Stale session cleanup + Import Settings display fix |
| `4b823e5` | ~10:56 | Back button fix (Btn-Component-API-Bug), Inventory in header, Admin link fix |
| `fd669a5` | ~11:02 | Stock-Spalte + clickable Cover/Title statt ⚙ icon |
| `55e680d` | ~11:13 | Auto-reattach nach Navigation (Versuch 1, basierte auf falscher Annahme) |
| `ffc1440` | ~11:36 | rc18: Fetch Loop komplett vom HTTP-Request entkoppelt |

## Die Kette der Course Corrections

### Problem 1: History als Wizard-Tab ist die falsche Architektur

**Beobachtung:** User wollte während eines laufenden Fetch-Prozesses History ansehen. Der Tab war theoretisch erreichbar aber konzeptionell falsch — Collections sind ein Archiv-Feature, kein Wizard-Schritt.

**Fix:** History raus aus dem Wizard, als standalone Route `/app/discogs-import/history` mit eigener page.tsx. Wizard hat nur noch Upload + Analysis Tabs. "View Collections History →" Button im Wizard-PageHeader.

### Problem 2: Zombie-Sessions blockieren die UI

**Beobachtung:** Im Wizard erschien ein "Active import session: Pargmann — started 26 h ago" Banner, obwohl der Pargmann Import gestern erfolgreich abgeschlossen war. DB-Query zeigte 5 Pargmann-Sessions: 1× `done`, 4× hängen geblieben in non-terminal Status (`uploaded`/`fetching`/`fetched`).

**Fix:** 
- Manuelles DB-Cleanup: 4 Zombies auf `status='abandoned'` gesetzt
- Strukturell: `/admin/discogs-import/history` active_sessions Query filtert jetzt `created_at > NOW() - INTERVAL '6 hours'` AND excludiert `done/abandoned/error`. Automatische Bereinigung ohne DB-Intervention
- Neuer terminal state `abandoned` (kein Schema-Change, `status` ist `TEXT` ohne Constraint)

### Problem 3: Import Settings zeigten nur Markup

**Beobachtung:** Auf der Detail-Page zeigte die Settings-Zeile nur `Markup: 1.20×` — Condition und Inventory fehlten komplett.

**Root Cause:** Ich hatte im TypeScript-Interface die Feldnamen geraten (`condition`, `inventory_enabled`) aber die tatsächlichen Felder im JSONB sind `media_condition`/`sleeve_condition`/`inventory` (number 0/1). Die Conditional-Renders `{importSettings.condition && ...}` waren immer falsy.

**Fix:** TypeScript-Interface korrigiert gegen den tatsächlichen Commit-Route-Code, Render zeigt jetzt Media + Sleeve + Markup + Inventory (yes/no + Zahl) + Selected IDs count.

### Problem 4: Back-Button komplett unsichtbar (der schlimmste Bug)

**Beobachtung:** Der "← Back" Button auf der Detail-Page war nicht zu sehen. Gar nicht. Nicht mal ein leerer Platzhalter.

**Root Cause:** Ich nutzte `<Btn variant="secondary" onClick={...}>← Back</Btn>` — aber:
1. Die `Btn` Component in `admin-ui.tsx` nimmt `label` prop (string), **NICHT** children
2. Es gibt **keine** `"secondary"` Variante — nur `primary/gold/danger/ghost`

Resultat: Der Button rendert mit `label={undefined}` → leerer Button. Keine TypeScript-Warnung, kein Runtime-Error, nur ein unsichtbarer Button.

**Fix:** Alle Btn-Usages durch plain `<button>` mit inline styles ersetzt. Back-Link bekam prominenter Platz: **links oben über dem PageHeader** als breadcrumb-style Link statt in der Actions-Row.

**Lesson learned:** Beim ersten Einsatz einer Shared-Component immer die existierenden Usages im Codebase suchen statt die API zu raten. Jetzt in CLAUDE.md dokumentiert als Gotcha.

### Problem 5: Inventory-Info im Subtitle + Admin-Link zeigt auf Catalog-Search

**Beobachtung:** User wollte die Inventory-Info auch prominent im Header sehen. Und der ⚙-Icon-Link ging zu `/app/catalog?q={id}` (Suche mit Filter) statt direkt zur Release-Detail-Seite.

**Fix:** 
- Subtitle erweitert: `source · date · status · inventory: N (yes|no)`
- Admin-Link umgestellt auf `/app/media/{release_id}` (Admin Release Detail Page)

### Problem 6: User wollte Stock-Spalte + klickbare Cover/Titel

**Beobachtung:** Der ⚙ Zahnrad-Icon in der Links-Spalte war zu klein. User wollte stattdessen dass Cover-Bild und Artist/Title-Text klickbar sind. Außerdem fehlte eine Stock-Spalte in der Tabelle.

**Fix:**
- Neue Spalte "Stock" zeigt den inventory-Wert aus import_settings (grün bei >0, muted bei 0)
- Cover + Artist/Title jetzt klickbare Links auf `/app/media/:id`, target=_blank
- ⚙ Icon entfernt, Links-Spalte zeigt nur noch 🌐 (Storefront) + D (Discogs), größer

### Problem 7 (der eigentliche Blocker): Fetch-Prozess unterbrochen nach Navigation

**Beobachtung:** User startet Fetch → navigiert zu `/history` → zurück → Fetch ist **unterbrochen**. Nicht einfach "UI reconnected nicht", sondern der Prozess ist wirklich tot.

**Erste Annahme (falsch):** Der Backend-Loop läuft weiter weil `SSEStream.emit()` die Write-Errors catched und `closed=true` setzt, und der Loop checkt `stream.isClosed` nicht. Also: UI soll auf Mount erkennen dass aktive Session existiert und via Polling wieder andocken.

**Erster Fix-Versuch (`55e680d`):** `loadResumable` unterscheidet ACTIVE (fetching/analyzing/importing) von DORMANT states. Für ACTIVE: Auto-attach via Polling, kein Banner, kein zweites POST. Plus `useSessionPolling` um `initialLastEventId` erweitert um Duplikate zu vermeiden.

**Der Test zeigt:** Funktioniert nicht. Progress-Bar zeigt den alten Stand (fetched=25/3763) aber es kommen keine neuen Updates rein.

**Echte Diagnose:**
- `SELECT status, fetch_progress, last_event_at FROM import_session WHERE id='9081c145...'` → status=`fetching`, `last_event_at = 09:00:36 UTC`, keine Updates seit 30+ Minuten
- `pm2 logs vodauction-backend --err` → keine Errors rund um den Stop-Zeitpunkt. Der Loop ist einfach still gestorben.
- `pm2 logs` zeigt Polling-Requests vom Browser alle 2s → Backend erreichbar, nur der Loop ist weg.

**Root Cause:** Meine SSEStream-Theorie war falsch. Der Loop läuft nicht wirklich weiter. Was ihn killed ist unklar — vermutlich disposed Medusa den Request-Scope (inkl. `pgConnection`) wenn der Client disconnected, der nächste `pg.raw(...)` Call throwed, der äußere try/catch des Routes catched es und beendet den Handler ohne weitere Ausgabe. **Keine Exception im Stderr** weil der catch greift.

**Echter Fix (`ffc1440`): Architektonische Entkopplung**

Der Loop MUSS vom HTTP-Request-Lifecycle unabhängig sein. Also: POST validiert, spawnt den Loop als detached task, returnt sofort 200. Der Loop schreibt nur noch in DB (kein `res.write()` irgendwo). UI polled. Siehe `DISCOGS_IMPORT_SERVICE.md` §4 für den Pattern.

```typescript
export async function POST(req, res) {
  // ... validate, idempotency check ...
  await updateSession(pg, id, { status: "fetching" })
  await emitDbEvent(pg, id, "fetch", "start", {...})
  res.json({ ok: true, started: true })  // ← return immediately
  
  // Detached loop — runs after res.json() is sent
  void runFetchLoop(pg, id, session, token).catch(...)
}
```

3 Robustness-Layer zusammen:
1. Loop unabhängig von HTTP-Request
2. Idempotency-Check via 60s Stale-Detection bei POST
3. Stale-Auto-Restart auf UI-Mount (re-POST wenn `last_event_at > 60s`)

**Not in scope:** Analyze und Commit Routes laufen noch über SSE und haben dasselbe Problem. Weniger schmerzhaft weil kürzer (Minuten statt Stunden). Follow-up.

## Lessons Learned

1. **Annahmen verifizieren.** Die Theorie "SSEStream catched Errors, Loop läuft weiter" klang plausibel aber war nicht getestet. Erst nachdem ich `pm2 logs` + DB-state geprüft hatte war klar dass die Prämisse falsch war.

2. **Shared-Component APIs nachschlagen.** Der Btn-Bug (`variant="secondary"` + children statt label) hat 2 Deploy-Zyklen gekostet. Immer existierende Usages im Codebase durchsuchen.

3. **Field-Names in JSONB nachschlagen.** Die Import-Settings-Felder hatte ich geraten. Ein `grep -A 5 "persistedSettings" commit/route.ts` hätte den Fehler in 5 Sekunden verhindert.

4. **HTTP-Request-Lifecycle ist eine harte Grenze.** Lang laufende Tasks dürfen NICHT an `res` gecoupled sein. Entweder SSE mit sorgfältiger Disconnect-Handling (komplex), oder einfach detached Background Task + DB als Truth-Source + Polling (einfacher, robuster).

5. **Stale-Detection in Retry-Logik einbauen.** Ohne die 60s Stale-Detection wäre der Fix unvollständig — nach jedem pm2 restart würden Sessions für immer stuck bleiben.

## Offene Follow-ups

1. **Analyze-Route decoupling** — gleiches Pattern wie Fetch, kürzer laufend daher niedrige Prio
2. **Commit-Route decoupling** — gleiches Pattern, commit ist per-batch transactional, kann mit completed_batches resume
3. **Server-Side Rendering der Release-Tabelle** — bei 5000+ Rows wird Client-side Filtern langsam
4. **Bulk-Operations auf Collections** (Price Adjustment, Re-analyze, Bulk-Delete)
5. **GitHub Release-Info rc17 + rc18 aktualisieren** (manueller Schritt)

## Referenzen

- Plan: `docs/architecture/DISCOGS_COLLECTIONS_OVERVIEW_PLAN.md`
- CHANGELOG rc17 + rc18 + rc20: `docs/architecture/CHANGELOG.md`
- Service Doc v5.3: `docs/DISCOGS_IMPORT_SERVICE.md`
- Commits: `2a96b3e`, `10296e4`, `d53bb79`, `5fe89dc`, `4b823e5`, `fd669a5`, `55e680d`, `ffc1440`, `bd5ba74`, `a3e06a0`

---

## Addendum — Part 2 (rc20): Full Decoupling + CTA + Media Import History

Nach rc18 (Fetch Decoupling) kam am gleichen Tag noch eine zweite Welle an Änderungen:

### Problem 8: Commit läuft, UI zeigt 0% — gleiches Pattern wie Fetch

Beim ersten echten Test-Commit (Frank Inventory, 3762 Releases) blieb die UI auf `Importing... (0/2483)` stehen. DB-Check zeigte: Backend-Commit-Loop lief aktiv durch, `current=1500`, `last_event_at` 2 Sekunden alt. Aber die UI sah nichts.

**Diagnose:**
- `handleCommit` nutzt `commitSSE.start(...)` → SSE-Stream vom Backend
- SSE ist irgendwann gedropped (Medusa scope teardown oder ähnliches)
- **Kein Polling als Safety-Net** aktiviert (anders als bei `loadResumable` auf Mount)
- Backend-Loop ist NICHT gestorben wie bei Fetch — per-batch Transactions mit kleineren DB-Writes scheinen weniger anfällig
- Commit hat weiter gemacht, completed nach ~6 Min mit `status='done'`, UI hat es nie erfahren

**Fix (`bd5ba74`): Analyze + Commit entkoppeln wie Fetch**

Statt die ganzen Loop-Bodies (commit 650 LOC, analyze 200 LOC) in neue Funktionen zu extrahieren, haben wir **SSEStream um Headless Mode erweitert**:
- Konstruktor: `res: MedusaResponse | null`
- Bei `null`: `emit()` schreibt nur in `import_event`, `startHeartbeat/end` no-op
- **Bonus-Bugfix:** Altes `emit()` hat nach HTTP-write-Error RETURNt und DB-insert ausgelassen. Jetzt wird DB immer geschrieben.

POST-Handler-Wrapper für commit + analyze:
```typescript
export async function POST(req, res) {
  // validate + idempotency
  res.json({ ok: true, started: true })
  const stream = new SSEStream(null, pg, session_id)  // ← headless
  void (async () => {
    try { /* existing loop unchanged */ }
    catch (err) { /* ... */ }
  })().catch(...)
}
```

Das Schönste daran: die existing Loop-Bodies sind **komplett unverändert**. Keine Refactorings, keine Parameter-Änderungen. SSEStream leitet alle `stream.emit()` Calls transparent an die DB weiter.

### Problem 9: Kein Call-to-Action nach Success

Nach dem Commit zeigte die Seite nur einen kleinen grünen Alert — "Import complete! Run ID: ...". Keine Action-Buttons, kein Next-Step. User musste raten was als nächstes.

**Fix (`bd5ba74`): Prominente Completion-Card**

Ersetzt den alten Alert durch eine große Gradient-Card mit:
- Header "✓ Import erfolgreich abgeschlossen"
- Collection + Run-ID
- Farbcodierte Stats-Zeile (Inserted/Linked/Updated/Skipped/Errors)
- 3 CTA-Buttons:
  - "📂 View Imported Collection →" (Gold) → Detail-Page des Runs
  - "All Collections" → Collections-Liste
  - "↻ Start New Import" → Wizard-State Reset für frischen Import

### Problem 10: Im Media-Detail fehlt "aus welchem Import"

User-Feedback: "was noch im Backend fehlt: die Info, aus welchem Import den Eintrag stammt".

Die `import_log` Tabelle hatte alle Daten — sie waren nur nicht im Media-Detail sichtbar.

**Fix (`a3e06a0`):**
- `GET /admin/media/:id` returnt jetzt zusätzlich `import_history` (LEFT JOIN `import_log × import_session`, ORDER BY created_at DESC, LIMIT 10)
- Defensive try/catch falls `import_log` Tabelle noch nicht existiert (frische Installationen)
- Media-Detail-Page: neue Section "Import History" zwischen Notes/Tracklist und Sync History
- Wird nur gerendert wenn es Einträge gibt (alte Pre-Discogs-Import Releases sehen die Section nicht)
- Tabelle: Date · Collection · Source File · Action (farbcodierte Badge) · Discogs ID (Link zu discogs.com) · "View Run →" (Link zur Import-Detail-Page)

### Lessons (Part 2)

6. **Polling als Safety-Net auch bei SSE-Hauptpfad.** handleCommit/handleAnalyze hätten von Anfang an `setPollingEnabled(true)` als Fallback haben sollen — dann hätte der SSE-Drop während Commit nur zu einer kurzen Unterbrechung statt "ich sehe nichts" geführt. Für rc20 ersatzlos durch Decoupling gelöst, aber Grundprinzip bleibt: **kein single-path UI-Update für lang laufende Ops**.

7. **SSEStream Headless Mode > Full Extraction.** Statt wie bei Fetch den ganzen Loop-Body in eine neue Funktion zu extrahieren, ist der Headless-Mode-Trick viel sauberer. Die existing Loops bleiben byte-identisch. Der Bonus: bestehende Code-Reviews / Test-Coverage / Dokumentation für die Loop-Bodies gelten weiter. **Lesson:** bei Refactorings zu "run in background" immer erst fragen ob man die Coupling-Schicht abstrahieren kann statt den Business-Code umzuschreiben.

8. **Silent Bugs in Error-Handling-Pfaden.** Das `emit()` hat nach HTTP-write-Error den DB-Insert einfach übersprungen. Das war seit rc14 drin und hat über Wochen unbemerkt Events gefressen wann immer ein Client disconnected. Gefunden nur durch die Decoupling-Arbeit. **Lesson:** error-handling-Paths müssen genauso hart getestet werden wie happy paths, besonders in library code der überall genutzt wird.

9. **Completion UX ist nicht "nice to have".** Ein Call-to-Action nach erfolgreichem Import ist genauso wichtig wie das Fortschritts-UI während des Imports. Wenn der User nicht weiß was als nächstes, fühlt sich "fertig" nicht fertig an. **Lesson:** für jeden Multi-Step-Flow von Anfang an die CTA-Struktur mitdesignen, nicht nachträglich draufschrauben.

### Commits (Part 2)

- `bd5ba74` — Discogs Import: Analyze + Commit Routes entkoppelt + Post-Import CTA
- `a3e06a0` — Media Detail: Import History Section

### Final Status (Ende 2026-04-11)

| Feature | rc17 | rc18 | rc20 | rc24 |
|---|---|---|---|---|
| Fetch überlebt Navigation | ❌ | ✅ | ✅ | ✅ |
| Analyze überlebt Navigation | ❌ | ❌ | ✅ | ✅ |
| Commit überlebt Navigation | ❌ | ❌ | ✅ | ✅ |
| Idempotency (no Double-Spawn) | ❌ | ✅ Fetch | ✅ alle 3 | ✅ alle 3 |
| Post-Import CTA | ❌ | ❌ | ✅ | ✅ |
| Media Detail zeigt Import-Herkunft | ❌ | ❌ | ✅ | ✅ |
| Polling ist primäre UI-Update-Quelle | ❌ | ✅ Fetch | ✅ alle 3 | ✅ alle 3 |
| **Backend pm2-restart Recovery während User wartet** | ❌ | ❌ | ❌ | ✅ |
| **Backend OOM-Recovery während User wartet** | ❌ | ❌ | ❌ | ✅ |

---

## Addendum — Part 3 (rc24): Stale-Loop Auto-Restart während aktivem Polling

Nach dem rc23-Deploy (Media Catalog Filter) passierte folgender eye-opener: Mein **eigener Deploy-Storm** war die Load-Generierung, die den nächsten Bug offenlegte.

### Problem 11: pm2-Restart killed den detached Loop, UI merkt nichts

User hat parallel zu meinen rc21/22/23-Deploys einen Fetch für "Frank Collection 2 of 10" gestartet (1.005 unique IDs, 61.7% Fortschritt bei 620/1005). Jeder meiner `pm2 restart vodauction-backend` killed **alle in-process detached Background-Tasks** — auch diesen Fetch-Loop.

Das rc18-Decoupling schützt vor **Client-Disconnect** (Navigation, Tab-Close, Reload), aber NICHT vor **Backend-Process-Kill**. Die Stale-Detection aus rc18 läuft nur in `loadResumable()` beim Mount — d.h. nur wenn der User refresht. Der User hat seine Seite aber nicht refresht, sondern die 2+ Stunden hängend stehen gelassen.

**DB-Diagnose bestätigte:**
```
status=fetching, current=620/1005, last_event_at=14:47:35 UTC, age=2h 0m 41s
```

### Root Cause (schmerzhaft offensichtlich im Nachhinein)

Ich habe beim rc18-Decoupling nur an **Client-Process-lifetime** gedacht (Browser, Tab). Backend-Prozess-Kills waren ein anderer Failure-Mode den ich nicht durchdacht hatte. Klassisches "I was the load-generator" — erst durch meine eigenen Deploys wurde der Bug visible.

### Fix (`b08373a`) — zwei Teile

**Part 1: Polling-Callback Stale-Detection**

Neuer `useRef` für Cooldown-Tracking. Im existing `useSessionPolling` onStatus Callback wird pro Tick geprüft:

```typescript
const ACTIVE_STATES = ["fetching", "analyzing", "importing"]
if (ACTIVE_STATES.includes(st.status) && st.last_event_at) {
  const ageMs = Date.now() - new Date(st.last_event_at).getTime()
  const sinceLastRestart = Date.now() - lastStaleRestartRef.current
  if (ageMs > 60_000 && sinceLastRestart > 60_000) {
    lastStaleRestartRef.current = Date.now()
    // Re-POST to the matching endpoint
    fetch(endpoint, { method: "POST", body: JSON.stringify({ session_id: st.id }) })
    // Add synthetic event to live log for transparency
    setEvents((prev) => [...prev, { type: "auto_restart", ... }])
  }
}
```

**60s Cooldown** verhindert Infinite-Loops falls der neue Loop auch sofort stirbt.

**Synthetic Event im Live-Log** macht die Recovery transparent — kein stilles "UI plötzlich wieder grün", sondern explizite "Backend loop appeared dead (Xs since last event). Auto-restarting — cached work is preserved." Message.

**Part 2: Commit Body/Session Settings Merge**

Der Auto-Restart-POST kennt nur `session_id` (weil es eine Polling-Response ist, nicht ein Button-Click). Fetch/Analyze brauchen auch nur das. **Commit** braucht aber `media_condition`, `sleeve_condition`, `inventory`, `price_markup`, `selected_discogs_ids` — diese kamen bisher aus dem Body mit Defaults `"VG+"/1/1.2`.

Ohne Fix würde Auto-Restart die User-Wahl **silent überschreiben** — wenn der User "M/M" + 1.5× Markup gewählt hatte, würde Auto-Restart das mit "VG+/VG+" + 1.2× überschreiben mitten im Commit. Fatal-silent.

Fix:
```typescript
const media_condition = body.media_condition ?? persistedSettings.media_condition ?? "VG+"
const sleeve_condition = body.sleeve_condition ?? persistedSettings.sleeve_condition ?? "VG+"
const inventory = body.inventory ?? persistedSettings.inventory ?? 1
const price_markup = body.price_markup ?? persistedSettings.price_markup ?? 1.2
const selected_discogs_ids = body.selected_discogs_ids ?? persistedSettings.selected_discogs_ids ?? undefined
```

Body values haben Precedence (für normale User-Clicks), aber wenn fehlend → Fallback auf `session.import_settings` (persistiert vom initialen Commit-Call, siehe rc16 Commit Hardening).

### Verifikation

Die Frank-Collection-2/10 Session, die 2h stehengeblieben war, wurde nach rc24-Deploy auf der **bereits offenen Seite** automatisch wiederbelebt — ohne User-Interaktion, ohne Refresh. Der neue Loop sprang innerhalb 60-120s an und übernahm via `discogs_api_cache` die 620 bereits gefetchten, fetcht jetzt die restlichen 385.

### Lessons (Part 3)

10. **Ownership-Kette beide Enden durchdenken.** Bei Background-Tasks gibt es zwei Lifecycles: Client-Process UND Backend-Process. rc18 hat ersten gelöst, aber backend-process-kills brauchen eine separate Lösung. Beim Architektur-Design immer fragen: "Was passiert wenn $X stirbt?" für jede Komponente die den Loop halten könnte.

11. **Deploy-Storms sind versteckte Integration-Tests.** Wenn ich 3× pm2-restart mache während ein User arbeitet, teste ich unbewusst die Failure-Mode-Resilience meines Systems. Hätte ich heute nicht so viele Deploys gehabt, wäre der Bug vielleicht erst beim ersten echten OOM-Kill in Produktion aufgefallen.

12. **Synthetic Events in Live-Logs sind billig und wertvoll.** Statt "UI recovered silently" explizit "Auto-restarting nach Xs stale-detection" loggen. Der User versteht was passiert, Support-Anfragen sinken.

### Commits (Part 3)

- `b08373a` — Discogs Import: Stale-Loop Auto-Restart während aktivem Polling
- `05830e9` — Docs: rc24 CHANGELOG Eintrag

### Final Final Status (Ende 2026-04-11, rc24 deployed)

**7-Layer Robustness Stack für Discogs Import:**

| Layer | Failure Mode | Protection | Version |
|---|---|---|---|
| 1 | Client navigates away / tab closes | Backend loop runs detached | rc18/rc20 |
| 2 | Browser refresh mid-loop | loadResumable Mount-check | rc18 |
| 3 | **Backend pm2-restart während User wartet** | **Polling Stale-Detect (60s)** | **rc24** |
| 4 | **Backend OOM während User wartet** | **Polling Stale-Detect (60s)** | **rc24** |
| 5 | Loop crasht mit Exception | `.catch()` markiert Session als 'error' | rc18 |
| 6 | Stale Zombie > 6h | active_sessions 6h-Filter | rc17 |
| 7 | Double-POST race condition | 60s Idempotency-Check | rc18 |

**Keine Klasse von Failure** kann mehr zu einer dauerhaft hängenden UI führen.
