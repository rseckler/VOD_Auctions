#!/usr/bin/env python3
"""
Backfill Release.genre and Release.styles from the discogs_api_cache.

Non-destructive (Q7a): only fills rows where the Release column is NULL or
an empty string AND discogs_api_cache has a non-empty value. Never
overwrites existing user-edited values.

Usage:
    python3 backfill_genre_styles.py                   # dry-run, shows counts
    python3 backfill_genre_styles.py --commit          # actually update
    python3 backfill_genre_styles.py --limit 100       # test on small batch
    python3 backfill_genre_styles.py --pg-url "$URL"   # override DB target

Requires: psycopg2-binary, python-dotenv
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).resolve().parent
load_dotenv(SCRIPT_DIR / ".env")

PG_URL_DEFAULT = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")


def fetch_candidates(conn, limit: int | None) -> list[dict]:
    """Find releases where genres/styles (TEXT[]) are empty but cache has values."""
    sql = """
        SELECT r.id AS release_id,
               r.discogs_id,
               r.genres,
               r.styles,
               c.api_data->'genres' AS cache_genres,
               c.api_data->'styles' AS cache_styles
        FROM "Release" r
        JOIN discogs_api_cache c ON c.discogs_id = r.discogs_id
        WHERE r.discogs_id IS NOT NULL
          AND (COALESCE(array_length(r.genres, 1), 0) = 0
               OR COALESCE(array_length(r.styles, 1), 0) = 0)
          AND (jsonb_array_length(COALESCE(c.api_data->'genres', '[]'::jsonb)) > 0
               OR jsonb_array_length(COALESCE(c.api_data->'styles', '[]'::jsonb)) > 0)
    """
    if limit:
        sql += f" LIMIT {int(limit)}"
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql)
        return cur.fetchall()


def build_update(row: dict) -> dict:
    """Return {'genres': [...], 'styles': [...]} with only fields that should be updated."""
    updates: dict = {}

    def jsonb_array_to_list(val) -> list[str] | None:
        if not val:
            return None
        if isinstance(val, list):
            items = [str(x).strip() for x in val if x]
            return items if items else None
        return None

    if not row["genres"] or len(row["genres"]) == 0:
        g = jsonb_array_to_list(row["cache_genres"])
        if g:
            updates["genres"] = g

    if not row["styles"] or len(row["styles"]) == 0:
        s = jsonb_array_to_list(row["cache_styles"])
        if s:
            updates["styles"] = s

    return updates


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Actually write updates (default: dry-run)")
    parser.add_argument("--limit", type=int, default=None, help="Process only first N rows")
    parser.add_argument("--pg-url", default=PG_URL_DEFAULT, help="Postgres connection URL")
    args = parser.parse_args()

    if not args.pg_url:
        print("ERROR: no Postgres URL (set SUPABASE_DB_URL in .env or pass --pg-url)", file=sys.stderr)
        sys.exit(1)

    conn = psycopg2.connect(args.pg_url)
    conn.autocommit = False

    try:
        candidates = fetch_candidates(conn, args.limit)
        print(f"Candidates with empty genre or styles + cache data: {len(candidates)}")

        genre_updates = 0
        styles_updates = 0
        both_updates = 0
        no_change = 0

        for row in candidates:
            updates = build_update(row)
            if not updates:
                no_change += 1
                continue
            if "genres" in updates and "styles" in updates:
                both_updates += 1
            elif "genres" in updates:
                genre_updates += 1
            elif "styles" in updates:
                styles_updates += 1

            if args.commit:
                sets = []
                params = []
                if "genres" in updates:
                    sets.append("genres = %s")
                    params.append(updates["genres"])
                if "styles" in updates:
                    sets.append("styles = %s")
                    params.append(updates["styles"])
                sets.append('"updatedAt" = NOW()')
                params.append(row["release_id"])
                with conn.cursor() as cur:
                    cur.execute(
                        f'UPDATE "Release" SET {", ".join(sets)} WHERE id = %s',
                        params,
                    )

        print(f"  Genres-only updates: {genre_updates}")
        print(f"  Styles-only updates: {styles_updates}")
        print(f"  Both-field updates:  {both_updates}")
        print(f"  Skipped (no cache):  {no_change}")
        print(f"  Total would update:  {genre_updates + styles_updates + both_updates}")

        if args.commit:
            conn.commit()
            print("✓ Committed")
        else:
            conn.rollback()
            print("(dry-run — no changes written. Re-run with --commit to apply.)")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
