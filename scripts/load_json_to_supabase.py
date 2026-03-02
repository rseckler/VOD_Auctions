#!/usr/bin/env python3
"""
Load extracted JSON data into Supabase PostgreSQL.
Uses pre-extracted JSON files from data/ directory (created by extract_legacy_data.py).

Usage:
    cd VOD_Auctions/scripts
    pip install -r requirements.txt
    python3 load_json_to_supabase.py

Requires .env in parent directory with:
    SUPABASE_DB_URL (postgresql://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres)

Get SUPABASE_DB_URL from: Supabase Dashboard → Settings → Database → Connection String (URI)
Project: vod-auctions (bofblwqieuvmqybzxapx)
"""

import os
import sys
import json
import time
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DATA_DIR = Path(__file__).parent / "data"
BATCH_SIZE = 500


def get_pg():
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("ERROR: SUPABASE_DB_URL not set in .env")
        print()
        print("How to get it:")
        print("  1. Go to https://supabase.com/dashboard/project/bofblwqieuvmqybzxapx/settings/database")
        print("  2. Copy 'Connection string' (URI format)")
        print("  3. Add to VOD_Auctions/.env as SUPABASE_DB_URL=postgresql://...")
        sys.exit(1)
    return psycopg2.connect(db_url)


def load_artists(conn):
    print("\n=== Loading Artists ===")
    with open(DATA_DIR / "artists.json") as f:
        artists = json.load(f)
    print(f"  {len(artists)} artists from JSON")

    cur = conn.cursor()
    for i in range(0, len(artists), BATCH_SIZE):
        batch = artists[i:i + BATCH_SIZE]
        values = [(a["id"], a["slug"], a["name"]) for a in batch]
        psycopg2.extras.execute_values(
            cur,
            """INSERT INTO "Artist" (id, slug, name, "createdAt", "updatedAt")
               VALUES %s ON CONFLICT (id) DO NOTHING""",
            values,
            template="(%s, %s, %s, NOW(), NOW())",
        )
        print(f"  {min(i + BATCH_SIZE, len(artists))}/{len(artists)}...", end="\r")
    conn.commit()
    print(f"  Loaded {len(artists)} artists")


def load_labels(conn):
    print("\n=== Loading Labels ===")
    with open(DATA_DIR / "labels.json") as f:
        labels = json.load(f)
    print(f"  {len(labels)} labels from JSON")

    cur = conn.cursor()
    for i in range(0, len(labels), BATCH_SIZE):
        batch = labels[i:i + BATCH_SIZE]
        values = [(l["id"], l["slug"], l["name"]) for l in batch]
        psycopg2.extras.execute_values(
            cur,
            """INSERT INTO "Label" (id, slug, name, "createdAt", "updatedAt")
               VALUES %s ON CONFLICT (id) DO NOTHING""",
            values,
            template="(%s, %s, %s, NOW(), NOW())",
        )
    conn.commit()
    print(f"  Loaded {len(labels)} labels")


def load_releases(conn):
    print("\n=== Loading Releases ===")
    with open(DATA_DIR / "releases.json") as f:
        releases = json.load(f)
    print(f"  {len(releases)} releases from JSON")

    cur = conn.cursor()
    loaded = 0
    errors = 0

    for i in range(0, len(releases), BATCH_SIZE):
        batch = releases[i:i + BATCH_SIZE]
        values = []
        for r in batch:
            try:
                values.append((
                    r["id"], r["slug"], r["title"], r.get("description"),
                    r.get("year"), r["format"], r.get("catalogNumber"),
                    r.get("country"), r.get("artistId"), r.get("labelId"),
                    r.get("coverImage"),
                ))
            except Exception as e:
                errors += 1
                print(f"\n  ERROR: {e} on {r.get('id')}")

        if values:
            psycopg2.extras.execute_values(
                cur,
                """INSERT INTO "Release" (
                    id, slug, title, description, year, format,
                    "catalogNumber", country, "artistId", "labelId", "coverImage",
                    "createdAt", "updatedAt"
                ) VALUES %s ON CONFLICT (id) DO NOTHING""",
                values,
                template="(%s, %s, %s, %s, %s, %s::\"ReleaseFormat\", %s, %s, %s, %s, %s, NOW(), NOW())",
            )
        conn.commit()
        loaded += len(batch)
        print(f"  {loaded}/{len(releases)} ({errors} errors)...", end="\r")

    print(f"\n  Loaded {loaded} releases ({errors} errors)")


def load_images(conn):
    print("\n=== Loading Images ===")
    with open(DATA_DIR / "images.json") as f:
        images = json.load(f)
    print(f"  {len(images)} images from JSON")

    cur = conn.cursor()
    for i in range(0, len(images), BATCH_SIZE):
        batch = images[i:i + BATCH_SIZE]
        values = [(img["id"], img["url"], img["alt"], img["releaseId"]) for img in batch]
        psycopg2.extras.execute_values(
            cur,
            """INSERT INTO "Image" (id, url, alt, "releaseId", "createdAt")
               VALUES %s ON CONFLICT (id) DO NOTHING""",
            values,
            template="(%s, %s, %s, %s, NOW())",
        )
        print(f"  {min(i + BATCH_SIZE, len(images))}/{len(images)}...", end="\r")
    conn.commit()
    print(f"  Loaded {len(images)} images")


def verify(conn):
    print("\n=== Verification ===")
    cur = conn.cursor()
    for name, table in [("Artist", '"Artist"'), ("Label", '"Label"'), ("Release", '"Release"'), ("Image", '"Image"')]:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        print(f"  {name}: {cur.fetchone()[0]} records")

    cur.execute("""
        SELECT r.title, a.name, l.name, r.format, r.year
        FROM "Release" r
        LEFT JOIN "Artist" a ON r."artistId" = a.id
        LEFT JOIN "Label" l ON r."labelId" = l.id
        ORDER BY r.id LIMIT 5
    """)
    print("\n  Sample Releases:")
    for row in cur.fetchall():
        print(f"    {row[1]} - {row[0]} ({row[3]}, {row[4]}) [{row[2]}]")


def main():
    # Check JSON files exist
    for name in ["artists.json", "labels.json", "releases.json", "images.json"]:
        if not (DATA_DIR / name).exists():
            print(f"ERROR: {DATA_DIR / name} not found")
            print("Run extract_legacy_data.py first")
            sys.exit(1)

    start = time.time()
    print("=" * 60)
    print("JSON → Supabase Migration")
    print("=" * 60)

    conn = get_pg()
    print("Connected to Supabase!")

    try:
        # Disable FK checks for migration (some releases reference deleted artists/labels)
        cur = conn.cursor()
        cur.execute("SET session_replication_role = 'replica';")
        conn.commit()
        print("FK checks disabled for migration")

        load_artists(conn)
        load_labels(conn)
        load_releases(conn)
        load_images(conn)

        # Re-enable FK checks
        cur.execute("SET session_replication_role = 'origin';")
        conn.commit()
        print("\nFK checks re-enabled")

        verify(conn)
    finally:
        conn.close()

    elapsed = time.time() - start
    print(f"\n{'=' * 60}")
    print(f"Done in {elapsed:.1f}s ({elapsed / 60:.1f} min)")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
