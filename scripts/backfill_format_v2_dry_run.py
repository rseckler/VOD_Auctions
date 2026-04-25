#!/usr/bin/env python3
"""
Dry-run for format-v2 migration. Reports counts WITHOUT writing to DB.

Output:
  1. Counts pre/post per format value
  2. Discogs-only items grouped by classification reason
  3. Items that fall through to "Other" (manual review needed)
  4. CSV export of all classification decisions for Frank-Review

Usage:
  cd scripts
  source venv/bin/activate
  python3 backfill_format_v2_dry_run.py [--out report.csv]

Requires SUPABASE_DB_URL in scripts/.env
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))
from format_mapping import (
    classify_discogs_format,
    classify_tape_mag_format,
    is_valid_format,
)

load_dotenv(Path(__file__).parent / ".env")
load_dotenv(Path(__file__).parent.parent / ".env")  # fallback to project root .env


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="format_v2_dry_run_report.csv",
                    help="CSV export of all classification decisions")
    ap.add_argument("--limit", type=int, default=0,
                    help="Limit Releases to process (0 = all)")
    args = ap.parse_args()

    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("ERROR: SUPABASE_DB_URL not set", file=sys.stderr)
        sys.exit(1)

    conn = psycopg2.connect(db_url)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    print("=" * 70)
    print("FORMAT-V2 BACKFILL DRY-RUN")
    print("=" * 70)

    # ────────────────────────────────────────────────────────────────────
    # Phase B — Tape-mag-Pfad (deterministisch via format_id)
    # ────────────────────────────────────────────────────────────────────
    print("\nPhase B: Tape-mag (format_id → format-v2)")
    print("-" * 70)
    cur.execute("""
        SELECT r.id, r.format::text AS old_format, r.format_id, f.name AS legacy_name,
               r.discogs_id, r.legacy_format_detail
        FROM "Release" r
        LEFT JOIN "Format" f ON f.id = r.format_id
        WHERE r.format_id IS NOT NULL
        ORDER BY r.format_id, r.id
        {}
    """.format(f"LIMIT {args.limit}" if args.limit else ""))
    tm_rows = cur.fetchall()
    print(f"  Releases with format_id: {len(tm_rows)}")

    phase_b_results = []
    for row in tm_rows:
        new_format = classify_tape_mag_format(row["format_id"])
        phase_b_results.append({
            "id": row["id"],
            "source": "tape-mag",
            "old_format": row["old_format"],
            "format_id": row["format_id"],
            "legacy_name": row["legacy_name"],
            "new_format": new_format,
            "descriptors": [],
            "reason": f"format_id={row['format_id']}",
        })

    # ────────────────────────────────────────────────────────────────────
    # Phase A — Discogs-only-Pfad (rekonstruieren via discogs_api_cache)
    # ────────────────────────────────────────────────────────────────────
    print("\nPhase A: Discogs-only (discogs_api_cache.api_data.formats → format-v2)")
    print("-" * 70)
    cur.execute("""
        SELECT r.id, r.format::text AS old_format, r.discogs_id, c.api_data,
               r.legacy_format_detail
        FROM "Release" r
        LEFT JOIN discogs_api_cache c ON c.discogs_id = r.discogs_id
        WHERE r.format_id IS NULL
          AND r.discogs_id IS NOT NULL
        ORDER BY r.id
        {}
    """.format(f"LIMIT {args.limit}" if args.limit else ""))
    dc_rows = cur.fetchall()
    print(f"  Discogs-only Releases: {len(dc_rows)}")

    phase_a_results = []
    cache_misses = 0
    for row in dc_rows:
        api_data = row["api_data"]
        if not api_data or "formats" not in api_data:
            cache_misses += 1
            phase_a_results.append({
                "id": row["id"],
                "source": "discogs-cache-miss",
                "old_format": row["old_format"],
                "format_id": None,
                "legacy_name": None,
                "new_format": "Other",
                "descriptors": [],
                "reason": "no api_data or no formats key",
            })
            continue

        result = classify_discogs_format(api_data["formats"])
        phase_a_results.append({
            "id": row["id"],
            "source": "discogs",
            "old_format": row["old_format"],
            "format_id": None,
            "legacy_name": None,
            "new_format": result["format"],
            "descriptors": result["descriptors"],
            "reason": result["reason"],
        })

    print(f"  Cache misses: {cache_misses}")

    # ────────────────────────────────────────────────────────────────────
    # Phase C — Orphans (no format_id AND no discogs_id)
    # ────────────────────────────────────────────────────────────────────
    cur.execute("""
        SELECT id, format::text AS old_format, legacy_format_detail
        FROM "Release"
        WHERE format_id IS NULL AND discogs_id IS NULL
    """)
    orphans = cur.fetchall()
    print(f"\nPhase C: Orphans (no source): {len(orphans)}")
    phase_c_results = [{
        "id": r["id"], "source": "orphan",
        "old_format": r["old_format"], "format_id": None, "legacy_name": None,
        "new_format": "Other", "descriptors": [],
        "reason": "no format_id and no discogs_id",
    } for r in orphans]

    all_results = phase_b_results + phase_a_results + phase_c_results

    # ────────────────────────────────────────────────────────────────────
    # Aggregations
    # ────────────────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("AGGREGATIONS")
    print("=" * 70)

    new_format_counts = Counter(r["new_format"] for r in all_results)
    print("\nCounts per NEW format value (sorted by count desc):")
    print(f"  {'Format':<25} {'Count':>8}  {'Source-Mix'}")
    print(f"  {'-' * 25} {'-' * 8}  {'-' * 30}")
    for fmt, cnt in new_format_counts.most_common():
        # source mix
        sources = Counter(r["source"] for r in all_results if r["new_format"] == fmt)
        mix = ", ".join(f"{s}={c}" for s, c in sources.most_common())
        marker = "" if is_valid_format(fmt) else "  ⚠ NOT IN WHITELIST"
        print(f"  {fmt:<25} {cnt:>8}  {mix}{marker}")

    print("\nCounts per OLD format (enum) value:")
    old_format_counts = Counter(r["old_format"] or "(null)" for r in all_results)
    for fmt, cnt in old_format_counts.most_common():
        print(f"  {fmt:<25} {cnt:>8}")

    # Source-Mix
    print("\nSource breakdown:")
    src_counts = Counter(r["source"] for r in all_results)
    for src, cnt in src_counts.most_common():
        print(f"  {src:<25} {cnt:>8}")

    # Items going to "Other" — manual review
    others = [r for r in all_results if r["new_format"] == "Other"]
    print(f"\nItems classified as 'Other' (manual review): {len(others)}")
    other_reasons = Counter(r["reason"] for r in others)
    for reason, cnt in other_reasons.most_common(20):
        print(f"  {cnt:>5}  {reason}")

    # Format changes (old → new, sample)
    print("\nFormat changes (top 25 transitions):")
    transitions = Counter((r["old_format"] or "null", r["new_format"]) for r in all_results)
    for (old, new), cnt in transitions.most_common(25):
        print(f"  {cnt:>6}  {old:<15} → {new}")

    # ────────────────────────────────────────────────────────────────────
    # CSV-Export für Frank-Review
    # ────────────────────────────────────────────────────────────────────
    out_path = Path(args.out)
    print(f"\nWriting CSV report: {out_path.absolute()}")
    with open(out_path, "w", newline="", encoding="utf-8") as fp:
        writer = csv.writer(fp, delimiter=";", quoting=csv.QUOTE_MINIMAL)
        writer.writerow([
            "release_id", "source", "old_format", "format_id", "legacy_name",
            "new_format", "descriptors", "reason",
        ])
        for r in all_results:
            writer.writerow([
                r["id"], r["source"], r["old_format"] or "",
                r["format_id"] or "", r["legacy_name"] or "",
                r["new_format"],
                "|".join(r["descriptors"]),
                r["reason"],
            ])
    print(f"  {len(all_results)} rows written")

    # Per-format-summary CSV
    summary_path = out_path.with_name(out_path.stem + "_summary.csv")
    print(f"Writing summary CSV: {summary_path.absolute()}")
    with open(summary_path, "w", newline="", encoding="utf-8") as fp:
        writer = csv.writer(fp, delimiter=";", quoting=csv.QUOTE_MINIMAL)
        writer.writerow(["new_format", "count", "valid_in_whitelist", "tape_mag", "discogs", "orphan"])
        for fmt, cnt in sorted(new_format_counts.items(), key=lambda x: -x[1]):
            sources = Counter(r["source"] for r in all_results if r["new_format"] == fmt)
            writer.writerow([
                fmt, cnt, "yes" if is_valid_format(fmt) else "NO",
                sources.get("tape-mag", 0),
                sources.get("discogs", 0) + sources.get("discogs-cache-miss", 0),
                sources.get("orphan", 0),
            ])

    print("\n✓ Dry-run complete. NO database writes performed.")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
