# Catalog — Stammdaten-Editierbarkeit nach Herkunft

**Status:** Konzept (offene Fragen am Ende)
**Datum:** 2026-04-23
**Scope:** `/admin/media` Detail-Seite — Feld-Editierbarkeit in Abhängigkeit von `Release.data_source`
**Kontext:** Auf dem Catalog-Admin (https://admin.vod-auctions.com/app/media) sind Stammdaten heute für alle Rows read-only. Seit `/admin/discogs-import` neue Artikel direkt in die VOD-DB schreibt (nicht über die Legacy-MySQL), existieren zwei Release-Herkünfte mit unterschiedlichen Konsistenz-Anforderungen.

---

## 1. Ausgangslage — Zwei Quellen für `Release`-Rows

Ab rc26 (Discogs Import v6) gibt es **zwei unabhängige Eintragswege** in die `Release`-Tabelle:

### 1a. Legacy-Sync (stündlich, automatisch)
- **Tool:** `scripts/legacy_sync_v2.py` — Cron `0 * * * *`
- **Quelle:** Legacy-MySQL von tape-mag.com
- **ID-Pattern:** `legacy-release-<id>`, `legacy-bandlit-<id>`, `legacy-labellit-<id>`, `legacy-presslit-<id>`
- **Column-Marker:** `data_source = 'legacy'` (Default)
- **Umfang:** ~41.500 Artikel (30.159 release + 3.915 band_lit + 1.129 label_lit + 6.326 press_lit)
- **Überschreibt stündlich 14 Felder** (siehe §3)
- **Single Source of Truth:** Legacy-MySQL. Die VOD-DB ist eine Spiegelung.

### 1b. Discogs-Import (on-demand, manuell via Admin-UI)
- **Tool:** `/admin/discogs-import` (`POST /admin/discogs-import/commit`)
- **Quelle:** Discogs-API (Collection-Export des Users, anschließende Discogs-Metadaten-Anreicherung)
- **ID-Pattern:** UUID (generiert via `generateEntityId()`), kein `legacy-`-Prefix
- **Column-Marker:** `data_source = 'discogs_import'` (hart gesetzt in `backend/src/api/admin/discogs-import/commit/route.ts:698`)
- **Umfang:** Wächst mit jedem Frank-Sammlungs-Upload (Franks Sammlung, Bremer loh-fi, Pargmann Waschsalon etc.)
- **Wird vom Legacy-Sync nicht angefasst** — diese Rows existieren nicht in der Legacy-MySQL
- **Single Source of Truth:** VOD-DB selbst. Discogs ist nur initiale Anreicherung, keine laufende Quelle für Stammdaten.

### Konsequenz
- **Legacy-Rows:** Jede manuelle Änderung an den 14 gesynct-Feldern wird **innerhalb von max. 60 Min** vom nächsten Sync-Lauf überschrieben → effektiv nicht editierbar, sonst Datenverlust.
- **Discogs-Import-Rows:** Kein Sync rollt darüber. Manuelle Änderungen bleiben dauerhaft. **Sollten** editierbar sein, damit Frank/Admin Tippfehler korrigieren, Format-Details verfeinern, fehlende Felder ergänzen kann.

---

## 2. Unterscheidungs-Marker

Es gibt **zwei redundante Marker** — beide müssen konsistent sein; bei Widerspruch gewinnt `data_source` (explicit wins over implicit):

| Marker | Werte | Reliability |
|---|---|---|
| `Release.data_source` (TEXT) | `'legacy'` (Default) \| `'discogs_import'` \| zukünftig `'manual_admin'`, `'csv_import'` | **Primär** — explicit |
| `Release.id`-Prefix | `legacy-*` = legacy \| sonst (UUID) = import | **Sekundär** — defense-in-depth |

**Helper (neu):** `backend/src/lib/release-source.ts`

```ts
export const EDITABLE_STAMMDATEN_SOURCES = ['discogs_import'] as const
export function isStammdatenEditable(release: { id: string; data_source: string | null }): boolean {
  if (release.id.startsWith('legacy-')) return false
  return EDITABLE_STAMMDATEN_SOURCES.includes(release.data_source as any)
}
```

---

## 3. Feld-Klassifikation — 3-Zonen-Modell

### Zone 1 — Hard-Stammdaten (Legacy-Sync überschreibt)

Diese Felder werden stündlich von `legacy_sync_v2.py` geschrieben (14-Field-Diff, `scripts/legacy_sync_v2.py:179-194`):

| Feld | Legacy-Rows | Discogs-Import-Rows |
|---|---|---|
| `title` | **LOCKED** | editierbar |
| `description` | **LOCKED** | editierbar |
| `year` | **LOCKED** | editierbar |
| `format` (Enum) | **LOCKED** | editierbar |
| `format_id` | **LOCKED** | editierbar |
| `catalogNumber` | **LOCKED** | editierbar |
| `country` | **LOCKED** | editierbar |
| `artistId` (Link) | **LOCKED** | editierbar |
| `labelId` (Link) | **LOCKED** | editierbar |
| `coverImage` (URL) | **LOCKED** | editierbar |
| `legacy_price` | **LOCKED** (außer `price_locked=true`) | editierbar |
| `legacy_condition` | **LOCKED** | editierbar |
| `legacy_format_detail` | **LOCKED** | editierbar |
| `legacy_available` | **LOCKED** | editierbar |

### Zone 2 — Soft-Stammdaten (Sync ignoriert, aber Stammdaten-Charakter)

Felder, die der Legacy-Sync **nicht anfasst** und in Legacy-MySQL meist leer sind. Edits können hier nicht kollidieren — sie sind reiner Wertzuwachs.

| Feld | Empfehlung |
|---|---|
| `barcode` (EAN/UPC) | immer editierbar |
| `genres` (text[]) | immer editierbar (Admin-UI schon offen) |
| `styles` (text[]) | immer editierbar (Admin-UI schon offen) |
| `article_number` | **Abhängig von Offene-Frage-#2** (siehe §6) |
| Tracklist (`Track`-Rows) | immer editierbar (Legacy-Sync hat keinen Track-Pfad) |
| Zusätzliche `Image`-Rows | immer editierbar (Sync fasst nur `coverImage` an) |
| `credits` | immer editierbar |
| `media_condition` / `sleeve_condition` | immer editierbar (werden pro Kopie im ERP gepflegt) |

### Zone 3 — Commerce-Daten (keine Stammdaten, immer offen)

Nie vom Legacy-Sync angefasst, unabhängig von `data_source` editierbar:

- `shop_price` (rc47.2 — kanonischer Shop-Preis, gesetzt vom Inventory-Verify)
- `sale_mode` (`auction_only` / `direct_purchase` / `both`)
- `estimated_value`
- `shipping_item_type_id`
- Discogs-Preis-Felder (`discogs_lowest_price`, `discogs_suggested_prices`, `discogs_price_history`) — werden von `discogs_daily_sync.py` gepflegt
- `erp_inventory_item.*` (Copy-Level-Daten)
- Block-/Auction-Zuweisungen

---

## 4. Backend-Enforcement

### 4a. Read-Side — Flag mitliefern

`GET /admin/media/:id` ergänzt die Response um:

```jsonc
{
  "release": { ... },
  "meta": {
    "is_stammdaten_editable": true,       // true für Discogs-Import, false für Legacy
    "source": "discogs_import",           // pass-through Release.data_source
    "locked_reason": null                 // "Synced from tape-mag legacy DB" für Legacy
  }
}
```

### 4b. Write-Side — Guard in PATCH-Handler

`POST /admin/media/:id` bekommt Guard **vor** dem `UPDATE`-Statement:

```ts
const HARD_STAMMDATEN = [
  'title', 'description', 'year', 'format', 'format_id',
  'catalogNumber', 'country', 'artistId', 'labelId', 'coverImage'
]

const editedHardFields = Object.keys(body).filter(k => HARD_STAMMDATEN.includes(k))
if (editedHardFields.length > 0 && !isStammdatenEditable(release)) {
  return res.status(403).json({
    error: 'stammdaten_locked',
    message: 'Stammdaten werden vom Legacy-Sync verwaltet und können nicht editiert werden.',
    locked_fields: editedHardFields,
  })
}
```

### 4c. Neue Endpoints für Stammdaten-Edit (Discogs-Import-only)

Heute kennt `POST /admin/media/:id` nur Commerce-Felder (`shop_price`, `sale_mode`, `estimated_value`, `shipping_item_type_id`, `discogs_id`, `genres`, `styles`). Die Whitelist wird erweitert:

**Neue erlaubte Felder (nur bei `is_stammdaten_editable=true`):**
`title`, `description`, `year`, `format`, `format_id`, `catalogNumber`, `country`, `artistId`, `labelId`, `coverImage`, `barcode`, `credits`, `legacy_format_detail`

**Zone-2-Felder, immer erlaubt (alle Rows):**
`genres`, `styles`, `barcode` *(abhängig von Offene-Frage-#3)*

**Track-Management (neue Sub-Routes, nur Discogs-Import):**
- `POST /admin/media/:id/tracks` — Track hinzufügen
- `PATCH /admin/media/:id/tracks/:trackId` — Track ändern
- `DELETE /admin/media/:id/tracks/:trackId` — Track löschen

**Image-Management:** nutzt bestehenden `/admin/erp/inventory/upload-image`-Endpoint, jedoch Guard für `coverImage`-Setter gegen Legacy.

### 4d. Meili-Reindex-Trigger

Alle Stammdaten-Edits auf Discogs-Import-Rows müssen einen **sofortigen Meili-Push** anstoßen (Klasse-B-Mutation gem. rc48-Pattern):

```ts
await pushReleaseNow(releaseId) // existierender Helper aus rc48
```

Damit ist der Catalog-Index innerhalb <5s aktuell, statt auf den nächsten Delta-Cron (`*/5 min`) zu warten.

---

## 5. Frontend-UX

### 5a. Source-Badge im Header

Neben `RELEASE INFORMATION` ein kleiner Pill-Badge:

- **Legacy** (grau, Neutral-Token) — "Synchronisiert von tape-mag"
- **Discogs-Import** (gold, C.gold) — "Importiert via Discogs"
- *Zukünftig:* **Manual Admin** (blau), **CSV Import** (violett)

Tooltip beim Hover: Datum des letzten Sync/Imports + Link zur Sync-/Import-Historie.

### 5b. Lock-Banner für Legacy-Rows

Über dem `RELEASE INFORMATION`-Block, wenn `is_stammdaten_editable=false`:

```
[🔒] Diese Stammdaten werden stündlich von tape-mag.com synchronisiert.
     Änderungen würden beim nächsten Sync verworfen.
     [?] Mehr erfahren
```

### 5c. Edit-Mode für Discogs-Import-Rows

Heute: Alle Felder display-only (reine `<input readonly>` bzw. Text-Rendering).
Neu bei `is_stammdaten_editable=true`:

- **Primary-Button** oben rechts: **"Stammdaten bearbeiten"** (C.gold, gem. Design-Guide v2.0)
- Klick → Felder werden zu echten Inputs (gleiche Layout-Struktur, in-place)
- **Save-Bar** sliding in von unten mit "Speichern" (C.gold) / "Abbrechen" (ghost)
- Validierung inline (Year 1900-2026, Country ISO-2 via Country-Picker, Format-Enum via Dropdown)
- Optimistic-Update + React-Query-Invalidate nach Save (rc48 Tag-3-Pattern)

### 5d. Artist-/Label-Picker

`artistId`/`labelId` werden **nicht als Freitext** editiert — sie öffnen Modal-Picker:

- Artist-Picker: Suche via `/admin/artists/search` (Meili-basiert, rc48)
- Label-Picker: Suche via `/admin/labels/search` (Postgres-trgm-basiert, rc40)
- Wichtig: Man kann einen Discogs-Import an einen **Legacy-Artist** linken (häufiger Dedupe-Case) — Quell-Check nur auf dem Release, nicht auf verlinkten Entities.

### 5e. Bulk-Edit-Verhalten

Der bestehende Bulk-Edit (`/admin/media` Bulk-Actions) überspringt Stammdaten-Änderungen auf Legacy-Rows **still** und zeigt am Ende:

> "Stammdaten für 12 von 50 ausgewählten Artikeln aktualisiert. 38 Legacy-Artikel übersprungen."

Commerce-Felder (shop_price, sale_mode) werden weiterhin für alle Rows gesetzt.

---

## 6. Offene Fragen

1. **Scope Zone 2 (Soft-Stammdaten) — einfache oder strenge Regel?**
   - **(a) Einfach:** `barcode`, `genres`, `styles`, Tracklist, Images, `credits` immer editierbar (auch Legacy) — weil Sync sie nicht anfasst.
   - **(b) Streng:** Auch auf Legacy-Rows gesperrt, damit Frank nicht rätselt wieso manche Felder editierbar sind und andere nicht.
   - **Vorschlag:** **(a)** — weil Zone-2-Felder in Legacy-MySQL oft leer sind und Edits reine Verbesserungen darstellen.

2. **`article_number` (z.B. `VOD-19628`) — Legacy oder intern vergeben?**
   - Ist das aus der Legacy-MySQL übernommen → dann Zone 1 (hart gesperrt, auch wenn Sync es aktuell nicht im 14-Field-Diff hat)?
   - Oder wird die beim Import/Verify frisch vergeben → dann Zone 3 (immer offen)?
   - **Offen.** Bitte klarstellen.

3. **`genres`/`styles` auf Legacy-Rows:** Heute schon editierbar via `POST /admin/media/:id`. Soll dieses Verhalten so bleiben (Zone-2-einfach) oder sollen wir es im Zuge dieses Konzepts auch für Legacy sperren?

4. **Override-Mechanismus für Legacy:** Braucht Frank einen "Force-Edit"-Knopf für seltene Fälle (z.B. Legacy-Tippfehler korrigieren)? Drei Optionen:
   - **(a) Kein Override.** Tippfehler müssen in tape-mag selbst korrigiert werden → nächster Sync räumt auf.
   - **(b) Lokaler Override.** Edit schreibt nur in VOD-DB, wird beim nächsten Sync überschrieben → kein Permanence-Versprechen.
   - **(c) Sync-Exempt-Flag.** Neues Feld `Release.sync_exempt BOOLEAN DEFAULT FALSE` — einzelne Rows aus dem Sync ausklammern. Sauber, aber Drift-Risiko.
   - **(d) Write-Back nach MySQL.** Edit schreibt via SQL auch in Legacy-MySQL. Komplex, weil MySQL-Credentials + Write-Pfad aufgebaut werden müsste.
   - **Vorschlag:** **(a)** — maximale Simplizität. Bei real auftretendem Bedarf zu **(c)**.

5. **Artist-/Label-Link bei Discogs-Import ändern:** Darf man einen Discogs-Import an einen Legacy-Artist umhängen? (Vorschlag: ja — Standard-Dedupe-Case: Frank importiert "Brighter Death Now — New Album" via Discogs, linkt es an den schon existierenden `legacy-artist-BDN`.) Gibt es Gegenargumente?

6. **Source-Badge-Granularität:** Binary ("Legacy" / "Editierbar") oder granular (`legacy` / `discogs_import` / `manual_admin`)? Granular hilft beim Debugging und ist zukunftssicherer, kostet aber mehr UI.
   - **Vorschlag:** Granular, weil `data_source` eh schon granular in der DB liegt. Badge zeigt direkt den Wert.

7. **Was tun bei `data_source=NULL`?** Theoretisch möglich, wenn alte Rows vor der `data_source`-Migration gesetzt wurden und `data_source` noch NULL ist. Backfill-Migration nötig (`UPDATE "Release" SET data_source='legacy' WHERE data_source IS NULL AND id LIKE 'legacy-%'`)?
   - **Vorschlag:** Ja, Backfill als Teil der Umsetzung. Danach `data_source NOT NULL`-Constraint setzen.

8. **Tracklist-Edit auf Legacy-Rows:** Sync fasst Tracks gar nicht an — also sicher. Aber konzeptionell: Frank fügt bei Legacy-Release "Brighter Death Now — Pain In Progress" Tracks hinzu, die in tape-mag nie drinstanden. Konsistenz-Problem?
   - **Vorschlag:** Erlaubt. Tracklist ist reine Metadaten-Anreicherung, keine Stammdaten im engeren Sinn. Falls tape-mag später Tracks ergänzt, bleibt der Sync davor stehen (kein Track-Pfad).

---

## 7. Abhängigkeiten & Nebenwirkungen

- **Meilisearch:** Admin-Catalog (rc48) und Storefront-Catalog (rc40) lesen beide aus Meili. Stammdaten-Edits müssen via `pushReleaseNow(releaseId)` sofort reindexiert werden.
- **Search-Text:** `Release.search_text` wird via Trigger gepflegt, sobald Quellfelder (title, catalogNumber, Artist.name, Label.name) sich ändern → OK, keine Extra-Logik.
- **Sync-Drift-Check:** `scripts/meilisearch_drift_check.py` könnte Alarm schlagen, wenn editierte Discogs-Import-Rows und Meili kurzzeitig divergieren. Sollte durch `pushReleaseNow` abgedeckt sein.
- **Audit-Log:** Jeder Stammdaten-Edit sollte in `customer_audit_log` (oder neuem `release_audit_log`) landen — wer, wann, welche Felder geändert, alter/neuer Wert. Wichtig für Nachvollziehbarkeit wenn Frank fragt "warum steht hier plötzlich Sweden statt Schweden".
- **Backwards-Compatibility:** Existierende `POST /admin/media/:id`-Aufrufe mit `genres`/`styles` bleiben funktionsfähig (Zone 2 bleibt offen).

---

## 8. Umsetzungs-Phasen (Vorschlag)

**Phase 0 — Entscheidungen:** Offene Fragen §6 mit Robin klären.

**Phase 1 — Backend-Foundation:**
1. Helper `backend/src/lib/release-source.ts` (isStammdatenEditable)
2. `GET /admin/media/:id` liefert `meta.is_stammdaten_editable`, `meta.source`, `meta.locked_reason`
3. `POST /admin/media/:id` Guard + erweiterte Field-Whitelist für Discogs-Import
4. `data_source`-Backfill-Migration (offene Frage #7)
5. Audit-Log-Tabelle + Write-Pfad
6. `pushReleaseNow`-Hook bei jedem Stammdaten-Edit

**Phase 2 — Frontend:**
1. Source-Badge im Release-Header
2. Lock-Banner für Legacy-Rows
3. Edit-Mode-Toggle + Inline-Inputs + Save-Bar
4. Artist-/Label-Picker-Modals
5. Track-Sub-Routes UI (Add/Edit/Delete)
6. Optimistic-Update + React-Query (rc48 Tag-3-Pattern)

**Phase 3 — Bulk & Polish:**
1. Bulk-Edit überspringt Legacy still + Summary
2. Validation-Rules (Year, Country-ISO, Format-Enum)
3. Empty-State wenn niemand je editiert hat (Discogs-Import mit sauberen Defaults)

**Phase 4 — Observability:**
1. Metric: Anzahl Edits pro Woche, pro Feld, pro User
2. Meili-Drift-Check tolerant für Transient-State <5s

---

## 9. Nicht-Ziele

- Kein Write-Back in Legacy-MySQL (offene Frage #4, Option d) — zu komplex, zu wenig Use-Case.
- Kein Sync-Exempt-Flag in dieser Iteration (offene Frage #4, Option c) — erst wenn Bedarf real auftritt.
- Keine Refactoring der Zone-3-Felder — bleiben unverändert.
- Keine UI-Änderungen an `/admin/discogs-import` selbst — das Konzept betrifft nur `/admin/media`.

---

**Nächster Schritt:** Robin beantwortet offene Fragen §6 → Implementierungs-Plan mit Migration, Route-Änderungen, UI-Patch im Anschluss.
