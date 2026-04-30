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
# Duration MM:SS oder M:SS oder H:MM:SS oder ":SS" (Discogs-Scrape stripped first digit)
DURATION_RE = re.compile(r"^\d{0,2}:\d{2}(?::\d{2})?$")


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
    Pattern 1: items haben title + non-empty position. 1:1 Übernahme.
    Pattern 2: Burst-Style — POS-Marker und/oder Duration-Strings als eigene
               Title-Items (Discogs-Scrape-Artefakt). Tracks werden aus
               aufeinanderfolgenden Items rekonstruiert.

    Heuristik: Pattern 2 greift wenn:
      • >=2 POS-Markers als Title (klares Burst-Indiz), ODER
      • >=1 POS-Marker UND >=1 Duration im Title (kurze Bursts wie Dan Lander), ODER
      • >=20% der Titles sind Durations (Burst auch wenn position-Field gefüllt
        ist, z.B. DK „Surface Tension")
    """
    if not items:
        return "empty"
    n = len(items)
    pos_in_pos_field = sum(1 for i in items if (i.get("position") or "").strip())
    pos_markers_in_title = sum(
        1 for i in items if is_position_marker((i.get("title") or "").strip())
    )
    durations_in_title = sum(
        1 for i in items if is_duration((i.get("title") or "").strip())
    )

    # Pattern 2 — diverse Trigger
    if pos_markers_in_title >= 2 and pos_markers_in_title >= max(1, pos_in_pos_field):
        return "pattern2"
    if pos_markers_in_title >= 1 and durations_in_title >= 1 and pos_in_pos_field <= pos_markers_in_title:
        return "pattern2"
    if durations_in_title >= max(2, n * 0.2):
        return "pattern2"

    if pos_in_pos_field >= n * 0.5:
        return "pattern1"
    if pos_in_pos_field == 0 and pos_markers_in_title == 0:
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
    Dispatcher: wenn Mehrheit der position-Felder gefüllt ist, nutzen wir
    diese als Track-Anker (DK „Surface Tension"-Style), sonst die Title-
    POS-Marker (Anschluss/Dan-Lander-Style).
    """
    n = len(items)
    pos_in_pos_field = sum(1 for i in items if (i.get("position") or "").strip())
    if n > 0 and pos_in_pos_field >= n * 0.5:
        return _parse_pattern2_with_positions(items)
    return _parse_pattern2_title_markers(items)


def _parse_pattern2_title_markers(items: list[dict]) -> list[dict]:
    """
    Pattern2-Burst, position-Field leer:
      [{pos:'', title:'A1'}, {pos:'', title:'–Artist'}, {pos:'', title:'TrackName'},
       {pos:'', title:'3:45'}, {pos:'', title:'B1'}, ...]
    Bursts werden durch POS-Marker im Title begrenzt.
    """
    out: list[dict] = []
    titles = [(i.get("title") or "").strip() for i in items]
    i = 0
    n = len(titles)
    while i < n:
        if not is_position_marker(titles[i]):
            i += 1
            continue
        pos = titles[i]
        i += 1
        artist = None
        if i < n and titles[i].startswith("–"):
            artist = titles[i].lstrip("–").strip()
            i += 1
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
            continue
        full_title = f"{artist} – {title}" if artist else title
        out.append({"position": pos, "title": full_title, "duration": duration})
    return out


def _parse_pattern2_with_positions(items: list[dict]) -> list[dict]:
    """
    Pattern2-Burst, position-Field gefüllt aber unsauber (z.B. DK):
      [{pos:'1', title:'Urban Jungle'}, {pos:'3', title:':15'},
       {pos:'2', title:'Scratched...'}, {pos:'3', title:':01'}, ...]
    Heuristik: title-Items die wie Durations aussehen, hängen an den vorigen
    Track an. position-Field-Werte werden als Track-Position genommen wenn
    der Title kein Duration-String ist.
    """
    out: list[dict] = []
    last: dict | None = None
    for item in items:
        pos_field = (item.get("position") or "").strip()
        title = (item.get("title") or "").strip()
        if not title:
            continue
        if is_duration(title):
            if last is not None and not last.get("duration"):
                last["duration"] = title
            continue
        # Echter Track-Title — position-Field nutzen falls da, sonst durchnummerieren
        new_track = {
            "position": pos_field or str(len(out) + 1),
            "title": title,
            "duration": None,
        }
        out.append(new_track)
        last = new_track
    return out


# ─── Built-in tests gegen die problematischen Cases aus 1000-Lauf 2026-04-30 ─
def _run_self_tests() -> int:
    """Returns 0 if all tests pass, otherwise number of failures. Print details."""
    tests = [
        # legacy-release-11423 — Dan Lander (3 items: pos-marker + title + duration)
        {
            "name": "Dan Lander 3-burst",
            "items": [
                {"title": "1", "position": ""},
                {"title": "Accommodation: Recordings From Home", "position": ""},
                {"title": "26:17", "position": ""},
            ],
            "expected_pattern": "pattern2",
            "expected_n_tracks": 1,
            "expected_first": {"position": "1", "title": "Accommodation: Recordings From Home", "duration": "26:17"},
        },
        # legacy-release-11249 — DK Surface Tension (gefülltes position-Field + duration-titles)
        {
            "name": "DK Surface Tension burst-with-positions",
            "items": [
                {"title": "Urban Jungle Music", "position": "1"},
                {"title": ":15", "position": "3"},
                {"title": "Scratched My Face, So To Speak", "position": "2"},
                {"title": ":01", "position": "3"},
                {"title": "Floating In The Caribbean", "position": "3"},
                {"title": ":12", "position": "5"},
                {"title": "Radio Lung", "position": "4"},
                {"title": ":03", "position": "4"},
            ],
            "expected_pattern": "pattern2",
            "expected_n_tracks": 4,
            "expected_first": {"position": "1", "title": "Urban Jungle Music", "duration": ":15"},
        },
        # legacy-release-10149 — Die Art (Pattern2 with title markers, all positions empty)
        {
            "name": "Die Art Pattern2 title-markers",
            "items": [
                {"title": "A1", "position": ""},
                {"title": "Endlos", "position": ""},
                {"title": "A2", "position": ""},
                {"title": "Radio War", "position": ""},
            ],
            "expected_pattern": "pattern2",
            "expected_n_tracks": 2,
            "expected_first": {"position": "A1", "title": "Endlos", "duration": None},
        },
        # legacy-release-10576 — Max Goldt (sauberes Pattern1)
        {
            "name": "Max Goldt Pattern1 clean",
            "items": [
                {"title": "Nie Wieder Ischl", "position": "A1"},
                {"title": "Kontakt Zu Jungen Leuten", "position": "A2"},
            ],
            "expected_pattern": "pattern1",
            "expected_n_tracks": 2,
            "expected_first": {"position": "A1", "title": "Nie Wieder Ischl", "duration": None},
        },
    ]
    failures = 0
    for t in tests:
        pattern, parsed = parse_tracklist(t["items"])
        ok_pattern = pattern == t["expected_pattern"]
        ok_n = len(parsed) == t["expected_n_tracks"]
        ok_first = (
            parsed
            and parsed[0].get("position") == t["expected_first"]["position"]
            and parsed[0].get("title") == t["expected_first"]["title"]
            and parsed[0].get("duration") == t["expected_first"]["duration"]
        )
        if ok_pattern and ok_n and ok_first:
            print(f"  ✓ {t['name']}: pattern={pattern}, {len(parsed)} tracks")
        else:
            failures += 1
            print(f"  ✗ {t['name']}:")
            print(f"      expected pattern={t['expected_pattern']} n={t['expected_n_tracks']} first={t['expected_first']}")
            print(f"      got      pattern={pattern} n={len(parsed)} first={parsed[0] if parsed else None}")
    return failures


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
    parser.add_argument("--self-test", action="store_true", help="Run built-in parser tests + exit")
    args = parser.parse_args()

    if args.self_test:
        print("Running built-in parser tests:")
        failures = _run_self_tests()
        print(f"\n{'all pass' if failures == 0 else f'{failures} failures'}")
        sys.exit(1 if failures else 0)

    if not args.dry_run and not args.commit:
        print("Specify --dry-run or --commit (or --self-test)", file=sys.stderr)
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
