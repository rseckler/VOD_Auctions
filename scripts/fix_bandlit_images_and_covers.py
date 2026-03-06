#!/usr/bin/env python3
"""
Fix two data issues found by compare_vod_vs_legacy.py:

1. band_literature missing images: 885 articles have only 1 image,
   but legacy has 2+ (typ=13). Import all missing images.

2. Release coverImage wrong sorting: ~16% of releases have a coverImage
   that doesn't match the first legacy image (by rang, id).
   Fix by updating coverImage to the correct first image.

Usage:
    cd VOD_Auctions/scripts
    python3 fix_bandlit_images_and_covers.py [--dry-run]
"""

import argparse
import time

import psycopg2.extras

from shared import (
    BATCH_SIZE,
    IMAGE_BASE_URL,
    get_mysql_connection,
    get_pg_connection,
)


def fix_bandlit_missing_images(my_conn, pg_conn, dry_run=False):
    """Import all missing band_literature images (typ=13)."""
    print("\n=== Fix 1: band_literature missing images (typ=13) ===")

    my_cur = my_conn.cursor(dictionary=True)
    pg_cur = pg_conn.cursor()

    # Get ALL typ=13 images from legacy
    my_cur.execute("""
        SELECT bi.id, bi.inid, bi.bild as filename, bi.rang
        FROM bilder_1 bi
        INNER JOIN 3wadmin_tapes_band_lit t ON bi.inid = t.id
        WHERE bi.typ = 13
          AND bi.bild IS NOT NULL AND bi.bild != ''
        ORDER BY bi.inid, bi.rang, bi.id
    """)
    legacy_rows = my_cur.fetchall()
    my_cur.close()
    print(f"  Legacy typ=13 images: {len(legacy_rows)}")

    # Get existing images in Supabase for bandlit
    pg_cur.execute("""
        SELECT url, "releaseId" FROM "Image"
        WHERE "releaseId" LIKE 'legacy-bandlit-%'
    """)
    existing = {(r[0], r[1]) for r in pg_cur.fetchall()}
    print(f"  Existing in VOD: {len(existing)}")

    # Build insert list
    to_insert = []
    cover_updates = {}  # releaseId -> first image url

    for row in legacy_rows:
        release_id = f"legacy-bandlit-{row['inid']}"
        url = IMAGE_BASE_URL + str(row["filename"])
        image_id = f"legacy-image-bandlit-{row['id']}"

        if release_id not in cover_updates:
            cover_updates[release_id] = url

        if (url, release_id) in existing:
            continue

        to_insert.append((image_id, url, "", release_id))

    print(f"  New images to insert: {len(to_insert)}")

    if dry_run:
        print("  DRY RUN — no changes")
        return len(to_insert), 0

    # Insert
    inserted = 0
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
            print(f"\n  ERROR at batch {i}: {e}")
            pg_conn.rollback()
            continue
        pg_conn.commit()
        print(f"  Inserted {inserted}/{len(to_insert)}...", end="\r")

    # Fix coverImage for bandlit items where it's wrong or NULL
    cover_fixed = 0
    for release_id, first_url in cover_updates.items():
        pg_cur.execute(
            """UPDATE "Release" SET "coverImage" = %s, "updatedAt" = NOW()
               WHERE id = %s AND ("coverImage" IS NULL OR "coverImage" != %s)""",
            (first_url, release_id, first_url),
        )
        if pg_cur.rowcount > 0:
            cover_fixed += 1

    pg_conn.commit()
    print(f"\n  Inserted {inserted} images, fixed {cover_fixed} bandlit covers")
    return inserted, cover_fixed


def fix_release_covers(my_conn, pg_conn, dry_run=False):
    """Fix Release coverImage to match first legacy image (by rang, id)."""
    print("\n=== Fix 2: Release coverImage sorting fix ===")

    my_cur = my_conn.cursor(dictionary=True)
    pg_cur = pg_conn.cursor()

    # Get all releases with coverImage from Supabase
    pg_cur.execute("""
        SELECT id, "coverImage" FROM "Release"
        WHERE product_category = 'release' AND "coverImage" IS NOT NULL
    """)
    releases = pg_cur.fetchall()
    print(f"  Releases with coverImage: {len(releases)}")

    # Get first image per release from legacy (by rang, id)
    my_cur.execute("""
        SELECT bi.inid,
               (SELECT b2.bild FROM bilder_1 b2
                WHERE b2.inid = bi.inid AND b2.typ = 10
                  AND b2.bild IS NOT NULL AND b2.bild != ''
                ORDER BY b2.rang, b2.id LIMIT 1) as first_img
        FROM bilder_1 bi
        WHERE bi.typ = 10 AND bi.bild IS NOT NULL AND bi.bild != ''
        GROUP BY bi.inid
    """)
    legacy_first = {}
    for r in my_cur.fetchall():
        if r["first_img"]:
            legacy_first[r["inid"]] = IMAGE_BASE_URL + str(r["first_img"])
    my_cur.close()
    print(f"  Legacy releases with images: {len(legacy_first)}")

    # Compare and fix
    to_fix = []
    for rid, current_cover in releases:
        try:
            legacy_id = int(rid.replace("legacy-release-", ""))
        except ValueError:
            continue

        expected = legacy_first.get(legacy_id)
        if expected and current_cover != expected:
            to_fix.append((expected, rid))

    print(f"  Covers to fix: {len(to_fix)}")

    if dry_run:
        for url, rid in to_fix[:10]:
            print(f"    {rid}: {url}")
        print("  DRY RUN — no changes")
        return len(to_fix)

    # Batch update
    fixed = 0
    for i in range(0, len(to_fix), BATCH_SIZE):
        batch = to_fix[i : i + BATCH_SIZE]
        for url, rid in batch:
            pg_cur.execute(
                """UPDATE "Release" SET "coverImage" = %s, "updatedAt" = NOW()
                   WHERE id = %s""",
                (url, rid),
            )
            fixed += pg_cur.rowcount

        pg_conn.commit()
        print(f"  Fixed {fixed}/{len(to_fix)}...", end="\r")

    print(f"\n  Fixed {fixed} release covers")
    return fixed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    start = time.time()
    print("=" * 60)
    print("Fix: band_lit images + Release cover sorting")
    print("=" * 60)

    my_conn = get_mysql_connection()
    pg_conn = get_pg_connection()

    imgs_inserted, bandlit_covers = fix_bandlit_missing_images(my_conn, pg_conn, args.dry_run)
    release_covers = fix_release_covers(my_conn, pg_conn, args.dry_run)

    my_conn.close()
    pg_conn.close()

    elapsed = time.time() - start
    print(f"\n{'=' * 60}")
    print("RESULTS")
    print(f"{'=' * 60}")
    print(f"  band_lit images inserted:  {imgs_inserted}")
    print(f"  band_lit covers fixed:     {bandlit_covers}")
    print(f"  Release covers fixed:      {release_covers}")
    print(f"  Duration:                  {elapsed:.1f}s")
    if args.dry_run:
        print("  MODE: DRY RUN")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
