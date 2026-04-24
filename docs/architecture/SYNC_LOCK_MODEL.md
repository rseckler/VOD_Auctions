# Sync-Lock-Modell

**Status:** Konzept (Pre-Implementation, 2026-04-24) — Phase 1-4 von Catalog Stammdaten-Editierbarkeit (rc50.0-rc50.4) baut hierauf auf.
**Ziel-Release:** rc51.0
**Analog zu:** [`PRICING_MODEL.md`](PRICING_MODEL.md) §Shop-Visibility-Gate

---

## Motivation

Nach rc50.0-rc50.4 ist Stammdaten-Editieren für **Discogs-Import-Releases** (~11k) live, **Legacy-Releases aus tape-mag** (~41k) bleiben aber read-only. Das 4-Zonen-Modell schützt Legacy-Editing strikt, weil der stündliche `legacy_sync_v2.py`-Cron sonst jede User-Edit beim nächsten Run überschreiben würde.

**Problem:** Frank findet in Legacy-Releases regelmäßig Fehler (Tippfehler in Titeln, falsche Jahre, fehlende Country-Codes), kann sie aber nicht korrigieren weil die Zone-1-Felder gesperrt sind. Der bestehende Escape-Hatch — die Korrektur in der MySQL-tape-mag-DB machen und auf den nächsten Sync warten — ist umständlich und erfordert DB-Zugriff.

**Lösung:** Die Edit-Berechtigung wird entkoppelt vom `data_source`. Jedes editierte Feld wird per-Release-per-Field **gelockt** (analog zum `price_locked`-Pattern auf `erp_inventory_item`), und der Legacy-Sync respektiert den Lock beim UPSERT. Unveränderte Legacy-Felder fließen weiter wie bisher.

---

## Design-Prinzipien

1. **Explicit over implicit:** Jedes gelockte Feld ist im `Release.locked_fields`-Array sichtbar. Kein versteckter State.
2. **Parallel zum Pricing-Modell:** Gleiches Pattern wie `price_locked` (Boolean auf `erp_inventory_item`), nur granularer (Array statt Boolean, Release-Ebene statt Item-Ebene).
3. **Safe by default:** Auto-Lock beim ersten Edit. Frank muss nicht daran denken "Oh, ich sollte das gegen Sync schützen" — passiert von selbst.
4. **Un-lock explizit:** Wieder-Enable von Sync-Overwrite ist ein expliziter User-Schritt mit Confirm-Modal.
5. **Sync-Performance erhalten:** rc49.4 WHERE-gated UPSERT (180s→47s) darf nicht regredieren. Single-SQL-Statement bleibt, keine Per-Row-Loop-Calls.
6. **Audit-Trail unverändert:** `release_audit_log` liefert weiter `locked_by` + `locked_at` implizit über `actor_id` + `created_at` des letzten Edits — keine separate Lock-History-Tabelle nötig.

---

## Datenmodell

### Neue Spalte auf `Release`

```sql
ALTER TABLE "Release"
  ADD COLUMN locked_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX idx_release_locked_fields
  ON "Release" USING gin (locked_fields jsonb_path_ops);

COMMENT ON COLUMN "Release".locked_fields IS
  'JSON array of field names that are locked against legacy_sync_v2 overwrite. Each field gets auto-added on admin edit; removed via POST /admin/media/:id/unlock-field.';
```

**Inhalt:** Array von Field-Namen, z.B. `["title", "year", "country"]`.

**Warum JSONB-Array:**
- **Kompakt:** 1 Row, keine separate Tabelle, kein Extra-JOIN im Sync-Hot-Path.
- **Performant:** `jsonb_path_ops` GIN-Index macht `locked_fields @> '"title"'::jsonb` O(log n).
- **Flexibel:** Neue Hard-Stammdaten-Felder brauchen keine ALTER TABLE.
- **Einfach zu migrieren + rollbacken:** DEFAULT `'[]'::jsonb` → alle bestehenden Rows sind wie bisher.

**Warum NICHT Boolean-Spalten pro Field:**
- Verbose (14+ Fields aus Zone-1 Liste).
- ALTER TABLE pro neuem Hard-Feld.
- Jeder Sync-Filter wird ein AND-Geflecht.

**Warum NICHT separate Tabelle `release_field_locks`:**
- Sync muss 41k Rows × hourly prüfen → separate Tabelle heißt Extra-JOIN in der Hot-Path-UPSERT.
- `release_audit_log` hat bereits `actor_id` + `created_at` — Lock-Metadaten (wer, wann) sind implizit schon da.

### `data_source` bleibt unverändert

`Release.data_source` behält die Werte `legacy`, `discogs_import`, `manual_admin`. Dient weiter als **Ursprungs-Info** für SourceBadge.

**Entscheidung: data_source wird nach Edits NICHT auf `manual_admin` hochgestuft.** Ein Legacy-Release mit 3 editierten Feldern bleibt `data_source='legacy'` — die `locked_fields`-Info allein ist die Quelle der Wahrheit für "was ist user-edited". Das hält die Semantik stabil und vermeidet State-Machine-Komplexität.

---

## 3-Zonen-Modell (neu, ersetzt 4-Zonen)

| Zone | Felder | Editierbar? | Sync-Protection |
|---|---|---|---|
| **Zone 0** System-IDs | `id`, `article_number`, `data_source` | ❌ nie | — (silent strip in Allowlist) |
| **Zone 1** Hard-Stammdaten | `title`, `year`, `country`, `catalogNumber`, `barcode`, `description`, `artistId`, `labelId`, `coverImage`, `format_id`, `legacy_format_detail`, `legacy_condition`, `legacy_available`, `legacy_price` | ✅ **IMMER** (Legacy + Discogs) | Auto-Lock beim Edit → `locked_fields` Array → Sync überspringt |
| **Zone 2** Soft-Stammdaten | `genres`, `styles`, `credits` | ✅ immer | Kein Lock nötig — kommen vom `discogs_daily_sync`, nicht vom Legacy-Sync |
| **Zone 3** Commerce | `estimated_value`, `shop_price`, `sale_mode`, `shipping_item_type_id`, `discogs_id` | ✅ immer | `shop_price` via `erp_inventory_item.price_locked` (bestehend, unverändert) |

**Was wegfällt:**
- Zone-1-Lock per `data_source`-Check
- `isStammdatenEditable(release)` Guard → immer `true` für alle Releases (außer Zone 0)
- 403-Responses beim Legacy-Edit
- Bulk-Edit Skip-Logic für Legacy-Releases

---

## Writer-Logik

### POST `/admin/media/:id` (unverändert + Auto-Lock-Merge)

1. Zone-0 silent-strip (id, article_number, data_source) — wie heute.
2. **Kein Zone-1-Guard mehr** — 403-Branch komplett entfernt.
3. Validation via `validateReleaseStammdaten()` — wie heute.
4. UPDATE in Transaktion — wie heute.
5. **Neu:** Nach UPDATE die Liste der Hard-Fields die im Request-Body waren berechnen und idempotent zu `locked_fields` mergen:
   ```typescript
   const hardFieldsInBody = HARD_STAMMDATEN_FIELDS.filter(f => body[f] !== undefined)
   if (hardFieldsInBody.length > 0) {
     await trx("Release")
       .where("id", id)
       .update({
         locked_fields: trx.raw(
           `(SELECT jsonb_agg(DISTINCT v) FROM jsonb_array_elements_text(locked_fields || ?::jsonb) AS t(v))`,
           [JSON.stringify(hardFieldsInBody)]
         )
       })
   }
   ```
6. Audit-Log + pushReleaseNow — wie heute.

### POST `/admin/media/bulk` (Skip-Logic raus + Auto-Lock-Merge)

1. **Skip-Logic entfällt** — alle Releases werden jetzt editiert, auch Legacy.
2. Nach dem batched UPDATE: für jeden Release die Hard-Fields in locked_fields mergen (ein zusätzliches UPDATE mit derselben `jsonb_agg`-Subquery, batched über alle editable IDs).
3. Audit-Log wie heute (pro Release × pro Field eine Row).
4. pushReleaseNow fire-and-forget wie heute.

### POST `/admin/media/:id/unlock-field` (NEU)

```
POST /admin/media/:id/unlock-field
Body: { "field": "title" }

Response 200:
{
  "release_id": "legacy-release-12345",
  "field": "title",
  "locked_fields_remaining": ["year", "country"]
}

Response 400:
{
  "error": "field_not_locked",
  "message": "Field 'title' is not currently locked on this release"
}
```

Implementation:
```typescript
await pg("Release")
  .where("id", id)
  .update({
    locked_fields: pg.raw(
      `(SELECT COALESCE(jsonb_agg(v), '[]'::jsonb) FROM jsonb_array_elements_text(locked_fields) AS t(v) WHERE v != ?)`,
      [field]
    )
  })
```

Audit-Log-Eintrag mit neuer `action='field_unlocked'`, `field_name=<field>`, `old_value=null`, `new_value=null`.

### POST `/admin/media/:id/unlock-fields-bulk` (NEU, optional, Phase 2)

Für den "Alle Locks aufheben"-Flow im Detail-Header. Body: `{ fields: string[] }` oder `{ fields: "all" }`. Erstmal aus Scope raus, kommt wenn Frank es anfragt.

### Revert-Verhalten (unverändert)

Revert ist ein User-Edit. Audit-Row mit `action='revert'` wird geschrieben, Field wird NICHT aus `locked_fields` entfernt. Wenn User wirklich zurück zum Legacy-Wert möchte → explizit "Unlock" drücken + auf nächsten Sync-Run warten.

---

## Sync-Script-Änderung (`legacy_sync_v2.py`)

**Aktueller UPSERT (rc49.4):**
```sql
INSERT INTO "Release" (id, title, year, country, catalogNumber, ...)
VALUES (...)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  year = EXCLUDED.year,
  country = EXCLUDED.country,
  ...,
  updatedAt = NOW()
WHERE
  "Release".title IS DISTINCT FROM EXCLUDED.title OR
  "Release".year IS DISTINCT FROM EXCLUDED.year OR
  ...
```

**Neuer UPSERT (rc51.0):**
```sql
INSERT INTO "Release" (id, title, year, country, catalogNumber, ...)
VALUES (...)
ON CONFLICT (id) DO UPDATE SET
  title = CASE WHEN "Release".locked_fields @> '"title"'::jsonb
               THEN "Release".title ELSE EXCLUDED.title END,
  year = CASE WHEN "Release".locked_fields @> '"year"'::jsonb
              THEN "Release".year ELSE EXCLUDED.year END,
  country = CASE WHEN "Release".locked_fields @> '"country"'::jsonb
                 THEN "Release".country ELSE EXCLUDED.country END,
  ...,
  updatedAt = NOW()
WHERE
  (NOT "Release".locked_fields @> '"title"'::jsonb AND "Release".title IS DISTINCT FROM EXCLUDED.title) OR
  (NOT "Release".locked_fields @> '"year"'::jsonb AND "Release".year IS DISTINCT FROM EXCLUDED.year) OR
  (NOT "Release".locked_fields @> '"country"'::jsonb AND "Release".country IS DISTINCT FROM EXCLUDED.country) OR
  ...
```

**Eigenschaften:**
- **Single-Statement-Batch** bleibt erhalten → Performance unverändert (~47s für 41k Rows).
- CASE-WHEN pro Feld: wenn gelockt → behalte alten Wert (`"Release".field`), sonst → neuer Wert (`EXCLUDED.field`).
- WHERE-gated Diff: ein Feld triggert nur dann den UPDATE, wenn es NICHT gelockt ist UND sich unterscheidet. Gelockte Felder sind "unsichtbar" für den Sync → kein Trigger-Fire, kein Meili-Reindex-Cascade.
- SQL wird länger (~14 CASE-Blöcke × 14 WHERE-Conditions), aber pro Field 2 Zeilen → gut maintainable.

**Python-Seite:** Das SQL wird aus der Field-Liste generiert (keine Hand-Pflege). `HARD_STAMMDATEN_FIELDS` wird in `legacy_sync_v2.py` als Python-Konstante gespiegelt (oder aus einer shared JSON-Datei gelesen — aber YAGNI, 14 Strings in zwei Dateien pflegen ist OK).

### Observability

`sync_change_log` bekommt neue Change-Type-Variante:
```sql
-- Bisher:
change_type IN ('inserted', 'updated')

-- Neu:
change_type IN ('inserted', 'updated', 'sync_skipped_locked')
```

Wenn ein Feld gelocked ist UND sich der Legacy-Wert geändert hat, wird eine Log-Zeile mit `change_type='sync_skipped_locked'` geschrieben. So sieht Frank in der System-Health-View "50 Legacy-Edits wurden diesen Monat vom Sync respektiert statt überschrieben." Im täglichen No-Op-Fall (Lock stabil + Legacy stabil) → keine Log-Zeile, kein Noise.

**Counter in System-Health:** `sync_locks_respected_24h` — einfache `SELECT COUNT(*) FROM sync_change_log WHERE change_type='sync_skipped_locked' AND created_at > NOW()-'24h'`. Info-only, kein Alert. Dient als Signal "Lock-Mechanismus arbeitet".

---

## Frontend-Änderungen

### SourceBadge (Erweiterung)

**Heute:**
```
Legacy (Tape-Mag) — synced 15min ago
```

**Neu, wenn locked_fields leer:**
```
Legacy (Tape-Mag) — synced 15min ago
```

**Neu, wenn locked_fields nicht leer:**
```
Legacy (Tape-Mag) — 3 fields locked from sync
[Tooltip: title, year, country]
```

### LockBanner (entfällt)

Der rote "Diese Release ist locked"-Banner aus Phase 2 wird gelöscht. Legacy-Releases sind jetzt editierbar.

### Edit-Card pro Input

Rechts neben jedem Hard-Stammdaten-Input:
- **Wenn Field gelockt:** 🔒-Icon + Tooltip `"Sync-protected since [Datum]. Click to unlock and let legacy sync overwrite on next run."`
- **Wenn Field nicht gelockt:** kein Icon (oder optional ein grau-opakes "wird synced" Hinweis-Icon).

Klick auf 🔒 → Confirm-Modal:

```
┌─────────────────────────────────────────┐
│ Unlock "title" field?                   │
│                                         │
│ The next legacy sync run will overwrite │
│ your manual edit with the tape-mag      │
│ value. This will happen within ~1h.     │
│                                         │
│ Current (your edit):  "New Title"       │
│ Legacy (from tape-mag): "Old Tiitle"    │
│                                         │
│   [ Cancel ]    [ Unlock and Sync ]     │
└─────────────────────────────────────────┘
```

(Der "Legacy-from-tape-mag"-Wert ist aus dem letzten `sync_change_log`-Eintrag oder via Live-Fetch aus der MySQL-tape-mag-DB. Erstmal nur "current value" anzeigen, der Legacy-Wert kann Phase-2 sein wenn Frank danach fragt.)

### Bulk-Edit (Skip-Logic raus)

Optgroup-Label: `Stammdaten (auto-lock from sync)` statt `Stammdaten (skips legacy)`.

Toast-Text: `Updated X releases · Z fields auto-locked from future sync`.

### AuditHistory (neue Action-Badges)

Neue Badges analog zu `edit` / `revert`:
- `field_locked` — automatisch bei jedem Edit (implizit mit action='edit', kein extra Badge nötig)
- `field_unlocked` — Badge "🔓 Unlocked"

Bei erstem Impl: nur `field_unlocked` als separates Badge. `field_locked` wird NICHT als separate Audit-Row geschrieben — der Lock ist implizit im Edit. Spart Audit-Log-Volumen.

---

## Entscheidungen (festgelegt)

| # | Frage | Entscheidung | Begründung |
|---|---|---|---|
| 1 | Auto-Lock oder explizite Checkbox pro Edit? | **Auto-Lock** | Analog zu `price_locked` nach Verify. Weniger Klicks für Frank, safe by default. |
| 2 | Per-Field vs. "Unlock All" | **Per-Field**, "Unlock All" später wenn Bedarf | Granularer ist immer flexibler. YAGNI auf Bulk-Unlock. |
| 3 | `coverImage` auch lockbar? | **Ja** | Sonst überschreibt Legacy-Sync einen Frank-Upload mit tape-mag-R2-URL. |
| 4 | Verhältnis zu `price_locked` (ERP) | **Coexist, nicht vereinheitlichen** | Verschiedene Ebenen (Release vs. erp_inventory_item), unterschiedliche Writer-Pfade (catalog vs. ERP-Verify). Zusammenführen würde beide Flows brechen. `legacy_price` kann parallel in `locked_fields` landen wenn Release-Ebene editiert — `price_locked` bleibt truth-holder für Shop-Preis. |
| 5 | `data_source`-Upgrade auf `manual_admin` nach Edits? | **Nein** | `data_source` bleibt stabil als Ursprungs-Info. `locked_fields` ist die Truth für "user-edited". Keine State-Machine. |
| 6 | Bulk-Skip-Logic aus rc50.4 entfernen? | **Ja** | Legacy ist editable jetzt, Skip-Path macht keinen Sinn mehr. Toast-Text anpassen. |

---

## Nicht-Goals

- **Field-Level-Versioning** — history zeigt was geändert wurde, nicht mehr/weniger detailliert als `release_audit_log` heute.
- **Multi-User Conflict-Detection auf Edit-Ebene** — Auth-Scope ist effektiv "Frank". Wenn Zweitnutzer kommt: optimistisch, letzter Write gewinnt + Audit-Log.
- **Auto-Expire Locks** — Locks bleiben bis explizit unlocked. Kein "nach 30d zurück in Sync-Mode". Führt zu Überraschungen.
- **Cross-Release-Lock-Propagation** — wenn Field X auf Release A gelockt ist, hat das keinen Effekt auf Release B. Sind pro Release isoliert.
- **Sync von locked_fields selbst zurück zu tape-mag** — tape-mag bleibt Legacy-Read-Only-Source. Keine Reverse-Sync-Infrastruktur.

---

## Migration + Rollout

### Phase 1 — DB + Helper (~30 min)

- Supabase MCP `apply_migration`:
  - `ALTER TABLE "Release" ADD COLUMN locked_fields jsonb NOT NULL DEFAULT '[]'`
  - `CREATE INDEX idx_release_locked_fields USING gin (locked_fields jsonb_path_ops)`
  - `sync_change_log.change_type` CHECK-Constraint erweitern um `sync_skipped_locked`
- `backend/src/lib/release-locks.ts`:
  - Konstante `SYNC_PROTECTED_FIELDS` (= Zone-1-Liste, ~14 Einträge)
  - `isFieldLocked(release, fieldName): boolean`
  - `lockFields(trx, releaseId, fields[]): Promise<void>` — idempotent merge via jsonb_agg(DISTINCT)
  - `unlockField(pg, releaseId, field): Promise<void>` — jsonb_array-filter-out

### Phase 2 — Writer-Routes (~50 min)

- POST `/admin/media/:id`: 403-Guard raus, Auto-Lock-Merge nach UPDATE in Transaktion
- POST `/admin/media/bulk`: Skip-Logic raus, Auto-Lock-Merge für alle Hard-Fields in der Transaktion
- POST `/admin/media/:id/unlock-field`: neue Route, Audit-Log-Entry mit action='field_unlocked' (action-enum erweitern via Migration wenn CHECK existiert), pushReleaseNow fire-and-forget

### Phase 3 — Sync-Script (~1.5-2h)

- `legacy_sync_v2.py`:
  - `HARD_STAMMDATEN_FIELDS` Konstante in Python spiegeln
  - `build_upsert_sql()` anpassen: CASE-WHEN pro Field + WHERE-gated lock-aware Diff
  - `sync_change_log`-Insert erweitern um `change_type='sync_skipped_locked'` wenn gelocked + EXCLUDED ≠ current
- Lokaler Test mit `--dry-run` auf 1-2 legacy-Releases die manuell locked_fields gesetzt bekommen haben
- Deploy auf VPS + erster Live-Run monitoren (duration + rows_changed + respected_locks-Counter)

### Phase 4 — Frontend (~1h)

- `SourceBadge.tsx`: locked_fields.length Anzeige erweitern
- `LockBanner.tsx`: **löschen** aus Detail-Page
- `routes/media/[id]/page.tsx`:
  - is_stammdaten_editable-Guard aus Edit-Card entfernen
  - Pro Hard-Stammdaten-Input: kleines 🔒-Icon rendern wenn Field in `release.locked_fields`
  - Klick auf 🔒 → Confirm-Modal mit Unlock-POST
- `routes/media/page.tsx` Bulk: Optgroup-Label + Toast-Text anpassen

### Phase 5 — Tests (~30 min)

- Smoke: Legacy-Release Title editieren → `locked_fields: ["title"]` → stündlichen Sync-Run abwarten oder manuell triggern → Title unverändert → `sync_change_log` hat `sync_skipped_locked`-Row
- Smoke: Unlock-Button klicken → `locked_fields: []` → nächster Sync-Run → Title wieder überschrieben mit tape-mag-Wert
- Bulk: 10 Releases mit 5 Legacy + 5 Discogs → alle 10 werden editiert, alle 10 bekommen locked_fields → Toast zeigt korrekten Count

### Phase 6 — Doku + Deploy (~30 min)

- Dieses Doc finalisieren (Status: Pre-Implementation → Deployed)
- CLAUDE.md §"Preis-Modell" um §"Sync-Lock-Modell" ergänzen
- CHANGELOG-Entry rc51.0
- GitHub-Release-Tag `v1.0.0-rc51.0`

**Gesamt-Zeit:** ~4-5h (3.5-4h Coding + 1h Testing + Deploy). Enger als mein erster Schätzer, weil 90% der UI + Writer-Routes in Phase 1-4 schon gebaut sind.

---

## Rollback-Plan

**DB-Rollback:** `locked_fields`-Spalte kann NOT NULL DROP + DROP COLUMN rollbacken — additive Migration, keine vorhandenen Daten verloren.

**Code-Rollback:** `git revert` auf rc51.0-Commits → Feature aus, Legacy wieder read-only. `locked_fields`-Spalte bleibt in der DB mit Werten, wird von rc50.4-Code einfach ignoriert.

**Sync-Script-Rollback:** alter `legacy_sync_v2.py` funktioniert unverändert weiter — ignoriert `locked_fields` und überschreibt alle Fields wie vor rc51.0. In diesem Fall gehen alle Frank-Edits auf Legacy-Releases beim nächsten Hourly-Run verloren. **Deshalb Sync-Script NICHT rollbacken, wenn Code-Rollback nötig ist** — nur Admin-UI + Writer-Routes rollbacken.

---

## Offene Fragen

Keine — alle 6 Entscheidungen oben sind festgelegt. Weitere Details kommen beim Implementieren auf.

---

**Autor:** Robin Seckler + Claude (Opus 4.7) · 2026-04-24
**Review-Stand:** Pre-Implementation (Konzept signed off, Implementation beginnt als nächstes)
