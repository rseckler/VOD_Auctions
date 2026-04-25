# Format-Mapping Analyse & Migrationsplan

**Status:** ✅ **PRODUCTION rc51.7 (2026-04-25)** · **Author:** Claude Opus 4.7
**Begleitdokumente:**
- `/Users/robin/Downloads/Formate_v5_FINAL.csv` — finale Frank-Roundtrip-Tabelle mit Internal/Display-Spalten
- `backend/src/lib/format-mapping.ts` — Single-Source-of-Truth (Whitelist + Discogs-Klassifikator + Display-Mapper)
- `scripts/format_mapping.py` — Python-Spiegel
- `storefront/src/lib/format-display.ts` — Storefront-only Display-Spiegel
- `scripts/backfill_format_v2_dry_run.py` — Dry-Run-Skript (Original)
- `docs/architecture/CHANGELOG.md` → 2026-04-25 rc51.7 Entry (vollständige Release-Notes)

## Production-Status (Stand 2026-04-25 rc51.7)

| Bereich | Status | Counts |
|---|---|---|
| **DB-Schema** | live | `Release.format_v2 varchar(40)` + `format_descriptors jsonb` + CHECK-Constraint (71 Werte) + Index |
| **Backfill** | done | **52.788 / 52.788 = 100% klassifiziert** · 9.794 mit `format_descriptors` · 20 in `Other` |
| **Distinct Werte verwendet** | – | **57 von 71** (14 reserviert für Future-Imports) |
| **Schreib-Pfade** | live | Cron `legacy_sync_v2.py`, Discogs-Import, Manual-Edit `media/[id]` PATCH |
| **Lese-Pfade Backend-API** | live | 12 Storefront-Routes + 9 Admin-Routes mit `Release.format_v2` in SELECT |
| **UI Admin** | live | Edit-Card + Listen + Auction-Blocks + Inventory + POS |
| **UI Storefront** | live | Catalog/Auctions Detail + Listen + Related + Search + Account |
| **Print-Labels** | live | `displayFormatCompact()` für Brother-QL 29×90mm (`LP×5`, `Tape×26`) |
| **Email** | live | `displayFormat()` in `watchlistReminderEmail` |
| **Meilisearch-Index** | live | `format_v2` filterable + displayed, Full-Rebuild durchgeführt, 57 Facets |

**6 Commits:** `707778c` → `57867f6` → `e3bfd29` → `248c3e4` → `65eb504` → `4f663aa` → `0d08636`

## Update v4 (2026-04-25): Frank-Entscheidungen + Implementierung gestartet

**Frank-Entscheidungen (final):**
1. **URL-Safety:** Interne Format-Werte ohne `"`-Zeichen. `Vinyl-7-Inch` statt `Vinyl-7"`. Frontend und Backend nutzen `displayFormat()`-Helper, der die Display-Form (`Vinyl 7"`) rendert.
2. **Sub-Format-Tags via `format_descriptors jsonb`:** Picture Disc, Test Pressing, Limited Edition, Reissue, Stereo, Mono etc. werden als Array von Tags gespeichert — KEINE separaten Format-Werte. Format-Wert bleibt `Vinyl-LP` etc.
3. **Whitelist Option A:** Alle 62 Werte werden vorab angelegt, auch die mit 0 Bestand. Verhindert Crashes bei zukünftigen Discogs-Imports.

**Implementierung erfolgt:**
- `backend/src/lib/format-mapping.ts` — TS-Lib mit `FORMAT_VALUES`, `FORMAT_DISPLAY`, `LEGACY_FORMAT_ID_MAP`, `classifyDiscogsFormat()`, `toFormatGroup()`, `displayFormat()`, `isValidFormat()`
- `scripts/format_mapping.py` — Python-Spiegel
- `scripts/backfill_format_v2_dry_run.py` — Dry-Run mit CSV-Export

### Backfill-Vorhersage (Dry-Run-Ergebnisse, 2026-04-25)

**Phase B — Tape-mag (41.531 Items, 100% klassifiziert):**

| Format | Items | Format | Items | Format | Items |
|---|---:|---|---:|---|---:|
| `Tape` | 20.607 | `Tape-2` | 280 | `Tape-26` | 3 |
| `Magazin` | 10.929 | `Poster` | 248 | `Tape-32` | 1 |
| `Vinyl-LP` | 4.945 | `Reel` | 163 | `Tape-7` | 1 |
| `Vinyl-7-Inch` | 1.332 | `Vinyl-10-Inch` | 146 | `Tapes` | 1 |
| `Vinyl-12-Inch` | 1.190 | `Photo` | 143 | `CD` | 2 |
| `Vinyl-LP-2` | 648 | `Vinyl-LP-3` | 128 | … | … |
| `VHS` | 413 | `Vinyl-LP-4` | 64 | | |

→ 32 verschiedene Format-Werte verwendet, **keine `Other`-Fallbacks**.

**Phase A — Discogs-only (~11.250 Items, 99,1% klassifiziert):**

| Format | Items | Format | Items |
|---|---:|---|---:|
| `Vinyl-LP` | 5.826 | `CD-2` | 15 |
| `Vinyl-7-Inch` | 1.589 | `Lathe-Cut` | 14 |
| `Vinyl-12-Inch` | 1.477 | `Tape-2` | 11 |
| `Tape` | 1.196 | `DVD` | 11 |
| `Vinyl-LP-2` | 646 | `Vinyl-10-Inch-2` | 10 |
| `CD` | 210 | `DVDr` | 9 |
| `Vinyl-10-Inch` | 147 | `Vinyl-LP-6` | 4 |
| **`Other`** | **99** | **(Edge-Cases)** | |
| `Vinyl-LP-3` | 51 | `Vinyl-7-Inch-3` | 4 |
| `Flexi` | 48 | `Acetate` | 3 |
| `Vinyl-7-Inch-2` | 24 | `Memory-Stick` | 2 |
| `VHS` | 21 | `CD-3`, `CD-5`, `CD-10`, `Lathe-Cut-2`, `Vinyl-LP-5`, `Vinyl-LP-8`, `Tape-3` | je 2 |
| `Vinyl-LP-4` | 19 | `Blu-ray`, `CD-16`, `CDr-2`, `Vinyl-LP-7`, `Vinyl-LP-9` | je 1 |
| `CDr` | 17 | | |

→ 36 distinct Format-Werte verwendet. Nur **99 Items (0,9%) fallen auf `Other`** — das sind primär Container-only (`All Media` ohne Sub-Format) und seltene unbekannte Discogs-Formate.

**Total-Klassifikations-Quote: 99,8 %** (52.781 von 52.788 Releases sauber klassifiziert; 14 Orphans + ~99 Edge-Cases auf `Other`).

### Wichtige Beobachtungen aus dem Dry-Run

- **Discogs-`Vinyl` ohne Größenangabe** wird zu `Vinyl-LP` (Default) — das betrifft den größten Teil der 5.826 Vinyl-LP-Discogs-Items. Frank's CSV hat das so vorgegeben.
- **Tape-mag-`Video` (id 40, 413 Items)** wird komplett zu `VHS` — bestätigt durch Frank "alles VHS, kein DVD-Split nötig".
- **`Tape-mag-CD`** existiert nur 2× in der Tape-mag-Quelle, aber 210× via Discogs → Inventur-Realität.
- **0-Bestand-Werte** in der Whitelist (z.B. `Vinyl-LP-9`, `CD-16`, `Memory-Stick`, `Blu-ray`, `Tape-12`) werden trotzdem mit echten Items befüllt — die Annahme "alle vorab anlegen" zahlt sich aus.

### Schritt-Status

- [x] Mapping-Lib `backend/src/lib/format-mapping.ts` (71 Werte, Discogs-Heuristik, Display-Mapper, Compact-Display)
- [x] Python-Spiegel `scripts/format_mapping.py`
- [x] Storefront-Display-Spiegel `storefront/src/lib/format-display.ts`
- [x] Dry-Run-Skript `scripts/backfill_format_v2_dry_run.py`
- [x] Dry-Run gegen Prod-DB ausgeführt — 99,8% Klassifikations-Quote
- [x] Whitelist-Erweiterung um 9 Vinyl-Inch-Box-Werte (`Vinyl-12-Inch-2/3/4/12`, `Vinyl-7-Inch-4/5/10`, `Vinyl-10-Inch-3/4`)
- [x] Schema-Migration applied (Phase 1: Spalten + Index, Phase 2: CHECK-Constraint nach Backfill)
- [x] Backfill-Run (Wet) — Phase B (tape-mag, 41.538) + Phase A (Discogs, 11.231) + Orphans (19) → **52.788 / 52.788 = 100% klassifiziert**
- [x] QC: Final-Counts 57 distinct Format-Werte, 9.794 mit Descriptors, 20 in Other-Bucket
- [x] Bug-Fix: `Album` description als LP-Trigger (66 Items von `Vinyl-12-Inch*` → `Vinyl-LP*` korrigiert)
- [x] Sync-Code umstellen (`legacy_sync_v2.py`) — Lock-aware via `format_id`-Key, rc49.4-Performance erhalten (~50s)
- [x] Discogs-Import-Code umstellen (`commit/route.ts`) — `classifyFormatV2()` Helper über `lib/format-mapping.ts`
- [x] Manual-Edit-Pfad (`media/[id]/route.ts` PATCH) — `format_v2` aus `format_id` deriviert bei Edit
- [x] UI Admin: Edit-Card + Listen + Auction-Blocks + Inventory/Stocktake + POS
- [x] UI Storefront: Catalog/Auctions Detail + Listen + Related + Search + Account
- [x] Print-Labels: `displayFormatCompact()` für Brother-QL 29mm (4-Char-Werte wie `LP×5`)
- [x] Email: `displayFormat()` in `watchlistReminderEmail`
- [x] Meilisearch-Index: `format_v2` filterable + displayed, Full-Rebuild via Atomic-Swap
- [x] Vollaudit aller Format-Display-Stellen (24 Files, +86/-30 Zeilen)
- [x] CHANGELOG.md + CLAUDE.md + TODO.md aktualisiert
- [ ] **Cutover** (`format` = `format_v2` rename, alte Spalte droppen) — bewusst zurückgehalten, automatischer Reminder am **2026-05-19** via `scripts/cutover_reminder.py` (Cron daily 09:00 UTC, Email mit Live-Status-Check + GO/NO-GO-Verdict)
- [ ] **Storefront-UI Sub-Filter** (z.B. „nur 7\" Singles", „nur Box-Sets qty≥2") — Backend-Filter da, UX-Definition mit Frank offen
- [ ] **Admin Edit-Card Format-Dropdown** — User-Wahl aus 71 Werten via Dropdown (gehört zu Stammdaten-Gap 1+2)
- [ ] **`shared.py` Cleanup** — alte `FORMAT_MAP`/`LEGACY_FORMAT_ID_MAP` parallel zu `format_mapping.py`. Aufräumen nach Cutover
- [ ] **Meili `wait_for_task`-Race fixen** — Skript crasht nach Atomic-Swap, kein Daten-Impact, kosmetisch
- [ ] **Versand-Logik qty-aware** — LP-Box mit 5 Platten wiegt mehr als 1 LP, separater `shipping.ts`-Refactor

### Final Backfill-Counts (live, post-Migration)

| Format | Items | Format | Items | Format | Items |
|---|---:|---|---:|---|---:|
| `Tape` | 21.789 | `Vinyl-LP-3` | 182 | `CDr` | 11 |
| `Magazin` | 10.929 | `Reel` | 163 | `CD-2` | 11 |
| `Vinyl-LP` | 10.731 | `Photo` | 143 | `Tape-6` | 10 |
| `Vinyl-7-Inch` | 2.859 | `Vinyl-LP-4` | 83 | `Vinyl-7-Inch-3` | 9 |
| `Vinyl-12-Inch` | 2.625 | `Vinyl-12-Inch-2` | 37 | `Tape-10` | 7 |
| `Vinyl-LP-2` | 1.327 | `Vinyl-LP-5` | 58 | `Vinyl-12-Inch-3` | 6 |
| `VHS` | 429 | `Postcard` | 52 | `DVD`, `DVDr`, `Tape-8`, `Tape-26`, `Acetate` | je 3-4 |
| `Tape-2` | 291 | `Vinyl-7-Inch-2` | 50 | `Lathe-Cut-2`, `Vinyl-LP-8`, `CD-3`, `CD-5`, `CD-10`, `Vinyl-10-Inch-3` | je 2 |
| `Vinyl-10-Inch` | 290 | `Flexi` | 41 | Singletons (`Vinyl-LP-9`, `Vinyl-12-Inch-4`, `Vinyl-12-Inch-12`, `Tape-7`, `Tapes`, `Tape-32`, `Vinyl-10-Inch-4`, `CD-16`, `Vinyl-7-Inch-4/5/10`, `CDr-2`) | je 1 |
| `Poster` | 248 | `Tape-3` | 35 | **Other** | **20** |
| `CD` | 181 | `Vinyl-LP-6/7` | je 30/31 | | |

→ **57 von 71 Whitelist-Werten verwendet.** Die übrigen 14 Werte (`Tape-12`, `Reel-2`, `CD-4`, `CD-8`, `CDV`, `Blu-ray`, `Memory-Stick`, `File`, `Shellac`, `Vinyl-LP-10/11/12`, `Book`, `T-Shirt`) sind reserviert für Future-Imports oder bisher 0-Bestand-Items.

### Descriptor-Verteilung (9.794 Releases mit Tags)

Top-20 aus `format_descriptors jsonb`:

| Tag | Items | Tag | Items |
|---|---:|---|---:|
| `Album` | 5.292 | `Repress` | 263 |
| `Stereo` | 2.060 | `Promo` | 209 |
| `45 RPM` | 2.034 | `Remastered` | 166 |
| `Limited Edition` | 1.157 | `Single Sided` | 150 |
| `Reissue` | 1.043 | `White Label` | 136 |
| `33 ⅓ RPM` | 839 | `Test Pressing` | 122 |
| `Compilation` | 837 | `Picture Disc` | 76 |
| `Numbered` | 426 | `Special Edition` | 42 |
| `Mono` | 373 | `Special Cut` | 39 |
| `Unofficial Release` | 267 | `Misprint` | 37 |




**Anlass:** Beim Übergang von tape-mag.com auf VOD_Auctions wurden zwei orthogonale Dimensionen ungewollt zu einer einzigen verdichtet:
1. **Format-Typ** (Vinyl 7" / 10" / 12" / LP, MC, Reel, CD …)
2. **Anzahl Tonträger** (Single-Disc vs. Box mit 2/3/5/7/… Stück)

Beide Dimensionen sind im Bestand vorhanden — sowohl in tape-mag (über die `-N`-Suffix-Konvention der Format-Namen) als auch in Discogs (über das `formats[].qty`-Feld bzw. die `6x Vinyl, LP`-Anzeige). Aktuell werden sie **beide** auf den groben Enum (`LP`, `CASSETTE`, …) abgebildet und gehen verloren.

---

## Update v3 (2026-04-25): Franks Naming-Konvention bleibt

Franks Mapping-Vorschlag (`/Users/robin/Downloads/Formate.csv`) zeigt: **die tape-mag-Namen sollen als kanonische Werte erhalten bleiben** — kein neuer englischer Enum à la `VINYL_7` / `VINYL_12`. Stattdessen werden die Werte beibehalten wie sie der Storefront-Käufer auch in der Anzeige liest:

- `Vinyl-LP`, `Vinyl-LP-2`, `Vinyl-LP-3` … `Vinyl-LP-7` (und `Vinyl-LP-8` … `Vinyl-LP-12` neu aus Discogs-Cache)
- `Vinyl-7"`, `Vinyl-7"-2`, `Vinyl-7"-3`
- `Vinyl-10"`, `Vinyl-10"-2`, `Vinyl-12"`
- `Tape`, `Tape-2`, `Tape-3` … `Tape-32` (`Tape-12` neu aus Discogs-Cache)
- `CD`, `CD-2`, `CD-3`, `CD-4`, `CD-5`, `CD-8`, `CD-10`, `CD-16` (alle neu aus Discogs-Cache)
- `Reel`, `Reel-2` (neu)
- `VHS`, `DVD`, `DVDr`, `Blu-ray`, `CDV`, `CDr`, `CDr-2`
- `Flexi`, `Lathe-Cut`, `Lathe-Cut-2`, `Acetate` (Vinyl-Sonderpressungen)
- `Memory-Stick`, `File` (digital)
- `Magazin`, `Photo`, `Postcard`, `Poster`, `Book`, `T-Shirt`
- `Other` (Catch-all)

**Konsequenz:** Aus diesem Doc fliegt der frühere `VINYL_7`/`VINYL_10`-Enum-Vorschlag raus (Section 5.2 ist überholt — siehe Abschnitt **Update v3 — Empfohlene Werte** unten). Der Enum-Erweiterungs-Approach bleibt, nur die Werte heißen jetzt `Vinyl-LP`, `Vinyl-7"`, `Tape-7` etc. Die zwei Dimensionen (Format-Typ + Anzahl) sind dadurch in einen einzigen String enkodiert wie heute schon — nur korrekt klassifiziert beim Discogs-Import.

### Reale Discogs-Bestand-Distribution (aus `discogs_api_cache`, ~19k Items)

| Discogs-Anzeige | Bestand | Mapping → |
|---|---:|---|
| `Vinyl, LP` | 8.541 | `Vinyl-LP` |
| `Vinyl` (unspecified, ohne Größe) | 5.151 | Default `Vinyl-LP` (manuelle Korrektur möglich) |
| `Cassette` | 3.189 | `Tape` |
| `Vinyl, 7"` | 2.639 | `Vinyl-7"` |
| `Vinyl, 12"` (ohne LP-Tag = Maxi) | 2.601 | `Vinyl-12"` |
| `2 x Vinyl, LP` | 920 | `Vinyl-LP-2` |
| `CD` | 247 | `CD` |
| `Box Set` (Container) | 261 | → schau formats[1] für Sub-Format |
| `Vinyl, 10"` | 265 | `Vinyl-10"` |
| `All Media` (Container) | 112 | → schau formats[1] |
| `Flexi-disc` | 64 | `Flexi` |
| `VHS` | 40 | `VHS` |
| `2 x Cassette` | 43 | `Tape-2` |
| `CDr` | 23 | `CDr` |
| `2 x CD` | 19 | `CD-2` |
| `Lathe Cut` | 18 | `Lathe-Cut` |
| `DVD` | 15 | `DVD` |
| `DVDr` | 11 | `DVDr` |
| `Acetate` | 6 | `Acetate` |
| `5 x CD`, `10 x CD`, `16 x CD` etc. | je 1-2 | `CD-5`, `CD-10`, `CD-16` |
| `Memory Stick` | 2 | `Memory-Stick` |
| `Reel-To-Reel` | 1 | `Reel` |
| `2 x Reel-To-Reel` | 1 | `Reel-2` |
| `CDV` | 1 | `CDV` |
| `Blu-ray` | 1 | `Blu-ray` |
| `13 x File` | 1 | `File` (rare, evtl. → `Other`) |

### Discogs-Vinyl-Descriptions (für Sub-Format-Klassifizierung)

Die Größenangabe (`7"`, `10"`, `12"`, `LP`) und der Sub-Typ (`EP`, `Single`, `Album`, `Maxi-Single`) stehen in `formats[0].descriptions[]`:

| Description | Vorkommen | Bedeutung für Mapping |
|---|---:|---|
| `LP` | 9.610 | → `Vinyl-LP` (12" Album) |
| `Album` | 6.838 | + Größe → meist `Vinyl-LP` |
| `45 RPM` | 3.299 | RPM-Info, Format aus Größe |
| `Stereo` | 2.735 | Descriptor (kein Format) |
| `7"` | 2.639 | → `Vinyl-7"` |
| `12"` | 2.601 | → `Vinyl-12"` (wenn ohne `LP`) oder `Vinyl-LP` (mit `LP`) |
| `Limited Edition` | 1.630 | Descriptor |
| `Reissue` | 1.366 | Descriptor |
| `Single` | 1.327 | meist mit `7"` → `Vinyl-7"` |
| `Compilation` | 1.277 | Descriptor |
| `EP` | 963 | meist mit `7"` oder `12"` → entsprechend |
| `Mono` | 466 | Descriptor |
| `10"` | 265 | → `Vinyl-10"` |
| `Maxi-Single` | 242 | → `Vinyl-12"` (Standard) |
| `Mini-Album` | 181 | → `Vinyl-LP` (Default) |
| `Picture Disc`, `Test Pressing`, `White Label`, `Promo` | je 100-230 | Descriptor (kein Format) |

**Sub-Format-Entscheidungslogik (Vinyl):**
1. `descriptions` enthält `7"` → `Vinyl-7"`
2. `descriptions` enthält `10"` → `Vinyl-10"`
3. `descriptions` enthält `12"` UND nicht `LP` → `Vinyl-12"` (Maxi)
4. `descriptions` enthält `LP` ODER `Album` ODER `Mini-Album` → `Vinyl-LP`
5. Default (unspecified) → `Vinyl-LP` (12" ist die Discogs-Defaultannahme)

`qty` aus `formats[0].qty` wird als Suffix angehängt (`-2`, `-3`, `-N`), default 1 (kein Suffix).

### Box Set / All Media Container-Pattern

Wenn `formats[0].name = 'Box Set'` oder `'All Media'`: Das ist ein **Container**, keine echte Tonträger-Information. Der eigentliche Format-Typ steht in `formats[1]` (oder `formats[2..]` bei Multi-Format-Boxes wie LP+CD+DVD).

**Logik:** Skip Container-Format, nimm `formats[1]` als Quelle für `(typ, qty, descriptions)`. Falls `formats[1]` selbst ein Container ist oder fehlt, fallback auf `Other`.

Beispiel `Box Set + 8 x CD` → Final-Format `CD-8`. Beispiel `Box Set + 1 x Vinyl + 1 x Flexi-disc` → primärer Format aus `formats[1]` = `Vinyl-LP` (Flexi als Beigabe ignorieren oder als Descriptor mitführen).

### Nicht-eindeutige Discogs-Werte (Frank-Entscheidung nötig)

In der CSV als `ENTSCHEIDUNG:` markiert:
- `Vinyl, EP` ohne Größenangabe — Default 7"? (EP-Singles meist 7", aber 12"-EP existiert)
- `Vinyl, Single` ohne Größe — vermutlich 7"
- `Vinyl, Mini-Album` — als `Vinyl-LP` behandeln?
- `Vinyl, Picture Disc` / `Test Pressing` / `Maxi-Single` — Format aus Größe (Default `Vinyl-LP` oder `Vinyl-12"`), Sondertyp als Descriptor
- `Tapes` (tape-mag-Generic, qty unbekannt) — mit `Tape` mergen oder beibehalten?
- `Video` (tape-mag) — enthält VHS und DVD durcheinander → manueller Split nötig (welcher Bestand ist VHS, welcher DVD?)
- `Tape-Mag CD` (id 54) — nur 2 Items, fast alle CDs kommen über Discogs

### Tape-mag-Lücken (heute 0 Bestand)

- `Book` (id 37, typ=4): 0 Items → Bücher landen als Magazin? Frank: prüfen
- `T-Shirt` (id 55, 56): 0 Items → wo werden T-Shirts aktuell gepflegt?
- `Mag/Lit typ=4 Press-Lit` (id 26): 0 → alle Press-Items in `typ=3 Label-Lit` (id 32)?
- `Picture typ=4` (id 33), `Poster typ=4` (id 34): 0 — analog

---

## TL;DR

- **Aktueller Enum** (`ReleaseFormat`, 16 Werte): `LP`, `CD`, `CASSETTE`, `BOOK`, `POSTER`, `ZINE`, `DIGITAL`, `VHS`, `BOXSET`, `OTHER`, `MAGAZINE`, `PHOTO`, `POSTCARD`, `MERCHANDISE`, `REEL`, `DVD`.
- **Hauptproblem 1 — zu grobes Vinyl-Bucket:** Vinyl 7", 10", 12" und LP werden alle auf `LP` gemappt. Damit gehen 7"-Singles (~1.500 Stück), 10" (~150) und 12"-Maxis (~1.250) verloren.
- **Hauptproblem 2 — Anzahl Tonträger geht verloren:** tape-mag's `Vinyl-LP-5` heißt **"LP-Box mit 5 Platten"**, `Tape-7` heißt **"7 Cassetten in Box"**, `Vinyl-7"-3` heißt **"Box mit 3× 7"-Singles"**. Discogs liefert dieselbe Info als `formats[0].qty: "6"` (entspricht der UI-Anzeige `6x Vinyl, LP`). **Heute wird `qty` nirgends gespeichert** (im Discogs-Fetch-Cache existiert es, in der Release-Tabelle nicht). Aus `Vinyl-LP-5`, `Vinyl-LP-6`, `Vinyl-LP-7` wird im Enum nur `LP` — die Box-Information ist weg.
- **Hauptproblem 3 — Discogs-Mismatches:** `8-Track Cartridge → CASSETTE`, `Minidisc → CD`, `Blu-ray → VHS`, `DVD → VHS` (DVD ist eigener Enum-Wert!). Die Mappings stehen in `backend/src/api/admin/discogs-import/commit/route.ts` und `scripts/shared.py` und divergieren.
- **Rohdaten sind da:**
  - `Release.format_id` zeigt eindeutig auf eine Zeile in `Format` mit dem tape-mag-Original-Namen (`Vinyl-LP-5` etc.) — daraus lässt sich `(format_typ, qty)` deterministisch ableiten.
  - `Release.legacy_format_detail` enthält für discogs-importierte Releases den vollen Format-String (`Vinyl, 7", 45 RPM, Single`); das `qty` wurde im Discogs-Cache (`discogs_api_cache.cached.formats[0].qty`) zwar abgelegt, aber nicht persistiert.
- **Empfehlung:** **Zwei separate Felder** statt nur Enum-Erweiterung:
  1. `Release.format` (Enum, schmal, nur Typ): neue Werte für `VINYL_7`, `VINYL_10`, `VINYL_12`, `LP`, plus die fehlenden Discogs-Träger.
  2. **`Release.format_qty`** (integer, default 1, neu): Anzahl der Tonträger. Aus tape-mag-`format_id` und Discogs-`formats[0].qty` befüllbar — keine Schätzung nötig.
  3. Single-Source-of-Truth `backend/src/lib/format-mapping.ts`, Discogs- und tape-mag-Mapper konsolidiert.
  4. Backfill aus `format_id` + `discogs_api_cache` — keine erneuten externen API-Calls nötig.

---

## 1) Aktuelle Formate in der DB

### 1.1 ReleaseFormat-Enum (Postgres) + Bestand

| Enum-Wert | # Releases | Verwendung |
|---|---:|---|
| `LP`          | 18.358 | **Vinyl-Sammelbucket** — kollabiert 7" / 10" / 12" / LP / EP / Single |
| `CASSETTE`    | 22.169 | **Cassette-Sammelbucket** — kollabiert MC / Tape / 8-Track |
| `MAGAZINE`    | 10.929 | Mag/Lit-Literatur |
| `VHS`         | 417    | Video — kollabiert VHS / DVD / Blu-ray (obwohl `DVD` als Enum existiert!) |
| `POSTER`      | 248    |  |
| `CD`          | 197    | Audio-CD — kollabiert CD / Minidisc / CDr / SACD |
| `REEL`        | 163    | Tonband |
| `PHOTO`       | 143    | Picture |
| `OTHER`       | 99     | Fallback |
| `POSTCARD`    | 52     |  |
| `BOXSET`      | 12     | Box-Set |
| `DIGITAL`     | 1      | File-Download (faktisch ungenutzt) |
| `BOOK`        | 0      |  ungenutzt (Literatur landet in `MAGAZINE`) |
| `ZINE`        | 0      | ungenutzt (Literatur landet in `MAGAZINE`) |
| `MERCHANDISE` | 0      | ungenutzt (T-Shirts etc.) |
| `DVD`         | 0      | **definiert, aber nie geschrieben** — alle DVDs landen in `VHS` |

**Total:** 53.054 Releases mit gesetztem Format.

### 1.2 `Format`-Tabelle (39 Zeilen) — Spiegel der tape-mag `3wadmin_tapes_formate`

Spalten: `id`, `name`, `typ` (1=Tonträger, 2/3/4=Literatur), `kat` (1=Tape/Sonstige, 2=Vinyl), `format_group` (= unser Enum-Wert).

> **Wichtig — Korrektur zur ersten Version:** Die `-N`-Suffixe in den Namen (`Vinyl-LP-5`, `Tape-7`, `Vinyl-7"-3`) sind **keine** Sortier-Hilfsnamen oder Duplikate, sondern **Anzahl Tonträger pro Release**. `Vinyl-LP-5` = LP-Box mit **5** Platten, `Tape-7` = Box mit **7** Cassetten, `Vinyl-7"-3` = Box mit **3** 7"-Singles. Die Variante ohne Suffix ist immer die Single-Tonträger-Version (`Vinyl-LP` = 1× LP, `Tape` = 1× Cassette).

Vollständige Liste — gruppiert nach (Format-Typ × Anzahl):

#### Vinyl (typ=1, kat=2)
| ID | Name | Format-Typ | qty (Anzahl Platten) | heute → Enum |
|---:|---|---|---:|---|
| 43 | Vinyl-LP   | LP (12" Album) | 1 | LP |
| 42 | Vinyl-LP-2 | LP (12" Album) | 2 | LP |
| 44 | Vinyl-LP-3 | LP (12" Album) | 3 | LP |
| 45 | Vinyl-LP-4 | LP (12" Album) | 4 | LP |
| 41 | Vinyl-LP-5 | LP (12" Album) | 5 | LP |
| 49 | Vinyl-LP-6 | LP (12" Album) | 6 | LP |
| 50 | Vinyl-LP-7 | LP (12" Album) | 7 | LP |
| 46 | Vinyl-7"   | 7" Single  | 1 | LP |
| 48 | Vinyl-7"-2 | 7" Single  | 2 | LP |
| 51 | Vinyl-7"-3 | 7" Single  | 3 | LP |
| 47 | Vinyl-10"  | 10"        | 1 | LP |
| 52 | Vinyl-10"-2| 10"        | 2 | LP |
| 53 | Vinyl-12"  | 12" (Maxi, kein Album) | 1 | LP |

→ **4 echte Format-Typen** (LP, 7", 10", 12") × **bis zu 7 Anzahl-Stufen**. Beides geht heute auf `LP` verloren.

#### Tapes (typ=1, kat=1)
| ID | Name | Format-Typ | qty | heute → Enum |
|---:|---|---|---:|---|
|  5 | Tape    | Cassette | 1  | CASSETTE |
| 16 | Tape-2  | Cassette | 2  | CASSETTE |
| 18 | Tape-3  | Cassette | 3  | CASSETTE |
| 20 | Tape-4  | Cassette | 4  | CASSETTE |
| 21 | Tape-5  | Cassette | 5  | CASSETTE |
| 23 | Tape-6  | Cassette | 6  | CASSETTE |
|  4 | Tape-7  | Cassette | 7  | CASSETTE |
| 35 | Tape-8  | Cassette | 8  | CASSETTE |
| 15 | Tape-10 | Cassette | 10 | CASSETTE |
| 17 | Tape-26 | Cassette | 26 | CASSETTE |
| 19 | Tape-32 | Cassette | 32 | CASSETTE |
| 24 | Tapes   | Cassette | ?  | CASSETTE (generisch "mehrere", qty unbekannt) |

→ **1 Format-Typ** (Cassette) × **12 Anzahl-Stufen**. Sehr große Boxes (26, 32 Tapes) sind real — typisch für Industrial-Kompilations-Sets.

#### Sonstige Tonträger (typ=1, kat=1)
```
36 Reel  → REEL
40 Video → VHS  (auch DVDs!)
54 CD    → CD
```

#### Literatur (typ=2/3/4)
```
26 Mag/Lit  (typ=4, Press-Lit)  → MAGAZINE
27 Mag/Lit  (typ=2, Band-Lit)   → MAGAZINE
32 Mag/Lit  (typ=3, Label-Lit)  → MAGAZINE
28 Picture  (typ=3)             → PHOTO
33 Picture  (typ=4)             → PHOTO
29 Postcards (typ=3)            → POSTCARD
30 Poster   (typ=3)             → POSTER
34 Poster   (typ=4)             → POSTER
37 Book     (typ=4)             → BOOK
55 T-Shirt  (typ=4)             → MERCHANDISE
56 T-Shirt  (typ=3)             → MERCHANDISE
```

> **Beobachtung:** Die typ-Spalte trennt Literatur-Subtypen (Band-Lit / Label-Lit / Press-Lit). Der format_group ist überall `MAGAZINE`/`PHOTO`/`POSTER`/`POSTCARD`/`BOOK`/`MERCHANDISE`. Die Literatur-Differenzierung läuft nicht über `format`, sondern über `Release.product_category`.

### 1.3 `legacy_format_detail` — Sub-Format-Reservoir

Top-Werte (sortiert nach Häufigkeit, Discogs-Format-Strings + tape-mag-Format-Namen gemischt):

| `legacy_format_detail` | n | Quelle |
|---|---:|---|
| `Tape` | 20.607 | tape-mag |
| `Mag/Lit` | 10.929 | tape-mag |
| `Vinyl-LP` | 4.945 | tape-mag |
| `Vinyl, LP, Album` | 2.417 | discogs |
| `Vinyl-7"` | 1.332 | tape-mag |
| `Vinyl-12"` | 1.190 | tape-mag |
| `Vinyl, LP, Album, Stereo` | 1.083 | discogs |
| `Vinyl-LP-2` | 648 | tape-mag |
| `Cassette` | 519 | discogs (oder tape-mag-import) |
| `Vinyl, LP` | 468 | discogs |
| `Video` | 413 | tape-mag |
| `Vinyl, LP, Compilation` | 290 | discogs |
| `Tape-2` | 280 | tape-mag |
| `Vinyl, LP, Album, Reissue` | 270 | discogs |
| `Vinyl, 7", 45 RPM, Single` | 263 | discogs |
| `Vinyl, 12", 45 RPM` | 253 | discogs |
| `Poster` | 248 | tape-mag |
| `Vinyl, 12", 33 ⅓ RPM` | 216 | discogs |
| `Vinyl, 7", 45 RPM` | 199 | discogs |
| `Reel` | 163 | tape-mag |

**Aussage:** Die volle Sub-Format-Information ist im Bestand vorhanden (für discogs-importierte Releases sogar inkl. RPM/Mono/Stereo/Edition), nur nie auf `Release.format` durchgereicht.

### 1.4 `format_group` (Storefront-Filter-Layer)

Der Storefront-Katalog filtert NICHT direkt auf `Release.format`, sondern auf `format_group` aus dem Meilisearch-Index. Die Werte werden in `scripts/meilisearch_sync.py::_compute_format_group()` kompiliert:

| `format_group` | Bedingung | Anzeige |
|---|---|---|
| `vinyl` | `Format.kat=2 OR format='LP'` | "Vinyl" |
| `tapes` | `Format.kat=1 OR format IN ('CASSETTE','REEL')` | "Tapes/Reels" |
| `cd` | `format='CD'` | "CD" |
| `vhs` | `format='VHS'` | "VHS/DVD" |
| `band_literature` | `product_category='band_literature'` | "Band-Lit" |
| `label_literature` | `product_category='label_literature'` | "Label-Lit" |
| `press_literature` | `product_category='press_literature'` | "Press-Lit" |
| `other` | Fallback | "Sonstiges" |

→ Das ist die **2.-Achse** der Format-Klassifikation. Aktuell nur 8 Buckets; eine spätere Erweiterung auf "Vinyl 7"/Vinyl 12"/Vinyl LP" als Filter ist möglich, ohne den Enum gleich zu ändern, **wenn** wir `legacy_format_detail` deterministisch parsen.

---

## 2) Matrix: tape-mag → DB

Aktuelle Mappings stehen an drei Stellen redundant. Single-Source-of-Truth fehlt:

| Quelle | Pfad | Wirkt auf |
|---|---|---|
| `LEGACY_FORMAT_ID_MAP` | `scripts/shared.py:180-198` | Cron `legacy_sync_v2.py` → schreibt `Release.format` & `Release.format_id` |
| `FORMAT_MAP` (Name → Enum) | `scripts/shared.py:142-170` | Fallback wenn `format_id` NULL |
| `Format.format_group` (DB-Spalte) | `Format`-Tabelle in Supabase | Storefront-JOIN für `format_group`-Filter |

### 2.1 Mapping nach `format_id` (Wahrheit beim Cron-Sync)

| Tape-Mag-IDs | Tape-Mag-Name | korrekte Zerlegung (Typ + qty) | heute → Enum | Verlust |
|---|---|---|---|---|
| 4, 5, 15-21, 23, 24, 35 | Tape*, Tapes | `CASSETTE` × {1,2,3,4,5,6,7,8,10,26,32,?} | `CASSETTE` | **🔴 qty geht verloren** |
| 36 | Reel | `REEL` × 1 | `REEL` | ⚠️ qty (Multi-Reel-Sets sind selten, aber existieren) |
| 40 | Video | `VHS` × 1 (DVD/Blu-ray ebenfalls hier) | `VHS` | ⚠️ Typ-Kollaps + qty |
| 43, 42, 44, 45, 41, 49, 50 | Vinyl-LP[…-7] | `LP` × {1,2,3,4,5,6,7} | `LP` | **🔴 qty geht verloren** |
| 46, 48, 51 | Vinyl-7"[-2,-3] | `VINYL_7` × {1,2,3} | `LP` | **🔴 Typ + qty** |
| 47, 52 | Vinyl-10"[-2] | `VINYL_10` × {1,2} | `LP` | **🔴 Typ + qty** |
| 53 | Vinyl-12" | `VINYL_12` × 1 | `LP` | **🔴 Typ** |
| 54 | CD | `CD` × 1 | `CD` | ⚠️ qty (CD-Boxen wie 5-CD-Sets nicht abbildbar) |
| 26, 27, 32 | Mag/Lit (typ 4/2/3) | `MAGAZINE` × 1 | `MAGAZINE` | ✅ Sub-Typ via `product_category` |
| 28, 33 | Picture | `PHOTO` × 1 | `PHOTO` | ✅ |
| 29 | Postcards | `POSTCARD` × 1 | `POSTCARD` | ✅ |
| 30, 34 | Poster | `POSTER` × 1 | `POSTER` | ✅ |
| 37 | Book | `BOOK` × 1 | `BOOK` (Live 0!) | ⚠️ Bestand fehlt — ggf. wird auf MAGAZINE geschrieben |
| 55, 56 | T-Shirt | `MERCHANDISE` × 1 | `MERCHANDISE` (Live 0!) | ⚠️ Sync-Pfad prüfen |

### 2.2 Mapping nach `format_name` (Fallback)

`scripts/shared.py:142-170` `FORMAT_MAP`-Dict:
```python
{
  "tape", "tapes", "kassette", "mc"     → CASSETTE
  "vinyl lp", "vinyl 7\"", "vinyl 12\"", "vinyl 10\"", "lp" → LP   # ⚠️ alles LP
  "video", "dvd"  → VHS                 # ⚠️ DVD-Enum existiert
  "reel"          → REEL
  "cd"            → CD
  "buch", "book"  → BOOK
  "poster"        → POSTER
  "zine", "magazin" → ZINE              # ⚠️ ZINE != MAGAZINE — inkonsistent zur ID-Map!
  "box", "boxset" → BOXSET
  "mag/lit"       → MAGAZINE
  "picture"       → PHOTO
  "postcards"     → POSTCARD
  "t-shirt", "shirt" → MERCHANDISE
}
```

### 2.3 Drift-Befund

- `ZINE` wird **nie** durch `LEGACY_FORMAT_ID_MAP` gesetzt, nur durch `FORMAT_MAP` per Name. Da der Cron primär per ID mappt, kommt `ZINE` faktisch nicht vor (Live-Count: 0). Inkonsistent zwischen den zwei Mapping-Tabellen.
- `BOOK` (ID 37, typ=4) wird per ID auf `BOOK` gemappt, in der Live-DB aber 0 — Verdacht: `product_category` und Sync-Logik überschreiben das mit `MAGAZINE`. **Verifikation nötig.**
- DVD-Bestand 0 obwohl Enum-Wert existiert: kein Mapping-Pfad führt aktuell zu `DVD`.

---

## 3) Matrix: Discogs → DB

### 3.1 Discogs-Format-API (Top-Level `formats[].name` + `qty`)

Discogs liefert pro Release ein Array `formats: [{ name, qty, descriptions: [...], text: "..." }]`. Drei Felder sind relevant:
- `name`: kanonischer Format-Typ (kontrolliertes Vokabular, ~28 Werte — siehe 4.1)
- **`qty`**: Anzahl der Tonträger (String, z.B. `"6"`). Entspricht der `6x Vinyl, LP`-Anzeige auf der Discogs-Webseite. Default `"1"` wenn nicht gesetzt.
- `descriptions`: freiere Sub-Tags (`7"`, `LP`, `45 RPM`, `Stereo`, `Reissue`, …)

**Aktueller Stand bei uns:** `qty` wird in `backend/src/api/admin/discogs-import/fetch/route.ts:292` mitgespeichert in `discogs_api_cache.cached.formats[0].qty` — also vorhanden, aber **nicht** auf `Release` durchgereicht. Beim Commit (`commit/route.ts`) wird `qty` schlicht ignoriert.

> Beispiel `Throbbing Gristle - 24 Hours` (Discogs Master 2647): `formats: [{ name: "Cassette", qty: "24", descriptions: ["Limited Edition", "Box Set"] }]` → 24 Cassetten in einer Box. Heute landet das bei uns als `format=CASSETTE` (qty geht verloren) und in `legacy_format_detail` als `"Cassette, Limited Edition, Box Set"`.

### 3.2 Aktuelles Mapping in `backend/src/api/admin/discogs-import/commit/route.ts:988`

```typescript
const FORMAT_MAP: Record<string, string> = {
  Vinyl:               "LP",         // 🔴 verliert 7"/10"/12"-Info
  CD:                  "CD",
  Cassette:            "CASSETTE",
  DVD:                 "VHS",        // 🔴 obwohl DVD-Enum existiert
  "Blu-ray":           "VHS",        // 🔴 falsch — Blu-ray ist HD, VHS analog
  "Box Set":           "BOXSET",
  File:                "DIGITAL",
  "Reel-To-Reel":      "REEL",
  Shellac:             "LP",         // ⚠️ 78rpm-Schellack — eigene Klasse?
  "Lathe Cut":         "LP",         // ⚠️ Sonderpressung — als Vinyl ok
  "8-Track Cartridge": "CASSETTE",   // 🔴 falsche Kategorie (Cartridge ≠ Cassette)
  Minidisc:            "CD",         // 🔴 falsche Kategorie (digital, aber nicht CD)
}
```

Und `scripts/shared.py:212` (für skript-seitige Discogs-Lookups) hat ein **kleineres** Mapping in die Gegenrichtung (Enum → Discogs-Search-Param):

```python
DISCOGS_FORMAT_MAP = {
  "LP": "Vinyl", "CD": "CD", "CASSETTE": "Cassette",
  "VHS": "DVD", "BOXSET": "Box Set", "DIGITAL": "File",
}
DISCOGS_SKIP_FORMATS = {"BOOK", "POSTER", "ZINE", "MAGAZINE", "PHOTO", "POSTCARD", "MERCHANDISE"}
```

→ **Drift:** TS-Mapping hat 12 Einträge, Python-Mapping 6, beide pflegen "Box Set" / "BOXSET" leicht unterschiedlich. Single-Source-of-Truth fehlt.

### 3.3 Sub-Format aus Discogs-Descriptions wird nicht ausgewertet

Der TS-Code persistiert in `legacy_format_detail` einen **kommaseparierten String** aus `name + descriptions`:
```typescript
function getFormatDetail(cached) {
  const f = cached.formats[0]
  return [f.name, ...(f.descriptions || [])].filter(Boolean).join(", ")
  // → "Vinyl, 7\", 45 RPM, Single, Stereo"
}
```

Das ist gut für Anzeige, aber wird **nirgends** in einen feineren Enum-Wert übersetzt. Die Information ist in der DB, fließt aber nicht in `Release.format`.

### 3.4 Fehlende Discogs-Formate in unserem Mapping

Discogs kennt deutlich mehr Top-Level-Formate als unser Mapping. Fehlend mit Auswirkung auf Industrial-Bestand:

| Discogs `name` | Heute → | Sollte → |
|---|---|---|
| `CDr` | OTHER (Fallback) | `CD` (ggf. `CDR`) |
| `SACD` | OTHER | `CD` |
| `Hybrid` | OTHER | (Sub-Format `Hybrid` als Description) |
| `Acetate` | OTHER | `LP` (Test-Pressing) |
| `Flexi-disc` | OTHER | `LP` (oder eigener Wert `FLEXI`) |
| `All Media` | OTHER | abh. von Sub-Formaten |
| `DCC` | OTHER | `CASSETTE` (digital compact cassette) |
| `DAT` | OTHER | `CASSETTE` |
| `Memory Stick`, `Floppy Disk`, `USB`, `Edison Disc` | OTHER | OTHER (selten) |

---

## 4) Vollständige Discogs-Format-Liste

Discogs pflegt das Vokabular zentral. Stand 2026 (siehe https://www.discogs.com/help/topics/database-guidelines/3.4-formats):

### 4.1 Top-Level-Formate (`formats[].name`)

**Audio-Träger:**
- `Vinyl` (Schallplatte — alle Größen/RPM via descriptions)
- `Acetate` (Test-Acetate, Pre-Production)
- `Flexi-disc` (Schallfolie)
- `Lathe Cut` (Lathe-geschnittene Mini-Auflagen)
- `Shellac` (Schellack, 78rpm)
- `Edison Disc` (zylindrische Walzen, historisch)
- `Cassette` (Compact Cassette / MC)
- `8-Track Cartridge`
- `4-Track Cartridge`
- `DCC` (Digital Compact Cassette)
- `Microcassette`
- `NT Cassette`
- `Reel-To-Reel` (Tonband)
- `CD` (Compact Disc)
- `CDr` (CD-Recordable, gebrannt)
- `CDV` (CD-Video, hybrid)
- `DCD` (Diamond Compact Disc)
- `SACD` (Super Audio CD)
- `HD CD`
- `MiniDisc`
- `DAT` (Digital Audio Tape)
- `DTS CD`
- `DualDisc`
- `Hybrid` (Multi-Layer-Disc)
- `Floppy Disk`
- `Memory Stick`
- `File` (Download/Stream)

**Video-Träger:**
- `DVD` (DVD-Video oder DVD-Audio)
- `Blu-ray`
- `VHS`
- `Betamax`
- `Video 2000`
- `Laserdisc`
- `Hi8`
- `VHD`
- `Selectavision`
- `UMD`

**Sonstige:**
- `Box Set` (Container — meist mit Sub-Formaten)
- `All Media` (Multi-Format-Bundle)

### 4.2 Descriptions (Top-Level-unabhängige Sub-Tags)

Für Vinyl: `7"`, `10"`, `12"`, `LP`, `EP`, `Single`, `Maxi-Single`, `Album`, `Compilation`, `Mini-Album`, `33 ⅓ RPM`, `45 RPM`, `78 RPM`, `Mono`, `Stereo`, `Quadraphonic`, `Reissue`, `Repress`, `Limited Edition`, `Numbered`, `Promo`, `Test Pressing`, `White Label`, `Picture Disc`, `Etched`, `Coloured`, `Gatefold`, `Misprint`, `Unofficial Release`.

Für CD: `Album`, `EP`, `Single`, `Compilation`, `Reissue`, `Remastered`, `Special Edition`, `Enhanced`, `Copy Protected`.

Für Cassette: `Album`, `EP`, `Single`, `Compilation`, `Chrome`, `Metal`, `Dolby B/C`, `Limited Edition`, `Numbered`.

→ Die kombinatorische Flut sub-formate ist **nicht** vollständig in einem Enum abbildbar. Die korrekte Strategie ist: **Top-Level-Format → Enum**, **Descriptions → strukturierte Side-Felder** (`vinyl_size`, `rpm`, `edition`, `mono_stereo`, …).

---

## 5) Migrationsplan: Format-Modell neu aufstellen

### 5.1 Zielbild

**Drei-Ebenen-Modell:**

1. **`Release.format` (Enum, schmal):** Format-Typ. Ca. 24 Werte (siehe 5.2).
2. **`Release.format_qty` (integer, NOT NULL DEFAULT 1):** Anzahl Tonträger. `1` = Single, `5` = LP-Box-Set, `24` = große Cassetten-Box.
3. **`Release.format_descriptors` (jsonb, optional):** Discogs-Descriptions als strukturiertes Array (`["Album", "Stereo", "Reissue", "Limited Edition"]`) — nur für Discogs-Imports oder manuell gepflegt.

`legacy_format_detail` bleibt als Audit-Log-Feld erhalten (Roh-String).

**UI-Anzeige-Pattern:**
- `format=LP, qty=1` → "LP"
- `format=LP, qty=5` → "5× LP" oder "LP Box (5 Platten)"
- `format=VINYL_7, qty=3` → "3× 7" Single"
- `format=CASSETTE, qty=24` → "24× Cassette (Box-Set)"
- `qty>=2` triggert automatisch das `BOXSET`-Tag/Badge (kein eigener Enum-Wert mehr nötig).

### 5.2 Empfohlener neuer Enum (Vorschlag) — ÜBERHOLT durch Update v3

> **Achtung:** Der Vorschlag unten (`VINYL_7`/`VINYL_10`/`VINYL_12`/`LP` als getrennte Enum-Werte + `format_qty`-Spalte) wurde durch Frank's CSV-Naming-Konvention überholt. Die finalen Werte heißen `Vinyl-LP`, `Vinyl-7"`, `Tape-7` etc. — siehe Block "Update v3" am Anfang dieses Dokuments und `Formate_v2.csv`. Der Doppel-Spalten-Approach (`format` Enum + `format_qty` Integer) ist dadurch nicht mehr nötig: Anzahl ist im Wert encodiert (`Vinyl-LP-5` = 5 LP-Platten).
>
> **Empfehlung Update v3:** Format-Spalte als `varchar(40)` (oder Enum mit ~80-90 Werten — alle Kombinationen aus Format-Typ × maximal beobachtete qty). Ein Enum mit ~90 Werten ist für Postgres trivial; der einzige Nachteil ist das `ALTER TYPE ADD VALUE` bei jeder neuen qty. Pragmatischer: **`varchar(40)` mit CHECK-Constraint gegen die Whitelist** in `format-mapping.ts`. Validierung läuft im Application-Layer (TS), DB schützt nur gegen Schreib-Drift.
>
> Falls `format_qty`-Spalte trotzdem gewünscht (z.B. für Filter "nur Box-Sets"): aus dem Wert ableitbar via Suffix-Parsing (`Vinyl-LP-5` → qty=5, default 1). Nicht in der DB persistieren — als virtual column oder Application-Layer-Helper.

Der Enum bildet **nur den Format-Typ** ab. Die Anzahl Tonträger steht in `format_qty`, nicht im Enum. → Keine Werte wie `LP_5` oder `CASSETTE_BOX`.

| Wert | Beschreibung | tape-mag-IDs | Discogs `name` (+ ggf. desc) |
|---|---|---|---|
| `VINYL_7`     | 7"-Single / EP | 46, 48, 51 | `Vinyl` + desc `7"` |
| `VINYL_10`    | 10" | 47, 52 | `Vinyl` + desc `10"` |
| `VINYL_12`    | 12"-Maxi (≠ LP) | 53 | `Vinyl` + desc `12"` ohne `LP` |
| `LP`          | 12"-Album-LP | 41, 42, 43, 44, 45, 49, 50 | `Vinyl` + desc `LP` ODER `Album` (Default für `12"` mit Album) |
| `SHELLAC_78`  | 78rpm-Schellack | – | `Shellac` |
| `FLEXI`       | Flexi-disc | – | `Flexi-disc` |
| `CASSETTE`    | Compact Cassette | 4, 5, 15-21, 23, 24, 35 | `Cassette` |
| `MICROCASSETTE` | Mikrokassette | – | `Microcassette` (selten) |
| `EIGHT_TRACK` | 8-Track Cartridge | – | `8-Track Cartridge` |
| `REEL`        | Tonband | 36 | `Reel-To-Reel` |
| `DAT`         | Digital Audio Tape | – | `DAT` |
| `CD`          | CD / CDr / SACD | 54 | `CD`, `CDr`, `SACD`, `Hybrid` |
| `MINIDISC`    | Minidisc | – | `MiniDisc` |
| `VHS`         | VHS-Video | 40 | `VHS`, `Betamax`, `Laserdisc` |
| `DVD`         | DVD-Video/Audio | – | `DVD` |
| `BLU_RAY`     | Blu-ray | – | `Blu-ray` |
| `DIGITAL`     | File-Download | – | `File` |
| `MAGAZINE`    | Mag/Lit | 26, 27, 32 | – |
| `BOOK`        | Buch | 37 | – |
| `PHOTO`       | Picture | 28, 33 | – |
| `POSTCARD`    | Postcards | 29 | – |
| `POSTER`      | Poster | 30, 34 | – |
| `MERCHANDISE` | T-Shirt etc. | 55, 56 | – |
| `OTHER`       | Fallback | – | – |

→ 23 Werte (vs. heute 16). `BOXSET` und `ZINE` aus altem Enum entfallen — `BOXSET` wird durch `format_qty >= 2` abgebildet, `ZINE` (heute 0 Bestand) durch `MAGAZINE`.

**Spezialfall Discogs `Box Set`:** Discogs hat `Box Set` als Top-Level-Format-Name. Das ist meist ein Container, der echte Sub-Format-Einträge in `formats[1..n]` mitführt. Beim Import: Skip `formats[0]` wenn `name='Box Set'`, nimm das nächste echte Format und setze `qty = formats[0].qty` (oder Summe der Sub-Format-qtys).

### 5.3 Single-Source-of-Truth: `backend/src/lib/format-mapping.ts`

Eine TS-Datei wird zur Wahrheit für alle Mappings (TS- und Python-Code rufen sie auf, oder Python lädt eine generierte JSON-Variante daraus). Zwingend exportiert:

```ts
// Top-Level Discogs-Format → Enum (qty wird separat aus formats[0].qty gelesen)
export const DISCOGS_FORMAT_TO_ENUM: Record<string, ReleaseFormat> = { … }

// Discogs-Descriptions → Vinyl-Sub-Typ
export function classifyVinyl(descriptions: string[]): ReleaseFormat
// ['7"', '45 RPM', 'Single']    → 'VINYL_7'
// ['12"', '33 ⅓ RPM']           → 'VINYL_12'   (kein LP-Tag → kein Album)
// ['LP', 'Album', 'Stereo']     → 'LP'

// Discogs-Format → (Enum, qty) als Tuple — Single-Call-Helper für Importer
export function classifyDiscogsFormat(
  formats: Array<{ name: string; descriptions: string[]; qty: string }>
): { format: ReleaseFormat; qty: number; descriptors: string[] }
// {name:'Cassette', qty:'24', descriptions:['Limited Edition','Box Set']}
//   → { format: 'CASSETTE', qty: 24, descriptors: ['Limited Edition','Box Set'] }
// {name:'Vinyl', qty:'2', descriptions:['7"','45 RPM','Single']}
//   → { format: 'VINYL_7', qty: 2, descriptors: ['45 RPM','Single'] }

// Tape-mag legacy_id → (Enum, qty) — direkte Tabelle, deterministisch
export const LEGACY_FORMAT_ID_MAP: Record<number, { format: ReleaseFormat; qty: number }> = {
  // Vinyl-LP Familie
  43: { format: 'LP', qty: 1 },         // Vinyl-LP
  42: { format: 'LP', qty: 2 },         // Vinyl-LP-2
  44: { format: 'LP', qty: 3 },
  45: { format: 'LP', qty: 4 },
  41: { format: 'LP', qty: 5 },
  49: { format: 'LP', qty: 6 },
  50: { format: 'LP', qty: 7 },
  // Vinyl-7" Familie
  46: { format: 'VINYL_7', qty: 1 },
  48: { format: 'VINYL_7', qty: 2 },
  51: { format: 'VINYL_7', qty: 3 },
  // Vinyl-10" / 12"
  47: { format: 'VINYL_10', qty: 1 },
  52: { format: 'VINYL_10', qty: 2 },
  53: { format: 'VINYL_12', qty: 1 },
  // Tape Familie
  5:  { format: 'CASSETTE', qty: 1 },
  16: { format: 'CASSETTE', qty: 2 },
  18: { format: 'CASSETTE', qty: 3 },
  20: { format: 'CASSETTE', qty: 4 },
  21: { format: 'CASSETTE', qty: 5 },
  23: { format: 'CASSETTE', qty: 6 },
  4:  { format: 'CASSETTE', qty: 7 },
  35: { format: 'CASSETTE', qty: 8 },
  15: { format: 'CASSETTE', qty: 10 },
  17: { format: 'CASSETTE', qty: 26 },
  19: { format: 'CASSETTE', qty: 32 },
  24: { format: 'CASSETTE', qty: 1 },   // 'Tapes' generisch — qty unklar, default 1
  // Sonstige
  36: { format: 'REEL', qty: 1 },
  40: { format: 'VHS', qty: 1 },
  54: { format: 'CD', qty: 1 },
  // Literatur (qty immer 1)
  26: { format: 'MAGAZINE', qty: 1 }, 27: { format: 'MAGAZINE', qty: 1 }, 32: { format: 'MAGAZINE', qty: 1 },
  28: { format: 'PHOTO', qty: 1 }, 33: { format: 'PHOTO', qty: 1 },
  29: { format: 'POSTCARD', qty: 1 },
  30: { format: 'POSTER', qty: 1 }, 34: { format: 'POSTER', qty: 1 },
  37: { format: 'BOOK', qty: 1 },
  55: { format: 'MERCHANDISE', qty: 1 }, 56: { format: 'MERCHANDISE', qty: 1 },
}

// Storefront-Filter-Bucket
export function toFormatGroup(f: ReleaseFormat): 'vinyl'|'tapes'|'cd'|'vhs'|'other' { … }
// VINYL_7, VINYL_10, VINYL_12, LP, SHELLAC_78, FLEXI → 'vinyl'
// CASSETTE, MICROCASSETTE, EIGHT_TRACK, REEL, DAT → 'tapes'
// CD, MINIDISC → 'cd'
// VHS, DVD, BLU_RAY → 'vhs'

// Versand-Type
export function toShippingItemType(f: ReleaseFormat, qty: number): string { … }
// LP × 5 → "vinyl_box_5lp" oder Lookup in shipping_item_types via (format, qty)
```

Python-Spiegel: `scripts/format_mapping.py` wird aus dieser TS-Datei automatisch generiert (z.B. via `scripts/generate-format-mapping.ts`), oder beide Seiten lesen aus einer JSON.

### 5.4 Schema-Migration (additiv, idempotent)

```sql
-- Neue Enum-Werte additiv hinzufügen (Postgres ALTER TYPE ADD VALUE ist transaction-fähig seit PG12)
ALTER TYPE "ReleaseFormat" ADD VALUE IF NOT EXISTS 'VINYL_7';
ALTER TYPE "ReleaseFormat" ADD VALUE IF NOT EXISTS 'VINYL_10';
ALTER TYPE "ReleaseFormat" ADD VALUE IF NOT EXISTS 'VINYL_12';
ALTER TYPE "ReleaseFormat" ADD VALUE IF NOT EXISTS 'SHELLAC_78';
ALTER TYPE "ReleaseFormat" ADD VALUE IF NOT EXISTS 'FLEXI';
ALTER TYPE "ReleaseFormat" ADD VALUE IF NOT EXISTS 'EIGHT_TRACK';
ALTER TYPE "ReleaseFormat" ADD VALUE IF NOT EXISTS 'MICROCASSETTE';
ALTER TYPE "ReleaseFormat" ADD VALUE IF NOT EXISTS 'DAT';
ALTER TYPE "ReleaseFormat" ADD VALUE IF NOT EXISTS 'MINIDISC';
ALTER TYPE "ReleaseFormat" ADD VALUE IF NOT EXISTS 'BLU_RAY';

-- Anzahl Tonträger
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS format_qty integer NOT NULL DEFAULT 1;
ALTER TABLE "Release" ADD CONSTRAINT release_format_qty_positive CHECK (format_qty >= 1 AND format_qty <= 100);

-- Discogs-Descriptions als strukturiertes Array
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS format_descriptors jsonb;  -- ['Album','Stereo','Limited Edition']

-- Index für Filter "nur Box-Sets" / "Single-Disc"
CREATE INDEX IF NOT EXISTS idx_release_format_qty ON "Release"(format_qty) WHERE format_qty > 1;
```

**Reihenfolge:** Migrations zuerst auf Prod (additiv, kein Risiko). Dann Code-Deploy mit neuen Mappings (gelesen wird neu, geschrieben weiterhin alt — via Feature-Flag). Dann Backfill. Dann Schreib-Pfade auf neu umstellen.

**Meilisearch-Index-Schema:** `format_qty` als filterable + sortable hinzufügen, `format` Enum aktualisieren. Atomic Swap nach Full-Rebuild (rc40-Pattern).

### 5.5 Backfill-Strategie

**Phase B (zuerst) — tape-mag-Releases via `format_id`** (deterministisch, keine Heuristik):

```sql
-- Vinyl-LP Familie → format=LP, qty aus ID ableitbar
UPDATE "Release" SET format='LP',       format_qty=1 WHERE format_id=43 AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='LP',       format_qty=2 WHERE format_id=42 AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='LP',       format_qty=3 WHERE format_id=44 AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='LP',       format_qty=4 WHERE format_id=45 AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='LP',       format_qty=5 WHERE format_id=41 AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='LP',       format_qty=6 WHERE format_id=49 AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='LP',       format_qty=7 WHERE format_id=50 AND NOT (locked_fields @> '"format"'::jsonb);
-- Vinyl 7"
UPDATE "Release" SET format='VINYL_7',  format_qty=1 WHERE format_id=46 AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='VINYL_7',  format_qty=2 WHERE format_id=48 AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='VINYL_7',  format_qty=3 WHERE format_id=51 AND NOT (locked_fields @> '"format"'::jsonb);
-- Vinyl 10" / 12"
UPDATE "Release" SET format='VINYL_10', format_qty=1 WHERE format_id=47 AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='VINYL_10', format_qty=2 WHERE format_id=52 AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='VINYL_12', format_qty=1 WHERE format_id=53 AND NOT (locked_fields @> '"format"'::jsonb);
-- Cassetten Familie
UPDATE "Release" SET format='CASSETTE', format_qty=1  WHERE format_id IN (5, 24)  AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='CASSETTE', format_qty=2  WHERE format_id=16          AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='CASSETTE', format_qty=3  WHERE format_id=18          AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='CASSETTE', format_qty=4  WHERE format_id=20          AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='CASSETTE', format_qty=5  WHERE format_id=21          AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='CASSETTE', format_qty=6  WHERE format_id=23          AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='CASSETTE', format_qty=7  WHERE format_id=4           AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='CASSETTE', format_qty=8  WHERE format_id=35          AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='CASSETTE', format_qty=10 WHERE format_id=15          AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='CASSETTE', format_qty=26 WHERE format_id=17          AND NOT (locked_fields @> '"format"'::jsonb);
UPDATE "Release" SET format='CASSETTE', format_qty=32 WHERE format_id=19          AND NOT (locked_fields @> '"format"'::jsonb);
```

**Phase A — Discogs-importierte Releases** (`format_id IS NULL`, Quelle: `discogs_api_cache`):

```sql
-- Discogs qty + descriptions aus Cache lesen, anwenden
UPDATE "Release" r
SET format             = classify.new_format,
    format_qty         = classify.new_qty,
    format_descriptors = classify.descriptors
FROM (
  SELECT
    r.id AS release_id,
    -- TODO: classify_discogs_format() als SQL-Funktion oder via Skript
    ...
  FROM "Release" r
  JOIN discogs_api_cache c ON c.discogs_id = r.discogs_release_id
  WHERE r.format_id IS NULL
    AND NOT (r.locked_fields @> '"format"'::jsonb)
) classify
WHERE r.id = classify.release_id;
```

→ Praktischer wird Phase A als **Python-Skript** mit `format_mapping.py::classify_discogs_format()` und Batch-Updates ausgeführt. SQL-only ist möglich, aber schwerer wartbar.

**Phase C — Audit-Diff:**

```sql
-- Vor-Commit-Reports
SELECT format, format_qty, COUNT(*) FROM "Release" GROUP BY format, format_qty ORDER BY 1, 2;
SELECT COUNT(*) FROM "Release" WHERE format='LP' AND format_qty=1;  -- "single LP"
SELECT COUNT(*) FROM "Release" WHERE format='LP' AND format_qty>=2; -- "LP-Boxen"
```

**Sync-Lock berücksichtigen:** Alle UPDATEs prüfen `NOT (locked_fields @> '"format"'::jsonb)` (siehe oben). Falls Frank in der Übergangsphase manuell `format_qty` setzt, separates Lock `format_qty` einführen.

### 5.6 Sync-Code-Anpassungen

**`scripts/legacy_sync_v2.py`:**
- `map_format_by_id()` ruft jetzt die zentrale Mapping-Tabelle auf (kein Hardcode mehr in `shared.py`).
- Gelockte Felder bleiben gelockt (rc51-Sync-Lock-Modell).

**`backend/src/api/admin/discogs-import/commit/route.ts`:**
- `mapDiscogsFormat()` nutzt das neue `classifyVinyl()`-Pattern: `name='Vinyl' → schau in descriptions ob 7"/10"/12"/LP, sonst LP`.
- `getFormatDetail()` bleibt für `legacy_format_detail` bestehen.
- Schreibt zusätzlich `format_size` und `format_descriptors`.

### 5.7 UI-Anpassungen

**Admin** (`/admin/media`):
- Format-Dropdown bekommt 8 neue Werte. Daneben ein Number-Input für `format_qty` (1-100). Stammdaten-Edit-Card respektiert `locked_fields`.
- Listenansicht zeigt `format_qty > 1` als Badge (z.B. `LP ×5`).
- Filter „Vinyl 7\"" / „Vinyl 12\""/ „LP" + „nur Boxes (qty≥2)" werden möglich.

**Storefront** (`/store/catalog` Filter + Release-Detail):
- `format_group`-Wert `vinyl` bleibt Top-Filter. Sub-Filter `format` mit `VINYL_7`/`VINYL_10`/`VINYL_12`/`LP` als zweite Ebene.
- Meilisearch-Index: `format_qty` neu hinzufügen (filterable, sortable).
- `meilisearch_sync.py::transform_to_doc` schreibt `format` + `format_qty` + `format_descriptors` ins Doc.
- Release-Detail: Anzeige als `5× LP` / `3× 7" Single` / `24× Cassette Box-Set` (siehe 5.1 Pattern).
- Optional: `format_qty >= 2` triggert ein „Box-Set"-Badge.

### 5.8 Risiken & Mitigations

| Risiko | Mitigation |
|---|---|
| Frank pflegt manuell Format-Werte → Backfill überschreibt | `locked_fields`-Guard im Backfill SQL |
| Discogs-Import-Code in Production schreibt während Migration | Feature-Flag `FORMAT_V2_WRITES` (alt-Pfad bleibt aktiv bis Backfill abgeschlossen) |
| Storefront-Filter cached alte `format_group`-Werte (Upstash Redis) | Cache-Bust nach Backfill |
| Meilisearch-Index braucht Full-Rebuild (~10 min) | Atomic-Swap-Pattern (rc40) — Prod-Index bleibt online |
| `ALTER TYPE` Werte können in PG nicht entfernt werden | Additive-Strategie: alte Werte (`LP`, `CASSETTE`) bleiben gültige Enum-Werte für Bestand |
| 7"/10"/12" Match auf legacy_format_detail mehrdeutig (z.B. "12\", 33 ⅓ RPM, LP" → LP oder VINYL_12?) | Klare Hierarchie: `LP`-Tag in Descriptions hat Vorrang vor Größe |

### 5.9 Reihenfolge & Aufwand

| Phase | Inhalt | Risiko | Aufwand |
|---|---|---|---|
| **1. Doc-Review** | Diesen Plan mit Frank durchgehen, Enum-Werte finalisieren | – | 1 h |
| **2. Migration** | `ALTER TYPE`, neue Spalten | gering (additiv) | 0.5 h |
| **3. Mapping-Lib** | `format-mapping.ts` + Python-Spiegel | mittel | 4-6 h |
| **4. Sync/Import-Update** | `legacy_sync_v2.py`, `discogs-import/commit/route.ts` mit Feature-Flag | mittel | 4 h |
| **5. Backfill-Skript** | Phase A + B + C mit Dry-Run-Mode | mittel | 4 h |
| **6. Backfill-Run** | Erst Dry-Run mit Diff-Report, dann commit. Gelockte Felder skippen | mittel | 1 h |
| **7. UI-Updates** | Admin-Dropdown, Storefront-Facette, Meili-Schema | gering | 4 h |
| **8. Verify + Cleanup** | Counts vergleichen, alte Mappings aus `shared.py` raus | gering | 2 h |

**Total:** ~20-25 h Engineering, eine Sprint-Woche.

---

## 6) Sofort-Maßnahmen (ohne Schema-Change möglich)

Falls die volle Migration noch zurückgehalten werden soll, sind vier Quick-Wins ohne neuen Enum sofort machbar:

1. **Drift-Fix Discogs-Mapping:** `8-Track Cartridge → CASSETTE` und `Minidisc → CD` auf `OTHER` korrigieren bis der Enum erweitert ist. `Blu-ray → VHS` ebenfalls auf `OTHER`. **5 Minuten in `commit/route.ts`.**
2. **Single-Source-of-Truth:** `format-mapping.ts` als zentrale Datei anlegen, alle drei Mappings (Discogs, Tape-Mag-ID, Tape-Mag-Name) konsolidieren — auch ohne neue Werte. Verhindert weitere Drift. **2 h.**
3. **`legacy_format_detail` Storefront-Anzeige:** In Release-Detail-Page das volle `legacy_format_detail` als zweite Format-Zeile anzeigen ("Vinyl, 7\", 45 RPM, Single"). Frank und Käufer sehen die Sub-Format-Info auch ohne neuen Filter. **30 min.**
4. **`format_qty` als minimale Schema-Erweiterung vorziehen:** Nur die Spalte `format_qty integer NOT NULL DEFAULT 1` hinzufügen + Backfill aus tape-mag-`format_id` (Phase B aus 5.5 — deterministisch, ~25k Releases) + Discogs-Cache-`qty`. Enum bleibt unverändert. → Ergibt sofort eine korrekte „LP-Box mit 5 Platten"-Anzeige, ohne `LP` von `VINYL_7` etc. zu trennen. **4 h Implementierung + 1 h Backfill-Run.** Empfehlung: das ist die mit Abstand wichtigste Korrektur, der Sub-Format-Split kann danach in Ruhe folgen.

---

## 7) Dokumente / Referenzen

- **Code-Pfade:**
  - `scripts/shared.py:142-222` — `FORMAT_MAP`, `LEGACY_FORMAT_ID_MAP`, `DISCOGS_FORMAT_MAP`
  - `scripts/legacy_sync_v2.py:619-770` — Sync-UPSERT mit Lock-CASE-WHEN
  - `backend/src/api/admin/discogs-import/commit/route.ts:684-1017` — Discogs-Import + `FORMAT_MAP`
  - `scripts/meilisearch_sync.py:358-385` — `_compute_format_group`
  - `backend/src/lib/release-search-meili.ts:138-152` — Storefront-Category-Filter
  - `backend/src/lib/shipping.ts:37-69` — Shipping-Mapping nach `format_group`
- **DB-Tabellen:**
  - `Format` (39 Zeilen, Spiegel von tape-mag `3wadmin_tapes_formate`)
  - `formats` (lowercase, alternative — sieht aus wie alter Stand mit tape-mag-Slugs, prüfen ob abkündbar)
  - `Release.format`, `Release.format_id`, `Release.legacy_format_detail`
- **Externe:**
  - Discogs Database Guidelines 3.4 Formats: https://www.discogs.com/help/topics/database-guidelines/3.4-formats
  - Discogs Format Enum (API): https://api.discogs.com/database/search?type=release&format=Vinyl

---

**Nächster Schritt:**
1. **Frank reviewt `/Users/robin/Downloads/Formate_v2.csv`** und entscheidet die offenen Punkte (`ENTSCHEIDUNG:`-Zeilen). Insbesondere:
   - Default für `Vinyl, EP`/`Vinyl, Single`/`Vinyl, Mini-Album` ohne Größenangabe
   - VHS/DVD-Split: bestehende `format_id=40` (Video) Items manuell prüfen — welche sind VHS, welche DVD/Blu-ray?
   - Sonderwerte `Acetate`, `Lathe Cut`, `Flexi`, `CDr`, `CDV`: eigene Werte oder unter Hauptformaten konsolidieren?
   - Tape-Generic `Tapes` (qty unbekannt): mit `Tape` mergen?
2. Mapping-Tabelle in `backend/src/lib/format-mapping.ts` aufbauen (Single-Source-of-Truth).
3. Schema-Migration: `Release.format` als `varchar(40)` mit CHECK-Constraint, oder Enum mit ~90 Werten.
4. Backfill (Phase B tape-mag deterministisch via `format_id`, Phase A Discogs aus `discogs_api_cache`).
5. Sync- und Discogs-Import-Code auf neue Mapping-Lib umstellen.
6. UI-Updates (Admin-Dropdown, Storefront-Facette, Meili-Schema mit Atomic-Swap).
