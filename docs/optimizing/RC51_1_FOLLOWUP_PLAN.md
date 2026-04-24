# rc51.1 Follow-Up Plan — Post-Opus-Review Findings

**Status:** Planung (2026-04-24) · Ziel-Release: **rc51.1** (optional rc51.2/rc51.3 bei Scope-Split)
**Quelle:** Opus Architecture Review zu [`SYNC_LOCK_MODEL.md`](../architecture/SYNC_LOCK_MODEL.md) am 2026-04-24
**Verwandte Docs:** [`SYNC_LOCK_MODEL.md`](../architecture/SYNC_LOCK_MODEL.md), [`PRICING_MODEL.md`](../architecture/PRICING_MODEL.md), [`CATALOG_STAMMDATEN_EDITABILITY_KONZEPT.md`](CATALOG_STAMMDATEN_EDITABILITY_KONZEPT.md)

---

## Kontext

Das Opus Architecture Review zu rc51.0 (Sync-Lock-Modell) hat 1 echten Bug gefunden (sofort gefixt in rc51.0.1 — `AuditAction` Type-Drift für `field_unlocked`). Zusätzlich 3 pre-existing Bugs in anderen Release-Writern und 3 non-blocking UX-/Konsistenz-Empfehlungen.

Alle Findings sind **nicht rc51.0-Regressionen** — sie existieren schon länger oder sind bewusst getroffene Judgment-Calls die nachgebessert werden sollten.

**Kein Database-Migration nötig.** Alle Fixes sind Code-only.

**Deploy-Budget:** ~2h Gesamt-Aufwand. Kann als EIN rc51.1 gebündelt werden, oder in 2-3 kleineren Patches (rc51.1=Bugs, rc51.2=Recommendations).

---

## Priority Matrix

| # | Thema | Severity | Aufwand | Impact | Files |
|---|-------|---------:|--------:|--------|-------|
| **B1** | `ai-create-auction` updated_at camelCase | 🔴 HIGH | 2min | Runtime-Crash beim AI-Create-Auction | `backend/src/api/admin/ai-create-auction/route.ts` |
| **B2** | `upload-image` coverImage ohne Lock | 🟡 MEDIUM | 15min | Admin-Upload kann von Sync überschrieben werden | `backend/src/api/admin/erp/inventory/upload-image/route.ts` |
| **B3** | `discogs-import` description ohne Lock | 🟢 LOW | 20min | Matched Legacy-Release description kann zurückfallen auf MySQL-NULL | `backend/src/api/admin/discogs-import/commit/route.ts` |
| **R1** | `HARD_STAMMDATEN_FIELDS` vs `SYNC_PROTECTED_FIELDS` konsolidieren | 🟢 LOW | 30min | Prevention: verhindert zukünftige Drift | `release-audit.ts`, `release-locks.ts`, Aufrufer |
| **R2** | Auto-Lock nur auf tatsächlich geänderte Felder | 🟢 LOW | 40min | UX: weniger Noise im `locked_fields`-Array | `media/[id]/route.ts`, `media/bulk/route.ts` |
| **R3** | `unlock-field` TOCTOU-Check außerhalb Transaction | 🟢 LOW | 10min | Edge-Case: doppelter Audit-Entry bei Concurrent-Unlock | `media/[id]/unlock-field/route.ts` |

**Summe:** ~2h Code-Aufwand + ~30min Deploy-Workflow.

---

## Bugs (pre-existing — zu fixen)

### B1 — `ai-create-auction` nutzt `updated_at` statt `updatedAt`

**Severity:** 🔴 HIGH
**Symptom:** Beim Aufruf des AI-Create-Auction-Tools (Sonnet-SSE write-tool "reserve_release") crasht der Handler mit `column "updated_at" of relation "Release" does not exist`. Die KI-Tool-Response wird als Error returned, keine Release wird reserviert.

**Root Cause:** Release-Tabelle nutzt camelCase `updatedAt` (Legacy-Prisma-Convention), nicht snake_case wie Medusa-native Tabellen. Siehe [`CLAUDE.md`](../../CLAUDE.md) §Key Gotchas §DB. Gleiche Bug-Klasse wie:
- `payment-deadline.ts:90` (F.1 in TODO.md, noch nicht gefixt)
- Codex-Rescue-Fund in Phase 1 (rc50.0, `revertEntry`)

**Line:**
```typescript
// backend/src/api/admin/ai-create-auction/route.ts:247
await pg("Release")
  .where("id", item.release_id)
  .update({ auction_status: "reserved", updated_at: now })  // ❌ updated_at
```

**Fix:**
```typescript
await pg("Release")
  .where("id", item.release_id)
  .update({ auction_status: "reserved", updatedAt: now })   // ✅ updatedAt
```

**Gleichzeitig in diesem Rutsch:** F.1 (payment-deadline.ts:90) mitfixen, damit die Bug-Klasse global rausfällt.

**Verification:** Nach Deploy manuell `POST /admin/ai-create-auction` mit einem reserve_release-Tool-Call triggern, PM2-Logs prüfen (keine `42703`-Errors mehr).

**Rollback:** Revert des Commits. Beide `updated_at`-Werte waren vor rc51.1 da, also kein Daten-Rollback nötig.

---

### B2 — `upload-image` schreibt `coverImage` ohne Auto-Lock

**Severity:** 🟡 MEDIUM
**Symptom:** Admin lädt via ERP-Stocktake-UI ein Cover-Foto für ein Legacy-Release hoch → `Release.coverImage = <r2-url>`. Wenn MySQL-tape-mag für diese Release `coverImage = NULL` hat (was bei den ~4-7% nicht-covered Releases der Fall ist), überschreibt der nächste stündliche `legacy_sync_v2.py`-Run den Admin-Upload mit NULL.

**Root Cause:** `upload-image/route.ts` setzt `Release.coverImage` ohne `lockFields(pg, release_id, ["coverImage"])`. Pre-existing Pattern — vor rc51.0 hat der Sync ohnehin bedingungslos überschrieben, jetzt mit Sync-Lock-Mechanismus können wir das defensiv schützen.

**Lines:**
```typescript
// backend/src/api/admin/erp/inventory/upload-image/route.ts:80-87
if (!currentRelease?.coverImage) {
  await pg("Release")
    .where("id", body.release_id)
    .update({
      coverImage: publicUrl,
      updatedAt: new Date(),
    })
  // ❌ Kein lockFields-Call
}
```

**Fix:**
```typescript
if (!currentRelease?.coverImage) {
  await pg.transaction(async (trx) => {
    await trx("Release")
      .where("id", body.release_id)
      .update({
        coverImage: publicUrl,
        updatedAt: new Date(),
      })
    // ✅ Auto-Lock: verhindert sync-overwrite der Admin-Upload
    await lockFields(trx, body.release_id, ["coverImage"])
  })
}
```

Plus: `pushReleaseNow(pg, body.release_id).catch(log)` fire-and-forget nach der Transaction (weil coverImage Klasse-B-Mutation ist, sofortige Meili-Reindex).

**Edge Case:** Wenn Admin später einen Unlock-Button in der UI braucht, funktioniert das ohne weiteren Code — `POST /admin/media/:id/unlock-field {field: "coverImage"}` existiert seit rc51.0.

**Verification:**
1. Pre-Test: SQL → `SELECT locked_fields FROM "Release" WHERE id = 'legacy-release-<X>'` → `[]`
2. Upload-Image via Stocktake-UI
3. SQL → `locked_fields = ["coverImage"]`
4. Manueller Legacy-Sync-Run (`venv/bin/python3 legacy_sync_v2.py`)
5. SQL → `coverImage` hat noch R2-URL, nicht NULL

**Rollback:** Revert. Bestehende `locked_fields=["coverImage"]` von erfolgreichen Uploads bleiben liegen — das ist harmlos (Cover-Upload sollte sowieso permanent sein).

---

### B3 — `discogs-import` match-mode schreibt `description` ohne Lock

**Severity:** 🟢 LOW
**Symptom:** Admin startet Discogs-Import mit Match-Option. Eine ~41k-Legacy-Release wird via Barcode/CatalogNumber matched und bekommt Discogs-Description (wenn Release.description bisher NULL war, via `COALESCE(description, ?)`). Nächster Legacy-Sync-Run überschreibt zurück auf MySQL-NULL.

**Root Cause:** `commit/route.ts:612-627` UPDATE hat `description = COALESCE(description, ?)` — schreibt nur wenn NULL, aber lockt dann nicht. Sync-UPSERT ohne `description`-Lock überschreibt wieder.

**Abgrenzung zu B2:** Hier ist's nur `description` (weniger wichtig als Cover), und nur im spezifischen Match-Mode-Pfad. Kann später als Teil eines größeren Discogs-Import-Refactors gefixt werden. Aktuell minimaler Scope-Fix.

**Line:**
```typescript
// backend/src/api/admin/discogs-import/commit/route.ts:612-627 (match mode)
await trx.raw(
  `UPDATE "Release" SET
    discogs_id = ?,
    ...
    description = COALESCE(description, ?),
    ...
   WHERE id = ?`,
  [...]
)
// ❌ Wenn description gesetzt wurde (war NULL), kein lockFields-Call
```

**Fix:**
```typescript
const descriptionWasSet = currentRelease.description == null && incomingDescription != null
// ... UPDATE wie bisher ...
if (descriptionWasSet) {
  await lockFields(trx, releaseId, ["description"])
}
```

Subtlety: Wir müssen VOR dem UPDATE wissen ob `description` NULL war. Das erfordert einen zusätzlichen SELECT oder Verwendung von `UPDATE ... RETURNING`. Günstiger Weg: vorher `SELECT description` holen, dann UPDATE, dann lockFields.

**Verification:**
1. Pre-Test: Legacy-Release mit `description IS NULL` + Discogs-Match vorbereiten
2. Discogs-Import Commit
3. SQL → `description IS NOT NULL AND locked_fields @> '"description"'::jsonb`
4. Legacy-Sync-Run
5. SQL → description unverändert

**Rollback:** Revert. Keine Daten-Migration nötig.

---

## Recommendations (non-blocking)

### R1 — `HARD_STAMMDATEN_FIELDS` und `SYNC_PROTECTED_FIELDS` konsolidieren

**Problem:** Zwei Field-Listen-Konstanten die nicht exakt übereinstimmen:

| Konstante | Location | Wird genutzt für | Inhalt |
|-----------|----------|------------------|--------|
| `HARD_STAMMDATEN_FIELDS` | `release-audit.ts` | Audit-Log pro Release-Edit | 14 Felder — enthält `format`, nicht `barcode` |
| `SYNC_PROTECTED_FIELDS` | `release-locks.ts` | Auto-Lock + Sync-UPSERT-CASE-WHEN | 14 Felder — enthält `barcode`, nicht `format` |

**Drift-Konsequenzen:**
- `format` wird audited (HARD_STAMMDATEN) aber NICHT gelockt → wenn ein Admin `format` setzt (aktuell nur via API, UI hat keinen Input), überschreibt Sync es zurück. Pre-existing Silent-Bug.
- `barcode` wird gelockt (SYNC_PROTECTED) aber Sync schreibt `barcode` gar nicht → Lock auf barcode ist ein No-Op.

**Option A (bevorzugt):** Einzige Konstante, re-exportiert aus `release-locks.ts`:
```typescript
// release-locks.ts bleibt Source of Truth
export const SYNC_PROTECTED_FIELDS = [...]  // wie jetzt

// release-audit.ts importiert statt eigener Liste
import { SYNC_PROTECTED_FIELDS } from "./release-locks"
export const HARD_STAMMDATEN_FIELDS = SYNC_PROTECTED_FIELDS  // re-export für Compatibility
```

**Option B:** Zwei Listen behalten mit expliziter Doku warum sie sich unterscheiden. Schlechter — Drift-Risiko bleibt.

**Resolution vorschlag für `format` und `barcode`:**
- `format` aus allen Listen raus. Es ist Legacy-MySQL-owned und sollte nicht editierbar sein. UI hat keinen Input dafür. Aus `allowedReleaseFields` in `POST /admin/media/:id` entfernen.
- `barcode` bleibt in der unified Liste. Aktuell No-Op-Lock, aber wenn wir in Zukunft jemals barcode aus Discogs/MySQL syncen, ist der Lock schon da. Defensiv.

**Effort:** 30min (Code + Tests).

---

### R2 — Auto-Lock nur auf tatsächlich geänderte Felder

**Problem:** Frontend sendet bei "Save Stammdaten" ALLE 8 Felder (title, year, country, catalogNumber, barcode, description, artistId, labelId), auch wenn Frank nur `title` geändert hat. Backend's `getHardFieldsInBody(body)` returnt alle 8 → alle 8 werden ge-lockt.

**Konsequenz:**
- `Release.locked_fields` wächst auf `["title", "year", "country", "catalogNumber", "barcode", "description", "artistId", "labelId"]` nach einem einzigen Title-Fix
- SourceBadge zeigt "8 fields locked from sync" statt "1 field locked"
- Frank müsste 7 unlocks klicken um zurück zu Sync-Autorität zu kommen

**Das widerspricht dem Concept-Doc-Prinzip:**
> **Safe by default:** Auto-Lock beim **ersten Edit**. Frank muss nicht daran denken...

Der Fix geht in 2 Alternative-Richtungen:

**Option A (Backend-side — bevorzugt):** In der POST-Route `currentRelease` mit Body vergleichen, nur geänderte Felder locken. Konsistent mit Audit-Log-Pattern (der schon nur changed-Fields loggen könnte, tut's aktuell aber auch nicht).

```typescript
// backend/src/api/admin/media/[id]/route.ts (nach dem UPDATE, vor lockFields)
import { looseEqual } from "../../../../lib/release-audit"  // existing helper

const hardFieldsEdited = getHardFieldsInBody(body)
  .filter(f => !looseEqual(currentRelease[f], body[f]))    // ✅ nur changed
if (hardFieldsEdited.length > 0) {
  await lockFields(trx, id, hardFieldsEdited)
}
```

Gleicher Fix in `media/bulk/route.ts`: pro-Release-pro-Field vergleichen mit `oldValues`, nur geänderte locken. Dort ist das schon pre-fetched, trivial.

**Option B (Frontend-side):** Nur geänderte Felder in den Body schicken. Macht den Frontend-Code komplexer (shadow-state für original values). Nicht bevorzugt — Backend ist die richtige Ebene für diese Logik.

**Seiteneffekt:** Audit-Log wird auch sauberer. Aktuell loggt `STAMMDATEN_AUDIT_FIELDS` alle Fields im Body. Könnte analog gefiltert werden. Optional als Recommendation-Erweiterung.

**Effort:** 40min.

---

### R3 — `unlock-field` TOCTOU-Check außerhalb Transaction

**Problem:** In `media/[id]/unlock-field/route.ts`:
```typescript
// ZEILE 31-43 — außerhalb Transaction
const release = await pg("Release").where("id", id).select("id", "locked_fields").first()
if (!isFieldLocked(release, field)) {
  res.status(400).json({ error: "field_not_locked", ... })
  return
}

// ZEILE 48-64 — innerhalb Transaction
await pg.transaction(async (trx) => {
  await unlockField(trx, id, field)
  await trx("release_audit_log").insert({ action: "field_unlocked", ... })
})
```

**Race:** Zwei konkurrente Unlock-Requests für dasselbe Feld:
1. Request A: liest `locked_fields = ["title"]`, passes check
2. Request B: liest `locked_fields = ["title"]`, passes check
3. Request A: Transaction → removes "title" → audit entry #1 written
4. Request B: Transaction → removes "title" (jsonb_array filter idempotent, ist schon weg) → audit entry #2 written

**Konsequenz:** 2 `field_unlocked`-Audit-Entries für 1 logische Action. Minor Noise.

**Fix:** Check innerhalb Transaction mit `FOR UPDATE` auf die Row:
```typescript
const remainingLockedFields = await pg.transaction(async (trx) => {
  const release = await trx("Release")
    .where("id", id)
    .select("id", "locked_fields")
    .forUpdate()       // ✅ Serialisiert konkurrente Unlocks
    .first()
  if (!release) throw new ReleaseNotFoundError()
  if (!isFieldLocked(release, field)) throw new FieldNotLockedError()
  const remaining = await unlockField(trx, id, field)
  await trx("release_audit_log").insert({...})
  return remaining
})
```

Plus Custom-Error-Classes oder Sentinel-Return-Values für die HTTP-Status-Mapping (weil im Transaction-Callback keine `res.status()` geht).

**Effort:** 10min.

**Priorität:** Wirklich niedrig — Admin-UI öffnet den Unlock-Modal nur pro Field, Frank klickt einmal. Doppelklick → 2x `POST` → 1 echter Unlock + 1 "field_not_locked"-400. Current behavior ist schon halb-ok (zweite Request fail't in der UPDATE-Kondition weil `WHERE v != ?` nichts mehr entfernt).

Aktuell eher Code-Hygiene als Bugfix. Kann auch skipped werden, wenn Budget-knapp.

---

## Rollout-Strategie

### Variante A: Bundle-Release als rc51.1

Alles in einem Commit-Bundle. Passt gut weil:
- Keine DB-Migration
- Alle Fixes unabhängig voneinander
- Ein Deploy-Zyklus statt drei

**Deploy-Schritte:**
1. 6 Code-Änderungen (B1-B3 + R1-R3)
2. Lokaler `tsc --noEmit` Check
3. Commit + Push + VPS Build + Deploy (~5min)
4. Smoke-Test 3 Szenarien:
   - AI-Create-Auction Tool-Call (B1 Verification)
   - Upload-Image + manueller Sync-Run (B2 Verification)
   - Bulk-Edit mit teilweise unchanged values (R2 Verification)
5. CHANGELOG + Tag `v1.0.0-rc51.1`

**ETA:** 3h inkl. Verification.

### Variante B: Split in rc51.1 (Bugs) + rc51.2 (Recommendations)

Trennt Risiko. Bugs sind klarer Fix, Recommendations brauchen mehr Tests.

- **rc51.1 (heute Abend):** B1 + B2 + B3 — ~1h
- **rc51.2 (später):** R1 + R2 + R3 — ~1.5h

Mehr Deploy-Overhead, saubere Trennung.

### Empfehlung: **Variante A** (Bundle).

Alle Änderungen sind klein und niedrig-risiko. Ein einziger Deploy-Zyklus minimiert den Overhead. Falls im Smoke-Test etwas failt, können wir die Einzelkomponente reverten.

---

## Verification Matrix

| Fix | Pre-Test | Action | Expected Post-State |
|-----|----------|--------|---------------------|
| B1 | PM2-Error-Log clear | AI-Create-Auction-Tool: `reserve_release` für 1 release | Kein `42703`-Error · Release.auction_status = "reserved" |
| B2 | `SELECT locked_fields FROM "Release" WHERE id = <legacy-X>` → `[]` | Upload Cover via Stocktake-UI + manueller Sync-Run | `locked_fields = ["coverImage"]` · coverImage noch gesetzt |
| B3 | Match-Release vorbereiten mit `description IS NULL` | Discogs-Import Match + Commit + manueller Sync-Run | `description IS NOT NULL` · `locked_fields @> "description"` |
| R1 | — | `HARD_STAMMDATEN_FIELDS.length === SYNC_PROTECTED_FIELDS.length` | Assertion passed |
| R2 | Frank's Release mit `locked_fields = []` | Edit nur `title` via UI, Save | `locked_fields = ["title"]` (nicht 8 fields) |
| R3 | — | Rapid-Click "Unlock title" 2x im UI | 1x `field_unlocked`-Audit-Entry (nicht 2) |

---

## Rollback Plan

- **Code-Revert:** `git revert <rc51.1-commit>` + VPS-Deploy → alles wieder wie rc51.0.1
- **Daten-Rollback:** nicht nötig. Alle Fixes sind additiv in der Lock-Semantik.
  - B2 gefixte Uploads behalten `locked_fields = ["coverImage"]` — harmlos, Sync schreibt dann halt nichts, was eh gewünscht ist
  - B3 analog für `description`
  - R2 führt zu weniger gelockten Feldern — auch harmlos für bestehende Daten

---

## Out-of-Scope (für später)

Wurden beim Review auch erwähnt, aber nicht in rc51.1 Scope:

- **`refetch-discogs/route.ts` gap** (F.3 in TODO.md): kein pushReleaseNow, kein audit-log. Non-blocking weil Trigger A via `search_indexed_at` fängt.
- **Discogs-Import `coverImage`**-Path analog zu B2 (description) — aber aktuell nur für Releases geschrieben wo `"coverImage" IS NULL`, also weniger Konflikt-Fläche als B2.
- **Audit-Log-Filter auf changed-fields only** (analog R2): pre-existing seit rc50.0, nicht spezifisch rc51.0. Separates Refactor.
- **`format` aus UI entfernen:** R1 schlägt vor `format` aus `allowedReleaseFields` zu entfernen, aber die UI zeigt es auch nicht als Input. Nur API-kosmetisch.

---

**Author:** Robin Seckler via Opus 4.7 Review (2026-04-24)
