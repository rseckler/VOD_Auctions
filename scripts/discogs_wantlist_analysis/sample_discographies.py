#!/usr/bin/env python3
"""Sample top-N artists + top-N labels from wantlist, fetch their full discographies via Discogs API.
Output: per-entity release counts, format breakdown, year breakdown, master_id dedupe rate."""
import json, time, sys, os, random
from collections import Counter, defaultdict
from pathlib import Path
import urllib.request, urllib.error

TOKEN = "SWyMfyEwsjuacHWNeMTpAdeqjnuNcnibIrqIBdbV"
UA = "VOD-Auctions/1.0 +https://vod-auctions.com"
PER_PAGE = 500
RATE_BUDGET = 55
PAGE_CAP = 15  # max ~7,500 releases per entity (Mute alone has 50k+ — would skew sample anyway)
HERE = Path(__file__).parent
CACHE = HERE / "cache"
OUT = HERE / "output"

SAMPLE_TOP_ARTISTS = 30  # most frequent in wantlist
SAMPLE_TOP_LABELS = 15
SAMPLE_RANDOM_ARTISTS = 20  # also a random subset to avoid bias
SAMPLE_RANDOM_LABELS = 10

# Hard-coded skip-list (Discogs aggregation entities — would explode results)
SKIP_ARTIST_IDS = {0, 194, 355}  # 0=[no artist], 194=Various, 355=DJ
SKIP_LABEL_IDS = {0}  # 0=Not On Label
NOT_ON_LABEL_NAME = "Not On Label"

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
                time.sleep(60 / RATE_BUDGET)
                return body, remaining
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"  429 sleeping 60s", file=sys.stderr)
                time.sleep(60)
                continue
            if e.code == 404:
                return None, 60
            if e.code >= 500 and attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            raise
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            raise
    raise RuntimeError(f"Failed: {url}")

def fetch_entity_releases(entity_type, entity_id):
    """Fetch releases for an artist or label, capped at PAGE_CAP pages.
    Returns (releases, total_pages_available, was_capped)."""
    releases = []
    page = 1
    total_pages_available = 0
    while True:
        url = f"https://api.discogs.com/{entity_type}s/{entity_id}/releases?page={page}&per_page={PER_PAGE}&sort=year"
        data, _ = req(url)
        if data is None:
            return None, 0, False  # 404
        for r in (data.get("releases") or []):
            releases.append({
                "id": r.get("id"),
                "type": r.get("type"),
                "title": r.get("title"),
                "year": r.get("year"),
                "format": r.get("format"),
                "main_release": r.get("main_release"),
                "role": r.get("role"),
                "thumb": r.get("thumb"),
            })
        pag = data.get("pagination") or {}
        total_pages_available = pag.get("pages") or 0
        if page >= total_pages_available:
            break
        if page >= PAGE_CAP:
            return releases, total_pages_available, True
        page += 1
    return releases, total_pages_available, False

def main():
    wantlist = json.loads((CACHE / "wantlist_full.json").read_text())

    # Pick top + random samples
    artist_counter = Counter({int(k): v for k, v in wantlist["artist_counter"].items()})
    label_counter = Counter({int(k): v for k, v in wantlist["label_counter"].items()})
    artist_names = {int(k): v for k, v in wantlist["artist_names"].items()}
    label_names = {int(k): v for k, v in wantlist["label_names"].items()}

    # Filter skip-list and Not On Label labels
    eligible_artists = [(aid, c) for aid, c in artist_counter.most_common() if aid not in SKIP_ARTIST_IDS]
    eligible_labels = [(lid, c) for lid, c in label_counter.most_common()
                       if lid not in SKIP_LABEL_IDS and label_names.get(lid, "").lower() != NOT_ON_LABEL_NAME.lower()]

    top_artists = eligible_artists[:SAMPLE_TOP_ARTISTS]
    top_labels = eligible_labels[:SAMPLE_TOP_LABELS]

    # Random sample from the long tail (count >= 2 to avoid one-offs)
    long_tail_artists = [a for a in eligible_artists[SAMPLE_TOP_ARTISTS:] if a[1] >= 2]
    long_tail_labels = [l for l in eligible_labels[SAMPLE_TOP_LABELS:] if l[1] >= 2]
    random.seed(42)
    random_artists = random.sample(long_tail_artists, min(SAMPLE_RANDOM_ARTISTS, len(long_tail_artists)))
    random_labels = random.sample(long_tail_labels, min(SAMPLE_RANDOM_LABELS, len(long_tail_labels)))

    sampled_artists = top_artists + random_artists
    sampled_labels = top_labels + random_labels

    print(f"Sampling {len(sampled_artists)} artists + {len(sampled_labels)} labels", file=sys.stderr)
    print(f"Total API requests estimate: {(len(sampled_artists) + len(sampled_labels)) * 2}-ish (2 pages avg)", file=sys.stderr)

    artist_results = {}
    for i, (aid, want_count) in enumerate(sampled_artists):
        name = artist_names.get(aid, f"Artist#{aid}")
        print(f"  [{i+1}/{len(sampled_artists)}] artist {aid} '{name}' (in wantlist: {want_count})", file=sys.stderr, flush=True)
        try:
            rels, total_pages, capped = fetch_entity_releases("artist", aid)
            if rels is None:
                artist_results[aid] = {"name": name, "want_count": want_count, "error": "404"}
                continue
            full_estimate = total_pages * PER_PAGE if capped else len(rels)
            artist_results[aid] = {
                "name": name, "want_count": want_count,
                "total_releases": len(rels),
                "total_releases_full_estimate": full_estimate,
                "was_capped": capped,
                "releases": rels,
            }
            if capped:
                print(f"    capped at {len(rels)} of ~{full_estimate} releases", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"    ERROR: {e}", file=sys.stderr, flush=True)
            artist_results[aid] = {"name": name, "want_count": want_count, "error": str(e)}

    label_results = {}
    for i, (lid, want_count) in enumerate(sampled_labels):
        name = label_names.get(lid, f"Label#{lid}")
        print(f"  [{i+1}/{len(sampled_labels)}] label {lid} '{name}' (in wantlist: {want_count})", file=sys.stderr, flush=True)
        try:
            rels, total_pages, capped = fetch_entity_releases("label", lid)
            if rels is None:
                label_results[lid] = {"name": name, "want_count": want_count, "error": "404"}
                continue
            full_estimate = total_pages * PER_PAGE if capped else len(rels)
            label_results[lid] = {
                "name": name, "want_count": want_count,
                "total_releases": len(rels),
                "total_releases_full_estimate": full_estimate,
                "was_capped": capped,
                "releases": rels,
            }
            if capped:
                print(f"    capped at {len(rels)} of ~{full_estimate} releases", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"    ERROR: {e}", file=sys.stderr, flush=True)
            label_results[lid] = {"name": name, "want_count": want_count, "error": str(e)}

    out = {
        "sampled_artists": artist_results,
        "sampled_labels": label_results,
        "sample_meta": {
            "top_artists": SAMPLE_TOP_ARTISTS,
            "top_labels": SAMPLE_TOP_LABELS,
            "random_artists": SAMPLE_RANDOM_ARTISTS,
            "random_labels": SAMPLE_RANDOM_LABELS,
        },
    }
    out_path = CACHE / "discographies_sample.json"
    with open(out_path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"\nSaved to {out_path}", file=sys.stderr)

if __name__ == "__main__":
    main()
