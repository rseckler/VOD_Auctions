#!/usr/bin/env python3
"""
Label Validation Script — validates parsed label names before writing to DB.

Three-phase validation:
  Phase 1: Discogs Release API — fetch label from /releases/{discogs_id}
  Phase 2: Discogs Label Search — search /database/search?type=label&q={name}
  Phase 3: AI Cleanup — Claude Haiku batch cleanup for unmatched labels

Outputs a review CSV (no direct DB writes) that the user can inspect before
committing. Use --commit to apply the reviewed CSV to the database.

Usage:
    cd VOD_Auctions/scripts
    python3 validate_labels.py                     # All 3 phases → review CSV
    python3 validate_labels.py --phase 1           # Discogs Release API only
    python3 validate_labels.py --phase 2           # Discogs Label Search only
    python3 validate_labels.py --phase 3           # AI Cleanup only
    python3 validate_labels.py --limit 100         # Limit per phase
    python3 validate_labels.py --commit review.csv # Apply reviewed CSV to DB

Requires .env in parent directory with SUPABASE_DB_URL (+ ANTHROPIC_API_KEY for Phase 3).
"""

import argparse
import csv
import json
import os
import re
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
    slugify,
    decode_entities,
)

from enrich_labels_from_catno import (
    parse_label_from_catno,
    find_or_create_label,
    update_release_label,
    load_existing_labels,
    NOISE_WORDS,
    DISCOGS_NOT_ON_LABEL_RE,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DATA_DIR = Path(__file__).parent.parent / "data"
REVIEW_FILE = DATA_DIR / "label_validation_review.csv"
PROGRESS_FILE = DATA_DIR / "label_validation_progress.json"

CSV_HEADER = [
    "Release ID", "CatalogNumber", "Title", "Discogs ID",
    "Original Parse", "Validated Label", "Source", "Confidence", "Action",
]

# ---------------------------------------------------------------------------
# Signal handling
# ---------------------------------------------------------------------------

_shutdown_requested = False


def signal_handler(signum, frame):
    global _shutdown_requested
    print(f"\n[Signal] Shutdown requested. Finishing current item...")
    _shutdown_requested = True


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


# ---------------------------------------------------------------------------
# String similarity (normalized Levenshtein)
# ---------------------------------------------------------------------------

def similarity(a: str, b: str) -> float:
    """Normalized Levenshtein similarity between 0.0 and 1.0."""
    a = a.lower().strip()
    b = b.lower().strip()
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0

    len_a, len_b = len(a), len(b)
    # Simple length-based early exit
    if abs(len_a - len_b) / max(len_a, len_b) > 0.6:
        return 0.0

    # Levenshtein distance (Wagner-Fischer)
    prev = list(range(len_b + 1))
    for i in range(1, len_a + 1):
        curr = [i] + [0] * len_b
        for j in range(1, len_b + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            curr[j] = min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
        prev = curr

    distance = prev[len_b]
    return 1.0 - distance / max(len_a, len_b)


# ---------------------------------------------------------------------------
# Anthropic client (lazy init, pattern from generate_entity_content.py)
# ---------------------------------------------------------------------------

_anthropic_client = None


def get_anthropic_client():
    """Lazy-init the Anthropic client."""
    global _anthropic_client
    if _anthropic_client is None:
        from anthropic import Anthropic
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            # Try loading .env
            from dotenv import load_dotenv
            load_dotenv(Path(__file__).parent / ".env")
            load_dotenv(Path(__file__).parent.parent / ".env")
            api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            print("ERROR: ANTHROPIC_API_KEY not set in .env")
            sys.exit(1)
        _anthropic_client = Anthropic(api_key=api_key)
    return _anthropic_client


# ---------------------------------------------------------------------------
# Progress management
# ---------------------------------------------------------------------------

def load_progress() -> dict:
    if PROGRESS_FILE.exists():
        try:
            with open(PROGRESS_FILE) as f:
                return json.load(f)
        except (json.JSONDecodeError, KeyError):
            pass
    return {"phase1_done": [], "phase2_done": [], "phase3_done": [], "results": []}


def save_progress(progress: dict):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    progress["updated_at"] = datetime.now().isoformat()
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


# ---------------------------------------------------------------------------
# Review CSV I/O
# ---------------------------------------------------------------------------

def load_existing_results() -> dict:
    """Load existing results from review CSV into dict keyed by release_id."""
    results = {}
    if REVIEW_FILE.exists():
        with open(REVIEW_FILE, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f, delimiter=";")
            for row in reader:
                results[row["Release ID"]] = row
    return results


def save_results(results: dict):
    """Write all results to review CSV."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(REVIEW_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADER, delimiter=";")
        writer.writeheader()
        for row in sorted(results.values(), key=lambda r: r["Release ID"]):
            writer.writerow(row)


def make_row(release_id, catno, title, discogs_id, original_parse,
             validated_label, source, confidence, action) -> dict:
    return {
        "Release ID": release_id,
        "CatalogNumber": catno or "",
        "Title": title or "",
        "Discogs ID": str(discogs_id) if discogs_id else "",
        "Original Parse": original_parse or "",
        "Validated Label": validated_label or "",
        "Source": source,
        "Confidence": confidence,
        "Action": action,
    }


# ---------------------------------------------------------------------------
# Phase 1: Discogs Release API
# ---------------------------------------------------------------------------

def phase1_discogs_release(pg_conn, limit: int | None) -> dict:
    """Fetch label from Discogs /releases/{id} for releases with discogs_id."""
    print("\n" + "=" * 70)
    print("PHASE 1: Discogs Release API — Label Lookup")
    print("=" * 70)

    cur = pg_conn.cursor()
    query = """
        SELECT id, discogs_id, "catalogNumber", title
        FROM "Release"
        WHERE "labelId" IS NULL
          AND discogs_id IS NOT NULL
          AND product_category = 'release'
          AND label_enriched = FALSE
        ORDER BY id
    """
    if limit:
        query += f" LIMIT {limit}"
    cur.execute(query)
    releases = cur.fetchall()
    cur.close()

    total = len(releases)
    print(f"  Releases with discogs_id but no label: {total}")

    if total == 0:
        return {"processed": 0, "found": 0, "skipped": 0, "errors": 0}

    results = load_existing_results()
    session = requests.Session()
    rate_limiter = RateLimiter(max_calls=55, period=60)
    stats = {"processed": 0, "found": 0, "skipped": 0, "errors": 0}

    for release_id, discogs_id, catno, title in releases:
        if _shutdown_requested:
            break

        # Skip already processed
        if release_id in results:
            stats["processed"] += 1
            continue

        try:
            rate_limiter.wait()
            resp = session.get(
                f"{DISCOGS_BASE}/releases/{discogs_id}",
                headers=DISCOGS_HEADERS,
                timeout=15,
            )

            if resp.status_code == 429:
                print(f"\n  [429] Rate limited. Waiting 60s...")
                time.sleep(60)
                rate_limiter.wait()
                resp = session.get(
                    f"{DISCOGS_BASE}/releases/{discogs_id}",
                    headers=DISCOGS_HEADERS,
                    timeout=15,
                )

            if resp.status_code != 200:
                stats["errors"] += 1
                stats["processed"] += 1
                continue

            data = resp.json()
            labels = data.get("labels", [])

            if not labels:
                original = parse_label_from_catno(catno)
                results[release_id] = make_row(
                    release_id, catno, title, discogs_id, original,
                    "", "discogs_release", "NO_LABEL", "SKIP",
                )
                stats["skipped"] += 1
                stats["processed"] += 1
                continue

            discogs_label = labels[0].get("name", "").strip()
            # Remove Discogs suffixes like " (2)"
            discogs_label = re.sub(r'\s*\(\d+\)\s*$', '', discogs_label)

            if (not discogs_label
                    or discogs_label.lower() in NOISE_WORDS
                    or DISCOGS_NOT_ON_LABEL_RE.match(discogs_label)):
                original = parse_label_from_catno(catno)
                results[release_id] = make_row(
                    release_id, catno, title, discogs_id, original,
                    "", "discogs_release", "NOT_ON_LABEL", "SKIP",
                )
                stats["skipped"] += 1
                stats["processed"] += 1
                continue

            original = parse_label_from_catno(catno)
            results[release_id] = make_row(
                release_id, catno, title, discogs_id, original,
                discogs_label, "discogs_release", "CONFIRMED", "WRITE",
            )
            stats["found"] += 1

        except Exception as e:
            stats["errors"] += 1
            if stats["errors"] <= 5:
                print(f"  ERROR on {release_id}: {e}")

        stats["processed"] += 1
        if stats["processed"] % 100 == 0:
            print(f"  [{stats['processed']}/{total}] found: {stats['found']}, "
                  f"skipped: {stats['skipped']}, errors: {stats['errors']}")
            save_results(results)

    session.close()
    save_results(results)

    print(f"\n  Phase 1 Results:")
    print(f"    Processed: {stats['processed']}")
    print(f"    Found:     {stats['found']}")
    print(f"    Skipped:   {stats['skipped']}")
    print(f"    Errors:    {stats['errors']}")
    return stats


# ---------------------------------------------------------------------------
# Phase 2: Discogs Label Search
# ---------------------------------------------------------------------------

def phase2_discogs_search(pg_conn, limit: int | None) -> dict:
    """Search Discogs for parsed label names via /database/search?type=label."""
    print("\n" + "=" * 70)
    print("PHASE 2: Discogs Label Search — Validate Parsed Names")
    print("=" * 70)

    cur = pg_conn.cursor()
    query = """
        SELECT id, "catalogNumber", title
        FROM "Release"
        WHERE "labelId" IS NULL
          AND "catalogNumber" IS NOT NULL
          AND "catalogNumber" != ''
          AND product_category = 'release'
          AND label_enriched = FALSE
          AND discogs_id IS NULL
        ORDER BY id
    """
    if limit:
        query += f" LIMIT {limit}"
    cur.execute(query)
    releases = cur.fetchall()
    cur.close()

    total = len(releases)
    print(f"  Releases without discogs_id, with catalogNumber: {total}")

    if total == 0:
        return {"processed": 0, "confirmed": 0, "likely": 0, "unmatched": 0, "unparseable": 0, "errors": 0}

    results = load_existing_results()
    session = requests.Session()
    rate_limiter = RateLimiter(max_calls=55, period=60)
    stats = {"processed": 0, "confirmed": 0, "likely": 0, "unmatched": 0, "unparseable": 0, "errors": 0}

    for release_id, catno, title in releases:
        if _shutdown_requested:
            break

        if release_id in results:
            stats["processed"] += 1
            continue

        parsed_label = parse_label_from_catno(catno)

        if not parsed_label:
            results[release_id] = make_row(
                release_id, catno, title, "", "",
                "", "parse", "UNPARSEABLE", "SKIP",
            )
            stats["unparseable"] += 1
            stats["processed"] += 1
            continue

        try:
            rate_limiter.wait()
            resp = session.get(
                f"{DISCOGS_BASE}/database/search",
                params={"type": "label", "q": parsed_label},
                headers=DISCOGS_HEADERS,
                timeout=15,
            )

            if resp.status_code == 429:
                print(f"\n  [429] Rate limited. Waiting 60s...")
                time.sleep(60)
                rate_limiter.wait()
                resp = session.get(
                    f"{DISCOGS_BASE}/database/search",
                    params={"type": "label", "q": parsed_label},
                    headers=DISCOGS_HEADERS,
                    timeout=15,
                )

            if resp.status_code != 200:
                # Can't search — store parsed version as UNMATCHED for Phase 3
                results[release_id] = make_row(
                    release_id, catno, title, "", parsed_label,
                    parsed_label, "parse", "UNMATCHED", "REVIEW",
                )
                stats["unmatched"] += 1
                stats["processed"] += 1
                stats["errors"] += 1
                continue

            search_results = resp.json().get("results", [])

            if not search_results:
                results[release_id] = make_row(
                    release_id, catno, title, "", parsed_label,
                    parsed_label, "parse", "UNMATCHED", "REVIEW",
                )
                stats["unmatched"] += 1
                stats["processed"] += 1
                continue

            # Find best match by similarity
            best = None
            best_score = 0.0
            for r in search_results[:5]:
                discogs_name = r.get("title", "").strip()
                # Remove Discogs suffix " (2)" etc.
                discogs_name = re.sub(r'\s*\(\d+\)\s*$', '', discogs_name)
                score = similarity(parsed_label, discogs_name)
                if score > best_score:
                    best_score = score
                    best = discogs_name

            if best_score > 0.85:
                results[release_id] = make_row(
                    release_id, catno, title, "", parsed_label,
                    best, "discogs_search", "CONFIRMED", "WRITE",
                )
                stats["confirmed"] += 1
            elif best_score > 0.6:
                results[release_id] = make_row(
                    release_id, catno, title, "", parsed_label,
                    best, "discogs_search", "LIKELY", "REVIEW",
                )
                stats["likely"] += 1
            else:
                results[release_id] = make_row(
                    release_id, catno, title, "", parsed_label,
                    parsed_label, "parse", "UNMATCHED", "REVIEW",
                )
                stats["unmatched"] += 1

        except Exception as e:
            stats["errors"] += 1
            results[release_id] = make_row(
                release_id, catno, title, "", parsed_label,
                parsed_label, "parse", "UNMATCHED", "REVIEW",
            )
            stats["unmatched"] += 1
            if stats["errors"] <= 5:
                print(f"  ERROR on {release_id}: {e}")

        stats["processed"] += 1
        if stats["processed"] % 100 == 0:
            print(f"  [{stats['processed']}/{total}] confirmed: {stats['confirmed']}, "
                  f"likely: {stats['likely']}, unmatched: {stats['unmatched']}")
            save_results(results)

    session.close()
    save_results(results)

    print(f"\n  Phase 2 Results:")
    print(f"    Processed:   {stats['processed']}")
    print(f"    Confirmed:   {stats['confirmed']}")
    print(f"    Likely:      {stats['likely']}")
    print(f"    Unmatched:   {stats['unmatched']}")
    print(f"    Unparseable: {stats['unparseable']}")
    print(f"    Errors:      {stats['errors']}")
    return stats


# ---------------------------------------------------------------------------
# Phase 3: AI Cleanup (Claude Haiku)
# ---------------------------------------------------------------------------

def phase3_ai_cleanup(limit: int | None) -> dict:
    """Use Claude Haiku to clean up UNMATCHED labels from Phase 2."""
    print("\n" + "=" * 70)
    print("PHASE 3: AI Cleanup — Claude Haiku Label Extraction")
    print("=" * 70)

    results = load_existing_results()

    # Collect UNMATCHED/REVIEW entries that need AI cleanup
    to_clean = []
    for rid, row in results.items():
        if row["Confidence"] == "UNMATCHED" and row["Action"] == "REVIEW":
            if row["CatalogNumber"]:
                to_clean.append((rid, row["CatalogNumber"], row["Title"]))

    total = len(to_clean)
    if limit:
        to_clean = to_clean[:limit]
        total = len(to_clean)

    print(f"  UNMATCHED labels to clean: {total}")

    if total == 0:
        return {"processed": 0, "cleaned": 0, "skipped": 0, "errors": 0}

    client = get_anthropic_client()
    stats = {"processed": 0, "cleaned": 0, "skipped": 0, "errors": 0}

    # Process in batches of 50
    batch_size = 50
    for batch_start in range(0, len(to_clean), batch_size):
        if _shutdown_requested:
            break

        batch = to_clean[batch_start:batch_start + batch_size]
        input_lines = "\n".join(
            f"{rid} | {catno}" for rid, catno, _ in batch
        )

        try:
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=4096,
                messages=[{
                    "role": "user",
                    "content": f"""You are a music industry expert. Extract ONLY the record label name from each catalog number string below.

Rules:
- Remove catalog number codes (letter-number combinations like "HOT 1019", "EMY 107", "K 64026")
- Remove trailing "none", "?–", "self released", number suffixes
- If the string contains multiple labels separated by commas, take only the FIRST label
- If the string is semicolon-separated, take only the part BEFORE the semicolon
- If it's clearly NOT a label name (just numbers, "self released", a person's name, "Live 1987"), return "SKIP"
- Return the clean label name with proper capitalization

Format: one line per entry, ID | CleanedLabel (or SKIP)

{input_lines}"""
                }],
            )

            response_text = response.content[0].text.strip()

            # Parse response
            for line in response_text.split("\n"):
                line = line.strip()
                if not line or "|" not in line:
                    continue

                parts = line.split("|", 1)
                if len(parts) != 2:
                    continue

                rid = parts[0].strip()
                cleaned = parts[1].strip()

                if rid not in results:
                    continue

                if cleaned.upper() == "SKIP" or not cleaned or len(cleaned) < 2:
                    results[rid]["Validated Label"] = ""
                    results[rid]["Source"] = "ai_cleanup"
                    results[rid]["Confidence"] = "SKIP"
                    results[rid]["Action"] = "SKIP"
                    stats["skipped"] += 1
                else:
                    results[rid]["Validated Label"] = cleaned
                    results[rid]["Source"] = "ai_cleanup"
                    results[rid]["Confidence"] = "AI_CLEANED"
                    results[rid]["Action"] = "REVIEW"
                    stats["cleaned"] += 1

                stats["processed"] += 1

        except Exception as e:
            stats["errors"] += 1
            print(f"  ERROR on batch starting at {batch_start}: {e}")

        processed_so_far = batch_start + len(batch)
        print(f"  [{processed_so_far}/{total}] cleaned: {stats['cleaned']}, "
              f"skipped: {stats['skipped']}, errors: {stats['errors']}")

    save_results(results)

    print(f"\n  Phase 3 Results:")
    print(f"    Processed: {stats['processed']}")
    print(f"    Cleaned:   {stats['cleaned']}")
    print(f"    Skipped:   {stats['skipped']}")
    print(f"    Errors:    {stats['errors']}")
    return stats


# ---------------------------------------------------------------------------
# Commit mode
# ---------------------------------------------------------------------------

def commit_from_csv(csv_path: str):
    """Read reviewed CSV and write approved labels to database."""
    print("\n" + "=" * 70)
    print("COMMIT MODE — Applying Reviewed Labels to Database")
    print("=" * 70)

    csv_file = Path(csv_path)
    if not csv_file.exists():
        print(f"  ERROR: File not found: {csv_path}")
        sys.exit(1)

    # Read CSV
    rows_to_write = []
    total_rows = 0
    with open(csv_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            total_rows += 1
            if row["Action"] == "WRITE" and row["Validated Label"]:
                rows_to_write.append(row)

    print(f"  Total rows: {total_rows}")
    print(f"  Rows to write (Action=WRITE): {len(rows_to_write)}")
    print(f"  Rows skipped/review: {total_rows - len(rows_to_write)}")

    if not rows_to_write:
        print("  Nothing to commit.")
        return

    pg_conn = get_pg_connection()
    label_cache = load_existing_labels(pg_conn)
    print(f"  Loaded {len(label_cache)} existing labels")

    stats = {"written": 0, "new_labels": 0, "errors": 0}

    for row in rows_to_write:
        if _shutdown_requested:
            break

        try:
            label_name = row["Validated Label"]
            release_id = row["Release ID"]

            label_id, is_new = find_or_create_label(pg_conn, label_name, label_cache, dry_run=False)
            update_release_label(pg_conn, release_id, label_id, dry_run=False)

            stats["written"] += 1
            if is_new:
                stats["new_labels"] += 1

        except Exception as e:
            pg_conn.rollback()
            stats["errors"] += 1
            if stats["errors"] <= 5:
                print(f"  ERROR on {row['Release ID']}: {e}")

        if stats["written"] % 500 == 0:
            print(f"  [{stats['written']}/{len(rows_to_write)}] "
                  f"new labels: {stats['new_labels']}, errors: {stats['errors']}")

    # Log to sync_log
    if stats["written"] > 0:
        log_sync(pg_conn, None, "label_enrichment", {
            "committed": stats["written"],
            "new_labels": stats["new_labels"],
            "errors": stats["errors"],
            "source_file": str(csv_path),
        })

    pg_conn.close()

    print(f"\n  Commit Results:")
    print(f"    Written:     {stats['written']}")
    print(f"    New labels:  {stats['new_labels']}")
    print(f"    Errors:      {stats['errors']}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Validate labels from catalog numbers")
    parser.add_argument("--phase", type=int, default=None, choices=[1, 2, 3],
                        help="Run only phase 1/2/3. Default: all phases")
    parser.add_argument("--limit", type=int, default=None,
                        help="Limit number of releases per phase")
    parser.add_argument("--commit", type=str, default=None, metavar="CSV_FILE",
                        help="Commit reviewed CSV to database")
    args = parser.parse_args()

    # Commit mode
    if args.commit:
        commit_from_csv(args.commit)
        return

    start_time = time.time()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print("=" * 70)
    print("LABEL VALIDATION — 3-Phase Discogs + AI Pipeline")
    print(f"Started: {now}")
    if args.limit:
        print(f"Limit: {args.limit} releases per phase")
    print(f"Output: {REVIEW_FILE}")
    print("=" * 70)

    pg_conn = get_pg_connection()
    print("  Connected to Supabase PostgreSQL")

    try:
        p1_stats = None
        p2_stats = None
        p3_stats = None

        if args.phase is None or args.phase == 1:
            p1_stats = phase1_discogs_release(pg_conn, args.limit)

        if args.phase is None or args.phase == 2:
            p2_stats = phase2_discogs_search(pg_conn, args.limit)

        pg_conn.close()

        if args.phase is None or args.phase == 3:
            p3_stats = phase3_ai_cleanup(args.limit)

        # Summary
        elapsed = time.time() - start_time
        results = load_existing_results()

        # Count by action
        action_counts = {}
        confidence_counts = {}
        source_counts = {}
        for row in results.values():
            action_counts[row["Action"]] = action_counts.get(row["Action"], 0) + 1
            confidence_counts[row["Confidence"]] = confidence_counts.get(row["Confidence"], 0) + 1
            source_counts[row["Source"]] = source_counts.get(row["Source"], 0) + 1

        print(f"\n{'=' * 70}")
        print("VALIDATION SUMMARY")
        print(f"{'=' * 70}")
        print(f"  Total results: {len(results)}")
        print(f"\n  By Action:")
        for action, count in sorted(action_counts.items()):
            print(f"    {action}: {count}")
        print(f"\n  By Source:")
        for source, count in sorted(source_counts.items()):
            print(f"    {source}: {count}")
        print(f"\n  By Confidence:")
        for conf, count in sorted(confidence_counts.items()):
            print(f"    {conf}: {count}")
        print(f"\n  Duration: {elapsed:.1f}s ({elapsed / 60:.1f} min)")
        print(f"  Review file: {REVIEW_FILE}")
        print(f"\n  Next step: Review the CSV, then run:")
        print(f"    python3 validate_labels.py --commit {REVIEW_FILE}")
        print(f"{'=' * 70}")

    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        raise


if __name__ == "__main__":
    main()
