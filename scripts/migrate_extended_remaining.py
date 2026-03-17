#!/usr/bin/env python3
"""
Migrate remaining legacy data (after release fields + various artists already done).
Fixes column names from the first run.

Remaining:
3. Comments (tapes_comment)
4. Artist discography (band_lit → ArtistLink, repurposed as discography)
5. Label discography (labels_lit → LabelLink, repurposed as discography)
6. Katalog entries
7. Additional images (bilder_1 non-typ=10)
"""

import time
from datetime import datetime

import psycopg2
import psycopg2.extras

from shared import (
    BATCH_SIZE,
    IMAGE_BASE_URL,
    decode_entities,
    get_mysql_connection,
    get_pg_connection,
    log_sync,
)


def migrate_comments(mysql_conn, pg_conn):
    """Migrate tapes_comment → Comment table.
    Columns: id, tid (release_id), typ, user, rate, text, date
    """
    print("\n=== Migrating Comments ===")
    cursor = mysql_conn.cursor(dictionary=True)

    cursor.execute("SELECT COUNT(*) as cnt FROM 3wadmin_tapes_comment")
    total = cursor.fetchone()["cnt"]
    print(f"  Legacy comments: {total}")

    cursor.execute("SELECT id, tid, user, rate, text, date FROM 3wadmin_tapes_comment ORDER BY id")
    rows = cursor.fetchall()

    pg_cur = pg_conn.cursor()
    inserted = 0
    skipped = 0

    for row in rows:
        try:
            comment_id = f"legacy-comment-{row['id']}"
            release_id = f"legacy-release-{row['tid']}"
            author = f"User #{row['user']}" if row.get("user") else None
            body = decode_entities(row.get("text")) or None
            rating = int(row.get("rate", 0) or 0) if row.get("rate") else None
            legacy_date = row.get("date")

            if not body:
                skipped += 1
                continue

            pg_cur.execute(
                """INSERT INTO "Comment" (id, "releaseId", author, body, rating, legacy_date, visible, "createdAt")
                   VALUES (%s, %s, %s, %s, %s, %s, true, NOW()) ON CONFLICT (id) DO NOTHING""",
                (comment_id, release_id, author, body, rating, legacy_date),
            )
            pg_conn.commit()
            inserted += 1
        except Exception as e:
            pg_conn.rollback()
            skipped += 1

    cursor.close()
    print(f"  Done: {inserted} comments ({skipped} skipped)")
    return {"inserted": inserted, "skipped": skipped}


def migrate_artist_discography(mysql_conn, pg_conn):
    """Migrate band_lit → ArtistLink table (repurposed as discography entries).
    Columns: id, aid (artist_id), title, text, country, year, format, preis
    """
    print("\n=== Migrating Artist Discography (band_lit) ===")
    cursor = mysql_conn.cursor(dictionary=True)

    cursor.execute("SELECT COUNT(*) as cnt FROM 3wadmin_tapes_band_lit")
    total = cursor.fetchone()["cnt"]
    print(f"  Legacy entries: {total}")

    cursor.execute("SELECT id, aid, title, text, year, format, preis FROM 3wadmin_tapes_band_lit ORDER BY id")
    rows = cursor.fetchall()

    pg_cur = pg_conn.cursor()
    inserted = 0
    skipped = 0

    for row in rows:
        try:
            link_id = f"legacy-alink-{row['id']}"
            artist_id = f"legacy-artist-{row['aid']}"
            title = decode_entities(row.get("title")) or None
            text = decode_entities(row.get("text")) or None
            year = str(row.get("year", "")).strip() or None

            # Store as discography entry: title in url field (repurposed), notes in title
            info = title or ""
            if year:
                info += f" ({year})"
            if text:
                info += f" - {text}"

            if not info.strip():
                skipped += 1
                continue

            pg_cur.execute(
                """INSERT INTO "ArtistLink" (id, "artistId", url, title, link_type, "createdAt")
                   VALUES (%s, %s, %s, %s, %s, NOW()) ON CONFLICT (id) DO NOTHING""",
                (link_id, artist_id, info.strip(), title, "discography"),
            )
            pg_conn.commit()
            inserted += 1
        except Exception:
            pg_conn.rollback()
            skipped += 1

    cursor.close()
    print(f"  Done: {inserted} artist discography entries ({skipped} skipped)")
    return {"inserted": inserted, "skipped": skipped}


def migrate_label_discography(mysql_conn, pg_conn):
    """Migrate labels_lit → LabelLink table (repurposed as discography entries).
    Columns: id, aid (label_id), title, text, country, year, format, preis
    """
    print("\n=== Migrating Label Discography (labels_lit) ===")
    cursor = mysql_conn.cursor(dictionary=True)

    cursor.execute("SELECT COUNT(*) as cnt FROM 3wadmin_tapes_labels_lit")
    total = cursor.fetchone()["cnt"]
    print(f"  Legacy entries: {total}")

    cursor.execute("SELECT id, aid, title, text, year, format, preis FROM 3wadmin_tapes_labels_lit ORDER BY id")
    rows = cursor.fetchall()

    pg_cur = pg_conn.cursor()
    inserted = 0
    skipped = 0

    for row in rows:
        try:
            link_id = f"legacy-llink-{row['id']}"
            label_id = f"legacy-label-{row['aid']}"
            title = decode_entities(row.get("title")) or None
            text = decode_entities(row.get("text")) or None
            year = str(row.get("year", "")).strip() or None

            info = title or ""
            if year:
                info += f" ({year})"
            if text:
                info += f" - {text}"

            if not info.strip():
                skipped += 1
                continue

            pg_cur.execute(
                """INSERT INTO "LabelLink" (id, "labelId", url, title, link_type, "createdAt")
                   VALUES (%s, %s, %s, %s, %s, NOW()) ON CONFLICT (id) DO NOTHING""",
                (link_id, label_id, info.strip(), title, "discography"),
            )
            pg_conn.commit()
            inserted += 1
        except Exception:
            pg_conn.rollback()
            skipped += 1

    cursor.close()
    print(f"  Done: {inserted} label discography entries ({skipped} skipped)")
    return {"inserted": inserted, "skipped": skipped}


def migrate_katalog(mysql_conn, pg_conn):
    """Migrate tapes_katalog → Katalog table.
    Columns: id, navid, text - simple catalog cross-reference
    """
    print("\n=== Migrating Katalog ===")
    cursor = mysql_conn.cursor(dictionary=True)

    cursor.execute("SELECT COUNT(*) as cnt FROM 3wadmin_tapes_katalog")
    total = cursor.fetchone()["cnt"]
    print(f"  Legacy katalog entries: {total}")

    pg_cur = pg_conn.cursor()
    offset = 0
    inserted = 0
    errors = 0

    while offset < total:
        cursor.execute(
            "SELECT id, navid, text FROM 3wadmin_tapes_katalog ORDER BY id LIMIT %s OFFSET %s",
            (BATCH_SIZE, offset),
        )
        rows = cursor.fetchall()
        if not rows:
            break

        values = []
        for row in rows:
            kat_id = f"legacy-kat-{row['id']}"
            text = decode_entities(row.get("text")) or ""
            # navid seems to be a category/navigation id
            values.append((kat_id, text, row.get("navid")))

        if values:
            try:
                psycopg2.extras.execute_values(
                    pg_cur,
                    """INSERT INTO "Katalog" (id, title, notes, "createdAt")
                       VALUES %s ON CONFLICT (id) DO NOTHING""",
                    values,
                    template="(%s, %s, %s::text, NOW())",
                )
            except Exception as e:
                pg_conn.rollback()
                errors += len(values)
                offset += BATCH_SIZE
                continue

        pg_conn.commit()
        inserted += len(values)
        offset += BATCH_SIZE
        print(f"  Inserted {inserted}/{total} ({errors} errors)...", end="\r")

    cursor.close()
    print(f"\n  Done: {inserted} katalog entries ({errors} errors)")
    return {"inserted": inserted, "errors": errors}


def migrate_additional_images(mysql_conn, pg_conn):
    """Migrate ALL images from bilder_1 (not just typ=10)."""
    print("\n=== Migrating Additional Images ===")
    cursor = mysql_conn.cursor(dictionary=True)

    cursor.execute("SELECT typ, COUNT(*) as cnt FROM bilder_1 GROUP BY typ ORDER BY cnt DESC")
    for tc in cursor.fetchall():
        print(f"  typ={tc['typ']}: {tc['cnt']} images")

    cursor.execute("SELECT COUNT(*) as cnt FROM bilder_1 WHERE typ != 10")
    total = cursor.fetchone()["cnt"]
    print(f"  Non-cover images to migrate: {total}")

    pg_cur = pg_conn.cursor()
    offset = 0
    inserted = 0
    skipped = 0

    while offset < total:
        cursor.execute(
            "SELECT id, inid, bild, typ, rang FROM bilder_1 WHERE typ != 10 ORDER BY id LIMIT %s OFFSET %s",
            (BATCH_SIZE, offset),
        )
        rows = cursor.fetchall()
        if not rows:
            break

        for row in rows:
            try:
                filename = str(row.get("bild", ""))
                if not filename:
                    skipped += 1
                    continue

                image_id = f"legacy-img-{row['id']}"
                release_id = f"legacy-release-{row['inid']}"
                url = IMAGE_BASE_URL + filename
                alt = f"Image {row['id']} (type {row['typ']})"

                pg_cur.execute(
                    """INSERT INTO "Image" (id, url, alt, "releaseId", "createdAt")
                       VALUES (%s, %s, %s, %s, NOW()) ON CONFLICT (id) DO NOTHING""",
                    (image_id, url, alt, release_id),
                )
            except Exception:
                pg_conn.rollback()
                skipped += 1
                continue

        pg_conn.commit()
        inserted += len(rows) - skipped
        offset += BATCH_SIZE
        print(f"  Processed {offset}/{total}...", end="\r")

    cursor.close()
    print(f"\n  Done: {inserted} additional images ({skipped} skipped)")
    return {"inserted": inserted, "skipped": skipped}


def main():
    start_time = time.time()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print("=" * 70)
    print("EXTENDED LEGACY MIGRATION - REMAINING STEPS")
    print(f"Started: {now}")
    print("=" * 70)
    print("Steps 1-2 (release fields + various artists) already completed.")

    mysql_conn = get_mysql_connection()
    print("Connected to Legacy MySQL!")
    pg_conn = get_pg_connection()
    print("Connected to Supabase PostgreSQL!")

    try:
        pg_cur = pg_conn.cursor()
        pg_cur.execute("SET session_replication_role = 'replica';")
        pg_conn.commit()
        print("FK checks disabled")

        comment_stats = migrate_comments(mysql_conn, pg_conn)
        alink_stats = migrate_artist_discography(mysql_conn, pg_conn)
        llink_stats = migrate_label_discography(mysql_conn, pg_conn)
        kat_stats = migrate_katalog(mysql_conn, pg_conn)
        img_stats = migrate_additional_images(mysql_conn, pg_conn)

        pg_cur.execute("SET session_replication_role = 'origin';")
        pg_conn.commit()
        print("\nFK checks re-enabled")

        elapsed = time.time() - start_time
        changes = {
            "comments": comment_stats["inserted"],
            "artist_discography": alink_stats["inserted"],
            "label_discography": llink_stats["inserted"],
            "katalog": kat_stats["inserted"],
            "additional_images": img_stats["inserted"],
            "duration_seconds": round(elapsed, 1),
        }
        log_sync(pg_conn, None, "legacy_extended_remaining", changes)

        print(f"\n{'=' * 70}")
        print("REMAINING MIGRATION SUMMARY")
        print(f"{'=' * 70}")
        for key, val in changes.items():
            print(f"  {key:25s}: {val}")
        print(f"{'=' * 70}")

    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        mysql_conn.close()
        pg_conn.close()


if __name__ == "__main__":
    main()
