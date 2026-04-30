#!/usr/bin/env python3
"""
Find Track-Rows die wahrscheinlich aus einem suboptimalen Migration-Lauf
stammen (rc52.6.2 — vor Parser-Verbesserung 77df637).

Heuristiken pro Track:
  • duration_in_title    — title matched ^:?\\d{1,2}:\\d{2}$  → war eigentlich
                            die Duration eines anderen Tracks, nicht ein Track
  • position_only_title  — title matched ^[A-Z]?\\d+[a-z]?$   → war ein
                            Position-Marker, nicht ein Track-Title
  • very_short_title     — title len <= 2 chars                → wahrsch. Müll
  • mixed_pos_format     — Release hat sowohl A1/B2-Style als auch reine
                            Zahlen als Track-Positions (legacy 11011-Stil)

Ausgabe pro Release: Anzahl verdächtige Tracks + Issue-Types + Admin-URL.
Output: CSV nach stdout, sortiert nach issue_count desc.

Usage:
  python3 find_suspicious_tracks.py
  python3 find_suspicious_tracks.py --min-issues 2
  python3 find_suspicious_tracks.py > /tmp/suspicious.csv
"""

import argparse
import csv
import os
import re
import sys

from shared import _ensure_psycopg2

DB_URL = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
if not DB_URL:
    print("ERROR: SUPABASE_DB_URL/DATABASE_URL not set", file=sys.stderr)
    sys.exit(1)

POSITION_RE = re.compile(r"^[A-Z]?\d+[a-z]?$")
DURATION_RE = re.compile(r"^\d{0,2}:\d{2}(?::\d{2})?$")
ALPHA_POS_RE = re.compile(r"^[A-Z]\d+[a-z]?$")
NUMERIC_POS_RE = re.compile(r"^\d+$")


def classify_track(position: str, title: str) -> list[str]:
    """Returns list of issue tags."""
    issues = []
    t = (title or "").strip()
    if DURATION_RE.match(t):
        issues.append("duration_in_title")
    if POSITION_RE.match(t):
        issues.append("position_only_title")
    if 0 < len(t) <= 2 and not POSITION_RE.match(t):
        issues.append("very_short_title")
    return issues


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-issues", type=int, default=1, help="Nur Releases mit >=N verdächtigen Tracks anzeigen")
    parser.add_argument("--limit", type=int, default=0, help="Max N Releases ausgeben (0=alle)")
    args = parser.parse_args()

    pg = _ensure_psycopg2()
    conn = pg.connect(DB_URL)
    cur = conn.cursor()

    # Alle Tracks von legacy-Releases laden
    cur.execute('''
        SELECT t."releaseId", t.id, t.position, t.title, t.duration,
               r.title AS release_title, a.name AS artist
        FROM "Track" t
        JOIN "Release" r ON r.id = t."releaseId"
        LEFT JOIN "Artist" a ON a.id = r."artistId"
        WHERE t."releaseId" LIKE 'legacy-release-%'
        ORDER BY t."releaseId", t.position
    ''')

    by_release: dict[str, dict] = {}
    for rid, tid, pos, title, duration, rtitle, artist in cur.fetchall():
        info = by_release.setdefault(rid, {
            "release_title": rtitle,
            "artist": artist,
            "tracks": 0,
            "issues": [],
            "positions": set(),
        })
        info["tracks"] += 1
        info["positions"].add(pos or "")
        for tag in classify_track(pos or "", title or ""):
            info["issues"].append((tid, pos, title, tag))

    # Mixed-Pos-Format-Heuristik: Release hat sowohl A1/B2 als auch reine Zahlen
    for rid, info in by_release.items():
        positions = info["positions"]
        has_alpha = any(ALPHA_POS_RE.match(p) for p in positions if p)
        has_numeric = any(NUMERIC_POS_RE.match(p) for p in positions if p)
        if has_alpha and has_numeric:
            info["issues"].append((None, None, None, "mixed_pos_format"))

    rows = []
    for rid, info in by_release.items():
        issue_count = len(info["issues"])
        if issue_count < args.min_issues:
            continue
        issue_types = sorted(set(tag for _, _, _, tag in info["issues"]))
        rows.append({
            "release_id": rid,
            "artist": info["artist"] or "",
            "release_title": info["release_title"] or "",
            "track_count": info["tracks"],
            "issue_count": issue_count,
            "issue_types": "|".join(issue_types),
            "admin_url": f"https://admin.vod-auctions.com/app/media/{rid}",
        })

    rows.sort(key=lambda r: (-r["issue_count"], r["release_id"]))
    if args.limit > 0:
        rows = rows[: args.limit]

    print(f"# Suspicious tracks: {len(rows)} releases ({sum(r['issue_count'] for r in rows)} issues total)", file=sys.stderr)

    writer = csv.DictWriter(sys.stdout, fieldnames=["release_id", "artist", "release_title", "track_count", "issue_count", "issue_types", "admin_url"])
    writer.writeheader()
    for r in rows:
        writer.writerow(r)

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
