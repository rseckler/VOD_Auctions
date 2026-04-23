# Catalog Performance — State of the Art & Benchmark

**Datum:** 2026-04-23
**Kontext:** Orientierungsdokument — wie lösen andere Plattformen das Problem "Catalog mit zehntausenden Items schnell laden", und was davon ist für VOD relevant.
**Companion:** [`ADMIN_CATALOG_PERFORMANCE_PLAN.md`](ADMIN_CATALOG_PERFORMANCE_PLAN.md) — konkreter Umsetzungsplan für VOD-Admin basierend auf diesem Dokument.

---

## 1. Latenz-Ziele — was "schnell" bedeutet

Branchen-übliche Referenzwerte für User-facing Interaktionen:

| Schwelle | Was passiert beim User | Quelle |
|---|---|---|
| **<100 ms** | Fühlt sich "sofort" an — als ob die UI lokal reagiert | [RAIL Model, Google](https://web.dev/rail/) · [Nielsen 1993](https://www.nngroup.com/articles/response-times-3-important-limits/) |
| **100–300 ms** | Spürbare Verzögerung aber kein Flow-Bruch | RAIL |
| **300–1000 ms** | User merkt das System arbeitet, Aufmerksamkeit hält | Nielsen |
| **>1000 ms** | Kontext-Verlust, User wechselt mental zu "Warten" | Nielsen |
| **>10 s** | User gibt auf / reloadet | Nielsen |

**Core Web Vitals (2024+, Google's Ranking-Signal):**

| Metric | Gut | Verbesserungsbedarf | Schlecht |
|---|---|---|---|
| **LCP** (Largest Contentful Paint) | <2.5 s | 2.5–4 s | >4 s |
| **INP** (Interaction to Next Paint, hat FID seit März 2024 ersetzt) | <200 ms | 200–500 ms | >500 ms |
| **CLS** (Cumulative Layout Shift) | <0.1 | 0.1–0.25 | >0.25 |

**Für Catalog-Listing konkret:**
- **First Contentful Paint** (Seite zeigt überhaupt was): Ziel **<500 ms**
- **Listings sichtbar mit Daten**: Ziel **<1000 ms**
- **Filter-Click → neue Results**: Ziel **<300 ms** (idealerweise <150 ms bei debounced Instant Search)
- **Search-Typing → Suggest**: Ziel **<100 ms** (jeder Keystroke, debounced 150 ms)
- **Pagination-Click**: Ziel **<200 ms**

Alles >1 s ist mess- und spürbar. Unsere aktuelle `/app/media`-Latenz (laut Frank "10 Sekunden" bei Erstladung, nach meinen Optimierungen vermutlich 2–4 s) ist außerhalb dieser Bandbreiten.

---

## 2. Referenz-Architekturen — wie es andere lösen

### 2.1 Shopify (Merchant Admin + Storefront)

- **Storefront Search:** Shopify-eigener Search-Service (Shopify Search & Discovery App, basiert intern auf Elasticsearch/Vespa).
- **Admin Product Listing:** GraphQL-API mit Cursor-based Pagination, Connection-Pattern. Admin-UI (Polaris) nutzt React + Apollo Cache.
- **Caching:** Shopify-CDN (Fastly) vor den Storefront-Assets. Admin ist nicht CDN-gecached, aber sehr aggressiv client-side cached.
- **Typische Latenzen:** Storefront Listing ~50–150 ms für das HTML-Document (SSR), Data-Load via GraphQL zusätzlich ~100 ms. Admin Product-Listing ~300–500 ms.
- **Key Insight:** Shopify trennt strikt Search (dediziertes System) von Transactional-DB (MySQL/Vitess). Produkt-Edits fliessen asynchron in den Search-Index.

### 2.2 Discogs

- **Search:** Elasticsearch-Cluster. Der Search-Index ist denormalisiert (Artist + Label + Release + Catalog-Number + Format in einem Dokument).
- **Marketplace-Listings:** Ebenfalls Elasticsearch, mit Filter auf Country/Media-Condition/Sleeve-Condition. Gruppierung nach `release_id` mit Seller-Liste als nested-field.
- **Typische Latenzen:** Search-Page ~400–700 ms total (inkl. HTML + Assets). Die Search-Query selbst gegen ES ist vermutlich im <100 ms-Bereich.
- **Bekanntes Problem:** Discogs ist nicht rasend schnell, aber konsistent. Scale: ~15M Releases × ~10M aktive Marketplace-Listings.

### 2.3 Bandcamp

- **Katalog-Browsing (Discover):** Feed-basiert, serverseitig gerendert, aggressiv CDN-gecached.
- **Artist-Shop:** Hauptsächlich statische Seiten. Updates flow durch Revalidation.
- **Key Insight:** Bandcamp rendert Listen serverseitig und cached die HTML-Responses. Filter-Changes sind eigene URLs mit eigenen Cache-Keys.

### 2.4 Reverb (Music Instrument Marketplace)

- **Search:** Algolia (öffentlich dokumentiert, Case Study auf algolia.com).
- **Typische Latenz:** 20–50 ms Search-Response, End-to-end mit Rendering unter 500 ms.
- **Architektur:** Rails-Backend schreibt bei jeder Product-Mutation in Algolia via Model-Hook. Algolia hält den Index, Reverb hält keinen eigenen Search-Service.

### 2.5 Vercel Commerce / Next.js Commerce Template

- **Stack:** Next.js + Shopify/BigCommerce + Algolia/Meilisearch.
- **Rendering:** ISR (Incremental Static Regeneration) für Listing-Pages — die HTML wird statisch vor-generiert + on-demand revalidiert.
- **Edge:** Vercel Edge-Network cached die statische Response global.
- **Search:** Algolia-InstantSearch.js im Client.
- **Typische Latenz:** <100 ms für cached Listing-Page (Edge-Hit), <20 ms für Search-Input-Response (direkter Client→Algolia-Call).

### 2.6 Amazon

- **Search:** Eigenes massives System (A9, heute "Query Understanding" + diverse ML-Layer). Unterliegt ~250-500 ms SLAs pro Suche inkl. Ranking.
- **Product-Detail:** CDN + DynamoDB für Hot-Path.
- **Key Insight:** Amazon tolerant mehr Latenz, weil die ML-basierte Ranking-Qualität den höheren Retrieval-Aufwand rechtfertigt.

### 2.7 Algolia als Benchmark-Referenz

- **Dokumentierte p95-Latenzen:** [Algolia Status](https://status.algolia.com/) zeigt regelmäßig 5–20 ms p95 für Search-Requests weltweit.
- **DSN (Distributed Search Network):** Queries gehen an den geografisch nächsten Cluster — Frankfurt/Dublin/Virginia/Tokio.
- **Einsatzgebiete:** Reverb, Stripe Docs, Twitch, Medium, Gymshark, Lacoste.

---

## 3. Search-Engine-Vergleich

| Engine | Typ | Hosting | Latenz (p95) | Index-Größe Limit | Lizenz |
|---|---|---|---|---|---|
| **Algolia** | Managed SaaS | Cloud | 5–20 ms | unlimited (teurer) | kommerziell, pay-per-record |
| **Meilisearch** | Self-hosted (Rust) | VPS/Docker | 10–50 ms | ~10M Docs praktikabel | Open Source (MIT) + managed Cloud |
| **Typesense** | Self-hosted (C++) | VPS/Docker | 10–50 ms | ~10M Docs praktikabel | Open Source (GPL-3) |
| **Elasticsearch** | Self-hosted (Java) | Cluster | 20–200 ms | unlimited (Cluster-Scale) | Elastic License 2.0 |
| **OpenSearch** | Self-hosted (Java, Elastic-Fork) | Cluster | 20–200 ms | unlimited | Apache-2.0 |
| **Postgres pg_trgm + FTS** | In-DB Extension | Postgres | 30–500 ms | praktikabel bis ~100k Rows | Postgres-Lizenz |
| **Vespa** | Self-hosted (Java/C++) | Cluster | 10–50 ms | unlimited | Apache-2.0 |
| **Weaviate / Qdrant / Pinecone** | Vector-DBs | Cloud/Self | 20–100 ms | variabel | Open Source / SaaS |

**Meilisearch vs. Algolia** — die beiden für unsere Größenordnung (~52k Docs) interessanten:

| Aspekt | Algolia | Meilisearch |
|---|---|---|
| Host | Cloud, Multi-Region | Self-hosted auf VPS (bei uns 127.0.0.1:7700) |
| Latenz | 5–20 ms p95 weltweit | 10–50 ms p95 lokal, ~40–80 ms über WAN |
| Facets / Filter | stark, mit instant-search.js | stark, eigene filter-Syntax |
| Typo-Tolerance | sehr gut | sehr gut |
| Synonyms | ja | ja |
| Geo | ja | ja |
| Ranking-Customization | sehr flexibel (Custom-Rankings per Criterion) | gut (rankingRules) |
| Analytics | eingebaut | nein (extern integrieren) |
| AI-Ranking / LLM-Rerank | optional | ja (Phase 3 möglich) |
| Kosten (52k Docs, ~100k Searches/Monat) | ~$300/Monat | $0 (VPS-Resources) |

**VOD ist bereits auf Meilisearch** seit rc40 (Storefront) — korrekte Wahl für unsere Scale. Für Admin genauso geeignet.

---

## 4. Architektur-Patterns — was darüber hinaus schnell macht

### 4.1 CQRS (Command-Query Responsibility Segregation)

**Prinzip:** Writes (Commands) und Reads (Queries) gehen in getrennte Datenspeicher. Der Read-Store ist denormalisiert und auf Query-Pattern optimiert.

**Beispiel VOD:**
- Write: `PATCH /admin/media/:id` → Postgres (`Release` Tabelle, normalisiert, mit FK-Constraints)
- Read: `GET /admin/media?search=...` → Meilisearch (denormalisiert: Artist-Name, Label-Name, Format-Name, inventory-counts alle in einem Doc)

**Konsistenz:** eventually consistent. Update auf Postgres → Trigger setzt `search_indexed_at = NULL` → Delta-Sync-Cron (5min) pushed in Meili. User sieht Änderung mit Verzögerung 0–5 Minuten. Akzeptabel für Catalog-Browsing.

### 4.2 Edge-Caching (CDN)

**Prinzip:** Listen-Responses werden auf CDN-POPs weltweit gecached. HTTP-Header `Cache-Control: s-maxage=60, stale-while-revalidate=300` weist Cloudflare/Vercel/Fastly an:
- Für 60 s die Response aus dem Edge-Cache liefern
- Danach für 300 s stale liefern + im Background revalidieren

**Effekt:** Erster User pro Region zahlt DB-Latenz, die nächsten 100+ kriegen <10 ms.

**Einsatz bei VOD:** Storefront-Catalog-Seiten sind gute Kandidaten. Admin-Pages nicht (user-spezifisch, Auth). Für Admin stattdessen: in-Memory-Cache (`site-config.ts`-Pattern mit 60 s TTL) oder Redis-Cache.

### 4.3 Stale-While-Revalidate + Client-Caching

**Prinzip (React-Query / SWR):** Client zeigt sofort den gecachten Stand, schickt im Hintergrund neue Query, updated UI wenn neuer Stand da.

**Effekt:** Navigation zwischen Pages fühlt sich **instant** an. Filter-Wechsel sieht alten Stand → skeleton → neuer Stand.

**Einsatz bei VOD:** Admin-UI nutzt aktuell bare `useState + useEffect + fetch`. Migration auf `@tanstack/react-query` würde automatisch Cache + Prefetch + SWR geben. Ist im Stack schon drin (CLAUDE.md listet React Query im Blackfire-Stack, aber unsere Admin-Pages nutzen's nicht).

### 4.4 Incremental Static Regeneration (ISR)

**Next.js-spezifisch:** Seiten werden statisch gebaut, bei Request aus dem Edge-Cache geliefert, nach `revalidate: N` Sekunden im Hintergrund re-gerendert.

**Effekt:** Public Storefront-Pages werden aus statischem HTML ausgeliefert, ~20–50 ms TTFB (Time-To-First-Byte) weltweit.

**Einsatz bei VOD:** Storefront macht das bereits (siehe `storefront/src/app/status/page.tsx` hat `revalidate: 60`). Catalog-Listing-Page könnte das auch nutzen für die häufigsten Filter-Kombinationen.

### 4.5 Skeleton-Rendering + Progressive Hydration

**Prinzip:** Page-Shell (Header, Filter-Panel, Table-Header, 8–10 Skeleton-Rows) rendert sofort aus statischem HTML/dem ersten Chunk. Daten fließen dann rein.

**Effekt:** Perceived Performance. Selbst wenn die tatsächliche Query 1 s dauert, sieht der User nie eine weiße Seite und fühlt es als "~100 ms responsiv".

**Einsatz bei VOD:** Inventory-Hub (`/app/erp/inventory`) hat seit meinem gestrigen rc43-Fix Skeleton-Rows. Admin-Catalog `/app/media` hat nur einen kurzen "Loading…"-Text. Zu erledigen.

### 4.6 Prefetching

**Prinzip:** Links zur wahrscheinlich-nächsten Seite werden beim `onMouseEnter` oder im Viewport schon geladen.

- **Next.js `<Link prefetch>`** prefetched bei Viewport-Sichtbarkeit automatisch (Default on).
- **React-Query `prefetchQuery`** kann auf Hover explicit getriggert werden.

**Effekt:** Click auf Link → Page rendert in ~50 ms weil Daten schon im Cache.

### 4.7 Virtualisierung

**Prinzip:** Bei langen Listen (>100 Rows) nur die sichtbaren Rows im DOM rendern. Libraries: `react-window`, `@tanstack/react-virtual`.

**Effekt:** 52k Rows gerendert wie 20. Scroll bleibt bei 60 fps.

**Einsatz bei VOD:** Aktuell Pagination mit `limit=25`. Virtualisierung wäre Alternative (infinite scroll) — ist UX-Entscheidung, nicht Perf-Zwang.

### 4.8 Cursor- statt Offset-Pagination

**Prinzip:** Statt `OFFSET N` (teuer bei grossen N) wird `WHERE id > last_seen_id` verwendet.

**Effekt:** Pagination bleibt O(log N) statt O(N) — bei Seite 100 von einem 52k-Row-Result nicht mehr 2500 Rows skippen.

**Einsatz bei VOD:** Aktuell Offset-Pagination überall. Bei 52k Rows × Seite 500 ist das spürbar langsam. Bisher noch kein Problem weil keiner bis Seite 500 scrollt, aber technisch sauberer.

### 4.9 HTTP/2 Multiplexing + Brotli Compression

**Prinzip:** Mehrere parallele Requests über eine TCP-Verbindung, Response-Bodies komprimiert.

**Effekt:** Cold-Start-Savings ~200–500 ms beim ersten Page-Load.

**Einsatz bei VOD:** nginx läuft mit HTTP/2 (Default bei TLS). Brotli vermutlich nicht aktiv — zu prüfen.

---

## 5. Ist-Zustand VOD — wo sind wir, wo die Lücken

### 5.1 Storefront — State of the Art ✅

| Komponente | Zustand | Latenz |
|---|---|---|
| Search-Engine | Meilisearch 1.20 (self-hosted) | **48–58 ms p95** (gemessen rc40) |
| Ranking | Two-Profile (commerce + discovery) | — |
| Typo-Tolerance | aktiv, verifiziert via "cabarte voltarie" → Cabaret Voltaire | — |
| Facets | 6 (format_group, decade, country_code, product_category, genres, styles) | Inline im Search-Response |
| Visibility-Gate | `is_purchasable = true` Filter (rc47.2) | — |
| Cache | keiner aktuell — direkter Meili-Call | — |
| Skeleton-UI | keine Admin-seitig, Storefront hat ISR | — |
| Prefetch | Next.js `<Link>` Default-Prefetch | — |

**Verdict:** Storefront-Search ist state of the art. Einzige optionale Verbesserungen: (1) ISR-Caching der häufigsten Filter-Kombinationen via `revalidate: 60`, (2) Algolia InstantSearch.js-ähnliche Instant-Search-UI mit 150ms-Debounce.

### 5.2 Admin — Bottleneck ❌

| Komponente | Zustand | Latenz geschätzt |
|---|---|---|
| Search-Engine | **Postgres-FTS + 6-Table-JOIN** | 2–10 s je nach Filter |
| Ranking | fixe Spalten-Sorts | — |
| Typo-Tolerance | keine (pg_trgm kommt ran aber aktuell nicht kombiniert) | — |
| Facets | keine (Facet-Berechnung = zweiter Full-Scan) | — |
| Filter | 15+ Filter (Import-Collection, Inventory-Status, Stocktake-State, Price-Lock, Warehouse, etc.) | Jedes Filter-Click = full SQL-Roundtrip |
| Cache | keiner | — |
| Skeleton-UI | keine, nur "Loading…"-Text | — |
| Prefetch | keine, bare fetch | — |

**Verdict:** Die Admin-Architektur ist **nicht** state of the art. Kein Index wird das JOIN-Bottleneck auf 52k × 13k Rows reparieren — **das ist ein Architektur-Problem, kein Query-Plan-Problem**.

### 5.3 Detail-Pages (Admin + Storefront)

Separates Thema. Detail-Seiten laden EINE Release + verwandte Inventory-Items + Images + Tracks. Das ist O(1) pro Request, nicht Listing-Performance-Problem. Aktuell vermutlich <500 ms, akzeptabel. Für Sub-100-ms wäre Redis-Cache die nächste Stufe.

---

## 6. Empfehlungen — priorisiert nach ROI

Für den Admin-Catalog (das akute Problem):

### Tier 1 — Muss

1. **Meilisearch auch für Admin** (Phase 2 aus rc40-Plan). Konkretisierung im [`ADMIN_CATALOG_PERFORMANCE_PLAN.md`](ADMIN_CATALOG_PERFORMANCE_PLAN.md). **Erwartet: p95 <100 ms.**

### Tier 2 — Sehr sinnvoll

2. **Skeleton-Rendering** auf `/app/media` (so wie `/app/erp/inventory` seit rc43).
3. **React-Query** für Admin-Data-Fetching. Brings SWR + Prefetch + Cache-Invalidation for free.

### Tier 3 — Polish

4. **Next.js `<Link prefetch>`** konsistent nutzen für Admin-Navigation.
5. **Filter-Options in-Memory-Cache** mit 60s TTL statt jedem Request neu laden.
6. **Virtualisierung** wenn Frank Wunsch nach infinite scroll äußert. Aktuell nicht nötig.

### Tier 4 — Storefront-Polish (aktuell kein Problem, aber state-of-the-art)

7. **ISR** für `/catalog`-Listing-Page (häufigste Filter-Kombinationen vorrendern + 60s revalidate).
8. **Brotli-Compression** in nginx prüfen/aktivieren.
9. **Algolia-InstantSearch.js-Migration** wenn spürbare UX-Differenz zum aktuellen Search-Input-Debounce. Aktuell vermutlich nicht notwendig.

### Explizit NICHT empfohlen

- **Weitere Postgres-Indexes** für `/admin/media`. Haben wir ausgereizt — kein Index hilft, wenn die Architektur teure JOINs erzwingt.
- **Noch größere Hardware** auf VPS. Würde die Admin-Latenz vielleicht um Faktor 1.5 verbessern, aber nicht auf <100 ms bringen. Architektur ist das Thema.
- **Migration zu Algolia** aktuell. Meilisearch liefert für unsere Scale identische UX zu Null-Euro Monatsgebühr. Später wenn wir >1M Docs oder global Multi-Region brauchen: reconsider.

---

## 7. Kennzahlen die wir als KPIs tracken sollten

Nach Phase 2 (Meili für Admin):

- **p50/p95/p99** Latenz für `GET /admin/media` — via existing System-Health-Check oder Sentry-Performance
- **Client-side LCP + INP** auf `/app/media` — via Vercel Web Analytics (Storefront ist dort schon drin) oder Sentry
- **Meili-Index-Lag** — wie lange dauert's vom Write auf Postgres bis zur Sichtbarkeit in Meili. Ziel: <5 min p99
- **Cache-Hit-Rate** (wenn wir Redis/Edge einführen)

---

## 8. Referenzen

- [Google RAIL Performance Model](https://web.dev/rail/)
- [Nielsen Norman Group — Response Times (1993, weiterhin gültig)](https://www.nngroup.com/articles/response-times-3-important-limits/)
- [Google Core Web Vitals](https://web.dev/vitals/)
- [Algolia Status Page](https://status.algolia.com/)
- [Meilisearch Benchmarks](https://github.com/meilisearch/benchmarks)
- [Reverb / Algolia Case Study](https://www.algolia.com/customers/reverb-case-study/)
- [Next.js Commerce Reference Architecture](https://github.com/vercel/commerce)
- [Shopify Hydrogen + Oxygen](https://hydrogen.shopify.dev/)

---

**Author:** Robin Seckler · rseckler@gmail.com
**Review-Status:** Draft zur Diskussion
**Nächster Schritt:** Freigabe für `ADMIN_CATALOG_PERFORMANCE_PLAN.md` — konkrete Umsetzung Phase 2
