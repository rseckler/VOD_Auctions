# Catalog Search Migration auf Meilisearch

**Version:** 1.0
**Erstellt:** 2026-04-22
**Autor:** Robin Seckler
**Status:** Konzept — noch nicht implementiert. Geplant fuer kurz nach Pre-Launch.
**Bezug:** `release-search.ts`, Migration `2026-04-22_release_search_text_fts.sql`, `2026-04-22_search_trigram_indexes.sql`, `CATALOG_SEARCH_FIXES_2026-04-22.md`, `DEPLOYMENT_METHODOLOGY.md`

---

## 0. TL;DR

- **Engine:** Meilisearch 1.x self-hosted, single-node Docker auf dem bestehenden Hostinger VPS, RAM-Cap 1.5 GB.
- **Sync:** Python-Script `scripts/meilisearch_sync.py` analog zu `legacy_sync_v2.py`. Initial-Backfill ueber alle ~52k Releases einmalig, danach Delta-Sync alle 5 Min via Cron, getriggert ueber neue Spalte `Release.indexed_at` vs. `Release.updatedAt`.
- **Backend-Proxy, kein Direct-Browser-Access:** Alle Suchanfragen laufen weiterhin durch den Medusa-Backend (`/store/catalog`, `/admin/erp/inventory/search` etc.). Backend uebersetzt Query → Meilisearch-Aufruf, mappt Antwort. Vorteile: bestehende CORS/Rate-Limit-Logik bleibt, kein zweites Public Secret zu rotieren, Postgres-Fallback per Feature-Flag moeglich.
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
- **Synonyme fehlen komplett.** `industrial` ↔ `noise` ↔ `power-electronics` muss heute der User selbst wissen.
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
| **Lizenz** | MIT | GPLv3 (server), Apache (clients) | proprietaer SaaS | Server Side Public License (ES) / Apache (OpenSearch) |
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
| **Deutsche Doku** | nein, EN gut | EN gut | DE+EN | EN gut |
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

### 3.1 Ein Index `releases`

Wir bauen genau einen Index. Artists und Labels werden NICHT separat indiziert — sie sind als Felder im Release-Dokument enthalten und ueber `searchableAttributes` durchsuchbar. Damit bleibt der Storefront-Suggest weiterhin "ein Roundtrip pro Tastendruck", und wir vermeiden Federated-Search-Komplexitaet.

Wenn spaeter mal eine eigene Artist-/Label-Browsing-Page mit eigener Search noetig wird, kommt ein zweiter Index. Heute: Overkill.

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

- **`release_id` zusaetzlich zu `id`** weil Meilisearch das `id`-Feld special behandelt (muss alphanumerisch + Unterstrich + Bindestrich sein) und wir den Schluessel auch als Filterable-Attribute brauchen. Doppelt gespeichert, ~30 Bytes pro Doc Overhead.
- **`format_group`** ist die VOD-Kategorisierung (`vinyl`, `tapes`, `cd`, `vhs`, `band_literature`, `label_literature`, `press_literature`) — gemappt aus `Format.kat` + Discogs-Format. Spart in jeder Filter-Query die `Format.kat`-JOIN-Logik die heute in `/store/catalog/route.ts` lebt.
- **`decade`** als zusaetzliche Spalte — Meilisearch kann zwar `year >= 1980 AND year <= 1989` filtern, aber als Facette ("Welche Dekaden gibt es im Result-Set?") ist `decade` als enum-aehnlicher Wert viel effizienter als ein numerischer Range-Facet.
- **`country_code`** ISO-2 — aktuell hat das Postgres-Schema nur `country` als Free-Text Englisch (mit Tippfehlern und Aliase). Backfill-Mapping: deutscher Name → englischer Name (existiert in `route.ts:COUNTRY_ALIASES`) → ISO-2. Code in `scripts/meilisearch_sync.py`. Damit kann das Frontend country-Flags rendern.
- **`has_cover`, `has_price`, `is_purchasable`, `in_stock`, `cohort_a`** — explizite Booleans statt Computed-At-Query-Time. Ohne diese muessten wir `has_cover` als `cover_image NOT NULL`-Filter ausdruecken — Meilisearch unterstuetzt das via `EXISTS` Filter, aber explicit Boolean ist robuster und schneller.
- **`exemplar_count`, `verified_count`, `in_stock`** kommen aus `erp_inventory_item` (Aggregat per Release). Damit Inventur-Search im Admin direkt aus Meilisearch rendern kann (Phase 2).
- **`popularity_score`** als 0-Platzhalter heute. Vorbereitung: spaeter aus `transaction`-Aggregaten + `bid`-Counts ableitbar (Re-Compute via Cron, ueberschreibt nur dieses Feld).
- **`indexed_at`** = unix-timestamp wann das Doc zuletzt von uns nach Meili geschoben wurde. Laesst sich von `updated_at` (= `Release.updatedAt`) unterscheiden, sodass Delta-Sync entscheiden kann "Doc hat sich geaendert seit indexed_at".
- **`updated_at`** als Sortable-Field — fuer "Newly added" Rendering.

### 3.3 Was bleibt in Postgres als Source of Truth

Alles. Meilisearch ist read-only Cache. Postgres bleibt Source of Truth fuer:
- Trigger-Logik (price_locked, sync_change_log)
- Joins gegen `auction_block`, `block_item`, `bid`, `transaction`
- Detail-Views (`/store/catalog/:id` rendert weiterhin direkt aus Postgres, kein Meili-Fetch)
- Alle Mutationen (POST/PATCH/DELETE)
- Reporting / Customer-Stats / Audit-Logs

Meilisearch gibt nur die `id`-Liste + denormalisierte Felder fuer Listen-Rendering zurueck. Die Idee: Meili ersetzt den Search-WHERE-Clause + die LeftJoins fuer Listen-Display, mehr nicht.

### 3.4 Settings-JSON

```json
{
  "primaryKey": "id",

  "searchableAttributes": [
    "artist_name",
    "title",
    "label_name",
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

  "rankingRules": [
    "words",
    "typo",
    "proximity",
    "attribute",
    "sort",
    "exactness",
    "in_stock:desc",
    "has_cover:desc",
    "cohort_a:desc",
    "is_purchasable:desc",
    "popularity_score:desc"
  ],

  "stopWords": [
    "the", "a", "an", "and", "of", "for", "with",
    "der", "die", "das", "und", "oder", "fuer", "mit", "von"
  ],

  "synonyms": {
    "industrial": ["power electronics", "noise", "death industrial", "rhythmic noise"],
    "power electronics": ["industrial", "harsh noise"],
    "noise": ["industrial", "harsh noise", "power electronics"],
    "ambient": ["drone", "dark ambient", "isolationist"],
    "drone": ["ambient", "minimalism"],
    "techno": ["electronic", "edm"],
    "ebm": ["electronic body music", "industrial dance"],
    "vinyl": ["lp", "record"],
    "lp": ["vinyl", "record"],
    "tape": ["cassette"],
    "cassette": ["tape", "mc"],
    "ger": ["germany", "deutschland", "de"],
    "uk": ["united kingdom", "great britain", "england"],
    "usa": ["united states", "us", "america"],
    "jp": ["japan"]
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
    "maxValuesPerFacet": 200,
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

- **`searchableAttributes`-Reihenfolge** ist zugleich Attribute-Ranking (`attribute`-Rule). Artist-Treffer ranken vor Title-Treffer, Title vor Label, Label vor CatNo. Spiegelt die heutige `CASE WHEN`-Heuristik.
- **`disableOnAttributes` fuer CatNo/Article-Number** weil Typo-Tolerance auf "WAX-001" → "WAX-002" unerwuenscht ist. CatNo ist Identifier, kein Sprachfeld.
- **Custom Ranking Rules nach `exactness`**: erst die fuenf Standard-Rules (Relevanz), dann Boosts. Reihenfolge ist intentional — `in_stock:desc` boostet within-relevance, ueberschreibt sie nicht.
- **`maxTotalHits: 5000`** — wir wollen keine Crawler die 50k Pages durchpaginieren. Browser-Pagination cap bei Page 209 (5000/24).
- **Stop-Words DE+EN** — gemischter Katalog. Keine japanischen Stop-Words noetig (charabia macht das richtig).

### 3.5 Index-Aliase

Wir nutzen Index-Swap: produktiver Index heisst `releases`, beim Re-Index schreiben wir nach `releases_staging`, dann atomarer Swap via `POST /swap-indexes`. Damit ist Reindex zero-downtime.

---

## 4. Sync-Strategie Postgres → Meilisearch

### 4.1 Zwei Operationsmodi

1. **Initial-Backfill** (einmalig): `python3 meilisearch_sync.py --full-rebuild` — laedt alle ~52k Releases als Batch nach Meili, swap nach erfolgreichem Indexing. Laufzeit erwartet 1-3 Minuten.
2. **Delta-Sync** (alle 5 Min via Cron): `python3 meilisearch_sync.py` — laedt nur Releases mit `updated_at > indexed_at` ODER ohne Eintrag im Tracking-Table. Erwartet < 100 Docs pro Run unter Normalbetrieb, < 5 s.

### 4.2 Aenderungs-Tracking

Wir brauchen kein neues Tabelle. Trick: ein `meilisearch_index_state` mit einer einzigen Row pro Release:

```sql
CREATE TABLE IF NOT EXISTS meilisearch_index_state (
  release_id TEXT PRIMARY KEY,
  indexed_at TIMESTAMPTZ NOT NULL,
  doc_hash TEXT NOT NULL
);
CREATE INDEX idx_meili_state_indexed_at ON meilisearch_index_state(indexed_at);
```

`doc_hash` = SHA-256 ueber das serialisierte Doc-JSON. Damit detektieren wir: hat sich am gerenderten Doc wirklich was geaendert (vs. nur ein `updatedAt`-Bump weil ein Cron-Job den Sync-Trigger zog). Spart in 80% der Faelle die Meili-Push-Operation.

Delta-Query:

```sql
-- Releases die sich seit letztem Index aendern oder neu sind
SELECT r.id
FROM "Release" r
LEFT JOIN meilisearch_index_state s ON s.release_id = r.id
WHERE s.release_id IS NULL
   OR r."updatedAt" > s.indexed_at;
```

Alternative betrachtet und verworfen: **Postgres LISTEN/NOTIFY** auf einer Trigger-Funktion. Vorteil: realtime statt 5-min-Delay. Nachteil: erfordert einen persistent connecteten Sync-Worker, robust gegen Restart bauen, Connection-Drops handeln. Fuer Phase 1 zu komplex. Wenn 5-min-Delay UX-Schmerz macht, zweite Phase.

### 4.3 Edge-Cases

| Case | Behandlung |
|---|---|
| Release neu inserted | Delta-Query findet (kein State-Eintrag) → push, Eintrag erzeugt |
| Release-Felder geaendert (price, title, ...) | `updatedAt` bumped → Delta-Query findet → re-push, Hash vergleicht |
| Release "geloescht" (legacy_available=false) | Bleibt im Index, aber `is_purchasable=false`. Soft-delete-Pattern. |
| Release hard-deleted (kommt praktisch nie vor) | Sync-Run cleant alle State-Eintraege ohne Release-Existenz, sendet `delete-batch` an Meili. Lauft nur 1× pro Tag (`--cleanup` flag). |
| Artist-Name geaendert | `Release.updatedAt` aendert sich NICHT. **Loesung:** Sync-Script pollt zusaetzlich `Artist.updatedAt > MAX(indexed_at)` und re-indexed alle Releases dieses Artists. Gleich fuer Label, PressOrga. |
| Image-Upload | `Release.coverImage` wird beim Image-Upload (R2-Pipeline) gesetzt → `Release.updatedAt` bumped vom Trigger → Delta-Query findet. |
| Sync-Lag in groesseren Batches | Initial-Backfill via `add-documents-in-batches` (z.B. 1000 Docs pro Batch), kein Block. |
| Meili-Server unreachable | Sync-Script faellt mit Exit 1, Cron-Run macht Logging, naechster Cron-Run versucht erneut. Storefront kriegt nichts mit (Postgres Fallback aktiv falls Feature-Flag). |
| Doc-Hash-Drift (Migration aendert serialisierung) | `--full-rebuild` flag drueckt alle States, indexed alles neu. |
| Image hat noch nicht hochgeladen aber Release schon | `has_cover=false`, kein Problem. Naechster Sync nach Upload korrigiert. |
| Discogs-Preise-Update via `discogs_daily_sync.py` | bumpt `Release.updatedAt`? **Pruefen — wenn nein, Trigger ergaenzen oder Sync-Script auf zusaetzliche `discogs_*`-Spalten pollen lassen.** |

### 4.4 Python-Script-Skelett

```python
#!/usr/bin/env python3
"""
Meilisearch Sync — Postgres → Meilisearch.

Modes:
  python3 meilisearch_sync.py                  # Delta-Sync
  python3 meilisearch_sync.py --full-rebuild   # Index-Swap (alle Docs neu)
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
import uuid
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests

SCRIPT_VERSION = "meilisearch_sync.py v1.0.0"

# Mirror der `route.ts:COUNTRY_ALIASES` als ISO-Map
COUNTRY_TO_ISO = {
    "Germany": "DE", "United States": "US", "United Kingdom": "GB",
    "Japan": "JP", "France": "FR", "Italy": "IT", "Netherlands": "NL",
    "Belgium": "BE", "Sweden": "SE", "Norway": "NO", "Switzerland": "CH",
    # ... full list in scripts/data/country_iso.py
}

INDEX_NAME = "releases"
STAGING_INDEX = "releases_staging"
BATCH_SIZE = 1000


def get_pg_conn(url_override=None):
    db_url = url_override or os.getenv("SUPABASE_DB_URL")
    if not db_url:
        sys.exit("ERROR: SUPABASE_DB_URL not set")
    return psycopg2.connect(db_url)


def get_meili_url():
    return os.getenv("MEILI_URL", "http://127.0.0.1:7700")


def get_meili_admin_key():
    return os.getenv("MEILI_ADMIN_API_KEY")


def meili_request(method, path, json_body=None, url_override=None):
    base = url_override or get_meili_url()
    headers = {
        "Authorization": f"Bearer {get_meili_admin_key()}",
        "Content-Type": "application/json",
    }
    r = requests.request(method, f"{base}{path}", headers=headers,
                         json=json_body, timeout=30)
    r.raise_for_status()
    return r.json() if r.content else {}


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
    """Map DB-row → Meilisearch-Document gemaess §3.2 Schema."""
    legacy = float(row["legacy_price"]) if row["legacy_price"] else None
    direct = float(row["direct_price"]) if row["direct_price"] else None
    effective = legacy if legacy and legacy > 0 else (direct if direct and direct > 0 else None)
    has_price = effective is not None and effective > 0
    is_purchasable = has_price and bool(row["legacy_available"])

    # Format-Group: aus Format.kat (legacy) oder Discogs-Enum (`r.format`)
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

    doc = {
        "id": row["id"].replace("-", "_"),  # Meili erlaubt nur a-z0-9_-
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
        "exemplar_count": int(row["exemplar_count"] or 0),
        "verified_count": int(row["verified_count"] or 0),
        "in_stock": int(row["exemplar_count"] or 0) > 0,
        "cohort_a": legacy is not None and legacy > 0,
        "popularity_score": 0,
        "indexed_at": int(time.time()),
        "updated_at": int(row["updated_at"].timestamp()) if row["updated_at"] else 0,
    }
    return doc


def doc_hash(doc):
    """SHA-256 ohne `indexed_at` (sonst aendert sich Hash bei jedem Sync)."""
    copy = {k: v for k, v in doc.items() if k != "indexed_at"}
    return hashlib.sha256(
        json.dumps(copy, sort_keys=True, default=str).encode()
    ).hexdigest()


def push_batch(docs, dry_run=False):
    if not docs:
        return None
    if dry_run:
        print(f"  [dry-run] would push {len(docs)} docs")
        return None
    return meili_request("POST", f"/indexes/{INDEX_NAME}/documents", docs)


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
    pg_conn.commit()
    cur.close()


def delta_sync(pg_conn, dry_run=False):
    """Findet neue + geaenderte Releases, indexed sie nach Meili."""
    where = """
        WHERE NOT EXISTS (
            SELECT 1 FROM meilisearch_index_state s
            WHERE s.release_id = r.id AND s.indexed_at >= r."updatedAt"
        )
        OR EXISTS (
            -- Artist-Rename triggert Re-Index aller Releases dieses Artists
            SELECT 1 FROM "Artist" a2
            JOIN meilisearch_index_state s2 ON s2.release_id = r.id
            WHERE a2.id = r."artistId" AND a2."updatedAt" > s2.indexed_at
        )
    """
    rows = fetch_release_rows(pg_conn, where)
    print(f"Delta candidates: {len(rows)}")

    # Hash-Filter — nur wirklich geaenderte Docs durchschieben
    cur = pg_conn.cursor()
    cur.execute("SELECT release_id, doc_hash FROM meilisearch_index_state")
    existing_hashes = dict(cur.fetchall())
    cur.close()

    docs_to_push = []
    for row in rows:
        doc = transform_to_doc(row)
        new_hash = doc_hash(doc)
        if existing_hashes.get(row["id"]) != new_hash:
            docs_to_push.append(doc)
    print(f"  After hash-filter: {len(docs_to_push)}")

    for i in range(0, len(docs_to_push), BATCH_SIZE):
        batch = docs_to_push[i:i + BATCH_SIZE]
        push_batch(batch, dry_run)
        update_state(pg_conn, batch, dry_run)


def full_rebuild(pg_conn, dry_run=False):
    """Index-Swap: alle Docs in Staging-Index, dann atomarer Swap."""
    print("Full rebuild — building staging index ...")
    if not dry_run:
        meili_request("DELETE", f"/indexes/{STAGING_INDEX}")  # 404 ok
        meili_request("POST", "/indexes",
                      {"uid": STAGING_INDEX, "primaryKey": "id"})
        # Settings vom Production-Index uebernehmen
        prod_settings = meili_request("GET", f"/indexes/{INDEX_NAME}/settings")
        meili_request("PATCH", f"/indexes/{STAGING_INDEX}/settings",
                      prod_settings)

    rows = fetch_release_rows(pg_conn)
    print(f"  Total releases: {len(rows)}")

    docs = [transform_to_doc(r) for r in rows]
    for i in range(0, len(docs), BATCH_SIZE):
        batch = docs[i:i + BATCH_SIZE]
        if dry_run:
            print(f"  [dry-run] would push batch {i // BATCH_SIZE + 1}")
        else:
            meili_request("POST", f"/indexes/{STAGING_INDEX}/documents", batch)
        print(f"  Batch {i // BATCH_SIZE + 1}: {len(batch)} docs")

    if not dry_run:
        # Warten bis Indexing fertig — Meili hat /tasks API
        # (vereinfacht: poll fuer 60 s)
        for _ in range(60):
            stats = meili_request("GET", f"/indexes/{STAGING_INDEX}/stats")
            if not stats.get("isIndexing", False):
                break
            time.sleep(1)

        # Atomic swap
        meili_request("POST", "/swap-indexes",
                      [{"indexes": [INDEX_NAME, STAGING_INDEX]}])
        meili_request("DELETE", f"/indexes/{STAGING_INDEX}")
        # State table komplett neu schreiben
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
    ids = [o.replace("-", "_") for o in orphans]
    meili_request("POST", f"/indexes/{INDEX_NAME}/documents/delete-batch", ids)
    cur = pg_conn.cursor()
    cur.execute("DELETE FROM meilisearch_index_state WHERE release_id = ANY(%s)",
                (orphans,))
    pg_conn.commit()
    cur.close()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--full-rebuild", action="store_true")
    p.add_argument("--cleanup", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--pg-url")
    p.add_argument("--meili-url")
    args = p.parse_args()

    pg_conn = get_pg_conn(args.pg_url)
    try:
        if args.full_rebuild:
            full_rebuild(pg_conn, args.dry_run)
        elif args.cleanup:
            cleanup_orphans(pg_conn, args.dry_run)
        else:
            delta_sync(pg_conn, args.dry_run)
    finally:
        pg_conn.close()


if __name__ == "__main__":
    main()
```

Die Datei landet in `scripts/meilisearch_sync.py`. Settings-Datei (Synonyms, Ranking-Rules, etc.) wird **separat** verwaltet via `scripts/meilisearch_settings.json`, applied via `python3 meilisearch_sync.py --apply-settings` (nicht im Skelett, trivial). Versionierung: Settings-Datei wird im Git-Repo geversioniert, Apply-Befehl ist idempotent.

### 4.5 Cron + ENV

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
```

---

## 5. Ranking & Relevance Tuning

### 5.1 Custom Ranking Rules — VODs Eigenheiten

Reihenfolge in der `rankingRules`-Liste ist hierarchisch — fruehere Rules trumpfen spaetere. Standard-Reihenfolge ist `words → typo → proximity → attribute → sort → exactness`. Wir haengen vier Boost-Rules an:

```json
[
  "words", "typo", "proximity", "attribute", "sort", "exactness",
  "in_stock:desc",
  "has_cover:desc",
  "cohort_a:desc",
  "is_purchasable:desc",
  "popularity_score:desc"
]
```

Begruendung pro Boost:
- **`in_stock:desc`** (verifiziertes Exemplar im Inventory): Frank will dass die echten, abgenommenen Stuecke zuerst auftauchen wenn Customer sucht. Wenn ein Item im Lager liegt, soll es prominent sein.
- **`has_cover:desc`**: Items ohne Cover-Image konvertieren statistisch schlecht. Zwischen relevanz-aequivalenten Treffern: cover-having gewinnt.
- **`cohort_a:desc`**: Cohort-A sind Items mit `legacy_price > 0`, also die kuratierten/bepreisten Items aus dem Hauptbestand. Discogs-importierte Roh-Daten ohne Preis ranken niedriger.
- **`is_purchasable:desc`**: vorrangig wenn `legacy_available=true`. Sieht mancher Catalog-Browser fuer "ich will jetzt etwas kaufen" ist das wichtig — bei "research/discovery" weniger. Default-on, optional via Query-Param `relevance_only=true` ueberschreibbar.
- **`popularity_score:desc`** als Platzhalter — heute alles 0, deshalb effektiv neutral. Vorbereitet fuer spaeter (Compute aus Bid-Counts + Order-Counts via separater Cron).

### 5.2 Synonyme — Industrial-Subkultur

Erstes Set in §3.4 `synonyms`. Erweiterungs-Pflege: pro Quartal review, neue Genres die im Katalog auftauchen erfassen. Datenquelle: `entity_content.genre_tags` Top-100 distinct values + manuelle Liste in `scripts/meilisearch_settings.json`.

Wichtige zu pflegen:
- `industrial`, `power electronics`, `noise`, `harsh noise`, `death industrial`, `rhythmic noise`
- `ambient`, `dark ambient`, `drone`, `isolationist`, `minimalism`
- `ebm`, `electronic body music`, `industrial dance`
- `experimental`, `avantgarde`, `musique concrete`
- `techno`, `electro`, `idm`
- `format-Aliase`: `vinyl/lp/record`, `tape/cassette/mc`, `cd/compact disc`
- `country-Aliase`: `germany/deutschland/de/ger`, `usa/us/america/united states`, `uk/great britain/england/united kingdom`, `japan/jp/jpn`

Testfall: User tippt "noise tape" → matcht "industrial cassette" via Synonym-Doppel. Wird im Acceptance-Test pro Phase verifiziert.

### 5.3 Stop-Words

Default-Liste DE+EN klein halten (siehe §3.4). Wichtig: **NICHT** `vinyl`, `record`, `cassette`, `tape`, `cd` als Stop-Words — die sind im Katalog signifikant.

### 5.4 Typo-Tolerance

- Default-Schwellen: 1 Typo ab Wortlaenge 4, 2 Typos ab Wortlaenge 8.
- Disabled fuer `catalog_number` und `article_number` (siehe §3.4).
- Nicht globally disabled fuer Discogs-IDs — `discogs_id` ist nicht searchable, nur filterable.

---

## 6. Backend-Integration

### 6.1 Architektur-Entscheidung: Backend-Proxy statt Direct-Browser

**Entscheidung:** Storefront ruft weiterhin den Medusa-Backend-Endpoint `/store/catalog` etc. auf. Backend macht die Meilisearch-Query intern. Kein direkter Browser → Meilisearch Aufruf.

**Warum nicht Direct-Browser (Tenant-Token):**

Pro Direct-Browser-Aufruf:
- Spart einen Hop (~30-50 ms Latenz)
- Erlaubt Instant-Search ohne Backend-Last

Contra Direct-Browser fuer VOD:
- Bestehende `/store/catalog` Logik (COUNTRY_ALIASES, sale_mode-Mapping, is_purchasable-Berechnung, Discogs-Price-Enrichment) muesste in Frontend dupliziert werden ODER in Meili-Settings/Synonyme uebersetzt werden — beides Aufwand.
- Rate-Limiting (Upstash Redis) ist auf Backend-Routes. Direct-Meili = neuer Rate-Limit-Layer.
- Tenant-Token-Rotation operativer Aufwand.
- Wir haben heute Catalog-Pages mit Server-Side-Rendering in Next.js (`storefront/src/app/catalog/`). Server-Side fetch von Meili ueber Public-Token waere sinnlos (Server kann den Admin-Key nutzen), aber Inkonsistenz mit Client-Hydration.
- Meili-Latenz von der VPS auf den selben VPS ist sub-ms. Backend-Hop ist ~5 ms intern. Der "Spar-Effekt" ist kosmetisch.

Wenn wir spaeter mal einen reinen InstantSearch-Widget mit Algolia-style sub-50-ms-Tippreaktion bauen (Phase 2 prio-1, siehe §7), kommt der Direct-Browser-Token. Heute: Backend-Proxy.

### 6.2 Neue Lib `backend/src/lib/meili-client.ts`

```typescript
import { Meilisearch } from "meilisearch"

let client: Meilisearch | null = null

export function getMeiliClient(): Meilisearch {
  if (client) return client
  const host = process.env.MEILI_URL || "http://127.0.0.1:7700"
  const apiKey = process.env.MEILI_ADMIN_API_KEY
  if (!apiKey) {
    throw new Error("MEILI_ADMIN_API_KEY not set")
  }
  client = new Meilisearch({ host, apiKey })
  return client
}

export const RELEASES_INDEX = "releases"
```

Dependency: `npm install meilisearch` im backend-package — offizielles JS-SDK, ~80 kB.

### 6.3 Neue Lib `backend/src/lib/release-search-meili.ts` (parallel zu `release-search.ts`)

```typescript
import { getMeiliClient, RELEASES_INDEX } from "./meili-client"
import type { SearchParams, SearchResponse, Hits } from "meilisearch"

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
}

function buildFilterString(f: CatalogSearchParams["filters"]): string[] {
  if (!f) return []
  const parts: string[] = []
  if (f.format) parts.push(`format = "${f.format}"`)
  if (f.format_group) parts.push(`format_group = "${f.format_group}"`)
  if (f.product_category) parts.push(`product_category = "${f.product_category}"`)
  if (f.country_code) parts.push(`country_code = "${f.country_code}"`)
  if (f.year_from && f.year_to) {
    parts.push(`year >= ${f.year_from} AND year <= ${f.year_to}`)
  } else if (f.year_from) {
    parts.push(`year = ${f.year_from}`)
  }
  if (f.decade) parts.push(`decade = ${f.decade}`)
  if (f.label_slug) parts.push(`label_slug = "${f.label_slug}"`)
  if (f.artist_slug) parts.push(`artist_slug = "${f.artist_slug}"`)
  if (f.genres && f.genres.length) {
    parts.push(`(${f.genres.map(g => `genres = "${g}"`).join(" OR ")})`)
  }
  if (f.sale_mode) parts.push(`sale_mode = "${f.sale_mode}"`)
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
    default:           return []  // relevance
  }
}

export async function searchReleases(params: CatalogSearchParams) {
  const client = getMeiliClient()
  const index = client.index(RELEASES_INDEX)
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

### 6.4 Endpoint-Refactor: `/store/catalog/route.ts`

Statt der ~300 Zeilen Knex-Bauerei wird der Endpoint auf ~80 Zeilen reduziert:

```typescript
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getFeatureFlag } from "../../../lib/feature-flags"
import { searchReleases } from "../../../lib/release-search-meili"
// ... existing Postgres-Import als Fallback
import { GET as catalogGetPostgres } from "./route.legacy"

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg = req.scope.resolve(/* PG_CONNECTION */)

  // Feature-Flag-Gate — wenn off, Postgres-Fallback
  const useMeili = await getFeatureFlag(pg, "SEARCH_MEILI_CATALOG")
  if (!useMeili) {
    return catalogGetPostgres(req, res)
  }

  const q = req.query as Record<string, string>
  const result = await searchReleases({
    query: q.search,
    filters: {
      format: q.format,
      format_group: q.category,        // category=vinyl → format_group=vinyl
      country: q.country,
      year_from: q.year_from ? Number(q.year_from) : undefined,
      year_to:   q.year_to   ? Number(q.year_to)   : undefined,
      decade: q.decade ? Number(q.decade) : undefined,
      label_slug: q.label_slug,
      artist_slug: q.artist_slug,
      genres: q.genre ? [q.genre] : undefined,
      for_sale: q.for_sale === "true",
    },
    sort: mapLegacySort(q.sort, q.order),  // "artist"+"asc" → "artist_asc"
    page: q.page ? Number(q.page) : 1,
    limit: q.limit ? Number(q.limit) : 24,
    facets: ["format_group", "decade", "country", "genres", "label_name"],
  })

  res.json({
    releases: result.hits.map(toLegacyShape),  // identische Field-Names wie Postgres-Variante
    total: result.estimatedTotalHits,
    facets: result.facetDistribution,           // NEU — Sidebar-Counts
    page: Number(q.page || 1),
    limit: result.limit,
    pages: Math.ceil((result.estimatedTotalHits ?? 0) / result.limit),
  })
}
```

`route.legacy` = Umbenennung der heutigen `route.ts`, beibehalten als Fallback. Nach Phase 3 (siehe §8) loeschbar.

### 6.5 Mapping-Hilfsfunktion `toLegacyShape`

Die Storefront-Komponenten erwarten Field-Names wie `coverImage` (camelCase), `artist_name` etc. Meilisearch-Doc nutzt durchgaengig snake_case. Ein einfacher Re-Mapper:

```typescript
function toLegacyShape(hit: any) {
  return {
    id: hit.release_id,
    title: hit.title,
    slug: hit.release_id,  // TODO if we have proper slugs in DB
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
    _highlight: hit._formatted,  // optional, fuer UI
  }
}
```

### 6.6 Endpoints-Mapping-Tabelle

| Endpoint heute | Phase-1-Status | Phase-2-Status |
|---|---|---|
| `/store/catalog` GET | Meili | Meili |
| `/store/catalog/suggest` GET | Meili (mit `limit=8` + Highlight) | Meili |
| `/store/catalog/facets` GET | Postgres bleibt (Top-Level Facetten ohne Filter) | Meili-Facetten via `searchReleases({query: "", facets: [...]})` |
| `/store/catalog/:id` GET | **Postgres bleibt** — Detail-View braucht Joins (Tracks, Images, Related), Meili kann das nicht ersetzen | Postgres bleibt |
| `/admin/erp/inventory/search` GET | Postgres FTS bleibt (Phase 1) | Meili mit Filter `cohort_a OR exemplar_count>0` |
| `/admin/media` GET (mit q-Parameter) | Postgres FTS bleibt (Phase 1) | Meili (Search-Teil) — Filter-Teil bleibt Postgres weil ERP-spezifische Felder (`price_locked`, `warehouse_location`, `import_collection`) nicht in Meili |

---

## 7. Storefront-UX-Verbesserungen die jetzt moeglich werden

Nach Migration koennen folgende UX-Verbesserungen rein-additiv im Storefront landen, ohne weitere Backend-Aenderungen:

### 7.1 Empfohlene Phase-1-Picks

1. **Live-Counts im Filter-Sidebar.** Die `facetDistribution` aus Meili-Response zeigt fuer jede Facette die Treffer-Zahl im aktuellen Result-Set. Beispiel: User hat `format_group=vinyl` ausgewaehlt → Sidebar zeigt "Germany (1,234)", "USA (892)" usw. **Hoechster UX-Win.**
2. **"Did you mean"-Vorschlag bei leeren Result-Sets.** Wenn `estimatedTotalHits=0`, zweiter Meili-Call mit hoeherer Typo-Tolerance + Vorschlag im UI. **Verhindert Sackgassen.**
3. **Highlight-Snippets in Treffern.** `_formatted.artist_name = "<mark>Cabaret</mark> Voltaire"` direkt im Storefront rendern. **Macht Suche fuehlbar.**

### 7.2 Phase-2-Picks (optional)

4. **Instant-Search-as-you-type.** Header-Search-Bar zeigt Suggest-Dropdown bei jedem Tastendruck. Heute moeglich aber laggy (Postgres ~130 ms × Roundtrip). Mit Meili sub-50 ms wuerde sich das anfuehlen wie Spotify. **Erfordert Direct-Browser-Tenant-Token.** (Siehe §6.1.)
5. **"Sort by"-Selector mit Live-Update.** Heute hat Catalog-UI fixed `?sort=artist`. Mit Meili kann der User zwischen Relevanz, Preis (auf+ab), Jahr (auf+ab), Newly-added wechseln. UI-Aenderung trivial.
6. **Negativ-Filter** (`-format=CD`). Meili unterstuetzt `format != "CD"`. Nische-Feature aber Sammler lieben es.
7. **Genre-Browse-Page.** `/genre/industrial` rendert Treffer via `genres = "industrial"` Filter. Heute moeglich aber bedingt durch `entity_content`-JOIN langsam. Mit Meili schnell.

Robins Empfehlung: **Phase-1-Picks 1+2+3 sofort mitlaunchen**. Phase-2-Picks 4+5+6+7 nach 2-4 Wochen Live-Betrieb wenn Meili stabil ist.

---

## 8. Operational Concerns

### 8.1 Wo laeuft Meili — selber VPS

VPS hat ~16 GB RAM. Aktuelle PM2-Services-Belegung (geschaetzt):
- vodauction-backend (`max_memory_restart: 500M`)
- vodauction-storefront (Next.js, ~600 MB)
- Service_Overview (~150 MB)
- tape-mag-migration (~150 MB)
- VOD_Fest WordPress (~400 MB inkl. PHP-FPM)
- Postgres (managed bei Supabase, lokal nichts)
- nginx (~50 MB)

Total ~1.8 GB committed. Headroom > 10 GB. Meilisearch mit 1.5 GB Cap passt komfortabel.

**Setup: Docker-Compose** (nicht PM2) — Begruendung:
- Meili wird als single-binary Docker-Image distributed, kein Source-Build noetig
- Docker macht Volume-Mount fuer LMDB-Storage trivial
- Healthcheck und Restart-Policy native
- Robin nutzt Docker bereits fuer Microinvest und VOD_Fest, ist also vertraut
- PM2 fuer Daemonisieren von Single-Binaries ist lebensfaehig aber overkill — die Process-Manager-Features (logs, monitoring, cluster-mode) brauchen wir bei Meili nicht

**`docker-compose.meili.yml`** (Neue Datei in `~/VOD_Auctions/` auf VPS):

```yaml
version: "3.8"
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
      MEILI_MAX_INDEXING_MEMORY: "1Gb"
      MEILI_HTTP_PAYLOAD_SIZE_LIMIT: "200MB"
      MEILI_LOG_LEVEL: "INFO"
    deploy:
      resources:
        limits:
          memory: 1.5G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7700/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

Start: `cd ~/VOD_Auctions && docker compose -f docker-compose.meili.yml up -d`

`MEILI_MASTER_KEY` wird einmalig generiert (`openssl rand -hex 32`), in 1Password ("VOD Meilisearch Master Key") gespeichert, in `~/VOD_Auctions/.env.meili` (gitignored) eingetragen.

**Wichtig:** Port 7700 binded **nur auf 127.0.0.1**, nicht 0.0.0.0. Damit ist Meili nur vom VPS aus erreichbar — kein Public-Access, kein Firewall-Aufwand. Backend ruft `http://127.0.0.1:7700` direkt an.

### 8.2 Speicher- und Disk-Budget

Bei 52k Docs mit avg ~2 KB JSON = ~100 MB Roh-Daten. Meili-Index inkl. Tokenization, Inverted-Index, Facetten-Cache ueberschlaegig 200-400 MB Disk. RAM bei warmem Index ~300-500 MB Idle, Peak waehrend Re-Index bis 1 GB.

Cap auf 1.5 GB im docker-compose `deploy.resources.limits.memory` ist Safety-Net. `MEILI_MAX_INDEXING_MEMORY=1Gb` sagt Meili explizit "nutze nicht mehr als 1 GB beim Indexing". Ohne diese ENV nimmt Meili Default 2/3 of total RAM des Hosts (in Docker = 2/3 von 16 GB = 10 GB) und kann andere Services strangulieren — siehe Issue [meilisearch#4686](https://github.com/meilisearch/meilisearch/issues/4686).

### 8.3 Backup-Strategie

Meili hat eingebauten Snapshot/Dump:

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

Restore via `meilisearch --import-dump /dumps/<file>.dump`. Dump-Files ~50-100 MB. 7 Tage Retention.

**Disaster-Recovery:** Wenn Meili-Index korrupt → kein Drama, weil Postgres ist Source of Truth. Recovery-Sequenz:
1. Container stoppen
2. `/root/meilisearch/data` wegrotieren
3. Container neu starten (frisches LMDB)
4. `python3 meilisearch_sync.py --apply-settings`
5. `python3 meilisearch_sync.py --full-rebuild`
6. Sync-Cron laeuft normal weiter

Total ~5 Min Downtime. Storefront faellt automatisch auf Postgres-FTS zurueck wenn Meili nicht reachable (siehe §6.4 — Health-Check + Feature-Flag-Re-Read).

### 8.4 Monitoring

- **Service_Overview** (existing tool) bekommt einen neuen Eintrag in `services.config.json` der `http://127.0.0.1:7700/health` checked. Standard-Pattern, ~5 Zeilen Config.
- **Sync-Log** schreibt nach `~/VOD_Auctions/scripts/meilisearch_sync.log` — kann von Service_Overview als Log-Source genutzt werden.
- **Admin-Status-Page** `/app/sync` bekommt einen weiteren Tab "Meilisearch" mit Stats: Total docs indexed, Last sync timestamp, Index size, Pending tasks. Daten via `GET /stats` Meili-API.

### 8.5 Sicherheit

- Master-Key nur im Backend + in 1Password
- Admin-API-Key (separate, vom Master generated) fuer Sync-Script
- Search-Only-API-Key (separate) fuer eventuellen Direct-Browser-Access in Phase 2
- Port 7700 nicht public — Hostinger-Firewall bleibt unveraendert
- Logs anonymisieren: keine User-Queries in `meilisearch_sync.log`

---

## 9. Migration-Path (Phasen)

### Phase 0: Vorarbeit (kann parallel zum Pre-Launch laufen)

- [ ] `docker-compose.meili.yml` lokal auf Robins Mac testen — Meili starten, manuell ein paar Docs pushen, Search funktioniert
- [ ] `scripts/meilisearch_sync.py` Skelett bauen, mit `--dry-run` gegen Staging-Supabase laufen lassen
- [ ] `scripts/meilisearch_settings.json` mit Settings aus §3.4 initial befuellen
- [ ] Country-ISO-Mapping vervollstaendigen (`scripts/data/country_iso.py`) — alle ~120 Werte aus DB DISTINCT-Query aufloesen
- [ ] `backend/src/lib/meili-client.ts` + `release-search-meili.ts` schreiben, Unit-Tests mit Meili-Mock
- [ ] Acceptance-Kriterium: Meili laeuft lokal, Sync-Script kann Backfill, Test-Endpoint `/store/catalog?test_meili=1` liefert sinnvolle Treffer

**Aufwand:** 1 Tag

### Phase 1: Storefront on Meili (Soft-Launch)

- [ ] Meili auf VPS via docker-compose starten, `MEILI_MASTER_KEY` setzen
- [ ] Initial-Backfill: `python3 meilisearch_sync.py --apply-settings && --full-rebuild` — laeuft 1-3 Min
- [ ] Cron-Job aktivieren (`*/5 * * * *`)
- [ ] Feature-Flag `SEARCH_MEILI_CATALOG` registrieren in `feature-flags.ts` (default `false`)
- [ ] Backend deployen mit Meili-Client + Routes-Refactor (alte Postgres-Logik bleibt als Fallback)
- [ ] **Akzeptanz-Test mit Flag OFF:** Identisches Verhalten wie heute, kein User merkt etwas
- [ ] Flag in Admin-Config einschalten waehrend Robin live mitschaut
- [ ] **Akzeptanz-Test mit Flag ON:**
  - [ ] Top 10 Suchen aus den letzten 30 Tagen liefern aequivalente Top-3-Treffer
  - [ ] "music various" findet Vanity-Various-Release (heutiger Regression-Case)
  - [ ] "cabarte voltarie" (Typo) findet Cabaret Voltaire (NEU — heute leer)
  - [ ] "noise" findet via Synonym auch Industrial-Releases (NEU)
  - [ ] `?for_sale=true&format=LP&decade=1980` Filter performt < 100 ms (heute > 200 ms)
  - [ ] facetDistribution liefert sinnvolle Counts (NEU — Sidebar nutzt es)
- [ ] UI-Komponente "Filter-Sidebar mit Live-Counts" aktivieren (Phase-1-Pick #1 aus §7)
- [ ] UI-Komponente "Did you mean" (Phase-1-Pick #2)
- [ ] UI-Komponente "Highlight in Treffern" (Phase-1-Pick #3)
- [ ] Catalog-Suggest-Endpoint (`/store/catalog/suggest`) ebenfalls auf Meili umstellen

**Aufwand:** 1 Tag (Backend) + 0.5 Tag (Storefront UI) + 0.5 Tag Acceptance-Test

**Rollback-Plan:** Flag im Admin Off-schalten — Postgres-FTS uebernimmt sofort, kein Deploy noetig.

### Phase 2: Admin-Endpoints auf Meili

- [ ] `/admin/erp/inventory/search` umstellen — neuer Filter `cohort_a OR in_stock`, Barcode-Direct-Lookup bleibt Postgres (eindeutiger PK-Lookup, brauchen keinen Search-Index)
- [ ] `/admin/media` umstellen — Search-Teil auf Meili, Filter-Teil hybrid (Stocktake-Status, price_locked, warehouse_location bleiben Postgres weil zu spezifisch)
- [ ] `/store/catalog/facets` umstellen — global facetDistribution
- [ ] Feature-Flag `SEARCH_MEILI_ADMIN` separat — Admin-Side hat andere Risikoprofile
- [ ] Phase-2-UX-Picks (Instant-Search, Sort-Selector etc.) aus §7

**Aufwand:** 1 Tag

### Phase 3: Postgres-FTS abbauen oder als Fallback behalten

**Entscheidung kommt nach 2-4 Wochen Phase-2-Live-Betrieb.** Optionen:

- **A — Behalten als Fallback** (empfohlen): `Release.search_text` Spalte + GIN-Index bleiben. `release-search.ts` bleibt im Code. Feature-Flag-Toggle bleibt operative Notbremse. Kostet ~150 MB Disk im Postgres und einen Trigger pro Release-Mutation — vernachlaessigbar.
- **B — Komplett abbauen**: Migration `DROP COLUMN search_text`, Trigger droppen, `release-search.ts` loeschen. Spart Postgres-Disk + Trigger-CPU. Aber: kein Fallback mehr.

Robins Praeferenz aktuell: A. Wenn Meili 6 Monate ohne Incident laeuft, kann B kommen.

---

## 10. Aufwandsschaetzung & Risiken

### 10.1 Effort-Tabelle

| Phase | Backend | Sync-Script | Frontend | Ops/Setup | Total |
|---|---|---|---|---|---|
| 0 — Vorarbeit | 0.5 d | 0.5 d | 0 | 0 | 1 d |
| 1 — Storefront | 0.5 d | 0 | 0.5 d | 0.5 d | 1.5 d |
| 2 — Admin | 0.5 d | 0 | 0.5 d | 0 | 1 d |
| 3 — Cleanup | 0.25 d | 0 | 0 | 0.25 d | 0.5 d (optional) |

**Total Phase 0+1+2: ~3.5 Manntage**, parallelisierbar in 2 Kalendertagen wenn Robin fokussiert. Phase 3 spaeter optional.

### 10.2 Risiken & Mitigationen

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|---|---|---|---|
| Sync-Lag macht Suche stale | hoch | mittel | 5-min-Delta-Sync + Hash-Diff, kommunizieren "Index aktualisiert sich alle paar Minuten" wenn relevant |
| Index-Drift Postgres↔Meili | mittel | mittel | Cleanup-Cron + monatliche `--full-rebuild` als Hygiene |
| Search-Quality-Regression in Phase 1 | mittel | hoch | Flag-Gate + 10-Top-Queries-Acceptance-Test vor Aktivierung |
| Meili-OOM strangulated andere Services | niedrig | hoch | Hard Cap auf 1.5 GB via Docker, Service_Overview alerted |
| Synonym-Liste explodiert wartungsfrei | mittel | niedrig | Versionierung in Git, quarterly Review als TODO-Item |
| Frank-Catalog-Suche verhaelt sich anders als Storefront | mittel | mittel | gleiche Lib `release-search-meili.ts` fuer beide Endpoints, keine Duplizierung |
| Discogs-Daily-Sync bumpt updatedAt nicht | unbekannt | niedrig | Phase-0 verifizieren, ggf. Trigger ergaenzen ODER Sync-Script auch auf `discogs_*`-Spalten triggern |
| Meili-Lizenz-Aenderung in Zukunft | niedrig | mittel | MIT ist stabil, im Worst-Case Fork verfuegbar, Datenformat ist offen (LMDB) |
| LMDB-Korruption | sehr niedrig | mittel | Daily Dumps + 5-min-rebuilbar aus Postgres |

---

## 11. Was wir BEWUSST NICHT machen

Folgende Themen werden bewusst aus diesem Plan ausgeklammert. Nicht weil sie irrelevant sind, sondern weil sie eigene Konzepte verdienen und der Scope dieses Plans sonst kontrollunfaehig wird:

- **Vector-Search / Semantic-Search.** Meili 1.x kann Hybrid-Search via OpenAI/Ollama-Embeddings. Aber: Embedding-Pipeline kostet Geld, Quality-Tuning ist anders als Keyword-Search, evaluation-framework brauchen wir. Eigenes Konzept-Doc spaeter.
- **LLM-Re-Ranker.** "Nimm Top-50 von Meili, lass Claude Haiku die Top-10 nach User-Intent re-ranken." Cool aber Latenz + Kosten. Spaeter.
- **Konversationelle Suche / Search-Chat.** Meili Cloud hat ein eingebautes Chat-UI. Wir sind self-hosted. Eigene LLM-Integration ist eigenes Thema (siehe AI-Assistant `/app/ai-chat`).
- **Federated Multi-Index** (Search ueber `releases` + `artists` + `labels` Indizes parallel). Fuer Storefront-Suggest reicht ein Index. Wenn wir spaeter dedizierte Artist-/Label-Browse-Pages bauen, kommt Multi-Index — eigenes Feature.
- **Search-Analytics-Dashboard** ("Welche Queries kamen letzte Woche?" "Welche Queries fuehrten zu 0 Treffern?"). Meili logged das nicht selbst. Eigene Pipeline (Backend logged Queries → eigene Tabelle → Admin-Dashboard) ist Phase 4. RudderStack wuerde sich hier anbieten.
- **Personalisierte Suche / Re-Ranking nach User-History.** Browsing-History pro User → Boosts auf bevorzugte Genres / Labels / Decades. Erfordert User-Tracking-Pipeline, eigene Privacy-Ueberlegung. Spaeter.
- **A/B-Testing fuer Ranking-Rules.** Wenn wir genug Traffic haben, sinnvoll. Heute zu wenig fuer Statistik. Spaeter.

---

## 12. Naechste Schritte

1. Robin liest, gibt Feedback / approvt.
2. Phase 0 ausfuehren (lokal, 1 Tag, kein Deploy).
3. Linear-Issue anlegen (vmtl. unter RSE-78 als Sub-Task oder eigenes Issue), Effort 3-4 Tage, Prio nach Pre-Launch.
4. Nach Pre-Launch (Plattform `live`-Mode aktiv) Phase 1 ausrollen.
5. CHANGELOG-Entry pro Phase. GitHub Release `vX.X.X-rcXX` pro abgeschlossener Phase.

---

**Verweise:**
- `backend/src/lib/release-search.ts` — heutiger Postgres-FTS-Helper
- `backend/scripts/migrations/2026-04-22_release_search_text_fts.sql` — heutige FTS-Spalte + Trigger
- `backend/scripts/migrations/2026-04-22_search_trigram_indexes.sql` — Trigram-Indizes (bleiben in Phase 1+2 als Fallback)
- `docs/optimizing/CATALOG_SEARCH_FIXES_2026-04-22.md` — Vorgeschichte, Multi-Word-Bug
- `docs/architecture/DEPLOYMENT_METHODOLOGY.md` — Deploy-early-activate-when-ready Pattern (Feature-Flag-Gate)
- `scripts/legacy_sync_v2.py` — Stilvorlage fuer den neuen `meilisearch_sync.py`
