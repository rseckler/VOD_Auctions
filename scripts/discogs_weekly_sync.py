#!/usr/bin/env python3
"""
Weekly Discogs Price Update.

Updates marketplace stats (lowest_price, num_for_sale) for all releases that
already have a discogs_id. Designed to run weekly via cron.

Features:
- Processes releases ordered by discogs_last_synced ASC (oldest first)
- Compares new prices with stored values, logs changes to sync_log (JSONB diff)
- Always updates discogs_last_synced timestamp
- Resumable via progress file (data/discogs_weekly_progress.json)
- Graceful SIGINT/SIGTERM handling
- Rate limited to 55 req/min

Usage:
    cd VOD_Auctions/scripts
    python3 discogs_weekly_sync.py

Requires .env in parent directory with SUPABASE_DB_URL.
"""

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
    DISCOGS_HEADERS,
    RateLimiter,
    get_pg_connection,
    log_sync,
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

DATA_DIR = Path(__file__).parent.parent / "data"
PROGRESS_FILE = DATA_DIR / "discogs_weekly_progress.json"

# ---------------------------------------------------------------------------
# Global state for signal handling
# ---------------------------------------------------------------------------

_shutdown_requested = False


def signal_handler(signum, frame):
    """Handle SIGINT/SIGTERM: flag for graceful shutdown."""
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
    """Load progress from JSON file, or return defaults."""
    if PROGRESS_FILE.exists():
        try:
            with open(PROGRESS_FILE, "r") as f:
                data = json.load(f)
            print(f"  Resuming: {data.get('processed', 0)} already done, "
                  f"last ID: {data.get('last_release_id', 'N/A')}")
            return data
        except (json.JSONDecodeError, KeyError):
            pass
    return {
        "last_release_id": None,
        "processed": 0,
        "updated": 0,
        "price_increased": 0,
        "price_decreased": 0,
        "new_listings": 0,
        "removed_listings": 0,
        "errors": 0,
        "updated_at": None,
    }


def save_progress(progress):
    """Save current progress to JSON file."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    progress["updated_at"] = datetime.now().isoformat()
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


# ---------------------------------------------------------------------------
# Database functions
# ---------------------------------------------------------------------------

def fetch_releases_with_discogs_id(pg_conn, last_id=None):
    """Fetch all releases with a discogs_id, ordered by last synced (oldest first).

    If last_id is set, skip releases up to and including that ID.
    """
    cur = pg_conn.cursor()

    if last_id:
        cur.execute(
            """
            SELECT
                id, discogs_id,
                discogs_lowest_price, discogs_num_for_sale,
                discogs_have, discogs_want
            FROM "Release"
            WHERE discogs_id IS NOT NULL
              AND id > %s
            ORDER BY discogs_last_synced ASC NULLS FIRST, id ASC
            """,
            (last_id,),
        )
    else:
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


def update_release_prices(pg_conn, release_id, lowest_price, num_for_sale,
                          have=None, want=None, median_price=None,
                          highest_price=None):
    """Update marketplace stats and discogs_last_synced for a release."""
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
            discogs_last_synced = NOW()
        WHERE id = %s
        """,
        (lowest_price, median_price, highest_price, num_for_sale, have, want,
         release_id),
    )
    pg_conn.commit()


def update_last_synced_only(pg_conn, release_id):
    """Update only the discogs_last_synced timestamp (no price change)."""
    cur = pg_conn.cursor()
    cur.execute(
        """UPDATE "Release" SET discogs_last_synced = NOW() WHERE id = %s""",
        (release_id,),
    )
    pg_conn.commit()


# ---------------------------------------------------------------------------
# Discogs API
# ---------------------------------------------------------------------------

def get_marketplace_stats(discogs_id, session, rate_limiter):
    """Fetch marketplace stats for a Discogs release."""
    rate_limiter.wait()
    resp = session.get(
        f"{DISCOGS_BASE}/marketplace/stats/{discogs_id}",
        headers=DISCOGS_HEADERS,
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def get_price_suggestions(discogs_id, session, rate_limiter):
    """Fetch price suggestions by condition from Discogs.
    Returns dict with median_price and highest_price derived from conditions.
    """
    rate_limiter.wait()
    try:
        resp = session.get(
            f"{DISCOGS_BASE}/marketplace/price_suggestions/{discogs_id}",
            headers=DISCOGS_HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        # Extract prices from condition-based suggestions
        # Conditions: "Poor (P)", "Fair (F)", "Good (G)", "Good Plus (G+)",
        #             "Very Good (VG)", "Very Good Plus (VG+)",
        #             "Near Mint (NM or M-)", "Mint (M)"
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
        # Median: middle value
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

    start_time = time.time()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print("=" * 70)
    print("DISCOGS WEEKLY PRICE UPDATE")
    print(f"Started: {now}")
    print("=" * 70)

    # Load progress
    print("\nChecking progress...")
    progress = load_progress()

    # Connect to Supabase
    print("\nConnecting to Supabase PostgreSQL...")
    pg_conn = get_pg_connection()
    print("  Connected!")

    # Fetch releases with discogs_id
    last_id = progress.get("last_release_id")
    print(f"\nFetching releases with discogs_id (after ID: {last_id or 'start'})...")
    releases = fetch_releases_with_discogs_id(pg_conn, last_id)
    total = len(releases)
    print(f"  Found {total} releases to update.")

    if total == 0:
        print("\nNo releases to update.")
        pg_conn.close()
        return

    # Estimate time
    est_minutes = total / 55  # 1 API call per release at 55/min
    print(f"  Estimated time: ~{est_minutes:.0f} minutes ({est_minutes / 60:.1f} hours)")

    session = requests.Session()
    rate_limiter = RateLimiter(max_calls=55, period=60)

    try:
        for idx, release in enumerate(releases):
            if _shutdown_requested:
                break

            release_id = release["id"]
            discogs_id = release["discogs_id"]
            old_price = release.get("discogs_lowest_price")
            old_num = release.get("discogs_num_for_sale")

            try:
                stats = get_marketplace_stats(discogs_id, session, rate_limiter)
            except requests.exceptions.RequestException as e:
                progress["errors"] += 1
                # Still update last_synced to avoid retrying immediately
                try:
                    update_last_synced_only(pg_conn, release_id)
                except Exception:
                    pg_conn.rollback()

                if (idx + 1) % 50 == 0:
                    print(f"  [{progress['processed'] + 1}/{total}] {release_id} -> ERROR: {e}")

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

            # Fetch price suggestions for median/highest
            price_sugg = get_price_suggestions(discogs_id, session, rate_limiter)
            median_price = price_sugg.get("median_price")
            highest_price = price_sugg.get("highest_price")

            # Convert old values for comparison (handle Decimal from postgres)
            old_price_float = float(old_price) if old_price is not None else None
            old_num_int = int(old_num) if old_num is not None else None

            # Detect changes
            price_changed = (old_price_float != new_price)
            num_changed = (old_num_int != new_num)
            has_changes = price_changed or num_changed or median_price or highest_price

            if has_changes:
                # Update DB
                try:
                    update_release_prices(pg_conn, release_id, new_price, new_num,
                                          median_price=median_price,
                                          highest_price=highest_price)
                except Exception as db_err:
                    pg_conn.rollback()
                    progress["errors"] += 1
                    progress["last_release_id"] = release_id
                    progress["processed"] += 1
                    continue
                progress["updated"] += 1

                # Track direction of change
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

                # Log to sync_log with JSONB diff
                changes = {}
                if price_changed:
                    changes["lowest_price"] = {
                        "old": old_price_float,
                        "new": new_price,
                    }
                if num_changed:
                    changes["num_for_sale"] = {
                        "old": old_num_int,
                        "new": new_num,
                    }

                try:
                    log_sync(pg_conn, release_id, "discogs_weekly", changes)
                except Exception:
                    pass  # Don't fail on logging errors
            else:
                # No changes, just update timestamp
                try:
                    update_last_synced_only(pg_conn, release_id)
                except Exception:
                    pg_conn.rollback()

            progress["last_release_id"] = release_id
            progress["processed"] += 1

            # Console output every 50 releases
            if (idx + 1) % 50 == 0:
                elapsed = time.time() - start_time
                rate = progress["processed"] / elapsed * 60 if elapsed > 0 else 0
                print(f"  [{progress['processed']}/{total}] "
                      f"updated: {progress['updated']}, "
                      f"errors: {progress['errors']}, "
                      f"rate: {rate:.0f}/min")

            # Save progress every 200 releases
            if progress["processed"] % 200 == 0:
                save_progress(progress)

    except Exception as e:
        print(f"\n\nFATAL ERROR: {e}")
        progress["errors"] += 1
    finally:
        # Always save progress
        save_progress(progress)
        print(f"\n  Progress saved to: {PROGRESS_FILE}")

        # Log batch result to sync_log
        try:
            elapsed = time.time() - start_time
            log_sync(pg_conn, None, "discogs_weekly", {
                "processed": progress["processed"],
                "updated": progress["updated"],
                "price_increased": progress["price_increased"],
                "price_decreased": progress["price_decreased"],
                "new_listings": progress["new_listings"],
                "removed_listings": progress["removed_listings"],
                "errors": progress["errors"],
                "duration_seconds": round(elapsed, 1),
                "shutdown_requested": _shutdown_requested,
            })
        except Exception:
            pass

        session.close()
        pg_conn.close()

    # Print summary
    elapsed = time.time() - start_time
    p = progress

    print(f"\n{'=' * 70}")
    print("WEEKLY PRICE UPDATE SUMMARY")
    print(f"{'=' * 70}")
    print(f"  Total processed:     {p['processed']}")
    print(f"  Updated (changed):   {p['updated']}")
    print(f"  Price increased:     {p['price_increased']}")
    print(f"  Price decreased:     {p['price_decreased']}")
    print(f"  New listings:        {p['new_listings']}")
    print(f"  Removed listings:    {p['removed_listings']}")
    print(f"  Errors:              {p['errors']}")
    print(f"  Duration:            {elapsed:.1f}s ({elapsed / 60:.1f} min)")

    if _shutdown_requested:
        print(f"\n  ** Interrupted by user. Run again to resume. **")

    print(f"\n  Progress: {PROGRESS_FILE}")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
