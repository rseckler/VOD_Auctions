#!/usr/bin/env python3
"""
Fix literature images in Supabase:
1. label_literature: Update coverImage using bilder_1 typ=14 (was wrongly typ=15)
2. press_literature: Add coverImage from typ=12 for items missing typ=14 cover
3. All literature: Import additional gallery images from typ=12 into Image table
"""

import os
import sys
import time
import psycopg2
import psycopg2.extras
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

IMAGE_BASE_URL = "https://tape-mag.com/bilder/gross/"
BATCH_SIZE = 200


def get_mysql_connection():
    return mysql.connector.connect(
        host=os.getenv("LEGACY_DB_HOST"),
        port=int(os.getenv("LEGACY_DB_PORT", 3306)),
        user=os.getenv("LEGACY_DB_USER"),
        password=os.getenv("LEGACY_DB_PASSWORD"),
        database=os.getenv("LEGACY_DB_NAME"),
    )


def get_pg_connection():
    return psycopg2.connect(os.getenv("SUPABASE_DB_URL"))


def fix_label_literature_covers(mysql_conn, pg_conn):
    """Fix coverImage for label_literature: use typ=14 instead of typ=15."""
    print("\n=== Fix 1: label_literature coverImages (typ=15 → typ=14) ===")

    cur = mysql_conn.cursor(dictionary=True)
    # Get all label_lit items with their typ=14 cover image
    cur.execute("""
        SELECT ll.id, bi.bild as image_filename, bi.id as image_id
        FROM 3wadmin_tapes_labels_lit ll
        INNER JOIN bilder_1 bi ON bi.inid = ll.id AND bi.typ = 14
        GROUP BY ll.id
        ORDER BY ll.id
    """)
    rows = cur.fetchall()
    cur.close()
    print(f"  Found {len(rows)} label_lit items with typ=14 images")

    pg_cur = pg_conn.cursor()
    updated = 0

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        for r in batch:
            release_id = f"legacy-labellit-{r['id']}"
            cover_url = IMAGE_BASE_URL + str(r["image_filename"])

            pg_cur.execute(
                """UPDATE "Release" SET "coverImage" = %s, "updatedAt" = NOW()
                   WHERE id = %s AND ("coverImage" IS NULL OR "coverImage" != %s)""",
                (cover_url, release_id, cover_url),
            )
            if pg_cur.rowcount > 0:
                updated += 1

            # Also ensure the Image entry exists
            image_id = f"legacy-image-lit-{r['image_id']}"
            pg_cur.execute(
                """INSERT INTO "Image" (id, url, alt, "releaseId", "createdAt")
                   VALUES (%s, %s, %s, %s, NOW())
                   ON CONFLICT (id) DO NOTHING""",
                (image_id, cover_url, f"Cover", release_id),
            )

        pg_conn.commit()
        print(f"  Processed {min(i + BATCH_SIZE, len(rows))}/{len(rows)}...", end="\r")

    print(f"\n  Updated {updated} coverImages for label_literature")
    return updated


def fix_press_literature_covers(mysql_conn, pg_conn):
    """Add coverImage for press_literature items missing covers, using typ=12 as fallback."""
    print("\n=== Fix 2: press_literature coverImages (typ=12 fallback) ===")

    # First get press_lit items that currently have no coverImage in Supabase
    pg_cur = pg_conn.cursor()
    pg_cur.execute("""
        SELECT id FROM "Release"
        WHERE product_category = 'press_literature' AND "coverImage" IS NULL
    """)
    missing_ids = {row[0] for row in pg_cur.fetchall()}
    print(f"  {len(missing_ids)} press_literature items without coverImage")

    if not missing_ids:
        return 0

    # Get legacy IDs
    legacy_ids = []
    for rid in missing_ids:
        if rid.startswith("legacy-presslit-"):
            try:
                legacy_ids.append(int(rid.replace("legacy-presslit-", "")))
            except ValueError:
                pass

    if not legacy_ids:
        return 0

    # Get typ=12 images for these items from legacy DB
    cur = mysql_conn.cursor(dictionary=True)
    # Build query in chunks to avoid too large IN clause
    updated = 0
    for chunk_start in range(0, len(legacy_ids), 500):
        chunk = legacy_ids[chunk_start : chunk_start + 500]
        placeholders = ",".join(["%s"] * len(chunk))
        cur.execute(f"""
            SELECT bi.inid, bi.bild as image_filename, bi.id as image_id
            FROM bilder_1 bi
            WHERE bi.inid IN ({placeholders}) AND bi.typ = 12
            GROUP BY bi.inid
        """, chunk)
        rows = cur.fetchall()

        for r in rows:
            release_id = f"legacy-presslit-{r['inid']}"
            cover_url = IMAGE_BASE_URL + str(r["image_filename"])

            pg_cur.execute(
                """UPDATE "Release" SET "coverImage" = %s, "updatedAt" = NOW()
                   WHERE id = %s AND "coverImage" IS NULL""",
                (cover_url, release_id),
            )
            if pg_cur.rowcount > 0:
                updated += 1

            image_id = f"legacy-image-lit-12-{r['image_id']}"
            pg_cur.execute(
                """INSERT INTO "Image" (id, url, alt, "releaseId", "createdAt")
                   VALUES (%s, %s, %s, %s, NOW())
                   ON CONFLICT (id) DO NOTHING""",
                (image_id, cover_url, "Cover", release_id),
            )

        pg_conn.commit()

    cur.close()
    print(f"  Updated {updated} coverImages for press_literature (typ=12 fallback)")
    return updated


def import_gallery_images(mysql_conn, pg_conn):
    """Import ALL additional images (typ=12) for literature items into Image table."""
    print("\n=== Fix 3: Import gallery images (typ=12) for all literature ===")

    categories = [
        ("3wadmin_tapes_band_lit", "legacy-bandlit", "band_literature"),
        ("3wadmin_tapes_labels_lit", "legacy-labellit", "label_literature"),
        ("3wadmin_tapes_pressorga_lit", "legacy-presslit", "press_literature"),
    ]

    total_imported = 0
    cur = mysql_conn.cursor(dictionary=True)

    for table, id_prefix, cat_name in categories:
        print(f"\n  Processing {cat_name} ({table})...")

        cur.execute(f"""
            SELECT bi.id as image_id, bi.inid, bi.bild as image_filename
            FROM bilder_1 bi
            INNER JOIN `{table}` t ON bi.inid = t.id
            WHERE bi.typ = 12
            ORDER BY bi.inid, bi.id
        """)
        rows = cur.fetchall()
        print(f"    Found {len(rows)} gallery images")

        pg_cur = pg_conn.cursor()
        imported = 0

        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i : i + BATCH_SIZE]
            values = []
            for r in batch:
                release_id = f"{id_prefix}-{r['inid']}"
                image_url = IMAGE_BASE_URL + str(r["image_filename"])
                image_id = f"legacy-image-gal-{r['image_id']}"
                values.append((image_id, image_url, "", release_id))

            if values:
                psycopg2.extras.execute_values(
                    pg_cur,
                    """INSERT INTO "Image" (id, url, alt, "releaseId", "createdAt")
                       VALUES %s ON CONFLICT (id) DO NOTHING""",
                    values,
                    template="(%s, %s, %s, %s, NOW())",
                )
                imported += pg_cur.rowcount

            pg_conn.commit()
            print(f"    Imported {min(i + BATCH_SIZE, len(rows))}/{len(rows)}...", end="\r")

        print(f"\n    Imported {imported} new gallery images for {cat_name}")
        total_imported += imported

    cur.close()
    return total_imported


def main():
    start = time.time()
    print("=" * 60)
    print("Literature Image Fix")
    print("=" * 60)

    mysql_conn = get_mysql_connection()
    pg_conn = get_pg_connection()

    try:
        label_fixes = fix_label_literature_covers(mysql_conn, pg_conn)
        press_fixes = fix_press_literature_covers(mysql_conn, pg_conn)
        gallery_count = import_gallery_images(mysql_conn, pg_conn)

        elapsed = time.time() - start
        print(f"\n{'=' * 60}")
        print("SUMMARY")
        print(f"{'=' * 60}")
        print(f"  label_literature covers fixed:    {label_fixes}")
        print(f"  press_literature covers added:    {press_fixes}")
        print(f"  Gallery images imported:          {gallery_count}")
        print(f"  Duration: {elapsed:.1f}s")
        print(f"{'=' * 60}")

    finally:
        mysql_conn.close()
        pg_conn.close()


if __name__ == "__main__":
    main()
