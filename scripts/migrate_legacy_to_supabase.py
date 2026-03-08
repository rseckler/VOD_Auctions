#!/usr/bin/env python3
"""
Legacy MySQL → Supabase Migration Script
Migrates ~30,000 releases from vodtapes legacy DB to Supabase PostgreSQL.

Usage:
    cd VOD_Auctions/scripts
    pip install -r requirements.txt
    python3 migrate_legacy_to_supabase.py

Requires .env in parent directory with:
    LEGACY_DB_HOST, LEGACY_DB_PORT, LEGACY_DB_USER, LEGACY_DB_PASSWORD, LEGACY_DB_NAME
    SUPABASE_DB_URL (postgresql://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres)
"""

import os
import sys
import re
import html
import time
import unicodedata
from pathlib import Path

import mysql.connector
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# Load .env from parent directory
load_dotenv(Path(__file__).parent.parent / ".env")

# --- Config ---
BATCH_SIZE = 500
IMAGE_BASE_URL = "https://tape-mag.com/bilder/gross/"

# Format mapping (from tape-mag-migration/mapper.ts)
FORMAT_MAP = {
    "tape": "CASSETTE",
    "vinyl lp": "LP",
    'vinyl 7"': "LP",
    'vinyl 12"': "LP",
    'vinyl 10"': "LP",
    "video": "VHS",
    "reel": "OTHER",
    "cd": "CD",
    "dvd": "VHS",
    "lp": "LP",
    "kassette": "CASSETTE",
    "mc": "CASSETTE",
    "buch": "BOOK",
    "book": "BOOK",
    "poster": "POSTER",
    "zine": "ZINE",
    "magazin": "ZINE",
    "box": "BOXSET",
    "boxset": "BOXSET",
}

# Valid ReleaseFormat enum values
VALID_FORMATS = {"LP", "CD", "CASSETTE", "BOOK", "POSTER", "ZINE", "DIGITAL", "VHS", "BOXSET", "OTHER"}


def slugify(text: str) -> str:
    """Generate URL-safe slug from text."""
    text = html.unescape(text)
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text.strip("-")[:200]


def decode_entities(text) -> str:
    """Decode HTML entities in text."""
    if text is None:
        return ""
    return html.unescape(str(text)).strip()


def map_format(format_name: str | None) -> str:
    """Map legacy format name to ReleaseFormat enum value."""
    if not format_name:
        return "OTHER"
    decoded = decode_entities(format_name)
    lower = decoded.lower().strip()
    # Strip multi-disc suffix (e.g. "Tape-2" → "tape")
    base = re.sub(r"-\d+$", "", lower).strip()
    clean = re.sub(r"\s+c\d+$", "", base).strip()

    for key, value in FORMAT_MAP.items():
        if clean == key or base == key:
            return value
    for key, value in FORMAT_MAP.items():
        if key in clean:
            return value

    # If the decoded name itself matches a valid format
    upper = decoded.upper()
    if upper in VALID_FORMATS:
        return upper
    return "OTHER"


def parse_price(preis) -> float | None:
    """Parse legacy price field."""
    if preis is None:
        return None
    try:
        val = float(str(preis).replace(",", "."))
        return val if val > 0 else None
    except (ValueError, TypeError):
        return None


def get_mysql_connection():
    """Create MySQL connection to legacy DB."""
    return mysql.connector.connect(
        host=os.getenv("LEGACY_DB_HOST"),
        port=int(os.getenv("LEGACY_DB_PORT", "3306")),
        user=os.getenv("LEGACY_DB_USER"),
        password=os.getenv("LEGACY_DB_PASSWORD"),
        database=os.getenv("LEGACY_DB_NAME"),
        charset="utf8mb4",
        use_unicode=True,
    )


def get_pg_connection():
    """Create PostgreSQL connection to Supabase."""
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("ERROR: SUPABASE_DB_URL not set in .env")
        print("Get it from: Supabase Dashboard → Settings → Database → Connection String (URI)")
        sys.exit(1)
    return psycopg2.connect(db_url)


def migrate_artists(mysql_conn, pg_conn):
    """Migrate artists from legacy DB."""
    print("\n=== Migrating Artists ===")
    cursor = mysql_conn.cursor(dictionary=True)
    cursor.execute("SELECT id, name FROM 3wadmin_tapes_band ORDER BY id")
    rows = cursor.fetchall()
    print(f"  Found {len(rows)} artists in legacy DB")

    pg_cur = pg_conn.cursor()
    inserted = 0
    skipped = 0

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        values = []
        for row in batch:
            name = decode_entities(row["name"]) or f"Unknown Artist #{row['id']}"
            slug = slugify(name)
            if not slug:
                slug = f"artist-{row['id']}"
            # Use legacy ID as part of the text ID for traceability
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
        print(f"  Inserted {inserted}/{len(rows)} artists...", end="\r")

    pg_conn.commit()
    print(f"  Inserted {inserted} artists (skipped {skipped})")
    cursor.close()


def migrate_labels(mysql_conn, pg_conn):
    """Migrate labels from legacy DB."""
    print("\n=== Migrating Labels ===")
    cursor = mysql_conn.cursor(dictionary=True)
    cursor.execute("SELECT id, label as name FROM 3wadmin_tapes_labels ORDER BY id")
    rows = cursor.fetchall()
    print(f"  Found {len(rows)} labels in legacy DB")

    pg_cur = pg_conn.cursor()
    inserted = 0

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
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
        print(f"  Inserted {inserted}/{len(rows)} labels...", end="\r")

    pg_conn.commit()
    print(f"  Inserted {inserted} labels")
    cursor.close()


def migrate_releases(mysql_conn, pg_conn):
    """Migrate releases with joined data from legacy DB."""
    print("\n=== Migrating Releases ===")
    cursor = mysql_conn.cursor(dictionary=True)

    # Count total
    cursor.execute("SELECT COUNT(*) as cnt FROM 3wadmin_tapes_releases")
    total = cursor.fetchone()["cnt"]
    print(f"  Found {total} releases in legacy DB")

    # Fetch in batches
    pg_cur = pg_conn.cursor()
    offset = 0
    inserted = 0
    errors = 0

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

        values = []
        image_values = []

        for row in rows:
            try:
                title = decode_entities(row["title"]) or f"Release #{row['id']}"
                description = str(row["moreinfo"]) if row["moreinfo"] else None
                catalog_number = decode_entities(row["cataloguenumber"]) if row["cataloguenumber"] else None
                # Sanitize catalog number (may contain newlines)
                if catalog_number:
                    catalog_number = re.sub(r"[\r\n]+", " ", catalog_number).strip()

                year = row["year"] if row["year"] and row["year"] > 0 else None
                format_enum = map_format(row.get("format_name"))
                country = decode_entities(row["country_name"]) if row["country_name"] else None
                price = parse_price(row["preis"])

                # Build slug
                artist_name = decode_entities(row["band_name"]) if row["band_name"] else "unknown"
                slug = slugify(f"{artist_name} {title} {row['id']}")
                if not slug:
                    slug = f"release-{row['id']}"

                # Artist/Label FK
                artist_id = f"legacy-artist-{row['artist']}" if row["artist"] else None
                label_id = f"legacy-label-{row['label']}" if row["label"] else None
                release_id = f"legacy-release-{row['id']}"

                # Cover image URL
                cover_image = None
                if row.get("image_filename"):
                    filename = str(row["image_filename"])
                    cover_image = IMAGE_BASE_URL + filename

                values.append((
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

        # Insert releases
        if values:
            psycopg2.extras.execute_values(
                pg_cur,
                """INSERT INTO "Release" (
                    id, slug, title, description, year, format,
                    "catalogNumber", country, "artistId", "labelId", "coverImage",
                    "createdAt", "updatedAt"
                ) VALUES %s ON CONFLICT (id) DO NOTHING""",
                values,
                template="(%s, %s, %s, %s, %s, %s::\"ReleaseFormat\", %s, %s, %s, %s, %s, NOW(), NOW())",
            )

        # Insert images
        if image_values:
            psycopg2.extras.execute_values(
                pg_cur,
                """INSERT INTO "Image" (id, url, alt, "releaseId", "createdAt")
                   VALUES %s ON CONFLICT (id) DO NOTHING""",
                image_values,
                template="(%s, %s, %s, %s, NOW())",
            )

        pg_conn.commit()
        inserted += len(rows)
        offset += BATCH_SIZE
        print(f"  Migrated {inserted}/{total} releases ({errors} errors)...", end="\r")

    print(f"\n  Done: {inserted} releases migrated, {errors} errors")
    cursor.close()


def migrate_genres(mysql_conn, pg_conn):
    """Create genre entries from legacy format names (as categories)."""
    print("\n=== Creating Genres from Formats ===")
    cursor = mysql_conn.cursor(dictionary=True)
    cursor.execute("SELECT DISTINCT name FROM 3wadmin_tapes_formate WHERE name IS NOT NULL AND name != ''")
    rows = cursor.fetchall()

    pg_cur = pg_conn.cursor()
    values = []
    for row in rows:
        name = decode_entities(row["name"])
        if not name:
            continue
        slug = slugify(name)
        if not slug:
            continue
        gid = f"genre-{slug}"
        values.append((gid, slug, name))

    if values:
        psycopg2.extras.execute_values(
            pg_cur,
            """INSERT INTO "Genre" (id, slug, name, "createdAt")
               VALUES %s ON CONFLICT (id) DO NOTHING""",
            values,
            template="(%s, %s, %s, NOW())",
        )
    pg_conn.commit()
    print(f"  Created {len(values)} genres")
    cursor.close()


def verify_migration(pg_conn):
    """Print migration statistics."""
    print("\n=== Verification ===")
    pg_cur = pg_conn.cursor()

    tables = [
        ("Artist", '"Artist"'),
        ("Label", '"Label"'),
        ("Release", '"Release"'),
        ("Image", '"Image"'),
        ("Genre", '"Genre"'),
    ]

    for name, table in tables:
        pg_cur.execute(f"SELECT COUNT(*) FROM {table}")
        count = pg_cur.fetchone()[0]
        print(f"  {name}: {count} records")

    # Sample release with artist
    pg_cur.execute("""
        SELECT r.title, a.name as artist, l.name as label, r.format, r.year
        FROM "Release" r
        LEFT JOIN "Artist" a ON r."artistId" = a.id
        LEFT JOIN "Label" l ON r."labelId" = l.id
        LIMIT 5
    """)
    print("\n  Sample Releases:")
    for row in pg_cur.fetchall():
        print(f"    {row[1]} - {row[0]} ({row[3]}, {row[4]}) [{row[2]}]")


def main():
    print("=" * 60)
    print("Legacy MySQL → Supabase Migration")
    print("=" * 60)

    # Validate env vars
    required = ["LEGACY_DB_HOST", "LEGACY_DB_USER", "LEGACY_DB_PASSWORD", "LEGACY_DB_NAME", "SUPABASE_DB_URL"]
    missing = [v for v in required if not os.getenv(v)]
    if missing:
        print(f"ERROR: Missing env vars: {', '.join(missing)}")
        print("Add them to VOD_Auctions/.env")
        sys.exit(1)

    start = time.time()

    print("\nConnecting to Legacy MySQL...")
    mysql_conn = get_mysql_connection()
    print("  Connected!")

    print("Connecting to Supabase PostgreSQL...")
    pg_conn = get_pg_connection()
    print("  Connected!")

    try:
        migrate_artists(mysql_conn, pg_conn)
        migrate_labels(mysql_conn, pg_conn)
        migrate_genres(mysql_conn, pg_conn)
        migrate_releases(mysql_conn, pg_conn)
        verify_migration(pg_conn)
    finally:
        mysql_conn.close()
        pg_conn.close()

    elapsed = time.time() - start
    print(f"\n{'=' * 60}")
    print(f"Migration completed in {elapsed:.1f}s ({elapsed / 60:.1f} min)")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
