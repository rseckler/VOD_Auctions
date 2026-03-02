#!/usr/bin/env python3
"""
Generate SQL INSERT statements from extracted JSON data.
Outputs .sql files that can be run via Supabase execute_sql.
"""

import json
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
SQL_DIR = Path(__file__).parent / "data" / "sql"
BATCH_SIZE = 200  # rows per INSERT statement


def escape_sql(val):
    """Escape a value for SQL string literal."""
    if val is None:
        return "NULL"
    s = str(val)
    s = s.replace("'", "''")
    s = s.replace("\\", "\\\\")
    return f"'{s}'"


def generate_artist_sql():
    print("Generating artist SQL...")
    with open(DATA_DIR / "artists.json") as f:
        artists = json.load(f)

    batches = []
    for i in range(0, len(artists), BATCH_SIZE):
        batch = artists[i:i + BATCH_SIZE]
        values = []
        for a in batch:
            values.append(
                f"({escape_sql(a['id'])}, {escape_sql(a['slug'])}, {escape_sql(a['name'])}, NOW(), NOW())"
            )
        sql = f"""INSERT INTO "Artist" (id, slug, name, "createdAt", "updatedAt") VALUES\n{',\n'.join(values)}\nON CONFLICT (id) DO NOTHING;"""
        batches.append(sql)

    print(f"  {len(batches)} batches for {len(artists)} artists")
    return batches


def generate_label_sql():
    print("Generating label SQL...")
    with open(DATA_DIR / "labels.json") as f:
        labels = json.load(f)

    batches = []
    for i in range(0, len(labels), BATCH_SIZE):
        batch = labels[i:i + BATCH_SIZE]
        values = []
        for l in batch:
            values.append(
                f"({escape_sql(l['id'])}, {escape_sql(l['slug'])}, {escape_sql(l['name'])}, NOW(), NOW())"
            )
        sql = f"""INSERT INTO "Label" (id, slug, name, "createdAt", "updatedAt") VALUES\n{',\n'.join(values)}\nON CONFLICT (id) DO NOTHING;"""
        batches.append(sql)

    print(f"  {len(batches)} batches for {len(labels)} labels")
    return batches


def generate_release_sql():
    print("Generating release SQL...")
    with open(DATA_DIR / "releases.json") as f:
        releases = json.load(f)

    batches = []
    for i in range(0, len(releases), BATCH_SIZE):
        batch = releases[i:i + BATCH_SIZE]
        values = []
        for r in batch:
            year = str(r["year"]) if r["year"] else "NULL"
            values.append(
                f"({escape_sql(r['id'])}, {escape_sql(r['slug'])}, {escape_sql(r['title'])}, "
                f"{escape_sql(r['description'])}, {year}, "
                f"{escape_sql(r['format'])}::\"ReleaseFormat\", "
                f"{escape_sql(r['catalogNumber'])}, {escape_sql(r['country'])}, "
                f"{escape_sql(r['artistId'])}, {escape_sql(r['labelId'])}, "
                f"{escape_sql(r['coverImage'])}, NOW(), NOW())"
            )
        sql = (
            f'INSERT INTO "Release" (id, slug, title, description, year, format, '
            f'"catalogNumber", country, "artistId", "labelId", "coverImage", '
            f'"createdAt", "updatedAt") VALUES\n{",\n".join(values)}\n'
            f"ON CONFLICT (id) DO NOTHING;"
        )
        batches.append(sql)

    print(f"  {len(batches)} batches for {len(releases)} releases")
    return batches


def generate_image_sql():
    print("Generating image SQL...")
    with open(DATA_DIR / "images.json") as f:
        images = json.load(f)

    batches = []
    for i in range(0, len(images), BATCH_SIZE):
        batch = images[i:i + BATCH_SIZE]
        values = []
        for img in batch:
            values.append(
                f"({escape_sql(img['id'])}, {escape_sql(img['url'])}, "
                f"{escape_sql(img['alt'])}, {escape_sql(img['releaseId'])}, NOW())"
            )
        sql = f"""INSERT INTO "Image" (id, url, alt, "releaseId", "createdAt") VALUES\n{',\n'.join(values)}\nON CONFLICT (id) DO NOTHING;"""
        batches.append(sql)

    print(f"  {len(batches)} batches for {len(images)} images")
    return batches


def main():
    SQL_DIR.mkdir(parents=True, exist_ok=True)

    all_batches = {
        "01_artists": generate_artist_sql(),
        "02_labels": generate_label_sql(),
        "03_releases": generate_release_sql(),
        "04_images": generate_image_sql(),
    }

    for name, batches in all_batches.items():
        for idx, sql in enumerate(batches):
            path = SQL_DIR / f"{name}_{idx:04d}.sql"
            with open(path, "w") as f:
                f.write(sql)

    total = sum(len(b) for b in all_batches.values())
    print(f"\nGenerated {total} SQL files in {SQL_DIR}/")


if __name__ == "__main__":
    main()
