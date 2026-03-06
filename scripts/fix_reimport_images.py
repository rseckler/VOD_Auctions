#!/usr/bin/env python3
"""
Re-import ALL typ=10 images from legacy MySQL bilder_1 table.

The original migration used GROUP BY r.id which collapsed multiple images
per release down to 1. This script imports ALL images for each release.

Also updates Release.coverImage to the first image (by rang/id) if missing.

Usage:
    cd VOD_Auctions/scripts
    python3 fix_reimport_images.py [--dry-run]
"""

import argparse
import time

import psycopg2.extras

from shared import (
    BATCH_SIZE,
    IMAGE_BASE_URL,
    decode_entities,
    get_mysql_connection,
    get_pg_connection,
)


def main():
    parser = argparse.ArgumentParser(description="Re-import all typ=10 images from legacy DB")
    parser.add_argument("--dry-run", action="store_true", help="Don't write to DB")
    args = parser.parse_args()

    start = time.time()
    print("=" * 60)
    print("Re-import ALL release images (typ=10) from Legacy MySQL")
    print("=" * 60)

    mysql_conn = get_mysql_connection()
    pg_conn = get_pg_connection()

    # Step 1: Get ALL typ=10 images from legacy DB (not grouped!)
    print("\n=== Step 1: Fetch all typ=10 images from Legacy MySQL ===")
    my_cur = mysql_conn.cursor(dictionary=True)
    my_cur.execute("""
        SELECT bi.id, bi.inid, bi.bild as filename, bi.rang,
               r.title as release_title
        FROM bilder_1 bi
        INNER JOIN 3wadmin_tapes_releases r ON bi.inid = r.id
        WHERE bi.typ = 10
          AND bi.bild IS NOT NULL
          AND bi.bild != ''
        ORDER BY bi.inid, bi.rang, bi.id
    """)
    rows = my_cur.fetchall()
    my_cur.close()
    print(f"  Found {len(rows)} images in legacy DB")

    # Step 2: Get existing images in Supabase to avoid duplicates
    print("\n=== Step 2: Check existing images in Supabase ===")
    pg_cur = pg_conn.cursor()
    pg_cur.execute("""
        SELECT id, url, "releaseId" FROM "Image"
        WHERE "releaseId" LIKE 'legacy-release-%'
    """)
    existing = {}
    for row in pg_cur.fetchall():
        key = (row[1], row[2])  # (url, releaseId)
        existing[key] = row[0]
    print(f"  {len(existing)} existing images in Supabase")

    # Step 3: Build insert list (skip duplicates by url+releaseId)
    print("\n=== Step 3: Build import list ===")
    to_insert = []
    cover_updates = {}  # releaseId -> first image url

    for row in rows:
        release_id = f"legacy-release-{row['inid']}"
        url = IMAGE_BASE_URL + str(row["filename"])
        alt = decode_entities(row["release_title"]) if row["release_title"] else ""
        image_id = f"legacy-image-{row['id']}"

        # Track first image per release (lowest rang/id) for coverImage
        if release_id not in cover_updates:
            cover_updates[release_id] = url

        # Skip if url+releaseId combo already exists
        if (url, release_id) in existing:
            continue

        to_insert.append((image_id, url, alt, release_id))

    print(f"  {len(to_insert)} new images to insert")
    print(f"  {len(rows) - len(to_insert)} already exist (skipped)")

    if args.dry_run:
        # Show sample
        by_release = {}
        for _, url, _, rid in to_insert[:100]:
            by_release.setdefault(rid, []).append(url.split("/")[-1])
        for rid, urls in list(by_release.items())[:10]:
            print(f"\n  {rid}: {len(urls)} new images")
            for u in urls:
                print(f"    + {u}")
        print(f"\n  ... and {len(to_insert) - sum(len(v) for v in list(by_release.values())[:10])} more")
        print("\n  MODE: DRY RUN (no changes written)")
        mysql_conn.close()
        pg_conn.close()
        return

    # Step 4: Insert new images
    print("\n=== Step 4: Insert new images ===")
    inserted = 0
    errors = 0

    for i in range(0, len(to_insert), BATCH_SIZE):
        batch = to_insert[i : i + BATCH_SIZE]
        try:
            psycopg2.extras.execute_values(
                pg_cur,
                """INSERT INTO "Image" (id, url, alt, "releaseId", "createdAt")
                   VALUES %s ON CONFLICT (id) DO NOTHING""",
                batch,
                template="(%s, %s, %s, %s, NOW())",
            )
            inserted += len(batch)
        except Exception as e:
            errors += 1
            print(f"\n  ERROR at batch {i}: {e}")
            pg_conn.rollback()
            continue
        pg_conn.commit()
        print(f"  Inserted {inserted}/{len(to_insert)}...", end="\r")

    # Step 5: Update coverImage for releases that have NULL coverImage
    print(f"\n\n=== Step 5: Update missing coverImage fields ===")
    pg_cur.execute("""
        SELECT id FROM "Release"
        WHERE id LIKE 'legacy-release-%' AND "coverImage" IS NULL
    """)
    null_covers = {row[0] for row in pg_cur.fetchall()}
    cover_fixed = 0

    for release_id, url in cover_updates.items():
        if release_id in null_covers:
            pg_cur.execute(
                """UPDATE "Release" SET "coverImage" = %s, "updatedAt" = NOW()
                   WHERE id = %s AND "coverImage" IS NULL""",
                (url, release_id),
            )
            if pg_cur.rowcount > 0:
                cover_fixed += 1

    pg_conn.commit()
    print(f"  Fixed {cover_fixed} missing coverImage fields")

    mysql_conn.close()
    pg_conn.close()

    elapsed = time.time() - start
    print(f"\n{'=' * 60}")
    print("RESULTS")
    print(f"{'=' * 60}")
    print(f"  Legacy images found:   {len(rows)}")
    print(f"  Already existed:       {len(rows) - len(to_insert)}")
    print(f"  Newly inserted:        {inserted}")
    print(f"  Cover images fixed:    {cover_fixed}")
    print(f"  Errors:                {errors}")
    print(f"  Duration:              {elapsed:.1f}s")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
