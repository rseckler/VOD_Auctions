# VOD Auctions — TODO

Operative Aufgabenliste. Single Source of Truth für laufende Arbeit.
**Letzte Aktualisierung:** 2026-04-12 (Inventur Workflow v2 Umbau)

## Arbeitslogik

- `CLAUDE.md` enthält nur Fokus, Top-3 Aktionen und Verweis hierher.
- Diese Datei enthält alle operativen Aufgaben, gruppiert nach Workstreams.
- Linear enthält nur Epics, externe Blocker und mehrwöchige Themen.
- `[ ]` offen | `[x]` erledigt (Datum) | `[-]` entfällt
- Bei Meilensteinen: Item abhaken, `CLAUDE.md` Current Focus aktualisieren.

---

## Now

Aktuell aktive Workstreams. Maximal 2-3 gleichzeitig.

1. **Inventur Workflow v2 Umbau** — Search-First + Exemplar-Modell (4 Phasen)
2. **Launch-Vorbereitung** — AGB-Anwalt als kritischer Pfad

## Next

Kommt dran sobald ein Now-Slot frei wird oder ein Blocker sich löst.

3. **POS Walk-in Sale** — wartet auf Steuerberater-Termin
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
**Status:** Konzept v2.0 fertig. Alter Queue-Workflow verworfen (System-getrieben → Frank kann nicht damit arbeiten). Neuer Search-First + Exemplar-Modell Ansatz beschlossen.
**Blocker:** Keiner — Phase 0 kann sofort starten.
**Nächste Aktion:** Phase 0.1 starten — `admin/media/route.ts` auf Multi-Exemplar vorbereiten.

#### Kontext (warum Umbau)

Alter Workflow: System zeigt Queue → Frank soll Platte suchen. Geht nicht weil:
- Lager ist unsortiert (mehrere Orte, keine Systematik)
- Jedes physische Exemplar braucht eigenen Barcode + Zustand (gebrauchte Artikel = Unikate)
- Keine Suchfunktion vorhanden

Neuer Workflow: Frank nimmt Artikel → sucht im System → bewertet (Zustand Media/Sleeve, Preis, Menge) → bestätigt → Label druckt automatisch.

#### Phase 0: Regression-Fixes (VOR Schema-Migration, abwärtskompatibel)

4 Dateien gehen von 1:1 (Release → inventory_item) aus und brechen bei mehreren Exemplaren. Fixes funktionieren auch mit aktuellem 1:1-Modell — können sofort deployed werden.

- [ ] **0.1** `admin/media/route.ts` — LEFT JOIN → DISTINCT ON oder Subquery, Exemplar-Count als Aggregat (Pagination bricht sonst bei N Exemplaren)
- [ ] **0.2** `admin/media/[id]/route.ts` — Inventory als separate Query (Array statt `.first()`)
- [ ] **0.3** `admin/routes/media/[id]/page.tsx` — Type + UI-Rendering auf Exemplar-Array umbauen (skalare Felder → `inventory_items[]`)
- [ ] **0.4** `admin/erp/inventory/export/route.ts` — `copy_number`-Spalte hinzufügen, 1 Row pro Exemplar
- [ ] **0.5** Dokumentation: Sync-Schutz bleibt Release-Level (H1), Bulk-Adjust Kommentar (H2), POS Auction-Check Kommentar (H3)
- [ ] **0.6** Phase 0 deployen + verifizieren (Admin Media Liste + Detail testen)

#### Phase 1: Schema-Migration + Search + Exemplar-Bewertung (Kern-Workflow)

- [ ] **1.1** Migration SQL: `condition_media`, `condition_sleeve`, `copy_number`, `exemplar_price`, UNIQUE(release_id, copy_number)
- [ ] **1.2** Migration auf Production anwenden (bestehende 13.107 Rows = copy_number=1 per Default)
- [ ] **1.3** Such-API: `GET /admin/erp/inventory/search?q=...` (Release-Level, Exemplar-Count aggregiert)
- [ ] **1.4** Exemplar-Detail-API: `GET /admin/erp/inventory/release/:id/copies`
- [ ] **1.5** Add-Copy-API: `POST /admin/erp/inventory/items/add-copy` (Exemplar #2+ anlegen)
- [ ] **1.6** Verify-API erweitern: `condition_media`, `condition_sleeve`, `exemplar_price` akzeptieren
- [ ] **1.7** Session-Screen Umbau: Suchfeld + Trefferliste + Exemplar-Ansicht + Bewertungsformular
- [ ] **1.8** Keyboard-Shortcuts anpassen (/, ↑/↓, Enter, V, A, D, L, Esc, Tab)
- [ ] **1.9** Discogs-Preis "Median übernehmen" Button (ein-Klick, W4)
- [ ] **1.10** Legacy-Condition Mapping für Pre-Fill (m-/m- → NM/NM etc.)
- [ ] **1.11** Auto-Print nach Verify (bestehende QZ Tray / Browser-Fallback Logik beibehalten)
- [ ] **1.12** Test: Lokaler Durchlauf — Suche, Exemplar #1 verifizieren, Exemplar #2 anlegen, Label druckt
- [ ] **1.13** VPS Deploy + Frank briefen

#### Phase 2: Dashboard + Übersicht

- [ ] **2.1** Browse-API: `GET /admin/erp/inventory/browse` mit Tabs (Alle/Verifiziert/Ausstehend/Mehrere Exemplare), Filter, Pagination
- [ ] **2.2** Stats-API erweitern: Exemplar-Counts, Tagesstatistiken, Format-Breakdown
- [ ] **2.3** Hub-Page `/app/erp/inventory` Umbau: Progress-Bar, Browse-Tabelle, Statistiken

#### Phase 3: Fehlbestands-Check (nach Inventur-Abschluss, ~6 Wochen)

- [ ] **3.1** Fehlbestands-API: `POST /admin/erp/inventory/mark-missing-bulk`
- [ ] **3.2** Queue-View für Einzel-Durchsicht der unverifizierten Items (bestehende Queue recyclen)
- [ ] **3.3** UI: Fehlbestands-Check Button + Confirmation-Modal + CSV-Export

#### Nice-to-have (nicht blockierend)

- [ ] QZ Tray Silent-Print statt Browser-Print-Dialog (Phase B7)
- [ ] onScan.js Integration für HID-Scanner im Session-Screen (Phase B6)

#### Erledigt

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

### 3. POS Walk-in Sale

**Ziel:** Frank kann im Laden Platten über eine Admin-Oberfläche verkaufen mit TSE-konformem Bon.
**Status:** Konzept v1.0 fertig (Draft). Implementierung blockiert.
**Blocker:** 8 offene §10-Entscheidungen — brauchen Steuerberater-Termin.
**Nächste Aktion:** Steuerberater-Termin vereinbaren für §19 UStG + TSE-Anbieter.

#### Entscheidungen (blockieren Implementierung)

- [ ] Kleinunternehmer-Status §19 UStG klären (Steuerberater)
- [ ] TSE-Anbieter final wählen (fiskaly vs. efsta vs. andere)
- [ ] Bon-Hardware entscheiden: Brother QL + 62mm Rolle vs. POS-Thermodrucker
- [ ] Retoure-Workflow (TSE-Storno) definieren
- [ ] Storefront-Conflict bei Live-Auktionen: hard-block oder soft-warning?
- [ ] Kassensturz-Report-Pflicht klären
- [ ] iPad vs. Mac-only entscheiden
- [ ] SumUp-Integration-Level festlegen (extern vs. REST API)

#### Beschaffung (nach Entscheidungen)

- [ ] fiskaly-Account anlegen (oder Alternative)
- [ ] DK-22205 62mm Rolle bestellen (falls Brother gewählt)
- [ ] BMF-Musterformular für Ausfuhr-/Abnehmerbescheinigung (Steuerberater)

#### Implementierung (nach Entscheidungen + Beschaffung)

- [ ] P1: Core POS-UI mit Cart, ohne TSE, Mock-Bon (~2 Tage)
- [ ] P2: TSE-Integration (~2 Tage)
- [ ] P3: Bon-Druck (~1 Tag)
- [ ] P4: SumUp REST API (optional, ~2-3 Tage)

#### Referenzen

- Konzept: `docs/optimizing/POS_WALK_IN_KONZEPT.md`
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
