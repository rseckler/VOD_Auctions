#!/usr/bin/env python3
"""
Comprehensive fix for literature image misassignments.

Root cause: bilder_1.typ mapping was wrong in migration scripts.
Correct mapping (verified by data analysis):
  typ=10 → releases           (inid = 3wadmin_tapes_releases.id)
  typ=12 → pressorga_lit      (inid = 3wadmin_tapes_pressorga_lit.id)
  typ=13 → band_lit           (inid = 3wadmin_tapes_band_lit.id)
  typ=14 → labels_lit         (inid = 3wadmin_tapes_labels_lit.id)

Bugs fixed:
1. migrate_literature.py used typ=14 for pressorga_lit covers → WRONG
   (typ=14 = labels_lit, not pressorga_lit)
2. fix_literature_images.py imported typ=12 gallery images to ALL 3 lit categories
   → WRONG (typ=12 belongs to pressorga_lit only)
3. Result: thousands of cross-assigned images due to ID overlaps between tables

Fix steps:
  A. Delete wrongly assigned gallery images (legacy-image-gal-*) from bandlit and labellit
  B. Delete wrong pressorga_lit cover images (from typ=14, should be typ=12)
  C. Re-import pressorga_lit covers from typ=12 (first image per item)
  D. Re-import pressorga_lit gallery images correctly (typ=12 only to presslit)
  E. Verify band_lit covers (typ=13) and labels_lit covers (typ=14)

Usage:
    cd VOD_Auctions/scripts
    python3 fix_literature_image_assignments.py [--dry-run]
"""

import argparse
import time

import psycopg2
import psycopg2.extras

from shared import (
    BATCH_SIZE,
    IMAGE_BASE_URL,
    get_mysql_connection,
    get_pg_connection,
)


def step_a_delete_wrong_gallery(pg_conn, dry_run):
    """Delete typ=12 gallery images wrongly assigned to bandlit and labellit releases."""
    print("\n=== Step A: Delete wrong gallery images from bandlit + labellit ===")
    pg_cur = pg_conn.cursor()

    # Count before delete
    pg_cur.execute("""
        SELECT
            CASE WHEN "releaseId" LIKE 'legacy-bandlit-%' THEN 'bandlit'
                 WHEN "releaseId" LIKE 'legacy-labellit-%' THEN 'labellit'
            END as cat,
            COUNT(*) as cnt
        FROM "Image"
        WHERE id LIKE 'legacy-image-gal-%'
          AND ("releaseId" LIKE 'legacy-bandlit-%' OR "releaseId" LIKE 'legacy-labellit-%')
        GROUP BY 1
    """)
    counts = pg_cur.fetchall()
    for cat, cnt in counts:
        print(f"  {cat}: {cnt} wrong gallery images to delete")

    if dry_run:
        print("  DRY RUN — skipping delete")
        return sum(c[1] for c in counts)

    pg_cur.execute("""
        DELETE FROM "Image"
        WHERE id LIKE 'legacy-image-gal-%'
          AND ("releaseId" LIKE 'legacy-bandlit-%' OR "releaseId" LIKE 'legacy-labellit-%')
    """)
    deleted = pg_cur.rowcount
    pg_conn.commit()
    print(f"  Deleted {deleted} wrong gallery images")
    return deleted


def step_b_delete_wrong_presslit_covers(pg_conn, dry_run):
    """Delete wrong pressorga_lit cover images (from typ=14, which belongs to labels_lit)."""
    print("\n=== Step B: Delete wrong presslit covers (typ=14 images) ===")
    pg_cur = pg_conn.cursor()

    # These were imported by migrate_literature.py with bilder_typ=14 for pressorga_lit
    # Image IDs: legacy-image-lit-{bilder_1.id}
    pg_cur.execute("""
        SELECT COUNT(*) FROM "Image"
        WHERE id LIKE 'legacy-image-lit-%'
          AND id NOT LIKE 'legacy-image-lit-12-%'
          AND "releaseId" LIKE 'legacy-presslit-%'
    """)
    count = pg_cur.fetchone()[0]
    print(f"  {count} wrong presslit cover images to delete")

    if dry_run:
        print("  DRY RUN — skipping delete")
        return count

    pg_cur.execute("""
        DELETE FROM "Image"
        WHERE id LIKE 'legacy-image-lit-%'
          AND id NOT LIKE 'legacy-image-lit-12-%'
          AND "releaseId" LIKE 'legacy-presslit-%'
    """)
    deleted = pg_cur.rowcount
    pg_conn.commit()
    print(f"  Deleted {deleted} wrong presslit cover images")
    return deleted


def step_c_fix_presslit_covers(mysql_conn, pg_conn, dry_run):
    """Set correct pressorga_lit covers from typ=12 (first image per item)."""
    print("\n=== Step C: Fix presslit covers from typ=12 ===")

    my_cur = mysql_conn.cursor(dictionary=True)
    my_cur.execute("""
        SELECT bi.inid, MIN(bi.bild) as first_image
        FROM bilder_1 bi
        INNER JOIN 3wadmin_tapes_pressorga_lit p ON bi.inid = p.id
        WHERE bi.typ = 12
          AND bi.bild IS NOT NULL AND bi.bild != ''
        GROUP BY bi.inid
        ORDER BY bi.inid
    """)
    rows = my_cur.fetchall()
    my_cur.close()
    print(f"  Found {len(rows)} pressorga_lit items with typ=12 covers")

    if dry_run:
        print("  DRY RUN — skipping update")
        return 0

    pg_cur = pg_conn.cursor()
    updated = 0

    for r in rows:
        release_id = f"legacy-presslit-{r['inid']}"
        cover_url = IMAGE_BASE_URL + str(r["first_image"])

        pg_cur.execute(
            """UPDATE "Release" SET "coverImage" = %s, "updatedAt" = NOW()
               WHERE id = %s""",
            (cover_url, release_id),
        )
        if pg_cur.rowcount > 0:
            updated += 1

    pg_conn.commit()
    print(f"  Updated {updated} presslit coverImages")
    return updated


def step_d_reimport_presslit_gallery(mysql_conn, pg_conn, dry_run):
    """Re-import typ=12 gallery images correctly — ONLY to pressorga_lit releases."""
    print("\n=== Step D: Re-import typ=12 gallery images to presslit only ===")

    my_cur = mysql_conn.cursor(dictionary=True)
    my_cur.execute("""
        SELECT bi.id as image_id, bi.inid, bi.bild as filename
        FROM bilder_1 bi
        INNER JOIN 3wadmin_tapes_pressorga_lit p ON bi.inid = p.id
        WHERE bi.typ = 12
          AND bi.bild IS NOT NULL AND bi.bild != ''
        ORDER BY bi.inid, bi.id
    """)
    rows = my_cur.fetchall()
    my_cur.close()
    print(f"  Found {len(rows)} typ=12 images for pressorga_lit")

    # Check existing
    pg_cur = pg_conn.cursor()
    pg_cur.execute("""
        SELECT id, url, "releaseId" FROM "Image"
        WHERE "releaseId" LIKE 'legacy-presslit-%'
    """)
    existing = set()
    for row in pg_cur.fetchall():
        existing.add((row[1], row[2]))  # (url, releaseId)

    to_insert = []
    for r in rows:
        release_id = f"legacy-presslit-{r['inid']}"
        url = IMAGE_BASE_URL + str(r["filename"])
        image_id = f"legacy-image-gal-{r['image_id']}"

        if (url, release_id) not in existing:
            to_insert.append((image_id, url, "", release_id))

    print(f"  {len(to_insert)} new images to insert ({len(rows) - len(to_insert)} already exist)")

    if dry_run:
        print("  DRY RUN — skipping insert")
        return len(to_insert)

    inserted = 0
    for i in range(0, len(to_insert), BATCH_SIZE):
        batch = to_insert[i : i + BATCH_SIZE]
        try:
            psycopg2.extras.execute_values(
                pg_cur,
                """INSERT INTO "Image" (id, url, alt, "releaseId", "createdAt")
                   VALUES %s ON CONFLICT (id) DO UPDATE SET "releaseId" = EXCLUDED."releaseId" """,
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

    print(f"\n  Inserted/updated {inserted} presslit gallery images")
    return inserted


def step_e_verify(pg_conn):
    """Print verification stats."""
    print("\n=== Step E: Verification ===")
    pg_cur = pg_conn.cursor()

    pg_cur.execute("""
        SELECT
            r.product_category,
            COUNT(DISTINCT r.id) as releases,
            COUNT(DISTINCT r.id) FILTER (WHERE r."coverImage" IS NOT NULL) as with_cover,
            COUNT(i.id) as total_images
        FROM "Release" r
        LEFT JOIN "Image" i ON i."releaseId" = r.id
        WHERE r.product_category IN ('press_literature', 'band_literature', 'label_literature', 'release')
        GROUP BY r.product_category
        ORDER BY r.product_category
    """)
    rows = pg_cur.fetchall()
    print(f"  {'Category':<20} {'Releases':>10} {'With Cover':>12} {'Images':>10}")
    print(f"  {'-'*52}")
    for cat, releases, with_cover, images in rows:
        print(f"  {cat:<20} {releases:>10} {with_cover:>12} {images:>10}")

    # Check for cross-assigned gallery images
    pg_cur.execute("""
        SELECT COUNT(*) FROM "Image"
        WHERE id LIKE 'legacy-image-gal-%'
          AND ("releaseId" LIKE 'legacy-bandlit-%' OR "releaseId" LIKE 'legacy-labellit-%')
    """)
    wrong_gallery = pg_cur.fetchone()[0]
    print(f"\n  Wrong gallery images remaining (bandlit/labellit): {wrong_gallery}")

    # Spot check: Stabmental 02 (presslit-645)
    pg_cur.execute("""
        SELECT COUNT(*) FROM "Image" WHERE "releaseId" = 'legacy-presslit-645'
    """)
    stabmental_imgs = pg_cur.fetchone()[0]
    pg_cur.execute("""
        SELECT "coverImage" FROM "Release" WHERE id = 'legacy-presslit-645'
    """)
    row = pg_cur.fetchone()
    stabmental_cover = row[0] if row else None
    print(f"\n  Spot check: Stabmental 02 (presslit-645)")
    print(f"    Images: {stabmental_imgs}")
    print(f"    Cover: {stabmental_cover}")


def main():
    parser = argparse.ArgumentParser(description="Fix literature image misassignments")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    start = time.time()
    print("=" * 60)
    print("Literature Image Assignment Fix")
    print("=" * 60)

    mysql_conn = get_mysql_connection()
    pg_conn = get_pg_connection()

    try:
        deleted_gallery = step_a_delete_wrong_gallery(pg_conn, args.dry_run)
        deleted_covers = step_b_delete_wrong_presslit_covers(pg_conn, args.dry_run)
        fixed_covers = step_c_fix_presslit_covers(mysql_conn, pg_conn, args.dry_run)
        reimported = step_d_reimport_presslit_gallery(mysql_conn, pg_conn, args.dry_run)
        step_e_verify(pg_conn)

        elapsed = time.time() - start
        print(f"\n{'=' * 60}")
        print("SUMMARY")
        print(f"{'=' * 60}")
        print(f"  Wrong gallery images deleted (bandlit/labellit): {deleted_gallery}")
        print(f"  Wrong presslit covers deleted (typ=14):          {deleted_covers}")
        print(f"  Presslit covers fixed (typ=12):                  {fixed_covers}")
        print(f"  Presslit gallery images re-imported:             {reimported}")
        print(f"  Duration: {elapsed:.1f}s")
        if args.dry_run:
            print("  MODE: DRY RUN (no changes written)")
        print(f"{'=' * 60}")

    finally:
        mysql_conn.close()
        pg_conn.close()


if __name__ == "__main__":
    main()
