#!/usr/bin/env python3
"""
One-time fix: Update coverImage for all Releases to match the first image
by URL alphabetical order (which corresponds to legacy rang order for
numbered filenames like Catalogue_5_1.jpg, Catalogue_5_2.jpg, etc.)

This fixes the GROUP BY bug in legacy_sync.py where an arbitrary image
was picked as coverImage instead of the first one by rang.
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
if not DB_URL:
    raise ValueError("SUPABASE_DB_URL or DATABASE_URL not set")


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # Find releases where coverImage doesn't match the first image by URL order
    cur.execute("""
        WITH first_image AS (
            SELECT DISTINCT ON ("releaseId") "releaseId", url
            FROM "Image"
            ORDER BY "releaseId", url ASC
        )
        SELECT r.id, r."coverImage", fi.url as correct_cover
        FROM "Release" r
        JOIN first_image fi ON fi."releaseId" = r.id
        WHERE r."coverImage" IS DISTINCT FROM fi.url
    """)
    mismatches = cur.fetchall()
    print(f"Found {len(mismatches)} releases with wrong coverImage")

    if not mismatches:
        print("Nothing to fix!")
        cur.close()
        conn.close()
        return

    # Show some examples
    for rid, current, correct in mismatches[:10]:
        current_short = current.split("/")[-1] if current else "NULL"
        correct_short = correct.split("/")[-1]
        print(f"  {rid}: {current_short} → {correct_short}")
    if len(mismatches) > 10:
        print(f"  ... and {len(mismatches) - 10} more")

    # Apply fix
    updated = 0
    for rid, _current, correct in mismatches:
        cur.execute(
            'UPDATE "Release" SET "coverImage" = %s WHERE id = %s',
            (correct, rid),
        )
        updated += cur.rowcount

    conn.commit()
    print(f"\nUpdated {updated} coverImage values")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
