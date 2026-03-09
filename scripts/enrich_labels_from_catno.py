#!/usr/bin/env python3
"""
Enrich labels for releases that have no label but DO have a catalogNumber.

Two-phase approach:
  Phase 1 (Discogs): For releases with discogs_id — fetch label from Discogs API
  Phase 2 (Parse):   For remaining — parse label name from catalogNumber,
                     match against existing Label table or create new labels

Sets label_enriched = TRUE on updated releases so that legacy_sync.py will
NOT overwrite the labelId during nightly sync.

Usage:
    cd VOD_Auctions/scripts
    python3 enrich_labels_from_catno.py                  # Both phases
    python3 enrich_labels_from_catno.py --phase 1        # Discogs only
    python3 enrich_labels_from_catno.py --phase 2        # Parse only
    python3 enrich_labels_from_catno.py --dry-run        # Preview without writing
    python3 enrich_labels_from_catno.py --limit 100      # Process only N releases

Requires .env in parent directory with SUPABASE_DB_URL.
"""

import argparse
import json
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

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BATCH_SIZE = 500
SAVE_INTERVAL = 50

DATA_DIR = Path(__file__).parent.parent / "data"
PROGRESS_FILE = DATA_DIR / "label_enrich_progress.json"

# Words that are NOT label names (noise in catalog numbers)
NOISE_WORDS = {
    "none", "n/a", "no label", "self-released", "self released",
    "private", "private press", "not on label", "white label",
    "promo", "promotional", "test pressing",
}

# Discogs "Not On Label" pattern: "Not On Label (Artist Self-released)"
DISCOGS_NOT_ON_LABEL_RE = re.compile(r'^Not On Label', re.IGNORECASE)

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
# Label name parsing from catalog number
# ---------------------------------------------------------------------------

def parse_label_from_catno(catno: str) -> str | None:
    """
    Extract label name from a catalog number string.

    Examples:
        "Mercury 868 759-1"               → "Mercury"
        "Enemy Records EMY 107"            → "Enemy Records"
        "Reprise Records, K 64026"         → "Reprise Records"
        "Harvest 1C 062-29 647, HÖR ZU…"  → "Harvest"
        "Clearspot CS043"                  → "Clearspot"
        "!K7 Records K7R016LP"             → "!K7 Records"
        "Bärenreiter-Musicaphon – BM 30…"  → "Bärenreiter-Musicaphon"
    """
    if not catno or not catno.strip():
        return None

    catno = catno.strip()

    # Handle multiple labels (comma-separated entries with same catno pattern)
    # e.g. "Harvest 1C 062-29 647, HÖR ZU 1C 062-29 647"
    # Take the first entry
    parts = catno.split(",")
    first_entry = parts[0].strip()

    # Try comma-separated "Label, CatNo" format
    # e.g. "Reprise Records, K 64026" — but only if second part looks like a catno
    if len(parts) >= 2:
        potential_label = parts[0].strip()
        potential_catno = parts[1].strip()
        # If second part starts with uppercase letters + digits → it's a catno
        if re.match(r'^[A-Z]{1,6}\s*[\d-]', potential_catno) or re.match(r'^\d', potential_catno):
            label = _clean_label_name(potential_label)
            if label:
                return label

    # Try "Label CatNo" format (most common)
    label = _extract_label_before_catno(first_entry)
    if label:
        return label

    # Try semicolon separator: "Label; catno"
    if ";" in first_entry:
        label = _clean_label_name(first_entry.split(";")[0].strip())
        if label:
            return label

    # Try dash/en-dash separator: "Label – CatNo"
    for sep in [" – ", " — ", " - "]:
        if sep in first_entry:
            label = _clean_label_name(first_entry.split(sep)[0].strip())
            if label:
                return label

    # Last resort: if the whole thing looks like just a label name (no numbers)
    if not re.search(r'\d', first_entry):
        label = _clean_label_name(first_entry)
        if label:
            return label

    return None


def _extract_label_before_catno(text: str) -> str | None:
    """
    Extract the label name portion before the catalog number.

    The catalog number typically starts with:
    - Uppercase abbreviation + digits: "EMY 107", "CAT 010", "K7R016LP"
    - Just digits: "868 759-1", "6332 033"
    - Mixed: "1C 062-29 647", "21 20905-9"

    We look for the transition from "words" to "catalog number pattern".
    """
    # Pattern: find where catalog number part starts
    # Catalog numbers typically start with: uppercase 1-6 letter code followed by digits,
    # or just digits, or digit-letter combos
    #
    # We scan word by word and find the first "catno-like" token
    tokens = text.split()
    if not tokens:
        return None

    label_tokens = []
    for i, token in enumerate(tokens):
        clean = token.strip(",;:.")

        # Is this token the start of a catalog number?
        if _is_catno_token(clean, i, tokens):
            break

        label_tokens.append(token)

    if not label_tokens:
        return None

    label = " ".join(label_tokens)
    return _clean_label_name(label)


def _is_catno_token(token: str, pos: int, all_tokens: list) -> bool:
    """Check if a token looks like the start of a catalog number."""
    if not token:
        return False

    clean = token.strip(",;:.()[]")
    if not clean:
        return False

    # Pure number (possibly with dashes): "868", "6332", "384"
    if re.match(r'^\d[\d\s/-]*$', clean):
        # But only if we already have some label tokens
        return pos > 0

    # Short uppercase code + digits: "EMY107", "CS043", "K7R016LP"
    if re.match(r'^[A-Z]{1,4}\d{2,}', clean):
        return True

    # Uppercase code followed by space + digits in next token
    if re.match(r'^[A-Z]{1,6}$', clean) and pos + 1 < len(all_tokens):
        next_clean = all_tokens[pos + 1].strip(",;:.")
        if re.match(r'^\d', next_clean):
            # But not if this looks like "Records" or common label words
            if clean.upper() not in _LABEL_WORDS_UPPER:
                return True

    # Starts with digit: "1C", "12", "01"
    if re.match(r'^\d', clean) and pos > 0:
        return True

    return False


# Common words that appear in label names and should NOT be treated as catno prefixes
_LABEL_WORDS_UPPER = {
    "A", "AN", "AND", "AT", "BY", "DE", "DER", "DES", "DIE", "DU",
    "EL", "EN", "ET", "FOR", "IN", "LA", "LE", "LES", "OF", "ON",
    "OR", "THE", "TO", "UND", "VON", "ZU",
    "INC", "LTD", "LLC", "CO", "AG", "SA",
    "MUSIC", "RECORDS", "RECORDINGS", "RECORD", "PRODUCTION", "PRODUCTIONS",
    "LABEL", "LABELS", "SOUND", "SOUNDS", "AUDIO", "MEDIA", "DISC", "DISCS",
    "TAPE", "TAPES", "CASSETTE", "CASSETTES", "VINYL",
    "EDITION", "EDITIONS", "PRESS", "PUBLISHING",
}


def _clean_label_name(name: str) -> str | None:
    """Clean and validate a label name."""
    if not name:
        return None

    # Strip trailing punctuation
    name = name.strip(" ,;:.!?&|/\\()[]{}")

    # Decode HTML entities
    name = decode_entities(name)

    # Normalize whitespace
    name = re.sub(r'\s+', ' ', name).strip()

    # Too short
    if len(name) < 2:
        return None

    # Skip noise
    if name.lower() in NOISE_WORDS:
        return None

    # Skip if it's just numbers
    if re.match(r'^[\d\s.,-]+$', name):
        return None

    return name


# ---------------------------------------------------------------------------
# Label matching / creation
# ---------------------------------------------------------------------------

def load_existing_labels(pg_conn) -> dict:
    """Load all labels into a dict: lowercase_name → (id, name)."""
    cur = pg_conn.cursor()
    cur.execute('SELECT id, name FROM "Label"')
    labels = {}
    for row in cur.fetchall():
        labels[row[1].lower().strip()] = (row[0], row[1])
    cur.close()
    return labels


def find_or_create_label(pg_conn, label_name: str, label_cache: dict, dry_run: bool) -> tuple[str, bool]:
    """
    Find an existing label by name (case-insensitive) or create a new one.
    Returns (label_id, is_new).
    """
    key = label_name.lower().strip()

    # Exact match (case-insensitive)
    if key in label_cache:
        return label_cache[key][0], False

    # Try without common suffixes: "Records", "Recordings", "Music", "Productions"
    for suffix in [" records", " recordings", " music", " productions",
                   " production", " label", " tapes", " media"]:
        if key.endswith(suffix):
            base = key[: -len(suffix)].strip()
            if base in label_cache:
                return label_cache[base][0], False
            # Also try with the suffix on existing labels
            for existing_key in label_cache:
                if existing_key == base or existing_key.startswith(base + " "):
                    return label_cache[existing_key][0], False

    # Try adding common suffixes to match
    for suffix in [" records", " recordings"]:
        extended = key + suffix
        if extended in label_cache:
            return label_cache[extended][0], False

    if dry_run:
        # Return a fake ID for dry run
        fake_id = f"enriched-label-{slugify(label_name)}"
        label_cache[key] = (fake_id, label_name)
        return fake_id, True

    # Create new label
    label_id = f"enriched-label-{slugify(label_name)}"

    # Check if ID already exists (slug collision)
    cur = pg_conn.cursor()
    cur.execute('SELECT id FROM "Label" WHERE id = %s', (label_id,))
    if cur.fetchone():
        # Add a numeric suffix
        for i in range(2, 100):
            candidate = f"{label_id}-{i}"
            cur.execute('SELECT id FROM "Label" WHERE id = %s', (candidate,))
            if not cur.fetchone():
                label_id = candidate
                break

    slug = slugify(label_name) or f"label-{label_id}"
    cur.execute(
        """INSERT INTO "Label" (id, slug, name, "createdAt", "updatedAt")
           VALUES (%s, %s, %s, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING
           RETURNING id""",
        (label_id, slug, label_name),
    )
    result = cur.fetchone()
    pg_conn.commit()
    cur.close()

    if result:
        label_cache[key] = (label_id, label_name)
        return label_id, True

    # If insert failed (unlikely), try to find it
    if key in label_cache:
        return label_cache[key][0], False

    return label_id, True


def update_release_label(pg_conn, release_id: str, label_id: str, dry_run: bool):
    """Set labelId and label_enriched on a release."""
    if dry_run:
        return
    cur = pg_conn.cursor()
    cur.execute(
        """UPDATE "Release"
           SET "labelId" = %s, label_enriched = TRUE, "updatedAt" = NOW()
           WHERE id = %s""",
        (label_id, release_id),
    )
    pg_conn.commit()
    cur.close()


# ---------------------------------------------------------------------------
# Phase 1: Discogs API enrichment
# ---------------------------------------------------------------------------

def phase1_discogs(pg_conn, dry_run: bool, limit: int | None):
    """Fetch label from Discogs API for releases with discogs_id but no label."""
    print("\n" + "=" * 70)
    print("PHASE 1: Discogs API Label Enrichment")
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
        print("  Nothing to process.")
        return {"processed": 0, "updated": 0, "new_labels": 0, "errors": 0}

    label_cache = load_existing_labels(pg_conn)
    print(f"  Loaded {len(label_cache)} existing labels")

    session = requests.Session()
    rate_limiter = RateLimiter(max_calls=55, period=60)

    stats = {"processed": 0, "updated": 0, "new_labels": 0, "errors": 0, "skipped": 0}

    for i, (release_id, discogs_id, catno, title) in enumerate(releases):
        if _shutdown_requested:
            break

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
                stats["skipped"] += 1
                stats["processed"] += 1
                continue

            # Take the first label
            discogs_label_name = labels[0].get("name", "").strip()
            if (not discogs_label_name
                    or discogs_label_name.lower() in NOISE_WORDS
                    or DISCOGS_NOT_ON_LABEL_RE.match(discogs_label_name)):
                stats["skipped"] += 1
                stats["processed"] += 1
                continue

            # Remove trailing suffixes Discogs adds like " (2)"
            discogs_label_name = re.sub(r'\s*\(\d+\)\s*$', '', discogs_label_name)

            label_id, is_new = find_or_create_label(pg_conn, discogs_label_name, label_cache, dry_run)
            update_release_label(pg_conn, release_id, label_id, dry_run)

            stats["updated"] += 1
            if is_new:
                stats["new_labels"] += 1

            if dry_run and stats["updated"] <= 10:
                print(f"  [DRY] {release_id}: '{discogs_label_name}' → {label_id} {'(NEW)' if is_new else ''}")

        except Exception as e:
            stats["errors"] += 1
            if stats["errors"] <= 5:
                print(f"  ERROR on {release_id} (discogs_id={discogs_id}): {e}")

        stats["processed"] += 1
        if stats["processed"] % 100 == 0:
            print(f"  [{stats['processed']}/{total}] updated: {stats['updated']}, "
                  f"new labels: {stats['new_labels']}, errors: {stats['errors']}")

    session.close()

    print(f"\n  Phase 1 Results:")
    print(f"    Processed: {stats['processed']}")
    print(f"    Updated:   {stats['updated']}")
    print(f"    Skipped:   {stats['skipped']}")
    print(f"    New labels: {stats['new_labels']}")
    print(f"    Errors:    {stats['errors']}")

    return stats


# ---------------------------------------------------------------------------
# Phase 2: Parse label from catalog number
# ---------------------------------------------------------------------------

def phase2_parse(pg_conn, dry_run: bool, limit: int | None):
    """Parse label from catalogNumber for releases without label or discogs_id."""
    print("\n" + "=" * 70)
    print("PHASE 2: Parse Label from Catalog Number")
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
        ORDER BY id
    """
    if limit:
        query += f" LIMIT {limit}"
    cur.execute(query)
    releases = cur.fetchall()
    cur.close()

    total = len(releases)
    print(f"  Releases without label, with catalogNumber: {total}")

    if total == 0:
        print("  Nothing to process.")
        return {"processed": 0, "updated": 0, "new_labels": 0, "errors": 0, "unparseable": 0}

    label_cache = load_existing_labels(pg_conn)
    print(f"  Loaded {len(label_cache)} existing labels")

    stats = {"processed": 0, "updated": 0, "new_labels": 0, "errors": 0, "unparseable": 0}

    for release_id, catno, title in releases:
        if _shutdown_requested:
            break

        try:
            label_name = parse_label_from_catno(catno)

            if not label_name:
                stats["unparseable"] += 1
                stats["processed"] += 1
                if dry_run and stats["unparseable"] <= 5:
                    print(f"  [SKIP] {release_id}: cannot parse [{catno}]")
                continue

            label_id, is_new = find_or_create_label(pg_conn, label_name, label_cache, dry_run)
            update_release_label(pg_conn, release_id, label_id, dry_run)

            stats["updated"] += 1
            if is_new:
                stats["new_labels"] += 1

            if dry_run and stats["updated"] <= 20:
                print(f"  [DRY] {release_id}: [{catno}] → '{label_name}' → {label_id} {'(NEW)' if is_new else ''}")

        except Exception as e:
            stats["errors"] += 1
            if stats["errors"] <= 5:
                print(f"  ERROR on {release_id}: {e}")

        stats["processed"] += 1
        if stats["processed"] % 500 == 0:
            print(f"  [{stats['processed']}/{total}] updated: {stats['updated']}, "
                  f"new labels: {stats['new_labels']}, unparseable: {stats['unparseable']}")

    print(f"\n  Phase 2 Results:")
    print(f"    Processed:   {stats['processed']}")
    print(f"    Updated:     {stats['updated']}")
    print(f"    New labels:  {stats['new_labels']}")
    print(f"    Unparseable: {stats['unparseable']}")
    print(f"    Errors:      {stats['errors']}")

    return stats


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Enrich labels from catalog numbers")
    parser.add_argument("--phase", type=int, default=None, choices=[1, 2],
                        help="Run only phase 1 (Discogs) or 2 (parse). Default: both")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview changes without writing to database")
    parser.add_argument("--limit", type=int, default=None,
                        help="Limit number of releases to process per phase")
    args = parser.parse_args()

    start_time = time.time()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print("=" * 70)
    print("LABEL ENRICHMENT FROM CATALOG NUMBERS")
    print(f"Started: {now}")
    if args.dry_run:
        print("*** DRY RUN — no changes will be written ***")
    if args.limit:
        print(f"Limit: {args.limit} releases per phase")
    print("=" * 70)

    pg_conn = get_pg_connection()
    print("  Connected to Supabase PostgreSQL")

    try:
        phase1_stats = None
        phase2_stats = None

        if args.phase is None or args.phase == 1:
            phase1_stats = phase1_discogs(pg_conn, args.dry_run, args.limit)

        if args.phase is None or args.phase == 2:
            phase2_stats = phase2_parse(pg_conn, args.dry_run, args.limit)

        # Summary
        elapsed = time.time() - start_time
        print(f"\n{'=' * 70}")
        print("SUMMARY")
        print(f"{'=' * 70}")

        total_updated = 0
        total_new_labels = 0

        if phase1_stats:
            print(f"  Phase 1 (Discogs): {phase1_stats['updated']} labels set "
                  f"({phase1_stats['new_labels']} new labels created)")
            total_updated += phase1_stats["updated"]
            total_new_labels += phase1_stats["new_labels"]

        if phase2_stats:
            print(f"  Phase 2 (Parse):   {phase2_stats['updated']} labels set "
                  f"({phase2_stats['new_labels']} new labels created, "
                  f"{phase2_stats['unparseable']} unparseable)")
            total_updated += phase2_stats["updated"]
            total_new_labels += phase2_stats["new_labels"]

        print(f"  Total updated:     {total_updated}")
        print(f"  Total new labels:  {total_new_labels}")
        print(f"  Duration:          {elapsed:.1f}s ({elapsed / 60:.1f} min)")
        print(f"{'=' * 70}")

        # Log to sync_log
        if not args.dry_run and total_updated > 0:
            changes = {
                "phase1": phase1_stats if phase1_stats else None,
                "phase2": phase2_stats if phase2_stats else None,
                "total_updated": total_updated,
                "total_new_labels": total_new_labels,
                "duration_seconds": round(elapsed, 1),
            }
            log_sync(pg_conn, None, "label_enrichment", changes)

    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        raise
    finally:
        pg_conn.close()


if __name__ == "__main__":
    main()
