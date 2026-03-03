#!/usr/bin/env python3
"""
Backfill Discogs price suggestions for releases that have discogs_id but no prices.
Uses the /marketplace/price_suggestions endpoint.
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

# Discogs allows 60 req/min for authenticated users.
# price_suggestions seems stricter, so use 1.5s between requests (~40/min).
REQUEST_DELAY = 1.5


def get_price_suggestions(discogs_id, session):
    """Fetch price suggestions and derive low/median/high. Retries on 429."""
    for attempt in range(3):
        try:
            resp = session.get(
                f"{DISCOGS_BASE}/marketplace/price_suggestions/{discogs_id}",
                headers=DISCOGS_HEADERS,
                timeout=15,
            )
            if resp.status_code == 429:
                wait = int(resp.headers.get("Retry-After", 30))
                print(f"  Rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
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

    session = requests.Session()
    updated = 0
    errors = 0

    for idx, rel in enumerate(releases):
        release_id = rel["id"]
        discogs_id = rel["discogs_id"]

        low, med, high = get_price_suggestions(discogs_id, session)

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

        time.sleep(REQUEST_DELAY)

    cur.close()
    pg_conn.close()
    print(f"\nDone: {updated} updated, {errors} no data, {total} total")


if __name__ == "__main__":
    main()
