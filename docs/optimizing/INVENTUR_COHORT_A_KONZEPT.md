# Inventur Cohort A + Bulk +20% — erste Aktivierung des ERP_INVENTORY Moduls

**Version:** 1.0
**Erstellt:** 2026-04-05
**Autor:** Robin Seckler
**Status:** Entwurf — wartet auf Approval vor Implementierungs-Start
**Bezug:** `ERP_WARENWIRTSCHAFT_KONZEPT.md` §8.4 / §10 / R2, `SYNC_ROBUSTNESS_PLAN.md` §6, `STAGING_ENVIRONMENT.md`, `DESIGN_GUIDE_BACKEND.md` v2.0, `UI_UX/UI_UX_STYLE_GUIDE.md`

---

## 1. Kontext

Frank hat ~41.500 Legacy-Releases. Nur **~7.407** sind aktuell verkaufbar (Bild + Preis, Cohort A). Vor dem Launch brauchen wir:

1. **Einmaliger Bulk-Preis-Anstieg +20%** auf Cohort A (Margen-Korrektur).
2. **Physische Inventur** auf Cohort A: Ist der Artikel da? Stimmt der neue Preis, oder muss er individuell angepasst werden? Nicht auffindbare Artikel müssen aus der Storefront verschwinden.
3. **Sync-Schutz**: Verifizierte Artikel dürfen vom stündlichen `legacy_sync_v2.py` nicht mehr überschrieben werden.
4. **Effizienter Workflow**: Single-Item-Review-Screen mit Tastatur-Shortcuts (Shopify POS / Lightspeed Stocktake Pattern). Die bestehende `/app/catalog/media` Tabelle ist für 7.000 Durchläufe zu dicht.

**Reihenfolge (bestätigt):** Erst Bulk +20%, dann Inventur. Die Inventur lockt dann pro Item den neuen Preis oder korrigiert ihn erneut.

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

## 5. Bulk +20% Schalter

**Route:** `backend/src/api/admin/erp/inventory/bulk-price-adjust/route.ts`

- `GET` → Preview
  ```json
  {
    "eligible_count": 7407,
    "already_executed": null,
    "sample": [{ "release_id": "...", "artist": "...", "title": "...", "old_price": 12.00, "new_price": 14.40 }]
  }
  ```
  Eligibility: `inventory_item.source='frank_collection' AND price_locked=false AND status='in_stock'` verknüpft mit `Release.legacy_price > 0`.

- `POST { percentage: 20, confirmation: "RAISE PRICES 20 PERCENT" }`
  - Confirmation-String exakt matchen (Typo-Schutz) — analog `backend/src/api/admin/auction-blocks/[id]/items/bulk-price/route.ts`.
  - Idempotenz: `SELECT 1 FROM bulk_price_adjustment_log WHERE status='success' AND percentage=20` → 409 wenn bereits ausgeführt.
  - Transaction:
    1. `INSERT bulk_price_adjustment_log (..., status='running')`
    2. `UPDATE "Release" SET legacy_price = ROUND(legacy_price * 1.20, 2) WHERE id IN (<eligible IDs>)`
    3. `UPDATE bulk_price_adjustment_log SET affected_rows=?, status='success'`
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

## 11. Offene Fragen an Frank (VOR Implementierungsstart)

Alle sieben Fragen müssen beantwortet sein bevor die Implementierung beginnt. Die Antworten fließen direkt in die technische Umsetzung (Sortierung, Filter, UI-Felder, Dropdown-Optionen).

### F1 — Preiserhöhung +20% Bestätigung

> Frank, stimmst du zu dass **alle ~7.407 verkaufbaren Artikel** (mit Bild, Preis und Status "verfügbar") pauschal um 20% im Preis angehoben werden, bevor die Inventur startet?

**Kontext:** Das ist ein irreversibler Eingriff auf alle Preise. Beispiele: €10 → €12, €50 → €60, €179 → €214,80. Die Inventur gibt dir danach die Möglichkeit, Einzelpreise nochmal manuell anzupassen — aber der Ausgangspunkt ist der neue +20%-Preis.

**Entscheidung nötig:** Falls bestimmte Artikel keine Erhöhung bekommen sollen (z.B. bereits hochpreisige Raritäten), brauchen wir VORHER eine Ausnahmeliste oder eine Preisgrenze ("nur unter €X erhöhen").

**Antwort Frank:** *(ausstehend)*

### F2 — Was bedeutet "Missing" konkret?

> Frank, wenn ein Artikel bei der physischen Inventur **nicht auffindbar** ist: soll er direkt aus dem Shop entfernt werden (Storefront sieht ihn nicht mehr), oder nur als "nicht gefunden" markiert bleiben (du kannst später nochmal nachsuchen)?

**Kontext:** Das Konzept sieht `status='written_off'` vor = Artikel verschwindet sofort aus der Storefront. Wenn das zu endgültig ist, könnte `status='missing'` als Zwischenstufe dienen (sichtbar im Admin, aber nicht mehr im Shop). "Missing" wäre reversibel, "written_off" erfordert manuellen Re-Stock.

**Antwort Frank:** *(ausstehend)*

### F3 — Missing-Grund: Pflicht-Dropdown oder optional?

> Frank, wenn ein Artikel als "Missing" markiert wird, soll ein **Grund angegeben werden müssen** (Dropdown: nicht gefunden / beschädigt / anderweitig verkauft / sonstiges), oder reicht ein optionaler Freitext?

**Empfehlung:** Pflicht-Dropdown mit 4 Optionen. Kostet dich pro Artikel einen Klick, liefert aber saubere Auswertungsdaten ("wie viele wurden als beschädigt vs. nicht auffindbar aussortiert?").

**Antwort Frank:** *(ausstehend)*

### F4 — Preis-Korrekturen: Brauchst du Discogs-Preise im Session-Screen?

> Frank, nach der +20%-Erhöhung und während der Inventur: wie willst du entscheiden ob ein individueller Preis nochmal angepasst werden soll? Hast du Referenz-Listen, oder gehst du nach Gefühl? Hilft dir der Discogs-Marktpreis als Referenz auf dem Bildschirm?

**Kontext:** Der Session-Screen kann den Discogs-Preis (wo vorhanden) neben dem aktuellen Preis anzeigen. Das hilft bei der Einschätzung, aber nur 55% der Artikel haben Discogs-Daten. Wenn du das nicht brauchst, bleibt der Screen simpler.

**Technische Auswirkung:** Wenn ja → zusätzlicher JOIN auf `discogs_lowest_price` in der Queue-Query. Wenn nein → kein JOIN, einfacherer Code.

**Antwort Frank:** *(ausstehend)*

### F5 — Inventur-Reihenfolge im Session-Screen

> Frank, in welcher Reihenfolge willst du die ~7.407 Artikel durchgehen?

Optionen:
- **A) Alphabetisch nach Künstler** (Standard im Konzept — passt wenn dein Lager so sortiert ist)
- **B) Nach Lagerort** (erfordert ein Lagerort-Feld, das aktuell nicht existiert)
- **C) Nach Genre** (greift auf Discogs-Genre-Tags zurück, nicht alle haben welche)
- **D) Nach Preis, teuerste zuerst** (höchste Werte zuerst verifizieren)
- **E) Andere Reihenfolge** — wie ist dein physischer Bestand tatsächlich sortiert?

**Kontext:** Die Sortierung bestimmt wie der Session-Screen die Queue präsentiert. Wenn dein Regal alphabetisch nach Künstler sortiert ist, passt Option A perfekt. Wenn du z.B. nach Format (LP, CD, Kassette) und dann alphabetisch sortierst, sag es — dann passen wir die Query an.

**Antwort Frank:** *(ausstehend)*

### F6 — Zeitraum und Durchsatz

> Frank, wie viele Artikel pro Stunde schätzt du schaffen zu können? Und bis wann soll die Inventur fertig sein?

**Rechnung zur Orientierung:** Bei 7.407 Artikeln und ~30 Sekunden pro Artikel (schauen, Taste drücken) sind das ~62 Stunden reine Durchlaufzeit. Bei 4 Stunden pro Tag = ~15 Arbeitstage. Die Software ist jederzeit pausier- und resumebar (URL-basierter Cursor), aber die Erwartung beeinflusst wie aggressiv wir die Session-UI auf Speed optimieren.

**Antwort Frank:** *(ausstehend)*

### F7 — Gibt es Ausschlüsse innerhalb der 7.407?

> Frank, die 7.407 basieren auf "hat Bild + hat Preis > 0 + ist verfügbar (frei=1)". Gibt es davon welche, die du **sicher nicht verkaufen willst** (z.B. persönliche Sammlung, beschädigte Exemplare die noch mit Preis dastehen, Testeinträge)?

**Kontext:** Falls ja, filtern wir die VOR der Inventur raus. Sonst tauchen sie im Session-Screen auf und du müsstest sie einzeln skippen — bei 50+ wäre das nervig.

**Antwort Frank:** *(ausstehend)*

---

## 12. Offene Punkte (Robin, technisch — nach Franks Antworten)

- **Discogs-Preis im Session-Screen:** JOIN einbauen oder nicht? Hängt von F4 ab.
- **Audit-Tiefe Bulk +20%:** Wollen wir zusätzlich zu `bulk_price_adjustment_log` für jede betroffene Release eine `inventory_movement type='adjustment' reason='bulk_20pct_2026'` schreiben? Kosten: 7.400 Movement-Rows. Nutzen: lückenlose Audit-Trail. **Empfehlung: Ja**, ist im ERP-Geist und billig.
- **Missing-Status-Bezeichnung:** `written_off` vs. `missing` als eigener Zwischen-Status? Hängt von F2 ab.
- **Sortierung der Queue:** Hängt von F5 ab. Default `ORDER BY r."artistName", r.title, r.id`.
- **Cohort B/C später:** Gleicher Workflow, aber Backfill-Script mit anderer WHERE-Klausel (`legacy_price = 0 OR coverImage IS NULL`). Nicht Teil dieses PRs.
