#!/usr/bin/env python3
"""
Extract data from Legacy MySQL and output as JSON for MCP-based migration.
Outputs one JSON file per entity type in data/ directory.
"""

import os
import sys
import re
import html
import json
import unicodedata
from pathlib import Path

import mysql.connector
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

IMAGE_BASE_URL = "https://tape-mag.com/bilder/gross/"
OUTPUT_DIR = Path(__file__).parent / "data"

FORMAT_MAP = {
    "tape": "CASSETTE", "vinyl lp": "LP", 'vinyl 7"': "LP", 'vinyl 12"': "LP",
    'vinyl 10"': "LP", "video": "DVD", "reel": "OTHER", "cd": "CD", "dvd": "DVD",
    "lp": "LP", "kassette": "CASSETTE", "mc": "CASSETTE", "buch": "BOOK",
    "book": "BOOK", "poster": "POSTER", "zine": "ZINE", "magazin": "ZINE",
    "box": "BOXSET", "boxset": "BOXSET",
}
VALID_FORMATS = {"LP", "CD", "CASSETTE", "BOOK", "POSTER", "ZINE", "DIGITAL", "DVD", "BOXSET", "OTHER"}


def slugify(text: str) -> str:
    text = html.unescape(text)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text.lower().strip())
    text = re.sub(r"[-\s]+", "-", text)
    return text.strip("-")[:200]


def decode_entities(text) -> str:
    if text is None:
        return ""
    return html.unescape(str(text)).strip()


def map_format(format_name):
    if not format_name:
        return "OTHER"
    decoded = decode_entities(format_name)
    lower = decoded.lower().strip()
    base = re.sub(r"-\d+$", "", lower).strip()
    clean = re.sub(r"\s+c\d+$", "", base).strip()
    for key, value in FORMAT_MAP.items():
        if clean == key or base == key:
            return value
    for key, value in FORMAT_MAP.items():
        if key in clean:
            return value
    upper = decoded.upper()
    return upper if upper in VALID_FORMATS else "OTHER"


def get_mysql():
    return mysql.connector.connect(
        host=os.getenv("LEGACY_DB_HOST"),
        port=int(os.getenv("LEGACY_DB_PORT", "3306")),
        user=os.getenv("LEGACY_DB_USER"),
        password=os.getenv("LEGACY_DB_PASSWORD"),
        database=os.getenv("LEGACY_DB_NAME"),
        charset="utf8mb4", use_unicode=True,
    )


def extract_artists(conn):
    print("Extracting artists...")
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT id, name FROM 3wadmin_tapes_band ORDER BY id")
    rows = cur.fetchall()
    artists = []
    for r in rows:
        name = decode_entities(r["name"]) or f"Unknown Artist #{r['id']}"
        slug = slugify(name) or f"artist-{r['id']}"
        artists.append({
            "id": f"legacy-artist-{r['id']}",
            "slug": f"{slug}-{r['id']}",
            "name": name,
        })
    cur.close()
    print(f"  {len(artists)} artists")
    return artists


def extract_labels(conn):
    print("Extracting labels...")
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT id, label as name FROM 3wadmin_tapes_labels ORDER BY id")
    rows = cur.fetchall()
    labels = []
    for r in rows:
        name = decode_entities(r["name"]) or f"Unknown Label #{r['id']}"
        slug = slugify(name) or f"label-{r['id']}"
        labels.append({
            "id": f"legacy-label-{r['id']}",
            "slug": f"{slug}-{r['id']}",
            "name": name,
        })
    cur.close()
    print(f"  {len(labels)} labels")
    return labels


def extract_releases(conn):
    print("Extracting releases...")
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT r.id, r.title, r.moreinfo, r.cataloguenumber, r.year,
               r.preis, r.frei, r.spezifikation, r.artist, r.label,
               r.format, r.country,
               b.name as band_name, l.label as label_name,
               f.name as format_name, c.name as country_name,
               bi.bild as image_filename
        FROM 3wadmin_tapes_releases r
        LEFT JOIN 3wadmin_tapes_band b ON r.artist = b.id
        LEFT JOIN 3wadmin_tapes_labels l ON r.label = l.id
        LEFT JOIN 3wadmin_tapes_formate f ON r.format = f.id
        LEFT JOIN 3wadmin_shop_countries c ON r.country = c.id
        LEFT JOIN bilder_1 bi ON bi.inid = r.id AND bi.typ = 10
        GROUP BY r.id ORDER BY r.id
    """)
    rows = cur.fetchall()

    releases = []
    images = []
    errors = 0

    for r in rows:
        try:
            title = decode_entities(r["title"]) or f"Release #{r['id']}"
            artist_name = decode_entities(r["band_name"]) if r["band_name"] else "unknown"
            slug = slugify(f"{artist_name} {title} {r['id']}") or f"release-{r['id']}"
            description = str(r["moreinfo"]) if r["moreinfo"] else None
            cat = decode_entities(r["cataloguenumber"]) if r["cataloguenumber"] else None
            if cat:
                cat = re.sub(r"[\r\n]+", " ", cat).strip()
            year = r["year"] if r["year"] and r["year"] > 0 else None
            fmt = map_format(r.get("format_name"))
            country = decode_entities(r["country_name"]) if r["country_name"] else None
            artist_id = f"legacy-artist-{r['artist']}" if r["artist"] else None
            label_id = f"legacy-label-{r['label']}" if r["label"] else None
            release_id = f"legacy-release-{r['id']}"

            cover = None
            if r.get("image_filename"):
                cover = IMAGE_BASE_URL + str(r["image_filename"])
                images.append({
                    "id": f"legacy-image-{r['id']}",
                    "url": cover,
                    "alt": title,
                    "releaseId": release_id,
                })

            releases.append({
                "id": release_id,
                "slug": slug,
                "title": title,
                "description": description,
                "year": year,
                "format": fmt,
                "catalogNumber": cat,
                "country": country,
                "artistId": artist_id,
                "labelId": label_id,
                "coverImage": cover,
            })
        except Exception as e:
            errors += 1
            print(f"  ERROR release #{r['id']}: {e}")

    cur.close()
    print(f"  {len(releases)} releases, {len(images)} images, {errors} errors")
    return releases, images


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)
    conn = get_mysql()

    artists = extract_artists(conn)
    labels = extract_labels(conn)
    releases, images = extract_releases(conn)

    conn.close()

    # Save as JSON
    for name, data in [("artists", artists), ("labels", labels), ("releases", releases), ("images", images)]:
        path = OUTPUT_DIR / f"{name}.json"
        with open(path, "w") as f:
            json.dump(data, f, ensure_ascii=False)
        print(f"Saved {path} ({len(data)} records, {path.stat().st_size / 1024 / 1024:.1f} MB)")

    print(f"\nDone! JSON files in {OUTPUT_DIR}/")
    print("Next: Run migrate_legacy_to_supabase.py or use MCP execute_sql for batch insert.")


if __name__ == "__main__":
    main()
