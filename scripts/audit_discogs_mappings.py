#!/usr/bin/env python3
"""
Audit the Release.discogs_id mappings for likely mismatches.

For each Release with a discogs_id that's also in discogs_api_cache, compare
the VOD Artist.name + Release.title against the Discogs api_data.artists /
api_data.title. Score via difflib.SequenceMatcher and flag any row with
combined_score < --threshold (default 0.65).

Output: CSV to stdout or --out file, sorted by score ascending so the worst
matches are on top.

Usage:
    python3 audit_discogs_mappings.py > audit.csv
    python3 audit_discogs_mappings.py --threshold 0.5 --out audit_low.csv
    python3 audit_discogs_mappings.py --only-flagged  # skip OK rows
    python3 audit_discogs_mappings.py --limit 500     # test on small batch

CSV columns:
  release_id, vod_artist, vod_title, discogs_id, cached_artist, cached_title,
  artist_score, title_score, combined_score, flagged, discogs_url

Requires: psycopg2-binary, python-dotenv (stdlib difflib for scoring)
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from difflib import SequenceMatcher
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).resolve().parent
load_dotenv(SCRIPT_DIR / ".env")

PG_URL_DEFAULT = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")


def normalize(s: str | None) -> str:
    if not s:
        return ""
    return " ".join(s.lower().split())


def score(a: str | None, b: str | None) -> float:
    na, nb = normalize(a), normalize(b)
    if not na or not nb:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def extract_cached_artist(api_data: dict) -> str:
    """Discogs returns artists as list of {name, anv, join, ...} objects."""
    artists = api_data.get("artists") or []
    if not isinstance(artists, list):
        return ""
    names: list[str] = []
    for a in artists:
        if isinstance(a, dict):
            name = a.get("anv") or a.get("name") or ""
            if name:
                names.append(str(name).strip())
    return " ".join(names)


def fetch_rows(conn, limit: int | None) -> list[dict]:
    sql = """
        SELECT r.id AS release_id,
               r.discogs_id,
               r.title AS vod_title,
               a.name AS vod_artist,
               c.api_data->>'title' AS cached_title,
               c.api_data AS api_data
        FROM "Release" r
        LEFT JOIN "Artist" a ON a.id = r."artistId"
        JOIN discogs_api_cache c ON c.discogs_id = r.discogs_id
        WHERE r.discogs_id IS NOT NULL
          AND (c.api_data ? 'title' OR c.api_data ? 'artists')
    """
    if limit:
        sql += f" LIMIT {int(limit)}"
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql)
        return cur.fetchall()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--threshold", type=float, default=0.65,
                        help="Combined score below this → flagged (default 0.65)")
    parser.add_argument("--only-flagged", action="store_true",
                        help="Output only flagged rows")
    parser.add_argument("--out", help="Output CSV file (default: stdout)")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--pg-url", default=PG_URL_DEFAULT)
    args = parser.parse_args()

    if not args.pg_url:
        print("ERROR: no Postgres URL (set SUPABASE_DB_URL in .env or pass --pg-url)",
              file=sys.stderr)
        sys.exit(1)

    conn = psycopg2.connect(args.pg_url)
    try:
        rows = fetch_rows(conn, args.limit)
    finally:
        conn.close()

    print(f"Scoring {len(rows)} releases…", file=sys.stderr)

    results = []
    for row in rows:
        api_data = row["api_data"] or {}
        cached_artist = extract_cached_artist(api_data)
        cached_title = row["cached_title"] or ""

        artist_score = score(row["vod_artist"], cached_artist)
        title_score = score(row["vod_title"], cached_title)
        combined = (artist_score * 0.4) + (title_score * 0.6)  # title weighs more

        flagged = combined < args.threshold
        if args.only_flagged and not flagged:
            continue

        results.append({
            "release_id": row["release_id"],
            "vod_artist": row["vod_artist"] or "",
            "vod_title": row["vod_title"] or "",
            "discogs_id": row["discogs_id"],
            "cached_artist": cached_artist,
            "cached_title": cached_title,
            "artist_score": round(artist_score, 3),
            "title_score": round(title_score, 3),
            "combined_score": round(combined, 3),
            "flagged": "YES" if flagged else "",
            "discogs_url": f"https://www.discogs.com/release/{row['discogs_id']}",
        })

    results.sort(key=lambda r: r["combined_score"])

    out_stream = open(args.out, "w", encoding="utf-8", newline="") if args.out else sys.stdout
    try:
        if out_stream is sys.stdout:
            out_stream.reconfigure(encoding="utf-8")
        writer = csv.DictWriter(out_stream, fieldnames=list(results[0].keys()) if results else [
            "release_id", "vod_artist", "vod_title", "discogs_id",
            "cached_artist", "cached_title", "artist_score", "title_score",
            "combined_score", "flagged", "discogs_url",
        ])
        writer.writeheader()
        for r in results:
            writer.writerow(r)
    finally:
        if out_stream is not sys.stdout:
            out_stream.close()

    flagged_count = sum(1 for r in results if r["flagged"])
    print(f"Total scored: {len(results)}  flagged (< {args.threshold}): {flagged_count}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
