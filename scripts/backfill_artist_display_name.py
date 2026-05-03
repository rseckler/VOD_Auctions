#!/usr/bin/env python3
"""
RSE-320 — Backfill Release.artist_display_name for multi-artist Discogs releases.

For each Discogs-imported release where the cached api_data has more than one
primary artist, fetch the live Discogs API to get `anv` + `join` + `artists_sort`,
update the cache, compose the display string, and write to Release.artist_display_name.

Single-artist releases are left with NULL — UI falls back to Artist.name.

Usage:
    python3 backfill_artist_display_name.py [--dry-run] [--limit N]

Rate-limit: ~55 req/min (Discogs allows 60/min authenticated). Full backfill of
~1,175 releases takes ~22 minutes.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

# Project-root .env (matches shared.py loader)
PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(PROJECT_ROOT / "scripts" / ".env")

import psycopg2  # noqa: E402
from shared import RateLimiter  # noqa: E402

DISCOGS_BASE = "https://api.discogs.com"


def strip_suffix(name: str) -> str:
    """Strip Discogs disambiguation suffix `(N)` (e.g. 'Conrad (3)' -> 'Conrad')."""
    if not name:
        return ""
    import re
    return re.sub(r"\s*\(\d+\)$", "", name).strip()


def compose_display_name(artists: list) -> str | None:
    """Mirror of backend/src/lib/artist-display.ts::composeArtistDisplayName.

    Returns NULL when single-artist without anv variant — UI falls back to Artist.name.
    """
    if not artists:
        return None

    if len(artists) == 1:
        a = artists[0]
        name = strip_suffix(a.get("name") or "")
        anv = strip_suffix(a.get("anv") or "")
        if anv and anv != name:
            return anv
        return None

    # Multi-artist: compose with per-entry anv + join separator.
    parts = []
    for i, a in enumerate(artists):
        display = strip_suffix(a.get("anv") or a.get("name") or "")
        if not display:
            continue
        parts.append(display)
        if i < len(artists) - 1:
            sep = (a.get("join") or "").strip()
            if sep == "" or sep == ",":
                parts.append(", ")
            elif sep in ("&", "/", "Vs.", "Vs", "vs."):
                parts.append(f" {sep} ")
            else:
                parts.append(f" {sep} ")
    out = "".join(parts).strip()
    while "  " in out:
        out = out.replace("  ", " ")
    return out or None


def pick_display_name(artists_sort: str | None, artists: list) -> str | None:
    """Mirror of pickArtistDisplayName from artist-display.ts.

    Prefers our composed-with-anv form over Discogs's artists_sort (which uses
    canonical names without anv variants). artists_sort is only fallback for
    edge cases where artists[] is empty but artists_sort is set.
    """
    composed = compose_display_name(artists)
    if composed:
        return composed
    if artists_sort and artists_sort.strip():
        return strip_suffix(artists_sort.strip())
    return None


def fetch_release(discogs_id: int, token: str, rate_limiter: RateLimiter) -> dict | None:
    rate_limiter.wait()
    headers = {
        "Authorization": f"Discogs token={token}",
        "User-Agent": "VODAuctions-Backfill/1.0 +https://vod-auctions.com",
    }
    try:
        r = requests.get(
            f"{DISCOGS_BASE}/releases/{discogs_id}",
            headers=headers,
            timeout=15,
        )
        if r.status_code == 429:
            retry_after = int(r.headers.get("Retry-After", "60"))
            print(f"  rate-limited, sleeping {retry_after}s...", flush=True)
            time.sleep(retry_after)
            return fetch_release(discogs_id, token, rate_limiter)
        if r.status_code == 404:
            return None
        if not r.ok:
            print(f"  HTTP {r.status_code} for release {discogs_id}", flush=True)
            return None
        return r.json()
    except Exception as e:
        print(f"  exception fetching {discogs_id}: {e}", flush=True)
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="No DB writes, no API calls (use cached data only)")
    parser.add_argument("--limit", type=int, default=None, help="Process at most N releases (testing)")
    parser.add_argument("--release-id", help="Process only this Release.id (e.g. 'discogs-release-8901499')")
    args = parser.parse_args()

    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        sys.exit("ERROR: SUPABASE_DB_URL / DATABASE_URL not set")

    token = os.getenv("DISCOGS_TOKEN")
    if not token and not args.dry_run:
        sys.exit("ERROR: DISCOGS_TOKEN not set (required unless --dry-run)")

    pg = psycopg2.connect(db_url)
    pg.autocommit = False
    cur = pg.cursor()

    # Find Multi-Artist-Releases (or single release if --release-id)
    if args.release_id:
        cur.execute(
            """SELECT r.id, r.discogs_id, c.api_data
               FROM "Release" r
               JOIN discogs_api_cache c ON c.discogs_id = r.discogs_id
               WHERE r.id = %s""",
            (args.release_id,),
        )
    else:
        cur.execute(
            """SELECT r.id, r.discogs_id, c.api_data
               FROM "Release" r
               JOIN discogs_api_cache c ON c.discogs_id = r.discogs_id
               WHERE r.data_source = 'discogs_import'
                 AND jsonb_array_length(c.api_data->'artists') > 1
                 AND r.artist_display_name IS NULL
               ORDER BY r.article_number"""
            + (f" LIMIT {int(args.limit)}" if args.limit else "")
        )

    rows = cur.fetchall()
    total = len(rows)
    print(f"Found {total} releases to backfill (dry_run={args.dry_run})", flush=True)

    rate_limiter = RateLimiter(max_calls=55, period=60)
    updated = 0
    skipped = 0
    errors = 0
    started = time.time()

    for i, (release_id, discogs_id, cached_api_data) in enumerate(rows, start=1):
        # Re-fetch from Discogs to get anv/join/artists_sort
        if args.dry_run:
            api = cached_api_data  # use cached only
        else:
            api = fetch_release(discogs_id, token, rate_limiter)
            if api is None:
                errors += 1
                continue

        artists = api.get("artists") or []
        artists_sort = api.get("artists_sort") or ""

        # Compose display name
        display = pick_display_name(artists_sort, artists)

        if not display:
            skipped += 1
            if i % 50 == 0:
                print(f"  [{i}/{total}] skipped (no multi-artist content)", flush=True)
            continue

        # Update cache (preserve anv/join/artists_sort) — mirror what the new fetch route does
        if not args.dry_run:
            new_api_data = dict(cached_api_data) if isinstance(cached_api_data, dict) else {}
            new_api_data["artists_sort"] = artists_sort
            new_api_data["artists"] = [
                {
                    "name": a.get("name") or "",
                    "id": a.get("id"),
                    "anv": a.get("anv") or "",
                    "join": a.get("join") or "",
                }
                for a in artists
            ]
            cur.execute(
                "UPDATE discogs_api_cache SET api_data = %s::jsonb, fetched_at = NOW() WHERE discogs_id = %s",
                (json.dumps(new_api_data), discogs_id),
            )
            cur.execute(
                'UPDATE "Release" SET artist_display_name = %s, "updatedAt" = NOW() WHERE id = %s',
                (display, release_id),
            )
            pg.commit()

        updated += 1
        if i % 25 == 0 or i == total or args.release_id:
            elapsed = time.time() - started
            rate = i / elapsed if elapsed > 0 else 0
            eta_min = (total - i) / rate / 60 if rate > 0 else 0
            print(
                f"  [{i}/{total}] {release_id} -> {display!r}  "
                f"(updated={updated} skipped={skipped} errors={errors} eta={eta_min:.1f}min)",
                flush=True,
            )

    pg.close()
    elapsed = time.time() - started
    print(
        f"\nDone in {elapsed:.0f}s. Updated={updated} Skipped={skipped} Errors={errors} Total={total}",
        flush=True,
    )


if __name__ == "__main__":
    main()
