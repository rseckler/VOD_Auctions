---
**Status:** 📝 Concept — pending Frank-Alignment on filter strategy
**Created:** 2026-04-26
**Updated:** 2026-04-26 (Live-Daten aus Franks Account integriert, siehe `DISCOGS_WANTLIST_ANALYSIS_2026-04-26.md`)
**Author:** Robin Seckler
**Related:** `DISCOGS_WANTLIST_ANALYSIS_2026-04-26.md` (echte Zahlen), `DISCOGS_COLLECTIONS_OVERVIEW_PLAN.md`, `DISCOGS_IMPORT_SESSION_LOCK_PLAN.md`, `discogs_api_cache`-Tabelle (rc26 v6.0)
---

# Discogs Wantlist — Auto-Expansion via Artist/Label-Discography

## Motivation

Frank pflegt seit 2003 eine **Wantlist mit 45.972 Items** (live verifiziert 2026-04-26) auf seinem Discogs-Account `pripuzzi`. Diese Liste ist über 22 Jahre kuratiert worden und repräsentiert sein realistisches Beschaffungs-Interesse für VOD/tape-mag.

**Korrektur ggü. ursprünglicher Annahme:** Frank sprach von „ungefähr 20.000" — es sind tatsächlich **45.972**. 7.462 distinct Artists, 7.347 distinct Labels. Year-Span 1951-2015 mit Cluster in 1980er-2000er (93%). Profil ist klassisches Industrial / Synth-Pop / Post-Punk / Dark-Wave (Top: Depeche Mode 2.417, Mute 3.547, 4AD 1.601, Rough Trade 1.548, Factory 841).

**User-Ziel:** Aus der bestehenden Wantlist Distinct-Sets von **Artists** und **Labels** ziehen, deren komplette Diskografie via Discogs API holen, und nach Filterung weitere Releases automatisch zur Wantlist hinzufügen.

**Geschäftlicher Hintergrund:**
- Frank kauft regelmäßig auf Discogs Marketplace zu Wantlist-Notifications
- Die manuelle Wantlist-Pflege skaliert nicht — Frank kennt nicht jedes Release jedes interessanten Labels
- Auto-Expansion liefert Discogs-Daily-Notifications für deutlich mehr potenzielle Beschaffungen
- Sekundäreffekt für VOD: angereicherte Wantlist = potenzielle Quelle für zukünftige `discogs-import`-Runs (Stichwort "Want-to-Stock-Pipeline")

**Out-of-Scope hier:** Kauf-Automatisierung, Marketplace-Listing-Watcher, Want-to-Stock-Sync. Dieses Doc behandelt **nur** die Wantlist-Erweiterung.

---

## Discogs API Reality Check

### Auth

**Token bereits vorhanden:** Der `DISCOGS_TOKEN` in `backend/.env` (`SWyMfyEwsjuacHWNeMTpAdeqjnuNcnibIrqIBdbV`) gehört zu Franks Account `pripuzzi` (verifiziert via `/oauth/identity` 2026-04-26 → `id=39558`). Kein separater Token nötig — wir können diesen Token wiederverwenden.

**Konsequenz:** Beim Build muss man entscheiden ob das Pattern bestehen bleibt (gleicher Token für VOD-Cache-Befüllung + Wantlist-Expansion auf Frank's Account) oder ob wir technisch trennen wollen (`DISCOGS_TOKEN` für VOD-eigene Reads, `DISCOGS_USER_TOKEN` für Schreib-Operationen auf User-Account). Defensiv-saubere Lösung: trennen, damit ein versehentliches Schreiben in der falschen Code-Stelle nicht möglich ist.

### Relevante Endpoints

| Endpoint | Zweck | Pagination |
|---|---|---|
| `GET /users/{username}/wants?page=N&per_page=100` | Wantlist lesen | 100/Seite, max |
| `PUT /users/{username}/wants/{release_id}` | Release zur Wantlist hinzufügen | idempotent (kein Error wenn schon drin) |
| `DELETE /users/{username}/wants/{release_id}` | entfernen | — |
| `GET /artists/{artist_id}/releases?page=N&per_page=500&sort=year` | Artist-Diskografie | 500/Seite, max |
| `GET /labels/{label_id}/releases?page=N&per_page=500&sort=year` | Label-Repertoire | 500/Seite, max |
| `GET /releases/{release_id}` | Release-Details (für Filter wie format/year/country) | — |

**Wichtig:** Artist/Label-Releases-Endpoint liefert nur **Basic-Info** (id, title, format, year, thumb, type=master|release). Für komplette Filter-Daten (country, formats[].descriptions, community.have/want) muss optional `/releases/{id}` nachgeholt werden — das ist der teuerste Teil und sollte über unseren existierenden `discogs_api_cache` laufen.

### Rate Limit

**60 Requests / Minute** authenticated. Hart, IP-basiert, kein Burst, kein Premium-Tier. Discogs sendet `X-Discogs-Ratelimit-Remaining` Header — bei 0 muss bis zur vollen Minute gewartet werden.

**Konsequenz:** Jeder Job muss von Anfang an als langlaufender Background-Prozess gedacht werden, mit Pause/Resume und Crash-Recovery.

---

## Skalierungs-Rechnung (basierend auf Live-Sample, nicht Schätzung)

Volldaten siehe [`DISCOGS_WANTLIST_ANALYSIS_2026-04-26.md`](DISCOGS_WANTLIST_ANALYSIS_2026-04-26.md). Hier die operativen Eckpunkte:

### Echte Größen

| | Wert |
|---|---:|
| Aktuelle Wantlist | **45.972** |
| Distinct Artists | 7.462 |
| Distinct Labels | 7.347 |
| Artists mit ≥3 Wants | 2.066 |
| Labels mit ≥3 Wants | 2.502 |
| Median Discogs-Diskografie pro Random-Artist | ~80 Releases |
| Median Discogs-Diskografie pro Random-Label | ~120 Releases |
| Mute (Top-Label, Major-Aggregation) | 30.000+ Releases |
| London Records (Major-Label) | **431.500 Releases** |

### Operative Konsequenzen

1. **Wantlist lesen** allein: 460 Pages × ~1.1s = **~8 Minuten** (gemessen)
2. **Major-Label-Cap ist Pflicht** — ohne Cap sind die Discogs-Diskografien von Polydor/Mercury/EMI/London/Capitol mit zigtausenden Klassik-/Schlager-Releases im Set, die Frank nicht interessieren. Cap auf max 500-2.000 Releases pro Source-Entity ist unverhandelbar.
3. **Long-Tail-Filter ist Pflicht** — 55% der Artists und 50% der Labels haben nur 1 Want — das sind Akzident-Items, keine Komplettist-Targets. Min-Frequenz ≥3 reduziert Scan-Volumen um 70% bei minimalem Signal-Verlust
4. **Year-Cutoff bei 2015** — Frank hat seit ~2015 die Wantlist nicht mehr substanziell erweitert. Auto-Expansion sollte standardmäßig auch nichts nach 2015 vorschlagen (sonst kommen viele Reissues von alten Sachen)

### Profil-Vergleich (live aus Sample-Hochrechnung)

| Profil | Eligible Entities (nach Caps) | Net New Wants | API-Zeit |
|---|---|---:|---:|
| **Konservativ** | 1.032 Artists / 800 Labels | **9.000-14.500** | **~3,4 h** |
| **Mittel** | 3.050 Artists / 1.454 Labels | 27.000 (Median) – 148.000 (Mean) | ~9,7 h |
| **Umfassend** | 7.310 Artists / 2.938 Labels | **1.500.000+** | **~446 h = 18,6 Tage 24/7** |

**Empfehlung:** Konservativ als Default. „Umfassend" ist operativ unrealistisch und macht die Wantlist als kuratierte Liste tot.

**Konsequenz für Architektur:** Selbst Konservativ ist >3 Stunden API-Run = Pause/Resume + Persistenz nach jedem Batch sind Pflicht. Mittel/Umfassend skalieren in Tage.

---

## Filter-Strategie (Kern-Design-Entscheidung)

Ohne Filter killt diese Operation Franks Discogs-Inbox (jede Wantlist-Listung triggert ggf. Notifications) und macht die Wantlist als kuratierte Liste unbrauchbar. **Filter müssen vor Job-Start mit Frank durchgesprochen werden.**

### Filter-Achsen die wir aus Discogs-Daten ziehen können

| Filter | Source-Field | Default-Vorschlag |
|---|---|---|
| Format-Type | `formats[].name` | Vinyl + Cassette + CD (kein File/DVD/Blu-ray/Box) |
| Format-Subtype | `formats[].descriptions` | optional: nur LP/12"/MC/CD-Album, keine 7"-Singles |
| Year | `year` | ≥ 1970, ≤ aktuelles Jahr |
| Country | `country` | Whitelist (DE, UK, US, IT, NL, BE, FR, JP) — Industrial-Heartland |
| Original-Pressing only | `master_id` Dedupe | nur 1 Release pro `master_id` (das älteste/canonical) |
| Skip Reissues | `formats[].descriptions` enthält "Reissue"/"Repress" | optional, kann Original-Pressing-Filter überschneiden |
| Community-Threshold | `community.want` ≥ 10 | filtert obskure 1-of-50 Tape-Demos raus (oder eben gerade nicht — Geschmacksfrage) |
| Already in Wantlist | unsere DB | Skip |
| Already owned | `Release.id LIKE 'discogs-release-%'` matched in unserer DB | optional Skip |

### Filter-Profile (mit live-validierten Zahlen)

**Profil A — "Konservativ" (Empfehlung für Default-Run)**
- Vinyl LP/12" + Cassette + CD-Album
- Year ≥ 1980
- Original-Pressings only (master_id-Dedupe)
- Min Wantlist-Frequenz pro Source-Entity: ≥3
- Max Source-Entity-Größe: 500 Releases (filtert Major-Label-Aggregation)
- **Live-Hochrechnung:** ~9.000-14.500 neue Wants, ~3,4 h API-Zeit

**Profil B — "Mittel"**
- Vinyl + Cassette + CD (alle Sub-Formate, inkl. 7"/10")
- Year ≥ 1970
- Min Wantlist-Frequenz: ≥2
- Max Source-Entity-Größe: 2.000 Releases
- **Live-Hochrechnung:** ~27.000 neue Wants (Median) / ~148.000 (Mean), ~9,7 h API-Zeit

**Profil C — "Custom"** — manuell tweakbar im Admin-UI vor Run-Start, mit Live-Preview-Sampling

**Profil D — "Umfassend"** (intentional als „nicht empfohlen" markiert):
- Alle Formate, alle Jahre
- Max Source-Entity-Größe: 5.000 Releases
- **Live-Hochrechnung:** 1,5 Mio neue Wants, **18,6 Tage 24/7 API-Run** — operativ unrealistisch

### Per-Entity Allowlist/Blocklist

Optional: Frank kann bestimmte Artists/Labels von der Auto-Expansion ausschließen ("Throbbing Gristle bereits manuell vollständig kuratiert" → blocklist). Tabelle `discogs_wantlist_entity_settings` mit `(entity_type, entity_id, mode='block'|'priority')`.

Phase-2-Material — initialer Run nutzt globale Filter.

---

## Architektur

### Job-Lifecycle (3-Phasen)

```
Phase 1: SCAN
  ├─ Wantlist von Discogs holen (paged)
  ├─ Distinct Artists + Labels extrahieren
  ├─ Filter-Profil anwenden auf Entity-Liste (z.B. nur "main" artists, keine Various)
  └─ Persist: wantlist_expansion_run.scan_result = {artists: [...], labels: [...], current_wants: [...]}

Phase 2: DISCOVER
  ├─ Für jeden Artist: GET /artists/:id/releases (alle Pages)
  ├─ Für jedes Label: GET /labels/:id/releases (alle Pages)
  ├─ Distinct Release-IDs sammeln
  ├─ Cache-Lookup gegen unsere DB (already in wantlist? already owned?)
  ├─ Filter Phase 1 (auf Basic-Info: format, year aus Listing-Response)
  ├─ Optional: Detail-Fetch für Filter-Felder die nicht in Basic sind (country, community)
  └─ Persist: candidate_release_id List in wantlist_expansion_candidate

Phase 3: APPLY
  ├─ Für jede candidate-Release: PUT /users/{frank}/wants/{release_id}
  ├─ Mit Backoff bei 429
  ├─ Status pro Candidate: pending → added | skipped | error
  └─ Resume aus letztem Cursor wenn Crash/Pause
```

**Jede Phase ist separat startbar und resumebar.** Frank kann nach Phase 2 die Filter anpassen und Phase 3 mit gefilterter Sub-Liste starten — wie unser bestehender `discogs-import` Workflow (Upload → Analyze → Commit).

### Datenmodell

**Neue Tabellen:**

```sql
-- Master-Record pro Run (analog zu import_session)
CREATE TABLE wantlist_expansion_run (
  id text PRIMARY KEY,
  status text NOT NULL,  -- 'created' | 'scanning' | 'scan_done' | 'discovering' | 'discover_done' | 'applying' | 'done' | 'paused' | 'cancelled' | 'error'
  user_username text NOT NULL,  -- Discogs username, derived from token
  filter_profile text NOT NULL,  -- 'conservative' | 'comprehensive' | 'custom'
  filter_config jsonb NOT NULL,  -- effective filters (so re-runnable + auditable)

  -- Phase 1 results
  scan_started_at timestamptz,
  scan_finished_at timestamptz,
  current_wants_count int,        -- Anzahl Items zum Scan-Zeitpunkt
  distinct_artists_count int,
  distinct_labels_count int,

  -- Phase 2 results
  discover_started_at timestamptz,
  discover_finished_at timestamptz,
  candidates_discovered int,      -- raw Releases gefunden
  candidates_after_filter int,    -- nach Filter-Anwendung

  -- Phase 3 results
  apply_started_at timestamptz,
  apply_finished_at timestamptz,
  added_count int,
  skipped_count int,
  error_count int,

  -- Resume-Cursors (welche Page/Entity zuletzt verarbeitet)
  scan_cursor jsonb,        -- {next_page: int}
  discover_cursor jsonb,    -- {entity_type, entity_id, next_page} (where to resume)
  apply_cursor jsonb,       -- {next_candidate_id: text}

  -- Lock-Heartbeat (analog Pattern aus DISCOGS_IMPORT_SESSION_LOCK_PLAN)
  worker_id text,
  locked_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancel_requested_at timestamptz,
  pause_requested_at timestamptz
);

-- Per-Candidate-Row (analog import_log)
CREATE TABLE wantlist_expansion_candidate (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES wantlist_expansion_run(id) ON DELETE CASCADE,
  discogs_release_id bigint NOT NULL,
  source_entity_type text NOT NULL,  -- 'artist' | 'label'
  source_entity_id bigint NOT NULL,
  source_entity_name text,           -- denormalized for UI

  -- Snapshot für Audit (was wussten wir zum Zeitpunkt)
  basic_info jsonb,                  -- {title, year, format, thumb, country?}

  -- Status
  filter_decision text,              -- 'pass' | 'rejected' | 'already_in_wantlist' | 'already_owned'
  filter_reason text,                -- für 'rejected': "year < 1980" etc.
  apply_status text,                 -- 'pending' | 'added' | 'skipped' | 'error'
  apply_error text,
  applied_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id, discogs_release_id)
);
CREATE INDEX idx_wec_run_apply_status ON wantlist_expansion_candidate (run_id, apply_status);
CREATE INDEX idx_wec_run_filter_decision ON wantlist_expansion_candidate (run_id, filter_decision);

-- Optional Phase 2: Per-Entity Allowlist/Blocklist
CREATE TABLE discogs_wantlist_entity_settings (
  entity_type text NOT NULL,        -- 'artist' | 'label'
  entity_id bigint NOT NULL,
  mode text NOT NULL,               -- 'block' | 'priority'
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id)
);
```

**Wiederverwendete Tabellen:**

| Tabelle | Wofür |
|---|---|
| `discogs_api_cache` | Release-Detail-Cache (TTL respektieren — wenn Cache-Hit, kein API-Call) |
| `import_event` | optional Event-Log pro Run (wenn wir Events analog Import einführen wollen) |

### API Routes (neu)

| Route | Zweck |
|---|---|
| `POST /admin/wantlist-expansion/run` | Neuen Run starten — Body: `{filter_profile, filter_config?}` → 202 + run_id |
| `GET /admin/wantlist-expansion/runs` | Liste aller Runs (Status + Counts) |
| `GET /admin/wantlist-expansion/run/:id` | Run-Details + Candidate-Liste (paginiert) |
| `GET /admin/wantlist-expansion/run/:id/status` | Polling-Endpoint (für UI-Progress) |
| `POST /admin/wantlist-expansion/run/:id/pause` | Run pausieren |
| `POST /admin/wantlist-expansion/run/:id/resume` | Run fortsetzen |
| `POST /admin/wantlist-expansion/run/:id/cancel` | Run abbrechen (keine Rollback der bereits geadded Wants) |
| `POST /admin/wantlist-expansion/run/:id/apply` | Phase 3 starten (nach Filter-Review) |
| `GET /admin/wantlist-expansion/run/:id/export` | CSV-Export der Candidates (analog `discogs-import/history/:id/export`) |
| `GET /admin/wantlist-expansion/preview?profile=conservative` | Schätzung vor Run-Start: "would add ~12.500 releases based on current wantlist" |

### Worker-Pattern

Analog zu unserem `discogs-import/fetch` mit Lock-Heartbeat (siehe `DISCOGS_IMPORT_SESSION_LOCK_PLAN`):

```typescript
// Pattern (siehe fetch/route.ts als Vorbild):
// 1. POST /run startet Phase, returnt 202 + run_id
// 2. Background-Loop läuft via void (async () => {...})().catch(...)
// 3. Loop schreibt Heartbeat alle 30s (locked_at = now())
// 4. Stale-Detection nach 150s (anderer Worker kann übernehmen)
// 5. Loop checkt cancel_requested_at + pause_requested_at zwischen jedem Batch
// 6. Cursor wird nach jedem Batch persistiert (resume-fähig)
// 7. Rate-Limit-Tracking: X-Discogs-Ratelimit-Remaining respektieren, sleep bis Reset
```

**Warum Custom-Worker und nicht z.B. BullMQ?** Wir haben das Pattern schon in `discogs-import/fetch` etabliert (rc18), Frank kennt die UX. Kein neuer Stack nötig.

### Rate-Limit-Handling

Discogs sendet pro Response:
- `X-Discogs-Ratelimit: 60`
- `X-Discogs-Ratelimit-Used: 23`
- `X-Discogs-Ratelimit-Remaining: 37`

```typescript
// Pseudo:
async function discogsRequest(url) {
  const res = await fetch(url, {headers: {Authorization: `Discogs token=${TOKEN}`}})
  const remaining = parseInt(res.headers.get('X-Discogs-Ratelimit-Remaining') || '60')
  if (remaining < 5) {
    // Sleep until next minute window
    await sleep(60_000 - (Date.now() % 60_000))
  }
  if (res.status === 429) {
    await sleep(60_000)
    return discogsRequest(url)  // retry
  }
  return res
}
```

Defensive: bei 429 exponentieller Backoff (1s → 2s → 4s → … → 60s max).

---

## UI

### Hub-Seite `/app/wantlist-expansion`

Analog `/app/discogs-import` mit Tabs:

| Tab | Inhalt |
|---|---|
| **New Run** | Profile-Picker + Custom-Filter-Form + Preview-Button + Start-Button |
| **Active** | Liste der laufenden Runs mit Live-Progress (Polling /status alle 5s) |
| **History** | Vergangene Runs mit Stats |
| **Settings** | Per-Entity Blocklist/Allowlist (Phase 2) |

### Run-Detail-Seite `/app/wantlist-expansion/run/[id]`

- Stats-Header: Wantlist-Snapshot / Discovered / Candidates-After-Filter / Added / Errors / Time-Spent
- Phase-Indicator: Scan ✅ → Discover ✅ → Apply ⏳ (oder Failed/Cancelled)
- Active Filters-Card (was wurde angewendet, für Audit)
- **Candidate-Tabelle** (paginiert, 200 Rows + Load-More wie Collections-Detail):
  - Cover-Thumbnail, Source-Entity (Link zu Discogs-Artist/Label), Year, Format, Status-Badge, Filter-Reason
  - Filter: by status, by source-entity, search title/artist
- Action-Buttons: Pause / Resume / Cancel / Apply Phase 3 (wenn Phase 2 done) / Export CSV

### Preview Modal (vor Run-Start)

```
Run Preview — "Conservative" profile
─────────────────────────────────────
Wantlist size:           20.347
Distinct artists:         3.128
Distinct labels:          1.847
Avg releases per artist:    23 (estimate)

Estimated discoveries:  ~92.000
After format filter:    ~64.000
After year filter:      ~58.000
After country filter:   ~41.000
After master-dedupe:    ~18.000
After dedup w/ wantlist:~14.500

Estimated API time:     ~12 hours
Estimated added items:  ~14.500

[ Cancel ] [ Start Run ]
```

Preview ist eine **Heuristik basierend auf Sampling** (z.B. Diskografie von 20 zufälligen Artists abrufen, hochrechnen). Keine echte Vor-Berechnung — sonst doppelter API-Aufwand.

---

## Edge Cases

| Fall | Verhalten |
|---|---|
| Discogs-Token expired/revoked | Run schlägt sofort fehl, alle weiteren Runs blockiert bis Frank neuen Token einträgt |
| Discogs API down (5xx) | Exponentieller Backoff bis 60s, dann Pause + Alert |
| Wantlist während Run extern verändert | Akzeptiert — `PUT` ist idempotent, bei Conflict einfach skip |
| Release-ID existiert nicht mehr (404) | candidate.apply_status = 'error', filter_reason = "release deleted" |
| Frank's Wantlist hat 25k+ items (Discogs Soft-Cap?) | Recherche ergibt keinen dokumentierten Cap, aber UI wird träge — vor Run warnen |
| Artist/Label ist "Various" (id=194) | Skip — würde Millionen Releases triggern. Hardcode-Blocklist für `id IN (0, 194, 355)` (Various, [no artist], DJ etc.) |
| Master-Release vs Release im Listing | Discogs liefert beides — wir adden nur `type=release`, nicht `type=master` |
| Run crashes mitten in Phase 3 | Resume aus apply_cursor — bereits added items bleiben in Discogs (idempotent) |
| Frank hat Diskografie eines Artists schon manuell durchforstet | Per-Entity-Blocklist (Phase 2). Phase 1 hat das nicht. |
| Zwei Runs parallel | Verboten — `WHERE status IN ('scanning','discovering','applying')` Lock-Check beim Start |

---

## Risiken

| Risiko | Impact | Mitigation |
|---|---|---|
| Wantlist-UX-Verlust durch Über-Expansion | Hoch — Frank kann seine eigene Liste nicht mehr nutzen | Conservative-Profile als Default, Preview-Modal Pflicht, Per-Run-Cap (z.B. max 25k adds) |
| Discogs sperrt Token wegen "abuse" | Hoch — Frank verliert Discogs-Account-Funktion | Striktes Rate-Limit-Adherence (≤55/min mit Buffer), realistic User-Agent setzen |
| Notification-Spam bei Frank wenn Marketplace-Listings auf neu-geaddete Wants matchen | Medium | Vor Apply Frank explizit warnen "expect ~XX new daily Marketplace notifications" |
| Job läuft tagelang, Server-Restart killt Worker | Medium | Lock-Heartbeat + Resume-Cursor pro Phase (siehe Pattern in DISCOGS_IMPORT_SESSION_LOCK_PLAN) |
| Discogs ändert Rate-Limit / API ohne Vorwarnung | Niedrig | Defensive Header-Parsing, Fallback auf konservativen Default (30/min) |
| `discogs_api_cache` Tabelle bläht sich auf (Hunderttausende neue Rows bei Detail-Fetch) | Medium | TTL respektieren (90 Tage default), Detail-Fetch optional machen — viele Filter funktionieren auch ohne Detail |
| User-Agent muss aussagekräftig sein, sonst Banhammer | Niedrig | `User-Agent: VOD-Auctions/1.0 (+https://vod-auctions.com)` |

---

## Open Questions for Frank

Vor Implementierung **müssen** wir klären:

1. **Filter-Profil:** Welches der drei Profile (Conservative / Comprehensive / Custom) als Default? Wie aggressiv soll das Country/Year/Format-Filtering sein?
2. **Hard-Cap:** Soll es einen Per-Run-Cap geben (z.B. "max 10.000 neue Wants pro Run")? Oder läuft das einfach durch?
3. **Marketplace-Notifications:** Frank ist sich bewusst, dass eine erweiterte Wantlist mehr Discogs-Notifications triggert. Erwartung managen.
4. **Original-Pressings only?** master_id-Dedupe ist sehr aggressiv (z.B. nur 1 Throbbing-Gristle-"20 Jazz Funk Greats" statt aller 30 Pressings). Was will Frank?
5. **Already-owned-Skip:** Sollen Releases, die wir in unserer DB als `tape-mag` oder `discogs-`-Import haben, übersprungen werden? Oder sind das genau die, die Frank zusätzlich physisch sammeln will?
6. **Per-Entity Settings:** Pre-existing manuelle Kuration einzelner Artists — soll Phase 2 (Allowlist/Blocklist) sofort mitgebaut werden, oder erst nach erstem Run wenn Schmerz konkret wird?
7. **Delete-Wants:** Wollen wir den Reverse-Pfad auch (Releases von der Wantlist entfernen wenn sie bestimmte Kriterien matchen)? — Vorschlag: Out of Scope für v1, Add-Only.
8. **Token-Speicherort:** Token ist bereits in `backend/.env` (`pripuzzi`-Account verifiziert). Wollen wir diesen für Wantlist-Schreiben wiederverwenden, oder lieber einen dedizierten zweiten Token generieren um Read-Cache von Write-Operations zu trennen?

---

## Out of Scope (für v1)

- Marketplace-Listing-Watcher (separater Service, würde Want-Notifications duplizieren)
- Auto-Buy bei matchenden Listings
- Want-to-Stock-Pipeline (Wantlist → unsere `import_session` für Auto-Discogs-Import wenn Frank Item kauft)
- Cross-User Wantlist-Merge (mehrere Discogs-Accounts)
- Wantlist-Diff-Reports ("seit letzter Woche x neue Wants matched")
- Genre/Style-basierter Filter (zu unscharf in Discogs-Daten, viele Mis-Tags)
- ML-basierte Relevanz-Scores

---

## Implementation Phases (Vorschlag)

**Phase 1 (MVP, ~1 Woche Arbeit):**
- Schema-Migration (3 Tabellen)
- Worker für Phase 1+2+3 mit Lock-Heartbeat
- Conservative-Profile hardcoded
- Run-Detail-Page (read-only, kein Edit)
- Pause/Resume/Cancel
- CSV-Export

**Phase 2 (~3 Tage):**
- Filter-Profile-Picker + Custom-Form
- Preview-Modal mit Sampling-Heuristik
- Per-Entity Allowlist/Blocklist Tab
- Per-Run-Cap konfigurierbar

**Phase 3 (optional, später):**
- Wantlist-Diff-Reports (welche Wants matched seit letztem Run)
- Want-to-Stock-Pipeline (Wantlist als Source für `discogs-import`)
- Token-Eingabe via Admin-UI (1Password-Style)

---

## Verifikation (nach Phase 1)

1. `POST /admin/wantlist-expansion/run` mit profile=conservative → 202 + run_id
2. `GET /admin/wantlist-expansion/run/:id/status` zeigt Phase=scanning, Polling alle 5s zeigt Progress
3. Nach ~5 Min: Phase scan_done, distinct_artists/labels populated
4. Phase discover läuft, Cursor advances pro Entity (sichtbar in DB)
5. Pause → status=paused, Worker-Loop terminiert binnen 1 Batch
6. Resume → läuft weiter aus Cursor, keine doppelten API-Calls
7. Phase apply läuft, Frank sieht in Discogs Web-UI neue Wants erscheinen
8. CSV-Export liefert alle Candidates mit Status
9. Kill PM2 mid-run → nach Restart resumed Worker innerhalb 150s (Stale-Lock-Detection)
10. Discogs-API-Rate-Limit getroffen → Worker sleept, kein 429-Spam in Logs

---

## Linked TODOs

Bei Greenlight von Frank:
- [ ] Linear-Issue erstellen (RSE-XXX, Status: Backlog → In Progress)
- [ ] `docs/TODO.md` Workstream "Discogs Wantlist Expansion" anlegen
- [ ] Schema-Migration entwerfen + auf Staging testen (oder direkt-on-prod mit Rollback-Script, da additiv)
- [ ] Frank's Discogs-Token erfragen + in `backend/.env` als `DISCOGS_FRANK_TOKEN` eintragen
- [ ] User-Agent in `lib/discogs-api.ts` (zentral) auf VOD-Auctions/1.0 setzen — gilt dann auch für `discogs-import`

---

## Geschätzter Umfang (Phase 1)

| Datei | LoC |
|---|---|
| Schema-Migration (raw SQL) | ~80 |
| `lib/discogs-wantlist.ts` (API-Wrapper, Filter-Engine) | ~250 |
| API Routes (run/list/detail/status/pause/resume/cancel/apply/export) | ~400 |
| Worker-Loop (background, Lock-Heartbeat, Resume) | ~300 |
| Admin-UI Hub-Page mit Tabs | ~250 |
| Admin-UI Run-Detail-Page | ~300 |
| Admin-UI New-Run-Form (initial nur Profile-Dropdown) | ~80 |
| Tests (Filter-Logic, Cursor-Resume) | ~150 |

**Gesamt:** ~1.800 Zeilen — eine größere Session als Collections-Overview, weil es 3-Phasen-Worker mit echtem External-API-Tracking ist.

---

**Author:** Robin Seckler — pending Frank-Alignment Meeting
