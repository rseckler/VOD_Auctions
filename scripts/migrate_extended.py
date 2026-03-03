#!/usr/bin/env python3
"""
Extended migration: Legacy MySQL → Supabase PostgreSQL.

Migrates ALL remaining data from the legacy vodtapes database:
1. Release fields: price, condition (spezifikation), availability (frei), format detail
2. Tracklist/Credits parsed from moreinfo HTML
3. Various Artists (releases_various → ReleaseArtist M:N)
4. Comments (tapes_comment → Comment)
5. Artist links (band_lit → ArtistLink)
6. Label links (labels_lit → LabelLink)
7. Katalog entries (tapes_katalog → Katalog)
8. Additional images (bilder_1 all types, not just typ=10)

Run schema_extension.sql FIRST, then this script.

Usage:
    cd VOD_Auctions/scripts
    python3 migrate_extended.py
"""

import re
import sys
import time
import html as html_lib
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
    map_format,
    parse_price,
    slugify,
)


# ---------------------------------------------------------------------------
# HTML moreinfo parser
# ---------------------------------------------------------------------------

def parse_moreinfo(raw_html: str | None) -> tuple[list | None, str | None]:
    """Parse legacy moreinfo HTML into structured tracklist + credits.

    The moreinfo field contains Discogs-scraped HTML with CSS classes like:
    - tracklist_ZdQ0I, trackTitle_loyWF, trackDuration_K1eN3
    - Or simpler HTML with <br>, <b>, etc.

    Returns: (tracklist_list, credits_text)
    """
    if not raw_html or not raw_html.strip():
        return None, None

    text = str(raw_html)
    tracklist = []
    credits_parts = []

    # Strategy 1: Discogs-style HTML with class names
    # Look for track entries with structured classes
    track_pattern = re.compile(
        r'<span[^>]*class="[^"]*trackPos[^"]*"[^>]*>([^<]*)</span>'
        r'.*?'
        r'<span[^>]*class="[^"]*trackTitle[^"]*"[^>]*>([^<]*)</span>'
        r'(?:.*?<span[^>]*class="[^"]*trackDuration[^"]*"[^>]*>([^<]*)</span>)?',
        re.DOTALL | re.IGNORECASE,
    )

    matches = track_pattern.findall(text)
    if matches:
        for pos, title, duration in matches:
            entry = {}
            pos = pos.strip()
            title = html_lib.unescape(title.strip())
            duration = duration.strip() if duration else None
            if pos:
                entry["position"] = pos
            if title:
                entry["title"] = title
            if duration:
                entry["duration"] = duration
            if entry.get("title"):
                tracklist.append(entry)

    # Strategy 2: Simple list patterns (A1, A2, B1 or 1., 2., etc.)
    if not tracklist:
        line_pattern = re.compile(
            r'(?:^|<br\s*/?>|<p>|<li>)\s*'
            r'([A-Z]?\d+\.?\s*[-–.]?\s*)'
            r'(.+?)(?=<br|<p>|<li>|</|$)',
            re.IGNORECASE | re.MULTILINE,
        )
        for pos_match, title_match in line_pattern.findall(text):
            title = re.sub(r'<[^>]+>', '', title_match).strip()
            title = html_lib.unescape(title)
            pos = pos_match.strip().rstrip('.-– ')
            if title and len(title) > 1 and len(title) < 200:
                entry = {"title": title}
                if pos:
                    entry["position"] = pos
                tracklist.append(entry)

    # Extract credits: look for patterns like "Written by...", "Produced by..."
    credit_pattern = re.compile(
        r'(?:Written|Composed|Produced|Recorded|Mixed|Mastered|Engineered|'
        r'Artwork|Design|Photography|Liner Notes|Notes|Executive Producer|'
        r'Performer|Vocals?|Guitar|Bass|Drums?|Keyboards?|Synthesizer|'
        r'Published)\s*(?:by|:)\s*([^<\n]{2,100})',
        re.IGNORECASE,
    )
    for match in credit_pattern.finditer(text):
        credit_text = html_lib.unescape(match.group(0).strip())
        credit_text = re.sub(r'<[^>]+>', '', credit_text).strip()
        if credit_text:
            credits_parts.append(credit_text)

    # If no structured tracklist found but there's content, store cleaned text as credits
    if not tracklist and not credits_parts:
        # Clean HTML to plain text
        plain = re.sub(r'<[^>]+>', '\n', text)
        plain = html_lib.unescape(plain)
        plain = re.sub(r'\n{3,}', '\n\n', plain).strip()
        if plain and len(plain) > 10:
            credits_parts.append(plain)

    result_tracklist = tracklist if tracklist else None
    result_credits = "\n".join(credits_parts) if credits_parts else None

    return result_tracklist, result_credits


# ---------------------------------------------------------------------------
# Migration functions
# ---------------------------------------------------------------------------

def run_schema_extension(pg_conn):
    """Run schema_extension.sql to add new columns and tables."""
    from pathlib import Path
    sql_path = Path(__file__).parent / "schema_extension.sql"
    if not sql_path.exists():
        print("ERROR: schema_extension.sql not found!")
        sys.exit(1)

    print("Running schema_extension.sql...")
    cur = pg_conn.cursor()
    sql = sql_path.read_text()
    cur.execute(sql)
    pg_conn.commit()
    print("  Schema extension applied!")


def migrate_release_fields(mysql_conn, pg_conn):
    """Update Release rows with price, condition, availability, tracklist, credits."""
    print("\n=== Migrating Release Extended Fields ===")
    cursor = mysql_conn.cursor(dictionary=True)

    cursor.execute("SELECT COUNT(*) as cnt FROM 3wadmin_tapes_releases")
    total = cursor.fetchone()["cnt"]
    print(f"  Total legacy releases: {total}")

    pg_cur = pg_conn.cursor()
    offset = 0
    updated = 0
    tracklist_count = 0
    credits_count = 0
    errors = 0

    while offset < total:
        cursor.execute(
            """SELECT r.id, r.preis, r.spezifikation, r.frei, r.moreinfo,
                      f.name as format_name
               FROM 3wadmin_tapes_releases r
               LEFT JOIN 3wadmin_tapes_formate f ON r.format = f.id
               ORDER BY r.id
               LIMIT %s OFFSET %s""",
            (BATCH_SIZE, offset),
        )
        rows = cursor.fetchall()
        if not rows:
            break

        for row in rows:
            try:
                release_id = f"legacy-release-{row['id']}"
                price = parse_price(row.get("preis"))
                condition = decode_entities(row.get("spezifikation")) or None
                availability = int(row.get("frei", 0) or 0)
                format_detail = decode_entities(row.get("format_name")) or None

                # Parse moreinfo
                tracklist, credits = parse_moreinfo(row.get("moreinfo"))

                # Build SET clause dynamically (only non-null fields)
                sets = []
                vals = []

                if price is not None:
                    sets.append("legacy_price = %s")
                    vals.append(price)
                if condition:
                    sets.append("legacy_condition = %s")
                    vals.append(condition)
                sets.append("legacy_availability = %s")
                vals.append(availability)
                if format_detail:
                    sets.append("legacy_format_detail = %s")
                    vals.append(format_detail)
                if tracklist:
                    sets.append("tracklist = %s::jsonb")
                    vals.append(psycopg2.extras.Json(tracklist))
                    tracklist_count += 1
                if credits:
                    sets.append("credits = %s")
                    vals.append(credits)
                    credits_count += 1

                if sets:
                    sets.append('"updatedAt" = NOW()')
                    vals.append(release_id)
                    pg_cur.execute(
                        f'UPDATE "Release" SET {", ".join(sets)} WHERE id = %s',
                        vals,
                    )
                    updated += 1

            except Exception as e:
                errors += 1
                if errors <= 5:
                    print(f"\n  ERROR on release #{row['id']}: {e}")

        pg_conn.commit()
        offset += BATCH_SIZE
        print(f"  Updated {updated}/{total} ({tracklist_count} tracklists, {credits_count} credits, {errors} errors)...", end="\r")

    cursor.close()
    print(f"\n  Done: {updated} releases updated, {tracklist_count} tracklists, {credits_count} credits, {errors} errors")
    return {"updated": updated, "tracklists": tracklist_count, "credits": credits_count, "errors": errors}


def migrate_various_artists(mysql_conn, pg_conn):
    """Migrate releases_various → ReleaseArtist M:N table."""
    print("\n=== Migrating Various Artists (Compilations) ===")
    cursor = mysql_conn.cursor(dictionary=True)

    cursor.execute("SELECT COUNT(*) as cnt FROM 3wadmin_tapes_releases_various")
    total = cursor.fetchone()["cnt"]
    print(f"  Legacy entries: {total}")

    pg_cur = pg_conn.cursor()
    offset = 0
    inserted = 0
    skipped = 0
    errors = 0

    while offset < total:
        cursor.execute(
            "SELECT bandid, releasid FROM 3wadmin_tapes_releases_various ORDER BY releasid, bandid LIMIT %s OFFSET %s",
            (BATCH_SIZE, offset),
        )
        rows = cursor.fetchall()
        if not rows:
            break

        values = []
        for row in rows:
            try:
                release_id = f"legacy-release-{row['releasid']}"
                artist_id = f"legacy-artist-{row['bandid']}"
                entry_id = f"legacy-ra-{row['releasid']}-{row['bandid']}"
                values.append((entry_id, release_id, artist_id, "performer"))
            except Exception as e:
                errors += 1

        if values:
            try:
                psycopg2.extras.execute_values(
                    pg_cur,
                    """INSERT INTO "ReleaseArtist" (id, "releaseId", "artistId", role, "createdAt")
                       VALUES %s ON CONFLICT (id) DO NOTHING""",
                    values,
                    template="(%s, %s, %s, %s, NOW())",
                )
                inserted += len(values)
            except Exception as e:
                # Some FK violations expected (deleted artists/releases)
                pg_conn.rollback()
                # Insert one by one to skip FK violations
                for v in values:
                    try:
                        pg_cur.execute(
                            """INSERT INTO "ReleaseArtist" (id, "releaseId", "artistId", role, "createdAt")
                               VALUES (%s, %s, %s, %s, NOW()) ON CONFLICT (id) DO NOTHING""",
                            v,
                        )
                        pg_conn.commit()
                        inserted += 1
                    except Exception:
                        pg_conn.rollback()
                        skipped += 1

        pg_conn.commit()
        offset += BATCH_SIZE
        print(f"  Inserted {inserted}/{total} ({skipped} skipped, {errors} errors)...", end="\r")

    cursor.close()
    print(f"\n  Done: {inserted} ReleaseArtist entries ({skipped} skipped FK violations)")
    return {"inserted": inserted, "skipped": skipped}


def migrate_comments(mysql_conn, pg_conn):
    """Migrate tapes_comment → Comment table."""
    print("\n=== Migrating Comments ===")
    cursor = mysql_conn.cursor(dictionary=True)

    cursor.execute("SELECT COUNT(*) as cnt FROM 3wadmin_tapes_comment")
    total = cursor.fetchone()["cnt"]
    print(f"  Legacy comments: {total}")

    cursor.execute(
        """SELECT id, releaseid, name, email, comment, ranking, datum, sichtbar
           FROM 3wadmin_tapes_comment ORDER BY id"""
    )
    rows = cursor.fetchall()

    pg_cur = pg_conn.cursor()
    values = []
    for row in rows:
        try:
            comment_id = f"legacy-comment-{row['id']}"
            release_id = f"legacy-release-{row['releaseid']}"
            author = decode_entities(row.get("name")) or None
            email = str(row.get("email", "")) or None
            body = decode_entities(row.get("comment")) or None
            rating = int(row.get("ranking", 0) or 0) if row.get("ranking") else None
            legacy_date = row.get("datum")
            visible = bool(row.get("sichtbar", 1))
            values.append((comment_id, release_id, author, email, body, rating, legacy_date, visible))
        except Exception as e:
            print(f"  ERROR comment #{row['id']}: {e}")

    if values:
        for v in values:
            try:
                pg_cur.execute(
                    """INSERT INTO "Comment" (id, "releaseId", author, email, body, rating, legacy_date, visible, "createdAt")
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW()) ON CONFLICT (id) DO NOTHING""",
                    v,
                )
            except Exception:
                pg_conn.rollback()
                continue
        pg_conn.commit()

    cursor.close()
    print(f"  Done: {len(values)} comments migrated")
    return {"inserted": len(values)}


def migrate_artist_links(mysql_conn, pg_conn):
    """Migrate band_lit → ArtistLink table."""
    print("\n=== Migrating Artist Links ===")
    cursor = mysql_conn.cursor(dictionary=True)

    cursor.execute("SELECT COUNT(*) as cnt FROM 3wadmin_tapes_band_lit")
    total = cursor.fetchone()["cnt"]
    print(f"  Legacy artist links: {total}")

    cursor.execute("SELECT id, bandid, link, name FROM 3wadmin_tapes_band_lit ORDER BY id")
    rows = cursor.fetchall()

    pg_cur = pg_conn.cursor()
    inserted = 0
    skipped = 0

    for row in rows:
        try:
            link_id = f"legacy-alink-{row['id']}"
            artist_id = f"legacy-artist-{row['bandid']}"
            url = decode_entities(row.get("link")) or ""
            title = decode_entities(row.get("name")) or None

            if not url or len(url) < 5:
                skipped += 1
                continue

            pg_cur.execute(
                """INSERT INTO "ArtistLink" (id, "artistId", url, title, link_type, "createdAt")
                   VALUES (%s, %s, %s, %s, %s, NOW()) ON CONFLICT (id) DO NOTHING""",
                (link_id, artist_id, url, title, "website"),
            )
            pg_conn.commit()
            inserted += 1
        except Exception:
            pg_conn.rollback()
            skipped += 1

    cursor.close()
    print(f"  Done: {inserted} artist links ({skipped} skipped)")
    return {"inserted": inserted, "skipped": skipped}


def migrate_label_links(mysql_conn, pg_conn):
    """Migrate labels_lit → LabelLink table."""
    print("\n=== Migrating Label Links ===")
    cursor = mysql_conn.cursor(dictionary=True)

    cursor.execute("SELECT COUNT(*) as cnt FROM 3wadmin_tapes_labels_lit")
    total = cursor.fetchone()["cnt"]
    print(f"  Legacy label links: {total}")

    cursor.execute("SELECT id, labelid, link, name FROM 3wadmin_tapes_labels_lit ORDER BY id")
    rows = cursor.fetchall()

    pg_cur = pg_conn.cursor()
    inserted = 0
    skipped = 0

    for row in rows:
        try:
            link_id = f"legacy-llink-{row['id']}"
            label_id = f"legacy-label-{row['labelid']}"
            url = decode_entities(row.get("link")) or ""
            title = decode_entities(row.get("name")) or None

            if not url or len(url) < 5:
                skipped += 1
                continue

            pg_cur.execute(
                """INSERT INTO "LabelLink" (id, "labelId", url, title, link_type, "createdAt")
                   VALUES (%s, %s, %s, %s, %s, NOW()) ON CONFLICT (id) DO NOTHING""",
                (link_id, label_id, url, title, "website"),
            )
            pg_conn.commit()
            inserted += 1
        except Exception:
            pg_conn.rollback()
            skipped += 1

    cursor.close()
    print(f"  Done: {inserted} label links ({skipped} skipped)")
    return {"inserted": inserted, "skipped": skipped}


def migrate_katalog(mysql_conn, pg_conn):
    """Migrate tapes_katalog → Katalog table."""
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
            """SELECT k.id, k.releaseid, k.bandid, k.labelid,
                      k.title, k.catno, k.format, k.year, k.notes
               FROM 3wadmin_tapes_katalog k
               ORDER BY k.id
               LIMIT %s OFFSET %s""",
            (BATCH_SIZE, offset),
        )
        rows = cursor.fetchall()
        if not rows:
            break

        for row in rows:
            try:
                kat_id = f"legacy-kat-{row['id']}"
                release_id = f"legacy-release-{row['releaseid']}" if row.get("releaseid") else None
                artist_id = f"legacy-artist-{row['bandid']}" if row.get("bandid") else None
                label_id = f"legacy-label-{row['labelid']}" if row.get("labelid") else None
                title = decode_entities(row.get("title")) or None
                cat_no = decode_entities(row.get("catno")) or None
                fmt = decode_entities(row.get("format")) or None
                year = int(row["year"]) if row.get("year") and int(row.get("year", 0)) > 0 else None
                notes = decode_entities(row.get("notes")) or None

                pg_cur.execute(
                    """INSERT INTO "Katalog" (id, "releaseId", "artistId", "labelId",
                       title, catalog_number, format, year, notes, "createdAt")
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                       ON CONFLICT (id) DO NOTHING""",
                    (kat_id, release_id, artist_id, label_id, title, cat_no, fmt, year, notes),
                )
                inserted += 1
            except Exception as e:
                pg_conn.rollback()
                errors += 1

        pg_conn.commit()
        offset += BATCH_SIZE
        print(f"  Inserted {inserted}/{total} ({errors} errors)...", end="\r")

    cursor.close()
    print(f"\n  Done: {inserted} katalog entries ({errors} errors)")
    return {"inserted": inserted, "errors": errors}


def migrate_additional_images(mysql_conn, pg_conn):
    """Migrate ALL images from bilder_1 (not just typ=10)."""
    print("\n=== Migrating Additional Images ===")
    cursor = mysql_conn.cursor(dictionary=True)

    # Count images by type
    cursor.execute("SELECT typ, COUNT(*) as cnt FROM bilder_1 GROUP BY typ ORDER BY cnt DESC")
    type_counts = cursor.fetchall()
    for tc in type_counts:
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
            """SELECT id, inid, bild, typ, rang
               FROM bilder_1
               WHERE typ != 10
               ORDER BY id
               LIMIT %s OFFSET %s""",
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
                inserted += 1
            except Exception:
                pg_conn.rollback()
                skipped += 1

        pg_conn.commit()
        offset += BATCH_SIZE
        print(f"  Inserted {inserted}/{total} ({skipped} skipped)...", end="\r")

    cursor.close()
    print(f"\n  Done: {inserted} additional images ({skipped} skipped)")
    return {"inserted": inserted, "skipped": skipped}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    start_time = time.time()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print("=" * 70)
    print("EXTENDED LEGACY MIGRATION")
    print(f"Started: {now}")
    print("=" * 70)

    # Connect
    print("\nConnecting to Legacy MySQL...")
    mysql_conn = get_mysql_connection()
    print("  Connected!")

    print("Connecting to Supabase PostgreSQL...")
    pg_conn = get_pg_connection()
    print("  Connected!")

    try:
        # Step 0: Apply schema extension
        run_schema_extension(pg_conn)

        # Disable FK checks for migration
        pg_cur = pg_conn.cursor()
        pg_cur.execute("SET session_replication_role = 'replica';")
        pg_conn.commit()
        print("FK checks disabled for migration")

        # Step 1: Release extended fields (price, condition, tracklist, credits)
        release_stats = migrate_release_fields(mysql_conn, pg_conn)

        # Step 2: Various Artists
        va_stats = migrate_various_artists(mysql_conn, pg_conn)

        # Step 3: Comments
        comment_stats = migrate_comments(mysql_conn, pg_conn)

        # Step 4: Artist Links
        alink_stats = migrate_artist_links(mysql_conn, pg_conn)

        # Step 5: Label Links
        llink_stats = migrate_label_links(mysql_conn, pg_conn)

        # Step 6: Katalog
        kat_stats = migrate_katalog(mysql_conn, pg_conn)

        # Step 7: Additional images
        img_stats = migrate_additional_images(mysql_conn, pg_conn)

        # Re-enable FK checks
        pg_cur.execute("SET session_replication_role = 'origin';")
        pg_conn.commit()
        print("\nFK checks re-enabled")

        # Log results
        elapsed = time.time() - start_time
        changes = {
            "releases_updated": release_stats["updated"],
            "tracklists_parsed": release_stats["tracklists"],
            "credits_parsed": release_stats["credits"],
            "various_artists": va_stats["inserted"],
            "comments": comment_stats["inserted"],
            "artist_links": alink_stats["inserted"],
            "label_links": llink_stats["inserted"],
            "katalog": kat_stats["inserted"],
            "additional_images": img_stats["inserted"],
            "duration_seconds": round(elapsed, 1),
        }
        log_sync(pg_conn, None, "legacy_extended", changes)

        # Summary
        print(f"\n{'=' * 70}")
        print("EXTENDED MIGRATION SUMMARY")
        print(f"{'=' * 70}")
        for key, val in changes.items():
            print(f"  {key:25s}: {val}")
        print(f"  {'duration':25s}: {elapsed:.1f}s ({elapsed / 60:.1f} min)")
        print(f"{'=' * 70}")

    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        try:
            log_sync(pg_conn, None, "legacy_extended", None, status="error", error_message=str(e))
        except Exception:
            pass
        raise
    finally:
        mysql_conn.close()
        pg_conn.close()


if __name__ == "__main__":
    main()
