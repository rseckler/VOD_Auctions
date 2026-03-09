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
    map_format_by_id,
    parse_price,
    slugify,
)


# German → English country name mapping (DB stores English since 2026-03-08)
COUNTRY_DE_TO_EN = {
    "Vereinigte Staaten von Amerika": "United States",
    "Deutschland": "Germany",
    "Vereinigtes Königreich von Großbritannien und Nordirland": "United Kingdom",
    "--": None,
    "Frankreich": "France",
    "Niederlande": "Netherlands",
    "Italien": "Italy",
    "Belgien": "Belgium",
    "Japan": "Japan",
    "Kanada": "Canada",
    "Schweiz": "Switzerland",
    "Australien": "Australia",
    "Spanien": "Spain",
    "Österreich": "Austria",
    "Schweden": "Sweden",
    "Norwegen": "Norway",
    "Polen": "Poland",
    "Europäische Union": "European Union",
    "Portugal": "Portugal",
    "Dänemark": "Denmark",
    "Deutsche Demokratische Republik": "East Germany (GDR)",
    "Jugoslawien": "Yugoslavia",
    "Slowenien": "Slovenia",
    "Ungarn": "Hungary",
    "Griechenland": "Greece",
    "Mexiko": "Mexico",
    "Neuseeland": "New Zealand",
    "Finnland": "Finland",
    "Südafrika, Republik": "South Africa",
    "Russische Föderation": "Russia",
    "Tschechische Republik": "Czech Republic",
    "Serbien und Montenegro": "Serbia and Montenegro",
    "Brasilien": "Brazil",
    "Argentinien": "Argentina",
    "Irland, Republik": "Ireland",
    "Israel": "Israel",
    "Island": "Iceland",
    "Uruguay": "Uruguay",
    "Indien": "India",
    "Slowakei": "Slovakia",
    "Hongkong": "Hong Kong",
    "Chile": "Chile",
    "Luxemburg": "Luxembourg",
    "Rumänien": "Romania",
    "Kroatien": "Croatia",
}


def translate_country(name):
    """Translate German country name to English."""
    if not name:
        return None
    decoded = decode_entities(name)
    return COUNTRY_DE_TO_EN.get(decoded, decoded)


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
                (SELECT bi2.bild FROM bilder_1 bi2
                 WHERE bi2.inid = r.id AND bi2.typ = 10
                 ORDER BY bi2.rang, bi2.id LIMIT 1) as image_filename
            FROM 3wadmin_tapes_releases r
            LEFT JOIN 3wadmin_tapes_band b ON r.artist = b.id
            LEFT JOIN 3wadmin_tapes_labels l ON r.label = l.id
            LEFT JOIN 3wadmin_tapes_formate f ON r.format = f.id
            LEFT JOIN 3wadmin_shop_countries c ON r.country = c.id
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
                format_id = row["format"] if row["format"] and row["format"] > 0 else None
                format_enum = map_format_by_id(format_id)
                country = translate_country(row["country_name"])

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

                price = parse_price(row.get("preis"))
                condition = decode_entities(row.get("spezifikation")) if row.get("spezifikation") else None
                format_detail = decode_entities(row.get("format_name")) if row.get("format_name") else None

                release_values.append((
                    release_id,
                    slug,
                    title,
                    description,
                    year,
                    format_enum,
                    format_id,
                    catalog_number,
                    country,
                    artist_id,
                    label_id,
                    cover_image,
                    price,
                    condition,
                    format_detail,
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
                    id, slug, title, description, year, format, format_id,
                    "catalogNumber", country, "artistId", "labelId", "coverImage",
                    legacy_price, legacy_condition, legacy_format_detail,
                    "createdAt", "updatedAt", legacy_last_synced
                ) VALUES %s
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    year = EXCLUDED.year,
                    format = EXCLUDED.format,
                    format_id = EXCLUDED.format_id,
                    "catalogNumber" = EXCLUDED."catalogNumber",
                    country = EXCLUDED.country,
                    "artistId" = EXCLUDED."artistId",
                    "labelId" = CASE
                        WHEN "Release".label_enriched = TRUE THEN "Release"."labelId"
                        ELSE EXCLUDED."labelId"
                    END,
                    "coverImage" = EXCLUDED."coverImage",
                    legacy_price = EXCLUDED.legacy_price,
                    legacy_condition = EXCLUDED.legacy_condition,
                    legacy_format_detail = EXCLUDED.legacy_format_detail,
                    "updatedAt" = NOW(),
                    legacy_last_synced = NOW()""",
                release_values,
                template="(%s, %s, %s, %s, %s, %s::\"ReleaseFormat\", %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), NOW())",
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


def sync_pressorga(mysql_conn, pg_conn):
    """Sync PressOrga entities: insert new ones, skip existing."""
    print("\n=== Syncing PressOrga ===")
    cursor = mysql_conn.cursor(dictionary=True)
    cursor.execute("SELECT id, name FROM 3wadmin_tapes_pressorga ORDER BY id")
    legacy_rows = cursor.fetchall()
    cursor.close()

    existing_ids = fetch_existing_ids(pg_conn, "PressOrga", "legacy-pressorga-")
    new_rows = [r for r in legacy_rows if f"legacy-pressorga-{r['id']}" not in existing_ids]
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
            name = decode_entities(row["name"]) or f"PressOrga #{row['id']}"
            slug = slugify(name) or f"pressorga-{row['id']}"
            pid = f"legacy-pressorga-{row['id']}"
            values.append((pid, slug + f"-{row['id']}", name))

        psycopg2.extras.execute_values(
            pg_cur,
            """INSERT INTO "PressOrga" (id, slug, name, "createdAt", "updatedAt")
               VALUES %s ON CONFLICT (id) DO NOTHING""",
            values,
            template="(%s, %s, %s, NOW(), NOW())",
        )
        inserted += len(batch)

    pg_conn.commit()
    print(f"  Inserted {inserted} new PressOrga.              ")
    return inserted


def sync_literature(mysql_conn, pg_conn, table, category, id_prefix, ref_field, ref_prefix, bilder_typ):
    """Sync a literature table: upsert into Release, protect auction/discogs fields."""
    print(f"\n=== Syncing {category} ===")
    cursor = mysql_conn.cursor(dictionary=True)

    if "band_lit" in table:
        entity_join = "LEFT JOIN 3wadmin_tapes_band e ON t.aid = e.id"
        entity_name_col = "e.name as entity_name"
    elif "labels_lit" in table:
        entity_join = "LEFT JOIN 3wadmin_tapes_labels e ON t.aid = e.id"
        entity_name_col = "e.label as entity_name"
    else:
        entity_join = "LEFT JOIN 3wadmin_tapes_pressorga e ON t.aid = e.id"
        entity_name_col = "e.name as entity_name"

    cursor.execute(f"""
        SELECT t.id, t.aid, t.title, t.text, t.country, t.year, t.format, t.preis,
               {entity_name_col},
               f.name as format_name,
               c.name as country_name,
               (SELECT bi2.bild FROM bilder_1 bi2
                WHERE bi2.inid = t.id AND bi2.typ = {bilder_typ}
                ORDER BY bi2.rang, bi2.id LIMIT 1) as image_filename,
               (SELECT bi2.id FROM bilder_1 bi2
                WHERE bi2.inid = t.id AND bi2.typ = {bilder_typ}
                ORDER BY bi2.rang, bi2.id LIMIT 1) as image_id
        FROM `{table}` t
        {entity_join}
        LEFT JOIN 3wadmin_tapes_formate f ON t.format = f.id
        LEFT JOIN 3wadmin_shop_countries c ON t.country = c.id
        ORDER BY t.id
    """)
    rows = cursor.fetchall()
    cursor.close()
    print(f"  Legacy: {len(rows)} items")

    pg_cur = pg_conn.cursor()
    processed = 0
    image_count = 0
    errors = 0

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        release_values = []
        image_values = []

        for r in batch:
            try:
                title = decode_entities(r["title"]) or f"Literature #{r['id']}"
                description = str(r["text"]) if r["text"] else None
                entity_name = decode_entities(r["entity_name"]) if r["entity_name"] else "unknown"

                year = None
                if r["year"]:
                    try:
                        y = int(str(r["year"]).strip())
                        if 0 < y <= 2100:
                            year = y
                    except (ValueError, TypeError):
                        pass

                format_id = r["format"] if r["format"] and r["format"] > 0 else None
                format_enum = map_format_by_id(format_id)
                country = translate_country(r["country_name"])
                format_detail = decode_entities(r["format_name"]) if r["format_name"] else None
                price = parse_price(r.get("preis"))

                slug = slugify(f"{entity_name} {title} {r['id']}") or f"{id_prefix}-{r['id']}"
                release_id = f"{id_prefix}-{r['id']}"
                ref_id = f"{ref_prefix}-{r['aid']}" if r["aid"] else None

                artist_id = ref_id if ref_field == "artistId" else None
                label_id = ref_id if ref_field == "labelId" else None
                pressorga_id = ref_id if ref_field == "pressOrgaId" else None

                cover_image = None
                if r.get("image_filename"):
                    cover_image = IMAGE_BASE_URL + str(r["image_filename"])

                release_values.append((
                    release_id, slug, title, description, year,
                    format_enum, format_id, country,
                    artist_id, label_id, pressorga_id,
                    cover_image, price, format_detail, category,
                ))

                if cover_image and r.get("image_id"):
                    image_values.append((
                        f"legacy-image-lit-{r['image_id']}",
                        cover_image, title, release_id,
                    ))
            except Exception as e:
                errors += 1
                print(f"\n  ERROR on {table} #{r['id']}: {e}")

        if release_values:
            psycopg2.extras.execute_values(
                pg_cur,
                """INSERT INTO "Release" (
                    id, slug, title, description, year, format, format_id,
                    country, "artistId", "labelId", "pressOrgaId", "coverImage",
                    legacy_price, legacy_format_detail, product_category,
                    "createdAt", "updatedAt", legacy_last_synced
                ) VALUES %s
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    year = EXCLUDED.year,
                    format = EXCLUDED.format,
                    format_id = EXCLUDED.format_id,
                    country = EXCLUDED.country,
                    "artistId" = EXCLUDED."artistId",
                    "labelId" = CASE
                        WHEN "Release".label_enriched = TRUE THEN "Release"."labelId"
                        ELSE EXCLUDED."labelId"
                    END,
                    "pressOrgaId" = EXCLUDED."pressOrgaId",
                    "coverImage" = EXCLUDED."coverImage",
                    legacy_price = EXCLUDED.legacy_price,
                    legacy_format_detail = EXCLUDED.legacy_format_detail,
                    "updatedAt" = NOW(),
                    legacy_last_synced = NOW()""",
                release_values,
                template="(%s, %s, %s, %s, %s, %s::\"ReleaseFormat\", %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), NOW())",
            )

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
        processed += len(batch)
        print(f"  Synced {processed}/{len(rows)} ({errors} errors)...", end="\r")

    print(f"\n  Done: {processed} items, {image_count} images, {errors} errors")
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
        # Sync entities
        new_artists = sync_artists(mysql_conn, pg_conn)
        new_labels = sync_labels(mysql_conn, pg_conn)
        new_pressorga = sync_pressorga(mysql_conn, pg_conn)

        # Sync releases (full upsert)
        release_stats = sync_releases(mysql_conn, pg_conn)

        # Sync literature tables
        band_lit = sync_literature(
            mysql_conn, pg_conn,
            table="3wadmin_tapes_band_lit", category="band_literature",
            id_prefix="legacy-bandlit", ref_field="artistId",
            ref_prefix="legacy-artist", bilder_typ=13,
        )
        labels_lit = sync_literature(
            mysql_conn, pg_conn,
            table="3wadmin_tapes_labels_lit", category="label_literature",
            id_prefix="legacy-labellit", ref_field="labelId",
            ref_prefix="legacy-label", bilder_typ=14,  # typ=14 = labels_lit images
        )
        press_lit = sync_literature(
            mysql_conn, pg_conn,
            table="3wadmin_tapes_pressorga_lit", category="press_literature",
            id_prefix="legacy-presslit", ref_field="pressOrgaId",
            ref_prefix="legacy-pressorga", bilder_typ=12,  # typ=12 = pressorga_lit images
        )

        # Log batch result to sync_log
        elapsed = time.time() - start_time
        total_errors = (release_stats["errors"] + band_lit["errors"]
                        + labels_lit["errors"] + press_lit["errors"])
        changes = {
            "new_artists": new_artists,
            "new_labels": new_labels,
            "new_pressorga": new_pressorga,
            "releases_processed": release_stats["processed"],
            "band_lit_processed": band_lit["processed"],
            "labels_lit_processed": labels_lit["processed"],
            "press_lit_processed": press_lit["processed"],
            "new_images": (release_stats["images"] + band_lit["images"]
                           + labels_lit["images"] + press_lit["images"]),
            "errors": total_errors,
            "duration_seconds": round(elapsed, 1),
        }

        error_msg = None
        if total_errors > 0:
            error_msg = f"{total_errors} processing errors"

        log_sync(pg_conn, None, "legacy", changes, status="success", error_message=error_msg)

        # Print summary
        print(f"\n{'=' * 60}")
        print("SYNC SUMMARY")
        print(f"{'=' * 60}")
        print(f"  New artists:       {new_artists}")
        print(f"  New labels:        {new_labels}")
        print(f"  New PressOrga:     {new_pressorga}")
        print(f"  Releases synced:   {release_stats['processed']}")
        print(f"  Band Literature:   {band_lit['processed']}")
        print(f"  Labels Literature: {labels_lit['processed']}")
        print(f"  Press Literature:  {press_lit['processed']}")
        print(f"  Total errors:      {total_errors}")
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
