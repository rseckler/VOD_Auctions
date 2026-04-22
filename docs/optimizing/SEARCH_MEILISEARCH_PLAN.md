# Catalog Search Migration auf Meilisearch

**Version:** 2.0
**Erstellt:** 2026-04-22
**Letzte Revision:** 2026-04-22 (v2 — ueberarbeitet nach Robin-Review. Architektur-Bewertung 8/10, Operability 6/10 → 8/10 nach Integration der 10 Korrekturen. Soft-Launch-Ready. Vorherige Version steht im git log.)
**Autor:** Robin Seckler
**Status:** Konzept — noch nicht implementiert. Geplant fuer kurz nach Pre-Launch.
**Bezug:** `release-search.ts`, Migration `2026-04-22_release_search_text_fts.sql`, `2026-04-22_search_trigram_indexes.sql`, `CATALOG_SEARCH_FIXES_2026-04-22.md`, `DEPLOYMENT_METHODOLOGY.md`

---

## 0. TL;DR

- **Engine:** Meilisearch 1.x self-hosted, single-node Docker auf dem bestehenden Hostinger VPS, RAM-Cap 1.5 GB (`mem_limit` + `memswap_limit`).
- **Sync:** Python-Script `scripts/meilisearch_sync.py` analog zu `legacy_sync_v2.py`. Initial-Backfill ueber alle ~52k Releases einmalig, danach Delta-Sync alle 5 Min via Cron, getriggert ueber neue Spalte `Release.search_indexed_at` (NULL = "needs reindex"), gepflegt von DB-Triggern + expliziten Bumps in den Sync-Scripts. Hash-Diff in `meilisearch_index_state` als zweite Verteidigungslinie. Tasks-API fuer alle async Meili-Operationen, kein Polling auf `/stats`.
- **Backend-Proxy mit Runtime-Fallback:** Alle Suchanfragen laufen weiterhin durch den Medusa-Backend. Jede Meili-Query in `try/catch`, im Fehlerfall transparenter Fall-Through auf den existierenden Postgres-FTS-Pfad. Health-Probe alle 30 s setzt ein in-memory Effective-Flag, 3 fails in Folge → Bypass auf Postgres ohne site_config-Aenderung.
- **Phase-1-Scope:** Nur `/store/catalog` + `/store/catalog/suggest` umstellen. Admin-Endpoints (`/admin/erp/inventory/search`, `/admin/media`) bleiben in Phase 1 auf Postgres-FTS — werden in Phase 2 nachgezogen.
- **Bewusst NICHT in diesem Plan:** Vector-Search, LLM-Re-Ranker, konversationelle Suche, Federated Multi-Index, Search-Analytics-Dashboards.

---

## 1. Problem & Motivation

### 1.1 Wo wir heute stehen

Die aktuelle Search-Architektur ist seit rc... (2026-04-22) drei Iterationen weiter als der reine ILIKE-Stand:

1. **Trigram-Indizes** (`idx_release_title_trgm`, `idx_artist_name_trgm`, `idx_label_name_trgm`, `idx_release_catno_trgm`, `idx_release_article_trgm`) auf `lower(col)` — bringt Single-Token-ILIKE von 6 s auf ~130 ms.
2. **Denormalisierte `Release.search_text` Spalte + GIN tsvector Index** — bringt Multi-Word-FTS auf ~20 ms inkl. korrektem AND-Matching ueber Artist/Title/Label.
3. **Trigger `release_update_search_text`** haelt die Spalte sync bei Release-INSERT/UPDATE.

Funktional ist das brauchbar. Operative und UX-seitige Limits, die wir mit Postgres-FTS nicht oder nur muehsam loesen:

- **Keine echte Typo-Toleranz.** Postgres `pg_trgm` kann bei Single-Token bis zu 1-2 Buchstaben Toleranz, wenn man Similarity-Schwellen setzt — bei Multi-Word ueber FTS gar nicht. "cabarte voltarie" matcht heute nichts. Industrial-Subkultur hat viele falsch geschriebene Eigennamen (Coum Transmissions, Esplendor Geometrico, Maeror Tri).
- **Trigger-Limitation bekannt: Artist/Label-Rename triggert kein Re-Index.** Kommt selten vor, aber kommt vor.
- **Facetten-Counts in derselben Query sind teuer.** Eine ehrliche `for_sale=true & format=LP & decade=1980 & genre=industrial` Filterung mit Live-Counts pro Facetten-Wert (Sidebar UX) ist mit Postgres entweder mehrere Roundtrips oder ein massiver Window-Function-Query. Aktuell rendern wir gar keine Live-Counts.
- **Ranking ist starr.** "verified inventory zuerst", "in-stock zuerst", "Cohort A vor Rest" sind heute manuelle `CASE WHEN`-Konstrukte in jedem Endpoint. Skaliert nicht.
- **Synonyme fehlen komplett.** `industrial` ↔ `noise` muss heute der User selbst wissen.
- **Highlight + "did you mean" gar nicht moeglich** ohne signifikanten Eigenaufwand.
- **Kein Search-as-you-type.** `/store/catalog/suggest` rendert heute eine Sub-Liste, aber kein echtes Instant-Search.

### 1.2 Warum jetzt, warum nicht spaeter

Wir brauchen Meilisearch nicht VOR dem Pre-Launch — die heutige FTS-Loesung reicht fuer den Beta-Test und die ersten Auktionen. Sobald die Plattform aber "live" ist und wir ueber Marketing Traffic ziehen, wird Search-Quality direkt umsatzwirksam ("did you mean" verhindert leere Result-Pages, Synonyme oeffnen Genre-Browsing). Implementierung in der Ruhe-Phase nach Pre-Launch und vor Marketing-Push (RSE-295) ist das Window.

---

## 2. Engine-Wahl: Meilisearch vs. Typesense vs. Algolia vs. Elasticsearch

### 2.1 Kriterien gewichtet fuer VOD

| Kriterium | Gewicht | Begruendung |
|---|---|---|
| Operational Burden (Self-host) | hoch | VPS hat bereits 5 Services, kein DevOps-Team |
| RAM-Footprint bei 52k Docs | hoch | VPS hat ~16 GB total, Meilisearch darf max. 1.5 GB binden |
| Typo-Tolerance Out-of-Box | hoch | Industrial-Subkultur-Namen werden falsch geschrieben |
| Facet-Counts Performance | mittel | Sidebar mit Live-Counts ist Phase-2-Wunsch |
| CJK + Sonderzeichen | mittel | Japanische Industrial-Releases (Merzbow, Hijokaidan) im Katalog |
| Lizenz / Vendor-Lock | hoch | Robin will keine SaaS-Pricing-Surprise |
| Deutsche/multilinguale Stop-Words | mittel | Beschreibungen DE/EN gemischt |
| Synonyme Konfiguration | hoch | Genre-Aliase sind ein Killer-Feature |

### 2.2 Vergleich

| | Meilisearch 1.x | Typesense 28.x | Algolia | Elasticsearch 8.x / OpenSearch |
|---|---|---|---|---|
| **Lizenz** | MIT | GPLv3 (server), Apache (clients) | proprietaer SaaS | SSPL (ES) / Apache (OpenSearch) |
| **Hosting-Form** | self-host trivial / Cloud | self-host / Cloud | nur Cloud | self-host komplex / Cloud |
| **RAM bei 52k Docs (geschaetzt)** | ~300-500 MB Idle, 1 GB Peak Indexing | ~250 MB Idle | n/a | 2-4 GB minimal |
| **Disk bei 52k Docs (geschaetzt)** | ~150-300 MB | ~100-200 MB | n/a | 500 MB+ |
| **Typo-Tolerance** | ja, by default, konfigurierbar pro Token-Laenge | ja, sehr aehnlich | ja, sehr ausgereift | ja, aber per Hand zu konfigurieren |
| **CJK Support** | nativ (charabia tokenizer), JP/CN/KR ohne Workaround | limitiert, Char-level fallback | nativ | nativ (icu plugin) |
| **Sonderzeichen / Diakritika** | normalisiert by default | normalisiert by default | normalisiert by default | konfigurierbar |
| **Synonym-API** | ja, einfach via PUT settings | ja, einfach | ja, sehr ausgereift | ja, komplex |
| **Custom Ranking Rules** | ja, deklarativ | ja, query-time konfigurierbar | ja, sehr maechtig | per Hand via function_score |
| **Facet-Counts mit Filtern** | ja, default, schnell | ja, default, schnell | ja | ja, aber teurer |
| **Tenant-Token / Search-only Key** | ja (tenant_token) | ja (scoped API key) | ja | ja (über security plugin) |
| **GitHub Stars (2026)** | ~57k | ~26k | n/a | ~70k |
| **Indexing-Geschwindigkeit 52k Docs** | ~30-60 s (1.x neuer Indexer) | ~30 s | abhaengig SaaS | mehrere Min |
| **Operational Komplexitaet** | minimal — single binary, single LMDB | minimal — single binary | none, aber Cloud-only | hoch — JVM, Cluster, Heap-Tuning |
| **Preis bei 52k Docs + 50k Searches/Monat** | $0 self-host | $0 self-host | ~$50-150/Monat ueber Free-Tier | $0 self-host, Hosting-Kosten je nach Setup |
| **Vendor-Lock-Risiko** | klein | klein | gross | klein |

### 2.3 Entscheidung: Meilisearch

Aus den Kriterien folgt eine Top-Two-Auswahl Meilisearch und Typesense — beide sind self-hostbar, leichtgewichtig, mit guter Out-of-Box DX. Algolia faellt raus weil SaaS-only und Pricing-Risiko bei Wachstum. Elasticsearch faellt raus weil Operational Overhead in keinem Verhaeltnis zu 52k Docs steht.

**Warum Meilisearch und nicht Typesense:**

1. **CJK-Tokenizer** ist nativ ausgereifter (charabia). Wir haben Merzbow, Hijokaidan, Boris, Acid Mothers Temple und einige hundert weitere JP-Releases im Katalog. Typesense braucht hier per-Char-Fallback der die Relevanz verschlechtert.
2. **Lizenz MIT** vs. Typesense GPLv3 (Server-seitig). Der GPL-Charakter von Typesense ist fuer self-host irrelevant, aber wenn wir spaeter mal eine SaaS-aehnliche Marketplace-Variante bauen (RSE-291), ist MIT cleaner.
3. **Mind-Share / Community-Velocity**: Meilisearch hat bei aehnlicher Featuredecke deutlich mehr Stars und schnelleren Release-Cycle. Pragmatisches Argument: bei jedem Stack-Choice nehme ich heute lieber das Tool mit dem groesseren Team dahinter.
4. **Neuer Indexer in 1.x** (2024/2025 eingefuehrt, 4× schneller, mimalloc v3) macht Re-Index-Operationen on-the-fly schmerzfrei.
5. **Tenant-Tokens** sind sehr sauber implementiert — auch wenn wir initial keinen Direct-Browser-Access machen, ist die Option offen.

Typesense waere kein Fehler. Aber wenn ich eines waehlen muss: Meilisearch.

---

## 3. Index-Schema

### 3.1 Zwei Indizes `releases-commerce` + `releases-discovery`

Wir bauen zwei Indizes mit identischem Content, aber unterschiedlichen `rankingRules`. Begruendung in §4.1 (Ranking-Profiles). Beide Indizes werden vom selben Sync-Script aus den selben Postgres-Daten befuellt — das verdoppelt den Speicher (~600 MB statt ~300 MB), spart aber die Komplexitaet von per-query Ranking-Override und macht die Profile-Wahl im Backend zu einem trivialen `client.index(name)`-Switch.

Artists und Labels werden NICHT separat indiziert — sie sind als Felder im Release-Dokument enthalten. Wenn spaeter mal eine eigene Artist-/Label-Browsing-Page mit eigener Search noetig wird, kommt ein separater Label-Index (siehe §3.7 zu Label-Suchpfad).

### 3.2 Dokument-Form

```json
{
  "id": "legacy-release-20267",
  "release_id": "legacy-release-20267",

  "title": "Music",
  "artist_name": "Various",
  "artist_slug": "various",
  "label_name": "Vanity Records",
  "label_slug": "vanity-records",
  "press_orga_name": null,

  "format": "LP",
  "format_name": "Vinyl LP",
  "format_group": "vinyl",
  "format_id": 12,
  "product_category": "release",

  "year": 1980,
  "decade": 1980,
  "country": "Japan",
  "country_code": "JP",

  "catalog_number": "WAX-001",
  "article_number": "VOD-16530",

  "genres": ["industrial", "experimental"],
  "styles": ["minimal", "noise"],

  "cover_image": "https://pub-433520...r2.dev/tape-mag/standard/legacy-release-20267.jpg",
  "has_cover": true,

  "legacy_price": 45.00,
  "direct_price": null,
  "effective_price": 45.00,
  "has_price": true,
  "is_purchasable": true,
  "legacy_available": true,

  "sale_mode": "auction_only",
  "auction_status": "available",

  "discogs_id": 1234567,
  "discogs_lowest_price": 42.50,
  "discogs_median_price": 60.00,
  "discogs_highest_price": 120.00,
  "discogs_num_for_sale": 4,
  "discogs_last_synced": 1735000000,

  "exemplar_count": 2,
  "verified_count": 1,
  "in_stock": true,
  "cohort_a": true,

  "popularity_score": 0,
  "indexed_at": 1735000000,
  "updated_at": 1735000000
}
```

Felder-Begruendungen:

- **`id` mit Bindestrichen unveraendert.** Meili 1.x akzeptiert `[a-zA-Z0-9_-]` als ID-Charset. IDs gehen 1:1 aus Postgres in den Index. Frueheres `replace("-", "_")` haette nur Debugging-Headaches gekostet (Logs zeigten `legacy_release_12345`, DB hatte `legacy-release-12345`).
- **`release_id` zusaetzlich zu `id`** weil wir den Schluessel auch als Filterable-Attribute brauchen. Doppelt gespeichert, ~30 Bytes pro Doc Overhead.
- **`format_group`** ist die VOD-Kategorisierung (`vinyl`, `tapes`, `cd`, `vhs`, `band_literature`, `label_literature`, `press_literature`) — gemappt aus `Format.kat` + Discogs-Format. Spart in jeder Filter-Query die `Format.kat`-JOIN-Logik die heute in `/store/catalog/route.ts` lebt.
- **`decade`** als zusaetzliche Spalte — Meilisearch kann zwar `year >= 1980 AND year <= 1989` filtern, aber als Facette ("Welche Dekaden gibt es im Result-Set?") ist `decade` als enum-aehnlicher Wert viel effizienter als ein numerischer Range-Facet.
- **`country_code`** ISO-2 — aktuell hat das Postgres-Schema nur `country` als Free-Text Englisch (mit Tippfehlern und Aliase). Backfill-Mapping: deutscher Name → englischer Name (existiert in `route.ts:COUNTRY_ALIASES`) → ISO-2. Code in `scripts/meilisearch_sync.py`. Damit kann das Frontend country-Flags rendern.
- **`has_cover`, `has_price`, `is_purchasable`, `in_stock`, `cohort_a`** — explizite Booleans statt Computed-At-Query-Time. Ohne diese muessten wir `has_cover` als `cover_image NOT NULL`-Filter ausdruecken — Meilisearch unterstuetzt das via `EXISTS` Filter, aber explicit Boolean ist robuster und schneller.
- **`exemplar_count`, `verified_count`, `in_stock`** kommen aus `erp_inventory_item` (Aggregat per Release). Damit Inventur-Search im Admin direkt aus Meilisearch rendern kann (Phase 2).
- **`discogs_last_synced`** als unix-timestamp aus `Release.discogs_last_synced_at` — wird vom `releases-discovery`-Profil als Tie-Breaker im Ranking genutzt (frischere Daten zuerst).
- **`popularity_score`** als 0-Platzhalter heute. Vorbereitung: spaeter aus `transaction`-Aggregaten + `bid`-Counts ableitbar (Re-Compute via Cron, ueberschreibt nur dieses Feld).
- **`indexed_at`** = unix-timestamp wann das Doc zuletzt von uns nach Meili geschoben wurde.
- **`updated_at`** als Sortable-Field — fuer "Newly added" Rendering.

### 3.3 Was bleibt in Postgres als Source of Truth

Alles. Meilisearch ist read-only Cache. Postgres bleibt Source of Truth fuer:
- Trigger-Logik (price_locked, sync_change_log, search_indexed_at)
- Joins gegen `auction_block`, `block_item`, `bid`, `transaction`
- Detail-Views (`/store/catalog/:id` rendert weiterhin direkt aus Postgres, kein Meili-Fetch)
- Alle Mutationen (POST/PATCH/DELETE)
- Reporting / Customer-Stats / Audit-Logs

Meilisearch gibt nur die `id`-Liste + denormalisierte Felder fuer Listen-Rendering zurueck. Die Idee: Meili ersetzt den Search-WHERE-Clause + die LeftJoins fuer Listen-Display, mehr nicht.

### 3.4 Settings-JSON (gilt fuer beide Indizes — Unterschied nur in `rankingRules`)

```json
{
  "primaryKey": "id",

  "searchableAttributes": [
    "artist_name",
    "title",
    "label_name",
    "genres",
    "styles",
    "catalog_number",
    "article_number",
    "press_orga_name",
    "format_name",
    "country"
  ],

  "filterableAttributes": [
    "release_id",
    "format",
    "format_group",
    "format_id",
    "product_category",
    "country",
    "country_code",
    "year",
    "decade",
    "genres",
    "styles",
    "has_cover",
    "has_price",
    "is_purchasable",
    "in_stock",
    "cohort_a",
    "sale_mode",
    "auction_status",
    "label_slug",
    "artist_slug",
    "press_orga_slug"
  ],

  "sortableAttributes": [
    "year",
    "title",
    "artist_name",
    "effective_price",
    "discogs_median_price",
    "discogs_last_synced",
    "updated_at",
    "popularity_score"
  ],

  "displayedAttributes": [
    "id",
    "release_id",
    "title",
    "artist_name",
    "artist_slug",
    "label_name",
    "label_slug",
    "press_orga_name",
    "press_orga_slug",
    "format",
    "format_name",
    "format_group",
    "year",
    "country",
    "country_code",
    "catalog_number",
    "article_number",
    "cover_image",
    "legacy_price",
    "effective_price",
    "is_purchasable",
    "sale_mode",
    "discogs_median_price",
    "exemplar_count",
    "verified_count",
    "in_stock"
  ],

  "stopWords": [
    "the", "a", "an", "and", "of", "for", "with",
    "der", "die", "das", "und", "oder", "fuer", "mit", "von"
  ],

  "synonyms": {
    "industrial": ["industrial music"],
    "noise": ["japanoise"],
    "power electronics": ["pe"],
    "dark ambient": ["drone", "isolationism"],
    "ebm": ["electronic body music"]
  },

  "typoTolerance": {
    "enabled": true,
    "minWordSizeForTypos": {
      "oneTypo": 4,
      "twoTypos": 8
    },
    "disableOnAttributes": ["catalog_number", "article_number"]
  },

  "faceting": {
    "maxValuesPerFacet": 100,
    "sortFacetValuesBy": {
      "*": "count",
      "country": "alpha",
      "year": "alpha"
    }
  },

  "pagination": {
    "maxTotalHits": 5000
  }
}
```

Begruendungen:

- **`searchableAttributes`-Reihenfolge** ist zugleich Attribute-Ranking (`attribute`-Rule). Artist-Treffer ranken vor Title-Treffer, Title vor Label, Label vor Genres/Styles, dann CatNo. Spiegelt die heutige `CASE WHEN`-Heuristik.
- **`genres` und `styles` sind sowohl searchable als auch filterable** (siehe §3.5 fuer Begruendung).
- **`disableOnAttributes` fuer CatNo/Article-Number** weil Typo-Tolerance auf "WAX-001" → "WAX-002" unerwuenscht ist. CatNo ist Identifier, kein Sprachfeld.
- **Custom Ranking Rules** werden separat pro Index gesetzt — siehe §4.1 Ranking-Profiles.
- **`maxTotalHits: 5000`** — wir wollen keine Crawler die 50k Pages durchpaginieren. Browser-Pagination cap bei Page 209 (5000/24).
- **`maxValuesPerFacet: 100`** als globale Bremse gegen High-Cardinality-Felder. Country (~120 Werte) muesste eigentlich hoeher, aber Top-100 reicht — der Rest landet eh nicht in der UI-Sidebar. Phase-2 Aenderung wenn ein konkreter Use-Case auftaucht.
- **`stopWords` DE+EN** — gemischter Katalog. Keine japanischen Stop-Words noetig (charabia macht das richtig). NICHT in der Liste: `vinyl`, `record`, `cassette`, `tape`, `cd` — die sind im Katalog signifikant.

### 3.5 genres + styles in beiden Listen — bewusste Produktentscheidung

`genres` und `styles` stehen sowohl in `searchableAttributes` als auch in `filterableAttributes`. Begruendung: VOD-Sammler tippen Queries wie `industrial japan 1980` — sie erwarten dass das Wort `industrial` gegen das `genres`-Array matcht, nicht nur dass sie eine Filter-Sidebar bedienen. Genre als second-class searchable + konservative Synonyme deckt diesen Use-Case ohne UI-NLP-Logik ab. Cost ist minimal weil Meili intern dedupliziert (gleicher Token in `title` und `genres` macht das Doc nicht schwerer).

### 3.6 Synonyme — konservativ starten, datengetrieben wachsen

Die Synonym-Liste in §3.4 ist bewusst sehr klein gehalten. Wir vermeiden weite Cluster wie `techno ↔ edm` weil:
- "Techno" und "EDM" sind im Industrial/Avantgarde-Kontext **nicht** synonym. Ein Sammler der "techno" sucht, will keinen Mainstream-EDM-Treffer.
- Falsche Synonyme verschmutzen Result-Sets unsichtbar — der User sieht zu viel und merkt nicht warum.

**Erweiterungsregel:** Synonym-Erweiterung erfolgt datengetrieben nach 4 Wochen Soft-Launch via Suchlog-Analyse:
- Welche Top-100-Queries liefern 0 Treffer? (Hinweis auf fehlende Synonyme oder Typos)
- Welche Treffer-Sets sind in zwei verschiedenen Queries fast identisch? (Hinweis dass User die beiden Begriffe als Synonyme behandeln)

Konservatives Wachstum statt Big-Bang-Liste. Suchlog-Capture-Pipeline ist Phase-2 (siehe §11 BEWUSST NICHT Phase 1, kommt im Search-Analytics-Konzept spaeter).

### 3.7 Label-Suchpfad — separater Endpoint statt Facette

`label_name` ist NICHT in `filterableAttributes`. Begruendung: 3.077 Labels = unbenutzbare Sidebar-Facette. Stattdessen:

**Phase 1:**
- UI hat Label-Eingabefeld → ruft neuen Endpoint `/store/labels/suggest?q=` → liest direkt aus Postgres `Label`-Tabelle (3k Rows, mit `idx_label_name_trgm` schnell genug, kein eigener Meili-Index noetig)
- User waehlt einen Label aus der Liste → `label_slug` wird als Filter mitgesendet → Meili filtert via `label_slug = "vanity-records"` (`label_slug` ist filterable)

**Phase-2-Backlog:** Label-Facette mit Top-20-Counts via Meili `facetSearch` API wieder rein, falls UX-Feedback das wert ist.

**Phase-1-Facetten-Liste explizit:** `format`, `format_group`, `decade`, `country_code`, `product_category`, `genres`, `styles`. Das sind die navigationsstarken — 7 Facetten, alle mit < 50 distinct values, die Sidebar bleibt benutzbar.

### 3.8 Index-Aliase / Index-Swap

Wir nutzen Index-Swap fuer zero-downtime Re-Indexing. Pro Profile gibt es einen Staging-Index:

- `releases-commerce` (production) ↔ `releases-commerce-staging`
- `releases-discovery` (production) ↔ `releases-discovery-staging`

Atomic Swap via `POST /swap-indexes`, beide Profile in einem Aufruf.

---

## 4. Sync-Strategie Postgres → Meilisearch

### 4.1 Ranking-Profiles (zwei Indizes, ein Sync)

**Entscheidung: Two-Index-Strategy.** Per-query Ranking-Override in Meili 1.x ist moeglich, aber API-instabil und macht Settings-Verwaltung komplex. Zwei separate Indizes mit identischem Content sind operational simpler — die Tradeoffs:

- **Pro Two-Index:** simpler Backend-Code (`client.index(profileName)`), klare Settings-Versionierung in Git, keine Ueberraschungen in Meili-Settings-Drift.
- **Contra Two-Index:** ~600 MB Meili-Storage statt ~300 MB, doppelter Sync-Push-Traffic (jedes Doc geht in beide Indizes), ein zweiter Index muss beim Re-Build gepflegt werden.

Bei 52k Docs und 1.5 GB RAM-Cap ist der Speicher-Aufschlag vernachlaessigbar.

**Profile A — `releases-commerce` (Default fuer `/store/catalog`):**
```json
"rankingRules": [
  "words", "typo", "proximity", "attribute", "exactness",
  "in_stock:desc",
  "has_cover:desc",
  "cohort_a:desc",
  "is_purchasable:desc"
]
```
Boost-Reihenfolge spiegelt die Commerce-UX wider: in-stock-Items mit Cover und gesicherter Cohort-A zuerst, dann der Rest. Wird default fuer alle Storefront-Catalog-Calls genutzt.

**Profile B — `releases-discovery` (`/store/catalog?ranking=relevance`, `/store/catalog/suggest`, Admin-Search):**
```json
"rankingRules": [
  "words", "typo", "proximity", "attribute", "exactness",
  "discogs_last_synced:desc"
]
```
Rein relevanz-getrieben, mit aktuelleren Discogs-Daten als Tie-Breaker. Fuer Power-User die "Was ist im Katalog?" beantworten wollen, nicht "Was kann ich kaufen?".

**Backend-Routing:**
```typescript
const profile = (req.query.ranking === "relevance") ? "discovery" : "commerce"
const indexName = `releases-${profile}`
```

**Storefront UI:**
- Phase 1: Default `commerce`-Profile, kein UI-Toggle. User merkt nur "in-stock und Cover-Items kommen zuerst".
- Phase-2-Backlog: UI-Toggle "Sort by Availability / Sort by Relevance" im Catalog-Header.

### 4.2 Zwei Operationsmodi

1. **Initial-Backfill** (einmalig pro Profile): `python3 meilisearch_sync.py --full-rebuild` — laedt alle ~52k Releases als Batch in beide Staging-Indizes, nach erfolgreichem Indexing atomic Swap. Laufzeit erwartet 1-3 Minuten pro Profile, ~3-6 Min total.
2. **Delta-Sync** (alle 5 Min via Cron): `python3 meilisearch_sync.py` — laedt nur Releases mit `search_indexed_at IS NULL` (Trigger hat sie als "needs reindex" markiert), pusht in beide Profile parallel. Erwartet < 100 Docs pro Run unter Normalbetrieb, < 5 s.

### 4.3 Aenderungs-Detektion via `search_indexed_at` + Trigger

Die kritische Schwachstelle der v1-Variante war: Delta-Sync verliess sich auf `Release.updatedAt`, aber ein Artist-Rename, ein neuer entity_content-Eintrag oder eine ERP-Inventur bumpten `updatedAt` nicht — der Index blieb stale. v2 loest das mit einer expliziten Spalte und Triggern.

**Migration `2026-04-XX_release_search_indexed_at.sql`:**

```sql
-- Schritt 1: Spalte
ALTER TABLE "Release"
  ADD COLUMN IF NOT EXISTS search_indexed_at TIMESTAMPTZ NULL;

-- Schritt 2: Index fuer schnellen Delta-Query
CREATE INDEX IF NOT EXISTS idx_release_search_indexed_at_null
  ON "Release"(search_indexed_at) WHERE search_indexed_at IS NULL;

-- Schritt 3: Initial alle Rows als "needs reindex" markieren
UPDATE "Release" SET search_indexed_at = NULL;

-- ─── Trigger A: Self-Update auf Release ─────────────────────────────────────
-- Bumpt search_indexed_at = NULL wenn relevante Felder geaendert werden.
-- Spalten-Whitelist: nur Felder die im Meili-Doc gerendert werden.
CREATE OR REPLACE FUNCTION trigger_release_indexed_at_self()
RETURNS trigger AS $$
BEGIN
  IF (NEW.title IS DISTINCT FROM OLD.title)
     OR (NEW."catalogNumber" IS DISTINCT FROM OLD."catalogNumber")
     OR (NEW.article_number IS DISTINCT FROM OLD.article_number)
     OR (NEW.year IS DISTINCT FROM OLD.year)
     OR (NEW.country IS DISTINCT FROM OLD.country)
     OR (NEW.format IS DISTINCT FROM OLD.format)
     OR (NEW.format_id IS DISTINCT FROM OLD.format_id)
     OR (NEW.product_category IS DISTINCT FROM OLD.product_category)
     OR (NEW."coverImage" IS DISTINCT FROM OLD."coverImage")
     OR (NEW.legacy_price IS DISTINCT FROM OLD.legacy_price)
     OR (NEW.direct_price IS DISTINCT FROM OLD.direct_price)
     OR (NEW.legacy_available IS DISTINCT FROM OLD.legacy_available)
     OR (NEW.sale_mode IS DISTINCT FROM OLD.sale_mode)
     OR (NEW.auction_status IS DISTINCT FROM OLD.auction_status)
     OR (NEW."artistId" IS DISTINCT FROM OLD."artistId")
     OR (NEW."labelId" IS DISTINCT FROM OLD."labelId")
     OR (NEW."pressOrgaId" IS DISTINCT FROM OLD."pressOrgaId")
     OR (NEW.discogs_lowest_price IS DISTINCT FROM OLD.discogs_lowest_price)
     OR (NEW.discogs_median_price IS DISTINCT FROM OLD.discogs_median_price)
     OR (NEW.discogs_highest_price IS DISTINCT FROM OLD.discogs_highest_price)
     OR (NEW.discogs_num_for_sale IS DISTINCT FROM OLD.discogs_num_for_sale)
     OR (NEW.discogs_last_synced_at IS DISTINCT FROM OLD.discogs_last_synced_at)
  THEN
    NEW.search_indexed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS release_indexed_at_self ON "Release";
CREATE TRIGGER release_indexed_at_self
  BEFORE UPDATE ON "Release"
  FOR EACH ROW EXECUTE FUNCTION trigger_release_indexed_at_self();

-- ─── Trigger B: entity_content (Artist/Label-Rename, Genre-Aenderungen) ─────
CREATE OR REPLACE FUNCTION trigger_release_indexed_at_entity_content()
RETURNS trigger AS $$
DECLARE
  affected_id TEXT;
BEGIN
  affected_id := COALESCE(NEW.entity_id, OLD.entity_id);
  IF affected_id IS NULL THEN RETURN NEW; END IF;

  IF COALESCE(NEW.entity_type, OLD.entity_type) = 'artist' THEN
    UPDATE "Release"
       SET search_indexed_at = NULL
     WHERE "artistId" = affected_id;
  ELSIF COALESCE(NEW.entity_type, OLD.entity_type) = 'label' THEN
    UPDATE "Release"
       SET search_indexed_at = NULL
     WHERE "labelId" = affected_id;
  ELSIF COALESCE(NEW.entity_type, OLD.entity_type) = 'press_orga' THEN
    UPDATE "Release"
       SET search_indexed_at = NULL
     WHERE "pressOrgaId" = affected_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS release_indexed_at_entity_content ON entity_content;
CREATE TRIGGER release_indexed_at_entity_content
  AFTER INSERT OR UPDATE OR DELETE ON entity_content
  FOR EACH ROW EXECUTE FUNCTION trigger_release_indexed_at_entity_content();

-- ─── Trigger C: erp_inventory_item (exemplar_count, in_stock) ───────────────
CREATE OR REPLACE FUNCTION trigger_release_indexed_at_inventory()
RETURNS trigger AS $$
DECLARE
  affected_release TEXT;
BEGIN
  affected_release := COALESCE(NEW.release_id, OLD.release_id);
  IF affected_release IS NOT NULL THEN
    UPDATE "Release"
       SET search_indexed_at = NULL
     WHERE id = affected_release;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS release_indexed_at_inventory ON erp_inventory_item;
CREATE TRIGGER release_indexed_at_inventory
  AFTER INSERT OR UPDATE OR DELETE ON erp_inventory_item
  FOR EACH ROW EXECUTE FUNCTION trigger_release_indexed_at_inventory();
```

**Explizite Bumps in Python-Sync-Scripts:**

`scripts/legacy_sync_v2.py` schreibt am Ende jeder Run-Group:

```python
# Nach jedem successfully geschriebenen Release-Batch
if changed_release_ids:
    cur.execute(
        'UPDATE "Release" SET search_indexed_at = NULL WHERE id = ANY(%s)',
        (list(changed_release_ids),),
    )
    pg_conn.commit()
```

`scripts/discogs_daily_sync.py` analog fuer die ge-syncten release_ids. Auch wenn Trigger A die Aenderung schon detektiert haette (discogs_*-Felder sind in der Whitelist), ist der explizite Bump als Defense-in-Depth sinnvoll: bei Bulk-UPDATEs koennten Trigger-Fehler einzelne Rows verpassen.

**Sync-Tracking-Tabelle (zweite Verteidigungslinie):**

```sql
CREATE TABLE IF NOT EXISTS meilisearch_index_state (
  release_id TEXT PRIMARY KEY,
  indexed_at TIMESTAMPTZ NOT NULL,
  doc_hash TEXT NOT NULL
);
CREATE INDEX idx_meili_state_indexed_at ON meilisearch_index_state(indexed_at);
```

`doc_hash` = SHA-256 ueber das serialisierte Doc-JSON (ohne `indexed_at`-Feld). Das ist unsere zweite Verteidigungslinie: falls ein Trigger einen Fall verpasst, faellt es spaetestens beim Hash-Diff auf, wenn der Sync den aktuellen Doc-State mit dem zuletzt gepushten vergleicht. Im Steady-State werden die meisten Docs durch search_indexed_at IS NULL ausgewaehlt — der Hash filtert dann nur die false-positives raus (z.B. eine Mutation die das Doc nicht material veraendert hat).

### 4.4 Delta-Query (primaer ueber search_indexed_at)

```sql
SELECT r.id
  FROM "Release" r
  LEFT JOIN meilisearch_index_state s ON s.release_id = r.id
 WHERE r.search_indexed_at IS NULL
    OR (s.release_id IS NULL)                     -- noch nie indexed
    OR (s.indexed_at < r.search_indexed_at);      -- bumped seit letztem Push
```

Falls eine Race-Condition zwischen Trigger und Sync-Run auftritt (Trigger setzt NULL → Sync findet → Sync pusht → Sync schreibt indexed_at = NOW(), aber waehrenddessen kam noch ein Trigger-Bump): der Hash-Diff faengt das im naechsten Run.

### 4.5 Edge-Cases

| Case | Behandlung |
|---|---|
| Release neu inserted | Trigger A feuert nicht bei INSERT (nur UPDATE), aber `search_indexed_at` ist NULL (kein DEFAULT) → Delta-Query findet → push, State-Eintrag erzeugt |
| Release-Felder geaendert (Whitelist) | Trigger A bumpt search_indexed_at = NULL → Delta findet → re-push, Hash vergleicht (skip wenn unveraendert) |
| Release-Felder geaendert (NICHT in Whitelist) | Bewusst kein Re-Index — z.B. `internal_notes` oder andere admin-only Felder |
| Release "geloescht" (legacy_available=false) | Bleibt im Index, aber `is_purchasable=false`. Soft-delete-Pattern. Trigger A faengt `legacy_available`-Aenderung. |
| Release hard-deleted | Sync-Run cleant alle State-Eintraege ohne Release-Existenz, sendet `delete-batch` an Meili. Lauft nur 1× pro Tag (`--cleanup` flag). |
| Artist-Name geaendert via entity_content | Trigger B bumpt alle Releases dieses Artists |
| Artist-Name geaendert direkt in `Artist`-Tabelle | **Limitation:** Trigger B greift nicht. Workaround: explizite Bumps in jedem Code-Pfad der `Artist.name` aendert (heute praktisch nur Discogs-Import + manuelle Admin-Edits). Oder: zusaetzlicher Trigger auf `Artist` und `Label` und `PressOrga`. **Phase-1-Entscheidung:** Trigger nur auf `entity_content`, weil Direct-Artist-Renames extrem selten sind und der Cleanup-Cron (taeglich `--full-rebuild` waere Overkill, aber `--full-rebuild` einmal pro Woche als Hygiene) sie aufholt. |
| Image-Upload | `Release.coverImage` wird gesetzt → Trigger A faengt es → Re-Index |
| ERP-Inventur (neues Exemplar, Stocktake) | Trigger C bumpt Release → exemplar_count/in_stock im Index aktuell |
| Discogs-Daily-Sync via `discogs_daily_sync.py` | Trigger A faengt Discogs-Feld-Aenderung + expliziter Bump im Script (defense-in-depth) |
| Sync-Lag in groesseren Batches | Initial-Backfill via Tasks-API mit Wait-for-Task, kein Block der API |
| Meili-Server unreachable | Sync-Script faellt mit Exit 1, Cron-Run macht Logging, naechster Cron-Run versucht erneut. Storefront kriegt nichts mit (Backend-Runtime-Fallback aktiv, siehe §5). |
| Doc-Hash-Drift (Migration aendert serialisierung) | `--full-rebuild` flag drueckt alle States, indexed alles neu. |

### 4.6 Python-Script-Skelett

```python
#!/usr/bin/env python3
"""
Meilisearch Sync — Postgres → Meilisearch.

Modes:
  python3 meilisearch_sync.py                  # Delta-Sync
  python3 meilisearch_sync.py --full-rebuild   # Index-Swap (alle Docs neu)
  python3 meilisearch_sync.py --apply-settings # Settings (Synonyme etc.) pushen
  python3 meilisearch_sync.py --cleanup        # Soft-delete von verwaisten Docs
  python3 meilisearch_sync.py --dry-run        # Zaehlt nur, schreibt nichts
  python3 meilisearch_sync.py --pg-url URL     # Override DB-URL
  python3 meilisearch_sync.py --meili-url URL  # Override Meili-URL

Cron (alle 5 Min):
  */5 * * * * cd /root/VOD_Auctions/scripts && \\
    venv/bin/python3 meilisearch_sync.py >> meilisearch_sync.log 2>&1

Cleanup (taeglich 03:00 UTC):
  0 3 * * * cd /root/VOD_Auctions/scripts && \\
    venv/bin/python3 meilisearch_sync.py --cleanup >> meilisearch_sync.log 2>&1
"""

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests

SCRIPT_VERSION = "meilisearch_sync.py v1.0.0"

# Beide Profile — gleicher Content, verschiedene rankingRules
PROFILES = ["commerce", "discovery"]
INDEX_NAME = "releases-{profile}"
STAGING_INDEX = "releases-{profile}-staging"
BATCH_SIZE = 1000
TASK_TIMEOUT_MS = 60000

# Mirror der `route.ts:COUNTRY_ALIASES` als ISO-Map
COUNTRY_TO_ISO = {
    "Germany": "DE", "United States": "US", "United Kingdom": "GB",
    "Japan": "JP", "France": "FR", "Italy": "IT", "Netherlands": "NL",
    "Belgium": "BE", "Sweden": "SE", "Norway": "NO", "Switzerland": "CH",
    # ... full list in scripts/data/country_iso.py
}


def get_pg_conn(url_override=None):
    db_url = url_override or os.getenv("SUPABASE_DB_URL")
    if not db_url:
        sys.exit("ERROR: SUPABASE_DB_URL not set")
    return psycopg2.connect(db_url)


def get_meili_url():
    return os.getenv("MEILI_URL", "http://127.0.0.1:7700")


def get_meili_admin_key():
    return os.getenv("MEILI_ADMIN_API_KEY")


def meili_request(method, path, json_body=None, url_override=None,
                  ok_statuses=(200, 201, 202, 204)):
    """Generic Meili-Request. ok_statuses kontrolliert was als success gilt
    (z.B. DELETE auf nicht-existenten Index = 404, ist kein Fehler)."""
    base = url_override or get_meili_url()
    headers = {
        "Authorization": f"Bearer {get_meili_admin_key()}",
        "Content-Type": "application/json",
    }
    r = requests.request(method, f"{base}{path}", headers=headers,
                         json=json_body, timeout=30)
    if r.status_code not in ok_statuses:
        r.raise_for_status()
    return r.json() if r.content else {}


def wait_for_task(task_uid, timeout_ms=TASK_TIMEOUT_MS):
    """Pollt Meili Tasks-API bis Task succeeded oder failed.
    Raises bei timeout oder failed status. Statt /stats?isIndexing-Polling.
    """
    deadline = time.time() + (timeout_ms / 1000.0)
    while time.time() < deadline:
        task = meili_request("GET", f"/tasks/{task_uid}")
        status = task.get("status")
        if status == "succeeded":
            return task
        if status == "failed":
            raise RuntimeError(f"Meili task {task_uid} failed: {task.get('error')}")
        if status == "canceled":
            raise RuntimeError(f"Meili task {task_uid} was canceled")
        time.sleep(0.5)
    raise TimeoutError(f"Meili task {task_uid} timeout after {timeout_ms}ms")


def fetch_release_rows(pg_conn, where_clause="", params=None):
    """Single SQL query: ein Release-Doc mit allen Joins.
    Returns list of dicts ready for Meilisearch transform.
    """
    sql = f"""
        SELECT
            r.id, r.title, r."catalogNumber" AS catalog_number,
            r.article_number, r.format, r.format_id, r.product_category,
            r.year, r.country, r."coverImage" AS cover_image,
            r.legacy_price, r.direct_price, r.legacy_available,
            r.sale_mode, r.auction_status,
            r.discogs_id, r.discogs_lowest_price, r.discogs_median_price,
            r.discogs_highest_price, r.discogs_num_for_sale,
            r.discogs_last_synced_at,
            r."updatedAt" AS updated_at,
            a.name AS artist_name, a.slug AS artist_slug,
            l.name AS label_name, l.slug AS label_slug,
            p.name AS press_orga_name, p.slug AS press_orga_slug,
            f.name AS format_name, f.format_group AS format_group_raw, f.kat AS format_kat,
            ec.genre_tags AS genres,
            (SELECT COUNT(*) FROM erp_inventory_item ii WHERE ii.release_id = r.id) AS exemplar_count,
            (SELECT COUNT(*) FROM erp_inventory_item ii
             WHERE ii.release_id = r.id AND ii.last_stocktake_at IS NOT NULL) AS verified_count
        FROM "Release" r
        LEFT JOIN "Artist" a ON a.id = r."artistId"
        LEFT JOIN "Label" l ON l.id = r."labelId"
        LEFT JOIN "PressOrga" p ON p.id = r."pressOrgaId"
        LEFT JOIN "Format" f ON f.id = r.format_id
        LEFT JOIN entity_content ec ON ec.entity_id = r."artistId" AND ec.entity_type = 'artist'
        {where_clause}
    """
    cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(sql, params or ())
    rows = cur.fetchall()
    cur.close()
    return rows


def transform_to_doc(row):
    """Map DB-row → Meilisearch-Document gemaess §3.2 Schema.
    IDs werden 1:1 uebernommen — Meili 1.x akzeptiert Bindestriche."""
    legacy = float(row["legacy_price"]) if row["legacy_price"] else None
    direct = float(row["direct_price"]) if row["direct_price"] else None
    effective = legacy if legacy and legacy > 0 else (direct if direct and direct > 0 else None)
    has_price = effective is not None and effective > 0
    is_purchasable = has_price and bool(row["legacy_available"])

    fmt_enum = (row["format"] or "").upper()
    if row["format_kat"] == 2 or fmt_enum == "LP":
        format_group = "vinyl"
    elif row["format_kat"] == 1 and fmt_enum in ("CASSETTE", "REEL"):
        format_group = "tapes"
    elif fmt_enum == "CD":
        format_group = "cd"
    elif fmt_enum == "VHS":
        format_group = "vhs"
    elif row["product_category"] in ("band_literature", "label_literature", "press_literature"):
        format_group = row["product_category"]
    else:
        format_group = "tapes" if row["format_kat"] == 1 else "other"

    year = row["year"]
    decade = (year // 10) * 10 if year else None
    country = row["country"]
    country_code = COUNTRY_TO_ISO.get(country) if country else None
    discogs_synced = row["discogs_last_synced_at"]

    return {
        "id": row["id"],            # 1:1, KEIN replace("-", "_")
        "release_id": row["id"],
        "title": row["title"],
        "artist_name": row["artist_name"],
        "artist_slug": row["artist_slug"],
        "label_name": row["label_name"],
        "label_slug": row["label_slug"],
        "press_orga_name": row["press_orga_name"],
        "press_orga_slug": row["press_orga_slug"],
        "format": row["format"],
        "format_name": row["format_name"],
        "format_group": format_group,
        "format_id": row["format_id"],
        "product_category": row["product_category"],
        "year": year,
        "decade": decade,
        "country": country,
        "country_code": country_code,
        "catalog_number": row["catalog_number"],
        "article_number": row["article_number"],
        "genres": row["genres"] or [],
        "styles": [],  # placeholder — kommt wenn entity_content.style_tags exist
        "cover_image": row["cover_image"],
        "has_cover": bool(row["cover_image"]),
        "legacy_price": legacy,
        "direct_price": direct,
        "effective_price": effective,
        "has_price": has_price,
        "is_purchasable": is_purchasable,
        "legacy_available": bool(row["legacy_available"]),
        "sale_mode": row["sale_mode"],
        "auction_status": row["auction_status"],
        "discogs_id": row["discogs_id"],
        "discogs_lowest_price": float(row["discogs_lowest_price"]) if row["discogs_lowest_price"] else None,
        "discogs_median_price": float(row["discogs_median_price"]) if row["discogs_median_price"] else None,
        "discogs_highest_price": float(row["discogs_highest_price"]) if row["discogs_highest_price"] else None,
        "discogs_num_for_sale": row["discogs_num_for_sale"],
        "discogs_last_synced": int(discogs_synced.timestamp()) if discogs_synced else 0,
        "exemplar_count": int(row["exemplar_count"] or 0),
        "verified_count": int(row["verified_count"] or 0),
        "in_stock": int(row["exemplar_count"] or 0) > 0,
        "cohort_a": legacy is not None and legacy > 0,
        "popularity_score": 0,
        "indexed_at": int(time.time()),
        "updated_at": int(row["updated_at"].timestamp()) if row["updated_at"] else 0,
    }


def doc_hash(doc):
    """SHA-256 ohne `indexed_at` (sonst aendert sich Hash bei jedem Sync)."""
    copy = {k: v for k, v in doc.items() if k != "indexed_at"}
    return hashlib.sha256(
        json.dumps(copy, sort_keys=True, default=str).encode()
    ).hexdigest()


def push_batch_to_profile(profile, docs, dry_run=False):
    """Pushed eine Doc-Liste in den production-Index eines Profile.
    Wartet via Tasks-API auf Indexing-Completion."""
    if not docs:
        return
    if dry_run:
        print(f"  [dry-run] would push {len(docs)} docs to {profile}")
        return
    index = INDEX_NAME.format(profile=profile)
    resp = meili_request("POST", f"/indexes/{index}/documents", docs)
    task_uid = resp.get("taskUid")
    if task_uid is None:
        raise RuntimeError(f"No taskUid in Meili response: {resp}")
    wait_for_task(task_uid)


def update_state(pg_conn, docs, dry_run=False):
    if dry_run or not docs:
        return
    cur = pg_conn.cursor()
    rows = [(d["release_id"], doc_hash(d)) for d in docs]
    psycopg2.extras.execute_values(
        cur,
        """INSERT INTO meilisearch_index_state (release_id, indexed_at, doc_hash)
           VALUES %s
           ON CONFLICT (release_id) DO UPDATE SET
             indexed_at = NOW(), doc_hash = EXCLUDED.doc_hash""",
        rows,
        template="(%s, NOW(), %s)",
    )
    # Nach erfolgreichem Push: Postgres search_indexed_at = NOW() setzen,
    # damit naechster Delta-Query diese Docs nicht mehr findet (es sei denn
    # ein Trigger bumped sie wieder auf NULL).
    cur.execute(
        'UPDATE "Release" SET search_indexed_at = NOW() WHERE id = ANY(%s)',
        ([d["release_id"] for d in docs],),
    )
    pg_conn.commit()
    cur.close()


def delta_sync(pg_conn, dry_run=False):
    """Findet neue + geaenderte Releases, indexed sie in beide Profile."""
    where = """
        LEFT JOIN meilisearch_index_state s ON s.release_id = r.id
        WHERE r.search_indexed_at IS NULL
           OR s.release_id IS NULL
           OR s.indexed_at < r.search_indexed_at
    """
    rows = fetch_release_rows(pg_conn, where)
    print(f"Delta candidates: {len(rows)}")

    # Hash-Filter — nur wirklich geaenderte Docs durchschieben (zweite
    # Verteidigungslinie falls Trigger einen false-positive Bump gemacht hat).
    cur = pg_conn.cursor()
    cur.execute("SELECT release_id, doc_hash FROM meilisearch_index_state")
    existing_hashes = dict(cur.fetchall())
    cur.close()

    docs_to_push = []
    docs_unchanged = []
    for row in rows:
        doc = transform_to_doc(row)
        new_hash = doc_hash(doc)
        if existing_hashes.get(row["id"]) != new_hash:
            docs_to_push.append(doc)
        else:
            docs_unchanged.append(doc)
    print(f"  After hash-filter: {len(docs_to_push)} push, {len(docs_unchanged)} unchanged")

    # Auch unveraenderte Docs muessen ihre search_indexed_at-Spalte auf
    # NOW() bekommen, sonst findet sie der naechste Delta-Run wieder.
    if docs_unchanged and not dry_run:
        ucur = pg_conn.cursor()
        ucur.execute(
            'UPDATE "Release" SET search_indexed_at = NOW() WHERE id = ANY(%s)',
            ([d["release_id"] for d in docs_unchanged],),
        )
        pg_conn.commit()
        ucur.close()

    for i in range(0, len(docs_to_push), BATCH_SIZE):
        batch = docs_to_push[i:i + BATCH_SIZE]
        for profile in PROFILES:
            push_batch_to_profile(profile, batch, dry_run)
        update_state(pg_conn, batch, dry_run)


def apply_settings(dry_run=False):
    """Pushed scripts/meilisearch_settings.json in beide Profile.
    Profile-spezifische rankingRules werden gemerged."""
    settings_path = Path(__file__).parent / "meilisearch_settings.json"
    base_settings = json.loads(settings_path.read_text())

    ranking_rules = {
        "commerce": [
            "words", "typo", "proximity", "attribute", "exactness",
            "in_stock:desc", "has_cover:desc", "cohort_a:desc",
            "is_purchasable:desc",
        ],
        "discovery": [
            "words", "typo", "proximity", "attribute", "exactness",
            "discogs_last_synced:desc",
        ],
    }

    for profile in PROFILES:
        index = INDEX_NAME.format(profile=profile)
        # Index erstellen (idempotent)
        resp = meili_request(
            "POST", "/indexes",
            {"uid": index, "primaryKey": "id"},
            ok_statuses=(200, 201, 202, 409),  # 409 = already exists
        )
        # Settings pushen, profile-spezifische rankingRules
        settings = dict(base_settings)
        settings["rankingRules"] = ranking_rules[profile]
        if dry_run:
            print(f"  [dry-run] would apply settings to {index}")
            continue
        resp = meili_request("PATCH", f"/indexes/{index}/settings", settings)
        wait_for_task(resp["taskUid"])
        print(f"  Applied settings to {index}")


def full_rebuild(pg_conn, dry_run=False):
    """Index-Swap: alle Docs in Staging-Index pro Profile, dann atomarer Swap.
    Production-Index bleibt waehrenddessen aktiv und antwortet weiter."""
    print("Full rebuild — building staging indexes for both profiles ...")

    # Staging-Indizes (idempotent: cleanup + create + settings)
    for profile in PROFILES:
        staging = STAGING_INDEX.format(profile=profile)
        # DELETE status-tolerant: 404 ist OK (Index existierte nicht)
        resp = meili_request(
            "DELETE", f"/indexes/{staging}",
            ok_statuses=(200, 202, 204, 404),
        )
        if resp.get("taskUid"):
            try:
                wait_for_task(resp["taskUid"], timeout_ms=10000)
            except Exception:
                pass  # cleanup-failure ist tolerierbar

        if dry_run:
            print(f"  [dry-run] would (re-)create staging {staging}")
            continue

        meili_request(
            "POST", "/indexes",
            {"uid": staging, "primaryKey": "id"},
            ok_statuses=(200, 201, 202),
        )
        # Settings vom Production-Index uebernehmen
        prod = INDEX_NAME.format(profile=profile)
        prod_settings = meili_request("GET", f"/indexes/{prod}/settings")
        resp = meili_request("PATCH", f"/indexes/{staging}/settings", prod_settings)
        wait_for_task(resp["taskUid"])

    # Alle Releases in Batches pushen
    rows = fetch_release_rows(pg_conn)
    print(f"  Total releases: {len(rows)}")
    docs = [transform_to_doc(r) for r in rows]

    for i in range(0, len(docs), BATCH_SIZE):
        batch = docs[i:i + BATCH_SIZE]
        for profile in PROFILES:
            staging = STAGING_INDEX.format(profile=profile)
            if dry_run:
                print(f"  [dry-run] would push batch to {staging}")
                continue
            resp = meili_request("POST", f"/indexes/{staging}/documents", batch)
            wait_for_task(resp["taskUid"])
        print(f"  Batch {i // BATCH_SIZE + 1}: {len(batch)} docs")

    if dry_run:
        return

    # Atomic Swap fuer beide Profile in einem Aufruf
    swap_payload = [
        {"indexes": [INDEX_NAME.format(profile=p), STAGING_INDEX.format(profile=p)]}
        for p in PROFILES
    ]
    resp = meili_request("POST", "/swap-indexes", swap_payload)
    wait_for_task(resp["taskUid"])

    # Cleanup: Staging-Indizes nach Swap loeschen
    for profile in PROFILES:
        staging = STAGING_INDEX.format(profile=profile)
        resp = meili_request(
            "DELETE", f"/indexes/{staging}",
            ok_statuses=(200, 202, 204, 404),
        )
        if resp.get("taskUid"):
            try:
                wait_for_task(resp["taskUid"], timeout_ms=10000)
            except Exception:
                pass

    # State-Tabelle komplett neu schreiben
    cur = pg_conn.cursor()
    cur.execute("TRUNCATE meilisearch_index_state")
    update_state(pg_conn, docs)
    pg_conn.commit()
    cur.close()
    print("  Done.")


def cleanup_orphans(pg_conn, dry_run=False):
    """Loescht Docs aus Meili die keinen Release-Eintrag mehr haben."""
    cur = pg_conn.cursor()
    cur.execute("""
        SELECT s.release_id FROM meilisearch_index_state s
        WHERE NOT EXISTS (SELECT 1 FROM "Release" r WHERE r.id = s.release_id)
    """)
    orphans = [row[0] for row in cur.fetchall()]
    cur.close()

    if not orphans:
        print("Cleanup: no orphans")
        return
    print(f"Cleanup: {len(orphans)} orphans")
    if dry_run:
        return
    for profile in PROFILES:
        index = INDEX_NAME.format(profile=profile)
        resp = meili_request("POST",
                             f"/indexes/{index}/documents/delete-batch",
                             orphans)
        wait_for_task(resp["taskUid"])
    cur = pg_conn.cursor()
    cur.execute("DELETE FROM meilisearch_index_state WHERE release_id = ANY(%s)",
                (orphans,))
    pg_conn.commit()
    cur.close()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--full-rebuild", action="store_true")
    p.add_argument("--apply-settings", action="store_true")
    p.add_argument("--cleanup", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--pg-url")
    p.add_argument("--meili-url")
    args = p.parse_args()

    pg_conn = get_pg_conn(args.pg_url)
    try:
        if args.apply_settings:
            apply_settings(args.dry_run)
        if args.full_rebuild:
            full_rebuild(pg_conn, args.dry_run)
        elif args.cleanup:
            cleanup_orphans(pg_conn, args.dry_run)
        elif not args.apply_settings:
            delta_sync(pg_conn, args.dry_run)
    finally:
        pg_conn.close()


if __name__ == "__main__":
    main()
```

Die Datei landet in `scripts/meilisearch_sync.py`. Settings-Datei wird **separat** verwaltet via `scripts/meilisearch_settings.json` (versioniert in Git), Apply-Befehl ist idempotent.

**Timeout-Strategie:** Jeder Tasks-API-Call hat `TASK_TIMEOUT_MS=60000` (60 s). Bei Timeout: Exception + Cron-Run faellt mit Exit 1. Staging-Indizes bleiben nach abgebrochenem `--full-rebuild` zurueck — naechster `--full-rebuild`-Aufruf macht den Cleanup-Step (DELETE auf staging mit `ok_statuses=(200, 202, 204, 404)`) selbst wieder sauber. Kein Auto-Recovery noetig, manueller Re-Run reicht.

### 4.7 Cron + ENV

In `scripts/.env` neu:

```
MEILI_URL=http://127.0.0.1:7700
MEILI_ADMIN_API_KEY=<aus docker-compose.yml gelesen oder aus 1Password>
MEILI_SEARCH_ONLY_API_KEY=<derived via Tenant-Token-API, nur fuer Phase 2 Direct-Browser>
```

Cron:

```bash
# Delta-Sync alle 5 Min
*/5 * * * * cd /root/VOD_Auctions/scripts && venv/bin/python3 meilisearch_sync.py >> meilisearch_sync.log 2>&1

# Cleanup taeglich 03:00 UTC
0 3 * * * cd /root/VOD_Auctions/scripts && venv/bin/python3 meilisearch_sync.py --cleanup >> meilisearch_sync.log 2>&1

# Drift-Check alle 30 Min (siehe §11(d))
*/30 * * * * cd /root/VOD_Auctions/scripts && venv/bin/python3 meilisearch_drift_check.py >> meilisearch_drift.log 2>&1
```

---

## 5. Backend-Integration

### 5.1 Architektur-Entscheidung: Backend-Proxy mit Runtime-Fallback

**Entscheidung:** Storefront ruft weiterhin den Medusa-Backend-Endpoint `/store/catalog` etc. auf. Backend macht die Meilisearch-Query intern. Kein direkter Browser → Meilisearch Aufruf in Phase 1.

**Warum nicht Direct-Browser (Tenant-Token):**

Pro Direct-Browser-Aufruf: spart einen Hop (~30-50 ms Latenz), erlaubt Instant-Search ohne Backend-Last.

Contra Direct-Browser fuer VOD:
- Bestehende `/store/catalog` Logik (COUNTRY_ALIASES, sale_mode-Mapping, is_purchasable-Berechnung, Discogs-Price-Enrichment) muesste in Frontend dupliziert werden.
- Rate-Limiting (Upstash Redis) ist auf Backend-Routes. Direct-Meili = neuer Rate-Limit-Layer.
- Tenant-Token-Rotation operativer Aufwand.
- Meili-Latenz von der VPS auf den selben VPS ist sub-ms. Backend-Hop ist ~5 ms intern. Der "Spar-Effekt" ist kosmetisch.

Wenn wir spaeter mal einen reinen InstantSearch-Widget mit Algolia-style sub-50-ms-Tippreaktion bauen (Phase 2 prio-1, siehe §6), kommt der Direct-Browser-Token. Heute: Backend-Proxy.

### 5.2 Health-Probe + Effective-Flag (in-memory, NICHT site_config)

Das Feature-Flag `SEARCH_MEILI_CATALOG` in `site_config.features` bestimmt die **gewuenschte** Konfiguration. Die **effective** Konfiguration im Memory beruecksichtigt zusaetzlich Meili's Health.

Neue Lib `backend/src/lib/meilisearch.ts`:

```typescript
import { MeiliSearch } from "meilisearch"

// ─── Singleton-Client ──────────────────────────────────────────────────────
let client: MeiliSearch | null = null

export function getMeiliClient(): MeiliSearch {
  if (client) return client
  const host = process.env.MEILI_URL || "http://127.0.0.1:7700"
  const apiKey = process.env.MEILI_ADMIN_API_KEY
  if (!apiKey) throw new Error("MEILI_ADMIN_API_KEY not set")
  client = new MeiliSearch({ host, apiKey })
  return client
}

export const COMMERCE_INDEX = "releases-commerce"
export const DISCOVERY_INDEX = "releases-discovery"

// ─── Health-Probe + Effective-Flag ────────────────────────────────────────
//
// Das Effective-Flag ist eine in-memory Variable, die vom Health-Probe
// alle 30 s aktualisiert wird. NICHT in site_config geschrieben — site_config
// bleibt der Operator-Wille, das Effective-Flag ist die Runtime-Realitaet.
//
// Bei 3 aufeinanderfolgenden Health-Fails wird das Flag auf false gesetzt.
// Sobald ein Health-Call erfolgreich durchgeht, wird es wieder auf true
// gesetzt (instant Recovery).
//
// Routen lesen NICHT site_config direkt, sondern via isMeiliEffective().

let effectiveOn = true
let consecutiveFailures = 0
const FAIL_THRESHOLD = 3
const PROBE_INTERVAL_MS = 30_000

export function isMeiliEffective(): boolean {
  return effectiveOn
}

async function probe(): Promise<void> {
  try {
    const c = getMeiliClient()
    await c.health()
    if (!effectiveOn) {
      console.log(JSON.stringify({
        event: "meili_health_recovered",
        consecutive_failures_before: consecutiveFailures,
      }))
    }
    consecutiveFailures = 0
    effectiveOn = true
  } catch (err: any) {
    consecutiveFailures++
    if (effectiveOn && consecutiveFailures >= FAIL_THRESHOLD) {
      effectiveOn = false
      console.error(JSON.stringify({
        event: "meili_health_tripped",
        consecutive_failures: consecutiveFailures,
        error: err?.message,
      }))
    }
  }
}

let probeTimer: NodeJS.Timeout | null = null
export function startMeiliHealthProbe(): void {
  if (probeTimer) return
  // Erste Probe sofort, danach periodisch
  void probe()
  probeTimer = setInterval(() => void probe(), PROBE_INTERVAL_MS)
  if (typeof probeTimer.unref === "function") probeTimer.unref()
}
```

Aufgerufen aus Medusa's `loaders/index.ts` (oder aequivalent — beim Backend-Boot startet der Probe).

**Phase-2-Polish:** Circuit-Breaker via `opossum` o.ae. — gibt feinere Kontrolle (z.B. half-open state, Fehlerrate-basierte Trips statt nur consecutive-fail-Count, Slow-Call-Detection). Heute genuegt der einfache Counter.

### 5.3 Neue Lib `backend/src/lib/release-search-meili.ts`

```typescript
import { getMeiliClient, COMMERCE_INDEX, DISCOVERY_INDEX } from "./meilisearch"
import type { SearchParams } from "meilisearch"

export type RankingProfile = "commerce" | "discovery"

export interface CatalogSearchParams {
  query?: string
  filters?: {
    format?: string
    format_group?: string
    product_category?: string
    country?: string
    country_code?: string
    year_from?: number
    year_to?: number
    decade?: number
    label_slug?: string
    artist_slug?: string
    genres?: string[]
    sale_mode?: string
    for_sale?: boolean
    has_cover?: boolean
    in_stock?: boolean
  }
  sort?: "relevance" | "year_asc" | "year_desc" | "price_asc"
       | "price_desc" | "title_asc" | "artist_asc" | "newest"
  page?: number
  limit?: number
  facets?: string[]
  highlight?: boolean
  ranking?: RankingProfile
}

function buildFilterString(f: CatalogSearchParams["filters"]): string[] {
  if (!f) return []
  const parts: string[] = []
  const escape = (s: string) => s.replace(/"/g, '\\"')
  if (f.format) parts.push(`format = "${escape(f.format)}"`)
  if (f.format_group) parts.push(`format_group = "${escape(f.format_group)}"`)
  if (f.product_category) parts.push(`product_category = "${escape(f.product_category)}"`)
  if (f.country_code) parts.push(`country_code = "${escape(f.country_code)}"`)
  if (f.year_from && f.year_to) {
    parts.push(`year >= ${f.year_from} AND year <= ${f.year_to}`)
  } else if (f.year_from) {
    parts.push(`year = ${f.year_from}`)
  }
  if (f.decade) parts.push(`decade = ${f.decade}`)
  if (f.label_slug) parts.push(`label_slug = "${escape(f.label_slug)}"`)
  if (f.artist_slug) parts.push(`artist_slug = "${escape(f.artist_slug)}"`)
  if (f.genres && f.genres.length) {
    parts.push(`(${f.genres.map(g => `genres = "${escape(g)}"`).join(" OR ")})`)
  }
  if (f.sale_mode) parts.push(`sale_mode = "${escape(f.sale_mode)}"`)
  if (f.for_sale) parts.push(`is_purchasable = true`)
  if (f.has_cover !== undefined) parts.push(`has_cover = ${f.has_cover}`)
  if (f.in_stock) parts.push(`in_stock = true`)
  return parts
}

function buildSort(sort?: string): string[] {
  switch (sort) {
    case "year_asc":   return ["year:asc"]
    case "year_desc":  return ["year:desc"]
    case "price_asc":  return ["effective_price:asc"]
    case "price_desc": return ["effective_price:desc"]
    case "title_asc":  return ["title:asc"]
    case "artist_asc": return ["artist_name:asc"]
    case "newest":     return ["updated_at:desc"]
    default:           return []
  }
}

export async function searchReleases(params: CatalogSearchParams) {
  const client = getMeiliClient()
  const indexName = (params.ranking === "discovery")
    ? DISCOVERY_INDEX
    : COMMERCE_INDEX
  const index = client.index(indexName)

  const limit = Math.min(100, params.limit ?? 24)
  const offset = ((params.page ?? 1) - 1) * limit

  const searchParams: SearchParams = {
    limit,
    offset,
    filter: buildFilterString(params.filters),
    sort: buildSort(params.sort),
    facets: params.facets,
    attributesToHighlight: params.highlight
      ? ["artist_name", "title", "label_name"]
      : [],
    highlightPreTag: "<mark>",
    highlightPostTag: "</mark>",
  }
  return index.search(params.query || "", searchParams)
}
```

### 5.4 Endpoint `/store/catalog/route.ts` mit Runtime-Fallback

Statt ~300 Zeilen Knex-Bauerei wird der Endpoint auf ~100 Zeilen reduziert, mit explizitem `try/catch` um die Meili-Query:

```typescript
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as Sentry from "@sentry/node"
import { Knex } from "knex"
import { getFeatureFlag } from "../../../lib/feature-flags"
import { isMeiliEffective } from "../../../lib/meilisearch"
import { searchReleases } from "../../../lib/release-search-meili"
import { catalogGetPostgres } from "./route-postgres-fallback"  // umbenannt

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const q = req.query as Record<string, string>

  // Gate 1: Feature-Flag im Operator-Willen on?
  const flagOn = await getFeatureFlag(pg, "SEARCH_MEILI_CATALOG")
  if (!flagOn) {
    return catalogGetPostgres(req, res)
  }

  // Gate 2: Effective-Flag (Health-Probe). Wenn Meili tripped ist, Postgres
  // sofort, ohne erst die Meili-Query zu versuchen (spart Latenz).
  if (!isMeiliEffective()) {
    console.log(JSON.stringify({
      event: "meili_fallback",
      reason: "health_tripped",
      query: q.search,
    }))
    return catalogGetPostgres(req, res)
  }

  // Gate 3: Try Meili, Fall through auf Postgres bei Runtime-Error
  try {
    const result = await searchReleases({
      query: q.search,
      ranking: (q.ranking === "relevance") ? "discovery" : "commerce",
      filters: {
        format: q.format,
        format_group: q.category,
        country: q.country,
        country_code: q.country_code,
        year_from: q.year_from ? Number(q.year_from) : undefined,
        year_to:   q.year_to   ? Number(q.year_to)   : undefined,
        decade: q.decade ? Number(q.decade) : undefined,
        label_slug: q.label_slug,
        artist_slug: q.artist_slug,
        genres: q.genre ? [q.genre] : undefined,
        for_sale: q.for_sale === "true",
      },
      sort: mapLegacySort(q.sort, q.order),
      page: q.page ? Number(q.page) : 1,
      limit: q.limit ? Number(q.limit) : 24,
      facets: ["format_group", "decade", "country_code",
               "product_category", "genres", "styles"],
    })

    res.json({
      releases: result.hits.map(toLegacyShape),
      total: result.estimatedTotalHits,
      facets: result.facetDistribution,
      page: Number(q.page || 1),
      limit: result.limit,
      pages: Math.ceil((result.estimatedTotalHits ?? 0) / result.limit),
    })
  } catch (err: any) {
    // Structured Log fuer Aggregation
    console.error(JSON.stringify({
      event: "meili_runtime_fallback",
      error: err?.message,
      query: q.search,
      filters: q,
    }))
    // Sentry-Capture mit fingerprint damit aehnliche Errors gruppiert werden
    Sentry.captureException(err, {
      fingerprint: ["meili-runtime-error"],
      tags: { component: "catalog-search", path: req.path },
      extra: { query: q.search },
    })
    // Transparent fallback — User sieht keinen 5xx, nur Postgres-Ergebnisse
    return catalogGetPostgres(req, res)
  }
}

// mapLegacySort + toLegacyShape wie im Original-Skelett
```

**Wichtig:**
- `route-postgres-fallback.ts` = Umbenennung der heutigen `/store/catalog/route.ts` zu einer exported Function `catalogGetPostgres`. Sie bleibt der bewaehrte Postgres-FTS-Code, in Phase 1 unveraendert.
- Sentry muss bereits konfiguriert sein. Falls nicht: Phase-0 Schritt "Sentry-DSN setzen + initialisieren" hinzufuegen. Wenn Robin Sentry nicht nutzt, durch eigene Audit-Tabelle ersetzen — aber Strukturlog bleibt.
- Effective-Flag wird per `isMeiliEffective()` gelesen, NICHT direkt aus dem in-memory Modul-State (Stub-bar fuer Tests).

### 5.5 Mapping-Hilfsfunktion `toLegacyShape`

Storefront-Komponenten erwarten Field-Names wie `coverImage` (camelCase), `artist_name` etc. Meilisearch-Doc nutzt durchgaengig snake_case. Re-Mapper:

```typescript
function toLegacyShape(hit: any) {
  return {
    id: hit.release_id,
    title: hit.title,
    slug: hit.release_id,
    format: hit.format,
    format_id: hit.format_id,
    product_category: hit.product_category,
    year: hit.year,
    country: hit.country,
    coverImage: hit.cover_image,
    catalogNumber: hit.catalog_number,
    article_number: hit.article_number,
    legacy_price: hit.legacy_price,
    direct_price: hit.direct_price,
    legacy_available: hit.legacy_available,
    auction_status: hit.auction_status,
    sale_mode: hit.sale_mode,
    artist_name: hit.artist_name,
    artist_slug: hit.artist_slug,
    label_name: hit.label_name,
    label_slug: hit.label_slug,
    press_orga_name: hit.press_orga_name,
    press_orga_slug: hit.press_orga_slug,
    format_name: hit.format_name,
    format_group: hit.format_group,
    effective_price: hit.effective_price,
    is_purchasable: hit.is_purchasable,
    _highlight: hit._formatted,
  }
}
```

### 5.6 Endpoints-Mapping-Tabelle

| Endpoint heute | Phase-1-Status | Phase-2-Status |
|---|---|---|
| `/store/catalog` GET | Meili (commerce) mit Runtime-Fallback | Meili |
| `/store/catalog/suggest` GET | Meili (discovery, limit=8 + Highlight) | Meili |
| `/store/catalog/facets` GET | Postgres bleibt | Meili-Facetten |
| `/store/catalog/:id` GET | **Postgres bleibt** — Detail-View braucht Joins (Tracks, Images, Related) | Postgres bleibt |
| `/store/labels/suggest` GET | **NEU** — Postgres direkt auf `Label`-Tabelle | Optional eigener Meili-Index |
| `/admin/erp/inventory/search` GET | Postgres FTS bleibt (Phase 1) | Meili (discovery) mit Filter `cohort_a OR exemplar_count>0` |
| `/admin/media` GET (mit q-Parameter) | Postgres FTS bleibt (Phase 1) | Meili (discovery) — Filter-Teil hybrid |

---

## 6. Storefront-UX-Verbesserungen die jetzt moeglich werden

Nach Migration koennen folgende UX-Verbesserungen rein-additiv im Storefront landen, ohne weitere Backend-Aenderungen:

### 6.1 Empfohlene Phase-1-Picks

1. **Live-Counts im Filter-Sidebar.** Die `facetDistribution` aus Meili-Response zeigt fuer jede Facette die Treffer-Zahl im aktuellen Result-Set. Beispiel: User hat `format_group=vinyl` ausgewaehlt → Sidebar zeigt "Germany (1,234)", "USA (892)" usw. **Hoechster UX-Win.**
2. **"Did you mean"-Vorschlag bei leeren Result-Sets.** Wenn `estimatedTotalHits=0`, zweiter Meili-Call mit hoeherer Typo-Tolerance + Vorschlag im UI. **Verhindert Sackgassen.**
3. **Highlight-Snippets in Treffern.** `_formatted.artist_name = "<mark>Cabaret</mark> Voltaire"` direkt im Storefront rendern. **Macht Suche fuehlbar.**

### 6.2 Phase-2-Picks (optional / Backlog)

4. **Instant-Search-as-you-type.** Erfordert Direct-Browser-Tenant-Token.
5. **"Sort by"-Selector mit Live-Update** (Relevanz, Preis auf+ab, Jahr auf+ab, Newly-added).
6. **"Sort by Availability / Sort by Relevance"-Toggle** (waehlt zwischen `commerce` und `discovery` Profile aus §4.1).
7. **Negativ-Filter** (`-format=CD`).
8. **Genre-Browse-Page** `/genre/industrial`.
9. **Label-Facette mit Top-20-Counts** via `facetSearch` API (Phase-2 falls UX-Feedback es will).

Robins Empfehlung: **Phase-1-Picks 1+2+3 sofort mitlaunchen**. Phase-2-Picks nach 2-4 Wochen Live-Betrieb wenn Meili stabil ist.

---

## 7. Operational Concerns

### 7.1 Wo laeuft Meili — selber VPS, Docker

VPS hat ~16 GB RAM. Aktuelle PM2-Services-Belegung (geschaetzt):
- vodauction-backend (`max_memory_restart: 500M`)
- vodauction-storefront (Next.js, ~600 MB)
- Service_Overview (~150 MB)
- tape-mag-migration (~150 MB)
- VOD_Fest WordPress (~400 MB inkl. PHP-FPM)
- Postgres (managed bei Supabase, lokal nichts)
- nginx (~50 MB)

Total ~1.8 GB committed. Headroom > 10 GB. Meilisearch mit 1.5 GB Cap passt komfortabel.

**Setup: Docker-Compose** (nicht PM2):
- Meili wird als single-binary Docker-Image distributed
- Docker macht Volume-Mount fuer LMDB-Storage trivial
- Healthcheck und Restart-Policy native
- Robin nutzt Docker bereits fuer Microinvest und VOD_Fest

### 7.2 docker-compose.meili.yml mit hartem Memory-Cap

**Wichtig: `mem_limit` + `memswap_limit` statt `deploy.resources.limits.memory`.**

`deploy.resources.limits.memory` ist **nur in Docker Swarm Mode wirksam**. In Standalone-Docker (was wir betreiben) wird es ohne Warnung ignoriert. Stattdessen muss `mem_limit` und `memswap_limit` (gleicher Wert) auf der Service-Ebene gesetzt werden — das ist die kgroup-basierte Hard-Limit-Form, die Docker auch ohne Swarm respektiert. Ohne `memswap_limit` koennte Meili die Limit-Ueberschreitung in Swap eskalieren.

```yaml
services:
  meilisearch:
    image: getmeili/meilisearch:v1.20
    container_name: vod-meilisearch
    restart: unless-stopped
    ports:
      - "127.0.0.1:7700:7700"  # nur localhost — kein public binding
    volumes:
      - /root/meilisearch/data:/meili_data
      - /root/meilisearch/dumps:/dumps
    environment:
      MEILI_MASTER_KEY: "${MEILI_MASTER_KEY}"
      MEILI_ENV: "production"
      MEILI_DB_PATH: "/meili_data"
      MEILI_DUMP_DIR: "/dumps"
      MEILI_NO_ANALYTICS: "true"
      MEILI_MAX_INDEXING_MEMORY: "1Gb"   # zweite Verteidigungslinie
      MEILI_HTTP_PAYLOAD_SIZE_LIMIT: "200MB"
      MEILI_LOG_LEVEL: "INFO"
    mem_limit: 1500m         # Hard-Limit, wirksam OHNE Swarm
    memswap_limit: 1500m     # gleicher Wert verhindert Swap-Eskalation
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7700/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

Start: `cd ~/VOD_Auctions && docker compose -f docker-compose.meili.yml up -d`

`MEILI_MASTER_KEY` wird einmalig generiert (`openssl rand -hex 32`), in 1Password ("VOD Meilisearch Master Key") gespeichert, in `~/VOD_Auctions/.env.meili` (gitignored) eingetragen.

Port 7700 binded **nur auf 127.0.0.1**, nicht 0.0.0.0. Damit ist Meili nur vom VPS aus erreichbar — kein Public-Access, kein Firewall-Aufwand. Backend ruft `http://127.0.0.1:7700` direkt an.

**Verifikations-Pflichtschritt in Phase 0** (siehe §10): nach Compose-Up muss `docker stats vod-meilisearch` waehrend eines `--full-rebuild` mit allen 52k Docs in beide Profile beobachtet werden — max RSS muss konstant <1.5GB bleiben. Wenn der Container das Limit reisst und nicht von Docker gekillt wird, greift `mem_limit` nicht und wir haben eine echte OOM-Risk fuer die anderen VPS-Services.

### 7.3 Speicher- und Disk-Budget

Bei 52k Docs mit avg ~2 KB JSON = ~100 MB Roh-Daten. Meili-Index inkl. Tokenization, Inverted-Index, Facetten-Cache ueberschlaegig 200-400 MB Disk **pro Profile**, also 400-800 MB Disk total. RAM bei warmem Index ~300-500 MB Idle pro Profile, Peak waehrend Re-Index bis 1 GB.

Cap auf 1.5 GB im docker-compose ist Safety-Net. `MEILI_MAX_INDEXING_MEMORY=1Gb` sagt Meili explizit "nutze nicht mehr als 1 GB beim Indexing". Ohne diese ENV nimmt Meili Default 2/3 of total RAM des Hosts (in Docker = 2/3 von 16 GB = 10 GB) und kann andere Services strangulieren — siehe Issue [meilisearch#4686](https://github.com/meilisearch/meilisearch/issues/4686).

### 7.4 Backup-Strategie

```bash
# Manueller Dump on-demand
curl -X POST -H "Authorization: Bearer $MEILI_MASTER_KEY" \\
  http://127.0.0.1:7700/dumps

# Cron taeglich 04:00 UTC
0 4 * * * curl -fsS -X POST \\
  -H "Authorization: Bearer $(cat ~/.meili-master-key)" \\
  http://127.0.0.1:7700/dumps && \\
  find /root/meilisearch/dumps -mtime +7 -delete
```

Restore via `meilisearch --import-dump /dumps/<file>.dump`. Dump-Files ~100-200 MB (beide Profile drin). 7 Tage Retention.

**Disaster-Recovery:** Wenn Meili-Index korrupt → kein Drama, weil Postgres ist Source of Truth. Recovery-Sequenz:
1. Container stoppen
2. `/root/meilisearch/data` wegrotieren
3. Container neu starten (frisches LMDB)
4. `python3 meilisearch_sync.py --apply-settings`
5. `python3 meilisearch_sync.py --full-rebuild`
6. Sync-Cron laeuft normal weiter

Total ~5 Min Downtime. Storefront faellt automatisch auf Postgres-FTS zurueck (Health-Probe trippt, siehe §5.2).

### 7.5 Monitoring

- **Service_Overview** (existing tool) bekommt einen neuen Eintrag in `services.config.json` der `http://127.0.0.1:7700/health` checked.
- **Sync-Log** schreibt nach `~/VOD_Auctions/scripts/meilisearch_sync.log`.
- **Drift-Log** schreibt nach `~/VOD_Auctions/scripts/meilisearch_drift.log` (siehe §11(d)).
- **Admin-Status-Page** `/app/sync` bekommt einen Tab "Meilisearch": Total docs indexed pro Profile, Last sync timestamp, Index size, Pending tasks, aktueller Effective-Flag-Status. Daten via `GET /stats` Meili-API + Endpoint `/admin/meili-status` der `isMeiliEffective()` ausliest.

### 7.6 Sicherheit

- Master-Key nur im Backend + in 1Password
- Admin-API-Key (separate, vom Master generated) fuer Sync-Script
- Search-Only-API-Key (separate) fuer eventuellen Direct-Browser-Access in Phase 2
- Port 7700 nicht public — Hostinger-Firewall bleibt unveraendert
- Logs anonymisieren: keine User-Queries in `meilisearch_sync.log`

---

## 8. Migration-Path (Phasen)

### Phase 0: Vorarbeit (kann parallel zum Pre-Launch laufen)

- [ ] Migration `2026-04-XX_release_search_indexed_at.sql` schreiben + auf Staging-DB anwenden, alle 3 Trigger validieren
- [ ] Bumps in `legacy_sync_v2.py` + `discogs_daily_sync.py` einbauen
- [ ] `docker-compose.meili.yml` lokal auf Robins Mac testen — Meili starten, manuell ein paar Docs pushen, Search funktioniert
- [ ] `scripts/meilisearch_sync.py` Skelett bauen, mit `--dry-run` gegen Staging-Supabase laufen lassen
- [ ] `scripts/meilisearch_settings.json` mit Settings aus §3.4 initial befuellen
- [ ] `scripts/meilisearch_drift_check.py` schreiben (siehe §11(d))
- [ ] Country-ISO-Mapping vervollstaendigen (`scripts/data/country_iso.py`)
- [ ] `backend/src/lib/meilisearch.ts` (Client + Health-Probe) + `release-search-meili.ts` schreiben, Unit-Tests mit Meili-Mock
- [ ] **Compose-Memory-Limit verifizieren** — `docker stats vod-meilisearch` waehrend `--full-rebuild` mit 52k Docs in beiden Profilen, max RSS muss <1.5GB bleiben. Wenn nicht: Limit greift nicht, OOM-Risk fuer andere Services. Abbruch bis behoben.
- [ ] Acceptance-Kriterium: Meili laeuft lokal, Sync-Script kann Backfill in beide Profile, Test-Endpoint `/store/catalog?test_meili=1` liefert sinnvolle Treffer

**Aufwand:** 1.5 d

### Phase 1: Storefront on Meili (Soft-Launch)

- [ ] Meili auf VPS via docker-compose starten, `MEILI_MASTER_KEY` setzen
- [ ] Migration `2026-04-XX_release_search_indexed_at.sql` auf Production-DB anwenden (alle 52k Rows haben jetzt search_indexed_at = NULL)
- [ ] Initial-Backfill: `python3 meilisearch_sync.py --apply-settings && --full-rebuild` — laeuft 3-6 Min fuer beide Profile
- [ ] Cron-Jobs aktivieren (`*/5 * * * *` Delta-Sync, `0 3 * * *` Cleanup, `*/30 * * * *` Drift-Check)
- [ ] Feature-Flag `SEARCH_MEILI_CATALOG` registrieren in `feature-flags.ts` (default `false`)
- [ ] Backend deployen mit Meili-Client + Health-Probe + Routes-Refactor (alte Postgres-Logik bleibt als Fallback)
- [ ] **Akzeptanz-Test mit Flag OFF:** Identisches Verhalten wie heute, kein User merkt etwas
- [ ] **Operational Acceptance Tests durchspielen** (siehe §11) — alle 4 muessen pass sein vor Flag ON
- [ ] Flag in Admin-Config einschalten waehrend Robin live mitschaut
- [ ] **Akzeptanz-Test mit Flag ON:**
  - [ ] Top 10 Suchen aus den letzten 30 Tagen liefern aequivalente Top-3-Treffer
  - [ ] "music various" findet Vanity-Various-Release (heutiger Regression-Case)
  - [ ] "cabarte voltarie" (Typo) findet Cabaret Voltaire (NEU — heute leer)
  - [ ] `?for_sale=true&format=LP&decade=1980` Filter performt < 100 ms (heute > 200 ms)
  - [ ] facetDistribution liefert sinnvolle Counts (NEU — Sidebar nutzt es)
- [ ] UI-Komponente "Filter-Sidebar mit Live-Counts" aktivieren (Phase-1-Pick #1 aus §6)
- [ ] UI-Komponente "Did you mean" (Phase-1-Pick #2)
- [ ] UI-Komponente "Highlight in Treffern" (Phase-1-Pick #3)
- [ ] Catalog-Suggest-Endpoint (`/store/catalog/suggest`) ebenfalls auf Meili umstellen (discovery-Profile)
- [ ] `/store/labels/suggest` Endpoint hinzufuegen (Postgres-direkt, fuer Label-Suchpfad)

**Aufwand:** 1.5 d Backend + 0.5 d Storefront UI + 0.5 d Acceptance-Test

**Rollback-Plan:** Flag im Admin Off-schalten — Postgres-FTS uebernimmt sofort, kein Deploy noetig.

### Phase 2: Admin-Endpoints auf Meili

- [ ] `/admin/erp/inventory/search` umstellen — Meili (discovery), Barcode-Direct-Lookup bleibt Postgres
- [ ] `/admin/media` umstellen — Search-Teil auf Meili, Filter-Teil hybrid (Stocktake-Status, price_locked, warehouse_location bleiben Postgres)
- [ ] `/store/catalog/facets` umstellen — global facetDistribution
- [ ] Feature-Flag `SEARCH_MEILI_ADMIN` separat
- [ ] Phase-2-UX-Picks (Sort-Selector, Profile-Toggle, Label-Facette etc.) aus §6
- [ ] Suchlog-Capture-Pipeline → Synonym-Erweiterungs-Datengrundlage
- [ ] Circuit-Breaker via opossum als Polish (siehe §5.2)

**Aufwand:** 1.5 d

### Phase 3: Postgres-FTS abbauen oder als Fallback behalten

**Entscheidung kommt nach 2-4 Wochen Phase-2-Live-Betrieb.** Optionen:

- **A — Behalten als Fallback** (empfohlen): `Release.search_text` Spalte + GIN-Index bleiben. `release-search.ts` bleibt im Code. Health-Probe + Feature-Flag bleiben operative Notbremse. Kostet ~150 MB Disk im Postgres und einen Trigger pro Release-Mutation — vernachlaessigbar.
- **B — Komplett abbauen**: Migration `DROP COLUMN search_text`, Trigger droppen, `release-search.ts` loeschen. Spart Postgres-Disk + Trigger-CPU. Aber: kein Fallback mehr.

Robins Praeferenz aktuell: A. Wenn Meili 6 Monate ohne Incident laeuft, kann B kommen.

---

## 9. Aufwandsschaetzung & Risiken

### 9.1 Effort-Tabelle

| Phase | Backend | Sync-Script | Frontend | Ops/Setup | Total |
|---|---|---|---|---|---|
| 0 — Vorarbeit | 0.5 d | 0.5 d | 0 | 0.5 d (Compose-Verify) | 1.5 d |
| 1 — Storefront | 1 d | 0 | 0.5 d | 0.5 d | 2 d |
| 2 — Admin | 1 d | 0 | 0.5 d | 0 | 1.5 d |
| 3 — Cleanup | 0.25 d | 0 | 0 | 0.25 d | 0.5 d (optional) |

**Total Phase 0+1+2: ~5 Manntage**, parallelisierbar in 3 Kalendertagen wenn Robin fokussiert. Phase 3 spaeter optional.

### 9.2 Risiken & Mitigationen

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|---|---|---|---|
| Sync-Lag macht Suche stale | mittel | mittel | search_indexed_at + Trigger + Drift-Monitor (§11d) faengt es schnell |
| Index-Drift Postgres↔Meili | mittel | mittel | Cleanup-Cron + Drift-Monitor mit Schwellen + monatliche `--full-rebuild` |
| Search-Quality-Regression in Phase 1 | mittel | hoch | Flag-Gate + Health-Probe-Fallback + 10-Top-Queries-Acceptance-Test vor Aktivierung |
| Meili-OOM strangulated andere Services | niedrig | hoch | mem_limit + memswap_limit verifiziert in Phase 0 |
| Meili-Runtime-Error trifft User | mittel | mittel | try/catch in Route + transparenter Postgres-Fallback + Sentry-Aggregation |
| Synonym-Liste explodiert wartungsfrei | niedrig | niedrig | Konservative Startliste, datengetriebenes Wachstum (§3.6) |
| Two-Index-Strategy verdoppelt Speicher | hoch | niedrig | Bewusster Tradeoff fuer simplen Code, ~600 MB Disk ist verkraftbar |
| Discogs-Daily-Sync triggert Re-Index nicht | niedrig | niedrig | Trigger A + expliziter Bump im Script (defense-in-depth) |
| Direct-Artist-Rename ohne entity_content | niedrig | niedrig | Wird erst beim Cleanup-Run/Full-Rebuild korrigiert. Phase-2 ggf. zusaetzlicher Trigger auf Artist/Label/PressOrga |
| Meili-Lizenz-Aenderung in Zukunft | niedrig | mittel | MIT ist stabil, im Worst-Case Fork verfuegbar, Datenformat ist offen (LMDB) |
| LMDB-Korruption | sehr niedrig | mittel | Daily Dumps + 5-min-rebuilbar aus Postgres |

---

## 10. Was wir BEWUSST NICHT machen

- **Vector-Search / Semantic-Search.** Meili 1.x kann Hybrid-Search via OpenAI/Ollama-Embeddings. Eigenes Konzept-Doc spaeter.
- **LLM-Re-Ranker.** Latenz + Kosten. Spaeter.
- **Konversationelle Suche / Search-Chat.** Meili Cloud hat ein eingebautes Chat-UI. Wir sind self-hosted. Eigenes Thema (siehe AI-Assistant `/app/ai-chat`).
- **Federated Multi-Index** ueber `releases` + `artists` + `labels`. Spaeter.
- **Search-Analytics-Dashboard** (Top-Queries, 0-Hit-Queries). Eigene Pipeline (Backend logged Queries → eigene Tabelle → Admin-Dashboard) ist Phase 2/3. Bedingung fuer datengetriebene Synonym-Pflege.
- **Personalisierte Suche** (User-History-Boosts). Erfordert User-Tracking-Pipeline.
- **A/B-Testing fuer Ranking-Rules.** Heute zu wenig Traffic fuer Statistik.
- **Direct-Browser InstantSearch in Phase 1.** Kommt in Phase 2 wenn Backend-Proxy-Variante stabil ist.
- **Circuit-Breaker via opossum in Phase 1.** Phase-2-Polish.

---

## 11. Operational Acceptance Tests

Diese 4 Tests sind Pflicht VOR der ersten Aktivierung des Flags `SEARCH_MEILI_CATALOG` in Production. Alle muessen pass sein, dokumentiert in einem Run-Log (`docs/optimizing/MEILI_PHASE1_ACCEPTANCE.md`).

### 11(a) Meili-Timeout-Test — Runtime-Fallback wirkt

**Setup (auf VPS):**
```bash
sudo iptables -A OUTPUT -p tcp --dport 7700 -j DROP
sleep 30
sudo iptables -D OUTPUT -p tcp --dport 7700 -j DROP
```

**Erwartung:** Waehrend der 30 s blockierten Verbindung antwortet `/store/catalog?q=test` weiter mit Postgres-Ergebnissen. Storefront-Render funktioniert ohne sichtbare Stoerung (eventuell minimal langsamer).

**Pass-Kriterien:**
- 0× HTTP 5xx in den 30 s
- Mindestens ein Backend-Log-Eintrag mit `event=meili_runtime_fallback` ODER `event=meili_fallback, reason=health_tripped`
- Sentry-Issue mit fingerprint `meili-runtime-error` ist erstellt (oder bei wiederholten Errors: counter erhoeht)
- Health-Probe-Log zeigt `event=meili_health_tripped` nach 3 fails (~90 s wenn iptables-Block laenger bleibt)

**Recovery-Test:** Nach iptables-Removal automatischer Recovery innerhalb 60 s — naechster Health-Probe-Zyklus setzt Effective-Flag wieder auf true, erkennbar an Log-Eintrag `event=meili_health_recovered`. Naechster Catalog-Request geht wieder an Meili.

### 11(b) Stale-Index-Test — Trigger + Sync funktionieren

**Setup:** Eine Release-Row direkt manipulieren OHNE Trigger-Bump:

```sql
-- Disable Trigger temporaer um den Bump-Mechanismus zu simulieren-vermeiden
ALTER TABLE "Release" DISABLE TRIGGER release_indexed_at_self;

UPDATE "Release"
   SET title = 'ZZZ_TEST',
       search_indexed_at = NULL   -- manuell als "needs reindex" markieren
 WHERE id = 'legacy-release-12345';

ALTER TABLE "Release" ENABLE TRIGGER release_indexed_at_self;
```

**Wait:** ~6 Minuten (Sync-Cron-Interval von 5 Min + 1 Min Toleranz).

**Pass-Kriterien:**
- `meilisearch_sync.log` zeigt einen Sync-Run der "1 push, 0 unchanged" reportet
- Direkter Meili-Query: `curl -H "Authorization: Bearer $MEILI_ADMIN_API_KEY" http://127.0.0.1:7700/indexes/releases-commerce/documents/legacy-release-12345` → JSON enthaelt `"title": "ZZZ_TEST"`
- `/store/catalog?q=ZZZ_TEST` liefert die Row als Treffer

**Cleanup:** `UPDATE "Release" SET title = '<original>' WHERE id = 'legacy-release-12345'` — Trigger feuert, Sync zieht im naechsten Cron-Run nach.

**Failure-Path:** Wenn der Test fehlschlaegt, sollte spaetestens der naechste Drift-Monitor-Lauf (siehe §11d) das aufdecken — dann ist der Sync-Mechanismus broken, nicht nur dieser Test.

### 11(c) Rebuild-under-load — Storefront bleibt antwortfaehig

**Setup:**
- Terminal 1: `k6 run --vus 50 --duration 10m loadtest_catalog.js` mit Script das `/store/catalog?q=industrial&page=N` mit zufaelligem N=1..20 hits, ~50 RPS
- Terminal 2: `python3 meilisearch_sync.py --full-rebuild`
- Beide parallel laufen lassen

**Erwartung:** Production-Index `releases-commerce` antwortet weiter, Staging-Indizes werden parallel gebaut, dann atomic Swap. Im k6-Output kein Spike auf Postgres-Fallback.

**Pass-Kriterien:**
- 0× HTTP 5xx ueber 10 Min
- p95 Latenz < 500 ms
- p99 Latenz < 1500 ms (kurzer Spike beim Swap akzeptabel)
- 0 Logs mit `event=meili_runtime_fallback` (wenn Meili waehrend des Rebuilds Errors wirft, ist die Two-Index-Swap-Strategie kaputt)
- Backend-Log zeigt **keinen** Health-Probe-Trip
- Nach Rebuild: Drift-Monitor zeigt 0% Differenz

### 11(d) Drift-Detection — kontinuierlicher Monitor

**Cron alle 30 min:**
```bash
*/30 * * * * cd /root/VOD_Auctions/scripts && \\
  venv/bin/python3 meilisearch_drift_check.py >> meilisearch_drift.log 2>&1
```

**Script `scripts/meilisearch_drift_check.py`** (Skelett):

```python
#!/usr/bin/env python3
"""Drift-Check: vergleicht DB-Source-of-Truth vs Meili Index-Counts.
Schreibt Trend in meilisearch_drift_log Tabelle, alertet bei Schwellen-Brueche."""

import json, os, sys, time
import psycopg2, requests

PROFILES = ["commerce", "discovery"]
WARN_PCT = 0.5
CRITICAL_PCT = 2.0


def main():
    pg = psycopg2.connect(os.environ["SUPABASE_DB_URL"])
    cur = pg.cursor()
    cur.execute('SELECT COUNT(*) FROM "Release" WHERE "coverImage" IS NOT NULL')
    db_count = cur.fetchone()[0]

    headers = {"Authorization": f"Bearer {os.environ['MEILI_ADMIN_API_KEY']}"}
    base = os.environ.get("MEILI_URL", "http://127.0.0.1:7700")

    for profile in PROFILES:
        index = f"releases-{profile}"
        r = requests.get(f"{base}/indexes/{index}/stats",
                         headers=headers, timeout=10)
        r.raise_for_status()
        meili_count = r.json()["numberOfDocuments"]

        diff = abs(db_count - meili_count)
        diff_pct = (diff / db_count * 100) if db_count > 0 else 0
        severity = "ok"
        if diff_pct >= CRITICAL_PCT:
            severity = "critical"
        elif diff_pct >= WARN_PCT:
            severity = "warning"

        cur.execute(
            """INSERT INTO meilisearch_drift_log
                 (timestamp, profile, db_count, meili_count, diff_pct, severity)
               VALUES (NOW(), %s, %s, %s, %s, %s)""",
            (profile, db_count, meili_count, diff_pct, severity),
        )
        pg.commit()

        log_entry = {
            "event": "meili_drift_check",
            "profile": profile,
            "db_count": db_count,
            "meili_count": meili_count,
            "diff_pct": round(diff_pct, 3),
            "severity": severity,
        }
        print(json.dumps(log_entry))

        if severity == "warning":
            # Slack-Webhook (wenn konfiguriert)
            slack_url = os.environ.get("SLACK_OPS_WEBHOOK")
            if slack_url:
                requests.post(slack_url,
                    json={"text": f"Meili drift WARN ({profile}): {diff_pct:.2f}% ({diff} docs)"})
        elif severity == "critical":
            # Sentry-Alert
            sentry_dsn = os.environ.get("SENTRY_DSN")
            if sentry_dsn:
                import sentry_sdk
                sentry_sdk.init(sentry_dsn)
                sentry_sdk.capture_message(
                    f"Meili drift CRITICAL ({profile}): {diff_pct:.2f}% ({diff} docs)",
                    level="error",
                )

    cur.close()
    pg.close()


if __name__ == "__main__":
    main()
```

**Tabelle `meilisearch_drift_log` (Migration):**

```sql
CREATE TABLE IF NOT EXISTS meilisearch_drift_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  profile TEXT NOT NULL,
  db_count INTEGER NOT NULL,
  meili_count INTEGER NOT NULL,
  diff_pct NUMERIC(5,3) NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('ok', 'warning', 'critical'))
);

CREATE INDEX idx_meili_drift_log_timestamp ON meilisearch_drift_log(timestamp DESC);
```

**Schwellen bei 52k Docs:**
- < 0.5 % (= < 260 Docs Differenz) → ok (Sync-Lag, kein Alert)
- 0.5 – 2 % (260 – 1040 Docs) → warning (Slack-Notification an Robin)
- > 2 % (> 1040 Docs) → critical (Sentry-Alert + manuelle Intervention)

**Trend-Analyse:** Tabelle wird in Admin-Status-Page als Chart der letzten 24 h gerendert (Phase-2-Polish). Trend-spezifische Probleme (z.B. monoton wachsende Drift) sind frueher sichtbar als Single-Sample-Werte.

---

## 12. Risiken nach Revision

Was nach v2 noch offen ist:

1. **Two-Index-Strategy verdoppelt Speicher** — bewusster Tradeoff fuer simpleren Code. Bei 600 MB Disk im 16-GB-RAM-VPS unproblematisch, aber wenn der Katalog auf > 200k Docs waechst sollte die per-query Ranking-Override neu evaluiert werden (Meili 1.x hat das experimentell, in stabiler API ggf. erst spaeter verlaesslich).
2. **Synonym-Liste muss nach Soft-Launch wachsen** — die initiale Liste ist deliberately sparse. Erwartet ist dass User-Suchen mit 0 Treffern ein Treiber fuer Erweiterungen sind. Suchlog-Capture-Pipeline ist aber Phase-2 — bis dahin "ad-hoc Erweiterung wenn Robin selbst auf Luecken stoesst".
3. **Direct-Artist-Rename in `Artist`-Tabelle** triggert kein Re-Index. Workaround: `entity_content`-Pfad nutzen oder Trigger ergaenzen (Phase-2).
4. **Phase-2-Items nicht in Phase 1:** Label-Facette (Top-N via facetSearch), Search-Analytics-Pipeline, Direct-Browser InstantSearch, "Sort by Availability/Relevance"-UI-Toggle, Circuit-Breaker via opossum, Admin-Endpoints auf Meili.
5. **Drift-Monitor reagiert auf Counts, nicht auf Content** — wenn Meili exakt die richtige Anzahl Docs hat, aber 100 davon haben veraltete Felder, faellt das nicht auf. Mitigation: monatliche `--full-rebuild` als Hygiene plus Hash-Diff im Sync-Script.
6. **Compose-Memory-Limit-Verifikation muss real durchgefuehrt werden** — nicht nur konfiguriert. Phase 0 enthaelt den Schritt explizit, aber wenn er uebersprungen wird, schlaegt das Limit moeglicherweise nicht durch (Kernel-config-abhaengig auf manchen Hostingern).
7. **Sentry-Abhaengigkeit** — der Runtime-Fallback nutzt Sentry zur Aggregation. Falls VOD heute kein Sentry hat, muss das in Phase 0 mit-erledigt werden (oder durch eigene Audit-Tabelle ersetzt). Strukturlog bleibt unabhaengig davon.
8. **Wait-for-Task-Timeouts hardcoded auf 60 s** — fuer Document-Batches bei 1000-er Batch-Size aktuell ausreichend (Meili 1.x indexed ~10k Docs/s). Bei groesseren Batches oder schwaecheren Hosts ggf. anpassen.

---

## 13. Naechste Schritte

1. Robin liest, gibt Feedback / approvt v2.
2. Phase 0 ausfuehren (lokal + Compose-Verify, 1.5 Tag, kein Deploy).
3. Linear-Issue anlegen (vmtl. unter RSE-78 als Sub-Task oder eigenes Issue), Effort 5 Tage, Prio nach Pre-Launch.
4. Nach Pre-Launch (Plattform `live`-Mode aktiv) Phase 1 ausrollen — alle 4 Operational Acceptance Tests durchspielen vor Flag ON.
5. CHANGELOG-Entry pro Phase. GitHub Release `vX.X.X-rcXX` pro abgeschlossener Phase.

---

**Verweise:**
- `backend/src/lib/release-search.ts` — heutiger Postgres-FTS-Helper
- `backend/scripts/migrations/2026-04-22_release_search_text_fts.sql` — heutige FTS-Spalte + Trigger
- `backend/scripts/migrations/2026-04-22_search_trigram_indexes.sql` — Trigram-Indizes (bleiben in Phase 1+2 als Fallback)
- `docs/optimizing/CATALOG_SEARCH_FIXES_2026-04-22.md` — Vorgeschichte, Multi-Word-Bug
- `docs/architecture/DEPLOYMENT_METHODOLOGY.md` — Deploy-early-activate-when-ready Pattern (Feature-Flag-Gate)
- `scripts/legacy_sync_v2.py` — Stilvorlage fuer den neuen `meilisearch_sync.py`
