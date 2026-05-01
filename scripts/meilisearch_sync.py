#!/usr/bin/env python3
"""
Meilisearch Sync — Postgres "Release" → Meilisearch (commerce + discovery).

Modes:
  python3 meilisearch_sync.py                  # Delta-Sync (default, for cron)
  python3 meilisearch_sync.py --full-rebuild   # Index-Swap — rebuild both profiles
  python3 meilisearch_sync.py --apply-settings # Push settings.json (idempotent)
  python3 meilisearch_sync.py --cleanup        # Remove orphaned docs from Meili
  python3 meilisearch_sync.py --dry-run        # Count-only, no writes
  python3 meilisearch_sync.py --pg-url URL     # Override DB URL
  python3 meilisearch_sync.py --meili-url URL  # Override Meili URL

Architecture (see docs/optimizing/SEARCH_MEILISEARCH_PLAN.md):
  - Two indexes: releases-commerce (in_stock/has_cover boost) + releases-discovery
    (discogs_last_synced boost). Same content, different rankingRules.
  - Delta selection: Release.search_indexed_at IS NULL  OR  hash-diff.
  - Tasks-API wait-on-completion (no /stats polling).
  - Atomic index swap during --full-rebuild (zero downtime).

Cron:
  */5  * * * *   cd /root/VOD_Auctions/scripts && venv/bin/python3 meilisearch_sync.py >> meilisearch_sync.log 2>&1
  0    3 * * *   cd /root/VOD_Auctions/scripts && venv/bin/python3 meilisearch_sync.py --cleanup >> meilisearch_sync.log 2>&1

ENV:
  SUPABASE_DB_URL        — Postgres connection string (Session Pooler preferred)
  MEILI_URL              — default http://127.0.0.1:7700
  MEILI_ADMIN_API_KEY    — Meili admin key (derive from master via keys endpoint)
"""

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests

# Import sibling country-ISO map (scripts/data/country_iso.py)
sys.path.insert(0, str(Path(__file__).parent))
from data.country_iso import lookup_iso  # noqa: E402

SCRIPT_VERSION = "meilisearch_sync.py v1.0.0"

PROFILES = ("commerce", "discovery")
INDEX_NAME = "releases-{profile}"
STAGING_INDEX = "releases-{profile}-staging"

BATCH_SIZE = 1000
TASK_TIMEOUT_MS = 60_000

# rc49.1 IO-Fix: Chunked delta fetch to survive statement_timeout under load.
# Phase 1 query fetches only IDs (cheap, uses idx_release_search_indexed_at_null
# partial index). Phase 2 fetches full rows in chunks of DB_FETCH_CHUNK_SIZE,
# with CTEs (inv_agg, imp_agg) narrowed via WHERE release_id = ANY(ids) so they
# don't scan the full erp_inventory_item / import_log tables per batch.
DB_FETCH_CHUNK_SIZE = 5000

# Postgres statement_timeout for this script's connections. Default DB role
# has '2min'. Full-rebuild fetch_all_rows can take >2min under load when the
# 52k × CTE-join plan spills cache — so we bump to 5min. Setting it at the
# connection level (SET LOCAL wouldn't persist across commits) rather than
# per-query means every cursor on this connection inherits it.
CONNECTION_STATEMENT_TIMEOUT = "5min"

RANKING_RULES = {
    "commerce": [
        "words", "typo", "proximity", "attribute", "exactness",
        "sort",
        "in_stock:desc",
        "has_cover:desc",
        "cohort_a:desc",
        "is_purchasable:desc",
    ],
    "discovery": [
        "words", "typo", "proximity", "attribute", "exactness",
        "sort",
        "discogs_last_synced:desc",
    ],
}


# ═══════════════════════════════════════════════════════════════════════════
# Connection helpers
# ═══════════════════════════════════════════════════════════════════════════

def get_pg_conn(url_override=None):
    db_url = url_override or os.getenv("SUPABASE_DB_URL")
    if not db_url:
        sys.exit("ERROR: SUPABASE_DB_URL not set")
    conn = psycopg2.connect(db_url)
    with conn.cursor() as cur:
        cur.execute(f"SET statement_timeout = '{CONNECTION_STATEMENT_TIMEOUT}'")
    conn.commit()
    return conn


def get_meili_url(override=None):
    return override or os.getenv("MEILI_URL", "http://127.0.0.1:7700")


def get_meili_admin_key():
    key = os.getenv("MEILI_ADMIN_API_KEY")
    if not key:
        sys.exit("ERROR: MEILI_ADMIN_API_KEY not set")
    return key


def meili_request(method, path, json_body=None, url_override=None,
                  ok_statuses=(200, 201, 202, 204)):
    """Generic Meili HTTP. ok_statuses controls what counts as success —
    e.g. DELETE on non-existent index returns 404 which is a no-op."""
    base = get_meili_url(url_override)
    headers = {
        "Authorization": f"Bearer {get_meili_admin_key()}",
        "Content-Type": "application/json",
    }
    r = requests.request(
        method, f"{base}{path}",
        headers=headers, json=json_body, timeout=30,
    )
    if r.status_code not in ok_statuses:
        # Include body in error for easier debugging
        try:
            body = r.json()
        except Exception:
            body = r.text
        raise RuntimeError(
            f"Meili {method} {path} → {r.status_code}: {body}"
        )
    return r.json() if r.content else {}


def wait_for_task(task_uid, timeout_ms=TASK_TIMEOUT_MS):
    """Poll /tasks/:uid until succeeded/failed. Raises on failure/timeout.

    Tolerates transient 404s on the very first polls — Meili enqueues a
    taskUid synchronously but the task row in /tasks may take a moment to
    become queryable (observed on swap-indexes right after heavy document
    batch pushes). 404 counts as 'not yet visible', we retry up to 5s."""
    if task_uid is None:
        return None
    deadline = time.time() + (timeout_ms / 1000.0)
    not_found_deadline = time.time() + 5.0
    while time.time() < deadline:
        try:
            task = meili_request("GET", f"/tasks/{task_uid}")
        except RuntimeError as e:
            # 404 during the first ~5s: task not yet indexed in /tasks — retry.
            if "404" in str(e) and time.time() < not_found_deadline:
                time.sleep(0.5)
                continue
            raise
        status = task.get("status")
        if status == "succeeded":
            return task
        if status == "failed":
            raise RuntimeError(
                f"Meili task {task_uid} failed: {task.get('error')}"
            )
        if status == "canceled":
            raise RuntimeError(f"Meili task {task_uid} was canceled")
        time.sleep(0.5)
    raise TimeoutError(f"Meili task {task_uid} timeout after {timeout_ms}ms")


# ═══════════════════════════════════════════════════════════════════════════
# Row fetch + transform
# ═══════════════════════════════════════════════════════════════════════════

# STOCKTAKE_STALE_DAYS muss identisch zum Postgres-Fallback-SQL bleiben
# (backend/src/api/admin/media/route-postgres-fallback.ts::stocktake === "stale"
# nutzt NOW() - INTERVAL '90 days'). Single-Source-of-Truth s. Plan §4.A.4.
STOCKTAKE_STALE_DAYS = 90

# BASE_SELECT_SQL (rc49 IO-Fix):
# Vorher 11 korrelierte Subqueries pro Row (580k Executions bei Full-Rebuild,
# 8.59 GB Disk-Reads kumulativ — Supabase-Alert). Jetzt 2 aggregate CTEs (inv_agg,
# imp_agg), die je EIN Mal über ihre Source-Tabellen laufen und per LEFT JOIN
# ans Release geklebt werden. Erwartete Einsparung ~40-50× Disk-IO.
# Semantik identisch — Paritätsmatrix (admin_meili_data_parity.py) validiert.
_MAIN_SELECT = """
    SELECT
        r.id,
        r.title,
        r.slug,
        r."catalogNumber"      AS catalog_number,
        r.article_number,
        r.format,
        r.format_id,
        r.format_v2,
        r.format_descriptors,
        r.product_category,
        r.year,
        r.country,
        r."coverImage"         AS cover_image,
        r.legacy_price,
        r.shop_price,
        r.estimated_value,
        r.legacy_available,
        r.sale_mode,
        r.auction_status,
        r.discogs_id,
        r.discogs_lowest_price,
        r.discogs_median_price,
        r.discogs_highest_price,
        r.discogs_num_for_sale,
        r.discogs_last_synced,
        r.media_condition,
        r.sleeve_condition,
        r."updatedAt"          AS updated_at,
        a.name                 AS artist_name,
        a.slug                 AS artist_slug,
        l.name                 AS label_name,
        l.slug                 AS label_slug,
        p.name                 AS press_orga_name,
        p.slug                 AS press_orga_slug,
        f.name                 AS format_name,
        f.format_group         AS format_group_raw,
        f.kat                  AS format_kat,
        ec.genre_tags          AS genres,
        COALESCE(inv_agg.exemplar_count, 0)   AS exemplar_count,
        COALESCE(inv_agg.verified_count, 0)   AS verified_count,
        inv_agg.inventory_status_first,
        inv_agg.price_locked_first,
        inv_agg.inventory_barcode_first,
        inv_agg.last_stocktake_at_max,
        wl.code                AS warehouse_code_first,
        wl.id                  AS warehouse_id_first,
        wl.name                AS warehouse_name_first,
        imp_agg.collections    AS import_collections_arr,
        imp_agg.actions        AS import_actions_arr
    FROM "Release" r
    LEFT JOIN "Artist"    a  ON a.id = r."artistId"
    LEFT JOIN "Label"     l  ON l.id = r."labelId"
    LEFT JOIN "PressOrga" p  ON p.id = r."pressOrgaId"
    LEFT JOIN "Format"    f  ON f.id = r.format_id
    LEFT JOIN entity_content ec
      ON ec.entity_id = r."artistId" AND ec.entity_type = 'artist'
    LEFT JOIN inv_agg ON inv_agg.release_id = r.id
    LEFT JOIN imp_agg ON imp_agg.release_id = r.id
    LEFT JOIN warehouse_location wl ON wl.id = inv_agg.warehouse_id_first
"""

# CTE preludes — "full" for --full-rebuild & fetch_all_rows, "by-ids" for
# chunked delta fetch (narrows CTEs to the IDs in the current batch, so
# inv_agg / imp_agg don't scan the full tables per chunk).
_CTE_PRELUDE_FULL = """
    WITH inv_agg AS (
        SELECT
            release_id,
            COUNT(*)::int AS exemplar_count,
            COUNT(*) FILTER (WHERE last_stocktake_at IS NOT NULL)::int AS verified_count,
            MAX(last_stocktake_at) AS last_stocktake_at_max,
            (array_agg(status ORDER BY COALESCE(copy_number, 1) ASC))[1] AS inventory_status_first,
            (array_agg(price_locked ORDER BY COALESCE(copy_number, 1) ASC))[1] AS price_locked_first,
            (array_agg(barcode ORDER BY COALESCE(copy_number, 1) ASC))[1] AS inventory_barcode_first,
            (array_agg(warehouse_location_id ORDER BY COALESCE(copy_number, 1) ASC))[1] AS warehouse_id_first
        FROM erp_inventory_item
        GROUP BY release_id
    ),
    imp_agg AS (
        SELECT
            release_id,
            array_agg(DISTINCT collection_name) FILTER (WHERE collection_name IS NOT NULL) AS collections,
            array_agg(DISTINCT action) FILTER (WHERE action IS NOT NULL) AS actions
        FROM import_log
        WHERE import_type = 'discogs_collection'
        GROUP BY release_id
    )
"""

_CTE_PRELUDE_BY_IDS = """
    WITH inv_agg AS (
        SELECT
            release_id,
            COUNT(*)::int AS exemplar_count,
            COUNT(*) FILTER (WHERE last_stocktake_at IS NOT NULL)::int AS verified_count,
            MAX(last_stocktake_at) AS last_stocktake_at_max,
            (array_agg(status ORDER BY COALESCE(copy_number, 1) ASC))[1] AS inventory_status_first,
            (array_agg(price_locked ORDER BY COALESCE(copy_number, 1) ASC))[1] AS price_locked_first,
            (array_agg(barcode ORDER BY COALESCE(copy_number, 1) ASC))[1] AS inventory_barcode_first,
            (array_agg(warehouse_location_id ORDER BY COALESCE(copy_number, 1) ASC))[1] AS warehouse_id_first
        FROM erp_inventory_item
        WHERE release_id = ANY(%(ids)s)
        GROUP BY release_id
    ),
    imp_agg AS (
        SELECT
            release_id,
            array_agg(DISTINCT collection_name) FILTER (WHERE collection_name IS NOT NULL) AS collections,
            array_agg(DISTINCT action) FILTER (WHERE action IS NOT NULL) AS actions
        FROM import_log
        WHERE release_id = ANY(%(ids)s) AND import_type = 'discogs_collection'
        GROUP BY release_id
    )
"""

BASE_SELECT_SQL = _CTE_PRELUDE_FULL + _MAIN_SELECT
BASE_SELECT_SQL_BY_IDS = _CTE_PRELUDE_BY_IDS + _MAIN_SELECT + "\n    WHERE r.id = ANY(%(ids)s)"


def fetch_all_rows(pg_conn):
    cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(BASE_SELECT_SQL)
    rows = cur.fetchall()
    cur.close()
    return rows


def fetch_delta_ids(pg_conn):
    """Phase 1 of chunked delta: cheap query returning only IDs of rows that
    need reindex. Uses idx_release_search_indexed_at_null partial index → ~4ms
    on 52k rows.

    Single-branch design (rc52.6.5+): the canonical reindex signal is
    Release.search_indexed_at IS NULL — set by trigger_release_indexed_at_self
    on whitelisted-field changes, by legacy_sync_v2.py explicit bumps, and by
    every admin write-path. Older versions also OR'ed a LEFT JOIN to detect
    orphan/state-stale cases, which forced a Seq Scan on Release+state (1.7s).
    Those edge cases are now handled by:
      • Orphan detect (Release without state row): meilisearch_drift_check.py
        compares COUNT(*) against Meili every hour.
      • State drift (state.indexed_at < release.search_indexed_at): not a
        reindex signal at all — it just means a hash-unchanged path bumped
        release.search_indexed_at without touching state. Harmless.

    Returns: list of Release.id strings, sorted for stable chunking."""
    sql = """
        SELECT r.id
        FROM "Release" r
        WHERE r.search_indexed_at IS NULL
        ORDER BY r.id
    """
    cur = pg_conn.cursor()
    cur.execute(sql)
    ids = [row[0] for row in cur.fetchall()]
    cur.close()
    return ids


def fetch_rows_by_ids(pg_conn, ids):
    """Phase 2 of chunked delta: fetch full rows for a given ID list.
    Narrows the CTEs via WHERE release_id = ANY(ids) so inv_agg / imp_agg
    don't scan the full erp_inventory_item / import_log tables per chunk."""
    if not ids:
        return []
    cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(BASE_SELECT_SQL_BY_IDS, {"ids": list(ids)})
    rows = cur.fetchall()
    cur.close()
    return rows


def _to_float(v):
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _compute_format_group(row):
    """
    Spiegel der Postgres-Filterlogik in route-postgres-fallback.ts `category`
    switch. Wird für Meili's `format_group` verwendet.

    rc52.5.2: format_v2 (71-Wert-Whitelist) gewinnt vor dem Legacy-`format`-
    Enum, falls beide divergieren. Sonst bleibt z.B. ein VHS-Item das via
    Discogs-Apply zu Vinyl-LP-2 korrigiert wurde in der VHS-Kategorie weil
    der Legacy-`format`-Wert nicht mitgepflegt wurde.

    Wichtig (rc48 Parity-Fix): format_id kann NULL sein (Non-Discogs-Import-
    Pfad), dann fällt zurück auf format-enum-Match für CASSETTE/REEL → tapes
    bzw. LP → vinyl. Gleiches Verhalten wie Postgres:
      `(Format.kat=1 OR (format_id IS NULL AND format IN ('CASSETTE','REEL')))`
    """
    fmt_enum = (row["format"] or "").upper() if row["format"] else ""
    v2 = row.get("format_v2") or ""
    kat = row["format_kat"]
    prod_cat = row["product_category"]

    if prod_cat in ("band_literature", "label_literature", "press_literature"):
        return prod_cat
    # format_v2 wins over Legacy-format
    if v2:
        if v2.startswith("Vinyl-") or v2 == "Flexi" or v2.startswith("Lathe-Cut") or v2 == "Acetate" or v2 == "Shellac":
            return "vinyl"
        if v2.startswith("Tape"):
            return "tapes"
        if v2 in ("Reel", "Reel-2"):
            return "tapes"
        if v2.startswith("CD") and not v2.startswith("CDV"):
            return "cd"  # CD, CDr, CD-2..16, CDr-2 → cd; CDV → vhs
        if v2 in ("CDV", "VHS", "DVD", "DVDr", "Blu-ray"):
            return "vhs"
    if kat == 2 or fmt_enum == "LP":
        return "vinyl"
    if fmt_enum == "CD":
        return "cd"
    if fmt_enum == "VHS":
        return "vhs"
    if kat == 1:
        return "tapes"
    # Fallback wenn format_id fehlt: format-enum-Match
    if kat is None and fmt_enum in ("CASSETTE", "REEL"):
        return "tapes"
    return "other"


def transform_to_doc(row):
    """Map DB-row → Meilisearch doc per §3.2 of SEARCH_MEILISEARCH_PLAN.

    Preis-Modell rc47.x: shop_price ist der einzige Shop-Preis. legacy_price
    ist nur Historie (MySQL-tape-mag-Import) und wird NICHT mehr als
    Fallback für den Shop-Preis benutzt. Ein Item erscheint nur mit Preis
    im Shop wenn (a) shop_price > 0 und (b) mindestens ein verifiziertes
    Exemplar existiert. Der Toggle `catalog_visibility='all'` zeigt Items
    ohne shop_price ohne Preis-Tag.
    """
    shop = _to_float(row["shop_price"])
    legacy = _to_float(row["legacy_price"])  # info only
    estimated = _to_float(row.get("estimated_value"))
    verified_count = int(row["verified_count"] or 0)
    exemplar_count = int(row["exemplar_count"] or 0)

    has_shop_price = shop is not None and shop > 0
    has_verified_inventory = verified_count > 0
    shop_visible_with_price = has_shop_price and has_verified_inventory
    effective = shop if shop_visible_with_price else None
    has_price = shop_visible_with_price
    # rc49.7: legacy_available nicht mehr im is_purchasable-Gate.
    # Frank's Verify+price_locked ist Authority — sonst werden Items
    # die tape-mag historisch verkauft hatte (legacy_available=false)
    # fälschlich als nicht-kaufbar markiert trotz verifiziertem Bestand.
    # Entspricht PRICING_MODEL.md §Shop-Visibility-Gate.
    is_purchasable = shop_visible_with_price

    year = row["year"]
    decade = (year // 10) * 10 if year else None

    discogs_synced = row["discogs_last_synced"]
    updated_at = row["updated_at"]
    last_stocktake = row.get("last_stocktake_at_max")

    # stocktake_state (berechnet, Spiegel zum Postgres-Filter in
    # route-postgres-fallback.ts — STOCKTAKE_STALE_DAYS ist Single-Source
    # siehe oben). Kategorien:
    #   "never"   = kein erp_inventory_item ODER last_stocktake_at IS NULL
    #   "done"    = last_stocktake_at >= NOW() - 90d
    #   "stale"   = last_stocktake_at < NOW() - 90d
    # Für Postgres-Parität: "pending" = exemplar exists + last_stocktake NULL
    # (wird hier auf "never" gemappt wenn kein exemplar, "pending" wenn exemplar
    # aber nie verifiziert).
    if exemplar_count == 0:
        stocktake_state = "none"
    elif last_stocktake is None:
        stocktake_state = "pending"
    else:
        age_days = (datetime.now(last_stocktake.tzinfo) - last_stocktake).days if last_stocktake else None
        if age_days is not None and age_days >= STOCKTAKE_STALE_DAYS:
            stocktake_state = "stale"
        else:
            stocktake_state = "done"

    # Inventory-first-exemplar-Felder (analog zum Postgres inventorySub)
    inventory_status = row.get("inventory_status_first")
    price_locked = bool(row.get("price_locked_first")) if row.get("price_locked_first") is not None else None
    inventory_barcode = row.get("inventory_barcode_first")
    warehouse_code = row.get("warehouse_code_first")
    warehouse_id = row.get("warehouse_id_first")
    warehouse_name = row.get("warehouse_name_first")
    import_collections = list(row.get("import_collections_arr") or [])
    import_actions = list(row.get("import_actions_arr") or [])

    return {
        "id": row["id"],  # keep dashes — Meili 1.x accepts [a-zA-Z0-9_-]
        "release_id": row["id"],
        "title": row["title"],
        "slug": row.get("slug"),
        "artist_name": row["artist_name"],
        "artist_slug": row["artist_slug"],
        "label_name": row["label_name"],
        "label_slug": row["label_slug"],
        "press_orga_name": row["press_orga_name"],
        "press_orga_slug": row["press_orga_slug"],
        "format": row["format"],
        "format_name": row["format_name"],
        "format_group": _compute_format_group(row),
        "format_id": row["format_id"],
        "format_v2": row["format_v2"],
        "format_descriptors": row["format_descriptors"],
        "product_category": row["product_category"],
        "year": year,
        "decade": decade,
        "country": row["country"],
        "country_code": lookup_iso(row["country"]),
        "catalog_number": row["catalog_number"],
        "article_number": row["article_number"],
        "genres": list(row["genres"]) if row["genres"] else [],
        "styles": [],  # placeholder — add when entity_content.style_tags exists
        "cover_image": row["cover_image"],
        "has_cover": bool(row["cover_image"]),
        "has_image": bool(row["cover_image"]),  # Admin-Alias fürs Catalog-Filter
        "has_discogs": row["discogs_id"] is not None,
        "legacy_price": legacy,
        "shop_price": shop,
        "effective_price": effective,
        "estimated_value": estimated,
        "has_price": has_price,
        "is_purchasable": is_purchasable,
        "legacy_available": bool(row["legacy_available"]),
        "sale_mode": row["sale_mode"],
        "auction_status": row["auction_status"],
        "discogs_id": row["discogs_id"],
        "discogs_lowest_price": _to_float(row["discogs_lowest_price"]),
        "discogs_median_price": _to_float(row["discogs_median_price"]),
        "discogs_highest_price": _to_float(row["discogs_highest_price"]),
        "discogs_num_for_sale": row["discogs_num_for_sale"],
        "discogs_last_synced": int(discogs_synced.timestamp()) if discogs_synced else 0,
        "exemplar_count": exemplar_count,
        "verified_count": verified_count,
        "has_inventory": exemplar_count > 0,
        "in_stock": exemplar_count > 0,
        "cohort_a": shop is not None and shop > 0,
        # Admin-Felder (rc48 Phase 2)
        "inventory_status": inventory_status,
        "price_locked": price_locked,
        "inventory_barcode": inventory_barcode,
        "warehouse_code": warehouse_code,
        "warehouse_id": warehouse_id,
        "warehouse_name": warehouse_name,
        "import_collections": import_collections,
        "import_actions": import_actions,
        "stocktake_state": stocktake_state,
        "last_stocktake_at": int(last_stocktake.timestamp()) if last_stocktake else 0,
        "media_condition": row.get("media_condition"),
        "sleeve_condition": row.get("sleeve_condition"),
        "popularity_score": 0,
        "indexed_at": int(time.time()),
        "updated_at": updated_at.isoformat() if updated_at else None,
        "updated_at_ts": int(updated_at.timestamp()) if updated_at else 0,
    }


def doc_hash(doc):
    """SHA-256 of the doc WITHOUT indexed_at (otherwise every sync invalidates)."""
    copy = {k: v for k, v in doc.items() if k != "indexed_at"}
    return hashlib.sha256(
        json.dumps(copy, sort_keys=True, default=str).encode()
    ).hexdigest()


# ═══════════════════════════════════════════════════════════════════════════
# State table (hash-diff) + Postgres bumps
# ═══════════════════════════════════════════════════════════════════════════

def load_existing_hashes(pg_conn):
    cur = pg_conn.cursor()
    cur.execute("SELECT release_id, doc_hash FROM meilisearch_index_state")
    rows = dict(cur.fetchall())
    cur.close()
    return rows


def update_state_and_bump_indexed_at(pg_conn, docs, dry_run=False):
    """After a successful batch push:
       1. INSERT/UPDATE hash + indexed_at in meilisearch_index_state
       2. UPDATE "Release" SET search_indexed_at = NOW() so delta-query
          won't re-fetch these rows (unless a trigger bumps them again).
    """
    if dry_run or not docs:
        return
    cur = pg_conn.cursor()
    rows = [(d["release_id"], doc_hash(d)) for d in docs]
    psycopg2.extras.execute_values(
        cur,
        """INSERT INTO meilisearch_index_state (release_id, indexed_at, doc_hash)
           VALUES %s
           ON CONFLICT (release_id) DO UPDATE SET
             indexed_at = NOW(),
             doc_hash = EXCLUDED.doc_hash""",
        rows,
        template="(%s, NOW(), %s)",
    )
    cur.execute(
        'UPDATE "Release" SET search_indexed_at = NOW() WHERE id = ANY(%s)',
        ([d["release_id"] for d in docs],),
    )
    pg_conn.commit()
    cur.close()


def mark_unchanged_as_indexed(pg_conn, release_ids, dry_run=False):
    """For docs the hash-diff filtered out: still bump search_indexed_at
    so delta-query doesn't re-pick them."""
    if dry_run or not release_ids:
        return
    cur = pg_conn.cursor()
    cur.execute(
        'UPDATE "Release" SET search_indexed_at = NOW() WHERE id = ANY(%s)',
        (list(release_ids),),
    )
    pg_conn.commit()
    cur.close()


# ═══════════════════════════════════════════════════════════════════════════
# Meili operations
# ═══════════════════════════════════════════════════════════════════════════

def push_batch(profile, docs, staging=False, dry_run=False):
    if not docs:
        return
    index = (STAGING_INDEX if staging else INDEX_NAME).format(profile=profile)
    if dry_run:
        print(f"  [dry-run] would push {len(docs)} docs to {index}")
        return
    resp = meili_request("POST", f"/indexes/{index}/documents", docs)
    wait_for_task(resp.get("taskUid"))


def ensure_index(uid, primary_key="id"):
    """Create index if it doesn't exist. 409 = already exists = no-op."""
    meili_request(
        "POST", "/indexes",
        {"uid": uid, "primaryKey": primary_key},
        ok_statuses=(200, 201, 202, 409),
    )


def apply_settings(dry_run=False):
    """Push settings.json + profile-specific rankingRules to BOTH indexes.
    Idempotent; safe to re-run after settings.json edits."""
    settings_path = Path(__file__).parent / "meilisearch_settings.json"
    base_settings = json.loads(settings_path.read_text())
    # primaryKey belongs to POST /indexes, not PATCH /settings. Strip if present.
    base_settings.pop("primaryKey", None)

    for profile in PROFILES:
        index = INDEX_NAME.format(profile=profile)
        ensure_index(index)

        settings = dict(base_settings)
        settings["rankingRules"] = RANKING_RULES[profile]

        if dry_run:
            print(f"  [dry-run] would apply settings to {index}")
            continue

        resp = meili_request("PATCH", f"/indexes/{index}/settings", settings)
        wait_for_task(resp.get("taskUid"))
        print(f"  Applied settings to {index}")


# ═══════════════════════════════════════════════════════════════════════════
# Modes
# ═══════════════════════════════════════════════════════════════════════════

def delta_sync(pg_conn, dry_run=False):
    t0 = time.time()
    candidate_ids = fetch_delta_ids(pg_conn)
    print(f"Delta candidates: {len(candidate_ids)}")

    if not candidate_ids:
        return

    existing_hashes = load_existing_hashes(pg_conn)

    total_pushed = 0
    total_unchanged = 0

    # Chunked fetch: survives statement_timeout even when the backlog is
    # 40k+ rows (e.g. after a mass search_indexed_at=NULL bump). Each chunk
    # fetch narrows the CTEs and typically completes in <30s.
    for chunk_start in range(0, len(candidate_ids), DB_FETCH_CHUNK_SIZE):
        chunk_ids = candidate_ids[chunk_start:chunk_start + DB_FETCH_CHUNK_SIZE]
        rows = fetch_rows_by_ids(pg_conn, chunk_ids)

        to_push = []
        unchanged_ids = []
        for row in rows:
            doc = transform_to_doc(row)
            if existing_hashes.get(row["id"]) != doc_hash(doc):
                to_push.append(doc)
            else:
                unchanged_ids.append(row["id"])

        print(
            f"  Chunk {chunk_start // DB_FETCH_CHUNK_SIZE + 1}: "
            f"{len(rows)} rows → {len(to_push)} push, {len(unchanged_ids)} unchanged"
        )

        mark_unchanged_as_indexed(pg_conn, unchanged_ids, dry_run)

        for i in range(0, len(to_push), BATCH_SIZE):
            batch = to_push[i:i + BATCH_SIZE]
            for profile in PROFILES:
                push_batch(profile, batch, staging=False, dry_run=dry_run)
            update_state_and_bump_indexed_at(pg_conn, batch, dry_run)

        total_pushed += len(to_push)
        total_unchanged += len(unchanged_ids)

    dt = int((time.time() - t0) * 1000)
    print(json.dumps({
        "event": "meili_delta_done",
        "candidates": len(candidate_ids),
        "pushed": total_pushed,
        "unchanged": total_unchanged,
        "chunks": (len(candidate_ids) + DB_FETCH_CHUNK_SIZE - 1) // DB_FETCH_CHUNK_SIZE,
        "duration_ms": dt,
    }))


def full_rebuild(pg_conn, dry_run=False):
    """Build fresh staging indexes, atomic swap at the end."""
    print("Full rebuild — building staging indexes for both profiles ...")
    t0 = time.time()

    # Prepare staging: delete-if-exists (404-tolerant), create, copy prod settings
    for profile in PROFILES:
        prod = INDEX_NAME.format(profile=profile)
        staging = STAGING_INDEX.format(profile=profile)

        # Tolerate stale staging from a failed previous rebuild
        try:
            resp = meili_request(
                "DELETE", f"/indexes/{staging}",
                ok_statuses=(200, 202, 204, 404),
            )
            if resp.get("taskUid"):
                try:
                    wait_for_task(resp["taskUid"], timeout_ms=10_000)
                except Exception:
                    pass
        except Exception:
            pass

        if dry_run:
            print(f"  [dry-run] would (re-)create staging {staging}")
            continue

        ensure_index(staging)
        # Mirror prod settings onto staging
        try:
            prod_settings = meili_request("GET", f"/indexes/{prod}/settings")
        except RuntimeError:
            # Prod doesn't exist yet — use settings.json
            settings_path = Path(__file__).parent / "meilisearch_settings.json"
            prod_settings = json.loads(settings_path.read_text())
            prod_settings["rankingRules"] = RANKING_RULES[profile]
        resp = meili_request("PATCH", f"/indexes/{staging}/settings", prod_settings)
        wait_for_task(resp.get("taskUid"))

    # Push all docs into staging
    rows = fetch_all_rows(pg_conn)
    print(f"  Total releases: {len(rows)}")
    docs = [transform_to_doc(r) for r in rows]

    for i in range(0, len(docs), BATCH_SIZE):
        batch = docs[i:i + BATCH_SIZE]
        for profile in PROFILES:
            push_batch(profile, batch, staging=True, dry_run=dry_run)
        print(f"  Batch {i // BATCH_SIZE + 1}: {len(batch)} docs")

    if dry_run:
        return

    # Make sure prod indexes exist before swapping (first-run case)
    for profile in PROFILES:
        ensure_index(INDEX_NAME.format(profile=profile))

    # Atomic swap for both profiles in one call
    swap_payload = [
        {"indexes": [INDEX_NAME.format(profile=p), STAGING_INDEX.format(profile=p)]}
        for p in PROFILES
    ]
    resp = meili_request("POST", "/swap-indexes", swap_payload)
    wait_for_task(resp.get("taskUid"))

    # Cleanup staging
    for profile in PROFILES:
        staging = STAGING_INDEX.format(profile=profile)
        resp = meili_request(
            "DELETE", f"/indexes/{staging}",
            ok_statuses=(200, 202, 204, 404),
        )
        if resp.get("taskUid"):
            try:
                wait_for_task(resp["taskUid"], timeout_ms=10_000)
            except Exception:
                pass

    # Rewrite state table from scratch
    cur = pg_conn.cursor()
    cur.execute("TRUNCATE meilisearch_index_state")
    pg_conn.commit()
    cur.close()
    # Chunked update (avoid single huge transaction)
    for i in range(0, len(docs), BATCH_SIZE):
        update_state_and_bump_indexed_at(pg_conn, docs[i:i + BATCH_SIZE])

    dt = int((time.time() - t0) * 1000)
    print(json.dumps({
        "event": "meili_full_rebuild_done",
        "pushed": len(docs),
        "duration_ms": dt,
    }))


def cleanup_orphans(pg_conn, dry_run=False):
    """Delete Meili docs whose Release row no longer exists."""
    cur = pg_conn.cursor()
    cur.execute("""
        SELECT s.release_id
          FROM meilisearch_index_state s
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
        resp = meili_request(
            "POST", f"/indexes/{index}/documents/delete-batch", orphans,
        )
        wait_for_task(resp.get("taskUid"))

    cur = pg_conn.cursor()
    cur.execute(
        "DELETE FROM meilisearch_index_state WHERE release_id = ANY(%s)",
        (orphans,),
    )
    pg_conn.commit()
    cur.close()


# ═══════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════

def main():
    p = argparse.ArgumentParser(description=f"{SCRIPT_VERSION}")
    p.add_argument("--full-rebuild", action="store_true")
    p.add_argument("--apply-settings", action="store_true")
    p.add_argument("--cleanup", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--pg-url")
    p.add_argument("--meili-url")
    args = p.parse_args()

    # Allow --meili-url to override via env for the current process
    if args.meili_url:
        os.environ["MEILI_URL"] = args.meili_url

    pg_conn = get_pg_conn(args.pg_url)
    try:
        if args.apply_settings:
            apply_settings(args.dry_run)
            return
        if args.full_rebuild:
            full_rebuild(pg_conn, args.dry_run)
            return
        if args.cleanup:
            cleanup_orphans(pg_conn, args.dry_run)
            return
        # Default: delta
        delta_sync(pg_conn, args.dry_run)
    finally:
        pg_conn.close()


if __name__ == "__main__":
    main()
