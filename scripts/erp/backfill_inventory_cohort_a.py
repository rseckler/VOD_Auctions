#!/usr/bin/env python3
"""
Backfill erp_inventory_item + initial erp_inventory_movement for Cohort A.

Cohort A = all Releases with coverImage, legacy_price > 0, and legacy_available = true.
As of 2026-04-07 this is ~13,107 items (10,762 music + 2,345 literature).

Each eligible Release gets:
  1. One erp_inventory_item row (source='frank_collection', status='in_stock',
     tax_scheme='margin_scheme_25a', quantity=1)
  2. One erp_inventory_movement row (type='inbound', quantity_change=1,
     reason='Initial backfill Cohort A')

Idempotent: uses NOT EXISTS to skip already-backfilled releases.
Re-runnable: second run inserts 0 rows.

Usage:
    cd VOD_Auctions/scripts
    source venv/bin/activate

    # Dry-run (count only, no writes)
    python3 erp/backfill_inventory_cohort_a.py --dry-run

    # Against staging
    python3 erp/backfill_inventory_cohort_a.py --dry-run --pg-url "$STAGING_URL"

    # Real backfill against production
    python3 erp/backfill_inventory_cohort_a.py

Requires .env in project root with SUPABASE_DB_URL.
"""

import argparse
import json
import os
import sys
import time
import uuid
from pathlib import Path

import psycopg2
import psycopg2.extras

# Load .env from project root
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

BATCH_SIZE = 500


def get_pg_connection(pg_url_override=None):
    db_url = pg_url_override or os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("ERROR: SUPABASE_DB_URL not set and no --pg-url override")
        sys.exit(1)
    return psycopg2.connect(db_url)


def main():
    parser = argparse.ArgumentParser(description="Backfill erp_inventory_item for Cohort A")
    parser.add_argument("--dry-run", action="store_true", help="Count only, no writes")
    parser.add_argument("--pg-url", type=str, default=None, help="Override SUPABASE_DB_URL")
    args = parser.parse_args()

    print("=" * 60)
    print("ERP Inventory Backfill — Cohort A")
    print(f"Mode: {'DRY-RUN' if args.dry_run else 'REAL'}")
    print("=" * 60)

    conn = get_pg_connection(args.pg_url)
    cur = conn.cursor()

    # Count eligible releases (Cohort A definition)
    cur.execute("""
        SELECT COUNT(*) FROM "Release" r
        WHERE r."coverImage" IS NOT NULL
          AND r.legacy_price > 0
          AND r.legacy_available = true
          AND NOT EXISTS (SELECT 1 FROM erp_inventory_item ii WHERE ii.release_id = r.id)
    """)
    eligible = cur.fetchone()[0]

    # Also count already-backfilled for context
    cur.execute("SELECT COUNT(*) FROM erp_inventory_item WHERE source = 'frank_collection'")
    already_done = cur.fetchone()[0]

    print(f"\n  Eligible (not yet backfilled): {eligible}")
    print(f"  Already backfilled:           {already_done}")

    if eligible == 0:
        print("\n  Nothing to do — all eligible releases already have inventory items.")
        conn.close()
        return

    if args.dry_run:
        # Show breakdown by product_category
        cur.execute("""
            SELECT r.product_category, COUNT(*)
            FROM "Release" r
            WHERE r."coverImage" IS NOT NULL
              AND r.legacy_price > 0
              AND r.legacy_available = true
              AND NOT EXISTS (SELECT 1 FROM erp_inventory_item ii WHERE ii.release_id = r.id)
            GROUP BY r.product_category
            ORDER BY COUNT(*) DESC
        """)
        print("\n  Breakdown by category:")
        for row in cur.fetchall():
            print(f"    {row[0]:25} {row[1]:>6}")
        print(f"\n  [DRY-RUN] Would insert {eligible} erp_inventory_item rows + {eligible} erp_inventory_movement rows.")
        conn.close()
        return

    # Real backfill
    print(f"\n  Inserting {eligible} inventory items + movements...")
    start = time.time()
    inserted = 0

    # Fetch eligible release IDs in batches
    cur.execute("""
        SELECT r.id FROM "Release" r
        WHERE r."coverImage" IS NOT NULL
          AND r.legacy_price > 0
          AND r.legacy_available = true
          AND NOT EXISTS (SELECT 1 FROM erp_inventory_item ii WHERE ii.release_id = r.id)
        ORDER BY r.id
    """)
    all_ids = [row[0] for row in cur.fetchall()]

    for i in range(0, len(all_ids), BATCH_SIZE):
        batch = all_ids[i : i + BATCH_SIZE]

        # Generate ULIDs for inventory_item rows
        item_rows = []
        for release_id in batch:
            item_id = str(uuid.uuid4())  # Using UUID4 as ULID equivalent
            item_rows.append((item_id, release_id))

        # Insert inventory items
        psycopg2.extras.execute_values(
            cur,
            """INSERT INTO erp_inventory_item
                 (id, release_id, source, status, quantity, tax_scheme, created_at, updated_at)
               VALUES %s
               ON CONFLICT (id) DO NOTHING""",
            [(iid, rid, "frank_collection", "in_stock", 1, "margin_scheme_25a",
              "NOW()", "NOW()") for iid, rid in item_rows],
            template="(%s, %s, %s, %s, %s, %s, NOW(), NOW())",
        )

        # Insert corresponding inbound movements
        movement_rows = [(str(uuid.uuid4()), iid, "inbound", 1,
                          "Initial backfill Cohort A (2026-04-07)", "system")
                         for iid, _ in item_rows]
        psycopg2.extras.execute_values(
            cur,
            """INSERT INTO erp_inventory_movement
                 (id, inventory_item_id, type, quantity_change, reason, performed_by, created_at)
               VALUES %s""",
            movement_rows,
            template="(%s, %s, %s, %s, %s, %s, NOW())",
        )

        conn.commit()
        inserted += len(batch)
        print(f"  {inserted}/{len(all_ids)} ({inserted * 100 // len(all_ids)}%)...", end="\r")

    elapsed = time.time() - start
    print(f"\n  Done: {inserted} inventory items + {inserted} movements in {elapsed:.1f}s")

    # Verify
    cur.execute("SELECT COUNT(*) FROM erp_inventory_item WHERE source = 'frank_collection'")
    total = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM erp_inventory_movement WHERE type = 'inbound' AND reason LIKE 'Initial backfill%'")
    movements = cur.fetchone()[0]
    print(f"\n  Verification:")
    print(f"    erp_inventory_item (frank_collection): {total}")
    print(f"    erp_inventory_movement (inbound):      {movements}")

    conn.close()


if __name__ == "__main__":
    main()
