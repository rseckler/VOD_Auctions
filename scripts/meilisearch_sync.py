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
    return psycopg2.connect(db_url)


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

BASE_SELECT_SQL = """
    SELECT
        r.id,
        r.title,
        r.slug,
        r."catalogNumber"      AS catalog_number,
        r.article_number,
        r.format,
        r.format_id,
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
        (SELECT COUNT(*) FROM erp_inventory_item ii WHERE ii.release_id = r.id)
                               AS exemplar_count,
        (SELECT COUNT(*) FROM erp_inventory_item ii
          WHERE ii.release_id = r.id AND ii.last_stocktake_at IS NOT NULL)
                               AS verified_count,
        -- Inventory: first-exemplar-shaped Felder fuer Admin-Catalog-Listing,
        -- analog zum Postgres-Endpoint (route-postgres-fallback.ts inventorySub).
        (SELECT ii.status FROM erp_inventory_item ii
          WHERE ii.release_id = r.id
          ORDER BY COALESCE(ii.copy_number, 1) ASC LIMIT 1) AS inventory_status_first,
        (SELECT ii.price_locked FROM erp_inventory_item ii
          WHERE ii.release_id = r.id
          ORDER BY COALESCE(ii.copy_number, 1) ASC LIMIT 1) AS price_locked_first,
        (SELECT ii.barcode FROM erp_inventory_item ii
          WHERE ii.release_id = r.id
          ORDER BY COALESCE(ii.copy_number, 1) ASC LIMIT 1) AS inventory_barcode_first,
        (SELECT MAX(ii.last_stocktake_at) FROM erp_inventory_item ii
          WHERE ii.release_id = r.id) AS last_stocktake_at_max,
        (SELECT wl.code FROM erp_inventory_item ii
          LEFT JOIN warehouse_location wl ON wl.id = ii.warehouse_location_id
          WHERE ii.release_id = r.id
          ORDER BY COALESCE(ii.copy_number, 1) ASC LIMIT 1) AS warehouse_code_first,
        (SELECT wl.id FROM erp_inventory_item ii
          LEFT JOIN warehouse_location wl ON wl.id = ii.warehouse_location_id
          WHERE ii.release_id = r.id
          ORDER BY COALESCE(ii.copy_number, 1) ASC LIMIT 1) AS warehouse_id_first,
        (SELECT wl.name FROM erp_inventory_item ii
          LEFT JOIN warehouse_location wl ON wl.id = ii.warehouse_location_id
          WHERE ii.release_id = r.id
          ORDER BY COALESCE(ii.copy_number, 1) ASC LIMIT 1) AS warehouse_name_first,
        -- Import-Relationen: Array-Aggregation aus import_log fuer Admin-Filter
        -- "Import-Collection" + "Import-Action". Distinct weil ein Release
        -- mehrfach durch denselben Import-Run gehen kann.
        (SELECT array_agg(DISTINCT il.collection_name)
          FROM import_log il
          WHERE il.release_id = r.id AND il.import_type = 'discogs_collection'
            AND il.collection_name IS NOT NULL) AS import_collections_arr,
        (SELECT array_agg(DISTINCT il.action)
          FROM import_log il
          WHERE il.release_id = r.id AND il.import_type = 'discogs_collection'
            AND il.action IS NOT NULL) AS import_actions_arr
    FROM "Release" r
    LEFT JOIN "Artist"    a  ON a.id = r."artistId"
    LEFT JOIN "Label"     l  ON l.id = r."labelId"
    LEFT JOIN "PressOrga" p  ON p.id = r."pressOrgaId"
    LEFT JOIN "Format"    f  ON f.id = r.format_id
    LEFT JOIN entity_content ec
      ON ec.entity_id = r."artistId" AND ec.entity_type = 'artist'
"""


def fetch_all_rows(pg_conn):
    cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(BASE_SELECT_SQL)
    rows = cur.fetchall()
    cur.close()
    return rows


def fetch_delta_rows(pg_conn):
    """Releases where search_indexed_at IS NULL, or no state row, or
    state.indexed_at older than the latest bump."""
    sql = BASE_SELECT_SQL + """
        LEFT JOIN meilisearch_index_state s ON s.release_id = r.id
        WHERE r.search_indexed_at IS NULL
           OR s.release_id IS NULL
           OR s.indexed_at < r.search_indexed_at
    """
    cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(sql)
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
    fmt_enum = (row["format"] or "").upper() if row["format"] else ""
    kat = row["format_kat"]
    prod_cat = row["product_category"]

    if prod_cat in ("band_literature", "label_literature", "press_literature"):
        return prod_cat
    if kat == 2 or fmt_enum == "LP":
        return "vinyl"
    if fmt_enum == "CD":
        return "cd"
    if fmt_enum == "VHS":
        return "vhs"
    if kat == 1 and fmt_enum in ("CASSETTE", "REEL"):
        return "tapes"
    if kat == 1:
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
    is_purchasable = shop_visible_with_price and bool(row["legacy_available"])

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
    rows = fetch_delta_rows(pg_conn)
    print(f"Delta candidates: {len(rows)}")

    if not rows:
        return

    existing_hashes = load_existing_hashes(pg_conn)

    to_push = []
    unchanged_ids = []
    for row in rows:
        doc = transform_to_doc(row)
        if existing_hashes.get(row["id"]) != doc_hash(doc):
            to_push.append(doc)
        else:
            unchanged_ids.append(row["id"])

    print(f"  After hash-filter: {len(to_push)} push, {len(unchanged_ids)} unchanged")

    mark_unchanged_as_indexed(pg_conn, unchanged_ids, dry_run)

    for i in range(0, len(to_push), BATCH_SIZE):
        batch = to_push[i:i + BATCH_SIZE]
        for profile in PROFILES:
            push_batch(profile, batch, staging=False, dry_run=dry_run)
        update_state_and_bump_indexed_at(pg_conn, batch, dry_run)

    dt = int((time.time() - t0) * 1000)
    print(json.dumps({
        "event": "meili_delta_done",
        "candidates": len(rows),
        "pushed": len(to_push),
        "unchanged": len(unchanged_ids),
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
