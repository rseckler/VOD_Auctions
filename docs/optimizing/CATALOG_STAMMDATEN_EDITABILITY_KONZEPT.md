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

## 3. Feld-Klassifikation — 4-Zonen-Modell

### Zone 0 — System-IDs (immer immutable)

Diese Felder dürfen **niemals** manuell editiert werden — weder auf Legacy- noch auf Discogs-Import-Rows. Sie sind strukturelle Identitäten des Systems.

| Feld | Legacy-Rows | Discogs-Import-Rows |
|---|---|---|
| `id` | **LOCKED** | **LOCKED** |
| `article_number` | **LOCKED** | **LOCKED** |
| `data_source` | **LOCKED** | **LOCKED** |

**Reason:** `article_number` ist eindeutige interne ID (Inventory/Print-Label basiert drauf). Manuelle Änderung würde Chaos in ERP/Druck-Bridge verursachen. Auch wenn `article_number` aktuell nicht im Legacy-Sync-14-Field-Diff liegt — es wird bei Import/Verify frisch vergeben und ist tabu.

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

## 4. Audit-Log & Revert (Anforderung Robin 2026-04-24)

**Anforderung:** Alle manuellen Stammdaten-Änderungen müssen protokolliert werden (wer/wann/was/wie), revidierbar sein, und im Catalog-Item sichtbar sein.

### 4a. Schema — neue Tabelle `release_audit_log`

```sql
CREATE TABLE release_audit_log (
  id              text PRIMARY KEY,
  release_id      text NOT NULL REFERENCES "Release"(id) ON DELETE CASCADE,
  field_name      text NOT NULL,                     -- 'title', 'year', 'artistId', ...
  old_value       jsonb,                             -- String/Number/Array/Object-Support
  new_value       jsonb,
  action          text NOT NULL,                     -- 'edit' | 'revert' | 'track_add' | 'track_delete' | 'image_add' | 'image_delete'
  actor_id        text NOT NULL,                     -- auth_context.actor_id (admin user id)
  actor_email     text,                              -- Snapshot für UI
  created_at      timestamptz NOT NULL DEFAULT now(),
  reverted_at     timestamptz,                       -- Wenn dieser Eintrag durch Revert neutralisiert wurde
  reverted_by     text,                              -- audit_log.id der Revert-Action
  parent_audit_id text REFERENCES release_audit_log(id)  -- Bei action='revert' → Original-Eintrag
);

CREATE INDEX idx_release_audit_log_release ON release_audit_log(release_id, created_at DESC);
```

### 4b. Revert-Regeln

- **Nur wenn aktueller Wert noch = Audit `new_value`** — sonst 409 Conflict mit Diff-Preview (spätere Edits dazwischen)
- **Revert schreibt zweiten Audit-Row** mit `action='revert'`, verweist auf Original via `parent_audit_id`
- **Original wird markiert** mit `reverted_at + reverted_by`
- **Knex-Transaktion:** Release-UPDATE, zwei Audit-Inserts, `pushReleaseNow` — alles atomar
- **Lock-Respekt:** Kein Revert eines Hard-Fields wenn Release inzwischen `data_source='legacy'` (Edge-Case)

### 4c. Sichtbarkeit in UI

**History-Tab** in `/admin/media/[id]`:
- Letzte 50 Einträge, neueste zuerst
- Pro Eintrag: Zeitstempel, Actor-Email, Action-Type, alte/neue Werte, Revert-Button
- Reverted-Einträge ausgegraut, Marker "↶ reverted by X"
- 409-Conflict zeigt Diff: "Aktueller Wert ist Z — Revert würde überschreiben"

---

## 5. Backend-Enforcement

### 5a. Read-Side — Flag mitliefern

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

### 5b. Write-Side — Guard in PATCH-Handler

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

### 5c. Neue Endpoints für Stammdaten-Edit (Discogs-Import-only)

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

### 5d. Meili-Reindex-Trigger

Alle Stammdaten-Edits auf Discogs-Import-Rows müssen einen **sofortigen Meili-Push** anstoßen (Klasse-B-Mutation gem. rc48-Pattern):

```ts
await pushReleaseNow(releaseId) // existierender Helper aus rc48
```

Damit ist der Catalog-Index innerhalb <5s aktuell, statt auf den nächsten Delta-Cron (`*/5 min`) zu warten.

---

## 6. Frontend-UX

### 6a. Source-Badge im Header

Neben `RELEASE INFORMATION` ein kleiner Pill-Badge:

- **Legacy** (grau, Neutral-Token) — "Synchronisiert von tape-mag"
- **Discogs-Import** (gold, C.gold) — "Importiert via Discogs"
- *Zukünftig:* **Manual Admin** (blau), **CSV Import** (violett)

Tooltip beim Hover: Datum des letzten Sync/Imports + Link zur Sync-/Import-Historie.

### 6b. Lock-Banner für Legacy-Rows

Über dem `RELEASE INFORMATION`-Block, wenn `is_stammdaten_editable=false`:

```
[🔒] Diese Stammdaten werden stündlich von tape-mag.com synchronisiert.
     Änderungen würden beim nächsten Sync verworfen.
     [?] Mehr erfahren
```

### 6c. Edit-Mode für Discogs-Import-Rows

Heute: Alle Felder display-only (reine `<input readonly>` bzw. Text-Rendering).
Neu bei `is_stammdaten_editable=true`:

- **Primary-Button** oben rechts: **"Stammdaten bearbeiten"** (C.gold, gem. Design-Guide v2.0)
- Klick → Felder werden zu echten Inputs (gleiche Layout-Struktur, in-place)
- **Save-Bar** sliding in von unten mit "Speichern" (C.gold) / "Abbrechen" (ghost)
- Validierung inline (Year 1900-2026, Country ISO-2 via Country-Picker, Format-Enum via Dropdown)
- Optimistic-Update + React-Query-Invalidate nach Save (rc48 Tag-3-Pattern)

### 6d. Artist-/Label-Picker

`artistId`/`labelId` werden **nicht als Freitext** editiert — sie öffnen Modal-Picker:

- Artist-Picker: Suche via `/admin/artists/search` (Meili-basiert, rc48)
- Label-Picker: Suche via `/admin/labels/search` (Postgres-trgm-basiert, rc40)
- Wichtig: Man kann einen Discogs-Import an einen **Legacy-Artist** linken (häufiger Dedupe-Case) — Quell-Check nur auf dem Release, nicht auf verlinkten Entities.

### 6e. Bulk-Edit-Verhalten

Der bestehende Bulk-Edit (`/admin/media` Bulk-Actions) überspringt Stammdaten-Änderungen auf Legacy-Rows **still** und zeigt am Ende:

> "Stammdaten für 12 von 50 ausgewählten Artikeln aktualisiert. 38 Legacy-Artikel übersprungen."

Commerce-Felder (shop_price, sale_mode) werden weiterhin für alle Rows gesetzt.

---

## 6. Entscheidungen — Antworten zu offenen Fragen

**Datum:** 2026-04-24 · **Von:** Robin Seckler

| # | Frage | Antwort | Konsequenz |
|---|---|---|---|
| 1 | Zone-2 Scope: einfach oder streng? | **(a) Einfach** | `barcode`, `genres`, `styles`, Tracklist, Images, `credits` **immer editierbar** (auch Legacy), weil Sync sie nicht anfasst |
| 2 | `article_number`: hart gesperrt? | **Ja, hart gesperrt IMMER** | Neu: Zone 0 einführen. `article_number` ist eindeutige interne ID (ERP/Druck), manuell tabu auf allen Rows |
| 3 | `genres`/`styles` auf Legacy: weiter editierbar? | **Ja, weiter offen** | Passt zu Q1=(a), ist Zone 2, kein Lock nötig |
| 4 | Override für Legacy-Tippfehler? | **(a) Kein Override** | Tippfehler in tape-mag korrigieren, nächster Sync räumt auf. Kein `sync_exempt`, kein Force-Edit, kein Write-Back |
| 5 | Discogs-Import an Legacy-Artist linken? | **Ja, erlaubt** | Standard-Dedupe-Case, kein Gegenargument |
| 6 | Source-Badge granular oder binary? | **Granular** | Badge zeigt `data_source`-Wert direkt: `legacy` / `discogs_import` / `manual_admin` (zukünftig) |
| 7 | `data_source=NULL` Backfill? | **Ja + NOT NULL Constraint** | Migration: `UPDATE Release SET data_source='legacy' WHERE data_source IS NULL`, danach Constraint |
| 8 | Tracklist-Edit auf Legacy erlaubt? | **Ja, erlaubt** | Reine Metadaten-Anreicherung, Sync fasst Tracks nicht an |

**Modell-Update:** Zone-Strukturierung siehe §3.

---

## 7. Abhängigkeiten & Nebenwirkungen (Updated für Audit-Log)

- **Audit-Log Atomicity:** Release-UPDATE + Audit-Inserts in einer Knex-Transaktion. Falls Audit-Insert fehlschlägt, ganzer Block rollback. Kritisch für Konsistenz (DBG: alle Edits gelogged oder keine).
- **Meilisearch:** Admin-Catalog (rc48) und Storefront-Catalog (rc40) lesen beide aus Meili. Stammdaten-Edits müssen via `pushReleaseNow(releaseId)` sofort reindexiert werden.
- **Search-Text:** `Release.search_text` wird via Trigger gepflegt, sobald Quellfelder (title, catalogNumber, Artist.name, Label.name) sich ändern → OK, keine Extra-Logik.
- **Sync-Drift-Check:** `scripts/meilisearch_drift_check.py` könnte Alarm schlagen, wenn editierte Discogs-Import-Rows und Meili kurzzeitig divergieren. Sollte durch `pushReleaseNow` abgedeckt sein.
- **Revert-Race-Bedingung:** Wenn Release zwischen "read current Wert" und "write Revert" von außen geändert wird, zeigen wir Conflict (409). Rückgängig-Machen erfordert Revert der neuen Änderung, nicht des ursprünglichen Edits.
- **Backwards-Compatibility:** Existierende `POST /admin/media/:id`-Aufrufe mit `genres`/`styles` bleiben funktionsfähig (Zone 2 bleibt offen).

---

## 8. Umsetzungs-Phasen & Model-Allocation

**Siehe separates Dokument:** [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) (Model-Wechsel-Playbook + Sequenzielle Reihenfolge)


---

## 9. Nicht-Ziele

- Kein Write-Back in Legacy-MySQL (offene Frage #4, Option d) — zu komplex, zu wenig Use-Case.
- Kein Sync-Exempt-Flag in dieser Iteration (offene Frage #4, Option c) — erst wenn Bedarf real auftritt.
- Keine Refactoring der Zone-3-Felder — bleiben unverändert.
- Keine UI-Änderungen an `/admin/discogs-import` selbst — das Konzept betrifft nur `/admin/media`.

---

## 10. Status & nächste Schritte

**Konzept-Status:** Final (alle Entscheidungen in §6 konsolidiert)

**Nächste Schritte:**
1. ✅ Dieses Konzept-Doc updaten (Phase 0, 2026-04-24)
2. → Model-Switch-Playbook befolgen → Phase 1 Backend starten
3. → Für jede Phase: CHANGELOG-Eintrag + GitHub Release-Tag

**Koordination:** Siehe [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) für exakte Sequenz + Model-Wechsel-Befehle.
