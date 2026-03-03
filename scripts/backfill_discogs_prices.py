#!/usr/bin/env python3
"""
Backfill Discogs data for releases that have discogs_id but no prices.

Two-pass strategy:
  1. /releases/{id} — always works, gets lowest_price + num_for_sale + have + want
  2. /marketplace/price_suggestions/{id} — stricter rate limit, gets median + highest

Pass 1 runs first for all releases, then pass 2 attempts to fill median/highest.
If price_suggestions is rate-limited, pass 2 gracefully stops and can be re-run later.
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

# /releases endpoint: 60 req/min, use 1.5s (~40/min) to stay safe.
RELEASE_DELAY = 1.5
# /price_suggestions endpoint: stricter, use 2.5s (~24/min).
PRICE_DELAY = 2.5
MAX_RETRIES = 3


def fetch_release_data(discogs_id, session):
    """Fetch basic data from /releases/{id}. Returns dict or None."""
    for attempt in range(MAX_RETRIES):
        try:
            resp = session.get(
                f"{DISCOGS_BASE}/releases/{discogs_id}",
                headers=DISCOGS_HEADERS,
                timeout=15,
            )
            if resp.status_code == 429:
                wait = int(resp.headers.get("Retry-After", 30))
                print(f"  /releases rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            data = resp.json()
            community = data.get("community", {})
            return {
                "lowest_price": data.get("lowest_price"),
                "num_for_sale": data.get("num_for_sale"),
                "have": community.get("have"),
                "want": community.get("want"),
            }
        except requests.exceptions.RequestException as e:
            print(f"  API error for /releases/{discogs_id}: {e}")
            return None
    return None


def fetch_price_suggestions(discogs_id, session):
    """Fetch price suggestions. Returns (low, median, high) or raises on persistent 429."""
    for attempt in range(MAX_RETRIES):
        try:
            resp = session.get(
                f"{DISCOGS_BASE}/marketplace/price_suggestions/{discogs_id}",
                headers=DISCOGS_HEADERS,
                timeout=15,
            )
            if resp.status_code == 429:
                if attempt < MAX_RETRIES - 1:
                    wait = int(resp.headers.get("Retry-After", 30))
                    print(f"  /price_suggestions rate limited (attempt {attempt + 1}), waiting {wait}s...")
                    time.sleep(wait)
                    continue
                else:
                    # Signal to caller that price_suggestions is blocked
                    raise RateLimitError("price_suggestions persistently rate-limited")
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
            if isinstance(e, RateLimitError):
                raise
            print(f"  API error for /price_suggestions/{discogs_id}: {e}")
            return None, None, None
    return None, None, None


class RateLimitError(requests.exceptions.RequestException):
    pass


def main():
    pg_conn = get_pg_connection()
    cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # ── Pass 1: /releases endpoint for lowest_price + community data ──
    cur.execute("""
        SELECT id, discogs_id
        FROM "Release"
        WHERE discogs_id IS NOT NULL
          AND discogs_lowest_price IS NULL
          AND discogs_num_for_sale IS NULL
        ORDER BY discogs_id
    """)
    releases_pass1 = cur.fetchall()
    total1 = len(releases_pass1)
    print(f"Pass 1: {total1} releases need basic data (/releases endpoint)")

    session = requests.Session()
    updated1 = 0
    skipped1 = 0

    for idx, rel in enumerate(releases_pass1):
        release_id = rel["id"]
        discogs_id = rel["discogs_id"]
        data = fetch_release_data(discogs_id, session)

        if data:
            lp = data["lowest_price"]
            updates = {
                "discogs_num_for_sale": data["num_for_sale"],
                "discogs_have": data["have"],
                "discogs_want": data["want"],
                "discogs_last_synced": "NOW()",
            }
            if lp is not None:
                updates["discogs_lowest_price"] = round(float(lp), 2)

            set_parts = []
            vals = []
            for k, v in updates.items():
                if v == "NOW()":
                    set_parts.append(f"{k} = NOW()")
                else:
                    set_parts.append(f"{k} = %s")
                    vals.append(v)
            vals.append(release_id)

            cur.execute(
                f'UPDATE "Release" SET {", ".join(set_parts)} WHERE id = %s',
                vals,
            )
            pg_conn.commit()
            updated1 += 1
        else:
            skipped1 += 1

        if (idx + 1) % 25 == 0 or idx + 1 == total1:
            print(f"  Pass 1: [{idx + 1}/{total1}] Updated: {updated1}, Skipped: {skipped1}")
        time.sleep(RELEASE_DELAY)

    print(f"\nPass 1 done: {updated1} updated, {skipped1} skipped")

    # ── Pass 2: /price_suggestions for median + highest ──
    cur.execute("""
        SELECT id, discogs_id
        FROM "Release"
        WHERE discogs_id IS NOT NULL
          AND discogs_median_price IS NULL
        ORDER BY discogs_id
    """)
    releases_pass2 = cur.fetchall()
    total2 = len(releases_pass2)
    print(f"\nPass 2: {total2} releases need price suggestions (/price_suggestions endpoint)")

    updated2 = 0
    skipped2 = 0

    for idx, rel in enumerate(releases_pass2):
        release_id = rel["id"]
        discogs_id = rel["discogs_id"]

        try:
            low, med, high = fetch_price_suggestions(discogs_id, session)
        except RateLimitError:
            remaining = total2 - idx
            print(f"\n  Price suggestions endpoint rate-limited. "
                  f"Stopping pass 2 ({remaining} remaining). Re-run later.")
            break

        if med is not None:
            cur.execute("""
                UPDATE "Release"
                SET discogs_lowest_price = COALESCE(discogs_lowest_price, %s),
                    discogs_median_price = %s,
                    discogs_highest_price = %s,
                    discogs_last_synced = NOW()
                WHERE id = %s
            """, (low, med, high, release_id))
            pg_conn.commit()
            updated2 += 1
        else:
            skipped2 += 1

        if (idx + 1) % 25 == 0 or idx + 1 == total2:
            print(f"  Pass 2: [{idx + 1}/{total2}] Updated: {updated2}, No data: {skipped2}")
        time.sleep(PRICE_DELAY)

    cur.close()
    pg_conn.close()
    print(f"\nPass 2 done: {updated2} updated, {skipped2} no data")
    print(f"\nSummary: Pass 1: {updated1}/{total1}, Pass 2: {updated2}/{total2}")


if __name__ == "__main__":
    main()
