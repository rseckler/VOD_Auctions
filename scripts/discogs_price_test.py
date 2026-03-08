#!/usr/bin/env python3
"""
Discogs Price Feasibility Test
================================
Tests whether Discogs price lookup works for VOD_Auctions releases.
- Fetches 100 random releases from Supabase
- Searches each on Discogs API (multiple matching strategies)
- Retrieves marketplace stats (lowest_price, num_for_sale)
- Reports match rate and price availability

Discogs API rate limit: 60 req/min (authenticated)
"""

import os
import sys
import json
import time
import random
import psycopg2
import requests
from datetime import datetime
from dotenv import load_dotenv

# Load env from parent directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# --- Config ---
DISCOGS_TOKEN = "SWyMfyEwsjuacHWNeMTpAdeqjnuNcnibIrqIBdbV"
DISCOGS_BASE = "https://api.discogs.com"
DISCOGS_HEADERS = {
    "Authorization": f"Discogs token={DISCOGS_TOKEN}",
    "User-Agent": "VODAuctions/1.0 +https://vodauction.thehotshit.de"
}
DB_URL = os.getenv("SUPABASE_DB_URL")
SAMPLE_SIZE = 100
RATE_LIMIT_DELAY = 1.1  # seconds between API calls (safe for 60/min)

# --- Format mapping: DB enum → Discogs format string ---
FORMAT_MAP = {
    "LP": "Vinyl",
    "CD": "CD",
    "CASSETTE": "Cassette",
    "VHS": "DVD",
    "BOXSET": "Box Set",
    "DIGITAL": "File",
    "BOOK": None,
    "POSTER": None,
    "ZINE": None,
    "OTHER": None,
}


def get_random_releases(n=100):
    """Fetch n random releases with artist and label info from Supabase."""
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Get total count first
    cur.execute('SELECT COUNT(*) FROM "Release"')
    total = cur.fetchone()[0]
    print(f"Total releases in DB: {total}")

    # Fetch random releases with joins
    cur.execute("""
        SELECT
            r.id,
            r.title,
            r."catalogNumber",
            r.barcode,
            r.year,
            r.country,
            r.format,
            a.name as artist_name,
            l.name as label_name
        FROM "Release" r
        LEFT JOIN "Artist" a ON r."artistId" = a.id
        LEFT JOIN "Label" l ON r."labelId" = l.id
        WHERE r.title IS NOT NULL
          AND r.title != ''
          AND a.name IS NOT NULL
        ORDER BY RANDOM()
        LIMIT %s
    """, (n,))

    columns = [desc[0] for desc in cur.description]
    releases = [dict(zip(columns, row)) for row in cur.fetchall()]

    cur.close()
    conn.close()
    return releases


def search_discogs(release, strategy="full"):
    """
    Search Discogs for a release using different strategies.
    Returns (results_list, strategy_name) or ([], strategy_name)
    """
    params = {"type": "release", "per_page": 5}

    if strategy == "catno" and release.get("catalogNumber"):
        # Strategy 1: Catalog number (most precise)
        params["catno"] = release["catalogNumber"]
        params["artist"] = release["artist_name"]

    elif strategy == "barcode" and release.get("barcode"):
        # Strategy 2: Barcode (very precise)
        params["barcode"] = release["barcode"]

    elif strategy == "full":
        # Strategy 3: Artist + Title + Format
        params["artist"] = release["artist_name"]
        params["release_title"] = release["title"]
        discogs_format = FORMAT_MAP.get(release.get("format"))
        if discogs_format:
            params["format"] = discogs_format

    elif strategy == "basic":
        # Strategy 4: Just artist + title (broadest)
        params["artist"] = release["artist_name"]
        params["release_title"] = release["title"]

    else:
        return [], strategy

    try:
        resp = requests.get(
            f"{DISCOGS_BASE}/database/search",
            params=params,
            headers=DISCOGS_HEADERS,
            timeout=10
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("results", []), strategy
    except requests.exceptions.RequestException as e:
        print(f"  API error ({strategy}): {e}")
        return [], strategy


def get_marketplace_stats(release_id):
    """Get marketplace stats for a Discogs release ID."""
    try:
        resp = requests.get(
            f"{DISCOGS_BASE}/marketplace/stats/{release_id}",
            headers=DISCOGS_HEADERS,
            timeout=10
        )
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.RequestException:
        return None


def get_release_community(release_id):
    """Get community have/want stats from release endpoint."""
    try:
        resp = requests.get(
            f"{DISCOGS_BASE}/releases/{release_id}",
            headers=DISCOGS_HEADERS,
            timeout=10
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "community": data.get("community", {}),
            "lowest_price": data.get("lowest_price"),
            "num_for_sale": data.get("num_for_sale"),
        }
    except requests.exceptions.RequestException:
        return None


def match_release(release):
    """
    Try to match a release on Discogs using multiple strategies.
    Returns dict with match info or None.
    """
    strategies = []

    # Build strategy priority list
    if release.get("catalogNumber"):
        strategies.append("catno")
    if release.get("barcode"):
        strategies.append("barcode")
    strategies.append("full")
    strategies.append("basic")

    for strat in strategies:
        results, strat_name = search_discogs(release, strat)
        time.sleep(RATE_LIMIT_DELAY)

        if results:
            best = results[0]
            return {
                "discogs_id": best.get("id"),
                "discogs_title": best.get("title", ""),
                "discogs_year": best.get("year"),
                "discogs_format": ", ".join(best.get("format", [])),
                "discogs_country": best.get("country"),
                "discogs_label": ", ".join(best.get("label", [])),
                "discogs_catno": best.get("catno"),
                "discogs_uri": best.get("uri", ""),
                "strategy": strat_name,
                "result_count": len(results),
                "thumb": best.get("thumb", ""),
            }

    return None


def main():
    print("=" * 70)
    print("DISCOGS PRICE FEASIBILITY TEST")
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 70)

    # Step 1: Get random releases
    print(f"\n[1/3] Fetching {SAMPLE_SIZE} random releases from Supabase...")
    releases = get_random_releases(SAMPLE_SIZE)
    print(f"  Got {len(releases)} releases with artist info")

    # Show format distribution
    formats = {}
    for r in releases:
        fmt = r.get("format", "UNKNOWN")
        formats[fmt] = formats.get(fmt, 0) + 1
    print(f"  Format distribution: {dict(sorted(formats.items(), key=lambda x: -x[1]))}")

    # Step 2: Match against Discogs
    print(f"\n[2/3] Matching against Discogs API (rate limit: ~1 req/sec)...")
    print(f"  Estimated time: ~{SAMPLE_SIZE * 2}–{SAMPLE_SIZE * 4} seconds\n")

    results = []
    matched = 0
    with_price = 0
    strategies_used = {}
    api_calls = 0

    for i, release in enumerate(releases):
        artist = release.get("artist_name", "?")
        title = release.get("title", "?")
        fmt = release.get("format", "?")
        catno = release.get("catalogNumber", "")

        print(f"  [{i+1}/{SAMPLE_SIZE}] {artist} — {title} ({fmt})"
              f"{f' [{catno}]' if catno else ''}", end="")

        match = match_release(release)
        api_calls += 1

        result = {
            "db_id": release["id"],
            "db_artist": artist,
            "db_title": title,
            "db_format": fmt,
            "db_catno": catno,
            "db_year": release.get("year"),
            "db_label": release.get("label_name"),
            "match": None,
            "price": None,
        }

        if match:
            matched += 1
            strat = match["strategy"]
            strategies_used[strat] = strategies_used.get(strat, 0) + 1
            result["match"] = match

            # Get marketplace stats
            time.sleep(RATE_LIMIT_DELAY)
            api_calls += 1
            stats = get_marketplace_stats(match["discogs_id"])

            if stats:
                lowest = stats.get("lowest_price")
                num_for_sale = stats.get("num_for_sale", 0)
                result["price"] = {
                    "lowest_price": lowest.get("value") if isinstance(lowest, dict) else lowest,
                    "currency": lowest.get("currency", "EUR") if isinstance(lowest, dict) else "EUR",
                    "num_for_sale": num_for_sale,
                }
                if result["price"]["lowest_price"]:
                    with_price += 1
                    print(f" → MATCH ({strat}) → {result['price']['lowest_price']}€"
                          f" ({num_for_sale} for sale)")
                else:
                    print(f" → MATCH ({strat}) → no listings")
            else:
                print(f" → MATCH ({strat}) → stats unavailable")
        else:
            print(f" → NO MATCH")

        results.append(result)

    # Step 3: Analysis
    print("\n" + "=" * 70)
    print("[3/3] RESULTS ANALYSIS")
    print("=" * 70)

    print(f"\n--- MATCHING ---")
    print(f"  Total tested:        {SAMPLE_SIZE}")
    print(f"  Matched on Discogs:  {matched} ({matched/SAMPLE_SIZE*100:.1f}%)")
    print(f"  No match found:      {SAMPLE_SIZE - matched} ({(SAMPLE_SIZE-matched)/SAMPLE_SIZE*100:.1f}%)")
    print(f"  API calls made:      {api_calls}")

    print(f"\n--- MATCHING STRATEGIES ---")
    for strat, count in sorted(strategies_used.items(), key=lambda x: -x[1]):
        print(f"  {strat:12s}: {count:3d} matches ({count/matched*100:.1f}%)" if matched else "")

    print(f"\n--- PRICING ---")
    print(f"  With lowest_price:   {with_price} ({with_price/SAMPLE_SIZE*100:.1f}% of total, "
          f"{with_price/matched*100:.1f}% of matched)" if matched else "  No matches found")

    if with_price > 0:
        prices = [r["price"]["lowest_price"] for r in results
                  if r["price"] and r["price"]["lowest_price"]]
        print(f"  Price range:         {min(prices):.2f}€ — {max(prices):.2f}€")
        print(f"  Average lowest:      {sum(prices)/len(prices):.2f}€")
        print(f"  Median lowest:       {sorted(prices)[len(prices)//2]:.2f}€")

        # Listings stats
        listings = [r["price"]["num_for_sale"] for r in results
                    if r["price"] and r["price"]["num_for_sale"]]
        if listings:
            print(f"  Avg listings/item:   {sum(listings)/len(listings):.1f}")

    print(f"\n--- FORMAT MATCH RATES ---")
    for fmt in sorted(formats.keys()):
        fmt_total = sum(1 for r in results if r["db_format"] == fmt)
        fmt_matched = sum(1 for r in results if r["db_format"] == fmt and r["match"])
        fmt_priced = sum(1 for r in results if r["db_format"] == fmt and r["price"] and r["price"]["lowest_price"])
        if fmt_total > 0:
            print(f"  {fmt:10s}: {fmt_matched}/{fmt_total} matched ({fmt_matched/fmt_total*100:.0f}%), "
                  f"{fmt_priced} with price")

    # Show some example matches
    print(f"\n--- EXAMPLE MATCHES (first 10) ---")
    example_matches = [r for r in results if r["match"]][:10]
    for r in example_matches:
        m = r["match"]
        price_str = f"{r['price']['lowest_price']}€" if r["price"] and r["price"]["lowest_price"] else "no price"
        print(f"  DB:      {r['db_artist']} — {r['db_title']} ({r['db_format']}, {r['db_year']})")
        print(f"  Discogs: {m['discogs_title']} ({m['discogs_format']}, {m['discogs_year']})")
        print(f"  Price:   {price_str} | Strategy: {m['strategy']} | ID: {m['discogs_id']}")
        print()

    # Show some non-matches
    print(f"--- EXAMPLE NON-MATCHES (first 5) ---")
    non_matches = [r for r in results if not r["match"]][:5]
    for r in non_matches:
        print(f"  {r['db_artist']} — {r['db_title']} ({r['db_format']}, {r['db_year']}) [{r['db_catno']}]")

    # Save full results to JSON
    output_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'discogs_test_results.json')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({
            "test_date": datetime.now().isoformat(),
            "sample_size": SAMPLE_SIZE,
            "summary": {
                "matched": matched,
                "match_rate": round(matched / SAMPLE_SIZE * 100, 1),
                "with_price": with_price,
                "price_rate": round(with_price / SAMPLE_SIZE * 100, 1),
                "strategies": strategies_used,
            },
            "results": results,
        }, f, indent=2, ensure_ascii=False, default=str)
    print(f"\nFull results saved to: {output_path}")

    # Final verdict
    print("\n" + "=" * 70)
    print("FAZIT")
    print("=" * 70)
    match_pct = matched / SAMPLE_SIZE * 100
    price_pct = with_price / SAMPLE_SIZE * 100 if SAMPLE_SIZE > 0 else 0

    if match_pct >= 70 and price_pct >= 40:
        print("✓ EMPFEHLUNG: Discogs-Integration lohnt sich!")
        print(f"  {match_pct:.0f}% Match-Rate und {price_pct:.0f}% Preisverfügbarkeit sind gut nutzbar.")
    elif match_pct >= 40:
        print("~ BEDINGT EMPFOHLEN: Discogs als Ergänzung nutzbar")
        print(f"  {match_pct:.0f}% Match-Rate — nützlich als Preisindikator, aber nicht für alle Releases.")
    else:
        print("✗ NICHT EMPFOHLEN: Zu geringe Match-Rate")
        print(f"  Nur {match_pct:.0f}% — Discogs-Datenbank deckt das Sortiment nicht ausreichend ab.")

    print(f"\nHinweis: Discogs API liefert nur lowest_price (nicht Median/Durchschnitt).")
    print(f"Für Startpreis-Kalkulation: lowest_price × 0.5–0.8 als konservativer Startpreis.")


if __name__ == "__main__":
    main()
