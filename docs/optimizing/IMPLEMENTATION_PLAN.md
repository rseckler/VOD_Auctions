# Implementation Plan — Catalog Stammdaten-Editierbarkeit

**Datum:** 2026-04-24
**Status:** Phase 0 complete (Konzept-Doc final)
**Koordinator:** Robin (model switches), Claude (implementation)
**Reference:** [`CATALOG_STAMMDATEN_EDITABILITY_KONZEPT.md`](CATALOG_STAMMDATEN_EDITABILITY_KONZEPT.md)

---

## Quick-Reference — Model-Switch-Übersicht

Printable table for quick lookups:

| Phase | Schritt | Modell | Befehl | Dauer |
|---|---|---|---|---|
| 0 | Konzept-Doc ✅ | Haiku 4.5 | `/model haiku` | ✅ Done |
| 1.1 | Migration-SQL Design | Opus 4.7 | `/model opus` | ~15 Min |
| 1.2-1.3 | Migration apply + Helper | Haiku 4.5 | `/model haiku` | ~20 Min |
| 1.4 | Audit-Helper Basis | Sonnet 4.6 | `/model sonnet` | ~30 Min |
| 1.5 | revertEntry Logic | Opus 4.7 | `/model opus` | ~25 Min |
| 1.6-1.9 | Routes (5x) | Sonnet 4.6 | `/model sonnet` | ~45 Min |
| 1.10 | Revert-Route | Opus 4.7 | `/model opus` | ~15 Min |
| 1.11 | Codex-Rescue Review | Opus 4.7 | (subagent) | ~20 Min |
| — | Phase 1 CHANGELOG + Tag | — | (subagent Haiku) | ~10 Min |
| **Subtotal Phase 1** | — | — | — | **~2.5 h** |
| 2.1-2.2 | Badge + Banner | Haiku 4.5 | `/model haiku` | ~15 Min |
| 2.3-2.4, 2.6 | Edit-Mode + Picker | Sonnet 4.6 | `/model sonnet` | ~40 Min |
| 2.5 | Validation-Rules | Haiku 4.5 | `/model haiku` | ~15 Min |
| — | Phase 2 CHANGELOG + Tag | — | (subagent Haiku) | ~10 Min |
| **Subtotal Phase 2** | — | — | — | **~1.5 h** |
| 3.1, 3.3-3.5 | History-Tab + Tracks-UI | Sonnet 4.6 | `/model sonnet` | ~35 Min |
| 3.2 | Revert-Confirm Modal | Opus 4.7 | `/model opus` | ~20 Min |
| — | Phase 3 CHANGELOG + Tag | — | (subagent Haiku) | ~10 Min |
| **Subtotal Phase 3** | — | — | — | **~1.25 h** |
| 4.1-4.2 | Bulk-Edit + Tests | Sonnet 4.6 | `/model sonnet` | ~25 Min |
| 4.4 | Final Review | Opus 4.7 | `/model opus` | ~20 Min |
| — | Phase 4 CHANGELOG + Tag | — | (subagent Haiku) | ~10 Min |
| **Subtotal Phase 4** | — | — | — | **~55 Min** |
| — | **TOTAL** | — | — | **~6 h** |

---

## Detaillierte Sequenz mit Switch-Anweisungen

### 🔁 SWITCH #1 — JETZT (Phase 0 — Konzept-Doc Update)

> **Tippe:** `/model haiku`

Ich update `CATALOG_STAMMDATEN_EDITABILITY_KONZEPT.md` mit:
- Antworten zu Q1-Q8 konsolidiert in Entscheidungs-Tabelle (§6)
- Zone-0-Einführung in Feld-Klassifikation (§3)
- Audit-Log-Sektion (§4)
- Abhängigkeiten um Atomicity + Revert-Race erweitert (§7)
- Referenz auf diesen Plan (§8)

**Meldung wenn fertig:** "Phase 0 done ✅ — bitte `/model opus`"

---

### 🔁 SWITCH #2 — vor Phase 1.1 (Migration-SQL designen)

> **Tippe:** `/model opus`

Ich entwerfe die Knex-Migration:
1. Backfill `UPDATE "Release" SET data_source='legacy' WHERE data_source IS NULL AND id LIKE 'legacy-%'` etc.
2. `ALTER TABLE "Release" ALTER COLUMN data_source SET NOT NULL`
3. `CREATE TABLE release_audit_log` mit Indexes
4. Idempotenz-Check (Backfill clauses sind safe bei Rerun)

**Output:** Finales SQL-Skript (du reviewst, ich apply nicht selbst)

**Meldung wenn fertig:** "Migration-SQL ready for review — bitte `/model haiku` zum Apply"

---

### 🔁 SWITCH #3 — vor Phase 1.2-1.3 (Migration apply + Helper)

> **Tippe:** `/model haiku`

1. Supabase MCP `apply_migration` — wendet SQL an
2. `backend/src/lib/release-source.ts` (~30 Zeilen):
   - `isStammdatenEditable(release)` — prüft Lock basierend auf data_source
   - `getLockedReason(release)` — Grund-String für UI
   - `EDITABLE_STAMMDATEN_SOURCES` Konstante

**Meldung wenn fertig:** "Helper + Migration done ✅ — bitte `/model sonnet`"

---

### 🔁 SWITCH #4 — vor Phase 1.4 (Audit-Helper Basis)

> **Tippe:** `/model sonnet`

`backend/src/lib/release-audit.ts` — einfachere Functions:
- `logEdit(pg, { releaseId, field, oldValue, newValue, actor })` — schreibt Audit-Row, one row per field
- `listForRelease(pg, releaseId, limit=50, offset=0)` — paginated list
- `logTrackChange(pg, { releaseId, action, trackPayload, actor })` — wrapper für track add/delete

**Meldung wenn fertig:** "Audit-Helper basis done — bitte `/model opus` für revertEntry"

---

### 🔁 SWITCH #5 — vor Phase 1.5 (revertEntry Logic)

> **Tippe:** `/model opus`

`backend/src/lib/release-audit.ts::revertEntry()` — critical logic:

```typescript
async function revertEntry(pg: Knex, { auditId, actor }) {
  return pg.transaction(async (trx) => {
    // 1. Lese Original-Entry
    const original = await trx('release_audit_log').where('id', auditId).first()
    if (!original) throw 404
    
    // 2. Lese aktuellen Release-Wert
    const current = await trx('Release').where('id', original.release_id).select(original.field_name).first()
    
    // 3. Conflict-Check: current[field] != original.new_value → 409
    if (JSON.stringify(current[original.field_name]) !== JSON.stringify(original.new_value)) {
      throw { status: 409, conflict: true, current: current[original.field_name] }
    }
    
    // 4. Lock-Check: Release.data_source='legacy' + Hard-Field → abort
    const release = await trx('Release').where('id', original.release_id).select('data_source').first()
    if (release.data_source === 'legacy' && HARD_STAMMDATEN.includes(original.field_name)) {
      throw { status: 403, reason: 'release_now_legacy' }
    }
    
    // 5. Revert Write + Audit Entries (atomar)
    await trx('Release').where('id', original.release_id).update({
      [original.field_name]: original.old_value,
      updated_at: trx.fn.now()
    })
    
    // Mark original as reverted
    await trx('release_audit_log').where('id', auditId).update({
      reverted_at: trx.fn.now(),
      reverted_by: `${actor.id}:${revertEntryAuditId}`
    })
    
    // Write revert-action Audit-Row
    const revertAuditId = generateEntityId()
    await trx('release_audit_log').insert({
      id: revertAuditId,
      release_id: original.release_id,
      field_name: original.field_name,
      old_value: original.new_value,
      new_value: original.old_value,
      action: 'revert',
      actor_id: actor.id,
      actor_email: actor.email,
      created_at: trx.fn.now(),
      parent_audit_id: auditId
    })
    
    // 6. pushReleaseNow
    return revertAuditId
  })
}
```

**Meldung wenn fertig:** "revertEntry logic done ✅ — bitte `/model sonnet` für Routes"

---

### 🔁 SWITCH #6 — vor Phase 1.6-1.9 (Routes)

> **Tippe:** `/model sonnet`

Fünf Route-Änderungen in `backend/src/api/admin/media/`:

1. **`GET [id]/route.ts`** — Response-Erweiterung um `meta: { is_stammdaten_editable, source, locked_reason }`
2. **`POST [id]/route.ts`** — Whitelist-Erweiterung + Guard + Audit-Log-Hook:
   - Zone-0 (id, article_number, data_source) → silent strip oder 400 (decide + test)
   - Zone-1 (title, year, format, ...) → nur wenn `is_stammdaten_editable=true`, sonst 403
   - Zone-2 (genres, barcode, ...) → immer offen
   - Zone-3 (shop_price, ...) → immer offen
   - Jede Änderung → `logEdit()` + `pushReleaseNow(pg, releaseId)`
3. **`POST [id]/tracks/route.ts`** (neu) — Create Track
4. **`PATCH [id]/tracks/[trackId]/route.ts`** (neu) — Update Track (no source lock per Q8)
5. **`DELETE [id]/tracks/[trackId]/route.ts`** (neu) — Delete Track
6. **`GET [id]/audit-log/route.ts`** (neu) — List with pagination

Pro Track-Change → `logTrackChange(pg, { releaseId: id, action: 'track_add'|'track_delete'|'track_edit', trackPayload, actor })`

**Meldung wenn fertig:** "Routes 1-6 done ✅ — bitte `/model opus` für Revert-Route"

---

### 🔁 SWITCH #7 — vor Phase 1.10 (Revert-Route)

> **Tippe:** `/model opus`

**`POST [id]/audit-log/[auditId]/revert/route.ts`** (neu):

```typescript
export async function POST(req, { params: { id, auditId } }) {
  try {
    const { actor_id, actor_email } = req.auth_context
    
    const pg = getDbConnection()
    const revertId = await revertEntry(pg, {
      auditId,
      actor: { id: actor_id, email: actor_email }
    })
    
    return Response.json({ success: true, audit_id: revertId })
  } catch (err) {
    if (err.status === 409) {
      return Response.json({
        error: 'conflict',
        current: err.current,
        message: 'Aktueller Wert hat sich geändert — Revert würde überschreiben'
      }, { status: 409 })
    }
    if (err.status === 403) {
      return Response.json({
        error: 'release_now_legacy',
        message: 'Release ist jetzt Legacy-Quelle — Hard-Field-Revert nicht möglich'
      }, { status: 403 })
    }
    throw err
  }
}
```

Nach erfolgreicher Transaktion ist Meili-Reindex bereits via `pushReleaseNow` im `revertEntry`-Helper gebunden.

**Meldung wenn fertig:** "Revert-Route done ✅ — jetzt Codex-Rescue Review"

---

### 🔁 Codex-Rescue Review (Phase 1.11)

> **Keine Switch nötig** — ich spawne Subagent

Ich invoke **Codex-Rescue-Subagent** mit Briefing:
- "Review Audit-Log + Revert-Logik auf Race-Conditions, Atomicity, Edge-Cases"
- Zeige: release-audit.ts::`revertEntry()`, route-handler
- Frage nach: Conflict-Detection ist sicher? Transaktion-Grenzen OK? Lock-Checks vollständig?

**Subagent liefert Summary + ggf. Fixes** → ich incorporate findings

**Meldung wenn done:** "Phase 1.11 Codex-Approved ✅"

---

### ⏸️ ZWISCHENSTOPP nach Phase 1

1. Acceptance-Test gegen real Discogs-Import + Legacy Release:
   - GET /admin/media/:id → meta-Block korrekt?
   - POST Zone-0-Feld → 400/silent strip?
   - POST Hard-Field auf Legacy → 403?
   - POST Audit-Log-Schreib → Rows in DB?
   - Revert mit aktuellen Wert → success 200?
   - Revert mit geändertem Wert → 409 Diff?
2. Commit Phase 1 PR mit Tag + CHANGELOG (Subagent Haiku macht die Schreibarbeit)
3. Robin reviews diffs + approves merge

**Meldung wenn ready Phase 2:** "Phase 1 merged ✅ — bitte `/model haiku` für Phase 2 Start"

---

### 🔁 SWITCH #8 — vor Phase 2.1-2.2 (Badge + Banner)

> **Tippe:** `/model haiku`

**`storefront/src/components/admin/release-detail/` — neue Komponenten:**

1. **`SourceBadge.tsx`** (20 Zeilen):
   - Granular badge: `legacy` (grau), `discogs_import` (gold), `manual_admin` (blau)
   - Tooltip mit Datum des Imports/Syncs
   - Import `meta` aus parent Release-Detail-Page

2. **`LockBanner.tsx`** (15 Zeilen):
   - Nur render wenn `is_stammdaten_editable=false`
   - Icon + Text + "Mehr erfahren" link zu Dokumentation

**Meldung wenn fertig:** "Badge + Banner done ✅ — bitte `/model sonnet` für Edit-Mode"

---

### 🔁 SWITCH #9 — vor Phase 2.3-2.4 + 2.6 (Edit-Mode + Picker)

> **Tippe:** `/model sonnet`

**`storefront/src/components/admin/release-detail/EditMode.tsx`** (großer Block):

1. **Edit-Mode-Toggle:**
   - Button "Stammdaten bearbeiten" (C.gold) oben rechts, disabled wenn `is_stammdaten_editable=false`
   - Click → setState({ editing: true })

2. **Conditional Rendering per Field:**
   - Wenn `editing=false` → display-only (wie heute)
   - Wenn `editing=true` → Input-Komponenten
     - `title`, `description` → textarea
     - `year` → number input, min=1900, max=2026
     - `format` → select-dropdown (Enum)
     - `country` → Country-ISO-Picker (existierende Komponente oder einfaches select)
     - `catalogNumber`, `barcode` → text input
     - `artistId`, `labelId` → Modal-Picker-Button (neuer Modal, siehe unten)
     - `coverImage` → existiender `/admin/erp/inventory/upload-image` UI

3. **Save-Bar** (sliding from bottom):
   - "Speichern" Button (C.gold)
   - "Abbrechen" Button (C.ghost)
   - Beide via React-Query mutation

4. **Optimistic Update + Validation:**
   - Before save: Client-side validation (year range, country format)
   - POST /admin/media/:id mit geänderten Feldern
   - Optimistic UI update (setQueryData)
   - On 403 → show error "Stammdaten-Lock", exit edit-mode
   - On 409 Conflict (shouldn't happen here, aber) → show alert
   - On 2xx → invalidate Release-Query → refetch

**`storefront/src/components/admin/release-detail/PickerModals.tsx`** (neu):

- **ArtistPickerModal:** Search-Input → GET /admin/artists/suggest → list → click = select
- **LabelPickerModal:** Search-Input → GET /admin/labels/suggest → list → click = select

**Meldung wenn fertig:** "Edit-Mode + Picker done ✅ — bitte `/model haiku` für Validation"

---

### 🔁 SWITCH #10 — vor Phase 2.5 (Validation-Rules)

> **Tippe:** `/model haiku`

**`storefront/src/lib/release-validation.ts`** (neu, ~40 Zeilen):

```typescript
export function validateReleaseStammdaten(release: Partial<Release>) {
  const errors: Record<string, string> = {}
  
  if (release.year !== undefined) {
    if (release.year < 1900 || release.year > new Date().getFullYear()) {
      errors.year = 'Jahr muss zwischen 1900 und ' + new Date().getFullYear() + ' liegen'
    }
  }
  
  if (release.country !== undefined && release.country) {
    if (!/^[A-Z]{2}$/.test(release.country)) {
      errors.country = 'Country muss ISO-2-Code sein (z.B. DE, SE, US)'
    }
  }
  
  if (release.format !== undefined && release.format) {
    const validFormats = ['Vinyl', 'CD', 'Cassette', 'Digital']
    if (!validFormats.includes(release.format)) {
      errors.format = 'Ungültiges Format'
    }
  }
  
  return { valid: Object.keys(errors).length === 0, errors }
}
```

**Einsatz in EditMode.tsx:**

```typescript
const handleSave = async () => {
  const { valid, errors } = validateReleaseStammdaten(editedValues)
  if (!valid) {
    // show inline errors
    return
  }
  // proceed with POST
}
```

**Meldung wenn fertig:** "Validation done ✅ — Phase 2 fertig. Bitte `/model opus` für Final-Review"

---

### ⏸️ ZWISCHENSTOPP nach Phase 2

1. Live-Test im Admin:
   - Öffne Discogs-Import-Release → Edit-Button enabled
   - Öffne Legacy-Release → Edit-Button disabled + Lock-Banner visible
   - Discogs-Release: edit title → optimistic update → save → pushReleaseNow läuft
   - Validation: year out-of-range → error shown
   - Artist-Picker: search + select → Release.artistId updated
2. Commit Phase 2 PR + Tag + CHANGELOG
3. Robin reviews

**Meldung wenn ready Phase 3:** "Phase 2 merged ✅ — bitte `/model sonnet` für History-Tab"

---

### 🔁 SWITCH #11 — vor Phase 3.1 + 3.3-3.5 (History-Tab + Tracks/Image-UI)

> **Tippe:** `/model sonnet`

**`storefront/src/components/admin/release-detail/HistoryTab.tsx`** (neu):

```
┌─ History ─────────────────────────────────────────────┐
│ ⏱ 2026-04-25 14:32  Frank · Edit                      │
│   year:    2003 → 2004                                │
│   country: Germany → Sweden                           │
│   [↩ Revert] (click → confirm modal)                  │
│ ──────────────────────────────────────────────────────│
│ ⏱ 2026-04-25 11:08  Frank · Track Add                 │
│   "B2 — Pain In Progress" (5:42)                      │
│   [↩ Revert]                                          │
│ ──────────────────────────────────────────────────────│
│ ⏱ 2026-04-23 09:15  Frank · Edit  ↶ reverted         │
│   shop_price: €25.00 → €30.00                         │
│ ──────────────────────────────────────────────────────│
│ Older ▸                                               │
└───────────────────────────────────────────────────────┘
```

- GET /admin/media/:id/audit-log → list (paginiert, 50/seite)
- Render pro action-type (edit, track_add, track_delete, image_add, image_delete, revert)
- Reverted-Einträge ausgegraut + marker
- Revert-Button → RevertConfirmModal (siehe Phase 3.2)

**Track/Image-Management UI:**

1. **TrackList.tsx** — In-place Edit-Mode (bei editing=true):
   - Tracks als Tabelle/Cards mit Edit/Delete Icons
   - Edit → Modal öffnet (TrackEditModal)
   - Delete → Confirm → Audit-Log schreibt, UI refetched

2. **TrackEditModal.tsx** (neu):
   - Fields: Side, Title, Duration (MM:SS)
   - Validation: Title required, Duration ISO 8601 oder MM:SS-Format
   - POST /admin/media/:id/tracks (add) oder PATCH /admin/media/:id/tracks/:id (edit)

3. **ImageUpload.tsx** (existierend, anpassen):
   - Guard: coverImage-Change nur wenn `is_stammdaten_editable=true`
   - Sonst hide upload für coverImage
   - Zusätzliche Images (Gallery) always offen

**Meldung wenn fertig:** "History-Tab + Tracks-UI done ✅ — bitte `/model opus` für Revert-Modal"

---

### 🔁 SWITCH #12 — vor Phase 3.2 (Revert-Confirm-Modal)

> **Tippe:** `/model opus`

**`storefront/src/components/admin/release-detail/RevertConfirmModal.tsx`** (neu, critical UX):

```typescript
// onRevert clicked from History-Tab
const handleRevert = async () => {
  try {
    const res = await fetch(`/admin/media/${releaseId}/audit-log/${auditId}/revert`, {
      method: 'POST'
    })
    
    if (res.status === 409) {
      const { current } = await res.json()
      // Show conflict modal
      return showConflictModal({
        message: 'Aktueller Wert ist jetzt: ' + JSON.stringify(current),
        action: 'Trotzdem überschreiben?',
        onConfirm: () => forceRevert() // Second POST mit override-flag
      })
    }
    
    if (res.status === 403) {
      // Release is now legacy
      showAlert('Diese Release ist jetzt aus Legacy-Sync — Revert nicht möglich')
      return
    }
    
    // 2xx → success, refetch Release + Audit-List
    invalidateQuery(['release', releaseId])
    invalidateQuery(['release-audit', releaseId])
  } catch (err) {
    showAlert('Revert fehlgeschlagen: ' + err.message)
  }
}
```

**Konflikt-Modal:**

- Zeige Diff: Field X, alter Wert (aus Audit), aktueller Wert, neuer Wert (nach Revert)
- "Abbrechen" / "Trotzdem überschreiben"
- Wenn Override: second POST mit `force=true` (oder separate endpoint `/revert-force`)

**Meldung wenn fertig:** "Revert-Modal done ✅ — Phase 3 fertig. Bitte `/model sonnet` für Phase 4"

---

### ⏸️ ZWISCHENSTOPP nach Phase 3

1. E2E-Test Revert-Flow:
   - Edit-Release title → speichern → History-Tab zeigt Edit-Eintrag
   - Revert-Button click → confirm → title reverted
   - History zeigt: Original-Edit (ausgegraut, ↶ reverted) + Revert-Entry
   - Conflict-Test: zwei parallel edits, Revert der ersten → 409 mit Diff
2. Commit Phase 3 PR + tag + CHANGELOG
3. Robin reviews

**Meldung wenn ready Phase 4:** "Phase 3 merged ✅ — bitte `/model sonnet` für Bulk-Edit"

---

### 🔁 SWITCH #13 — vor Phase 4.1-4.2 (Bulk-Edit + Tests)

> **Tippe:** `/model sonnet`

**Bulk-Edit in `/admin/media` (existierend, update):**

1. **Skip-Logic:**
   ```typescript
   // POST /admin/media/bulk
   const results = selectedReleases.map(release => {
     const { is_stammdaten_editable } = meta[release.id]
     
     if (wantToEdit.some(f => HARD_STAMMDATEN.includes(f)) && !is_stammdaten_editable) {
       return { release_id: release.id, status: 'skipped_legacy' }
     }
     
     // proceed with edit
     return { release_id: release.id, status: 'updated', fields: ... }
   })
   ```

2. **Summary-Toast:**
   > "X von Y aktualisiert · Z Legacy-Artikel übersprungen"

3. **Acceptance-Tests:**
   - Bulk-select: 10 Discogs + 5 Legacy
   - POST shop_price + sale_mode → 15 erfolg, 0 skip
   - POST title (Hard-Field) + shop_price → 10 erfolg (Discogs), 5 skip (Legacy)
   - Check Audit-Log für alle 10 erfolgreichen title-Edits existieren
   - Check Meili-Reindex für die 10 (pushReleaseNow in Bulk)

**Test-Skript:**

```bash
# Test Zone-0 Lock
curl -X POST https://admin.vod-auctions.com/api/admin/media/VOD-XXXXX \
  -H "Content-Type: application/json" \
  -d '{"article_number": "VOD-NEUER"}'
# Expected: 400 (oder silent strip)

# Test Legacy Hard-Field Lock
curl -X POST https://admin.vod-auctions.com/api/admin/media/legacy-release-123456 \
  -H "Content-Type: application/json" \
  -d '{"title": "Neue Title"}'
# Expected: 403 { error: 'stammdaten_locked' }

# Test Discogs Hard-Field Editable
curl -X POST https://admin.vod-auctions.com/api/admin/media/UUID-DISCOGS \
  -H "Content-Type: application/json" \
  -d '{"title": "Neue Title"}'
# Expected: 200, audit_log row created, pushReleaseNow triggered

# Test Revert 409
curl -X POST https://admin.vod-auctions.com/api/admin/media/UUID/audit-log/AUDIT-ID-1/revert
# Expected: 200
# Then edit again (field now has new value)
curl -X POST https://admin.vod-auctions.com/api/admin/media/UUID/audit-log/AUDIT-ID-1/revert
# Expected: 409 { conflict: true, current: <new_value> }
```

**Meldung wenn fertig:** "Bulk-Edit + Tests done ✅ — bitte `/model opus` für Final-Review"

---

### 🔁 SWITCH #14 — vor Phase 4.4 (Final Architecture Review)

> **Tippe:** `/model opus`

Ich scannen alle Phase-1-4 Files auf Konsistenz (Pricing-Cleanup-Lehre: ein Caller vergessen = Bug):

1. **Grep: `Release.title`/`Release.shop_price`-Setter überall**
   - Alle Setter via POST /admin/media/:id
   - Alle Setzer-Pfade mit Audit-Log + pushReleaseNow?
   - Keine direkten Knex().where().update() Backdoors?

2. **Zone-0 Enforcement:**
   - Kein POST-Handler erlaubt `id`, `article_number`, `data_source` Edit?
   - Test: curl mit article_number-Change → 400/silent?

3. **Audit-Log Atomicity:**
   - Alle logEdit()-Calls in Transaktion?
   - Knex.transaction() umhüllt Release-UPDATE + logEdit()?

4. **Revert Conflict-Detection:**
   - revertEntry() liest aktuellen Wert vor Write? ✓
   - 409-Response-Shape konsistent? ✓
   - Lock-Check auf Hard-Fields bei Legacy-Drift? ✓

5. **Meili-Integration:**
   - pushReleaseNow() nach jedem Edit/Revert? ✓
   - Darf nicht crashen sonst rollback? (catch + log, nicht throw)

**Output:** Go/No-Go für Phase-4 CHANGELOG + Release-Tag

**Meldung wenn green:** "Final Review ✅ — Phase 4 klar zum Merge"

---

### ⏸️ FINALE Akzeptanz nach Phase 4

1. Alle Tests pass
2. E2E-Flow: create Discogs-Release → edit title → revert → history tab zeigt beide
3. Legacy-Release: edit-button disabled, lock-banner visible
4. Bulk: 50/50 mix, Legacy skipped, Discogs updated
5. CHANGELOG + GitHub-Release-Tag gepost

**Status:** Feature vollständig shipped 🚀

---

## Checklisten pro Phase

### Phase 1 Acceptance Criteria

- [ ] Migration runs idempotent (run twice, no errors)
- [ ] `data_source` is NOT NULL everywhere
- [ ] `release-source.ts` exports `isStammdatenEditable()`
- [ ] `release-audit.ts` has `logEdit`, `listForRelease`, `revertEntry`
- [ ] GET /admin/media/:id returns `meta` block with `is_stammdaten_editable`
- [ ] POST /admin/media/:id with Zone-0 field → 400 or silent strip
- [ ] POST /admin/media/:id with Hard-Field on Legacy → 403
- [ ] POST /admin/media/:id with Hard-Field on Discogs → 200, audit row created, pushReleaseNow called
- [ ] POST /admin/media/:id/tracks, PATCH .../tracks/:id, DELETE .../tracks/:id all work
- [ ] GET /admin/media/:id/audit-log returns paginated list
- [ ] POST /admin/media/:id/audit-log/:auditId/revert returns 200 or 409
- [ ] Codex-Rescue approves Audit + Revert logic

### Phase 2 Acceptance Criteria

- [ ] Source-Badge rendered (granular: legacy / discogs_import / manual_admin)
- [ ] Lock-Banner shows on Legacy-Release
- [ ] Edit-Button "Stammdaten bearbeiten" appears and is functional
- [ ] In-place inputs render correctly
- [ ] Save-Bar slides in on edit-mode
- [ ] Optimistic update works
- [ ] Validation rules fire (year range, country ISO, format enum)
- [ ] Artist-/Label-Picker modals open and select items
- [ ] POST saves to DB with Audit-Log

### Phase 3 Acceptance Criteria

- [ ] History-Tab renders 50 audit entries
- [ ] Action-types display correctly (edit, track_add, revert, etc.)
- [ ] Reverted entries are grayed out with marker
- [ ] Revert-Button click shows confirm modal
- [ ] Revert 200 success → Release updated + History refetched
- [ ] Revert 409 conflict → shows diff, option to override
- [ ] Track-Add/Edit/Delete UI works
- [ ] Image-upload respects coverImage lock on Legacy

### Phase 4 Acceptance Criteria

- [ ] Bulk-edit skips Legacy when Hard-Fields selected
- [ ] Summary toast shows "X updated, Y skipped"
- [ ] All edits have Audit-Log rows
- [ ] No Release-Update happens without Audit-Log (grep verify)
- [ ] No pushReleaseNow forgot somewhere (grep verify)
- [ ] Final architecture review passed
- [ ] CHANGELOG + GitHub Release-Tag posted
- [ ] All tests pass

---

**Next:** Follow the sequential switches above. Robin starts with `/model haiku`.

