#!/usr/bin/env python3
"""
Final remaining migration steps (comments, label discography, katalog, images).
Artist discography already done (3914 entries).
Uses batch operations and reconnects if needed.
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

    cursor.execute("SELECT id, tid, user, rate, text, date FROM 3wadmin_tapes_comment ORDER BY id")
    rows = cursor.fetchall()
    print(f"  Legacy comments: {len(rows)}")

    pg_cur = pg_conn.cursor()
    inserted = 0
    skipped = 0

    for row in rows:
        comment_id = f"legacy-comment-{row['id']}"
        release_id = f"legacy-release-{row['tid']}"
        author = f"User #{row['user']}" if row.get("user") else None
        body = str(row.get("text", "")).strip() if row.get("text") else None
        rating = int(row.get("rate", 0) or 0) if row.get("rate") else None
        legacy_date = row.get("date")

        if not body:
            skipped += 1
            continue

        try:
            pg_cur.execute(
                """INSERT INTO "Comment" (id, "releaseId", author, body, rating, legacy_date, visible, "createdAt")
                   VALUES (%s, %s, %s, %s, %s, %s, true, NOW()) ON CONFLICT (id) DO NOTHING""",
                (comment_id, release_id, author, body, rating, legacy_date),
            )
        except Exception as e:
            pg_conn.rollback()
            skipped += 1
            if skipped <= 3:
                print(f"  Comment {row['id']} error: {e}")
            continue

    pg_conn.commit()
    cursor.close()
    print(f"  Done: {inserted + (len(rows) - skipped)} comments ({skipped} skipped)")
    return {"inserted": len(rows) - skipped}


def migrate_label_discography(pg_conn):
    """Migrate labels_lit → LabelLink table using fresh MySQL connection."""
    print("\n=== Migrating Label Discography (labels_lit) ===")
    mysql_conn = get_mysql_connection()
    cursor = mysql_conn.cursor(dictionary=True)

    cursor.execute("SELECT id, aid, title, text, year FROM 3wadmin_tapes_labels_lit ORDER BY id")
    rows = cursor.fetchall()
    print(f"  Legacy entries: {len(rows)}")

    pg_cur = pg_conn.cursor()
    inserted = 0
    skipped = 0

    # Batch inserts
    values = []
    for row in rows:
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

        values.append((link_id, label_id, info.strip(), title, "discography"))

    if values:
        for v in values:
            try:
                pg_cur.execute(
                    """INSERT INTO "LabelLink" (id, "labelId", url, title, link_type, "createdAt")
                       VALUES (%s, %s, %s, %s, %s, NOW()) ON CONFLICT (id) DO NOTHING""",
                    v,
                )
                inserted += 1
            except Exception:
                pg_conn.rollback()
                skipped += 1
        pg_conn.commit()

    mysql_conn.close()
    cursor.close()
    print(f"  Done: {inserted} label discography entries ({skipped} skipped)")
    return {"inserted": inserted}


def migrate_katalog(pg_conn):
    """Migrate tapes_katalog → Katalog table using fresh MySQL connection."""
    print("\n=== Migrating Katalog ===")
    mysql_conn = get_mysql_connection()
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
            navid = str(row.get("navid", "")) if row.get("navid") else None
            values.append((kat_id, text, navid))

        if values:
            try:
                psycopg2.extras.execute_values(
                    pg_cur,
                    """INSERT INTO "Katalog" (id, title, notes, "createdAt")
                       VALUES %s ON CONFLICT (id) DO NOTHING""",
                    values,
                    template="(%s, %s, %s, NOW())",
                )
                inserted += len(values)
            except Exception as e:
                pg_conn.rollback()
                errors += len(values)
                if errors <= BATCH_SIZE:
                    print(f"  Batch error: {e}")

        pg_conn.commit()
        offset += BATCH_SIZE
        print(f"  Inserted {inserted}/{total} ({errors} errors)...", end="\r")

    mysql_conn.close()
    cursor.close()
    print(f"\n  Done: {inserted} katalog entries ({errors} errors)")
    return {"inserted": inserted, "errors": errors}


def migrate_additional_images(pg_conn):
    """Migrate ALL images from bilder_1 (not just typ=10) using fresh MySQL connection."""
    print("\n=== Migrating Additional Images ===")
    mysql_conn = get_mysql_connection()
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
            "SELECT id, inid, bild, typ FROM bilder_1 WHERE typ != 10 ORDER BY id LIMIT %s OFFSET %s",
            (BATCH_SIZE, offset),
        )
        rows = cursor.fetchall()
        if not rows:
            break

        values = []
        for row in rows:
            filename = str(row.get("bild", ""))
            if not filename:
                skipped += 1
                continue

            image_id = f"legacy-img-{row['id']}"
            release_id = f"legacy-release-{row['inid']}"
            url = IMAGE_BASE_URL + filename
            alt = f"Image {row['id']} (type {row['typ']})"
            values.append((image_id, url, alt, release_id))

        if values:
            try:
                psycopg2.extras.execute_values(
                    pg_cur,
                    """INSERT INTO "Image" (id, url, alt, "releaseId", "createdAt")
                       VALUES %s ON CONFLICT (id) DO NOTHING""",
                    values,
                    template="(%s, %s, %s, %s, NOW())",
                )
                inserted += len(values)
            except Exception as e:
                pg_conn.rollback()
                # Fall back to individual inserts
                for v in values:
                    try:
                        pg_cur.execute(
                            """INSERT INTO "Image" (id, url, alt, "releaseId", "createdAt")
                               VALUES (%s, %s, %s, %s, NOW()) ON CONFLICT (id) DO NOTHING""",
                            v,
                        )
                        inserted += 1
                    except Exception:
                        pg_conn.rollback()
                        skipped += 1

        pg_conn.commit()
        offset += BATCH_SIZE
        print(f"  Processed {min(offset, total)}/{total} ({inserted} inserted, {skipped} skipped)...", end="\r")

    mysql_conn.close()
    cursor.close()
    print(f"\n  Done: {inserted} additional images ({skipped} skipped)")
    return {"inserted": inserted, "skipped": skipped}


def main():
    start_time = time.time()
    print("=" * 70)
    print("FINAL REMAINING MIGRATION STEPS")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    print("Already done: release fields, various artists, artist discography")

    mysql_conn = get_mysql_connection()
    pg_conn = get_pg_connection()
    print("Connected to both databases!")

    try:
        pg_cur = pg_conn.cursor()
        pg_cur.execute("SET session_replication_role = 'replica';")
        pg_conn.commit()
        print("FK checks disabled")

        # Comments (needs mysql_conn)
        comment_stats = migrate_comments(mysql_conn, pg_conn)
        mysql_conn.close()

        # These use fresh MySQL connections internally
        llink_stats = migrate_label_discography(pg_conn)
        kat_stats = migrate_katalog(pg_conn)
        img_stats = migrate_additional_images(pg_conn)

        pg_cur.execute("SET session_replication_role = 'origin';")
        pg_conn.commit()

        elapsed = time.time() - start_time
        changes = {
            "comments": comment_stats["inserted"],
            "label_discography": llink_stats["inserted"],
            "katalog": kat_stats["inserted"],
            "additional_images": img_stats["inserted"],
            "duration_seconds": round(elapsed, 1),
        }
        log_sync(pg_conn, None, "legacy_extended_final", changes)

        print(f"\n{'=' * 70}")
        print("FINAL MIGRATION SUMMARY")
        print(f"{'=' * 70}")
        for key, val in changes.items():
            print(f"  {key:25s}: {val}")
        print(f"{'=' * 70}")

    finally:
        pg_conn.close()


if __name__ == "__main__":
    main()
