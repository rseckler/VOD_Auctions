#!/usr/bin/env python3
"""
Daily Discogs Price Update (replaces discogs_weekly_sync.py).

Processes a daily chunk of releases (~3,300/day, Mon-Fri) instead of all
16,000+ in one Sunday run. This avoids Discogs 429 rate-limit errors.

Features:
- Splits total releases into 5 daily chunks (Mon=1/5, Tue=2/5, ..., Fri=5/5)
- Exponential backoff on 429 errors (30s → 60s → 120s, max 3 retries)
- Resumable via progress file (data/discogs_daily_progress.json)
- Graceful SIGINT/SIGTERM handling
- Rate limited to 40 req/min (conservative, avoids marketplace/stats throttle)
- Writes health status to data/discogs_sync_health.json for admin dashboard

Usage:
    cd VOD_Auctions/scripts
    python3 discogs_daily_sync.py              # Auto-detect today's chunk
    python3 discogs_daily_sync.py --chunk 1    # Force chunk 1 of 5
    python3 discogs_daily_sync.py --chunk all  # Process all (like old weekly)
    python3 discogs_daily_sync.py --rate 25    # Override rate limit (req/min)

Requires .env in parent directory with SUPABASE_DB_URL.
"""

import argparse
import json
import math
import os
import signal
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

from shared import (
    DISCOGS_BASE,
    DISCOGS_HEADERS,
    RateLimiter,
    get_pg_connection,
    log_sync,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TOTAL_CHUNKS = 5  # Mon-Fri
DEFAULT_RATE = 40  # req/min (conservative)
MAX_RETRIES = 3
INITIAL_BACKOFF = 30  # seconds
SAVE_INTERVAL = 100  # save progress every N releases

DATA_DIR = Path(__file__).parent.parent / "data"
PROGRESS_FILE = DATA_DIR / "discogs_daily_progress.json"
HEALTH_FILE = DATA_DIR / "discogs_sync_health.json"

# ---------------------------------------------------------------------------
# Global state for signal handling
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

def load_progress(chunk_id):
    """Load progress for a specific chunk, or return defaults."""
    if PROGRESS_FILE.exists():
        try:
            with open(PROGRESS_FILE, "r") as f:
                data = json.load(f)
            # Only resume if same chunk
            if data.get("chunk_id") == chunk_id:
                print(f"  Resuming chunk {chunk_id}: {data.get('processed', 0)} already done")
                return data
            else:
                print(f"  Previous progress was for chunk {data.get('chunk_id')}, starting fresh for chunk {chunk_id}")
        except (json.JSONDecodeError, KeyError):
            pass
    return new_progress(chunk_id)


def new_progress(chunk_id):
    return {
        "chunk_id": chunk_id,
        "last_release_id": None,
        "processed": 0,
        "chunk_total": 0,
        "updated": 0,
        "price_increased": 0,
        "price_decreased": 0,
        "new_listings": 0,
        "removed_listings": 0,
        "errors": 0,
        "errors_429": 0,
        "errors_other": 0,
        "retries_success": 0,
        "updated_at": None,
    }


def save_progress(progress):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    progress["updated_at"] = datetime.now().isoformat()
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


def save_health(progress, status="running", message=None, rate_limit=DEFAULT_RATE):
    """Write health status for the admin dashboard to read."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    total = progress.get("chunk_total", 0) or 1
    error_rate = progress["errors"] / max(progress["processed"], 1) * 100

    health = {
        "status": status,  # running | completed | error | rate_limited
        "message": message,
        "chunk_id": progress.get("chunk_id"),
        "processed": progress["processed"],
        "chunk_total": progress.get("chunk_total", 0),
        "updated": progress["updated"],
        "errors": progress["errors"],
        "errors_429": progress.get("errors_429", 0),
        "errors_other": progress.get("errors_other", 0),
        "retries_success": progress.get("retries_success", 0),
        "error_rate_percent": round(error_rate, 1),
        "rate_limit": rate_limit,
        "price_increased": progress.get("price_increased", 0),
        "price_decreased": progress.get("price_decreased", 0),
        "updated_at": datetime.now().isoformat(),
    }

    # Determine severity
    if error_rate > 30:
        health["severity"] = "critical"
        health["alert"] = f"Error rate {error_rate:.0f}% — Discogs API is heavily rate-limiting"
    elif error_rate > 10:
        health["severity"] = "warning"
        health["alert"] = f"Error rate {error_rate:.0f}% — Some rate-limiting detected"
    else:
        health["severity"] = "ok"
        health["alert"] = None

    with open(HEALTH_FILE, "w") as f:
        json.dump(health, f, indent=2)


# ---------------------------------------------------------------------------
# Database functions
# ---------------------------------------------------------------------------

def fetch_releases_with_discogs_id(pg_conn):
    """Fetch all releases with a discogs_id, ordered by last synced (oldest first)."""
    cur = pg_conn.cursor()
    cur.execute(
        """
        SELECT
            id, discogs_id,
            discogs_lowest_price, discogs_num_for_sale,
            discogs_have, discogs_want
        FROM "Release"
        WHERE discogs_id IS NOT NULL
        ORDER BY discogs_last_synced ASC NULLS FIRST, id ASC
        """
    )
    columns = [desc[0] for desc in cur.description]
    releases = [dict(zip(columns, row)) for row in cur.fetchall()]
    cur.close()
    return releases


def get_chunk_slice(releases, chunk_id, total_chunks):
    """Return the slice of releases for a given chunk (1-based)."""
    if chunk_id == "all":
        return releases
    chunk_size = math.ceil(len(releases) / total_chunks)
    start = (chunk_id - 1) * chunk_size
    end = min(start + chunk_size, len(releases))
    return releases[start:end]


def update_release_prices(pg_conn, release_id, lowest_price, num_for_sale,
                          have=None, want=None, median_price=None,
                          highest_price=None):
    cur = pg_conn.cursor()
    cur.execute(
        """
        UPDATE "Release"
        SET discogs_lowest_price = %s,
            discogs_median_price = COALESCE(%s, discogs_median_price),
            discogs_highest_price = COALESCE(%s, discogs_highest_price),
            discogs_num_for_sale = %s,
            discogs_have = COALESCE(%s, discogs_have),
            discogs_want = COALESCE(%s, discogs_want),
            discogs_last_synced = NOW(),
            search_indexed_at = NULL
        WHERE id = %s
        """,
        (lowest_price, median_price, highest_price, num_for_sale, have, want,
         release_id),
    )
    pg_conn.commit()


def update_last_synced_only(pg_conn, release_id):
    cur = pg_conn.cursor()
    cur.execute(
        """UPDATE "Release" SET discogs_last_synced = NOW() WHERE id = %s""",
        (release_id,),
    )
    pg_conn.commit()


# ---------------------------------------------------------------------------
# Discogs API with exponential backoff
# ---------------------------------------------------------------------------

def get_marketplace_stats(discogs_id, session, rate_limiter):
    """Fetch marketplace stats with exponential backoff on 429."""
    for attempt in range(MAX_RETRIES + 1):
        rate_limiter.wait()
        try:
            resp = session.get(
                f"{DISCOGS_BASE}/marketplace/stats/{discogs_id}",
                headers=DISCOGS_HEADERS,
                timeout=15,
            )
            if resp.status_code == 429:
                if attempt < MAX_RETRIES:
                    backoff = INITIAL_BACKOFF * (2 ** attempt)
                    print(f"\n  [429] Rate limited on {discogs_id}, backing off {backoff}s (attempt {attempt + 1}/{MAX_RETRIES})...")
                    time.sleep(backoff)
                    continue
                else:
                    resp.raise_for_status()  # Will raise after max retries
            resp.raise_for_status()
            return resp.json(), attempt > 0  # (data, was_retried)
        except requests.exceptions.RequestException:
            if attempt < MAX_RETRIES:
                backoff = INITIAL_BACKOFF * (2 ** attempt)
                time.sleep(backoff)
                continue
            raise
    return None, False


def get_price_suggestions(discogs_id, session, rate_limiter):
    """Fetch price suggestions by condition from Discogs."""
    rate_limiter.wait()
    try:
        resp = session.get(
            f"{DISCOGS_BASE}/marketplace/price_suggestions/{discogs_id}",
            headers=DISCOGS_HEADERS,
            timeout=15,
        )
        if resp.status_code == 429:
            # Don't retry price suggestions — not critical
            return {"median_price": None, "highest_price": None}
        resp.raise_for_status()
        data = resp.json()

        prices = []
        for condition, info in data.items():
            if isinstance(info, dict) and "value" in info:
                val = info["value"]
                if val is not None:
                    try:
                        prices.append(float(val))
                    except (ValueError, TypeError):
                        pass

        if not prices:
            return {"median_price": None, "highest_price": None}

        prices.sort()
        n = len(prices)
        median = prices[n // 2] if n % 2 == 1 else (prices[n // 2 - 1] + prices[n // 2]) / 2
        highest = max(prices)

        return {"median_price": round(median, 2), "highest_price": round(highest, 2)}
    except requests.exceptions.RequestException:
        return {"median_price": None, "highest_price": None}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    global _shutdown_requested

    parser = argparse.ArgumentParser(description="Daily Discogs price sync")
    parser.add_argument("--chunk", default=None,
                        help="Chunk number (1-5) or 'all'. Default: auto-detect from weekday")
    parser.add_argument("--rate", type=int, default=DEFAULT_RATE,
                        help=f"Rate limit in req/min (default: {DEFAULT_RATE})")
    args = parser.parse_args()

    # Determine chunk
    if args.chunk is None:
        weekday = datetime.now().weekday()  # 0=Mon, 6=Sun
        if weekday >= 5:
            print(f"Today is {'Saturday' if weekday == 5 else 'Sunday'} — no sync scheduled.")
            print("Use --chunk N to force a specific chunk.")
            return
        chunk_id = weekday + 1  # Mon=1, Tue=2, ..., Fri=5
    elif args.chunk.lower() == "all":
        chunk_id = "all"
    else:
        chunk_id = int(args.chunk)
        if chunk_id < 1 or chunk_id > TOTAL_CHUNKS:
            print(f"ERROR: Chunk must be 1-{TOTAL_CHUNKS}, got {chunk_id}")
            return

    rate_limit = args.rate
    start_time = time.time()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print("=" * 70)
    print(f"DISCOGS DAILY PRICE UPDATE — Chunk {chunk_id}/{TOTAL_CHUNKS}")
    print(f"Started: {now}")
    print(f"Rate limit: {rate_limit} req/min")
    print("=" * 70)

    # Load progress
    print("\nChecking progress...")
    progress = load_progress(chunk_id)

    # Connect
    print("\nConnecting to Supabase PostgreSQL...")
    pg_conn = get_pg_connection()
    print("  Connected!")

    # Fetch all releases, then slice to chunk
    print(f"\nFetching releases with discogs_id...")
    all_releases = fetch_releases_with_discogs_id(pg_conn)
    print(f"  Total with discogs_id: {len(all_releases)}")

    chunk_releases = get_chunk_slice(all_releases, chunk_id, TOTAL_CHUNKS)
    print(f"  Chunk {chunk_id}: {len(chunk_releases)} releases")
    progress["chunk_total"] = len(chunk_releases)

    # Skip already processed (resume)
    start_idx = 0
    if progress["last_release_id"]:
        for i, r in enumerate(chunk_releases):
            if r["id"] == progress["last_release_id"]:
                start_idx = i + 1
                break
        print(f"  Resuming from index {start_idx}")

    remaining = len(chunk_releases) - start_idx
    if remaining <= 0:
        print(f"\nChunk {chunk_id} already fully processed.")
        save_health(progress, status="completed", message="Chunk already done", rate_limit=rate_limit)
        pg_conn.close()
        return

    est_minutes = remaining * 2 / rate_limit  # 2 API calls per release
    print(f"  Remaining: {remaining} releases")
    print(f"  Estimated time: ~{est_minutes:.0f} minutes ({est_minutes / 60:.1f} hours)")

    session = requests.Session()
    rate_limiter = RateLimiter(max_calls=rate_limit, period=60)

    consecutive_429s = 0
    MAX_CONSECUTIVE_429 = 20  # Emergency stop

    try:
        for idx in range(start_idx, len(chunk_releases)):
            if _shutdown_requested:
                break

            release = chunk_releases[idx]
            release_id = release["id"]
            discogs_id = release["discogs_id"]
            old_price = release.get("discogs_lowest_price")
            old_num = release.get("discogs_num_for_sale")

            try:
                stats, was_retried = get_marketplace_stats(discogs_id, session, rate_limiter)
                if was_retried:
                    progress["retries_success"] += 1
                consecutive_429s = 0  # Reset on success
            except requests.exceptions.HTTPError as e:
                if e.response is not None and e.response.status_code == 429:
                    progress["errors_429"] += 1
                    consecutive_429s += 1
                else:
                    progress["errors_other"] += 1
                    consecutive_429s = 0
                progress["errors"] += 1

                try:
                    update_last_synced_only(pg_conn, release_id)
                except Exception:
                    pg_conn.rollback()

                # Emergency stop on too many consecutive 429s
                if consecutive_429s >= MAX_CONSECUTIVE_429:
                    msg = f"EMERGENCY STOP: {MAX_CONSECUTIVE_429} consecutive 429 errors"
                    print(f"\n  {msg}")
                    save_health(progress, status="rate_limited", message=msg, rate_limit=rate_limit)
                    break

                progress["last_release_id"] = release_id
                progress["processed"] += 1

                if (progress["processed"]) % 50 == 0:
                    elapsed = time.time() - start_time
                    rate = progress["processed"] / elapsed * 60 if elapsed > 0 else 0
                    print(f"  [{progress['processed']}/{remaining}] "
                          f"updated: {progress['updated']}, "
                          f"429s: {progress['errors_429']}, "
                          f"errors: {progress['errors']}, "
                          f"rate: {rate:.0f}/min")
                continue
            except requests.exceptions.RequestException as e:
                progress["errors_other"] += 1
                progress["errors"] += 1
                consecutive_429s = 0
                try:
                    update_last_synced_only(pg_conn, release_id)
                except Exception:
                    pg_conn.rollback()
                progress["last_release_id"] = release_id
                progress["processed"] += 1
                continue

            # Parse new values
            new_price = None
            new_num = 0
            if stats:
                lp = stats.get("lowest_price")
                if isinstance(lp, dict):
                    new_price = lp.get("value")
                elif lp is not None:
                    try:
                        new_price = float(lp) if lp else None
                    except (ValueError, TypeError):
                        new_price = None
                new_num = stats.get("num_for_sale", 0)

            # Fetch price suggestions
            price_sugg = get_price_suggestions(discogs_id, session, rate_limiter)
            median_price = price_sugg.get("median_price")
            highest_price = price_sugg.get("highest_price")

            # Compare
            old_price_float = float(old_price) if old_price is not None else None
            old_num_int = int(old_num) if old_num is not None else None

            price_changed = (old_price_float != new_price)
            num_changed = (old_num_int != new_num)
            has_changes = price_changed or num_changed or median_price or highest_price

            if has_changes:
                try:
                    update_release_prices(pg_conn, release_id, new_price, new_num,
                                          median_price=median_price,
                                          highest_price=highest_price)
                except Exception:
                    pg_conn.rollback()
                    progress["errors"] += 1
                    progress["errors_other"] += 1
                    progress["last_release_id"] = release_id
                    progress["processed"] += 1
                    continue
                progress["updated"] += 1

                if old_price_float is not None and new_price is not None:
                    if new_price > old_price_float:
                        progress["price_increased"] += 1
                    elif new_price < old_price_float:
                        progress["price_decreased"] += 1

                if old_num_int is not None and new_num is not None:
                    if new_num > (old_num_int or 0):
                        progress["new_listings"] += 1
                    elif new_num < (old_num_int or 0):
                        progress["removed_listings"] += 1

                # Log change
                changes = {}
                if price_changed:
                    changes["lowest_price"] = {"old": old_price_float, "new": new_price}
                if num_changed:
                    changes["num_for_sale"] = {"old": old_num_int, "new": new_num}
                try:
                    log_sync(pg_conn, release_id, "discogs_weekly", changes)
                except Exception:
                    pass
            else:
                try:
                    update_last_synced_only(pg_conn, release_id)
                except Exception:
                    pg_conn.rollback()

            progress["last_release_id"] = release_id
            progress["processed"] += 1

            # Console output every 50 releases
            if (progress["processed"]) % 50 == 0:
                elapsed = time.time() - start_time
                rate = progress["processed"] / elapsed * 60 if elapsed > 0 else 0
                print(f"  [{progress['processed']}/{remaining}] "
                      f"updated: {progress['updated']}, "
                      f"429s: {progress['errors_429']}, "
                      f"errors: {progress['errors']}, "
                      f"rate: {rate:.0f}/min")

            # Save progress periodically
            if progress["processed"] % SAVE_INTERVAL == 0:
                save_progress(progress)
                save_health(progress, rate_limit=rate_limit)

    except Exception as e:
        print(f"\n\nFATAL ERROR: {e}")
        progress["errors"] += 1
        save_health(progress, status="error", message=str(e), rate_limit=rate_limit)
    finally:
        save_progress(progress)
        print(f"\n  Progress saved to: {PROGRESS_FILE}")

        # Determine final status
        error_rate = progress["errors"] / max(progress["processed"], 1) * 100
        if _shutdown_requested:
            final_status = "interrupted"
            final_msg = "Interrupted by user"
        elif consecutive_429s >= MAX_CONSECUTIVE_429:
            final_status = "rate_limited"
            final_msg = f"Stopped after {MAX_CONSECUTIVE_429} consecutive 429 errors"
        elif error_rate > 30:
            final_status = "error"
            final_msg = f"High error rate: {error_rate:.0f}%"
        else:
            final_status = "completed"
            final_msg = None

        save_health(progress, status=final_status, message=final_msg, rate_limit=rate_limit)

        # Log to sync_log
        try:
            elapsed = time.time() - start_time
            log_sync(pg_conn, None, "discogs_weekly", {
                "chunk_id": chunk_id,
                "chunk_total": progress.get("chunk_total", 0),
                "processed": progress["processed"],
                "updated": progress["updated"],
                "price_increased": progress["price_increased"],
                "price_decreased": progress["price_decreased"],
                "new_listings": progress["new_listings"],
                "removed_listings": progress["removed_listings"],
                "errors": progress["errors"],
                "errors_429": progress.get("errors_429", 0),
                "retries_success": progress.get("retries_success", 0),
                "duration_seconds": round(elapsed, 1),
                "shutdown_requested": _shutdown_requested,
                "rate_limit": rate_limit,
            })
        except Exception:
            pass

        session.close()
        pg_conn.close()

    # Print summary
    elapsed = time.time() - start_time
    p = progress

    print(f"\n{'=' * 70}")
    print(f"DAILY PRICE UPDATE SUMMARY — Chunk {chunk_id}/{TOTAL_CHUNKS}")
    print(f"{'=' * 70}")
    print(f"  Processed:           {p['processed']}")
    print(f"  Updated (changed):   {p['updated']}")
    print(f"  Price increased:     {p['price_increased']}")
    print(f"  Price decreased:     {p['price_decreased']}")
    print(f"  New listings:        {p['new_listings']}")
    print(f"  Removed listings:    {p['removed_listings']}")
    print(f"  Errors total:        {p['errors']}")
    print(f"    - 429 rate limit:  {p.get('errors_429', 0)}")
    print(f"    - Other:           {p.get('errors_other', 0)}")
    print(f"  Retries succeeded:   {p.get('retries_success', 0)}")
    print(f"  Error rate:          {error_rate:.1f}%")
    print(f"  Duration:            {elapsed:.1f}s ({elapsed / 60:.1f} min)")

    if _shutdown_requested:
        print(f"\n  ** Interrupted by user. Run again to resume. **")

    print(f"\n  Progress: {PROGRESS_FILE}")
    print(f"  Health:   {HEALTH_FILE}")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
