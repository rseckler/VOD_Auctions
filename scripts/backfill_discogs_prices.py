#!/usr/bin/env python3
"""
Backfill Discogs price suggestions for releases that have discogs_id but no prices.
Uses the /marketplace/price_suggestions endpoint.

Handles persistent 429 rate limits with exponential backoff (up to 5 min).
"""
import time
import requests
import psycopg2
import psycopg2.extras

from shared import (
    DISCOGS_BASE,
    DISCOGS_HEADERS,
    get_pg_connection,
)

# Conservative: 2s between requests (~30/min) to avoid triggering rate limits.
REQUEST_DELAY = 2.0
# Max retries per request before giving up on that release.
MAX_RETRIES = 5
# Max wait time for exponential backoff (5 minutes).
MAX_BACKOFF = 300


def get_price_suggestions(discogs_id, session, backoff_state):
    """Fetch price suggestions and derive low/median/high.

    Uses exponential backoff for 429s. backoff_state is a dict with
    'consecutive_429s' to track global rate limit pressure.
    """
    for attempt in range(MAX_RETRIES):
        try:
            resp = session.get(
                f"{DISCOGS_BASE}/marketplace/price_suggestions/{discogs_id}",
                headers=DISCOGS_HEADERS,
                timeout=15,
            )
            if resp.status_code == 429:
                backoff_state["consecutive_429s"] += 1
                # Exponential backoff: 30s, 60s, 120s, 240s, 300s (max)
                base_wait = int(resp.headers.get("Retry-After", 30))
                wait = min(base_wait * (2 ** (backoff_state["consecutive_429s"] - 1)), MAX_BACKOFF)
                print(f"  Rate limited (attempt {attempt + 1}/{MAX_RETRIES}), "
                      f"consecutive 429s: {backoff_state['consecutive_429s']}, "
                      f"waiting {wait}s...")
                time.sleep(wait)
                continue

            # Success — reset backoff counter
            backoff_state["consecutive_429s"] = 0
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
                return None, None, None

            prices.sort()
            lowest = min(prices)
            highest = max(prices)
            n = len(prices)
            median = prices[n // 2] if n % 2 == 1 else (prices[n // 2 - 1] + prices[n // 2]) / 2

            return round(lowest, 2), round(median, 2), round(highest, 2)
        except requests.exceptions.RequestException as e:
            print(f"  API error for {discogs_id}: {e}")
            return None, None, None
    print(f"  Giving up on {discogs_id} after {MAX_RETRIES} retries")
    return None, None, None


def main():
    pg_conn = get_pg_connection()
    cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Find releases with discogs_id but no prices
    cur.execute("""
        SELECT id, discogs_id
        FROM "Release"
        WHERE discogs_id IS NOT NULL
          AND discogs_lowest_price IS NULL
          AND discogs_median_price IS NULL
        ORDER BY discogs_id
    """)
    releases = cur.fetchall()
    total = len(releases)
    print(f"Found {total} releases to backfill")

    if total == 0:
        print("Nothing to do.")
        cur.close()
        pg_conn.close()
        return

    session = requests.Session()
    updated = 0
    errors = 0
    backoff_state = {"consecutive_429s": 0}

    for idx, rel in enumerate(releases):
        release_id = rel["id"]
        discogs_id = rel["discogs_id"]

        low, med, high = get_price_suggestions(discogs_id, session, backoff_state)

        if low is not None:
            cur.execute("""
                UPDATE "Release"
                SET discogs_lowest_price = COALESCE(discogs_lowest_price, %s),
                    discogs_median_price = %s,
                    discogs_highest_price = %s,
                    discogs_last_synced = NOW()
                WHERE id = %s
            """, (low, med, high, release_id))
            pg_conn.commit()
            updated += 1
        else:
            errors += 1

        if (idx + 1) % 25 == 0 or idx + 1 == total:
            print(f"  [{idx + 1}/{total}] Updated: {updated}, No data: {errors}")

        # If we've been hitting rate limits, slow down more
        delay = REQUEST_DELAY
        if backoff_state["consecutive_429s"] > 0:
            delay = min(REQUEST_DELAY * (2 ** backoff_state["consecutive_429s"]), 60)
        time.sleep(delay)

    cur.close()
    pg_conn.close()
    print(f"\nDone: {updated} updated, {errors} no data, {total} total")


if __name__ == "__main__":
    main()
