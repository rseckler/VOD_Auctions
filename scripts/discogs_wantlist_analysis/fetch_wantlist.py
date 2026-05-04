#!/usr/bin/env python3
"""Fetch Frank's complete Discogs wantlist + extract distinct artists/labels with counts."""
import json, time, sys, os
from collections import Counter, defaultdict
from pathlib import Path
import urllib.request, urllib.error

TOKEN = "SWyMfyEwsjuacHWNeMTpAdeqjnuNcnibIrqIBdbV"
USER = "pripuzzi"
UA = "VOD-Auctions/1.0 +https://vod-auctions.com"
PER_PAGE = 100
RATE_BUDGET = 55  # leave 5/min buffer
HERE = Path(__file__).parent
CACHE = HERE / "cache"
OUT = HERE / "output"

def req(url, retries=3):
    for attempt in range(retries):
        r = urllib.request.Request(url, headers={
            "Authorization": f"Discogs token={TOKEN}",
            "User-Agent": UA,
            "Accept": "application/json",
        })
        try:
            with urllib.request.urlopen(r, timeout=30) as resp:
                remaining = int(resp.headers.get("X-Discogs-Ratelimit-Remaining", "60"))
                body = json.loads(resp.read().decode("utf-8"))
                if remaining < (60 - RATE_BUDGET):
                    time.sleep(60 / RATE_BUDGET)
                else:
                    time.sleep(60 / RATE_BUDGET)
                return body, remaining
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 60
                print(f"  429 rate-limited, sleeping {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            if e.code >= 500 and attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            raise
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            raise
    raise RuntimeError(f"Failed after {retries} retries: {url}")

def fetch_all_wants():
    all_wants = []
    artist_counter = Counter()
    label_counter = Counter()
    artist_names = {}
    label_names = {}
    format_counter = Counter()
    year_counter = Counter()

    # Page 1 to determine total
    url = f"https://api.discogs.com/users/{USER}/wants?page=1&per_page={PER_PAGE}&sort=added&sort_order=desc"
    page1, rem = req(url)
    pagination = page1.get("pagination", {})
    total_pages = pagination.get("pages", 0)
    total_items = pagination.get("items", 0)
    print(f"Total wants: {total_items}, pages: {total_pages}, rate-remaining: {rem}", file=sys.stderr)

    def process_page(wants_data):
        for w in wants_data:
            bi = w.get("basic_information", {}) or {}
            release_id = bi.get("id")
            year = bi.get("year")
            if year:
                year_counter[year] += 1
            for a in (bi.get("artists") or []):
                aid = a.get("id")
                aname = a.get("name", "")
                if aid and aid > 0:  # skip [no artist]
                    artist_counter[aid] += 1
                    if aid not in artist_names:
                        artist_names[aid] = aname
            for lab in (bi.get("labels") or []):
                lid = lab.get("id")
                lname = lab.get("name", "")
                if lid and lid > 0:
                    label_counter[lid] += 1
                    if lid not in label_names:
                        label_names[lid] = lname
            for f in (bi.get("formats") or []):
                fname = f.get("name")
                if fname:
                    format_counter[fname] += 1
            all_wants.append({
                "release_id": release_id,
                "title": bi.get("title"),
                "year": year,
                "master_id": bi.get("master_id") or 0,
                "artist_ids": [a.get("id") for a in (bi.get("artists") or []) if a.get("id")],
                "label_ids": [lab.get("id") for lab in (bi.get("labels") or []) if lab.get("id")],
                "formats": [f.get("name") for f in (bi.get("formats") or []) if f.get("name")],
                "format_descriptions": sum([f.get("descriptions") or [] for f in (bi.get("formats") or [])], []),
            })

    process_page(page1.get("wants", []))

    for page in range(2, total_pages + 1):
        url = f"https://api.discogs.com/users/{USER}/wants?page={page}&per_page={PER_PAGE}&sort=added&sort_order=desc"
        try:
            data, rem = req(url)
        except Exception as e:
            print(f"  page {page} FAILED: {e}", file=sys.stderr)
            continue
        process_page(data.get("wants", []))
        if page % 25 == 0:
            print(f"  page {page}/{total_pages}, wants={len(all_wants)}, distinct artists={len(artist_counter)}, labels={len(label_counter)}, rate-remaining={rem}", file=sys.stderr)

    return {
        "total_items": total_items,
        "total_pages_fetched": total_pages,
        "wants": all_wants,
        "artist_counter": dict(artist_counter),
        "label_counter": dict(label_counter),
        "artist_names": artist_names,
        "label_names": label_names,
        "format_counter": dict(format_counter),
        "year_counter": dict(year_counter),
    }

if __name__ == "__main__":
    print(f"Fetching wantlist for {USER}...", file=sys.stderr)
    result = fetch_all_wants()

    out_path = CACHE / "wantlist_full.json"
    with open(out_path, "w") as f:
        json.dump(result, f, separators=(",", ":"))

    print(f"\nDone. Saved {len(result['wants'])} wants to {out_path}", file=sys.stderr)
    print(f"Distinct artists: {len(result['artist_counter'])}", file=sys.stderr)
    print(f"Distinct labels: {len(result['label_counter'])}", file=sys.stderr)
    print(f"Distinct formats: {len(result['format_counter'])}", file=sys.stderr)
    print(f"Year span: {min(result['year_counter']) if result['year_counter'] else '?'} - {max(result['year_counter']) if result['year_counter'] else '?'}", file=sys.stderr)
