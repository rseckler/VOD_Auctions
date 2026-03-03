#!/usr/bin/env python3
"""
Daily incremental sync: Legacy MySQL -> Supabase PostgreSQL.

Syncs new and updated artists, labels, and releases from the legacy vodtapes
MySQL database to the Supabase PostgreSQL database. Designed to run daily via
cron or manually.

Key behavior:
- Artists and labels: INSERT ... ON CONFLICT DO NOTHING (new ones only)
- Releases: UPSERT with ON CONFLICT DO UPDATE for content fields
- Protected fields are NEVER overwritten: discogs_*, estimated_value,
  media_condition, sleeve_condition, auction_status, current_block_id
- New images are inserted (ON CONFLICT DO NOTHING)
- Results logged to sync_log table

Usage:
    cd VOD_Auctions/scripts
    python3 legacy_sync.py

Requires .env in parent directory with LEGACY_DB_* and SUPABASE_DB_URL.
"""

import re
import time
from datetime import datetime

import psycopg2.extras

from shared import (
    BATCH_SIZE,
    IMAGE_BASE_URL,
    decode_entities,
    get_mysql_connection,
    get_pg_connection,
    log_sync,
    map_format,
    parse_price,
    slugify,
)


def fetch_legacy_artist_ids(mysql_conn):
    """Fetch all artist IDs from legacy MySQL."""
    cursor = mysql_conn.cursor(dictionary=True)
    cursor.execute("SELECT id, name FROM 3wadmin_tapes_band ORDER BY id")
    rows = cursor.fetchall()
    cursor.close()
    return rows


def fetch_legacy_label_ids(mysql_conn):
    """Fetch all label IDs from legacy MySQL."""
    cursor = mysql_conn.cursor(dictionary=True)
    cursor.execute("SELECT id, label as name FROM 3wadmin_tapes_labels ORDER BY id")
    rows = cursor.fetchall()
    cursor.close()
    return rows


def fetch_existing_ids(pg_conn, table, prefix):
    """Fetch all legacy-* IDs from a Supabase table."""
    cur = pg_conn.cursor()
    cur.execute(
        f'SELECT id FROM "{table}" WHERE id LIKE %s',
        (f"{prefix}%",),
    )
    ids = {row[0] for row in cur.fetchall()}
    cur.close()
    return ids


def sync_artists(mysql_conn, pg_conn):
    """Sync artists: insert new ones, skip existing."""
    print("\n=== Syncing Artists ===")
    legacy_rows = fetch_legacy_artist_ids(mysql_conn)
    existing_ids = fetch_existing_ids(pg_conn, "Artist", "legacy-artist-")

    new_rows = [r for r in legacy_rows if f"legacy-artist-{r['id']}" not in existing_ids]
    print(f"  Legacy: {len(legacy_rows)} | Supabase: {len(existing_ids)} | New: {len(new_rows)}")

    if not new_rows:
        print("  Nothing to insert.")
        return 0

    pg_cur = pg_conn.cursor()
    inserted = 0

    for i in range(0, len(new_rows), BATCH_SIZE):
        batch = new_rows[i : i + BATCH_SIZE]
        values = []
        for row in batch:
            name = decode_entities(row["name"]) or f"Unknown Artist #{row['id']}"
            slug = slugify(name)
            if not slug:
                slug = f"artist-{row['id']}"
            aid = f"legacy-artist-{row['id']}"
            values.append((aid, slug + f"-{row['id']}", name))

        psycopg2.extras.execute_values(
            pg_cur,
            """INSERT INTO "Artist" (id, slug, name, "createdAt", "updatedAt")
               VALUES %s ON CONFLICT (id) DO NOTHING""",
            values,
            template="(%s, %s, %s, NOW(), NOW())",
        )
        inserted += len(batch)
        print(f"  Inserted {inserted}/{len(new_rows)} artists...", end="\r")

    pg_conn.commit()
    print(f"  Inserted {inserted} new artists.              ")
    return inserted


def sync_labels(mysql_conn, pg_conn):
    """Sync labels: insert new ones, skip existing."""
    print("\n=== Syncing Labels ===")
    legacy_rows = fetch_legacy_label_ids(mysql_conn)
    existing_ids = fetch_existing_ids(pg_conn, "Label", "legacy-label-")

    new_rows = [r for r in legacy_rows if f"legacy-label-{r['id']}" not in existing_ids]
    print(f"  Legacy: {len(legacy_rows)} | Supabase: {len(existing_ids)} | New: {len(new_rows)}")

    if not new_rows:
        print("  Nothing to insert.")
        return 0

    pg_cur = pg_conn.cursor()
    inserted = 0

    for i in range(0, len(new_rows), BATCH_SIZE):
        batch = new_rows[i : i + BATCH_SIZE]
        values = []
        for row in batch:
            name = decode_entities(row["name"]) or f"Unknown Label #{row['id']}"
            slug = slugify(name)
            if not slug:
                slug = f"label-{row['id']}"
            lid = f"legacy-label-{row['id']}"
            values.append((lid, slug + f"-{row['id']}", name))

        psycopg2.extras.execute_values(
            pg_cur,
            """INSERT INTO "Label" (id, slug, name, "createdAt", "updatedAt")
               VALUES %s ON CONFLICT (id) DO NOTHING""",
            values,
            template="(%s, %s, %s, NOW(), NOW())",
        )
        inserted += len(batch)
        print(f"  Inserted {inserted}/{len(new_rows)} labels...", end="\r")

    pg_conn.commit()
    print(f"  Inserted {inserted} new labels.              ")
    return inserted


def sync_releases(mysql_conn, pg_conn):
    """Sync releases: upsert content fields, protect auction/discogs fields."""
    print("\n=== Syncing Releases ===")
    cursor = mysql_conn.cursor(dictionary=True)

    # Count total releases in legacy
    cursor.execute("SELECT COUNT(*) as cnt FROM 3wadmin_tapes_releases")
    total = cursor.fetchone()["cnt"]
    print(f"  Legacy releases: {total}")

    pg_cur = pg_conn.cursor()
    offset = 0
    processed = 0
    errors = 0
    image_count = 0

    while offset < total:
        cursor.execute(
            """
            SELECT
                r.id, r.title, r.moreinfo, r.cataloguenumber, r.year,
                r.preis, r.frei, r.spezifikation, r.artist, r.label,
                r.format, r.country,
                b.name as band_name,
                l.label as label_name,
                f.name as format_name,
                c.name as country_name,
                bi.bild as image_filename
            FROM 3wadmin_tapes_releases r
            LEFT JOIN 3wadmin_tapes_band b ON r.artist = b.id
            LEFT JOIN 3wadmin_tapes_labels l ON r.label = l.id
            LEFT JOIN 3wadmin_tapes_formate f ON r.format = f.id
            LEFT JOIN 3wadmin_shop_countries c ON r.country = c.id
            LEFT JOIN bilder_1 bi ON bi.inid = r.id AND bi.typ = 10
            GROUP BY r.id
            ORDER BY r.id ASC
            LIMIT %s OFFSET %s
            """,
            (BATCH_SIZE, offset),
        )
        rows = cursor.fetchall()
        if not rows:
            break

        release_values = []
        image_values = []

        for row in rows:
            try:
                title = decode_entities(row["title"]) or f"Release #{row['id']}"
                description = str(row["moreinfo"]) if row["moreinfo"] else None
                catalog_number = decode_entities(row["cataloguenumber"]) if row["cataloguenumber"] else None
                if catalog_number:
                    catalog_number = re.sub(r"[\r\n]+", " ", catalog_number).strip()

                year = row["year"] if row["year"] and row["year"] > 0 else None
                format_enum = map_format(row.get("format_name"))
                country = decode_entities(row["country_name"]) if row["country_name"] else None

                artist_name = decode_entities(row["band_name"]) if row["band_name"] else "unknown"
                slug = slugify(f"{artist_name} {title} {row['id']}")
                if not slug:
                    slug = f"release-{row['id']}"

                artist_id = f"legacy-artist-{row['artist']}" if row["artist"] else None
                label_id = f"legacy-label-{row['label']}" if row["label"] else None
                release_id = f"legacy-release-{row['id']}"

                cover_image = None
                if row.get("image_filename"):
                    filename = str(row["image_filename"])
                    cover_image = IMAGE_BASE_URL + filename

                release_values.append((
                    release_id,
                    slug,
                    title,
                    description,
                    year,
                    format_enum,
                    catalog_number,
                    country,
                    artist_id,
                    label_id,
                    cover_image,
                ))

                # Image record
                if cover_image:
                    image_id = f"legacy-image-{row['id']}"
                    image_values.append((image_id, cover_image, title, release_id))

            except Exception as e:
                errors += 1
                print(f"\n  ERROR on release #{row['id']}: {e}")

        # Upsert releases (content fields only, protect discogs/auction fields)
        if release_values:
            psycopg2.extras.execute_values(
                pg_cur,
                """INSERT INTO "Release" (
                    id, slug, title, description, year, format,
                    "catalogNumber", country, "artistId", "labelId", "coverImage",
                    "createdAt", "updatedAt", legacy_last_synced
                ) VALUES %s
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    year = EXCLUDED.year,
                    format = EXCLUDED.format,
                    "catalogNumber" = EXCLUDED."catalogNumber",
                    country = EXCLUDED.country,
                    "artistId" = EXCLUDED."artistId",
                    "labelId" = EXCLUDED."labelId",
                    "coverImage" = EXCLUDED."coverImage",
                    "updatedAt" = NOW(),
                    legacy_last_synced = NOW()""",
                release_values,
                template="(%s, %s, %s, %s, %s, %s::\"ReleaseFormat\", %s, %s, %s, %s, %s, NOW(), NOW(), NOW())",
            )

        # Insert new images (skip existing)
        if image_values:
            psycopg2.extras.execute_values(
                pg_cur,
                """INSERT INTO "Image" (id, url, alt, "releaseId", "createdAt")
                   VALUES %s ON CONFLICT (id) DO NOTHING""",
                image_values,
                template="(%s, %s, %s, %s, NOW())",
            )
            image_count += len(image_values)

        pg_conn.commit()
        processed += len(rows)
        offset += BATCH_SIZE
        print(f"  Synced {processed}/{total} releases ({errors} errors)...", end="\r")

    print(f"\n  Done: {processed} releases synced, {image_count} images, {errors} errors")
    cursor.close()
    return {"processed": processed, "images": image_count, "errors": errors}


def main():
    start_time = time.time()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print("=" * 60)
    print(f"Legacy MySQL -> Supabase Incremental Sync")
    print(f"Started: {now}")
    print("=" * 60)

    # Connect to both databases
    print("\nConnecting to Legacy MySQL...")
    try:
        mysql_conn = get_mysql_connection()
        print("  Connected!")
    except Exception as e:
        print(f"  FAILED: {e}")
        return

    print("Connecting to Supabase PostgreSQL...")
    try:
        pg_conn = get_pg_connection()
        print("  Connected!")
    except Exception as e:
        print(f"  FAILED: {e}")
        mysql_conn.close()
        return

    try:
        # Sync artists and labels
        new_artists = sync_artists(mysql_conn, pg_conn)
        new_labels = sync_labels(mysql_conn, pg_conn)

        # Sync releases (full upsert)
        release_stats = sync_releases(mysql_conn, pg_conn)

        # Log batch result to sync_log
        elapsed = time.time() - start_time
        changes = {
            "new_artists": new_artists,
            "new_labels": new_labels,
            "releases_processed": release_stats["processed"],
            "new_images": release_stats["images"],
            "errors": release_stats["errors"],
            "duration_seconds": round(elapsed, 1),
        }

        status = "success" if release_stats["errors"] == 0 else "success"
        error_msg = None
        if release_stats["errors"] > 0:
            error_msg = f"{release_stats['errors']} release processing errors"

        log_sync(pg_conn, None, "legacy", changes, status=status, error_message=error_msg)

        # Print summary
        print(f"\n{'=' * 60}")
        print(f"SYNC SUMMARY")
        print(f"{'=' * 60}")
        print(f"  New artists:       {new_artists}")
        print(f"  New labels:        {new_labels}")
        print(f"  Releases synced:   {release_stats['processed']}")
        print(f"  New images:        {release_stats['images']}")
        print(f"  Errors:            {release_stats['errors']}")
        print(f"  Duration:          {elapsed:.1f}s ({elapsed / 60:.1f} min)")
        print(f"{'=' * 60}")

    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        try:
            log_sync(pg_conn, None, "legacy", None, status="error", error_message=str(e))
        except Exception:
            pass
        raise
    finally:
        mysql_conn.close()
        pg_conn.close()


if __name__ == "__main__":
    main()
