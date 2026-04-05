# Sync Robustness Plan — Neu-Architektur aller Synchronisations-Flows

**Version:** 1.0
**Erstellt:** 2026-04-05
**Status:** Entscheidungsvorlage — vor Umsetzung einzelner Phasen durch Robin freigeben
**Scope:** Alle Daten-Synchronisationen in VOD Auctions. Ausgenommen: Blackfire (eigenes Projekt), MyNews, Stromportal, etc.

---

## 0. Warum dieses Dokument existiert

Am 2026-04-05 wurde offensichtlich, dass die Sync-Infrastruktur von VOD Auctions mehrere stille Probleme hat, die über Monate unbemerkt blieben:

- Der Legacy-Sync-Script loggt nur 4 von 14 gesynchten Feldern als Change-Events. Änderungen an `legacy_condition`, `description`, `year`, `format`, `catalogNumber`, `country`, `artistId`, `labelId`, `legacy_format_detail` werden korrekt nach Supabase geschrieben, aber **nie** im Change-Log festgehalten.
- Die `new_images`-Metrik in `sync_log.changes` ist kumulativ/misleading (zählt Insert-Attempts, nicht tatsächlich neue Zeilen).
- `sync_change_log` war 7 Tage lang komplett leer, ohne dass es jemandem aufgefallen wäre.
- Mehrere Admin-Routes lasen Progress-Files über `process.cwd()/..` oder `__dirname/../../../...` — beide wurden heute durch den PM2-cwd-Wechsel gleichzeitig broken. Sieben Dateien waren betroffen.
- Zwei zusätzliche hardcoded `/root/VOD_Auctions/`-Pfade fielen erst im Deep-Search-Audit auf.
- CLAUDE.md behauptete "Legacy Sync täglich 04:00 UTC" — tatsächlich läuft er stündlich (Drift zwischen Doku und Reality).
- Niemand alertet wenn ein Sync-Run fehlschlägt (`status = 'error'`), niemand alertet wenn ein Sync über Stunden nicht läuft.
- Bei auffälligen Ereignissen (Frank editiert live 54 Einträge) wäre die einzige Erkennungsmöglichkeit gewesen, dass Robin aktiv ins Admin-Dashboard schaut und sich wundert.

Das sind keine Einzelfälle, sondern ein Muster: **Sync ist historisch als "läuft schon irgendwie" behandelt worden, ohne Invarianten, ohne Validierung, ohne proaktive Erkennung von Drift oder Fehlern.** Dieses Dokument plant die Neuaufstellung.

---

## 1. Executive Summary

**Ziel:** Jeder Sync-Flow in VOD Auctions ist (a) vollständig in seiner Feldabdeckung, (b) selbst-validierend, (c) auto-korrigierend bei Drift, (d) beobachtbar für den Admin, (e) alertend bei echten Problemen.

**Nicht-Ziel:** Echt-Zeit-Sync. Die stündliche Batch-Synchronisation bleibt die Basis. "Robust" bedeutet nicht "schneller", sondern "verlässlich und transparent".

**Kernprinzip:** *Wenn die Sync-Infrastruktur fehlerfrei läuft, merkt niemand etwas. Wenn sie Fehler macht, wird es sofort sichtbar und automatisch korrigiert wo möglich.*

**Scope:** Drei produktive Sync-Flows:
1. **Legacy MySQL → Supabase** (stündlich, via `legacy_sync.py`) — die am häufigsten problembehaftete Pipeline
2. **Discogs → Supabase** (täglich Mo-Fr 02:00 UTC, 5 Chunks rotating, via `discogs_daily_sync.py`)
3. **R2 Image CDN** (derzeit gekoppelt an Legacy-Sync, läuft stündlich) — Dateien, nicht DB-Zeilen

Plus zwei sekundäre Flows die weniger kritisch aber ebenfalls im Scope sind:
4. **Discogs Batch-Matching** (manuell, via `discogs_batch.py`) — bulk matching existing releases to Discogs IDs
5. **Entity Content Overhaul** (AI enrichment, aktuell P2 paused)

---

## 2. Aktueller Zustand — Inventar

### 2.1 Legacy MySQL → Supabase Sync

| Attribut | Wert |
|---|---|
| Script | `scripts/legacy_sync.py` |
| Laufzeit | stündlich per cron (real) — CLAUDE.md sagt fälschlich "täglich 04:00 UTC" |
| Datenquelle | MySQL Legacy-DB (tape-mag) |
| Datenziel | Supabase `Release`, `Artist`, `Label`, `PressOrga`, `Image` |
| Zieldaten-Volumen | ~41,500 Releases (aufgeteilt in release/band_lit/label_lit/press_lit) + 12,451 Artists + 3,077 Labels + 1,983 PressOrga + ~75,000 Images |
| Durchschnittliche Laufzeit | ~30-45 Sekunden |
| Gesyncte Felder im Release (UPSERT) | 14: `title, description, year, format, format_id, catalogNumber, country, artistId, labelId, coverImage, legacy_price, legacy_condition, legacy_format_detail, legacy_available` + Timestamps |
| Change-Tracking-Coverage | 4 Felder: `legacy_price, legacy_available, title, coverImage` — **71% Coverage-Lücke** |
| Image-Handling | `INSERT ... ON CONFLICT DO NOTHING` — skippt existierende. Keine Change-Log-Einträge für neue Bilder. |
| Protection-Layer | `label_enriched = TRUE` schützt `labelId` vor Überschreibung. `discogs_*` Felder sind vor Sync geschützt (werden separat durch discogs_daily_sync gepflegt). |
| Validation nach Run | Keine — Script committed und beendet. |
| Drift-Detection | Keine. |
| Alert bei Fehler | Keine. Failed Run schreibt nur `sync_log.status = 'error'`, niemand liest das. |
| Dead-Man's-Switch | Keine. Wenn Cron stirbt, merkt es niemand. |

**Felder die NICHT getrackt aber möglicherweise sync-relevant sind:**
- `subtitle` — existiert in Supabase-Release, unklar ob legacy_sync.py sie mitsyncs
- `barcode` — ebenso
- `language` — ebenso
- `pages` — Bücher/Literatur-spezifisch
- `releaseDate` — taucht nur in Supabase-Schema auf, unklar legacy-Quelle
- `tracklist` (JSONB) — ebenso
- `credits` — ebenso
- `media_condition`, `sleeve_condition` — separat von `legacy_condition`?
- `article_number` — unique index, unklar wer es setzt
- `tape_mag_url` — Deeplink zurück zu tape-mag
- `pressOrgaId` — Press-Literature-Zuordnung
- `legacy_availability` (integer, nicht zu verwechseln mit `legacy_available` boolean) — unklar

**→ Audit-Pflicht in Phase 1 dieses Plans: für jedes dieser Felder feststellen, ob es in MySQL existiert, ob es sync-relevant ist, und ob es aktuell gesynct wird.**

### 2.2 Discogs Daily Sync

| Attribut | Wert |
|---|---|
| Script | `scripts/discogs_daily_sync.py` |
| Laufzeit | Mo-Fr 02:00 UTC, 5 Chunks rotating (jeder Chunk einmal pro Woche) |
| Datenquelle | Discogs API |
| Datenziel | Supabase `Release.discogs_*` Felder |
| Gesyncte Felder | `discogs_id, discogs_lowest_price, discogs_median_price, discogs_highest_price, discogs_num_for_sale, discogs_have, discogs_want, discogs_last_synced` |
| Rate-Limit | Discogs API hat strikte Limits → deshalb Chunks + Exponential Backoff |
| Change-Tracking | Keines. Niemand weiß, welche Releases in einem Run ihre Discogs-Preise geändert haben. |
| Validation | Eigene Health-File-Logik (`discogs_sync_health.json`) die `discogs-health` Admin-Widget liest |
| Drift-Detection | Keine (aber Discogs API ist die Wahrheit, Drift ist nicht das Risiko) |
| Alert | `discogs-health` Widget zeigt severity im Admin, aber es gibt keinen Push-Alert |

### 2.3 R2 Image Sync

| Attribut | Wert |
|---|---|
| Script | Teil von `legacy_sync.py` (kein eigenes Script) |
| Laufzeit | gekoppelt an Legacy-Sync — stündlich |
| Datenquelle | Cover-Image-URLs aus MySQL (oder aus Image-Tabelle) |
| Datenziel | Cloudflare R2 Bucket `vod-images` (pub-URL: `https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev`) |
| Bucket-Stand (2026-04-05) | 160,957 Files / 108 GB |
| Progress-File | `scripts/r2_sync_progress.json` — Admin-Widget liest daraus |
| Change-Tracking | ja, über Progress-File (`uploaded, failed, skipped, updated_at, run_id`) |
| Validation | Keine End-to-End-Verifikation, dass URLs wirklich erreichbar sind (nur ein HEAD-Request auf ein einziges Test-Bild im system-health Endpoint) |
| Alert | Keine |

### 2.4 Discogs Batch Matching (sekundär)

Manuell gestartet, matched existing releases ohne `discogs_id` zu Discogs-Releases per bulk matching. Läuft sporadisch. Progress in `data/discogs_batch_progress.json`. Nicht kritisch für den Normalbetrieb, aber unterlag derselben cwd-Bug-Klasse die heute gefixt wurde.

### 2.5 Entity Content Overhaul (sekundär, aktuell P2 pausiert)

10-Modul-Python-Pipeline zum Enrichment von Band/Label/Press-Entities via GPT-4o. Läuft nicht automatisch, Budget-basiert. Progress in `scripts/entity_overhaul/data/entity_overhaul_progress.json`. Im Scope dieses Plans nur insofern, als das Admin-Widget dafür heute auch gebrochen war.

---

## 3. Lessons Learned

Eine Liste aller Probleme die in der aktuellen Sync-Architektur stecken oder heute aufgefallen sind. Jedes davon muss der Plan adressieren.

### 3.1 Stille Coverage-Lücken
Der Legacy-Sync-Script trackt 4 von 14 gesyncten Feldern als Changes. Die restlichen 10 sind komplett unsichtbar — keine Audit-Trail, keine Möglichkeit nachzuvollziehen was Frank wann geändert hat. Heute entdeckt nach Frank's Arbeit an 54 Literatur-Einträgen.

### 3.2 Misleading Metrics
`sync_log.changes.new_images: 32866` bei jedem Run. Ist kumulativ (Insert-Attempts inkl. Duplicates), nicht per-run. Nutzer liest die Zahl als "neue Bilder in diesem Run" und wird getäuscht.

### 3.3 Keine Feld-Liste als Contract
Nirgendwo im Code oder in der Doku gibt es eine verbindliche Liste "diese Felder werden gesynct, diese nicht". Wissen ist implizit verteilt (Python-Script + CLAUDE.md + Mental Model). Drift zwischen Code und Doku ist garantiert.

### 3.4 Keine Drift-Detection
Wenn MySQL und Supabase irgendwann auseinanderlaufen (z.B. durch einen partiellen Sync-Fehler, eine manuelle SQL-Änderung in Supabase, einen Script-Bug), würde das niemand merken bis ein Nutzer etwas Konkretes sucht und nicht findet.

### 3.5 Keine Validation nach Sync-Run
Der Script committed und beendet. Niemand prüft: "Stimmen die Counts nach dem Run? Wurden alle erwarteten Rows berührt? Haben die UPSERTs Sinn gemacht?"

### 3.6 Stille Fehler
Wenn `sync_log.status = 'error'` gesetzt wird, passiert nichts weiter. Keine E-Mail, kein Slack, keine Admin-UI-Notification, kein Dashboard-Alert.

### 3.7 Kein Dead-Man's-Switch
Wenn der Cron-Job stirbt (Crontab-Bug, VPS-Reboot ohne korrekten Restore, Permissions-Problem), läuft stunden- oder tagelang nichts, und niemand bemerkt es bis zufällig jemand ins Admin-UI schaut.

### 3.8 Path-Fragilität
Heute: 7 Admin-Routes nutzten `process.cwd()/..` oder `__dirname/../../../...` um auf `scripts/` und `data/` zuzugreifen. Der PM2-cwd-Wechsel hat alle 7 gleichzeitig broken. Fix via `backend/src/lib/paths.ts` Helper ist deployed, aber: **derselbe Fail-Modus könnte für den Python-Script gelten** — wenn jemand den Cron in einer anderen Working-Directory startet, könnten die relativen Pfade im Python-Script brechen. Nicht verifiziert.

### 3.9 Hardcoded Absolute Paths
2 zusätzliche Files mit `/root/VOD_Auctions/scripts/legacy_sync.log` hardcoded. Funktioniert heute, bricht auf Staging/Local-Dev. Heute gefixt.

### 3.10 Doku-Drift
CLAUDE.md sagt "Legacy Sync täglich 04:00 UTC". Real: stündlich. Niemand hat die Cron-Tab direkt mit CLAUDE.md abgeglichen.

### 3.11 Leere Audit-Tabellen
`sync_change_log` war **7 Tage lang leer**. Das ist ein Symptom mehrerer Probleme oben, aber besonders bemerkenswert: die Existenz der Tabelle wurde nie validiert. Niemand hat je gefragt "wieso steht da nichts drin?"

### 3.12 Keine End-to-End-Verifikation externer Systeme
R2 Image CDN: Test auf genau ein Bild. Wenn 999 von 160,957 Bildern broken sind (z.B. weil der Upload fehlgeschlagen war), wird es nicht erkannt.

### 3.13 Keine Versionierung der Sync-Scripte
Wenn der Python-Script geändert wird, gibt es keinen Marker "diese Sync-Runs sind v1, diese sind v2". Nach einem Script-Update kann man nicht mehr klar sagen, welche Daten vom alten vs. neuen Script stammen. Relevant wenn ein Script-Bug später entdeckt wird und rückwirkend repariert werden muss.

### 3.14 Keine Idempotency-Garantien dokumentiert
Script wird angenommen idempotent zu sein (re-run produziert keine Duplikate). Ist das wirklich so? Für UPSERTs ja. Für `sync_change_log`-Einträge? Unklar — re-running ein Script würde neue Change-Einträge mit neuer `sync_run_id` erzeugen, auch wenn sich nichts geändert hat.

---

## 4. Design-Prinzipien

Diese Prinzipien gelten für JEDEN Sync-Flow in VOD Auctions, heute und in Zukunft.

### 4.1 Feld-Contract als Single Source of Truth
Für jeden Sync-Flow existiert eine **explizite, maschinenlesbare Liste der gesyncten Felder** mit Metadaten:
- Feldname in Quelle und Ziel
- Typ-Mapping (MySQL → Postgres oder API → Postgres)
- Protection-Level (schützbar durch Medusa, überschreibbar durch Sync, etc.)
- Change-Log-Tracking (ja/nein)
- Validation-Rules (nullable, range, pattern)

Form: eine Python-Konstante `LEGACY_SYNC_FIELDS` (und analog für Discogs). Der Script iteriert über diese Liste für UPSERT, Diff, Validation. Kein Copy-Paste zwischen UPSERT-SQL und Diff-Logik.

### 4.2 Jede Änderung ist auditierbar
Jede Row-Änderung in einer gesyncten Tabelle produziert **genau einen** Change-Log-Eintrag mit:
- `sync_run_id` (eindeutig pro Run)
- `entity_type` (release/artist/label/...)
- `entity_id`
- `change_type` (inserted/updated/unchanged/skipped — ja, unchanged auch loggen für Completeness-Checks)
- `delta` (JSONB mit `{field: {old, new}}` für jedes geänderte Feld)
- `synced_at`

**Warum `unchanged` auch loggen?** Damit Completeness-Checks möglich sind. Wenn ich wissen will "hat der letzte Sync wirklich alle 41k Releases angefasst?", zähle ich Change-Log-Einträge für den run_id. Wenn es 30k sind statt 41k, ist etwas schiefgegangen. (Alternative: nur `changed`-Einträge loggen plus Summary mit `total_processed` im sync_log. Pragmatischer. Wird in Phase 1 entschieden.)

### 4.3 Jeder Run ist idempotent
Re-run eines Sync-Scripts darf keine Duplikate und keine spurious Change-Events produzieren. Wenn der Script sofort nach einem erfolgreichen Run nochmal läuft, müssen alle Diffs `unchanged` sein. Re-run ist ein legitimer Recovery-Mechanismus und muss sicher sein.

### 4.4 Jeder Run validiert sich selbst
Nach jedem Sync-Run läuft eine Validations-Phase, die prüft:
- Anzahl der erwarteten Source-Rows stimmt mit Ziel-Rows überein (+/- Filter)
- Keine NULL-Werte in NOT-NULL-Feldern
- Referenzielle Integrität (alle artistId-Referenzen existieren)
- Sanity-Ranges (legacy_price zwischen 0 und 99999, year zwischen 1900 und 2100)
- Keine Zeilen mit `legacy_last_synced` älter als 2x Cron-Intervall (= wurde beim letzten Run vergessen)

Fails der Validation setzen `sync_log.status = 'validation_failed'` und lösen Alert aus. Der Run selbst ist dann nicht "success" sondern "success_with_validation_errors".

### 4.5 Drift wird aktiv detektiert
Einmal täglich (z.B. 03:00 UTC, vor dem nächsten Sync-Zyklus) läuft ein **Drift-Detection-Job**, der stichprobenartig MySQL und Supabase vergleicht:
- Zufällige 100 Releases: alle gesyncten Felder Byte-für-Byte vergleichen
- Zählt MySQL-Rows vs. Supabase-Rows pro Kategorie
- Zählt MySQL-Images vs. Supabase-Images
- Vergleicht letzte-Modifikations-Timestamps

Ergebnisse werden in eine neue Tabelle `sync_drift_report` geschrieben. Wenn Drift > Threshold → Alert + optionaler Auto-Heal.

### 4.6 Auto-Heal bei Drift
Wenn Drift-Detection Inkonsistenzen findet, gibt es zwei Eskalations-Stufen:
1. **Soft-Heal:** Betroffene IDs werden beim nächsten regulären Sync-Run priorisiert/force-updated.
2. **Hard-Heal:** Bei schwerer Drift (>5% Zeilen, oder bei Feldern die nicht durch den regulären Sync abgedeckt sind) wird ein Full-Resync eingeplant. Full-Resync ist eine separate Funktion des Scripts, die explizit alle Zeilen berührt statt inkrementell.

Auto-Heal ist konservativ: im Zweifel lieber Alert senden als automatisch schreiben. Hard-Heal ist opt-in, nicht automatisch.

### 4.7 Dead-Man's-Switch
Ein kleiner Watchdog prüft alle 15 Minuten: "Gab es in den letzten N Minuten einen erwarteten Sync-Run?" N ist per-Flow konfigurierbar (Legacy: 75min, Discogs daily: 26h, R2: 75min). Wenn nein → Alert.

Implementation: eigenes Cron-Script oder Admin-API-Endpoint der alle X Minuten von einem externen Monitoring (oder selbst-gehostetem Cron) gepollt wird.

### 4.8 Beobachtbarkeit statt stille Erfolge
Alle Metriken aus Sync-Runs landen in einer konsistenten Schema-Form in `sync_log` und werden vom Admin-Dashboard gelesen. Keine "versteckten" Progress-Files, keine Log-Parsing-Tricks. Eine Tabelle ist Single Source of Truth.

Dazu gehört auch: die Metriken sind **ehrlich**. `new_images` ist wirklich "neue Bilder, die in diesem Run zum ersten Mal in die Tabelle kamen", nicht "Anzahl Insert-Attempts".

### 4.9 Alle Pfade sind cwd-unabhängig
Kein Python-Script nutzt `os.getcwd()` oder relative Pfade zur Auflösung von Daten-Files. Alle Pfade kommen aus:
- Environment-Variablen (z.B. `VOD_PROJECT_ROOT=/root/VOD_Auctions`)
- Oder absolute Pfade
- Oder walk-up-Heuristik analog zum TypeScript-Helper `paths.ts`

Das Script muss funktionieren egal von welchem Verzeichnis aus es gestartet wird.

### 4.10 Versionierung pro Script
Jeder Python-Sync-Script trägt eine Versions-Konstante (`SCRIPT_VERSION = "1.2.3"`) die bei jedem Run in `sync_log.changes.script_version` landet. Bei Script-Änderungen wird die Version erhöht. So kann man später sagen "alle Runs vor v1.2.0 hatten den Bug X, ich muss die betroffenen Rows re-syncen".

### 4.11 Graceful Degradation
Wenn das Ziel (Supabase) erreichbar aber langsam ist, oder wenn ein einzelnes Feld ein Schema-Problem hat, soll der Script nicht komplett abbrechen. Er isoliert das Problem auf Feld- oder Zeilen-Level, schreibt was er kann, und loggt was nicht.

### 4.12 Test-Mode
Jeder Script hat einen `--dry-run` Flag, der alle Queries ausführt (inkl. Diff-Computation), aber keine Writes committed. Output: "hätte diese Änderungen gemacht" + vollständiges Change-Log. Wird für Validierung vor Script-Updates genutzt.

---

## 5. Feld-Coverage-Matrix (Legacy → Release)

Stand 2026-04-05. **Muss in Phase 1 dieses Plans verifiziert und ergänzt werden.**

| Supabase-Feld | Syncs aktuell? | Diff-getrackt? | Frank editiert? | Priorität für Tracking |
|---|---|---|---|---|
| `title` | ✅ | ✅ | gelegentlich | hoch |
| `description` | ✅ | ❌ | oft | **hoch** |
| `year` | ✅ | ❌ | selten | mittel |
| `format` | ✅ | ❌ | selten | mittel |
| `format_id` | ✅ | ❌ | selten | mittel |
| `catalogNumber` | ✅ | ❌ | gelegentlich | mittel |
| `country` | ✅ | ❌ | selten | niedrig |
| `artistId` | ✅ | ❌ | kaum | niedrig |
| `labelId` | ✅ (bedingt) | ❌ | kaum (wegen label_enriched) | niedrig |
| `coverImage` | ✅ | ✅ | ja | hoch |
| `legacy_price` | ✅ | ✅ | oft | **hoch** |
| `legacy_condition` | ✅ | ❌ | **oft** — Zustand wird regelmäßig gepflegt | **kritisch** |
| `legacy_format_detail` | ✅ | ❌ | gelegentlich | mittel |
| `legacy_available` | ✅ | ✅ | **oft** — Verfügbarkeit ändert sich | hoch |
| `subtitle` | ❓ unbekannt | n/a | unbekannt | muss verifiziert werden |
| `barcode` | ❓ unbekannt | n/a | unbekannt | muss verifiziert werden |
| `language` | ❓ unbekannt | n/a | unbekannt | muss verifiziert werden |
| `pages` | ❓ unbekannt | n/a | bei Literatur: ja | muss verifiziert werden |
| `releaseDate` | ❓ unbekannt | n/a | unbekannt | muss verifiziert werden |
| `tracklist` (JSONB) | ❓ unbekannt | n/a | wahrscheinlich ja | muss verifiziert werden |
| `credits` | ❓ unbekannt | n/a | wahrscheinlich ja | muss verifiziert werden |
| `media_condition` | ❓ unbekannt | n/a | ja (wenn es aus legacy kommt) | muss verifiziert werden |
| `sleeve_condition` | ❓ unbekannt | n/a | ja | muss verifiziert werden |
| `article_number` | ❓ unbekannt | n/a | unbekannt | muss verifiziert werden |
| `tape_mag_url` | ❓ unbekannt | n/a | unbekannt | muss verifiziert werden |
| `pressOrgaId` | ❓ unbekannt | n/a | unbekannt | muss verifiziert werden |
| `legacy_availability` (int) | ❓ unbekannt | n/a | unbekannt — möglicherweise tote Spalte | muss verifiziert werden |
| `Image[]` (related) | ✅ via INSERT | ❌ | **oft** — heute 54 neue | **kritisch** |

**Protected by Medusa/Auction (dürfen NIE vom Sync überschrieben werden):**
- `id`, `createdAt`, `updatedAt` (letzteres wird derzeit jeden Run angefasst — prüfen ob das nötig ist)
- `auction_status`, `current_block_id`, `estimated_value`
- `sale_mode`, `direct_price`, `inventory`, `shipping_item_type_id`
- `label_enriched` (boolean, schützt `labelId`)
- `viewCount`, `averageRating`, `ratingCount`, `favoriteCount`

**Owned by Discogs sync:**
- `discogs_id`, `discogs_lowest_price`, `discogs_median_price`, `discogs_highest_price`
- `discogs_num_for_sale`, `discogs_have`, `discogs_want`, `discogs_last_synced`

**→ Phase 1.1 Aufgabe:** Legacy MySQL-Schema dumpen und feldweise abgleichen mit der Unbekannten-Liste oben. Ergebnis: definitives `LEGACY_SYNC_FIELDS` Dict mit vollständiger Coverage.

---

## 6. Robustheits-Layer

Drei architektonische Layer, die jedem Sync-Flow vorgeschaltet werden.

### 6.1 Contract Layer
- Maschinenlesbare Feld-Definition (siehe §4.1) als Python-Konstante im Script und als TypeScript-Konstante im Backend für UI-Anzeige.
- Bei jedem Script-Start wird das Ziel-Schema (Supabase) gegen den Contract validiert. Wenn eine Spalte fehlt oder einen anderen Typ hat → Abort mit klarer Fehlermeldung.
- Das Admin-Dashboard zeigt die Contract-Liste sichtbar an: "Legacy Sync trackt 23 Felder auf Release (alle diffbar)".

### 6.2 Execution Layer
- Sync-Script läuft mit strukturiertem Logging (JSON-Lines zu STDOUT/STDERR).
- Vor jedem Batch wird der Source-Row-Count gezählt. Nach jedem Batch wird der Write-Count gegen den erwarteten Count verifiziert.
- Jeder Script-Run schreibt seinen Status in `sync_log` in drei Phasen:
  - `started` (vor dem ersten Query)
  - `running` (updated während des Runs)
  - `success` / `failed` / `validation_failed` / `partial_success` (am Ende)
- Auch bei Crashes soll noch ein `sync_log` Eintrag existieren (try/except + finally block).

### 6.3 Validation & Drift Layer
- Nach jedem regulären Sync-Run: eigene Validation-Queries (siehe §4.4).
- Einmal täglich: Drift-Detection-Job (siehe §4.5) auf separater Cron-Schedule.
- Ergebnisse in `sync_drift_report` mit Columns: `id, run_id, sync_type, drift_type, expected_count, actual_count, sample_diffs JSONB, severity, detected_at`.

### 6.4 Observability Layer
- Admin-Dashboard hat eine neue Hauptseite `/app/sync` mit:
  - Live-Status jedes Sync-Flows (last run, next run, success rate last 7d)
  - Feld-Coverage-Matrix visualisiert
  - Change-Log der letzten 100 Änderungen filterable nach Feld, Entity, Run-ID
  - Drift-Report-Liste der letzten 30 Tage
  - Manual-Trigger-Button für Force-Resync einzelner Entities
- Alerting über Sentry + eine neue `sync_alerts` Tabelle, die der Admin direkt sieht.

### 6.5 Alerting Layer
Alerts werden in drei Schweregrade unterteilt:
- **Info:** "Sync-Run erfolgreich, 54 neue Bilder, 3 Feld-Changes" — nur Log
- **Warning:** "Run dauerte 3x länger als Durchschnitt" oder "2% Drift detektiert" — Dashboard-Notification, keine E-Mail
- **Error:** "Run fehlgeschlagen" oder "Dead-Man's-Switch: kein Run in 2h" oder ">5% Drift" — Dashboard + E-Mail an Admin

Keine Push-Notifications, keine Slack/SMS/Pager. E-Mail reicht für Solo-Operator.

---

## 7. Per-Flow Redesign

### 7.1 Legacy MySQL → Supabase

**Phase B-1: Full Field Audit (1 Tag, pur Research)**
- MySQL-Schema dumpen, alle `tape_mag.releases` (+ relevante Tabellen) Spalten listen
- Mapping zu Supabase Release-Feldern erstellen
- Lücken (Felder die in MySQL existieren aber nicht gesynct werden) bewusst entscheiden: sync oder explizit "wir wollen das nicht"
- Ergebnis: `LEGACY_SYNC_FIELDS` Contract

**Phase B-2: Script Rewrite (2-3 Tage)**
- `legacy_sync.py` refactor: Schleife über `LEGACY_SYNC_FIELDS` für UPSERT-Generierung, Diff-Computation, Change-Log-Writing
- Image-Handling: `INSERT ... RETURNING id` nutzen um echte Neu-Counts zu bekommen
- Alle Pfade via Environment-Variable (`VOD_PROJECT_ROOT`) oder walk-up-Heuristik
- Versioning-Konstante
- Dry-run-Flag
- Validation-Phase am Ende jedes Runs

**Phase B-3: Change-Log-Struktur neu**
- Neue Tabelle `sync_change_log_v2` mit vollständigem Schema (siehe §4.2)
- Migration-Script kopiert historische (leere) `sync_change_log`-Einträge — oder diese Tabelle wird einfach deprecated zugunsten v2
- Backend-API liest ab jetzt aus v2
- Admin-UI zeigt v2-Daten

**Phase B-4: Deployment**
- Erst `--dry-run` auf Staging-DB (wo wir heute die Schema-Kopie gemacht haben) → Diff-Output gegen echte Supabase-Daten vergleichen
- Dann echter Run auf Staging gegen Staging-Supabase
- Wenn sauber: Cron auf VPS für Produktions-Supabase umstellen (alter Script bleibt bis dann im Repo als Backup)

### 7.2 Discogs Daily Sync

**Phase D-1: Change-Tracking hinzufügen**
- Discogs-Sync trackt aktuell gar keine Changes. Das ist weniger kritisch weil Discogs-Preise sich kontinuierlich ändern und keine Editierarbeit von Frank sind, aber für Drift-Detection und "wann hat dieser Preis zuletzt seinen Wert geändert" wäre es nützlich.
- Minimale Version: Diff auf `discogs_lowest_price`, `discogs_median_price`, `discogs_num_for_sale` loggen
- Nicht-Ziele: keine historische Zeitreihe der Preise (das wäre ein separates Projekt)

**Phase D-2: Robustheit**
- Rate-Limit-Handling bereits vorhanden, aber Chunk-Completion-Tracking fehlt (wenn Chunk 3 crasht, startet der nächste Run wieder bei Chunk 1)
- Fix: jeder Chunk schreibt seinen Status einzeln in sync_log

### 7.3 R2 Image Sync

**Phase R-1: Entkopplung vom Legacy-Sync**
- R2-Upload aktuell im Legacy-Sync eingebettet. Das macht es schwer zu isolieren und separat zu debuggen.
- Separater Python-Script `r2_sync.py`, der die Image-Tabelle als Input nimmt (nicht MySQL)
- Eigener Cron

**Phase R-2: End-to-End-Verifikation**
- Statt nur ein Test-Bild zu pingen: stichprobenartig 50 zufällige Image-URLs aus der DB nehmen und HEAD-Request machen
- Broken URLs in eine Fehler-Tabelle schreiben, Admin-UI zeigt sie

**Phase R-3: Bucket-Count-Drift**
- Bucket-API abfragen, Anzahl der Files vergleichen mit Anzahl der `Image`-Rows mit `r2_synced = true` (neues Feld)
- Drift > 1% → Alert

### 7.4 Drift Detector (neuer Job)

**Phase DD-1:**
- Neues Python-Script `sync_drift_detector.py`
- Läuft einmal täglich um 03:00 UTC (vor dem Legacy-Sync-Zyklus)
- Zieht 100 zufällige `legacy-release-*` IDs, holt sich die Zeile aus MySQL und aus Supabase, vergleicht alle Felder aus `LEGACY_SYNC_FIELDS`
- Schreibt Findings in `sync_drift_report`

### 7.5 Dead-Man's-Switch (neuer Watchdog)

**Phase DM-1:**
- Neuer Admin-API-Endpoint `/admin/sync/watchdog` der für jeden bekannten Sync-Flow prüft: "gab es in den letzten N Minuten einen success-Run?"
- Admin-Dashboard zeigt diesen Status als Ampel
- Optional: Cron-Job der alle 15min den Endpoint intern pingt und bei Fails E-Mail sendet

---

## 8. Implementierungs-Phasen

Reihenfolge nach Risiko-zu-Nutzen-Verhältnis. Jede Phase ist separat deploybar, abhängig von vorheriger Phase wo nötig.

### Phase 0 — Quick Win (bereits erledigt 2026-04-05)
- ✅ Phase A: Backend-Query auf Image-Tabelle, Widget zeigt echte New-Image-Counts
- ✅ Path-Helper in `backend/src/lib/paths.ts`, alle 7 betroffenen Routes fixed
- ✅ 2 zusätzliche hardcoded Paths gefixt
- ✅ Sync-Robustheits-Plan dokumentiert (dieses Dokument)

### Phase 1 — Audit & Contract (1-2 Tage, ReadOnly)
**Keine Code-Deployments.** Nur Erkenntnis-Generierung.
1.1 Legacy MySQL-Schema vollständig dumpen
1.2 Feld-Mapping zu Supabase erstellen, Lücken markieren
1.3 Mit Frank: welche Felder editiert er wie oft? Prioritäten schärfen
1.4 `LEGACY_SYNC_FIELDS` Contract als Python + TypeScript-Konstanten vorschreiben (nicht deployen)
1.5 CLAUDE.md Cron-Schedule korrigieren ("stündlich", nicht "täglich 04:00")
1.6 Dieses Dokument auf v1.1 updaten mit verifizierter Feld-Matrix

### Phase 2 — Script Version v2 mit Full Field Coverage (2-3 Tage)
**Hohes Risiko, hohe Sorgfalt.** Der Script läuft stündlich in Produktion.
2.1 `legacy_sync.py` → `legacy_sync_v2.py` im Repo, v1 bleibt als Backup
2.2 Refactor um `LEGACY_SYNC_FIELDS` Contract
2.3 Dry-run-Flag implementieren
2.4 Neue `sync_change_log_v2` Tabelle deployen (additive Migration)
2.5 Dry-run gegen Staging-DB, Diff-Output inspizieren
2.6 Echter Run gegen Staging, Validierung
2.7 Cutover: Cron-Job umstellen auf v2, v1 läuft nicht mehr
2.8 Nach 7 Tagen stabiler Run: v1 aus dem Repo entfernen

### Phase 3 — Validation & Observability (2 Tage)
3.1 Script-Seite: Validation-Phase am Ende jedes Runs
3.2 Backend-API: erweiterte `/admin/sync` Response mit Validation-Ergebnissen
3.3 Admin-UI: neuer Tab "Field Coverage" zeigt `LEGACY_SYNC_FIELDS` live
3.4 Admin-UI: Change-Log-Viewer mit Filter-Funktion (nach Feld, Entity, Zeitraum)
3.5 Alert-Infrastruktur: `sync_alerts` Tabelle + Admin-UI-Bell-Icon

### Phase 4 — Drift Detection (2 Tage)
4.1 Neuer Python-Script `sync_drift_detector.py`
4.2 Neue `sync_drift_report` Tabelle
4.3 Cron-Schedule 03:00 UTC täglich
4.4 Admin-UI: Drift-Report-View
4.5 Erster manueller Run, erste Drift-Findings durchgehen

### Phase 5 — Dead-Man's-Switch (1 Tag)
5.1 Admin-API-Endpoint `/admin/sync/watchdog`
5.2 Cron-Script das alle 15min den Endpoint intern pingt
5.3 E-Mail-Alerting bei Fails via Resend
5.4 Dashboard-Ampel

### Phase 6 — R2 Entkopplung (2-3 Tage)
6.1 `r2_sync.py` als separates Script
6.2 Cron-Schedule entkoppelt von Legacy-Sync
6.3 End-to-End-Verification mit Sample-HEAD-Requests
6.4 Bucket-Count-Drift-Detection
6.5 Admin-Widget-Update

### Phase 7 — Discogs Change-Tracking (1-2 Tage)
7.1 Discogs-Sync trackt Preis-Deltas
7.2 `sync_change_log_v2` wird auch von Discogs-Sync befüllt
7.3 Admin-UI zeigt kombinierte Change-Log-Ansicht

### Phase 8 — Dokumentation finalisieren (0.5 Tage)
8.1 CLAUDE.md Sync-Section komplett re-write basierend auf tatsächlichem Stand
8.2 Dieses Dokument von "Plan" zu "Architecture Reference" umbenennen
8.3 Runbooks für häufige Operations (Force-Resync eines Entitys, Alert-Triage, etc.)

**Gesamte Zeit für alle Phasen:** ~15-20 Arbeitstage verteilt, vermutlich über 4-6 Wochen, da man zwischen Deploys warten will um Seiteneffekte zu sehen.

---

## 9. Rollback-Strategie

Jede Phase hat einen definierten Rollback-Weg.

| Phase | Rollback | Datenverlust-Risiko |
|---|---|---|
| Phase 1 (Audit) | N/A — nur Research, keine Änderungen | Kein |
| Phase 2 (Script v2) | Cron-Job zurück auf v1. `sync_change_log_v2` Tabelle bleibt (additive Migration). | Kein Datenverlust. Neue v2-Einträge bleiben aber unbenutzt. |
| Phase 3 (Validation) | Validation-Phase im Script auskommentieren, UI-Tab entfernen. | Kein |
| Phase 4 (Drift Detection) | Cron-Job deaktivieren. `sync_drift_report` Tabelle bleibt. | Kein |
| Phase 5 (Dead-Man's-Switch) | Cron-Job deaktivieren. | Kein |
| Phase 6 (R2 Entkopplung) | Legacy-Sync zurück auf R2-Upload, separaten `r2_sync.py` deaktivieren. | Kein |
| Phase 7 (Discogs Tracking) | Discogs-Sync-Änderungen revertieren. | Kein |

**Alle Phasen sind additiv.** Keine Phase erfordert eine destructive DB-Migration. Keine Phase kann historische Daten verlieren. Das ist by-design — Sync-Arbeit darf NIEMALS Datenverlust-Risiko haben.

---

## 10. Erfolgs-Kriterien

Dieser Plan ist erfolgreich umgesetzt, wenn alle folgenden Aussagen wahr sind:

1. **Feld-Coverage:** 100% der Felder die vom Sync-Script in Ziel-Tabellen geschrieben werden, sind auch im Change-Log getrackt. Kein Schreibvorgang ist unsichtbar.
2. **Metrik-Ehrlichkeit:** Jede Zahl im Admin-Dashboard ist semantisch präzise. "New Images" heißt "in diesem Run neu eingefügte Zeilen in der Image-Tabelle", nicht "Insert-Attempts".
3. **Change-Log-Vollständigkeit:** `sync_change_log_v2` hat für jeden erfolgreichen Sync-Run Einträge. Leere Days werden durch Drift-Detection oder Dead-Man's-Switch erkannt.
4. **Alert-Abdeckung:** Jeder fehlgeschlagene Sync-Run oder jede erkannte Drift > 5% produziert einen Alert den Robin spätestens bei der nächsten Admin-Dashboard-Öffnung sieht.
5. **Cwd-Unabhängigkeit:** Scripts und Backend-Routes funktionieren unabhängig vom Start-Verzeichnis. Verifiziert durch manuellen Start aus verschiedenen Verzeichnissen.
6. **Idempotency:** Ein doppelter Sync-Run innerhalb 1 Minute produziert keine spurious Change-Events. Verifiziert durch Integration-Test.
7. **Doku-Realitäts-Übereinstimmung:** CLAUDE.md beschreibt exakt was real läuft. Wird durch vierteljährlichen Audit verifiziert.
8. **Staging-Dry-Run:** Jede Script-Änderung wird vor Produktions-Deploy auf Staging-DB dry-run'd.

---

## 11. Nicht im Scope

Explizite Klarstellung was dieses Dokument NICHT löst:

- **Echtzeit-Sync / CDC (Change Data Capture):** MySQL → Supabase bleibt Batch. Real-time würde Debezium oder ähnliches erfordern und ist aktuell nicht rechtfertigbar.
- **Vollständige Historie aller Feld-Änderungen (Audit-Trail auf Ewigkeit):** Das `sync_change_log_v2` sammelt Changes seit seiner Einführung. Historische Daten vor v2 sind verloren für immer. Das ist akzeptabel.
- **Multi-Region-Replikation:** Nicht nötig. Eine Production-DB reicht.
- **Backup-Sync:** Supabase macht eigene Backups. Kein zweites Backup-Ziel.
- **Rückwärts-Sync (Supabase → MySQL):** MySQL bleibt Single Source of Truth für Legacy-Daten. Kein Schreibvorgang von Auction-Plattform zurück nach MySQL. Wenn das je gewünscht würde, wäre es ein komplett separates Projekt.
- **AGB-Konforme Change-Historie für Legal-Zwecke:** `sync_change_log_v2` ist operational, nicht legal-grade. Wenn für GoBD-Compliance ein anderer Audit-Trail nötig ist, kommt der vom ERP-Modul (siehe ERP_WARENWIRTSCHAFT_KONZEPT.md v5).
- **Performance-Optimierung:** Der aktuelle Sync braucht 30-45 Sekunden für 41k Releases. Das ist ausreichend. Speed ist kein Ziel dieses Plans.

---

## 12. Offene Fragen für Robin

Vor Beginn von Phase 1:

1. **Field-Audit mit Frank:** Willst du Frank fragen welche Felder er am häufigsten editiert, oder machen wir das aus dem Code / den existierenden Daten? (Empfehlung: kurzer Chat reicht, 15min)
2. **Staging-DB für Dry-Runs:** Die Staging-DB ist schema-synchron (heute provisioniert). Sollen Dry-Runs dorthin oder gegen eine lokale Postgres? Ich empfehle Staging — dafür ist sie da.
3. **Alerting-Kanal:** Nur E-Mail, oder auch Dashboard-Banner? (Empfehlung: beides, aber E-Mail ist das Minimum.)
4. **Phase-2-Risiko:** Phase 2 tauscht das laufende Sync-Script aus. Willst du während des Cutovers eine Backup-Wiederholung einlegen (v1 läuft parallel für 48h), oder direkter Cutover? (Empfehlung: paralleler Betrieb, additive — `sync_log` kann beide Varianten unterscheiden über `script_version`).
5. **Start-Priorität:** Ich empfehle Reihenfolge Phase 1 → 2 → 3 → 5 → 4 → 6 → 7 → 8. Phase 5 (Dead-Man's-Switch) ist kurz und nützlich, deshalb vor Phase 4 (Drift, aufwändiger). Einverstanden?

---

## 13. Nächster Schritt

Nach Freigabe dieses Dokuments durch Robin: **Phase 1 (Audit & Contract) starten**. Das ist read-only, braucht keine Deploys, kein Produktions-Risiko. Ergebnis ist ein konkretes `LEGACY_SYNC_FIELDS`-Dict plus eine aktualisierte Version dieses Dokuments mit der verifizierten Feld-Matrix.

Phase 2 (Script v2) beginnt erst, wenn Phase 1 abgeschlossen und das `LEGACY_SYNC_FIELDS`-Dict review'd ist.

---

*Dieses Dokument ist ein Arbeits-Plan. Es beschreibt nicht, wie die Sync-Infrastruktur JETZT aussieht, sondern wie sie aussehen soll. Der aktuelle Zustand ist in §2 dokumentiert. Jede Phase-Umsetzung aktualisiert §8 mit Status-Markern und fügt ein Kapitel "Lessons Learned" hinzu.*
