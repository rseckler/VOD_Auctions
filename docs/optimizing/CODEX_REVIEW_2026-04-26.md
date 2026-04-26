# Codex Code-Review — rc49.2 → rc51.9.1

**Datum:** 2026-04-26
**Range:** `6798cd6..HEAD` = 65 Commits, 107 Dateien, ~12k LOC seit 2026-04-24
**Tool:** `codex exec` (read-only, gpt-5-codex)
**Läufe:** 2 unabhängige Pässe (Pass #1: 160k Tokens, Pass #2: 192k Tokens) — beide mit identischem Briefing. Ergebnis: **vollständige Konvergenz auf dieselben 5 Findings**, Pass #2 brachte zusätzlich Performance-Aspekte für Finding #5.
**Methodik:** Codex priorisiert nach Risikoslices (Format-V2, Stammdaten/Sync-Lock, Pricing/Sync-Performance, POS/Trigger, MBA-Bootstrap). Alle Findings danach von Claude (Opus 4.7) gegen den tatsächlichen Code + Supabase-Schema verifiziert.

## Zusammenfassung

| # | Severity | Datei | Status |
|---|---|---|---|
| 1 | **High** (Codex: Critical, korrigiert) | `backend/src/lib/release-audit.ts:295` | ✅ **gefixt 2026-04-26** |
| 2 | **High** | `backend/src/lib/meilisearch-push.ts:170` | ✅ **gefixt 2026-04-26** |
| 3 | **High** | `backend/src/api/store/catalog/route-postgres-fallback.ts:219-260` | ✅ **gefixt 2026-04-26** |
| 4 | **High** | `scripts/legacy_sync_v2.py:1122` | ✅ **gefixt 2026-04-26** |
| 5 | **Medium** | `backend/src/api/admin/media/bulk/route.ts:170` | ✅ **gefixt 2026-04-26** |

## Fix-Anwendung 2026-04-26

Alle 5 Findings wurden direkt nach dem Review umgesetzt. TypeScript-Check (`npx tsc --noEmit`) zeigt keine neuen Errors aus den geänderten Dateien (pre-existing Errors auf `whereIn(col, subquery)`-Pattern aus rc40 sind unverändert). Python-Syntax-Check für `legacy_sync_v2.py` OK.

**Geänderte Dateien:**
- `backend/src/api/store/catalog/route-postgres-fallback.ts` — 7 Stellen auf echte OR/AND-Gruppen umgestellt
- `scripts/legacy_sync_v2.py` — Literature-UPSERT lock-key `'"format"'` → `'"format_id"'`
- `backend/src/lib/meilisearch-push.ts` — `is_purchasable` ohne `legacy_available`
- `backend/src/api/admin/media/bulk/route.ts` — `looseEqual`-Diff vor Audit-Push, `pushReleaseNow` nur für changed releases bei hard-fields-only Bulk, `skipped_count` semantisch befüllt
- `backend/src/lib/release-audit.ts` — Revert mit jsonb-array-stringify für `format_descriptors`/`locked_fields`

**Commit:** `d8f6818` "rc51.11 Big Bundle Post-Codex-Review: 4 Bugs + 1 Audit-Cleanup" auf `origin/main`.

**Bewusst NICHT umgesetzt:**
- Transform-Logik zwischen `meilisearch_sync.py` und `meilisearch-push.ts` zentralisieren (Codex-Empfehlung, separater Refactor-Task)
- Paritäts-Test TS↔Python (Codex-Empfehlung, gehört zu CI-Workstream)

## Deploy-Postmortem 2026-04-26

Der VPS-Deploy für rc51.11 brauchte zwei Anläufe — beide Komplikationen sind dokumentiert weil die Pattern wiederkehren.

**Anlauf 1 — `git pull` aborted:** Auf dem VPS existierten 6 untracked Files unter `scripts/backup/` (`_backup_common.sh`, `backup_brevo.sh`, `backup_r2_images.sh`, `backup_supabase.sh`, `backup_vps_databases.sh`, `.env.backup.example`). Diese stammten aus rc51.10's Backup-Pipeline, die Robin direkt auf dem VPS implementiert und Stunden später erst lokal committet hatte. Git verweigerte den Pull weil der Merge sie überschrieben hätte. **Verifikation:** `diff -q $f <(git show origin/main:$f)` für alle 6 Files zeigte byte-identisch — die committete Version und die VPS-Version waren gleich, das Löschen via `rm` war 0-Datenverlust.

**Anlauf 2 — `set -e` brach nach `medusa build` ab:** Backend-TS-Check liefert seit rc40 pre-existing Errors (`whereIn(col, subquery)`-Pattern + missing `@sentry/node`-Modul). `npx medusa build` reportet "Backend build completed with errors" und returnt **exit 1**, schreibt aber korrekte `.medusa/server/`- und `public/admin/`-Artefakte. Mit `set -e` aktiviert wurden die letzten 3 Schritte (`rm -rf public/admin && cp -r .medusa/server/public/admin public/admin`, `.env`-symlink, `pm2 restart`) übersprungen. Das Backend lief ~30 Min mit altem Code weiter. **Manueller Abschluss:** die 3 fehlenden Schritte einzeln nachgezogen, PM2-Restart erfolgreich (PID 2627924, restart #35, uptime resetted, `/health` HTTP 200, Frank in Logs aktiv).

**Erkannter Fehler beim ersten SSH-Call:** `ssh vps '...' 2>&1 | tee /tmp/log` — Bash returnt den exit code des **letzten** Pipeline-Commands (`tee`, immer 0). Der echte SSH-Exit wurde verschluckt. Die Background-Task-Notification reportete fälschlich "completed (exit code 0)" obwohl der Remote-Befehl mitten drin gecrasht war. Erst beim manuellen Tail des Logs ("Aborting") wurde das sichtbar.

**Lessons Learned (in Memory festgehalten):**
- [`feedback_pipefail_ssh_tee.md`](../../.claude/projects/-Users-robin-Documents-Claude-Work-PROJECTS-VOD-Auctions/memory/feedback_pipefail_ssh_tee.md) — `tee` schluckt SSH-Exit-Code; entweder `set -o pipefail` oder direkt `> /tmp/log 2>&1; echo "EXIT=$?"`
- [`feedback_medusa_build_exit_nonzero.md`](../../.claude/projects/-Users-robin-Documents-Claude-Work-PROJECTS-VOD-Auctions/memory/feedback_medusa_build_exit_nonzero.md) — `medusa build` darf nicht in `set -e`-Block liegen, da pre-existing TS-Errors trotz funktionalem Build exit ≠ 0 erzeugen

**Take-Away für Deploy-Skripte:** Build und Activate trennen. Build darf "errored" returnen (sofern Artefakte da sind), Activate-Schritte (admin-copy, symlink, pm2-restart) müssen unabhängig laufen. Plus: nach jedem Deploy `pm2 describe vodauction-backend` + `curl /health` als Verify, nicht der Background-Notification trauen.

**Slices ohne Findings:** rc51.6 article_number-Trigger · rc51.4/5 POS-Fixes · frank-mba-setup · Cutover-Reminder.

---

## Finding #1 — Audit-Revert bricht für `text[]`-Spalten (Knex JSON-Bind-Bug, gleiches Pattern wie rc51.9.1)

- **Datei:** `backend/src/lib/release-audit.ts:295`
- **Severity:** High (Codex hatte Critical mit anderer Theorie — verifiziert auf High herabgestuft)

### Codex' Originalbefund
> Der Revert-Pfad arbeitet mit `old_value`/`new_value` aus dem Audit-Log als bereits `JSON.stringify(...)`-serialisierten Strings, vergleicht sie aber ungeparst gegen die aktuellen DB-Werte und schreibt sie anschließend ungeparst zurück.

### Verifikation
Codex' Theorie ist **falsch**. Verifiziert via Supabase:
- `release_audit_log.old_value` / `new_value` sind `jsonb`
- `pg`-Driver (node-postgres) parst `jsonb` automatisch beim SELECT zurück zu JS-Werten
- Roundtrip String/Number/Array/Object via `JSON.stringify` → jsonb → JS funktioniert

### Tatsächlicher Bug
Beim Restore in Step 5 (Zeile 295):
```ts
await trx("Release")
  .where("id", original.release_id)
  .update({
    [original.field_name]: original.old_value as any,
    updatedAt: new Date(),
  })
```
`Release.genres` und `Release.styles` sind **`text[]`** (PostgreSQL ARRAY). Wenn Robin per Picker (rc51.9) Genres/Styles ändert, dann revertet, kommt `original.old_value` als JS-Array `["Industrial", "Noise"]` zurück. Knex' `.update({ genres: jsArray })` auf `text[]` löst exakt den **rc51.9.1-Bug** aus (PG-text[]-Mismatch → Exception). Robin hat den Save-POST gefixt, aber den Revert-Pfad nicht.

`Release.format_descriptors` (jsonb) hat das gleiche Risiko-Profil — bei `update({ format_descriptors: jsArray })` muss Knex `JSON.stringify` machen oder es schlägt fehl.

### Schema-Faktencheck
```sql
genres              text[]   (ARRAY/_text)
styles              text[]   (ARRAY/_text)
format_descriptors  jsonb
locked_fields       jsonb
title/country/...   text
year                int4
```

### Fix
Pro Spaltentyp dispatchen statt blind `.update()`:
```ts
const value = original.old_value
const field = original.field_name
const isArrayCol = field === "genres" || field === "styles"
const isJsonbCol = field === "format_descriptors" || field === "locked_fields"

if (isArrayCol && Array.isArray(value)) {
  await trx.raw(
    `UPDATE "Release" SET ${field} = ?::text[], "updatedAt" = NOW() WHERE id = ?`,
    [value, original.release_id]
  )
} else if (isJsonbCol) {
  await trx("Release")
    .where("id", original.release_id)
    .update({ [field]: JSON.stringify(value), updatedAt: new Date() })
} else {
  await trx("Release")
    .where("id", original.release_id)
    .update({ [field]: value, updatedAt: new Date() })
}
```

### Impact
- Jeder Revert auf Genres/Styles würde mit 500 crashen (User-sichtbar im UI)
- Jeder Revert auf `format_descriptors` würde scheitern
- Klassisches "wir haben es im einen Pfad gefixt, im Zwilling vergessen" — siehe Memory `feedback_grep_all_callers.md`

---

## Finding #2 — `pushReleaseNow()` hat noch `legacy_available` im is_purchasable-Gate (rc49.7-Drift)

- **Datei:** `backend/src/lib/meilisearch-push.ts:170`
- **Severity:** High

### Befund
Code (Zeile 166-170):
```ts
const hasShopPrice = shop !== null && shop > 0
const hasVerifiedInventory = verifiedCount > 0
const shopVisible = hasShopPrice && hasVerifiedInventory
const effective = shopVisible ? shop : null
const isPurchasable = shopVisible && !!row.legacy_available  // ← Drift
```

### Verifikation
`scripts/meilisearch_sync.py:411-416` zeigt explizit:
```python
# rc49.7: legacy_available nicht mehr im is_purchasable-Gate.
# die tape-mag historisch verkauft hatte (legacy_available=false)
is_purchasable = shop_visible_with_price
```
TS-Push-Now und Python-Batch-Sync widersprechen sich.

### Impact
Jede Admin-Mutation ruft `pushReleaseNow()` und setzt anschließend `search_indexed_at = NOW()`. Damit wird ein verifiziertes Release mit `shop_price > 0` und `legacy_available=false` (genau die 36 Releases die rc49.7 sichtbar gemacht hat) bei jeder Edit als nicht kaufbar reindiziert — bis ein anderer Pfad das überschreibt.

### Fix
```ts
const isPurchasable = shopVisible
```
Mittelfristig die Transform-Logik zwischen `meilisearch_sync.py::transform_to_doc` und `meilisearch-push.ts::transformToDoc` zentralisieren oder per Snapshot-Test paritätisch absichern.

---

## Finding #3 — Knex 3-Argument-Misuse im Storefront-Catalog-Postgres-Fallback

- **Datei:** `backend/src/api/store/catalog/route-postgres-fallback.ts:219-260`
- **Severity:** High

### Befund
Mehrfach im File (alle `format_v2`-Varianten):
```ts
query = query.where("Release.format",
  "Release.format_v2", format)
```

Knex' Signatur: `.where(column, operator, value)`. Hier wird `"Release.format_v2"` als **SQL-Operator** interpretiert — entweder Knex throwt beim Builder oder Postgres rejected die Query.

Selbes Pattern in `whereIn`/`whereNotIn` für Kategorien `tapes`, `vinyl`, `cd`, `vhs`:
```ts
.whereNotIn("Release.format",
  "Release.format_v2", ["CD", "VHS"])
```

### Impact
Wenn Meili-Health-Probe trippt → Storefront fällt auf `route-postgres-fallback.ts` zurück → `?format=` Parameter und Kategorie-Filter brechen → Storefront-Catalog liefert 500 oder leere Liste. Bei Normalbetrieb (Meili OK) silent — User merken nichts, aber das Fallback ist nicht funktional.

### Fix
Echte OR-Gruppen pro Stelle:
```ts
if (format && typeof format === "string") {
  query = query.where(function () {
    this.where("Release.format", format).orWhere("Release.format_v2", format)
  })
  countQuery = countQuery.where(function () {
    this.where("Release.format", format).orWhere("Release.format_v2", format)
  })
}
```
Für `whereIn`/`whereNotIn` analog mit verschachtelten Gruppen. **6+ Stellen** betroffen — Robin's Memory `feedback_grep_all_callers.md` einhalten und alle Aufrufe in einem Pass fixen.

---

## Finding #4 — Literatur-UPSERT in legacy_sync prüft falschen Lock-Key

- **Datei:** `scripts/legacy_sync_v2.py:1122`
- **Severity:** High

### Befund
Music-Release-UPSERT (Zeile 742-744, **richtig**):
```sql
format_v2 = CASE WHEN "Release".locked_fields @> '"format_id"'::jsonb
                   OR "Release".locked_fields @> '"format_v2"'::jsonb
                 THEN "Release".format_v2 ELSE EXCLUDED.format_v2 END,
```

Literature-UPSERT (Zeile 1122-1124, **falsch**):
```sql
format_v2 = CASE WHEN "Release".locked_fields @> '"format"'::jsonb   -- ← falscher Key
                   OR "Release".locked_fields @> '"format_v2"'::jsonb
                 THEN "Release".format_v2 ELSE EXCLUDED.format_v2 END,
```

`'"format"'` ist **nicht** in `SYNC_PROTECTED_FIELDS`. Der Lock-Key ist `format_id` (oder `format_v2`).

### Impact
Wenn ein Literatur-Release (Band-Lit, Label-Lit, Press-Lit — 11.370 Items) per Admin-Edit-Card `locked_fields=["format_id"]` bekommt und dann ein anderes ungelocktes Feld geändert wird, überschreibt der stündliche Sync `format_v2` trotzdem mit dem aus tape-mag derived Wert. User-Edit verloren, ohne dass es im Audit auffällt.

### Fix
Zeile 1122 auf `'"format_id"'` umstellen — identisch zum Music-Pfad.

### Test-Vorschlag
Vor dem Fix: Eine Literatur-Row mit `locked_fields=["format_id"]` und einer User-`format_v2`-Override anlegen, einen ungelockten Feld-Wert ändern, Sync laufen lassen, prüfen dass `format_v2` überschrieben wurde (sollte = Reproduktion). Nach Fix: gleicher Test, `format_v2` muss unverändert bleiben.

---

## Finding #5 — Bulk-Edit Audit-Log schreibt No-Op-Rows

- **Datei:** `backend/src/api/admin/media/bulk/route.ts:170`
- **Severity:** Medium

### Befund
```ts
for (const releaseId of ids) {
  const old = oldValues[releaseId]
  if (!old) continue
  for (const field of hardFieldsInUpdate) {
    const oldValue = old[field]
    const newValue = sanitized[field]
    auditRows.push({  // ← kein Diff-Check
      ...
      old_value: oldValue === undefined ? null : JSON.stringify(oldValue),
      new_value: newValue === undefined ? null : JSON.stringify(newValue),
      ...
    })
  }
}
```

### Impact
Bei Bulk-Edit auf 100 Releases × 5 Stammdaten-Felder werden 500 Audit-Rows erzeugt, auch wenn der Wert auf 99 Releases identisch bleibt. Folgen:
- Revisions-Historie verrauscht (UI listet Reverts auf No-Op-Rows)
- Auto-Lock greift auf Felder die gar nicht geändert wurden (bestätigt durch rc51.3 R2-Recommendation, die `looseEqual` für genau diesen Zweck eingeführt hat — aber im Single-POST, nicht im Bulk)
- Revert-Aktion auf solche Rows ändert nichts → Tickets vom Frank-Support
- **Aus Codex Pass #2 ergänzt:** unnötige `pushReleaseNow()`-Jobs für unveränderte Releases (jeweils ein Meili-Reindex pro Bulk-Item, auch wenn No-Op) — bei 1000er-Bulks signifikanter Meili-Traffic. Außerdem `updated_count`/`skipped_count` in der Response semantisch falsch.

### Fix
```ts
for (const field of hardFieldsInUpdate) {
  const oldValue = old[field]
  const newValue = sanitized[field]
  if (looseEqual(oldValue, newValue)) continue  // ← neu
  auditRows.push({ ... })
}
```
Plus:
- Auto-Lock darf nur für Felder greifen wo `auditRows.push()` tatsächlich gepusht hat — falls die Bulk-Route auch Locks setzt, dasselbe Diff-Filter dort
- `pushReleaseNow()` nur für tatsächlich veränderte Releases triggern (Set aus den Releases mit ≥1 Audit-Row)
- `updated_count` aus den real geänderten Releases zählen, nicht aus `ids.length`

---

## Verifizierte False-Positive-Kandidaten / Slices ohne Findings

### Format-V2 Mapping (rc51.7)
- TS↔Python-Mapping (`backend/src/lib/format-mapping.ts` ↔ `scripts/format_mapping.py`): keine Drift gefunden
- 71-Wert-Whitelist (CHECK-Constraint): konsistent
- Display-Helper `displayFormat()` / `displayFormatCompact()`: keine Edge-Cases
- Meili-Index `filterable`/`displayed` für `format_v2`: erweitert

### article_number-Trigger (rc51.6)
- BEFORE-INSERT-Trigger ist race-condition-frei (`nextval` ist atomic)
- `setval` nur wenn `current_max > 0` — idempotent
- Backfill mit `nextval` in Lockstep — saubere Lösung

### POS-Fixes (rc51.4/5)
- Barcode-Regex `000001VODe` akzeptiert: kein False-Positive-Risiko
- Cover-Image-URL und Hover-Zoom: trivial

### Frank MBA Bootstrap
- `mkdir -p LaunchAgents` + `lpstat -e` DRY_RUN-Check decken die in Memory dokumentierten macOS-26-Quirks ab

### Cutover-Reminder
- Skript läuft täglich, Trigger-Datum 2026-05-19, Drift-Heuristik LP→Lathe-Cut/Flexi/Acetate
- Niedriges Risiko, keine Findings

---

## Empfohlene Fix-Reihenfolge

1. **#3 catalog-postgres-fallback** (5 Min, betrifft User-facing Fallback) — silent broken Fallback ist gefährlich
2. **#4 legacy_sync_v2.py:1122** (1 Min, 1-Char-Edit) — User-Edits gehen sonst verloren
3. **#2 meilisearch-push.ts:170** (1 Min, 1-Zeile) — Drift mit jeder Admin-Mutation
4. **#5 bulk/route.ts** (5 Min, looseEqual-Check) — verfälscht Audit-History
5. **#1 release-audit.ts revert** (15-30 Min, Type-Dispatch + Test) — User-sichtbarer Crash bei Genres/Styles-Revert

Alle 5 Fixes zusammen ~30-45 Min plus Deploy/Test-Cycle.

---

## Memory-Updates aus diesem Review

Folgende Patterns sollten in Memory verstärkt werden:
- **knex JSON-Bind für `text[]`** — bisher nur `feedback_knex_jsonb_array.md`. Erweitern um `text[]`-Variante (rc51.9.1 + dieser Audit-Revert-Bug)
- **Double-Path-Drift** — TS↔Python (Meili sync vs push), Music↔Literature (UPSERT), Single↔Bulk (Audit). Pattern wiederholt sich. Memory `feedback_grep_all_callers.md` ist hier richtig — bei jeder neuen Logik systematisch nach Spiegel-Pfaden suchen.
- **Knex `.where(col, op, val)` Footgun** — neue Memory: 3-arg-Misuse mit Spaltennamen als "Operator" passiert silent oder erst zur Query-Zeit
