#!/usr/bin/env python3
"""
Fix coverImage for all Releases using legacy MySQL bilder_1.rang ordering.

The daily legacy_sync.py used GROUP BY which picked an arbitrary image as
coverImage. This script queries the legacy MySQL bilder_1 table to find the
correct first image (ordered by rang, then id) for each release and updates
coverImage in Supabase accordingly.

Also adds a `rang` INTEGER column to the Image table and populates it from
legacy data, enabling proper image ordering in the API.

Usage:
    python3 fix_cover_images_from_url_order.py [--dry-run]
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from shared import get_legacy_connection, get_pg_connection, IMAGE_BASE_URL

BATCH_SIZE = 500


def main():
    dry_run = "--dry-run" in sys.argv

    mysql_conn = get_legacy_connection()
    pg_conn = get_pg_connection()
    pg_cur = pg_conn.cursor()

    # Step 1: Add rang column to Image table if not exists
    print("Step 1: Ensuring 'rang' column exists on Image table...")
    pg_cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Image' AND column_name = 'rang'
    """)
    if not pg_cur.fetchone():
        if dry_run:
            print("  [DRY RUN] Would add rang INTEGER column to Image table")
        else:
            pg_cur.execute('ALTER TABLE "Image" ADD COLUMN rang INTEGER DEFAULT 0')
            pg_conn.commit()
            print("  Added rang column to Image table")
    else:
        print("  rang column already exists")

    # Step 2: Fetch all images with rang from legacy MySQL
    # typ=10 (releases), typ=12 (pressorga_lit), typ=13 (band_lit), typ=14 (labels_lit)
    print("\nStep 2: Fetching image rang values from legacy MySQL...")
    cursor = mysql_conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT bi.id, bi.inid, bi.bild as filename, bi.rang, bi.typ
        FROM bilder_1 bi
        WHERE bi.bild IS NOT NULL AND bi.bild != ''
        ORDER BY bi.inid, bi.rang, bi.id
    """)
    legacy_images = cursor.fetchall()
    cursor.close()
    print(f"  Found {len(legacy_images)} legacy images")

    # Step 3: Build mapping of legacy_image_id -> rang
    # and release -> first image URL (for coverImage fix)
    rang_updates = {}  # image_id -> rang
    cover_fixes = {}  # release_id -> correct_cover_url

    # Map bilder_typ to release ID prefix
    typ_prefix = {
        10: "legacy-release-",
        12: "legacy-presslit-",
        13: "legacy-bandlit-",
        14: "legacy-labellit-",
    }

    for img in legacy_images:
        typ = img["typ"]
        prefix = typ_prefix.get(typ)
        if not prefix:
            continue

        image_id = f"legacy-image-{img['id']}"
        release_id = f"{prefix}{img['inid']}"
        rang = img["rang"] if img["rang"] is not None else 999
        url = IMAGE_BASE_URL + str(img["filename"])

        rang_updates[image_id] = rang

        # Track first image per release (by rang, then by legacy id)
        if release_id not in cover_fixes:
            cover_fixes[release_id] = url

    print(f"  Built rang map for {len(rang_updates)} images")
    print(f"  Built cover map for {len(cover_fixes)} releases")

    # Step 4: Update rang values on Image table
    print("\nStep 3: Updating rang values on Image table...")
    if dry_run:
        print(f"  [DRY RUN] Would update rang for {len(rang_updates)} images")
    else:
        updated_rang = 0
        items = list(rang_updates.items())
        for i in range(0, len(items), BATCH_SIZE):
            batch = items[i:i + BATCH_SIZE]
            for image_id, rang in batch:
                pg_cur.execute(
                    'UPDATE "Image" SET rang = %s WHERE id = %s AND (rang IS NULL OR rang != %s)',
                    (rang, image_id, rang)
                )
                updated_rang += pg_cur.rowcount
            pg_conn.commit()
        print(f"  Updated rang for {updated_rang} images")

    # Step 5: Fix coverImage based on correct first image by rang
    print("\nStep 4: Fixing coverImage values...")
    pg_cur.execute('SELECT id, "coverImage" FROM "Release"')
    all_releases = pg_cur.fetchall()
    print(f"  Found {len(all_releases)} releases in DB")

    fixes = []
    for release_id, current_cover in all_releases:
        correct_cover = cover_fixes.get(release_id)
        if correct_cover and correct_cover != current_cover:
            fixes.append((correct_cover, release_id))

    print(f"  Found {len(fixes)} releases needing coverImage fix")

    if fixes:
        # Show examples
        for correct_cover, release_id in fixes[:10]:
            short = correct_cover.split("/")[-1]
            print(f"    {release_id} → {short}")
        if len(fixes) > 10:
            print(f"    ... and {len(fixes) - 10} more")

    if dry_run:
        print(f"\n  [DRY RUN] Would update {len(fixes)} coverImage values")
    else:
        fixed = 0
        for i in range(0, len(fixes), BATCH_SIZE):
            batch = fixes[i:i + BATCH_SIZE]
            for correct_cover, release_id in batch:
                pg_cur.execute(
                    'UPDATE "Release" SET "coverImage" = %s WHERE id = %s',
                    (correct_cover, release_id)
                )
                fixed += pg_cur.rowcount
            pg_conn.commit()
        print(f"\n  Fixed {fixed} coverImage values")

    # Step 6: Create index on rang for ordering
    if not dry_run:
        pg_cur.execute("""
            SELECT indexname FROM pg_indexes
            WHERE tablename = 'Image' AND indexname = 'idx_image_release_rang'
        """)
        if not pg_cur.fetchone():
            pg_cur.execute(
                'CREATE INDEX idx_image_release_rang ON "Image" ("releaseId", rang)'
            )
            pg_conn.commit()
            print("  Created index idx_image_release_rang")

    pg_cur.close()
    pg_conn.close()
    mysql_conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
