# Supabase Disk-IO Audit — 2026-04-23

**Trigger:** Supabase-Alert-Mail "Your project is depleting its Disk IO Budget" (Projekt `bofblwqieuvmqybzxapx`, Free Plan). Zweite Mail innerhalb weniger Stunden → User-Freigabe zur sofortigen Umsetzung.
**Status:** **Tier 1 umgesetzt und deployed (rc49, 2026-04-23 Abend).** Monitoring-Follow-up geplant für 2026-04-24 (pg_stat_statements re-check).
**Companion:**
- [`CATALOG_PERFORMANCE_BENCHMARK.md`](CATALOG_PERFORMANCE_BENCHMARK.md)
- [`ADMIN_CATALOG_PERFORMANCE_PLAN.md`](ADMIN_CATALOG_PERFORMANCE_PLAN.md)

---

## 1. Kontext

Heute wurden 3 Meilisearch-Full-Rebuilds durchgeführt (rc47.2 Rename, rc48 Admin-Felder-Rollout, rc48.1 Parity-Fix) plus rc48.1 Paritäts-Check-Script mit 28 separaten SQL-Cases gegen die gleichen Tabellen. Supabase meldet Disk-IO-Budget-Verbrauch.

Free Plan Supabase (`micro`-Compute-Add-On) hat ein Tagesbudget für Disk-IO — bei Überschreitung:
- Response-Zeiten steigen merklich
- CPU-Usage steigt durch IO-Wait
- Instance kann unresponsive werden

Das ist **kein Ausfall**, aber eine Warnung vor spürbarer Degradation.

---

## 2. Daten — Top-20 Queries nach Disk-Reads (`pg_stat_statements`)

Abgefragt via Supabase MCP am 2026-04-23. Zeigt **kumulative** Zahlen über die Lebensdauer der `pg_stat_statements`-Tabelle (wenn nicht zurückgesetzt, mehrere Wochen).

| # | Query (Kurzbeschreibung) | Calls | Disk GB | Cache-Hit | Mean ms |
|--:|---|--:|--:|--:|--:|
| 1 | `meilisearch_sync.py::BASE_SELECT_SQL` (Release + 11 korrelierte Subqueries) | 243 | **8.59 GB** | 95.6% | 20149 |
| 2 | Legacy-Sync `INSERT INTO Release` | 92 407 | 3.41 GB | 99.7% | 48 |
| 3 | Discogs-Audit `COUNT(*) Release WHERE artistId + NOT EXISTS` | 420 | 1.98 GB | 95.6% | 2252 |
| 4 | `UPDATE Release SET search_indexed_at = NOW()` batches | 464 | 1.70 GB | 99.2% | 2368 |
| 5 | Discogs-Detail-Fetch (Release-Snapshot-Read) | 25 394 | 1.66 GB | 99.1% | 60 |
| 6 | `entity_content`-SELECT (Artist-Content-Joins) | 343 | 1.65 GB | 73.3% | 1125 |
| 7 | Discogs-Audit `COUNT(*) Release WHERE labelId + NOT EXISTS` | 420 | 1.20 GB | 96.9% | 904 |
| 8 | Discogs-Collections `GROUP BY collection_name` | 136 | 1.06 GB | 60.2% | 6483 |
| 9 | `/admin/media` Postgres-Listing (Fallback-Route) | 400 | 1.04 GB | 99.2% | 1360 |
| 10 | `COUNT(*) Release WHERE legacy_last_synced ...` | 420 | 1.03 GB | 97.3% | 398 |
| 11 | Ähnlich wie #9, andere Filter-Kombination | 97 | 0.79 GB | 99.1% | 14 725 |
| 12 | `SELECT release_id, doc_hash FROM meilisearch_index_state` | 193 | 0.75 GB | 58.7% | 713 |
| 13 | `SELECT id FROM Artist WHERE id LIKE` | 500 | 0.72 GB | 73.3% | 554 |
| 14 | `UPDATE Release SET search_indexed_at` (variante #2) | 648 | 0.68 GB | 99.7% | 887 |
| 15 | `SELECT id, coverImage FROM Release WHERE id = ANY(...)` | 28 334 | 0.66 GB | 99.4% | 237 |
| 16 | `COUNT(Release.id) WHERE coverImage IS NOT NULL` | 897 | 0.62 GB | 99.1% | 2728 |
| 17 | `COUNT(id) Release WHERE discogs_id IS NOT NULL` | 222 | 0.55 GB | 97.4% | 6117 |
| 18-20 | Verschiedene Release-INSERT-Varianten | ~5 500 | 0.53-0.51 GB | 99.4% | 87-148 |

**Gesamtsumme Top-20:** ~27 GB Disk-Reads kumulativ.

---

## 3. Root-Cause-Analyse

### 3.1 Dominanter Verursacher: Meili-Sync-Query

`meilisearch_sync.py::BASE_SELECT_SQL` macht **allein 8.59 GB** Disk-Reads (32 % der Top-20-Summe). Jeder einzelne Call braucht **20 Sekunden** Mean-Exec-Time.

**Query-Struktur heute** (nach rc48-Erweiterung um Admin-Felder):

```sql
SELECT
  r.*,
  (SELECT COUNT(*) FROM erp_inventory_item ii WHERE ii.release_id = r.id),     -- korr. Subquery #1
  (SELECT COUNT(*) FROM erp_inventory_item ii WHERE ...),                       -- korr. Subquery #2
  (SELECT ii.status FROM erp_inventory_item ii WHERE ...),                      -- korr. Subquery #3
  (SELECT ii.price_locked FROM erp_inventory_item ii WHERE ...),                -- korr. Subquery #4
  (SELECT ii.barcode FROM erp_inventory_item ii WHERE ...),                     -- korr. Subquery #5
  (SELECT MAX(ii.last_stocktake_at) FROM erp_inventory_item ii WHERE ...),      -- korr. Subquery #6
  (SELECT wl.code FROM erp_inventory_item ii LEFT JOIN warehouse_location ...), -- korr. Subquery #7
  (SELECT wl.id FROM erp_inventory_item ii LEFT JOIN ...),                      -- korr. Subquery #8
  (SELECT wl.name FROM erp_inventory_item ii LEFT JOIN ...),                    -- korr. Subquery #9
  (SELECT array_agg(DISTINCT il.collection_name) FROM import_log il ...),       -- korr. Subquery #10
  (SELECT array_agg(DISTINCT il.action) FROM import_log il ...)                 -- korr. Subquery #11
FROM "Release" r
LEFT JOIN "Artist" a  ON ...
LEFT JOIN "Label" l   ON ...
LEFT JOIN "PressOrga" p ON ...
LEFT JOIN "Format" f  ON ...
LEFT JOIN entity_content ec ON ...
```

**Per Request-Kostenanalyse:**
- Full-Rebuild: **52.778 Rows × 11 Subqueries = 580.558 Subquery-Executions**
- Jede Subquery macht Index-Lookup auf `erp_inventory_item(release_id)` oder `import_log(release_id)` — 8 KB Block-Read pro Lookup (konservativ)
- **Theoretischer Disk-IO pro Rebuild**: ~4.7 GB (580k × 8 KB) — matcht gut mit den gemessenen 8.59 GB kumulativ über 3 Full-Rebuilds + Delta-Syncs
- Auch bei Cache-Hit (95.6 %) bleiben 4.4 % → ~200 MB disk-sourced

**Full-Rebuilds heute (3×):**
- rc47.2 Column-Rename (ALTER + rebuild)
- rc48 Admin-Felder-Rollout
- rc48.1 has_discogs + format_group Fix

Plus Paritäts-Script-Runs (28 Cases × 2 Calls = 56 Queries gegen die gleichen Tables).

### 3.2 Sekundäre Verursacher

**#3/#7 Discogs-Audit-Queries** (3.18 GB kombiniert, Mean 1-2 s) — sind Read-Only aus dem Discogs-Import-Admin-Interface. Werden nur bei manueller Nutzung ausgelöst. Aktuell vermutlich nicht stark in Verwendung.

**#4/#14 `UPDATE Release SET search_indexed_at`** (2.38 GB kombiniert) — sind `meilisearch_sync.py`-Post-Push-Bumps. Batches via `ANY(ARRAY[...])`. Die Write-Amplification ist real: jeder Meili-Push schreibt in `Release` zurück + feuert Trigger. Bei 52k+ rebuilds × mehreren trigger-auslösenden Bedingungen → viel WAL-IO.

**#8 `/admin/media` Postgres-Listing (alt)** — 0.79-1.04 GB kombiniert. Aktuell nicht mehr der dominante Admin-Pfad (seit rc48.1 Meili-ON). Historisch kumulativ gemessen.

**#9 Postgres-Meili-Fallback-Variante** — 14.7 s Mean-Exec. Die 6-Table-JOIN-Query. Wird nur bei Meili-Health-Trip oder explizitem `?_backend=postgres` ausgeführt — aktuell geringer Verkehr.

---

## 4. Fix-Plan

Priorisiert nach Impact × Aufwand.

### 4.1 Tier 1 — Sofort-Wirkung **[UMGESETZT in rc49, 2026-04-23 Abend]**

**A. `BASE_SELECT_SQL` auf aggregierte JOINs umschreiben.** [DONE]

Statt 11 korrelierte Subqueries pro Row: **ein aggregierter LEFT JOIN** auf eine Subquery die `erp_inventory_item` einmal group-byed, plus ein LEFT JOIN auf eine aggregierte `import_log`-Subquery.

```sql
-- Target-Shape (conceptual):
WITH
  inv_agg AS (  -- 1 Pass über ~13k erp_inventory_item-Rows
    SELECT
      release_id,
      COUNT(*) FILTER (...) AS exemplar_count,
      COUNT(*) FILTER (WHERE last_stocktake_at IS NOT NULL) AS verified_count,
      MAX(last_stocktake_at) AS last_stocktake_at_max,
      (array_agg(status ORDER BY COALESCE(copy_number,1)))[1] AS inventory_status_first,
      (array_agg(price_locked ORDER BY COALESCE(copy_number,1)))[1] AS price_locked_first,
      (array_agg(barcode ORDER BY COALESCE(copy_number,1)))[1] AS barcode_first,
      (array_agg(warehouse_location_id ORDER BY COALESCE(copy_number,1)))[1] AS warehouse_id_first
    FROM erp_inventory_item
    GROUP BY release_id
  ),
  imp_agg AS (  -- 1 Pass über import_log
    SELECT
      release_id,
      array_agg(DISTINCT collection_name) FILTER (WHERE collection_name IS NOT NULL) AS collections,
      array_agg(DISTINCT action) FILTER (WHERE action IS NOT NULL) AS actions
    FROM import_log
    WHERE import_type = 'discogs_collection'
    GROUP BY release_id
  )
SELECT r.*, ..., inv_agg.*, imp_agg.*, wl.code, wl.name
FROM "Release" r
LEFT JOIN inv_agg ON inv_agg.release_id = r.id
LEFT JOIN imp_agg ON imp_agg.release_id = r.id
LEFT JOIN warehouse_location wl ON wl.id = inv_agg.warehouse_id_first
LEFT JOIN "Artist" a ...
LEFT JOIN "Label" l ...
LEFT JOIN "PressOrga" p ...
LEFT JOIN "Format" f ...
LEFT JOIN entity_content ec ...
```

**Erwartete Einsparung**:
- Statt 580.558 Subquery-Executions → **2 aggregate Scans** (inv_agg ~13k Rows, imp_agg variable)
- Theoretischer Disk-IO: **~100 MB statt 4.7 GB** pro Full-Rebuild (Faktor 40-50×)
- Per-Call-Latenz: **<5 s statt 20 s**

**Betroffen:** `scripts/meilisearch_sync.py::BASE_SELECT_SQL` + `backend/src/lib/meilisearch-push.ts::SELECT_SINGLE_RELEASE_SQL` (Single-Source-of-Truth analog, siehe Plan-Doku §4.A.4).

**Risiko:** niedrig — rein SQL-Rewrite mit gleicher Semantik. Paritätsmatrix (`admin_meili_data_parity.py`) fängt Regression.

**B. Delta-Cron-Frequenz reduzieren** [DONE]

Aktuell: `*/5 * * * *` (alle 5 min). Bei typischem Admin-Verkehr 80 % der Cron-Runs sehen "0 neue Rows". Verschwendung.

Vorschlag: **`*/15 * * * *`** (alle 15 min) für Delta-Sync. Drift-Check + Cleanup bleiben unverändert.

Dazu: **on-demand-Reindex-Hooks** (rc48.1, `pushReleaseNow`) fangen alle Klasse-B-Mutations **sofort** ab — der 15-min-Cron ist nur noch für Klasse-A-Events (Legacy-Sync, Discogs-Cron). Konsistenz-Impact: vernachlässigbar.

**C. Keine weiteren Full-Rebuilds heute.** [DONE — Delta-Cron läuft ab jetzt mit neuer CTE-Query ein]

Die Admin-Felder sind drin, Paritätsmatrix ist grün. Falls später nochmal ein Rebuild nötig: erst 4.1.A umsetzen damit der Rebuild 40× günstiger ist.

### 4.2 Tier 2 — Mittelfristig

**D. Partial Delta-Fetch**

Aktueller Delta-Query:
```sql
... FROM Release r
LEFT JOIN meilisearch_index_state s ON s.release_id = r.id
WHERE r.search_indexed_at IS NULL
   OR s.release_id IS NULL
   OR s.indexed_at < r.search_indexed_at
```

Im Normal-Flow sind das wenige Rows (Delta). Bei Initial-Run oder nach Full-Rebuild-Reset aber bis zu 52k. Optimierung: `LIMIT 5000` pro Cron-Run — bei Backlog wird auf mehrere Cron-Runs gestreckt statt Single-Query-Spike.

**E. `entity_content`-JOIN cachen**

Query #6 (1.65 GB, 73 % Cache-Hit) zeigt schlechte Cache-Effizienz auf `entity_content`. Könnte Index auf `(entity_type, entity_id)` fehlen (zu prüfen via EXPLAIN). Alternativ: Materialized-View `artist_genres` die nur relevante Genres pro Artist cached.

**F. Discogs-Audit-Queries zu Background schieben**

Die Audit-Queries (#3, #7, #10) sind `/admin/discogs-import/...`-Endpoints die User im UI triggern. Bei jedem Page-Load laufen sie neu. Vorschlag: Result 5 min cachen (Redis oder in-memory).

### 4.3 Tier 3 — Langfristig

**G. Upgrade auf Compute-Add-On (wenn IO-Budget weiter knapp)**

Supabase Free Plan `micro`-Compute hat sehr begrenztes IO-Budget. Upgrade auf `small` ($25/Monat) oder `medium` ($75/Monat) verdoppelt/vervierfacht das Budget. Erst nach Tier-1+2-Optimierung sinnvoll — sonst wird ein teureres Pflaster gekauft für ein lösbares Architekturproblem.

**H. Read-Replica**

Ab Pro Plan ($25/Monat) + Compute-Add-On möglich. Alle read-only Admin-Queries (Catalog-Listing, Discogs-Audit) gehen auf Replica → Primary bleibt für Writes. Nur sinnvoll wenn Read-Volumen sehr hoch.

### 4.4 Nicht empfohlen

- **`pg_stat_statements reset`** — verschleiert das Problem, löst nichts.
- **Meili-Sync komplett pausieren** — User würde gestrige Änderungen nie in Meili sehen, schlechte UX.
- **Alle Pagination-Queries batchen** — Micro-Optimierung, lohnt erst nach Tier 1.

---

## 5. Implementierungs-Reihenfolge [COMPLETED]

1. ✅ **4.1.A Rewrite `BASE_SELECT_SQL`** — rc49 Commit, Python + TS-Mirror. Ohne Full-Rebuild deployed (CTE läuft im Delta-Cron ein).
2. ✅ **4.1.B Cron-Frequenz** — crontab auf VPS direkt umgestellt von `*/5` auf `*/15`.
3. ✅ **Paritäts-Check-Lauf nach Rewrite** — `admin_meili_data_parity.py` liefert **28/28 PASSED**, keine Regression.
4. ⏳ **Monitoring** — 2026-04-24 erneut `pg_stat_statements` prüfen, validieren dass BASE_SELECT_SQL nicht mehr Top-1-Query. Falls doch: Tier 2.

Tier 2 (D-F) separater Commit bei Bedarf.

Tier 3 (Upgrade/Replica) nur wenn Tier-1+2 nicht reichen.

---

## 6. Monitoring-Snapshot

Zum Vergleich nach Fix:

- **2026-04-23 17:30 UTC (vor Fix):** Query #1 kumulativ 8.59 GB disk-sourced, 243 calls, mean 20149 ms
- **2026-04-23 18:00 UTC (nach rc49, EXPLAIN-Messung):** 53 ms für LIMIT 100 query, Buffer-Hits shared hit=180 (praktisch komplett aus Cache)
- **Ziel 2026-04-24:** Query sollte bei nächstem Messpunkt (+1 Tag) nur noch wenige 100 MB zusätzlich gelesen haben, mean <5000 ms bei Full-Rebuild-Runs (falls überhaupt einer läuft — nicht empfohlen in nahen Tagen)
- **Gesamtbudget-Trend:** Supabase-Dashboard → Settings → Usage → "Disk IO Budget consumed today" — User kann selbst tracken, Alert kommt wenn ~80% verbraucht

---

## 7. Entscheidungen

1. ~~Go für Tier 1?~~ → **Ja, umgesetzt in rc49 (2026-04-23 Abend).**
2. ~~Cron-Frequenz?~~ → `*/15` gewählt, live auf VPS.
3. **Upgrade-Schwelle** — ab welchem IO-Budget-Verbrauch (z.B. >70 % täglich nach Tier-1) sollten wir auf kostenpflichtigen Plan wechseln? **OFFEN** — abhängig von Monitoring 2026-04-24+.

---

**Author:** Robin Seckler · rseckler@gmail.com
**Status:** Tier 1 implementiert. Monitoring läuft.
