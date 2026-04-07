# Inventur Cohort A + Bulk +15% — erste Aktivierung des ERP_INVENTORY Moduls

**Version:** 3.0
**Erstellt:** 2026-04-05 | **Aktualisiert:** 2026-04-07
**Autor:** Robin Seckler
**Status:** ✅ Implementiert (2026-04-07) — Code deployed, ERP_INVENTORY Flag OFF, wartet auf Aktivierung nach 24h Sync-Check
**Bezug:** `ERP_WARENWIRTSCHAFT_KONZEPT.md` §8.4 / §10 / R2, `SYNC_ROBUSTNESS_PLAN.md` §6, `STAGING_ENVIRONMENT.md`, `DESIGN_GUIDE_BACKEND.md` v2.0, `UI_UX/UI_UX_STYLE_GUIDE.md`
**GitHub Release:** [`v2026.04.07-inventur-cohort-a`](https://github.com/rseckler/VOD_Auctions/releases/tag/v2026.04.07-inventur-cohort-a)

---

## 1. Kontext

Frank hat ~41.500 Legacy-Releases. Nur **~7.407** sind aktuell verkaufbar (Bild + Preis, Cohort A). Vor dem Launch brauchen wir:

1. **Einmaliger Bulk-Preis-Anstieg +15%** auf Cohort A (Margen-Korrektur), gerundet auf **ganze Euro** (Franks Entscheidung F1).
2. **Physische Inventur** auf Cohort A: Ist der Artikel da? Stimmt der neue Preis, oder muss er individuell angepasst werden? Nicht auffindbare Artikel bekommen **Preis = 0** und bleiben im Katalog für spätere Reaktivierung (Franks Entscheidung F2).
3. **Sync-Schutz**: Verifizierte Artikel dürfen vom stündlichen `legacy_sync_v2.py` nicht mehr überschrieben werden (`price_locked`).
4. **Effizienter Workflow**: Single-Item-Review-Screen mit Tastatur-Shortcuts, sortiert nach **Format-Gruppe** (Vinyl → Tape → Print → Other), dann alphabetisch (Franks Entscheidung F5). Zeitraum: 4-6 Wochen (F6).

**Reihenfolge (bestätigt):** Erst Bulk +15%, dann Inventur. Die Inventur lockt dann pro Item den neuen Preis oder korrigiert ihn erneut.

## 2. Architektur-Entscheidung: ERP_INVENTORY first activation

Statt Ad-hoc-Spalten auf `Release` wird dies die **erste operative Aktivierung des ERP-Inventory-Moduls** gemäß `ERP_WARENWIRTSCHAFT_KONZEPT.md` §10 / §8.4 / R2-Risk.

**Warum:**
- §2.2 listet Inventur explizit als Gap, der durch `inventory_item` geschlossen wird. R2 (Bestand ↔ Realität) nennt „Inventur-Funktion" als Mitigation.
- `inventory_item` + `inventory_movement` sind in §10 bereits spezifiziert (Schema steht, nur nicht deployed).
- Feature-Flag `ERP_INVENTORY` existiert bereits (`backend/src/lib/feature-flags.ts:41`).
- Spalten auf `Release` würden später wieder migriert → doppelte Arbeit. `inventory_item` ist forward-kompatibel mit Kommission, §25a, Marketplace.
- Sync-Ownership wird sauber: `Release.legacy_price` bleibt MySQL-owned, neue Felder liegen in `inventory_item` → keine Sonderfälle im Feld-Contract (§6 SYNC_ROBUSTNESS_PLAN).

**Scope-Minimierung:** Nur Cohort A (7.407 Items) wird migriert. Nicht-Cohort-Releases bleiben außerhalb von `inventory_item` bis zum Gesamt-ERP-Rollout. §14-abhängige Felder (`commission_owner_id`, detaillierte `tax_scheme`, `purchase_price`) bleiben NULL/Default — sie werden in einer späteren Phase gefüllt.

## 3. Datenmodell

### 3.1 Migration 1 — Tabellen anlegen (additive)

Datei: `backend/scripts/migrations/2026-04-06_erp_inventory_bootstrap.sql`

- `CREATE TABLE inventory_item (…)` exakt wie §10 ERP-Konzept (Zeilen 1683–1737), mit **einer Erweiterung** (vier zusätzliche Spalten für den Stocktake-Workflow):
  ```
  price_locked BOOLEAN NOT NULL DEFAULT false,
  price_locked_at TIMESTAMPTZ,
  last_stocktake_at TIMESTAMPTZ,
  last_stocktake_by TEXT
  ```
  Diese vier Felder gehören fachlich zur Bestandseinheit und sind in §10 nicht enthalten — werden hinzugefügt, ERP-Konzept §10 entsprechend annotiert.
- `CREATE TABLE inventory_movement (…)` exakt wie §10 (Zeilen 1746–1776).
- `CREATE TABLE bulk_price_adjustment_log (id, executed_at, executed_by, percentage, affected_rows, status, notes)` für Bulk-Idempotenz.
- Alle Indizes aus §10.
- **`commission_owner`-FK**: Da `commission_owner` noch nicht existiert, Constraint komplett weglassen. `commission_owner_id` bleibt TEXT NULLABLE. FK wird in einer späteren §14-Migration nachgezogen. Dokumentiert in Migration-Kopfkommentar.

### 3.2 Migration 2 — Bestands-Backfill Cohort A

Script: `scripts/erp/backfill_inventory_cohort_a.py` (idempotent, `--dry-run`, `--pg-url`)

```sql
INSERT INTO inventory_item (id, release_id, source, status, quantity, tax_scheme, created_at, updated_at)
SELECT generate_ulid(), r.id, 'frank_collection', 'in_stock', 1, 'margin_scheme_25a', NOW(), NOW()
FROM "Release" r
WHERE r."coverImage" IS NOT NULL
  AND r.legacy_price > 0
  AND r.legacy_available = true
  AND NOT EXISTS (SELECT 1 FROM inventory_item ii WHERE ii.release_id = r.id);
-- Erwartete Zeilen: ~7.407

INSERT INTO inventory_movement (id, inventory_item_id, type, quantity_change, reason, performed_by)
SELECT generate_ulid(), ii.id, 'inbound', 1, 'Initial backfill Cohort A (2026-04-06)', 'system'
FROM inventory_item ii
WHERE ii.source = 'frank_collection'
  AND NOT EXISTS (SELECT 1 FROM inventory_movement m WHERE m.inventory_item_id = ii.id AND m.type = 'inbound');
```

ULID via `generateEntityId()` (Python-Äquivalent oder TS-Helper-Endpoint). Idempotenz über `NOT EXISTS`.

### 3.3 Read-Path Integration

- **Storefront Catalog** (`backend/src/api/store/catalog/route.ts` + `[id]/route.ts`): Catalog-Query ergänzt um LEFT JOIN auf `inventory_item` und Filter `AND (ii.id IS NULL OR ii.status NOT IN ('written_off','damaged'))`. Releases ohne `inventory_item`-Row (Cohort B/C) bleiben unberührt (LEFT JOIN + IS NULL).
- **Admin Media/Catalog Liste**: keine Änderung — bleibt reines Release-View.

## 4. Sync-Schutz (`scripts/legacy_sync_v2.py`)

- Nach dem Diff-Build (aktuell Zeilen ~636–648) vor dem `UPDATE`: fetch `SELECT release_id FROM inventory_item WHERE price_locked = true` → Set in Memory.
- Für jede Release-ID in diesem Set: `legacy_price` aus dem Update-Set entfernen (auch aus `sync_change_log`-Diff, damit Log nicht lügt).
- Feld-Contract in `SYNC_ROBUSTNESS_PLAN.md` §6.1 Tabelle ergänzen:
  - `Release.legacy_price` → Owner MySQL **außer** `inventory_item.price_locked=true` (Override)
  - Neue Zeile: `inventory_item.*` → Owner Admin, Sync ignoriert
- Post-Run-Validation **V5** (neu): `SELECT COUNT(*) FROM sync_change_log WHERE run_id=? AND field='legacy_price' AND release_id IN (SELECT release_id FROM inventory_item WHERE price_locked)` muss 0 sein, sonst `validation_status='failed'`.

## 5. Bulk +15% Schalter

**Entscheidung Frank (F1):** 15% statt 20%, auf **ganze Euro** runden. Beispiele: €10 → €12, €50 → €58, €179 → €206.

**Route:** `backend/src/api/admin/erp/inventory/bulk-price-adjust/route.ts`

- `GET` → Preview
  ```json
  {
    "eligible_count": 7407,
    "already_executed": null,
    "percentage": 15,
    "sample": [{ "release_id": "...", "artist": "...", "title": "...", "old_price": 50.00, "new_price": 58 }]
  }
  ```
  Eligibility: `inventory_item.source='frank_collection' AND price_locked=false AND status='in_stock'` verknüpft mit `Release.legacy_price > 0`.

- `POST { percentage: 15, confirmation: "RAISE PRICES 15 PERCENT" }`
  - Confirmation-String exakt matchen (Typo-Schutz) — analog `backend/src/api/admin/auction-blocks/[id]/items/bulk-price/route.ts`.
  - Idempotenz: `SELECT 1 FROM bulk_price_adjustment_log WHERE status='success'` → 409 wenn bereits ausgeführt.
  - Transaction:
    1. `INSERT bulk_price_adjustment_log (..., status='running')`
    2. `UPDATE "Release" SET legacy_price = ROUND(legacy_price * 1.15, 0) WHERE id IN (<eligible IDs>)` — `ROUND(x, 0)` = ganze Euro
    3. Für jedes betroffene Release: `INSERT inventory_movement type='adjustment', reason='bulk_15pct_2026'` — lückenlose Audit-Trail (7.400 Movements)
    4. `UPDATE bulk_price_adjustment_log SET affected_rows=?, status='success'`
  - **Zuerst auf Staging** (`aebcwjjcextzvflrjgei`, `STAGING_ENVIRONMENT.md` Runbook) mit eigenem Log-Eintrag testen.

- Audit: `executed_by` = Admin-Email aus Session.

## 6. Inventur-Workflow (Admin UI)

**Governance:** Strict nach `DESIGN_GUIDE_BACKEND.md` v2.0 + `UI_UX/UI_UX_STYLE_GUIDE.md`. **Nur** Shared Components aus `backend/src/admin/components/{admin-ui,admin-layout,admin-tokens}.tsx`. Keine hardcoded Farben/Spacing — alles über `C`, `T`, `S` Tokens. `PageHeader` verpflichtend. `UI_UX/PR_CHECKLIST.md` abarbeiten vor Merge.

### 6.1 Routen

Admin-Sidebar hat 7 fixe Hubs (Dashboard, Auction Blocks, Orders, Catalog, Marketing, Operations, AI Assistant). Neuer Bereich wird als **Card im Operations-Hub** hinzugefügt, kein neues Sidebar-Item.

URL-Prefix `/app/erp/*` (reserviert per `CLAUDE.md` „Deployment Methodology" — erste Nutzung).

| Route | Datei | `defineRouteConfig`? |
|---|---|---|
| `/app/erp/inventory` | `backend/src/admin/routes/erp/inventory/page.tsx` | **nein** (Sub-Page, Operations-Hub verlinkt) |
| `/app/erp/inventory/session` | `backend/src/admin/routes/erp/inventory/session/page.tsx` | nein |

Operations-Hub bekommt Card „Inventory Stocktake" mit Link.

### 6.2 Hub `/app/erp/inventory`

Komponenten: `PageHeader`, `SectionHeader`, `StatsGrid`, `Btn`, `Modal`, `Toast`.

- **Header:** Title „Inventory Stocktake", Subtitle „Cohort A — 7.407 items with image and price".
- **StatsGrid (4 Stats):** Total eligible · Verified · Missing · Remaining. Progress-Bar darunter.
- **Section „Bulk Price Adjustment":** Card mit aktuellem Status (ausgeführt / nicht ausgeführt), Button „Preview +20%" → Modal mit Sample-Table (20 Rows) und Confirmation-Input. Wenn bereits ausgeführt: readonly Badge „Executed on <date> by <admin>, 7407 rows".
- **Section „Stocktake Session":** Card mit Button „Start Session" → `/app/erp/inventory/session`.
- **Section „Export":** Button „Export Report (CSV)" → GET `/admin/erp/inventory/export?status=all|verified|missing`.

### 6.3 Session `/app/erp/inventory/session` — Kernstück

Layout: Full-width, keine Sidebar-Nav im Content-Bereich. Max-width aus `S.pageMaxWidth`.

```
┌──────────────────────────────────────────────────────────────┐
│  PageHeader: "Stocktake Session"    Progress: 234/7407 (42%) │
│                                     [Exit Session]           │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ARTIST NAME                               │
│  │             │   Release Title                             │
│  │   Cover     │   Cat #: VOD-123 · Label · Format · Year    │
│  │   Image     │                                             │
│  │   (400px)   │   Price before +20%:  €12.00                │
│  │             │   Current price:      €14.40                │
│  └─────────────┘                                             │
│                     ┌─ New price ─────────┐                  │
│                     │  14.40         €    │                  │
│                     └─────────────────────┘                  │
│                                                              │
│   [V] Verify   [P] Adjust Price   [M] Missing   [S] Skip    │
│   [N] Note     [←] Prev   [→] Next                          │
└──────────────────────────────────────────────────────────────┘
```

**Keyboard Shortcuts** (useEffect+keydown, Muster aus `media/page.tsx:175-183`):

| Key | Aktion |
|---|---|
| `V` | Verify mit aktuellem Preis → `POST /admin/erp/inventory/items/:id/verify` (keine Preisänderung) → nächstes Item |
| `P` | Preis-Input fokussieren; Enter = Verify mit neuem Preis → nächstes |
| `M` | Missing → `POST .../missing` → nächstes |
| `S` | Skip (keine DB-Änderung, Cursor weiterschieben) |
| `N` | Notiz-Modal → `POST .../note`, Status unverändert |
| `U` | Undo last action → `POST .../items/:id/reset` |
| `←` / `→` | Navigation ohne Änderung |
| `Esc` | Exit-Confirmation-Modal |

**Queue:** `GET /admin/erp/inventory/queue?cursor=<last_id>&limit=50` → stable Sort `ORDER BY r."artistName", r.title, r.id`. Bei Index 40 prefetch next batch. Cursor in URL (`?cursor=<id>`) → Refresh-safe / resumable.

**Toast-Feedback** (aus `admin-ui.tsx`): 2.5s success toast „Verified · Next item loaded".

## 7. API-Endpoints (`backend/src/api/admin/erp/inventory/`)

| Method | Path | Body / Query | Effekt |
|---|---|---|---|
| GET | `/stats` | — | `{ eligible, verified, missing, remaining, bulk_status }` |
| GET | `/queue` | `?cursor=&limit=50` | Items mit `inventory_item.last_stocktake_at IS NULL` + Release-Details |
| POST | `/items/:id/verify` | `{ new_price?, notes? }` | `UPDATE inventory_item SET last_stocktake_at=NOW(), last_stocktake_by=<admin>, price_locked=true`; falls `new_price`: `UPDATE "Release" SET legacy_price=?`; `INSERT inventory_movement type='adjustment', reason='stocktake_verify'` |
| POST | `/items/:id/missing` | `{ notes? }` | `UPDATE inventory_item SET status='written_off', last_stocktake_at=NOW()...`; `INSERT inventory_movement type='write_off', reason='stocktake_missing'` |
| POST | `/items/:id/note` | `{ notes }` | `UPDATE inventory_item SET notes=?` (append), kein Status-Change, kein Movement |
| POST | `/items/:id/reset` | — | Undo: `price_locked=false, status='in_stock', last_stocktake_at=NULL`; `INSERT inventory_movement type='adjustment', reason='stocktake_undo'` |
| GET | `/bulk-price-adjust` | — | Preview (§5) |
| POST | `/bulk-price-adjust` | `{ percentage, confirmation }` | Bulk-Execute (§5) |
| GET | `/export` | `?status=` | CSV Download (BOM, Excel-kompat wie `/admin/customers/export`) |

**Invariante aus ERP-Konzept §10:** Jede `inventory_item.status`-Änderung MUSS von einem `inventory_movement` begleitet sein. Alle POST-Routes wickeln das in einer Transaction ab.

**Auth:** Bestehende Admin-Middleware. Feature-Flag-Gate: `requireFeatureFlag('ERP_INVENTORY')` vor allen `/admin/erp/inventory/*`-Routen. Flag muss vor Session-Start via `/app/config` → Feature Flags aktiviert werden.

## 8. Betroffene / neue Dateien

**Neu:**
- `backend/scripts/migrations/2026-04-06_erp_inventory_bootstrap.sql`
- `scripts/erp/backfill_inventory_cohort_a.py`
- `backend/src/api/admin/erp/inventory/stats/route.ts`
- `backend/src/api/admin/erp/inventory/queue/route.ts`
- `backend/src/api/admin/erp/inventory/items/[id]/verify/route.ts`
- `backend/src/api/admin/erp/inventory/items/[id]/missing/route.ts`
- `backend/src/api/admin/erp/inventory/items/[id]/note/route.ts`
- `backend/src/api/admin/erp/inventory/items/[id]/reset/route.ts`
- `backend/src/api/admin/erp/inventory/bulk-price-adjust/route.ts`
- `backend/src/api/admin/erp/inventory/export/route.ts`
- `backend/src/admin/routes/erp/inventory/page.tsx`
- `backend/src/admin/routes/erp/inventory/session/page.tsx`
- `backend/src/lib/inventory.ts` (Helper: `createMovement()`, `lockPrice()`, `requireFeatureFlag('ERP_INVENTORY')`)

**Zu modifizieren:**
- `scripts/legacy_sync_v2.py` — Sync-Schutz + V5-Validation (§4)
- `backend/src/api/store/catalog/route.ts` + `[id]/route.ts` — LEFT JOIN `inventory_item`, Filter `written_off/damaged`
- `docs/architecture/SYNC_ROBUSTNESS_PLAN.md` — §6 Feld-Contract erweitern
- `docs/optimizing/ERP_WARENWIRTSCHAFT_KONZEPT.md` — §10 Annotation: `price_locked*`, `last_stocktake_*` in `inventory_item` ergänzt
- `CLAUDE.md` — neuer Abschnitt „ERP Module Status": ERP_INVENTORY aktiviert für Cohort A Stocktake
- Operations-Hub-Page: Card „Inventory Stocktake" hinzufügen

**Wiederverwendet (nicht ändern):**
- `backend/src/admin/components/admin-ui.tsx` — `Btn`, `Modal`, `Toast`, `Input`, `Badge`, `Alert`
- `backend/src/admin/components/admin-layout.tsx` — `PageHeader`, `SectionHeader`, `PageShell`, `StatsGrid`
- `backend/src/admin/components/admin-tokens.ts` — `C`, `T`, `S`
- `backend/src/api/admin/auction-blocks/[id]/items/bulk-price/route.ts` — Referenz-Pattern für Bulk-Route
- `backend/src/lib/feature-flags.ts` — `ERP_INVENTORY` Flag
- Keyboard-Handler-Muster aus `backend/src/admin/routes/media/page.tsx:175-183`

## 9. Verification Plan

Alle destruktiven Schritte **erst auf Staging** (`aebcwjjcextzvflrjgei`, eu-west-1, Session-Pooler laut `STAGING_ENVIRONMENT.md` §Runbook).

1. **Migration 1 (Staging):** `psql $STAGING_POOLER_URL -f backend/scripts/migrations/2026-04-06_erp_inventory_bootstrap.sql` → `\d inventory_item` / `\d inventory_movement` / `\d bulk_price_adjustment_log` zeigen korrekte Columns + Indices.
2. **Backfill (Staging dry-run):** `python3 scripts/erp/backfill_inventory_cohort_a.py --dry-run --pg-url $STAGING_POOLER_URL` → meldet „would insert ~7400 inventory_item rows". Dann real: exakt 7400±50 `inventory_item` + gleiche Anzahl `inventory_movement type='inbound'`. Zweiter Lauf → 0 neue Rows (Idempotenz).
3. **Sync-Schutz (Staging):** Ein Test-Item `UPDATE inventory_item SET price_locked=true WHERE release_id='legacy-release-1234'`. Dann `python3 scripts/legacy_sync_v2.py --dry-run --pg-url $STAGING_POOLER_URL`. Log darf kein `legacy_price`-Update für diese Release-ID zeigen. V5-Validation läuft auf „passed".
4. **Bulk-Preview:** `GET /admin/erp/inventory/bulk-price-adjust` (via lokalem Backend + Staging-DATABASE_URL) → `eligible_count≈7400`, Sample-Rows zeigen old×1.20 = new.
5. **Bulk-Execute (Staging):** POST mit korrektem Confirmation-String → 200, `affected_rows≈7400`. Stichprobe: 10 Release-Rows per SQL geprüft → `legacy_price` exakt ×1.20 (gerundet). Zweiter POST → 409 Conflict (Idempotenz).
6. **Session-Flow (Staging+Local Admin):** `/app/erp/inventory/session` → erstes Item lädt, `V` → Progress +1, Toast „Verified". Refresh mit URL-Cursor → gleiche Queue-Position. `M` auf Test-Item → Storefront `/store/catalog` zeigt Item nicht mehr; `/store/catalog/<id>` → 404.
7. **Sync-Run nach Session:** `python3 scripts/legacy_sync_v2.py --pg-url $STAGING_POOLER_URL` → `sync_change_log` zeigt keinen `legacy_price`-Eintrag für verifizierte Release-IDs.
8. **CSV-Export:** `GET /admin/erp/inventory/export?status=verified` → CSV mit Header, BOM, Excel öffnet korrekt.
9. **Production-Deploy** nach Staging-Freigabe: komplette Deploy-Sequenz aus `CLAUDE.md` (Vite-Cache clean, `medusa build`, `cp admin`, `.env` Symlink, PM2 restart).

**Reihenfolge Production:** Migration → Backfill → Feature-Flag `ERP_INVENTORY` im Admin aktivieren → Bulk +20% ausführen → Frank startet Inventur-Session.

## 10. PR-Checklist (vor Merge)

- [ ] Alle neuen Admin-Komponenten nutzen `C`/`T`/`S` Tokens, `PageHeader`, `Btn`, `Modal`, `Toast` — keine hardcoded Farben/Spacing (UI_UX_STYLE_GUIDE §Tokens)
- [ ] Keine `defineRouteConfig` auf Session-Page; Einstieg nur über Operations-Hub-Card
- [ ] Feld-Contract in `SYNC_ROBUSTNESS_PLAN.md` §6 aktualisiert (§4)
- [ ] V5-Validation in `legacy_sync_v2.py` implementiert und auf Staging grün
- [ ] Bulk-Route: Confirmation-String exakt, Idempotenz über `bulk_price_adjustment_log`, Transaction-Wrap
- [ ] Jede `inventory_item.status`-Änderung erzeugt `inventory_movement` (ERP §10 Invariante)
- [ ] Feature-Flag-Gate `ERP_INVENTORY` auf allen neuen Admin-Routes
- [ ] Staging-Dry-Run dokumentiert in PR-Description (Row-Counts vor/nach)
- [ ] CLAUDE.md aktualisiert (ERP Module Status)
- [ ] `docs/UI_UX/PR_CHECKLIST.md` vollständig abgehakt

## 11. Franks Antworten (beantwortet 2026-04-07)

### F1 — Preiserhöhung: +15%, ganze Euro ✅

**Antwort:** „Lass uns 15% machen, 20 ist glaub zuviel. Und bitte auf ganze Zahlen auf/abrunden."

**Technische Umsetzung:** `ROUND(legacy_price * 1.15, 0)`. Postgres `ROUND(x, 0)` rundet kaufmännisch (0.5 auf). Beispiele: €10→€12, €50→€58, €179→€206. Confirmation-String: `"RAISE PRICES 15 PERCENT"`. §5 entsprechend aktualisiert.

### F2 — Missing: Preis auf 0, im Shop behalten ✅

**Antwort:** „Aus dem Shop NICHT entfernen, nur Preis auf 0 setzen! Da ich ja Sammlungen kaufe und der Artikel dann ohnehin wieder rein kommt, dann kann ich einfach wieder frei schalten."

**Technische Umsetzung:** Kein `status='written_off'`. Stattdessen: `Release.legacy_price = 0` + `inventory_item.price_locked = true`. Item bleibt im Katalog, ist aber nicht kaufbar (`is_purchasable = legacy_price > 0`, Zeile 365 in `store/catalog/route.ts`). Beim Reaktivieren: `price_locked = false` → nächster Sync schreibt den MySQL-Preis. **Null Storefront-Code-Änderungen nötig** — bestehende `is_purchasable`-Logik reicht. Alter Preis wird in `inventory_movement.reference` als JSON gespeichert für Undo.

### F3 — Missing-Grund: Optional, kein Dropdown ✅

**Antwort:** „Nein, kein Grund, für wen soll der Grund sein? Intern?"

**Technische Umsetzung:** Optionaler Freitext über `N` (Note) Taste. Kein Pflicht-Dropdown, kein Grund-Feld. Vereinfacht den Missing-Flow auf einen Tastendruck (`M` → optional Note → nächstes Item).

### F4 — Discogs-Preise: Ja, mit Link zu Marketplace ✅

**Antwort:** „Ja Discogs Preis hilft immer aber muss sich Preis-Historie (Chart) ansehen und Zustände anschauen sonst nützt der Preis nichts, auch nicht mal der Median."

**Technische Umsetzung:** Discogs-Felder (`discogs_lowest_price`, `discogs_median_price`, `discogs_highest_price`, `discogs_num_for_sale`) per LEFT JOIN im Queue-Query. Zusätzlich: **Link zu `https://www.discogs.com/release/{discogs_id}`** (neuer Tab) — dort kann Frank die vollständige Marketplace-Seite mit Preis-Historie, Zustands-Listings und Trends sehen. Kein eigener Chart im MVP (keine historischen Daten in Supabase). Wenn `discogs_id` NULL: "No Discogs data".

### F5 — Reihenfolge: Format-Gruppe → Alphabet ✅

**Antwort:** „Nach Format: Vinyl (inkl. Subarten wie 7inch, 10", LP, LP-2….), Tape (inkl. Sub-Formate wie Reels, Tape-2, Tape-3), Magazin (inkl. Subformate wie Poster etc…) und dann nach Alphabet."

**Technische Umsetzung:**
```sql
ORDER BY 
  CASE 
    WHEN "Release".format = 'LP' THEN 1                                              -- Vinyl
    WHEN "Release".format IN ('CASSETTE', 'REEL') THEN 2                             -- Tape
    WHEN "Release".format IN ('MAGAZINE', 'BOOK', 'ZINE', 'POSTER', 'PHOTO', 'POSTCARD') THEN 3  -- Print
    ELSE 4                                                                            -- Other (CD, VHS, etc.)
  END,
  "Artist".name ASC NULLS LAST,
  "Release".title ASC
```
Progress-Bar im Session-Screen zeigt Format-Gruppen-Breakdown: „Vinyl: 234/3200 | Tape: 0/2800 | Print: 0/1000 | Other: 0/407"

### F6 — Zeitraum: 4-6 Wochen ✅

**Antwort:** „4-6 Wochen."

**Technische Umsetzung:** URL-basierter Cursor (`?cursor=<id>&pos=234`) für jederzeit pausier- und resumebare Sessions. Prefetch nächste 50 Items bei Position 40. Browser-Refresh = gleiche Position. Kein Zeitdruck im Code (keine Timeout-Logik).

### F7 — Keine Ausschlüsse ✅

**Antwort:** „Nein, meine Privaten sind da noch mit Preis 0 und noch nicht zum Verkauf."

**Technische Umsetzung:** Keine Filter-Änderung. `WHERE legacy_price > 0` schließt Franks Privat-Artikel automatisch aus (Preis=0). Die ~7.407 Cohort-A Items sind exakt die verkaufbaren.

---

## 12. Technische Entscheidungen (aufgelöst)

Alle fünf offenen Punkte aus der v1-Fassung sind durch Franks Antworten und architektonische Analyse aufgelöst:

| Punkt | Entscheidung | Begründung |
|---|---|---|
| **Discogs-Preis im Session** | ✅ Ja, JOIN einbauen + Link zu Discogs-Seite | F4: Frank will Preise + Trends sehen. Link zu Discogs-Marketplace statt eigenem Chart (keine historischen Daten). |
| **Audit-Tiefe Bulk** | ✅ Ja, Movement pro Release | `inventory_movement type='adjustment' reason='bulk_15pct_2026'` für jede der ~7.400 Releases. 7.400 Rows, ~1 MB, lückenlose Audit-Trail. |
| **Missing-Status** | ✅ Kein eigener Status | F2: `legacy_price=0 + price_locked=true`. Status bleibt `in_stock`. `is_purchasable`-Logik der Storefront erledigt das. Kein `written_off`. |
| **Sortierung** | ✅ Format-Gruppe → Artist → Title | F5: `CASE WHEN format='LP' THEN 1 WHEN format IN ('CASSETTE','REEL') THEN 2 WHEN format IN (...print...) THEN 3 ELSE 4 END, artist, title` |
| **Cohort B/C** | ⏸ Separat, nach A | Gleicher Workflow, andere WHERE-Klausel. Nicht Teil dieses PRs. |

---

## 13. Implementierungs-Status (2026-04-07)

### Abweichungen vom Konzept v1.0 bei der Implementierung

| Punkt | Konzept v1.0 | Implementierung | Grund |
|---|---|---|---|
| **Cohort-A-Größe** | ~7.407 Items | **13.107 Items** (10.762 Musik + 2.345 Literatur) | Konzept zählte nur Musik, aber Franks F5 nennt "Magazin" als Format-Gruppe → Literatur gehört dazu |
| **Tabellennamen** | `inventory_item`, `inventory_movement` | **`erp_inventory_item`**, **`erp_inventory_movement`** | Medusa hat eine native `inventory_item` Tabelle (aus `@medusajs/inventory` Modul). `erp_` Prefix vermeidet Kollision. Gleicher Fehlertyp wie `/admin/feature-flags` Route-Kollision. |
| **Missing-Mechanik** | `status='written_off'` + Storefront-Filter | **`legacy_price=0` + `price_locked=true`**, Status bleibt `in_stock` | F2: Franks Wunsch. Vereinfacht Storefront massiv — bestehende `is_purchasable`-Logik (`legacy_price > 0`) deckt es ab. Null Storefront-Code-Änderungen. |
| **Undo bei Missing** | Nicht spezifiziert | Alter Preis in `erp_inventory_movement.reference` als JSON gespeichert | Reset-Route liest den alten Preis aus dem Movement und stellt ihn wieder her |
| **Queue-Cursor** | `?cursor=<release_id>` mit composite comparison | Vereinfacht: Queue gibt immer `WHERE last_stocktake_at IS NULL` zurück, kein expliziter Cursor nötig | Bei Refresh/Resume holt der Client einfach die nächsten unbearbeiteten Items. Simpler, gleicher Effekt. |

### Implementierte Dateien

**Neue Dateien (14):**
```
backend/scripts/migrations/2026-04-07_erp_inventory_bootstrap.sql
scripts/erp/backfill_inventory_cohort_a.py
backend/src/lib/inventory.ts
backend/src/api/admin/erp/inventory/stats/route.ts
backend/src/api/admin/erp/inventory/bulk-price-adjust/route.ts
backend/src/api/admin/erp/inventory/queue/route.ts
backend/src/api/admin/erp/inventory/items/[id]/verify/route.ts
backend/src/api/admin/erp/inventory/items/[id]/missing/route.ts
backend/src/api/admin/erp/inventory/items/[id]/note/route.ts
backend/src/api/admin/erp/inventory/items/[id]/reset/route.ts
backend/src/api/admin/erp/inventory/export/route.ts
backend/src/admin/routes/erp/inventory/page.tsx
backend/src/admin/routes/erp/inventory/session/page.tsx
```

**Modifizierte Dateien (3):**
```
scripts/legacy_sync_v2.py                          (Sync-Schutz: ON CONFLICT guard + Diff-Exclusion + V5)
backend/src/admin/routes/operations/page.tsx       (HubCard "Inventory Stocktake")
CLAUDE.md                                          (Medusa-Tabellen-Gotcha + ERP Module Status)
```

### Phasen-Status

| Phase | Inhalt | Status | Commit |
|---|---|---|---|
| 1a | Migration SQL + Backfill 13.107 Items | ✅ Production | `ef27907`, `3e3739b` |
| 1b | Sync-Schutz (ON CONFLICT + Diff + V5) | ✅ Production, verifiziert | `b99ede7` |
| 2 | Bulk +15% Route + Helper + Stats API | ✅ Deployed (Flag OFF) | `219e3f9` |
| 3a | 6 Session-API-Routes | ✅ Deployed (Flag OFF) | `28ecc10` |
| 3b+4 | Hub Page + Session Screen | ✅ Deployed (Flag OFF) | `e996e6c` |
| Finalisierung | Ops-Hub-Card + CLAUDE.md + CHANGELOG + Release | ✅ Deployed | `92fdcb7` |

### DB-Stand auf Production (2026-04-07)

```
erp_inventory_item:        13.107 Zeilen (alle source='frank_collection', status='in_stock', price_locked=false)
erp_inventory_movement:    13.107 Zeilen (alle type='inbound', reason='Initial backfill Cohort A')
bulk_price_adjustment_log: 0 Zeilen (Bulk +15% noch nicht ausgeführt)
```

### Verifikationen durchgeführt

| Test | Ergebnis |
|---|---|
| Migration auf Staging | ✅ 3 Tabellen + 10 Indizes |
| Migration auf Production | ✅ |
| Backfill Dry-Run | ✅ 13.107 Items erwartet |
| Backfill Real | ✅ 13.107 Items + 13.107 Movements in 3s |
| Backfill Idempotenz | ✅ Zweiter Lauf = 0 neue Rows |
| Sync-Schutz: price_locked Test-Item | ✅ Preis-Mismatch €9↔€99 überlebt Dry-Run |
| Sync-Schutz: V5 Validation | ✅ Keine price_locked Violations |
| TypeScript Type-Check | ✅ 0 neue Errors in allen 14 neuen Dateien |
| VPS Deploy (Build + Admin Assets + PM2) | ✅ |
| Medusa-Tabellen-Kollision entdeckt + behoben | ✅ `erp_*` Prefix |

### Aktivierungs-Checkliste (nächster Schritt)

**Voraussetzung:** 24h stabiler Sync mit dem neuen Schutz (V5 darf nie "failed" zeigen).

- [ ] **Sync-Check:** `/app/sync` → Legacy MySQL Sync → alle Runs seit 07.04. abends zeigen `script_version = legacy_sync.py v2.0.0` und `phase = success`
- [ ] **Flag aktivieren:** `/app/config` → Feature Flags → `ERP_INVENTORY` → ON
- [ ] **Bulk +15% Preview:** `/app/erp/inventory` → "Preview +15%" → Sample-Tabelle prüfen (ganze Euro)
- [ ] **Bulk +15% Execute:** Confirmation `RAISE PRICES 15 PERCENT` → Execute
- [ ] **Spot-Check:** 10 zufällige Releases in Supabase prüfen: `legacy_price = ROUND(alter_preis * 1.15, 0)`
- [ ] **Frank informieren:** Session-URL `/app/erp/inventory/session`, Keyboard-Shortcuts erklären
- [ ] **Erster Test-Durchlauf:** Frank verifiziert 5-10 Items, markiert 1-2 als Missing, testet Undo
- [ ] **Sync nach Frank-Test:** Nächster stündlicher Sync darf verifizierte Preise NICHT überschreiben (V5 passed)

**E-Mail-Reminder** für diesen Check liegt als Draft in Gmail (`rseckler@gmail.com`).

---

## 14. Barcode-Labeling in der Inventur (v3.0, 2026-04-07)

### 14.1 Motivation

Die Inventur-Phase ist der ideale Zeitpunkt, um **jeden Artikel mit einem Barcode-Kleber zu versehen**. Frank geht ohnehin alle 13.107 Cohort-A-Items einzeln durch — wenn bei jedem Verify automatisch ein Barcode-Label gedruckt und aufgeklebt wird, ist die gesamte Sammlung nach der Inventur barcoded und scanbar. Das spart eine separate Etikettier-Phase und bereitet den Live-Betrieb optimal vor.

**Nutzen nach der Inventur:**
- **Schnelles Auffinden:** Barcode scannen → Artikel sofort im System gefunden (statt manueller Suche nach Artist/Title)
- **Versand-Workflow:** Besteller Artikel scannen → Order verknüpft → Paketschein drucken
- **Retouren:** Rückläufer scannen → sofort identifiziert + zurückgebucht
- **Zukünftige Inventuren:** Scan statt manueller Durchsicht, 10× schneller

### 14.2 Barcode-Format

**Code128** mit kurzem Nummernkreis:

```
VOD-000001  bis  VOD-041500
```

| Eigenschaft | Wert |
|---|---|
| **Symbologie** | Code128 (ISO/IEC 15417) |
| **Zeichensatz** | `VOD-` Prefix + 6-stellige Nummer (zero-padded) |
| **Gesamtlänge** | 10 Zeichen |
| **Physische Breite** | ~35mm bei Standard-Modulgröße |
| **Menschenlesbar** | Ja — Klartext unter dem Barcode |
| **Eindeutigkeit** | UNIQUE Constraint auf `erp_inventory_item.barcode` |
| **Nummernkreis** | Sequentiell, fortlaufend, nie wiederverwendet |

**Warum Code128 statt EAN-13:**
- EAN-13 ist nur numerisch (13 Ziffern), erfordert GS1-Registrierung
- Code128 ist alphanumerisch, frei verwendbar, kompakter bei Text
- Code128 ist der Standard für interne Lagerverwaltung

**Warum nicht die volle ULID direkt:** 26-Zeichen-ULID = ~80mm breiter Barcode, zu groß für Etiketten. `VOD-XXXXXX` ist ein kompakter Lookup-Key.

### 14.3 Datenmodell-Erweiterung

**Migration:** `2026-04-XX_erp_barcode.sql` (additive, kein Breaking Change)

```sql
-- Barcode-Spalte auf erp_inventory_item
ALTER TABLE erp_inventory_item
  ADD COLUMN barcode TEXT UNIQUE;

-- Index für schnellen Lookup (Scanner-Workflow)
CREATE UNIQUE INDEX idx_erp_inventory_item_barcode 
  ON erp_inventory_item(barcode) WHERE barcode IS NOT NULL;

-- Sequenz für Nummernkreis
CREATE SEQUENCE erp_barcode_seq START WITH 1 INCREMENT BY 1;
```

**Barcode-Generierung:** Beim Verify eines Items (§6.3, Taste `V`) wird automatisch ein Barcode zugewiesen:

```typescript
const nextSeq = await knex.raw("SELECT nextval('erp_barcode_seq') AS seq");
const barcode = `VOD-${String(nextSeq.rows[0].seq).padStart(6, '0')}`;
await knex('erp_inventory_item').where({ id }).update({ barcode });
```

Items die bereits einen Barcode haben (Re-Verify, Undo+Redo), behalten ihren bestehenden Barcode.

### 14.4 Erweiterter Inventur-Workflow

Der bisherige Session-Flow (§6.3) wird um Barcode-Druck erweitert:

```
┌──────────────────────────────────────────────────────────────────┐
│  BISHERIG:  Item anzeigen → V (Verify) → Nächstes Item         │
│                                                                  │
│  NEU:       Item anzeigen → V (Verify) → Label druckt auto →   │
│             Frank klebt Label auf → Nächstes Item               │
│                                                                  │
│  MIT SCANNER (spätere Inventuren / Versand):                    │
│             Scanner piept → Item wird automatisch geladen →     │
│             Verify/Aktion → Label druckt → Nächstes             │
└──────────────────────────────────────────────────────────────────┘
```

**Erweiterung des Session-Screens (§6.3):**

```
┌──────────────────────────────────────────────────────────────────┐
│  PageHeader: "Stocktake Session"    Progress: 234/13107 (1.8%)  │
│  🖨️ Printer: Brother QL-810W [Connected]   [Exit Session]       │
├──────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ARTIST NAME                                  │
│  │             │   Release Title                                │
│  │   Cover     │   Cat #: VOD-123 · Label · Format · Year       │
│  │   Image     │   Barcode: VOD-003241 (oder "wird vergeben")   │
│  │   (400px)   │                                                │
│  │             │   Price before +15%:  €12.00                   │
│  └─────────────┘   Current price:      €14.00                   │
│                     Discogs: Low €8 · Med €15 · High €30        │
│                                                                  │
│                     ┌─ New price ─────────┐                     │
│                     │  14               € │                     │
│                     └─────────────────────┘                     │
│                                                                  │
│   [V] Verify+Print  [P] Price  [M] Missing  [S] Skip           │
│   [N] Note  [L] Reprint Label  [U] Undo  [←] Prev  [→] Next   │
│                                                                  │
│  ┌─ Scanner Input (fokussiert wenn kein anderes Feld aktiv) ──┐ │
│  │  Scan barcode to jump to item...                           │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**Neue/geänderte Keyboard-Shortcuts:**

| Key | Aktion (NEU/GEÄNDERT) |
|---|---|
| `V` | **Verify + Auto-Print:** Barcode zuweisen (falls keiner) → Preis locken → **Label drucken** → Nächstes Item |
| `L` | **Reprint Label:** Label erneut drucken (z.B. wenn Drucker-Fehler, Kleber schlecht) |
| `M` | Missing: Preis auf 0, price_locked — **kein Label** (Item ist nicht da) |
| Scanner-Input | `onScan.js` fängt HID-Input ab → springt zum gescannten Item (für Re-Checks / spätere Inventuren) |

### 14.5 Label-Design

**Labelgröße:** 29mm × 62mm (Brother DK-22210 Endlosband, Standardbreite 29mm, Länge variabel)

```
┌──────────────────────────────────────┐
│  |||||||||||||||||||||||||||||||||||  │  ← Code128 Barcode
│          VOD-003241                  │  ← Klartext unter Barcode
│  Cabaret Voltaire                    │  ← Artist (gekürzt auf 30 Zeichen)
│  Red Mecca · LP · 1981              │  ← Title · Format · Year
│  vod-auctions.com                   │  ← Domain (Branding)
└──────────────────────────────────────┘
```

**Generierung:** `bwip-js` (Barcode) + `pdfkit` (Label-PDF, bereits im Projekt für Invoices/Shipping Labels)

### 14.6 Hardware — Einkaufsliste

**Alle Artikel macOS-kompatibel geprüft (Frank nutzt ausschließlich Mac).**

| # | Artikel | Modell | Preis (ca.) | Bezugsquelle | macOS-Status |
|---|---|---|---|---|---|
| 1 | **Labeldrucker** | Brother QL-810W | ~€130 | Amazon / Cyberport | ✅ Offizielle macOS-Treiber, CUPS-Integration, WiFi+USB, Bonjour-Discovery |
| 2 | **Etiketten** | Brother DK-22210 Endlos 29mm (30,48m) | ~€8/Rolle | Amazon | — (Verbrauchsmaterial) |
| 3 | **Etiketten Vorrat** | 5× DK-22210 (reicht für ~15.000 Labels à 30mm) | ~€40 | Amazon | — |
| 4 | **USB Barcode Scanner** | Inateck BCST-70 (2D, USB kabelgebunden) | ~€40 | Amazon | ✅ USB HID Keyboard-Mode, zero config auf Mac |
| 5 | **Software: QZ Tray** | QZ Tray v2.2+ (Stilles Drucken) | €0 (Open Source, LGPL) | qz.io | ✅ Signed+Notarized, bringt eigene JRE mit, Gatekeeper OK |
| | | | | | |
| | **Gesamt** | | **~€220** | | |

**Upgrade-Option:** Brother QL-820NWB (~€220) statt QL-810W — zusätzlich Bluetooth + kleines Display. Nur nötig wenn Frank kabellos vom iPad/iPhone drucken will.

**Nicht benötigt:**
- Kein USB-Hub (Scanner + Drucker gehen beide direkt an den Mac, Drucker über WiFi)
- Kein spezielles Kabel (Scanner kommt mit USB-A Kabel; für USB-C Mac: ggf. USB-C-Hub, hat Frank vermutlich)
- Keine zusätzliche Software außer QZ Tray + Brother-Treiber

### 14.7 Software-Abhängigkeiten (NPM)

| Paket | Zweck | Größe | Status |
|---|---|---|---|
| `bwip-js` | Barcode-Generierung (Code128, QR, 100+ Formate) | ~2 MB, zero native deps | **NEU — Backend** |
| `onscan.js` | Scanner-HID-Erkennung im Browser | ~15 KB, zero deps | **NEU — Admin Frontend (CDN oder Bundle)** |
| `pdfkit` | Label-PDF-Generierung | Bereits im Projekt (Invoices, Shipping Labels) | ✅ Vorhanden |
| `qz-tray` | Stilles Browser-Drucken via WebSocket | ~50 KB (JS Client) | **NEU — Admin Frontend** |

### 14.8 Neue API-Endpoints

| Method | Path | Body / Query | Effekt |
|---|---|---|---|
| GET | `/admin/erp/inventory/items/:id/label` | `?format=pdf` | Generiert Label-PDF (29×62mm) mit Code128 Barcode + Metadaten |
| POST | `/admin/erp/inventory/items/:id/label/print` | `{ printer_name? }` | Generiert Label + sendet Druck-Befehl (wenn QZ Tray; sonst PDF-Response) |
| GET | `/admin/erp/inventory/batch-labels` | `?item_ids=id1,id2,...` | Batch-PDF mit mehreren Labels (für Nachdruck-Szenario) |
| GET | `/admin/erp/inventory/scan/:barcode` | — | Lookup: Barcode → `erp_inventory_item` + Release-Daten (für Scanner-Jump) |

**Änderung an bestehenden Endpoints:**
- `POST /admin/erp/inventory/items/:id/verify` — Erweitert: vergibt Barcode (falls keiner) + gibt `barcode` + `label_pdf_url` in Response zurück
- `GET /admin/erp/inventory/queue` — Erweitert: inkludiert `barcode` Feld pro Item

### 14.9 Druck-Architektur (macOS)

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Admin UI      │     │   VPS Backend    │     │  Franks Mac     │
│   (Browser)     │────►│   (Medusa API)   │     │                 │
│                 │     │                  │     │  ┌───────────┐  │
│  1. V (Verify)  │     │  2. Barcode      │     │  │ QZ Tray   │  │
│     Click/Key   │────►│     zuweisen     │     │  │ (lokal)   │  │
│                 │     │  3. Label-PDF    │     │  └─────┬─────┘  │
│  4. PDF empfangen│◄───│     generieren   │     │        │        │
│                 │     │     + Response   │     │        ▼        │
│  5. An QZ Tray  │─────────────────────────────►│  ┌───────────┐  │
│     senden      │     │                  │     │  │ Brother   │  │
│                 │     │                  │     │  │ QL-810W   │  │
│  6. ✅ Gedruckt │     │                  │     │  │ (WiFi)    │  │
│     → Nächstes  │     │                  │     │  └───────────┘  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

**Fallback ohne QZ Tray:** PDF öffnet in neuem Browser-Tab → `Ctrl+P` → Drucker auswählen → Drucken. Funktioniert immer, aber manueller Schritt.

**Print-Status im Session-Screen:**
- 🟢 `Printer: Brother QL-810W [Connected]` — QZ Tray verbunden, stilles Drucken aktiv
- 🟡 `Printer: Browser Print (manual)` — QZ Tray nicht gefunden, Fallback auf Print-Dialog
- 🔴 `Printer: Not configured` — Kein Drucker eingerichtet

### 14.10 Scanner-Integration

**Primär: USB HID Scanner** (Inateck BCST-70 oder ähnlich)

Der Scanner tippt den Barcode-Text als Tastatur-Input, gefolgt von Enter. Die Library `onScan.js` erkennt den schnellen Input (< 30ms pro Zeichen) und unterscheidet ihn von normalem Tippen:

```typescript
// In session/page.tsx
import onScan from 'onscan.js';

useEffect(() => {
  onScan.attachTo(document, {
    suffixKeyCodes: [13],      // Enter-Key am Ende
    avgTimeByChar: 30,         // Max ms zwischen Zeichen (Scanner ist schneller)
    minLength: 8,              // "VOD-000001" = 10 Zeichen
    onScan: (barcode: string) => {
      // API-Call: GET /admin/erp/inventory/scan/{barcode}
      // → Item laden und in Session anzeigen
      fetchItemByBarcode(barcode);
    },
  });
  return () => onScan.detachFrom(document);
}, []);
```

**Use Cases für Scanner in der Session:**
1. **Re-Check:** Frank findet einen Artikel im Regal, scannt den Barcode → System springt direkt zum Item
2. **Versand (Post-Inventur):** Bestellung kommt rein, Frank nimmt Artikel aus Regal, scannt → Order verknüpft
3. **Spätere Inventuren:** Scan statt manuelle Suche → 10× schneller

**Sekundär: Kamera-Scanning (nice-to-have, Phase 2+)**
`html5-qrcode` Library für Smartphone-Kamera als Scanner. Nicht Teil der ersten Implementierung.

### 14.11 Implementierungs-Phasen

**Was wir JETZT bauen können (ohne Hardware):**

| Phase | Was | Hardware nötig? | Aufwand |
|---|---|---|---|
| **B1** | Migration: `barcode`-Spalte + Sequenz auf `erp_inventory_item` | Nein | 30 Min |
| **B2** | `bwip-js` installieren + Label-PDF-Endpoint (`/items/:id/label`) | Nein | 2h |
| **B3** | Verify-Route erweitern: Barcode zuweisen + `label_pdf_url` in Response | Nein | 1h |
| **B4** | Scan-Lookup-Endpoint (`/scan/:barcode`) | Nein | 30 Min |
| **B5** | Session-UI: Barcode-Anzeige + Print-Button + Scanner-Input-Feld | Nein | 2h |
| **B6** | `onScan.js` Integration in Session-UI | Nein (testbar mit Tastatur) | 1h |
| **B7** | QZ Tray JS-Client Integration (stilles Drucken) | Nein (Fallback auf Browser-Print) | 2h |
| **B8** | Batch-Label-Endpoint für Nachdruck | Nein | 1h |

**Was NACH Hardware-Lieferung getestet wird:**

| Test | Hardware |
|---|---|
| Label auf Brother QL-810W drucken, Größe/Qualität prüfen | Drucker + Etiketten |
| QZ Tray → Brother Silent Print End-to-End | Drucker + QZ Tray |
| Scanner HID-Input in Safari/Chrome testen | Scanner |
| Voller Workflow: Scan → Verify → Print → Aufkleben → Nächstes | Alles |

### 14.12 TODOs — Einkauf + Setup

**Sofort bestellen:**
- [ ] Brother QL-810W bestellen (Amazon, ~€130, Lieferung 1-2 Tage)
- [ ] 5× Brother DK-22210 Endlos 29mm bestellen (~€40)
- [ ] Inateck BCST-70 USB Barcode Scanner bestellen (~€40)
- [ ] Prüfen ob Frank einen USB-C Hub mit USB-A Ports hat (für Scanner-Kabel)

**Setup auf Franks Mac (wenn Hardware da):**
- [ ] Brother QL-810W Treiber installieren (brother.com → Support → macOS)
- [ ] Drucker über WiFi einrichten (System Settings → Printers → Add, Bonjour findet ihn)
- [ ] Test-Druck über macOS Print-Dialog (Textedit → Drucken → Brother auswählen)
- [ ] QZ Tray installieren (qz.io, .pkg Installer, ~2 Min)
- [ ] QZ Tray Zertifikat-Setup durchführen (einmaliger Wizard)
- [ ] USB Scanner einstecken → macOS "Keyboard Setup Assistant" wegklicken → testen im Textedit
- [ ] End-to-End-Test: Admin UI → Verify → Label druckt → Scanner liest Label

**Code-TODOs (Robin):**
- [ ] Phase B1–B8 implementieren (siehe §14.11)
- [ ] Aktivierungs-Checkliste (§13) um Barcode-Test erweitern
- [ ] `CLAUDE.md` aktualisieren: Barcode-Endpoints + `bwip-js` Dependency
- [ ] `ERP_WARENWIRTSCHAFT_KONZEPT.md` §10 aktualisieren: `barcode`-Spalte
