# Sync Robustness Plan

**Version:** 2.1 (Field Audit complete)
**Datum:** 2026-04-05
**Status:** Entscheidungsvorlage — Phase A1 abgeschlossen, bereit für Robin-Review vor Phase A2
**Vorgänger:** v2.0 (Ausgangsdokument, git history `97b4873`), v1.0 (zu breit, git history `e2af928`)

## Änderung v2.0 → v2.1

Phase A1 (Field Audit) abgeschlossen. Die MySQL-Quell-Schemas aller Legacy-Tabellen wurden verifiziert und gegen den Python-Script-Code abgeglichen. §6 (Feld-Ownership-Matrix) ist jetzt mit realen Werten befüllt, alle `❓`-Felder aus v2.0 sind aufgelöst. Zusätzlich ein neues §6.3 mit Audit-Befunden (ungenutzte MySQL-Spalten, tote Supabase-Spalten, Literatur-Sonderregeln).

---

## 1. Executive Summary

Der Legacy-MySQL-Sync schreibt Daten korrekt nach Supabase, lügt aber in seinen Metriken und trackt Änderungen nur auf 4 von 14 gesyncten Feldern. Es gibt keine Validierung, keine Alarmierung, keinen Dead-Man's-Switch, keine Drift-Erkennung. Stille Fehler blieben heute 7 Tage lang unsichtbar, bis Robin zufällig ins Dashboard schaute.

**Zielbild:** Jeder Sync-Run schreibt eine vollständige, ehrliche Summary. Fehlschläge und ausbleibende Runs alarmieren. Drift wird erkannt und markiert. Jede Änderung an einer gesyncten Tabelle ist nachvollziehbar. Keine zweite Plattform, um die erste zu überwachen.

**Priorisierung:** Sechs Muss-Maßnahmen zuerst. Alles andere später oder nie. Keine Gleichrangigkeit zwischen Legacy, Discogs und R2 — Legacy hat Vorrang, weil dort täglich aktiv editiert wird.

---

## 2. Ausgangsprobleme und Lessons Learned

Reduziert auf die Punkte, die architektonische Konsequenzen haben:

1. **Stille Coverage-Lücken.** `legacy_sync.py` schreibt 14 Felder, trackt 4. Alles außer `title`, `legacy_price`, `legacy_available`, `coverImage` ist unsichtbar im Audit-Trail.
2. **Metriken lügen.** `sync_log.new_images: 32866` ist kumulativer Insert-Attempt-Count (ON CONFLICT DO NOTHING), kein Per-Run-Delta. Stabil über alle Runs, täuscht Aktivität vor.
3. **`sync_change_log` war 7 Tage leer.** Niemand wurde gewarnt. Die Existenz der Tabelle suggeriert Vollständigkeit, die Befüllung leistet sie nicht.
4. **Path-Fragilität.** `process.cwd()/..` und `__dirname/../../../...` in Backend-Routes und potenziell in Python-Scripts. Heute haben wir 7 Backend-Dateien gefixt; ob der Python-Script betroffen ist, ist ungeprüft.
5. **Kein Alert bei Fehler.** `sync_log.status='error'` wird geschrieben, niemand liest es.
6. **Kein Dead-Man's-Switch.** Wenn der Cron stirbt, läuft stundenlang nichts, und es fällt nicht auf.
7. **Dokumentations-Drift.** CLAUDE.md sagte "täglich 04:00 UTC", real läuft der Cron stündlich. Niemand hat abgeglichen.
8. **Kein Dry-Run-Modus.** Scripts können nicht gegen Staging getestet werden ohne Produktionsrisiko.

Alle weiteren Befunde (misleading naming, ungeprüfte Felder in MySQL, alte hardcoded Pfade) sind Ausprägungen dieser acht Kern-Probleme.

---

## 3. Zielbild und Design-Prinzipien

Fünf Prinzipien. Nicht verhandelbar bei jeder Muss-Maßnahme.

1. **Ehrlichkeit vor Vollständigkeit.** Eine Metrik, die `new_images` heißt, muss tatsächlich neue Images pro Run zählen. Lieber weniger Metriken, die stimmen, als viele, die lügen.
2. **Feld-Contract als Wahrheit.** Was gesynct wird, steht als maschinenlesbare Liste im Code. UPSERT-SQL, Diff-Logik und Validation iterieren über dieselbe Liste. Kein Copy-Paste-Drift.
3. **Observability nur mit Mehrwert.** Kein unchanged-Row-Logging. Kein Voll-Audit auf Ewigkeit. Beobachtet wird, was zur Fehler-Erkennung oder zur Rechenschaft gegenüber Frank nötig ist. Nicht mehr.
4. **Fail loud, aber einmal.** Jeder Fehler erzeugt genau einen Alert, nicht tausend. Stille Fehler sind verboten, Alert-Spam auch.
5. **Keine Meta-Plattform.** Die Überwachung läuft in denselben Tabellen und denselben Admin-Pages wie die Sync-Logik selbst. Keine zweite Datenbank, kein Prometheus, kein Grafana. Reicht Supabase + Admin-UI + E-Mail.

---

## 4. Harte Priorisierung

Jede Maßnahme bekommt eine Prio-Klasse. Entscheidungskriterium: operativer Schmerz bei Ausbleiben.

### Priorität A — Muss jetzt (Wochen 1-2)

| # | Maßnahme | Warum zwingend |
|---|---|---|
| A1 | **Feld-Contract für Legacy-Sync** | Ohne Contract ist jede weitere Arbeit Blindflug. Inventur liefert Wahrheit über gesyncte Felder. |
| A2 | **Run-Summary mit ehrlichen Metriken** | Heute lügen die Zahlen. Das ist gefährlicher als gar keine Zahlen. |
| A3 | **Full-Field Change-Detection im Python-Script** | Alle 14 Felder diffen, nicht nur 4. Frank's Edits müssen sichtbar sein. |
| A4 | **Post-Run Validation** | Row-Count-Check, NULL-Check, Integrity-Check. Scheitert lautstark wenn etwas nicht stimmt. |
| A5 | **Dead-Man's-Switch** | Wenn der letzte Run > 90 Min alt ist, alert. Das ist die minimale Sicherheit gegen einen toten Cron. |
| A6 | **E-Mail-Alert bei Fehler oder Validation-Fail** | Genau ein E-Mail-Kanal über Resend. Kein Slack, kein Pager. |

### Priorität B — Phase 2 (Wochen 3-6, nach A stabil)

| # | Maßnahme | Warum sinnvoll, aber nicht sofort |
|---|---|---|
| B1 | **Drift Detection (Count + Schedule)** | Erkennt Divergenzen die A nicht abdeckt. |
| B2 | **Python-Script-Pfade härten** | Cwd-Unabhängigkeit analog zum TypeScript-Helper. Heute spekulativ — fixen sobald Phase-A-Script angefasst wird. |
| B3 | **Dry-Run-Flag für Legacy-Sync** | Testbarkeit gegen Staging-DB. |
| B4 | **CLAUDE.md Sync-Section korrigieren** | Cron-Schedule, Tabellen, Feld-Liste. Ein Mal sauber machen. |

### Priorität C — Später (Monat 2+)

| # | Maßnahme | Warum nicht jetzt |
|---|---|---|
| C1 | **Drift Detection (Field + Referential)** | Voll-Vergleich ist teuer, Count+Schedule reichen als Einstieg. |
| C2 | **Discogs Change-Tracking** | Discogs-Daten sind externe Preise, nicht Frank's Arbeit. Niedrige Priorität. |
| C3 | **R2 Entkopplung vom Legacy-Sync** | Funktioniert derzeit. Erst trennen wenn es schmerzt. |
| C4 | **Admin-UI-Ausbau (Change-Log-Browser, Drift-Reports)** | Erst wenn die Daten sauber fließen. Vorher reicht die bestehende `/app/sync` Seite. |

### Priorität D — Optional / bewusst zurückgestellt

| # | Maßnahme | Warum nicht gebaut |
|---|---|---|
| D1 | **Auto-Heal bei Drift** | Zu riskant. Drift-Erkennung + manueller Re-Sync reicht. Auto-Heal erst bei stabilen Drift-Metriken über Monate. |
| D2 | **Unchanged-Row-Logging** | Macht `sync_change_log` um Faktor 1000 größer, keinen messbaren Mehrwert. Vollständigkeits-Checks laufen über Run-Summary, nicht über Voll-Logging. |
| D3 | **Real-time CDC / Debezium** | Batch-Sync reicht. Real-time braucht niemand. |
| D4 | **Zweite Monitoring-Plattform** | Supabase + Admin-UI + E-Mail reicht. Prometheus/Grafana ist Overkill. |
| D5 | **Multi-Region / Backup-Sync** | Supabase macht Backups. Kein zweites Ziel. |
| D6 | **Asset-Integrity-Check für R2 (Bulk-HEAD)** | Teuer, unklarer Nutzen. Einzelnes Test-Bild wie heute reicht als Liveness. |

---

## 5. Kernarchitektur für Robustheit

Drei Datenstrukturen, kein neues Framework. Alle leben in Supabase neben den existierenden Tabellen.

### 5.1 `sync_run` (existiert bereits als `sync_log`, wird erweitert)

Eine Zeile pro Sync-Run. Die existierende Tabelle `sync_log` wird beibehalten, aber mit zusätzlichen Spalten und einer geschärften Semantik für das `changes` JSONB-Feld.

**Neue oder zu präzisierende Felder in `sync_log`:**

| Feld | Typ | Zweck |
|---|---|---|
| `run_id` | text | Eindeutige ID (UUID), wird von Script generiert und in `sync_change_log_v2.sync_run_id` referenziert. |
| `script_version` | text | z.B. "legacy_sync.py v2.1.0". Bei Script-Änderungen inkrementiert. |
| `phase` | text | `started / running / success / failed / validation_failed` |
| `started_at` | timestamp | Script-Start. |
| `ended_at` | timestamp | Script-Ende (auch bei Crash via finally). |
| `duration_ms` | integer | Computed. |
| `rows_source` | integer | Wie viele Zeilen in der Quelle (MySQL)? |
| `rows_written` | integer | Wie viele UPSERTs ausgeführt? |
| `rows_changed` | integer | Wie viele hatten tatsächlich Field-Deltas? |
| `rows_inserted` | integer | Wie viele waren neu? |
| `images_inserted` | integer | Wie viele Image-Rows tatsächlich neu (nicht Insert-Attempts)? |
| `validation_status` | text | `ok / warnings / failed` — gesetzt von Phase A4. |
| `validation_errors` | jsonb | Array von Fehler-Objekten wenn validation_status ≠ ok. |

**Das `changes`-JSONB-Feld wird nicht mehr als Free-Form-Container benutzt.** Stattdessen: strukturierte Felder oben. `changes` bleibt leer oder wird für script-spezifische Extras genutzt, nie für Haupt-Metriken.

### 5.2 `sync_change_log_v2` (neu, additive Migration)

**Ersetzt** die existierende (und leere) `sync_change_log` Tabelle. Enthält ausschließlich **echte Änderungen**, keine `unchanged`-Zeilen.

| Feld | Typ | Zweck |
|---|---|---|
| `id` | bigserial | PK |
| `run_id` | text | FK auf `sync_log.run_id` |
| `synced_at` | timestamp | wann dieser Eintrag geschrieben wurde |
| `entity_type` | text | `release / artist / label / pressorga / image` |
| `entity_id` | text | z.B. `legacy-release-12345` |
| `change_type` | text | `inserted / updated / image_inserted` — keine `unchanged` |
| `field` | text | Nullable. Bei `updated` der Feldname. Bei `inserted` null. |
| `old_value` | text | Nullable. Stringified. |
| `new_value` | text | Nullable. Stringified. |

**Design-Entscheidung:** Eine Zeile **pro geändertem Feld**, nicht pro Entity. Ein einzelner Release-Update der 3 Felder ändert, schreibt 3 Zeilen. Macht Filter-Queries ("wann hat sich legacy_price von X Release geändert?") trivial und vermeidet JSONB-Queries auf `delta`-Spalten.

**Größen-Abschätzung:** Bei 41k Releases und stündlichem Sync: wenn pro Run durchschnittlich 10 Felder auf 5 Releases geändert werden, sind das 50 Zeilen/Stunde = 1200/Tag = 438k/Jahr. Bei 100 Byte pro Zeile = 44 MB/Jahr. Unproblematisch.

### 5.3 `sync_drift_report` (neu, Phase B)

Eine Zeile pro detektiertem Drift-Vorkommen, nicht pro Drift-Check-Run. Wird nur befüllt wenn Drift > Threshold.

| Feld | Typ | Zweck |
|---|---|---|
| `id` | bigserial | PK |
| `detected_at` | timestamp | Wann erkannt |
| `drift_type` | text | `count / field / referential / schedule / asset` (siehe §8) |
| `severity` | text | `info / warning / error` |
| `details` | jsonb | Drift-Typ-spezifische Daten |
| `resolved` | boolean | Default false — wird per Admin-UI oder Auto-Resolve geschlossen |
| `resolution_note` | text | Optional |

### 5.4 Was NICHT gebaut wird

- **Keine Voll-Audit-Tabelle mit jeder unveränderten Row.** Völlig unnötige Datenmenge.
- **Keine separate Monitoring-DB.** Sync-State und Sync-Observability leben in derselben Supabase-DB wie die Produktions-Daten.
- **Kein Metriken-Stream / Prometheus-Export.** Admin-UI liest direkt aus den oben genannten Tabellen.

---

## 6. Feld-Ownership und Schutzregeln

Die wichtigste neue Artefakt dieses Plans. Ohne klare Ownership ist jede Robustheits-Logik beliebig.

**Prinzip:** Für jedes Feld in `Release` (und analog in den anderen gesyncten Tabellen) existiert genau eine Source of Truth. Alle anderen Akteure sind Read-Only oder Override-Only-unter-Bedingung.

### 6.1 Release-Feld-Matrix (verifiziert 2026-04-05 via Phase A1)

**MySQL-Quell-Realität:** Die Tabelle `3wadmin_tapes_releases` hat nur **14 Spalten**. Die Literatur-Tabellen (`3wadmin_tapes_{band,labels,pressorga}_lit`) haben je **8 Spalten** (kleinere Teilmenge). Viele Felder im Supabase-`Release`-Schema haben schlicht **keine Legacy-Quelle** und werden deshalb nie gesynct — egal ob wir wollen oder nicht. Zwei MySQL-Spalten werden vom Script ignoriert (`review`, `frei_user`).

**Legende Spalte "Sync überschreibt?":**
- **Ja (r)** = Überschrieben nur bei Music-Releases (sync_releases)
- **Ja (r+l)** = Überschrieben bei Music-Releases UND Literatur (sync_literature)
- **Ja (l only)** = Nur bei Literatur (z.B. pressOrgaId)
- **Bedingt** = Mit Schutzregel (`label_enriched`)
- **Nein** = Sync fasst das Feld nie an
- **Insert-only** = Nur beim ersten Einfügen gesetzt
- **Technisch** = Immer NOW(), nicht inhaltlich

| Supabase-Feld | MySQL-Quelle | Sync überschreibt? | Owner / Konflikt-Entscheider | Notiz |
|---|---|---|---|---|
| `id` | `r.id` / `t.id` (mit Präfix) | Insert-only | System | Deterministisch: `legacy-{release,bandlit,labellit,presslit}-{id}` |
| `slug` | computed (artist + title + id) | Ja (r+l) | Script | Kein direktes MySQL-Feld |
| `title` | `r.title` / `t.title` | Ja (r+l) | Frank (MySQL) | |
| `description` | `r.moreinfo` / `t.text` | Ja (r+l) | Frank | |
| `year` | `r.year` / `t.year` | Ja (r+l) | Frank | 0/NULL → Supabase NULL |
| `format` (enum) | mapped from `r.format` / `t.format` | Ja (r+l) | Frank | ReleaseFormat-Enum |
| `format_id` | `r.format` / `t.format` | Ja (r+l) | Frank | |
| `catalogNumber` | `r.cataloguenumber` | Ja (**r only**) | Frank | Literatur hat keine cataloguenumber |
| `country` | JOIN `3wadmin_shop_countries` → translated | Ja (r+l) | Frank (via MySQL country FK) | DE → EN translation im Script |
| `artistId` | `legacy-artist-{r.artist}` | Ja (r + band_lit) | Frank | Für band_lit als "Band-of-literature" |
| `labelId` | `legacy-label-{r.label}` | **Bedingt** | Label-Enrichment-Pipeline | `label_enriched=TRUE` schützt vor Überschreibung |
| `pressOrgaId` | `legacy-pressorga-{t.aid}` | Ja (**press_lit only**) | Frank | Nur von sync_literature für press_lit gesetzt |
| `coverImage` | `bilder_1.bild` (WHERE typ=10/12/13/14) | Ja (r+l) | Frank | Subquery, nur erstes Bild pro Entity |
| `legacy_price` | `r.preis` / `t.preis` | Ja (r+l) | Frank | |
| `legacy_condition` | `r.spezifikation` | Ja (**r only**) | Frank | **Literatur-Tabellen haben kein spezifikation-Feld** |
| `legacy_format_detail` | JOIN `3wadmin_tapes_formate.name` | Ja (r+l) | Frank | Vom Format-FK, nicht eigene Spalte |
| `legacy_available` (bool) | computed: `r.frei == 1` | Ja (**r only**) | Frank | **Literatur-Tabellen haben kein frei-Feld**, bleibt Default `TRUE` |
| `legacy_last_synced` | — | Technisch (r+l) | Script | NOW() bei jedem Run |
| `updatedAt` | — | Technisch (r+l) | Script | NOW() bei jedem Run — Sync berührt ALLE Zeilen jede Stunde |
| `createdAt` | — | Insert-only | Postgres Default | |
| `product_category` | aus Tabellen-Zuordnung abgeleitet | Insert-only | Script | `release` / `band_literature` / `label_literature` / `press_literature` |
| `label_enriched` | — | **Nein** | Label-Enrichment-Pipeline (separates Tool) | Schutz-Flag für `labelId` |
| `subtitle` | **existiert nicht in MySQL** | **Nie** | — | Supabase-Feld ohne Legacy-Quelle |
| `barcode` | **existiert nicht in MySQL** | **Nie** | — | Supabase-Feld ohne Legacy-Quelle |
| `language` | **existiert nicht in MySQL** | **Nie** | — | |
| `pages` | **existiert nicht in MySQL** (auch nicht in lit) | **Nie** | — | |
| `releaseDate` | **existiert nicht in MySQL** | **Nie** | — | |
| `tracklist` (JSONB) | **existiert nicht in MySQL** | **Nie** | — | |
| `credits` | **existiert nicht in MySQL** | **Nie** | — | |
| `article_number` | **existiert nicht in MySQL** | **Nie** | — | Unique index existiert aber niemand schreibt das Feld — wohl komplett tot |
| `tape_mag_url` | **existiert nicht in MySQL** | **Nie** | — | |
| `legacy_availability` (integer) | **existiert nicht in MySQL** | **Nie** | — | **Tote Spalte.** Nicht zu verwechseln mit `legacy_available` (bool). Bug in Schema-Design, kein Script schreibt das je. |
| `media_condition` | **existiert nicht in MySQL** | **Nein** | Admin (manuell) | |
| `sleeve_condition` | **existiert nicht in MySQL** | **Nein** | Admin | |
| `estimated_value` | — | **Nein** | Admin | |
| `auction_status` | — | **Nein** | Auction-Engine | |
| `current_block_id` | — | **Nein** | Auction-Engine | |
| `sale_mode` | — | **Nein** | Admin | Default `'auction_only'` |
| `direct_price` | — | **Nein** | Admin | |
| `inventory` | — | **Nein** | Admin | |
| `shipping_item_type_id` | — | **Nein** | Admin | |
| `viewCount` | — | **Nein** | Storefront-Traffic | |
| `averageRating` / `ratingCount` / `favoriteCount` | — | **Nein** | User-Aktion | |
| `discogs_id` | Discogs API | **Nein** vom Legacy-Sync / **Ja** vom Discogs-Sync | Discogs-Sync-Script | |
| `discogs_lowest_price` | Discogs API | **Nein/Ja** (siehe oben) | Discogs-Sync | |
| `discogs_median_price` | Discogs API | **Nein/Ja** | Discogs-Sync | |
| `discogs_highest_price` | Discogs API | **Nein/Ja** | Discogs-Sync | |
| `discogs_num_for_sale` | Discogs API | **Nein/Ja** | Discogs-Sync | |
| `discogs_have` | Discogs API | **Nein/Ja** | Discogs-Sync | |
| `discogs_want` | Discogs API | **Nein/Ja** | Discogs-Sync | |
| `discogs_last_synced` | — | **Nein/Ja** (NOW() vom Discogs-Sync) | Discogs-Sync | |

### 6.2 LEGACY_SYNC_FIELDS (Contract als Python-Literal)

Die folgende Python-Datenstruktur ist das verbindliche Ergebnis des Audits. Sie soll in Phase A3 als zentrale Konstante im Script leben. Alle UPSERT-SQL-Statements, Diff-Checks, Validation-Queries iterieren über diese Liste.

```python
LEGACY_SYNC_FIELDS = {
    "release": {
        # Music releases — full 14-field coverage
        "title":                {"mysql": "r.title",                      "type": "text",    "nullable": False, "diff": True},
        "description":          {"mysql": "r.moreinfo",                   "type": "text",    "nullable": True,  "diff": True},
        "year":                 {"mysql": "r.year (if > 0)",              "type": "int",     "nullable": True,  "diff": True},
        "format":               {"mysql": "map_format(r.format)",         "type": "enum",    "nullable": False, "diff": True},
        "format_id":            {"mysql": "r.format",                     "type": "int",     "nullable": True,  "diff": True},
        "catalogNumber":        {"mysql": "r.cataloguenumber",            "type": "text",    "nullable": True,  "diff": True},
        "country":              {"mysql": "translate(country_name)",      "type": "text",    "nullable": True,  "diff": True},
        "artistId":             {"mysql": "legacy-artist-{r.artist}",     "type": "text",    "nullable": True,  "diff": True},
        "labelId":              {"mysql": "legacy-label-{r.label}",       "type": "text",    "nullable": True,  "diff": True, "guard": "label_enriched"},
        "coverImage":           {"mysql": "bilder_1.bild (typ=10)",       "type": "text",    "nullable": True,  "diff": True},
        "legacy_price":         {"mysql": "r.preis",                      "type": "decimal", "nullable": True,  "diff": True},
        "legacy_condition":     {"mysql": "r.spezifikation",              "type": "text",    "nullable": True,  "diff": True},
        "legacy_format_detail": {"mysql": "3wadmin_tapes_formate.name",   "type": "text",    "nullable": True,  "diff": True},
        "legacy_available":     {"mysql": "r.frei == 1",                  "type": "bool",    "nullable": False, "diff": True},
    },
    "literature": {
        # band_lit, labels_lit, pressorga_lit — 10 fields (no condition, no availability)
        "title":                {"mysql": "t.title",                      "type": "text",    "nullable": False, "diff": True},
        "description":          {"mysql": "t.text",                       "type": "text",    "nullable": True,  "diff": True},
        "year":                 {"mysql": "t.year",                       "type": "int",     "nullable": True,  "diff": True},
        "format":               {"mysql": "map_format(t.format)",         "type": "enum",    "nullable": False, "diff": True},
        "format_id":            {"mysql": "t.format",                     "type": "int",     "nullable": True,  "diff": True},
        "country":              {"mysql": "translate(country_name)",      "type": "text",    "nullable": True,  "diff": True},
        "artistId":             {"mysql": "legacy-artist-{t.aid}",        "type": "text",    "nullable": True,  "diff": True, "only": "band_lit"},
        "labelId":              {"mysql": "legacy-label-{t.aid}",         "type": "text",    "nullable": True,  "diff": True, "guard": "label_enriched", "only": "labels_lit"},
        "pressOrgaId":          {"mysql": "legacy-pressorga-{t.aid}",     "type": "text",    "nullable": True,  "diff": True, "only": "pressorga_lit"},
        "coverImage":           {"mysql": "bilder_1.bild (typ=12/13/14)", "type": "text",    "nullable": True,  "diff": True},
        "legacy_price":         {"mysql": "t.preis",                      "type": "decimal", "nullable": True,  "diff": True},
        "legacy_format_detail": {"mysql": "3wadmin_tapes_formate.name",   "type": "text",    "nullable": True,  "diff": True},
        # Not synced for literature (no MySQL source):
        # - legacy_condition (no spezifikation column in lit tables)
        # - legacy_available (no frei column in lit tables — default stays TRUE)
        # - catalogNumber (no cataloguenumber column in lit tables)
    },
    "artist": {
        "name": {"mysql": "3wadmin_tapes_band.name", "type": "text", "nullable": False, "diff": True},
        # Insert-only: slug (computed from name)
        # NOT synced: text, alias, country, members, gender (ignored by script)
    },
    "label": {
        "name": {"mysql": "3wadmin_tapes_labels.label", "type": "text", "nullable": False, "diff": True},
        # Insert-only: slug
        # NOT synced: text, country, years_running (ignored by script)
    },
    "pressorga": {
        "name": {"mysql": "3wadmin_tapes_pressorga.name", "type": "text", "nullable": False, "diff": True},
        # NOT synced: text, country, year, format (ignored by script)
    },
    "image": {
        # Images are insert-only via ON CONFLICT DO NOTHING.
        # id pattern: legacy-image-{release_id}  for music releases (from 3wadmin_tapes_releases subquery)
        # id pattern: legacy-image-lit-{image_id} for literature (from bilder_1.id subquery)
        # Image.createdAt is set to NOW() at insert time — this is the signal
        # that the 24h rolling-window query in /admin/sync relies on.
    },
}
```

### 6.3 Audit-Befunde — Auffälligkeiten im aktuellen Stand

Aus dem Phase-A1-Audit sind fünf Punkte aufgefallen, die über die reine Feld-Matrix hinausgehen und Robin's Aufmerksamkeit brauchen:

1. **`review` Spalte in MySQL wird komplett ignoriert.** Das `3wadmin_tapes_releases.review` Feld (Typ `text`) wird vom Script nicht gelesen und nirgendwo in Supabase geschrieben. Wenn dort Inhalte drin stehen (z.B. von Frank geschriebene Reviews), gehen sie verloren. **Aktion nötig:** Stichproben-Query in MySQL ob `review`-Feld substantiellen Content hat. Wenn ja → Feld in `LEGACY_SYNC_FIELDS` aufnehmen und `review` → neuer Supabase-Spalte (z.B. `legacy_review TEXT`) mappen.

2. **`legacy_availability` (int) in Supabase ist eine tote Spalte.** Kein Script schreibt sie je. Die korrekte Availability-Spalte ist `legacy_available` (bool). Die `legacy_availability`-int wurde wahrscheinlich als Schema-Relikt eingefügt und nie entfernt. **Aktion nötig (Phase B):** additive Migration, die die tote Spalte als `DEPRECATED` kommentiert oder entfernt. Kein Produktions-Risiko, aber sauberes Schema-Design.

3. **Literatur-Einträge haben kein `legacy_condition` und kein `legacy_available`.** Weil die MySQL-Lit-Tabellen diese Felder nicht haben. Alle Literatur-Rows in Supabase haben `legacy_condition=NULL` und `legacy_available=TRUE` (Default). Das ist by design — MySQL kann es nicht liefern. **Wichtig für Admin-UI:** Condition-Filter darf diese Einträge nicht ausschließen oder als "unbekannt" falsch anzeigen.

4. **Literatur-Einträge haben kein `catalogNumber`.** Gleiche Begründung wie #3. 6,326 Press-Literature-Einträge haben alle `catalogNumber=NULL`. Kein Feature-Bug, nur Wissen.

5. **Image-IDs kollidieren nicht zwischen Release-Typen.** Das Script nutzt zwei verschiedene ID-Patterns: `legacy-image-{release_id}` für Music-Releases (aus dem release-internen subquery) und `legacy-image-lit-{image_id}` für Literatur. Das ist sauber — keine Sorge wegen Kollisionen. Aber: die beiden Pattern sind **nicht dokumentiert** außer im Code. In CLAUDE.md nachtragen.

Diese fünf Befunde ändern nichts an Phase-A-Prioritäten. Sie sind als "zu berücksichtigen bei Phase A3 (Script-Rewrite)" markiert. Punkt 1 (review-Feld) ist optional — nur wenn dort wertvoller Content steckt.

### 6.4 Konflikt-Verhalten

Wenn ein Feld, das Sync überschreibt, gleichzeitig manuell im Admin-UI geändert wird, gewinnt **Frank (MySQL)** beim nächsten stündlichen Sync. Der Admin-UI-Wert wird überschrieben. Das ist Design, nicht Bug.

Wenn Robin das für ein bestimmtes Feld ändern will (Admin wins), muss das Feld eine Schutzregel analog zu `label_enriched` bekommen:
1. Neue boolean-Spalte `{field}_manual_override` in `Release`
2. Script prüft vor UPSERT: `IF {field}_manual_override THEN keep existing ELSE overwrite`
3. Admin-UI setzt das Flag beim Bearbeiten

Das ist per Feld einzeln zu entscheiden. Phase C, nicht jetzt. Phase A und B bleiben bei "Frank in MySQL wins".

### 6.5 Image-Ownership

Images (`Image`-Tabelle, verknüpft über `releaseId`) haben eine eigene Regel:

- **Image-Rows sind insert-only vom Legacy-Sync.** Einmal eingefügt, nie überschrieben. Kein Update, kein Delete vom Sync.
- **Löschung** passiert nicht automatisch. Wenn Frank ein Bild in MySQL entfernt, bleibt die Supabase-Row bestehen. Das ist eine bewusste Einschränkung — Supabase-Image-Deletion würde Image-URLs in Auction-Blocks invalidieren. Cleanup-Job ist separate, spätere Arbeit (Prio D).
- **`coverImage`-Feld auf Release** wird via Sync überschrieben, aber verwaiste `Image`-Rows (deren URL nicht mehr Cover ist) bleiben bestehen und sind im Storefront-Galerie-Panel sichtbar. Das ist Verhalten, keine Bug.

---

## 7. Validation, Alerting, Dead-Man's-Switch

Die drei Muss-Mechanismen aus Prio A. Alle drei sind minimal.

### 7.1 Post-Run Validation (A4)

Nach jedem Sync-Run läuft der Script eine Validation-Phase aus vier Checks:

| # | Check | Failure-Verhalten |
|---|---|---|
| V1 | Row-Count Source vs. Target: `|count(MySQL) - count(Supabase)| <= tolerance` (tolerance = 5 Zeilen, für Race-Conditions) | `validation_status='warnings'`, Alert auf Warning-Level |
| V2 | Keine NOT-NULL-Verletzungen in den gesyncten Feldern (z.B. `title IS NULL`) | `validation_status='failed'`, Alert auf Error-Level |
| V3 | Referenzielle Integrität: jede `artistId` existiert in `Artist`-Tabelle, jede `labelId` in `Label`, jede `pressOrgaId` in `PressOrga` | `validation_status='warnings'`, Alert auf Warning |
| V4 | `legacy_last_synced` für alle Releases ist jünger als 2 x Cron-Intervall (sonst: verlorene Zeilen) | `validation_status='warnings'`, Alert auf Warning |

**Keine Sanity-Range-Checks** (z.B. `legacy_price < 99999`) in Phase A. Das ist Phase B, weil es Kalibrierung braucht und False-Positive-Risiko hat.

**Output:** `sync_log.validation_status` und `sync_log.validation_errors` (JSONB mit Details). Admin-UI zeigt Status-Ampel pro Run.

### 7.2 Alerting (A6)

**Ein einziger Kanal: E-Mail an Robin via Resend.** Keine Slack, kein Pager, keine Push.

**Alert-Regeln:**

| Trigger | Severity | Latenz |
|---|---|---|
| `sync_log.phase='failed'` | Error | Sofort (Script sendet am Ende) |
| `sync_log.validation_status='failed'` | Error | Sofort |
| Dead-Man's-Switch feuert (siehe 7.3) | Error | Max 15 Min |
| `sync_log.validation_status='warnings'` | Warning | Gebündelt täglich 09:00 UTC (1 E-Mail mit allen Warnings der letzten 24h) |
| Drift Count > threshold (Phase B) | Warning | Täglich gebündelt |

**Error-Mails** gehen sofort raus, eine pro Event, mit klarer Betreff-Zeile (`[VOD Sync] Legacy sync failed: connection timeout`). Body enthält Run-ID, Link zum Admin-UI, kurzer Tail des Logs.

**Warning-Mails** werden gebündelt, um Spam zu verhindern. Eine Mail pro Tag, alle Warnings enthalten. Wenn keine Warnings: keine Mail.

**Dedupe:** Wenn der gleiche Fehler 5x hintereinander feuert (Script crasht alle 5 Min), nur die ERSTE Error-Mail senden. Danach alle 30 Min eine "still failing"-Reminder, bis der Zustand sich ändert.

**Implementation:** Einfacher Resend-Wrapper in `backend/src/lib/sync-alerts.ts`. Aufrufbar von Python (via HTTP-POST an internen Admin-Endpoint) und von TypeScript.

### 7.3 Dead-Man's-Switch (A5)

**Mechanismus:** Ein separater Cron-Job (alle 15 Min) prüft: "Gab es in den letzten N Minuten einen erfolgreichen Sync-Run pro Flow?"

**Thresholds (konfigurierbar, Default-Werte):**

| Flow | Max-Alter ohne Alert | Quelle |
|---|---|---|
| Legacy MySQL (stündlich) | 90 Min | Letztes `sync_log.phase='success'` WHERE `sync_type='legacy'` |
| Discogs Daily (Mo-Fr 02:00) | 30 h | Letztes `sync_log.phase='success'` WHERE `sync_type='discogs'`, ignoriert Sa/So |
| R2 Image Sync (an Legacy gekoppelt) | 90 Min | Via Image-Table `MAX(createdAt)` als Proxy |

**Implementation:** Neuer Python-Script `sync_watchdog.py` im Cron, prüft die oben genannten Queries und sendet E-Mail wenn ein Threshold überschritten ist. Nutzt denselben Resend-Wrapper wie 7.2.

**Alternativ (einfacher):** Admin-UI hat eine Seite `/admin/sync/health` die die Threshold-Checks live ausführt beim Seitenaufruf. Robin schaut regelmäßig drauf, sieht Ampel. Das ersetzt NICHT den E-Mail-Watchdog (Robin schaut nicht alle 15 Min), ist aber eine zusätzliche Layer.

**Implementations-Reihenfolge:** Erst Admin-UI-Ampel (billig, 2 Stunden Arbeit), dann Cron-Watchdog (4 Stunden), dann E-Mail-Integration (2 Stunden).

---

## 8. Drift Detection nach Drift-Typen

Statt einer universellen Drift-Logik: fünf spezifische Drift-Typen mit jeweils einfacher, prüfbarer Regel.

### 8.1 Count Drift (Priorität B)

**Frage:** Ist die Anzahl der `legacy-*`-Rows in Supabase gleich der Anzahl in MySQL?

**Prüfung:** Täglicher Job, ~5 Sekunden Laufzeit.
```
SELECT COUNT(*) FROM tape_mag.releases WHERE ... (MySQL)
SELECT COUNT(*) FROM "Release" WHERE id LIKE 'legacy-release-%' (Supabase)
```

**Threshold:** `abs(diff) > 10` → Warning. `abs(diff) > 100` → Error.

**Ausnahmen:** Zeitfenster der letzten Sync-Run-Dauer ignorieren (Race Condition, wenn Sync gerade läuft).

### 8.2 Field Drift (Priorität C)

**Frage:** Für eine Stichprobe von 50 Releases, sind die gesyncten Felder in Supabase exakt identisch mit MySQL?

**Prüfung:** Täglicher Job, ~30 Sekunden Laufzeit. Zufällige ID-Sample, Zeilen-für-Zeilen-Vergleich über alle Felder aus dem Feld-Contract.

**Threshold:** Pro Feld: `diff_rate > 5%` → Warning. Pro Sample-Set: `> 10% Zeilen mit mindestens einem Feld-Diff` → Error.

**Nicht in Phase A**, weil Field-Vergleich über 50 Zeilen * 14 Felder nicht trivial zu implementieren ist und Kalibrierung braucht (was ist ein legitimer Diff zwischen Sync-Runs?).

### 8.3 Referential Drift (Priorität C)

**Frage:** Existieren alle `artistId`/`labelId`/`pressOrgaId`-Referenzen im Target?

**Prüfung:** Bereits Teil der Post-Run Validation (V3 in 7.1). Hier würde ein separater Drift-Job das zusätzlich täglich laufen lassen, nicht nur nach Sync-Runs.

**Redundant zu Phase A**, deshalb Prio C.

### 8.4 Schedule Drift (Priorität B)

**Frage:** Läuft der Sync wirklich so oft wie erwartet?

**Prüfung:** `SELECT COUNT(*), MIN(sync_date), MAX(sync_date) FROM sync_log WHERE sync_type='legacy' AND sync_date >= NOW() - INTERVAL '24 hours'`. Erwartung bei stündlichem Sync: 24 Runs. Drift: < 20 oder > 30.

**Überlappt mit Dead-Man's-Switch** (Phase A), geht aber darüber hinaus: Dead-Man's-Switch alertet bei "zu lange her", Schedule Drift alertet bei "weniger Runs als erwartet im Zeitfenster".

### 8.5 Asset Drift (Priorität D)

**Frage:** Sind alle R2-Image-URLs tatsächlich abrufbar?

**Prüfung:** Stichprobe 50 URLs, HEAD-Request, HTTP-Status sammeln.

**Bewusst zurückgestellt**, weil: teuer (50 HTTP-Calls pro Check), unklarer operativer Mehrwert (wenn eine URL stirbt, will Robin dann automatisch neu uploaden oder nur einen Report? Unklar, Kalibrierung später.)

**Wird gebraucht spätestens wenn:** Storefront-User sich über kaputte Bilder beschweren UND der Bug nicht sofort gefunden werden kann.

---

## 9. Logging, Audit und Metrik-Strategie

### 9.1 Was wird geloggt

| Daten | Ziel | Retention |
|---|---|---|
| Sync-Run-Summary (eine Zeile/Run) | `sync_log` | 1 Jahr |
| Field-Level-Changes (nur echte Änderungen) | `sync_change_log_v2` | 6 Monate |
| Drift-Reports (nur detektierte Drift) | `sync_drift_report` | 1 Jahr |
| Unhandled Exceptions im Script | stderr → Sentry (wenn konfiguriert) | Sentry-Default |
| Strukturiertes Script-Log (JSON-Lines) | stdout → PM2-Log-File | PM2 rotation default (30 Tage) |

**Keine** Full-Audit-Logs. **Kein** unchanged-Row-Logging. Wenn für eine spätere GoBD-Anforderung ein Audit-Trail auf Feld-Ebene gebraucht wird, kommt der separat aus dem ERP-Modul (siehe `ERP_WARENWIRTSCHAFT_KONZEPT.md` v5).

### 9.2 Metrik-Regel

Jede Metrik im Admin-UI und in `sync_log` muss die Doku-Frage "was heißt das konkret?" in einem Satz beantworten können.

**Beispiele:**
- `rows_written: 30168` = "Anzahl UPSERTs, die erfolgreich an Supabase geschickt wurden" ✓
- `rows_changed: 3` = "Anzahl Zeilen, deren mindestens ein Feld-Wert sich zwischen prev und new unterscheidet" ✓
- `images_inserted: 12` = "Anzahl Image-Rows, die in diesem Run neu eingefügt wurden (nicht ON CONFLICT skipped)" ✓
- ~~`new_images: 32866`~~ = **verboten** (war alter Wert, kumulativ, gelöscht)

Wenn eine Metrik diese Frage nicht klar beantworten kann → aus dem Script und aus der UI entfernen.

### 9.3 Größen-Budget

Geschätzte Tabellen-Wachstumsraten:

| Tabelle | Wachstum/Jahr | OK auf Free-Plan? |
|---|---|---|
| `sync_log` | ~9k Zeilen/Jahr (stündlich Legacy + täglich Discogs + R2) | Ja (trivial) |
| `sync_change_log_v2` | ~500k Zeilen/Jahr bei normaler Edit-Frequenz | Ja (~50 MB) |
| `sync_drift_report` | <1000 Zeilen/Jahr | Ja (trivial) |

**Wenn Edit-Frequenz stark steigt** (z.B. Frank editiert 1000 Releases/Tag statt 50): `sync_change_log_v2` auf 10 Mio Zeilen/Jahr = 1 GB. Immer noch Free-Plan-verträglich, aber bei dieser Grenze Retention auf 3 Monate reduzieren.

**Abfrage-Performance:** Alle drei Tabellen bekommen Indizes auf `run_id` und `synced_at/detected_at` (zeitbasierte Filter). Admin-UI-Queries nie ohne Zeit-Filter.

---

## 10. Betriebsverantwortung und Incident-Logik

**Ausgangspunkt:** Solo-Operator (Robin) + gelegentlicher Content-Editor (Frank). Keine Ops-Team-Struktur.

### 10.1 Rollen

| Rolle | Verantwortung |
|---|---|
| **Robin** | Einziger Empfänger aller Alerts. Einzige Person mit Admin-UI-Schreibrechten. Entscheidet bei Drift, Validation-Fails, Cutover-Fragen. |
| **Frank** | Content-Editor in MySQL Legacy. Kein Admin-UI-Zugriff für Sync-Operations. Wird nur informiert wenn seine Edits nicht durchkommen (z.B. "dein Edit um 14:00 landete nicht in Supabase, bitte nochmal prüfen"). |
| **Claude Code** | Keine Laufzeit-Verantwortung. Wird nur auf Anforderung für Fixes, Analysen, Code-Changes gezogen. Schreibt keine Alerts aus, löst keine Re-Syncs aus. |

### 10.2 Incident-Kategorien

| Severity | Beispiele | Reaktions-SLA | Aktion |
|---|---|---|---|
| **Critical** | Sync-Cron tot > 3h, Validation-Fail mit Datenverlust, Supabase unerreichbar | Sofort (Robin wacht auf) | SSH auf VPS, Cron prüfen, Logs lesen, Script manuell starten |
| **Error** | Einzelner Sync-Run gescheitert, NOT-NULL-Verletzung, Schedule-Drift | Innerhalb 2 h | Admin-UI öffnen, Run-Details lesen, Root-Cause identifizieren, entscheiden: Re-Run oder warten auf nächsten Cron |
| **Warning** | Count-Drift, Referential-Drift, Long-Running-Run | Täglicher Digest morgens | Lesen, entscheiden ob Trend, ggf. Issue für Claude aufmachen |
| **Info** | Erfolgreicher Run, neue Images synced | Nicht reaktiv | Im Dashboard sichtbar, keine Aktion nötig |

### 10.3 Re-Sync-Auslösung

**Wer darf einen Full-Resync auslösen?** Nur Robin, manuell über einen Admin-UI-Button `/app/sync/actions/force-legacy-resync`. Kein automatischer Auto-Heal in Phase A oder B.

**Wer darf einen Einzel-Row-Resync auslösen?** Robin, über einen separaten Admin-UI-Flow (Phase B, nicht jetzt) — oder manuell via `UPDATE "Release" SET legacy_last_synced = '2000-01-01' WHERE id = ?` um den nächsten Sync-Run zu zwingen, die Zeile anzufassen.

**Wer darf Drift-Reports als resolved markieren?** Robin, über Admin-UI.

---

## 11. Phasenplan

Keine harten Wochen-Deadlines. Jede Phase ist abgeschlossen, wenn die Erfolgs-Kriterien erfüllt sind. Phasen sind strikt sequentiell — keine Parallelität zwischen A und B.

### Phase A — Muss (target: 1-2 Wochen Arbeit, verteilt)

| ID | Maßnahme | Abhängigkeiten |
|---|---|---|
| A1 | Field-Audit Legacy MySQL → Feld-Contract vollständig | — |
| A2 | `sync_log` Schema-Erweiterung (neue Spalten) | A1 |
| A3 | `legacy_sync.py` Rewrite: Contract-basiert, alle 14 Felder, ehrliche Metriken | A1, A2 |
| A4 | Post-Run Validation im Script | A3 |
| A5 | Dead-Man's-Switch: Admin-UI-Ampel + Cron-Watchdog | A2 |
| A6 | E-Mail-Alerting via Resend | A4, A5 |
| A7 | Python-Script-Pfade härten (Environment-Variable oder walk-up) | A3 |

**Erfolgs-Kriterium Phase A (Mindeststandard):**
- Nach einem Sync-Run sind `rows_changed`, `images_inserted`, `validation_status` in `sync_log` befüllt und ehrlich.
- Wenn ein Sync-Run scheitert oder länger als 90 Min ausbleibt, bekommt Robin eine E-Mail.
- Admin-UI `/app/sync` zeigt live die echten Metriken, keine kumulativen Lügen mehr.

### Phase B — Später (target: 2-4 Wochen nach A)

| ID | Maßnahme | Abhängigkeiten |
|---|---|---|
| B1 | `sync_change_log_v2` Tabelle + Script schreibt Feld-Level-Changes | Phase A abgeschlossen |
| B2 | Drift Detection: Count Drift + Schedule Drift | Phase A |
| B3 | `sync_drift_report` Tabelle + Admin-UI-View | B2 |
| B4 | Dry-Run-Modus im Script | A3 |
| B5 | CLAUDE.md Sync-Section komplett rewrite (nach Phase A-Realität) | Phase A abgeschlossen |

**Erfolgs-Kriterium Phase B (Zielstandard):**
- Jede Änderung eines gesyncten Felds produziert einen Eintrag in `sync_change_log_v2`.
- Count-Drift wird einmal täglich geprüft und bei Überschreiten gemeldet.
- Script-Änderungen können vor Produktions-Deploy auf Staging-DB dry-run'd werden.

### Phase C — Optional (target: nach Bedarf)

| ID | Maßnahme |
|---|---|
| C1 | Field Drift Detection |
| C2 | Referential Drift als separater Job |
| C3 | Admin-UI-Erweiterung: Change-Log-Browser mit Filter |
| C4 | Discogs Change-Tracking |
| C5 | R2 Entkopplung + Asset Drift Detection |

**Erfolgs-Kriterium Phase C (Ausbaustufe):**
- Alle Nebenschauplätze sind abgedeckt.
- Manuelle Operator-Arbeit ist auf "Dashboard einmal täglich anschauen" reduziert.

---

## 12. Risiken, Grenzen und zurückgestellte Themen

### 12.1 Aktive Risiken in Phase A

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|---|---|---|---|
| Script-Rewrite hat Regression → gesyncte Daten verlieren Felder | Mittel | Hoch | Dry-Run auf Staging-DB vor Cutover, alte Script-Version als Backup behalten, 48h Parallel-Betrieb |
| Post-Run Validation ist zu streng → False-Positive-Alarm-Flut | Mittel | Mittel | Warnings statt Errors für die ersten 2 Wochen, dann Thresholds kalibrieren |
| Dead-Man's-Switch feuert bei legitimen Wartungsfenstern | Niedrig | Niedrig (nur nervige E-Mail) | Silence-Fenster konfigurierbar |
| Feld-Contract entspricht nicht der MySQL-Realität (Felder fehlen oder sind falsch getypt) | Mittel | Hoch | Phase A1 ist reiner Audit, keine Code-Änderung. Fehler dort schlägt sich nicht auf Produktion durch. |
| Frank editiert während Script-Rewrite → Edits gehen verloren | Niedrig | Mittel | Parallel-Betrieb alt + neu, v1 bleibt Source of Truth bis v2 verifiziert |

### 12.2 Irreführende Beobachtbarkeit

**Risiko:** Ein robustes Sync-System verleitet Robin zu dem Glauben, dass Daten korrekt sind, wenn das Dashboard grün ist — und verpasst Fehler, die das System nicht erkennt.

**Beispiele:**
- Validation V1 prüft Count, aber nicht Content. Wenn alle Preise auf 0 gesetzt werden, ist Count gleich, Validation grün, Katastrophe.
- Drift-Detection Count bemerkt keine Feld-Änderungen.
- Admin-UI zeigt "letzter Run erfolgreich", aber der Run hat tatsächlich nur 10% der Rows angefasst (Race Condition mit MySQL-Query).

**Mitigation:** Erfolgs-Kriterien sind gestuft. Grün im Dashboard bedeutet "keine der geprüften Regeln ist verletzt", nicht "alles ist in Ordnung". Robin muss weiterhin stichprobenartig prüfen. Das ist Design, nicht Lücke.

### 12.3 Performance- und Kostenrisiken

| Maßnahme | Performance-Impact | Kosten-Impact |
|---|---|---|
| `sync_change_log_v2` mit Feld-Level-Writes | Zusätzliche INSERTs pro Sync-Run (geschätzt +5-10% Run-Dauer) | Trivial (MB-Bereich) |
| Post-Run Validation Queries | +5-10 Sekunden pro Run | Null |
| Drift-Detection täglicher Job | +10 Sekunden Cron-Zeit | Null |
| Dead-Man's-Switch alle 15 Min | Trivial (1 Query) | Null |
| E-Mail-Alerts via Resend | — | ~0€ (Resend Free-Tier sehr großzügig) |

**Gesamt-Impact:** Legacy-Sync-Laufzeit von 30-45s auf ~45-60s. Akzeptabel bei stündlichem Intervall.

### 12.4 Zurückgestellte Themen (keine Arbeit in Phase A+B)

| Thema | Grund der Zurückstellung |
|---|---|
| Auto-Heal bei Drift | Zu riskant ohne über Monate stabile Drift-Metriken. Manueller Re-Sync reicht initial. |
| Unchanged-Row-Logging | Keine Mehrwert gegenüber Run-Summary. Datenmenge wäre Faktor 1000. |
| Real-Time CDC (Debezium o.ä.) | Batch reicht. Real-Time braucht niemand. |
| Zweite Monitoring-Plattform (Prometheus/Grafana) | Supabase + Admin-UI + E-Mail reicht. |
| Legal-Grade-Audit-Trail | Aus dem ERP-Modul. |
| Discogs Full-History (Preis-Zeitreihe) | Eigenes Projekt. |
| R2 Full-Asset-Integrity-Check | Teuer, unklarer Nutzen. |
| Admin-UI "Change-Log-Browser" mit Such- und Filter-UI | Erst wenn Daten sauber fließen (nach Phase A+B). |
| Multi-Tenant-Sync (mehrere Tape-Mag-Instanzen) | Nicht im Scope. |
| Frank-facing Error-Notifications ("dein Edit kam nicht an") | Erst nach mehreren Monaten Erfahrung mit Phase A. |

---

## 13. Klare Empfehlung

**Start mit Phase A1 (Field-Audit), bevor irgendein Code geschrieben wird.**

Dauer: 1-2 Stunden. Ergebnis: eine Python-Konstante `LEGACY_SYNC_FIELDS` plus aktualisierte Feld-Matrix in diesem Dokument (§6.1 mit allen `❓` aufgelöst).

**Gate für Phase A2+:** Robin hat die Feld-Matrix gelesen und für jedes Feld bestätigt: "gesynct ja/nein, Ownership stimmt". Ohne dieses Gate wird kein Script verändert.

**Nicht gemacht in der ersten Iteration:**
- Kein neuer Admin-UI-Tab
- Keine neue Tabelle `sync_change_log_v2`
- Keine Drift-Detection
- Kein Dry-Run-Modus

**Das sind bewusst Phase B und später.** Die erste Iteration macht den Python-Script ehrlich und löst Alerts aus. Das ist 80% des operativen Mehrwerts bei 30% der Komplexität.

**Erfolgs-Check nach 2 Wochen Phase A:**
- Sind die Metriken im Admin-Dashboard ehrlich? (Test: Frank editiert 5 Releases → beim nächsten Sync erscheint `rows_changed: 5`)
- Alertet das System bei einem induzierten Fehler? (Test: Script manuell mit broken DB-URL starten → E-Mail kommt)
- Alertet der Dead-Man's-Switch? (Test: Cron deaktivieren → 90 Min warten → E-Mail kommt)

Wenn alle drei Tests grün: Phase A ist abgeschlossen, Phase B kann starten.

Wenn nicht: Phase A nachbessern, **nicht** Phase B starten. Keine Komplexität auf unstabiler Basis.

---

*Dieses Dokument ersetzt v1.0. Zurückgestellte Themen aus v1.0 (Auto-Heal, Full-Admin-UI, unchanged-Logging, Prometheus-Style-Observability) sind bewusst gestrichen, nicht vergessen. Wenn in 6 Monaten die Basis steht und diese Themen immer noch sinnvoll sind, werden sie als separate Dokumente/Phasen aufgesetzt.*
