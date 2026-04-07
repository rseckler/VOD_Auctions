# Sync Services — Übersicht

**Stand:** 2026-04-07
**Projekt:** VOD Auctions

---

## 1. Ziel der Sync-Infrastruktur

VOD Auctions verkauft ~41.500 Tonträger und Literatur-Einträge, deren Stammdaten in einer **Legacy MySQL-Datenbank** (tape-mag.com) gepflegt werden. Die Plattform selbst läuft auf **Supabase PostgreSQL**. Dazwischen liegen mehrere Sync-Services, die sicherstellen, dass die Plattform-Daten aktuell, angereichert und über ein CDN auslieferbar sind.

**Warum Sync statt direkte DB-Anbindung?**
- Legacy-DB ist MySQL auf einem Drittanbieter-Server (tape-mag). Medusa/Next.js sprechen Postgres, nicht MySQL.
- Discogs-Daten (Preise, Seltenheit) kommen über eine externe API mit Rate-Limits → müssen gecacht werden.
- Bilder müssen auf ein CDN (Cloudflare R2) verteilt werden, damit die Storefront sie schnell ausliefern kann.
- Die Plattform fügt eigene Daten hinzu (Auktionsstatus, Schätzwerte, Discogs-Preise, Collector-Profiles), die von der Legacy-DB getrennt bleiben müssen.

**Datenfluss-Diagramm:**
```
MySQL (tape-mag)                         Discogs API
     │                                        │
     ▼                                        ▼
 legacy_sync_v2.py (stündlich)    discogs_daily_sync.py (Mo-Fr)
     │                               discogs_batch.py (manuell)
     │                               discogs_extraartists (manuell)
     ▼                                        │
┌─────────────────────────────────────────────────┐
│         Supabase PostgreSQL                     │
│                                                 │
│  Release (41,546) · Artist (37,269)             │
│  Label (5,906) · PressOrga (1,983)              │
│  Image (83,150)                                 │
│  sync_log · sync_change_log                     │
└──────────────┬──────────────────────────────────┘
               │
               ▼
      Cloudflare R2 (Image CDN)
      160,957 files · 108 GB
      (Upload via legacy_sync_v2.py)
```

---

## 2. Sync-Services im Detail

### 2.1 Legacy MySQL → Supabase

| | |
|---|---|
| **Script** | `scripts/legacy_sync_v2.py` (1.316 Zeilen, seit 2026-04-05 aktiv; v1 `legacy_sync.py` als Backup) |
| **Cron** | `0 * * * *` — **stündlich**, jede volle Stunde |
| **Quelle** | MySQL auf tape-mag.com (`3wadmin_tapes_releases`, `3wadmin_tapes_band`, `3wadmin_tapes_labels`, `3wadmin_tapes_pressorga`, `3wadmin_tapes_*_lit`, `bilder_1`) |
| **Ziel** | Supabase `Release`, `Artist`, `Label`, `PressOrga`, `Image` |
| **Richtung** | Einweg: MySQL → Supabase. Kein Rückschreiben. |
| **Was wird gesynct** | |

**Entities (Insert-only — neue Einträge kommen dazu, bestehende werden nicht aktualisiert):**
- **Artist:** Name aus `3wadmin_tapes_band.name` (37.269 Einträge, davon 12.454 aus Legacy-IDs + 24.815 aus Discogs Extraartists)
- **Label:** Name aus `3wadmin_tapes_labels.label` (5.906 Einträge, davon 3.077 aus Legacy-IDs)
- **PressOrga:** Name aus `3wadmin_tapes_pressorga.name` (1.983 Einträge)

**Releases (UPSERT — jeder Lauf aktualisiert alle Felder bei existierenden Zeilen):**

| Supabase-Feld | MySQL-Quelle | Music Releases | Literatur |
|---|---|---|---|
| `title` | `r.title` / `t.title` | ✅ | ✅ |
| `description` | `r.moreinfo` / `t.text` | ✅ | ✅ |
| `year` | `r.year` / `t.year` | ✅ | ✅ |
| `format` / `format_id` | `r.format` → Enum-Mapping | ✅ | ✅ |
| `catalogNumber` | `r.cataloguenumber` | ✅ | ❌ (kein Feld in MySQL) |
| `country` | FK → `3wadmin_shop_countries` (DE→EN) | ✅ | ✅ |
| `artistId` | `legacy-artist-{r.artist}` | ✅ | nur band_lit |
| `labelId` | `legacy-label-{r.label}` (Guard: `label_enriched`) | ✅ | nur label_lit |
| `pressOrgaId` | `legacy-pressorga-{t.aid}` | ❌ | nur press_lit |
| `coverImage` | `bilder_1.bild` (typ 10/12/13/14) | ✅ | ✅ |
| `legacy_price` | `r.preis` / `t.preis` | ✅ | ✅ |
| `legacy_condition` | `r.spezifikation` | ✅ | ❌ (kein Feld in MySQL) |
| `legacy_format_detail` | FK → `3wadmin_tapes_formate.name` | ✅ | ✅ |
| `legacy_available` | `r.frei == 1` | ✅ | ❌ (default TRUE) |

**Images (Insert-only via ON CONFLICT DO NOTHING):**
- Cover-Bilder werden beim Release-Sync mit-insertet
- Bilder werden parallel nach Cloudflare R2 hochgeladen (falls noch nicht vorhanden)
- Aktuell 83.150 Image-Zeilen in Supabase, 160.957 Files im R2-Bucket

**Change-Detection (v2):**
- v2 diff'fed alle oben gelisteten Felder und schreibt Änderungen in `sync_change_log`
- v1 diff'fed nur 4 Felder (`title`, `legacy_price`, `legacy_available`, `coverImage`) — war Hauptgrund für den v2-Rewrite
- Image-Inserts werden per `INSERT ... RETURNING id` gezählt (echte Neu-Zahl, nicht Insert-Attempts)

**Geschützte Felder (NIE vom Legacy-Sync berührt):**
- Alle `discogs_*` Felder (eigener Sync)
- `auction_status`, `current_block_id`, `sale_mode`, `direct_price`, `inventory`
- `estimated_value`, `media_condition`, `sleeve_condition`
- `viewCount`, `averageRating`, `ratingCount`, `favoriteCount`
- `label_enriched` (Schutz-Flag für `labelId`)

**Post-Run Validation (v2):**
- V1: Row-Count MySQL vs. Supabase ± 10
- V2: Kein `title IS NULL` auf Legacy-Releases
- V3: Referenzielle Integrität (`artistId`, `labelId` zeigen auf existierende Einträge)
- V4: Sync-Freshness (`legacy_last_synced` < 2h für alle Releases)

---

### 2.2 Discogs Daily Sync

| | |
|---|---|
| **Script** | `scripts/discogs_daily_sync.py` |
| **Cron** | `0 2 * * 1-5` — **Mo–Fr um 02:00 UTC** |
| **Quelle** | Discogs API (per Release `discogs_id`) |
| **Ziel** | Supabase `Release.discogs_*` Felder |
| **Richtung** | Einweg: Discogs API → Supabase |

**Was wird gesynct:**
- `discogs_lowest_price`, `discogs_median_price`, `discogs_highest_price`
- `discogs_num_for_sale`, `discogs_have`, `discogs_want`
- `discogs_last_synced`

**Chunk-Strategie:** Die ~16.590 gematchten Releases werden in **5 rotierende Chunks** aufgeteilt. Jeder Wochentag bearbeitet einen Chunk. Jeder Release wird damit einmal pro Woche aktualisiert.

**Rate-Limiting:** Discogs erlaubt 60 Requests/Min (authentifiziert). Script nutzt Token-Bucket Rate-Limiter (55/min default) mit exponentialem Backoff bei 429-Responses.

**Aktueller Stand (07.04.):**
- Letzter Run: 07.04., 02:46 UTC, Chunk 2, 3.318 Releases verarbeitet
- 2.850 aktualisiert (583 Preis-Up, 544 Preis-Down)
- 0 Fehler, 2 Retries
- Severity: `ok`

---

### 2.3 Discogs Batch Matching (manuell)

| | |
|---|---|
| **Script** | `scripts/discogs_batch.py` |
| **Cron** | Keiner — wird manuell gestartet |
| **Ziel** | Release-Zeilen in Supabase, die noch keine `discogs_id` haben, mit Discogs-Einträgen matchen |

**Matching-Strategien:**
- `full` (13.229 Matches): Vollständiger Title + Artist + Label + Year Vergleich
- `catno` (1.936 Matches): Katalognummer-Abgleich
- `basic` (733 Matches): Vereinfachter Title-Match

**Aktueller Stand:**
- 29.471 / 43.052 Releases verarbeitet (**68,5%**)
- 15.898 Matches (54% Match-Rate)
- 7.146 davon mit Preis-Daten
- 0 Fehler
- Letzter Lauf: 07.03.2026 (vor 1 Monat — manueller Trigger nötig für den Rest)

---

### 2.4 Discogs Extraartists Import (manuell)

| | |
|---|---|
| **Script** | `scripts/discogs_extraartists_import.py` |
| **Cron** | Keiner — einmaliger/manueller Lauf |
| **Ziel** | Für gematchte Releases die beteiligten Künstler (Produzenten, Mixer, Engineers etc.) aus Discogs importieren und mit den bestehenden Releases verknüpfen |

**Was es tut:**
- Liest die `extraartists` (Credits) jedes gematchten Releases von Discogs
- Erstellt neue `Artist`-Einträge für noch unbekannte Personen
- Erstellt `ReleaseArtist`-Verknüpfungen (many-to-many mit Rolle)

**Aktueller Stand (abgeschlossen 10.03.2026):**
- 16.590 / 16.590 Releases verarbeitet (**100%**)
- 9.802 hatten Extraartists, 6.788 ohne
- 27.743 neue Artists erstellt
- 46.470 Links erstellt, 19.587 alte Links gelöscht (Bereinigung)
- 0 Fehler

---

### 2.5 Cloudflare R2 Image CDN Sync

| | |
|---|---|
| **Script** | Integriert in `legacy_sync_v2.py` (kein eigenes Script) |
| **Cron** | Gekoppelt an Legacy-Sync — **stündlich** |
| **Quelle** | Bilder aus der Legacy-DB (`bilder_1.bild` → Dateiname) |
| **Ziel** | Cloudflare R2 Bucket `vod-images` |

**Was passiert:**
- Für jeden Release mit Coverbild wird geprüft, ob das Bild bereits im R2-Bucket liegt (`HEAD` Request)
- Falls nicht vorhanden: Upload nach R2
- Die URL im `coverImage`-Feld zeigt direkt auf den R2 Public URL (`https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/{filename}`)
- Optimierung: Wenn `coverImage` sich seit dem letzten Sync nicht geändert hat, wird der R2-Check übersprungen

**Aktueller Stand:**
- Bucket: **160.957 Files, 108 GB**
- Letzter Sync: 07.04., 09:00 UTC
- 0 neue Uploads, 0 Failed, 0 Checked (alle Bilder unverändert)
- R2 Public URL: `ONLINE` (95ms Latenz)

---

## 3. Statistiken der letzten 4 Wochen (10.03.–07.04.2026)

### Sync-Runs

| Sync-Typ | Runs | Erfolg | Fehler | Zeitraum |
|---|---|---|---|---|
| Legacy MySQL | **103** | 103 | 0 | 01.04.–07.04. (v2 ab 05.04.) |
| Discogs Daily | **10.059** | 10.059 | 0 | 02.04.–07.04. |
| Discogs Batch | 1 | 1 | 0 | 07.03. (manuell) |
| Extraartists | 1 | 1 | 0 | 09.03.–10.03. (einmalig) |

*Hinweis: Die hohe Zahl bei Discogs (10.059) kommt daher, dass jeder einzelne Release-Update als eigene `sync_log`-Zeile gezählt wird — ein Chunk-Run mit 3.318 Releases erzeugt 3.318 Einträge. Legacy-Sync schreibt dagegen eine Zeile pro Run.*

### v2-Metriken (seit Cutover 05.04. 15:22 UTC)

| Metrik | Wert |
|---|---|
| Runs | 41 |
| Ø Laufzeit | 49,8 Sekunden |
| Ø Rows Written | 41.540 |
| Gesamt rows_changed | 0 (Wochenende, Frank inaktiv) |
| Gesamt images_inserted | 0 |
| Validation-Status | durchgehend `warnings` (216 orphan labels — bekannt, non-blocking) |

### Datenbestand in Supabase (07.04.2026)

| Entity | Anzahl |
|---|---|
| Release (Musik) | 30.171 |
| Release (Band-Literatur) | 3.917 |
| Release (Label-Literatur) | 1.129 |
| Release (Press-Literatur) | 6.329 |
| **Release gesamt** | **41.546** |
| Artist | 37.269 (12.454 aus Legacy + 24.815 aus Discogs Extraartists) |
| Label | 5.906 (3.077 aus Legacy + Rest aus Enrichment) |
| PressOrga | 1.983 |
| Image | 83.150 (216 neue in letzten 7 Tagen) |

### Discogs-Coverage (nur Musik-Releases)

| Metrik | Wert | Prozent |
|---|---|---|
| Eligible (Musik-Releases) | 30.171 | 100% |
| Discogs-gematchte | 16.590 | **55%** |
| Davon mit Preis | 7.456 | 25% |
| Noch ungematchte | 13.581 | 45% |

### R2 Image CDN

| Metrik | Wert |
|---|---|
| Files im Bucket | 160.957 |
| Bucket-Größe | 108 GB |
| Status | ONLINE (95ms Latenz) |
| Neue Uploads letzte 7 Tage | 0 (alle Bilder waren schon vorhanden) |

---

## 4. Cron-Schedule VOD Auctions (auf dem VPS)

| Cron | Script | Frequenz |
|---|---|---|
| `0 * * * *` | `legacy_sync_v2.py` | **Stündlich** |
| `0 2 * * 1-5` | `discogs_daily_sync.py` | **Mo–Fr 02:00 UTC** |
| `0 */6 * * *` | `find ... -size 0 -delete` | Alle 6h — löscht leere Cache-Images in `.next/cache/images/` |

Discogs Batch und Extraartists haben keinen Cron — werden bei Bedarf manuell gestartet.

---

## 5. Bekannte offene Punkte

| Punkt | Severity | Status |
|---|---|---|
| **216 orphan labels** — Releases verweisen auf Label-IDs die nicht existieren | Warning | Bekannt seit v2-Validation 05.04. Cleanup geplant nach Phase B. |
| **Discogs Batch nur 68,5% durch** — 13.581 ungematchte Releases | Info | Nächster manueller Run steht aus. |
| **Kein Dead-Man's-Switch** — wenn Cron ausfällt, merkt es niemand | Mittel | Phase A5 geplant. |
| **Kein E-Mail-Alert bei Sync-Fehler** | Mittel | Phase A6 geplant. |
| **R2 nicht entkoppelt** — Image-Upload läuft innerhalb von `legacy_sync_v2.py` | Info | Phase C (SYNC_ROBUSTNESS_PLAN). Funktioniert derzeit, Entkopplung nur bei Bedarf. |
| **`review`-Feld in MySQL wird ignoriert** | Info | Field-Audit Finding #1 (05.04.). Stichproben-Check ob Content vorhanden nötig. |

---

## 6. Referenz-Dokumente

| Dokument | Zweck |
|---|---|
| `docs/architecture/SYNC_ROBUSTNESS_PLAN.md` (v2.3) | Architekturplan für Robustheit, Ownership-Matrix, Phase-A–C Roadmap |
| `docs/architecture/CHANGELOG.md` | Detaillierte Einträge zu allen Sync-Änderungen am 05.04. |
| `CLAUDE.md` → Section "Sync-Architektur" | Kurzreferenz für den aktuellen Stand |
| `scripts/legacy_sync_v2.py` | Der aktive Sync-Script (mit DIFF_FIELDS_RELEASE / DIFF_FIELDS_LITERATURE Contract) |
| `scripts/shared.py` | Gemeinsame Helpers (DB-Connections, Slugify, Format-Mapping, R2-Upload) |
