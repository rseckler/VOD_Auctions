# VOD Auctions — TODO

Operative Aufgabenliste. Single Source of Truth für laufende Arbeit.
**Letzte Aktualisierung:** 2026-04-22 (rc40 — Meilisearch Phase 1 live. `SEARCH_MEILI_CATALOG` ON, Storefront-Catalog + Suggest via Meili, Typo-Tolerance + Facets. Admin-Endpoints weiterhin Postgres-FTS. Dark-Mode-Fix in Admin-Tokens.)

## Arbeitslogik

- `CLAUDE.md` enthält nur Fokus, Top-3 Aktionen und Verweis hierher.
- Diese Datei enthält alle operativen Aufgaben, gruppiert nach Workstreams.
- Linear enthält nur Epics, externe Blocker und mehrwöchige Themen.
- `[ ]` offen | `[x]` erledigt (Datum) | `[-]` entfällt
- Bei Meilensteinen: Item abhaken, `CLAUDE.md` Current Focus aktualisieren.

---

## Now

Aktuell aktive Workstreams. Maximal 2-3 gleichzeitig.

1. **Inventur Workflow v2 — Frank arbeitet aktiv** — rc39 (2026-04-22) Search-Sweep + Mirror-Fix live, 6 Altlasten backfilled (Notturno + 5 weitere). Catalog zeigt jetzt Stocktake-Daten (Barcode/Preis/Conditions). Frank macht weitere Platten.
2. **POS Walk-in Sale** — P0 Dry-Run live, Frank testet, P1-P4 warten auf Steuerberater
3. **Launch-Vorbereitung** — AGB-Anwalt als kritischer Pfad

## Next

Kommt dran sobald ein Now-Slot frei wird oder ein Blocker sich löst.
4. **Redis + Rate-Limiting + Datenschutz-Fix** — Launch-Blocker (Brute-Force-Schutz + DSGVO-Konsistenz)
5. **Sendcloud-Integration** — Voraussetzungen vorhanden, Code pending
6. **Sync Monitoring** — Dead-Man's-Switch + Alerting
7. **[x] Meilisearch Search-Engine Phase 1** — **done 2026-04-22 (rc40).** Live auf VPS (Docker, localhost:7700), Two-Profile-Index (`releases-commerce` + `releases-discovery`, je 52.777 docs), Flag `SEARCH_MEILI_CATALOG` ON, 3-Gate-Runtime-Fallback (flag → health-probe → try/catch). p95 Latency /store/catalog 48-58ms (vorher 6+s), Typo-Tolerance wirkt ("cabarte voltarie" findet Cabaret Voltaire). 4 Cronjobs (delta 5min, cleanup täglich, drift 30min, dump täglich). Admin-Endpoints bleiben Postgres-FTS. Siehe [`docs/optimizing/SEARCH_MEILISEARCH_PLAN.md`](optimizing/SEARCH_MEILISEARCH_PLAN.md) + [`docs/optimizing/MEILI_PHASE1_DEPLOYMENT_STEPS.md`](optimizing/MEILI_PHASE1_DEPLOYMENT_STEPS.md).

## Later

Bewusst geparkt. Wird bei Bedarf nach Next gezogen.

8. Entity Content Overhaul (Budget-Freigabe nötig)
9. CRM Rudderstack-Integration
10. Admin UI Hub-Refactoring
11. ERP Invoicing (easybill + StB)
12. Checkout Phase C (Apple Pay, Google Pay)
13. ERP Marketplace (v2.0.0)
14. Meilisearch Phase 2 (Admin-Endpoints + Vector-Search + LLM-Re-Rank — separate Konzepte später)

---

## Workstreams

---

### 1. Inventur Workflow v2 Umbau

**Ziel:** Frank kann im Lager Platten in die Hand nehmen, im System suchen, Zustand/Preis bewerten, bestätigen und Label drucken. Jedes physische Exemplar wird ein eigener Datensatz mit eigenem Barcode.
**Status:** **Frank arbeitet aktiv (Stand 2026-04-22).** Alle 4 Phasen implementiert + deployed (2026-04-12). Search auf ALLE 50.958 Releases. iPhone-Foto-Upload + R2-Migration komplett. Print Bridge mit brother_ql-Backend live (rc37, kein CUPS mehr). Inventur-UX rc38 (2-Button Save/Print, DB-Recent-Items, Label mit beiden Identifiern, neues Barcode-Format `000001VODe`, Back-to-Session-Banner). **rc39 (2026-04-22) Catalog/Inventur Mirror-Fix:** `add-copy` + `verify` mirrorn jetzt bei Copy #1 die Stocktake-Werte auf Release-Felder (Notturno-Bug + 5 weitere Altlasten backfilled). `/admin/media` Liste rendert Inventory-Daten in INV.-Cell. Stocktake-Suche unlimited (war 20). Catalog-Suche von 6s auf 30ms via FTS.
**Blocker:** Keiner — Workstream läuft im Live-Betrieb.
**Nächste Aktion:** Frank macht weitere Platten. MacBook Air-Rollout als Zweit-Gerät.

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
- [x] **1.14** Frank-MacBook-Setup-Kit (`frank-macbook-setup/`, 2026-04-14) — Installations-Kit für MBP16 A2141: install.sh + test-print.sh + verify-setup.sh, Brother QL/Scanner/QZ-Tray-Automatisierung, pure-Python-PDF-Generator, Anleitung Deutsch für Frank, komplette Troubleshooting-Doku
- [x] **1.15** Kit auf Franks Mac Studio ausgerollt + Print Bridge brother_ql-Backend (rc37, 2026-04-22)
- [x] **1.16** Frank briefen + verifiziert: Workflow läuft, Frank arbeitet aktiv (rc38+rc39, 2026-04-22)
- [x] **1.17** V5 Sync-Check verifiziert: `price_locked=true` in beiden Endpoints (`add-copy` + `verify`) gesetzt, Mirror auf Release.legacy_price funktioniert, kein Sync-Overwrite (rc39)
- [ ] **1.18** MacBook Air als Zweit-Gerät ausrollen (`bash frank-macbook-setup/install.sh`)

#### Phase 2: Dashboard + Übersicht

- [x] **2.1** Browse-API: `GET /admin/erp/inventory/browse` — Tabs, Suche, Pagination (2026-04-12)
- [x] **2.2** Stats-API: Exemplar-Counts, Tages-Stats, Format-Breakdown, avg_price (2026-04-12)
- [x] **2.3** Hub-Page Umbau: Stats-Grid, Progress, Today-Card, Format-Bars, Browse-Tabelle (2026-04-12)

#### Phase 3: Fehlbestands-Check

- [x] **3.1** `GET /admin/erp/inventory/missing-candidates` + `POST .../mark-missing-bulk` (2026-04-12)
- [x] **3.2** Hub-Page: Fehlbestands-Check Card + Modal (Export CSV + Bulk-Mark mit Confirmation) (2026-04-12)
- [-] **3.3** Queue-View für Einzel-Durchsicht — entfällt, Frank nutzt Session-Suche stattdessen

#### Phase 4: Bug-Fixes nach erstem Test-Durchlauf (rc31, 2026-04-21)

Franks erster End-to-End-Durchlauf mit Asmus Tietchens `legacy-release-23464` förderte 12 Defekte zutage. Alle in einem Commit-Sweep gefixt + deployed.

- [x] **4.1** P0.1 Vorab-Werte aus Release als Fallback — `session/page.tsx` `startEditCopy()` liest `legacy_condition`/`legacy_price` wenn erp-Felder NULL (Cohort-A-Backfill-Rows waren leer) (2026-04-21)
- [x] **4.2** P0.4 Browser-Print via iframe — Druck-Dialog öffnet automatisch statt nur neuen Tab (2026-04-21)
- [x] **4.3** P0.5 Re-Print + Re-Edit Buttons auf jeder Copy-Row, auch nach Verify (2026-04-21)
- [x] **4.4** P0.6 Label-Wrap-Overlap-Fix — `ellipsis:true` + `height`-Clip auf allen 3 Text-Zeilen in `lib/barcode-label.ts` (2026-04-21)
- [x] **4.5** P0.7 Label-Preis-Fallback-Chain `COALESCE(exemplar_price, direct_price, legacy_price)` + Condition aus erp (2026-04-21)
- [x] **4.6** P0.2/Q1b Catalog als COALESCE-Source-of-Truth — `GET /admin/media/:id` merged erp-Werte aufs Release-Objekt, POST schreibt in erp+Release parallel (2026-04-21)
- [x] **4.7** P0.3 JSX em-dash Literal-Bug in Condition-Dropdowns (2026-04-21)
- [x] **4.8** Q2 Unlock-Price Button + neuer `POST /admin/erp/inventory/items/:id/unlock-price` Endpoint (2026-04-21)
- [x] **4.9** Q6 „Block ID" → „Active Auction" Link mit UUID↔TEXT Cast (2026-04-21)
- [x] **4.10** Q8a Discogs-Linking Card editierbar + `POST /admin/media/:id/refetch-discogs` (2026-04-21)
- [x] **4.11** Q9 Discogs-Preise in 2 semantische Sections aufgeteilt (2026-04-21)
- [x] **4.12** P1.1 QZ Tray Silent-Print live — `backend/src/admin/lib/qz-tray-client.ts` mit CDN-Load + fuzzy printer match, iframe-Fallback wenn QZ down (2026-04-21)
- [x] **4.13** Schema-Fix: `Release.genres/styles` sind TEXT[] nicht TEXT — alte UI-Bug der Frank „Genre leer" sehen ließ (2026-04-21)
- [x] **4.14** Preis-Mirror: Save in Edit-Valuation spiegelt `direct_price` → `exemplar_price` bei Single-Exemplar (2026-04-21)
- [x] **4.15** Backfill-Script `scripts/backfill_genre_styles.py` geschrieben + gelaufen auf VPS: **137 Releases** mit fehlenden `genres`/`styles` gefüllt (2026-04-21)
- [x] **4.16** Audit-Script `scripts/audit_discogs_mappings.py` geschrieben + gelaufen: **431 geflaggte Mappings** bei Threshold 0.65 (Export `docs/audit_discogs_flagged_2026-04-21.csv`) (2026-04-21)
- [x] **4.17** Konsistenz-Audit nach Robins Feedback („Konsistenz ist nicht Dein Ding"): 4 Bereiche quer durchs Repo gegrept — **Storefront-Preis inkonsistent gefunden + gefixt** (`/store/catalog/*` liest jetzt COALESCE(legacy, direct), `is_purchasable` + `for_sale` + Sort erweitert, `effective_price` Feld + legacy_price-Normalisierung für Frontend-Compat) (2026-04-21)
- [x] **4.18** Multi-Surface Label-Print konsolidiert — `printLabelAuto()` als shared Helper in `backend/src/admin/lib/qz-tray-client.ts`, alle 3 Buttons (Session + Catalog Multi + Catalog Single) nutzen ihn jetzt (2026-04-21)
- [x] **4.19** Label-PDF 2-Page-Bug gefixt — `autoFirstPage:false` + manueller `addPage()` in `generateLabelPdf` (2026-04-21)
- [x] **4.20** QZ Tray Install: `brew --cask qz-tray` ist aus Homebrew entfernt — `install.sh` nutzt jetzt direkten .pkg-Download von GitHub (v2.2.6, arm64/x86_64-Detection, `sudo installer`) (2026-04-21)
- [x] **4.21** `frank-macbook-setup/INSTALLATION.md` geschrieben — Step-by-Step für MacBook Air + Mac Studio, Troubleshooting-Matrix, Zweit-Mac-Ablauf (2026-04-21)

#### Phase 5: Performance + UX-Feinschliff nach zweitem Test-Durchlauf (rc33, 2026-04-22)

- [x] **5.1** Asmus Tietchens (`VOD-19586` / `legacy-release-23464`) zurückgesetzt via Supabase-SQL — Barcode `VOD-000001` bleibt erhalten, condition/price/stocktake → NULL, Audit-Movement erstellt (2026-04-22)
- [x] **5.2** Inventur-Search um `article_number` erweitert (VOD-19586 und variable-length VOD-Nummern) — Step 1b „Article-Number Exact-Match" vor Text-Search, article_number in ILIKE-OR + Ranking, Scanner-Regex gelockert auf `^VOD-\d+$`, Treffer-Zeile zeigt article_number monospace/gold, Release-Detail-Header gleich (2026-04-22)
- [x] **5.3** Discogs-Preis-Semantik in Inventur-Session auf 2 Zeilen aufgeteilt: „Markt aktuell" (stats.lowest_price + num_for_sale) vs „Discogs-Suggestion" (price_suggestions median/mint) + Link zur Sales-History auf discogs.com. Drei Quick-Fill-Buttons (`[D] Sugg`, `Mint`, `Markt`) statt nur Median (2026-04-22)
- [x] **5.4** Search-Performance-Fix Admin **(47×)**: `EXPLAIN ANALYZE` zeigte 6s Seq-Scan, Ursache war fehlende trgm-Indizes + ILIKE ohne lower(). Migration `2026-04-22_search_trigram_indexes.sql` mit 4 neuen GIN trgm Indizes (`idx_artist_name_trgm`, `idx_release_catno_trgm`, `idx_release_article_trgm`, `idx_label_name_trgm`). Admin-Search-Query umgebaut auf CTE mit UNION-über-4-Subqueries. Gemessen: 6071ms → 128ms (2026-04-22)
- [x] **5.5** Search-Performance-Fix Storefront (`/store/catalog?search=` + `/store/catalog/suggest`): gleiche UNION-Logik wie Admin, zusätzlich `lower(name) LIKE` für Artists + Labels einzeln (Autocomplete). Live-gemessen: `/catalog?search=cabaret` 5000ms → 148ms, `/catalog/suggest?q=cabaret` ~2s → 57ms (2026-04-22)
- [x] **5.6** Count-Match-Verifikation: 5 Test-Queries (cabaret/tietchens/industrial/mute/vod) liefern identische Treffer-Zahlen alt vs neu — keine Änderung am Suchraum oder der Semantik (2026-04-22)
- [x] **5.7** PM2-Config Storefront: nach `pnpm install` war `.bin/next` ein Shell-Wrapper statt Symlink → PM2 ProcessContainerFork crashte beim require(). Fix: `storefront/ecosystem.config.js` nutzt direkten `node_modules/next/dist/bin/next` Entry. Dauerhaft gefixt + committed (2026-04-22)
- [x] **5.8** QZ Tray komplett ersetzt durch VOD Print Bridge (rc35, 2026-04-22) — lokaler Python-stdlib HTTP-Server auf `127.0.0.1:17891`, User-LaunchAgent, kein Signing, kein Java. Alle Files weg (`qz-tray-client.ts`, `/admin/qz-tray/cert|sign`, `qz-signing/override.crt`). Installer in `frank-macbook-setup/print-bridge/`, Admin-Client `backend/src/admin/lib/print-client.ts`. Lokal auf Robins Mac dry-run-getestet (install ✓, health ✓, printers ✓, CORS+PNA ✓, raw-PDF+base64+invalid ✓, uninstall ✓). Rollout auf Franks MacBook Air + Mac Studio + Robins MBP via `bash install.sh` (idempotent, altes QZ Tray wird auto-gepurged).

#### Phase 6: Print-Bridge-HTTPS + Diagnose + brother_ql (rc36–rc37, 2026-04-22)

- [x] **6.1** rc36 — Bridge auf HTTPS umgestellt via mkcert (Safari blockiert fetch() von HTTPS → HTTP-Loopback als Mixed Content, Chrome wäre nachsichtig gewesen). Python-Bridge v1.1.0 mit `ssl.SSLContext`. install-bridge.sh installiert mkcert via brew + `mkcert -install` (einmal sudo für System-Keychain) + Cert-Generation für 127.0.0.1+localhost. HTTP-Fallback für Dev-Test-Mode.
- [x] **6.2** rc35.2 — `/app/print-test` Diagnose-Page mit Health-Auto-Poll, CUPS-Queue-Tabelle, Sample-Label-Test, Full-Flow-Test, Aktivitäts-Log, CLI-Diagnose-Snippets. Frank-freundliche Offline-Message (keine Terminal-Kommandos in UI). Sample-Label-Endpoint-404 gefixt (Medusa filtert `*-test*`-Backend-Dirs → umbenannt `print-bridge/sample-label`).
- [x] **6.3** Operations-Hub-Kachel „Print Bridge Test" mit Live-Status-Line (Silent Print / DRY_RUN / Offline).
- [x] **6.4** install.sh erkennt IPP-Everywhere / AirPrint-Drucker (`dnssd://...ipps` URI-Pattern) und schickt zu Systemeinstellungen für manuelle Brother-PPD-Einrichtung — war der Dauerbrenner bei Frank heute, die GUI-Route über „+" führte zu falschem Treiber.
- [x] **6.5** rc37 — **brother_ql-Backend.** Nach CUPS-Marathon (LPD-Queue-0%-stuck, AirPrint-Auto-Discovery-Sticky) auf die Community-Standard-Library umgestellt. Python-Bridge v2.0.0 mit Backend-Auswahl per env-var. pypdfium2 (PDF→PIL) + Pillow (resize 306px) + brother_ql (convert + TCP-Send an Port 9100). Keine CUPS-Queue mehr nötig. Installer erstellt venv + pip install brother_ql + Bonjour-Autodetect der Drucker-IP. **Franks erstes echtes Label gedruckt: 3679 bytes PDF → 88501 bytes Raster → physisch in der Hand.**
- [x] **6.6** Bridge-Response-Shape klarer (outcome=sent ist authoritative, did_print unzuverlässig wegen brother_ql-Status-Read-Timing). 7 Memory-Einträge geschrieben für künftige Debug-Sessions (Safari Mixed-Content, Medusa test-Filter, bash-3.2-empty-array, zsh read -p, lpstat -e DE-Locale, brother_ql did_print, Brother PPD vs AirPrint).

#### Phase 7: Inventur-UX-Generalüberholung + Barcode-Format (rc38, 2026-04-22)

- [x] **7.1** Preis-Bug Copy #1: Frontend Delta-Check entfernt + Backend-verify spiegelt `new_price` auf `exemplar_price` (damit Label den frischen Wert liest, COALESCE-Order ist exemplar→direct→legacy).
- [x] **7.2** Catalog-Detail POST-Response shape-identisch zum GET (inventory_item-Merge), damit Label-drucken-Button nicht verschwindet nach Preis-Save.
- [x] **7.3** Catalog-Preis-Change loggt jetzt Movement mit `reason=catalog_price_update` + old/new-Price in reference → Item-History zeigt auch Non-Session-Änderungen.
- [x] **7.4** Verify-Form hat zwei explizite Buttons: `[S] Nur Speichern` (ghost) + `[V] Speichern & Drucken` (gold). Auto-Print-Checkbox (versteckter State) entfernt. Keyboard: S, V. Frank will bewusste Trennung statt Auto-Mechanismus.
- [x] **7.5** Recent-Activity aus DB: neuer Endpoint `/admin/erp/inventory/recent-activity?limit=10` mit CTE DISTINCT ON (inventory_item_id) + Preis aus Movement-reference (zeitpunkt-genau). Session-Page fetch't beim Mount → überlebt Page-Reload.
- [x] **7.6** Inventory-Hub Skeleton-Rendering: Full-Page-Loading-Block entfernt (Franks „5-10s bis was erscheint"). Stats-Zellen zeigen `—` als Placeholder bis Fetch kommt.
- [x] **7.7** Verifiziert-Timestamp-Spalte in Hub-Browse-Tabelle (DD.MM.YY HH:MM, de-DE Locale). Backend-Endpoint liefert `last_verified_at` bereits (MAX aller Exemplare).
- [x] **7.8** Back-to-Session-Banner im Catalog-Detail via sessionStorage-Flag (6h-stale-guard). Goldener Banner oben mit „← Zurück zur Inventur-Session"-Button wenn Flag aktiv.
- [x] **7.9** Label zeigt beide Conditions (Media + Sleeve) als `M:NM S:VG+` in der Meta-Zeile statt single-string-Fallback.
- [x] **7.10** Catalog-Suche findet Inventory-Barcodes via whereIn-Subquery auf `erp_inventory_item.barcode`. Frank scannt VOD-000002 im Catalog → findet Release.
- [x] **7.11** Barcode-Format-Reform: `VOD-000001` → `000001VODe`. Grund: alter Präfix kollidierte visuell mit article_number `VOD-19586`. Suffix `VODe` macht Typ-Unterschied offensichtlich. Session-Search-Regex akzeptiert beide Formate (Übergangsphase). Counter `erp_barcode_seq` läuft kontinuierlich weiter.
- [x] **7.12** Label zeigt article_number zusätzlich zum Barcode: neue Header-Zeile oberhalb Barcode (8pt Helvetica-Bold grau zentriert). Frank sieht Artikel + Exemplar auf einen Blick.
- [x] **7.13** 4 bereits-verifizierte Asmus-Tietchens-Exemplare via Supabase zurückgesetzt (barcode=NULL, conditions=NULL, price_locked=false) + Audit-Movement mit `reason=admin_reset`. Frank kann sie frisch im neuen Format verifizieren.

**Nächste Aktion (Frank):** Inventur-Durchlauf im echten Betrieb auf Mac Studio. Asmus-Tietchens-Platten frisch verifizieren (kriegen jetzt neue Barcodes `000005VODe` bis `000008VODe` + Labels mit dem Artikel-Header). Weitere Platten durchgehen — der Workflow sollte jetzt flüssig laufen: Suchen, Zustand (M+S) eingeben, Preis eingeben, [S] oder [V] klicken, wieder zurück zur Suche. Bei Problemen Status im `/app/print-test` + Operations-Hub prüfen.

**Nächste Aktion (Robin):** MacBook Air bei Frank aufsetzen: gleicher Flow wie heute (Brother-Treiber → `git pull && bash install.sh`), plus Brother-Drucker auf Mac Studio als Netzwerk-Drucker zweit-anmelden damit beide Macs drucken können. Dann Frank weiter machen lassen + Mittelfristig: Discogs-Mapping Review (`docs/audit_discogs_flagged_2026-04-21.csv`, 431 Items).

#### Nice-to-have (nicht blockierend)

- [x] QZ Tray Silent-Print — Client-Code via `wss://localhost:8181`, Installation via Setup-Kit (2026-04-14)
- [x] QZ Tray Integration im Admin-Session-Screen live (lazy CDN, fuzzy printer match, iframe fallback) (2026-04-21)
- [ ] onScan.js Integration für HID-Scanner im Session-Screen (Phase B6)
- [ ] **Discogs-Mapping Manual Review** — `docs/audit_discogs_flagged_2026-04-21.csv` durchgehen, zuerst die 10 Fälle mit Score < 0.3 (trivial falsch), dann 138 mittlere (0.3–0.5). Jeder Fix via Catalog-Detail → Discogs-Linking Card → Discogs-ID korrigieren → „Fetch from Discogs". Beispiel VOD-16530 (`legacy-release-20267`): aktuell `discogs_id=430134`, richtig wäre `1048274`. Low-Priority, Frank-Selbstbedienung.

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

### 4. Redis + Rate-Limiting + Datenschutz-Fix

**Ziel:** Kritische Endpoints vor Brute-Force/Spam schützen und Datenschutzerklärung mit Realität in Einklang bringen — sauberer Zustand vor Launch, danach kein Nacharbeiten nötig.
**Status:** Upstash Redis wurde 2026-04-17 wegen Inaktivität archiviert (war nur als Health-Check-Ziel provisioniert, nie produktiv im Einsatz). Datenschutz behauptet Upstash-Nutzung, die es faktisch nicht gibt.
**Blocker:** Keiner — kann jederzeit starten.
**Nächste Aktion:** Neues Upstash-Projekt in eu-central-1 anlegen, `@upstash/redis` + `@upstash/ratelimit` in Backend einbauen.

#### Kontext (warum jetzt)

Aktuelle Gaps:
- **Kein Rate-Limiting** auf Login, Gate-Passwort, Apply-Form, Bid-Submit → Brute-Force und Bot-Spam wirtschaftlich möglich
- **Datenschutz (`storefront/src/app/datenschutz/page.tsx`) nennt Upstash als Auftragsverarbeiter**, obwohl kein Produktions-Code Redis nutzt → DSGVO-Transparenz-Inkonsistenz
- **Webhook-Idempotenz ist bereits DB-seitig gelöst** (Stripe `backend/src/api/webhooks/stripe/route.ts:90,214`, PayPal `backend/src/api/webhooks/paypal/route.ts:69,76`) — Redis-Layer hier redundant, bewusst NICHT Teil dieses Workstreams
- **Middleware/Site-Config-Cache via Redis** wäre bei einer PM2-Instanz nur marginal besser als In-Memory → bewusst deferred (siehe Hinweise)

Architektur-Entscheidungen:
- Upstash REST-Client (`@upstash/redis`), keine persistente Socket-Verbindung → passt zu PM2, später serverless-fähig
- `@upstash/ratelimit` (Sliding-Window) als Standard-Package, nicht selbst schreiben
- Fail-open für User-facing Endpoints (Login/Apply/Gate) — lieber verfügbar bleiben als legit User aussperren wenn Upstash down
- Fail-closed für Admin-Endpoints (strengere Sicherheit OK, interne User)
- Keys als `vod:ratelimit:<domain>:<id>` mit explizitem TTL, Graceful-Degrade wenn Redis nicht erreichbar

#### Offene Aufgaben

**Setup:**
- [ ] Neues Upstash-Projekt anlegen (Name `vod-auctions`, Region `eu-central-1`, Free-Plan)
- [ ] Credentials in 1Password ablegen + `backend/.env` + `backend/.env.staging.example` aktualisieren
- [ ] Deps: `npm install @upstash/redis @upstash/ratelimit` im Backend
- [ ] `backend/src/lib/redis.ts` — typisierter Client mit Graceful-Degrade (exportiert `getRedis()` — gibt `null` wenn nicht konfiguriert)

**Rate-Limiting (Backend):**
- [ ] Helper `backend/src/lib/rate-limit.ts` mit `checkRateLimit(identifier, config)` → `{ success, remaining, reset }`
- [ ] Login-Endpoints (`/auth/customer/emailpass` etc.): 5 Versuche / 15 Min / IP, fail-open
- [ ] Gate-Passwort `/api/gate`: 10 Versuche / h / IP, fail-open (Storefront-Route, läuft in Next.js)
- [ ] Apply-Form `/store/waitlist/apply`: 3 Submissions / h / IP, fail-open
- [ ] Bid-Submit `/store/account/bids`: 30 Gebote / Min / User, fail-open (toleranter für Last-Second-Bidding in aktiven Auktionen — Wert final bei Tests justieren)
- [ ] 429-Response mit `Retry-After` Header + `X-RateLimit-*` Headers
- [ ] Admin-Endpoints: noch zu entscheiden, ob separater Limit mit fail-closed nötig

**Rate-Limiting (Storefront):**
- [ ] Gate-Route `/api/gate` in Next.js: gleicher Redis-Client client-side via `@upstash/redis` REST
- [ ] Alternativ: Gate-Check serverseitig im Backend, Storefront delegiert

**Datenschutz-Fix:**
- [ ] `storefront/src/app/datenschutz/page.tsx` Zeilen 129, 210, 214 — Upstash-Erwähnung aktualisieren (nicht streichen, weil Redis ja jetzt echt genutzt wird — Text präzisieren: "zur Rate-Limiting-Verarbeitung", nicht "Caching von Katalogdaten")
- [ ] Verarbeitungs-Verzeichnis (AVV) prüfen: haben wir einen AV-Vertrag mit Upstash? Falls nein, abschließen (DSGVO Art. 28)

**System-Health:**
- [ ] `backend/src/api/admin/system-health/route.ts` — Redis-Check zeigt jetzt sinnvollen Status (connected + latency) statt nur Ping

**Testing:**
- [ ] Manueller Brute-Force-Test gegen Login (10 Versuche in 1 Min) → sollte auf 429 sperren
- [ ] Apply-Form-Spam-Test → 429 nach 3 Submissions
- [ ] Bid-Test in aktiver Auktion → 30 Gebote/Min sollten durchgehen, 31. blockt
- [ ] Redis-Down-Test: Credentials temporär kaputt setzen → Endpoints funktionieren weiter, keine 500er

#### Bewusst NICHT Teil dieses Workstreams (dokumentiert für später)

- **Webhook-Idempotenz via Redis** — bereits DB-seitig gelöst, redundant
- **Middleware platform_mode Cache** — bei einer PM2-Instanz marginal, erst bei Skalierung relevant
- **Backend site-config Cache** — gleich wie oben
- **Live-Bidding Hot-Path Cache** (`auction:<id>:current_bid`) — erst bei echtem Traffic nötig, aktuell Supabase Realtime + DB-Reads ausreichend
- **Catalog-Listing Cache** — Next.js ISR reicht aktuell

Diese Punkte werden erst gezogen, wenn konkrete Metriken (Response-Zeit, Last, Fehlerrate) einen Bedarf zeigen.

#### Hinweise

- **Free-Tier-Limit:** 10.000 Commands/Tag. Bei Rate-Limiting ~2-5 Commands pro geschützter Request = ausreichend für Pre-Launch + frühe Launch-Phase. Monitoring via Upstash-Console.
- **Staging:** Eigene zweite Upstash-DB (Free-Plan erlaubt 2 DBs pro Account) wenn Staging-HTTP-Layer kommt. Bis dahin Prod-only.
- **Kosten nach Free-Tier:** $0.20 / 100k Commands — überschaubar auch bei 10x Traffic.
- **Ursprüngliches Archiv:** Alte DB wird NICHT wiederhergestellt (enthielt nur Health-Check-Pings).

---

### 5. Sendcloud-Integration (ERP_SENDCLOUD)

**Ziel:** Shipping-Labels direkt aus Admin generieren statt manuell bei DHL.
**Status:** Voraussetzungen vorhanden, Code nicht geschrieben.
**Blocker:** Keiner — kann jederzeit starten.
**Nächste Aktion:** Sendcloud Client-Wrapper bauen + DHL-Anbindung konfigurieren.

#### Offene Aufgaben

- [ ] **Staging-HTTP-Layer bauen BEVOR Sendcloud-Code live geht** (siehe Hinweise)
- [ ] Sendcloud Client-Wrapper + DHL konfigurieren (DHL-GK: 5115313430)
- [ ] Admin UI Shipping-Label-Generierung in Orders-Detail
- [ ] Feature Flag `ERP_SENDCLOUD` aktivieren

#### Hinweise

- Sendcloud-Account existiert (erstellt 2026-04-07)
- Konzept: `docs/optimizing/ERP_WARENWIRTSCHAFT_KONZEPT.md`
- **Staging-Kopplung:** Sendcloud triggert echte Versandlabels → muss zwingend gegen Sandbox/Staging getestet werden. Staging-DB existiert (`aebcwjjcextzvflrjgei`, aktuell pausiert wegen Inaktivität), aber HTTP-Layer (PM2 + nginx + DNS + SSL für `staging.vod-auctions.com` / `api-staging.` / `admin-staging.`) ist deferred. Siehe `docs/architecture/STAGING_ENVIRONMENT.md` §4+§6. Setup-Aufwand ~1 Tag, $0 Kosten. Als ersten Schritt dieses Workstreams ziehen, bevor Sendcloud-Code auf Prod geht.

---

### 6. Sync Monitoring

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

**Ziel:** AI-generierte Beschreibungen für alle Entities (Bands, Labels, Press).
**Status:** P2 paused. Aktuell 26,0% gesamt (19.623 / 75.352). Running-Batch 576/3.650. ~55.729 offen.
**Blocker:** Provider-Entscheidung + Budget. OpenAI-Kontingent bremst. LLM-Migration evaluiert (siehe Konzept-Doc).
**Nächste Aktion:** Ollama-Pilot auf MacBook M5 Pro 48GB (100 Entities Test-Run) — Quality + Speed gegen P1-Baseline (Ø 82,3) messen.

#### Referenzen

- Pipeline: `scripts/entity_overhaul/`
- LLM-Migration Konzept: [`docs/optimizing/ENTITY_OVERHAUL_LLM_MIGRATION.md`](optimizing/ENTITY_OVERHAUL_LLM_MIGRATION.md)
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
| 2026-04-22 | Search-Performance 47× schneller: 4 neue GIN-trgm-Indizes + UNION-Pattern in Admin + Storefront. 6s → 130ms Admin, 5s → 148ms Storefront (live gemessen) |
| 2026-04-22 | Article-Number-Search (VOD-19586 tape-mag Katalog-Nummer) im Inventur-Session-Screen verfügbar — als Exact-Match + Text-Search + Scanner-Regex |
| 2026-04-22 | Discogs-Preis-Semantik in Inventur-Session klarer (Markt vs Suggestion als 2 Zeilen + Link zur Sales-History auf discogs.com) + 3 Quick-Fill-Buttons statt 1 |
| 2026-04-22 | PM2-Config Storefront gefixt: direkter Next-Bin-Pfad statt pnpm-Shell-Wrapper in `.bin/next` |
| 2026-04-21 | Konsistenz-Audit + Storefront-Preis-Fix: `/store/catalog/*` liest jetzt COALESCE(legacy, direct) → Non-Cohort-A Items (via Inventur erfasst) im Shop kaufbar statt als NaN/not-purchasable |
| 2026-04-21 | Multi-Surface Label-Print konsolidiert: `printLabelAuto()` shared helper, QZ Tray Install via direkten .pkg-Download (brew cask ist weg), Label-PDF 2-Page-Bug gefixt |
| 2026-04-21 | `INSTALLATION.md` für Franks Macs — Step-by-Step Guide für MacBook Air M5 + Mac Studio mit Troubleshooting |
| 2026-04-21 | Inventur v2 Bug-Fixes nach erstem echten Test-Durchlauf: 12 Bugs in einem Zug, QZ Tray Silent-Print live, Catalog als COALESCE-Source-of-Truth, Discogs-Linking editierbar, Schema-Fix genres=TEXT[] |
| 2026-04-21 | Genre/Styles-Backfill auf VPS: 137 Releases aus `discogs_api_cache` befüllt |
| 2026-04-21 | Discogs-Mapping Audit: 431 geflaggte Mappings identifiziert (`audit_discogs_flagged_2026-04-21.csv`) — manuelles Review durch Frank |
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
