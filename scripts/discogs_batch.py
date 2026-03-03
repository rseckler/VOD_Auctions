#!/usr/bin/env python3
"""
Discogs Batch Matching Script.

Matches ALL unmatched releases in Supabase against the Discogs API using a
4-tier search strategy. Fetches marketplace stats and community data for
matched releases.

Features:
- 4-tier matching: catno, barcode, full (artist+title+format), basic (artist+title)
- Marketplace stats: lowest_price, num_for_sale
- Community data: have, want
- Resumable via progress file (data/discogs_batch_progress.json)
- Graceful SIGINT/SIGTERM handling
- JSONL results file (data/discogs_batch_results.jsonl)
- Rate limited to 55 req/min (below Discogs' 60/min limit)

Usage:
    cd VOD_Auctions/scripts
    python3 discogs_batch.py             # Start from beginning (or auto-resume)
    python3 discogs_batch.py --resume    # Explicitly resume from progress file

Requires .env in parent directory with SUPABASE_DB_URL.
"""

import argparse
import json
import os
import signal
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

from shared import (
    DISCOGS_BASE,
    DISCOGS_FORMAT_MAP,
    DISCOGS_HEADERS,
    DISCOGS_SKIP_FORMATS,
    RateLimiter,
    get_pg_connection,
    log_sync,
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

DATA_DIR = Path(__file__).parent.parent / "data"
PROGRESS_FILE = DATA_DIR / "discogs_batch_progress.json"
RESULTS_FILE = DATA_DIR / "discogs_batch_results.jsonl"

# ---------------------------------------------------------------------------
# Global state for signal handling
# ---------------------------------------------------------------------------

_shutdown_requested = False
_current_progress = {
    "last_release_id": None,
    "processed": 0,
    "matched": 0,
    "with_price": 0,
    "errors": 0,
    "strategies": {},
    "updated_at": None,
}


def signal_handler(signum, frame):
    """Handle SIGINT/SIGTERM: save progress and exit gracefully."""
    global _shutdown_requested
    sig_name = "SIGINT" if signum == signal.SIGINT else "SIGTERM"
    print(f"\n\n[{sig_name}] Shutdown requested. Saving progress...")
    _shutdown_requested = True


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


# ---------------------------------------------------------------------------
# Progress management
# ---------------------------------------------------------------------------

def load_progress():
    """Load progress from JSON file, or return defaults."""
    if PROGRESS_FILE.exists():
        try:
            with open(PROGRESS_FILE, "r") as f:
                data = json.load(f)
            print(f"  Resuming from progress file: {data.get('processed', 0)} processed, "
                  f"last ID: {data.get('last_release_id', 'N/A')}")
            return data
        except (json.JSONDecodeError, KeyError) as e:
            print(f"  Warning: Could not read progress file ({e}), starting fresh.")
    return {
        "last_release_id": None,
        "processed": 0,
        "matched": 0,
        "with_price": 0,
        "errors": 0,
        "strategies": {},
        "updated_at": None,
    }


def save_progress(progress):
    """Save current progress to JSON file."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    progress["updated_at"] = datetime.now().isoformat()
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


# ---------------------------------------------------------------------------
# Discogs API functions
# ---------------------------------------------------------------------------

def search_discogs(release, strategy, session, rate_limiter):
    """Search Discogs for a release using the specified strategy.

    Returns list of search results (may be empty).
    """
    params = {"type": "release", "per_page": 5}

    if strategy == "catno" and release.get("catalogNumber"):
        params["catno"] = release["catalogNumber"]
        params["artist"] = release["artist_name"]
    elif strategy == "barcode" and release.get("barcode"):
        params["barcode"] = release["barcode"]
    elif strategy == "full":
        params["artist"] = release["artist_name"]
        params["release_title"] = release["title"]
        discogs_fmt = DISCOGS_FORMAT_MAP.get(release.get("format"))
        if discogs_fmt:
            params["format"] = discogs_fmt
    elif strategy == "basic":
        params["artist"] = release["artist_name"]
        params["release_title"] = release["title"]
    else:
        return []

    rate_limiter.wait()
    resp = session.get(
        f"{DISCOGS_BASE}/database/search",
        params=params,
        headers=DISCOGS_HEADERS,
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("results", [])


def get_marketplace_stats(discogs_id, session, rate_limiter):
    """Fetch marketplace stats (lowest_price, num_for_sale) for a Discogs release."""
    rate_limiter.wait()
    try:
        resp = session.get(
            f"{DISCOGS_BASE}/marketplace/stats/{discogs_id}",
            headers=DISCOGS_HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.RequestException:
        return None


def get_release_community(discogs_id, session, rate_limiter):
    """Fetch community have/want stats from the release endpoint."""
    rate_limiter.wait()
    try:
        resp = session.get(
            f"{DISCOGS_BASE}/releases/{discogs_id}",
            headers=DISCOGS_HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        community = data.get("community", {})
        return {
            "have": community.get("have", 0),
            "want": community.get("want", 0),
        }
    except requests.exceptions.RequestException:
        return None


def match_release(release, session, rate_limiter):
    """Try to match a release on Discogs using 4-tier strategy.

    Returns (match_dict, strategy_name) or (None, None).
    """
    strategies = []
    if release.get("catalogNumber"):
        strategies.append("catno")
    if release.get("barcode"):
        strategies.append("barcode")
    strategies.append("full")
    strategies.append("basic")

    for strat in strategies:
        try:
            results = search_discogs(release, strat, session, rate_limiter)
        except requests.exceptions.RequestException as e:
            # Log but continue to next strategy
            continue

        if results:
            best = results[0]
            return {
                "discogs_id": best.get("id"),
                "discogs_title": best.get("title", ""),
                "strategy": strat,
            }, strat

    return None, None


# ---------------------------------------------------------------------------
# Database functions
# ---------------------------------------------------------------------------

def fetch_unmatched_releases(pg_conn, last_id=None):
    """Fetch releases that have no discogs_id and are not in skip formats.

    Returns list of dicts with release data + artist_name.
    """
    cur = pg_conn.cursor()

    # Build format exclusion list
    skip_formats = ", ".join(f"'{f}'" for f in DISCOGS_SKIP_FORMATS)

    if last_id:
        cur.execute(
            f"""
            SELECT
                r.id, r.title, r."catalogNumber", r.barcode,
                r.year, r.country, r.format::text as format,
                a.name as artist_name
            FROM "Release" r
            LEFT JOIN "Artist" a ON r."artistId" = a.id
            WHERE r.discogs_id IS NULL
              AND r.format::text NOT IN ({skip_formats})
              AND r.id > %s
            ORDER BY r.id ASC
            """,
            (last_id,),
        )
    else:
        cur.execute(
            f"""
            SELECT
                r.id, r.title, r."catalogNumber", r.barcode,
                r.year, r.country, r.format::text as format,
                a.name as artist_name
            FROM "Release" r
            LEFT JOIN "Artist" a ON r."artistId" = a.id
            WHERE r.discogs_id IS NULL
              AND r.format::text NOT IN ({skip_formats})
            ORDER BY r.id ASC
            """
        )

    columns = [desc[0] for desc in cur.description]
    releases = [dict(zip(columns, row)) for row in cur.fetchall()]
    cur.close()
    return releases


def update_release_discogs(pg_conn, release_id, discogs_id, lowest_price,
                           num_for_sale, have, want):
    """Update a release with Discogs data."""
    cur = pg_conn.cursor()
    cur.execute(
        """
        UPDATE "Release"
        SET discogs_id = %s,
            discogs_lowest_price = %s,
            discogs_num_for_sale = %s,
            discogs_have = %s,
            discogs_want = %s,
            discogs_last_synced = NOW()
        WHERE id = %s
        """,
        (discogs_id, lowest_price, num_for_sale, have, want, release_id),
    )
    pg_conn.commit()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Batch match releases against Discogs API")
    parser.add_argument("--resume", action="store_true",
                        help="Resume from progress file (auto-detected if progress file exists)")
    args = parser.parse_args()

    global _current_progress, _shutdown_requested

    start_time = time.time()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print("=" * 70)
    print("DISCOGS BATCH MATCHING")
    print(f"Started: {now}")
    print("=" * 70)

    # Load or initialize progress
    print("\nChecking progress...")
    if args.resume or PROGRESS_FILE.exists():
        _current_progress = load_progress()
    else:
        print("  Starting fresh.")

    # Connect to Supabase
    print("\nConnecting to Supabase PostgreSQL...")
    pg_conn = get_pg_connection()
    print("  Connected!")

    # Fetch unmatched releases
    last_id = _current_progress.get("last_release_id")
    print(f"\nFetching unmatched releases (after ID: {last_id or 'start'})...")
    releases = fetch_unmatched_releases(pg_conn, last_id)
    total = len(releases)
    print(f"  Found {total} releases to process.")

    if total == 0:
        print("\nAll releases have been matched (or skipped). Nothing to do.")
        pg_conn.close()
        return

    # Estimate time
    est_minutes = total * 3 / 55  # ~3 API calls per release at 55/min
    print(f"  Estimated time: ~{est_minutes:.0f} minutes ({est_minutes / 60:.1f} hours)")

    # Prepare output
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    rate_limiter = RateLimiter(max_calls=55, period=60)

    # Format stats
    format_stats = {}

    try:
        for idx, release in enumerate(releases):
            if _shutdown_requested:
                break

            release_id = release["id"]
            artist = release.get("artist_name") or "?"
            title = release.get("title") or "?"
            fmt = release.get("format") or "?"

            # Initialize format stats
            if fmt not in format_stats:
                format_stats[fmt] = {"total": 0, "matched": 0, "with_price": 0}
            format_stats[fmt]["total"] += 1

            # Try to match
            try:
                match, strategy = match_release(release, session, rate_limiter)
            except Exception as e:
                _current_progress["errors"] += 1
                result_line = {
                    "release_id": release_id,
                    "artist": artist,
                    "title": title,
                    "format": fmt,
                    "matched": False,
                    "error": str(e),
                }
                with open(RESULTS_FILE, "a", encoding="utf-8") as f:
                    f.write(json.dumps(result_line, ensure_ascii=False) + "\n")

                _current_progress["last_release_id"] = release_id
                _current_progress["processed"] += 1
                continue

            lowest_price = None
            num_for_sale = None
            have = None
            want = None

            if match:
                discogs_id = match["discogs_id"]

                # Get marketplace stats
                try:
                    stats = get_marketplace_stats(discogs_id, session, rate_limiter)
                    if stats:
                        lp = stats.get("lowest_price")
                        if isinstance(lp, dict):
                            lowest_price = lp.get("value")
                        elif lp is not None:
                            lowest_price = float(lp) if lp else None
                        num_for_sale = stats.get("num_for_sale", 0)
                except Exception:
                    pass

                # Get community have/want
                try:
                    community = get_release_community(discogs_id, session, rate_limiter)
                    if community:
                        have = community.get("have", 0)
                        want = community.get("want", 0)
                except Exception:
                    pass

                # Update Supabase
                try:
                    update_release_discogs(
                        pg_conn, release_id, discogs_id,
                        lowest_price, num_for_sale, have, want,
                    )
                except Exception as e:
                    _current_progress["errors"] += 1
                    print(f"\n  DB UPDATE ERROR for {release_id}: {e}")

                _current_progress["matched"] += 1
                strat_counts = _current_progress.get("strategies", {})
                strat_counts[strategy] = strat_counts.get(strategy, 0) + 1
                _current_progress["strategies"] = strat_counts

                format_stats[fmt]["matched"] += 1
                if lowest_price:
                    _current_progress["with_price"] += 1
                    format_stats[fmt]["with_price"] += 1

                # Console output every 10 releases
                if (idx + 1) % 10 == 0 or idx == 0:
                    price_str = f"{lowest_price:.2f}EUR" if lowest_price else "no price"
                    print(f"  [{_current_progress['processed'] + 1}/{total}] "
                          f"{artist} - {title} -> MATCH ({strategy}) {price_str}")
            else:
                # No match
                if (idx + 1) % 10 == 0 or idx == 0:
                    print(f"  [{_current_progress['processed'] + 1}/{total}] "
                          f"{artist} - {title} -> NO MATCH")

            # Write JSONL result
            result_line = {
                "release_id": release_id,
                "artist": artist,
                "title": title,
                "format": fmt,
                "matched": match is not None,
                "strategy": strategy,
                "discogs_id": match["discogs_id"] if match else None,
                "lowest_price": lowest_price,
                "num_for_sale": num_for_sale,
                "have": have,
                "want": want,
            }
            with open(RESULTS_FILE, "a", encoding="utf-8") as f:
                f.write(json.dumps(result_line, ensure_ascii=False) + "\n")

            # Update progress
            _current_progress["last_release_id"] = release_id
            _current_progress["processed"] += 1

            # Save progress every 100 releases
            if _current_progress["processed"] % 100 == 0:
                save_progress(_current_progress)
                print(f"  [Progress saved: {_current_progress['processed']} processed, "
                      f"{_current_progress['matched']} matched]")

    except Exception as e:
        print(f"\n\nFATAL ERROR: {e}")
        _current_progress["errors"] += 1
    finally:
        # Always save progress on exit
        save_progress(_current_progress)
        print(f"\n  Progress saved to: {PROGRESS_FILE}")

        # Log to sync_log
        try:
            elapsed = time.time() - start_time
            log_sync(pg_conn, None, "discogs_batch", {
                "processed": _current_progress["processed"],
                "matched": _current_progress["matched"],
                "with_price": _current_progress["with_price"],
                "errors": _current_progress["errors"],
                "strategies": _current_progress.get("strategies", {}),
                "duration_seconds": round(elapsed, 1),
                "shutdown_requested": _shutdown_requested,
            })
        except Exception:
            pass

        session.close()
        pg_conn.close()

    # Print summary
    elapsed = time.time() - start_time
    processed = _current_progress["processed"]
    matched = _current_progress["matched"]
    with_price = _current_progress["with_price"]
    errors = _current_progress["errors"]

    print(f"\n{'=' * 70}")
    print("BATCH MATCHING SUMMARY")
    print(f"{'=' * 70}")
    print(f"  Total processed:   {processed}")
    print(f"  Matched:           {matched} ({matched/processed*100:.1f}%)" if processed else "")
    print(f"  With price:        {with_price} ({with_price/processed*100:.1f}%)" if processed else "")
    print(f"  Errors:            {errors}")
    print(f"  Duration:          {elapsed:.1f}s ({elapsed / 60:.1f} min)")

    if _current_progress.get("strategies"):
        print(f"\n  --- By Strategy ---")
        for strat, count in sorted(_current_progress["strategies"].items(), key=lambda x: -x[1]):
            pct = count / matched * 100 if matched else 0
            print(f"  {strat:12s}: {count:5d} ({pct:.1f}%)")

    if format_stats:
        print(f"\n  --- By Format ---")
        for fmt in sorted(format_stats.keys()):
            s = format_stats[fmt]
            if s["total"] > 0:
                match_pct = s["matched"] / s["total"] * 100
                print(f"  {fmt:12s}: {s['matched']:5d}/{s['total']:5d} matched ({match_pct:.0f}%), "
                      f"{s['with_price']} with price")

    if _shutdown_requested:
        print(f"\n  ** Interrupted by user. Run again to resume. **")

    print(f"\n  Results: {RESULTS_FILE}")
    print(f"  Progress: {PROGRESS_FILE}")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
