# VOD Auctions — TODO

Operative Aufgabenliste. Single Source of Truth für laufende Arbeit.
**Letzte Aktualisierung:** 2026-04-12 (Inventur v2 komplett + Discogs R2 Migration)

## Arbeitslogik

- `CLAUDE.md` enthält nur Fokus, Top-3 Aktionen und Verweis hierher.
- Diese Datei enthält alle operativen Aufgaben, gruppiert nach Workstreams.
- Linear enthält nur Epics, externe Blocker und mehrwöchige Themen.
- `[ ]` offen | `[x]` erledigt (Datum) | `[-]` entfällt
- Bei Meilensteinen: Item abhaken, `CLAUDE.md` Current Focus aktualisieren.

---

## Now

Aktuell aktive Workstreams. Maximal 2-3 gleichzeitig.

1. **Inventur Workflow v2** — Code komplett deployed, Frank muss gebrieft werden + Test-Durchlauf
2. **POS Walk-in Sale** — P0 Dry-Run live, Frank testet, P1-P4 warten auf Steuerberater
3. **Launch-Vorbereitung** — AGB-Anwalt als kritischer Pfad

## Next

Kommt dran sobald ein Now-Slot frei wird oder ein Blocker sich löst.
4. **Sendcloud-Integration** — Voraussetzungen vorhanden, Code pending
5. **Sync Monitoring** — Dead-Man's-Switch + Alerting

## Later

Bewusst geparkt. Wird bei Bedarf nach Next gezogen.

6. Entity Content Overhaul (Budget-Freigabe nötig)
7. CRM Rudderstack-Integration
8. Admin UI Hub-Refactoring
9. ERP Invoicing (easybill + StB)
10. Checkout Phase C (Apple Pay, Google Pay)
11. ERP Marketplace (v2.0.0)

---

## Workstreams

---

### 1. Inventur Workflow v2 Umbau

**Ziel:** Frank kann im Lager Platten in die Hand nehmen, im System suchen, Zustand/Preis bewerten, bestätigen und Label drucken. Jedes physische Exemplar wird ein eigener Datensatz mit eigenem Barcode.
**Status:** Alle 4 Phasen implementiert + deployed (2026-04-12). Search auf ALLE 50.958 Releases erweitert. iPhone-Foto-Upload integriert. 43.025 Discogs-Bilder zu R2 migriert. Discogs-Import speichert jetzt direkt R2-URLs.
**Blocker:** Keiner — rein operativ (Frank briefen).
**Nächste Aktion:** Frank kontaktieren, neuen Workflow erklären, Test-Durchlauf machen.

#### Kontext (warum Umbau)

Alter Workflow: System zeigt Queue → Frank soll Platte suchen. Geht nicht weil:
- Lager ist unsortiert (mehrere Orte, keine Systematik)
- Jedes physische Exemplar braucht eigenen Barcode + Zustand (gebrauchte Artikel = Unikate)
- Keine Suchfunktion vorhanden

Neuer Workflow: Frank nimmt Artikel → sucht im System → bewertet (Zustand Media/Sleeve, Preis, Menge) → bestätigt → Label druckt automatisch.

#### Phase 0: Regression-Fixes (VOR Schema-Migration, abwärtskompatibel)

4 Dateien gehen von 1:1 (Release → inventory_item) aus und brechen bei mehreren Exemplaren. Fixes funktionieren auch mit aktuellem 1:1-Modell — können sofort deployed werden.

- [x] **0.1** `admin/media/route.ts` — LEFT JOIN → Aggregat-Subquery, exemplar_count/verified_count (2026-04-12)
- [x] **0.2** `admin/media/[id]/route.ts` — Inventory als separates Array, Movements für alle Exemplare (2026-04-12)
- [x] **0.3** `admin/routes/media/[id]/page.tsx` — InventoryItem Type + Multi-Exemplar-Tabelle bei >1 (2026-04-12)
- [x] **0.4** `admin/erp/inventory/export/route.ts` — Barcode-Spalte, stabile Sortierung (2026-04-12)
- [x] **0.5** Dokumentation: Sync H1 + Bulk-Adjust H2 + POS H3 Kommentare (2026-04-12)
- [x] **0.6** Phase 0 deployed + verifiziert — VPS build OK, PM2 online, 0 errors (2026-04-12)

#### Phase 1: Schema-Migration + Search + Exemplar-Bewertung (Kern-Workflow)

- [x] **1.1** Migration SQL: condition_media, condition_sleeve, copy_number, exemplar_price, UNIQUE (2026-04-12)
- [x] **1.2** Migration auf Production: 13.107 Rows, alle copy_number=1 verifiziert (2026-04-12)
- [x] **1.3** Such-API: `GET /admin/erp/inventory/search` — Barcode-Exact + ILIKE Text (2026-04-12)
- [x] **1.4** Exemplar-Detail-API: `GET /admin/erp/inventory/release/:id/copies` (2026-04-12)
- [x] **1.5** Add-Copy-API: `POST /admin/erp/inventory/items/add-copy` (2026-04-12)
- [x] **1.6** Verify-API erweitert: condition_media/sleeve, exemplar_price, audit-trail (2026-04-12)
- [x] **1.7-1.11** Session-Screen komplett neu: Search-First, Exemplar-Liste, Grade-Selector, Discogs-Override, Legacy-Condition-Mapping, Auto-Print, Shortcuts (2026-04-12)
- [x] **1.12** Reset-API erweitert: setzt condition/exemplar_price zurück (2026-04-12)
- [x] **1.13** VPS Deploy — PM2 online, 0 neue Errors (2026-04-12)
- [ ] **1.14** Frank briefen: Session-URL, neuer Workflow erklären, Test-Durchlauf

#### Phase 2: Dashboard + Übersicht

- [x] **2.1** Browse-API: `GET /admin/erp/inventory/browse` — Tabs, Suche, Pagination (2026-04-12)
- [x] **2.2** Stats-API: Exemplar-Counts, Tages-Stats, Format-Breakdown, avg_price (2026-04-12)
- [x] **2.3** Hub-Page Umbau: Stats-Grid, Progress, Today-Card, Format-Bars, Browse-Tabelle (2026-04-12)

#### Phase 3: Fehlbestands-Check

- [x] **3.1** `GET /admin/erp/inventory/missing-candidates` + `POST .../mark-missing-bulk` (2026-04-12)
- [x] **3.2** Hub-Page: Fehlbestands-Check Card + Modal (Export CSV + Bulk-Mark mit Confirmation) (2026-04-12)
- [-] **3.3** Queue-View für Einzel-Durchsicht — entfällt, Frank nutzt Session-Suche stattdessen

#### Nice-to-have (nicht blockierend)

- [ ] QZ Tray Silent-Print statt Browser-Print-Dialog (Phase B7)
- [ ] onScan.js Integration für HID-Scanner im Session-Screen (Phase B6)

#### Erledigt

- [x] **Alle 4 Phasen (0/1/2/3) implementiert + deployed** (2026-04-12)
- [x] Suche auf ALLE 50.958 Releases ausgeweitet (nicht nur Cohort A) (2026-04-12)
- [x] iPhone-Foto-Upload im Session-Screen (sharp + R2, capture="environment") (2026-04-12)
- [x] Discogs-Hotlinks eliminiert: 43.025 Bilder zu R2 migriert (2026-04-12)
- [x] Discogs-Import-Commit schreibt direkt R2-URLs (kein Hotlink-Zustrom mehr) (2026-04-12)
- [x] Shared Library `backend/src/lib/image-upload.ts` (optimize/upload/downloadOptimizeUpload) (2026-04-12)
- [x] Migration-Script `scripts/migrate_discogs_images_to_r2.py` (idempotent, resume-fähig) (2026-04-12)
- [x] Stats zeigen total_releases (50.958) + eligible (13.107) getrennt (2026-04-12)
- [x] Inventur Workflow v2 Konzept v2.0 geschrieben (2026-04-12)
- [x] Impact-Analyse: 33 Dateien geprüft, 4 kritisch, 3 hoch, 10 sicher (2026-04-12)
- [x] Franks Antworten W1-W4 eingearbeitet (2026-04-12)
- [x] V5 Scratch-Test bestanden (2026-04-12, Sync-Run 06:00 UTC)
- [x] Bulk +15% auf 13.107 Items (2026-04-12, €404.929 → €465.358)
- [x] Hardware validiert: Brother QL-820NWBc + Inateck BCST-70 (2026-04-11)
- [x] Scanner-Integration im Session-Screen, Race-Condition-Fix (2026-04-11)
- [x] Media Detail Inventory Section + Deep-Link (2026-04-11)

#### Aufwand-Schätzung

| Phase | Aufwand | Abhängigkeit |
|-------|---------|--------------|
| Phase 0: Regression-Fixes | ~5h | Keine — sofort machbar |
| Phase 1: Kern-Workflow | ~10h | Phase 0 deployed |
| Phase 2: Dashboard | ~5h | Phase 1 — nice-to-have |
| Phase 3: Fehlbestand | ~4h | Erst in 4-6 Wochen |
| **Total** | **~24h** | |

#### Referenzen

- **Neues Konzept:** `docs/optimizing/INVENTUR_WORKFLOW_V2_KONZEPT.md` (v2.0, Source of Truth)
- Altes Konzept: `docs/optimizing/INVENTUR_COHORT_A_KONZEPT.md` (v3.0 — §3-5 + §14 weiterhin gültig, §6 ersetzt durch v2)
- Hardware-Setup: `docs/hardware/BROTHER_QL_820NWB_SETUP.md`
- Session-Log: `docs/sessions/2026-04-11_hardware-validation-erp-ux.md`

---

### 2. Launch-Vorbereitung

**Ziel:** Platform Mode von `beta_test` nach `live` bringen.
**Status:** Blockiert durch fehlende AGB.
**Blocker:** AGB-Prüfung durch E-Commerce-Anwalt (RSE-78 in Linear).
**Nächste Aktion:** E-Commerce-Anwalt beauftragen.

#### Offene Aufgaben

- [ ] E-Commerce-Anwalt beauftragen für AGB-Prüfung
- [ ] Impressum + Datenschutz finalisieren (nach AGB)
- [ ] Platform Mode `beta_test` → `pre_launch` → `live` umschalten
- [ ] Erste öffentliche Auktionen planen (RSE-79)
- [ ] Newsletter-Templates testen (block-teaser/tomorrow/live/ending)

#### Hinweise

- Linear: RSE-78 (Launch), RSE-79 (Erste Auktionen), RSE-80 (Marketing)
- Pre-Launch-System (Waitlist + Invite) ist implementiert: `docs/PRE_LAUNCH_KONZEPT.md`
- Payment (Stripe + PayPal) ist Live-Mode-ready

---

### 2. POS Walk-in Sale

**Ziel:** Frank kann im Laden Platten über eine PWA-Oberfläche verkaufen mit TSE-konformem Bon.
**Status:** Phase P0 (Dry-Run) deployed und live. Frank kann Trockenübungen machen.
**Blocker:** P1-P4 blockiert durch 8 offene §11-Entscheidungen (Steuerberater-Termin).
**Nächste Aktion:** Frank testet P0, Feedback sammeln. Parallel Steuerberater-Termin vereinbaren.

#### Phase P0 — Dry-Run (deployed 2026-04-12)

- [x] Feature-Flag `POS_WALK_IN` (requires ERP_INVENTORY) — ON
- [x] DB-Migration: 11 neue Spalten auf `transaction` + `pos_order_number_seq`
- [x] API: Session + Cart (POST sessions, POST items, DELETE items)
- [x] API: Checkout (transaction + inventory_movement + order_event in DB-Transaktion)
- [x] API: Customer search + create
- [x] API: Receipt PDF (A6, pdfkit, Dry-Run-Hinweis)
- [x] API: Stats (today/yesterday/week/all, payment breakdown, averages)
- [x] API: Transactions list (period/date/payment/search filter, paginiert)
- [x] Admin-UI `/app/pos`: Split-Screen (60/40), Scanner-Input, Cart, Customer-Panel (3 Modi + Adress-Modal), Payment-Auswahl, Checkout-Flow, Discount EUR/%
- [x] Admin-UI `/app/pos/reports`: Period-Tabs, Summary-Cards, Payment-Breakdown-Bars, Transaktionsliste
- [x] Klickbare Stat-Cards auf POS-Hauptseite → Reports mit vorausgewähltem Period
- [x] UX: Auto-Add bei Scan, globaler Scanner-Listener, 3-Tap-Regel, Swipe-to-Remove, Cash Quick-Amount-Grid mit Wechselgeld
- [x] PWA: manifest.json, Service Worker, iOS-Meta-Tags
- [x] Operations Hub Card
- [x] Orders-Integration: POS-Badge (lila), picked_up Status, Ship/Deliver ausgeblendet
- [x] Stubs: TSE = "DRY_RUN", Tax-Free = disabled

#### Offene Entscheidungen (blockieren P1-P4)

- [ ] Kleinunternehmer-Status §19 UStG klären (Steuerberater)
- [ ] TSE-Anbieter final wählen (fiskaly vs. efsta vs. andere)
- [ ] Bon-Hardware entscheiden: Brother QL + 62mm Rolle vs. POS-Thermodrucker
- [ ] Tax-Free Export: Variante A (direkt steuerfrei) vs. B (erst USt, dann erstatten)
- [ ] Brutto vs. Netto in `legacy_price` — betrifft gesamte Preis-Logik
- [ ] Retoure-Workflow (TSE-Storno) definieren
- [ ] Storefront-Conflict bei Live-Auktionen: hard-block oder soft-warning?
- [ ] SumUp-Integration-Level festlegen (extern vs. REST API)

#### Beschaffung (nach Entscheidungen)

- [ ] fiskaly-Account anlegen (oder Alternative)
- [ ] DK-22205 62mm Rolle bestellen (falls Brother gewählt)
- [ ] BMF-Musterformular für Ausfuhr-/Abnehmerbescheinigung (Steuerberater)

#### Implementierung P1-P4 (nach Entscheidungen + Beschaffung)

- [ ] P1: Tax-Logik aktivieren + Bon-Druck auf Brother (~1.5 Tage)
- [ ] P2: TSE-Integration fiskaly (~2 Tage)
- [ ] P3: Tax-Free Documents + Tracking (~1.5 Tage)
- [ ] P4: SumUp REST API (optional, ~2-3 Tage)

#### Referenzen

- Konzept: `docs/optimizing/POS_WALK_IN_KONZEPT.md` v1.1
- UX-Research: `docs/optimizing/POS_UX_RESEARCH.md`
- To-Do-Liste: `docs/optimizing/POS_P0_TODO.md`
- Memory: `project_pos_walk_in.md`

---

### 4. Sendcloud-Integration (ERP_SENDCLOUD)

**Ziel:** Shipping-Labels direkt aus Admin generieren statt manuell bei DHL.
**Status:** Voraussetzungen vorhanden, Code nicht geschrieben.
**Blocker:** Keiner — kann jederzeit starten.
**Nächste Aktion:** Sendcloud Client-Wrapper bauen + DHL-Anbindung konfigurieren.

#### Offene Aufgaben

- [ ] Sendcloud Client-Wrapper + DHL konfigurieren (DHL-GK: 5115313430)
- [ ] Admin UI Shipping-Label-Generierung in Orders-Detail
- [ ] Feature Flag `ERP_SENDCLOUD` aktivieren

#### Hinweise

- Sendcloud-Account existiert (erstellt 2026-04-07)
- Konzept: `docs/optimizing/ERP_WARENWIRTSCHAFT_KONZEPT.md`

---

### 5. Sync Monitoring

**Ziel:** Automatische Warnung wenn der stündliche Legacy-Sync ausfällt oder Fehler hat.
**Status:** Sync v2.0.0 stabil (168+ Runs, 0 failed). Monitoring fehlt.
**Blocker:** Keiner.
**Nächste Aktion:** Dead-Man's-Switch in Admin-UI bauen.

#### Offene Aufgaben

- [ ] Dead-Man's-Switch: Admin-UI-Ampel + Cron-Watchdog (A5)
- [ ] E-Mail-Alerting via Resend bei failed Runs (A6)
- [ ] V3 orphan_labels bereinigen (216 Releases, kosmetisch)

#### Nice-to-have

- [ ] Grafana Dashboards (60m + 24h Aggregates)

#### Referenzen

- Plan: `docs/architecture/SYNC_ROBUSTNESS_PLAN.md`

---

### 6. Entity Content Overhaul (RSE-227)

**Ziel:** AI-generierte Beschreibungen für alle 19.000+ Entities (Bands, Labels, Press).
**Status:** P2 paused. 576/3.650 Entities done. Budget $96/$120 verbraucht.
**Blocker:** Budget-Freigabe für Weiterführung (~$553 für Rest).
**Nächste Aktion:** Budget freigeben, dann `orchestrator.py --type artist --phase P2` starten.

#### Referenzen

- Pipeline: `scripts/entity_overhaul/`
- Linear: RSE-227

---

### 7. CRM Rudderstack-Integration

**Ziel:** Unified Event-Tracking über Rudderstack statt direkte Brevo-API-Calls.
**Status:** CRM Core deployed. Rudderstack noch nicht aufgesetzt.
**Blocker:** Keiner — kann jederzeit starten.
**Nächste Aktion:** Rudderstack Docker Compose auf VPS deployen.

#### Offene Aufgaben

- [ ] Rudderstack Docker Compose auf VPS
- [ ] `rudderstack.ts` SDK Wrapper
- [ ] crm-sync.ts → rudder.track() umstellen
- [ ] Storefront: `rudder-sdk-js` einbinden
- [ ] Brevo + PostHog Destinations konfigurieren

#### Referenzen

- Konzept: `docs/architecture/CRM_CUSTOMER_MANAGEMENT_KONZEPT_2026.md`

---

### 8. Admin UI Hub-Refactoring

**Ziel:** Saubere Hub-Seiten für Operations/Catalog/Marketing mit defineRouteConfig.
**Status:** Geplant, nicht begonnen.
**Blocker:** Keiner — rein technische Aufräumarbeit.
**Nächste Aktion:** `operations/page.tsx` Hub-Seite anlegen.

#### Offene Aufgaben

- [ ] Hub-Seite `operations/page.tsx` mit defineRouteConfig
- [ ] Hub-Seite `catalog/page.tsx` mit defineRouteConfig
- [ ] Hub-Seite `marketing/page.tsx` mit defineRouteConfig
- [ ] `defineRouteConfig` aus 12 Sub-Seiten entfernen
- [ ] Media Catalog Filter rc23 Verifikation (5 Test-Cases)

#### Referenzen

- Konzept: `docs/architecture/ADMIN_UI_KONZEPT_2026.md`

---

### 9. ERP Invoicing (ERP_INVOICING)

**Ziel:** Automatische Rechnungserstellung via easybill nach Zahlung.
**Status:** Nicht implementiert. Wartet auf externe Klärung.
**Blocker:** easybill-Account + Steuerberater-Termin.
**Nächste Aktion:** easybill-Account einrichten.

#### Offene Aufgaben

- [ ] easybill-Account einrichten
- [ ] Steuerberater: Rechnungsformat + USt-Behandlung klären
- [ ] easybill Sandbox + Client-Wrapper
- [ ] Webhook `payment_intent.succeeded` → easybill

#### Referenzen

- Konzept: `docs/optimizing/ERP_WARENWIRTSCHAFT_KONZEPT.md`

---

### 10. Weitere Themen (Later)

Einzelne Items die keinen eigenen Workstream rechtfertigen:

- [ ] Checkout Phase C: Apple Pay / Google Pay / Google Places
- [ ] Discogs Prices in Storefront einblenden (wartet auf echte Sale-Daten)
- [ ] `import_event` Cleanup-Job (>30d Rows löschen)
- [ ] `legacy_sync.py` v1 entfernen (v2 seit 7+ Tagen stabil)
- [ ] Staging-DB Entscheidung finalisieren (Branching Pro vs. Free vs. Local)
- [ ] `ERP_COMMISSION` — Konsignationsverträge (Fachliche Freigabe §14)
- [ ] `ERP_TAX_25A` — §25a Prüfung Steuerberater
- [ ] `ERP_MARKETPLACE` — Multi-Seller + Stripe Connect (v2.0.0)

---

## Linear-Themen (Management-Ebene)

Diese Themen leben in Linear, nicht hier. Nur zur Referenz:

| Issue | Thema | Status | Blocker |
|---|---|---|---|
| RSE-78 | Launch vorbereiten | backlog, High | AGB-Anwalt |
| RSE-227 | Entity Content Overhaul | in progress (paused) | Budget |
| RSE-288 | Discogs Preisvergleich-UI | backlog | Sale-Daten |
| RSE-289 | PWA + Push-Notifications | backlog | Later |
| RSE-291 | Multi-Seller Marketplace | backlog | v2.0.0 |
| RSE-294 | Erste öffentliche Auktionen | backlog | RSE-78 |
| RSE-295 | Marketing-Strategie | backlog | RSE-294 |

---

## Erledigte Meilensteine

| Datum | Meilenstein |
|---|---|
| 2026-04-12 | Discogs-Hotlinks eliminiert: 43.025 Bilder zu R2 migriert + zukünftige Imports direkt zu R2 |
| 2026-04-12 | iPhone-Foto-Upload im Stocktake (sharp-Optimierung, R2) |
| 2026-04-12 | Inventur Workflow v2 komplett deployed (Search-First + Exemplar-Modell + Dashboard + Fehlbestand) |
| 2026-04-12 | Inventur Suche auf ALLE 50.958 Releases ausgeweitet (nicht nur Cohort A) |
| 2026-04-12 | POS Walk-in Sale P0 Dry-Run deployed (PWA, Scan, Cart, Checkout, Reports) |
| 2026-04-12 | POS_WALK_IN Flag ON — Frank kann Trockenübungen machen |
| 2026-04-12 | ERP_INVENTORY Flag ON + Bulk +15% (13.107 Items, €465.358) |
| 2026-04-12 | V5 Scratch-Test bestanden (Sync-Schutz unter Last verifiziert) |
| 2026-04-11 | Hardware validiert (Brother QL-820NWBc + Inateck BCST-70) |
| 2026-04-11 | Discogs Import v5.3 (rc18-rc25, Full Decoupling) |
| 2026-04-11 | POS Walk-in Sale Konzept v1.0 (Draft) |
| 2026-04-10 | Discogs Import: Pargmann 5.646 Releases imported |
| 2026-04-07 | ERP Inventory Code deployed (13.107 Items backfilled) |
| 2026-04-07 | Sync Robustness v2.0.0 live |
| 2026-04-07 | Staging DB eingerichtet (eu-west-1) |
| 2026-03-20 | Kostenoptimierung: Passive Income + MyNews AI deaktiviert |
