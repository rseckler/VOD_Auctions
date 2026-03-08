#!/usr/bin/env python3
"""
One-time migration: Literature items from Legacy MySQL to Supabase.

Migrates 3 product categories that were not included in the initial RSE-72 migration:
- 3wadmin_tapes_band_lit     → Release (product_category='band_literature')      3,915 items
- 3wadmin_tapes_labels_lit   → Release (product_category='label_literature')     1,129 items
- 3wadmin_tapes_pressorga_lit→ Release (product_category='press_literature')     6,326 items

Also migrates:
- 3wadmin_tapes_pressorga    → PressOrga table (1,983 entities)
- bilder_1 (typ=13,14,15)   → Image table (~10,462 images)

Usage:
    cd VOD_Auctions/scripts
    python3 migrate_literature.py
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
    map_format_by_id,
    parse_price,
    slugify,
)


def migrate_pressorga(mysql_conn, pg_conn):
    """Migrate PressOrga entities (1,983 entries)."""
    print("\n=== Migrating PressOrga ===")
    cur = mysql_conn.cursor(dictionary=True)
    cur.execute("""
        SELECT p.id, p.name, p.text, p.country, p.year,
               c.name as country_name
        FROM 3wadmin_tapes_pressorga p
        LEFT JOIN 3wadmin_shop_countries c ON p.country = c.id
        ORDER BY p.id
    """)
    rows = cur.fetchall()
    cur.close()
    print(f"  Found {len(rows)} PressOrga entities")

    pg_cur = pg_conn.cursor()
    inserted = 0

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        values = []
        for r in batch:
            name = decode_entities(r["name"]) or f"PressOrga #{r['id']}"
            slug = slugify(name) or f"pressorga-{r['id']}"
            description = str(r["text"]) if r["text"] else None
            country = decode_entities(r["country_name"]) if r["country_name"] else None
            year = str(r["year"]) if r["year"] else None

            values.append((
                f"legacy-pressorga-{r['id']}",
                f"{slug}-{r['id']}",
                name,
                description,
                country,
                year,
            ))

        psycopg2.extras.execute_values(
            pg_cur,
            """INSERT INTO "PressOrga" (id, slug, name, description, country, year, "createdAt", "updatedAt")
               VALUES %s ON CONFLICT (id) DO NOTHING""",
            values,
            template="(%s, %s, %s, %s, %s, %s, NOW(), NOW())",
        )
        inserted += len(batch)
        print(f"  Inserted {inserted}/{len(rows)} PressOrga...", end="\r")

    pg_conn.commit()
    print(f"  Inserted {inserted} PressOrga entities.              ")
    return inserted


def migrate_literature(mysql_conn, pg_conn, table, category, id_prefix, ref_field, ref_prefix, bilder_typ):
    """Generic migration for literature tables.

    Args:
        table: Legacy MySQL table name (e.g. '3wadmin_tapes_band_lit')
        category: product_category value (e.g. 'band_literature')
        id_prefix: ID prefix for Release (e.g. 'legacy-bandlit')
        ref_field: Release column for the entity FK ('artistId', 'labelId', 'pressOrgaId')
        ref_prefix: ID prefix for the referenced entity (e.g. 'legacy-artist')
        bilder_typ: bilder_1.typ value for images of this category
    """
    print(f"\n=== Migrating {category} ({table}) ===")

    # Determine the entity join table and name column
    if "band_lit" in table:
        entity_join = "LEFT JOIN 3wadmin_tapes_band e ON t.aid = e.id"
        entity_name_col = "e.name as entity_name"
    elif "labels_lit" in table:
        entity_join = "LEFT JOIN 3wadmin_tapes_labels e ON t.aid = e.id"
        entity_name_col = "e.label as entity_name"
    else:
        entity_join = "LEFT JOIN 3wadmin_tapes_pressorga e ON t.aid = e.id"
        entity_name_col = "e.name as entity_name"

    cur = mysql_conn.cursor(dictionary=True)
    cur.execute(f"""
        SELECT t.id, t.aid, t.title, t.text, t.country, t.year, t.format, t.preis,
               {entity_name_col},
               f.name as format_name,
               c.name as country_name,
               bi.bild as image_filename,
               bi.id as image_id
        FROM `{table}` t
        {entity_join}
        LEFT JOIN 3wadmin_tapes_formate f ON t.format = f.id
        LEFT JOIN 3wadmin_shop_countries c ON t.country = c.id
        LEFT JOIN bilder_1 bi ON bi.inid = t.id AND bi.typ = {bilder_typ}
        GROUP BY t.id
        ORDER BY t.id
    """)
    rows = cur.fetchall()
    cur.close()
    print(f"  Found {len(rows)} items")

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

                # Year handling: can be varchar in literature tables
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
                country = decode_entities(r["country_name"]) if r["country_name"] else None
                format_detail = decode_entities(r["format_name"]) if r["format_name"] else None
                price = parse_price(r.get("preis"))

                slug = slugify(f"{entity_name} {title} {r['id']}")
                if not slug:
                    slug = f"{id_prefix}-{r['id']}"

                release_id = f"{id_prefix}-{r['id']}"
                ref_id = f"{ref_prefix}-{r['aid']}" if r["aid"] else None

                cover_image = None
                if r.get("image_filename"):
                    filename = str(r["image_filename"])
                    cover_image = IMAGE_BASE_URL + filename

                # Build the values tuple — ref_field determines which FK column gets the value
                # We always pass artistId, labelId, pressOrgaId but only one is set
                artist_id = ref_id if ref_field == "artistId" else None
                label_id = ref_id if ref_field == "labelId" else None
                pressorga_id = ref_id if ref_field == "pressOrgaId" else None

                release_values.append((
                    release_id,
                    slug,
                    title,
                    description,
                    year,
                    format_enum,
                    format_id,
                    country,
                    artist_id,
                    label_id,
                    pressorga_id,
                    cover_image,
                    price,
                    format_detail,
                    category,
                ))

                if cover_image and r.get("image_id"):
                    image_values.append((
                        f"legacy-image-lit-{r['image_id']}",
                        cover_image,
                        title,
                        release_id,
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
                    "createdAt", "updatedAt"
                ) VALUES %s
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    year = EXCLUDED.year,
                    format = EXCLUDED.format,
                    format_id = EXCLUDED.format_id,
                    country = EXCLUDED.country,
                    "artistId" = EXCLUDED."artistId",
                    "labelId" = EXCLUDED."labelId",
                    "pressOrgaId" = EXCLUDED."pressOrgaId",
                    "coverImage" = EXCLUDED."coverImage",
                    legacy_price = EXCLUDED.legacy_price,
                    legacy_format_detail = EXCLUDED.legacy_format_detail,
                    "updatedAt" = NOW()""",
                release_values,
                template="(%s, %s, %s, %s, %s, %s::\"ReleaseFormat\", %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())",
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
        print(f"  Migrated {processed}/{len(rows)} ({errors} errors)...", end="\r")

    print(f"\n  Done: {processed} items, {image_count} images, {errors} errors")
    return {"processed": processed, "images": image_count, "errors": errors}


def main():
    start_time = time.time()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print("=" * 60)
    print("Literature Migration: Legacy MySQL -> Supabase")
    print(f"Started: {now}")
    print("=" * 60)

    print("\nConnecting to Legacy MySQL...")
    mysql_conn = get_mysql_connection()
    print("  Connected!")

    print("Connecting to Supabase PostgreSQL...")
    pg_conn = get_pg_connection()
    print("  Connected!")

    try:
        # 1. Migrate PressOrga entities
        pressorga_count = migrate_pressorga(mysql_conn, pg_conn)

        # 2. Migrate Band Literature (bilder_1.typ=13)
        band_lit = migrate_literature(
            mysql_conn, pg_conn,
            table="3wadmin_tapes_band_lit",
            category="band_literature",
            id_prefix="legacy-bandlit",
            ref_field="artistId",
            ref_prefix="legacy-artist",
            bilder_typ=13,
        )

        # 3. Migrate Labels Literature (bilder_1.typ=14)
        labels_lit = migrate_literature(
            mysql_conn, pg_conn,
            table="3wadmin_tapes_labels_lit",
            category="label_literature",
            id_prefix="legacy-labellit",
            ref_field="labelId",
            ref_prefix="legacy-label",
            bilder_typ=14,  # typ=14 = labels_lit images
        )

        # 4. Migrate Press/Org Literature (bilder_1.typ=12)
        press_lit = migrate_literature(
            mysql_conn, pg_conn,
            table="3wadmin_tapes_pressorga_lit",
            category="press_literature",
            id_prefix="legacy-presslit",
            ref_field="pressOrgaId",
            ref_prefix="legacy-pressorga",
            bilder_typ=12,  # typ=12 = pressorga_lit images
        )

        # Log results
        elapsed = time.time() - start_time
        changes = {
            "pressorga_entities": pressorga_count,
            "band_literature": band_lit,
            "labels_literature": labels_lit,
            "press_literature": press_lit,
            "duration_seconds": round(elapsed, 1),
        }
        log_sync(pg_conn, None, "literature_migration", changes)

        # Print summary
        total_items = band_lit["processed"] + labels_lit["processed"] + press_lit["processed"]
        total_images = band_lit["images"] + labels_lit["images"] + press_lit["images"]
        total_errors = band_lit["errors"] + labels_lit["errors"] + press_lit["errors"]

        print(f"\n{'=' * 60}")
        print("MIGRATION SUMMARY")
        print(f"{'=' * 60}")
        print(f"  PressOrga entities:    {pressorga_count}")
        print(f"  Band Literature:       {band_lit['processed']} items, {band_lit['images']} images")
        print(f"  Labels Literature:     {labels_lit['processed']} items, {labels_lit['images']} images")
        print(f"  Press/Org Literature:  {press_lit['processed']} items, {press_lit['images']} images")
        print(f"  TOTAL:                 {total_items} items, {total_images} images, {total_errors} errors")
        print(f"  Duration:              {elapsed:.1f}s ({elapsed / 60:.1f} min)")
        print(f"{'=' * 60}")

    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        try:
            log_sync(pg_conn, None, "literature_migration", None, status="error", error_message=str(e))
        except Exception:
            pass
        raise
    finally:
        mysql_conn.close()
        pg_conn.close()


if __name__ == "__main__":
    main()
