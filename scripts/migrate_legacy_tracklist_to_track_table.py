#!/usr/bin/env python3
"""
Migration: Release.tracklist (JSONB Array) → Track-Tabellen-Rows (rc52.6.2).

Hintergrund:
  20.133 Tape-Mag-Releases haben ihre Tracklist als JSONB-Array in
  Release.tracklist statt in der Track-Tabelle. Frank kann diese im Admin
  nicht editieren, weil die Track-Management-UI auf Track-Rows basiert.
  Nach der Migration ist Track die canonical Source und die Storefront-
  Render-Logik (effectiveTracklist) greift auf release.tracks statt auf
  release.tracklist.

Zwei beobachtete Strukturen:
  Pattern 1 (sauber, ~ Mehrheit):
    [{"title": "Track Name", "position": "A1"}, ...]
    → Direkt 1:1 in Track-Rows mappen.

  Pattern 2 (3-Item-Burst, ~Discogs-Scrape-Artefakt):
    [
      {"title": "A1", "position": ""},          # Position-Marker
      {"title": "–Artist Name", "position": ""}, # optional Artist (— prefix)
      {"title": "Track Name", "position": ""},   # echter Title
      {"title": "3:45", "position": ""},         # optional Duration (MM:SS)
      ...
    ]
    → Heuristisch parsen: Position-Marker ("A1"/"B2"/"1"/"12") detektieren,
      dann bis zum nächsten Position-Marker konsumieren. Artist-Items mit
      "–"-Prefix → optional als Subtitle prefixen oder skip.

Idempotent: skip wenn Track-Rows für den Release schon existieren.
Nach erfolgreicher Migration wird Release.tracklist auf NULL gesetzt,
damit der Storefront-Fallback (effectiveTracklist parser) nicht mehr
greift — Track ist alleinige Quelle.

Usage:
  python3 migrate_legacy_tracklist_to_track_table.py --dry-run
  python3 migrate_legacy_tracklist_to_track_table.py --dry-run --limit 20
  python3 migrate_legacy_tracklist_to_track_table.py --commit
"""

import argparse
import os
import re
import secrets
import sys

from shared import _ensure_psycopg2

DB_URL = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
if not DB_URL:
    print("ERROR: SUPABASE_DB_URL/DATABASE_URL not set", file=sys.stderr)
    sys.exit(1)


# Position-Marker für Pattern-2-Detect: A1/B2/.. oder reine Zahlen
POSITION_RE = re.compile(r"^[A-Z]?\d+[a-z]?$")
# Duration MM:SS oder M:SS oder H:MM:SS
DURATION_RE = re.compile(r"^\d{1,2}:\d{2}(?::\d{2})?$")


def gen_id(prefix: str = "track") -> str:
    """Mirror generateEntityId() pattern from Medusa: prefix + 26 random chars (ulid-ish)."""
    return f"{prefix}_01{secrets.token_hex(13).upper()}"


def is_position_marker(s: str) -> bool:
    s = (s or "").strip()
    return bool(POSITION_RE.match(s))


def is_duration(s: str) -> bool:
    s = (s or "").strip()
    return bool(DURATION_RE.match(s))


def detect_pattern(items: list[dict]) -> str:
    """
    Pattern 1: alle items haben non-empty position UND title.
    Pattern 2: alle (oder fast alle) position sind leer; titles enthalten
               Position-Marker als eigenes Item.
    """
    if not items:
        return "empty"
    non_empty_pos = sum(1 for i in items if (i.get("position") or "").strip())
    has_pos_markers = any(is_position_marker(i.get("title") or "") for i in items)
    if non_empty_pos >= len(items) * 0.5:
        return "pattern1"
    if has_pos_markers and non_empty_pos == 0:
        return "pattern2"
    if non_empty_pos == 0 and not has_pos_markers:
        # Nur Titles, keine Positions — wir nummerieren durch
        return "pattern1_unpositioned"
    return "mixed"


def parse_pattern1(items: list[dict]) -> list[dict]:
    """Saubere Items: title + position direkt nutzen."""
    out = []
    for idx, item in enumerate(items, start=1):
        title = (item.get("title") or "").strip()
        if not title:
            continue
        pos = (item.get("position") or "").strip() or str(idx)
        out.append({"position": pos, "title": title, "duration": None})
    return out


def parse_pattern2(items: list[dict]) -> list[dict]:
    """
    3-Item-Burst Heuristik:
      [pos-marker, optional artist (–prefix), title, optional duration]
    Bursts werden durch nächste Position-Marker oder End-of-list begrenzt.
    """
    out = []
    titles = [(i.get("title") or "").strip() for i in items]
    i = 0
    n = len(titles)
    while i < n:
        # 1) Position-Marker
        if not is_position_marker(titles[i]):
            i += 1
            continue
        pos = titles[i]
        i += 1
        # 2) optional Artist (– prefix)
        artist = None
        if i < n and titles[i].startswith("–"):
            artist = titles[i].lstrip("–").strip()
            i += 1
        # 3) Title — alles bis zum nächsten Position-Marker oder Duration
        title_parts: list[str] = []
        duration: str | None = None
        while i < n and not is_position_marker(titles[i]):
            t = titles[i]
            if is_duration(t):
                duration = t
                i += 1
                break
            title_parts.append(t)
            i += 1
        title = " · ".join(title_parts).strip()
        if not title and artist:
            title = artist
            artist = None
        if not title:
            # leere Burst überspringen
            continue
        full_title = f"{artist} – {title}" if artist else title
        out.append({"position": pos, "title": full_title, "duration": duration})
    return out


def parse_tracklist(items: list[dict]) -> tuple[str, list[dict]]:
    """Returns (pattern, parsed_tracks)."""
    if not items:
        return "empty", []
    pattern = detect_pattern(items)
    if pattern == "pattern1" or pattern == "pattern1_unpositioned":
        return pattern, parse_pattern1(items)
    if pattern == "pattern2":
        return pattern, parse_pattern2(items)
    # Mixed → versuche pattern1 als Fallback (gibt zumindest die titles)
    return "mixed", parse_pattern1(items)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Show plan, don't write")
    parser.add_argument("--commit", action="store_true", help="Execute migration")
    parser.add_argument("--limit", type=int, default=0, help="Process only N releases (0=all)")
    parser.add_argument("--release-id", type=str, default=None, help="Single-release-Test")
    args = parser.parse_args()

    if not args.dry_run and not args.commit:
        print("Specify --dry-run or --commit", file=sys.stderr)
        sys.exit(2)

    pg = _ensure_psycopg2()
    conn = pg.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    where = """
        WHERE r.id LIKE 'legacy-release-%%'
          AND jsonb_typeof(r.tracklist) = 'array'
          AND jsonb_array_length(r.tracklist) > 0
          AND NOT EXISTS (SELECT 1 FROM "Track" t WHERE t."releaseId" = r.id)
    """
    params: tuple = ()
    if args.release_id:
        where += ' AND r.id = %s'
        params = (args.release_id,)

    cur.execute(f'''SELECT r.id, r.tracklist FROM "Release" r {where} ORDER BY r.id''', params)
    rows = cur.fetchall()
    if args.limit and args.limit > 0:
        rows = rows[: args.limit]

    print(f"Found {len(rows)} legacy releases with tracklist needing migration")
    if not rows:
        return

    pattern_counts: dict[str, int] = {}
    total_tracks_inserted = 0
    successes = 0
    skips = 0
    errors = 0

    for rid, tracklist_jsonb in rows:
        items = tracklist_jsonb if isinstance(tracklist_jsonb, list) else []
        pattern, parsed = parse_tracklist(items)
        pattern_counts[pattern] = pattern_counts.get(pattern, 0) + 1

        if not parsed:
            skips += 1
            if args.dry_run:
                print(f"  ⊘ {rid:35s} pattern={pattern:25s} → 0 parsed (skip)")
            continue

        if args.dry_run:
            preview = ", ".join(f'{t["position"]}:{t["title"][:30]}' for t in parsed[:3])
            print(f"  ✓ {rid:35s} pattern={pattern:25s} {len(items):3d} raw → {len(parsed):3d} tracks  [{preview}…]")
            total_tracks_inserted += len(parsed)
            successes += 1
            continue

        # COMMIT mode
        try:
            insert_rows = []
            for t in parsed:
                insert_rows.append((
                    gen_id("track"),
                    t["position"][:50] if t["position"] else "",
                    t["title"][:500],
                    t["duration"][:20] if t["duration"] else None,
                    rid,
                ))
            cur.executemany(
                '''INSERT INTO "Track" (id, position, title, duration, "releaseId")
                   VALUES (%s, %s, %s, %s, %s)''',
                insert_rows,
            )
            # Set Release.tracklist auf NULL — Track ist canonical
            cur.execute('''UPDATE "Release" SET tracklist = NULL, search_indexed_at = NULL WHERE id = %s''', (rid,))
            conn.commit()
            total_tracks_inserted += len(insert_rows)
            successes += 1
            if successes % 100 == 0:
                print(f"  … {successes} releases done, {total_tracks_inserted} track rows inserted")
        except Exception as e:
            conn.rollback()
            errors += 1
            print(f"  ✗ {rid}: {e}")

    print()
    print(f"Pattern distribution: {pattern_counts}")
    print(f"Result: {successes} releases, {total_tracks_inserted} tracks inserted, {skips} skipped, {errors} errors")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
