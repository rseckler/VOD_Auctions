#!/usr/bin/env python3
"""
Import Discogs extraartists into ReleaseArtist table.

For all releases with discogs_id:
1. Fetch GET /releases/{discogs_id} from Discogs API
2. Parse extraartists array (name, role, discogs artist ID)
3. Match Discogs artist to VOD Artist table (by name)
4. If no match: create new Artist entry
5. Delete old ReleaseArtist entries for that release
6. Insert new ReleaseArtist entries with correct roles

Resumable via progress file. Graceful shutdown on SIGINT/SIGTERM.

Usage:
    python3 import_discogs_extraartists.py              # Full run
    python3 import_discogs_extraartists.py --dry-run     # Preview without DB writes
    python3 import_discogs_extraartists.py --limit 100   # Process only 100 releases
    python3 import_discogs_extraartists.py --rate 30      # Override rate limit (req/min)
    python3 import_discogs_extraartists.py --reset        # Reset progress, start fresh
"""

import argparse
import json
import os
import signal
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests

from shared import (
    DISCOGS_BASE,
    DISCOGS_HEADERS,
    RateLimiter,
    get_pg_connection,
    slugify,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_RATE = 40  # req/min (conservative, avoids 429s)
MAX_RETRIES = 3
INITIAL_BACKOFF = 30  # seconds
SAVE_INTERVAL = 50  # save progress every N releases

DATA_DIR = Path(__file__).parent.parent / "data"
PROGRESS_FILE = DATA_DIR / "discogs_extraartists_progress.json"

# ---------------------------------------------------------------------------
# Signal handling
# ---------------------------------------------------------------------------

_shutdown_requested = False


def signal_handler(signum, frame):
    global _shutdown_requested
    sig_name = "SIGINT" if signum == signal.SIGINT else "SIGTERM"
    print(f"\n\n[{sig_name}] Shutdown requested. Finishing current release...")
    _shutdown_requested = True


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

# ---------------------------------------------------------------------------
# Progress management
# ---------------------------------------------------------------------------


def load_progress():
    if PROGRESS_FILE.exists():
        try:
            with open(PROGRESS_FILE) as f:
                data = json.load(f)
            print(f"  Resuming: {data.get('processed', 0)} already done")
            return data
        except (json.JSONDecodeError, KeyError):
            pass
    return new_progress()


def new_progress():
    return {
        "processed": 0,
        "updated": 0,
        "skipped": 0,
        "errors": 0,
        "artists_created": 0,
        "links_created": 0,
        "links_deleted": 0,
        "last_release_id": None,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }


def save_progress(progress):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


# ---------------------------------------------------------------------------
# Artist name cache
# ---------------------------------------------------------------------------


def build_artist_cache(pg_conn):
    """Build name → artist_id lookup from existing Artist table."""
    cur = pg_conn.cursor()
    cur.execute('SELECT id, name FROM "Artist"')
    cache = {}
    for row in cur.fetchall():
        # Store lowercase for case-insensitive matching
        key = row[1].strip().lower()
        if key not in cache:
            cache[key] = row[0]
    cur.close()
    print(f"  Artist cache: {len(cache)} entries")
    return cache


def find_or_create_artist(pg_conn, artist_cache, discogs_name, discogs_id=None):
    """Find existing artist by name or create new one. Returns artist_id."""
    key = discogs_name.strip().lower()

    if key in artist_cache:
        return artist_cache[key], False

    # Create new artist
    new_id = f"discogs-artist-{discogs_id}" if discogs_id else f"new-artist-{uuid.uuid4().hex[:12]}"
    slug = slugify(discogs_name)
    if not slug:
        slug = f"artist-{new_id}"

    cur = pg_conn.cursor()
    try:
        cur.execute(
            '''INSERT INTO "Artist" (id, slug, name, "createdAt", "updatedAt")
               VALUES (%s, %s, %s, NOW(), NOW())
               ON CONFLICT (id) DO NOTHING
               RETURNING id''',
            (new_id, slug, discogs_name.strip()),
        )
        pg_conn.commit()
        artist_cache[key] = new_id
        return new_id, True
    except Exception as e:
        pg_conn.rollback()
        # Slug conflict? Try with suffix
        try:
            slug_with_id = f"{slug}-{new_id[-8:]}"
            cur.execute(
                '''INSERT INTO "Artist" (id, slug, name, "createdAt", "updatedAt")
                   VALUES (%s, %s, %s, NOW(), NOW())
                   ON CONFLICT (id) DO NOTHING
                   RETURNING id''',
                (new_id, slug_with_id, discogs_name.strip()),
            )
            pg_conn.commit()
            artist_cache[key] = new_id
            return new_id, True
        except Exception:
            pg_conn.rollback()
            return None, False


# ---------------------------------------------------------------------------
# Discogs API
# ---------------------------------------------------------------------------


def fetch_release(discogs_id, session, rate_limiter):
    """Fetch release data from Discogs API with retry logic."""
    rate_limiter.wait()

    for attempt in range(MAX_RETRIES):
        try:
            resp = session.get(
                f"{DISCOGS_BASE}/releases/{discogs_id}",
                headers=DISCOGS_HEADERS,
                timeout=30,
            )

            if resp.status_code == 200:
                return resp.json()
            elif resp.status_code == 429:
                backoff = INITIAL_BACKOFF * (2 ** attempt)
                print(f"    429 Rate Limited — waiting {backoff}s (attempt {attempt + 1}/{MAX_RETRIES})")
                time.sleep(backoff)
                rate_limiter.wait()
            elif resp.status_code == 404:
                return None
            else:
                print(f"    HTTP {resp.status_code} for discogs_id={discogs_id}")
                return None
        except requests.exceptions.RequestException as e:
            print(f"    Request error: {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(5)

    return None


def parse_extraartists(release_data):
    """Extract extraartists from Discogs release response."""
    if not release_data:
        return []

    extra = release_data.get("extraartists", [])
    results = []

    for artist in extra:
        name = artist.get("name", "").strip()
        # Discogs sometimes appends (N) for disambiguation — keep it
        anv = artist.get("anv", "").strip()
        role = artist.get("role", "").strip()
        discogs_artist_id = artist.get("id")

        if not name:
            continue

        # Use ANV (artist name variation) if available, otherwise full name
        display_name = anv if anv else name

        # Clean up role: remove track references like "Design [Logo]" → "Design, Logo"
        # But keep the role as-is for now — it's useful info

        results.append({
            "name": display_name,
            "role": role,
            "discogs_artist_id": discogs_artist_id,
        })

    return results


# ---------------------------------------------------------------------------
# Main processing
# ---------------------------------------------------------------------------


def process_release(pg_conn, artist_cache, release_id, discogs_id, extraartists, dry_run=False):
    """Replace ReleaseArtist entries for one release with Discogs extraartists."""
    cur = pg_conn.cursor()

    if dry_run:
        # Just count what would happen
        cur.execute(
            'SELECT COUNT(*) FROM "ReleaseArtist" WHERE "releaseId" = %s',
            (release_id,),
        )
        old_count = cur.fetchone()[0]
        return {
            "old_deleted": old_count,
            "new_created": len(extraartists),
            "artists_created": 0,
        }

    # 1. Delete existing ReleaseArtist entries for this release
    cur.execute(
        'DELETE FROM "ReleaseArtist" WHERE "releaseId" = %s',
        (release_id,),
    )
    deleted = cur.rowcount

    # 2. Insert new entries from Discogs extraartists
    created = 0
    artists_new = 0
    seen_artist_ids = set()

    for ea in extraartists:
        artist_id, is_new = find_or_create_artist(
            pg_conn, artist_cache, ea["name"], ea["discogs_artist_id"]
        )

        if not artist_id:
            continue

        if is_new:
            artists_new += 1

        # Avoid duplicate (releaseId, artistId) — Discogs can have same artist with different roles
        pair_key = (release_id, artist_id)
        if pair_key in seen_artist_ids:
            # Append role to existing entry instead
            continue
        seen_artist_ids.add(pair_key)

        entry_id = f"discogs-ra-{release_id}-{artist_id}"[:200]
        role = ea["role"] or "performer"

        try:
            cur.execute(
                '''INSERT INTO "ReleaseArtist" (id, "releaseId", "artistId", role, "createdAt")
                   VALUES (%s, %s, %s, %s, NOW())
                   ON CONFLICT ("releaseId", "artistId") DO UPDATE SET role = EXCLUDED.role''',
                (entry_id, release_id, artist_id, role),
            )
            created += 1
        except Exception as e:
            pg_conn.rollback()
            print(f"      Error inserting RA: {e}")

    pg_conn.commit()

    return {
        "old_deleted": deleted,
        "new_created": created,
        "artists_created": artists_new,
    }


def main():
    parser = argparse.ArgumentParser(description="Import Discogs extraartists")
    parser.add_argument("--dry-run", action="store_true", help="Preview without DB writes")
    parser.add_argument("--limit", type=int, default=0, help="Process only N releases")
    parser.add_argument("--rate", type=int, default=DEFAULT_RATE, help="Rate limit (req/min)")
    parser.add_argument("--reset", action="store_true", help="Reset progress, start fresh")
    args = parser.parse_args()

    if args.reset and PROGRESS_FILE.exists():
        PROGRESS_FILE.unlink()
        print("Progress reset.")

    progress = load_progress()
    rate_limiter = RateLimiter(max_calls=args.rate, period=60)
    session = requests.Session()

    pg_conn = get_pg_connection()
    cur = pg_conn.cursor()

    # Get all releases with discogs_id
    cur.execute('''
        SELECT id, discogs_id FROM "Release"
        WHERE discogs_id IS NOT NULL
        ORDER BY id
    ''')
    all_releases = cur.fetchall()
    total = len(all_releases)
    print(f"\nReleases with discogs_id: {total}")

    # Skip already processed
    start_idx = progress["processed"]
    if start_idx > 0:
        print(f"Skipping first {start_idx} (already processed)")
    releases_to_process = all_releases[start_idx:]

    if args.limit > 0:
        releases_to_process = releases_to_process[:args.limit]
        print(f"Limited to {args.limit} releases")

    print(f"Processing {len(releases_to_process)} releases at {args.rate} req/min")
    if args.dry_run:
        print("*** DRY RUN — no DB changes ***")

    # Build artist name cache
    artist_cache = build_artist_cache(pg_conn)

    print(f"\n{'=' * 60}")
    start_time = time.time()

    for i, (release_id, discogs_id) in enumerate(releases_to_process):
        if _shutdown_requested:
            print("\nShutdown requested — saving progress...")
            break

        # Fetch from Discogs
        data = fetch_release(discogs_id, session, rate_limiter)
        extraartists = parse_extraartists(data)

        if extraartists:
            result = process_release(pg_conn, artist_cache, release_id, discogs_id, extraartists, args.dry_run)
            progress["updated"] += 1
            progress["links_deleted"] += result["old_deleted"]
            progress["links_created"] += result["new_created"]
            progress["artists_created"] += result["artists_created"]
        else:
            # No extraartists — delete old garbage if any, but only for discogs releases
            if not args.dry_run:
                cur.execute(
                    'DELETE FROM "ReleaseArtist" WHERE "releaseId" = %s',
                    (release_id,),
                )
                deleted = cur.rowcount
                if deleted > 0:
                    progress["links_deleted"] += deleted
                    pg_conn.commit()
            progress["skipped"] += 1

        progress["processed"] = start_idx + i + 1
        progress["last_release_id"] = release_id

        # Progress output
        if (i + 1) % 50 == 0 or i == 0:
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed * 60 if elapsed > 0 else 0
            remaining = (len(releases_to_process) - i - 1) / rate * 60 if rate > 0 else 0
            remaining_h = int(remaining // 3600)
            remaining_m = int((remaining % 3600) // 60)
            print(
                f"  [{progress['processed']}/{total}] "
                f"Updated: {progress['updated']}, "
                f"Skipped: {progress['skipped']}, "
                f"New artists: {progress['artists_created']}, "
                f"Links: -{progress['links_deleted']}/+{progress['links_created']} "
                f"({rate:.0f}/min, ~{remaining_h}h{remaining_m:02d}m left)"
            )

        # Save progress periodically
        if (i + 1) % SAVE_INTERVAL == 0:
            save_progress(progress)

    # Final save
    progress["finished_at"] = datetime.now(timezone.utc).isoformat()
    save_progress(progress)

    elapsed = time.time() - start_time
    elapsed_m = int(elapsed // 60)

    print(f"\n{'=' * 60}")
    print(f"Done in {elapsed_m} minutes")
    print(f"  Processed:      {progress['processed']}/{total}")
    print(f"  With extras:    {progress['updated']}")
    print(f"  No extras:      {progress['skipped']}")
    print(f"  Errors:         {progress['errors']}")
    print(f"  Artists created: {progress['artists_created']}")
    print(f"  Links deleted:  {progress['links_deleted']}")
    print(f"  Links created:  {progress['links_created']}")
    if args.dry_run:
        print(f"\n*** DRY RUN — nichts geschrieben. Nutze ohne --dry-run zum Ausführen. ***")
    print(f"{'=' * 60}")

    cur.close()
    pg_conn.close()


if __name__ == "__main__":
    main()
