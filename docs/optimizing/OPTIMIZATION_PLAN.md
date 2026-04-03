# VOD Auctions — Optimization Plan

**Basiert auf:** Technische Analyse & UI/UX Analyse (externe Bewertung, April 2026)
**Erstellt:** 2026-04-03
**Status:** Ready for Linear Import

---

## Bewertung der externen Analyse

Die beiden Analysen bewerten die Plattform insgesamt sehr positiv (Performance Top 1%, Design 92%, Bidding 85%). Allerdings basieren sie auf einem **veralteten Stand** — viele als "kritisch" eingestufte Punkte sind bereits implementiert:

| Analyse-Punkt | Einstufung Analyse | Tatsächlicher Status |
|---|---|---|
| Anti-Sniping fehlt | P0 kritisch | **Bereits implementiert** (3-Min-Extension, Supabase Broadcast) |
| Echtzeit-Updates fehlen | P0 kritisch | **Bereits implementiert** (Supabase Realtime, 3 Channels) |
| Mobile Responsiveness | P0 kritisch | **Bereits implementiert** (Hamburger-Menu, Touch, responsive Grid) |
| Image Lightbox/Zoom | P0 sofort | **Bereits implementiert** (2x Zoom, Swipe, Keyboard-Nav) |
| Skeleton-UI | P1 kurzfristig | **Bereits implementiert** (animate-pulse, Dark Theme) |
| Outbid-Notifications | P1 kurzfristig | **Bereits implementiert** (E-Mail + On-Site Banner, Realtime) |
| Scroll-Bug Lot-Detail | P0 sofort | **Teilweise behoben** (scroll-mt-20, kein akuter Bug erkennbar) |
| Autocomplete-Suche | P1/P2 | **Nicht implementiert** |
| Design Tokens erweitern | P2 | **Teilweise** (Farben ja, Spacing/Shadows ad-hoc) |
| Typografie-Skala | P2 | **Teilweise** (kein proportionales System) |

**Fazit:** Von den 3 "vor Go-Live zwingend beheben"-Punkten sind **alle 3 bereits erledigt**. Der verbleibende Handlungsbedarf liegt bei UX-Verbesserungen und Infrastruktur-Optimierungen.

---

## Querschnitts-Anforderungen

Die folgenden Anforderungen gelten für **jedes Issue** in diesem Plan:

### Testing
- Jedes Issue muss eine **Testroutine** enthalten (manuell oder automatisiert)
- **Regressionstests:** Abhängigkeiten zu bestehenden Funktionen müssen identifiziert und getestet werden
- Insbesondere: Bidding-Flow, Checkout/Payment, Realtime-Updates, Auth und Cart dürfen durch keine Änderung beeinträchtigt werden
- Für Frontend-Änderungen: Cross-Browser (Chrome, Safari, Firefox) + Mobile (390px, 768px, 1440px)
- Für Backend-Änderungen: Bestehende API-Endpunkte müssen weiterhin korrekt funktionieren

### User Tracking (RudderStack + GA4)
- Neue Features müssen **Tracking-Events** implementieren (RudderStack `track()` + GA4 Events)
- Bestehende Tracking-Events dürfen nicht unterbrochen werden
- Event-Naming-Konvention: `snake_case`, z.B. `search_autocomplete_used`, `auction_archive_viewed`
- Identify-Calls bei User-Interaktionen, die den Profil-Kontext ändern

### SEO
- Neue Seiten erhalten **Schema.org-Markup**, Open Graph Tags, Canonical Links
- URL-Struktur: saubere, sprechende URLs (`/auctions/archive/block-name`)
- Dynamische `<title>` und `<meta description>` pro Seite
- Keine Duplicate Content-Probleme (Canonical auf Pagination, Filter-URLs)
- Sitemap-Aktualisierung bei neuen Routes

### Backend Admin-Erweiterungen
- Jedes Feature mit Daten-Relevanz erhält ein **Admin-Panel** oder erweitert ein bestehendes
- Admin-UI folgt dem Design System (`docs/DESIGN_GUIDE_BACKEND.md` v2.0)
- Konfigurations-Optionen über `/admin/config` statt hartcodiert

### Dokumentation & Release
- Jede Änderung wird in `docs/architecture/CHANGELOG.md` dokumentiert
- GitHub Release Notes bei Meilensteinen (Phase-Abschlüsse)
- Betroffene CLAUDE.md-Sektionen aktualisieren (API Quickref, Database Schema, etc.)
- Neue Admin-Routes in CLAUDE.md Admin-Sektion aufnehmen

---

## Verbleibende Optimierungen — Linear Issues

### Phase 1: Go-Live Readiness (vor Launch)

---

#### ISSUE-01: Scroll-Bug Lot-Detailseiten verifizieren und beheben
**Type:** Bug
**Priority:** P0
**Labels:** `frontend`, `ux`, `bug`

**Beschreibung:**
Die externe Analyse berichtet von 3-4 Viewport-Höhen schwarzem Leerraum nach dem Bidding-Bereich auf Lot-Detailseiten. `scroll-mt-20` ist bereits implementiert, aber das CSS-Height-Problem bei Lazy-Loading-Containern muss auf allen Viewports (Desktop + Mobile) systematisch verifiziert werden.

**Acceptance Criteria:**
- [ ] Lot-Detailseite auf Desktop (1440px, 1920px) ohne schwarzen Leerraum
- [ ] Lot-Detailseite auf Mobile (390px, 768px) ohne schwarzen Leerraum
- [ ] Tracklist, Credits und Related Lots sind direkt nach dem Bidding-Bereich sichtbar
- [ ] Kein Layout-Shift beim Laden von Lazy-Loading-Containern

**Tests:**
- [ ] Visueller Test auf Chrome, Safari, Firefox (Desktop + Mobile Viewports)
- [ ] Lighthouse Layout-Shift-Score bleibt unter 0.1
- [ ] Bestehende Bidding-Funktionalität nicht beeinträchtigt

**Betroffene Dateien:** `storefront/src/app/auctions/[slug]/[itemId]/page.tsx`, zugehörige CSS

---

#### ISSUE-02: Homepage-Übergang unterhalb Active Auctions glätten
**Type:** Improvement
**Priority:** P1
**Labels:** `frontend`, `ux`, `design`

**Beschreibung:**
Die UI/UX-Analyse identifiziert einen "abrupten Übergang" unterhalb der Active Auctions-Sektion auf der Homepage. Der visuelle Flow zwischen den Sektionen (Hero → Active Auctions → Catalog Highlights → About) soll fließender gestaltet werden.

**Acceptance Criteria:**
- [ ] Sanfter visueller Übergang zwischen Active Auctions und nachfolgender Sektion
- [ ] Keine harten Farbwechsel oder Layout-Sprünge
- [ ] Konsistent mit dem "Vinyl Culture" Design System

**Tests:**
- [ ] Visueller Test auf Desktop + Mobile
- [ ] Live-Auction-Banner weiterhin korrekt funktionsfähig
- [ ] GA4 `page_view` Events feuern weiterhin korrekt

**Betroffene Dateien:** `storefront/src/app/page.tsx`, Homepage-Sektionen

---

#### ISSUE-03: Bid-Confirmation Animation und Sound-Feedback
**Type:** Feature
**Priority:** P1
**Labels:** `frontend`, `ux`, `bidding`

**Beschreibung:**
Nach erfolgreichem Gebot fehlt eine deutliche visuelle Bestätigung. Aktuell wird der Preis aktualisiert, aber ein explizites Erfolgs-Feedback (Animation + optionaler Sound) würde das Vertrauen in den Bidding-Prozess stärken.

**Acceptance Criteria:**
- [ ] Success-Animation nach erfolgreichem Gebot (z.B. Checkmark + Pulse)
- [ ] "Place Bid"-Button zeigt Loading-State während der Verarbeitung
- [ ] Optionaler Sound-Effekt (muted by default, User-Preference)
- [ ] Animation funktioniert auf Mobile und Desktop

**Tests:**
- [ ] Bid-Flow End-to-End: Gebot abgeben → Animation → Preis-Update → Realtime-Sync
- [ ] Proxy Bidding Toggle weiterhin funktional
- [ ] Outbid-Notification weiterhin korrekt nach Gegengebot
- [ ] Anti-Sniping Extension weiterhin ausgelöst
- [ ] RudderStack `bid_placed` Event weiterhin korrekt

**Tracking:**
- [ ] Neues Event: `bid_confirmation_shown` (mit sound_enabled: true/false)

**Backend Admin:**
- [ ] Sound-Effekt on/off konfigurierbar über `/admin/config` (Auction Settings)

**Betroffene Dateien:** `storefront/src/components/ItemBidSection.tsx`

---

#### ISSUE-04: SEO-Strategie und Sitemap für Go-Live
**Type:** Improvement
**Priority:** P1
**Labels:** `seo`, `infrastructure`

**Beschreibung:**
Die Analyse weist korrekt darauf hin, dass 32.000+ Katalogseiten mit Schema.org-Markup nicht indexiert werden können, solange das Passwort-Gate aktiv ist. Der Übergangsplan zum Entfernen des Gates und die SEO-Infrastruktur müssen vor dem Launch stehen.

**Acceptance Criteria:**
- [ ] Dynamische Sitemap (`/sitemap.xml`) mit allen Catalog-, Artist-, Label-, Press-Seiten
- [ ] Sitemap-Index für > 50.000 URLs (Split in Sub-Sitemaps)
- [ ] `robots.txt` dynamisch basierend auf `platform_mode` (noindex in beta/pre_launch)
- [ ] Catalog-Seiten erhalten `index,follow` sobald Gate entfällt
- [ ] Canonical-Tags auf paginierten Seiten und Filter-URLs
- [ ] Auction-Block-Seiten: Schema.org `AuctionEvent`
- [ ] Structured Data Testing Tool: 0 Fehler

**Tests:**
- [ ] Sitemap validieren (max 50.000 URLs pro Datei, < 50MB)
- [ ] Google Search Console Submit nach Go-Live
- [ ] Keine Seiten mit `noindex` die indexiert werden sollen

**Backend Admin:**
- [ ] SEO-Status Dashboard in `/admin/config` (Indexed Pages Count, Sitemap Last Generated)
- [ ] Toggle: "Allow Search Engine Indexing" (verknüpft mit platform_mode)

**Betroffene Dateien:** `storefront/src/middleware.ts`, neue `storefront/src/app/sitemap.ts`, `storefront/src/app/robots.ts`

---

### Phase 2: Post-Launch Verbesserungen

---

#### ISSUE-05: Autocomplete-Suche mit Typeahead für 41K+ Katalog
**Type:** Feature
**Priority:** P2
**Labels:** `frontend`, `backend`, `search`, `ux`

**Beschreibung:**
Die aktuelle Suche leitet auf `/catalog?q=...` weiter — kein Typeahead, keine Suggestions. Bei 41.500+ Einträgen ist eine Echtzeit-Suche mit Autocomplete essentiell. Optionen: Meilisearch (self-hosted, kostenlos), Algolia (SaaS, Free bis 10K Records), oder PostgreSQL Full-Text-Search mit pg_trgm.

**Empfehlung:** Meilisearch auf VPS (Docker, ~128MB RAM, kostenlos) — passt zum Self-Hosted-Ansatz.

**Acceptance Criteria:**
- [ ] Typeahead-Suche im Header mit Debounced-Input (300ms)
- [ ] Suggestions zeigen Release-Titel, Artist, Label mit Cover-Thumbnail
- [ ] Max 6-8 Suggestions, gruppiert nach Typ (Releases, Artists, Labels)
- [ ] Keyboard-Navigation (Arrow Keys + Enter)
- [ ] Mobile-optimiert (Fullscreen-Overlay auf < 768px)
- [ ] Suchindex wird bei Legacy-Sync automatisch aktualisiert

**Tests:**
- [ ] Suche nach Artist-Name → korrekte Releases
- [ ] Suche nach Release-Titel → korrekte Ergebnisse mit Thumbnail
- [ ] Suche mit Typo → Fuzzy-Match liefert Ergebnisse
- [ ] Performance: < 100ms Antwortzeit bei Typeahead
- [ ] Header-Navigation, Cart-Badge, Auth-State weiterhin korrekt
- [ ] Mobile: Overlay öffnet/schließt sauber, kein Scroll-Lock-Bug

**Tracking:**
- [ ] `search_autocomplete_used` (query, result_count, selected_type)
- [ ] `search_result_clicked` (query, result_id, position)

**SEO:**
- [ ] Search-Seite mit `noindex` (Duplicate Content vermeiden)
- [ ] Canonical auf `/catalog` mit Query-Params

**Backend Admin:**
- [ ] Meilisearch Health-Check in `/admin/operations` (System Health Sektion)
- [ ] Manueller Re-Index-Button im Admin
- [ ] Suchindex-Statistik: Anzahl indexierte Releases, Artists, Labels

**Betroffene Dateien:** Neuer Service (Meilisearch Docker), Backend-Indexer, `storefront/src/components/layout/Header.tsx`, neue `SearchAutocomplete.tsx`

---

#### ISSUE-06: Faceted Search — Genre, Format, Jahrzehnt, Preis kombinierbar
**Type:** Feature
**Priority:** P2
**Labels:** `frontend`, `backend`, `search`, `ux`

**Beschreibung:**
Die Katalog-Filter (Format, Typ, Land) sind nicht kombinierbar als Faceted Search. Sammler wollen nach "Vinyl + Industrial + 1980-1989 + For Sale" gleichzeitig filtern.

**Acceptance Criteria:**
- [ ] Multi-Filter kombinierbar (AND-Verknüpfung)
- [ ] Filter-Chips zeigen aktive Filter mit "X" zum Entfernen
- [ ] URL-State: Filter werden in Query-Params persistiert (shareable URLs)
- [ ] Facet-Counts: Jeder Filter zeigt Anzahl der Ergebnisse
- [ ] Genre-Filter basierend auf `entity_content.genre_tags`
- [ ] Jahrzehnt-Filter (1970s, 1980s, 1990s, 2000s+)
- [ ] Preis-Range-Slider (wenn Discogs-Preise verfügbar)

**Tests:**
- [ ] Kombination aller Filter gleichzeitig → korrekte Ergebnismenge
- [ ] URL mit Filtern teilen → gleiche Ergebnisse beim Öffnen
- [ ] Filter entfernen → Ergebnisse aktualisieren sofort
- [ ] Performance: < 500ms bei komplexen Filter-Kombinationen
- [ ] Pagination weiterhin korrekt mit aktiven Filtern
- [ ] "For Sale" Filter weiterhin funktional

**Tracking:**
- [ ] `catalog_filter_applied` (filter_type, filter_value, result_count)
- [ ] `catalog_filter_combination` (active_filters[], result_count)

**SEO:**
- [ ] Canonical auf ungefilterte URL bei Filter-Seiten
- [ ] Keine Index-Probleme durch Filter-Parameter-Kombinationen

**Backend Admin:**
- [ ] Genre-Tags-Übersicht in Catalog Admin (welche Genres existieren, Verteilung)

**Betroffene Dateien:** `storefront/src/components/CatalogClient.tsx`, `backend/src/api/store/catalog/route.ts`

---

#### ISSUE-07: Completed Auctions Archiv mit Preishistorie
**Type:** Feature
**Priority:** P2
**Labels:** `frontend`, `backend`, `auctions`

**Beschreibung:**
Sammler wollen Ergebnisse vergangener Auktionen einsehen, um Marktwerte einzuschätzen. Aktuell verschwinden beendete Auktionen. Ein öffentliches Archiv mit Endpreisen und Bid-Count stärkt Vertrauen und SEO-Wert.

**Acceptance Criteria:**
- [ ] `/auctions/archive` Seite mit Liste beendeter Blöcke
- [ ] Archiv-Detailseite zeigt: Lot, Endpreis, Anzahl Gebote, Zuschlagsdatum
- [ ] Anonymisierte Bieter (wie in aktiven Auktionen)
- [ ] Suchbar nach Release-Titel und Artist
- [ ] Sortierung: neueste zuerst, nach Endpreis

**Tests:**
- [ ] Archiv zeigt nur ended/archived Blöcke, keine aktiven
- [ ] Endpreise stimmen mit tatsächlichen Auktionsergebnissen überein
- [ ] Aktive Auktions-Seiten weiterhin korrekt
- [ ] Bidding auf aktive Lots nicht beeinträchtigt

**Tracking:**
- [ ] `auction_archive_viewed` (block_slug)
- [ ] `auction_archive_lot_clicked` (lot_id, end_price)

**SEO:**
- [ ] Schema.org `AuctionEvent` mit `endDate` und `price`
- [ ] Archiv-Seiten in Sitemap aufnehmen
- [ ] Unique `<title>`: "Auction Results: [Block Name] | VOD Auctions"

**Backend Admin:**
- [ ] Archiv-Visibility Toggle pro Block (Admin kann einzelne Blöcke aus dem Archiv ausschließen)
- [ ] Analytics-Tab im Block-Detail zeigt Archiv-Views

**Betroffene Dateien:** Neue Route `storefront/src/app/auctions/archive/`, `backend/src/api/store/auction-blocks/route.ts`

---

#### ISSUE-08: Catalog Infinite Scroll oder Virtualisierung
**Type:** Improvement
**Priority:** P2
**Labels:** `frontend`, `ux`, `performance`

**Beschreibung:**
Bei 24 Items pro Seite entstehen 1.370+ Seiten. Infinite Scroll verbessert die Browse-Experience für Sammler die stöbern. Pagination bleibt als Fallback.

**Acceptance Criteria:**
- [ ] Infinite Scroll mit Intersection Observer (Load More bei 80% Scroll)
- [ ] URL-State bleibt synchron (Back-Button funktioniert)
- [ ] Loading-Indicator am Ende der Liste
- [ ] Fallback auf klassische Pagination bei JS-disabled
- [ ] Performance: Max 200 DOM-Nodes gleichzeitig (Virtualisierung wenn nötig)

**Tests:**
- [ ] 500+ Items laden ohne Performance-Einbruch
- [ ] Back-Button nach Klick auf Item → korrekte Scroll-Position
- [ ] Filter + Infinite Scroll Kombination funktioniert
- [ ] "For Sale" Toggle weiterhin korrekt
- [ ] Cart-Interaktion (Add to Cart) weiterhin von jeder Position möglich

**Tracking:**
- [ ] `catalog_load_more` (page_number, items_loaded_total)

**SEO:**
- [ ] `<link rel="next/prev">` für Crawler
- [ ] Erste Seite server-rendered (SSR), Folgeseiten client-loaded

**Betroffene Dateien:** `storefront/src/components/CatalogClient.tsx`

---

#### ISSUE-09: Bilder-Infrastruktur — Cloudflare R2 Integration und laufender Sync
**Type:** Improvement
**Priority:** P2
**Labels:** `infrastructure`, `reliability`

**Beschreibung:**
Die Bilder-Migration nach Cloudflare R2 ist bereits abgeschlossen (VOD_Migration Projekt: 160.957 Dateien, 99.5 GB in Bucket `vod-images`). **Aber:** VOD_Auctions referenziert weiterhin `tape-mag.com/bilder/gross/` URLs (Single Point of Failure), und es gibt **keinen laufenden Sync** für neue/geänderte Bilder.

**Zwei Aufgaben:**
1. **URL-Umstellung:** `coverImage` URLs von tape-mag.com auf R2 Public URL umstellen
2. **Laufender Sync:** Neue Bilder, die in der Legacy-DB hinzugefügt werden, automatisch nach R2 übertragen

**Acceptance Criteria:**
- [ ] Storefront referenziert R2 CDN-URLs statt tape-mag.com
- [ ] `next.config.ts` Image Domains auf R2 Custom Domain umgestellt
- [ ] `scripts/shared.py` → `IMAGE_BASE_URL` zeigt auf R2
- [ ] Inkrementeller Bild-Sync: `legacy_sync.py` erkennt neue/geänderte Bilder und lädt sie nach R2
- [ ] Fallback: Wenn R2-Bild nicht existiert → Fallback auf tape-mag.com
- [ ] Bestehende 160.957 Bilder in R2 bleiben unverändert

**Tests:**
- [ ] Alle Katalogbilder laden korrekt von R2
- [ ] Neues Bild in Legacy-DB → erscheint nach Sync in R2 und Storefront
- [ ] Fallback bei fehlendem R2-Bild funktioniert
- [ ] Image Optimization (Next.js) funktioniert mit R2 Origin
- [ ] OG-Image-Tags zeigen korrekten R2-URL

**Backend Admin:**
- [ ] Bilder-CDN Status in System Health: R2 Bucket erreichbar, Bild-Count, letzte Sync-Zeit
- [ ] Manueller Bild-Sync-Trigger im Admin

**Betroffene Dateien:** `storefront/next.config.ts`, `scripts/shared.py`, `scripts/legacy_sync.py`, `backend/src/api/admin/system-health/route.ts`

---

#### ISSUE-10: Onboarding-Flow für Erst-Bieter
**Type:** Feature
**Priority:** P2
**Labels:** `frontend`, `ux`, `conversion`

**Beschreibung:**
Neue Bieter landen direkt auf der Auktionsseite ohne Erklärung wie Proxy Bidding, Anti-Sniping oder der Checkout-Prozess funktionieren. Ein kurzes Onboarding (3-4 Steps) nach der Registrierung verbessert die Conversion-Rate.

**Acceptance Criteria:**
- [ ] Onboarding-Modal nach erster Registrierung (3-4 Slides)
- [ ] Erklärt: Proxy Bidding, Anti-Sniping, Checkout-Prozess
- [ ] "Don't show again" Option (localStorage)
- [ ] Mobile-optimiert
- [ ] Kann auch über Help/FAQ erneut aufgerufen werden

**Tests:**
- [ ] Onboarding erscheint nur bei Erst-Registrierung
- [ ] "Don't show again" persistiert über Sessions
- [ ] Auth-Flow (Login/Register/Logout) weiterhin ungestört
- [ ] Bidding-Flow nach Onboarding sofort nutzbar

**Tracking:**
- [ ] `onboarding_started` (step: 1)
- [ ] `onboarding_completed` (total_time_seconds)
- [ ] `onboarding_skipped` (skipped_at_step)

**Backend Admin:**
- [ ] Onboarding-Texte editierbar über Content Blocks (`content_block` Tabelle, page: onboarding)

**Betroffene Dateien:** Neue `storefront/src/components/OnboardingModal.tsx`, `storefront/src/components/AuthProvider.tsx`

---

### Phase 3: Design System & Polish

---

#### ISSUE-11: Design Tokens erweitern — Spacing, Shadows, Transitions
**Type:** Improvement
**Priority:** P3
**Labels:** `frontend`, `design-system`

**Beschreibung:**
Die Analyse bemängelt nur 28 CSS Custom Properties. Farb-Tokens sind gut definiert, aber Spacing, Shadows und Transitions nutzen ad-hoc Tailwind-Utilities statt zentraler Tokens. Ein erweitertes Token-System verbessert Konsistenz und Skalierbarkeit.

**Acceptance Criteria:**
- [ ] Spacing-Tokens: `--space-xs` bis `--space-3xl` (8px Basis-Grid)
- [ ] Shadow-Tokens: `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-gold` (Gold-Glow)
- [ ] Transition-Tokens: `--transition-fast` (150ms), `--transition-normal` (250ms), `--transition-slow` (400ms)
- [ ] Dokumentiert in `docs/DESIGN_GUIDE_FRONTEND.md`
- [ ] Bestehende Komponenten migriert (mindestens Header, Footer, Cards)

**Tests:**
- [ ] Visueller Regression-Test: Keine sichtbaren Änderungen nach Token-Migration
- [ ] Dark Mode / Light Mode (falls später): Tokens unterstützen Theming

**Betroffene Dateien:** `storefront/src/app/globals.css`, `docs/DESIGN_GUIDE_FRONTEND.md`

---

#### ISSUE-12: Typografie-Skala — Proportionales H1-H2-H3 System
**Type:** Improvement
**Priority:** P3
**Labels:** `frontend`, `design-system`, `typography`

**Beschreibung:**
H1 variiert zwischen `text-3xl` und `text-4xl` je nach Seite. H2-Elemente werden auf Lot-Seiten gar nicht eingesetzt. Ein konsistentes proportionales System (z.B. Major Third 1.25 oder Perfect Fourth 1.333) schafft klare visuelle Hierarchie.

**Acceptance Criteria:**
- [ ] Type-Scale definiert in `globals.css` als CSS Custom Properties
- [ ] H1: DM Serif Display, definierte Größe Desktop/Mobile
- [ ] H2: DM Serif Display, proportional zu H1
- [ ] H3: DM Sans Semibold, proportional zu H2
- [ ] Body/Small/Caption konsistent
- [ ] Alle Seiten nutzen die definierten Stufen

**Tests:**
- [ ] Visueller Vergleich vorher/nachher auf allen Seitentypen
- [ ] Accessibility: Heading-Hierarchie korrekt (H1 → H2 → H3, keine Sprünge)

**SEO:**
- [ ] H1 auf jeder Seite genau einmal vorhanden
- [ ] Heading-Hierarchie für Crawler sauber

**Betroffene Dateien:** `storefront/src/app/globals.css`, alle Seiten mit inkonsistenter Typografie

---

#### ISSUE-13: Discogs Cross-Referencing und Preisvergleich
**Type:** Feature
**Priority:** P3
**Labels:** `frontend`, `backend`, `integration`

**Beschreibung:**
Discogs-Preise sind bereits in der Datenbank (via `discogs_daily_sync.py`), aber im Frontend ausgeblendet (`{/* HIDDEN: ... */}` Marker in 5 Dateien). Cross-Referencing mit Discogs-Marketplace-Preisen als Wertindikator für Sammler.

**Acceptance Criteria:**
- [ ] Discogs-Median-Preis als "Market Value" Badge auf Lot-Detailseite
- [ ] Link zu Discogs-Release-Page (wenn `discogs_url` vorhanden)
- [ ] Preisvergleich-Indikator: "Below Market" / "At Market" / "Above Market"
- [ ] Nur anzeigen wenn echte Sale-Daten vorhanden (nicht geschätzt)

**Tests:**
- [ ] Preise stimmen mit Discogs-Daten überein
- [ ] Badge verschwindet wenn keine Discogs-Daten vorhanden
- [ ] Bidding-Flow durch Preis-Badge nicht beeinträchtigt

**Tracking:**
- [ ] `discogs_price_viewed` (release_id, discogs_median, current_bid)
- [ ] `discogs_link_clicked` (release_id)

**SEO:**
- [ ] Schema.org `offers.price` mit Discogs-Referenz als `priceSpecification`

**Backend Admin:**
- [ ] Discogs-Preis-Coverage Dashboard: Wie viele Releases haben Marktdaten?
- [ ] Toggle: Discogs-Preise anzeigen ja/nein (global)

**Betroffene Dateien:** 5 Storefront-Dateien mit `{/* HIDDEN: ... */}` Marker, `storefront/src/app/auctions/[slug]/[itemId]/page.tsx`

---

### Phase 2b: Post-Auction Marketing Funnel

---

#### ISSUE-17: Post-Auction Marketing Funnel — Cross-Sell + Shipping Savings
**Type:** Feature
**Priority:** P2
**Labels:** `frontend`, `backend`, `marketing`, `conversion`, `ux`

**Beschreibung:**
Nach einem Auktions-Gewinn den User dazu bewegen, weitere Artikel aus dem Direktkauf-Katalog hinzuzufügen, bevor er bezahlt. Kernargument: Versandkosten werden kombiniert — besonders relevant bei internationalen Lieferungen (€14.99 World). Technische Basis vorhanden: Combined Checkout (`order_group_id`), gewichtsbasierte Shipping-Berechnung, 5-Tage Zahlungsfrist.

**Vollständiges Konzept:** [`docs/optimizing/POST_AUCTION_MARKETING_FUNNEL.md`](POST_AUCTION_MARKETING_FUNNEL.md)

**User Flow (7 Touchpoints):**
1. Bid-Won Email mit Cross-Sell Sektion (3-4 passende Artikel)
2. Wins Page mit Shipping-Savings-Bar + Empfehlungen
3. Sticky "Unpaid Wins" Banner beim Catalog Browsing
4. Combined Checkout mit Savings-Highlight
5. Post-Payment: Next Auction Preview
6. Follow-Up Email (48h nach Payment)

**Phase A — Kern-Funnel:**
- [ ] Backend: `GET /store/account/recommendations` API (Artist, Label, Genre, Collaborative)
- [ ] Backend: `GET /store/account/shipping-savings` API (Gewicht, Kapazität, Savings)
- [ ] Shipping-Savings-Bar auf `/account/wins` (Progress-Bar mit Gold-Akzent)
- [ ] Recommendations Grid auf `/account/wins` (4-8 Artikel mit Add-to-Cart)
- [ ] Savings-Highlight im Checkout ("You saved €X on shipping")

**Phase B — Email + Banner:**
- [ ] Bid-Won Email: Cross-Sell Sektion
- [ ] Sticky "Unpaid Wins" Banner im Katalog
- [ ] "Ships with your auction wins!" Tooltip bei Add-to-Cart

**Phase C — Post-Payment:**
- [ ] Post-Payment: Next Auction Preview Block
- [ ] Follow-Up Email Template (48h nach Payment)

**Tests:**
- [ ] Empfehlungen: nur kaufbare Releases (available + price > 0)
- [ ] Shipping-Savings korrekt berechnet (vs. Einzelversand)
- [ ] Combined Checkout weiterhin fehlerfrei (Auction + Cart)
- [ ] Bidding-Flow, Payment, Webhooks nicht beeinträchtigt
- [ ] Mobile: Savings-Bar, Sticky Banner, Swipeable Cards
- [ ] Email: Rendering in Gmail, Outlook, Apple Mail

**Tracking:**
- [ ] `shipping_savings_bar_viewed`, `recommendation_viewed/clicked/added_to_cart`
- [ ] `cross_sell_email_opened/clicked`, `unpaid_wins_banner_clicked/dismissed`

**KPIs:**
- Cross-Sell Rate (% Gewinner mit Direktkauf)
- Average Order Value (mit/ohne Cross-Sell)
- Items per Order Group
- Shipping als % des Bestellwerts

**Backend Admin:**
- [ ] Cross-Sell Performance Dashboard (Rate, AOV, Top-Empfehlungen)
- [ ] Konfiguration: Empfehlungen pro Touchpoint, Banner on/off, Follow-Up Delay

**Betroffene Dateien:** Backend: Neue APIs, Email-Templates. Storefront: `/account/wins`, `/account/checkout`, Katalog (Banner), neue Komponenten

---

### Phase 4: Langfristige Vision

---

#### ISSUE-14: Progressive Web App (PWA) mit Push-Notifications
**Type:** Feature
**Priority:** P4
**Labels:** `frontend`, `infrastructure`, `mobile`

**Beschreibung:**
PWA ermöglicht Installation auf dem Homescreen und Push-Notifications für Outbid-Alerts und Auktionsende. Besonders relevant für Mobile-Bieter bei Last-Minute-Auktionen.

**Acceptance Criteria:**
- [ ] Service Worker mit Offline-Fallback (Catalog-Cache)
- [ ] Web App Manifest (Icons, Theme Color, Start URL)
- [ ] Push-Notifications: Outbid-Alert, Auktion endet in 1h, Gewonnen
- [ ] Opt-in Flow für Notifications (nicht aufdringlich)
- [ ] iOS + Android Homescreen-Installation

**Tests:**
- [ ] PWA Install-Prompt auf Chrome Android
- [ ] Offline-Fallback zeigt sinnvolle Seite
- [ ] Push-Notification bei Outbid wird korrekt empfangen
- [ ] Bestehende Realtime-Updates weiterhin funktional

**Tracking:**
- [ ] `pwa_installed` (platform: android/ios/desktop)
- [ ] `push_notification_permission` (granted/denied)
- [ ] `push_notification_clicked` (type: outbid/auction_ending/won)

**Backend Admin:**
- [ ] Push-Notification Stats: Aktive Subscribers, Delivery Rate
- [ ] Notification Templates editierbar

**Betroffene Dateien:** Neues `storefront/public/manifest.json`, Service Worker, Backend Push-Endpoint

---

#### ISSUE-15: Sammler-Profile und Community Features
**Type:** Feature
**Priority:** P4
**Labels:** `frontend`, `backend`, `community`

**Beschreibung:**
Öffentliche Sammler-Profile mit Auktionshistorie, Sammelgebieten und optionalem "Collection Showcase". Stärkt die Community-Bindung und schafft Social Proof.

**Acceptance Criteria:**
- [ ] Öffentliches Profil mit Username (optional real name)
- [ ] Auktions-Stats: Gewonnene Auktionen, Teilnahmen
- [ ] Sammelgebiete-Tags (Genre-Preferences)
- [ ] Privacy Controls: Was öffentlich sichtbar ist
- [ ] Follow-Funktion für Sammler (optional)

**Tests:**
- [ ] Privacy Controls greifen korrekt (private Daten nicht sichtbar)
- [ ] DSGVO: Profil löschbar, Datenexport enthält Profildaten
- [ ] Auth weiterhin korrekt, kein Zugriff auf fremde Profile-Einstellungen

**Tracking:**
- [ ] `profile_viewed` (collector_id, is_own_profile)
- [ ] `collector_followed` (collector_id)

**SEO:**
- [ ] Schema.org `Person` Markup auf Profil-Seiten
- [ ] Sammler-Profile in Sitemap (wenn öffentlich)

**Backend Admin:**
- [ ] Profil-Moderation: Admin kann Profile sperren/unsichtbar machen
- [ ] Übersicht: Aktive Profile, Top-Sammler

**Betroffene Dateien:** Neues `storefront/src/app/collector/[username]/`, Backend Customer-Profile API

---

#### ISSUE-16: Multi-Seller Marketplace
**Type:** Feature
**Priority:** P4
**Labels:** `backend`, `business`, `platform`

**Beschreibung:**
Langfristig Öffnung für andere Sammler als Verkäufer. Das Themen-Block-Modell eignet sich dafür — kuratierte Blöcke bleiben von VOD, einzelne Lots könnten von externen Verkäufern kommen.

**Acceptance Criteria:**
- [ ] Seller-Registration und Verifizierung
- [ ] Seller-Dashboard (Lots einreichen, Preise setzen, Verkaufshistorie)
- [ ] Provision/Fee-Modell (Prozentsatz vom Verkaufspreis)
- [ ] Seller-Rating-System
- [ ] Admin-Approval für neue Seller

**Tests:**
- [ ] Seller-Lot im Block: Bidding-Flow identisch zu VOD-eigenen Lots
- [ ] Payment-Split: VOD-Provision korrekt abgezogen
- [ ] Bestehende Single-Seller-Logik nicht beeinträchtigt

**Backend Admin:**
- [ ] Seller-Management: Liste, Approval, Sperre
- [ ] Fee-Konfiguration: Prozentsatz pro Seller/global
- [ ] Seller Payouts Dashboard

**Betroffene Dateien:** Neues Backend-Modul, Seller-Dashboard, Admin-Approval-Flow

---

## Phasen-Übersicht

```
Phase 1 — Go-Live Readiness (P0/P1)     Phase 2 — Post-Launch (P2)
├── ISSUE-01: Scroll-Bug verifizieren    ├── ISSUE-05: Autocomplete-Suche
├── ISSUE-02: Homepage-Flow              ├── ISSUE-06: Faceted Search
├── ISSUE-03: Bid-Confirmation           ├── ISSUE-07: Auction Archive
└── ISSUE-04: SEO-Strategie             ├── ISSUE-08: Infinite Scroll
                                          ├── ISSUE-09: Bilder-CDN R2 Integration
Phase 2b — Marketing Funnel (P2)         └── ISSUE-10: Onboarding-Flow
└── ISSUE-17: Post-Auction Cross-Sell
    + Shipping Savings Funnel            Phase 3 — Design & Polish (P3)
                                          ├── ISSUE-11: Design Tokens
Phase 4 — Vision (P4)                    ├── ISSUE-12: Typografie-Skala
├── ISSUE-14: PWA + Push                 └── ISSUE-13: Discogs Preise
├── ISSUE-15: Community-Profile
└── ISSUE-16: Multi-Seller
```

---

## Bereits erledigte Punkte (kein Issue nötig)

Diese Punkte aus der Analyse sind **bereits vollständig implementiert**:

- **Anti-Sniping:** 3-Min-Extension bei Last-Second-Bids, Supabase Broadcast
- **Echtzeit-Bidding:** Supabase Realtime (3 Channels: bids, item, lot)
- **Mobile Responsiveness:** Hamburger-Menu, Touch-Support, responsive Grid
- **Image Lightbox/Zoom:** 2x Zoom, Swipe, Keyboard-Navigation
- **Skeleton-UI:** animate-pulse Skeletons im Dark Theme
- **Outbid-Notifications:** E-Mail-Template + On-Site Red Banner mit Realtime-Sync
- **Proxy Bidding:** Toggle-basiert, besser als eBay laut Analyse
- **Accessibility:** Skip-Link, ARIA-Labels, semantische Landmarks, 100% Alt-Text
- **Performance:** 48ms TTFB, 428ms Load, 58KB Transfer — Top 1%
- **Schema.org:** Product-Markup, Open Graph Tags, Canonical Links

---

## Anhang: Bilder-Infrastruktur Ist-Stand

**VOD_Migration Projekt** (abgeschlossen 2026-03-22/23):
- **Cloudflare R2 Bucket:** `vod-images` (Account `98bed59e4077ace876d8c5870be1ad39`)
- **Übertragen:** 160.957 Dateien, 99.53 GB (tape-mag HQ + Standard + vod-records)
- **Status:** One-Time Migration — **kein laufender Sync für neue Bilder**

**VOD_Auctions Ist-Stand:**
- `IMAGE_BASE_URL = "https://tape-mag.com/bilder/gross/"` (scripts/shared.py:35)
- Storefront lädt alle Bilder über tape-mag.com → Next.js Image Optimization
- R2-Bilder existieren, werden aber **nicht genutzt**
- → ISSUE-09 adressiert die Umstellung und den laufenden Sync
