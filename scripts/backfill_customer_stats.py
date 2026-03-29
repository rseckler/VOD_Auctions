#!/usr/bin/env python3
"""
Backfill customer_stats table from existing transaction + bid data.

Run once after deploying the migration:
  cd VOD_Auctions/scripts && source venv/bin/activate
  python3 backfill_customer_stats.py

Safe to re-run — uses INSERT ... ON CONFLICT DO UPDATE.
"""

import os
import sys
import uuid
from datetime import datetime, timedelta
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

load_dotenv()

DATABASE_URL = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: SUPABASE_DB_URL or DATABASE_URL not set in environment", file=sys.stderr)
    sys.exit(1)

VIP_THRESHOLD = 500.0   # €500 total spent → VIP
DORMANT_DAYS = 90       # No purchase in 90 days → dormant


def generate_id():
    return str(uuid.uuid4()).replace("-", "")[:26]


def main():
    print(f"[backfill] Connecting to database...")
    conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # Check table exists
    cur.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'customer_stats'
        )
    """)
    if not cur.fetchone()[0]:
        print("ERROR: customer_stats table does not exist. Run the migration first.", file=sys.stderr)
        conn.close()
        sys.exit(1)

    print("[backfill] Fetching customer aggregates...")

    cur.execute("""
        SELECT
            c.id AS customer_id,
            COALESCE(tx.total_spent, 0) AS total_spent,
            COALESCE(tx.total_purchases, 0) AS total_purchases,
            tx.last_purchase_at,
            tx.first_purchase_at,
            COALESCE(b.total_bids, 0) AS total_bids,
            COALESCE(b.total_wins, 0) AS total_wins,
            b.last_bid_at
        FROM customer c
        LEFT JOIN (
            SELECT
                user_id,
                SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS total_spent,
                COUNT(CASE WHEN status = 'paid' THEN id END) AS total_purchases,
                MAX(CASE WHEN status = 'paid' THEN updated_at END) AS last_purchase_at,
                MIN(CASE WHEN status = 'paid' THEN updated_at END) AS first_purchase_at
            FROM transaction
            WHERE deleted_at IS NULL
            GROUP BY user_id
        ) tx ON tx.user_id = c.id
        LEFT JOIN (
            SELECT
                user_id,
                COUNT(id) AS total_bids,
                COUNT(CASE WHEN is_winning = true THEN id END) AS total_wins,
                MAX(created_at) AS last_bid_at
            FROM bid
            GROUP BY user_id
        ) b ON b.user_id = c.id
        WHERE c.deleted_at IS NULL
    """)

    rows = cur.fetchall()
    now = datetime.utcnow()
    dormant_cutoff = now - timedelta(days=DORMANT_DAYS)

    upserted = 0
    for row in rows:
        customer_id = row["customer_id"]
        total_spent = float(row["total_spent"])
        total_purchases = int(row["total_purchases"])
        total_bids = int(row["total_bids"])
        total_wins = int(row["total_wins"])
        last_purchase_at = row["last_purchase_at"]
        first_purchase_at = row["first_purchase_at"]
        last_bid_at = row["last_bid_at"]

        is_vip = total_spent >= VIP_THRESHOLD
        is_dormant = bool(last_purchase_at and last_purchase_at < dormant_cutoff)

        cur.execute("""
            INSERT INTO customer_stats (
                id, customer_id, total_spent, total_purchases, total_bids, total_wins,
                last_purchase_at, first_purchase_at, last_bid_at,
                tags, is_vip, is_dormant, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, '{}', %s, %s, NOW())
            ON CONFLICT (customer_id) DO UPDATE SET
                total_spent = EXCLUDED.total_spent,
                total_purchases = EXCLUDED.total_purchases,
                total_bids = EXCLUDED.total_bids,
                total_wins = EXCLUDED.total_wins,
                last_purchase_at = EXCLUDED.last_purchase_at,
                first_purchase_at = EXCLUDED.first_purchase_at,
                last_bid_at = EXCLUDED.last_bid_at,
                is_vip = EXCLUDED.is_vip,
                is_dormant = EXCLUDED.is_dormant,
                updated_at = NOW()
        """, (
            generate_id(), customer_id,
            total_spent, total_purchases, total_bids, total_wins,
            last_purchase_at, first_purchase_at, last_bid_at,
            is_vip, is_dormant
        ))
        upserted += 1

    conn.commit()
    cur.close()
    conn.close()

    print(f"[backfill] Done. Upserted {upserted} customer stats rows.")
    vip_count = sum(1 for r in rows if float(r["total_spent"] or 0) >= VIP_THRESHOLD)
    buyer_count = sum(1 for r in rows if int(r["total_purchases"] or 0) > 0)
    print(f"[backfill] Summary: {buyer_count} buyers, {vip_count} VIPs (≥€{VIP_THRESHOLD})")


if __name__ == "__main__":
    main()
