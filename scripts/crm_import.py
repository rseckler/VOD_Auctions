#!/usr/bin/env python3
"""
CRM Import: Sync existing customers from all 3 platforms into Brevo.

Phase 1: vod-auctions.com (Medusa customer table in Supabase)
Phase 2: tape-mag.com (Legacy MySQL vodtapes DB)
Phase 3: vod-records.com (WooCommerce — CSV import, manual)

Usage:
    python3 crm_import.py                  # All phases (1+2)
    python3 crm_import.py --phase 1        # Only vod-auctions
    python3 crm_import.py --phase 2        # Only tape-mag
    python3 crm_import.py --dry-run        # Preview without sending to Brevo

Requires: BREVO_API_KEY in VOD_Auctions/backend/.env
          SUPABASE_DB_URL + LEGACY_DB_* in VOD_Auctions/.env
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

# Load main .env (Supabase + Legacy DB)
load_dotenv(Path(__file__).parent.parent / ".env")

# Load backend .env for Brevo key
load_dotenv(Path(__file__).parent.parent / "backend" / ".env", override=True)

from shared import get_pg_connection, get_mysql_connection, RateLimiter

# ---------------------------------------------------------------------------
# Brevo API
# ---------------------------------------------------------------------------

BREVO_API_KEY = os.getenv("BREVO_API_KEY")
BREVO_BASE_URL = "https://api.brevo.com/v3"
BREVO_LIST_VOD_AUCTIONS = int(os.getenv("BREVO_LIST_VOD_AUCTIONS", "0"))
BREVO_LIST_TAPE_MAG = int(os.getenv("BREVO_LIST_TAPE_MAG", "0"))

# Brevo rate limit: 10 requests/second on free plan
brevo_limiter = RateLimiter(max_calls=8, period=1)


def brevo_upsert_contact(email: str, attributes: dict, list_ids: list[int] | None = None) -> bool:
    """Create or update a contact in Brevo. Returns True on success."""
    brevo_limiter.wait()

    body = {
        "email": email,
        "attributes": attributes,
        "updateEnabled": True,
    }
    if list_ids:
        body["listIds"] = list_ids

    resp = requests.post(
        f"{BREVO_BASE_URL}/contacts",
        headers={
            "api-key": BREVO_API_KEY,
            "Content-Type": "application/json",
        },
        json=body,
        timeout=10,
    )

    if resp.status_code in (200, 201, 204):
        return True
    elif resp.status_code == 429:
        # Rate limited — wait and retry once
        time.sleep(2)
        brevo_limiter.wait()
        resp2 = requests.post(
            f"{BREVO_BASE_URL}/contacts",
            headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"},
            json=body,
            timeout=10,
        )
        return resp2.status_code in (200, 201, 204)
    else:
        print(f"  ERROR {resp.status_code}: {resp.text[:200]}")
        return False


# ---------------------------------------------------------------------------
# Phase 1: vod-auctions.com (Medusa/Supabase)
# ---------------------------------------------------------------------------

def import_vod_auctions(dry_run: bool = False) -> dict:
    """Import customers from Medusa customer table."""
    print("\n=== Phase 1: vod-auctions.com ===")

    pg = get_pg_connection()
    cur = pg.cursor()

    # Query Medusa customer table
    cur.execute("""
        SELECT c.id, c.email, c.first_name, c.last_name, c.created_at,
               (SELECT COUNT(*) FROM bid WHERE user_id = c.id) as bid_count,
               (SELECT COUNT(*) FROM transaction WHERE user_id = c.id AND status = 'paid') as purchase_count,
               (SELECT COALESCE(SUM(amount), 0) FROM transaction WHERE user_id = c.id AND status = 'paid') as total_spent
        FROM customer c
        WHERE c.deleted_at IS NULL
        ORDER BY c.created_at
    """)

    customers = cur.fetchall()
    print(f"  Found {len(customers)} customers in Medusa DB")

    stats = {"total": len(customers), "synced": 0, "errors": 0, "skipped": 0}

    for row in customers:
        cust_id, email, first_name, last_name, created_at, bid_count, purchase_count, total_spent = row

        if not email:
            stats["skipped"] += 1
            continue

        # Determine segment
        if purchase_count and purchase_count > 0:
            segment = "buyer"
        elif bid_count and bid_count > 0:
            segment = "bidder"
        else:
            segment = "registered"

        attributes = {
            "FIRSTNAME": first_name or "",
            "LASTNAME": last_name or "",
            "MEDUSA_CUSTOMER_ID": cust_id,
            "PLATFORM_ORIGIN": "vod-auctions",
            "CUSTOMER_SEGMENT": segment,
            "REGISTRATION_DATE": created_at.strftime("%Y-%m-%d") if created_at else "",
            "TOTAL_BIDS_PLACED": int(bid_count or 0),
            "TOTAL_PURCHASES": int(purchase_count or 0),
            "TOTAL_SPENT": float(total_spent or 0),
            "NEWSLETTER_OPTIN": False,
        }

        list_ids = [BREVO_LIST_VOD_AUCTIONS] if BREVO_LIST_VOD_AUCTIONS else None

        if dry_run:
            print(f"  [DRY] {email} → {segment} (bids={bid_count}, purchases={purchase_count})")
            stats["synced"] += 1
        else:
            if brevo_upsert_contact(email, attributes, list_ids):
                stats["synced"] += 1
            else:
                stats["errors"] += 1

    cur.close()
    pg.close()

    print(f"  Result: {stats['synced']} synced, {stats['errors']} errors, {stats['skipped']} skipped")
    return stats


# ---------------------------------------------------------------------------
# Phase 2: tape-mag.com (Legacy MySQL)
# ---------------------------------------------------------------------------

def import_tape_mag(dry_run: bool = False) -> dict:
    """Import customers from tape-mag.com legacy MySQL."""
    print("\n=== Phase 2: tape-mag.com ===")

    try:
        mysql = get_mysql_connection()
    except Exception as e:
        print(f"  ERROR: Could not connect to Legacy MySQL: {e}")
        return {"total": 0, "synced": 0, "errors": 1, "skipped": 0}

    cur = mysql.cursor(dictionary=True)

    # Query registered users from tape-mag.com extranet
    cur.execute("""
        SELECT id, name, vorname, email
        FROM 3wadmin_extranet_user
        WHERE email IS NOT NULL
          AND email != ''
          AND email LIKE '%%@%%'
        ORDER BY id
    """)

    customers = cur.fetchall()
    print(f"  Found {len(customers)} registered users in tape-mag legacy DB")

    stats = {"total": len(customers), "synced": 0, "errors": 0, "skipped": 0}

    for cust in customers:
        email = (cust.get("email") or "").strip().lower()
        if not email or "@" not in email:
            stats["skipped"] += 1
            continue

        # name field often contains full name, vorname is usually empty
        full_name = (cust.get("name") or "").strip()
        first_name = (cust.get("vorname") or "").strip()
        last_name = ""

        # If vorname is empty but name has a space, split it
        if not first_name and " " in full_name:
            parts = full_name.split(" ", 1)
            first_name = parts[0]
            last_name = parts[1]
        elif not first_name:
            first_name = full_name

        attributes = {
            "FIRSTNAME": first_name,
            "LASTNAME": last_name,
            "PLATFORM_ORIGIN": "tape-mag",
            "CUSTOMER_SEGMENT": "registered",
            "NEWSLETTER_OPTIN": False,
        }

        list_ids = [BREVO_LIST_TAPE_MAG] if BREVO_LIST_TAPE_MAG else None

        if dry_run:
            print(f"  [DRY] {email} → {first_name} {last_name}")
            stats["synced"] += 1
        else:
            if brevo_upsert_contact(email, attributes, list_ids):
                stats["synced"] += 1
            else:
                stats["errors"] += 1

    cur.close()
    mysql.close()

    print(f"  Result: {stats['synced']} synced, {stats['errors']} errors, {stats['skipped']} skipped")
    return stats


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Import customers into Brevo CRM")
    parser.add_argument("--phase", type=int, choices=[1, 2], help="Run only a specific phase")
    parser.add_argument("--dry-run", action="store_true", help="Preview without sending to Brevo")
    args = parser.parse_args()

    if not BREVO_API_KEY and not args.dry_run:
        print("ERROR: BREVO_API_KEY not set. Check backend/.env")
        sys.exit(1)

    print(f"CRM Import — {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"Brevo Lists: VOD Auctions={BREVO_LIST_VOD_AUCTIONS}, TAPE-MAG={BREVO_LIST_TAPE_MAG}")

    results = {}

    if args.phase is None or args.phase == 1:
        results["vod-auctions"] = import_vod_auctions(dry_run=args.dry_run)

    if args.phase is None or args.phase == 2:
        results["tape-mag"] = import_tape_mag(dry_run=args.dry_run)

    # Summary
    print("\n=== Summary ===")
    total_synced = 0
    total_errors = 0
    for source, stats in results.items():
        print(f"  {source}: {stats['synced']}/{stats['total']} synced, {stats['errors']} errors")
        total_synced += stats["synced"]
        total_errors += stats["errors"]

    print(f"\n  Total: {total_synced} contacts synced, {total_errors} errors")
    print("\nNote: Phase 3 (vod-records.com/WooCommerce) requires manual CSV export + Brevo dashboard import.")


if __name__ == "__main__":
    main()
