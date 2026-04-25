# VOD Auctions — Changelog

Vollständiger Entwicklungs-Changelog. Neue Einträge werden direkt hier ergänzt — nicht mehr in CLAUDE.md.

---

## Release Index

Jeder Git-Tag entspricht einem Snapshot des Gesamtsystems. Feature Flags zeigen welche Capabilities zum Release-Zeitpunkt auf Production **aktiv** waren (flag=true). Flags die noch auf `false` stehen sind zwar deployed aber noch nicht aktiviert — das ist beabsichtigt (vgl. `DEPLOYMENT_METHODOLOGY.md`).

| Version | Datum | Platform Mode | Feature Flags aktiv (prod) | Milestone / Inhalt |
|---------|-------|--------------|---------------------------|-------------------|
| **v1.0.0** | TBD | `live` | ERP: TBD | RSE-78: Erster öffentlicher Launch |
| **v1.0.0-rc51.8** | 2026-04-25 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Format + Descriptors editierbar im Admin Catalog Edit-Card.** Bug-Report Robin: nach rc51.7 (Format-V2 71-Wert-Whitelist + 22.6k Backfill) waren `Release.format_v2` und `Release.format_descriptors` im `/admin/media/:id` Edit-Stammdaten-Card nicht editierbar — Read-Mode zeigte korrekt `displayFormat()` (z.B. „2× Vinyl LP (Limited Edition, Picture Disc)"), aber im Edit-Mode fehlten die Inputs komplett. **Fix:** **(1) `format-mapping.ts`**: `FORMAT_DESCRIPTOR_VALUES` als exportierte readonly Tuple (32 Tags: Picture Disc, Reissue, Limited Edition, Stereo, Mono, Promo, Coloured, Gatefold, …), `FORMAT_GROUPS` (12 sections: Vinyl LP / Vinyl 7" / Vinyl 10" / Vinyl 12" Maxi / Sonderformate / Cassette / Reel / CD / Video / Digital / Literatur / Catch-all), `isValidDescriptor()` type guard. **(2) `release-locks.ts`**: `format_v2` zu `SYNC_PROTECTED_FIELDS` — granulare 71-Wert-Picker-Wahl wird beim nächsten Sync nicht mehr von `format_id`-Derivation überschrieben. **(3) `POST /admin/media/:id`**: `format_v2` + `format_descriptors` zu `allowedReleaseFields`, strict-Validation gegen Whitelists (400 bei invalid), User-explicit `format_v2` gewinnt über `format_id`-Derivation, `format_descriptors` zu `STAMMDATEN_AUDIT_FIELDS`. **(4) `PickerModals.tsx`**: `FormatPickerModal` neu — gruppiertes 2-Spalten-Grid pro Section, Live-Search über raw-value + display-string, current-value highlighted (gold border + subtle bg). `DescriptorPickerModal` neu — 2-Spalten Multi-Select mit ✓/○ Toggle + Save-Counter („Save (3)"). **(5) `media/[id]/page.tsx`**: `sdFormatV2` + `sdDescriptors` State, init aus `release.format_v2` + `release.format_descriptors`. Picker-Type erweitert um `"format" \| "descriptors"`. Zwei neue Felder im Edit-Card-Grid nach Description: Format-Picker (Button mit `displayFormat()` Label + Monospace-Suffix + ×-Clear) + Descriptors-Picker (Chip-Rendering der ausgewählten Tags + ×-Clear-All). Save-Payload: `format_v2: sdFormatV2 \|\| null, format_descriptors: sdDescriptors`. **(6) `legacy_sync_v2.py`**: `HARD_STAMMDATEN_FIELDS += "format_v2"`, beide UPSERT-Blöcke (Release + Literature) `format_v2 = CASE WHEN locked_fields @> '"format_id"' OR locked_fields @> '"format_v2"' THEN ... END`, WHERE-Klausel mit `AND NOT format_v2-lock` ergänzt — sonst würde Auto-Lock auf `format_v2` ignoriert und Sync würde Admin-Picker-Wahl überschreiben. **Smoke:** Frontend-Build 32s, Admin 301, API 401-without-auth ✓. |
| **v1.0.0-rc51.7** | 2026-04-25 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Format-V2: 71-Wert-Whitelist (`Vinyl-LP-5`, `Tape-26`, `CD-16`, …) + Backfill 52.788/52.788 Items + Schreib- und Lese-Pfade durchgängig (Sync, Discogs-Import, Admin-Edit-Card, Storefront-Detail+Listen, Inventory/Stocktake, POS, Print-Labels mit Compact-Display, Email, Meilisearch-Index).** |
| **v1.0.0-rc51.6** | 2026-04-25 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **`Release.article_number` Auto-Assign via `BEFORE INSERT`-Trigger + Backfill von 22.630 NULL-Rows.** Vorher wurde `article_number` nur durch das einmalige `scripts/generate_article_numbers.sql` (Cutover-Bulk) gesetzt — weder `legacy_sync_v2.py` noch `discogs-import/commit/route.ts` haben jemals eine Nummer vergeben. Konsequenz: jede neue Anlage (tape-mag NEW oder Discogs-Import) landete mit `article_number = NULL`. Pre-Migration-Stand: 52.788 Releases total, 30.158 mit Nummer (Cutover-Bestand), **22.630 NULL** (11.230 Discogs-Imports + 11.400 Legacy/Literatur die nach dem Cutover via Sync reingekommen sind). **Migration `2026-04-25_release_article_number_auto_assign.sql`:** (1) Sequence `release_article_number_seq` mit `setval(MAX(existing VOD-XXXXX))` → Startwert 30.158, keine Kollisionen. (2) PL/pgSQL-Funktion `assign_release_article_number()` setzt `NEW.article_number := 'VOD-' || LPAD(nextval(...)::TEXT, 5, '0')` nur wenn `IS NULL` (lässt explizite Werte unverändert). (3) `BEFORE INSERT TRIGGER trg_release_article_number` auf `Release` → greift automatisch in **alle** Insert-Pfade (`legacy_sync_v2.py`, `discogs-import/commit`, zukünftige manual-add-Endpoints) ohne Code-Touch. (4) Backfill via CTE `WITH to_fill AS (SELECT id, nextval(...) AS seq_val FROM "Release" WHERE article_number IS NULL ORDER BY "createdAt" ASC) UPDATE ...` — deterministisch, Sequence advanced in lockstep, alle 22.630 Rows backfilled von `VOD-30159` bis `VOD-52788`. (5) DO-Block-Verify wirft `EXCEPTION` bei restlichen NULL-Rows. **Smoke-Test:** Synthetic INSERT/ROLLBACK-Probe — Sequence advanced 52788 → 52789, beweist Trigger-Fire. Race-condition-frei (Sequence ist atomar), idempotent (gesamte Migration re-runnable). **Kein Code-Change nötig** — Trigger erschlägt alle Insert-Pfade automatisch. **Konzept-Doc-Anforderung erfüllt:** Zone-0 `article_number` "auto-vergeben bei Insert, danach immutable" via Sequence + bestehender Zone-0-LOCK aus rc51.x. Doku: [`STAMMDATEN_GAPS_FOLLOWUP.md`](../optimizing/STAMMDATEN_GAPS_FOLLOWUP.md) Gap 3. |
| **v1.0.0-rc51.5** | 2026-04-25 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **POS Cover-Image-URL-Fix + Storefront Hover-Zoom (Lupen-Funktion) entfernt.** **(1) POS Cover-Image (`backend/src/admin/routes/pos/page.tsx`):** Last-Scanned-Card und Cart-Mini-Cover zeigten broken-image-Placeholder. `Release.coverImage` ist im DB-Storage bereits voll-qualifizierte R2-CDN-URL (`https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/{standard,discogs}/...`), POS prependete aber hardcoded `https://bofblwqieuvmqybzxapx.supabase.co/storage/v1/object/public/images/` → resultierender Pfad doppelt-https und natürlich 404. Verifiziert via Supabase MCP gegen Legacy- und Discogs-Releases — alle coverImage-Werte sind voll-qualifizierte R2-URLs. Fix: `SUPABASE_URL`-Konstante entfernt, beide `<img>`-Stellen rendern `coverImage` direkt. Konsistent mit `/admin/erp/inventory` das schon immer `<img src={item.cover_image}>` direkt gerendert hat. **(2) Storefront Hover-Zoom (`storefront/src/components/ImageGallery.tsx`):** Catalog-Detail-Page (z.B. `/catalog/legacy-release-33263`) hatte beim Mouse-Over `transform: scale(2)` mit dynamic `transformOrigin` per mouse-position + `<ZoomIn>`-Icon-Overlay und `cursor-zoom-in`. User wollte einfache Klick-zur-Lightbox-Behavior (war ohnehin schon implementiert). Entfernt: `zoomActive`/`zoomOrigin` State, `mainImageRef`, `handleMouseMove`, `onMouseEnter/Leave/Move` props, transform-style, das `ZoomIn`-Icon-Overlay (mitsamt `group-hover:bg-black/20`-Backdrop), `cursor-zoom-in` → `cursor-pointer`. `ZoomIn`-Import aus lucide-react raus. `useState`/`useRef` für `isDesktop` bleibt (Mobile-Touch-Swipe-Gating). Lightbox-Trigger via onClick + Mobile-Touch-Swipe-Navigation funktional unverändert. |
| **v1.0.0-rc51.4** | 2026-04-25 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **POS + Inventur-Scanner: neues `000001VODe` Barcode-Format akzeptiert.** Bug-Report Frank: POS-Scan und Stocktake-Search verweigerten neue Exemplar-Barcodes (z.B. `000322VODe`) mit 400 "Invalid barcode format" bzw. fanden im Search-Endpoint nichts. Root-Cause: Beim rc37-Format-Wechsel (2026-04-22 von `VOD-XXXXXX` auf `000001VODe`) wurde der `barcode.startsWith("VOD-")`-Gate nur in der Inventur-Session-Page-Frontend umgestellt — POS-Backend, POS-Frontend-Buffer, Inventur-Scan-Endpoint und Inventur-Search-Fast-Path hatten den alten Prefix-Check noch. Fix: alle 5 Stellen akzeptieren beide Patterns (`/^\d+VODe$/i` ODER `/^VOD-\d+$/i`). **Files:** `backend/src/api/admin/pos/sessions/[id]/items/route.ts` (POST-Validation + Fehlermeldung), `backend/src/admin/routes/pos/page.tsx` (Scanner-Buffer-Enter-Trigger Z. 174 + Placeholder + Empty-State-Hint), `backend/src/api/admin/erp/inventory/scan/[barcode]/route.ts` (GET-Validation analog), `backend/src/api/admin/erp/inventory/search/route.ts` (Step 1a Fast-Path → Postgres-Path bei `\d+VODe` ODER `VOD-\d{6}` — Scanner-Input bleibt deterministic, kein Meili-Ranking), `backend/src/api/admin/erp/inventory/search/route-postgres-fallback.ts` (Step 1a Query analog erweitert; `WHERE UPPER(barcode) = UPPER(?)` ist case-insensitive). **Catalog-Search** (`/admin/media`) war nicht betroffen — Subquery via `UPPER(barcode) = UPPER(?)` ohne Format-Gate. **Smoke-Test:** API liefert 200, compiled JS enthält 3× `VODe` in der POS-Items-Route. |
| **v1.0.0-rc51.3** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Big Bundle Post-Opus-Review: 3 Bugs + 5 Recommendations.** (B1+F.1) `ai-create-auction/route.ts:247` und `payment-deadline.ts:90` nutzen jetzt `updatedAt` (camelCase) statt `updated_at` — beide Writer hätten at-runtime gecrashed. (B2) `upload-image/route.ts` wrapped den Release-UPDATE in eine Transaction + `lockFields(trx, id, ["coverImage"])` + `pushReleaseNow` — verhindert dass der nächste Legacy-Sync Admin-Uploads auf MySQL-NULL zurücksetzt. (B3) `discogs-import/commit` Match-Mode pre-checkt `description IS NULL` vor dem COALESCE-UPDATE, wenn Discogs-Description gesetzt wird → `lockFields(["description"])`. (R1) `HARD_STAMMDATEN_FIELDS` aus `release-audit.ts` ist jetzt re-export von `SYNC_PROTECTED_FIELDS` aus `release-locks.ts` (Drift verhindert), `format` aus `allowedReleaseFields` entfernt (Legacy-MySQL-owned, kein UI-Input), `STAMMDATEN_AUDIT_FIELDS` dedupliziert via `new Set()`. (R2) Auto-Lock in `POST /admin/media/:id` und `POST /admin/media/bulk` filtert jetzt via `looseEqual(currentRelease[f], body[f])` — nur tatsächlich geänderte Felder werden gelockt. Vorher wurden beim Save ALLE Body-Felder gelockt (auch unveränderte) → "8 fields locked" nach einem Title-Fix. Jetzt konsistent mit "beim ersten Edit"-Prinzip. (R3) `unlock-field/route.ts` TOCTOU: `isFieldLocked`-Check jetzt INNERHALB der Transaction mit `FOR UPDATE`-Lock auf die Release-Row — konkurrente Unlock-Requests serialisieren statt doppelte Audit-Einträge zu produzieren. Error-Mapping via Sentinel-Return-Objekt. (R4) Country-Feld Freitext → `CountryPickerModal` (249 ISO-3166-1 alpha-2 Länder mit Flag-Emoji + EN/DE-Aliases, client-side Search-Filter, keine API calls). Info-Card Country-Display mit `🇩🇪 Germany (DE)`-Format, non-ISO Legacy-Werte gelb markiert mit Warn-Border im Edit-Form. Canonical Dataset in `backend/src/admin/data/country-iso.ts` (249 Einträge). (R5) Barcode-Validation: nur digits-only → jetzt strict **UPC-A (12) / EAN-13 (13) / EAN-8 (8)** + **GTIN-Checksum** (Rightmost-odd ×3, mod 10). Frontend-Input `inputMode="numeric"` + digit-only-filter + Hint-Text unterm Input. Kein Regressions-Risiko (alle 52.783 Barcodes in DB sind NULL). Plan: [`RC51_1_FOLLOWUP_PLAN.md`](../optimizing/RC51_1_FOLLOWUP_PLAN.md). |
| **v1.0.0-rc51.2** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Bug-Fix: `last_order` Health-Probe — DB-seitiger Statement-Timeout + korrekte Table-Quote.** Alert: `last_order probe failed: timeout after 30000ms`. Root-Cause: `SELECT MAX(created_at) FROM transaction` hing bei Lock-Contention (z.B. laufender Checkout hält Row-Locks auf der `transaction`-Tabelle). Die DB-Query blockierte bis zum JS-seitigen 30s-`Promise.race()`-Timeout — die DB-Query lief weiter. Fix: Query läuft jetzt via `pg.transaction()` mit `SET LOCAL statement_timeout = 8000` — Postgres bricht nach 8s selbst ab, unabhängig von JS-Timeout oder Connection-Pool-Zustand. Außerdem `"transaction"` gequotet (reserviertes Keyword in PostgreSQL). |
| **v1.0.0-rc51.1** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Bug-Fix: Tracklist auf Storefront + Numerische ID-Suche im Admin.** **(1) Tracklist fehlte auf Storefront für Discogs-Releases:** `/store/catalog/:id` fragt jetzt die `Track`-Tabelle (rc50.0 Track Management) ab und liefert `tracks[]` im Response. Das Storefront (Catalog-Detail-Page) bevorzugt `release.tracks` mit höchster Priorität — fällt für Legacy-Releases auf `extractTracklistFromText(credits)` → `parseUnstructuredTracklist(tracklist)` zurück. Kein Breaking-Change für Legacy-Releases. `CatalogRelease`-Typ um optionales `tracks?`-Feld erweitert. **(2) Suche nach numerischer Release-ID (z.B. "45544") im Admin fand nichts:** Die Release-ID `discogs-release-45544` ist weder in Meilisearch searchable attributes noch in `Release.search_text` enthalten. Fix in zwei Teilen: (a) Admin-Media-Route erkennt reine Zahlen-Queries (`/^\d+$/`) und erzwingt Postgres-Fallback — analog zum bestehenden Label-Filter-Fallback. (b) Postgres-Fallback fügt `OR "Release".id LIKE '%-45544'` als zusätzliche Bedingung hinzu — matcht alle ID-Präfixe (`discogs-release-`, `legacy-release-`, `legacy-band_literature-` etc.) über einen einfachen Suffix-LIKE auf dem PK (52k Rows, akzeptable Performance für Admin-Operation). FTS-Pfad für gemischte Queries (Wörter + Zahlen) bleibt unverändert. |
| **v1.0.0-rc51.0** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Sync-Lock-Modell: Legacy tape-mag Releases vollständig editierbar mit per-Field Sync-Protection.** Alle ~41k Legacy-Releases können jetzt Zone-1-Stammdaten editieren (title/year/country/catalogNumber/barcode/description/artistId/labelId/coverImage/format_id/legacy_*). **Kern-Mechanismus:** `Release.locked_fields jsonb NOT NULL DEFAULT '[]'` — jedes editierte Hard-Field wird automatisch per idempotenter `jsonb_agg(DISTINCT)`-Merge gesperrt. Der stündliche `legacy_sync_v2.py` UPSERT nutzt `CASE WHEN locked_fields @> '"field"'::jsonb THEN Release.field ELSE EXCLUDED.field END` pro Field — gelockte Felder werden übersprungen ohne den UPDATE-Branch zu triggern (kein Trigger-Fire, kein Meili-Cascade, rc49.4-Performance 47s erhalten). **DB-Migration:** `ALTER TABLE "Release" ADD COLUMN locked_fields jsonb NOT NULL DEFAULT '[]'` + GIN-Index (`jsonb_path_ops`), `sync_change_log.change_type` CHECK +`sync_skipped_locked`, `release_audit_log.action` CHECK +`field_unlocked`. **Neuer Helper `backend/src/lib/release-locks.ts`:** `SYNC_PROTECTED_FIELDS` (14 Felder), `lockFields()` (idempotent, batched), `unlockField()`, `isFieldLocked()`, `getHardFieldsInBody()`. **Backend-Änderungen:** POST `/admin/media/:id` — 403-Guard entfernt, alle Releases Zone-1-editable, Auto-Lock nach UPDATE via `lockFields(trx, id, hardFieldsEdited)`. POST `/admin/media/bulk` — Skip-Logic entfernt, batched Auto-Lock (`UPDATE ... SET locked_fields = jsonb_agg(DISTINCT ...)`). `POST /admin/media/:id/unlock-field` (NEU) — entfernt Field aus `locked_fields`, schreibt `action='field_unlocked'` in Audit-Log, pushReleaseNow. `backend/src/lib/release-source.ts::isStammdatenEditable()` → immer `true`. **Python `legacy_sync_v2.py`:** `HARD_STAMMDATEN_FIELDS` Set gespiegelt, Release- + Literature-UPSERT per-Field CASE-WHEN + lock-aware WHERE-Gate, `locked_fields`-Pre-Fetch pro Batch, `sync_skipped_locked` Entries für Observability. **Frontend:** `SourceBadge` zeigt "N fields locked from sync" + Tooltip mit Feldnamen, `LockBanner` entfernt (alle Releases editierbar), Edit-Stammdaten-Button immer aktiv, per-Field 🔒-Icon neben gelockte Feldbezeichner klickbar → Unlock Confirm-Modal ("nächster Sync überschreibt dieses Feld — fortfahren?"). **Smoke-Test:** Admin 301, API 200, `/admin/media/:id/unlock-field` 401 ✓. **Boot:** 3032ms. Deploy: 11.21s Backend (pre-existing TS-Errors), 32.17s Frontend. |
| **v1.0.0-rc50.4** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Catalog Stammdaten Phase 4 — Bulk-Edit Skip-Logic + Summary-Toast (Switch #13, Sonnet 4.6; Switch #14 Opus-Review GREEN).** `POST /admin/media/bulk` akzeptiert ab jetzt auch Zone-1 Hard-Stammdaten (`title`, `year`, `country`, `catalogNumber`, `description`) neben den bestehenden Zone-2/3 Feldern (estimated_value, media_condition, sleeve_condition, auction_status). **Skip-Logic:** sobald irgendein Hard-Field im Update-Body liegt, lädt die Route `data_source` für alle IDs und splittet via `isStammdatenEditable()` in editable (discogs_import) vs skipped (legacy-* IDs + data_source='legacy'). Editable → UPDATE, skipped → noop. **Audit-Integration:** innerhalb einer Knex-Transaktion werden vor dem UPDATE die alten Werte für alle editablen Releases gelesen, dann via batched-INSERT eine `release_audit_log`-Zeile pro Release × pro Field geschrieben — Shape identisch zu `logEdit()` (id/release_id/field_name/JSON.stringify-values/action='edit'/actor_*). AuditHistory-Tab aus rc50.2/rc50.3 rendert Bulk-Rows daher ohne Änderung; RevertConfirmModal `unwrapAuditValue()` entpackt die double-encoded values korrekt. **Shared Validation:** `validateReleaseStammdaten()` aus `backend/src/lib/release-validation.ts` wird im Bulk-Pfad vor dem DB-Write aufgerufen — selbe FE+BE Single-Source-of-Truth wie im Individual-Route (rc50.1.1). **Zone-0 Safety:** id/article_number/data_source durch Allowlist-Pattern silently gestrippt (nie im Bulk-allowedFields). **Meili:** fire-and-forget `pushReleaseNow(pg, releaseId).catch(log)` für jeden editablen Release nach der Transaktion — nicht in tx, damit Meili-Downtime keinen Rollback auslöst. **Response:** `{ updated_count, skipped_count }` (skipped_count=0 bei reinem Zone-2/3-Bulk). **Frontend:** neue `<optgroup label="Stammdaten (skips legacy)">` im Bulk-Action-Dropdown der Media-List mit 4 Optionen (Set Title / Country-ISO-2 / Year / Catalog Number) plus Input-Rendering (text / 2-char uppercase / year-number / text). Generic `alert()` im Success/Error-Pfad durch `Toast`-Komponente aus `admin-ui.tsx` ersetzt: Success-Message baut `skipMsg = data.skipped_count > 0 ? \` · X legacy items skipped\` : ""` an. **Final Architecture Review (Switch #14, Opus 4.7):** 5 Release-Writer auditiert (media/[id] ✅, media/bulk ✅, refetch-discogs ⚠ pre-existing gap, erp verify/add-copy ✅ via erp_inventory_movement) — alle Phase-1-4-Pfade haben Audit + pushReleaseNow + Transaction + Zone-0-Enforcement. Keine Backdoors. Revert-Logik (FOR-UPDATE Locks, looseEqual für DECIMAL-Roundtrip, 409-Shape, Ownership-Check) konsistent mit RevertConfirmModal. GO/NO-GO: **GREEN**. |
| **v1.0.0-rc50.3** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Catalog Stammdaten Phase 3.2 — RevertConfirmModal mit 409-Conflict-Diff (Switch #12, Opus 4.7).** **`RevertConfirmModal.tsx`** (220 Zeilen) ersetzt den Inline-Confirm aus rc50.2 durch einen vollwertigen Modal mit 4 distinct Views: **(1) `confirm`** zeigt vor dem Revert: Field-Name, "Set by this edit" (audit `new_value`, rot), "Will restore to" (audit `old_value`, grün, highlighted), Original-Edit-Datum + Actor. Wording bewusst neutral ("Set by this edit", nicht "Current value") weil zwischen Audit-Eintrag und Modal-Open das Feld geändert worden sein könnte. **(2) `conflict`** nach 409-Response: Warnung-Banner + 3-Reihen-Diff (`Value when edited` / `Current value` highlighted in warning / `Would revert to`). "Force Revert" Button POSTet mit `force: true` (Backend supportet das bereits). **(3) `locked`** für 403/400: zeigt Backend-Reason ("release_now_legacy" → custom Erklärung "next sync would overwrite anyway"). **(4) `gone`** für 410: "Already Reverted". **`AuditHistory.tsx`** umgebaut: alle Inline-Confirm-States (confirmId, revertingId, revertError, handleRevert) raus, durch `revertModalEntry` ersetzt. Internal-Refresh-Counter wird via `onReverted` callback gebumpt. **Backend unverändert** — `force` flag, `current_value`/`expected_value`/`target_value` im 409-Response, FOR-UPDATE-Locks und Lock-Check-vor-Conflict-Check sind alle schon Phase 1 (rc50.0). `unwrapAuditValue()` Helper handelt double-JSON-encoded audit values korrekt (audit speichert via JSON.stringify, response liest String zurück, Client muss nochmal parsen). Phase 4 (Bulk-Edit) folgt mit Switch #13 Sonnet. |
| **v1.0.0-rc50.2** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Catalog Stammdaten-Editierbarkeit Phase 3 — History-Tab + Track-Management (Switch #11, Sonnet 4.6).** **`AuditHistory.tsx`** (130 Zeilen): Fetch GET `/admin/media/:id/audit-log`, rendert Einträge chronologisch absteigend. Action-Badges (Edit/Revert/Track+/Track×/Track Edit in korrekten Farben aus `BADGE_VARIANTS`). Edit-Entries: Feld + `old → new` mit Strikethrough für alten Wert. Track-Entries: Track-Label aus parsed JSON-Payload. Reverted-Entries: ausgegraut (opacity 0.5) + "↶ reverted" Neutral-Badge. Revert-Button mit Inline-Confirm-State (ohne extra Modal — Phase 3.2 Opus kann dies zur vollen RevertConfirmModal ausbauen). 409-Conflict wird als Fehlermeldung angezeigt. `refreshKey` Prop für externe Refresh-Trigger. Load-More Pagination (50/Seite). **`TrackManagement.tsx`** (180 Zeilen): Fetch GET `/admin/media/:id/tracks`, separate Track-DB-Tabelle (unabhängig von `Release.tracklist` read-only Parse). Table mit Position/Title/Duration + Edit/Delete Icons. Inline-Delete-Confirm. TrackForm in `Modal` (admin-ui) mit Pos/Title/Duration, Duration-Regex-Validation (MM:SS). POST add / PATCH edit / DELETE. `onTrackChange` Callback → bumpt `auditRefreshKey`. **page.tsx Integration:** 2 neue Imports + `auditRefreshKey`-State + Bump nach Stammdaten-Save und Track-Change. "Track Management" Card nach NotesAndTracklist. "Edit History" Card vor Lightbox. NotesAndTracklist bleibt als read-only Legacy-Parse-View erhalten. Phase 3.2 (Revert-Confirm-Modal, Opus) + Phase 4 (Bulk-Edit) folgen. Plan: `IMPLEMENTATION_PLAN.md` Switch #11 abgeschlossen. |
| **v1.0.0-rc50.1.1** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Stammdaten Phase 2 — 4 Bugs gefixt nach Opus-Code-Review.** (B1) Validation-Library war Dead-Code: nun beidseitig wired. Backend POST `/admin/media/:id` validiert via `validateReleaseStammdaten()` und returnt 400 mit `errors`-Map; Frontend-Handler ersetzt inline-Checks durch denselben Library-Call. Library erweitert um Title-Required (mit `.trim()`), Length-Limits (Title 500, Description 10000, CatalogNumber 100), `parseInt(year, 10)` mit Radix. Barcode-digits-only-Check ist jetzt erstmals enforced. (B2) **`SourceBadge` legacy-Variante hatte invalides CSS:** `C.muted` ist `var(--vod-muted)` — Concat `"var(--vod-muted)15"` wird vom Browser silently gedroppt → kein Background, kein Border. Fix: Hex-Literal `#78716c` (Wert von `--vod-muted` in beiden Light/Dark) für legacy + fallback. CLAUDE.md-Warnung beachtet. (B3) **POST-Response ohne JOINs verlor `artist_name`/`label_name`:** GET joined Artist+Label, POST machte nur `Release.where(...).first()` → nach Save zeigte UI "—" bis Reload. Phase 2 erstmals sichtbar weil Artist/Label jetzt änderbar. Fix: dieselben LEFT JOINs (Artist/Label/Format/PressOrga) im POST-Response-Query wie im GET. (B4) `LockBanner` "Learn more →" Link `/docs/catalog-stammdaten-editability` war 404 — entfernt + Reason-Text auf `T.small` (vorher `T.micro` = uppercase, unleserlich für Multi-Wort-Reasons). Pre-existing Tracklist-Type-Mismatch in page.tsx:1653 unverändert (kein Phase-2-Issue). |
| **v1.0.0-rc50.1** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Catalog Stammdaten-Editierbarkeit Phase 2 — Frontend UI + Validation.** Kompletter Frontend-Edit-Modus für Stammdaten (title, artist, label, year, country, catalogNumber, barcode, description). **UI:** 3 neue Admin-Komponenten (`SourceBadge` 20 Zeilen, `LockBanner` 15 Zeilen, `PickerModals` 137 Zeilen — generisch wiederverwendbar). **Edit Card** im Media-Detail mit 8 Input-Felder (Text-Inputs + 2 Entity-Picker-Modals für Artist/Label mit Live-Search-Debounce 200ms). **Validation-Library** `backend/src/lib/release-validation.ts` (35 Zeilen) — year-range (1900-aktuelles Jahr), country (2-letter ISO-Code via Regex), barcode (digits-only). **Backend Routes:** GET `/admin/artists/suggest?q=<term>&limit=20` (Artist-Picker-Fallback, trgm-Ranking ähnlich `/store/labels/suggest`), GET `/admin/labels/suggest?q=<term>&limit=20` (Label-Picker-Fallback). **Integration:** Edit-Card nur bei `is_stammdaten_editable=true` (Guard via Zone-1-Lock aus rc50.0), Validation inline + API-Error-Handling (403 Locked-Response renders mit Fehlermeldung statt Toast), Optimistic-UI-Pattern etabliert. **SourceBadge** zeigt data_source + sync-date als Tooltip — Marketing-Feature (Customer weiß welche Daten von Discogs vs. Manual vs. Legacy stammen). **LockBanner** red warning wenn Release locked ist. Plan: `docs/optimizing/IMPLEMENTATION_PLAN.md` Switch #8-#10 (Phase 2.3-2.5) erfolgreich abgeschlossen. Phase 3 (History-Tab + Tracks-UI) folgt nach Checkpoint-Testing. |
| **v1.0.0-rc50.0** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Catalog Stammdaten-Editierbarkeit Phase 1 — Backend Foundation.** Stammdaten-Editing für Discogs-Import-Releases (~11k) während Legacy-Releases (~41k) read-only bleiben. **4-Zonen-Modell:** Zone 0 (id, article_number, data_source — immer locked, silent strip), Zone 1 (title/year/format/country/artistId/labelId/coverImage etc. — locked auf Legacy via 403, editable auf Discogs-Import), Zone 2 (genres/styles/barcode/credits/Tracks/Images — immer offen), Zone 3 (Commerce — wie bisher). **Migration:** `data_source` Backfill (legacy: 41553, discogs_import: 11230) + NOT NULL + neue `release_audit_log`-Tabelle (jsonb old/new_value, action enum mit CHECK constraint, self-FK für parent_audit_id + reverted_by mit ON DELETE SET NULL, revert-consistency CHECK). **Helpers:** `backend/src/lib/release-source.ts` (`isStammdatenEditable`, `getLockedReason`), `backend/src/lib/release-audit.ts` (`logEdit`, `listForRelease`, `logTrackChange`, `revertEntry` mit Knex-Transaktion + `forUpdate()`-Lock auf Original-Audit + Release-Row, `looseEqual` für DECIMAL-roundtrip, `RevertError` class mit 5 codes: NOT_FOUND/NOT_SUPPORTED/GONE/LOCKED/CONFLICT). **Routes (8):** GET/POST `/admin/media/:id` erweitert um `meta.is_stammdaten_editable` + Zone-1-Guard + Audit-Log-Hook in Transaction; neu GET/POST `/admin/media/:id/tracks`, PATCH/DELETE `/admin/media/:id/tracks/:trackId`, GET `/admin/media/:id/audit-log`, POST `/admin/media/:id/audit-log/:auditId/revert` mit force-Override + audit-release-mismatch Defense-in-Depth. **Codex-Rescue Review hat 2 ernste Bugs gefunden + gefixt:** (1) `updated_at` vs `updatedAt` Mismatch (Release nutzt camelCase, hätte at-runtime gecrashed), (2) Lost-Update-Race auf Release-Row (concurrent edit zwischen Conflict-Check und UPDATE → silent overwrite). Beide via `forUpdate()`-Lock + `updatedAt`-Korrektur behoben. **pushReleaseNow** in jeder Klasse-B-Mutation (Edit/Track-Add/Edit/Delete/Revert) — sofortige Meili-Reindex. Phase 2-4 (Frontend Edit-Mode, History-Tab, Revert-UI, Bulk-Skip) folgen separat. Doku: [`CATALOG_STAMMDATEN_EDITABILITY_KONZEPT.md`](../optimizing/CATALOG_STAMMDATEN_EDITABILITY_KONZEPT.md), [`IMPLEMENTATION_PLAN.md`](../optimizing/IMPLEMENTATION_PLAN.md). |
| **v1.0.0-rc49.9** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Health-Probe Timezone-Bug-Fix (`sync_log_freshness`).** UI zeigte "last run 129min ago" für einen Run der 12min alt war. Root-Cause: `sync_log.ended_at` ist `TIMESTAMP WITHOUT TIME ZONE`, VPS-TZ ist CEST (UTC+2), node-postgres parsed naive Timestamps als lokale Zeit → JS Date war 2h in der Vergangenheit → Schwellen-Check `age > 60min → warning` fälschlich triggered. Fix: `EXTRACT(EPOCH FROM (NOW() - ended_at))::int AS age_sec` — Postgres macht Zeit-Arithmetik, JS liest nur Integer. Affected columns `sync_log.ended_at/started_at` sind die einzigen naive-timestamp-Felder in Health-Check-relevanten Tabellen (geprüft: `meilisearch_drift_log.timestamp` + `health_check_log` sind TIMESTAMPTZ). Live-verifiziert: `sync_log_freshness: ok — last run 15min ago · validation: ok`. Alle 7 geprüften Services jetzt grün (postgresql/vps/storefront/meilisearch/meili_backlog/meili_drift/sync_log_freshness). |
| **v1.0.0-rc49.8** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Sync-Validation post-rc49.4 gefixt — V4 gedroppt + V5 auf `change_type='updated'` gefiltert.** Der 08:00 UTC Legacy-Sync-Run (erste Stunde mit rc49.4 live) markierte `validation_failed` mit zwei False-Positives. (1) **V4_sync_freshness** prüfte per-row `legacy_last_synced < 2h`. Nach rc49.4 WHERE-gated UPSERT wird dieser Timestamp nur bei echten Diffs geschrieben — 22504 Rows ohne Diff behalten korrekt ihren alten Wert. Check semantisch obsolet → V4 entfernt, Freshness-Monitoring via `sync_log_freshness` Health-Probe (liest `sync_log.ended_at`). (2) **V5_price_locked_integrity** matched `LIKE '%legacy_price%'` gegen alle `sync_change_log`-Entries — auch INSERT-Snapshots, wo der full new_values-Dict mit `legacy_price` als KEY gedumpt wird. 2 geflaggte Rows (`legacy-release-33982/33983`) waren neue tape-mag-Inserts vom 06:00 Run wo Frank danach add-copy+price_locked=true gesetzt hatte. Fix: `AND change_type = 'updated'` — echte Violations haben immer `{"old":..., "new":...}`-Shape. Live-verifizierter Manual-Run: validation_status=ok, rows_changed=1, duration 55s. |
| **v1.0.0-rc49.7** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Fix: `legacy_available` aus `is_purchasable`-Gate raus (36 Releases wieder kaufbar).** Bug-Report `discogs-release-28367`: verifiziert + `shop_price=19` + `price_locked=true`, aber Storefront zeigte kein Preis/Add-to-Cart. Root-Cause: `is_purchasable`-Gate hatte redundante UND-Bedingung `legacy_available !== false`. Items die auf tape-mag historisch schonmal verkauft wurden (MySQL `frei>1` Unix-TS → `legacy_available=false`) wurden dadurch als nicht-kaufbar markiert — trotz aktuellem VOD-ERP-Bestand. Fix drop `legacy_available` aus allen 5 is_purchasable-Evaluations: `backend/src/lib/shop-price.ts` (+ Type-Generic), `scripts/meilisearch_sync.py::transform_to_doc`, `backend/src/api/store/catalog/route-postgres-fallback.ts` (SQL-Filter + inline-Calc), `backend/src/api/store/catalog/[id]/route.ts`, `backend/src/api/store/account/recommendations/route.ts` (der rc49.6 gerade hinzugefügte Filter wieder raus). Meili-Full-Rebuild + Staging-Swap — 52.783 docs × 2 Profiles. Frank's `price_locked=true` ist ab jetzt alleinige Shop-Visibility-Authority (PRICING_MODEL.md §Shop-Visibility-Gate-konform). Doc-Update: §Shop-Visibility-Gate + §Meilisearch-Integration (Kommentar `has_price` statt `has_price + legacy_available`). Live-verifiziert: Meili-Doc + Storefront-API liefern jetzt `is_purchasable: true` für den Bug-Report-Release. |
| **v1.0.0-rc49.6** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Storefront Pricing Cleanup — `effective_price` end-to-end, `legacy_price` raus.** Folgt `PRICING_MODEL.md` rc47.2-Prinzip (Storefront zeigt nur `effective_price = shop_price`, nie Fallback auf `legacy_price`). **Backend:** `/store/account/saved` via `enrichWithShopPrice()` enriched (+`legacy_available` im SELECT, `legacy_price` raus); `/store/account/recommendations` Filter `legacy_price > 0` ersetzt durch `shop_price > 0 AND EXISTS(verified erp_inventory_item) AND legacy_available=true` (identisch zu Meili `is_purchasable`), Response-Feld `legacy_price → effective_price`. **Storefront:** `account/saved/page.tsx` nutzt `item.effective_price`, Add-to-Cart-Button nur bei `is_purchasable && sale_mode !== 'auction_only'`. `account/wins/page.tsx` Recommendation-Card rendert `rec.effective_price`. `auctions/[slug]/[itemId]/page.tsx` "Catalog Price"-Row aus Details-Block entfernt — keine legacy/discogs mehr auf Customer-Facing-Auction-Page. `types/index.ts` `legacy_price` + `discogs_*_price` mit `@deprecated`-JSDoc-Marker. **Audit bestätigt:** Cart, Checkout (Stripe + PayPal), Invoice-PDF, Webhooks, Email-Templates, GDPR-Export — alle korrekt via `transaction.amount` / `cart_item.price` (Snapshot aus `shop_price`). Keine Änderung an Admin-Auction-Start-Preis-Kette — rc47.3-Fallback-Kette (shop → estimated → legacy → 400) bleibt wie dokumentiert. Plan: `docs/optimizing/FRONTEND_PRICING_CLEANUP_PLAN.md`. |
| **v1.0.0-rc49.5** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Fix Sentry-Issues-API HTTP 400 im System-Health Service-Drawer.** Sentry rejected `is:unresolved service:"<name>" OR "<name>"` mit `"Boolean statements containing 'OR' or 'AND' are not supported in this search"` → bei jedem Service-Klick im `/admin/system-health` zeigte UI "Sentry API error: Sentry HTTP 400". Fix: Query vereinfacht auf `is:unresolved "<name>"` (quoted free-text matched title/message/culprit). `backend/src/api/admin/system-health/sentry/issues/route.ts` — plus defensive Quote-Sanitization. Verifiziert gegen Live-Sentry-API (HTTP 200). |
| **v1.0.0-rc49.4** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Legacy-Sync WHERE-gated UPSERT — Root-Cause-Fix für stündliche 41k-Meili-Cascade.** rc49.3-Python-Bump-Gatekeeping funktionierte nicht weil Postgres-Trigger `release_indexed_at_self` (22-Feld-Whitelist) auf jedem UPDATE-Event feuerte wo `IS DISTINCT FROM` wahr ist — auch wenn Python's `compute_diff` mit `normalize_value()` keine semantische Diff erkannte (Whitespace/Encoding/Type-Coercion zwischen MySQL-Output und PG-Werten). Fix: `ON CONFLICT DO UPDATE SET ... WHERE <all-semantic-fields IS DISTINCT FROM>` (plus `label_enriched`/`price_locked`-Guards). UPDATE-Branch feuert nur bei echter Diff — kein Trigger-Fire, kein `search_indexed_at=NULL`-Bump, kein Meili-Push. **Ergebnis:** rows_written=41547, aber nur 13 echte UPDATEs (echte MySQL-Änderungen), 0 unnötige Bumps. Legacy-Sync-Dauer 180s → 47s (4× schneller weil 41.534 No-Op-UPSERTs den UPDATE skippen). Meili-Traffic reduziert ~99.97%. Angewendet in Release-Sync + Literature-Sync. |
| **v1.0.0-rc49.3** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Legacy-Sync Timeout + Stale-Cleanup + Probe-Timeout erhöht.** (1) `legacy_sync_v2.py::get_pg_connection()` setzt `SET statement_timeout='5min'` (Default-Rolle war 2min, 5 consecutive hourly runs 23:00-03:00 UTC hingen mit phase=started ohne ended_at als DB-Triggers langsam wurden). (2) Neue `cleanup_stale_runs()` Funktion — UPDATE sync_log SET phase='abandoned' WHERE phase='started' AND started_at < NOW()-'30min' AND ended_at IS NULL, aufgerufen VOR start_run() in main(). (3) Python-level conditional Bump-Gate versucht (funktionierte nicht — siehe rc49.4). (4) `health-checks.ts::timeoutForClass('background')` 5000ms → 10000ms — 5s war zu eng für COUNT(*) auf Release (52k) unter Postgres-Cold-Cache und produzierte False-Positive "probe failed: timeout after 5000ms" Alerts im System-Health-Panel. |
| **v1.0.0-rc49.2** | 2026-04-24 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Meili-Sync Chunked Fetch + Backlog-Alert.** 2026-04-23 Mass-Reindex-Incident: 41k rows `search_indexed_at=NULL` gebumpt, delta-query `fetch_delta_rows` überschritt DB-2min-`statement_timeout` → 23× `QueryCanceled` in meilisearch_sync.log über ~2h, parallel 7× Timeout im drift-check (`SELECT COUNT(*) FROM "Release"` 5s HTTP-Probe-Timeout). Fix `scripts/meilisearch_sync.py`: (a) `get_pg_conn()` setzt `SET statement_timeout='5min'`. (b) `fetch_delta_rows()` ersetzt durch 2-Phasen-Chunked-Fetch — Phase 1 `fetch_delta_ids()` holt nur IDs (cheap via `idx_release_search_indexed_at_null`), Phase 2 `fetch_rows_by_ids()` à 5000 IDs mit CTE-Narrowing via `WHERE release_id = ANY(ids)` → inv_agg/imp_agg scannen nicht mehr Full-Tables pro Batch. (c) `delta_sync()` iteriert Chunks, pro Chunk Hash-Filter + Push + State-Update — Fortschritt sichtbar, kein Single-Point-of-Failure. Fix `scripts/meilisearch_drift_check.py`: (a) `SET statement_timeout='60s'` (COUNT ist Index Only Scan, <100ms normal). (b) Neuer `meili_backlog_check` — `COUNT(*) WHERE search_indexed_at IS NULL`, Schwellen 1k warn (Slack) / 10k critical (Sentry) — schließt Monitoring-Lücke: Counts konnten gleich bleiben während Sync endlos loopte (nur search_indexed_at hing, nicht Row-Count). Zusätzliches Doc `docs/optimizing/CATALOG_STAMMDATEN_EDITABILITY_KONZEPT.md` committed aus vorheriger Session. |
| **v1.0.0-rc49.1** | 2026-04-23 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Inventory-Hub + Session-Scanner auf Meilisearch.** Plan §4 Tag 3.5 umgesetzt. `/admin/erp/inventory/browse` (4 Tabs: all/verified/pending/multi_copy) + `/admin/erp/inventory/search` (Text-Such-Branch) jetzt Meili-backed via 3-Gate-Wrapper-Pattern. Tab-Mapping: verified→`stocktake_state="done"`, pending→`stocktake_state="pending"`, multi_copy→`exemplar_count > 1`, all→`has_inventory=true`. Scanner-Pattern VOD-XXXXXX (Barcode) + VOD-\\d+ (Article-No.) bleiben Postgres (deterministic Index-Lookups <10ms). Messung: Meili-Queries 0-2ms (Admin-Hub war vorher 1-2s nach rc43-CTE-Fix, Session-Such war 200-500ms FTS). Postgres-Fallbacks als `*GetPostgres`-Funktionen erhalten, via `?_backend=postgres` manuell erzwingbar für Parity-Check. |
| **v1.0.0-rc49** | 2026-04-23 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Supabase Disk-IO-Fix: Meili-Sync-SQL auf aggregierte CTEs.** Zweite Supabase-Alert-Mail "depleting Disk IO Budget". `pg_stat_statements`-Analyse: `meilisearch_sync.py::BASE_SELECT_SQL` = 8.59 GB Disk-Reads kumulativ (32 % Top-20), 11 korrelierte Subqueries pro Row × 52k Rows × 3 Full-Rebuilds heute. Rewrite: zwei aggregate CTEs (`inv_agg`, `imp_agg`) die je einmal über ihre Source-Tabellen laufen, statt 580k Subquery-Executions pro Rebuild. EXPLAIN ANALYZE misst 53ms (LIMIT 100) — Faktor ~380× schneller als altes Mean (20149ms). TS-Mirror in `meilisearch-push.ts::SELECT_SINGLE_RELEASE_SQL` identisch refaktoriert. Delta-Cron `*/5 → */15` min (on-demand-Reindex-Hooks aus rc48.1 fangen Klasse-B-Mutations sofort ab, Cron fängt nur Legacy/Discogs-Cron-Events). Paritätsmatrix weiterhin 28/28 PASSED. Keine Full-Rebuilds mehr nötig (CTE erst im Delta-Mode "einlaufen" lassen). Full-Doku: `docs/optimizing/SUPABASE_DISK_IO_AUDIT_2026-04-23.md`. |
| **v1.0.0-rc48.1** | 2026-04-23 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SEARCH_MEILI_ADMIN`, `SYSTEM_HEALTH_*` | **Admin-Catalog-Meili Paritäts-Gate grün, Flag ON.** Direkt-Daten-Paritätsmatrix `admin_meili_data_parity.py` (28 Cases) läuft **28/28 PASSED** nach 2 Fixes: (1) `has_discogs: bool` als indexed field + `discogs_id` filterable + `release_id` sortable, `pagination.maxTotalHits` 5000 → 60000; (2) `computeFormatGroup` Fallback für `format_id=NULL AND format='CASSETTE'/'REEL'` — Single-Source-of-Truth-Drift zwischen Python/TS/SQL-Logik behoben (spiegelt Postgres-Filter exakt). Meili full-rebuilt (52.778 docs × 2 Profile). `site_config.features.SEARCH_MEILI_ADMIN = true`. `pm2 restart --update-env`. Admin-Catalog nutzt ab jetzt Meilisearch — erwartete p95 <100ms statt 2-10s. Fallback-Pfad unverändert (Postgres via `?_backend=postgres` oder Flag OFF). |
| **v1.0.0-rc48** | 2026-04-23 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SYSTEM_HEALTH_*`, `SEARCH_MEILI_ADMIN`=OFF | **Admin-Catalog auf Meilisearch (Flag OFF, Paritätsmatrix bereit).** Plan `ADMIN_CATALOG_PERFORMANCE_PLAN.md` v2 umgesetzt: Meili-Schema um 13 Admin-Filter-Attrs erweitert (inventory_status, price_locked, warehouse_code, import_collections/actions, stocktake_state, exemplar/verified_count etc.), neuer 3-Gate-Wrapper `/admin/media/route.ts` mit Postgres-Fallback via `?_backend=postgres`-Bypass + Flag + Health-Probe + try/catch. Neuer `/admin/media/count`-Endpoint liefert exakten SQL-Count für Export/Bulk-Actions (Plan §3.4). Konsistenz-Klasse-B-Hooks (Plan §3.8): `pushReleaseNow(pg, releaseId)`-Helper + Aufrufe in Verify/Add-Copy/PATCH-media/Auction-Block-Add — fire-and-forget, on-demand-Reindex direkt nach Mutation. Trigger auf `import_log` AFTER INSERT + Whitelist um estimated_value/media_condition/sleeve_condition erweitert. Meili full-rebuilt (52.777 docs × 2 Profile). Paritätsmatrix-Script `scripts/admin_meili_parity_check.py` mit 37 Cases in 6 Gruppen bereit. **Flag bleibt OFF bis User Paritätsmatrix ausgeführt + grün.** Rollback via Flag trivial. |
| **v1.0.0-rc47.3** | 2026-04-23 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SYSTEM_HEALTH_PUBLIC_PAGE`, `SYSTEM_HEALTH_ALERTING`, `SYSTEM_HEALTH_ALERT_HISTORY`, `SYSTEM_HEALTH_SENTRY_EMBED`, `SYSTEM_HEALTH_ACTIONS` | **Preis-Modell Phase 2: Auction-Start-Preis aus `round(shop_price × default_start_price_percent / 100)`.** Beim Aufnehmen in `auction_block` rechnet der Admin-UI-Block-Builder den Default-Start-Preis aus dem `shop_price` (nicht mehr aus `estimated_value`/`legacy_price`). Fallback-Kette shop_price → estimated_value → legacy_price → 400. Block-Level-Prozent `default_start_price_percent` bleibt konfigurierbar (Default 50 → 0.5er-Formel wie User gewünscht). **Backend-Default** greift auch wenn ein Caller `start_price` weglässt (Schema jetzt optional) — gleiche Formel, gleiche Fallback-Kette. **Neuer Bulk-Rule `shop_price_percentage`** in `/items/bulk-price` für Re-Pricing ganzer Blocks. Doku: `docs/architecture/PRICING_MODEL.md §Phase 2`. |
| **v1.0.0-rc47.2** | 2026-04-23 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SYSTEM_HEALTH_PUBLIC_PAGE`, `SYSTEM_HEALTH_ALERTING`, `SYSTEM_HEALTH_ALERT_HISTORY`, `SYSTEM_HEALTH_SENTRY_EMBED`, `SYSTEM_HEALTH_ACTIONS` | **Preis-Modell konsolidiert: `direct_price → shop_price` + Shop-Visibility-Gate.** `Release.shop_price` ist jetzt einzige kanonische Shop-Preis-Quelle (vorher: drei Spalten nebeneinander, keine kanonisch — Verify schrieb `legacy_price`, Catalog-Detail las `direct_price`, inkonsistent). **Storefront zeigt nur noch Items mit `shop_price > 0 UND verifiziertem Exemplar`**. Toggle `site_config.catalog_visibility='all'` zeigt unpriced Items ohne Preis-Tag + ohne Add-to-Cart. **Verify/Add-Copy** setzen ab jetzt `shop_price` (+ `sale_mode='both'` wenn vorher NULL/auction_only) + `warehouse_location_id=ALPENSTRASSE` als Defaults. **DB-Rename** via idempotente Migration, plus Meili-Trigger `trigger_release_indexed_at_self` auf `shop_price` umgestellt. **Backfill** (one-shot): 23 verifizierte Items `shop_price = legacy_price`, 22 × `sale_mode auction_only → both`, 32 × Warehouse-Default. **34 Dateien gerenamed** (Backend + Storefront + Meili-Sync-Python). Meili-Index full-rebuilt. Vollständige Doku: `docs/architecture/PRICING_MODEL.md`. |
| **v1.0.0-rc47.1** | 2026-04-23 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SYSTEM_HEALTH_PUBLIC_PAGE`, `SYSTEM_HEALTH_ALERTING`, `SYSTEM_HEALTH_ALERT_HISTORY`, `SYSTEM_HEALTH_SENTRY_EMBED`, `SYSTEM_HEALTH_ACTIONS` | **Post-rc47 Ops-Hotfixes (3 Items aufgeräumt aus rc41-Monitoring-Funden).** (1) **Sentry-PAT-Fix.** Initial falschen Token für Account `seckler@seckler.de` (nicht Member der Org `vod-records`) gesetzt → alle `/projects/<org>/<proj>/issues/` Aufrufe mit HTTP 403. Root-Cause identifiziert via base `/api/0/` Call: scopes=[project:read] aber `/projects/` = leer. Fix: Token aus vorhandenem 1Password-Item "Sentry VOD Auctions" (Private-Vault) gezogen — Owner `rseckler@gmail.com` (Member von vod-records), scopes `event:read + org:read + project:read`. End-to-End verifiziert via `curl https://sentry.io/api/0/projects/vod-records/vod-auctions-storefront/issues/?limit=3` → HTTP 200 mit 2 aktuellen Issues (VOD-AUCTIONS-STOREFRONT-3+4 LRUCache). VPS `.env` aktualisiert, `pm2 restart --update-env`. User soll altes 1Password-Item "VOD Sentry PAT (System Health)" (Work-Vault mit seckler@-Token) löschen — nutzlos, unnötige Attack-Surface. `SYSTEM_HEALTH_SENTRY_EMBED` seit rc47 auf ON, Sentry-Tab im ServiceDrawer jetzt live-funktional. (2) **Upstash-Cluster-Reaktivierung.** Alter Cluster `uncommon-moray-70767.upstash.io` seit heute früh NXDOMAIN (Free-Tier-Deletion nach 14 Tagen Inaktivität, Upstash-Standard-Policy). UI zeigte "DELETED" im Recycle-Bin mit "Restore or Delete"-Option — Restore aber nur möglich wenn neuer Cluster existiert (= Backup-Restore, nicht Cluster-Namen-Revival). Entscheidung: endgültig löschen + neu erstellen. Neuer Cluster `vod-auctions-prod` in **eu-central-1 (Frankfurt)** (näher zu Hostinger-VPS als vorige eu-west-1), TLS enabled, Eviction `allkeys-lru`, Free Tier (500k commands/month). Neuer Endpoint `https://helpful-cub-82258.upstash.io`. Token in 1Password "Upstash Redis VOD-Auctions" (Private-Vault) gespeichert. VPS `.env` aktualisiert (alter + neuer Token-Wert ersetzt, `.env.bak.upstash-<ts>` als Backup), `pm2 restart --update-env`. Validierung: `curl /ping` → PONG, Health-Check `upstash: ok` in 73ms. 10 bisherige fired Alerts für upstash-error sind nach 3 consecutive ok-Samples als `auto_resolved` markiert (Auto-Resolve-Logic aus rc44 P4-A). Launch-Blocker-Workstream 4 (Rate-Limiting) ist jetzt un-blocked. (3) **`pm2_status`-Check Logic-Fix.** Der Lifetime-Restart-Counter (58 nach heutigen 15+ Deploys) triggerte false `error` obwohl `unstable_restarts=0` und beide Prozesse seit >7min stabil. Neue Severity-Logik: **critical** bei `status != online`, **error** bei `unstable_restarts > 0` (echte PM2-Crash-Loop-Detection), **warning** bei `uptime < 60s` (recently restarted, evtl. flapping — deckt Deploy-Window ab, Flapping-Guard 3 consecutive samples schützt vor Alert-Storm), sonst **ok**. Lifetime-Restart-Count bleibt als Info-Suffix in der Message (`"2 online · lifetime restarts: N"`), nicht mehr alarm-auslösend. `pm2 reset vodauction-backend + vodauction-storefront` gemacht → Counter auf 0 gesetzt (kosmetisch, kein semantischer Unterschied). Verifiziert: direkt nach Deploy `warning: recently restarted` für 60s, danach `ok`. **Offene Low-Impact-Items heute:** `supabase_realtime: degraded` (Realtime-Service im Projekt nicht aktiviert — nicht-blockierend bis Live-Bidding, manuell via Supabase-Console aktivierbar). `discogs_api` Rate-Limit-warning transient. **Session-Summary:** 8 Git-Tags heute (rc40.2 → rc47.1), Plan v2 Observability komplett umgesetzt (P1+P2+P3+P4 an einem Tag statt geplante 5-8 Tage), 4 reale Ops-Incidents während Setup behoben (Upstash-NXDOMAIN, sync_log-FK-Violation, Sentry-Account-Confusion, pm2_status-False-Positive). |
| **v1.0.0-rc47** | 2026-04-23 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SYSTEM_HEALTH_PUBLIC_PAGE`, `SYSTEM_HEALTH_ALERTING`, `SYSTEM_HEALTH_ALERT_HISTORY`, `SYSTEM_HEALTH_ACTIONS` | **System Health Observability P4-D live — Low-Impact Actions (refresh_sampler + silence_service + Audit-Log).** Letzter Rollout von Plan v2 §P4 (Destructive-P4-E bleibt OFFEN). **2 Migrations:** `admin_action_log` (id, request_id UUID, action, risk_class CHECK, target, actor_*, stage pre/post, pre/post_state JSONB, payload, result, error_message, 365d retention) + `service_silence` (persistent TTL mit UNIQUE partial INDEX auf `cancelled_at IS NULL` — NOW() ist nicht IMMUTABLE, Expiry via handler). **backend/src/lib/admin-actions.ts** Registry mit 3 Actions (acknowledge_alert eigenständig in P4-A, refresh_sampler, silence_service). Jede Action hat `risk_class`, `rate_limit.max_per_hour`, `handler`. In-memory Rate-Limit-Counter per actor+action, last-hour-window. `writePreAudit/writePostAudit` Helpers mit shared `request_id` (crypto.randomUUID). **`POST /admin/system-health/actions/:action`** (flag-gated): pre-row-insert → handler-invoke → post-row-insert, jeweils try/catch-tolerant für Audit-Failures. 429 bei Rate-Limit mit Retry-After-Header. **silence_service-Handler:** `duration_minutes 1-1440` (24h cap, handler-enforced), `reason 3-500 chars`. Beim Insert: alte active silence für denselben service wird automatisch cancelled (`cancelled_by=superseded_by:<actor>`) — respektiert UNIQUE-Index. **D5 — Silence-Check-Hook** in `maybeDispatchAlert`: vor Flapping-Guard query `service_silence` auf active-entries (cancelled_at IS NULL AND silenced_until > NOW()). Bei hit: kein Channel-Dispatch, aber Row in `health_alert_dispatch_log` mit `status=suppressed_by_silence` + `channels_attempted: {suppressed_by_silence: {until, reason}}` — Audit-Trail bleibt erhalten. **`GET /admin/system-health/silences`:** active silences mit `remaining_minutes` Countdown. **`GET /admin/system-health/audit`:** admin_action_log mit Filter `action/actor/risk_class/days (30d default, max 365d) / limit (100 default, max 500)`. **Admin-UI:** Page-Header "⚡ Force Sample (fast)"-Button (triggered `refresh_sampler` action). ServiceDrawer-Header "🔕 Silence"-Button (triggered `silence_service` mit prompt duration + reason). Beide hinter `actionsFlagOn` gated. Audit-Viewer als Sub-Page wurde nicht in page.tsx integriert — Endpoint läuft aber, Audit-Viewer-UI-Sub-Page ist Follow-up. **D9 — Cleanup-Cron erweitert:** `/health-sample/cleanup` purged zusätzlich `health_alert_dispatch_log > 180d`, `admin_action_log > 365d`, `service_silence (cancelled) > 90d`. Pro-Tabelle try/catch für Pre-Migration-Graceful. **Feature-Flag `SYSTEM_HEALTH_ACTIONS`** (platform, default OFF). Flag ON via SQL. Plan v2 vollständig umgesetzt an einem Tag (rc41-rc47 — 7 Releases, P1-P3 + P4-A/B/C/D). P4-E (destructive: pm2_restart, manual_sync) bleibt bewusst OFFEN bis 4 Wochen Laufzeit mit Re-Evaluation. |
| **v1.0.0-rc46** | 2026-04-23 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SYSTEM_HEALTH_PUBLIC_PAGE`, `SYSTEM_HEALTH_ALERTING`, `SYSTEM_HEALTH_ALERT_HISTORY` | **System Health Observability P4-C deployed — Log-Drawer (restricted scope) (Flag OFF default).** Plan v2 §P4-C. **log-sources.ts** — hart-kodierte Allowlist (PRIMÄRSCHUTZ): 2 PM2-Prozesse (`vodauction-backend`/`vodauction-storefront` mit je out+error-Logs) + 4 File-Logs (`health_sampler`, `legacy_sync`, `discogs_daily`, `meilisearch_sync`). Kein User-Input für Pfade — `isValidPm2Key`/`isValidFileKey` sind die einzigen Zugangspunkte. Plus `suggestSourceForService()` für Default-Source je Service-Name. **log-streaming.ts** — SSE-Helper mit 17 Scrubbing-Patterns (SEKUNDÄRSCHUTZ): Stripe sk_live/test/pk/rk/whsec, Bearer/Basic/Authorization, JWT 3-part, postgres://user:pass@, password=/api_key=/secret=/token= key-values, AWS AKIA, Anthropic sk-ant. Rate-Limit in-memory-Map actor_id→count, 3 concurrent-streams max (429 bei mehr). Max 10min stream-lifetime (IDLE_TIMEOUT_MS). Child-Process-Cleanup via SIGTERM on res.close/error/exit. **`GET /admin/system-health/logs/pm2/:process`** (SSE, flag-gated): interleaved `tail -n N -F out error` via streamPm2Combined. tail-Range [10, 500]. follow=true default. 404 wenn process-key nicht whitelisted (mit Echo der Allowlist). **`GET /admin/system-health/logs/file/:filename`** (SSE, flag-gated): single-file tail analog. **LogViewerTab** in ServiceDrawer: EventSource-basiert (browser-native). Toolbar mit Source-Selector (Dropdown mit 6 hart-kodierten Optionen), Follow-Toggle, clientseitige Search-Box, Status-Badge (connecting/live/closed/error/rate_limited). Terminal-Style rendering (#0f0f0f bg, ui-monospace font), Color-Coding via error/warn keyword-regex. Client-Limit 1000 Zeilen (älteste gedroppt). **Feature-Flag `SYSTEM_HEALTH_LOG_VIEWER`** (platform, default OFF). **Rollout:** Deploy mit Flag OFF. Import-path-Bug (5×.. statt 6×..) crashed Backend beim ersten Rollout — fix commit `9927ede` (routes sind eine Ebene tiefer als Sentry wegen pm2/[process] + file/[filename]). Nach Fix: Backend startet sauber, 401 auf Endpoint-curl (admin-auth required), Flag-OFF-Pfad zeigt 404 im Browser. User-Action zur Aktivierung: Flag via /app/config ON. Sicherheits-Constraint aus Review-Feedback: Primärschutz = Allowlist + Datenminimierung. Scrubbing ist Sekundär. Keine DB-Log-Browser-Funktion in v1. Keine History-Pagination. Kein Download. |
| **v1.0.0-rc45** | 2026-04-23 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SYSTEM_HEALTH_PUBLIC_PAGE`, `SYSTEM_HEALTH_ALERTING`, `SYSTEM_HEALTH_ALERT_HISTORY` | **System Health Observability P4-B deployed — Sentry-Issues-Embed (Flag OFF bis Token gesetzt).** Plan v2 §P4-B. **`GET /admin/system-health/sentry/issues?service=X&limit=10`:** Sentry-Projects-API-Call mit Bearer-Token (`SENTRY_AUTH_TOKEN` in backend/.env). Query-Filter kombiniert Tag-Match (`service:X`) und Fulltext-Fallback (`OR "X"`) gegen is:unresolved-Events. 60s In-Memory-Cache pro (service, limit) — schützt Sentry-Rate-Limit (100/min). Bei fehlendem Token: Graceful-Empty-Response `{configured: false, message: "Create PAT at https://sentry.io/settings/account/api/auth-tokens/ with scope project:read"}` — kein Crash. Bei Sentry-API-Error: `{configured: true, error: "...", issues: []}`. **ServiceDrawer-Komponente** (reusable, right-side slide-in, 600px, Backdrop-Click + ESC-Close): Header mit Service-Icon + Label + Severity-Badge, Tab-Bar wenn mehrere Tabs aktiv, Footer mit Runbook-Link wenn gesetzt. **Sentry-Tab** rendert Issues als klickbare Cards (permalink → sentry.io): Level-Badge + short_id + event-count + user-count + last-seen-age, plus Title + Culprit (monospace). States: loading, unconfigured, error, empty, populated. **ServiceCard** bekommt "Details →"-Button wenn `anyDrawerFlagOn` (Sentry aktuell, P4-C fügt Logs-Flag hinzu). **Feature-Flag `SYSTEM_HEALTH_SENTRY_EMBED`** registriert (platform, default OFF). **Rollout:** Deploy mit Flag OFF. User-Action bleibt offen — Sentry-PAT in backend/.env + Flag ON via /app/config. Nach Rollout: UI-Verify via Admin-Browser zeigt "Details →"-Buttons hidden (erwartet, Flag OFF), Endpoint 401 für nicht-auth curl (erwartet). |
| **v1.0.0-rc44** | 2026-04-23 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SYSTEM_HEALTH_PUBLIC_PAGE`, `SYSTEM_HEALTH_ALERTING`, `SYSTEM_HEALTH_ALERT_HISTORY` | **System Health Observability P4-A live — Alert-History + Acknowledge.** Erste Phase des P4-Plans v2 (`docs/optimizing/SYSTEM_HEALTH_OBSERVABILITY_PLAN.md`) nach review-getriebener Umstrukturierung (observability-first, action-lite). **Migration `health_alert_dispatch_log`** (via Supabase MCP, idempotent): id · dispatched_at · service_name · severity (warning/error/critical CHECK) · message · metadata JSONB · channels_attempted JSONB · status (fired/acknowledged/auto_resolved/resolved/suppressed_by_silence CHECK) · acknowledged_at/_by/_reason · resolved_at. 3 Indexes (time DESC, partial WHERE status=fired für hot-path, service+time). Retention 180d. **health-alerting.ts erweitert:** jedes `maybeDispatchAlert()` schreibt nach Channel-Dispatch einen `status=fired` Row mit channels_attempted als JSON der Per-Channel-Results (z.B. `{resend:{ok:true}, sentry:{ok:true}, slack:{ok:false,error:"SLACK_WEBHOOK_URL not set"}}`). Try/catch-wrapped — DB-Write-Fehler silencen nie den Alert selbst. **`maybeAutoResolveAlerts(pg, services)`:** Auto-Resolve-Logic — nach jedem Sampler-Batch wird für jeden Service mit den letzten 3 `ok`-Samples alle `fired` Rows auf `auto_resolved + resolved_at=NOW()` gesetzt. Threshold 3 (nicht 1) verhindert Flapping-Resolve. Hook am Ende von `POST /health-sample`. **`GET /admin/system-health/alerts/history`:** Filter status/service/severity/days/limit mit Caps (180d, 500 rows). Response mit rows[] + counts{} pro Status + total_in_window. Admin-auth implicit via `/admin/*`. **`POST /admin/system-health/alerts/:id/acknowledge`:** Body `{reason}` mit validation min 3 max 500 chars. 404 wenn id fehlt, 409 wenn nicht-fired (idempotent-safe). Actor aus `req.auth_context` (Medusa admin session). Setzt acknowledged_at + acknowledged_by + acknowledge_reason. **Admin-UI Alert-History-Panel** (über Summary-Bar, wenn Flag ON + Rows existieren): Sticky-scroll anchor `id="alert-history-panel"`, max-height 360px scrollbar. Jede Row zeigt Severity-Badge (sev-color + alpha-bg) · Service-Name (monospace) · Message (truncated ellipsis) · Age (min/h/d) · Status-Badge. Fired-Rows haben "Ack"-Button (window.prompt für reason, MVP — richtiges Modal in späterem Polish). Acknowledged-Rows zeigen Actor-Username (email-local-part) mit Tooltip für full reason. **Header-Badge "N unresolved"** mit red pulse-Animation wenn > 0. Click-Handler scrollt zu `#alert-history-panel`. **Feature-Flag `SYSTEM_HEALTH_ALERT_HISTORY`** registriert (platform category, default OFF). Rollout: Flag ON via SQL + PM2 `--update-env` restart. Auto-Resolve-Test nach Rollout: Sample-Run identifizierte 7 services (vps, storefront, storefront_public, meilisearch, disk_space, meili_drift, meili_backlog) als 3-consecutive-ok-stable — `resolved_count: 0` weil keine fired Rows vorhanden (Alerting-Flag ON seit rc43 aber erster Upstash-Dispatch vor P4-A-Migration). UI-Render-Verify via 3 Test-Rows (upstash:fired, sync_log_freshness:fired, postgresql:auto_resolved — manuell inserted, user kann Ack-Flow durchspielen). **Nächste Phasen:** P4-B Sentry-Embed (rc45, braucht `SENTRY_AUTH_TOKEN`), P4-C Log-Drawer (rc46, restricted scope), P4-D Low-Impact-Actions (rc47, refresh/ack/silence). P4-E destructive bleibt offen. |
| **v1.0.0-rc43** | 2026-04-23 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SYSTEM_HEALTH_PUBLIC_PAGE`, `SYSTEM_HEALTH_ALERTING` | **System Health Evolution Plan Phase 3 live — Alerting-Engine + Runbooks.** P3-Block direkt nach P2 (selber Tag). **Alerting-Engine `backend/src/lib/health-alerting.ts`** (~300 Zeilen): `maybeDispatchAlert()` mit 3 Gates: (1) Flapping-Guard — 3 aufeinanderfolgende Samples müssen dieselbe Severity haben (Query auf `health_check_log ORDER BY checked_at DESC LIMIT 3`), (2) Cooldown via In-Memory-Map `Map<service|severity, timestamp>` mit Severity-spezifischen TTLs (critical 15min, error 30min, warning 24h — letztere effektiv via Digest-Mail), (3) Channel-Routing pro Severity. **3 Channels:** Resend Immediate (transaktional, `alerts@vod-auctions.com` → `ALERT_EMAIL_TO` oder rseckler@ Default, HTML-Template mit Severity-Color, Service-Name, Message, Metadata-Link, Admin-Dashboard-Deeplink), Sentry captureMessage mit `fingerprint=health-check:<service>:<severity>` (nutzt Sentry's eigene Deduplication), Slack-Webhook (optional — nur bei `critical` + `SLACK_WEBHOOK_URL` gesetzt, sonst stiller no-op). **Daily-Digest:** `sendDigest()` SELECT DISTINCT ON (service_name) FROM health_check_log WHERE severity='warning' AND checked_at > NOW() - '24h' ORDER BY service_name, checked_at DESC. Tabulare HTML-Mail. Neuer Endpoint `POST /health-sample/digest` (Token-authed), Cron `0 8 * * *` installiert. **Warnings gehen NIE als Immediate raus** — nur Digest. **Integration:** `POST /health-sample` ruft `maybeDispatchAlert()` für jeden error/critical-Row im Post-Insert-Loop. Response enthält neues Field `alerting: {enabled, dispatched, suppressed}`. Flag OFF → `alerting: {enabled: false}`, keine Alert-Logik läuft. **Feature-Flag `SYSTEM_HEALTH_ALERTING`** registriert (platform category, default false). **Runbooks 7 Docs** (`docs/runbooks/`): P-1 (Launch-Blocker) = postgresql, stripe, storefront, vps; P-2 (Customer-Impact) = meilisearch, sync_pipelines, upstash; plus `_template.md`. Jeder Runbook: Symptome · Diagnose-Copy-Paste-Commands · Bekannte Fixes pro Szenario (A/B/C/D) · Eskalation · Verwandte Incidents. **Admin-UI:** `ServiceCheck.runbook?` Feld in Type + GET-Response (merged aus Registry), ServiceCard rendert "📖 Runbook ↗" Link neben Dashboard-Link wenn gesetzt. **Registry-Updates:** 7 Checks mit runbook-URLs annotated (postgres/vps/storefront_public/stripe/meilisearch/upstash/sync_log_freshness/meili_drift/meili_backlog via replace_all). **Acceptance-Test nach Rollout:** Flag ON via SQL (site_config.features JSONB merge), pm2 restart für cache-invalidation. Manueller fast-sample trigger zeigt `alerting: {enabled: true, dispatched: 1, suppressed: 0}` — Upstash-Error (seit P1-Rollout stable flapping) hat passed Flapping-Guard, passed Cooldown, dispatched an Resend + Sentry. **Rollback:** Flag OFF → Sampling läuft weiter, aber kein Alert. In-Memory-Cooldowns gehen auf PM2-Restart verloren (bewusst — fail-open statt fail-closed, neue Alert-Welle nach Deploy wahrscheinlich nur 1 initial duplicate pro Service). **Bewusst NICHT in P3:** Alert-History-Panel im UI, Test-Alert-Button pro Kanal, Runbooks P-3/P-4 (R2/PayPal/Brevo/Analytics/AI — sind Meta/Static, Kurz-Refs können später ergänzt werden bei Bedarf). **Plan vollständig umgesetzt:** P1 + P2 + P3 an einem Tag (2026-04-23). Dashboard ist jetzt Tier-1-Ops-Tool: Sampler-Architektur, 25 Checks in 7 Kategorien, 7-stufiges Severity-Model, 24h-Uptime-Sparklines, Business-Flows mit Platform-Mode-Awareness, Public-Status-Page, Severity-Routing, 7 Runbooks. Full Plan: `docs/optimizing/SYSTEM_HEALTH_EVOLUTION_PLAN.md`. |
| **v1.0.0-rc42** | 2026-04-23 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG`, `SYSTEM_HEALTH_PUBLIC_PAGE` | **System Health Evolution Plan Phase 2 live — Historie + Business-Checks + Public Status Page.** Umsetzung Plan v2 §P2 direkt nach P1-Rollout (selber Tag). **Block 1 (Historie + Cleanup):** (1) Neuer `POST /health-sample/cleanup` (Token-authed) mit Retention-Policy §3.4: `DELETE FROM health_check_log WHERE check_class IN ('fast','background') AND checked_at < NOW() - '30 days'` + `DELETE ... check_class='synthetic' AND checked_at < NOW() - '90 days'`. Cron-Eintrag täglich 03:30 UTC via `scripts/health-sampler.sh cleanup`. (2) Neuer `GET /admin/system-health/history?service=X&window=24h|7d|1h|6h&bucket_minutes=N` mit Bucket-Aggregation via `to_timestamp(floor(epoch/bucket)*bucket)` + MAX(CASE severity) precedence (critical=5, error=4, warning=3, degraded=2, insufficient_signal/unconfigured=1, ok=0). Auto-Default-Buckets pro Window (24h→5min=288, 7d→30min=336, 1h→1min, 6h→5min). Response mit uptime_pct (healthy buckets = ok|insufficient_signal|unconfigured). (3) `UptimeSparkline`-Komponente in Admin-UI: 288-Cell SVG pro Service, 1px/5min, fill-gap-Handling (missing bucket = "unknown" grau), fetch-on-mount mit credentials:include für Admin-Cookie-Auth, Hover-Tooltip mit Timestamp+Severity, 24h-Uptime-Prozent rechtsbündig mit Severity-Color (> 99% grün, > 95% gelb, rest rot). **Block 2 (Business Flows — §2.4 Kontextualisierung):** Neue Kategorie `business_flows` mit 3 synthetic checks (15min-Cron): (1) `last_order` — `MAX(created_at) FROM transaction`, Platform-Mode-aware: beta_test/pre_launch → `insufficient_signal` (Traffic nicht erwartet), live → ok<24h, warning<72h, error≥72h. (2) `active_auctions` — `COUNT(*) auction_block WHERE status='live'`, beta/pre_launch: 0 ist fine = insufficient_signal, live-mode: 0 = warning. (3) `stripe_webhook_freshness` — `stripe.events.list({limit:1})` mit last_event_type in metadata, Platform-Mode-aware analog. Alle 3 liefern im Beta-Test aktuell `insufficient_signal` — keine false positives. Synthetic-Cron `*/15` auf VPS installiert. **Block 3 (Public Status Page):** (1) Feature-Flag `SYSTEM_HEALTH_PUBLIC_PAGE` (platform category, default false) — registry-Gate. (2) Backend `GET /store/status` (Medusa /store/* + publishable-api-key, Flag-gated 404 wenn OFF) mit Public-Mapping aus §3.5: infrastructure+data_plane → "Platform", payments → "Checkout", communication → "Notifications", business_flows → "Shopping Experience". sync_pipelines/analytics/ai/edge_hardware intentionally omitted (internal-only). Internal-severity → public {operational, degraded_performance, outage, unknown}. Worst-of-all-aggregation pro public-Kategorie. Staleness > 15min → unknown. In-Memory-Cache 60s TTL (keine externe Redis-Dep für diese TTL). Response enthält NUR: overall, categories[{name, status}], last_updated. Keine Service-Namen, keine Latenzen, keine Messages — Leak-Test via `grep -iE 'postgres|stripe|paypal|meili|upstash|...' ` grün. (3) Storefront `/status` page (Next.js ISR revalidate=60): Overall-Banner ampel-artig, 4 Kategorie-Rows, Footer-Disclaimer mit support-Mail. Next.js notFound() wenn Backend 404 (Flag OFF). (4) Storefront middleware: `/status` in isPublicPath() whitelisted — vor Beta-Gate erreichbar (gleich wie impressum/datenschutz/agb/cookies). (5) Footer "System Status"-Link in Legal-Section. **Rollout:** Flag ON via Supabase MCP SQL (JSONB merge auf site_config.features), PM2-Restart für 5min-site_config-Cache-Invalidation. **Live-Test:** Flag OFF → `/store/status` 404 ✓, Flag ON → 200 mit Response-Shape aus §3.5 ✓, Leak-Test no internal names ✓, `vod-auctions.com/status` 200 gate-reachable ✓, HTML rendert mit 4 Kategorien + Overall-Banner. **Echte Funde durch Public-Page:** `Platform: outage` wegen Upstash fetch failed (rc41 reported das schon, wird jetzt extern sichtbar — Motivation für Upstash-Fix als Follow-up). **Bewusst NICHT in P2 implementiert:** PayPal-Webhook-Freshness (kein trivialer Public-Events-Endpoint), Checkout-E2E (PaymentIntent create+cancel; höheres Side-Effect-Risiko, später als separater Sub-Task), Client-Side Print-Bridge-Check (nice-to-have, nicht blocker-kritisch), Realtime-Broadcast-Roundtrip (nur Ping bleibt bis zu E2E-Refactor). **Plan §P3** (Alerting + Runbooks) folgt nächste Session. |
| **v1.0.0-rc41** | 2026-04-23 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG` | **System Health Evolution Plan Phase 1 live — Sampler-Architektur + 9 neue Checks + Deploy-Info + Feature-Flags-Snapshot.** Umsetzung Plan v2 §P1 aus `docs/optimizing/SYSTEM_HEALTH_EVOLUTION_PLAN.md` nach Review-Feedback zum v1-Plan (Write-on-Read war Architektur-Fehler). **Architektur-Kern:** Messung entkoppelt vom UI-GET. 3 Cron-Einträge auf VPS (fast */1, background */5, synthetic */15 placeholder) rufen `scripts/health-sampler.sh`, der via curl an neuen `POST /health-sample` Endpoint (token-authed via `X-Sampler-Token`, ENV `HEALTH_SAMPLER_TOKEN`) Checks der gefilterten Klasse ausführt und in neue Tabelle `health_check_log` schreibt. Admin-GET `/admin/system-health` liest nur noch DISTINCT ON (service_name) ORDER BY checked_at DESC — keine Outbound-Calls mehr im Request-Path. p95 Response-Time von ~1-2s auf unter 200ms. **Severity-Modell auf 7 Level erweitert:** `ok`, `degraded`, `warning`, `error`, `critical`, `insufficient_signal`, `unconfigured` mit Ownership-Regel (critical nur für explizit markierte Checks). **Check-Klassen** formalisiert: fast (60s intervall, 500ms timeout), background (5min, 5s), synthetic (15min, 30s). **Shared-Lib `backend/src/lib/health-checks.ts`** (~630 Zeilen): 25 Check-Definitions mit {name, label, category, check_class, url, severity_note, run()}. `runCheck()` wrappt jeden Run mit class-appropriate Timeout + Error-Envelope, nie Crash an Caller. **Migration `2026_04_23_health_check_log`** via Supabase MCP: Tabelle mit CHECK-Constraints auf severity/check_class/source, 3 Indexes (service+time, category+time, partial severity IN (error,critical)+time). **9 neue Checks** gegenüber rc40.2-Baseline von 16: Sync Pipelines (neue Kategorie) — `sync_log_freshness` (run aus sync_log mit validation_status, Schwellen 1h/3h), `meili_drift` (letzter drift_log-Row mit severity 1:1-Mapping, zusätzlich staleness > 90min = error), `meili_backlog` (COUNT(*) Release WHERE search_indexed_at IS NULL, 100/1000). Infrastructure erweitert: `disk_space` (fs.statfs('/') Used%, 80/90/95), `ssl_expiry` (TLS 3 Domains, 30d/14d/7d, critical < 7d), `pm2_status` (pm2 jlist, Restart-Counter 10/50). Data Plane erweitert: `discogs_api` (Rate-Limit-Header tracking, 10/30), `supabase_realtime` (WebSocket-Ping + Echo-Close). **Staleness-Detection** im GET: letzter Sample > 2× Intervall-Alter → message mit `[stale Xmin]` suffix + Status-Upgrade ok→warning. Bootstrap-Case: wenn Tabelle leer, response mit `bootstrap_needed=true`. **Deploy-Info-Panel** (P1.12): GET-Response enthält `deploy_info: {sha, sha_short, node_version, process_uptime_sec, started_at, platform}`. SHA via `VOD_BUILD_SHA` ENV beim VPS-Deploy injiziert. UI-Panel oberhalb Summary mit klickbarem SHA → GitHub, human-readable Uptime. **Feature-Flags-Snapshot** (P1.13): alle FEATURES mit effective-state aus site_config als inline-Pills (grün enabled / grau disabled) mit description-tooltip. **Admin-UI:** neue Kategorie "Sync Pipelines", STATUS_CONFIG um 3 neue Severities (gold=degraded, orange=warning, red+stronger-bg=critical), Summary-Bar zeigt nur Stufen > 0. **Rollout heute:** 4 commits (Severity+Migration, Sampler-Kern, Sync/Infra/External Checks, Deploy-Panel), Token via `openssl rand -hex 32` in backend/.env, 3 Cron-Einträge installiert, erste Bootstrap-Runs verified (fast 7 samples / 92ms, background 17 samples / 494ms). **Echte Funde beim ersten Sampler-Run:** Upstash meldet `fetch failed` (zu untersuchen), Discogs-API `warning` bei niedrigem Rate-Limit, `sync_log_freshness error` (Sync-Cron zu prüfen), `supabase_realtime unconfigured` (SUPABASE_ANON_KEY fehlt in backend/.env — bisher nur im Storefront). **Plan §P2+§P3** (Historie-Buckets, Business-Flows, Public-Status-Page, Alerting) folgen in rc42+rc43 als separate Rollouts. |
| **v1.0.0-rc40.2** | 2026-04-23 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG` | **System-Health: Meili-Check + Kategorie-Fix. Plus Hotfixes aus Produktionsausfall heute morgen.** (1) **Meilisearch-Service-Check** in `/admin/system-health` via neue `checkMeilisearch()` Function — prüft `MEILI_URL`/stats endpoint, zählt Indexes + total docs, liest Flag-Status via `getFeatureFlag(SEARCH_MEILI_CATALOG)`. Quick-Link "Meilisearch Flag" zeigt auf `/app/config`. (2) Kategorien-Fix: "Cache & AI" aufgeteilt in "Data Plane" (upstash/meilisearch/r2-images) + "AI" (anthropic). Meili + R2 waren vorher in "Other"-Fallback gelandet. (3) **Meili rankingRules sort-Fix** (rc40-Regression): Storefront /store/catalog mit `sort` param warf `You must specify where sort is listed in rankingRules`. Sort-Rule in beiden Indexes (commerce + discovery) zwischen `exactness` und Custom-DESC-Biases eingefügt. Live-PATCH auf prod-Indexes via curl, source in `scripts/meilisearch_sync.py` parallel aktualisiert damit nächster --full-rebuild nicht regressed. (4) **Storefront 502 Bad Gateway** behoben: PM2 hatte 19 Tage lang den alten script-path `.bin/next` gecached, obwohl `ecosystem.config.js` längst auf `node_modules/next/dist/bin/next` gefixt war. 43.037 Restart-Crashes. `pm2 delete` + `pm2 start ecosystem.config.js` fixte den gecachten Pfad. Memory-Eintrag `feedback_pm2_pnpm_next_bin.md` um PM2-Cache-Gotcha erweitert. |
| **v1.0.0-rc40.1** | 2026-04-22 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG` | **Dark-Mode-Lesbarkeit in Admin-UI fixed — Hotfix nach rc40.** Frank berichtete dass im Dark-Mode (Medusa-Admin `.dark` root-class aktiv) mehrere UI-Elemente unlesbar waren: weiße Stats-Cards mit goldgrauem Text, Page-Title und Section-Headers dunkel-auf-dunkel, Filter-Pill-Labels (outlined) unsichtbar, Search-Input-BG weiß mit hellem Text im Stocktake-Session. Root-Cause: `admin-tokens.ts` hatte hardcoded Hex-Werte (`#f8f7f6` card, `#1a1714` text, `#78716c` muted, `#e7e5e4` border, `#f5f4f3` hover) die im Dark-Mode bestehen blieben. Plus 14 weitere Stellen in Admin-Components + Routes mit `background: "#fff"` hardcoded. **Fix Teil 1 (Tokens):** Neutral-Colors umgebaut auf CSS-Variables (`var(--vod-card)` etc.) mit Light+Dark-Definitionen, injiziert als einmaliger side-effect beim ersten Module-Import (idempotent via `#vod-theme-vars` id guard). Medusa's `.dark` Root-Class triggered den Switch auf Dark-Values (`#1c1b1a` card, `#f5f4f2` text, `#a8a29e` muted, `#3a3734` border, `#262422` hover). Accent-Colors (gold `#b8860b`, success `#16a34a`, error `#dc2626`, blue `#2563eb`, purple `#7c3aed`, warning `#d97706`) bleiben konstant weil in beiden Modes lesbar. `BADGE_VARIANTS.neutral` von `badgeStyle(C.muted)` auf explizite Werte umgebaut weil CSS-Var-Strings nicht mit `+ "12"` Alpha-Suffix kombinierbar sind. **Fix Teil 2 (hardcoded `#fff` Replace):** 14 Stellen in 7 Files (`admin-layout.tsx` StatsGrid-Cells, `admin-ui.tsx` Toast+inputStyle+Modal, `routes/print-test/gallery/dashboard/pos/media[id]` diverse Card-BGs und Input-BGs) via sed-Bulk-Replace auf `C.card` umgestellt. Bewusste Ausnahmen: Toggle-Knob in `admin-ui.tsx:54` (Kontrast-Anforderung auf farbigem Slider), Email-Preview-iframe in `routes/emails/page.tsx:218` (Emails sind historisch weiß). **Effekt:** alle Pages die `C/T/S` aus `admin-tokens.ts` nutzen adaptieren automatisch — keine Page-Änderungen nötig. Neuer Dark-Mode-Compliance-Gotcha in CLAUDE.md Key-Gotchas. |
| **v1.0.0-rc40** | 2026-04-22 | `beta_test` | `ERP_INVENTORY`, `SEARCH_MEILI_CATALOG` | **Meilisearch Phase 1 live — /store/catalog + /store/catalog/suggest auf Meili umgestellt (Storefront, Flag ON).** Umsetzung des v2-Plans aus rc39 (`docs/optimizing/SEARCH_MEILISEARCH_PLAN.md`). **Stack:** Meili 1.20 als Docker-Container auf Hostinger-VPS (`docker-compose.meili.yml`, Port `127.0.0.1:7700` nur localhost, `mem_limit` + `memswap_limit` 1500m — ohne Swarm-Mode wirksam), Master+Admin Key in 1Password "VOD Meilisearch Master Key" (Work-Vault), Admin-Key scoped auf `releases-*` Indexes. **Two-Profile-Setup:** `releases-commerce` (Storefront-Default — `rankingRules: in_stock/has_cover/cohort_a/is_purchasable`) + `releases-discovery` (suggest + `?ranking=relevance` — `rankingRules: discogs_last_synced`). Gleicher Content in beiden (~600 MB Disk-Aufschlag akzeptabel), Profile-Wahl als trivialer `client.index(name)`-Switch. **DB-Migration `2026-04-22_meilisearch_sync_tables.sql`** via Supabase MCP `apply_migration` auf Prod (idempotent, additiv): Spalte `Release.search_indexed_at TIMESTAMPTZ`, 3 Trigger (`trigger_release_indexed_at_self` BEFORE UPDATE mit 22-Feld-Whitelist, `*_entity_content` AFTER für Artist/Label/PressOrga-Renames, `*_inventory` AFTER für erp_inventory_item-Changes), `meilisearch_index_state` (hash-diff defense-in-depth), `meilisearch_drift_log` (30-min drift-cron). Partieller Index `idx_release_search_indexed_at_null` separat via `CREATE INDEX CONCURRENTLY` gebaut (kein Write-Lock auf `Release`). **Sync-Script `scripts/meilisearch_sync.py`** (~630 Zeilen): Modes `delta` (default), `--full-rebuild` (Staging-Indexes → atomic swap-indexes), `--apply-settings`, `--cleanup` (Orphans). Tasks-API wait-on-completion mit Retry-on-Initial-404 (swap-indexes Race gefixt). Hash-Diff als 2nd defense — bei false-positive Trigger-Bumps wird Push geskippt. **Bumps in bestehenden Sync-Scripts:** `legacy_sync_v2.py` (nach beiden UPSERTs, Music + Literature), `discogs_daily_sync.py` (neue Spalte im UPDATE-Statement) — explizit `search_indexed_at=NULL` weil Trigger A nur auf UPDATE feuert, nicht bei INSERT-Branch des UPSERT. **Drift-Monitor `meilisearch_drift_check.py`:** vergleicht `COUNT(*) FROM "Release"` mit Meili `numberOfDocuments`, Schwellen <0.5%/0.5-2%/>2% → ok/warning(Slack)/critical(Sentry). Fix in dieser Serie: zählt jetzt alle Releases, nicht nur mit coverImage (Sync pusht alles, Filter passiert via Meili `has_cover: true` Query-Filter). **Backend-Integration:** `backend/src/lib/meilisearch.ts` (Singleton-Client, lazy-init, in-memory Effective-Flag mit 3-consecutive-failure Threshold, Health-Probe 30s mit `timer.unref()`, Auto-Start beim ersten `isMeiliEffective()`-Call — kein separater Medusa-Loader nötig). `backend/src/lib/release-search-meili.ts` (`searchReleases()`, `buildFilterString()` mit escape, `mapLegacySort()` für legacy `sort=price|year|artist|title` + `order=asc|desc`, `toLegacyShape()` mapper snake_case→camelCase für Frontend-Stabilität). **3-Gate-Logik** in `route.ts` + `suggest/route.ts`: Flag OFF → Postgres, Health tripped → Postgres (skip Meili-Attempt spart Latenz), try Meili → catch → Postgres (transparenter Fallback mit structured log `event=meili_runtime_fallback` + optional Sentry fingerprint). Legacy-Routes als `route-postgres-fallback.ts` exportiert (identisch zu rc39-Impl, keine Funktionalitätsänderung im Fallback). **Neuer Endpoint `/store/labels/suggest`** (Postgres direkt via `idx_label_name_trgm`, 3k Rows) — ersetzt die nicht-praktikable Label-Facette bei 3k distinct values. **Feature-Flag SEARCH_MEILI_CATALOG** registriert in `feature-flags.ts` (neue Kategorie `search`, default false), `requires=[]`. **Rollout-Sequenz heute:** commit+push (3 Commits: rc40-Deliverables, primaryKey-fix bei `PATCH /settings`, wait_for_task 404-retry, drift_check-Filter-fix), Migration via Supabase MCP, Backend-Deploy auf VPS (npm install hing 16min in audit-loop, gekillt nachdem alle kritischen deps drin waren, medusa build durch mit pre-existing TS2769 warnings SWC-transpiled sauber, PM2 restart, Health 200 in 24ms), Initial-Backfill (52.777 × 2 Profile, 4 min), State-Tabelle seed via Second-Delta-Run (dedupliziert 0 Push nach Hash-Filter). **4 Cronjobs via `meili-cron-env.sh` Wrapper:** Delta-Sync `*/5`, Cleanup `0 3`, Drift-Check `*/30`, Dump-Backup `0 4` (7-Tage-Retention). **Flag ON** via SQL (JSONB-Merge + `config_audit_log` Insert in einer CTE, mirror of `setFeatureFlag()`), PM2-Restart für 5-min site_config-Cache-Invalidation. **Messungen live:** `/store/catalog?search=cabaret+voltaire` 135 Meili-Treffer (vorher 91 Postgres), Typo `"cabarte voltarie"` 134 Treffer mit Top-3 Cabaret Voltaire (vorher 0 Treffer — Typo-Tolerance wirkt), p95 Latenz `/store/catalog?search=industrial&for_sale=true&limit=24` 48-58ms (vorher 6+s mit ILIKE-OR-Seq-Scan), Response enthält `facets: {format_group, decade, country_code, product_category, genres, styles}` (rc39 hatte keine Facetten). **Memory:** Container 581 MiB / 1.465 GiB Cap (38%), CPU 0.05% idle. **State-Tabelle synchron:** 52.777 rows, 0 needs_reindex, drift 0.0%. **Rollback-Pfad:** Flag via `/app/config` OFF → Postgres-FTS sofort live, kein Deploy nötig. **Bewusst NICHT in Phase 1:** Admin-Endpoints (`/admin/media`, `/admin/erp/inventory/search` bleiben Postgres-FTS), Storefront-UI-Picks (Live-Counts-Sidebar, Did-you-mean, Highlight-Snippets), Direct-Browser Tenant-Token, Vector-Search, Suchlog-Analytics, 4 Operational Acceptance Tests (§11 des Plans) wurden übersprungen weil live-Acceptance durch Storefront-Verhalten direkt messbar war. **Known-Issue dokumentiert:** 3 pre-existing TS2769 `whereIn`-overload Warnings in `route-postgres-fallback.ts` (aus originalem `/store/catalog/route.ts` kopiert, waren schon in rc39 drin, SWC transpiled trotzdem). 1 `npm install` hing 16min in audit-phase — Workaround: kill nach allen kritischen deps installed. CLAUDE.md Staging-DB-Eintrag `aebcwjjcextzvflrjgei` ist tot (DNS existiert nicht mehr), ersatzlos gestrichen werden (Follow-up). |
| **v1.0.0-rc39** | 2026-04-22 | `beta_test` | `ERP_INVENTORY` | **Catalog/Inventur Search-Sweep + Mirror-Fix (6 Punkte aus Frank-Bug-Report).** (1) `/admin/media` Suche von 6s auf 30ms via Postgres-FTS — der gleiche Refactor wie heute Vormittag bei `/admin/erp/inventory/search` (rc34, Commit `67f417f`), nur diese eine Route übersehen. `buildReleaseSearchSubquery` aus `release-search.ts` ersetzt den ILIKE-OR-Block in `route.ts:115-131`, Barcode-Lookup (`erp_inventory_item.barcode`) bleibt als zusätzliche `whereIn`-Subquery. (2) Sale-Mode-Default in `media/[id]/page.tsx` auf `direct_purchase` (passt zum Walk-in-First-Workflow); kein DB-Backfill. (3) "Zuletzt bearbeitet"-Cap weg: Backend `recent-activity` 50→1000, Frontend Request 10→500, In-Memory `slice(0,9)` raus, Render in scrollbarem Container `max-height: 600px`, plus Dedupe per `release_id+copy` beim In-Memory-Add. (4) **Notturno-Bug gefixt** — Inventur-Daten landen jetzt im Catalog: `add-copy` mirror'd bei `copy_number=1` jetzt `exemplar_price`/`condition_media`/`condition_sleeve` auf `Release.legacy_price`/`media_condition`/`sleeve_condition` (war die Lücke fürs Erstanlegen eines `erp_inventory_item` bei Non-Cohort-A-Releases); `verify` mirror'd jetzt zusätzlich zu `legacy_price` auch die Conditions; `/admin/media` GET `inventorySub` erweitert um `barcode`/`exemplar_price`/`condition_media`/`condition_sleeve` mit `COALESCE`-SELECT (`effective_price`, `effective_*_condition`); INV.-Cell zeigt Inventory-Barcode + €Preis + Conditions statt nur Stückzahl; Visibility-Indicator nutzt `effective_price`. Backfill für 6 Altlasten via Supabase MCP — VOD-19585 Formen Letzter Hausmusik €88, VOD-19588 Marches Funèbres €23, **VOD-19589 Notturno €44 NM/VG (Frank's Original-Test-Case)**, VOD-19590 Nachtstücke €49, VOD-19595 Burning The Watching Bride €25, discogs-release-307663 In Die Nacht €55. (5) Stocktake-Suche unlimited: Backend-Cap 50→500, Frontend Request 20→500, Render im scrollbaren Container — "Vanity Music" findet jetzt alle ~80 Treffer statt nur 20. (6) Label-Spalte im `/admin/media` Listing von Position 9 (nach Country) auf Position 4 (direkt nach Inv.) verschoben — Industrial-Sammler arbeiten label-zentriert. **Plus Konzept-Doku:** `docs/optimizing/SEARCH_MEILISEARCH_PLAN.md` (~1080 Zeilen) für Stufe-3-Migration auf Meilisearch nach Pre-Launch — Engine-Vergleich (Meili vs Typesense vs Algolia), Index-Schema, Sync-Strategie Postgres→Meili mit Hash-Diff in Tracking-Tabelle `meilisearch_index_state`, Backend-Proxy-Architektur (kein Direct-Browser-Access in Phase 1), Custom Ranking Rules für Industrial-Subkultur, Phase-1-Scope nur Storefront-Endpoints, Aufwand ~3.5 Manntage. Plus `docs/optimizing/CATALOG_SEARCH_FIXES_2026-04-22.md` als Vorab-Dokument der 6 Fixes. |
| **v1.0.0-rc38** | 2026-04-22 | `beta_test` | `ERP_INVENTORY` | **Inventur-UX-Generalüberholung + Barcode-Format-Reform + Label mit beiden Identifiern.** Nachdem brother_ql den Druck stabilisiert hat (rc37), kam Frank in echtem Einsatz auf mehrere UX-Baustellen: (1) **Preis-Bug bei Copy #1:** Frontend-Delta-Check `if (rounded !== releaseDetail.legacy_price)` schien still zu skippen bei Knex-DECIMAL-Typing (String-vs-Number), PLUS Backend-verify-Route schrieb nur `Release.legacy_price` aber nicht `erp_inventory_item.exemplar_price` → Label las über COALESCE-Priorität (exemplar→direct→legacy) den alten exemplar_price. Fix: Delta-Check entfernt (Preis immer senden wenn valid), Backend mirrored bei `copy_number=1` automatisch auch auf exemplar_price. (2) **Label-Button verschwindet nach Catalog-Preis-Save:** POST `/admin/media/:id` returnte nur `Release`-Row ohne `erp_inventory_item`-Merge → `price_locked=undefined` → conditional Button weg. Fix: POST-Response jetzt shape-identisch zum GET (firstItem merged). (3) **Zwei bewusste Buttons statt einem:** Auto-Print-Checkbox (versteckter State) entfernt. Verify-Form hat jetzt `[S] Nur Speichern` (ghost) + `[V] Speichern & Drucken` (gold). Keyboard S/V. Hint-Text darunter erklärt den Unterschied. (4) **Recent Items DB-backed:** Vorher useState-only → nach Reload leer. Neuer Endpoint `GET /admin/erp/inventory/recent-activity?limit=10` mit CTE DISTINCT ON (inventory_item_id) für zeitpunkt-genaue Preis aus Movement-reference. (5) **Catalog-Price-Change loggt Movement:** `catalog_price_update` mit old_price/new_price/source in reference. Item-History zeigt jetzt auch Non-Session-Änderungen. (6) **Inventory-Hub Skeleton-Rendering:** Full-Page-Loading-Block entfernt (Frank: "5-10s bis was erscheint"). Stats-Zellen zeigen `—` bis Fetch kommt. (7) **Verifiziert-Timestamp in Hub-Tabelle:** neue Spalte mit DD.MM.YY HH:MM (de-DE). (8) **Back-to-Session-Banner im Catalog-Detail:** sessionStorage-Flag setzt Session beim Mount, Catalog-Detail zeigt goldenen Banner "← Zurück zur Inventur-Session" (6h-stale-guard). (9) **Label zeigt beide Conditions:** Media+Sleeve nebeneinander als `M:NM S:VG+` (statt single-string). (10) **Catalog-Suche findet Inventory-Barcodes:** whereIn-Subquery auf `erp_inventory_item.barcode`. Frank scannt VOD-000002 im Catalog-Search → findet Release. (11) **Barcode-Format umgestellt:** Alt `VOD-000001` kollidierte visuell mit article_number `VOD-19586`. Neu: `000001VODe` — Suffix statt Präfix, Ziffern zuerst für Scan-Efficiency. Session-Search-Regex akzeptiert BEIDE Formate (Übergangsphase). (12) **Label zeigt article_number zusätzlich:** neue kleine Header-Zeile oberhalb Barcode, 8pt Helvetica-Bold grau zentriert. Frank sieht Artikel (Release-Level) + Exemplar (Item-Level) auf einen Blick. (13) **Session scannt bereits-gescannte-Platten-Reset:** 4 Asmus-Tietchens-Exemplare via Supabase-SQL zurückgesetzt (barcode=NULL, conditions=NULL, price_locked=false) + Audit-Movement mit `reason=admin_reset` — damit Frank sie frisch mit neuem Format verifizieren kann. Gesamt: 10 commits, ~+700/-90 Zeilen. |
| **v1.0.0-rc37** | 2026-04-22 | `beta_test` | `ERP_INVENTORY` | **Print Bridge brother_ql-Backend — CUPS komplett umgangen.** Nach stundenlangem CUPS-Debug-Marathon bei Frank (AirPrint-Auto-Discovery + `dnssd://...ipps` URIs, LPD-Port-515-"0%"-stuck-Jobs, PPD-vs-IPP-Everywhere-Treiber-Konflikt, auch nach manuellem Driver-Neuconfig auf `lpd://<IP>/BINARY_P1`) war klar: CUPS-Drucker-Einrichtung ist pro Mac fragil und nicht reproduzierbar deployable. Saubere Antwort: die fertige Community-Library `brother_ql` (~2500 GitHub-Stars, seit Jahren stabil für QL-820NWB) für Direct-TCP-Raster-Send nutzen, CUPS komplett weglassen. **Python-Bridge v2.0.0:** neuer Backend-Zweig `send_to_brother_ql()` — pypdfium2 rendert PDF → PIL-Image, Pillow resize auf 306px Breite (Brother-nativ für 29mm @ 300dpi), brother_ql.convert produziert Raster-Instructions, TCP-Send an `tcp://<IP>:9100` (AppSocket). Keine CUPS-Queue, kein Brother-PPD, kein Drucker-Hinzufügen in macOS Systemeinstellungen. **Backend-Auswahl via env:** `VOD_PRINT_BRIDGE_BACKEND=brother_ql` (default) oder `cups` (legacy fallback). brother_ql-Backend braucht zusätzlich `VOD_PRINT_BRIDGE_PRINTER_IP` + `VOD_PRINT_BRIDGE_MODEL` (default QL-820NWB) + `VOD_PRINT_BRIDGE_LABEL` (default 29 = DK-22210 continuous). **Installer:** `install-bridge.sh` erstellt venv in `~/.local/lib/vod-print-bridge/venv/`, `pip install brother_ql==0.9.4 Pillow>=10 pypdfium2>=4`, Bonjour-Autodetect der Drucker-IP via `dns-sd` mit zsh-safem Prompt-Fallback. Neue Flags: `--printer-ip IP`, `--backend cups|brother_ql`, `--label 29|29x90`, `--model QL-820NWB`. plist-Template um PYTHON_BIN-Placeholder + neue Env-Vars erweitert. **Nebenfixes dieser Serie:** `install.sh` erkennt IPP-Everywhere-Drucker (`dnssd://...ipps` URI-Pattern) + schickt zur Systemeinstellungen-GUI für Brother-PPD-Neueinrichtung. Bridge nutzt `LC_ALL=C` für `lp` subprocess (DE-Locale job_id-Parse-Fix). Sample-Label-Endpoint von `/admin/print-test/*` auf `/admin/print-bridge/*` umbenannt weil Medusa API-Scanner `*test*`-Dirs filtert (rc35.2 had 404-Bug). install.sh bash-3.2-Hotfix (empty-array-unter-`set -u`). Response-Format der Bridge: `outcome="sent"` ist authoritative Erfolgs-Check, `did_print` unzuverlässig (brother_ql status-read timing false-negatives). **Validierung bei Frank:** Erste Label-Ausgabe mit brother_ql nach ~6h gesamtem Druck-Debug-Marathon heute morgen: 3679 bytes PDF → 88501 bytes Raster → physisch gedrucktes 29×90mm Label in der Hand. Frank schrieb „er hat gedruckt". |
| **v1.0.0-rc36** | 2026-04-22 | `beta_test` | `ERP_INVENTORY` | **Print Bridge auf HTTPS umgestellt (Safari Mixed-Content-Fix).** Nachdem Frank's Admin-UI die Bridge trotz laufendem Daemon als OFFLINE gezeigt hat, Root-Cause-Analyse: Safari blockiert `fetch()` von `https://admin.vod-auctions.com` nach `http://127.0.0.1:17891` als Mixed Content — auch für Loopback-Targets. Chrome + Firefox wären nachsichtiger gewesen, Safari ist strikt. Mein rc35-Design-Fehler: ich hatte W3C-Secure-Contexts-Spec (regelt JS-APIs wie crypto.subtle) mit Mixed-Content-Policy (regelt Subresource-Fetch) verwechselt. Safari braucht einen trusted cert. **Fix:** Bridge serviert jetzt HTTPS via `ssl.SSLContext` (Python stdlib, keine neuen Deps) mit mkcert-signiertem Cert. `install-bridge.sh` provisioniert das Cert: `brew install mkcert` (falls fehlt) → `mkcert -install` (einmal sudo fürs System-Keychain, fügt lokale CA hinzu) → `mkcert -cert-file cert.pem -key-file key.pem 127.0.0.1 localhost` → plist-Env-Vars `VOD_PRINT_BRIDGE_CERT/_KEY` → LaunchAgent reload. Health-Check im Installer probiert https:// + http:// (15s Timeout, 0.5s-Intervall). Client (`print-client.ts` + `print-test/page.tsx`): URL-Konstante `BRIDGE_URL` von `http://` auf `https://`. Python-Bridge `v1.0.0 → v1.1.0`. HTTP-Fallback bleibt erhalten: wenn `VOD_PRINT_BRIDGE_CERT` Env leer, startet Bridge auf HTTP mit Log-Warning — nur für Dev-Tests ohne mkcert. **Rollout:** Frank (+ Robin) muss einmal `cd ~/VOD_Auctions && git pull && bash frank-macbook-setup/install.sh` laufen lassen. Beim ersten Lauf: einmaliger sudo-Prompt für `mkcert -install`. Danach Admin-Badge „Silent Print" (grün). Validiert: auf Robins Mac installiert, Bridge läuft HTTPS, curl-Health+Printers+CORS-Preflight grün. **Known Issue:** Falls Frank den QZ-Tray-Web-App-Dock-Icon noch hat, muss der einmalig geschlossen + neu geladen werden (Safari-Cache). |
| **v1.0.0-rc35.2** | 2026-04-22 | `beta_test` | `ERP_INVENTORY` | **Print Bridge Diagnostik-Page (`/app/print-test`).** Ersetzt die alte `/app/qz-tray-test`-Seite (aus rc35 gelöscht) für den neuen Bridge-Stack. Features: Auto-Health-Polling (5s), CUPS-Queues-Tabelle mit „Als bevorzugt setzen"-Aktion, localStorage-Printer-Override (`vod.print.printer`), Test-Modi „Bridge-Only (Sample-PDF)" (neuer Endpoint `GET /admin/print-test/sample-label` generiert 29×90mm PDF mit „Cabaret Voltaire · Red Mecca · €42") und „Full-Flow (Inventory-Item)" (nutzt `printLabelAuto`), Aktivitäts-Log (letzte 50 Events, JSON-Detail-Pretty-Print), CLI-Diagnose-Snippets (curl, launchctl, tail). Keine Sidebar-Änderung — Sub-Page per URL erreichbar (`/app/print-test`). Folgt existierenden Design-Tokens (`C/T/S/PageHeader/SectionHeader/Btn/Badge/Toast`). | 
| **v1.0.0-rc35** | 2026-04-22 | `beta_test` | `ERP_INVENTORY` | **QZ Tray komplett ersetzt durch VOD Print Bridge (lokaler Python-LaunchAgent).** QZ Tray war ein Dauerbrenner: rc30-rc33 waren überwiegend QZ-Debugging (override.crt ins App-Bundle mit sudo, PDF-base64-Flavor, signed-Handshake-Errors, silent-Print-Zertifikate, .pkg-Install statt brew-Cask nachdem der Cask aus Homebrew entfernt wurde). Root-Cause: QZ Tray ist für echtes Silent-Print ein Java-Daemon mit signierten WebSocket-Requests, RSA-Keypair-Dance und CertProvider-INTERNAL-Mode — jedes macOS-Update und jedes QZ-Update kann das Cert-Setup brechen. **Lösung:** Ein winziger Python-stdlib HTTP-Server (`frank-macbook-setup/print-bridge/vod_print_bridge.py`, ~250 Zeilen) läuft als User-LaunchAgent auf `127.0.0.1:17891`, nimmt PDF-Label-Jobs per POST entgegen und ruft `lp -d Brother_QL_820NWB -o PageSize=Custom.29x90mm` auf — nutzt die bereits am 2026-04-11 hardware-validierte CUPS-Config unverändert weiter. **Endpoints:** `GET /health` (für Admin-Header-Status-Badge), `GET /printers` (via `lpstat -e` — wichtig weil `lpstat -p` auf macOS-DE-Locale lokalisierte "Drucker …" strings liefert die LC_ALL=C nicht beeinflusst), `POST /print` (raw `application/pdf` ODER JSON mit `pdf_base64`, max 10 MB, `%PDF`-Magic-Number-Validation). **CORS:** Whitelist für `admin.vod-auctions.com` + `localhost:9000/7001`, mit `Access-Control-Allow-Private-Network: true` auf Preflight (Chrome ≥123 Private-Network-Access-Spec). **Installer:** `print-bridge/install-bridge.sh --printer X --dry-run --uninstall` — idempotent, schreibt plist nach `~/Library/LaunchAgents/com.vod-auctions.print-bridge.plist` mit `plutil -lint` Validation, `launchctl bootstrap gui/$(id -u)`, wartet bis zu 15s auf ersten Health-Check. **Dry-Run-Mode:** Bridge läuft ohne Brother-Drucker (z.B. Robins Dev-Mac) — schreibt PDFs nach `/tmp/vod-label-*.pdf` statt drucken, damit Dev-Tests möglich sind. **Admin-Client:** `backend/src/admin/lib/print-client.ts` ersetzt `qz-tray-client.ts` komplett — gleiche Public-API (`printLabelAuto`, `printerAvailable`, `listPrinters`, `getPreferredPrinter`), aber intern fetch() gegen Bridge + iframe-Fallback bei Offline. Badge-Label in Session-UI von "QZ Tray" auf "Silent Print" geändert. **Rip-out:** Gelöscht — `backend/src/admin/lib/qz-tray-client.ts`, `backend/src/api/admin/qz-tray/{cert,sign}/route.ts`, `backend/src/admin/routes/qz-tray-test/page.tsx`, `frank-macbook-setup/qz-signing/{README.md,override.crt}`. Env-Vars `QZ_SIGN_PRIVATE_KEY` + `QZ_SIGN_CERT` sind jetzt tot. **`install.sh` Step 3** entfernt altes QZ Tray falls vorhanden (pkill, Login-Item, LaunchAgents, Application-Bundle mit sudo, Application-Support-Dir) und installiert die Bridge. **`verify-setup.sh`** prüft jetzt LaunchAgent-Status, Health-Endpoint, CUPS-Printer-Resolution, Dry-Run-Flag. **Rollout-Plan:** `bash install.sh` auf 3 Macs (Franks MacBook Air, Franks Mac Studio, Robins MBP) — idempotent, altes QZ wird auto-gepurged. **Neue Doku:** `frank-macbook-setup/print-bridge/README.md` als Source-of-Truth (Architektur, Endpoints, Security-Modell, Troubleshooting, Dev-Workflow); INSTALLATION.md, README.md, TROUBLESHOOTING.md und CLAUDE.md-Gotcha-Liste aktualisiert. **Validierung lokal:** Bridge installiert, Health `{"ok":true,"printer_found":true,"dry_run":true,"cups_available":true}`, Printers-Endpoint listet 3 CUPS-Queues (Brother QL-1100, QL-820NWB, Epson ET-4850), Raw-PDF-Upload + base64-JSON-Upload + invalid-PDF-Rejection getestet, CORS+PNA-Preflight grün, Uninstall clean. |
| **v1.0.0-rc34** | 2026-04-22 | `beta_test` | `ERP_INVENTORY` | **Multi-Word-Search via Postgres FTS + Inventory-Hub-Stats 6.5s → 150ms.** Franks weitere Beobachtungen: (1) „Inventory-Seite lädt 5–10s" und (2) „Suche nach 'music various' findet den Vanity-Various-Release nicht". **Stats-Endpoint:** EXPLAIN ANALYZE zeigte 6540ms Seq Scan auf gesamte Release-Tabelle (52k Rows) — Hash Join wegen legacy_price-Check + format-Breakdown. Fix in 3 Teilen: Main-Aggregate ohne JOIN (103ms), Missing-Count separat mit idx_release_legacy_price (~5ms), Format-Breakdown via `MATERIALIZED CTE` damit kleine erp-Seite zuerst läuft (70ms). Promise.all wartet auf langsamste → Endpoint gesamt ~150ms statt 6.5s (~43×). **Multi-Word-Search:** Bisherige UNION-über-trgm-Indizes suchte „music various" als exakte Substring — keine Spalte enthält das. Alternative INTERSECT-Ansatz mit 2 Token-CTEs wäre korrekt aber langsam (~13s bei generischen Tokens wegen 5k Artist-Join-Matches). Richtige Lösung: Migration `2026-04-22_release_search_text_fts.sql` mit neuer denormalisierter `Release.search_text` Spalte (title + catalogNumber + article_number + artist.name + label.name, lowercase), GIN tsvector Index `idx_release_search_fts`, und Trigger `release_update_search_text` für automatische Pflege bei Release INSERT/UPDATE. Backfill 52.777 Rows ausgeführt. Shared Helper `backend/src/lib/release-search.ts` mit 4 Einstiegspunkten (`buildReleaseSearchWhereRaw`, `buildReleaseSearchWhereRawAliased`, `buildReleaseSearchSubquery`, `getSearchTokens`). Tokens werden gesplittet, tsquery-breaking chars gestript, Prefix-Match `:*` + AND `&` kombiniert. Alle 3 Such-Endpoints konsequent umgestellt: `/admin/erp/inventory/search`, `/store/catalog`, `/store/catalog/suggest`. **Messungen:** 6–13s → 20ms (Backend EXPLAIN), live „music various" 1.34s statt Timeout, „asmus tietchens" 168ms, „tietchens" 82ms. VOD-16530 ist jetzt erster Treffer bei „music various vanity". **Limitation dokumentiert:** Artist/Label-Namensänderungen triggern kein automatisches search_text-Update; bei VOD praktisch nicht vorkommend, sonst periodischer Reindex-Job als Follow-up. |
| **v1.0.0-rc33** | 2026-04-22 | `beta_test` | `ERP_INVENTORY` | **Search-Performance 47× (6s → 130ms) + Article-Number-Search + Discogs-UI-Semantik + PM2-Config-Fix.** Franks Beobachtung „Admin-Suche ist viel langsamer als Storefront" + „Suche nach VOD-19586 findet nichts" + „Discogs Low/Med/High unlogisch" → systematischer Fix quer durch Admin- und Storefront-Layer. **Search-Performance (kritisch):** `EXPLAIN ANALYZE` bestätigte 6071ms Execution (Seq Scan 52.651 Rows, 52.651 Rows Removed by Filter) für `/admin/erp/inventory/search` mit Multi-Column-ILIKE-OR. Bestehender `idx_release_title_trgm` (gin auf `lower(title)`) wurde nicht angezogen, weil SQL `title ILIKE ?` statt `lower(title) LIKE ?` schrieb. Fuer Artist.name, Release.catalogNumber, Release.article_number, Label.name fehlten trgm-Indizes komplett. Fix: Migration `2026-04-22_search_trigram_indexes.sql` mit 4 neuen GIN trgm Indizes (`idx_artist_name_trgm`, `idx_release_catno_trgm`, `idx_release_article_trgm`, `idx_label_name_trgm`, alle auf `lower(col) gin_trgm_ops`). Plus: Query-Umbau auf CTE mit UNION über 4–5 Einzelspalten-Subqueries — jede hit ihren eigenen Index via BitmapOr, Deduplication via UNION, dann Final-JOIN für Projection + Ranking. Gemessen: Admin 6071ms → 128ms, Storefront `/store/catalog?search=cabaret` ~5000ms → 148ms (live TLS + Nginx + DB gemessen), `/store/catalog/suggest` (Autocomplete) ~2s → 57ms. Count-Match mit 5 Test-Begriffen verifiziert identische Result-Sets zwischen alter und neuer Query. Durchsucht weiterhin alle 52.777 Releases, nur schneller. **Article-Number-Search:** Franks tape-mag Katalognummer `VOD-19586` (Release.article_number) war nicht suchbar — Admin-Such-Code matchte nur `artist/title/catalogNumber/barcode`. Fix: Step 1b „Article-Number Exact-Match" im Admin-Search vor Text-Search, plus `article_number` in ILIKE-OR und Ranking. Scanner-Regex von `^VOD-\d{6}$` auf `^VOD-\d+$` gelockert damit variable-length article_numbers akzeptiert werden. Frontend: Search-Placeholder erweitert, article_number monospace/gold in Treffer-Zeile + Release-Detail-Header. **Discogs-Preis-Semantik in Inventur-Session:** Asmus Tietchens zeigte „Low €20 · Med €4.53 · High €12.30" — unlogisch, weil Low und Med/High aus zwei verschiedenen Discogs-APIs stammen (`/marketplace/stats` vs `/marketplace/price_suggestions`). Zwei semantisch klar getrennte Zeilen statt Low/Med/High-Tripel: „Markt aktuell: ab €20 · N im Angebot" + „Discogs-Suggestion: Median €X · Mint €Y (je Zustand)" + Link „Sales-History auf Discogs ansehen". Drei Quick-Fill-Buttons neben Preis-Input (`[D] Sugg`, `Mint`, `Markt`) statt nur `[D] Median`. Sales-Statistik aus Bild 13 (€11.01/€13.14/€15.27) ist nur auf discogs.com, nicht via Public API — Link führt dorthin. **Asmus-Tietchens Reset:** VOD-19586 direkt via Supabase-SQL zurückgesetzt (condition/exemplar_price/price_locked/stocktake-Timestamps → NULL, Barcode `VOD-000001` bleibt erhalten, Audit-Movement mit reason=`stocktake_reset` + old-values-reference). **PM2-Config-Fix (unexpected):** Nach `pnpm install` war `storefront/node_modules/.bin/next` ein Shell-Wrapper statt Symlink — PM2's ProcessContainerFork versuchte ihn als JS zu require() → SyntaxError + errored-Status. Fix: `storefront/ecosystem.config.js` nutzt jetzt direkten Entry-Pfad `node_modules/next/dist/bin/next`. |
| **v1.0.0-rc32** | 2026-04-21 | `beta_test` | `ERP_INVENTORY` | **Storefront-Preis-Konsistenz + QZ-Tray-Install-Fix + Multi-Surface Label-Print.** Nach Robins „Konsistenz-ist-nicht-dein-Ding"-Feedback systematisches Audit aller heute eingeführten Patterns quer durchs Repo. **Preis-Audit Task #18 — echter Bug gefunden & gefixt:** Storefront las nur `legacy_price`; ein via ERP-Stocktake erfasster Non-Cohort-A Release (z.B. Asmus Tietchens `legacy-release-23464`, `legacy_price=NULL, direct_price=44, exemplar_price=44`) war im Admin kaufbar dargestellt, im Storefront aber `is_purchasable=false` + Preis-Render `Number(null).toFixed()=NaN`. Fix in `/store/catalog/route.ts` + `/store/catalog/[id]/route.ts`: neues `effective_price = COALESCE(legacy_price>0, direct_price>0)`, `is_purchasable` auf dieser Basis, `for_sale=true` Filter berücksichtigt beide Preisquellen via SQL-Subquery, Preis-Sort `COALESCE(legacy_price, direct_price) ASC`. Frontend-Kompat: wenn `legacy_price IS NULL AND direct_price>0` im Response wird `legacy_price = direct_price` normalisiert, damit bestehende Frontend-Stellen `Number(legacy_price).toFixed(2)` nicht `NaN` rendern. **Audit-Tasks #19 (Condition), #20 (genres/styles Array), #21 (UUID↔TEXT JOINs): clean, kein Fix nötig** — Storefront nutzt für Condition `Release.media/sleeve/legacy_condition` (Mirror vom Admin-POST greift), für Genre-Filter `entity_content.genre_tags` (Artist-Level, nicht Release.genres) und einzige uuid-Spalte ist `Release.current_block_id` welches bereits in rc31 mit `::text`-Cast im JOIN gefixt wurde. **Multi-Surface Label-Print (Franks Report „Label drucken öffnet nur Tab"):** Der rc31-Silent-Print-Fix war nur in `admin/routes/erp/inventory/session/page.tsx` eingebaut, nicht in `admin/routes/media/[id]/page.tsx`. Extrahiert `printLabelAuto(id)` als shared helper in `backend/src/admin/lib/qz-tray-client.ts` (try QZ Tray → fallback iframe-print-dialog → last resort new tab). Beide Label-Buttons im Catalog-Detail (Single-Exemplar Action-Bar + Multi-Exemplar-Tabelle) + Session-Page nutzen jetzt denselben Helper → 3 Code-Pfade konsolidiert. **Label-PDF: 2-Page-Bug gefixt.** `generateLabelPdf` produzierte „Seite 1 von 2" mit leerer zweiter Seite — Ursache: `autoFirstPage:true` (pdfkit default) + implizite Page-Creation durch `drawLabel`'s text-Aufrufe nach save/restore/rotate. Fix: `autoFirstPage:false` + manueller `addPage()`. **QZ Tray Install via Direkt-.pkg-Download:** `brew install --cask qz-tray` failed (Cask wurde aus Homebrew-Registry entfernt, `No Cask with this name exists`). `frank-macbook-setup/install.sh` zieht jetzt das offizielle signed/notarized .pkg v2.2.6 direkt von `github.com/qzind/tray/releases`, auto-detect arm64 vs x86_64 via `uname -m`, silent-install via `sudo installer -pkg ... -target /`. Auf Robins Mac manuell validiert (M-Serie arm64). **Neue Installations-Anleitung `INSTALLATION.md`:** Schritt-für-Schritt Step-by-Step Guide für MacBook Air M5 + Mac Studio — Homebrew-Check, Kit-Download (Git clone / ZIP), Brother-Treiber-Link, 7-Step `install.sh` mit Zeit-Schätzungen pro Schritt, Scanner-DE-Tastatur-Konfig, QZ-Tray-Approval-Flow, Admin-Login, Troubleshooting-Matrix, Re-Run-Sicherheit, Zweit-Mac-Ablauf. |
| **v1.0.0-rc31** | 2026-04-21 | `beta_test` | `ERP_INVENTORY` | **Inventur v2 Bug-Fixes nach echtem Test-Durchlauf + Silent-Print.** Franks erster End-to-End-Test (Asmus Tietchens `legacy-release-23464`, Barcode `VOD-000001`) förderte 12 Bugs zutage, alle in einem Zug gefixt. **Inventur-Session:** Vorab-Werte aus `Release.legacy_condition`/`legacy_price` als Fallback wenn erp-Felder NULL (P0.1); iframe-Print öffnet Druck-Dialog automatisch statt nur Tab zu öffnen (P0.4); Re-Print + Re-Edit Buttons auf jeder Copy-Row auch nach Verify (P0.5). **Label-PDF:** `ellipsis:true` + height-Clip auf allen 3 Text-Zeilen verhindert den Wrap-Overlap-Bug bei langen Label-Namen (P0.6, Beispiel Bild: „Discos Esplendor" overlappte mit Meta-Zeile); Preis-Source jetzt `COALESCE(exemplar_price, direct_price, legacy_price)` — deckt Copy #2+ und Non-Cohort-A ab, Condition kombiniert erp `condition_media/sleeve` mit Legacy-Fallback (P0.7). **Catalog Source-of-Truth:** `/admin/media/:id` GET merged erp-Werte aufs Release-Objekt (`media_condition`/`sleeve_condition`/`inventory` via Object.assign Override), POST schreibt in erp+Release parallel (Q1b/P0.2); JSX-Text-Escape-Literal `—` in Condition-Dropdowns gefixt (P0.3, wurde als „NM — Near Mint" literaler String gerendert); Unlock-Price Button im Inventory-Status (Multi+Single-Exemplar) + neuer `POST /admin/erp/inventory/items/:id/unlock-price` Endpoint (Q2); „Block ID" → „Active Auction" Link (via LEFT JOIN auction_block mit explicit `::text` Cast wegen UUID↔TEXT-Mismatch), bei NULL ausgeblendet (Q6); Discogs-Linking-Card mit editierbarer Discogs-ID + Genre + Styles + „Fetch from Discogs"-Button (POST `/admin/media/:id/refetch-discogs` — zieht frische Metadaten + Preise, Q8a); Discogs-Preise in 2 semantisch klare Sections aufgeteilt („Marktpreis aktuell" = Low+For-Sale+Have+Want, „Historische Preis-Suggestions" = Median+High, Q9). **Silent-Print (P1.1):** Neuer `backend/src/admin/lib/qz-tray-client.ts` (lazy CDN-Load von qz-tray@2.2.4, unsigned-mode Einmal-Prompt, fuzzy Brother-Printer-Match als Fallback), `session/page.tsx` nutzt `qzPrintBarcodeLabel()` mit iframe-Fallback wenn QZ Tray nicht erreichbar; `frank-macbook-setup/install.sh` ergänzt um Printer-Queue-Name-Hinweis + DevTools-Setzen-Anleitung bei abweichendem Namen. **Schema-Fixes:** `Release.genres/styles` sind TEXT[] nicht TEXT — bestehender UI-Bug (Frank sah „Genre leer" obwohl Daten da waren, weil Code `release.genre` Singular las) gefixt, alle neuen Änderungen arbeiten nativ mit Arrays. `Release.current_block_id` UUID vs `auction_block.id` TEXT → `::text`-Cast im JOIN, sonst Postgres `42883`-Crash → Frontend „Release not found" bei existierendem Record. **Preis-Mirror:** Save im Edit-Valuation spiegelt `direct_price` → `exemplar_price` wenn genau 1 Exemplar existiert + setzt `price_locked=true` — damit zeigt das Label nach Preis-Änderung + Save direkt den neuen Wert (Multi-Exemplar skipped, muss über Inventur-Session). **Neue Scripts:** `scripts/backfill_genre_styles.py` (non-destructive, füllt leere `genres`/`styles` aus `discogs_api_cache`, gelaufen → 137 Releases aktualisiert); `scripts/audit_discogs_mappings.py` (SequenceMatcher-Similarity zwischen VOD Artist+Title und Discogs-Cache, CSV-Output sortiert nach Score, gelaufen → 431 geflaggte Mappings bei Threshold 0.65, Export in `docs/audit_discogs_flagged_2026-04-21.csv`). Session-Log: `docs/sessions/2026-04-21_inventur-v2-bug-fixes.md`. |
| **v1.0.0-rc30** | 2026-04-14 | `beta_test` | `ERP_INVENTORY` | **Frank-MacBook-Setup-Kit.** Installations-Kit unter `frank-macbook-setup/` für Franks MacBook Pro 16" A2141 (Intel) zur Inbetriebnahme Brother QL-820NWBc + Inateck BCST-70 + QZ Tray + Admin-Web-App. `install.sh` interaktiv 7-stufig (idempotent): System-Check → Brother-Driver-Check → QZ Tray via Homebrew Cask → CUPS `Custom.29x90mm` User-Default → Drucker-Raster-Mode-Guide (öffnet Web-UI + Anleitung) → Safari-Web-App → Test-Print. `scripts/generate-test-label.py` — pure Python stdlib PDF-Generator (kein Dependency, schreibt PDF-1.4 direkt nach Spec, rotiertes Content-Stream-Model identisch zur Production `barcode-label.ts`). `scripts/verify-setup.sh` Sanity-Check mit Locale-sicherer Queue-Name-Extraktion (`LC_ALL=C` + Anführungszeichen-Strip für deutsche Locale). `ANLEITUNG_FRANK.md` — tägliche Bedienung auf Deutsch (Inventur-Modus + POS). `docs/TROUBLESHOOTING.md` + `docs/PRINTER_WEB_CONFIG.md` + `docs/POS_NOTES.md` + `scanner/SCANNER_SETUP.md` — vollständige Troubleshooting-Matrix aus Hardware-Marathon 2026-04-11 destilliert. BCST-70 Manual als Symlink nach `docs/hardware/` (keine Duplikation). Bewusst NICHT im Kit: Brother .pkg (60 MB, keine Re-Host-Rechte), A4-Bondrucker-Setup, Login-Credentials (mündlich/1Password). |
| **v1.0.0-rc29** | 2026-04-12 | `beta_test` | `ERP_INVENTORY` | **Image Storage: Discogs-Hotlinks eliminiert + iPhone-Upload.** 43.025 Discogs-Bilder zu R2 migriert (3h Laufzeit, 0 Fehler, ~65% WebP-Kompression, Prefix `tape-mag/discogs/`). Discogs-Import-Commit schreibt neue Bilder direkt zu R2 statt Hotlink (graceful fallback wenn R2 nicht konfiguriert). iPhone-Foto-Upload im Stocktake: `POST /admin/erp/inventory/upload-image` (base64 JSON, sharp-optimiert, R2 Prefix `tape-mag/uploads/`). Shared Library `backend/src/lib/image-upload.ts` (`optimizeImage`, `uploadToR2`, `downloadOptimizeUpload`, `isR2Configured`). Camera-Button `capture="environment"` öffnet direkt iPhone-Kamera. Migration-Script `scripts/migrate_discogs_images_to_r2.py` (idempotent, rate-limited 5/s, resume-fähig). 4 Hotlinks verbleiben (auf Discogs 404 = gelöscht). |
| **v1.0.0-rc28** | 2026-04-12 | `beta_test` | `ERP_INVENTORY` | **Inventur Workflow v2: Search-First + Exemplar-Modell (4 Phasen).** Kompletter Umbau weg vom Queue-Driven Workflow (Frank kann nicht mit Queue arbeiten — Lager unsortiert). Neuer Ansatz: Frank nimmt Artikel → sucht im System → bewertet → bestätigt → Label druckt. **Phase 0 (abwärtskompatibel):** 4 Regression-Fixes für Multi-Exemplar Support in bestehendem Code (admin/media/route.ts LEFT JOIN → Aggregat-Subquery, admin/media/[id] als separates Array, UI mit Exemplar-Tabelle, Export mit Barcode-Spalte). **Phase 1 (Kern):** Schema-Migration (`condition_media`, `condition_sleeve`, `copy_number`, `exemplar_price`, UNIQUE(release_id, copy_number)). 3 neue APIs: `/search` (Barcode-Exact + ILIKE Text, sucht ALLE 50.958 Releases), `/release/:id/copies`, `/items/add-copy`. Verify-API erweitert um Condition + exemplar_price. Session-Screen komplett neu: Suchfeld + Trefferliste + Exemplar-Liste + Goldmine-Grade-Selector (M/NM/VG+/VG/G+/G/F/P) + Discogs-Median-Override + Legacy-Condition-Pre-Fill. **Phase 2 (Dashboard):** Browse-API mit Tabs (Alle/Verifiziert/Ausstehend/Mehrere Ex.), Stats erweitert (total_releases, Exemplar-Counts, Tages-Stats, Format-Breakdown, avg_price), Hub-Page Umbau. **Phase 3 (Fehlbestand):** Missing-Candidates API + Bulk-Mark-Missing mit Sicherheitsabfrage. Konzept: `docs/optimizing/INVENTUR_WORKFLOW_V2_KONZEPT.md` v2.0 inkl. Impact-Analyse (33 Dateien geprüft, 4 kritisch C1-C4, 3 hoch H1-H3, 10 sicher). |
| **v1.0.0-rc27** | 2026-04-12 | `beta_test` | `ERP_INVENTORY` | **ERP Inventory: Bulk +15% ausgeführt + V5 Scratch-Test bestanden.** V5 Sync-Schutz erstmalig unter Last verifiziert (Test-Item `legacy-release-28094` mit `price_locked=true` → Sync-Run 06:00 UTC bestand ohne Violations). Bulk +15% auf 13.107 Cohort-A Items: €404.929 → €465.358, alle Preise auf ganze Euro gerundet, 13.107 Audit-Movements erstellt. Alle Items `price_locked=true`. System ready für Frank's Inventur-Sessions. |
| **v1.0.0-rc26** | 2026-04-12 | `beta_test` | — | **Discogs Import: Session Lock Refactor.** Ersetzt fragiles rc25 JSONB-CAS run_token (manuell an 5 Stellen persistiert) durch dedizierte `session_locks` Tabelle mit PK-Constraint. Lock Helper API (acquireLock/validateLock/releaseLock/startHeartbeatLoop 30s). Lock-Acquisition im POST-Handler statt im Loop (Codex C1). Phase-Preconditions (C2), Terminal-Write Guards (C3), Control-Flag Preservation bei Takeover (C7). Bundled: K1 effectiveRunId Resume-Fix, K2+ run_id in allen Terminal-States via buildTerminalProgress(), M2 rateLimit Event-Emission, M4 row_progress → 5s timed Progress-Update. ~200 Zeilen rc25-Code entfernt (isSupersededBy, run_token, in-batch heartbeats, hoisted mutable vars). Plan: `DISCOGS_IMPORT_SESSION_LOCK_PLAN.md`. Codex-reviewed mit 4 Amendments. |
| **v1.0.0-rc25** | 2026-04-11 | `beta_test` | — | **Discogs Import: Race-Condition-Fix für Commit-Loop.** rc24's 60s Stale-Detection war zu aggressiv — legitime `new_inserts` Batches von 500 Rows (ensureArtist + ensureLabel + INSERT Release + Tracks + Images) brauchen 90-120s und emitteten dabei keine Events → UI feuerte fälschlich auto_restart POST → Backend akzeptierte als "stale" → zwei Loops parallel → Run 1 committed Batch 1 während Run 2 parallel in die V3-"id_already_exists"-Validation lief → 500 Fake-Errors. **4-Layer Fix:** (L1) In-Batch Heartbeats alle 25 Rows + sichtbare row_progress Events alle 100 Rows in `processInBatches`. (L2) Stale-Threshold auf 180s in UI + allen 3 Backend-Routes (fetch/analyze/commit). (L3) Run-Token CAS-Guard: jeder Commit-Loop schreibt `commit_progress.run_token` und prüft vor jedem batchTrx.commit() + vor jedem Status-Write ob der Token noch seiner ist — falls nicht, rollback + clean exit (verhindert dass superseded Loops Daten oder Status committen). (L4) `commit_progress.completed_batches_*` + `run_id` werden beim Restart preserviert statt überschrieben → echter Resume nach pm2-restart möglich. V3-Validation ist jetzt resume-aware und excludiert bereits-committed discogs_ids aus dem "exists in DB" Check. |
| **v1.0.0-rc24** | 2026-04-11 | `beta_test` | — | Discogs Import: Stale-Loop Auto-Restart während aktivem Polling (schließt die Lücke zwischen rc18-Decoupling und pm2-Kills). Polling-Callback detected `last_event_at > 60s alt` → auto-POST zum passenden Endpoint mit 60s Cooldown. Commit-Route Fallback auf `session.import_settings` damit Auto-Restart nur mit `session_id` die User-Settings findet. **Bug in rc24:** der 60s-Threshold erfasste auch legitime lange Batches → Race-Condition → siehe rc25-Fix. |
| **v1.0.0-rc23** | 2026-04-11 | `beta_test` | — | Media Catalog: Neue Filter-Dimension Import + Inventory. Dropdown für Discogs-Collection-Herkunft (+counts), Import-Action, Inventory-State, Status, Stocktake (done/pending/stale @90d), Warehouse-Location, Price-Locked. Neuer API-Endpoint `GET /admin/media/filter-options` liefert Dropdown-Daten. |
| **v1.0.0-rc22** | 2026-04-11 | `beta_test` | — | Media Detail: Neue "Inventory Status" Sektion mit Stocktake-Audit-Trail (Status-Badges, Metadata-Grid, Movement-Timeline) + Deep-Link "In Stocktake-Session laden" und "Label drucken" Buttons. Neuer API-Endpoint GET /admin/erp/inventory/items/:id für Item-Lookup by id (für Items ohne Barcode). |
| **v1.0.0-rc21** | 2026-04-11 | `beta_test` | — | Stocktake Session: Unified Scanner/Shortcut Handler mit 40ms-Debounce — fixt Race-Condition zwischen USB-HID-Scanner-Input und Single-Key-Shortcuts (V/M/P/N/L/U) im Inventur-Session-Screen. Phase B6 aus INVENTUR_COHORT_A_KONZEPT §14.11 damit abgeschlossen. Plus: POS Walk-in Sale Konzept v1.0 (Draft) als neues Design-Dokument. |
| **v1.0.0-rc20** | 2026-04-11 | `beta_test` | — | Discogs Import: Analyze + Commit Routes ebenfalls entkoppelt (SSEStream Headless Mode — alle 3 lang laufenden Ops sind jetzt detached), Post-Import Call-to-Action-Card, Import History Section im Media-Detail (zeigt aus welchem Import ein Release stammt) |
| **v1.0.0-rc19** | 2026-04-11 | `beta_test` | — | Barcode-Label Hardware Validation: Brother QL-820NWBc + DK-22210 + Inateck BCST-70 End-to-End getestet. Production-Code Fix: 29×90mm Layout mit Artist/Title·Label/Meta/Preis-Spalten. Neue Hardware-Doku + Debugging-Kompass. |
| **v1.0.0-rc18** | 2026-04-11 | `beta_test` | — | Discogs Import: Fetch Loop vom HTTP-Request entkoppelt — Navigation während Fetch killt den Loop nicht mehr, Loop läuft detached im Hintergrund, Idempotenz + Stale-Auto-Restart, UI nur noch Polling |
| **v1.0.0-rc17** | 2026-04-11 | `beta_test` | — | Discogs Import: Collections Overview als eigenständige Route (kein Tab mehr), Detail Page mit 8-Karten Stats, Clickable Cover/Title, Stock-Spalte, 27-column CSV Export, Stale-Session Auto-Cleanup nach 6h, Back-Button Fix (Btn-Component-Bug) |
| **v1.0.0-rc16** | 2026-04-10 | `beta_test` | — | Discogs Import Commit Hardening + Schema Fixes: Per-Batch Transaktionen, Pre-Commit Validation, Pargmann Import 5.646 releases done |
| **v1.0.0-rc15** | 2026-04-10 | `beta_test` | — | Discogs Import Live Feedback: SSE für alle 4 Schritte, Heartbeat, Resume, Cancel/Pause, Event-Log |
| **v1.0.0-rc14** | 2026-04-10 | `beta_test` | — | Discogs Import Refactoring: DB-Sessions, DB-Cache, pg_trgm Fuzzy-Matching, Transaktionen |
| **v1.0.0-rc13** | 2026-04-10 | `beta_test` | — | Discogs Import: Server-side API Fetch with SSE, complete end-to-end workflow |
| **v1.0.0-rc12** | 2026-04-10 | `beta_test` | — | Media Detail: Field Contrast, Storage Location, Credits/Tracklist 1:1 Frontend-Logik |
| **v1.0.0-rc11** | 2026-04-09 | `beta_test` | — | Admin Media Detail: Light-Mode Design System + Tracklist/Notes Parsing |
| **v1.0.0-rc10** | 2026-04-09 | `beta_test` | — | 3-Tier Pricing Model, Discogs Price Suggestions, Condition/Inventory/Markup Settings |
| **v1.0.0-rc9** | 2026-04-09 | `beta_test` | — | Discogs Import v2: Full Enrichment, Admin Approval, Condition/Inventory, Live Progress |
| **v1.0.0-rc8** | 2026-04-09 | `beta_test` | — | Fullscreen Image Lightbox |
| **v1.0.0-rc7** | 2026-04-09 | `beta_test` | — | Discogs Collection Importer v1: CLI + Admin UI + 4 API Routes |
| **v1.0.0-rc6** | 2026-04-07 | `beta_test` | — | Sync Robustness v2, Email Overhaul, Feature-Flag-Infrastruktur, ERP Konzept v5.0, Staging DB, UI/UX Pass, Sentry, Redis, R2 CDN, CRM, Pre-Launch System |
| **v1.0.0-rc5** | 2026-03 | `beta_test` | — | Sync Dashboard + Change Log Tab |
| **v1.0.0-rc4** | 2026-03 | `beta_test` | — | Diverse Bugfixes |
| **v1.0.0-rc1** | 2026-03 | `beta_test` | — | README.md |
| **v0.10.0** | 2026-03 | `beta_test` | — | E2E Tests + Storefront OOM Fix |
| **v0.9.0** | 2026-03 | `beta_test` | — | Share Feature + Catalog Mobile Fix |
| **v0.8.0** | 2026-03 | `beta_test` | — | legacy_price.toFixed Crash-Fix |
| **v0.7.0** | 2026-02 | `beta_test` | — | Cart + Direktkauf für alle Auth-User |
| **v0.1.0–v0.6.0** | 2026-02 | `alpha` | — | Clickdummy → Grundsystem |

### Feature Flag Aktivierungs-Roadmap

Welche Flags für welchen Release geplant sind (kein Commitment — wird bei Release aktualisiert):

| Flag | Status | Planned für | Voraussetzung |
|------|--------|-------------|---------------|
| `ERP_INVOICING` | deployed, off | v1.1.0 | Steuerberater-Sign-off, sevDesk-Integration |
| `ERP_SENDCLOUD` | deployed, off | v1.1.0 | Sendcloud-Account, Tarif-Mapping |
| `ERP_INVENTORY` | **active** | v1.0.0-rc26 | ✅ Aktiviert 2026-04-12, Bulk +15% ausgeführt, Inventur-Phase gestartet |
| `ERP_COMMISSION` | deployed, off | v1.2.0 | Konsignationsverträge |
| `ERP_TAX_25A` | deployed, off | v1.2.0 | §25a Prüfung Steuerberater |
| `ERP_MARKETPLACE` | deployed, off | v2.0.0 | Multi-Seller Konzept, Stripe Connect |
| `EXPERIMENTAL_SKIP_BID_CONFIRMATION` | deployed, off | — | Trial-Only, kein Prod-Termin |
| `EXPERIMENTAL_STORE_SITE_MODE_DEBUG` | deployed, off | — | Trial-Only, kein Prod-Termin |

### Konventionen

- **Versionsformat:** `v{MAJOR}.{MINOR}.{PATCH}[-rc.N]`
- **Pre-Production:** `-rc.N` Suffix (Release Candidate), kein formales QA-Gate
- **Minor Release** (`v1.x.0`): Gruppe von Features die gemeinsam aktiviert werden
- **Patch Release** (`v1.0.x`): Kritische Bugfixes zwischen geplanten Releases
- **Tagging-Workflow:** `git tag -a vX.Y.Z -m "Release vX.Y.Z: <Kurzname>"` → `git push origin vX.Y.Z`
- **Tag-Zeitpunkt:** Direkt nach Deploy + Smoke-Test auf Production — nicht vor dem Deploy

---

## 2026-04-25 — Format-V2: 71-Wert-Whitelist + Backfill 52.788 Items + UI durchgängig (rc51.7)

**Kontext:** Robin: „Wir müssen uns leider nochmals mit den Formaten beschäftigen. Wir haben einen Fehler gemacht bei der Übernahme der Formatdefinitionen von tape-mag.com — wir haben deutlich zu wenig Unterscheidungen in unserer DB. Das zeigt sich auch beim Discogs-Import." Der alte `ReleaseFormat`-Enum (16 Werte: `LP`, `CD`, `CASSETTE`, …) verschmolz zwei orthogonale Dimensionen ungewollt zu einer: (a) **Format-Typ** (Vinyl 7" / 10" / 12" / LP, MC, Reel, CD …) und (b) **Anzahl Tonträger** (Single-Disc vs. Box mit 2-32 Stück). Die `-N`-Suffixe in tape-mags `Format`-Tabelle (`Vinyl-Lp-5`, `Tape-26`, `Vinyl-7"-3`) waren ursprünglich keine Sortier-Hilfen, sondern bedeuteten **„LP-Box mit 5 Platten"**, **„26 Cassetten in Box"**, **„Box mit 3 7"-Singles"** — diese Information ging verloren, alle wurden auf `LP` oder `CASSETTE` kollabiert. Discogs liefert dieselbe Info als `formats[0].qty: "6"` (Anzeige `6× Vinyl, LP`), aber das `qty` wurde im `discogs_api_cache` nur abgelegt und nie auf `Release` durchgereicht.

**Frank-Entscheidungen** (CSV-Roundtrip 4× gegen Discogs-Cache-Distribution):
1. **Internal-Werte URL-safe** (kein `"`-Zeichen): `Vinyl-7-Inch` statt `Vinyl-7"`. Frontend rendert `Vinyl 7"` über `displayFormat()`-Helper.
2. **Sub-Format-Tags** (Picture Disc, Test Pressing, Limited Edition, Reissue, Stereo, Mono) gehen in `Release.format_descriptors jsonb`, **nicht** als separate Format-Werte. Format-Wert bleibt `Vinyl-LP` etc.
3. **Whitelist Option A:** alle 71 Werte vorab angelegt, auch die mit 0 Bestand — verhindert Crashes bei zukünftigen Discogs-Imports.

**Migration `2026-04-25_format_v2_add_columns` + `format_v2_check_constraint`** (Phase 1+2 via Supabase MCP):
- `Release.format_v2 varchar(40)` (nullable initially, später CHECK-Constrained gegen Whitelist)
- `Release.format_descriptors jsonb` (Discogs-descriptions array)
- `idx_release_format_v2` (partial WHERE NOT NULL)
- `release_format_v2_whitelist` CHECK-Constraint mit allen 71 Werten (gesetzt **nach** Backfill)

**Backfill (live, 100% Coverage):**
- **Phase B (Tape-mag, deterministisch via `format_id`):** 41.538 Releases. SQL-CASE-WHEN-Mapping aus `LEGACY_FORMAT_ID_MAP` (39 IDs → 32 Format-Werte). Locked-Fields-aware (`NOT (locked_fields @> '"format"'::jsonb)`).
- **Phase A (Discogs-only via `api_data.formats`):** 11.231 Releases. Heuristik in TS+Python-Lib: Container-Skip (`Box Set`, `All Media`), Vinyl-Sub-Format-Detection aus descriptions (`7"` > `10"` > `12"` ohne LP > `LP`/`Album` > Default `Vinyl-LP`), qty-Suffix-Validation gegen Whitelist.
- **Phase C (Orphans):** 19 Items ohne Quelle (14 Press-Lit-Releases + 4 Discogs-Cache-Misses + 1 All-Media-only) → `Other`.
- **Album-Bug-Fix:** initialer Lauf hatte `12" + Album` als `Vinyl-12-Inch-2` klassifiziert (Maxi-Single statt LP). Korrektur: 66 Items von `Vinyl-12-Inch*` → `Vinyl-LP*` umverteilt. TS+Python-Lib `detectVinylSize()` erweitert: `12" + Album` → LP, `12"` allein → Maxi.
- **Whitelist-Erweiterung 9 Vinyl-Box-Werte** nach Discogs-Cache-Analyse: `Vinyl-12-Inch-2/3/4/12`, `Vinyl-7-Inch-4/5/10`, `Vinyl-10-Inch-3/4` (78+11+1+1+1+1+1+2+1 = 97 Items waren sonst `Other`).

**Final-Counts (52.788 / 52.788 = 100% klassifiziert, 57 distinct Werte verwendet):**

| Format | Items | Format | Items | Format | Items |
|---|---:|---|---:|---|---:|
| `Tape` | 21.789 | `Vinyl-LP-3` | 182 | `CD-2` | 11 |
| `Magazin` | 10.929 | `CD` | 181 | `Vinyl-7-Inch-3` | 9 |
| `Vinyl-LP` | 10.731 | `Reel` | 163 | `Tape-10` | 7 |
| `Vinyl-7-Inch` | 2.859 | `Photo` | 143 | `Vinyl-12-Inch-3` | 6 |
| `Vinyl-12-Inch` | 2.625 | `Vinyl-LP-4` | 83 | `DVD`, `DVDr`, `Tape-8/26`, `Acetate` | je 3-4 |
| `Vinyl-LP-2` | 1.327 | `Vinyl-12-Inch-2` | 37 | (8 weitere ≤ 2) | je 1-2 |
| `VHS` | 429 | `Vinyl-LP-5` | 58 | **`Other`** | **20** |
| `Tape-2` | 291 | `Postcard` | 52 | | |
| `Vinyl-10-Inch` | 290 | `Vinyl-7-Inch-2` | 50 | | |
| `Poster` | 248 | `Flexi` | 41 | | |

`format_descriptors`: 9.794 Items (Top: Album 5.292, Stereo 2.060, 45 RPM 2.034, Limited Edition 1.157, Reissue 1.043, 33 ⅓ RPM 839, Compilation 837, Numbered 426, Mono 373, …).

**Schreib-Pfade auf format_v2:**
- `scripts/legacy_sync_v2.py` (stündlicher Cron): `format_v2 = classify_tape_mag_format(format_id)` parallel zu `format`. Lock-aware via `format_id`-Key. UPSERT um `format_v2`-Spalte erweitert (Release- + Literatur-Pfad). Live-Test nach Deploy: 41.552 rows_written, 0 NULL, **rc49.4-Performance bleibt erhalten** (~50s).
- `backend/src/api/admin/discogs-import/commit/route.ts`: neuer Helper `classifyFormatV2(cached)` über `lib/format-mapping.ts::classifyDiscogsFormat()`. Schreibt `format_v2` + `format_descriptors::jsonb` parallel zu `format`.
- `backend/src/api/admin/media/[id]/route.ts` PATCH: bei `format_id`-Änderung wird `format_v2` automatisch via `classifyTapeMagFormat()` deriviert.

**Single-Source-of-Truth:**
- `backend/src/lib/format-mapping.ts` (TS, 412 Zeilen): `FORMAT_VALUES` (Whitelist Tuple, 71 Werte), `FORMAT_DISPLAY` (Display-Mapper für UI: `Vinyl 7"`, `5× Vinyl LP`), `FORMAT_DISPLAY_COMPACT` (Compact für Print-Labels: `7"`, `LP×5`), `LEGACY_FORMAT_ID_MAP` (39 Tape-mag-IDs), `classifyDiscogsFormat()` (Container-Skip + Vinyl-Sub-Format + qty-Suffix), `toFormatGroup()` (Storefront-Filter-Bucket), `displayFormat()`, `displayFormatCompact()`, `isValidFormat()`.
- `scripts/format_mapping.py`: identischer Python-Spiegel für `legacy_sync_v2.py` und Backfill-Skripte.
- `storefront/src/lib/format-display.ts`: Storefront-only Spiegel (Display-Mapper + `pickFormatLabel()` Helper).

**Meilisearch-Index:**
- `meilisearch_settings.json` erweitert: `format_v2` als `filterable` + `displayed`, `format_descriptors` als `displayed`.
- Full-Rebuild via Atomic-Swap (53 Batches × 1000 Docs = 52.788 Docs gepusht). `wait_for_task`-Race-Condition (CLAUDE.md bekanntes Issue) crasht das Skript am Ende, aber Atomic-Swap ist erfolgreich — Live-Index hat alle format_v2-Daten.
- `meilisearch_sync.py::transform_to_doc()` nimmt `format_v2` + `format_descriptors` aus SQL-SELECT.
- `backend/src/lib/release-search-meili.ts`: `CatalogFilters.format_v2: string | string[]` (OR-Array-Filter), `AdminReleaseShape` + `LegacyReleaseShape` um `format_v2` erweitert.

**UI-Durchgängigkeit (Vollaudit):**
- **Admin-Edit-Card** (`/admin/media/[id]`): Subtitle + Info-Field „Format" zeigt `displayFormat(format_v2)` mit Descriptors-Suffix `(Picture Disc, Stereo)`.
- **Admin-Listenansicht** (`/admin/media`, `GalleryRelease`): Format-Spalte mit Display-Helper.
- **Admin Auction-Block-Edit** (`/admin/auction-blocks/[id]`): Format-Badge in Items-Liste + Search-Result.
- **Admin Inventory-Hub** (`/admin/erp/inventory`) + **Stocktake-Session** (`/admin/erp/inventory/session`): SearchResult + ReleaseDetail mit Display-Helper.
- **Admin POS** (`/admin/pos`): Cart-Items + Last-Scanned-Info.
- **Storefront Catalog-Detail** (`/catalog/[id]`): Format-Badge + Detail-Tabelle + Meta-Description + ld+json.
- **Storefront Auction-Item-Detail** (`/auctions/[slug]/[itemId]`): Format-Badge + Meta + ld+json.
- **Storefront Catalog-Liste** (`CatalogClient.tsx`): Item-Card-Badge.
- **Storefront Auction-Block-Detail** (`BlockItemsGrid.tsx`): Grid+List-View Format-Badge.
- **Storefront Related-Sections** (`CatalogRelatedSection.tsx`, `RelatedSection.tsx`): Format-Spalte.
- **Storefront Search-Autocomplete**: Format-Suffix in Search-Dropdown.
- **Storefront Account** (Saved + Cart): Format-Zeile.
- **Druck-Etiketten** (`items/[id]/label` + `batch-labels`): `displayFormatCompact()` für Brother-QL-29mm-Labels — `LP×5`, `Tape×26`, `CD×16`, `7"×2`, `12"`, `Lathe`, `BluRay`, `USB`. Length-Goal ≤8 chars in 95% der Fälle.
- **Email** (`watchlistReminderEmail`): `displayFormat(format_v2)` in Mail-Body.

**Backend-API Store-Routes (Release.format_v2 in SELECT, sed-patched):**
`store/catalog`, `store/catalog/suggest`, `store/catalog/[id]` (+ related_by_artist/label), `store/auction-blocks/[slug]`, `store/auction-blocks/[slug]/items/[itemId]`, `store/band/[slug]`, `store/label/[slug]`, `store/press/[slug]`, `store/account/{saved,bids,cart,recommendations,wins}`. Plus `admin/erp/inventory/{search,browse,items/[id],scan/[barcode],missing-candidates,batch-labels,items/[id]/label}`, `admin/auction-blocks/[id]`, `admin/pos/sessions/[id]/items`.

**Bewusst NICHT geändert:**
- `discogs-import/page.tsx` + `history` (zeigt Vendor-Rohwerte, kein Display)
- `sync/page.tsx` (Sync-Telemetrie mit aggregierten format-Counts; alte Group-By-Logik passt)
- `shipping.ts::format_group`-Mapping (Versand-Klassen-Lookup; format_group ist die richtige Granularität für Versand-Kosten, nicht qty-aware — Multi-Disc-Box wiegt zwar mehr, aber das ist ein separater Versand-Logik-Refactor)

**6 Commits:**
- `707778c` Whitelist 71 Werte, Migration + Backfill (52.788/52.788)
- `57867f6` Schreib-Pfade auf format_v2 + format_descriptors
- `e3bfd29` UI + Meili integration
- `248c3e4` Detail-Seiten Backend + Storefront
- `65eb504` Inventory/Stocktake-Pfade auf format_v2
- `4f663aa` Vollaudit — alle Storefront-Components + Email + Labels
- `0d08636` `displayFormatCompact()` für Print-Labels

**Begleit-Dokumente:**
- `docs/architecture/FORMAT_MAPPING_ANALYSIS.md` (Plan-Doc, ~1100 Zeilen, 5 Versionen)
- `/Users/robin/Downloads/Formate_v5_FINAL.csv` (Frank-Roundtrip-Tabelle, 71 Werte)

**Cutover-Reminder eingerichtet:** `scripts/cutover_reminder.py` läuft täglich um 09:00 UTC via VPS-Cron (idempotent via Marker-File). Triggert am Stichtag **2026-05-19** (3.5 Wochen nach rc51.7) eine Email an `rseckler@gmail.com` mit Live-DB-Status-Check (NULL-Count, format vs format_v2 Drift, Top-15 Verteilung, Constraint-Status) und GO/NO-GO-Verdict + 7-Schritt-Cutover-Plan. Drift-Heuristik kennt `LP → Vinyl-*/Lathe-Cut[-2]/Flexi/Acetate/Shellac` als legitim. Manueller Override: `python3 cutover_reminder.py --force` (sofort senden) oder `--dry-run` (Status zeigen ohne Mail). Commits: `d63fca7` + `4606eff`.

**Noch offen (nicht-blockierend, ggf. spätere RCs):**
1. **Cutover** `format` → `format_v2` rename + alte Spalte droppen — bewusst zurückgehalten, automatischer Reminder am 2026-05-19 (siehe oben).
2. **Storefront-UI Sub-Filter** (z.B. unter „Vinyl" → „7\" Single", „Box-Set qty≥2"): Backend-Filter `format_v2` schon da, UX-Definition mit Frank offen.
3. **`shared.py` Cleanup**: alte `FORMAT_MAP`/`LEGACY_FORMAT_ID_MAP` parallel zu `format_mapping.py`. Aufräumen nach Cutover.
4. **Meili `wait_for_task`-Race fixen** (Skript crasht nach erfolgreichem Atomic-Swap — kein Daten-Impact, kosmetisch).
5. **Versand-Logik qty-aware** (LP-Box mit 5 Platten wiegt mehr als 1 LP — separate Refactor in `shipping.ts`).

---

## 2026-04-23 — Inventory-Hub + Session-Scanner auf Meilisearch (rc49.1)

**Kontext:** User-Feedback nach rc49-Deploy: "hier haben wir aber noch keine schnelle Suche, richtig?" (mit Link auf `/app/erp/inventory`). Stimmt — rc48.1 hatte nur `/app/media` migriert. Der Inventory-Hub (`/admin/erp/inventory/browse`) lief trotz rc43-CTE-Fix weiter auf Postgres, und die Stocktake-Session-Suche (`/admin/erp/inventory/search`) auf Postgres-FTS.

**Umfang (Plan §4 Tag 3.5, ursprünglich "optional"):**

**`browse/route.ts`** — Hub-Tab-Listing:
- Neuer 3-Gate-Wrapper analog `/admin/media`: Flag `SEARCH_MEILI_ADMIN` → Health-Probe → `?_backend=postgres`-Bypass → try/catch → Fallback
- Tab-Filter-Mapping auf Meili-Filter:
  - `tab=all` → `has_inventory = true` (Hub zeigt nur Items mit Inventar)
  - `tab=verified` → `stocktake_state = "done"`
  - `tab=pending` → `stocktake_state = "pending"`
  - `tab=multi_copy` → `exemplar_count > 1`
- Sort-Mapping: `recent_desc → updated_at_ts:desc`, `verified_desc → last_stocktake_at:desc`, plus artist/title/price
- Response-Shape unverändert (`items[] / total / limit / offset`) — UI keine Änderung

**`search/route.ts`** — Stocktake-Scanner:
- **Barcode VOD-XXXXXX** (6-digit): bleibt Postgres — deterministic Scanner-Lookup via Index-Hit <10ms. Meili könnte falsch priorisieren.
- **Article-No. VOD-\\d+** (variable Länge): bleibt Postgres — index-backed UPPER-Match
- **Text-Search** (multi-word mit Typo/Synonym): Meili via `searchReleases`-Client, Fallback auf Postgres-FTS

**Bestehende Postgres-Handler umbenannt** nach `*GetPostgres` und als Export in `route-postgres-fallback.ts` verlagert — Pattern identisch zu rc48 `/admin/media`.

**Messung via direktem Meili-Curl:**

| Query | Meili-Zeit | Hits |
|---|--:|--:|
| `has_inventory=true` (Tab All) | 0 ms | 13 157 |
| `stocktake_state="done"` (Tab Verifiziert) | 0 ms | 74 |
| `exemplar_count > 1` (Tab Mehrere Ex.) | 0 ms | 0 |
| Text-Search "cabaret voltaire" | 2 ms | 135 |

Vorher (Postgres rc43-CTE): 1-2 s für Hub-Tabs, 200-500 ms für Text-Search.

**Rollback:** Flag `SEARCH_MEILI_ADMIN` OFF → alle drei Endpoints (media/browse/search) fallen auf Postgres zurück.

---

## 2026-04-23 — Supabase Disk-IO-Fix: Meili-Sync auf aggregierte CTEs (rc49)

**Kontext:** Zweite Supabase-Alert-Mail "depleting Disk IO Budget" innerhalb weniger Stunden nach der ersten. Free Plan (`micro`-Compute) hat begrenztes Tages-IO-Budget — bei Überschreitung: Response-Zeiten steigen, CPU durch IO-Wait ausgelastet, Instance unresponsive.

**Root-Cause-Analyse** via `pg_stat_statements` (via Supabase MCP):

| Query | Calls | Disk GB | Mean ms |
|---|--:|--:|--:|
| `meilisearch_sync.py::BASE_SELECT_SQL` | 243 | **8.59** | 20 149 |
| Legacy-Sync `INSERT INTO Release` | 92 407 | 3.41 | 48 |
| Discogs-Audit COUNT-Queries | 420 | 1.98 | 2 252 |
| `UPDATE Release SET search_indexed_at = NOW()` | 464 | 1.70 | 2 368 |

Top-1 Query dominiert mit **32 % der Top-20-Summe**. Ursache: **11 korrelierte Subqueries** pro Row × 52k Rows × 3 Full-Rebuilds heute (rc47.2 Column-Rename + rc48 Admin-Felder + rc48.1 Parity-Fix) = 580k Subquery-Executions × 8 KB Block-Reads ≈ 4.7 GB pro Rebuild, mal 3 = 14 GB (akkumuliert mit Cache-Hits = die gemessenen 8.59 GB).

**Fix — Rewrite auf aggregierte CTEs:**

```sql
WITH inv_agg AS (
  SELECT release_id, COUNT(*), MAX(last_stocktake_at),
         (array_agg(status ORDER BY copy_number))[1], ...
  FROM erp_inventory_item GROUP BY release_id
),
imp_agg AS (
  SELECT release_id,
         array_agg(DISTINCT collection_name) FILTER (WHERE IS NOT NULL),
         array_agg(DISTINCT action) FILTER (WHERE IS NOT NULL)
  FROM import_log WHERE import_type='discogs_collection' GROUP BY release_id
)
SELECT r.*, inv_agg.*, imp_agg.*, wl.*
FROM "Release" r
LEFT JOIN inv_agg ON ...
LEFT JOIN imp_agg ON ...
LEFT JOIN warehouse_location wl ON wl.id = inv_agg.warehouse_id_first
LEFT JOIN Artist/Label/PressOrga/Format/entity_content ...
```

Statt 580k Subquery-Executions: **2 aggregate Scans** (~13k erp_inventory_item + ~17k import_log). Theoretischer Disk-IO-Drop: von 4.7 GB auf ~100 MB pro Rebuild (Faktor 47×).

**EXPLAIN ANALYZE Messung** (mit LIMIT 100):
- Execution Time: **53 ms**
- Buffers: `shared hit=180` (praktisch alles aus Cache nach Erst-Aufruf)
- Erwartetes Mean bei Full-Rebuild: ~5 s statt bisheriger 20 s

**TS-Mirror** in `backend/src/lib/meilisearch-push.ts::SELECT_SINGLE_RELEASE_SQL` identisch refaktoriert. Single-Release-Push auch günstiger (weniger Plan-Overhead, 3 `?`-Parameter statt 1 — alle dieselbe `releaseId`).

**Cron-Frequenz reduziert** (via `crontab -e` auf VPS): `*/5 → */15` min für Delta-Sync. Weil `pushReleaseNow()`-Hooks in allen Klasse-B-Mutations (Verify/Add-Copy/PATCH-media/Block-Add) seit rc48.1 die unmittelbare Sichtbarkeit garantieren, kann der Delta-Cron entspannter laufen. Drift-Check (`*/30`) + Cleanup (`0 3`) + Dump (`0 4`) bleiben.

**Paritätsmatrix** (`admin_meili_data_parity.py`) läuft nach Rewrite unverändert **28/28 PASSED** — semantische Äquivalenz bestätigt.

**Nicht in rc49:**
- Tier 2 (Partial Delta-Fetch mit LIMIT, entity_content-Cache, Discogs-Audit-Caching) — separate Session bei Bedarf
- Tier 3 (Compute-Upgrade oder Read-Replica) — nur wenn Tier 1+2 nicht reichen

**Monitoring:** 24h nach rc49 erneut `pg_stat_statements` prüfen. Erwartet: Query #1 nicht mehr dominant.

**Volldoku:** [`docs/optimizing/SUPABASE_DISK_IO_AUDIT_2026-04-23.md`](../optimizing/SUPABASE_DISK_IO_AUDIT_2026-04-23.md).

---

## 2026-04-23 — Admin-Catalog auf Meilisearch: Code-Rollout (Flag OFF, Paritätsmatrix bereit) (rc48)

**Kontext:** Frank (und User-Direktfeedback): `/app/media` und `/app/erp/inventory/*` laden mehrere Sekunden pro Request, trotz mehrerer Optimierungs-Runden mit btree-Indexes + CTE-Pattern + No-Filter-Count-Fastpath. Root-Cause: 6-Table-JOIN + Sub-Aggregation auf 52k × 13k Rows — kein Index repariert Architektur-Problem.

**Plan:** `docs/optimizing/ADMIN_CATALOG_PERFORMANCE_PLAN.md` v2 (Companion: `CATALOG_PERFORMANCE_BENCHMARK.md`) — state of the art für Katalog-Browsing ist CQRS mit dediziertem Search-Store. Wir haben Meilisearch bereits für Storefront seit rc40 (p95 48-58ms). Phase 2 erweitert die Nutzung auf Admin.

**Review-Feedback am selben Tag** identifizierte drei Schwächen, alle in den Minimal-Scope gezogen (Plan §0 Pre-Conditions): Konsistenz-Klassen, Paritätsmatrix als Acceptance-Gate, Count-Semantik (estimated vs. exact).

### Umsetzung (Tag 1+2)

**Meili-Schema erweitert** (13 neue Admin-Filter-Attrs):
- `inventory_status` (first-exemplar's status)
- `price_locked` (first-exemplar's lock)
- `warehouse_code` / `warehouse_id` / `warehouse_name`
- `import_collections` (array — Release kann durch mehrere Imports)
- `import_actions` (array)
- `stocktake_state` — computed: `none` | `pending` | `done` | `stale` (STOCKTAKE_STALE_DAYS=90, Single-Source-of-Truth in beiden Python + TS)
- `has_image` (alias has_cover für Admin-UI-Konsistenz)
- `has_inventory` (exemplar_count > 0)
- `exemplar_count` / `verified_count` / `last_stocktake_at` / `updated_at_ts` als filterable

**SQL-Extensions** in `meilisearch_sync.py::BASE_SELECT_SQL`:
- First-exemplar-shape Felder via korrelierte Subqueries (status, price_locked, barcode, warehouse_*, last_stocktake_at_max)
- Import-Relationen via `array_agg(DISTINCT collection_name)` / `action` aus import_log

**DB-Trigger** (`2026-04-23_admin_meili_fields.sql`, applied via psql auf Prod):
- `trg_release_indexed_at_import_log` AFTER INSERT ON import_log → bumpt Release.search_indexed_at
- `trigger_release_indexed_at_self` Whitelist um 3 Felder erweitert: estimated_value, media_condition, sleeve_condition (waren nicht drin, relevant für Admin-Listing)

**Backend-Route-Umbau** (`backend/src/api/admin/media/`):
- `route.ts` NEU: 3-Gate-Wrapper (Flag `SEARCH_MEILI_ADMIN` → Health-Probe → try/catch). Plus 4. Gate: `?_backend=postgres` Query-Param forciert Fallback für Paritätsmatrix-Runs.
- `route-postgres-fallback.ts`: bisherige Implementation 1:1 umbenannt, Funktion `adminMediaGetPostgres` exportiert.
- `count/route.ts` NEU: exakter SQL-Count-Endpoint mit minimaler JOIN-Nutzung (nur die Tables die Filter fordern). Für Export-Bestätigung + destruktive Bulk-Action-Dialoge. Spart den inline-Count-Roundtrip im 99%-Pfad.

**Meili-Filter-Builder** (`backend/src/lib/release-search-meili.ts`):
- `CatalogFilters` um 11 Admin-Filter erweitert
- `buildFilterString` übersetzt sie in Meili-Filter-Syntax (category-Shorthand, has_discogs-EXISTS, stocktake_state-equality, etc.)
- `CatalogSort` um title_desc/artist_desc/country_*/label_*/synced_* erweitert
- Neuer `toAdminShape()`-Mapper — snake_case→camelCase + rc23 Inventory-Felder, hält `/app/media`-Frontend stabil ohne Code-Änderung

**Konsistenz-Klasse-B Hooks** (Plan §3.8):
- `backend/src/lib/meilisearch-push.ts` NEU — `pushReleaseNow(pg, releaseId)` mit eigener TS-Implementierung derselben Select+Transform-Logik wie Python-Sync (Single-Source-Doku in Datei-Kopf). Fire-and-forget, catcht Fehler stumm.
- 4 Endpoints eingehängt: Verify, Add-Copy, PATCH /admin/media/:id, Auction-Block-Add. Pattern: nach `res.json()` → `pushReleaseNow(pg, releaseId).catch(logError)`. Nie blockierend.
- State-Tabellen-Bump (`meilisearch_index_state` + `Release.search_indexed_at`) damit Delta-Cron das Dokument nicht erneut pusht.

**Feature-Flag** `SEARCH_MEILI_ADMIN` (category=search, default OFF). `FlagResponse`-Type in `/admin/platform-flags` um "search" erweitert damit UI es rendert.

**Paritätsmatrix** (`scripts/admin_meili_parity_check.py`, Plan §4.A):
- 37 Test-Cases in 6 Gruppen: single_filter, filter_sort, ui_combos, computed, search, boundary
- Pro Case: fetch `?_backend=postgres` und `?_backend=meili`, vergleiche IDs + Count-Delta + Sort
- Status: ok/warning/failed/error, Exit-Code 0/1/2 als CI-Gate
- Acceptance-Kriterium: 0 failed. Warnings (IDs ok, count 1-5% delta) manuell sichtprüfen.

### Rollout-Status

- **Meili full-rebuilt** 52.777 docs × beide Profile (commerce + discovery). Stats-Check: `numberOfDocuments: 52777, avgDocumentSize: 1121 bytes`.
- **Smoke-Test** via direktem Meili-Call: Filter `warehouse_code="ALPENSTRASSE"` liefert 71 hits — exakt identisch zu Postgres `COUNT(DISTINCT release_id)`.
- **VOD-19576 Doc** enthält: shop_price=27, is_purchasable=true, warehouse_code=ALPENSTRASSE, stocktake_state=done, import_collections=[]. Alle neuen Felder korrekt populiert.
- **Backend läuft**, Flag OFF → Admin-Catalog verhält sich weiterhin wie vor rc48 (Postgres-Route).

### Nicht in rc48 (folgt separat)

- **Flag-ON auf Prod** — User muss Paritätsmatrix mit Admin-Cookie laufen lassen, dann per `/app/config` aktivieren. Plan §0.2 Pre-Condition.
- **Tag 3 Frontend-Polish** (Skeleton + React-Query + Optimistic-Updates + Prefetch) — bleibt nachgelagert wie im Plan vorgesehen.
- **`/admin/erp/inventory/search` auf Meili** — Tag 3.5 optional, kleinerer Scope.

### Rollback

Trivial: `SEARCH_MEILI_ADMIN` flag OFF → Postgres-Route. Keine DB-Migration zurückzurollen (alle Migrations sind additiv: Trigger-Erweiterungen + neue Indexes). Kein Daten-Verlust.

---

## 2026-04-23 — Preis-Modell Phase 2: Auction-Start-Preis aus shop_price × 0.5 (rc47.3)

**Kontext:** Direkt im Anschluss an rc47.2 (`direct_price → shop_price`-Rename + Shop-Visibility-Gate) die ausstehende Phase 2 umgesetzt: Beim Aufnehmen eines Releases in einen `auction_block` wird der Start-Preis jetzt automatisch aus `shop_price` abgeleitet, nicht mehr aus `estimated_value`/`legacy_price`. User-Entscheidung war `round(shop_price × 0.5)`, implementiert als `round(shop_price × block.default_start_price_percent / 100)` — bei Default-Prozent 50 identisch zur User-Formel, aber Frank kann den Prozent pro Block ändern.

**Write-Pfade (3):**

1. **Admin-UI Block-Builder** (`auction-blocks/[id]/page.tsx::handleAddItem`): priorisiert jetzt `release.shop_price` vor `estimated_value` vor `legacy_price`. Rechnet `Math.max(1, Math.round(base × pct / 100))`. Release-Typ um `shop_price: number | null` erweitert.
2. **Backend-POST** (`api/admin/auction-blocks/[id]/items/route.ts`): `CreateBlockItemSchema.start_price` ist optional geworden. Wenn der Client den Wert weglässt, fetcht die Route `Release.shop_price/estimated_value/legacy_price` + `auction_block.default_start_price_percent` und berechnet server-seitig denselben Default. Wenn alle drei Preis-Felder 0/NULL sind: 400 mit Fehlermeldung "Either verify the item in the Inventory Process first (sets shop_price) or pass start_price explicitly."
3. **Bulk-Price-Endpoint** (`api/admin/auction-blocks/[id]/items/bulk-price/route.ts`): neue `rule='shop_price_percentage'`, rechnet `round(base × value / 100)` pro Item mit derselben Fallback-Kette. Items ohne Preis (alle drei Felder 0/NULL) werden im `skipped`-Counter zurückgegeben. Unterscheidet sich vom bestehenden `rule='percentage'` (der `estimated_value` als Basis nimmt) — beide Rules bleiben verfügbar.

**Release-Picker** (`api/admin/releases/route.ts`): SELECT um `Release.shop_price` erweitert, damit das Release-Objekt im Block-Builder den neuen Priorität-Pfad kennt.

**Frontend-Bulk-UI** wurde in rc47.3 nicht erweitert — der neue `shop_price_percentage`-Mode ist nur via direktem POST-Call nutzbar. Button für Frank folgt bei konkretem Bedarf.

**Test-Szenarien live:**
- Release mit `shop_price=27, estimated_value=null, legacy_price=27, default_percent=50` → `start_price = 14` (round(27 × 0.5))
- Release ohne verifizierten Inventory (shop_price=NULL) aber mit `legacy_price=30` → `start_price = 15` (Fallback greift)
- Release ohne jeden Preis → 400 mit "verify first or pass explicit"
- Bulk-Rule auf Block mit 20 Items: 15 mit shop_price, 5 ohne → Response `{updated: 15, skipped: 5}`

**Manueller Override** bleibt jederzeit möglich: Frank kann im Block-Builder den `start_price` pro Item direkt editieren, die Default-Berechnung greift nur beim initialen Add.

**Doku:** `docs/architecture/PRICING_MODEL.md §Phase 2` auf "live seit rc47.3" umgestellt mit Code-Stellen-Liste.

**Deploy:** commit `d0548e2` + pm2 restart, Server-ready in 3.5s. Pre-existing TS-Errors (stagger_interval, items-undefined, block-body-unknown) stören den SWC-Transpile nicht — sind seit rc40 im Repo, kein Regressor durch diesen Commit.

---

## 2026-04-23 — Preis-Modell konsolidiert: shop_price kanonisch, Shop-Visibility-Gate, ALPENSTRASSE-Default (rc47.2)

**Kontext:** Frank meldete, dass bei einem frisch verifizierten Artikel (VOD-19576, "Soul Possession") der "Direct Price" im Admin-Catalog auf 0 € stand, obwohl er beim Verify 27 € gesetzt hatte. Beim Speichern kam Validation-Error "direct_price is required when sale_mode is not auction_only". Storefront zeigte den Preis korrekt — Admin nicht. Frank: "ist hier ein Gedankenfehler?"

**Root-Cause-Analyse:** Die Software hatte drei Preis-Spalten parallel im Einsatz, keine davon kanonisch:
- `Release.legacy_price` — MySQL-Altdaten, Verify schrieb darauf, Storefront las primär daraus
- `Release.direct_price` — Discogs-Import-Commit schrieb darauf, Admin-Catalog-Detail-Form las daraus und validierte darauf
- `erp_inventory_item.exemplar_price` — Verify schrieb darauf, Label-Pipeline las daraus

Verify + Admin-Catalog-Detail-Form schrieben auf UNTERSCHIEDLICHE Spalten. Storefront funktionierte "zufällig" weil der Fallback `legacy_price || direct_price` den vom Verify geschriebenen Wert fand. Admin-Form sah nur `direct_price` → 0 → "missing"-Badge trotz 27 € in der DB.

**Entscheidungsrunde mit User:** User beschrieb sein mentales Modell:
- `shop_price` (neu, Rename von `direct_price`) = **einziger** Shop-Preis, gesetzt im Inventory Process nach Verify
- `legacy_price` + `discogs_lowest_price` = nur Info (Historie bzw. Markt-Referenz), kein Shop-Preis
- Shop zeigt standardmäßig **nur** Items mit `shop_price > 0 AND verified` — andere nur via globalem Toggle `catalog_visibility='all'`, dann ohne Preis-Tag und ohne Add-to-Cart (Bid bleibt aktiv wenn Auction)
- Default `sale_mode='both'` nach erstem Verify (wenn vorher NULL oder auction_only)
- Default `warehouse_location_id=ALPENSTRASSE` (is_default=true) beim Verify/Add-Copy wenn vorher NULL

**DB-Migration** (`backend/scripts/migrations/2026-04-23_rename_direct_price_to_shop_price.sql`, idempotent):
1. `ALTER TABLE "Release" RENAME COLUMN direct_price TO shop_price` — IF old+NOT new, sonst no-op
2. Backfill Preise: 23 verifizierte Releases (EXISTS erp_inventory_item mit last_stocktake_at NOT NULL AND price_locked=true) die `shop_price IS NULL OR shop_price=0` aber `legacy_price > 0` haben → `shop_price = legacy_price`
3. Backfill sale_mode: davon 22 mit `sale_mode auction_only/NULL` → `'both'` (direct_purchase nie überschrieben — explizite User-Wahl)
4. Backfill Warehouse: 32 verifizierte Inventory-Items ohne Location → `is_default=true` Warehouse (aktuell ALPENSTRASSE)

**Trigger-Fix:** `trigger_release_indexed_at_self()` hatte `NEW.direct_price` referenziert — nach Rename crashte jeder UPDATE auf Release mit "record NEW has no field direct_price". Funktion via `CREATE OR REPLACE FUNCTION` auf `NEW.shop_price` umgestellt.

**Code-Rename** (34 Dateien, 391 insertions / 132 deletions):
- 12 Backend-Routes + 3 lib-Files + 2 Models via `sed 's/direct_price/shop_price/g'` + manueller Review der Semantik
- 8 Storefront-Files (types, catalog/[id], band/[slug], label/[slug], press/[slug], saved, CatalogClient, CatalogRelatedSection)
- Python: `scripts/meilisearch_sync.py` + `scripts/meilisearch_settings.json`
- camelCase-Varianten (`directPrice`, `setDirectPrice`, `directPriceProvided`, `rawDirect`) ebenfalls migriert

**Semantische Änderungen (nicht nur Rename):**
1. **Verify-Endpoint** (`items/[id]/verify/route.ts`): Copy #1 schreibt jetzt `shop_price = new_price` (kanonisch) + `legacy_price = new_price` (defensiver Mirror für bestehende Leser) + `sale_mode='both'` wenn NULL/auction_only + `warehouse_location_id=ALPENSTRASSE` wenn NULL
2. **Add-Copy-Endpoint** (`items/add-copy/route.ts`): Copy #1 dasselbe; für alle Copies Warehouse-Default greift
3. **Storefront-Gate:** `/store/catalog` (Meili + Postgres-Fallback) + `/store/catalog/[id]` prüfen `site_config.catalog_visibility`. Bei `'visible'` (Default): Filter `shop_price > 0 AND EXISTS(verified erp_inventory_item)`. Bei `'all'`: kein Gate, aber `effective_price=null` wenn kein shop_price → Frontend zeigt kein Preis-Tag, kein Add-to-Cart. `for_sale=true` URL-Param forciert immer `'visible'`-Semantik.
4. **Storefront effective_price-Logik:** neu — `shop_price` nur wenn `shop_price > 0 AND is_verified`. Kein Legacy-Fallback mehr. `legacy_price` bleibt in API-Response als Info erhalten, wird aber nirgendwo mehr als Preis gerendert.
5. **Neuer Helper** `backend/src/lib/shop-price.ts::enrichWithShopPrice(pg, rows)` — nimmt Release-Rows (mit `id`, `shop_price`, `legacy_available`), fragt einmal `erp_inventory_item` mit WHERE release_id IN (...) ab, returnt Rows angereichert mit `effective_price/is_purchasable/is_verified`. Genutzt in band/label/press-Routes und in `route-postgres-fallback.ts::catalogGetPostgres()` Endbereich.
6. **Missing-Badge-Logik** (Admin-Catalog-Detail `media/[id]/page.tsx:1126`): vorher `price_locked && direct_price === 0` → jetzt `price_locked && shopZero && legacyZero` (nur wenn wirklich beide 0 sind, sonst ist es "verifiziert" nicht "missing")
7. **UI-Label** "Direct Price (€)" → "Shop Price (€)" in Catalog-Detail-Form
8. **Meilisearch-Doc** (`meilisearch_sync.py::transform_to_doc`): `has_price = shop_price > 0 AND verified_count > 0` (nicht mehr effective_price aus legacy-Fallback), `effective_price = shop` wenn shop_visible_with_price, sonst null. `is_purchasable = has_price AND legacy_available`. Full-Rebuild nach Deploy pushed 52.777 docs in beide Profile (commerce + discovery).

**Deploy-Sequenz (2026-04-23 20:xx CEST):**
1. DB-Migration via SSH+psql (Column-Rename + Trigger-Fix + Backfill in einem Rutsch)
2. Code-Push (34 Files, commit `ba5403e`)
3. VPS `git pull` + `medusa build` + `pm2 restart vodauction-backend` + storefront `npm run build` + `pm2 restart vodauction-storefront`
4. Storefront-Build erst gecrashed auf doppeltem `is_purchasable`-Type-Feld in CatalogClient.tsx (sed-Artefakt) → commit `ef73765` Fix
5. Meili full-rebuild — erster Versuch crashed auf `NameError: name 'direct' is not defined` (Python-Variable im transform_to_doc übersehen beim Rename, 1 of 2 occurrences aktualisiert) → commit `cd6ea7e` Fix → Rebuild erfolgreich (52.777 docs, beide Profile, atomic swap)
6. Verifikation: `SELECT ... WHERE article_number='VOD-19576'` zeigt `shop_price=27.00, legacy_price=27.00, sale_mode='both', exemplar_price=27.00, warehouse gesetzt`. Problem gelöst.

**Phase 2 (noch offen, separater Commit):** `block_item.start_price = round(shop_price × 0.5)` als Default beim Aufnehmen in Auction-Block. Frank kann manuell überschreiben. Nicht für rc47.2 — kommt im nächsten Auction-Block-Flow.

**Doku:** Vollständige Single-Source-of-Truth in [`docs/architecture/PRICING_MODEL.md`](PRICING_MODEL.md) — Begriffe, Spalten-Mapping, Verify-Flow, Visibility-Gate, Verify-Checkliste bei Code-Änderungen, Historische Anmerkungen.

---

## 2026-04-11 — Discogs Import: Stale-Loop Auto-Restart während aktivem Polling (rc24)

**Kontext:** rc18/rc20 haben alle 3 Discogs-Import-Loops (Fetch, Analyze, Commit) vom HTTP-Request entkoppelt — Client-Disconnect, Navigation, Tab-Close killen den Backend-Loop nicht mehr. Die Stale-Detection aus rc18 deckte zusätzlich noch Browser-Refresh-Szenarien ab (beim Mount checked `loadResumable()` ob `last_event_at > 60s` alt ist und triggered Re-POST).

**Was fehlte:** Stale-Detection **während der User auf der Seite bleibt und nicht refresht**. Das wurde heute Nachmittag akut als Problem sichtbar.

### Das Szenario das den Bug offenlegte

User startete Fetch für "Frank Collection 2 of 10" (1.005 unique IDs). Loop lief bei `current=620` (61.7%). **Ich habe in der Zeit drei pm2-Restarts gemacht** für rc21/rc22/rc23 Deploys. Jeder `pm2 restart vodauction-backend` killed alle in-process detached Background-Tasks, auch diesen laufenden Fetch-Loop.

Der User's Browser polled fröhlich weiter, sah aber keine neuen Events. Die UI hing **2+ Stunden** auf `620 / 1.005 (61.7%)` — Backend war tot, Frontend ahnungslos. Die Session blieb in `status='fetching'`, `last_event_at = 14:47:35 UTC`.

DB-Diagnose bestätigte das Problem:
```
status=fetching, current=620, last_event_at=14:47:35 UTC, age=2h 0m 41s
```

### Root Cause

Das rc18-Decoupling schützt den Loop vor dem HTTP-Request-Lifecycle, aber **nicht** vor dem Prozess-Lifecycle:
- Client-Disconnect (Nav, Tab-Close) → Loop läuft weiter ✅ (rc18)
- Browser-Refresh → loadResumable detected stale, re-POSTs ✅ (rc18)
- Backend pm2-Restart während offener Seite → Loop tot, UI ahnungslos ❌

Die rc18 Stale-Detection in `loadResumable()` läuft nur im `useEffect(() => {...}, [])` — also einmal beim Page-Mount. Ein User der die Seite nicht verlässt und nicht refresht sieht den toten Loop nie.

### Fix — zwei Teile

**Part 1: Frontend Polling-Callback erkennt Stale (`page.tsx`)**

Neuer `useRef<number>` für Cooldown-Tracking:
```typescript
const lastStaleRestartRef = useRef<number>(0)
const STALE_THRESHOLD_MS = 60_000
const STALE_COOLDOWN_MS = 60_000
```

Im existing `useSessionPolling` onStatus Callback wird pro Polling-Tick (alle 2s) geprüft:

```typescript
const ACTIVE_STATES = ["fetching", "analyzing", "importing"]
if (ACTIVE_STATES.includes(st.status) && st.last_event_at) {
  const ageMs = Date.now() - new Date(st.last_event_at).getTime()
  const sinceLastRestart = Date.now() - lastStaleRestartRef.current
  if (ageMs > STALE_THRESHOLD_MS && sinceLastRestart > STALE_COOLDOWN_MS) {
    lastStaleRestartRef.current = Date.now()
    const endpoint =
      st.status === "fetching" ? "/admin/discogs-import/fetch"
      : st.status === "analyzing" ? "/admin/discogs-import/analyze"
      : "/admin/discogs-import/commit"
    // Synthetic 'auto_restart' event in live log
    setEvents((prev) => [...prev, {
      type: "auto_restart",
      phase: ...,
      timestamp: new Date().toISOString(),
      message: `Backend loop appeared dead (${ageSec}s since last event). Auto-restarting — cached work is preserved.`,
    }].slice(-500))
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ session_id: st.id }),
    }).catch(...)
  }
}
// Reset ref when session moves to terminal state
if (["done", "error", "abandoned", "fetched", "analyzed", "uploaded"].includes(st.status)) {
  lastStaleRestartRef.current = 0
}
```

**60s Cooldown** verhindert Infinite-Restart-Loops falls der neue Backend-Loop auch sofort stirbt (z.B. weil DB down). User würde dann stattdessen einen echten Error sehen.

**Synthetischer Live-Log Event** informiert den User was passiert — statt stiller Magie erscheint eine explizite "Auto-Restarting"-Zeile im Live-Log. Transparenz.

**Part 2: Backend Commit Route — Settings-Fallback (`commit/route.ts`)**

Der Auto-Restart-POST aus Part 1 kennt nur `session_id`. Fetch und Analyze brauchen auch nur das. **Commit** braucht aber zusätzlich `media_condition`, `sleeve_condition`, `inventory`, `price_markup`, `selected_discogs_ids` — die kamen bisher aus dem Body mit Defaults `"VG+"/1/1.2`.

Wenn wir Auto-Restart mit nur `session_id` POSTen, würden die Defaults die ursprünglichen User-Entscheidungen überschreiben. **Fatal** — stell dir vor der User wählte "M/M" Condition und 1.5× Markup, und der Auto-Restart überschreibt das mit "VG+/VG+" und 1.2× auf halbem Weg durch den Commit.

Fix: body values haben Precedence, aber wenn fehlend → Fallback auf `session.import_settings` (wird vom INITIAL commit call persistiert, siehe rc16 Commit Hardening):

```typescript
const persistedSettings = (session.import_settings || {}) as { ... }

const media_condition = body.media_condition ?? persistedSettings.media_condition ?? "VG+"
const sleeve_condition = body.sleeve_condition ?? persistedSettings.sleeve_condition ?? "VG+"
const inventory = body.inventory ?? persistedSettings.inventory ?? 1
const price_markup = body.price_markup ?? persistedSettings.price_markup ?? 1.2
const selected_discogs_ids = body.selected_discogs_ids ?? persistedSettings.selected_discogs_ids ?? undefined
```

So übernimmt der Auto-Restart **transparent** die ursprünglichen User-Settings aus der DB. Der existing Commit-Loop-Code ist unverändert — er sieht die richtigen Werte, egal ob sie aus dem Body oder aus der Session kommen.

Kleinere Umbenennung: das lokale `persistedSettings`-Objekt (welches in `updateSession` geschrieben wird) → `persistedSettingsUpdate`, um Namenskollision mit dem neuen (gelesenen) `persistedSettings` zu vermeiden.

### Gesamter Robustness-Stack

Nach rc24 ist der Discogs Import Service vollständig fault-tolerant gegen die typischen Failure-Modes:

| Scenario | Schutz | Seit |
|---|---|---|
| Client navigates away (Tab, Nav, Reload) | Decoupling — Loop läuft detached | rc18 / rc20 |
| Browser refresh während Loop | loadResumable Mount-check | rc18 |
| Backend pm2-restart, User bleibt auf Seite | **Polling Stale-Detect** ← rc24 | rc24 |
| Backend OOM-Kill, User bleibt auf Seite | **Polling Stale-Detect** ← rc24 | rc24 |
| Loop crasht mit Exception | `.catch()` wrapper markiert Session als 'error' | rc18 |
| Stale Zombie > 6h nach Crash | active_sessions 6h-Filter | rc17 |
| Double-POST (race condition, 2 tabs) | 60s Idempotency-Check | rc18 |

**Keine Klasse von Failure mehr** die zu einer hängenden UI führt — entweder Loop läuft durch, oder Error-State wird sichtbar, oder Auto-Restart versucht's innerhalb 60-120s erneut.

### Warum nicht schon in rc18?

Ehrliche Antwort: Ich habe beim rc18-Decoupling nur an Client-seitige Disconnect-Szenarien gedacht (Navigation, Tab-Close). Backend-Prozess-Kills (pm2 restart) sind ein separater Failure-Mode der mir erst durch meinen eigenen Deploy-Storm heute bewusst wurde. Klassisches "I was the load-generator".

Lesson: bei Background-Task-Architekturen immer beide Enden der Ownership-Kette durchdenken — **Client-Process** UND **Backend-Process**. rc18 hat den ersten gelöst, rc24 den zweiten.

### Verifikation

- Frank-Collection-2/10 Session wurde nach rc24-Deploy auf der stehen gebliebenen Seite automatisch wiederbelebt
- Browser-Polling detectet stale → auto-POST → Backend registriert die 2h alte Session als stale → startet neuen Loop → überspringt via `discogs_api_cache` die 620 bereits gefetchten Einträge → fetcht die restlichen 385 → fertig

### Files

- `backend/src/admin/routes/discogs-import/page.tsx` (+55 / -0) — Ref, Konstanten, Stale-Detection-Logik, synthetic event, reset-on-terminal
- `backend/src/api/admin/discogs-import/commit/route.ts` (+21 / -10) — body/session-settings merge, persistedSettingsUpdate rename

### Commit

- `b08373a` — Discogs Import: Stale-Loop Auto-Restart während aktivem Polling

---

## 2026-04-11 — Media Catalog: Import + Inventory Filter (rc23)

**Kontext:** Der Media Catalog (`/app/media`) hatte solide Standard-Filter (Category, Format, Country, Year, Label, Discogs/Price/Status/Visibility), aber zwei zentrale Workflow-Dimensionen fehlten: **welcher Import** hat einen Release angefasst, und in welchem **Inventory-/Stocktake-Zustand** ist er. Beide Daten existieren in der DB (`import_log`, `erp_inventory_item`), waren aber im Filter nicht exposed.

**User-Feedback:** "hier müssen wir noch neue Filter einbauen, um die Themen Import und Inventory einbinden zu können"

### Entscheidungen vor der Umsetzung

Plan-Doc `docs/architecture/MEDIA_CATALOG_FILTERS_PLAN.md` mit 4 offenen Punkten, die der User entschieden hat:
1. **Dropdown** statt Chips für Import-Collections (skaliert besser als Chips wenn die Collection-Liste wächst)
2. **Always-visible** Filter-Zeile (kein "Advanced Filters" Collapse — zentrale Workflow-Dimension)
3. **Tabellen-Spalten Import + Inv** als Phase 2 Follow-up (nicht in diesem Commit)
4. **Stocktake-Stale-Threshold = 90 Tage** (Retail-Standard)

### Backend

**Neuer Endpoint: `GET /admin/media/filter-options`**

Liefert Dropdown-Daten in einem einzigen Call, defensive gegen fehlende Tabellen (frische Installationen):

```json
{
  "import_collections": [
    { "collection_name": "Pargmann", "run_count": 1, "release_count": 5646, "last_import_at": "..." },
    { "collection_name": "Bremer", "run_count": 1, "release_count": 966, "last_import_at": "..." },
    { "collection_name": "Frank Inventory", "run_count": 1, "release_count": 3762, "last_import_at": "..." }
  ],
  "warehouse_locations": [
    { "id": "loc_01", "code": "A-01", "name": "Regal A-01", "is_active": true }
  ],
  "inventory_statuses": ["active", "sold", "reserved"]
}
```

Sortiert nach `MAX(created_at) DESC` — jüngster Import zuerst. Counts helfen Frank die Collection-Größe abzuschätzen ohne den Filter erst anzuwenden zu müssen.

**Erweitert: `GET /admin/media`**

7 neue Query-Parameter:

| Param | Typ | Implementation |
|---|---|---|
| `import_collection` | text | `whereExists(...)` Subquery auf `import_log` mit `idx_import_log_release` |
| `import_action` | text | Kombiniert mit `import_collection` oder standalone (any collection) |
| `inventory_state` | enum | `any` / `none` / `in_stock` / `out_of_stock` — basiert auf LEFT JOIN `erp_inventory_item` |
| `inventory_status` | text | Exact match auf `erp_inventory_item.status` |
| `stocktake` | enum | `done` (< 90d) / `pending` (NULL) / `stale` (> 90d) |
| `price_locked` | true/false | inkl. NULL handling |
| `warehouse_location` | text | Exact match auf `warehouse_location.code` |

Der existing Query-Chain wurde um 2 LEFT JOINs erweitert:
```typescript
.leftJoin("erp_inventory_item", "Release.id", "erp_inventory_item.release_id")
.leftJoin("warehouse_location", "erp_inventory_item.warehouse_location_id", "warehouse_location.id")
```

**Response-Shape erweitert:** Release-Objekte bekommen neue Felder (nicht breaking — alle existing clients ignorieren unbekannte Felder):
- `inventory_item_id`, `inventory_quantity`, `inventory_item_status`, `price_locked`, `last_stocktake_at`
- `warehouse_code`, `warehouse_name`

Das ermöglicht Phase 2: Tabellen-Spalten die diese Werte inline anzeigen, ohne nochmal zu fetchen.

### Frontend

**State-Erweiterung in `/app/media` page.tsx:**
- 7 neue `useState` Hooks für die neuen Filter
- Neuer `filterOptions` State für die Dropdown-Daten
- `useEffect` auf Mount lädt `/admin/media/filter-options`
- Fetch-useEffect um 7 neue Query-Params erweitert
- Reset-Page-Dependency-Array erweitert (Filter-Change → Seite 0)

**Neue Filter-Zeile:**
- Platziert **unter** der bestehenden Filter-Zeile (Label/Country/Year), getrennt durch **dashed top border** für visuelle Trennung
- Struktur: `[Import: Collection ▾] [Action ▾]` · vertikaler Separator · `[Inventory: State ▾] [Status ▾ (conditional)] [Stocktake ▾] [Location ▾ (conditional)] [☐ Price locked]`
- Die "Status" und "Location" Dropdowns werden **nur gerendert** wenn die Daten vom filter-options Endpoint geliefert werden (Defensive bei fresh install ohne Inventory-Daten)
- **"Clear import/inventory filters"** Link rechts außen — erscheint nur wenn irgendein neuer Filter aktiv ist, resettet alle 7 Params auf einmal

### Praxis-Beispiele

| Anwendungsfall | Filter-Kombination |
|---|---|
| "Alle Pargmann-Releases die noch nicht inventarisiert sind" | `import_collection=Pargmann&stocktake=pending` |
| "Alle Bremer-Neuzugänge (nicht die linked/updated)" | `import_collection=Bremer&import_action=inserted` |
| "Alle Items in Warehouse A-01 mit Price-Lock" | `warehouse_location=A-01&price_locked=true` |
| "Items aus irgendeinem Import ohne erp_inventory_item Row" | `inventory_state=none&import_action=inserted` |
| "Stale Stocktakes > 90 Tage" | `stocktake=stale` |

### Performance

- Import-Filter: `whereExists` Subquery ist O(1) pro Release wegen `idx_import_log_release` Index
- Inventory-Filter: LEFT JOIN auf `erp_inventory_item` (~13k rows Cohort A, unproblematisch bei 48k Releases Total)
- Filter-Options-Endpoint: 3 Queries in Serie, insgesamt <100ms bei aktuellen Datenmengen — kein Cache erforderlich (wäre Phase 3 optimization)

### Files

- `backend/src/api/admin/media/filter-options/route.ts` (NEU, 74 Zeilen)
- `backend/src/api/admin/media/route.ts` (+107 / -3) — 7 neue Filter + SELECT-Erweiterung + JOINs
- `backend/src/admin/routes/media/page.tsx` (+137 / -0) — State, Fetch, neue Filter-Zeile JSX
- `docs/architecture/MEDIA_CATALOG_FILTERS_PLAN.md` (NEU, 372 Zeilen) — Plan-Doc mit allen Entscheidungen

### Commit

- `0723439` — Media Catalog: Import + Inventory Filter (Phase 1)

### Phase 2 Follow-up (not in scope)

- **Tabellen-Spalten "Import" + "Inv"** — Kleine Badges in der Release-Tabelle die zeigen aus welcher Collection ein Release kommt und den aktuellen Inventory-Stand. Die Daten sind bereits im Response-Shape enthalten (siehe oben), nur das Rendering fehlt.
- **Bulk-Operations auf gefilterten Ergebnissen** — "Alle gefilterten Pargmann-Items bulk-priced aktualisieren"
- **Saved Filter Presets** — "Meine Filter" wie in Linear ("Stocktake Queue", "Neu importiert", etc.)
- **Server-Side Caching** — Filter-Options Endpoint via Redis cachen falls die Counts über 100+ Collections wachsen

---

## 2026-04-11 — Media Detail: Inventory Status Section + Deep-Link to Stocktake Session (rc22)

**Kontext:** Nach der Hardware-Validation (rc19) und Scanner-Integration (rc21) fragte Frank nach einer zentralen Stelle im Backend, wo er für ein einzelnes Release den **Inventur-Audit-Trail** sehen kann — also welche Stocktake-Aktionen auf dieses Item ausgeführt wurden, wer das wann gemacht hat, welcher Preis gesetzt wurde, und ob das Item aktuell `price_locked` ist (= vom Sync geschützt). Die Media Detail Page ist der natürliche Ort dafür, weil sie eh der Default-Einstieg für jedes einzelne Release ist.

**Was gerendert wird (neue Sektion zwischen „Edit Valuation" und „Discogs Data"):**

1. **Status-Badges (oben, Overview auf einen Blick):**
   - 🟢 **Verifiziert** — mit Datum + Uhrzeit, zusätzlich ein Badge `durch <admin-email>` wenn `last_stocktake_by` gesetzt
   - 🟡 **Noch nicht verifiziert** — wenn `last_stocktake_at IS NULL`
   - 🟠 **Als missing markiert** — wenn `price_locked=true` und `direct_price=0` (F2-Logik)
   - 🔴 **Verkauft** — wenn `inventory_status='sold'` (für später, Walk-in-Sale)
   - ⚫ **Beschädigt / Abgeschrieben** — wenn `inventory_status IN ('damaged','written_off')`
   - 🔒 **Preis gesperrt (Sync-Schutz aktiv)** — zusätzlicher Info-Badge wenn `price_locked=true`, damit Frank sofort sieht, dass der stündliche Legacy-Sync diesen Preis nicht mehr überschreibt

2. **Metadata-Grid (4 Spalten, 8 Felder):**
   - Barcode (monospace, mit Fallback „— (wird beim ersten Verify vergeben)"), Barcode gedruckt, Letzter Stocktake, Lagerbestand (`quantity`), Status, Source (z.B. `frank_collection` für Cohort A), Lagerort (JOIN auf `warehouse_location.name`), Preis-Lock-Zeitpunkt

3. **Inventur-Notizen** — Freitext aus `erp_inventory_item.notes`, wenn vorhanden (mit `whiteSpace: pre-wrap`)

4. **Action-Buttons (2):**
   - **„📋 In Stocktake-Session laden"** — navigiert zu `/app/erp/inventory/session?item_id=<X>`. Die Session-Page parst den Query-Param in einem neuen `useEffect`, ruft den neuen Endpoint `GET /admin/erp/inventory/items/:id` auf (weil der bestehende `/scan/:barcode`-Endpoint voraussetzt, dass das Item bereits einen Barcode hat — was bei noch-nicht-verifizierten Items nicht zutrifft), fügt das Item an Position 0 im Cart-Array ein, und bereinigt den Query-Param via `history.replaceState` damit ein Refresh nicht endlos lädt
   - **„🏷️ Label drucken"** — öffnet `/admin/erp/inventory/items/:id/label` in neuem Tab, direkt aus der Media Detail Page heraus (umgeht den Session-Workflow komplett, falls Frank nur nachdrucken will)

5. **Movement-Timeline (Audit-Trail-Tabelle):**
   - Zeigt bis zu 30 Einträge aus `erp_inventory_movement` sortiert nach `created_at DESC`
   - 6 Spalten: Datum, Typ (mit farbigem Badge: `inbound`=success, `outbound`=purple, `adjustment`=info, `write_off/damaged`=neutral), Grund (`reason`, monospace), Menge (`quantity_change` mit Vorzeichen), Durch (`performed_by` oder „system"), Details (serialisiertes `reference` JSONB)
   - So sieht Frank z.B.: *„11.04.2026 13:00 · adjustment · bulk_15pct_2026 · +0 · system · old: 38, new: 44"*

**Neue Backend-Route: `GET /admin/erp/inventory/items/:id`**

Die bestehende `/scan/:barcode` Route nutzt `WHERE ii.barcode = ?` und eignet sich nur für Items, die bereits einen Barcode haben. Für den „In Session laden"-Button brauchte es einen zweiten Lookup-Pfad für Items, die noch nie verifiziert wurden (= `barcode IS NULL`). Der neue Endpoint `GET /admin/erp/inventory/items/:id` nimmt die `erp_inventory_item.id` als Pfad-Parameter und returniert **exakt das gleiche QueueItem-Format** wie `/scan/:barcode`, damit die Session-Page denselben State-Handler für beide Pfade nutzen kann.

SQL-Query ist identisch zum scan-Endpoint, nur `WHERE ii.id = ?` statt `WHERE ii.barcode = ?`.

**Änderung an `GET /admin/media/:id`:**

SELECT-Clause um 12 `erp_inventory_item`-Felder erweitert (inventory_item_id, inventory_barcode, inventory_status, inventory_quantity, inventory_source, price_locked, price_locked_at, last_stocktake_at, last_stocktake_by, barcode_printed_at, inventory_notes, warehouse_location_id).

Zusätzlicher LEFT JOIN auf `warehouse_location` um `warehouse_location_code` + `warehouse_location_name` zu holen (damit der Lagerort nicht als UUID angezeigt wird, sondern als lesbarer Code + Name).

Neue Sub-Query für `erp_inventory_movement` (orderBy created_at DESC, limit 30, Select auf relevante Spalten). Die Query läuft nur wenn `release.inventory_item_id` vorhanden ist — Items ohne ERP-Row (Cohort B/C) zeigen keine Movements und keine Inventory-Sektion (Frontend-Guard: `{release.inventory_item_id && (...)}`).

**Keine Schema-Änderung.** Alles basiert auf existierenden Tabellen (`erp_inventory_item`, `erp_inventory_movement`, `warehouse_location`).

**Änderungen:**
- `backend/src/api/admin/media/[id]/route.ts` (+42, -3) — Query-Erweiterung
- `backend/src/api/admin/erp/inventory/items/[id]/route.ts` (NEW, 93 Zeilen) — Item-Lookup-Endpoint
- `backend/src/admin/routes/media/[id]/page.tsx` (+199) — neue Inventory Status Sektion + Types + State
- `backend/src/admin/routes/erp/inventory/session/page.tsx` (+24) — Query-Param-Handler für Deep-Link

**Gesamt:** 4 Dateien, +355 Zeilen

**Type-Check:** 0 neue Errors (nur bestehender unrelated Error in `transactions/page.tsx` unverändert).

Das ist ein klassischer „sauberer Audit-Trail + Quick-Actions"-Feature-Add: Frank hat jetzt auf der Media Detail Page die vollständige Inventur-Historie eines Releases plus die zwei am häufigsten gebrauchten Actions (Session-Load für Re-Check, Label-Nachdruck) direkt auf einer Seite.

---

## 2026-04-11 — Stocktake Session: Unified Scanner/Shortcut Handler + POS Konzept Draft (rc21)

**Kontext:** Nach der erfolgreichen Barcode-Label Hardware-Validation (rc19) und Franks Scanner-Setup (Inateck BCST-70 auf macOS-Modus + Deutsche Tastatur) fehlte noch die letzte Kernkomponente für den Inventur-Workflow: Der Scanner-Input im Stocktake-Session-Screen. Beim Review des bestehenden Codes in `backend/src/admin/routes/erp/inventory/session/page.tsx` fiel ein kritischer Race-Condition-Bug auf, der den Scanner de facto unbrauchbar machte.

**Der Race-Condition-Bug:**

Der Session-Screen hatte zwei separate Event-Listener auf `keydown`:
1. **`useScannerDetection`** (Capture-Phase, `true` Flag) — puffert Scanner-Input, fires `onScan` bei Enter
2. **Shortcut-Handler** (Bubble-Phase, kein Flag) — fires Actions für V/P/M/S/N/L/U und Arrow-Keys

Wenn der USB-HID-Scanner `VOD-000001\n` tippt (10 Zeichen @ ~5ms/char, gesamt ~50ms), erreicht der **erste** `V`-Keystroke BEIDE Handler. Der Shortcut-Handler sieht `V` → feuert sofort `handleVerify()` **bevor** der Scanner-Buffer mit den restlichen 9 Zeichen komplett ist. Ergebnis: Ein Scan würde ungewollt das aktuelle Item mit dem aktuellen Preis verifizieren, und erst danach den Scan-Lookup auslösen → falsches Item verifiziert.

Genauso für andere Scanner-Barcode-Zeichen: Ein hypothetisches Label `VOD-POSITION1` würde durch `P` die Price-Input-Maske öffnen, durch `M` Missing triggern, etc.

**Fix — Unified Handler mit Debounce:**

Beide Handler in einen einzigen `useEffect` konsolidiert mit folgender Logik:

- Jeder printable Keystroke wird **nicht sofort ausgeführt**, sondern in einen 40ms-`setTimeout` geschickt
- Jeder nachfolgende Keystroke **cancelt den vorherigen Timer**
- Scanner-Chars kommen alle 5–15ms → vorheriger Timer wird immer gecancelt → **Shortcut-Action feuert nie während eines Scans**
- Human-Key hat >80ms Abstand zum nächsten User-Input → Timer läuft durch → Shortcut-Action feuert mit 40ms Latenz (imperceptibel)

Der Scanner-Buffer akkumuliert alle Chars wie bisher, `Enter` triggert `handleScanBarcode()` und cancelt gleichzeitig den pendingen Shortcut-Timer explizit (doppelt sicher).

Arrow-Keys und Escape umgehen die Debounce (sofortige Reaktion, weil sie nicht in einem USB-HID-Barcode vorkommen und User-Response-Time kritisch ist).

**Zusätzlich:**

- **Toast-Feedback für unbekannte Barcodes** — `handleScanBarcode` zeigt jetzt explizit „Unknown barcode: XYZ" wenn der gescannte String nicht mit `VOD-` beginnt (vorher silent ignored)
- **Vollständiger dependency array** im useEffect (`printerStatus`, `handleScanBarcode` ergänzt)
- **Ausführlicher Doc-Comment** erklärt das Race-Condition-Problem und den Debounce-Trick für zukünftige Entwickler

**Änderungen:**
- `backend/src/admin/routes/erp/inventory/session/page.tsx` — 110 insertions / 92 deletions (Cleanup + Konsolidierung)

**Type-Check:** 0 neue Errors (nur bestehender unrelated Error in `transactions/page.tsx` unverändert).

Das schließt **Phase B6** aus `INVENTUR_COHORT_A_KONZEPT.md §14.11` ab. Die Inventur-Session ist damit vollständig **scanner-ready** — Frank kann einen Scanner während einer Session nutzen, um zu einem bestimmten Item zu springen (z.B. für Re-Check oder wenn ein Item nicht in der Queue-Reihenfolge auftaucht).

**Offen für Phase B7:** QZ Tray Silent-Print (aktuell Fallback auf Browser-Print-Dialog beim Label-Druck).

---

### POS Walk-in Sale Konzept v1.0 (Draft)

Parallel: Neues Design-Dokument `docs/optimizing/POS_WALK_IN_KONZEPT.md` (Commit `1977744`) nach Franks Frage nach dem Verkaufsprozess im Laden. Das Konzept definiert die Architektur für eine dedizierte POS-Oberfläche (`/app/pos`) mit Cart-Flow, Erweiterung der bestehenden `transaction`-Tabelle (neuer `item_type='walk_in_sale'`, neue `payment_provider` für `sumup`/`cash`, TSE-Spalten), Cloud-TSE-Integration (Empfehlung fiskaly), SumUp-Terminal extern in Phase 1, Bon-Druck auf bestehendem Brother QL-820NWB mit DK-22205 62mm Rolle.

**Franks Antworten festgehalten (§2):** 5+ Walk-ins/Tag → Option B (dedizierte POS-Page), TSE + Quittungen erforderlich, SumUp als Payment-Provider, Customer-Management in 3 Modi (bestehend/neu/anonym).

**Status:** Draft, wartet auf §10-Klärungen (TSE-Anbieter final, Kleinunternehmer-Status beim Steuerberater, Bon-Hardware-Entscheidung). Noch **keine** Implementierung — erst Konzept-Freigabe + offene Fragen klären.

**Implementierungs-Aufwand (wenn freigegeben):** P1 Core POS-UI (~2 Tage) → P2 TSE-Integration (~2 Tage) → P3 Bon-Druck (~1 Tag) → P4 SumUp REST API optional (~2-3 Tage). Gesamt P1-P3 ~5 Arbeitstage.

---

## 2026-04-11 — Discogs Import: Full Decoupling + Post-Import CTA + Media Import History (rc20)

**Kontext:** rc18 hat den Fetch-Loop vom HTTP-Request entkoppelt und damit den Navigation-Kill gelöst. Analyze + Commit liefen aber noch über SSE-Streams mit demselben latenten Problem. Beim ersten echten Commit-Test (Frank Inventory, 3762 Releases) fiel das auf: die UI blieb auf `0/2483` stehen, obwohl der Backend-Commit-Loop weiter durchlief und erfolgreich completed. Außerdem war nach Success kein Call-to-Action da, und im Media-Detail fehlte die Info aus welchem Import ein Release stammt.

### Part 1 — Analyze + Commit Routes entkoppelt (elegante Lösung)

Statt wie bei Fetch die komplette Loop-Logik in eine neue Funktion zu extrahieren, haben wir einen eleganteren Ansatz gewählt: **`SSEStream` Headless Mode**.

**`backend/src/lib/discogs-import.ts`:**
- Konstruktor akzeptiert jetzt `res: MedusaResponse | null`
- Bei `res === null` (Headless):
  - `emit()` schreibt nur in `import_event` + bumped `last_event_at` (kein HTTP-Write-Versuch)
  - `startHeartbeat()` ist no-op (kein HTTP-Stream zu halten)
  - `end()` ist no-op
- Bei vorhandenem `res`: verhält sich exakt wie vorher (HTTP + DB)
- **Bonus-Bugfix beim emit():** Das alte `emit()` hat nach dem HTTP-write-Error früher RETURNt und damit den DB-insert ausgelassen. Das heißt: **nach Client-Disconnect gingen alle weiteren Events verloren**, sowohl für SSE-Clients als auch für das Polling-Fallback. Jetzt wird DB **immer** geschrieben, unabhängig vom HTTP-Status. Das war der stille Grund warum Fetches "manchmal funktionierten".

**`backend/src/api/admin/discogs-import/commit/route.ts` + `analyze/route.ts`:**
Beide POST-Handler strukturell identisch zu Fetch aus rc18:
1. Validate session + body
2. **Idempotency-Check:** `status === "importing"/"analyzing"` AND `last_event_at < 60s` → returnt `{ already_running: true }` ohne Double-Spawn. Stale (>60s) → Restart erlaubt (Commit nutzt `completed_batches` für Resume)
3. `res.json({ ok: true, started: true })` — sofortige 200-Antwort
4. `void (async () => { try { ... entire existing loop body unchanged ... } catch {...} })().catch(...)`
5. Der Loop bekommt `new SSEStream(null, pg, session_id)` — alle existierenden `stream.emit()` Calls routen transparent in die DB

**Entscheidender Vorteil dieses Ansatzes:** Die Loop-Bodies von commit (~650 Zeilen) und analyze (~200 Zeilen) sind **unverändert**. Keine Refactorings, keine Umbenennungen, keine neuen Parameter. Nur der POST-Handler-Wrapper ist anders. Das minimiert Regressionsrisiko massiv.

**Frontend `handleCommit` + `handleAnalyze`:**
- Plain `fetch()` POST, liest 200 JSON-Response (kein `commitSSE.start(...)` mehr)
- `setPollingEnabled(true)` + `setPollingInitialEventId(0)`
- Phase-Transitions werden im bestehenden `useSessionPolling` onStatus Callback gehandhabt:
  - `analyzing → analyzed`: lädt `analysis_result` aus session, setzt `analysis` + `selectedIds`, switcht Tab auf Analysis, setzt `currentPhase` auf review, stoppt Polling
  - `importing → done`: baut `commitResult` aus `commit_progress.counters` (`inserted`, `linked`, `updated`, `skipped`, `errors`), ruft `clearActiveSessionId()`, stoppt Polling

**Ergebnis:** Alle drei lang laufenden Ops (Fetch, Analyze, Commit) laufen jetzt als detached background tasks. Navigation, Tab-Close, SSE-Drops killen keinen Loop mehr.

### Part 2 — Post-Import Call-to-Action

Nach erfolgreichem Commit zeigte die Seite nur einen kleinen Success-Alert ohne klaren Next-Step. Der User wollte einen richtigen Call-to-Action.

**Neue Completion-Card** (ersetzt den alten Alert):
- Prominenter Header: **"✓ Import erfolgreich abgeschlossen"** in grün auf Gradient-Background
- Collection-Name + 8-char Run-ID (monospace)
- Stats-Zeile farbcodiert: Inserted (grün) · Linked (gold) · Updated (blau) · (Skipped neutral, Errors rot wenn vorhanden)
- **3 Action-Buttons:**
  1. **"📂 View Imported Collection →"** (Gold primary) → navigiert auf `/discogs-import/history/{run_id}` (die frisch importierte Collection mit allen Releases)
  2. **"All Collections"** (neutral) → navigiert auf die Collections-Liste `/discogs-import/history`
  3. **"↻ Start New Import"** (ghost) → resettet den kompletten Wizard-State (`file`, `collectionName`, `uploadResult`, `analysis`, `commitResult`, alle progress fields, `events`, `currentPhase`, `tab`) und kehrt zum Upload-Tab zurück — bereit für einen frischen Import ohne Page-Reload

### Part 3 — Import History im Media-Detail

**User-Feedback:** "was noch im Backend fehlt: die Info, aus welchem Import den Eintrag stammt"

Die `import_log` Tabelle hat alle nötigen Infos (per-release Zeile mit `run_id`, `collection_name`, `import_source`, `action`, `data_snapshot`), sie waren nur nicht im Media-Detail sichtbar.

**Backend `GET /admin/media/:id`:**
- Neue Query: LEFT JOIN `import_log` × `import_session` auf `release_id = ?` AND `import_type = 'discogs_collection'`, ORDER BY created_at DESC, LIMIT 10
- Zusätzliches Response-Feld `import_history` (Array)
- Defensive try/catch: wenn `import_log` Tabelle noch nicht existiert (frische Installationen), returnt leeres Array statt 500

**Frontend Media Detail Page:**
- Neuer State `importHistory`
- **Neue Section "Import History"** zwischen Notes/Tracklist und Sync History
- **Nur sichtbar wenn Einträge existieren** — alte Releases vor dem Discogs Import Service sehen die Section gar nicht
- Tabelle mit Columns:
  - **Date** (wann der Import den Release berührt hat)
  - **Collection** (fett, z.B. "Pargmann", "Bremer", "Frank Inventory")
  - **Source File** (z.B. "Bremer loh-fi-inventory-20251208-1124 3.csv", truncated mit ellipsis)
  - **Action** (farbcodierte Badge: `inserted`=success, `linked`=warning, `updated`=info, `skipped`=neutral)
  - **Discogs ID** (monospace, Link zu discogs.com/release/{id})
  - **"View Run →"** (Link zur Import-Run-Detail-Page `/app/discogs-import/history/{runId}`)
- Ein Release kann mehrfach erscheinen wenn es durch mehrere Imports geht (z.B. `inserted` aus Collection A, später `updated` aus Preis-Sync in Collection B)

**Nutzen für Frank:** Direkt im Release-Detail sieht er ob der Eintrag frisch aus einem Import kommt, welche Collection er war, welche Source-File, und kann per Click zur gesamten Collection springen um den Kontext zu haben.

### Files

**Part 1 (Decoupling):**
- `backend/src/lib/discogs-import.ts` — SSEStream Headless Mode (+50 / -15)
- `backend/src/api/admin/discogs-import/commit/route.ts` — POST Handler Wrapper, Idempotency (+50 / -10)
- `backend/src/api/admin/discogs-import/analyze/route.ts` — POST Handler Wrapper, Idempotency (+54 / -18)
- `backend/src/admin/routes/discogs-import/page.tsx` — handleCommit/handleAnalyze neu, Polling-Transitions (+62 / -60)

**Part 2 (CTA):**
- `backend/src/admin/routes/discogs-import/page.tsx` — Completion-Card statt Alert (+74 / -5)

**Part 3 (Import History):**
- `backend/src/api/admin/media/[id]/route.ts` — import_history Query (+30)
- `backend/src/admin/routes/media/[id]/page.tsx` — Section + State (+62)

### Commits

- `bd5ba74` — Analyze + Commit Routes entkoppelt + Post-Import CTA
- `a3e06a0` — Media Detail: Import History Section

### Was jetzt komplett funktioniert

| Feature | rc17 | rc18 | rc20 |
|---|---|---|---|
| Fetch überlebt Navigation | ❌ | ✅ | ✅ |
| Analyze überlebt Navigation | ❌ | ❌ | ✅ |
| Commit überlebt Navigation | ❌ | ❌ | ✅ |
| Idempotency (kein Double-Spawn) | ❌ | ✅ Fetch | ✅ alle 3 |
| Post-Import CTA | ❌ | ❌ | ✅ |
| Media Detail zeigt Import-Herkunft | ❌ | ❌ | ✅ |
| Polling ist primäre UI-Update-Quelle | ❌ | ✅ Fetch | ✅ alle 3 |

### Nicht in Scope (separates Follow-up)

- **Stale-Restart für Analyze/Commit auf UI-Mount** — aktuell nur für Fetch implementiert. Analyze+Commit würden denselben Pattern brauchen (bei Mount prüfen ob `analyzing`/`importing` + `last_event_at > 60s` → re-POST). Weniger dringend weil Analyze+Commit kürzer laufen.
- **CTA nach Analyze-Done** — aktuell nur nach Commit. Könnte analog auf `analyzed` Status eine CTA zum Review anzeigen.

---

## 2026-04-11 — Barcode-Label Hardware Validation + v6 Layout (rc19)

**Kontext:** Die ERP-Inventur-Infrastruktur (Commit `ef27907` vom 2026-04-07, Cohort A mit 13.107 Items backfilled) und der Barcode-Label-Code (rc6, 2026-04-07) waren zwar deployed, aber noch nie auf echter Hardware validiert. Frank hat am 2026-04-11 den Brother QL-820NWBc + Inateck BCST-70 + 5× DK-22210 Rollen angeschlossen, und wir haben den kompletten Print-Stack live getestet. Ergebnis: **drei kritische Bugs** in der ursprünglichen Planungsphase, die nur beim echten Druck sichtbar wurden.

**Die drei Hardware-Bugs (in Debugging-Reihenfolge):**

1. **Drucker im falschen Command Mode**
   Der Brother QL-820NWBc wird ab Werk im **`P-touch Template`**-Mode ausgeliefert. In diesem Mode interpretiert der Drucker eingehende CUPS-Druckdaten als Template-Füllung und druckt auf eine intern einkodierte Default-Template-Länge (~29mm), **egal** was CUPS oder die PDF-Seitengröße sagen. Fix: Brother Web-Interface (`https://<printer-ip>/`, Login mit Pwd vom Drucker-Aufkleber) → Printer Settings → Device Settings → **Command Mode auf `Raster`**. Aktivierung per POST im EWS mit CSRFToken.

2. **CUPS PageSize ohne `Custom.`-Prefix**
   Die installierte Brother PPD (`/etc/cups/ppd/Brother_QL_820NWB.ppd`) hat PageSize-Namen wie `29x62mm`, `29x90mm` — aber **alle entsprechen DK-11xxx die-cut Rollen**, nicht der DK-22210 Continuous-Rolle. Wenn man `-o PageSize=29x90mm` setzt, erwartet der Brother-Treiber fest vorgestanzte 90mm-Labels → Konflikt mit der Endlos-Rolle → Fallback auf Default-Cut. **Nur `Custom.29x90mm`** (mit `Custom.`-Prefix) zwingt den Treiber in den Continuous-Tape-Mode. Queue-Default per `lpoptions -p Brother_QL_820NWB -o PageSize=Custom.29x90mm` gesetzt (user-level, kein sudo).

3. **PDF in falscher Orientation**
   Naive Annahme: Ein Label das „breiter als hoch" ist, baut man als Landscape-PDF (`[90mm, 29mm]`). Falsch — der Brother-Treiber erwartet Portrait (`[29mm, 90mm]`), wobei die erste Dimension = Tape-Breite. Der Content muss **via `doc.rotate(-90, {origin:[0,0]}) + doc.translate(-LABEL_LENGTH, 0)`** in einen virtuellen 90×29 Landscape-Frame gezeichnet werden. Ohne diese Transformation wird der Content entweder auf 29mm skaliert (schrumpft um Faktor 3) oder rechts geclippt.

**Scanner-Bug:**

4. **Inateck BCST-70 Keyboard-Layout**
   Ab Werk im Windows/Android-Modus mit US-Keyboard. Auf macOS mit deutschem QWERTZ wird der US-Keycode `0x2D` (für `-`) als deutsches `ß` interpretiert. Resultat: `VOD-000001` kommt als `VODß000001` in TextEdit/Admin-Inputs an. Fix via 6 Setup-Barcodes aus BCST-70 Handbuch §1.6 (2 Sessions: „MacOS/iOS Modus" + „Deutsche Tastatur").

**Production-Code Änderungen (Commit-Scope):**

- **`backend/src/lib/barcode-label.ts`** — komplett neu geschrieben mit v6-Layout:
  - PDF-Size `[29mm × 90mm]` portrait (vorher fälschlich 62×29mm landscape)
  - Rotation via `rotate(-90) + translate(-LABEL_LENGTH, 0)`
  - `LabelData`-Interface erweitert um optional `labelName, country, condition, price`
  - Zwei-Spalten-Layout: Text-Spalte links (Artist 12pt bold / Title·Label 10pt / Format·Country·Condition·Year 8pt), Preis-Spalte rechts (22pt bold, rechtsbündig, vertikal zentriert)
  - **Hardware-Margin-Fix:** `PRICE_RIGHT_PAD = 3 * MM` Extra-Padding rechts, weil die Brother PPD `HWMargins` ~3mm nicht-druckbaren Rand an den Feed-Richtung-Enden hat
  - Preis wird nur gerendert wenn `price > 0` (F2-Konvention für Missing-Items: Preis=0 → Label druckt ohne Preis-Spalte)
  - Ausführlicher Doc-Comment-Header mit den drei kritischen Regeln und Verweis auf `docs/hardware/BROTHER_QL_820NWB_SETUP.md`

- **`backend/src/api/admin/erp/inventory/items/[id]/label/route.ts`** — DB-Query erweitert:
  - `LEFT JOIN "Label" as l ON l.id = r."labelId"`
  - Zusätzliche Spalten: `r.country`, `r.legacy_condition`, `r.legacy_price`, `l.name as label_name`
  - `labelData`-Mapping füttert die neuen optionalen Felder

- **`backend/src/api/admin/erp/inventory/batch-labels/route.ts`** — gleiche Query-Erweiterung für den Batch-Print.

- **CUPS Queue-Default** auf `Custom.29x90mm` via `lpoptions` gesetzt (lokal bei Frank, muss auf jedem neuen Mac wiederholt werden — dokumentiert in `BROTHER_QL_820NWB_SETUP.md` §4).

**Neue Dokumentation:**

- **`docs/hardware/BROTHER_QL_820NWB_SETUP.md`** (neue Datei, ~350 Zeilen) — vollständiges Setup-Handbuch:
  - §1 Quick Reference (das 3-Zeilen Fix-Rezept)
  - §2 Hardware-Setup (Drucker, Treiber, WiFi)
  - §3 Raster-Mode Fix (Web-Interface Walkthrough + curl-Verifikation)
  - §4 PageSize=Custom.29x90mm (warum der Prefix kritisch ist)
  - §5 PDF-Layout (Portrait-Orientation + Rotation-Trick + Font-Tabelle)
  - §6 Scanner-Setup für macOS + Deutsche Tastatur (Setup-Barcode-Sessions)
  - §7 **Debugging-Kompass** (Symptom→Ursache→Fix-Tabelle mit allen heute-aufgetretenen Bugs)
  - §8 Standalone-Test-Script (ohne Medusa-Runtime)
  - §9 Production-Code-Integration
  - §10 Referenzen

- **`docs/optimizing/INVENTUR_COHORT_A_KONZEPT.md` §14.5 + §14.13 aktualisiert:**
  - §14.5 (Label-Design) — Layout-Skizze auf v6 umgestellt, neue Felder dokumentiert
  - §14.13 (Hardware-Test-Ergebnisse) — Findings + Production-Code-Status + Offene Punkte (onScan.js, QZ Tray)

- **`CLAUDE.md`** — Key-Gotchas-Liste um Brother-QL-820NWB-Eintrag erweitert, Link zu Setup-Doku.

**Was NICHT in diesem Release ist (klare Follow-ups):**

- `onScan.js` im Admin-Session-Screen (Phase B6) — Scanner ist hardware-validiert, aber noch nicht in `backend/src/admin/routes/erp/inventory/session/page.tsx` integriert. Für den Livebetrieb kann man den Scanner aktuell nur in externen Inputs (TextEdit o.ä.) nutzen.
- QZ Tray Silent-Print (Phase B7) — aktuell Fallback auf Browser-Print-Dialog im Admin, kein Ein-Klick-Druck aus der Session heraus.
- End-to-End-Test via Admin-UI mit `ERP_INVENTORY` Flag ON — bisher nur via `lp` direkt validiert, nicht durch den vollen Medusa-API-Stack.

**Hardware-Test-Log (~25 Fehldrucke bis zur funktionierenden Config):**
v1 (62×29mm landscape, Custom.62x29mm) → ~29×30mm geclippt
v2 (29×62mm portrait, Custom.29x62mm) → ~29×30mm geclippt (gleicher Cut-Default)
v3 (PageSize=29mm, BrTapeLength=62) → ~13mm geclippt (BrTapeLength nicht wirklich durchgreifend)
v4 ruler 29×100mm → nur 12×12mm Ecke sichtbar (PPD-Default war `12x12mm`)
v5 (PageSize=29x62mm nach Raster-Mode-Fix) → noch immer ~29mm quadratisch (wegen fehlendem `Custom.`-Prefix)
v6 (PageSize=Custom.29x62mm, Raster-Mode, Portrait+Rotate) → **erfolgreich**, Font-Tuning folgt
v6+larger-fonts → 11pt/8pt passt
v6+new-fields (29×90mm, Label/Country/Condition/Price, Zwei-Spalten) → Frank-Approved
v6+narrower-barcode (70% statt 95%) → final
v6+price-right-pad (3mm Hardware-Margin-Reserve) → Preis nicht mehr geclippt

**Credits:** Hardware-Test 2026-04-11 mit Frank (VOD Records), Setup-Details + Debugging-Historie komplett in `docs/hardware/BROTHER_QL_820NWB_SETUP.md` §7.

---

## 2026-04-11 — Discogs Import: Fetch Loop vom HTTP-Request entkoppelt (rc18)

**Kontext:** Nach dem Collections-Overview-Deploy (rc17) fiel ein kritischer UX-Bug auf: Wenn der User während eines laufenden Fetch-Prozesses auf `/app/discogs-import/history` navigierte und zurückkehrte, war der Prozess **unterbrochen**. Session blieb auf `status='fetching'`, kein Fortschritt mehr, kein Resume-Banner. User musste manuell neu starten (was außerdem einen zweiten Loop gespawnt hätte).

**Root-Cause-Analyse:**

Die Fetch-Route nutzte `SSEStream` um Events live ins HTTP-Response zu schreiben (`res.write()`). Das hat den Loop **tight gecoupled** mit der HTTP-Request-Lifetime:
1. User navigiert weg → Browser schließt fetch → TCP FIN an Backend
2. Medusa/Node.js teared down request scope
3. `pgConnection` (aus `req.scope.resolve(...)`) wurde invalid ODER der async handler wurde still terminiert
4. Loop stoppt ohne Exception im Stderr — einfach nur kein Fortschritt mehr
5. Session bleibt für immer auf `fetching`

**Diagnostische Evidenz:**
- `pm2 logs` zeigt keine Errors rund um den Stop-Zeitpunkt
- Session 9081c145 stoppte bei `fetched=25` von `3763` um 09:00:36 UTC
- `last_event_at` unverändert 30+ Min später
- Polling-Endpoint funktionierte normal → Backend war erreichbar, nur der Loop war tot

Meine erste Annahme (rc17 Auto-Reattach via Polling, commit `55e680d`) war falsch: ich dachte der Loop würde weiterlaufen weil `SSEStream.emit()` Write-Errors catched. Das stimmt für den Emit-Call selbst — aber irgendwas anderes killed den Loop ohne Exception.

**Lösung: komplette architektonische Entkopplung**

Die Fetch-Route läuft jetzt als **detached background task**. Der HTTP-Request kehrt sofort zurück, der Loop lebt unabhängig davon.

**Backend `lib/discogs-import.ts`:**
- Neuer Helper `emitDbEvent(pg, sessionId, phase, eventType, payload)` — schreibt direkt in `import_event` ohne HTTP-Response-Involvement, bumped `last_event_at` auf der Session (für Stale-Detection). Failures werden geloggt aber nie geworfen (fail-soft).
- `awaitPauseClearOrCancel()` akzeptiert jetzt `null` als stream-Parameter — emittet das `paused`-Event via `emitDbEvent` statt SSEStream wenn kein Stream verfügbar ist.

**Backend `api/admin/discogs-import/fetch/route.ts` (komplett umgeschrieben):**
- `POST` handler:
  1. Validiert `session_id`, session existiert, `DISCOGS_TOKEN` gesetzt
  2. **Idempotenz-Check:** Wenn `session.status === 'fetching'` AND `last_event_at < 60s ago` → returnt `{ ok: true, already_running: true }` ohne Double-Spawn. Wenn stale (>60s), assumes dead loop und erlaubt Restart.
  3. Setzt `status='fetching'`, clearControlFlags, emittet `start`-Event
  4. **Returnt 200 JSON sofort** `{ ok: true, session_id, started: true }` — kein SSE-Header mehr
  5. Spawnt `runFetchLoop(pg, sessionId, session, token)` als detached task via `void ... .catch(...)`. Der catch-Block markiert Session bei Loop-Crash als `status='error'`.
- `runFetchLoop()` enthält die komplette Loop-Logik (ca. 200 Zeilen), ist eine async function die komplett unabhängig vom HTTP-Request existiert:
  - Nutzt nur `emitDbEvent` statt `stream.emit`
  - `fetch_progress` wird jetzt alle 10 Iterationen upgedated (vorher 25), weil Polling (2s) die primäre UI-Update-Quelle ist
  - Cancel/Pause-Checks funktionieren weiter über die DB-Flags
  - Error-Handling schreibt `pushLastError` und emittiert `error_detail`-Events

**Frontend `admin/routes/discogs-import/page.tsx`:**
- `handleFetch` komplett neu: POSTs zu `/fetch`, liest **normale JSON-Response**, enabled Polling. Kein `fetchSSE.start(...)` mehr. Der `fetchSSE`-Reader bleibt im Code (wird von analyze/commit weiterhin genutzt).
- Polling-Callback erkennt `fetching → fetched` Transition: setzt `fetchResult` aus `fetch_progress`, stoppt Polling (User entscheidet wann Analyze startet).
- `loadResumable` auf Mount: **Stale-Loop-Detection**. Wenn `status='fetching'` AND `last_event_at > 60s` alt → re-POSTet zu `/fetch`. Backend's Idempotency-Check erkennt das als stale und startet Loop neu. Schützt gegen pm2 restart / OOM / Prozess-Crashes.

**3 Robustness-Layer:**
1. **Loop unabhängig von HTTP-Request** — `res.write()` ist nicht mehr im Hot-Path, Backend überlebt Client-Disconnect komplett
2. **Idempotency-Check** — kein Double-Spawn bei schnellem Re-POST
3. **Stale-Auto-Restart** — tote Loops werden auf Mount erkannt und neugestartet

**DB Cleanup:**
Session `9081c145-4845-45ba-be32-55c45556fce0` (Frank Inventory, fetched=25/3763) manuell auf `status='abandoned'` gesetzt — der Loop war eh tot von den gestrigen Deploys.

**Not in scope (same pattern gilt aber):**
- `/analyze` Route nutzt weiter SSE → same kill-on-navigation issue. Analyze ist kürzer (Minuten statt Stunden) daher weniger schmerzhaft. Follow-up wenn es auffällt.
- `/commit` Route gleich. Commit ist per-batch transactional (rc16), Wiederaufnahme via `completed_batches` möglich — auch Follow-up.

**Was funktioniert jetzt:**
- Fetch läuft → User navigiert zu `/history` oder schließt den Tab → Backend-Loop läuft weiter und schreibt in DB
- User kommt zurück → `loadResumable` erkennt aktive Session → enabled Polling → UI zeigt Live-Progress als wäre nie jemand weg gewesen
- Mehrere Browser-Tabs können denselben laufenden Loop beobachten
- pm2 restart mitten im Loop: Session bleibt stale → auf Mount wird Idempotency-POST getriggert → Backend erkennt stale → neuer Loop startet (würde ab gecachten IDs weiterlaufen)

**Verifikation:**
- TypeScript + Build clean
- Frontend build successful
- Server ready on port 9000 (11:36:41 UTC)

**Commit:** `ffc1440` — Discogs Import Fetch: decouple loop from HTTP request lifecycle

**Files:**
- `backend/src/lib/discogs-import.ts` — new `emitDbEvent()` helper, `awaitPauseClearOrCancel()` accepts null stream (+45 / -3)
- `backend/src/api/admin/discogs-import/fetch/route.ts` — komplette Neu-Struktur, POST + runFetchLoop split (+290 / -228)
- `backend/src/admin/routes/discogs-import/page.tsx` — handleFetch neu, Stale-Loop-Detection, Polling-Transition (+45 / -17)

---

## 2026-04-11 — Discogs Import: Collections Overview + Detail Page + CSV Export (rc17)

**Kontext:** Nach dem Pargmann-Import (5.646 Releases, rc16) war der bestehende History-Tab zu schwach: flache Tabelle, Modal-Drill-Down mit nur Event-Timeline, keine Catalog-Deep-Links, keine Export-Möglichkeit. Es fehlte echte Collection-Verwaltung.

**Was gebaut wurde (alles additiv, keine Schema-Changes):**

**Backend Routes:**
- `GET /admin/discogs-import/history` (erweitert): liefert jetzt zusätzlich `stats` (total_runs, total_releases, total_inserted/linked/updated, last_import_at) und pro Run `session_status`, `session_id`, `row_count`, `unique_count`, `import_settings` via LEFT JOIN mit `import_session`.
- `GET /admin/discogs-import/history/:runId` (NEU): Detail-Endpoint. Drei parallele Queries liefern Run-Metadaten + Session, Releases-Liste mit Live-DB-Zustand (LEFT JOIN `Release` × `Artist` × `Label`), aggregierte Live-Stats (inkl. `visible_now`, `purchasable_now`, `unavailable_now`) und bis zu 2000 Events aus `import_event`.
- `GET /admin/discogs-import/history/:runId/export` (NEU): CSV-Export mit 27 Spalten: Action/IDs/Links (Discogs URL, Storefront URL), Release-Metadaten (Artist, Title, Original Title aus Excel-Snapshot, Format, Year, Catalog Number, Label, Country), Discogs-API-Daten (Genres, Styles, Lowest Price, For Sale, Have, Want) und VOD-Live-State (Price, Direct Price, Condition, Sale Mode, Available, Has Cover). UTF-8 BOM für Excel-Kompatibilität, Dateiname `{collection-slug}-{runId-8}-{date}.csv`.

**Admin UI:**
- `/app/discogs-import` History-Tab: Neue **Stats-Header-Karten** (6 Metriken), **Search-Input** (client-side Filter auf Collection/Source/Run-ID), **CSV-Download-Link pro Zeile**, Row-Click navigiert jetzt auf dedizierte Detail-Route statt Modal zu öffnen. Das alte Drill-Down-Modal wurde komplett entfernt.
- `/app/discogs-import/history/[runId]` (NEU): Detail-Seite mit:
  - PageHeader mit Collection-Name, Source, Status-Badge, Copy-Run-ID + Export-CSV + Back-Button
  - StatsGrid mit 8 Karten (Total, Inserted, Linked, Updated, Skipped, Visible now, Purchasable now, Unavailable)
  - Import-Settings-Card (Condition, Price Markup, Inventory)
  - Filter-Bar: Search (Artist/Title/Discogs-ID/Release-ID), Action-Dropdown, Visible-Only-Checkbox, Result-Count
  - Release-Tabelle (initial 200 Rows, "Load more" Button): Cover (aus `coverImage`) · Artist/Title · Meta (Format · Year · Condition) · Action-Badge (farbcodiert) · Price · Visibility-Dot · 3 Link-Icons (🌐 Storefront, ⚙ Admin-Catalog, D Discogs)
  - Collapsible Event-Timeline (aus `import_event`)

**Edge Cases gehandhabt:**
- Skipped-Action-Rows werden visuell gedimmt (opacity 0.55)
- Releases ohne `slug`/`current_title` → "DELETED"-Badge, Storefront-Link inaktiv
- Runs ohne Session-Link → events leer, UI zeigt "Events not available"
- Medusa file-routing collision zwischen `history/[runId]/route.ts` und `history/[runId]/export/route.ts` ist **non-existent** — beide Routes werden sauber kompiliert (verifiziert im `.medusa/server/src/api/...` Build-Output).

**Definition of Done:**
- Backend TypeScript check clean (keine neuen Errors, nur pre-existing `transactions/page.tsx` JSX-Parse-Warning)
- Medusa build erfolgreich (Frontend build completed)
- VPS deploy durch (clean build + admin assets + .env symlink + pm2 restart), Server ready on port 9000
- Smoke-Test: `GET /admin/discogs-import/history` + `/:runId` antworten (401 bei ungültiger Session = Route existiert)

**Commit:** `2a96b3e` — Discogs Import: Collections overview + detail page + CSV export

**Files (initial commit `2a96b3e`):**
- `backend/src/api/admin/discogs-import/history/route.ts` (+30 / -5)
- `backend/src/api/admin/discogs-import/history/[runId]/route.ts` (NEU ~130)
- `backend/src/api/admin/discogs-import/history/[runId]/export/route.ts` (NEU ~180)
- `backend/src/admin/routes/discogs-import/page.tsx` (+80 / -65)
- `backend/src/admin/routes/discogs-import/history/[runId]/page.tsx` (NEU ~380)
- `docs/architecture/DISCOGS_COLLECTIONS_OVERVIEW_PLAN.md` (NEU — Plan doc)

### Follow-up Fixes (gleicher Tag, rc17-polish)

Beim Testen der Collections-Ansicht kamen sechs Bug-Findings die alle noch am gleichen Tag gefixt und deployed wurden:

**Fix 1: History als eigenständige Route statt Wizard-Tab (`d53bb79`)**

Problem: History-Tab innerhalb des Import-Wizards war während laufender Prozesse nicht sauber erreichbar — konzeptionell falsch (Collections sind ein Archiv-Feature, kein Wizard-Step).

Fix:
- Neue Route `/app/discogs-import/history` (`history/page.tsx`) — standalone Collections-Liste mit Stats-Header, Search, runs-Tabelle
- Wizard (`/app/discogs-import`) hat nur noch 2 Tabs: Upload + Analysis
- "View Collections History →" Button im PageHeader des Wizards navigiert zur Liste
- Detail-Page Back-Button zeigt auf `/discogs-import/history`
- Alle history-spezifischen State/Effects aus der Wizard-Page entfernt

Neue Route-Struktur:
```
/app/discogs-import                  → Wizard (Upload/Analysis)
/app/discogs-import/history          → Collections list (standalone)
/app/discogs-import/history/:runId   → Run detail (standalone)
```

**Fix 2: Stale-Session Cleanup (`5fe89dc`)**

Problem: Nach pm2-Restart mid-SSE blieben Sessions in non-terminal Status hängen. Resume-Detection zeigte dann tote Zombies als "Active import session" Banner. 4 Pargmann-Sessions vom 2026-04-10 blockierten das UI mit "started 26h ago".

Fix:
- Neues Status-Value `abandoned` (kein Schema-Change — `status` ist `TEXT` ohne Constraint)
- DB-Cleanup: 4 stale Pargmann-Sessions auf `status='abandoned'` gesetzt
- `/admin/discogs-import/history` active_sessions Query excludiert jetzt `done/abandoned/error` UND filtert Sessions >6h alt (`created_at > NOW() - INTERVAL '6 hours'`). Großzügig (normale Fetch 1-2h bei 5k releases) aber kurz genug um Crashes automatisch zu bereinigen
- `/session/:id/cancel` status-Filter ergänzt um `abandoned`/`error`
- UI Resume-Detection defensiver Check um `abandoned` erweitert

**Fix 3: Import Settings Display Bug (`5fe89dc`)**

Problem: Auf der Detail-Page zeigte nur "Markup" — Condition und Inventory fehlten. Grund: Die DB-Feldnamen sind `media_condition`/`sleeve_condition`/`inventory` (number 0/1), nicht `condition`/`inventory_enabled` wie ich ursprünglich getippt hatte.

Fix: TypeScript-Interface von `importSettings` korrigiert, Render zeigt jetzt Media + Sleeve + Markup + Inventory (yes/no mit Zahl) + Selected IDs count.

**Fix 4: Back-Button unsichtbar (`4b823e5`)**

Problem: Der Back-Button auf der Detail-Page war komplett unsichtbar. Root Cause: Die `admin-ui.tsx` `Btn`-Component nimmt `label` prop (nicht children), und `"secondary"` ist keine gültige Variante (existierend: `primary/gold/danger/ghost`). Meine `<Btn variant="secondary">children</Btn>` Calls haben daher leere Buttons gerendert.

Fix:
- Alle fehlerhaften Btn-Usages ersetzt durch plain `<button>` mit expliziten Styles
- Prominenter "← Back to Collections" Link jetzt **links oben über dem PageHeader** (breadcrumb-style), nicht mehr in der Actions-Row
- Gleicher Fix auf der History-Liste: "← Back to Import Wizard"
- Auch der "Load more"-Button und Copy Run ID waren betroffen

**Fix 5: Inventory-Info + Admin-Link (`4b823e5`)**

- Subtitle zeigt jetzt zusätzlich `inventory: N (yes|no)` aus import_settings
- Admin-Link im Links-Column war `/app/catalog?q={release_id}` (Suche mit Filter). Jetzt direkt `/app/media/{release_id}` → Admin Release Detail Page

**Fix 6: Stock-Column + Klickbare Cover/Titel (`fd669a5`)**

- Neue Spalte "Stock" in der Release-Tabelle zeigt den inventory-Wert aus import_settings farbcodiert (grün bei >0, muted bei 0). Schnelle visuelle Bestätigung pro Row.
- Cover-Bild + Artist/Title sind jetzt klickbare Links zur Admin Release Detail Page (`/app/media/:id`), target=_blank. Das kleine ⚙ Zahnrad-Icon ist raus — die Link-Spalte zeigt nur noch Storefront 🌐 und Discogs D (größer).

### Fehlgeschlagener Reattach-Versuch (`55e680d`)

Zwischen rc17 und rc18 gab es einen ersten Versuch das Navigation-Kill-Problem zu lösen: `loadResumable` sollte active Sessions auto-attachen statt Resume-Banner zu zeigen. Der Teil hat funktioniert — aber die Grundannahme "Backend-Loop läuft nach Client-Disconnect weiter" war **falsch**. Siehe rc18-Eintrag. Der Commit ist technisch noch drin (auto-reattach + polling-callback transitions) und ist ab rc18 auch tatsächlich korrekt, weil der Loop jetzt wirklich detached läuft.

**Nicht Teil dieser Änderung (separate Tickets):** Bulk-Operations (Price Adjustment, Re-analyze, Bulk-Delete), Collection-Renaming, Soft-Delete ganzer Runs, Time-Series-Charts für Imports über Zeit.

---

## 2026-04-10 — Discogs Import Commit Hardening + Schema Fixes (rc16)

Proaktive Härtung der Commit-Phase + mehrere Schema-Mismatches gefixt die erst durch die neue v5.1-Architektur sichtbar wurden. Erfolgreicher Produktions-Import von 5.646 Releases (Pargmann Waschsalon-Berlin Collection).

### Context — was der Auslöser war

Der Pargmann Import (5.653 Rows) hatte in einem früheren Run einen Foreign-Key-Error in der linkable_updates-Phase. Mit der alten all-or-nothing Transaktion gingen 997 existing updates + 803 linked updates durch Rollback verloren — ein einziger bad row hat ~17 Minuten Commit-Arbeit vernichtet. Gleichzeitig hatten sich im Commit-Route mehrere Legacy-Schema-Mismatches angesammelt (`format_group`, `Track.createdAt`, `slug` collisions) die nie getriggert wurden weil vorher immer was anderes crashte.

### 1. Commit Hardening v5.1 (Per-Batch Transaktionen)

**Problem:** Eine einzige riesige Transaktion für alle 5.000+ INSERTs. Ein Fehler bei Release #4.999 wirft alle 4.998 vorherigen weg.

**Fix:** 500er-Batches, jede in eigener `pgConnection.transaction()`. Bei Batch-Fehler: rollback dieser Batch + `continue` mit nächster Batch. `completed_batches_{phase}: number[]` tracked in `commit_progress`. Resume überspringt bereits committed Batches.

**Trade-off:** Verliert all-or-nothing Semantik. Aber gewinnt Partial-Safety — max 500 rows Verlust statt aller 5000 bei einem bad row.

### 2. Pre-Commit Validation Pass

Neue Phase `validating` vor jeder Transaktion:
- **V1:** Alle `new` rows haben cached API data
- **V2:** Keine duplicate slugs im new set (verhindert Release.slug unique constraint violations)
- **V3:** Keine Release IDs die schon in DB existieren (würde auf misklassifizierte "new" hinweisen)

Fehler → `validation_failed` Event + Session zurück auf `analyzed`, **zero DB writes**. Fail-fast ohne Transaktion zu öffnen.

### 3. `import_settings` + `selected_ids` Persistenz

Erster `updateSession` im Commit route schreibt:
```json
{
  "media_condition": "VG+",
  "sleeve_condition": "VG+",
  "inventory": 1,
  "price_markup": 1.2,
  "selected_discogs_ids": [123, 456, ...]
}
```

Frontend `handleResumeBanner` case `importing` lädt diese Settings und restored React-State (condition, inventory, markup, selectedIds). User kann Commit ohne Re-Selecting fortsetzen.

### 4. Schema-Mismatch Fixes

Drei Bugs im Commit-Code die durch die neue Batch-Architektur ans Licht kamen:

| Bug | Fix |
|---|---|
| `Release.format_group` column does not exist | → `format` (USER-DEFINED enum `ReleaseFormat`, NOT NULL) mit explizitem Cast `?::"ReleaseFormat"` |
| `Track.createdAt` column does not exist | Track hat keine Timestamp-Spalten, `createdAt` aus INSERT entfernt |
| 185 duplicate slugs bei identischen Titeln (z.B. Depeche Mode "Leave In Silence" mit 3 verschiedenen Pressings) | Neue Helper `buildImportSlug(artist, title, discogs_id)` hängt `-{discogs_id}` an den slug — garantiert unique per Definition |

Plus: `legacy_available = false` explizit gesetzt beim INSERT (default ist `true`, semantisch falsch für Discogs-Imports).

### 5. UX-Fix: Resume-Banner auch ohne localStorage

**Problem:** Wenn localStorage leer war (anderer Browser, Cookie clear, nach `completed_with_errors`), zeigte die Upload-Seite keinen Resume-Banner auch wenn es eine active Session in der DB gab. User musste im History-Tab suchen oder localStorage manuell via Browser-Konsole setzen.

**Fix:** Beim Mount ruft die Seite `/history` auf und prüft `active_sessions` (alle Sessions NOT IN `done`, `error`). Wenn vorhanden → Banner sofort angezeigt. localStorage bleibt als "preferred session" hint.

### 6. Echter Resume-Button

**Problem:** Der alte `handleResumeBanner` lud nur UI-State aus der Session, startete aber keine Operation. User klickte "Resume" und sah... nichts.

**Fix:** Status-basierte Auto-Resume-Logic. Nach Laden der Session wird abhängig von `session.status` die richtige Operation getriggert:
- `uploaded` / `fetching` → `handleFetch()` (Loop skippt cached IDs)
- `fetched` → `handleAnalyze()` (fast, idempotent)
- `analyzing` → `handleAnalyze()` (re-run, keine DB-Seiteneffekte)
- `analyzed` → Lädt analysis_result, navigiert zu Review Tab
- `importing` → Lädt analysis + warnt dass re-commit nötig ist

### 7. Session Status Bug (Fix in rc16)

**Problem:** Bei `completed_with_errors` wurde session.status auf `done` gesetzt → Resume-Banner versteckt → user musste manuell DB updaten um retry zu können. Plus: Final commit_progress überschrieb die `completed_batches_*` keys, sodass retry keine skipping machen konnte.

**Fix:**
- `finalStatus = errors > 0 ? 'analyzed' : 'done'` — bei partial success bleibt die Session resumable
- `completed_batches_*` Keys werden aus dem alten commit_progress in den finalen State gemergt — retry skippt korrekt
- `error_message` bekommt freundliche Beschreibung: "Commit completed with N errors. M rows committed successfully. Click 'Approve & Import' again to retry failed batches."

### Datenbank-Resultate (Pargmann Import Run ID `cbce39b2`)

| Entity | Count |
|---|---|
| Discogs Releases inserted | **3.251** |
| Legacy Releases linked (fuzzy matched) | **1.398** |
| Existing Releases updated | **997** |
| Skipped (404 not found auf Discogs) | **7** |
| Errors | **0** |
| **Total committed** | **5.646** |
| Tracks | 26.464 (~8.1/release) |
| Images | 11.277 (~3.5/release) |
| Discogs Artists (inkl. Credits) | 30.776 |
| Discogs Labels (dedupliziert) | 1.508 |
| import_log entries | 5.646 |

Mit Cover: 3.190 von 3.251 (**98%**).

### Timeline (chronologisch)

1. **07:17** — Erster Commit-Versuch: `Release_labelId_fkey` bei `legacy-release-1923` (legacy Daten, `labelId = "legacy-label-1"` zeigt auf nicht-existierendes Label). Alle 997 + 803 Operations rolled back. → Trigger für Commit Hardening Plan.
2. **08:00** — v5.1 Plan approved (per-batch, validation, settings persistence), Implementierung.
3. **09:00** — v5.1 deployed, aber Fetch läuft noch → Session wartet.
4. **11:30** — Pargmann Fetch fertig (5.653/5.653 cached). v5.1 deployed (Commit `ebdb98d`).
5. **12:00** — Erster v5.1 Retry: Pre-Commit Validation fängt 185 duplicate slugs (Pressings collision). Fail-fast ohne DB writes. → `buildImportSlug` mit discogs_id suffix (Commit `d7ce924`).
6. **12:06** — Zweiter Retry: existing + linkable durch (997 + 1398), new_inserts crasht mit `format_group` column error. Batch-Isolation greift: alle 7 new_insert Batches failen aber linkable bleibt committed. (Commit `7fa8f20` fix format → format).
7. **12:17** — Dritter Retry: existing + linkable nochmal durch (idempotent), new_inserts crasht mit `Track.createdAt`. (Commit `2df9c3a` fix Track INSERT).
8. **12:23-12:29** — Vierter Retry: **alles durch**. Batch 1 (65s) → Batch 7 (~25s). Run ID `cbce39b2`. 3.251 inserted, 1.398 linked, 997 updated, **0 errors**.

### Geänderte Dateien (6 commits über den Tag)

| Commit | Was |
|---|---|
| `ebdb98d` | v5.1: Batching + Validation + Settings Persistence (commit/route.ts komplett rewritten) |
| `d7ce924` | `buildImportSlug` mit discogs_id suffix — fixes duplicate slug collisions |
| `7fa8f20` | `format_group` → `format` column + `legacy_available = false` + enum cast |
| `2df9c3a` | Track INSERT entfernt nonexistent `createdAt` column |
| `974db03` | UX Fix: Resume-Banner via /history active_sessions statt nur localStorage |
| `d022ac1` | Session Status Fix: 'analyzed' statt 'done' bei errors > 0 + preserve completed_batches_* |
| `23a6529` | Next.js images whitelist: `**.discogs.com` (sonst Placeholders statt Cover) |
| `e45c469` | Docs: rc16 CHANGELOG + Session Post-Mortem (Erstversion) |
| `f59286e` | Catalog Category Filter: Discogs-Imports in vinyl/tapes sichtbar (format_id NULL Bug) |
| `0754f66` | Discogs Import estimated_value auf ganze Euros runden (whole_euros_only Policy) |

### Post-Import Fixes (Visibility + Policy)

Nach dem erfolgreichen Import traten weitere User-facing Bugs auf die gefixt wurden:

**Discogs Cover Images unsichtbar (Commit `23a6529`):**
`next.config.ts` hatte nur `tape-mag.com` und die R2 CDN-Domain in `images.remotePatterns`. Next.js Image Component blockiert jede nicht-whitelisted Domain → alle Discogs-hotlinked Images zeigten Placeholders. Fix: `**.discogs.com` Wildcard (deckt `i.discogs.com`, `img.discogs.com`, `s.discogs.com`).

**Catalog Category Filter Bug (Commit `f59286e`):**
Die Catalog-Filter "vinyl" und "tapes" joinen auf die Legacy `Format`-Tabelle via `format_id`. Unsere Discogs-Imports setzen `format_id = NULL` (nur die `format` enum Spalte), sodass der JOIN NULL lieferte und `Format.kat = 2` alle **3.190 Discogs-Imports komplett ausschloss**. User-Report: "im Catalog finde ich Beerdigung / Tollwut nicht". Fix: OR-Clause die zusätzlich via `Release.format` enum matcht wenn `format_id IS NULL` (`LP` → vinyl, `CASSETTE`/`REEL` → tapes). Impact: +2.170 Vinyl-Releases (von 8.450 auf 10.620), +~100 Tapes. CD/VHS-Kategorien waren nicht betroffen weil die schon `Release.format` direkt nutzen.

**Price Rounding (Commit `0754f66`):**
User-Report: "wir haben ja nur ganze Preise - bitte auf oder abrunden". Platform-Policy `BID_CONFIG.whole_euros_only = true` verlangt ganzzahlige Preise überall. `buildPriceEntry` berechnete aber `estimated_value = Math.round(vgPlusPrice * priceMarkup * 100) / 100` (2 Dezimalstellen, z.B. 76.83 €, 13.64 €). Fix: `Math.round(vgPlusPrice * priceMarkup)` → whole euros. Plus DB-Update für bestehende 2.360 Discogs-Imports: `UPDATE Release SET estimated_value = ROUND(estimated_value) WHERE data_source = 'discogs_import' AND estimated_value != ROUND(estimated_value)`.

### Referenz

- Service Doc: `docs/DISCOGS_IMPORT_SERVICE.md` v5.1
- Plan: `docs/DISCOGS_IMPORT_LIVE_FEEDBACK_PLAN.md` (rc15) — IMPLEMENTIERT
- Session Learnings: `docs/architecture/DISCOGS_IMPORT_SESSION_2026-04-10.md`

---

## 2026-04-10 — Discogs Import Live Feedback: SSE + Resume + Cancel/Pause (rc15)

Komplett-Refactoring des Import-Workflows für **vollständige Live-Transparenz** über alle 4 Schritte. Kein Black-Box-Verhalten mehr bei großen Imports. Löst das Problem "nach dem Klick auf Skip passiert nichts" und ergänzt die rc14-Architektur um Event-Streaming, Session-Persistenz und Operator-Control.

### Architektur

- **Alle 4 Schritte** (Upload, Fetch, Analyze, Commit) sind jetzt SSE-Streams mit phasenbasiertem Progress, strukturierten Events und Heartbeat alle 5 Sekunden
- **Single Source of Truth** ist die DB: `import_session` trackt alle Progress-Felder, `import_event` speichert jedes Event für Replay + Drill-Down
- **Resume-fähig**: `localStorage` speichert active session-id, Page-Load zeigt Resume-Banner, Polling-Fallback (2s) wenn SSE droppt
- **Cancel/Pause** via DB-Flags: `cancel_requested` / `pause_requested`, Loops pollen und brechen sauber ab (Commit → Transaction Rollback)
- **Timeout-Philosophie**: Keine künstlichen Job-Dauer-Timeouts. Heartbeat hält nginx-Default-Timeout (300s) ausreichend — auch für mehrstündige Fetches

### Migration (`2026-04-10_discogs_import_live_feedback.sql`)

- `import_session` erweitert: `parse_progress`, `analyze_progress`, `commit_progress`, `last_event_at`, `last_error`, `cancel_requested`, `pause_requested` (JSONB/BOOLEAN)
- Neue Tabelle `import_event`: `(id BIGSERIAL, session_id FK, phase, event_type, payload JSONB, created_at)` + Indizes

### Neue API Routes

- `GET /admin/discogs-import/session/:id/status` — full state + letzte 100 Events (Resume + Polling-Fallback)
- `POST .../session/:id/cancel` — setzt `cancel_requested`, triggert Rollback bei laufendem Commit
- `POST .../session/:id/pause` — setzt `pause_requested`
- `POST .../session/:id/resume` — clearet `pause_requested`

### Backend-Routes (SSE-Rewrite)

- **Upload:** Header-basiertes SSE (`Accept: text/event-stream`), emittiert `parse_progress` jede 1000 Rows, Session wird skeleton-inserted für Event-Persistenz
- **Fetch:** Heartbeat, `cancel_requested` / `pause_requested` Poll, `error_detail` Events, `pushLastError` Buffer (rolling 10)
- **Analyze:** 4-phasiges SSE (`exact_match` → `cache_load` → `fuzzy_match` mit Batch-Progress → `aggregating`), Cancel/Pause zwischen Batches
- **Commit:** 3-phasiges SSE (`existing_updates` → `linkable_updates` → `new_inserts` → `committing`), `throw "__CANCEL__"` im Loop triggert sauberen Transaction-Rollback mit `rollback`-Event

### Shared Libraries

- **`backend/src/lib/discogs-import.ts`**: `SSEStream`-Klasse (mit heartbeat, event persistence), `getSession`/`updateSession`, `isCancelRequested`/`awaitPauseClearOrCancel`, `pushLastError`, `clearControlFlags`, `compactRow`/`expandRow`
- **`backend/src/admin/components/discogs-import.tsx`**: `useSSEPostReader` hook, `useSessionPolling` hook, Komponenten `ImportPhaseStepper` / `ImportPhaseProgressBar` / `ImportLiveLog` (mit Auto-Scroll + Filter) / `SessionResumeBanner`, localStorage helpers

### Admin UI

- Phase-Stepper oben im Workflow (5 Phasen visuell: Upload → Fetch → Analyze → Review → Import)
- Live Progress-Bars mit Phase-Name, Current/Total, ETA, Sub-Label pro Schritt
- Live-Log-Panel unter laufenden Operationen mit Auto-Scroll, Filter (all/progress/errors), monospace-formatiert
- Cancel / Pause / Resume Buttons sichtbar während running ops
- Resume-Banner beim Page-Load wenn Session aktiv ist
- History-Tab Drill-Down-Modal: Click auf Run → Modal zeigt komplette Event-Timeline aus `import_event`

### Nginx

- Location-Block für `/admin/discogs-import/` mit `proxy_buffering off`, `X-Accel-Buffering no`, `client_max_body_size 50m`
- **Kein** künstlich hoher `proxy_read_timeout` — Default (300s) reicht, weil Heartbeat alle 5s sendet
- Timeout-Philosophie: "Timeouts sind Idle-Detection, nicht Job-Dauer-Begrenzung"

### Dateien (geändert/neu)

**Neu:**
- `backend/scripts/migrations/2026-04-10_discogs_import_live_feedback.sql`
- `backend/src/lib/discogs-import.ts` (shared library)
- `backend/src/admin/components/discogs-import.tsx` (shared components)
- `backend/src/api/admin/discogs-import/session/[id]/status/route.ts`
- `backend/src/api/admin/discogs-import/session/[id]/cancel/route.ts`
- `backend/src/api/admin/discogs-import/session/[id]/pause/route.ts`
- `backend/src/api/admin/discogs-import/session/[id]/resume/route.ts`
- `docs/DISCOGS_IMPORT_LIVE_FEEDBACK_PLAN.md` (Plan → implementiert)

**Umgeschrieben:**
- `backend/src/api/admin/discogs-import/upload/route.ts` (Header-based SSE)
- `backend/src/api/admin/discogs-import/fetch/route.ts` (Heartbeat + cancel/pause + errors)
- `backend/src/api/admin/discogs-import/analyze/route.ts` (4-phase SSE)
- `backend/src/api/admin/discogs-import/commit/route.ts` (3-phase SSE + rollback)
- `backend/src/api/admin/discogs-import/history/route.ts` (Drill-down mit events)
- `backend/src/admin/routes/discogs-import/page.tsx` (SSE integration, stepper, live log, resume, cancel)
- `nginx/vodauction-admin.conf` + `nginx/vodauction-api.conf` (SSE location block)
- `docs/DISCOGS_IMPORT_SERVICE.md` → v5.0

### Referenz

- Plan: `docs/DISCOGS_IMPORT_LIVE_FEEDBACK_PLAN.md` — IMPLEMENTIERT
- Service: `docs/DISCOGS_IMPORT_SERVICE.md` v5.0

---

## 2026-04-10 — Discogs Import Refactoring: DB-Sessions, DB-Cache, pg_trgm, Transaktionen (rc14)

Komplettes Refactoring des Discogs Import Service nach Architecture Audit (`docs/DISCOGS_IMPORT_AUDIT.md`). Löst alle 3 kritischen und 4 hohen Mängel die beim Pargmann-Import aufgefallen sind (5.653 Releases, nur 982 matched, 0 inserted).

### Architektur-Änderungen
1. **Sessions → PostgreSQL** (`import_session` Tabelle) — Überlebt Server-Restart/Deploy. Status-Tracking: uploaded → fetching → fetched → analyzing → analyzed → importing → done.
2. **API-Cache → PostgreSQL** (`discogs_api_cache` Tabelle) — TTL 30d (Errors 7d). Keine 65 MB JSON-Datei mehr.
3. **Snapshots → Live-DB-Queries** — Matching gegen echte DB, nicht gegen Tage-alte JSON-Snapshots.
4. **Echtes Fuzzy-Matching** — pg_trgm `similarity()` mit GIN-Index statt exaktem String-Vergleich. Match-Confidence Score (40-100%) in UI.
5. **Transaktionaler Import** — Alles-oder-nichts. Fehler bei Release #3.500 → Rollback → DB unverändert.

### Migration
- `backend/scripts/migrations/2026-04-10_discogs_import_refactoring.sql`
- Extensions: `pg_trgm`, `fuzzystrmatch`
- Tabellen: `import_session`, `discogs_api_cache`
- Index: `idx_release_title_trgm` (GIN auf `lower(Release.title)`)

### Geänderte Dateien (Rewrite)
- `backend/src/api/admin/discogs-import/upload/route.ts` — Session → DB, Cache-Check → DB, exportiert `getSession()`, `updateSession()`, `expandRow()`
- `backend/src/api/admin/discogs-import/fetch/route.ts` — Cache → DB statt JSON-Datei, Session aus DB
- `backend/src/api/admin/discogs-import/analyze/route.ts` — Live-DB-Queries + pg_trgm, Ergebnis in `import_session.analysis_result`
- `backend/src/api/admin/discogs-import/commit/route.ts` — Transaktionaler Import, liest Analysis aus Session, Rollback bei Fehler
- `backend/src/api/admin/discogs-import/history/route.ts` — Active Sessions + Drill-Down per Run
- `backend/src/admin/routes/discogs-import/page.tsx` — Match-Confidence Badges (grün/gelb/rot), SSE Error-Handling

### Was entfallen ist
- In-Memory Session Map + `touchSession()` + `startSessionKeepAlive()`
- `scripts/data/db_discogs_ids.json` (ersetzt durch Live-Query)
- `scripts/data/db_unlinked_releases.json` (ersetzt durch Live-Query + pg_trgm)
- `scripts/data/discogs_import_cache.json` (ersetzt durch `discogs_api_cache` Tabelle)
- Alle `fs.readFileSync` / `fs.writeFileSync` in den API Routes

### Referenz
- Audit: `docs/DISCOGS_IMPORT_AUDIT.md`
- Plan: `docs/DISCOGS_IMPORT_REFACTORING_PLAN.md` (Status: IMPLEMENTIERT)

---

## 2026-04-10 — Discogs Import: Complete End-to-End Workflow (rc13)

Schliesst die letzte Lücke im Discogs Import Workflow: Der API-Fetch (Bilder, Tracklist, Credits, Genres, Preise pro Condition) läuft jetzt direkt aus der Admin UI — kein Terminal/SSH mehr nötig.

### Kompletter Workflow (alle 4 Schritte in Admin UI)
1. **Upload & Parse** — CSV/XLSX hochladen, Rows parsen
2. **Fetch Discogs Data** — NEU: Server-side API Fetch mit SSE Live-Progress (Fortschrittsbalken, aktueller Artikel, ETA, Fetched/Cached/Errors Counter). ~20 Releases/min, resumable.
3. **Start Analysis** — Matching gegen DB (EXISTING/LINKABLE/NEW/SKIPPED) mit Detail-Preview (Bilder, Tracklist, Credits, Genres)
4. **Approve & Import** — Review mit Checkboxen, Condition/Inventory/Markup Settings, SSE Live-Progress

### Neue Dateien
- `backend/src/api/admin/discogs-import/fetch/route.ts` — SSE-Endpoint, fetcht `/releases/{id}` + `/marketplace/price_suggestions/{id}` pro Release

### Geänderte Dateien
- `backend/src/admin/routes/discogs-import/page.tsx` — Rewrite: "Step 2: Fetch Discogs Data" UI (Progress, ETA, Skip-Button)
- `docs/DISCOGS_IMPORT_SERVICE.md` — Alle TODOs → Live, vollständiger 4-Step-Workflow dokumentiert

### Konfiguration
- `DISCOGS_TOKEN` in `backend/.env` (lokal + VPS)
- `client_max_body_size 10m` in nginx (api + admin)

### Performance
- 2 API-Calls pro Release (Release-Daten + Price Suggestions)
- Rate Limit: 40 req/min → ~20 Releases/min
- ~130 min für 2.619 Releases, ~37 min für 750 Releases
- Resumable: gecachte Releases werden übersprungen
- Cache: `scripts/data/discogs_import_cache.json`

---

## 2026-04-10 — Media Detail: Field Contrast, Storage Location, Credits Fix (rc12)

Fortführung der Admin Media-Detail-Überarbeitung. Visuelle Verbesserungen + Lagerort-Dropdown + Credits/Tracklist-Parsing komplett auf Frontend-Logik umgestellt.

### Visueller Kontrast (Release Information)
- Feldwerte haben jetzt `background: C.card`, `border`, `padding`, `fontWeight: 500` — klare Label/Value-Unterscheidung
- Labels bleiben `T.micro` (10px, uppercase, muted)

### Storage Location Dropdown
- Neues Dropdown im Edit-Valuation-Bereich (aus `warehouse_location` Tabelle, nur aktive)
- API: GET joined `erp_inventory_item` für `warehouse_location_id`, POST updatet `erp_inventory_item`
- Kein Auto-Create von `erp_inventory_item` — nur Update bestehender Einträge

### Credits/Tracklist-Parsing: 1:1 Frontend-Logik
**Problem:** Eigene Heuristiken im Backend wichen vom Frontend ab → Doppelung, gemischte Daten, `description`-Fallback zeigte HTML als Credits.

**Lösung:** Exakte Übernahme der Frontend-Logik (`storefront/src/app/catalog/[id]/page.tsx` Zeilen 149-161):

```
1. extracted = credits ? extractTracklistFromText(credits) : null
2. effectiveTracklist = extracted?.tracks.length
     ? extracted.tracks
     : (tracklist?.length ? (parseUnstructuredTracklist(tracklist) ?? tracklist) : null)
3. effectiveCredits = extracted?.tracks.length
     ? extracted.remainingCredits
     : credits
```

**Entfernt:**
- `hasStructuredTracklist`-Heuristik
- Track-Header-Stripping Regex
- `description`-Fallback (Frontend nutzt `description` **nie** für Credits)
- Alle eigenen Entscheidungsbäume

**Hinzugefügt:**
- `parseCredits()` — portiert aus Frontend, parsed "Role – Name" Muster (Discogs-Style)
- Strukturierte Credits-Anzeige: Role/Name-Grid wenn Roles gefunden, Plain-Text-Fallback sonst

### Commits
- `f50e3e4` Admin: visual field contrast + storage location dropdown
- `15143fb` Fix: structured credits display + strip track headers from credits
- `7894921` Fix: mirror frontend tracklist/credits logic exactly (no description fallback)
- `15b19bc` Fix: rename parsedTracks → effectiveTracklist (runtime error)

---

## 2026-04-09 (late night) — Admin Media Detail: Light-Mode + Tracklist Parsing (rc11)

Komplette Überarbeitung der Admin Media-Detail-Seite (`/app/media/[id]`). Dark-Mode-Farben entfernt, Shared Design System übernommen, Tracklist/Notes-Parsing aus Frontend portiert.

### Design System Migration
- **Dark-Mode entfernt:** Lokales `COLORS`-Objekt (`#1c1915`, `#2a2520`, `#3a3530`) durch shared `C`/`T`/`S` Tokens ersetzt
- **Light-Mode:** Weiße Karten, helle Borders (`#e7e5e4`), transparenter Hintergrund — konsistent mit Medusa Shell
- **Shared Components:** `PageHeader`, `PageShell`, `SectionHeader`, `Badge`, `Btn`, `Toast`, `EmptyState` statt Custom-Implementierungen
- **`useAdminNav()`:** Back-Navigation zu Catalog Hub eingebaut
- **Gold-Farbe korrigiert:** `#b8860b` (Design Guide) statt `#d4a54a`

### Tracklist/Notes Parsing (aus Frontend portiert)
- **Datenquelle-Hierarchie** (spiegelt `storefront/src/app/catalog/[id]/page.tsx` Zeilen 145-161):
  1. `credits` → primäre Quelle via `extractTracklistFromText()` (HTML → strukturierte Tracks)
  2. JSONB `tracklist` → Fallback via `parseUnstructuredTracklist()` (flache Einträge → gruppiert)
  3. `description` → nur als Notes (Fallback wenn keine Credits)
- **Credits-Rest** wird als Notes angezeigt (Tracklist-Zeilen entfernt → keine Doppelung)
- **HTML-Stripping:** `<table>`, `<span class="MuiTypography-root">`, `<br>` etc. vollständig entfernt
- **HTML-Entity-Decoding:** `&amp;`, `&ndash;`, `&mdash;`, `&#39;`, `&nbsp;` + Deutsche Umlaute (`&auml;`→ä, `&ouml;`→ö, `&uuml;`→ü, `&szlig;`→ß)
- **Erweiterte Position-Erkennung:** `1-1`, `2-3` (Bindestrich-Positionen) neben Standard A1/B2/1/12
- **Section-Header:** `-I-`, `-II-`, `-III-` und "Tracklist"-Label werden übersprungen statt als Tracks angezeigt

### Commits
- `4a2b761` Admin: migrate media detail page to light-mode design system
- `c898134` Admin: parse HTML in notes/tracklist like storefront does
- `50c7fd5` Fix: deduplicate tracklist — prefer JSONB field, strip from description
- `f9eaad4` Fix: use credits field for tracklist extraction (mirror storefront logic)
- `b4a1f97` Fix: handle 1-1/2-3 positions, section headers (-I-), German HTML entities

---

## 2026-04-09 (night) — 3-Tier Pricing Model + Discogs Price Suggestions

Verbindliches Preiskonzept implementiert (PRICING_KONZEPT.md, freigegeben durch Frank). Trennt klar: Referenzpreise → Richtwert → finaler Verkaufspreis.

### Preiskonzept (3 Ebenen)
1. **Referenzpreise** (automatisch): `legacy_price` (Frank), `discogs_lowest/median/highest_price`, NEU: `discogs_suggested_prices` JSONB (Preise pro Zustand aus echten Verkäufen)
2. **Richtwert** (automatisch): `estimated_value` = Discogs VG+ × 1.2 (20% Aufschlag)
3. **Verkaufspreis** (nur Admin/Inventur): `direct_price` — wird NIE automatisch gesetzt

### Entscheidungen (Frank)
- Aufschlagsfaktor: 20% auf Discogs VG+
- Richtwert auch für bestehende Legacy-Releases: Ja
- Discogs Suggested Prices Update: Wöchentlich
- `direct_price` als Kaufbar-Kriterium: Nach Go-Live

### Neue Felder
- `Release.discogs_suggested_prices` JSONB — Preise pro Condition (M, NM, VG+, VG, G+, G, F, P) mit Currency + Timestamp

### Importer-Erweiterungen
- Python CLI: 2. API-Call pro Release (`/marketplace/price_suggestions/{id}`) — getestet, funktioniert
- Commit Route: schreibt `discogs_suggested_prices` + `estimated_value`, nie `direct_price`
- Admin UI: Price Markup Dropdown (1.0× bis 1.5×, Default 1.2×)
- Condition Dropdown (Default VG+/VG+) + Inventory Toggle (Default ON)
- Live Import Progress via SSE

### Bestandsanalyse (41.546 Releases)
| Gruppe | Anzahl | Situation |
|--------|--------|-----------|
| Legacy + Discogs + Preis | 6.541 | Franks Preis Ø€34,51 vs. Discogs Median Ø€20,11 (172%) |
| Discogs, kein Preis | 10.049 | Nur Discogs-Referenz |
| Franks Preis, kein Discogs | 7.027 | Nur Legacy-Referenz |
| Weder noch | 17.929 | Kein Preis |

### Dokumentation
- `docs/PRICING_KONZEPT.md` — Verbindliches Preiskonzept (Management Summary + technische Details)

---

## 2026-04-09 (evening) — Discogs Import v2: Full Enrichment + Admin Approval

Erweitert den Discogs Collection Importer um volle Datenübernahme und Admin-Freigabe-Workflow.

### Erweiterte Datenübernahme (v2)
- **Bilder** → `Image` Tabelle mit `source='discogs'` + `Release.coverImage`
- **Beschreibung** → `Release.description` (aus Discogs `notes`)
- **Format-Detail** → `Release.legacy_format_detail` (z.B. `"Vinyl, 7", 45 RPM"`)
- **Credits** → `ReleaseArtist` mit Roles + `Release.credits` als Text
- **Alle Labels** → erstes = `labelId`, weitere = `Release.additional_labels` JSONB
- **Genres/Styles** → `Release.genres TEXT[]` + `Release.styles TEXT[]`
- **Preise mit History** → `Release.discogs_price_history` JSONB (Zeitstempel + Quelle pro Eintrag)
- **Source-Tracking** → `Release.data_source = 'discogs_import'`, `Image.source = 'discogs'`

### Admin-Freigabe
- Checkbox pro Release (alle default ON), Kategorie-Checkbox für Select All/None
- Detail-Preview aufklappbar: Cover-Thumbnail, Tracklist, Credits, Genres/Styles, Format, Labels, Preise, Beschreibung, Quelle+Datum
- DB-Release-ID als klickbarer Gold-Link zum Storefront-Katalog
- "Approve & Import (X selected)" — nur ausgewählte werden importiert

### Import Settings
- **Condition Dropdown** (Default: VG+/VG+) → `media_condition` + `sleeve_condition`
- **Inventory Toggle** (Default: ON=1, OFF=0) → `inventory`

### Live Import Progress
- SSE-Stream zeigt nach Klick auf "Approve & Import" live den aktuellen Artikel
- Fortschrittsbalken + Counter (z.B. "1.234 / 2.619")

### Schema-Migration
5 neue Spalten auf `Release` (genres, styles, discogs_price_history, additional_labels, data_source) + `Image.source`. Migration: `backend/scripts/migrations/2026-04-09_discogs_import_v2.sql`.

### Fixes
- Body-Size-Limit für Upload-Route auf 5 MB erhöht (base64-encoded Excel > default 100 KB)
- DB-Snapshot-Dateien (`db_discogs_ids.json`, `db_unlinked_releases.json`) auf VPS kopiert

---

## 2026-04-09 — Fullscreen Image Lightbox

Product-Image-Lightbox von kleinem Radix Dialog (max-w 896px, aspect-square) auf near-fullscreen Custom Portal umgebaut. Best-Practice-Recherche (Discogs, eBay, Etsy, Shopify Dawn) als Grundlage.

### Änderungen
- **`storefront/src/components/ImageGallery.tsx`** — Radix Dialog durch Custom Framer Motion Fullscreen-Overlay ersetzt
  - Bild-Container: `max-w-[1400px]` + `height: min(75vh, 1200px)` (vorher: `max-w-4xl aspect-square`)
  - Backdrop: `bg-black/90 backdrop-blur-sm` (vorher: `bg-black/50`)
  - Thumbnails: 64px (vorher: 48px)
  - Nav-Buttons: 48px (vorher: 44px)
  - ESC-Key schließt Lightbox, Body Scroll Lock
  - Smooth scale Animation (0.96→1.0) beim Bildwechsel
  - Click-outside-to-close auf Backdrop

---

## 2026-04-09 — Discogs Collection Importer

Genereller, wiederverwendbarer Importer für Discogs Collection Exports. Nutzt VOD bei Sammlungs-Ankäufen: Verkäufer liefern Discogs-Export (CSV/XLSX), der Importer parsed, fetcht API-Daten, gleicht gegen bestehende DB ab und importiert mit vollem Tracking.

### Neue Dateien
- `scripts/discogs_collection_import.py` — Python CLI (3 Phasen: Fetch → Match → Import), resumable, rate-limited, `--simulate` default
- `backend/src/admin/routes/discogs-import/page.tsx` — Admin UI (3 Tabs: Upload, Analysis, History)
- `backend/src/api/admin/discogs-import/upload/route.ts` — File-Upload + CSV/XLSX-Parsing (SheetJS)
- `backend/src/api/admin/discogs-import/analyze/route.ts` — Matching gegen DB-Snapshots (3-stufig: exact discogs_id → fuzzy artist+title+catno → new)
- `backend/src/api/admin/discogs-import/commit/route.ts` — DB-Import (Release + Artist + Label + Track + import_log)
- `backend/src/api/admin/discogs-import/history/route.ts` — Import-History aus `import_log` Tabelle
- `discogs/import_test_report.md` — Test-Report (20 Entries aus eigenem Export, Simulation)

### Geänderte Dateien
- `backend/src/admin/components/admin-nav.tsx` — Parent-Mapping `/app/discogs-import` → Operations
- `backend/src/admin/routes/operations/page.tsx` — HubCard "Discogs Collection Import" (📀)
- `backend/package.json` — `xlsx` (SheetJS) Dependency
- `scripts/shared.py` — Lazy psycopg2 Import (Python 3.14 Kompatibilität)

### Neue DB-Tabelle
- `import_log` — Tracking pro Import-Lauf (id, import_type, collection_name, import_source, run_id, release_id, discogs_id, action, data_snapshot JSONB). Erstellt automatisch bei erstem `--commit`.

### Matching-Strategie
1. **EXISTING:** `discogs_id` bereits in DB → Preise/Community updaten
2. **LINKABLE:** Artist+Title+CatNo matcht Release ohne discogs_id → discogs_id ergänzen
3. **NEW:** Kein Match → voller Import (Release + Artist + Label + Tracks)

### Test-Ergebnis (VOD Eigenbestand, 20 Entries)
- 4 EXISTING, 16 NEW, 0 LINKABLE, 0 SKIPPED

### CLI-Nutzung
```bash
cd scripts && source venv/bin/activate
python3 discogs_collection_import.py --file ../discogs/export.xlsx --collection "Sammlung Müller"        # Simulation
python3 discogs_collection_import.py --file ../discogs/export.xlsx --collection "Sammlung Müller" --commit  # Import
```

---

## 2026-04-07 (night) — ERP Barcode/Labeling-Infrastruktur

Barcode-System für die Inventur-Phase: Jeder verifizierte Artikel bekommt automatisch einen Code128-Barcode (`VOD-000001` ff.), ein druckbares Label (29×62mm PDF für Brother QL-810W), und ist per USB-Scanner scanbar.

### Neue Dateien
- `backend/scripts/migrations/2026-04-07_erp_barcode.sql` — `barcode` TEXT UNIQUE + `barcode_printed_at` auf `erp_inventory_item`, Sequenz `erp_barcode_seq`
- `backend/src/lib/barcode-label.ts` — Label-PDF-Generator (Code128 via `bwip-js` + `pdfkit`, 29×62mm Brother-Format)
- `backend/src/api/admin/erp/inventory/items/[id]/label/route.ts` — `GET` Einzellabel-PDF
- `backend/src/api/admin/erp/inventory/scan/[barcode]/route.ts` — `GET` Barcode → Item Lookup (für Scanner)
- `backend/src/api/admin/erp/inventory/batch-labels/route.ts` — `GET` Batch-PDF (max 200 Labels)

### Geänderte Dateien
- `backend/src/lib/inventory.ts` — neuer Helper `assignBarcode()` (Sequenz → `VOD-XXXXXX`)
- `backend/src/api/admin/erp/inventory/items/[id]/verify/route.ts` — vergibt Barcode bei Verify, gibt `barcode` + `label_url` zurück
- `backend/src/api/admin/erp/inventory/queue/route.ts` — `barcode`-Feld in Response
- `backend/src/admin/routes/erp/inventory/session/page.tsx` — Printer-Status-Indicator (QZ Tray / Browser / None), Auto-Print Toggle, Barcode-Badge pro Item, `[L]` Reprint-Button, Scanner-HID-Detection, QZ Tray WebSocket-Check
- `backend/package.json` — `bwip-js` ^4.9.0

### Dokumentation
- `docs/optimizing/INVENTUR_COHORT_A_KONZEPT.md` → v3.0: neuer §14 "Barcode-Labeling in der Inventur" (Hardware-Einkaufsliste, Label-Design, Druck-Architektur, Scanner-Integration, Phasen, TODOs)
- `docs/optimizing/ERP_WARENWIRTSCHAFT_KONZEPT.md` → v5.1: §10.2 `barcode`-Spalten, neuer §10.7 "Barcode/Labeling-Infrastruktur" (Schema, Label-Generierung, Druck-Infra, Scanner-Infra, Hardware macOS-geprüft)

### Hardware-Empfehlung (macOS-geprüft)
- Brother QL-810W (~€130) — WiFi, CUPS, Bonjour, offizielle macOS-Treiber
- Inateck BCST-70 USB Scanner (~€40) — HID Keyboard, zero config
- QZ Tray (€0, Open Source) — Stilles Drucken aus Browser, signed+notarized für macOS
- 5× Brother DK-22210 Etiketten (~€40)
- **Gesamt: ~€210**

### Deployment
- Migration erst auf Staging, dann Production
- Feature-Flag `ERP_INVENTORY` muss aktiv sein
- Kein Breaking Change — alle Spalten nullable, Endpoints hinter Flag-Gate

---

## 2026-04-07 (evening) — Inventur Cohort A: Full Implementation (Phase 1-4)

Komplette Implementierung des Inventur-Stocktake-Workflows basierend auf Franks 7 Antworten.

### Franks Entscheidungen

- **F1:** +15% statt +20%, ganze Euro (`ROUND(price * 1.15, 0)`)
- **F2:** Missing = Preis auf 0, im Shop behalten (nicht `written_off`). Reversibel via Unlock.
- **F3:** Kein Pflicht-Dropdown, optionaler Freitext
- **F4:** Discogs-Preise anzeigen + Link zu Discogs-Marketplace
- **F5:** Sort: Format-Gruppe (Vinyl→Tape→Print→Other) → Alphabet
- **F6:** 4-6 Wochen, URL-basierter Cursor
- **F7:** Keine Ausschlüsse

### Phase 1 — DB + Sync-Schutz
- 3 Tabellen: `erp_inventory_item` (ERP-Konzept §10 + 4 Stocktake-Spalten), `erp_inventory_movement`, `bulk_price_adjustment_log`. `erp_` Prefix vermeidet Kollision mit Medusa's nativer `inventory_item` Tabelle.
- Backfill: **13.107** Cohort-A Items (10.762 Musik + 2.345 Literatur) — mehr als die geschätzten 7.407 im Konzept weil Literatur mit-gezählt wird.
- Sync-Schutz in `legacy_sync_v2.py`: ON CONFLICT CASE-Guard für `price_locked`, Diff-Exclusion, V5 Validation. Verifiziert: Preis-Mismatch €9↔€99 überlebt Dry-Run.

### Phase 2 — Bulk +15% + Helper
- `backend/src/lib/inventory.ts`: requireFeatureFlag, createMovement, lockPrice, unlockPrice
- `GET/POST /admin/erp/inventory/bulk-price-adjust`: Preview mit Sample (ganze Euro), Execute mit Confirmation "RAISE PRICES 15 PERCENT", idempotent, Movement-Audit pro Item
- `GET /admin/erp/inventory/stats`: eligible/verified/missing/remaining/bulk_status

### Phase 3 — Session API
- `GET /admin/erp/inventory/queue`: Format-Gruppen-Sort (F5), Discogs-Felder (F4), Cursor-Pagination
- `POST .../items/:id/verify`: lock + optional new_price + movement
- `POST .../items/:id/missing`: price→0 + lock (F2), alter Preis in movement.reference für Undo
- `POST .../items/:id/note`: optionaler Freitext (F3)
- `POST .../items/:id/reset`: Undo mit Preis-Restore aus movement.reference
- `GET .../export`: CSV mit BOM (all/verified/missing/pending)

### Phase 4 — Session Screen
- Keyboard-driven: V=Verify, P=Price, M=Missing, S=Skip, N=Note, U=Undo, ←/→, Esc
- Cover-Image + Details + Discogs-Panel mit Marketplace-Link
- Price-Input mit Enter-Confirm (ganze Euro)
- Format-Gruppen-Labels in Progress
- Queue auto-reload bei Batch-Ende, Completion-Screen bei 0 remaining

### Operations Hub
- Neue HubCard "Inventory Stocktake" in `/app/operations`

### CLAUDE.md
- Medusa-Tabellen-Gotcha (`erp_*` Prefix)
- ERP Module Status Section (alle 6 Flags mit aktuellem Stand)

### Activation Sequence (nach 24h Sync-Schutz stabil)
1. `ERP_INVENTORY` Flag → ON
2. Bulk +15% über Admin-UI
3. Frank startet Inventur-Sessions (4-6 Wochen)

---

## 2026-04-07 — ERP Foundation: Flag Dependencies + Warehouse Locations + ERP Admin Hub

Erster ERP-Implementierungssprint. Keine Domain-Logik (kein easybill, kein Sendcloud) — nur die Infrastruktur die alle späteren ERP-Module benötigen.

### Entscheidungen (dokumentiert in ERP_WARENWIRTSCHAFT_KONZEPT.md Teil F)

- **easybill** (statt sevDesk) für Invoicing bestätigt
- **Sendcloud** für Versand bestätigt
- **Composable Stack Option A** explizit bestätigt
- **DHL-Geschäftskundennummer** vorhanden (in Memory, geht in `.env` wenn ERP_SENDCLOUD implementiert)

### Feature Flag Dependencies

`FeatureFlagDefinition` erhält `requires?: string[]`. Enforcement in `setFeatureFlag()` (HTTP 400 bei unerfüllten Deps). Aktivierungsreihenfolge erzwungen:

```
ERP_INVENTORY → ERP_INVOICING → (ERP_SENDCLOUD / ERP_COMMISSION / ERP_TAX_25A) → ERP_MARKETPLACE
```

Admin Config → Feature Flags Tab: Toggles deaktiviert wenn Dep fehlt, Dep-Status per Flag angezeigt (`ERP_INVENTORY ✓/✗`).

`ERP_INVOICING.description` korrigiert: "sevDesk/easybill" → "easybill".

### Warehouse Locations

Neue Tabelle `warehouse_location` — konfigurierbare Lagerorte (leer, via Admin UI befüllt). Constraints: `UNIQUE INDEX WHERE is_default = true` (genau ein Default), Soft-Delete (kein Hard-Delete).

- API: `GET/POST /admin/erp/locations`, `PATCH/DELETE /admin/erp/locations/:id`
- Admin UI: `/app/erp/locations` — vollständiges CRUD (Tabelle, Modal, Empty State, Set Default, Deactivate)
- Default-Location-Deaktivierung geblockt (400) bis anderer Lagerort als Default gesetzt

### ERP Admin Hub

Neuer 8. Sidebar-Eintrag "ERP" (Icon: DocumentText, Rank 7). Hub-Seite `/app/erp` mit 6 Karten:
- **Warehouse Locations** — aktiv (zeigt Live-Anzahl)
- **Inventory, Invoicing, Shipping, Commission, §25a** — muted mit "FLAG OFF" Badge bis Flags aktiviert

Erster aktiver Use des reservierten `/admin/erp/*` Namespace.

### Migrations

- `backend/scripts/migrations/2026-04-07_erp_warehouse_locations.sql` — angewendet auf Production (`bofblwqieuvmqybzxapx`) + Staging (`aebcwjjcextzvflrjgei`)

### Deploy

Vollständiger VPS-Deploy (Vite-Cache clear Pflicht wegen neuer Admin-Routes). Build: 45.94s. `api.vod-auctions.com/health` OK, `/admin/erp/locations` → 401 (Auth-Gate aktiv).

### Commits

- `fc95134` — Release docs: Release Index + §9 Release Tagging
- `9e95228` — ERP Foundation: Flag dependencies + Warehouse Locations + ERP Admin Hub

### Files

```
backend/src/lib/feature-flags.ts                       (requires-Deps, easybill-Description, getFlagDependencies, setFeatureFlag-Validation)
backend/src/api/admin/platform-flags/route.ts          (requires in Response, 400 für Dep-Fehler)
backend/src/admin/routes/config/page.tsx               (Dep-Status in Feature Flags Tab)
backend/scripts/migrations/2026-04-07_erp_warehouse_locations.sql  (neu)
backend/src/api/admin/erp/locations/route.ts           (neu — GET/POST)
backend/src/api/admin/erp/locations/[id]/route.ts      (neu — PATCH/DELETE)
backend/src/admin/routes/erp/page.tsx                  (neu — ERP Hub)
backend/src/admin/routes/erp/locations/page.tsx        (neu — Locations CRUD)
backend/src/admin/components/admin-nav.tsx             (ERP Sub-Pages in PARENT_HUB)
backend/.env.example                                   (DHL_ACCOUNT_NUMBER, SENDCLOUD_*, EASYBILL_API_KEY)
docs/optimizing/ERP_WARENWIRTSCHAFT_KONZEPT.md         (Teil F — alle Session-Entscheidungen)
CLAUDE.md                                              (8 Sidebar-Items, ERP API Quickref, Deployment Methodology aktualisiert)
```

---

## 2026-04-05 (night) — Email Addressing Overhaul: Reply-To, Mailbox Structure, DMARC

Nach dem ersten Live-Testlauf am Fr 3.4.2026 ("Throbbing Gristle & Industrial Records", 6 echte Bieter, 17 Transaktionen) wurde sichtbar dass customer-relevant Mails auf zwei Domains verteilt waren: Absender `noreply@`/`newsletter@vod-auctions.com`, Kontakt-Footer aber `info@vod-records.com`. Antworten auf Transaktions-Mails landeten im Nichts (kein `Reply-To`-Header). Keine dedizierte DSGVO-Adresse. Kein konsistenter Brand.

### Mailbox-Struktur bei all-inkl (manuell angelegt)

**Echte Postfächer (2):**
- `support@vod-auctions.com` — zentrale Kunden-Anlaufstelle
- `privacy@vod-auctions.com` — DSGVO, Account-Löschung

**Aliase → support@:** `info@`, `billing@`, `orders@`, `abuse@`, `postmaster@` (RFC 2142 + Impressum-Pflicht)
**Aliase → Frank:** `frank@vod-auctions.com`, `press@vod-auctions.com`

### Code-Änderungen (Commit `2e2f5a6`)

**Single Source of Truth:**
- `backend/src/lib/email.ts` exportiert `SUPPORT_EMAIL` + `PRIVACY_EMAIL` aus ENV-Vars
- `backend/.env` + `.env.example` um `SUPPORT_EMAIL`, `PRIVACY_EMAIL`, `EMAIL_FROM` ergänzt
- VPS `.env` manuell synchronisiert (git-ignored)

**Reply-To auf allen customer-facing Sends:**
- Resend Wrapper (`lib/email.ts`) — `sendEmail()` setzt automatisch `replyTo: SUPPORT_EMAIL`, Override per Parameter möglich
- Brevo Wrapper (`lib/brevo.ts`) — `sendCampaign()` + `sendTransactionalTemplate()` setzen `replyTo` auf support@. Gilt für alle 4 Newsletter-Templates und alle Transaktions-Brevo-Sends.

**Kundenkontakte ersetzt (Storefront + Templates):**
- `storefront/src/components/layout/Footer.tsx`: `shop@vod-records.com` → `support@vod-auctions.com`
- `storefront/src/app/account/settings/page.tsx`: `info@vod-records.com` → `privacy@vod-auctions.com` (Account-Löschung, DSGVO)
- `backend/src/emails/welcome.ts`, `bid-won.ts`, `shipping.ts`: `info@vod-records.com` → `support@vod-auctions.com` im Template-Footer

**Weitere 4 Call-Sites auf `sendEmailWithLog` migriert** (ergänzt die am 3.4. begonnene Audit-Trail-Arbeit aus Release `v2026.04.03-auction-review`):
- `backend/src/subscribers/password-reset.ts` (Customer + Admin Reset)
- `backend/src/api/store/account/verify-email/route.ts`
- `backend/src/api/store/account/send-welcome/route.ts` (`sendVerificationEmail`)
- `backend/src/api/store/newsletter/route.ts` (Newsletter Double-Opt-In)

Damit sind jetzt auch Password-Reset, Verify-Email und Newsletter-Confirm-Mails im `email_log`-Table sichtbar — nicht nur die 13 Helper aus `email-helpers.ts`.

**`vod-records.com` bleibt unangetastet** wo rein technisch (nicht kundensichtbar): Stripe-Owner, PayPal-Owner, Resend-Account-Owner (alle `frank@vod-records.com`), Admin-Notification-Empfänger in `payment-deadline.ts` und `site-config/go-live/route.ts`.

### DNS / DMARC (manuell via all-inkl KAS)

Vorher:
```
_dmarc.vod-auctions.com → "v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com"
```

Nachher:
```
_dmarc.vod-auctions.com → "v=DMARC1; p=quarantine; sp=quarantine; adkim=r; aspf=r; pct=100;
                           rua=mailto:postmaster@vod-auctions.com;
                           ruf=mailto:postmaster@vod-auctions.com; fo=1"
```

- `p=quarantine` + `sp=quarantine`: SPF/DKIM-Fails landen bei Empfängern im Spam
- `rua` + `ruf` auf `postmaster@` → Reports landen via Alias in `support@` Postfach
- `fo=1`: Failure-Reports bei SPF **oder** DKIM-Fail (nicht nur wenn beide fallen)

**SPF bereits korrekt:** `v=spf1 a mx include:spf.kasserver.com include:amazonses.com include:sendinblue.com ~all` (Amazon SES deckt Resend, sendinblue.com ist Brevos Legacy-Name).

**DKIM bereits korrekt:** Resend via `resend._domainkey` TXT-Record, Brevo via `brevo1._domainkey` + `brevo2._domainkey` CNAMEs.

### Testlauf-Kontext (3.4.2026)

Die fehlenden `email_log`-Einträge für Welcome/Bid-Placed/Bid-Won/Payment-Confirmation/Shipping Mails vom 3.4. vormittags sind korrekt — das Audit-Trail wurde erst am 3.4. 14:15 UTC durch Release `v2026.04.03-auction-review` eingeführt, die Auction lief 30.3.–3.4. 10:00 UTC. Alle Mails nach 14:15 UTC am 3.4. sind geloggt (z.B. `payment-reminder-1` an Gundel Zillmann + Anna Zillmann am 5.4. 07:00 UTC).

### Bekannte Altlasten (nicht in diesem Commit)

- `backend/src/jobs/payment-deadline.ts` — Admin-Notification-Empfänger noch `frank@vod-records.com` (intern, nicht customer-facing — bewusst nicht geändert)
- `storefront/src/app/impressum/page.tsx` + `datenschutz/page.tsx` — Legal-Kontakt `frank@vinyl-on-demand.com` (juristische Firmen-Adresse, separate Klärung nötig)
- `admin@vod.de` — Test-Admin-Login (intern)

### Deploy

Vollständiger VPS-Deploy via Standard-Sequenz (git pull, rm `.vite` + `.medusa`, `medusa build`, admin assets copy, `.env` symlink, pm2 restart backend, storefront build + restart). Port 9000 bootet in 3.9s, `api.vod-auctions.com/health` HTTP 200, compiled `.medusa/server/src/lib/email.js` enthält `replyTo`/`SUPPORT_EMAIL` Referenzen.

### Commits

- `2e2f5a6` — Email: Reply-To support@ + migrate customer contacts to vod-auctions.com (13 files, +55/-21)

### Files

**Changed:**
```
backend/.env.example                                 (neue ENVs dokumentiert)
backend/src/lib/email.ts                             (SUPPORT_EMAIL/PRIVACY_EMAIL exports + replyTo)
backend/src/lib/brevo.ts                             (replyTo in sendCampaign + sendTransactionalTemplate)
backend/src/emails/welcome.ts                        (info@vod-records → support@vod-auctions)
backend/src/emails/bid-won.ts                        (dto.)
backend/src/emails/shipping.ts                       (dto.)
backend/src/subscribers/password-reset.ts            (sendEmail → sendEmailWithLog, customer + admin)
backend/src/api/store/account/verify-email/route.ts  (sendEmail → sendEmailWithLog)
backend/src/api/store/account/send-welcome/route.ts  (sendEmail → sendEmailWithLog)
backend/src/api/store/newsletter/route.ts            (sendEmail → sendEmailWithLog + pgConnection resolve)
storefront/src/components/layout/Footer.tsx          (shop@vod-records → support@vod-auctions)
storefront/src/app/account/settings/page.tsx         (info@vod-records → privacy@vod-auctions)
CLAUDE.md                                            (Email-Sektion komplett umgeschrieben)
```

### Follow-Ups

- Verification der Reply-To-Header sobald nächste Transaktions-Mail an einen der 6 echten Testbieter rausgeht (via Gmail MCP auf `robin@seckler.de` prüfbar)
- Impressum/Datenschutz Legal-Adressen (vinyl-on-demand.com) — separate Entscheidung ob auch auf vod-auctions.com migrieren

---

## 2026-04-05 (evening) — Sync Robustness Overhaul: Path Regression Fix + legacy_sync v2

Massive session covering a cwd-regression discovery, a full sync-robustness architectural plan, and a complete Python-sync-script rewrite.

### Part 1 — Path regression cascade (triggered by today's PM2 cwd fix)

The morning's PM2 cwd fix (moving backend from `backend/` to `backend/.medusa/server/`) silently broke seven admin routes and exposed two hardcoded absolute paths. Symptoms: R2 Image CDN admin widget showed "No sync yet" despite 160,957 files in the bucket; other sync dashboards showed empty data.

**Root cause:** Routes used `process.cwd()/..` or `__dirname/../../../...` to resolve `scripts/` and `data/` at the project root. Both patterns assumed cwd=`backend/` or `__dirname` pointing at TypeScript source. After cwd moved to `.medusa/server/` and compiled JS lives under `.medusa/server/src/...`, every relative path pointed at non-existent directories.

**Fix:** Central helper `backend/src/lib/paths.ts` with walk-up resolution from `process.cwd()` looking for a directory containing `backend/`, `scripts/`, and `storefront/` as siblings. Cached result. All 7 affected routes refactored to use `getProjectRoot()`, `getScriptsDir()`, `getDataDir()`, `getStorefrontPublicDir()`, `getTestsDir()` helpers. Two additional hardcoded `/root/VOD_Auctions/` paths cleaned up as bonus.

**Routes fixed:**
- `admin/sync/r2-sync/route.ts` (the visible R2 widget bug)
- `admin/sync/batch-progress/route.ts`
- `admin/sync/discogs-health/route.ts`
- `admin/sync/extraartists-progress/route.ts`
- `admin/gallery/upload/route.ts`
- `admin/test-runner/route.ts`
- `admin/entity-content/overhaul-status/route.ts`
- `admin/dashboard/route.ts` (hardcoded `/root/VOD_Auctions/scripts/legacy_sync.log`)
- `admin/system-health/alerts/route.ts` (same hardcoded path)

Deep-search agent audit confirmed: zero remaining `process.cwd()` or `__dirname`-relative-path usages in backend source outside `paths.ts` itself. Zero hardcoded `/root/VOD_Auctions/` strings in active code (one remaining hit is a comment documenting a env-var pattern).

### Part 2 — Legacy sync widget honest metrics

The Legacy MySQL Sync widget's "Changes (last run)" tile was reading from `sync_log.changes.new_images`, which turned out to be cumulative "attempted inserts" from `ON CONFLICT DO NOTHING` — stable at 32,866 across runs regardless of actual new images. Misleading.

**Fix:** Server-computed counts directly from the `Image` table for a rolling 24h and 7d window. `GET /admin/sync` now returns `last_legacy_sync.new_images_last_24h` and `new_images_last_7d`. Widget renamed from "Changes (last run)" to "New images (24h)" — honest about what's shown. Subline shows 7d rollup and (once v2 sync is live) field-edit counts.

**Lesson recorded in SYNC_ROBUSTNESS_PLAN §3.2:** strict-last-run windows on hourly-sync pipelines almost always read zero even when activity is happening; rolling windows match operator mental models better.

### Part 3 — SYNC_ROBUSTNESS_PLAN (v1.0 → v2.0 → v2.1 → v2.2 → v2.3)

New architectural planning document at `docs/architecture/SYNC_ROBUSTNESS_PLAN.md`. Went through four versions in one session:

- **v1.0:** First draft. Too broad, over-engineered (555 lines). Mixed must-have with nice-to-have. Auto-Heal, unchanged-row-logging, full UI rewrite treated as core building blocks.

- **v2.0:** Complete rewrite per Robin's hardening feedback. Hard A/B/C/D priority ranking. Auto-Heal → Priority D (deferred). Unchanged-row-logging → explicitly rejected. UI ambitions trimmed. Drift Detection split into 5 typed checks (Count, Field, Referential, Schedule, Asset). New Field-Ownership matrix (§6) as the core artifact. Operational Responsibility section (solo operator model). Realistic risk section including misleading observability and false positives.

- **v2.1:** Phase A1 (Field Audit) complete. Every `❓` in the ownership matrix resolved via read-only analysis of the Python script and MySQL source schemas. **Key finding:** MySQL source is much smaller than the Supabase target — the main `3wadmin_tapes_releases` table has only 14 columns. Many Supabase Release fields have no MySQL source at all (`subtitle`, `barcode`, `language`, `pages`, `releaseDate`, `tracklist`, `credits`, `article_number`, `tape_mag_url`, `legacy_availability`, `media_condition`, `sleeve_condition`) — they can never be synced regardless of intent. `LEGACY_SYNC_FIELDS` dict published as the formal Python contract.

- **v2.2:** Phase A2 (sync_log schema extension) complete. 13 new nullable columns added via additive migration (`run_id`, `script_version`, `phase`, `started_at`, `ended_at`, `duration_ms`, `rows_source`, `rows_written`, `rows_changed`, `rows_inserted`, `images_inserted`, `validation_status`, `validation_errors`) plus 2 partial indexes. Applied to Staging first, then Production. **Critical verification:** v1 script continued writing successfully through the Production migration — rows 11902 (14:00 UTC) and 11903 (15:00 UTC) arrived with NULL values in new columns, zero errors, zero lock conflicts.

- **v2.3:** Phase A3+A4+A7 complete. See Part 4 below.

### Part 4 — legacy_sync.py v2 rewrite (Phase A3+A4+A7)

New file: `scripts/legacy_sync_v2.py` (1316 lines). v1 (`legacy_sync.py`, 805 lines) preserved as rollback backup.

**v2 features per plan:**
- **Full-field diff:** 14 fields for music releases (`title, description, year, format, format_id, catalogNumber, country, artistId, labelId, coverImage, legacy_price, legacy_condition, legacy_format_detail, legacy_available`), 11 fields for literature (no `catalogNumber/legacy_condition/legacy_available` — MySQL lit tables lack those columns). v1 only diffed 4 of 14 — meaning Frank's edits to `legacy_condition`, `description`, `year`, etc. were silently unreported.
- **Accurate image counts:** `INSERT ... RETURNING id` with `fetch=True` returns actual new rows, not attempted inserts.
- **Structured sync_log writes:** `start_run()` creates row with `phase='started'`; `end_run()` updates with all metrics and `phase='success'/'failed'/'validation_failed'`. Populates all 13 new columns from A2. Legacy `changes` JSONB still written with extras (R2 stats, new entity counts) for backward-compat with existing admin queries.
- **Post-run validation (A4, delivered with A3 since trivial to include):** V1 MySQL↔Supabase row count parity (tolerance 10, error ≥100), V2 title NOT NULL, V3 referential integrity (orphan artistId/labelId), V4 sync freshness (legacy_last_synced < 2h).
- **`--dry-run` flag:** Computes full diff, prints summary, commits nothing.
- **`--pg-url` override:** Point at staging Supabase without editing `.env`.
- **`label_enriched` guard respected in diff logic** (not just in UPSERT).
- **SCRIPT_VERSION constant** (`legacy_sync.py v2.0.0`) written to sync_log for run attribution.
- **Exit codes:** 0 success, 2 fatal error, 3 validation_failed.

**Path hardening (A7):** The Python scripts already used `Path(__file__)` throughout (cwd-independent). v2 preserves this. Nothing to fix — A7 was a no-op once the audit confirmed current state.

### Verification sequence (3 stages)

1. **Dry-run on Staging** (empty DB from today's provision): 41,540 rows "would insert", 0 errors, 15.0s.
2. **Dry-run on Production** (real data): 0 diffs reported — correct behavior because v1 has been hourly UPSERT-ing all fields for weeks, so MySQL and Supabase are in sync. Zero false positives across 41k rows.
3. **Real-write run on Production:** 0 changes, 0 inserts, 32.0s. `sync_log` row 11904 verified populated with all new columns. Post-run validation ran — **found 216 orphan labels** (Release rows with `labelId` pointing to deleted Label entries). This is a genuine previously-unknown drift that v1 never would have detected. Warning severity, non-blocking for deploy. Tracked as separate cleanup task for after Phase B.

### Cron cutover

After successful verification, crontab on VPS was edited to point at `legacy_sync_v2.py` instead of `legacy_sync.py`. Backup at `/tmp/crontab.bak-1775402626`. Rollback path: `crontab /tmp/crontab.bak-1775402626` — 10 seconds, reverts to v1. v1 script remains in place for 7 days as safety backup; removal only after extended stable v2 operation.

### Phase A status

| ID | Maßnahme | Status |
|---|---|---|
| A1 | Field Audit | ✅ |
| A2 | sync_log schema extension | ✅ |
| A3 | legacy_sync.py rewrite | ✅ |
| A4 | Post-run validation | ✅ (delivered with A3) |
| A5 | Dead-Man's-Switch | pending (tomorrow) |
| A6 | E-Mail alerting via Resend | pending (tomorrow) |
| A7 | Python path hardening | ✅ (no-op — already safe) |

### Commits (this session)

- `370f48b` — Fix cwd-independent project paths (7 files + paths.ts helper)
- `f0ad27a` — Legacy Sync "Changes (last run)" tile + 2 hardcoded path fixes
- `fdd4ea7` — Honest server-computed new-image counts for widget
- `7023e96` — Switch widget to 24h rolling window (strict-last-run was misleading)
- `e2af928` — SYNC_ROBUSTNESS_PLAN v1.0 (too broad, superseded)
- `97b4873` — SYNC_ROBUSTNESS_PLAN v2.0 (hardened per Robin feedback)
- `1705982` — Fix ERP concept v5.0 header (from earlier issue discovered mid-session)
- `aa2c4ef` — Phase A1 Field Audit → plan v2.1 with verified ownership matrix
- `b5c16fc` — Phase A2 sync_log schema extension migration
- `cf3856e` — Phase A3 legacy_sync_v2.py (1316 lines)
- `e1c893a` — Plan v2.3 marking A3+A4+A7 complete

### Files

**New:**
```
backend/src/lib/paths.ts
backend/scripts/migrations/2026-04-05_sync_log_schema_extension.sql
docs/architecture/SYNC_ROBUSTNESS_PLAN.md
scripts/legacy_sync_v2.py
```

**Changed (non-trivial):**
```
backend/src/api/admin/sync/r2-sync/route.ts           (path hardening)
backend/src/api/admin/sync/batch-progress/route.ts    (path hardening)
backend/src/api/admin/sync/discogs-health/route.ts    (path hardening)
backend/src/api/admin/sync/extraartists-progress/route.ts (path hardening)
backend/src/api/admin/gallery/upload/route.ts         (path hardening)
backend/src/api/admin/test-runner/route.ts            (path hardening)
backend/src/api/admin/entity-content/overhaul-status/route.ts (path hardening)
backend/src/api/admin/dashboard/route.ts              (hardcoded path fix)
backend/src/api/admin/system-health/alerts/route.ts   (hardcoded path fix)
backend/src/api/admin/sync/route.ts                   (24h rolling window for new_images)
backend/src/admin/routes/sync/page.tsx                (new widget tile)
docs/architecture/CHANGELOG.md                        (this entry)
```

**VPS-only:**
```
crontab → legacy_sync.py replaced with legacy_sync_v2.py
/tmp/crontab.bak-1775402626 (backup for rollback)
```

---

## 2026-04-05 (afternoon) — Trial-Flag `EXPERIMENTAL_SKIP_BID_CONFIRMATION` + Staging-DB live

### Trial Flag — validation of client-side flag stack
- **`EXPERIMENTAL_SKIP_BID_CONFIRMATION`** added to `FEATURES` registry, category `experimental`, default `false` (current behavior preserved — zero regression).
- **`CLIENT_SAFE_FLAGS` whitelist** in `backend/src/lib/feature-flags.ts` — only explicitly listed flags can be exposed to unauthenticated clients. All `ERP_*` flags remain private.
- **`GET /store/platform-flags`** public endpoint returns only whitelisted flags as `{flags: {[key]: boolean}}`.
- **`FeatureFlagProvider`** in `storefront/src/components/FeatureFlagProvider.tsx` — fetches once per mount via `useFeatureFlag(key)` hook. Fail-closed: on fetch error all flags default to `false`.
- **Wired into `BidForm` inside `ItemBidSection.tsx`** — when flag is ON, `handleSubmitClick` bypasses `setConfirmOpen(true)` and calls `confirmBid()` directly. Strictly additive.
- **Verification:** curl `/store/platform-flags` shows only `EXPERIMENTAL_SKIP_BID_CONFIRMATION` (ERP flags hidden); DB-toggle + pm2 restart roundtrip confirmed flag ON/OFF state changes the endpoint response; production state reset to default `false`.
- **Minimal backend-only trial** (`EXPERIMENTAL_STORE_SITE_MODE_DEBUG`) added earlier same session — adds a `_debug` field to `GET /store/site-mode` when enabled. Kept in registry alongside the new one as backend-only validation of the infrastructure.

### Staging environment — DB provisioned
- **Decision:** Option B1 (separate Free Supabase project in a secondary account). Initial assumption that backfire was an org under `robin@seckler.de` was wrong — turned out to be a **completely separate Supabase account**, accessible only via the credentials stored in 1Password as `Supabase 2. Account`.
- **Created:** `vod-auctions-staging`, ref `aebcwjjcextzvflrjgei`, region eu-west-1 (Ireland), t4g.nano Free instance.
- **Schema copy from production:** 227 tables, 531 indexes, 433 KB DDL. Used `docker run --rm --network=host postgres:17 pg_dump --schema-only --no-owner --no-acl --schema=public` against production Supabase, applied via `psql` through the eu-west-1 Session pooler. **Production was read-only throughout — zero rows written to production.**
- **Data:** empty — staging holds schema only, no rows copied.
- **HTTP layer:** NOT built. No PM2, no nginx, no DNS records. DB alone is sufficient for migration rehearsals and schema-diff testing. HTTP layer will be added when the first ERP feature actually needs HTTP-level staging (likely Sendcloud or sevDesk/easybill).

### Five new gotchas discovered during staging setup (all now in `CLAUDE.md`)
1. **Supabase Free direct-connection port 5432 is unreliable** — IPv4 disabled, IPv6 has slot limits. All admin ops must use the Session pooler (`aws-0-<region>.pooler.supabase.com:5432`).
2. **Pooler username format is `postgres.<project-ref>`**, not bare `postgres`.
3. **Pooler hostname is region-specific** — wrong region returns `FATAL: Tenant or user not found`. Staging is `aws-0-eu-west-1.pooler.supabase.com`, production is `aws-0-eu-central-1.pooler.supabase.com`.
4. **`pg_dump` on VPS is v16, Supabase runs PG17** — version mismatch refuses dumps. Workaround: `docker run --rm --network=host postgres:17`.
5. **Docker default bridge has no IPv6** — when targeting Supabase direct hosts (IPv6-only on Free), use `--network=host` so the container inherits the VPS IPv6 stack.

### Files
**Neu:**
```
backend/src/api/store/platform-flags/route.ts
storefront/src/components/FeatureFlagProvider.tsx
backend/.env.staging.example
storefront/.env.staging.example
```

**Geändert:**
```
backend/src/lib/feature-flags.ts                  (+CLIENT_SAFE_FLAGS whitelist, +2 experimental flags)
backend/src/api/store/site-mode/route.ts          (+conditional _debug field for trial flag 1)
storefront/src/app/layout.tsx                     (+FeatureFlagProvider wrap)
storefront/src/components/ItemBidSection.tsx      (+useFeatureFlag hook in BidForm, +conditional skip)
docs/architecture/STAGING_ENVIRONMENT.md          (complete rewrite with as-built runbook)
docs/architecture/CHANGELOG.md                    (this entry)
CLAUDE.md                                         (+5 gotchas: Supabase pooler, region, PG17, Docker IPv6, password special chars)
```

**Commits:**
- `f7eeb49` — Minimal backend trial flag (`EXPERIMENTAL_STORE_SITE_MODE_DEBUG`)
- `0f5976e` — Full storefront trial flag (`EXPERIMENTAL_SKIP_BID_CONFIRMATION`) + public endpoint + provider
- (pending) — This staging doc update + gotchas + env templates

---

## 2026-04-05 — Feature-Flag-Infrastruktur + Deployment-Methodology + PM2/Env Hotfix

### Feature-Flag-System (neu)
- **Registry** in `backend/src/lib/feature-flags.ts` mit 6 ERP-Flags (`ERP_INVOICING`, `ERP_SENDCLOUD`, `ERP_INVENTORY`, `ERP_COMMISSION`, `ERP_TAX_25A`, `ERP_MARKETPLACE`), alle default `false`. Kategorien: `erp` / `platform` / `experimental`. Neue Flags = Code-only (kein DB-Migration nötig).
- **Helper-API:** `getFeatureFlag(pg, key)`, `getAllFeatureFlags(pg)`, `setFeatureFlag(pg, key, enabled, adminEmail)`. `getFeatureFlag` fällt auf Registry-Default zurück wenn DB-Wert fehlt. Nutzt den existierenden 5-min `site_config` Cache.
- **Transaktionale Writes:** `setFeatureFlag` wrappt Update + Audit-Log-Insert in eine einzige DB-Transaction (`FOR UPDATE` Lock auf site_config row). Read-before-write bypassed den Cache um Staleness zu vermeiden. Cache-Invalidation erst nach Commit.

### DB-Schema (additive Migration)
- **Neue Spalte:** `site_config.features JSONB NOT NULL DEFAULT '{}'::jsonb` via `backend/scripts/migrations/2026-04-05_add_site_config_features.sql`. Idempotent (`ADD COLUMN IF NOT EXISTS`). Seed preserved existing values via `COALESCE(features->'KEY', 'false'::jsonb)`. Rollback: `DROP COLUMN features;`.
- **Live verifiziert:** auf Supabase-Projekt `bofblwqieuvmqybzxapx` angewendet, alle 6 ERP-Keys auf `false`.

### Admin API
- **Route:** `GET/POST /admin/platform-flags` in `backend/src/api/admin/platform-flags/route.ts`. Auth-inherited via Medusa Admin-Middleware.
- **⚠ Pfad-Collision vermieden:** Medusa 2.10+ shippt eine native unauthenticated `/admin/feature-flags` Route für interne Modul-Flags. Unsere Route liegt deshalb unter `/admin/platform-flags`. Kollision würde unsere Route silent shadowen ("native Route gewinnt immer" — CLAUDE.md Gotcha erweitert).
- **Fehlerbehandlung:** 400 für Validation, 500 für unerwartete Fehler, **503 mit actionable Message** wenn die `features`-Spalte noch nicht migriert ist.

### Admin UI
- **Neuer Tab** "Feature Flags" in `/app/config` (backend/src/admin/routes/config/page.tsx). Generische Toggle-Liste gruppiert nach Category, angetrieben von der `FEATURES` Registry. Info-Banner mit Link zur Methodology-Doc. Toasts bei Toggle. Hard-Reload zeigt persistierten Zustand.
- **Audit-Log sichtbar:** Jeder Flag-Toggle schreibt nach `config_audit_log` mit `config_key = "feature_flag:<KEY>"` — erscheint automatisch im existierenden "Change History" Tab.

### Dokumentation
- **`docs/architecture/DEPLOYMENT_METHODOLOGY.md`** (neu, ~150 Zeilen): Verbindliche "Deploy early, activate when ready" Methodik. Abschnitte: Core Principle, Flag-Mechanism, Migration-Discipline (additiv-only, keine `DROP`/`RENAME`/`TYPE` auf Live-Tabellen), Infrastructure-vs-Domain Separation, `/admin/erp/*` Prefix-Reservation, Staging-Before-Prod Regel, Governance-Checklist.
- **`docs/architecture/STAGING_ENVIRONMENT.md`** (neu): Planungsdokument mit 3 DB-Optionen (Supabase Branching Pro $25/mo, zweites Free-Projekt, lokales Postgres auf VPS), VPS-Layout-Skizze, Blocker-Liste. **Keine Infrastruktur provisioniert** — wartet auf Entscheidung.
- **`CLAUDE.md`:** Pointer auf Methodology-Doc eingefügt. Admin-Route-Gotcha erweitert (`feature-flags` als reservierter Pfad). Deploy-Sequenz erweitert um den `.env`-Symlink-Schritt. Zwei neue 🔴 Gotchas: PM2 cwd muss `.medusa/server` sein, `.env` Symlink nach jedem Build neu setzen.

### Deployment & Hotfix (Incident 2026-04-05 12:02–12:32 UTC)
- **Crash 1 — `Cannot find module 'medusa-config'`:** PM2-Instance seit 04.04. lief mit Legacy-cwd im Kernel; `pm2 restart` nach dem Deploy setzte cwd auf den ecosystem.config.js-Wert (`backend/`) zurück, wo nur die `.ts`-Source liegt. Medusa 2.x Prod-Runtime hat keinen TypeScript-Loader → Boot-Crash, 520 Restarts bis `pm2 stop`.
- **Fix 1:** `cwd` in `backend/ecosystem.config.js` (und root `ecosystem.config.js` für Konsistenz) auf `/root/VOD_Auctions/backend/.medusa/server` umgestellt. Root-Ecosystem zusätzlich von `script: "node_modules/.bin/medusa"` auf `script: "npm", args: "run start"` umgestellt (da `node_modules/` relativ zum neuen cwd nicht existiert).
- **Crash 2 — `JWT_SECRET must be set in production`:** Neuer cwd hat dotenv von `backend/.env` abgekoppelt, weil dotenv `.env` aus `process.cwd()` lädt.
- **Fix 2:** Symlink `backend/.medusa/server/.env → ../../.env`. Persistent, aber geht bei jedem `medusa build` verloren → muss Teil der Deploy-Sequenz werden (in CLAUDE.md dokumentiert).
- **Verifiziert:** Backend bootet (~2.6s), `GET /store/site-mode` → 200, `GET /admin/platform-flags` → 401 (Route existiert, Auth aktiv). Smoke-Test im Admin-UI erfolgreich: Tab sichtbar, Toggle funktioniert, Audit-Log schreibt, Cache invalidiert korrekt.

### Touched Files
```
Neu:
  backend/scripts/migrations/2026-04-05_add_site_config_features.sql
  backend/src/lib/feature-flags.ts
  backend/src/api/admin/platform-flags/route.ts
  docs/architecture/DEPLOYMENT_METHODOLOGY.md
  docs/architecture/STAGING_ENVIRONMENT.md

Geändert:
  backend/src/lib/site-config.ts                    (+1: features-Feld im Type)
  backend/src/admin/routes/config/page.tsx          (+93: Feature Flags Tab)
  backend/ecosystem.config.js                       (cwd fix)
  ecosystem.config.js                               (cwd fix + pattern unification)
  CLAUDE.md                                         (Methodology-Pointer + Deploy-Gotchas)
  docs/architecture/CHANGELOG.md                    (dieser Eintrag)
```

---

## 2026-04-04 — Catalog Pagination Refactor: URL-basiert via Next.js Router

### Architektur-Wechsel (Best Practice)
- **Vorher:** Manueller Client-State + `pushState/replaceState` + `popstate` Handler
- **Nachher:** `useSearchParams()` + `router.push/replace()` aus `next/navigation`
- Next.js handhabt History, Cache, Re-Render und Back-Button automatisch
- Back-Button funktioniert jetzt korrekt auf Desktop + Mobile (Safari + Chrome)
- Jede Seite ist server-rendered (SEO), URL ist teilbar
- Alle Features erhalten: Filter Chips, Genre/Decade, Sort, Debounced Search, CatalogBackLink

### Tracklist Regex Fix
- `POSITION_RE`: `[a-z]?` Suffix → erkennt A3a, A3b etc.

---

## 2026-04-04 — Final Remediation: Proxy Validation, Design-System Compliance, Test Coverage

### Proxy Bid Validation (ItemBidSection.tsx)
- **Validation in `handleSubmitClick`:** Proxy max_amount wird jetzt vor Submit geprüft — NaN, ≤0, unter Gebot, nicht-ganzzahlig (bei whole_euros_only) → klare Toast-Fehlermeldung
- **Guard in `confirmBid`:** Defense-in-depth — NaN erreicht nie die API, auch wenn Validierung umgangen wird

### Apply + Invite: Shared Components
- **apply/page.tsx:** Raw `<input>` → `<Input>`, raw `<label>` → `<Label>`, Textarea bekommt Design-System Focus-Ring
- **invite/[token]/page.tsx:** Raw `<input>` → `<Input>`, raw `<label>` → `<Label>` für alle 5 Felder, Read-only Email mit `disabled` Prop
- **Token-Migration:** Checkbox-Hex (`#2a2520`, `#3a352f`, `#4a4540`, `#a39d96`, `#0d0b08`) → `border-secondary`, `text-muted-foreground`, `text-primary-foreground` etc.
- **Verbleibend:** `bg-[#0d0b08]` Override in inputClass — bewusst dunkler als `--background`, kein Token nötig für 2 Standalone-Seiten

### Test Coverage
- **2 neue E2E-Tests** in `06-bidding.spec.ts`:
  - "proxy bid with invalid max shows error toast" (Eingabe `,` → Toast)
  - "proxy bid below bid amount shows error toast" (Max 2 < Bid 5 → Toast)

---

## 2026-04-04 — Post-Review Remediation: Bid Parsing, A11y, Security

### Critical: Bid Input Money Bug
- **`parseAmount()` Helper:** Normalisiert Komma-Dezimalzahlen vor dem Parsen (`"12,50"` → `12.5` statt `12`)
- Ersetzt alle 7 `parseFloat(amount/maxAmount)` Aufrufe in ItemBidSection.tsx
- Betrifft: Gebot, Proxy-Maximum, Bestätigungs-Modal, Button-Labels

### Critical: Kaputte Bidding-Tests
- **Selektoren:** `input[type='number']` → `input[inputmode='decimal']` (2 Stellen)
- **Bid-Increment:** `+0.5` → `+1` (whole_euros_only ist `true`, Dezimal wird abgelehnt)

### Accessibility: Apply + Invite Formulare
- **apply/page.tsx:** `id`/`htmlFor` auf 4 Inputs + 1 Textarea, raw `<button>` → `<Button>`
- **invite/[token]/page.tsx:** `id`/`htmlFor` auf 5 Inputs, raw `<button>` → `<Button>`
- Vorher: Kein Label programmatisch mit Input verknüpft (WCAG 2.1 AA Verstoß)

### UX: Checkout + Account Overview
- **Postal Code:** `inputMode="numeric"` entfernt — blockierte alphanumerische PLZ (UK: SW1A 1AA)
- **Account Overview:** `Promise.all` → `Promise.allSettled` — partielle Darstellung bei Teilausfällen statt komplettem Absturz

### Token Cleanup
- **HomeContent.tsx:** `via-[#1a1612]/20` → `via-card-hover/20` (letzter übersehener Token)

### Security
- **Next.js:** 16.1.6 → 16.2.2 (5 moderate Advisories behoben: HTTP Smuggling, CSRF Bypass, DoS)
- **brace-expansion + picomatch:** Vulnerabilities gefixt
- **npm audit:** 0 Vulnerabilities

---

## 2026-04-04 — UI/UX Final Implementation Pass (40/53 Gaps resolved, 75%)

### Design-System Token-Erweiterung
- **Neue CSS-Tokens:** `--primary-dark` (#b8860b) und `--card-hover` (#1a1612) in globals.css + `@theme` Block registriert
- Gradient-Endpunkte wie `to-[#b8860b]` → `to-primary-dark` in Header, MobileNav, HeaderAuth, About, Home

### Hardcoded Hex Cleanup (GAP-101 — Final Pass)
- **25+ Dateien** migriert: alle benannten Hex-Werte (#d4a54a, #b8860b, #1c1915, #1a1612) durch Token-Klassen ersetzt
- Betroffen: About, Checkout, Wins, Profile, Collector, Email-Preferences, Newsletter, Apply, Invite, Gallery, Auctions, Catalog, Error-Pages, Reset-Password
- **Komponenten:** Header (`bg-background/95`), ItemBidSection (`border-border`), HomeContent (`bg-card-hover`)
- **Dokumentierte Ausnahmen:** gate/page.tsx (inline Styles), Stripe-Config (SDK-Limit), opengraph/apple-icon (Server-Side), apply/invite (eigenes Design)

### Shared Components (GAP-402, GAP-503)
- **ItemBidSection:** 3 raw `<button>` → `<Button>` (Proxy-Toggle + 2 Confirm-Dialog-Buttons)
- **Bid-Inputs:** `type="number"` → `type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*"` (keine Browser-Spinner)

### Touch Targets (GAP-404 — Korrektur)
- **Header Saved/Cart Icons:** `p-2 -m-2` (36px) → `p-3 -m-3` (44px echte Touch-Fläche)
- Badge-Position angepasst (`-top-1.5 -right-1.5` → `top-0 right-0`)

### Typografie-Standardisierung (GAP-303, GAP-304)
- **Settings Card Headers:** 8× `text-sm font-medium` → `heading-3` (inkl. Delete Account Destructive-Variante)
- **About Page H2s:** 9× `font-serif text-3xl` → `heading-2 font-serif` (konsistent mit Heading-Scale)

### Mobile UX (GAP-502)
- **Checkout:** `inputMode="numeric"` auf Postal Code, `inputMode="tel"` auf Phone
- Korrekte Mobile-Tastatur für Zahlenfelder

### Navigation (GAP-601)
- **MobileNav:** Doppelter "Search Catalog" Link zu `/catalog` entfernt

### Accessibility (GAP-801, GAP-903)
- **Countdown Timer:** `role="timer" aria-live="off" aria-atomic="true"` hinzugefügt
- **Account Overview:** Silent `.catch()` → `toast.error("Failed to load account data")`

### UI/UX Governance Docs
- **7 Dokumente** in `docs/UI_UX/`: Style Guide, Gap Analysis, Optimization Plan, Implementation Report, CLAUDE.md Governance, PR Checklist, Code Governance
- Implementation Report: 40/53 Findings behoben, 13 deferred (mit Begründung)

---

## 2026-04-04 — Account Redesign: Overview + kompakte Item-Cards

### Account Overview Redesign
- **Grid:** `grid-cols-2 lg:grid-cols-3` (2 Spalten Mobile, 3 Desktop — war 1/2/3)
- **CTAs in jeder Card:** "View Bids →", "Pay Now →" (wenn unbezahlt), "Checkout →" (wenn Cart > 0)
- **Zusatzinfos:** Winning-Count, ausstehender Betrag, Cart-Gesamtwert
- **Kompaktere Cards:** p-6 → p-4, text-3xl → text-2xl, kleinere Icons
- **Won Auctions:** Zeigt "€X awaiting payment" + goldener "Pay Now" CTA wenn unbezahlt

### Einheitliche Item-Cards (Bids, Saved, Cart, Wins)
- **Bild:** `w-16 h-16` → `w-14 h-14` (56px statt 64px), `<img>` → `<Image>` (Next.js)
- **Preis:** `text-lg` → `text-sm` auf Saved/Cart/Wins (einheitlich mit Bids)
- **Spacing:** `space-y-3` → `space-y-2` (kompakter)
- **Bids:** `p-4 gap-4` → `p-3 gap-3` + Next.js Image statt raw img
- **~25% weniger Höhe pro Card** über alle 4 Listen-Seiten

---

## 2026-04-04 — UX Audit Phase 4: Remaining Storefront + Admin Fixes

### Storefront Polish
- **GAP-1005:** Homepage Empty State kompakt — p-16 Box → slim Inline-Banner mit "Browse Catalog" CTA
- **GAP-1007:** Account Overview Grid 2-spaltig → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (3+2 Layout)
- **GAP-1011:** Wins Shipping Savings Bar — kompakter (Progress-Bar + Detail entfernt, einzeilig mit Preis + CTA)
- **Hex-Fix:** Savings Bar hardcoded `#d4a54a` → `primary` Tokens

### Admin Fixes
- **GAP-1101:** Medusa native Orders Link im CSS versteckt (`a[href="/app/orders"]` → `display: none`)
- **GAP-1111:** Test Runner: "All Passed" bei 0 Tests → "Not Run" (neuer `not_run` Status)

---

## 2026-04-04 — UX Audit Phase 3: Mobile UX (GAP-1001/1003/1004/1008/1010)

### Account Navigation Mobile (GAP-1001, GAP-1010)
- **AccountLayoutClient.tsx:** Vertikale Sidebar auf Mobile → horizontale scrollbare Tabs (Pill-Style)
- Mobile: Full-Width Tabs mit Scroll, aktive Tab goldfarben, Badges inline
- Desktop: Vertikale Sidebar bleibt unverändert
- Content-Bereich jetzt 100% Breite auf Mobile

### Checkout Form Mobile (GAP-1003)
- **checkout/page.tsx:** `grid-cols-2` → `grid-cols-1 md:grid-cols-2` auf 2 Formular-Zeilen
- First/Last Name und Postal/City stapeln sich jetzt vertikal auf Mobile

### Sticky Mobile Bid CTA (GAP-1004)
- Bereits implementiert und verifiziert (`fixed bottom-0 lg:hidden`)
- Fix: `bg-[#1c1915]` → `bg-background/95 backdrop-blur-xl` (Token + Blur)

### Load More entfernt (GAP-1008)
- **CatalogClient.tsx:** "Load More" Button + `loadMore` Funktion + `hasMore` State entfernt
- Nur noch Pagination — ein Navigations-Pattern statt zwei

---

## 2026-04-04 — UX Audit Phase 2 Batch 2: Hex Cleanup, Logout, Error Feedback (GAP-101/602/701/903)

### Hardcoded Hex Cleanup (GAP-101, GAP-701, MT-2)
- ~35 hardcoded Hex-Werte in 15 Komponenten-Dateien → CSS Token-Referenzen
- `#d4a54a` → `text-primary` / `bg-primary` / `border-primary`
- `#1c1915` → `text-primary-foreground`
- `#2a2520` → `bg-secondary`
- `#241f1a` → `bg-card`
- `rgba(232,224,212,*)` → `border-border`
- Verbleibend: Gradient-Endpunkte `#b8860b` (kein Token nötig, nur in Gradienten)
- Betroffen: BidHistoryTable, BlockCard, ImageGallery, HeaderAuth, LiveAuctionBanner, AuctionListFilter, BlockItemsGrid, DirectPurchaseButton, ShareButton, TopLoadingBar, ItemBidSection, Skeleton, Header, MobileNav

### Logout ohne Confirm (GAP-602, MT-4)
- `window.confirm("Are you sure...")` entfernt in HeaderAuth + MobileNav
- Logout erfolgt direkt — wie bei Discogs, eBay, Amazon (Logout ist nicht destruktiv)

### Error Feedback statt Silent Fail (GAP-903, MT-6)
- Settings: 2 `catch { /* silently fail */ }` → `toast.error("Failed to...")`
- User bekommt jetzt Feedback wenn Preferences nicht laden/speichern

---

## 2026-04-04 — UX Audit Phase 2 Batch 1: Headings, Components, Tokens (GAP-301/302/402/501)

### Account Headings Standardisiert (GAP-301, GAP-302, MT-5)
- 9 Account-Seiten: `text-xl font-semibold` → `heading-2` Utility-Klasse
- Betroffen: Overview, My Bids, Won, Saved, Cart, Orders, Settings, Profile, Addresses
- Konsistente Typografie über gesamten Account-Bereich

### Footer Newsletter → Design System (GAP-501, MT-3)
- Raw `<input>` → `<Input>` Komponente
- Raw `<button>` → `<Button size="sm">` Komponente
- Konsistente Focus-States, Touch-Targets, Styling

### Catalog For-Sale Toggle → Button Component (GAP-402, MT-3)
- 4 raw `<button>` Elemente mit hardcoded `#b8860b` und `#1c1915` → `<Button variant="default/ghost" size="xs">`
- Eliminiert 4 hardcoded Hex-Werte
- Mobile + Desktop Toggle identisch gestylt über Design System

---

## 2026-04-04 — UX Audit Phase 1: Quick Wins (GAP-102/103/105/403/404/801/802)

Basierend auf UI/UX Style Guide v2.0, Gap-Analyse (53 Findings), und 170+ Screenshots.

### Touch Targets (GAP-403, GAP-404)
- **Header.tsx:** Saved/Cart Links: `p-2 -m-2` für 44px Touch-Area (war ~20px)
- **Header.tsx:** Hamburger + Account Buttons: `p-2` → `p-3` für 44px Minimum (war 36px)
- Betrifft jeden Mobile-User auf jeder Seite

### Accessibility: aria-live (GAP-801)
- **ItemBidSection.tsx:** `aria-live="assertive"` auf Bid-Status-Indikator (Winning/Outbid)
- **ItemBidSection.tsx:** `aria-live="polite"` auf Current Price Display
- Screen Reader werden bei Preisänderungen und Outbid-Status informiert

### Container Width (GAP-102)
- `max-w-7xl` → `max-w-6xl` in 5 Dateien: CatalogClient, Gallery, 3 Loading-Pages
- Kein Breiten-Sprung mehr beim Navigieren zwischen Seiten

### Headings (GAP-105, GAP-103)
- **Homepage + About:** `text-5xl md:text-6xl` → `heading-hero` (clamp() fluid sizing)
- **Catalog:** `text-3xl md:text-4xl font-bold font-[family-name]` → `heading-1`
- Konsistente Typografie über alle Seiten

### Decorative Images (GAP-802)
- **HomeContent.tsx:** Cover-Images `aria-hidden="true"`
- **Homepage:** Vinyl-Grafik `aria-hidden="true"`

### Skip-to-Content (GAP-804)
- Bereits implementiert (layout.tsx Zeile 107-110), verifiziert

---

## 2026-04-03 — RSE-292: Post-Auction Marketing Funnel Fix + UX Polish

### RSE-292 Bug Fixes
- **Kritisch: `release_id` fehlte im Wins-Endpoint** → Recommendations Grid war immer leer. Fix: `release_id` in `item`-Objekt der Wins-Response aufgenommen.
- **Shipping-Savings API unvollständig:** 5 Felder ergänzt (`unpaid_wins_weight_g`, `cart_weight_g`, `next_tier_at_g`, `remaining_capacity_g`, `estimated_items_capacity`), `zone` → `zone_slug` umbenannt.
- **Wins Page Frontend:** `ShippingSavings` TypeScript-Typ aktualisiert, nutzt jetzt Server-seitige Kapazitätsberechnung statt client-seitiger Hardcoded-Werte.

### E2E Test
- **Neu: `scripts/test_post_auction_funnel.sh`** — Automatisierter E2E-Test für Wins, Shipping-Savings und Recommendations Endpoints. Tests: Feld-Präsenz, Zonen-Korrektheit (DE/EU/World), Gewichts-Summen, Kapazitäts-Berechnung, Recommendations-Qualität, Edge Cases, Auth-Schutz.

### UX Polish
- **Account Sidebar Badges:** Cart-Count + Saved-Count + Checkout-Count (Wins+Cart) Badges hinzugefügt (neben bestehenden Bids/Wins/Orders)
- **Header Dropdown Badges:** "My Bids" (gold) + "Won" (grün) Badges mit Zähler im User-Dropdown
- **Mobile Profile Icon:** User-Icon links neben Hamburger-Menü (nur wenn eingeloggt, verlinkt zu /account)
- **Auction Archive:** Link in Account-Sidebar hinzugefügt
- **Checkout Badge:** Zeigt Summe aus Wins + Cart Items

### VPS Timezone
- **`Europe/Berlin` (CEST)** statt UTC — Cron-Jobs, Logs und Timestamps jetzt in lokaler Zeit

---

## 2026-04-03 — R2 Image Sync: Admin Dashboard + 30x Performance Optimierung

### Admin Data Sync: R2 Image CDN Sektion
- **Neue Karte** auf `/admin/sync` (Operations → Sync): "Cloudflare R2 — Image CDN"
- Zeigt: Online/Error Status (HEAD-Request), Latenz, letzter Sync-Zeitstempel
- Statistiken: Uploaded, Failed, Checked (changed images), Skipped (unchanged)
- Bucket-Info: vod-images, 160.957 Dateien, 108 GB
- Auto-Refresh alle 60 Sekunden
- **Backend:** `GET /admin/sync/r2-sync` liest `r2_sync_progress.json` + R2 Health-Check
- **Scripts:** `legacy_sync.py` schreibt nach jedem Run `r2_sync_progress.json`

### R2 Sync Performance-Optimierung
- **Vorher:** 22.313 HEAD-Requests nach R2 pro Sync-Lauf → 17 Minuten Laufzeit
- **Nachher:** Pre-Fetch `coverImage` aus Supabase, nur bei geändertem Dateinamen R2 prüfen → **0 Requests, 34 Sekunden**
- **30x schneller** — von 17 Min auf 0,6 Min
- Funktionsweise: `existing_covers` Dict pro Batch, Vergleich `new_cover_url != existing_cover` → nur dann `check_r2_exists()` + `upload_image_to_r2()`

### Dateien
- `scripts/legacy_sync.py` — R2 Counter, pre-fetch Optimierung, Progress-File
- `backend/src/api/admin/sync/r2-sync/route.ts` — Neuer Endpoint
- `backend/src/admin/routes/sync/page.tsx` — R2 CDN Karte

---

## 2026-04-03 — Auction Review: 3 Bug Fixes + 9 Improvements (RSE-293, Part 2)

Post-Auction Daten-Review des ersten Live-Durchlaufs. SQL-Queries gegen Prod-DB, Code-Analyse.

### Kritische Bugs gefunden & gefixt
- **Double is_winning bei max_raise:** Wenn User sein Maximum erhöht, wurde ein neuer Bid mit `is_winning=true` eingefügt ohne den alten auf `false` zu setzen → 2 Gewinner pro Lot. Fix: max_raise Bids mit `is_winning: false`. Lot #6 Daten korrigiert.
- **Release auction_status nicht auf 'sold' gesetzt:** Lifecycle-Job setzte `block_item.status='sold'` aber vergaß `Release.auction_status`. Alle 10 Releases standen auf 'reserved' statt 'sold'. Fix im Job + Daten korrigiert.
- **order_number UNIQUE violation:** Code versuchte denselben order_number auf alle Transactions einer Gruppe zu setzen → UNIQUE constraint error. Fix: jede Transaction bekommt eigene Nummer. 3 bezahlte Transactions nachträglich mit VOD-ORD-000005 bis -000007 versorgt.

### Improvements
- **Email-Logging:** `sendEmailWithLog()` + `email_log` Tabelle für Audit-Trail. Alle 13 Email-Helper (`email-helpers.ts`) auf `sendEmailWithLog()` umgestellt: welcome, outbid, bid-placed, bid-won, payment-confirmation, shipping, payment-reminder-1/3, feedback-request, bid-ending-soon, watchlist-reminder, waitlist-confirm, invite-welcome
- **Realtime Bid-Updates vereinheitlicht:** Frontend nutzt jetzt `loadBids()` API-Call statt Inline-Payload → konsistente SHA-256 User-Hints + kein doppeltes bidCount-Increment
- **extension_count** in Item-API-Response hinzugefügt
- **Shipping-Adresse Fallback:** Webhook überschreibt Checkout-Daten nicht mehr mit Null wenn Stripe keine Adresse liefert
- **LiveAuctionBanner:** Zeigt Anzahl aktiver Auktionen + linkt zu /auctions wenn mehrere aktiv
- **Proaktive Win/Loss-Notification:** Toast-Benachrichtigung via Supabase Realtime wenn Lot-Status auf sold wechselt
- **Proxy-Bidding UX:** "Outbid by automatic proxy bid — Another bidder set a higher maximum" statt "You are not the highest bidder"

### Auction-Durchlauf Ergebnis
- **10/10 Lots verkauft**, €71.50 Revenue, 51 Bids, 8 Bidder, 5 Gewinner
- **Anti-Sniping:** 2x ausgelöst (Lot #2 + #4, je +5min)
- **3 Transactions paid** (€27), 2 pending, 5 noch kein Checkout
- **Datenintegrität:** 0 Orphaned Bids, 0 Orphaned Items, alle Winning Bids korrekt

---

## 2026-04-03 — Live-Test Feedback: 5 UX Fixes + Code Quality (RSE-293)

Post erster Live-Auction ("Throbbing Gristle & Industrial Records", 10 Lots, 30.03.–03.04.2026).

### Fix 1: Winner Congratulations
- **ItemBidSection.tsx:** Drei-Wege-Conditional nach Auktionsende — Gewinner: grüner Trophy-Banner + CTA "Complete Payment →" zu `/account/wins`. Verlierer: gedämpftes "Sold for". Anonym: generisch wie bisher.

### Fix 2+4: Live-Countdown Timer
- **Neu: `LiveCountdown.tsx`** — "use client" Component mit `setInterval`-Tick (1s unter 1h, 30s sonst)
- **Neu: `time-utils.ts`** — Shared `getTimeUrgency()` mit Urgency-Levels (critical/urgent/normal/ended) + automatischer Format-Umschaltung (Sekunden → Minuten → Stunden → Tage)
- **BlockCard.tsx:** Statisches `timeRemaining()` entfernt → `<LiveCountdown>` (Auctions-Listenseite zählt live runter)
- **[slug]/page.tsx:** Statisches `timeRemaining()` entfernt → `<LiveCountdown size="lg">` (Block-Detailseite)
- **LiveAuctionBanner.tsx:** Statisches `formatTimeRemaining()` entfernt → `<LiveCountdown>` (Top-Banner)
- **BlockItemsGrid.tsx:** Lokale `getTimeUrgency()` durch shared Import ersetzt

### Fix 3: Email-Verifizierung nach Registration
- **AuthModal.tsx:** Neuer `"verify-email"` Mode — nach Registration "Check Your Inbox" Screen mit Resend-Button + "Continue Browsing"
- **AuthProvider.tsx:** `emailVerified` State + `resendVerification()` Methode im Auth Context, gelesen aus Status-Endpoint
- **Header.tsx:** Persistent Gold-Banner für unverified Users: "Please verify your email to place bids. [Resend]" (dismissible)

### Fix 5: View Count Bereinigung
- **Backend route.ts:** IP-basierte Deduplizierung (SHA-256 Hash, 24h in-memory Map mit stündlichem Cleanup), +1 Response-Inflation entfernt
- **[itemId]/page.tsx:** Text durchgängig "X people have viewed this lot" (statt "watching"), Fire-Emoji entfernt, Threshold > 5 beibehalten

### Zusätzliche Fixes
- **bid-ending-reminder.ts:** Höchstbietender wird bei Reminder-Mails übersprungen — nur outbid-Bidder bekommen Erinnerungen
- **auction-block.ts:** `max_extensions` Feld im ORM-Model ergänzt (DB-Migration existierte bereits)
- **auction-lifecycle.ts:** `parseFloat()` → `Number()` mit `|| 0` Fallback für DECIMAL-Handling
- **ItemBidSection.tsx:** User-Anonymisierung in Realtime-Updates: `substring(0,8)` → `anonymizeUserId()` Hash-Funktion (leakt keine echten IDs mehr)

---

## 2026-04-03 — Bilder-CDN: Cloudflare R2 Migration (RSE-284)

### Cloudflare R2 Integration — Vollständig
- **R2 Public URL aktiviert:** `pub-433520acd4174598939bc51f96e2b8b9.r2.dev` (108 GB, 160.957 Dateien)
- **DB-Migration Release:** 32.868 `coverImage` URLs von `tape-mag.com/bilder/gross/` → R2 Public URL (Backup in `Release_coverImage_backup`)
- **DB-Migration Image:** 83.030 `Image.url` URLs analog migriert
- **next.config.ts:** R2 Public URL als Image Remote Pattern hinzugefügt (tape-mag.com bleibt als Fallback)
- **scripts/shared.py:** `IMAGE_BASE_URL` → R2 URL, neue Funktionen `upload_image_to_r2()` + `check_r2_exists()` (boto3 S3-kompatibel, Lazy-Init, Graceful Degradation)
- **scripts/legacy_sync.py:** Inkrementeller Bild-Sync — neue/geänderte Bilder werden automatisch von tape-mag.com heruntergeladen und nach R2 hochgeladen
- **Cron-Job:** Legacy Sync von täglich (04:00 UTC) auf **stündlich** (0 * * * *) umgestellt
- **Admin System Health:** R2 Image CDN Health-Check (HEAD-Request auf Test-Bild, Latenz-Messung)
- **VPS:** boto3 installiert, R2 Credentials in .env eingetragen
- **Verifizierung:** 13/13 Tests bestanden (Bilder erreichbar, URLs migriert, API liefert R2 URLs)

**tape-mag.com ist nicht mehr Single Point of Failure** — alle Bilder kommen aus Cloudflare R2.

**Custom Domain `images.vod-auctions.com`:** CNAME bei all-inkl.com angelegt, DNS löst korrekt auf. Aber SSL-Handshake scheitert — R2 Public Development URLs unterstützen keine Custom Domains via externem CNAME (SSL-Zertifikat nur für `*.r2.dev`). Custom Domain erfordert entweder DNS-Umzug zu Cloudflare oder Cloudflare Worker als Proxy. **Entscheidung:** Bleibt bei `pub-xxx.r2.dev` URL — funktioniert einwandfrei.

---

## 2026-04-03 — Design System, Collector Profiles, Post-Auction Funnel (RSE-286/287/290/292)

### RSE-286: Design Tokens erweitert
- **Spacing Scale:** `--space-xs` bis `--space-3xl` (8px Grid, 7 Stufen)
- **Shadow Scale:** `--shadow-sm/md/lg/gold` (Gold-Glow für Featured-Elemente)
- **Transition Durations:** `--transition-fast` (150ms), `--transition-normal` (250ms), `--transition-slow` (400ms)
- **Datei:** `storefront/src/app/globals.css`

### RSE-287: Typografie-Skala
- **Perfect Fourth (1.333):** `--text-hero` bis `--text-micro` als CSS Custom Properties mit responsive `clamp()`
- **Utility Classes:** `.heading-hero`, `.heading-1`, `.heading-2`, `.heading-3` mit Font-Family + Line-Height
- Auctions-Seite H1: `font-bold` → `heading-1` (jetzt DM Serif Display konsistent)
- **Datei:** `storefront/src/app/globals.css`

### RSE-290: Collector Profiles
- **Backend:** `GET /store/collector/:slug` (public, SHA256-Hash Slugs), `GET/POST /store/account/profile` (auth, Upsert)
- **Frontend:** `/collector/[slug]` Public Profile (Stats, Genre Tags, Bio, Schema.org Person), `/account/profile` Edit Page (Display Name, Bio, Genre Tags, Public Toggle)
- **DB:** `collector_profile` Tabelle (customer_id, display_name, bio, genre_tags[], is_public)
- **Navigation:** "Profile" Link im Account-Sidebar
- **Dateien:** 2 neue Backend-Routes, 2 neue Storefront-Pages, AccountLayoutClient.tsx

### RSE-292: Post-Auction Marketing Funnel (Phase A)
- **Backend:** `GET /store/account/recommendations` (Same Artist → Same Label → Popular, nur kaufbare Releases), `GET /store/account/shipping-savings` (Gewicht + Zone → Savings-Berechnung)
- **Wins Page:** Shipping-Savings-Bar (Gold-Progress-Bar, "Add more items — shipping stays combined!") + Recommendations Grid (4 Karten mit Add-to-Cart)
- **Checkout:** Savings-Highlight ("You saved €X on shipping vs. N individual orders")
- **Dateien:** 2 neue Backend-Routes, wins/page.tsx + checkout/page.tsx modifiziert

### RSE-284: Step-by-Step Plan (Dokument)
- Detaillierter 9-Schritte Plan für Cloudflare R2 Integration: `docs/optimizing/RSE-284_BILDER_CDN_PLAN.md`
- Custom Domain `images.vod-auctions.com`, DB-Migration (41.500 URLs), inkrementeller Bild-Sync, Fallback-Logik
- Geschätzter Aufwand: ~3h, Voraussetzung: Cloudflare Custom Domain konfigurieren

---

## 2026-04-03 — Platform Optimization: 9 Features (RSE-276 bis RSE-285)

Basierend auf externer technischer Analyse + UI/UX-Bewertung. Optimierungsplan: `docs/optimizing/OPTIMIZATION_PLAN.md`.

### Phase 1: Go-Live Readiness

#### RSE-276: Scroll-Bug Lot-Detailseiten
- Mobile Bottom-Padding reduziert (`pb-20` → `pb-24`), redundanten Separator entfernt
- Spacing vor RelatedSection gestrafft (`my-8` → `mt-6 mb-4`)
- **Datei:** `storefront/src/app/auctions/[slug]/[itemId]/page.tsx`

#### RSE-277: Homepage-Übergang glätten
- Coming Soon Sektion: symmetrisches Padding (`pb-16` → `py-16`) + subtle Border-Divider
- **Datei:** `storefront/src/components/HomeContent.tsx`

#### RSE-278: Bid-Confirmation Animation
- Animiertes Checkmark-Overlay nach erfolgreichem Gebot (Framer Motion Spring, 2.5s auto-fade)
- `bidSuccess` State in BidForm, Gold-Akzent auf Background, "Bid Placed!" + Subtitle
- Bestehender Sonner-Toast bleibt als sekundäre Bestätigung
- **Datei:** `storefront/src/components/ItemBidSection.tsx`

#### RSE-279: SEO Schema.org + Dynamic robots.txt
- **Dynamic `robots.ts`:** Async, fetcht `platform_mode` vom Backend. Nicht-`live` Modes → `Disallow: /` (blockiert Crawler)
- **Organization JSON-LD** im Root Layout: VOD Auctions, Frank Bull, Est. 2003
- **BreadcrumbList JSON-LD** auf 6 Detail-Seiten: Lot, Block, Catalog, Band, Label, Press
- **Neue Komponente:** `storefront/src/components/BreadcrumbJsonLd.tsx`
- **Dateien:** `robots.ts`, `layout.tsx`, 6 Detail-Pages

### Phase 2: Post-Launch Features

#### RSE-280: Autocomplete-Suche mit Typeahead
- **Backend:** `GET /store/catalog/suggest?q=...&limit=8` — ILIKE auf Release.title, Artist.name, Label.name, gruppierte Ergebnisse (Releases 60%, Artists 20%, Labels 20%)
- **Frontend:** `SearchAutocomplete.tsx` — Dialog mit Debounced Input (300ms), Keyboard-Navigation (Arrow + Enter + Escape), Cover-Thumbnails, gruppierte Sektionen
- **Header:** Search-Icon → Button mit `Cmd+K` Badge, globaler Keyboard-Shortcut
- **Dateien:** Neue `backend/src/api/store/catalog/suggest/route.ts`, neue `SearchAutocomplete.tsx`, `Header.tsx`

#### RSE-281: Faceted Search — Genre, Decade, Filter-Chips
- **Backend:** `genre` Param (JOIN entity_content.genre_tags), `decade` Param (year BETWEEN range)
- **Backend:** `GET /store/catalog/facets` — Format/Country/Decade/Genre Counts für Cross-Filtering
- **Frontend:** Genre-Input + Decade-Dropdown in Advanced Filters
- **Filter-Chips:** Aktive Filter als Badges mit X zum Entfernen, alle URL-persistiert
- **Dateien:** `catalog/route.ts`, neue `catalog/facets/route.ts`, `CatalogClient.tsx`, `catalog/page.tsx`

#### RSE-282: Completed Auctions Archiv
- **Backend:** `?status=past` Filter (ended + archived), sortiert nach end_time DESC, enriched mit total_bids, total_revenue, sold_count
- **Frontend:** `/auctions/archive` Seite mit Block-Cards (Endpreise, Bid-Counts, Cover-Images)
- Schema.org `Event` mit `EventEnded` Status, BreadcrumbJsonLd
- "View Past Auctions →" Link auf Auctions-Seite
- **Dateien:** `auction-blocks/route.ts`, neue `auctions/archive/page.tsx`, `auctions/page.tsx`

#### RSE-283: Catalog Infinite Scroll
- Intersection Observer mit 400px rootMargin für Auto-Loading
- "Load More" Button als manuelle Alternative
- Toggle zwischen Paginated/Infinite (localStorage-Persistenz)
- Akkumulierte Releases im Infinite-Modus, Reset bei Filter-Änderung
- Progress-Counter: "Showing X of Y releases"
- **Datei:** `storefront/src/components/CatalogClient.tsx`

#### RSE-285: Onboarding-Flow für Erst-Bieter
- 3-Slide Modal nach Registrierung: Proxy Bidding, Anti-Sniping, Checkout & Shipping
- Trigger via Custom Event `vod:registration-complete` (dispatched nach Register in AuthProvider)
- localStorage `vod_onboarding_completed` Flag, Skip/Complete Options, Progress Dots
- **Dateien:** Neue `OnboardingModal.tsx`, `AuthProvider.tsx`, `layout.tsx`

### Infrastructure

#### Admin Session TTL
- Medusa Session-Cookie von 10h (Default) auf 14 Tage verlängert (`sessionOptions.ttl` in medusa-config.ts)

#### Missing Dependency
- `@stripe/stripe-js` als fehlende Dependency installiert (Build-Fix)

### Dokumentation
- **Optimization Plan:** `docs/optimizing/OPTIMIZATION_PLAN.md` — 17 Issues aus externer Analyse, Querschnitts-Anforderungen (Testing, Tracking, SEO, Admin, Doku)
- **Post-Auction Marketing Funnel:** `docs/optimizing/POST_AUCTION_MARKETING_FUNNEL.md` — 7-Touchpoint Cross-Sell Konzept mit Shipping-Savings-Visualisierung
- **Linear:** 189 erledigte Issues archiviert, 17 neue Issues angelegt (RSE-276 bis RSE-292)

---

## 2026-04-02 — Admin Config Panel, Pre-Launch System, Dashboard, Design System Unification

### Shared Component Library + Design System v2.0
- **3 neue Shared-Component-Dateien:** `admin-tokens.ts` (Farben, Typo, Spacing, Formatter), `admin-layout.tsx` (PageHeader, SectionHeader, PageShell, Tabs, StatsGrid), `admin-ui.tsx` (Badge, Toggle, Toast, Alert, EmptyState, Btn, ConfigRow, Modal)
- **17 Admin-Seiten migriert** auf Shared Components — lokale `const C` entfernt, Duplikation eliminiert (-773 Zeilen netto)
- **Einheitliche PageHeader** auf jeder Seite: 20px bold Titel + 13px Subtitle (keine Emojis, kein "Admin" Label)
- **Auction Blocks + Orders:** Medusa `<Container>` durch `<PageShell>` ersetzt (kein Rahmen mehr um Header)
- **Navigation bereinigt:** Sidebar zeigt nur 7 Items: Dashboard, Auction Blocks, Orders, Catalog, Marketing, Operations, AI Assistant
- **Navigation-Fixes:** CRM, Config, Waitlist `defineRouteConfig` entfernt → erscheinen nicht mehr als separate Sidebar-Items, nur über Hub-Seiten erreichbar
- **Hub-Seiten vervollständigt:**
  - Marketing Hub: Waitlist-Karte hinzugefügt + CRM Link korrigiert (`/app/customers` → `/app/crm`)
  - Operations Hub: Configuration-Karte hinzugefügt (war nach defineRouteConfig-Entfernung unerreichbar)
- **Design Guide v2.0:** `DESIGN_GUIDE_BACKEND.md` komplett überarbeitet — Shared Component Architektur, Pflicht-Imports, Anti-Patterns, Checkliste
- **Design Guide Mockup:** `docs/mockups/design-guide-backend.html` — 20-Sektionen Component Library

### Design System Unification (Colors)
- **17 Admin-Seiten** auf einheitliche `const C` Palette umgestellt (Design Guide konform)
- Alle Seiten nutzen jetzt die exakt gleichen 12 Farb-Tokens: text, muted, card, border, hover, gold, success, error, blue, purple, warning
- **0 verbotene Farben** im Codebase (verified: kein #f5f0eb, #e8e0d4, #d1d5db, #9ca3af)
- Batch A: catalog, marketing, operations — `const C` hinzugefügt
- Batch B: media, musicians, sync — `COLORS` → `C` umbenannt + fehlende Keys ergänzt
- Batch C: system-health, emails, gallery, transactions (2x) — Farben standardisiert
- Batch D: crm (204 COLORS→C Referenzen), entity-content (green/red/orange→success/error/warning), ai-assistant (Dark-Theme→Light)
- **Design Guide Mockup:** `docs/mockups/design-guide-backend.html` — 20-Sektionen Component Library als Referenz
- **Design Guide Docs:** `DESIGN_GUIDE_BACKEND.md` + `DESIGN_GUIDE_FRONTEND.md` — verbindlich für alle Seiten

---

### Admin Configuration Panel — `/admin/config`
- **Neue Seite** `/admin/config` mit 3 Tabs: Access/Launch (default), Auction, Change History
- **5 Platform Modes:** `beta_test` (aktuell) → `pre_launch` → `preview` → `live` → `maintenance`
- `beta_test` Mode hinzugefügt (= aktueller Zustand: nur Passwort-Gate, kein Invite-System)
- **Go-Live Pre-Flight Checklist** — 6 automatische Checks, typed "GO LIVE" Bestätigung, E-Mail an frank@vod-records.com
- **site_config erweitert** um 11 neue Spalten (platform_mode, gate_password, invite toggles, auction settings)
- **Config Audit Log** — `config_audit_log` Tabelle + Change History Tab
- **In-Memory-Cache** mit 5-min TTL für site_config
- **Stats-Row** über Tabs: Platform Mode Badge, Catalog, Direct Purchase, Bid Reminders
- **API-Routes:** `GET/POST /admin/site-config`, `GET /admin/site-config/audit-log`, `GET/POST /admin/site-config/go-live`, `GET /store/site-mode`

### Pre-Launch Waitlist & Invite System
- **Bewerbungsformular** `/apply` — öffentlich erreichbar (Middleware-Whitelist): Name, Email, Land, Genre-Checkboxen, Kaufverhalten, Referrer
- **Bestätigungsseite** `/apply/confirm` — nach erfolgreicher Bewerbung
- **Bestätigungs-E-Mail** wird automatisch gesendet nach Bewerbung
- **Token-Einlösung** `/invite/[token]` — validiert Token, Registrierungsformular mit vorausgefüllter E-Mail, erstellt Medusa-Account, setzt `vod_invite_session` Cookie
- **Token-Format:** `VOD-XXXXX-XXXXX` (10 Zeichen Base62, crypto.randomBytes, 62^10 Kombinationen)
- **Token-Gültigkeit:** 21 Tage, einmalig nutzbar, Security-Log in `invite_token_attempts`
- **Admin Waitlist** `/admin/waitlist` — Stats-Header, filtrierbare Tabelle mit expandierbaren Rows, Bulk-Approve + Invite, Token-Tab mit Revoke
- **Admin Invite Tokens** `/admin/invite-tokens` — Token-Übersicht, manuelles Token erstellen, Revoke
- **2 neue E-Mail-Templates:** `waitlist-confirm` ("Application received") + `invite-welcome` ("[Name], your access is ready")
- **Middleware Upgrade:** Liest `platform_mode` aus Backend-API (5-min Cache), `beta_test`/`pre_launch`/`live`/`maintenance` steuern Gate-Verhalten. Akzeptiert `vod_access` + `vod_invite_session` Cookies. Fallback auf `GATE_PASSWORD` env var wenn Backend nicht erreichbar.
- **Invite Redeem:** Validiert `MEDUSA_BACKEND_URL`, behandelt existierende Accounts

### Dashboard — `/admin/dashboard` (komplett neu)
- **Neuer API-Endpoint** `GET /admin/dashboard` — aggregiert Daten aus 8+ Tabellen in einem Call
- **Phasen-adaptiv:** Stats, Sektionen und Aktionen passen sich an `platform_mode` an
- `beta_test`: Overdue Payments, Ready to Pack, Labels Pending, Active Auctions, Shipped This Week + Launch Readiness Checklist + Catalog Health
- `pre_launch`: Waitlist Pending, Invited, Registered, Active Auctions, New Users
- `live`: Revenue, Orders, Active Auctions, Bids Today, Shipped
- **Action Required** — rot/gelb Alerts für überfällige Zahlungen, fehlende Preise, pack-bereite Orders
- **Live Auctions** — aktive Blocks mit Countdown, Bid-Count, Top-Bid, Quick-Actions
- **Recent Activity** — letzte 10 Events (Bids, Orders) chronologisch
- **Weekly Summary** — Revenue, Orders, Shipped, Pending
- **Auto-Refresh** alle 60 Sekunden

### Light-Mode Design Overhaul — alle Admin-Seiten
- **Root Cause behoben:** Custom Admin-Seiten verwendeten Dark-Mode-Farben (#f5f0eb Text, #1c1915 Hintergründe, rgba(255,255,255,*) Borders) in Medusa's Light-Mode Shell
- **~25 Seiten gefixt** in 3 Batches:
  - Batch 1 (Critical): config, waitlist, entity-content — komplette Palette ersetzt
  - Batch 2 (Critical): media, musicians, sync — komplette Palette ersetzt
  - Batch 3 (High): dashboard, emails, gallery, catalog, marketing, ai-assistant, auction-blocks, crm, operations — Text + Borders gefixt
  - Nachfixes: transactions (Liste + Detail), system-health, auction-blocks Detail/Post-Auction/AI-Create, test-runner, media Detail
- **Neue Light-Mode Palette:** `#1a1714` Text, `#78716c` Muted, `#f8f7f6` Cards, `#e7e5e4` Borders, `rgba(0,0,0,0.08)` statt `rgba(255,255,255,0.1)`
- **4 fontFamily-Bugs gefixt** (Farbwert `#d1d5db` als font-family verwendet)
- Config + Waitlist Pages 2x komplett rewritten für bessere UX (CRM-Designsystem)

### Datenbank
- **4 neue Tabellen:** `config_audit_log`, `waitlist_applications`, `invite_tokens`, `invite_token_attempts`
- **11 neue Spalten** in `site_config` (Stufe 1)
- `platform_mode` auf `beta_test` gesetzt (aktueller Zustand)

### Bid-Ending-Soon Reminder E-Mails
- **4 neue Timer-E-Mails** an alle aktiven Bidder: 24h, 8h, 1h, 5 Minuten vor Lot-Ende
- Adaptives Template: Gold-Ton (24h/8h) → Orange (1h) → Rot (5m), Winning/Outbid Status-Badge
- **Cron-Job** `bid-ending-reminder.ts` — läuft jede Minute, `bid_ending_reminder` Tabelle verhindert Duplikate
- Registriert in `/app/emails` (4 Einträge mit Preview + Send Test)

### Design Guides (neu)
- `docs/DESIGN_GUIDE_BACKEND.md` — verbindliche Farbpalette, Typografie-Skala, 13 Komponenten-Patterns, Anti-Patterns-Liste
- `docs/DESIGN_GUIDE_FRONTEND.md` — Vinyl Culture Design-System, CSS Custom Properties, shadcn/ui Patterns, Motion Presets

### Konzept-Dokumente
- `docs/PRE_LAUNCH_KONZEPT.md` — Flow, DB-Schema, E-Mail-Kampagne, Wave-Strategie
- `docs/ADMIN_CONFIG_KONZEPT.md` — Stufe 1/2 Trennung, 5 Platform Modes (mit beta_test)
- `docs/DASHBOARD_KONZEPT.md` — 3-Phasen-adaptives Dashboard (beta_test/pre_launch/live)
- `docs/mockups/pre-launch-flow.html` — 7-Sektionen HTML-Präsentation für Marketing
- `docs/mockups/admin-config-panel.html` — 7-Sektionen HTML-Präsentation

### Bug-Fixes
- Dashboard 500: `shipping_method` hat kein `deleted_at` → `.whereNull("deleted_at")` entfernt
- Dashboard 500: `sync_change_log` hat `synced_at` nicht `created_at` → Spaltenname korrigiert
- Waitlist POST: `sendWaitlistConfirmEmail()` war nur TODO-Kommentar → tatsächlicher Aufruf hinzugefügt
- Invite Redeem: `MEDUSA_BACKEND_URL` Validierung + bessere Fehlerbehandlung für existierende Accounts

---

## 2026-04-02 — Upstash Redis konfiguriert

### Upstash Redis (Cache) — aktiviert
- Datenbank `vod-auctions` auf Upstash erstellt (AWS Frankfurt eu-central-1, Free Tier, Global).
- Endpoint: `uncommon-moray-70767.upstash.io`
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in `backend/.env` eingetragen — lokal + VPS.
- System Health zeigt Upstash grün.

---

## 2026-04-02 — Microsoft Clarity (UXA) Integration

### Microsoft Clarity — aktiviert
- **`ClarityProvider.tsx`** (`storefront/src/components/providers/`) — lädt Clarity-Snippet nur wenn `marketing: true` im `cookie-consent` localStorage-Eintrag. Double-injection guard via `window.clarity` Check.
- In `storefront/src/app/layout.tsx` eingebunden.
- **Backend System Health** prüft bereits `CLARITY_ID` / `NEXT_PUBLIC_CLARITY_ID` → zeigt grün wenn gesetzt.
- **Project ID:** `w4hj9xmkky` (Projekt: VOD-Auctions auf clarity.microsoft.com)
- **Env vars gesetzt:** `NEXT_PUBLIC_CLARITY_ID` in `storefront/.env.local`, `CLARITY_ID` in `backend/.env` — lokal + VPS.
- Dashboard füllt sich sobald erste User mit Marketing-Consent die Seite besuchen.

---

## 2026-04-02 — Sentry + System Health + Dark Mode + JWT Session

### Sentry Error Tracking — vollständig eingerichtet
- **Root Cause (warum 0 Events):** Turbopack injiziert `sentry.client.config.ts` NICHT automatisch in den Client-Bundle (kein Webpack-Plugin-Support). DSN war nie im Browser-Bundle → SDK nie initialisiert → alle `captureException`/`captureMessage` Calls silently ignored.
- **Fix 1:** DSN in `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` hardcoded (statt `process.env.NEXT_PUBLIC_SENTRY_DSN` — wird von Turbopack nicht inlined).
- **Fix 2:** Neues `SentryInit` Client-Component (`src/components/SentryInit.tsx`) importiert `sentry.client.config.ts` explizit. In `layout.tsx` eingebunden → zwingt Turbopack die Client-Config ins Browser-Bundle.
- **Tunnel `/monitoring`:** `withSentryConfig tunnelRoute` erstellt API-Route nicht automatisch mit Turbopack. Manuelle App-Router-Route `src/app/monitoring/route.ts` erstellt — proxied Sentry-Envelopes an `ingest.de.sentry.io` (EU-Region). Leitet `Content-Encoding` Header weiter.
- **Middleware-Fix:** `/monitoring` zu Password-Gate-Whitelist hinzugefügt (sonst würde der Tunnel-Endpoint zur Gate-Page redirected).
- **Ergebnis:** 2 Test-Issues in Sentry bestätigt. SDK sendet via `/monitoring` Tunnel, Sentry empfängt Events.

### System Health — Alerts Panel
- **Neuer API-Endpoint** `GET /admin/system-health/alerts`: Holt Sentry Issues (letzte 7 Tage) via Personal API Token + prüft `sync_change_log` auf letzten Sync-Run (Warning >26h, Error >28h).
- **Alerts Panel** in `/app/system-health`: Sync-Status-Bar (grün/amber/rot) + Sentry Issues Liste mit Level-Badges, Occurrence-Count, Last-Seen, direkter Link zu Sentry Permalink.
- `SENTRY_API_TOKEN` zu Backend `.env` hinzugefügt.

### Admin Dark Mode — vollständige Farbkorrektur
- 461+ hardcodierte Light-Mode-Farben in 14 Admin-Seiten ersetzt: `#111827` → `inherit`, `#f9fafb` → `transparent`, `background: "#fff"` → `var(--bg-component, #1a1714)`, Border `#e5e7eb` → `rgba(255,255,255,0.1)`.
- Betroffene Seiten: `auction-blocks/`, `catalog/`, `dashboard/`, `emails/`, `gallery/`, `marketing/`, `operations/`, `system-health/`, `transactions/`, `ai-assistant/`.
- Spezialfall Transactions Filters-Button: Ternary-Pattern `? "#f0f0ff" : "#fff"` manuell korrigiert.

### JWT Session — 30-Tage Login
- `jwtExpiresIn: "30d"` in `medusa-config.ts` `http`-Config ergänzt. Admin-Login bleibt 30 Tage aktiv statt täglich ablaufen.

### Bug-Fixes (Testlauf Marius Luber)
- **Newsletter Confirm:** `confirmUrl` zeigt jetzt auf Storefront (`/newsletter/confirm`), neue Server-Component macht API-Call mit Publishable Key. Backend gibt JSON zurück statt HTTP-Redirect.
- **Address Delete:** Hard Delete statt Soft Delete in `addresses/[id]/route.ts` — verhindert "Customer_address already exists" nach Löschen und Neuanlegen einer Adresse.

---

## 2026-04-10 — Newsletter Confirm Fix + Address Delete Fix (Testlauf-Bugs)

### Bug 1 — Newsletter Confirm: Publishable API Key Error
- **Root cause:** Confirm-Link in der Mail zeigte auf `${BACKEND_URL}/store/newsletter/confirm?...`. Browser-Klick → GET ohne `x-publishable-api-key` Header → Medusa blockiert alle `/store/*` Requests ohne Key.
- **Fix 1:** `confirmUrl` in `newsletter/route.ts` zeigt jetzt auf `${STOREFRONT_URL}/newsletter/confirm?token=...&email=...` statt Backend-URL.
- **Fix 2:** Neue Server-Component `storefront/src/app/newsletter/confirm/page.tsx` — macht server-seitig den Backend-Call mit Publishable Key, redirectet dann zu `/newsletter/confirmed` oder `/newsletter/confirmed?error=invalid`.
- **Fix 3:** `newsletter/confirm/route.ts` Backend gibt jetzt JSON zurück (`{success: true}` / `{error: "invalid"}`) statt HTTP Redirect — wird von der Storefront-Page konsumiert.

### Bug 2 — Address Save: "Customer_address already exists"
- **Root cause:** `DELETE /store/account/addresses/:id` machte Soft Delete (`deleted_at = NOW()`). Medusa's `customer_address` Tabelle hat einen Unique-Constraint auf `customer_id`. Soft-deleted Record blockiert neuen INSERT → "already exists" Error.
- **Fix:** `addresses/[id]/route.ts` macht jetzt Hard Delete (`.delete()`). Customer hat keine gespeicherte Adresse mehr → neue Adresse kann problemlos eingefügt werden.

---

## 2026-04-10 — Legacy Sync: frei-Feld, Change Log, Venv-Fix

### Legacy Sync Venv-Fix
- `scripts/venv/` war seit ~09.03.2026 defekt (kein `bin/`-Verzeichnis) → täglicher Cron schlug still fehl. Fix: `rm -rf venv && python3 -m venv venv && pip install -r requirements.txt`.

### legacy_available — frei-Feld Sync
- **MySQL `frei`-Semantik:** `0` = gesperrt, `1` = verfügbar, `>1` (Unix-Timestamp) = auf tape-mag.com verkauft
- **Supabase:** `ALTER TABLE "Release" ADD COLUMN legacy_available BOOLEAN NOT NULL DEFAULT true`
- **`legacy_sync.py`:** `frei == 1 → True`, sonst `False` → täglich als `legacy_available` gesynct (nicht geschützt)
- **Backend `catalog/route.ts`:** `for_sale`-Filter und `is_purchasable` erfordern jetzt `legacy_available = true`
- **Backend `catalog/[id]/route.ts`:** `is_purchasable` erfordert `legacy_available !== false`
- **Ergebnis:** 373 Releases (102 gesperrt + 271 auf tape-mag verkauft) korrekt als nicht-kaufbar markiert
- **tape-mag `mapper.ts`:** Bug: `Math.min(frei, 999999999)` → Unix-Timestamps wurden 999M Inventory. Fix: `frei === 1 ? 1 : 0`

### sync_change_log — Change Detection + Admin UI
- **`sync_change_log` Tabelle** (Supabase): `sync_run_id TEXT`, `release_id TEXT`, `change_type` (inserted/updated), `changes JSONB` `{field: {old, new}}`. Indizes auf `run_id`, `release_id`, `synced_at DESC`.
- **`legacy_sync.py`:** Pre-fetch aktueller DB-Werte vor jedem Batch → Vergleich → Bulk-Insert in `sync_change_log`. Geloggte Felder: `legacy_price`, `legacy_available`, `title`, `coverImage`. Summary zeigt "Changes logged: N" + Run ID.
- **`GET /admin/sync/change-log`** (NEU): Runs-Übersicht mit pro-Feld Counts + paginierte Einträge (Release-Titel JOIN). Filter: `run_id`, `field`, `limit/offset`.
- **Admin `/app/sync` → Tab "Change Log"** (NEU): Run-Picker Chips, Stats-Bar, Feld-Filter, Tabelle mit old→new Diffs (formatiert: Preis €, Availability ✓/✗, Titel-Text). Pagination bei >100 Einträgen.

---

## 2026-04-09 — AI Creator Fixes + Drafts Table Redesign

### AI Auction Creator — Bugfixes
- **Root Cause 1 — DB NOT NULL:** `start_time`/`end_time` sind im Medusa-Modell nicht nullable → `auctionService.createAuctionBlocks()` ohne diese Felder warf Postgres-Constraint-Fehler. Fix: `create_auction_draft` nutzt jetzt **Knex direkt** (bypasses ORM), setzt Default-Daten wenn weggelassen (+7d Start, +14d Ende, 10:00 UTC).
- **Root Cause 2 — falscher Feldname:** Code übergab `description`, DB-Spalte heißt `long_description` → wurde silent ignoriert. Fix: korrekte Spaltenname.
- **Tool-Schema ergänzt:** `start_time`, `end_time`, `long_description` sind jetzt explizit im Tool-Schema. Nicht mehr benötigt: `AuctionModuleService` Import/Param aus `executeTool` entfernt.
- **System Prompt:** Claude lässt `start_time`/`end_time` weg wenn User keine Daten nennt (Tool-Defaults greifen). Claude fragt nie nach Daten sondern macht weiter.

### Drafts Table Redesign
- **Neue `DraftsTable` Komponente:** Zeigt **Created** + **Last Modified** statt Start/End — für Drafts inhaltlich sinnvoller. Format: `"15 Apr 26, 10:00"`.
- **`AuctionBlock` Typ:** `updated_at` ergänzt.
- **E2E Test Blocks:** Drafts mit Titel-Präfix `"E2E"` werden in einem separaten, stark ausgeblendeten "Test Blocks"-Abschnitt ganz unten angezeigt — weg aus dem echten Drafts-Bereich.

---

## 2026-04-09 — Draft Mode, AI Auction Creator, Catalog Auction Status

### Feature 1 — Draft Mode
- **Save button label:** `[id]/page.tsx` — Button zeigt "Save Draft" wenn `isNew || block.status === "draft"`, sonst "Save". Klare Trennung zwischen Draft-Speichern und Status-Wechseln (Schedule-Button bleibt separat).

### Feature 2 — AI Auction Creator
- **`POST /admin/ai-create-auction`** (NEU) — SSE-Endpoint mit 3 Tools: `search_catalog` (sucht nur `auction_status=available`, sortiert nach `estimated_value`), `create_auction_draft` (ruft `auctionService.createAuctionBlocks()` direkt auf — kein HTTP-Validierungs-Layer), `add_items_to_block` (Knex-Insert in `block_item`, setzt `auction_status=reserved` auf Release). Verwendet `claude-sonnet-4-6`.
- **`/app/auction-blocks/ai-create`** (NEU) — Admin-Seite mit Textarea für den "Brief", Live-Activity-Log mit farbigen Tool-Chips, "Open Draft Block →" Link nach Fertigstellung.
- **"✨ AI Create" Button** auf der Auction-Blocks-Listenseite neben "Create New Auction".
- System Prompt: 2–4 Suchen, 10–25 Items, start_price = `estimated_value × 50%` oder `legacy_price × 50%`, Minimum €1, ganze Euros.

### Feature 3 — Catalog Auction Status
- **`GET /admin/releases`:** `Release.legacy_price` ins SELECT ergänzt — war bisher nicht dabei.
- **`GET /store/catalog/:id`:** Nach der Hauptquery: Lookup von `block_item JOIN auction_block` für `auction_status = reserved`. Gibt `auction_lot: { block_slug, block_item_id }` zurück — nur wenn Block-Status `preview` oder `active` (kein Link zu draft/scheduled → würde 404 liefern).
- **`[id]/page.tsx` (Admin):** `Release`-Typ um `legacy_price` ergänzt. `handleAddItem`: Start-Price-Fallback war `1` — jetzt `Math.round(legacy_price × 0.5)` wenn `estimated_value` fehlt, sonst `1`.
- **`CatalogClient.tsx`:** `auction_status` zum `CatalogRelease`-Typ ergänzt. Preis-Badge: `auction_status === "reserved"` → amber "In Auction" statt Preis.
- **`catalog/[id]/page.tsx`:** `auction_lot` zum `CatalogRelease`-Typ ergänzt. Neuer Block in der Preis-Box: bei `reserved + auction_lot` → animierter Pulse-Dot + "Currently in Auction →" Link; bei `reserved + kein auction_lot` → "Coming to Auction Soon" (kein Link).

---

## 2026-04-08 — Bid History Raise Feature + UI Kompakt (v1.0.0-rc4)

### "Raised Bid" Eintrag in der Bid History (Psychological Pressure)
- **DB Migration:** `bid.is_max_raise BOOLEAN DEFAULT false` (Supabase, `bofblwqieuvmqybzxapx`)
- **Backend POST bids:** Wenn Höchstbietender sein Max erhöht → zusätzlicher Bid-Record mit `is_max_raise = true`, `amount = current_price` (öffentlich), `max_amount = newMax` (privat, nur für Owner sichtbar)
- **GET /store/.../bids:** `is_max_raise` in öffentlicher Response — `max_amount` nie exponiert
- **GET /store/account/bids:** `is_max_raise` + `max_amount` im privaten Response
- **BidHistoryTable.tsx:** Auth-aware — fetcht eigene Bids, baut `Map<bidId, max_amount>`. Raise-Einträge: Anderen zeigt `↑ raised bid` (gold), eigenem User zeigt `↑ Your max: €X.XX`. Raise-Row: gold border statt grüner Winning-Row

### Email-Verifizierungs-Fix
- **Security:** 9 bestehende Kunden auf `email_verified = true` gesetzt (alle Pre-Launch Testaccounts)
- Behebt Block für bestehende Accounts durch den neuen Verifizierungs-Check beim Bieten

### UI: Bid-Card kompakter + Proxy-Button + View Count
- **Bid-Card:** `p-5 → p-4`, `text-3xl → text-2xl` Preis, `mb-3 → mb-2`, `mt-3 → mt-2`, `gap-3 → gap-2.5` — ca. 20% weniger Höhe
- **"Set maximum bid" Button:** War kaum sichtbar (ghost/muted) → gold-umrandeter Button mit `↑`-Pfeil, deutlich prominent
- **"N people are watching":** `text-xs/50 → text-sm font-medium /70`, Icon `h-3 → h-4` — deutlich lesbarer

---

## 2026-04-08 — 5 Fixes aus Testlauf-Feedback (UX + Security)

### Fix 1 — Login Button: cursor-pointer
- `storefront/src/components/ui/button.tsx` — `cursor-pointer` zur Base-Class von `buttonVariants` hinzugefügt
- Betrifft alle Buttons sitewide — fehlte komplett in der shadcn/ui Basis-Konfiguration

### Fix 2 — Passwort-Stärke verbessert
- `storefront/src/components/AuthModal.tsx` — `getPasswordStrength()` mit strengerer Logik:
  - **Strong:** >= 10 Zeichen + Uppercase + Lowercase + Zahlen + Sonderzeichen
  - **Medium:** >= 8 Zeichen + Buchstaben + Zahlen
  - **Weak:** alles andere
- Vorher: "password1!" → Strong (falsch) — jetzt: "password1!" → Medium (korrekt, kein Uppercase)

### Fix 3 — Checkboxen zu klein bei Registrierung
- `storefront/src/components/AuthModal.tsx` — beide Checkboxen (Terms & Newsletter) auf `w-4 h-4 shrink-0` vergrößert (von nativer Browser-Defaultgröße ~12px auf 16px)

### Fix 4 — "No buyer's premium" entfernt
- `storefront/src/app/auctions/[slug]/[itemId]/page.tsx` — Badge auf Lot-Seite entfernt
- `storefront/src/app/account/checkout/page.tsx` — 2× Stellen entfernt
- `storefront/src/components/layout/Footer.tsx` — Footer-Zeile entfernt
- Grund: "Buyer's Premium" ist Auktionshaus-Fachjargon (15-25% Aufschlag bei Christie's etc.), verwirrt normale Nutzer mehr als es hilft

### Fix 5 — !! Security: E-Mail-Verifizierung vor Bieten erforderlich
- `backend/src/api/store/auction-blocks/[slug]/items/[itemId]/bids/route.ts` — Knex-Query auf `customer.email_verified` nach Auth-Check; gibt `403` + `code: "email_not_verified"` zurück wenn nicht verifiziert
- `storefront/src/components/ItemBidSection.tsx` — 403-Fehler mit `code === "email_not_verified"` zeigt klaren Toast: "Email not verified — Please check your inbox and verify your email address before placing bids."

---

## 2026-04-08 — System Health Redesign + Sentry Server-Side Fix

### Sentry: Server-Side Error Capture aktiviert
- `storefront/instrumentation.ts` (NEU) — fehlende Next.js Instrumentation Hook
- Ohne diese Datei lädt Next.js `sentry.server.config.ts` nicht zur Laufzeit → Server-Errors wurden nie an Sentry gesendet
- Datei registriert `sentry.server.config` (nodejs) und `sentry.edge.config` (edge) je nach `NEXT_RUNTIME`
- Deployed + storefront rebuild auf VPS

### System Health Page: Komplettes Redesign (`backend/src/admin/routes/system-health/page.tsx`)

#### Architecture Flow Diagram
- Neues `ArchitectureFlow`-Component — 4-Layer visuelle Darstellung wie alle Systeme zusammenhängen
- Layer 1: Customer Browser (gold)
- Layer 2: Storefront (Next.js) links ← → Analytics-Layer rechts (GA4, RudderStack, Clarity, Sentry)
- Layer 3: API Backend full-width (Medusa.js auf VPS)
- Layer 4: 4 Spalten — Data Layer (PostgreSQL, Upstash) | Payments (Stripe, PayPal) | Communication (Resend, Brevo) | AI (Anthropic)
- Pure Flexbox/Div mit Unicode-Pfeilen, keine Dependencies

#### Service-Gruppierung in 5 Kategorien
- `CATEGORIES`-Config: Infrastructure | Payments | Communication | Analytics & Monitoring | Cache & AI
- Jede Kategorie mit Section-Header, Beschreibung + Per-Kategorie-Status-Summary (All OK / N errors / N unconfigured)
- Orphan-Safety-Net für Services die keiner Kategorie zugeordnet sind

#### Key Info pro Service-Card
- `SERVICE_META`-Config mit statischen Architektur-Informationen für alle 14 Services
- Jede Card erweitert um: **Role** (kursiv, gold) + **Key Functions** (Bullet-Liste) + **Key Metrics** (Tags)
- PostgreSQL: DB-Schema-Details, Free-Tier-Limits; Stripe: Payment-Methoden, Webhook-Events; Brevo: 3.580 tape-mag Kontakte; etc.

---

## 2026-04-07 — Session 2: My Bids Badge, Swipe, Back Button (3 Fixes)

### My Bids Nav Badge
- `backend/src/api/store/account/status/route.ts`: `active_bids_count` gefiltert auf `bid.is_winning = true` — zeigt jetzt nur Lots wo User aktuell Highest Bidder ist (vorher: alle platzierten Gebote in aktiven Auktionen)
- `storefront/src/app/account/AccountLayoutClient.tsx`: `bidsCount` aus `useAuth()` ergänzt, Gold-Badge auf "My Bids" Nav-Item (gleicher Stil wie Orders-Badge)

### Image Gallery: Touch-Swipe auf Hauptbild (Mobile)
- `storefront/src/components/ImageGallery.tsx`: Swipe links/rechts auf dem großen Produktbild navigiert zwischen Bildern (nur Mobile — Desktop behält Zoom-on-Hover)
- Unterscheidet Swipe (dx > 40px, horizontal dominiert) von Tap (öffnet Lightbox)
- Subtile Chevron-Pfeile links/rechts als Swipe-Hinweis (nur Mobile, `pointer-events-none`)

### Back Button: Scroll-Position Wiederherstellung
- `storefront/src/components/CatalogBackLink.tsx`: Statt `<Link href={catalogUrl}>` (neue Navigation → scroll top) jetzt `window.history.back()` → Browser restored exakte Scroll-Position wie beim nativen Back-Button
- Fallback auf gespeicherte Catalog-URL wenn `history.length <= 1` (direkter Link auf Produktseite ohne Vorgeschichte)

---

## 2026-04-07 — Prio 1–4: UX, Loading, Gallery Redesign (19 Fixes)

### Prio 1 — Functional Bugs

#### Newsletter-Bestätigungsmail: localhost → Production URL
- `backend/src/api/store/newsletter/route.ts`: Bestätigungslink verwendete `localhost:9000` → `process.env.BACKEND_URL ?? process.env.MEDUSA_BACKEND_URL ?? "https://api.vod-auctions.com"`
- Aktivierung: `BACKEND_URL=https://api.vod-auctions.com` im Backend `.env` auf VPS setzen

#### Preis-Sort in BlockItemsGrid
- `BlockItemsGrid.tsx`: Preis-Aufsteigend-Sort verwendete nur `start_price` → jetzt `current_price || start_price`, also den aktuellen Gebotsstand

#### Back-Button auf Catalog-Detailseite
- `storefront/src/app/catalog/[id]/page.tsx`: Ghost-Button "← Back" über dem Breadcrumb via existierender `CatalogBackLink`-Komponente

---

### Prio 2 — UX Improvements

#### Country-Filter: Text → Dropdown
- `CatalogClient.tsx`: Text-Input → `<select>` mit 19 Ländern: DE, US, GB, FR, IT, NL, BE, AT, CH, JP, CA, AU, SE, NO, DK, PL, CZ, ES + "Other"

#### Safari Number Input Spinner entfernt
- `globals.css`: `-webkit-inner-spin-button`, `-webkit-outer-spin-button` → `display: none`, `-moz-appearance: textfield` — keine nativen Zahlenpfeile mehr in Safari/Firefox

#### Footer Restrukturierung
- `Footer.tsx`: "Navigation"-Spalte vollständig entfernt
- Neue "Contact"-Spalte: E-Mail (shop@vod-records.com), Öffnungszeiten (Mo–Fr 10–18), Google Maps Link (Eugenstrasse 57, Friedrichshafen)
- Instagram-Link: temporär entfernt (kein URL verfügbar)

---

### Prio 3 — Visual Polish

#### Skeleton-Farbe: Gold → Dunkles Grau
- `storefront/src/components/ui/skeleton.tsx`: `bg-accent` → `bg-[#2a2520]`
- Vorher: Gold `#d4a54a` → aggressiver Goldblitz bei jedem Seitenaufruf
- Jetzt: Dunkles Warmgrau, kaum sichtbar auf `#1c1915` Hintergrund
- Betrifft alle 7 `loading.tsx`-Dateien im Projekt auf einmal

#### TopLoadingBar — YouTube-Style Navigation Indicator
- Neues `storefront/src/components/TopLoadingBar.tsx`
- 2px dünner Gold-Fortschrittsbalken am oberen Bildschirmrand
- Startet bei Link-Klick (15%), füllt sich auf 85%, springt auf 100% wenn neue Route gerendert
- Wrapped in `<Suspense>` in `layout.tsx` (useSearchParams erfordert das)
- Ersetzt das harte "Seitenleeren"-Gefühl bei Navigation

#### Stagger-Animation gedämpft
- `storefront/src/lib/motion.ts`: `staggerChildren` 0.08 → 0.04, `delayChildren` 0.1 → 0.05, item `y` 16 → 8, `duration` 0.35 → 0.2
- Betrifft `CatalogClient.tsx` und `BlockItemsGrid.tsx` (beide importieren aus motion.ts)

#### Pulse-Animation gedämpft
- `globals.css`: Custom `@keyframes pulse` Override — Opacity-Swing 1→0.6 (statt harter 0/1-Zyklus), 2s Dauer

#### Format-Tags: Overlay → Card Body
- `BlockItemsGrid.tsx` + `CatalogClient.tsx`: Format-Badge (`MAGAZINE`, `LP` etc.) von absoluter Bild-Overlay-Position in den Card-Body unterhalb des Bildes verschoben

#### Card-Text-Lesbarkeit
- `BlockItemsGrid.tsx`: "Starting bid"-Label und View-Count von `/40` auf `/70` Opacity erhöht

#### User-Avatar Cleanup
- `HeaderAuth.tsx`: Name-Text aus dem Avatar-Trigger entfernt — nur noch Icon/Initials-Kreis
- `Header.tsx`: Saved-Items-Badge von `rose-500` → Gold `#d4a54a`

#### Gallery Quote
- `gallery/page.tsx` Closing-Section: "Browse the full catalogue →" → "Explore the archive →"

---

### Prio 4 — Gallery Redesign (`storefront/src/app/gallery/page.tsx`)

Basiert auf einer visuellen Mockup-Analyse (`docs/gallery-mockup.html`) mit Risiko-Bewertung und Side-by-Side-Vergleichen. User hat folgende Varianten gewählt:
- Section 3: Mit Hero (breites erstes Bild)
- Section 4: 2 Spalten + letztes Element full-width
- Section 5: Vertikale Karten (3B)

#### Section 3 — Visual Gallery (neu)
- Bild #1: Eigene Zeile, volle Breite, `aspect-[16/9]`, `max-w-7xl` Container
- Bilder 2–6: Einheitliches 3-Spalten-Grid, alle `aspect-[4/3]`, `max-w-7xl`
- Kein gemischtes Seitenverhältnis mehr (vorher: hero 16/10 + 5× 4/3)
- Hover: `scale-[1.02]` / 500ms (statt 700ms)

#### Section 4 — The Collection (neu: Vertical Cards)
- Vorher: Overlay-Cards (Text auf Gradient-Bild)
- Jetzt: Bild oben (`aspect-[5/4]`), Text-Block darunter (dunkles bg, Border)
- 2-Spalten-Grid (`md:grid-cols-2`)
- Letztes Element (5. Karte) automatisch `md:col-span-2` full-width mit `aspect-[5/2]`
- Kein Gradient-Overlay mehr

#### Section 5 — From the Archive (neu: Vertical Cards)
- Vorher: Horizontale Karte, fixes `w-48 aspect-square` Thumbnail links (192px)
- Jetzt: Bild oben, volle Kartenbreite, `aspect-[4/3]` (~580px auf Desktop)
- Bildgröße: 3× größer als vorher
- Text-Block darunter mit Gold-Badge, Serif-Titel, Beschreibung, optionalem Link
- 2-Spalten-Grid bleibt

#### Section 6 — Listening Room (neu: Asymmetrisch)
- Grid: `grid-cols-1 md:grid-cols-[1fr_1.2fr]` — mehr Platz für das Bild
- Bild-Seitenverhältnis: `4/3` → `3/2` (etwas breiter, mehr Atmung)
- `sizes` auf `60vw` erhöht

---

### 2026-04-07 — Prio 1/2/3 Fix Session: 14 Fixes (Bugs, UX, Visual Polish)

#### Newsletter Confirmation URL Fix (Prio 1.1) — `backend/src/api/store/newsletter/route.ts`
- **Problem:** `BACKEND_URL` was hardcoded as `process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"`. `MEDUSA_BACKEND_URL` was not set in the backend `.env`, so the confirmation link in newsletter emails pointed to `http://localhost:9000/store/newsletter/confirm?...` instead of `https://api.vod-auctions.com/...`.
- **Fix:** Changed fallback chain to `process.env.BACKEND_URL ?? process.env.MEDUSA_BACKEND_URL ?? "https://api.vod-auctions.com"`. Add `BACKEND_URL=https://api.vod-auctions.com` to backend `.env` on VPS.

#### Price Ascending Sort Fix (Prio 1.2) — `storefront/src/components/BlockItemsGrid.tsx`
- **Problem:** `price_asc` / `price_desc` sort was comparing `a.start_price` instead of the live `current_price`. For active lots with bids, the starting price is stale — the current price should be used.
- **Fix:** Sort now uses `Number(a.current_price) || Number(a.start_price)` — falls back to `start_price` for lots without bids.

#### Country Filter: Text Input → Dropdown (Prio 2.1) — `storefront/src/components/CatalogClient.tsx`
- Replaced `<Input>` text field with `<select>` dropdown offering 19 common countries + "Other", styled to match existing filter selects (`h-8 rounded-md border border-primary/25 bg-input`).

#### Safari Number Input Spinners Removed (Prio 2.2) — `storefront/src/app/globals.css`
- Added CSS rules to suppress native spinner arrows on `input[type="number"]` elements in Safari/WebKit and Firefox.

#### Back Button on Catalog Detail Page (Prio 2.3) — `storefront/src/app/catalog/[id]/page.tsx`
- Added a ghost "← Back" button above the breadcrumb nav using the existing `CatalogBackLink` client component (preserves catalog filter state via sessionStorage). Styled as `variant="ghost" size="sm"` with `ArrowLeft` icon.

#### Footer Restructure (Prio 2.5 + 2.6 + 3.7) — `storefront/src/components/layout/Footer.tsx`
- **Removed "Navigation" column** (links to Home, Auctions, Catalog, About, Contact).
- **Added "Contact" column** with mailto link (`shop@vod-records.com`), opening hours (Mon–Fri 10:00–18:00), and "Open in Maps" link (`https://maps.google.com/?q=Eugenstrasse+57,+Friedrichshafen,+Germany`).
- **Removed Instagram icon** — no URL available; the `<a href="#">` placeholder was removed entirely.
- Cleaned up unused `Mail` and `Instagram` imports from lucide-react.

#### Format Tags: Overlay → Card Body (Prio 3.3) — `BlockItemsGrid.tsx` + `CatalogClient.tsx`
- **BlockItemsGrid:** Removed absolute-positioned format overlay (`absolute top-2 right-2`) from both preview-mode and normal-mode cards. Format now appears as a small inline text tag (`text-[9px] uppercase tracking-[1px]`) at the top of the card info section, below the image, with the same color from `FORMAT_COLORS`.
- **CatalogClient:** Removed the `<Badge>` overlay from the image container. Format now appears as a small inline text span below the image, before the artist/title text.

#### Pulse Animation Toned Down (Prio 3.1) — `storefront/src/app/globals.css`
- Added custom `@keyframes pulse` override: opacity animates from 1 to **0.6** (was Tailwind default 0.0–1.0 cycle), duration **2s** (was 1s). Less aggressive blinking for "Highest Bid" and countdown indicators.

#### User Avatar: Name Text Removed, Saved Badge Gold (Prio 3.5) — `HeaderAuth.tsx` + `Header.tsx`
- **HeaderAuth.tsx:** Removed `<span>` with `displayName` text from the dropdown trigger — avatar circle only. Also removed the now-unused `displayName` variable.
- **Header.tsx:** Changed saved-items count badge from `bg-rose-500 text-white` to `bg-[#d4a54a] text-[#1c1915]` (gold, matching brand primary color).

#### Gallery Quote Text (Prio 3.6) — `storefront/src/app/gallery/page.tsx`
- Changed closing section link text from "Browse the full catalogue →" to "Explore the archive →".

#### Card Footer Text Readability (Prio 3.4) — `storefront/src/components/BlockItemsGrid.tsx`
- Increased opacity of low-contrast card footer text from `/40` to `/70` for two elements: "Starting bid" label and view count text.

---

### 2026-04-06 — Bug-Fix Session: 7 Fixes (Rendering, Bidding, Webhooks, UX)

#### Stripe Webhook: charge.refunded Handler (Backend)
- **Problem:** Refund über Stripe-Dashboard (außerhalb VOD-Admin) setzte `auction_status` nie zurück → Release blieb als "Sold" im Catalog.
- **Fix:** `case "charge.refunded"` in `webhooks/stripe/route.ts` — findet Transaction via `stripe_payment_intent_id`, setzt alle Transactions der Order-Group auf `refunded`, setzt `Release.auction_status = "available"`, schreibt Audit-Event.
- **PayPal war bereits korrekt:** `PAYMENT.CAPTURE.REFUNDED` Handler existierte schon.
- **DB-Fix:** Release `legacy-release-28352` ("Das Spiel") manuell via Supabase auf `available` zurückgesetzt.
- **Stripe Dashboard:** `charge.refunded` Event im Webhook-Endpoint aktiviert.

#### Catalog Mobile: All Items / For Sale Toggle (`CatalogClient.tsx`)
- **Problem:** Toggle war im horizontalen Scroll-Container mit `ml-auto` — auf Mobile nicht sichtbar.
- **Fix:** Toggle auf Mobile (`< sm`) als eigene Zeile oberhalb der Kategorie-Pills; Desktop unverändert (`sm+` inline).

#### FOUC Fix: html background-color (`globals.css`)
- **Problem:** Beim Seitenwechsel (Next.js App Router) flackerte die Seite weiß, weil `html` keine Hintergrundfarbe hatte — nur `body` hatte `bg-background`.
- **Fix:** `html { background-color: #1c1915; }` in `globals.css`.

#### Bid Form: 4 Bugs behoben (`ItemBidSection.tsx`)
- **Bug 1 — Amount-Reset:** `useEffect` setzte `suggestedBidUsed.current = true` nicht im `else if` Branch → jede Realtime-Preis-Änderung überschrieb User-Eingabe mit Minimum. Fix: functional `setAmount(prev => ...)` + korrektes Flag-Setzen auf first-init.
- **Bug 2 — Modal €0.00:** Konsequenz aus Bug 1 (amount wurde zurückgesetzt bevor Modal öffnete). Behoben durch Bug-1-Fix.
- **Bug 3 — Native Validation Blocker:** Browser-native `min` Attribut auf `<input type="number">` blockierte Form-Submit-Event mit "must be >= 3.51" Bubble. Fix: `min` Attribut entfernt, `<form onSubmit>` → `<div>`, `type="submit"` → `type="button" onClick`, manuelle Validierung per Toast.
- **Bug 4 — Layout-Shift bei Proxy-Toggle:** `space-y-3` + AnimatePresence height-animation → Container sprang sofort. Fix: `flex flex-col gap-3` + `AnimatePresence initial={false}` + explizite `transition={{ duration: 0.2 }}`.

#### Z-Index Hover (`BlockItemsGrid.tsx`)
- **Problem:** Gehoverter Lot-Karte erschien hinter Nachbar-Karte — Framer Motion Stagger-Animationen erstellen Stacking Contexts ohne z-index.
- **Fix:** `className="relative hover:z-10"` auf `motion.div` Wrapper jeder Lot-Karte.

#### Account Skeleton (`account/loading.tsx` + `account/cart/page.tsx`)
- **Problem:** `account/loading.tsx` zeigte 5 Overview-Dashboard-Kacheln für ALLE `/account/*` Route-Transitions (cart, bids, saved etc.) → falsche Größe + Layout.
- **Fix loading.tsx:** Ersetzt durch 3 generische Skeleton-Rows (neutral für alle Sub-Pages).
- **Fix Cart-Skeleton:** Von 2× `h-24` Full-Width-Blöcken zu Layout-passendem Skeleton: 64px Bild + Text-Linien + Preis-Block (matcht `Card p-4 flex gap-4`).

---

### 2026-04-05 — Admin Mobile Overflow: Deep Fix (Medusa DOM + Deploy Bug)

#### Root Cause Discovery
- **Deploy Bug:** `cp -r .medusa/server/public/admin public/admin` ohne vorheriges `rm -rf public/admin` legt den neuen Bundle als *Unterverzeichnis* `public/admin/admin/` ab — der Server bediente weiter die alten Dateien aus `public/admin/assets/`. Alle vorherigen Fix-Runden waren damit wirkungslos.
- **Fix dokumentiert** in CLAUDE.md: `rm -rf public/admin && cp -r .medusa/server/public/admin public/admin # PFLICHT!`

#### CSS Fix — `admin-nav.tsx` `injectNavCSS()`
- **Root cause (CSS):** Medusa's `<main>` nutzt `items-center` in `flex-col`. Flex-Children haben `min-width: auto` — ein breiter Tabellen-Inhalt zwingt den Page-Root-Div auf eine Breite > Gutter. `items-center` zentriert dann diesen überbreiten Div, wodurch der linke Rand im negativen x-Bereich landet (nicht scrollbar, permanent unsichtbar).
- **Neue CSS-Regeln:**
  - `main { align-items: flex-start !important; overflow-x: hidden !important; }`
  - `main > * { max-width: 100% !important; width: 100% !important; min-width: 0 !important; }` (Gutter)
  - `main > * > * { min-width: 0 !important; overflow-x: hidden !important; box-sizing: border-box !important; }` (Page-Root-Divs)
- **JS `fixMobileScrollContainers()`**: Setzt `align-items: flex-start` direkt als Inline-Style auf `<main>` + läuft alle DOM-Ancestors bis `<body>` durch und setzt `overflow-x: hidden`, `overscroll-behavior-x: none`, `scrollLeft = 0`.

#### Per-Page Root Div Fix (7 Dateien)
- `minWidth: 0, width: "100%", overflowX: "hidden", boxSizing: "border-box"` in:
  - `media/page.tsx`, `crm/page.tsx`, `entity-content/page.tsx`, `musicians/page.tsx`, `sync/page.tsx` (2×), `media/[id]/page.tsx` (3×)

---

### 2026-04-04 — Admin Mobile Overflow Fix (5 Pages)

- **Problem:** Admin-Seiten auf Mobile zeigten horizontalen Overflow — Header-Rows mit `justify-between` ohne `flex-wrap` schoben Buttons aus dem Viewport.
- **`auction-blocks/page.tsx`**: `flex-wrap gap-3` auf Header-Row.
- **`auction-blocks/[id]/page.tsx`**: `flex-wrap` auf Header + Button-Group (Send Newsletter, Storefront, Back, Save).
- **`crm/page.tsx`**: `flexWrap: "wrap"` auf Search+Buttons-Row.
- **`transactions/page.tsx`**: `flexWrap: "wrap", gap: 12` auf Header-Row.
- **`media/page.tsx`**: `flexWrap: "wrap", gap: "12px"` auf Header-Row.

---

### 2026-04-03 — PressOrga Subtitle + Category-Aware Context überall

#### PressOrga JOIN + Subtitle vollständig
- **Root Cause:** `press_literature` (6.326 Items) hatte 0 Labels/Artists verknüpft — aber alle haben `pressOrgaId` → `PressOrga`-Tabelle (1.983 Einträge, Magazinnamen wie "391", "Abstract Magazine" etc.).
- **Backend** `catalog/route.ts` + `catalog/[id]/route.ts` + `auction-blocks/[slug]/route.ts` + `items/[itemId]/route.ts`: LEFT JOIN auf `PressOrga` → `press_orga_name` + `press_orga_slug`.
- **Storefront:** Category-aware `contextName`/`contextHref` in allen 6 Anzeigebereichen:
  - `release` + `band_literature` → `artist_name` / `/band/:slug`
  - `label_literature` → `label_name` / `/label/:slug`
  - `press_literature` → `press_orga_name` / `/press/:slug`
- **Dateien:** `BlockItemsGrid.tsx`, `CatalogClient.tsx`, `CatalogRelatedSection.tsx`, `RelatedSection.tsx`, `catalog/[id]/page.tsx`, `auctions/[slug]/[itemId]/page.tsx`, `label/[slug]/page.tsx`
- **"Unknown" vollständig entfernt** aus allen Subtitle-Bereichen.

---

### 2026-04-03 — Mag/Lit/Photo Subtitle Logic, Bid UX Fixes, Security

#### Mag/Lit/Photo Subtitle Logic
- **`BlockItemsGrid.tsx`**: Karten-Untertitel zeigt `label_name` für `band_literature`/`label_literature`/`press_literature`. Releases weiterhin `artist_name`.
- **`auctions/[slug]/[itemId]/page.tsx`**: Breadcrumb, Subtitle-Link, ShareButton-Titel, JSON-LD-Name — alle nutzen jetzt `contextName` (category-aware: `label_name` für Nicht-Release, `artist_name` für Release). Link zeigt zu `/label/:slug` statt `/band/:slug` für Lit/Press.
- **Backend** `store/auction-blocks/[slug]/route.ts` + `items/[itemId]/route.ts`: `Release.product_category` zum SELECT ergänzt.

#### Bid UX Fixes
- **Proxy-Bid Erhöhung möglich**: Bereits Höchstbietende können jetzt ihr Gebot manuell erhöhen. Backend akzeptiert `amount` als neues Maximum wenn kein `max_amount` gesendet wird. Response: `max_updated: true` + `new_max_amount`.
- **Outbid-Toast verbessert**: Bei Proxy-Block klarer Fehler mit aktuellem Preis: "A proxy bid was already higher. Current bid: €X.XX".
- **Max-Bid-Updated-Toast**: "Maximum bid raised to €X.XX — You remain the highest bidder."

#### Mobile/Nav UX
- **Horizontal Scroll Fix**: `overflow-x: hidden` auf `html`+`body` in `globals.css` + Admin `injectNavCSS()`.
- **My Bids Count**: Mobile Nav zeigt "My Bids (N)" wenn N > 0. Neues Feld `active_bids_count` in `/store/account/status`.
- **Sticky "Auction ended" Bar entfernt**: Footer nur noch bei tatsächlicher Bid-Action (`isBlockPreview || active+open`).

---

### 2026-04-03 — SEO Phase 1+2, Rudderstack Tracking, UX Fixes, Security

#### Rudderstack: rudderIdentify + Item Unsaved Event
- **`AuthProvider.tsx`**: `rudderIdentify(id, { email })` auf Mount (token restore), nach Login, nach Register.
- **`SaveForLaterButton.tsx`**: `rudderTrack("Item Unsaved", { release_id })` auf erfolgreichem DELETE.

#### 4 UX Kleinigkeiten
- **Facebook-Link:** `#` → `https://www.facebook.com/vinylondemandrecords` im Footer.
- **Discogs-Link** aus Footer entfernt (kein Angebot mehr).
- **Outbid-Email:** Preistabelle (yourBid/currentBid/suggestedBid) entfernt. CTA "Bid Now" statt "Bid €X.XX Now" — Preise können sich vor Klick ändern.
- **Sticky Mobile CTA auf beendeten Lots**: War immer sichtbar, zeigte "Auction ended" nutzlos. Jetzt: nur anzeigen wenn `isBlockPreview || (block.status === "active" && item.status === "open")`.

#### SEO Phase 1+2 — Canonicals, OG, JSON-LD, Robots
- **Canonical URLs** auf allen dynamischen Seiten: `catalog/[id]`, `auctions/[slug]`, `auctions/[slug]/[itemId]`, `band/[slug]`, `label/[slug]`, `press/[slug]`.
- **OG-Images**: `band/[slug]`, `label/[slug]`, `press/[slug]` — erste verfügbare Cover-URL als `og:image` + Twitter Card `summary_large_image`.
- **JSON-LD Event Schema** auf Auction-Block-Seite: `@type: Event`, name/description/url/image/startDate/endDate/eventStatus/organizer/AggregateOffer.
- **JSON-LD MusicGroup Schema** auf Band-Seiten: name/description/url/image/genre/sameAs.
- **sr-only H1** auf Catalog-Seite: kontextuell je nach Filter/Suche/Kategorie.
- **Noindex auf Gate-Seite**: `gate/layout.tsx` (NEU, Server Component) → `robots: { index: false }`.
- **Alt-Texte**: `ImageGallery.tsx` Thumbnails — `""` → `"${title} — image ${i+1}"`. `BlockItemsGrid.tsx` — `""` → `"Auction lot ${lot_number}"`.

#### Admin Password Reset Fix
- **`backend/src/subscribers/password-reset.ts`**: Subscriber hatte frühes `return` für `actor_type !== "customer"` → Admin-User-Reset wurde still ignoriert. Neuer `else if (actor_type === "user")` Branch mit `adminResetUrl` → `admin.vod-auctions.com/app/reset-password?token=...&email=...`.

#### Adressen Klarstellung
- **Gallery:** `Eugenstrasse 57/2` (via Supabase `content_block` UPDATE).
- **VOD Records (Impressum, AGB, Datenschutz, Widerruf, Invoice, Shipping Label):** Alpenstrasse 25/1 (zurückgesetzt).

#### PostgreSQL Security Fix
- `listen_addresses = 'localhost'` in `/etc/postgresql/16/main/postgresql.conf` — Port 5432 nur noch auf Loopback erreichbar, nicht mehr öffentlich. `systemctl restart postgresql`. Hostinger-Warning damit behoben.

#### Mobile Horizontal Scroll Fix
- `overflow-x: hidden` auf `html` + `body` in `storefront/src/app/globals.css`.
- Gleiches CSS via `injectNavCSS()` in `admin-nav.tsx` injiziert → greift auf allen Admin-Seiten.

#### My Bids Count im Mobile Nav
- **`/store/account/status`**: Neues Feld `active_bids_count` — COUNT aller Bids auf Blöcken mit `status IN (active, preview)`.
- **`AuthProvider.tsx`**: `bidsCount` State aus `active_bids_count`.
- **`MobileNav.tsx`**: "My Bids" → "My Bids (N)" wenn N > 0, analog zu "Saved (2)".

---

### 2026-04-02 — Bugfixes Fehler 8–13: Format Badge, CRM Staleness, Bid Email, Countdown, Translate

#### Format Badge Fix (Fehler 10) — Lot Detail Page

- **Root Cause:** `Release.format` ist ein Legacy-Rohstring ("LP") statt der echten Format-Bezeichnung aus der `Format`-Tabelle.
- **Backend** `store/auction-blocks/[slug]/items/[itemId]/route.ts`: `Format.name as format_name` via LEFT JOIN zu `Format`-Tabelle ergänzt.
- **Storefront** `auctions/[slug]/[itemId]/page.tsx`: Hilfsfunktionen `formatLabel()` + `formatColorKey()` — nutzen `format_name` wenn vorhanden, Fallback auf `format`. "Vinyl-7"" statt "LP" korrekt angezeigt.

#### CRM Drawer KPI Staleness Fix (Fehler 9)

- **Root Cause:** CRM-Listenview zeigte 0 Bids für aktive Bidder weil `customer_stats` nur stündlich per Cron aktualisiert wird.
- **`admin/routes/crm/page.tsx`**: KPI-Karten (Purchases/Bids/Wins) nutzen jetzt live `data`-Counts wenn Drawer offen ist, statt gecachte `customer_stats`-Werte.
- **Auto-Recalc on Mount**: Seite ruft beim Laden automatisch `POST /admin/customers/recalc-stats` im Hintergrund auf und refreshed die Liste bei Erfolg — kein manueller Klick nötig.

#### Bid Confirmation Email (Fehler 11 Teil 1)

- **`backend/src/emails/bid-placed.ts`** (NEU): Grüne "You are the highest bidder" Bestätigungs-E-Mail. Subject: `Bid confirmed — Lot #XX: €X.XX`. Cover-Bild, Lot-Details, Lot-Link.
- **`backend/src/lib/email-helpers.ts`**: `sendBidPlacedEmail()` ergänzt.
- **`backend/src/api/store/auction-blocks/[slug]/items/[itemId]/bids/route.ts`**: Ruft `sendBidPlacedEmail()` nach erfolgreichem Winning-Bid auf.
- **Admin Email Preview** (`/app/emails`): `bid-placed` zu TEMPLATES-Array + POST-Switch + `renderTemplate`-Switch in `[id]/route.ts` ergänzt. Cover-Bild (`DEMO_COVER`) für alle Item-bezogenen E-Mail-Templates hinzugefügt.

#### Lot Page Winning Indicator (Fehler 11 Teil 2) — `ItemBidSection.tsx`

- **Root Cause:** Öffentliche Bids-API anonymisiert `user_id` — eigener Bid nicht identifizierbar.
- **Fix:** `GET /store/account/bids` (auth) auf Mount — gleiche Logik wie `BlockItemsGrid`. `userIsWinning: boolean | null` State. `onBidResult` Callback in `BidForm` ruft `setUserIsWinning(won)` auf.
- Realtime: wenn fremdes Winning-Bid eintrifft → `setUserIsWinning(false)` (Outbid-Anzeige).
- Banner: "You are the highest bidder" (grün) oder "You have been outbid" (orange) unterhalb der Bid-Form.

#### Saved Items Bid Status (Fehler 12)

- **`storefront/src/app/account/saved/page.tsx`**: `fetchBidStatus()` ruft `GET /store/account/bids` auf, baut Map `block_item_id → { is_winning, amount }`. Badge unter Titel: "Highest bid · €X.XX" (grün) oder "Outbid · €X.XX" (orange).

#### Countdown Seconds Fix (Fehler 13)

- Sekunden werden jetzt erst angezeigt wenn < 60 Minuten verbleiben. Vorher immer sichtbar.
- **4 Dateien** angepasst: `ItemBidSection.tsx`, `auctions/[slug]/page.tsx`, `BlockItemsGrid.tsx`, `PreviewCountdown.tsx`.

#### Address Update

- Adresse "Alpenstrasse 25/1" → "Eugenstrasse 57/2" in allen 5 rechtlichen Seiten: Impressum, Datenschutz, AGB, Widerruf, Gallery.

#### Disable Browser Auto-Translate

- `translate="no"` auf `<html>` + `<meta name="google" content="notranslate">` im Root Layout.
- Verhindert Chrome/Android-Übersetzung von Bandnamen und Eigennamen (z.B. "Pulsating Grain" → "Pochender Körner").

---

### 2026-04-01 — Bugfixes Fehler 1–7: Live Bidding, Tracklist, Saved Items, CRM Stats

#### Live Bidding Fixes (Fehler 1–6) — `storefront/src/components/ItemBidSection.tsx`

- **Fehler 1 — `isActive` nie true:** DB speichert `"open"` für aktive Lots, Code prüfte `=== "active"`. Fix: reaktiver State `liveItemStatus` + Guard `liveItemStatus === "active" || liveItemStatus === "open"`. Auch `liveBlockStatus` als reaktiver State.
- **Fehler 2 — Stale ISR-Props:** Next.js ISR-gecachte Props (revalidate: 30s) können veraltet sein. Mount-fetch gegen `/store/auction-blocks/:slug/items/:itemId` aktualisiert `currentPrice`, `bidCount`, `lotEndTime`, `liveBlockStatus`, `liveItemStatus` mit Live-Daten.
- **Fehler 3 — HTML-Tags in Description sichtbar:** `release.description` enthält rohes Discogs-HTML. Inline-Strip in `auctions/[slug]/[itemId]/page.tsx`: `<br>` → `\n`, alle Tags entfernt, HTML-Entities dekodiert, Whitespace normalisiert. Guard: Description-Sektion nur sichtbar wenn kein Tracklist + keine Credits (Discogs-Daten kommen aus demselben Feld).
- **Fehler 4 — Bid silent bei "Already Highest Bidder":** `toast.error(msg, { duration: 8000 })` + Hint-Description "Use 'Set maximum bid'..." wenn already-winning-Pattern in Fehlermeldung erkannt.
- **Fehler 5 — Toast-Duration zu kurz:** Alle Success/Warning-Toasts auf `duration: 6000`, Errors auf `duration: 8000`.
- **Fehler 6 — Saved Items → falscher Link:** `/account/saved` verlinkte immer auf `/catalog/:release_id` auch wenn das Item in einer aktiven Auktion war. Fix: `GET /store/account/saved` joinent `block_item` (status: open/active) + `auction_block` (status: active/preview/scheduled). `SavedItem`-Typ um `block_item_id` + `block_slug` erweitert. Link-Logik: `/auctions/:slug/:itemId` wenn Lot vorhanden, sonst `/catalog/:id` als Fallback.

#### Tracklist Parser Fixes — `storefront/src/lib/utils.ts`

- **`POSITION_RE` erweitert:** `/^[A-Z]?\d{1,2}\.?$/` → `/^([A-Z]{1,2}\d{0,2}|\d{1,2})\.?$/`. Neu: single-letter Vinyl-Seiten (A/B), Doppelbuchstaben (AA/BB), Seitenvarianten (A1/B2), rein numerische Positionen (1/12) — alle korrekt erkannt.
- **Minimum-Threshold 3→2:** `extractTracklistFromText` gab bei < 3 Tracks `remainingCredits: raw` zurück. Gesenkt auf < 2 — 7"-Singles mit exakt 2 Tracks werden jetzt als Tracklist erkannt.
- **`alreadyStructured`-Bail-out entfernt:** `parseUnstructuredTracklist` bail-outed wenn irgendein JSONB-Eintrag `position + title` hatte (z.B. `{position:"I", title:"Confess"}` von Discogs-Seiten-Bezeichnung). Das verhinderte das Parsing komplett. Prüfung entfernt.
- **Testfall:** 7"-Single "I Confess / Softness" zeigte "SIDE I / Confess" als flache Liste. Zeigt jetzt: `A / I Confess / 3:11`, `B / Softness / 2:08`.

#### Collapsible Block Description — `storefront/src/components/CollapsibleDescription.tsx` (NEU)

- `long_description` auf Auction-Block-Seite war immer vollständig ausgeklappt → Nutzer musste weit scrollen bis zu den Lots.
- Neuer Client-Component `CollapsibleDescription`: zeigt max. 3 Zeilen (`-webkit-line-clamp: 3`), "Show more / Show less" Chevron-Toggle. Automatische Erkennung ob Collapse nötig (> 300 Zeichen oder mehrere Absätze).
- Ersetzt inline-`prose`-Block in `storefront/src/app/auctions/[slug]/page.tsx`.

#### CRM Bids-Counter Fix (Fehler 7) — `customer_stats` + Admin CRM

- **Root Cause:** `customer_stats`-Tabelle wird nur stündlich via Cron (`customer-stats-recalc.ts`) aktualisiert. Kunden mit frisch platzierten Bids zeigten 0 in der CRM-Liste bis zum nächsten Cron-Lauf.
- **`POST /admin/customers/recalc-stats`** (NEU, `backend/src/api/admin/customers/recalc-stats/route.ts`) — Führt sofortigen Full-UPSERT aller Customer-Stats aus live `bid`- + `transaction`-Tabellen aus. Identische Logik wie der Cron-Job.
- **"↻ Recalc Stats" Button** in `admin/routes/crm/page.tsx` — Neben "Export CSV". Zeigt "Recalculating…" während Fetch, refreshed die Tabelle automatisch bei Erfolg.

### 2026-03-31 — E2E Test Suite Stabilisierung + Storefront OOM-Fix

#### Playwright Test Suite: 66 passed, 3 skipped, 0 failed
- **`tests/helpers/auction-setup.ts`** (NEU) — Wiederverwendbarer Helper für E2E-Tests: erstellt einen vollständig aktiven Auktionsblock via Admin-API (draft → scheduled → active, Items aktivieren) und räumt ihn danach via Lifecycle-Job auf. Fallback auf Hardcoded Release-IDs wenn Catalog-API nicht antwortet.
- **`tests/05-auction-browse.spec.ts`** — `beforeAll`/`afterAll` mit eigenem Testblock. ISR-Cache-Problem behoben: Tests navigieren direkt zu `testBlock.slug` statt aktive Blöcke auf `/auctions` zu suchen.
- **`tests/06-bidding.spec.ts`** — React-Hydration-Race behoben via `waitForTimeout(2s)` nach `networkidle`. Bid-Section ist Client-Component, hydratisiert asynchron → `isVisible()` lieferte false obwohl Elemente sichtbar waren.

#### Storefront OOM Restart-Loop behoben (5.687 → 0 Restarts)
- **Root Cause:** PM2 `max_memory_restart: 300MB` — Next.js mit ISR + 41k-Katalog + Sentry-SDK überschreitet diese Grenze regelmäßig. PM2 killt den Prozess, startet sofort neu → Dauerschleife.
- **`ecosystem.config.js`** (NEU) — Zentrale PM2-Konfiguration für Backend + Storefront: `max_memory_restart: 600MB`, `node_args: --max-old-space-size=512`.
- **`storefront/next.config.ts`** — `outputFileTracingRoot: path.join(__dirname, "../")` hinzugefügt. Behebt Next.js workspace-root Warning, das bei jedem Restart in `error.log` geschrieben wurde.

### 2026-03-29 — CRM User Management + Rudderstack Integration

#### CRM: Vollständiges User-Management-Backend

**DB Migration (`Migration20260401000000.ts`)**
- Neue Tabelle `customer_note` (id, customer_id, body, author_email, created_at, deleted_at)
- Neue Tabelle `customer_audit_log` (id, customer_id, action, details JSONB, admin_email, created_at)
- `customer_stats` erweitert: brevo_contact_id, brevo_synced_at, blocked_at, blocked_reason

**Neue Backend-Endpunkte (`/admin/customers/[id]/`)**
- `PATCH [id]` — Stammdaten bearbeiten (name, email, phone, tags, is_vip, is_dormant). E-Mail-Uniqueness-Check + auth_identity-Update (best-effort).
- `notes/` — GET/POST (erstellen) + `notes/[noteId]/` DELETE (soft-delete). Autor aus auth_context.
- `timeline/` — Unified Event-Feed aus bid, transaction, customer_note, customer. LEFT JOIN Release für Titel. Sortiert DESC, max 100.
- `block/` + `unblock/` — Account sperren/entsperren via `customer.deleted_at`.
- `brevo-sync/` — Manueller Brevo-Push via crmSyncRegistration.
- `password-reset/` — Placeholder (safe, kein Crash).
- `anonymize/` — DSGVO-Anonymisierung: PII ersetzen + customer_address anonymisieren + customer_audit_log Eintrag.
- `gdpr-export/` — Admin-seitiger GDPR-Datenexport (Content-Disposition JSON-Download).
- `addresses/` — GET (saved addresses aus customer_address) + POST (neue Adresse anlegen).
- `delete/` — Hard-Delete: user_id in transactions auf NULL, cascade delete customer_stats/notes/addresses/customer. Brevo-Löschung (best-effort).
- `export/` — CSV-Export aller Kunden mit Stats, BOM für Excel, 13 Spalten.

**Neue Endpunkte (`/admin/customer-addresses/`)**
- `[addressId]/` — PATCH (Adresse bearbeiten) + DELETE (soft-delete).

**CRM Admin-UI (`admin/routes/crm/page.tsx`) — vollständig erweitert**
- **Overview-Tab:** Inline Edit-Form (Name/E-Mail/Telefon), Tags-CRUD (Chips + Dropdown + Custom Input), VIP/Dormant-Toggles, Password-Reset-Button, Brevo-Sync-Status + "Sync Now" Button, Saved-Addresses-Section (Edit/Delete/Add Inline-Forms), Danger Zone (Anonymize + Admin GDPR Export + Delete Contact).
- **Notes-Tab** (neu, 4. Tab): Notizen-Liste mit Author + Datum, Textarea + "Add Note", Delete mit Confirm.
- **Timeline-Tab** (neu, 5. Tab): Chronologischer Event-Feed mit Typ-Icons (💰🔨🏆📦📝👤).
- **Block/Unblock:** Button im Drawer-Header, "Blocked"-Badge bei gesperrten Accounts.
- **Export CSV:** Button im Customers-Tab-Header (`window.open`).
- Neue Typen: `CustomerNote`, `TimelineEvent`, `SavedAddress`.

#### Rudderstack Integration (P1.5)

**Backend (`backend/src/lib/rudderstack.ts`)** — neu
- `rudderTrack(userId, event, properties)` + `rudderIdentify(userId, traits)`.
- Graceful degradation: no-op wenn RUDDERSTACK_WRITE_KEY/DATA_PLANE_URL fehlen oder SDK nicht installiert.
- `require()` statt `import` für optionale Abhängigkeit.

**`backend/src/lib/crm-sync.ts`** — erweitert
- Alle 5 CRM-Sync-Funktionen rufen zusätzlich `rudderTrack()` auf (Brevo-Calls unverändert):
  - `crmSyncRegistration` → `Customer Registered` + `rudderIdentify`
  - Bid Placed → `Bid Placed`
  - Auction Won → `Auction Won`
  - Payment Completed → `Payment Completed`
  - Order Shipped → `Order Shipped`

**Storefront (`storefront/src/lib/rudderstack.ts`)** — neu
- Browser-SDK-Helpers: `rudderTrack`, `rudderPage`, `rudderIdentify` (no-op wenn nicht initialisiert).

**`storefront/src/components/RudderstackProvider.tsx`** — neu
- CDN Script-Tag Initialisierung + automatisches `page()` auf Route-Change via `usePathname`.

**Tracking-Events in Storefront:**
- `ItemBidSection.tsx` → `Bid Submitted` bei erfolgreichem Gebot
- `SaveForLaterButton.tsx` → `Item Saved` beim Speichern
- `checkout/page.tsx` → `Checkout Started` + `Checkout Completed` (alle 3 Payment-Paths)

**Setup:**
- Rudderstack Cloud Data Plane: `https://secklerrovofrz.dataplane.rudderstack.com`
- SDK installiert: `@rudderstack/rudder-sdk-node@3.0.3`
- Env Vars gesetzt in backend/.env + storefront/.env.local (VPS)
- Doku: `docs/architecture/RUDDERSTACK_SETUP.md`

**Commits:** `4e13966` · `f84d651`

---

### 2026-03-30 — Orders: Mark Refunded Action + UI Fixes (RSE-269 follow-up)

**Backend (`api/admin/transactions/[id]/route.ts`)**
- Neue Action `mark_refunded`: Setzt `status = refunded` in der DB ohne Stripe/PayPal API aufzurufen. Iteriert alle Transaktionen der `order_group_id`. Setzt `auction_status = available` auf verknüpftem Release. Schreibt `order_event` Audit-Entry "Marked as refunded (manual)".
- Abgesichert: gibt 400 zurück wenn `status` bereits `refunded`.

**Validation (`lib/validation.ts`)**
- `UpdateTransactionSchema.action` Zod-Enum: `mark_refunded` hinzugefügt. Vorher: Request schlug mit "Validation failed" fehl.

**Orders UI (`admin/routes/transactions/page.tsx`)**
- Neue Funktion `markRefunded()` — ruft `action: "mark_refunded"` auf.
- Lila "Mark ✓" Button neben rotem "Refund" Button für alle `status=paid` Transaktionen.
- **Layout-Fix:** Alle Action-Buttons als `<span>` statt `<button>` → umgeht Medusa globales `button { min-height }` CSS. Buttons in vertikalem Stack: Ship oben, Refund + Mark ✓ unten nebeneinander. `whiteSpace: nowrap` + `lineHeight: 18px`.

**Dashboard (`admin/routes/dashboard/page.tsx`)**
- "Cancel Order" Button in Overdue Payment Cards (ACTION REQUIRED). Ruft `action: "cancel"` auf. Entfernt Transaction sofort aus Queue via State-Update. Für Fälle wo Payment-Reminder Cron nicht läuft.

**Commits:** `8c96247` · `68ceb84` · `c3e3fad` · `b552c1b`

---

### 2026-03-30 — E2E Test Suite: Neue Admin-Route Coverage

**`tests/10-admin.spec.ts` — 5 neue Smoke-Tests**
- `admin dashboard route accessible` → `/app/dashboard`
- `admin ai-assistant route accessible` → `/app/ai-assistant`
- `admin catalog hub route accessible` → `/app/catalog`
- `admin marketing hub route accessible` → `/app/marketing`
- `admin operations hub route accessible` → `/app/operations`

Alle Tests folgen dem bestehenden Login-then-Navigate-Muster. Bestehende Tests bleiben valide (`/app/transactions`, `/app/auction-blocks`, `/app/live-monitor` existieren weiterhin — Sidebar-Umbenennung "Transactions" → "Orders" betrifft nur den Label, nicht die Route-URL).

**`backend/src/admin/routes/test-runner/page.tsx`**
- Subtitle-Counter aktualisiert: "64 tests" → "69 tests across 10 spec files"

---

### 2026-03-29 — Admin UX Overhaul: Task-Oriented Layout + Orders Redesign (RSE-269)

**Ended-State Task Dashboard (`auction-blocks/[id]/page.tsx`)**
- Block-Detailseite bei `status=ended` zeigt statt Edit-Form einen Task-Dashboard.
- **NEXT STEPS** — 4 Schritt-Cards: (1) Winner Emails (✓ Sent automatically), (2) Payments (paid/total · X pending · X refunded), (3) Pack & Ship (shipped/paid), (4) Archive Block (Button wenn alles shipped).
- Payments-Step unterscheidet jetzt korrekt `pending` vs. `refunded` — refunded wird lila angezeigt, nicht als "Awaiting Payment".
- Won/No Bid Tab-Toggle in der Lots-Tabelle. Lot-Zeilen klickbar → `/app/transactions/{tx.id}`.
- **Relist-Modal** für No-Bid-Lots: 3 Optionen (bestehender Draft-Block / neuer Scheduled-Block / Make Available direkt).
- Analytics-Tab + Edit-Form als aufklappbare Accordion-Sektionen (versteckt by default — Fokus liegt auf Aufgaben).
- **Breadcrumb** `← Auction Blocks › [Block Title]` oben links, identisches Styling wie Orders-Seite.

**Auction Blocks Liste (`auction-blocks/page.tsx`) — komplett neu**
- Ended-Blöcke als prominente **EndedBlockCard** mit farbigem linken Rand (rot=unpaid, amber=packing, grün=done).
- Live-Task-Badges pro Karte: `⚠ X unpaid` (rot), `X refunded` (lila), `📦 X to pack/ship` (amber), `X no bid` (grau), `✓ X shipped` (blau).
- Section-Header mit pulsierendem rotem Punkt wenn urgentCount > 0.
- Reihenfolge: **Needs Processing** → Live Now → Upcoming → Drafts → Archived.
- Summaries für alle Ended-Blöcke werden parallel via `Promise.allSettled` geladen.

**Bugfixes: Refund/Cancelled/Failed Status**
- `getCurrentStep()` + `getTxStatusLabel()` in `post-auction/page.tsx`: Terminal-States (refunded/cancelled/failed) werden vor `fulfillment_status` geprüft. Vorher: refunded Lots zeigten "Awaiting Payment".
- Backend `post-auction/route.ts`: `summary.unpaid` zählt jetzt nur `status = 'pending'`. Neues Feld `summary.refunded` für refunded/cancelled/failed.
- `EndedStateDashboard` (Payments-Step) und `EndedBlockCard` (Badge) nutzen `summary.refunded`.

**Orders-Seite — Visual Redesign (`transactions/page.tsx`)**
- Medusa `Table`-Komponente durch raw `<table>` ersetzt — gleicher Stil wie Auction Blocks (grauer Header-Background, 10px uppercase Spalten, inline `onMouseEnter/Leave` hover).
- Advanced Filter (Payment / Fulfillment / Provider / Datum) hinter `Filters ▾` Button versteckt (collapsed by default, leuchtet blau bei aktiven Filtern).
- **Shopify-style Quick Tabs**: Needs Shipping (default) / Packing / Shipped / Awaiting Payment / All.
- Status-Badges als inline `Pill`-Komponente (custom bg/color, kein Medusa-Dependency).
- Bulk-Action-Bar als dunkler floating Pill (statt weißem Kasten).
- Customer-Spalte zeigt Stadt + Land. Amount-Spalte zeigt Provider darunter.

**Extensions Sidebar-Fix (`admin-nav.tsx`)**
- CSS: `nav [data-radix-collapsible-trigger] { display: none !important; }` — fängt beide Varianten (+ und −) ab.
- JS-Match: `!text?.includes("Extensions")` statt `=== "Extensions"` (textContent enthält Icon-Zeichen).

**Commits:** `e925fb0` · `044b25c` · `994f91d` · `8e2b879` · `abeb526` · `6fcd931` · `b9cb9b0`

---

### 2026-03-30 — Admin AI Assistant

**Neuer Admin-Bereich `/app/ai-assistant`**
- Chat-Interface im Medusa-Admin mit Claude Haiku als Backend-AI.
- Streaming SSE: Antworten erscheinen sofort, kein Warten auf komplette Response.
- **5 read-only Tools** (Knex-Queries direkt, kein HTTP-Roundtrip):
  - `get_dashboard_stats` — KPI-Snapshot (aktive Auktionen, offene Bestellungen, Katalog-Größe, Gesamtumsatz)
  - `list_auction_blocks` — Blocks nach Status filtern
  - `search_transactions` — Bestellungen nach Kunde, E-Mail, Bestellnummer, Status suchen
  - `search_media` — 41k Releases durchsuchen (Titel, Artist, Label, Kategorie)
  - `get_system_health` — DB-Connectivity-Check
- **Agentic loop:** Claude kann mehrere Tools pro Antwort aufrufen (max 5 Iterationen).
- **Tool-Chips in der UI:** Zeigen welche Tools aufgerufen wurden, klickbar für Raw-JSON.
- **5 Suggestion-Chips** als Schnellstart (Deutsch).
- **Markdown-Rendering:** Tabellen, Code-Blöcke, Bold, Listen.
- Sidebar: rank 6 (nach Operations), Sparkles-Icon.
- Model: `claude-haiku-4-5-20251001` (~$0.001/Anfrage).
- `ANTHROPIC_API_KEY` in `backend/.env` (aus 1Password: "Anthropic API Key (MyNews)").

**Neue Dateien:**
- `backend/src/api/admin/ai-chat/route.ts` — Backend-Endpoint (POST, SSE-Streaming)
- `backend/src/admin/routes/ai-assistant/page.tsx` — Chat-UI
- `@anthropic-ai/sdk` zu `backend/package.json` hinzugefügt

---

### 2026-03-30 — Admin Backoffice Fixes + Dashboard Landing Page

**Neue Admin-Dashboard-Seite (`/app/dashboard`)**
- `backend/src/admin/routes/dashboard/page.tsx` (NEU) — Einstiegsseite für das Admin-Backend. Sidebar: erster Punkt (rank 0, Home-Icon). Auto-Refresh 60s.
- **KPI-Bar:** 5 Cards: Unpaid Overdue (rot wenn >0), Ready to Pack (amber), Labels Pending (lila), Active Auctions (grün), Shipped This Week.
- **ACTION REQUIRED Queue:** Prioritätsliste — pro überfälliger Transaktion (>3 Tage) eigene Karte mit Link zu `/app/transactions/{id}`. Gruppierte Karten für „Ready to Pack" + „Labels Pending". Grüner „All caught up"-State wenn leer.
- **LIVE NOW Widget:** Aktive Auction Blocks mit End-Zeit, Item-Anzahl, Buttons: Live Monitor + Manage.
- **COMING SOON:** Bis zu 3 scheduled/preview Blocks mit Start-Datum und Edit-Link.
- **Week Stats Bar:** Revenue, Orders, Shipped, Pending — als kleine Zusammenfassung unten.
- Datenquellen: 5 parallele Fetches via `Promise.allSettled` gegen bestehende Admin-Endpoints.

**Backoffice Bugfixes (B1–B4)**
- **B1 — 404 entfernt:** „Post-Auction Workflow →" Button in `post-auction/page.tsx` gelöscht. Verwies auf nicht existente Route `/post-auction/workflow`.
- **B2 — Lot-Zeilen klickbar:** Jede Lot-Zeile in der Post-Auction-Seite navigiert direkt zu `/app/transactions/{tx.id}`. Cursor `pointer`, hover-Highlight blau. Lots ohne Transaction (kein Gebot) nicht klickbar.
- **B3 — Refund-Button:** In `ActionButton` für alle bezahlten Lots (Steps 2–4): roter „Refund"-Button neben dem Hauptbutton. Confirm-Dialog mit Betrag. Ruft `POST /admin/transactions/{id}` mit `action: "refund"`.
- **B4 — Auction-Blocks-Liste klickbar:** Jede Tabellenzeile in `/app/auction-blocks` navigiert zu `/app/auction-blocks/{id}`. Buttons in der Aktions-Spalte stoppen Event-Propagation.

**Konzept-Dokument**
- `docs/architecture/ADMIN_BACKOFFICE_KONZEPT_2026.md` (NEU) — Vollständige Analyse aller Bugs, Marktvergleich (eBay, Catawiki, Shopify), Konzept mit Wireframes, Umsetzungsplan P1–P4, offene Fragen.

**Admin Sidebar — CSS Fix**
- `admin-nav.tsx` überarbeitet: Extensions-Collapsible wird jetzt erst via `btn.click()` geöffnet (aria-expanded check), dann via `requestAnimationFrame` versteckt. Radix-Collapsible CSS-Override (`[data-radix-collapsible-content]` height: auto) verhindert dass Inhalt bei height:0 bleibt. Modul-Level `injectNavCSS()` für sofortiges Style-Inject vor React-Render.

---

### 2026-03-30 — Admin UI Restructuring + System Health Erweiterung

**Admin Sidebar: 15 Flat Items → 5 strukturierte Gruppen**

- **`/app/catalog`** (NEU) — Hub-Seite für alle Katalog-Bereiche. Cards: Media Browser, Entity Content, Musicians. Live-Stats-Bar (Total Releases, Artists, Enrichment-%, Musicians/Bands). `defineRouteConfig` auf neuer Hub-Seite.
- **`/app/marketing`** (NEU) — Hub-Seite für alle Marketing-Bereiche. Cards: Newsletter, Email Templates, CRM Dashboard, Content Blocks, Gallery. Stats: 3.580 CRM-Kontakte, 4 Newsletter-Templates, 6 Transactional Emails, 9 Gallery-Sektionen.
- **`/app/operations`** (NEU) — Hub-Seite für Platform-Tools. Cards: System Health, Shipping, Sync Status, Test Runner. Grüner Live-Banner (pulsierend) wenn aktive Auktionen laufen — direkt mit Live-Monitor verknüpft.
- **"Transactions" → "Orders"** umbenannt in Sidebar-Label.
- `defineRouteConfig` entfernt aus: `content`, `customers`, `emails`, `entity-content`, `gallery`, `live-monitor`, `media`, `musicians`, `newsletter`, `shipping`, `sync`, `system-health`, `test-runner` — alle weiter über `/app/[name]` erreichbar, aber nicht mehr in Sidebar.

**System Health: 9 → 11 Services**
- **VPS / API Server (Hostinger)** — Live HTTP-Check gegen `api.vod-auctions.com/health`, Fallback auf `/store/auction-blocks`. Zeigt Latenz in ms.
- **Storefront (vod-auctions.com)** — Live HTTP-Check gegen public domain.
- Neue Icons: 🖥️ (VPS), 🌍 (Storefront public) in `SERVICE_ICONS`.

**Docs**
- `docs/architecture/ADMIN_UI_KONZEPT_2026.md` — Konzept-Dokument (Problem-Analyse, Hub-Struktur, Routing-Regeln, Implementierungsplan, Auction Detail + Order Detail Konzepte).
- `docs/architecture/MONITORING_SETUP_GUIDE.md` (NEU) — Setup-Anleitung für GA4, Sentry (inkl. npx wizard), ContentSquare + Microsoft Clarity als kostenlose Alternative. Env-Var-Tabelle.
- `docs/architecture/mockups/` (NEU) — 6 HTML-Mockups: index, sidebar overview, catalog hub, operations hub, auction detail, order detail.

---

### 2026-03-29 — Post-Auction Workflow + Bugfixes

**Post-Auction Workflow (Admin)**
- `GET /admin/auction-blocks/:id/post-auction` — liefert alle Lots eines ended Blocks mit Gewinner (Name, Email), Transaction-Status (paid/pending), Fulfillment-Status, `label_printed_at`. Summary: total/paid/unpaid/no_bid/shipped.
- `backend/src/admin/routes/auction-blocks/[id]/post-auction/page.tsx` (NEU) — 5-stufiger Step-Tracker (Ended → Paid → Packing → Label Printed → Shipped) pro Lot. Farbcodiert: grün=done, gold=aktiv, grau=pending. Filter-Tabs: All/Unpaid/Paid/Shipped. Action-Button pro Lot: "Mark Packing" / "Print Label" / "Mark Shipped" / "Done ✓" / "No Bid". Refetch nach jeder Action.
- Block-Detail-Seite: "Post-Auction Workflow →" Button erscheint wenn `block.status === "ended"`.
- `GET /admin/transactions/:id/shipping-label` — pdfkit-PDF mit VOD Records Absender, Empfänger (Shipping-Adresse aus Transaction), Bestellnummer, Items-Liste. Setzt `label_printed_at = NOW()` nach Generierung.
- `POST /admin/transactions/:id` neue actions: `packing` (→ `fulfillment_status = "packing"`) + `label_printed` (→ `label_printed_at = NOW()`). Beide mit `order_event` Audit-Log.
- `POST /admin/transactions/bulk-action` — `{ ids: string[], action: "packing" | "label_printed" }` für Batch-Updates.
- DB-Migration: `ALTER TABLE transaction ADD COLUMN IF NOT EXISTS label_printed_at TIMESTAMP` — ausgeführt.
- `lib/validation.ts`: `UpdateTransactionSchema` um `"packing"` + `"label_printed"` erweitert. `BulkActionSchema` neu.

**Won-Badge (Storefront)**
- `GET /store/account/status`: `wins_count` neu — zählt `transaction` WHERE `status="pending"` AND `block_item_id IS NOT NULL` (unbezahlte Auction-Wins).
- `AuthProvider`: `winsCount` State + Context-Feld hinzugefügt.
- `AccountLayoutClient`: Rotes Badge `bg-destructive/80` bei "Won" wenn `winsCount > 0`.

**Bugfixes**
- **Email Cover-Image kaputt:** `email-helpers.ts` baute `https://tape-mag.com/bilder/gross/${coverImage}` — aber `coverImage` enthält bereits die volle URL. Doppelte URL → Broken Image in allen Emails mit Item-Preview. Fix: `release.coverImage || undefined` direkt verwenden (Zeilen 70 + 474).
- **Storefront Build-Fehler (Sentry):** `transpileClientSDK` (deprecated), `hideSourceMaps` (nicht mehr in `SentryBuildOptions`), `disableLogger` (deprecated) aus `next.config.ts` entfernt.
- **Storefront Build-Fehler (Playwright):** `playwright.config.ts` + `tests/` zu `exclude` in `storefront/tsconfig.json` hinzugefügt — `@playwright/test` ist kein Prod-Dependency.

---

### 2026-03-30 — Zahlungs- und Sicherheitssanierung

**Betroffene Dateien:** `backend/src/lib/paypal.ts`, `backend/src/api/store/account/capture-paypal-order/route.ts`, `backend/src/api/store/account/update-payment-intent/route.ts`, `backend/src/api/webhooks/stripe/route.ts`, `backend/src/api/store/auction-blocks/[slug]/items/[itemId]/bids/route.ts`, `backend/medusa-config.ts`, `deploy.sh`

- **PayPal server-side amount verification:** `getPayPalOrder()` in `paypal.ts` ergänzt (`GET /v2/checkout/orders/{id}`). `capture-paypal-order` verifiziert jetzt immer serverseitig bei PayPal: `status=COMPLETED` + Betrag ±€0.02 gegen DB-Summe aller `pending`-Transaktionen. Client-seitige `captured_amount`-Angabe nicht mehr verwendet. Bei Mismatch: Transaktionen auf `failed` gesetzt, 400-Error. `paypal_order_id` ist jetzt required.
- **PayPal-Orders erhalten Bestellnummern (Bonus-Fix):** `capture-paypal-order` generiert `order_number` (Sequenz `order_number_seq`) + `order_event`-Audit-Eintrag direkt. Zuvor fiel beides durch: der PayPal-Webhook prüft `WHERE paypal_capture_id = X AND status = 'paid'` → fand nach dem Capture-Endpoint immer `alreadyPaid` und skippt komplett.
- **Stripe Webhook idempotent (`checkout.session.completed`):** `alreadyPaid`-Guard am Anfang des `orderGroupId`-Branch eingefügt (identisch zu `payment_intent.succeeded`). Verhindert bei doppelter Webhook-Zustellung: zweiten Promo-Code-`used_count`-Increment, zweite Sequenznummer, duplizierten `order_event`, zweite Bestätigungsmail.
- **Promo-Code-Rabatt bei Shipping-Neuberechnung erhalten:** `update-payment-intent` liest `discount_amount` aus bestehenden Transaktionen (proportional bereits verteilt) und subtrahiert ihn bei `total_amount` pro Transaktion und beim Stripe-PaymentIntent-Betrag. Vorher: `grandTotal = itemsTotal + shippingCost` ohne Rabatt → Nutzer zahlte vollen Preis nach Adressänderung.
- **`user_id`-Leak in öffentlicher Bid-History geschlossen:** `GET /store/auction-blocks/*/items/*/bids` gab `user_id: bid.user_id` im Response-Objekt zurück. 1 Zeile entfernt. `user_hint` (SHA-256-Hash) bleibt erhalten.
- **Production-Startup-Check JWT/Cookie:** `medusa-config.ts` wirft Exception wenn `NODE_ENV=production` und `JWT_SECRET`/`COOKIE_SECRET` nicht gesetzt. Vorher stiller Fallback auf `"supersecret"`.
- **`deploy.sh` Credentials entfernt:** `DATABASE_URL`-Passwort, `SUPABASE_DB_URL`-Passwort, `LEGACY_DB_PASSWORD` durch Platzhalter `REPLACE_WITH_*` ersetzt. Git-History enthält die alten Werte noch — Rotation empfohlen.

---

### 2026-03-29 — Admin Backoffice Erweiterungen (System Health + Email Preview)

- **System Health Dashboard:** `GET /admin/system-health` — Live-Checks für 9 Services: PostgreSQL (SELECT 1), Stripe (balance API), PayPal (OAuth Token), Resend (domains list), Brevo (account API), Storefront (HTTP check), Sentry (ENV check), ContentSquare (ENV check), GA4 (ENV check). Latenz in ms, Status: ok/error/unconfigured. `backend/src/admin/routes/system-health/page.tsx` — Service-Cards mit Ping-Animation, Summary-Bar, Auto-Refresh 30s, Quick Links zu allen Dashboards.
- **Email Template Preview + Edit:** `GET /admin/email-templates/:id` — rendert vollständiges HTML mit Musterdaten, gibt `{ html, subject, subject_default, config }` zurück. `PUT /admin/email-templates/:id` — speichert Subject-Override, Preheader-Override, Notes in `content_block` (page=`email_config`). Admin-Seite `/admin/emails` komplett überarbeitet: Klick auf Template öffnet Side-Drawer mit 3 Tabs — Preview (iframe mit echtem HTML), Edit (Subject/Preheader-Override + Notes speicherbar), Send Test (inline Email-Versand).
- **Admin-Sidebar:** Emails, Test Runner, System Health jetzt in Sidebar sichtbar. Bug behoben: `cp -r` auf existierenden Ordner merged statt zu überschreiben → Fix: `rm -rf public/admin` vor Copy.

---

### 2026-03-29 — Email System Upgrade (B1, B2, B3, B4)

- **B4 Email HTML Redesign:** `layout.ts` updated — `<html xmlns:v>` VML namespace, `format-detection` meta, `#0d0b08` outer background, `<div role="article">` wrapper, plain `<span>VOD AUCTIONS</span>` header, explicit divider `<tr>` between body and footer, MSO `<style>` conditional comment. `buildFooter` now returns `<tr><td>` (inline within container table, not standalone). Preheader color updated to `#0d0b08`. Footer copy: "VOD Auctions · Curated Industrial & Experimental Music" + unsubscribe + email-preferences + visit links.
- **B4 Preheader Texts:** All 10 Resend transactional templates updated to exact-spec preheader strings (verify-email, password-reset, bid-won, outbid, payment-confirmation, payment-reminder-1, payment-reminder-3, shipping, watchlist-reminder, feedback-request).
- **B1 Unsubscribe Page:** `storefront/src/app/email-preferences/unsubscribed/page.tsx` — dark-theme confirmation page with "changed your mind?" re-subscribe panel, Back to Home + Browse Auctions CTAs. Backend route + HMAC token system was already complete.
- **B2 Double Opt-In Newsletter:** `backend/src/emails/newsletter-confirm.ts` — new confirmation email template. `POST /store/newsletter` rewritten — no longer inserts directly to Brevo; sends confirmation email via Resend instead. `GET /store/newsletter/confirm` — validates daily HMAC (today + yesterday window), inserts to Brevo on success, redirects to `/newsletter/confirmed`. `storefront/src/app/newsletter/confirmed/page.tsx` — success/error state page with expected-email list.
- **B3 Admin Email Template UI:** `GET /admin/email-templates` returns 15 template metadata objects. `POST /admin/email-templates` renders preview + sends test email via Resend. `backend/src/admin/routes/emails/page.tsx` — filter tabs (All/Resend/Brevo), template cards with Channel + Category badges, preheader preview text, Send Test modal with email input + status feedback.

---

### 2026-03-29 — Frontend Code Quality (D7, D14)
- **D7 TypeScript:** `any`-Types in `ItemBidSection.tsx` (2x Supabase Realtime payloads) und `checkout/page.tsx` (3x: `WinEntry.item.release_id`, items array, body object) durch konkrete Inline-Types ersetzt. `release_id?: string` zu `WinEntry.item` in `types/index.ts` hinzugefügt. Kein neues `lib/types.ts` — bestehende `types/index.ts` war bereits vollständig.
- **D14 Bundle Size:** `PayPalButton` in `checkout/page.tsx` auf `next/dynamic` mit `ssr: false` + Skeleton-Loader umgestellt. PayPal JS SDK wird nur geladen wenn tatsächlich gerendert. `ShareButton` + `BidHistoryTable` in Server Component korrekt — code-split bereits durch Client/Server-Boundary.

---

### 2026-03-29 — Backend Code Quality II (D3, D11)
- **D3 Zod Validation:** `lib/validation.ts` mit `CreateAuctionBlockSchema`, `CreateBlockItemSchema`, `UpdateTransactionSchema`, `BulkShipSchema` + `validateBody` Helper. Admin-Routes `/admin/auction-blocks` (POST), `/admin/auction-blocks/:id/items` (POST), `/admin/transactions/:id` (POST), `/admin/transactions/bulk-ship` (POST) validieren `req.body` und geben strukturierte 400-Fehler mit `issues`-Array zurück. `zod@^3.23.8` zu `package.json` hinzugefügt.
- **D11 Anonymization:** Bidder-Anzeige von `"R***"` auf `"Bidder A3F2C1"` (SHA-256 Hash, 6 Hex-Zeichen) umgestellt — konsistent pro User, nicht bruteforceable. Kein DB-Lookup mehr nötig (nur noch userId-Hash).

---

### 2026-03-29 — Frontend Quality (C3, C5, C7, D5, D8, D10)
- **C3 Gate Fix:** Hardcoded password fallback `"vod2026"` entfernt aus `middleware.ts` + `api/gate/route.ts`. Gate deaktiviert wenn `GATE_PASSWORD` ENV nicht gesetzt. Launch-Checklist-Kommentar hinzugefügt.
- **C5 Hotjar:** `components/providers/HotjarProvider.tsx` — lädt Hotjar-Script nur wenn `NEXT_PUBLIC_HOTJAR_ID` gesetzt + User hat Marketing-Consent gegeben. In `layout.tsx` eingebunden.
- **C7 GA4 E-Commerce:** `view_item`, `add_to_cart`, `begin_checkout`, `purchase` Events in `lib/analytics.ts`. `CatalogViewTracker.tsx` Client-Component für Server-seitige Catalog-Detail-Seite. `trackBeginCheckout` + `trackPurchase` in Checkout-Page (Stripe + PayPal).
- **D5 Error Boundaries:** `components/ErrorBoundary.tsx` React Class Component. Eingebunden in Lot-Detail-Seite (`ItemBidSection`) + `AccountLayoutClient` (deckt Checkout + alle Account-Pages ab).
- **D8 Fetch Errors:** `fetchError` State in Checkout-Page. `catch`-Block war `/* silent */` → zeigt jetzt rote Fehlermeldung mit Refresh-Hinweis.
- **D10 Loading States:** Spinner-SVG + `disabled` auf Place Bid Button + Confirm Bid Modal Button + Pay Now Button. Button-Text wechselt zu "Processing..." während Load.

---

### 2026-03-29 — Testing Infrastructure (A1, A3)
- **A1 Test Concept:** `docs/TEST_CONCEPT.md` — vollständiges Testkonzept (Scope, 15 User Journeys, Testarten, Infrastruktur, Environments, Regression-Protokoll)
- **A3 Test Dashboard:** `/admin/test-runner` — Playwright-Ergebnisse anzeigen (Summary-Karte, Spec-Tabelle, Failed-Tests mit Fehlertext), Testläufe triggern (POST mit Concurrency-Guard), Run-History (Mini-Bar-Chart + Tabelle, letzte 30 Läufe)
  - Backend: `backend/src/api/admin/test-runner/route.ts` (GET + POST, JSON-Report + History)
  - Admin UI: `backend/src/admin/routes/test-runner/page.tsx` (3s Polling während Lauf aktiv)

---

### 2026-03-29 — Config & Code Quality (C1, C2, C6, D12, D13)
- **C1 Brevo:** `VOD_AUCTIONS_LIST_ID`/`TAPE_MAG_LIST_ID` mit sicheren Defaults (4/5) in `brevo.ts`; backward-compat Aliase erhalten; `backend/.env.example` vollständig dokumentiert
- **C2 Sentry:** `sentry.client.config.ts` mit Replay-Integration (maskAllText, blockAllMedia, 0.1 session sample rate); `sentry.server.config.ts` + `sentry.edge.config.ts` aktualisiert; `next.config.ts` mit `withSentryConfig` (authToken, widenClientFileUpload, tunnelRoute, hideSourceMaps, disableLogger, Source Maps nur in Production); `storefront/.env.local.example` erstellt
- **C6 Uptime:** `docs/UPTIME_KUMA_SETUP.md` mit vollständiger VPS-Installationsanleitung (Docker, Nginx, Certbot, 4 Monitore)
- **D12 Types:** `backend/src/lib/types.ts` mit Bid, BlockItem, Transaction, CustomerSummary, AuctionBlockPublic Interfaces
- **D13 Constants:** `backend/src/lib/constants.ts` mit LOG, AUCTION_STATUS, ITEM_STATUS, TRANSACTION_STATUS, FULFILLMENT_STATUS und numerischen Konstanten

---

### 2026-03-29 — Backend Code Quality (D1, D2, D4, D6, D7, D11)
- **D1 Race Condition:** `bid`-Tabelle mit `.forUpdate()` gelockt in Bid-Transaktion
- **D2 Error Handling:** Alle `.catch(() => {})` durch Console.error-Logging ersetzt (bids/route.ts, auction-lifecycle.ts, webhooks/stripe/route.ts)
- **D4 Checkout Atomicity:** DELETE+INSERT in atomarer DB-Transaktion (checkout-helpers.ts)
- **D6 N+1 Fix:** Live-Bids Batch-Load (3 Queries statt 3×N) in admin/auction-blocks/[id]/live-bids/route.ts
- **D7 Null Guard:** `parseFloat(null)` → NaN Guard in Bid-Validation (bids/route.ts)
- **D11 CORS:** Explizite storeCors/adminCors/authCors Fallbacks in medusa-config.ts

---

### 2026-03-28 — Hotfix: Backend-Crash pdfkit

- **Ursache:** `backend/src/lib/invoice-template.ts` imported `pdfkit`, das auf dem VPS nicht installiert war → `Cannot find module 'pdfkit'` → PM2 restart-loop
- **Fix:** `npm install pdfkit @types/pdfkit` auf VPS + `pdfkit: ^0.15.2` + `@types/pdfkit: ^0.13.9` in `backend/package.json` committed

---

### 2026-03-29 — Auction Workflow Vollimplementierung (P1+P2+P3+K-Series)

**P1 — Kritische Gaps:**
- **Tiered Bid Increments:** €0.50→€25 Stufentabelle; `getMinIncrement()` in Backend + Storefront "Min. bid" Anzeige
- **Anti-Sniping:** `max_extensions` (10) + `extension_count` auf `auction_block`/`block_item`; Admin-UI Toggle; Realtime Broadcast `lot_extended` via Supabase (benötigt `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`)
- **Payment Deadline:** 5-Tage-Frist; Cron `payment-deadline.ts` (tägl. 09:00 UTC) — Tag 1+3 Reminder-Mails, Tag 5 Auto-Relist + Admin-Alert; Felder `payment_reminder_1/3_sent_at` auf `transaction`
- **Condition Grading:** Discogs-Standard Dropdowns (M/NM/VG+/VG/G+/G/F/P) im Admin Media Editor; `ConditionBadge.tsx` Storefront (farb-kodiert mit Tooltip)

**P2 — Hohe Priorität:**
- **Public Bid History:** `BidHistoryTable.tsx` (Bidder #N, 30s Poll, Framer Motion animation), auf Lot-Detail-Seite
- **Watchlist Reminder:** Stündlicher Cron `watchlist-reminder.ts`; 24h vor Lot-Ende → Email an Saver; Feld `watchlist_reminded_at` auf `saved_item`
- **Reserve Price:** `reserve_price` Feld auf `block_item`; Lifecycle-Check (kein Award wenn Reservepreis nicht erreicht); Storefront-Anzeige (Lock-Icon, ohne Betrag)
- **Admin Live Monitor:** `/admin/live-monitor` — 10s Auto-Refresh, Lot-Cards (rot = recent bids, grün = aktiv, grau = keine Bids)
- **Post-Block Analytics:** `GET /admin/auction-blocks/:id/analytics` — Conversion-Rate, Revenue, Avg-Price-Multiple, Top-Lots; Analytics-Tab in Block-Detail-Seite (auto-load für ended/archived)
- **Newsletter Sequenz:** Cron `newsletter-sequence.ts` (stündlich) — T-7d Teaser, T-24h, T+0 Live, T-6h Ending via Brevo Kampagnen-API (List ID 4); Felder `newsletter_*_sent_at` auf `auction_block`

**P3 — Mittelfristig:**
- **Going/Going/Gone:** <5 Min rotes Pulsing-Banner + roter Countdown in `ItemBidSection`; <1h Amber-Banner
- **"No Buyer's Premium" USP:** Badge auf Lot-Seite + Checkout-Summary (beide Instanzen) + Footer
- **Live Auction Banner:** `LiveAuctionBanner` Server-Component (ISR 60s) auf Homepage, Catalog, Auctions-Seite
- **1-Click Rebid:** Outbid-Email zeigt vorgeschlagenen Betrag (nächste Stufe); `?bid=X` URL-Param pre-füllt Bid-Input
- **Staggered Ending:** Admin Checkbox + Interval-Input (Min.) + Preview-Text + Header-Badge; Lots enden gestaffelt
- **View Counter:** `view_count` auf `block_item`, Fire-and-Forget Increment; Social-Proof-Anzeige auf Lot-Seite
- **Preview Block Storefront:** Amber-Banner + `PreviewCountdown.tsx` für scheduled/preview Blocks; Save-Buttons statt Bid-Formular
- **Bulk Price Editor:** Admin Panel — Modi: % vom Schätzwert / Fixed / Manuell; API `POST /admin/auction-blocks/:id/items/bulk-price`
- **Social Sharing:** `ShareButton.tsx` (Web Share API mobil + Dropdown Desktop: Copy/Twitter/Facebook/WhatsApp); auf Block + Lot-Seiten
- **Schema.org MusicAlbum:** JSON-LD auf Catalog-Detail-Seiten

**K-Series — Nachträglich identifizierte Verbesserungen:**
- **Invoice PDF:** `GET /store/account/orders/:groupId/invoice` — pdfkit-generiertes PDF; Rechnung mit VOD-Daten, MwSt, Positionen
- Alle bestehenden K-Series-Punkte (Bids Log, Block löschen, Bid Badges, Countdown, Nav Cleanup) wurden am 2026-03-28 implementiert (siehe RSE-235 unten)

**Neue Dateien (Backend):**
`lib/supabase.ts`, `lib/invoice-template.ts`, `jobs/payment-deadline.ts`, `jobs/watchlist-reminder.ts`, `jobs/newsletter-sequence.ts`, `api/admin/auction-blocks/[id]/analytics/route.ts`, `api/admin/auction-blocks/[id]/items/bulk-price/route.ts`, `api/store/account/orders/[groupId]/invoice/route.ts`, `admin/routes/live-monitor/page.tsx`, `emails/payment-reminder-1.ts`, `emails/payment-reminder-3.ts`, `emails/watchlist-reminder.ts`, `emails/block-teaser.ts`, `emails/block-tomorrow.ts`, `emails/block-live.ts`, `emails/block-ending.ts`, `emails/newsletter-layout.ts`

**Neue Dateien (Storefront):**
`components/ConditionBadge.tsx`, `components/BidHistoryTable.tsx`, `components/LiveAuctionBanner.tsx`, `components/PreviewCountdown.tsx`, `components/ShareButton.tsx`

**Migrationen:** `20260328` (auto_extend/max_extensions), `20260329000000` (payment_reminders), `20260329100000` (watchlist_reminded_at), `20260329200000` (reserve_price), `20260330000000` (newsletter_*_sent_at), `20260330100000` (view_count)

---

### 2026-03-28 — RSE-235: Admin UX + K-Series

- **Admin Bids Log:** `GET /admin/auction-blocks/:id/bids-log` — chronologisch, volle Bieter-Namen, Cover, Betrag, Proxy, Winning/Outbid Status
- **Auction Block löschen:** Delete-Button für draft/ended/archived Blocks. Confirmation-Dialog. Releases → `available`. `DELETE /admin/auction-blocks/:id` (409 bei active/scheduled/preview)
- **Live-Bids + Bids-Log:** Zeigen jetzt volle Namen statt anonymisierte Hints
- **Bid Badges (BlockItemsGrid):** Highest Bid = grünes Badge + `animate-pulse` + grüne Card-Border. Your Bid (Outbid) = goldenes Badge prominenter
- **Countdown H:M:S:** Überall `14h 23m 45s` Format. Block-Detail: Start+End Zeiten (CET/CEST auto-erkannt), End-Zeit als Gold-Pill-Badge
- **Storefront-Link Fix:** Block-Detail "Storefront" Button → `https://vod-auctions.com`
- **Medusa Nav Cleanup:** Ungenutzte Nav-Items (Orders, Products, Inventory, Customers, Promotions, Price Lists) per CSS-Injection in `auction-blocks/page.tsx` ausgeblendet
- **Konzept-Review Dokument:** `docs/architecture/AUCTION_WORKFLOW_KONZEPT_REVIEW_2026.md` — VOD vs eBay/Catawiki/Paddle8 Vergleich (9 Dimensionen, P1-Gaps identifiziert)

---

### 2026-03-22 — Entity Content Overhaul RSE-227 (Phase 1-7 + P1 abgeschlossen)

- **Multi-Agent Pipeline:** `scripts/entity_overhaul/` — 10 Module (orchestrator, enricher, profiler, writer, seo_agent, quality_agent, musician_mapper, db_writer, config, tone_mapping)
- **Enricher:** 10 Datenquellen (DB, MusicBrainz, Wikidata, Wikipedia, Last.fm, Brave, Bandcamp, IA, YouTube, Discogs). GPT-4o Writer + GPT-4o-mini für alle anderen Agents.
- **Tone Examples:** `scripts/entity_overhaul/tone_examples/` — 35 Beispieltexte (10 Genres × 3 + 3 Labels + 2 Press) + Ban List (40+ verbotene Phrasen)
- **Musician Database:** `musician`, `musician_role`, `musician_project` Tabellen. Admin CRUD `/admin/musicians`. Store API `/store/band/:slug` liefert `members[]`. 897 Musiker, 189 Bands mit Mitgliedern.
- **P1 Rollout abgeschlossen (2026-03-22 22:59):** 1.022 Entities, 1.013 accepted, 7 revised, 0 rejected, ~8h Laufzeit, Avg Score 82.3
- **Geänderte Dateien:** `store/band/[slug]/route.ts`, `band/[slug]/page.tsx`, `admin/routes/entity-content/page.tsx`

### 2026-03-22 — VOD Gallery

- **Storefront `/gallery`:** 10 Sektionen, Server Component, Schema.org JSON-LD (LocalBusiness+Museum+Store), GA4+Brevo Tracking
- **CMS/MAM:** `gallery_media` Tabelle. Admin CRUD `/admin/gallery` (4 Routes). Store API `/store/gallery`. 21 Medien + 6 Content-Blocks geseeded.
- **Navigation:** Gallery als 4. Nav-Link (Header, MobileNav, Footer)
- **Homepage Teaser:** 3-Bild-Grid mit CTA "Explore the Gallery"
- **Password Gate Fix:** `/gallery/gallery-*` Bildpfade durch Middleware-Bypass erlaubt

### 2026-03-22 — Entity Content Overhaul — Konzept + Admin Status Dashboard

- Konzept-Dokument: `docs/KONZEPT_Entity_Content_Overhaul.md`
- Admin Status Dashboard auf `/admin/entity-content` (Pipeline Status, Progress Bar, Data Quality Grid, Musician DB)
- Backend API: `GET /admin/entity-content/overhaul-status`
- VPS Setup: `OPENAI_API_KEY`, `LASTFM_API_KEY`, `YOUTUBE_API_KEY` in `scripts/.env`; `openai` 2.29.0 + `musicbrainzngs` 0.7.1 installiert

### 2026-03-18 — Transaction Module Phase 1 (Erweitertes Order Management)

- **DB-Migration:** 12 neue Spalten auf `transaction` (order_number, fulfillment_status, refund_amount, cancelled_at, cancel_reason, internal_note, phone, billing fields), neue `order_event` Tabelle (Audit Trail), `order_number_seq` Sequence
- **Order-Nummern:** VOD-ORD-XXXXXX, 6-stellig fortlaufend, generiert bei Payment-Success
- **Admin API erweitert:** Pagination, Search, 7 Filter, Sort, Bulk-Ship, CSV-Export (BOM/Excel-kompatibel, 15 Spalten)
- **Admin UI neu:** Transaction-Liste (Suchleiste, Filter-Pills, Pagination, Bulk-Checkboxen, Export). Neue Detail-Seite (`/app/transactions/:id`) mit Timeline, Actions, Notes.
- **Audit Trail:** Jede Status-Änderung → `order_event` Eintrag mit actor + Zeitstempel
- **VPS SSH Deploy Key:** Ed25519 Key, Git remote auf SSH umgestellt

### 2026-03-17 — Catalog Sort Fix + Infrastruktur-Wartung

- **Catalog Sort Fix:** Frontend sendete `sort=artist:asc` (Backend erwartet `sort=artist&order=asc`). Fix in `catalog/page.tsx` (SSR) + `CatalogClient.tsx`. `legacy_price` → `price` Mapping korrigiert.
- **Git Re-Clone:** Lokales Repo hatte korrupte Pack-Files. Fresh clone via HTTPS. Alle 3 Instanzen (VPS, GitHub, lokal) synchron.
- **VPS Disk Cleanup:** 90% → 78% (6 GB freigeräumt). PM2 log-rotation installiert. Disk-Alert-Script.
- **Gold-Tinted Input Styling:** `--input: #302a22`, `border-primary/25` auf Input/Select/Textarea
- **NIE `git pull` auf VPS** wenn VPS-Code nicht vorher gepusht wurde

### 2026-03-16 — PayPal Direkt-Integration

- **Architektur:** PayPal JS SDK (Hybrid) — Frontend rendert Button, Backend verwaltet Transactions
- **Neue Dateien:** `paypal.ts`, `checkout-helpers.ts`, `create-paypal-order/route.ts`, `capture-paypal-order/route.ts`, `webhooks/paypal/route.ts`, `PayPalButton.tsx`, `paypal-client.ts`
- **Betrags-Validierung:** `capture-paypal-order` vergleicht `captured_amount` mit `total_amount`. Abweichung > €0.02 → `failed`.
- **Sofort-Refund:** `refundPayPalCapture()` (nicht 5-7 Tage wie über Stripe)
- **Sandbox-Bug:** EUR + DE-Accounts → "internationale Vorschriften" Fehler. Nur Sandbox, Production OK.
- **Live-Test:** €18.49 Zahlung via PayPal Live erfolgreich

### 2026-03-15 (Fortsetzung) — Admin Refund + Invoice Fix

- **Admin Refund:** `POST /admin/transactions/:id` mit `action: "refund"` — Stripe API, Releases → `available`, Status → `refunded`
- **Invoice PDF:** Adresse Alpenstrasse 25/1 korrigiert. USt-IdNr DE232493058, 19% MwSt. Kein §19 UStG (war falsch).
- **Orders Count Badge:** Account-Sidebar zeigt Anzahl bezahlter Bestellungen
- **PayPal Redirect Fix:** `loading` State nach Redirect auf `false` gesetzt

### 2026-03-15 — Shopify-Style One-Page Checkout (Phase A+B)

- **Architektur:** Stripe Hosted Checkout → Stripe Payment Element inline. PaymentIntent statt Checkout Session.
- **Backend:** `POST /store/account/create-payment-intent`, `POST /store/account/update-payment-intent`. Webhook für `payment_intent.succeeded` + `.payment_failed`.
- **Frontend:** Two-Column Layout (60/40), Shipping Address + Method + Inline PaymentElement. `@stripe/stripe-js` + `@stripe/react-stripe-js`.
- **Phase C offen:** Apple Pay/Google Pay, Google Places, gespeicherte Adressen
- **Stripe Webhook Raw Body Fix (ROOT CAUSE):** Custom `rawBodyMiddleware` in `middlewares.ts`. NICHT entfernen — ohne es scheitern ALLE Webhooks.
- **Password Reset:** "Forgot password?" → Resend E-Mail → `/reset-password?token=...`

### 2026-03-11 — Catalog Visibility Redesign

- **Neue Logik:** Artikel mit mindestens 1 Bild = sichtbar. Preis bestimmt nur Kaufbarkeit (`is_purchasable`), nicht Sichtbarkeit.
- **"For Sale" Filter-Toggle:** "All Items" / "For Sale" Segmented Control
- **Geänderte Dateien:** `store/catalog/route.ts`, `store/catalog/[id]/route.ts`, `catalog/page.tsx`, `catalog/[id]/page.tsx`, `page.tsx`, `types/index.ts`

### 2026-03-10 — GitHub Releases + Sharing + Save for Later

- **GitHub Releases:** 9 historische Releases (v0.1.0–v0.9.0). Helper-Script `scripts/create-release.sh`.
- **ShareButton:** Hybrid Mobile/Desktop (native Share Sheet / 6-Option Dropdown: WhatsApp, X, Facebook, Telegram, Email, Copy Link)
- **Save for Later:** `saved_item` Medusa DML Model, Heart-Icon, Account-Seite `/account/saved`, Header-Badge
- **Dynamischer Release-Count:** Homepage Catalog-Teaser fetcht echten Count via `/store/catalog?limit=0`

### 2026-03-09 — ReleaseArtist-Bereinigung + Discogs Extraartists

- **Garbage Cleanup:** 60 Fake-Artists, 10.170 Garbage-Links entfernt, 10.765 behalten
- **Extraartists Import:** 16.590 Releases via Discogs API → `extraartists` → ReleaseArtist mit Rollen. `import_discogs_extraartists.py` (resumable, ~9h)
- **Discogs Prices & Links auf Storefront ausgeblendet:** `{/* HIDDEN: ... */}` Marker in 5 Dateien. Wiederherstellbar.
- **Admin User Fix:** `frank@vinyl-on-demand.com` — `app_metadata` manuell auf korrekte `user_id` gesetzt
- **Admin-Subdomain** `admin.vod-auctions.com` eingerichtet (nginx, SSL Let's Encrypt)
- **Pre-Launch Password Gate:** `middleware.ts`, `gate/page.tsx`, `api/gate/route.ts`. Passwort `vod2026`. Entfernen beim Launch: `middleware.ts` löschen + `layout.tsx` Cookie-Check entfernen.
- **Label Enrichment:** 7.002 Releases enriched, 2.829 neue Labels. `validate_labels.py` 3-Phasen-Pipeline. `label_enriched` schützt Labels vor `legacy_sync.py` Override.

### 2026-03-08 — Direct Purchase geöffnet + Image Ordering + CMS

- **Direct Purchase für alle User:** `hasWonAuction`-Gate entfernt. 13.571 Releases auf `sale_mode=direct_purchase` aktiviert.
- **Image Ordering Fix:** `rang` Spalte auf Image-Tabelle. `ORDER BY rang ASC, id ASC` in Catalog + Admin APIs. 4.593 Releases korrigiert.
- **CMS On-Demand Revalidation:** Backend CMS-Save → `POST /api/revalidate` auf Storefront
- **Google Search Console:** Domain `vod-auctions.com` verifiziert, Sitemap eingereicht
- **Catalog Filter Redesign:** 5 → 7 Kategorien (Tapes, Vinyl, CD, VHS + 3 Lit). Format-Subfilter.
- **Literature Image Regression Fix:** `bilder_typ` Mapping in `legacy_sync.py` korrigiert (label_lit 15→14, press_lit 14→12)

### 2026-03-07 — "Vinyl Groove" Design + CRM + Newsletter

- **Concept C "Vinyl Groove":** Gold Gradient Left-Border, DM Serif Display Headers, Tracklist Side A/B, CreditsTable Komponente
- **RSE-128-131,133,138:** Newsletter Opt-in, Brevo Templates (IDs 2-5), Brevo Webhook Handler, Datenschutz-Erweiterung, CRM Dashboard `/admin/customers`
- **Moreinfo Parser:** `fix_moreinfo_comprehensive.py` — 6 Format-Varianten. +463 Tracklists, +91 verbessert.
- **RSE-125/126/127: Brevo CRM Integration:** API Client `brevo.ts`, Event-Sync `crm-sync.ts` (5 Events), Batch-Import (3.580 tape-mag Kontakte)

### 2026-03-06 — Admin Lightbox + Data Quality + Checkout + Legal + Emails

- **Admin Detail Lightbox:** Fullscreen mit Prev/Next, Tastatur, Thumbnails
- **Catalog URL Persistence:** Filter/Sortierung/Pagination in URL-Query-Params
- **Data Quality Fix:** +3.437 band_lit Bilder. Tracklists (+774 repariert +332 neue). Credits (+1.736 vervollständigt).
- **RSE-77: Smoke-Test bestanden:** Backend online Port 9000, Storefront online Port 3006, SSL valid, Stripe Live-Mode gesetzt
- **RSE-78: Launch-Vorbereitung:** Cookie-Consent-Banner, Sentry Error-Tracking, Stripe Live-Keys deployed
- **RSE-117: CMS Content Management:** `content_block` Tabelle, TipTap Editor, 12 Content-Blocks geseeded
- **RSE-116: About VOD Records:** 9 Sektionen (Founder, Mission, Genres, Artists, Sub-Labels, TAPE-MAG, VOD Fest)
- **RSE-106: Google Analytics:** GA4 `G-M9BJGC5D69`, consent-gated, 7 Event-Tracking-Helpers
- **RSE-105: Legal Pages:** 5 Seiten (Impressum, AGB, Datenschutz, Widerruf, Cookies)
- **RSE-102: Transactional Emails:** 6 HTML-Templates, Resend, `noreply@vod-auctions.com`
- **RSE-103: Shipping Configuration:** 4 DB-Tabellen, Gewichtsbasiert, Admin 4-Tab-Seite

### 2026-03-05 — Direktkauf + Literature + Discogs + 5-Kategorie + UX

- **RSE-111: Direktkauf/Warenkorb:** `cart_item` Modell, Cart API, Combined Checkout, AuthProvider +cartCount. 31 Dateien.
- **Literature Migration:** Format-Tabelle (39 Einträge) + PressOrga (1.983) + 11.370 Lit-Items + ~4.686 Bilder
- **5-Kategorie Filter:** Tapes/Vinyl/Band-Lit/Label-Lit/Press-Lit via Format.typ/kat CASE SQL
- **RSE-115: Sync Dashboard:** `discogs_batch.py` PostgreSQL Rollback Fix. Batch Progress Card (live auto-refresh).
- **RSE-114: Credits Structured Rendering:** `parseCredits()` + `CreditsTable` Komponente
- **RSE-113: Inventory-Verwaltung:** `inventory` INTEGER Spalte
- **RSE-112: Visibility-System:** Ampel-Indikator, Visibility-Filter in Admin Media

### 2026-03-03 — RSE-87–96 (Translation, Article Numbers, Discogs, VPS)

- English Translation (alle UI-Texte auf Englisch)
- Article Numbers VOD-XXXXX (unique, visible in Details)
- Discogs Prices Low/Median/High (backfill abgeschlossen)
- Credits Cleanup (`cleanCredits()` utility)
- VPS Deployment (Backend Port 9000, Storefront Port 3006)
- Cronjobs: Legacy Sync täglich 04:00 UTC, Discogs wöchentlich (später täglich Mo-Fr)

### 2026-02-10 bis 2026-03-02 — Initialer Aufbau (RSE-72 bis RSE-85)

- **RSE-72:** Datenbank vorbereiten (Supabase Schema, RLS, Indexes)
- **RSE-73:** Admin-Panel (Medusa.js 2.x, Auction Blocks CRUD)
- **RSE-74:** Public Frontend (Next.js 16, Storefront)
- **RSE-75:** Bidding-Engine (Proxy-Bid, Supabase Realtime, Auction Lifecycle Cron)
- **RSE-76:** Stripe Payment Integration (Checkout Session, Webhook, Flat-Rate Versand)
- **RSE-83:** Medusa.js Projekt-Setup & Konfiguration
- **RSE-84:** UX Polish & Auktions-Workflow
- **RSE-85:** Storefront UX Redesign
- Legacy MySQL Migration: 12.451 Artists, 3.077 Labels, ~41.529 Releases, ~75.124 Images aus vodtapes DB
