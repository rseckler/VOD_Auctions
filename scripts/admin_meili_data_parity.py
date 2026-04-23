#!/usr/bin/env python3
"""
Direkt-Daten-Parität DB vs. Meilisearch (rc48 Phase 2, Plan §4.A).

Umgeht den HTTP-Admin-Endpoint und vergleicht direkt:
  - SQL-Query gegen Postgres
  - Äquivalenter Filter gegen Meilisearch via HTTP-Master-Key

Testet: sind die gleichen Release-IDs in beiden Stores bei identischem
Filter? Stimmen die Counts? Das ist der eigentliche Risikopunkt — Route-
Level-Parität (dass das TS-Filter-Builder-Logik den gleichen SQL-WHERE-
Ausdruck erzeugt) ist zweitrangig und kann manuell via Browser smoke-
getestet werden.

Nutzt dieselbe DB-Verbindung wie meilisearch_sync.py (SUPABASE_DB_URL aus
meili-cron-env.sh). Kein Admin-Cookie nötig.

Nutzung:
  source ~/VOD_Auctions/scripts/meili-cron-env.sh
  cd ~/VOD_Auctions/scripts
  venv/bin/python3 admin_meili_data_parity.py

Exit:
  0 = alle passed
  1 = mind. 1 failed
  2 = Config-/Network-Error
"""

import json
import os
import sys
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from typing import Optional

import psycopg2
import psycopg2.extras


MEILI_URL = os.environ.get("MEILI_URL", "http://127.0.0.1:7700")
MEILI_KEY = os.environ.get("MEILI_MASTER_KEY") or os.environ.get("MEILI_ADMIN_API_KEY")
DB_URL = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
INDEX = "releases-commerce"

# Gleicher Threshold wie Meili-Sync
STOCKTAKE_STALE_DAYS = 90

COMPARE_LIMIT = 100  # erste N IDs vergleichen (Pagination-relevante Fenster)


# ── Test-Cases ─────────────────────────────────────────────────────────
#
# Jeder Case ist (name, pg_where_clause, meili_filter). SELECT-Liste und
# JOIN-Struktur sind unten konstant. Wenn ein Filter einen JOIN braucht,
# ist das im `pg_joins` vermerkt.
CASES = [
    # ── single_filter ───────────────────────────────────────────────────
    {
        "group": "single_filter",
        "name": "baseline_no_filter",
        "pg_where": "TRUE",
        "meili_filter": None,
    },
    {
        "group": "single_filter",
        "name": "format_lp",
        "pg_where": "r.format = 'LP'",
        "meili_filter": 'format = "LP"',
    },
    {
        "group": "single_filter",
        "name": "format_cassette",
        "pg_where": "r.format = 'CASSETTE'",
        "meili_filter": 'format = "CASSETTE"',
    },
    {
        "group": "single_filter",
        "name": "category_band_literature",
        "pg_where": "r.product_category = 'band_literature'",
        "meili_filter": 'product_category = "band_literature"',
    },
    {
        "group": "single_filter",
        "name": "category_label_literature",
        "pg_where": "r.product_category = 'label_literature'",
        "meili_filter": 'product_category = "label_literature"',
    },
    {
        "group": "single_filter",
        "name": "category_press_literature",
        "pg_where": "r.product_category = 'press_literature'",
        "meili_filter": 'product_category = "press_literature"',
    },
    {
        "group": "single_filter",
        "name": "year_1985",
        "pg_where": "r.year = 1985",
        "meili_filter": "year = 1985",
    },
    {
        "group": "single_filter",
        "name": "year_range_1980_1989",
        "pg_where": "r.year >= 1980 AND r.year <= 1989",
        "meili_filter": "year >= 1980 AND year <= 1989",
    },
    {
        "group": "single_filter",
        "name": "decade_1980",
        "pg_where": "r.year >= 1980 AND r.year <= 1989",
        "meili_filter": "decade = 1980",
    },
    {
        "group": "single_filter",
        "name": "country_germany",
        "pg_where": "r.country = 'Germany'",
        "meili_filter": 'country = "Germany"',
    },
    {
        "group": "single_filter",
        "name": "auction_reserved",
        "pg_where": "r.auction_status = 'reserved'",
        "meili_filter": 'auction_status = "reserved"',
    },
    {
        "group": "single_filter",
        "name": "has_discogs_yes",
        "pg_where": "r.discogs_id IS NOT NULL",
        "meili_filter": "has_discogs = true",
    },
    {
        "group": "single_filter",
        "name": "has_discogs_no",
        "pg_where": "r.discogs_id IS NULL",
        "meili_filter": "has_discogs = false",
    },
    {
        "group": "single_filter",
        "name": "has_image_yes",
        "pg_where": "r.\"coverImage\" IS NOT NULL AND r.\"coverImage\" != ''",
        "meili_filter": "has_image = true",
    },
    # ── Preis- und Inventory-Filter ────────────────────────────────────
    {
        "group": "computed_fields",
        "name": "is_purchasable_true",
        "pg_where": (
            "r.shop_price IS NOT NULL AND r.shop_price > 0 "
            "AND r.legacy_available = true "
            "AND EXISTS (SELECT 1 FROM erp_inventory_item ii "
            "  WHERE ii.release_id = r.id "
            "    AND ii.last_stocktake_at IS NOT NULL "
            "    AND ii.price_locked = true)"
        ),
        "meili_filter": "is_purchasable = true",
    },
    {
        "group": "computed_fields",
        "name": "has_price_true",
        "pg_where": (
            "r.shop_price IS NOT NULL AND r.shop_price > 0 "
            "AND EXISTS (SELECT 1 FROM erp_inventory_item ii "
            "  WHERE ii.release_id = r.id AND ii.last_stocktake_at IS NOT NULL)"
        ),
        "meili_filter": "has_price = true",
    },
    {
        "group": "computed_fields",
        "name": "has_inventory_true",
        "pg_where": "EXISTS (SELECT 1 FROM erp_inventory_item ii WHERE ii.release_id = r.id)",
        "meili_filter": "has_inventory = true",
    },
    {
        "group": "computed_fields",
        "name": "stocktake_done",
        "pg_where": (
            "EXISTS (SELECT 1 FROM erp_inventory_item ii WHERE ii.release_id = r.id) "
            "AND (SELECT MAX(last_stocktake_at) FROM erp_inventory_item ii WHERE ii.release_id = r.id) IS NOT NULL "
            "AND (SELECT MAX(last_stocktake_at) FROM erp_inventory_item ii WHERE ii.release_id = r.id) "
            f"    >= NOW() - INTERVAL '{STOCKTAKE_STALE_DAYS} days'"
        ),
        "meili_filter": 'stocktake_state = "done"',
    },
    {
        "group": "computed_fields",
        "name": "stocktake_pending",
        "pg_where": (
            "EXISTS (SELECT 1 FROM erp_inventory_item ii WHERE ii.release_id = r.id) "
            "AND (SELECT MAX(last_stocktake_at) FROM erp_inventory_item ii WHERE ii.release_id = r.id) IS NULL"
        ),
        "meili_filter": 'stocktake_state = "pending"',
    },
    {
        "group": "computed_fields",
        "name": "stocktake_stale",
        "pg_where": (
            "(SELECT MAX(last_stocktake_at) FROM erp_inventory_item ii WHERE ii.release_id = r.id) IS NOT NULL "
            "AND (SELECT MAX(last_stocktake_at) FROM erp_inventory_item ii WHERE ii.release_id = r.id) "
            f"    < NOW() - INTERVAL '{STOCKTAKE_STALE_DAYS} days'"
        ),
        "meili_filter": 'stocktake_state = "stale"',
    },
    {
        "group": "computed_fields",
        "name": "stocktake_none",
        "pg_where": "NOT EXISTS (SELECT 1 FROM erp_inventory_item ii WHERE ii.release_id = r.id)",
        "meili_filter": 'stocktake_state = "none"',
    },
    # ── Warehouse-Filter ───────────────────────────────────────────────
    {
        "group": "warehouse",
        "name": "warehouse_alpenstrasse",
        "pg_where": (
            "EXISTS (SELECT 1 FROM erp_inventory_item ii "
            "  JOIN warehouse_location wl ON wl.id = ii.warehouse_location_id "
            "  WHERE ii.release_id = r.id "
            "    AND ii.copy_number = 1 "
            "    AND wl.code = 'ALPENSTRASSE')"
        ),
        "meili_filter": 'warehouse_code = "ALPENSTRASSE"',
    },
    # ── Price-locked ──────────────────────────────────────────────────
    {
        "group": "inventory",
        "name": "price_locked_true",
        "pg_where": (
            "EXISTS (SELECT 1 FROM erp_inventory_item ii "
            "  WHERE ii.release_id = r.id "
            "    AND ii.copy_number = 1 "
            "    AND ii.price_locked = true)"
        ),
        "meili_filter": "price_locked = true",
    },
    # ── Sale-Mode ──────────────────────────────────────────────────────
    {
        "group": "single_filter",
        "name": "sale_mode_both",
        "pg_where": "r.sale_mode = 'both'",
        "meili_filter": 'sale_mode = "both"',
    },
    {
        "group": "single_filter",
        "name": "sale_mode_auction_only",
        "pg_where": "r.sale_mode = 'auction_only'",
        "meili_filter": 'sale_mode = "auction_only"',
    },
    # ── Format-Group (Category-Shorthand) ──────────────────────────────
    # Category "tapes" im Postgres: product_category=release AND Format.kat=1
    # (oder format in discogsTapeFormats wenn format_id NULL). Meili hat
    # format_group computed — wir vergleichen die Meili-Logik mit dem
    # simplen Match (category=release + format=CASSETTE/REEL OR format_group-
    # Computed-Logik). Komplexer als single_filter, in separater Gruppe.
    {
        "group": "category",
        "name": "format_group_tapes",
        "pg_where": (
            "r.product_category = 'release' "
            "AND r.format NOT IN ('CD', 'VHS') "
            "AND (f.kat = 1 OR (r.format_id IS NULL AND r.format IN ('CASSETTE', 'REEL')))"
        ),
        "pg_joins": 'LEFT JOIN "Format" f ON f.id = r.format_id',
        "meili_filter": 'format_group = "tapes"',
    },
    {
        "group": "category",
        "name": "format_group_vinyl",
        "pg_where": (
            "r.product_category = 'release' "
            "AND (f.kat = 2 OR (r.format_id IS NULL AND r.format IN ('LP')))"
        ),
        "pg_joins": 'LEFT JOIN "Format" f ON f.id = r.format_id',
        "meili_filter": 'format_group = "vinyl"',
    },
    # ── Search (FTS vs Meili semantic-search) ─────────────────────────
    # Kann nicht exakt verglichen werden (Meili macht Typo + Synonym,
    # Postgres tokenized FTS). Vergleichen wir IDs nur als SUBSET, nicht
    # exakt identisch. Wir überspringen in dieser Datenparitäts-Suite.
    # ── boundary ──────────────────────────────────────────────────────
    {
        "group": "boundary",
        "name": "year_0_empty",
        "pg_where": "r.year = 0",
        "meili_filter": "year = 0",
    },
]


# ── Helpers ─────────────────────────────────────────────────────────────

def meili_search(filter_expr: Optional[str], limit: int = COMPARE_LIMIT):
    url = f"{MEILI_URL}/indexes/{INDEX}/search"
    body = {
        "q": "",
        "limit": limit,
        "attributesToRetrieve": ["release_id"],
        # Stabile Ordering damit PG (ORDER BY r.id) und Meili identische
        # erste-N Ausschnitte liefern bei grossen Result-Sets
        "sort": ["release_id:asc"],
    }
    if filter_expr is not None:
        body["filter"] = filter_expr

    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {MEILI_KEY}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def pg_query(conn, where: str, joins: str = "", limit: int = COMPARE_LIMIT):
    cur = conn.cursor()
    sql = f"""
        SELECT r.id
        FROM "Release" r
        {joins}
        WHERE {where}
        ORDER BY r.id
        LIMIT {limit}
    """
    cur.execute(sql)
    ids = [row[0] for row in cur.fetchall()]
    cur.execute(
        f'SELECT COUNT(*) FROM "Release" r {joins} WHERE {where}'
    )
    total = cur.fetchone()[0]
    cur.close()
    return {"ids": ids, "count": total}


# ── Runner ──────────────────────────────────────────────────────────────

@dataclass
class Result:
    group: str
    name: str
    pg_count: Optional[int] = None
    meili_count: Optional[int] = None
    pg_ids: list = field(default_factory=list)
    meili_ids: list = field(default_factory=list)
    status: str = "pending"
    notes: list = field(default_factory=list)


def run_case(conn, case):
    r = Result(group=case["group"], name=case["name"])

    try:
        pg = pg_query(conn, case["pg_where"], case.get("pg_joins", ""))
        r.pg_count = pg["count"]
        r.pg_ids = pg["ids"]
    except Exception as e:
        r.status = "error"
        r.notes.append(f"pg error: {e}")
        return r

    try:
        mei = meili_search(case["meili_filter"])
        r.meili_count = mei.get("estimatedTotalHits", 0)
        r.meili_ids = sorted([h["release_id"] for h in mei.get("hits", [])])
    except Exception as e:
        r.status = "error"
        r.notes.append(f"meili error: {e}")
        return r

    # Vergleich
    r.pg_ids = sorted(r.pg_ids)  # PG order=r.id, vergleich als Set
    if r.pg_ids == r.meili_ids:
        # Ids identisch — Count auch?
        if r.pg_count == r.meili_count:
            r.status = "ok"
        else:
            delta = (
                abs(r.meili_count - r.pg_count) / max(r.pg_count, 1) * 100
                if r.pg_count > 0
                else 0
            )
            if delta <= 5:
                r.status = "ok"
                r.notes.append(
                    f"Count delta {delta:.1f}% (innerhalb 5%-Toleranz, IDs identisch)"
                )
            else:
                r.status = "warning"
                r.notes.append(
                    f"IDs identisch aber Count delta {delta:.1f}% (>5%) "
                    f"pg={r.pg_count} mei={r.meili_count}"
                )
    else:
        only_pg = set(r.pg_ids) - set(r.meili_ids)
        only_mei = set(r.meili_ids) - set(r.pg_ids)
        r.status = "failed"
        r.notes.append(
            f"Resultset unterschiedlich — only_pg={len(only_pg)} only_mei={len(only_mei)} "
            f"pg_count={r.pg_count} mei_count={r.meili_count}"
        )
        if only_pg:
            r.notes.append(f"First only_pg: {list(only_pg)[:3]}")
        if only_mei:
            r.notes.append(f"First only_mei: {list(only_mei)[:3]}")
    return r


def main():
    if not MEILI_KEY:
        print("ERROR: MEILI_MASTER_KEY/MEILI_ADMIN_API_KEY not in env", file=sys.stderr)
        return 2
    if not DB_URL:
        print("ERROR: SUPABASE_DB_URL/DATABASE_URL not in env", file=sys.stderr)
        return 2

    print(f"Connecting to Meili at {MEILI_URL}")
    print(f"Connecting to Postgres")
    conn = psycopg2.connect(DB_URL)

    results = []
    for i, case in enumerate(CASES):
        print(f"  [{i+1}/{len(CASES)}] {case['group']}/{case['name']} ...", end=" ", flush=True)
        r = run_case(conn, case)
        tag = {"ok": "OK", "warning": "WARN", "failed": "FAIL", "error": "ERR"}.get(
            r.status, "?"
        )
        print(f"{tag} (pg={r.pg_count} mei={r.meili_count})")
        results.append(r)

    conn.close()

    # Summary
    ok = sum(1 for r in results if r.status == "ok")
    warn = sum(1 for r in results if r.status == "warning")
    failed = sum(1 for r in results if r.status == "failed")
    error = sum(1 for r in results if r.status == "error")

    print()
    print("═" * 70)
    print(f"  PASSED:   {ok}")
    print(f"  WARNINGS: {warn}")
    print(f"  FAILED:   {failed}")
    print(f"  ERROR:    {error}")
    print("═" * 70)

    for r in results:
        if r.status in ("warning", "failed", "error"):
            tag = r.status.upper()
            print(f"  [{tag}] {r.group}/{r.name}")
            for note in r.notes:
                print(f"        {note}")

    return 0 if (failed == 0 and error == 0) else 1


if __name__ == "__main__":
    sys.exit(main())
