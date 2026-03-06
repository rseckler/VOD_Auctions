#!/usr/bin/env python3
"""
Re-parse ALL Release descriptions with improved HTML parser.

Fixes:
1. content_ETGfR format: Tracklist with "pos artist– title duration" per line
2. Credits from <ul><li> format (was truncated)
3. Notes from notes_VIDcE divs
4. Overwrites broken tracklists (numeric-only positions)

Usage:
    cd VOD_Auctions/scripts
    python3 fix_reparse_descriptions.py [--dry-run] [--id legacy-release-33949]
"""

import re
import json
import time
import argparse
from html import unescape

import psycopg2
import psycopg2.extras
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
from shared import get_pg_connection

BATCH_SIZE = 500


def strip_html(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<li[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = unescape(text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"\xa0", " ", text)
    text = re.sub(r"[^\S\n]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text)
    return text.strip()


def _sort_position(pos: str) -> tuple:
    m = re.match(r"^([A-Za-z]*)(\d+)?(?:-(\d+))?$", pos)
    if m:
        letter = m.group(1) or ""
        num1 = int(m.group(2)) if m.group(2) else 0
        num2 = int(m.group(3)) if m.group(3) else 0
        return (letter.upper(), num1, num2)
    return (pos, 0, 0)


def extract_content_blocks(html: str) -> list[str]:
    """Extract all content_* div blocks from Discogs scrape HTML."""
    # Split by main_ wrapper divs first, then find content_ within each
    main_blocks = re.split(r'<div\s+class="main_[^"]*"', html)
    blocks = []
    for mb in main_blocks:
        m = re.search(r'class="content_[^"]*"[^>]*>(.*)', mb, re.DOTALL | re.IGNORECASE)
        if m:
            # Take content up to the closing </div></div>
            content = m.group(1)
            # Remove trailing </div> tags
            content = re.sub(r'</div>\s*$', '', content)
            content = re.sub(r'</div>\s*$', '', content)
            if content.strip():
                blocks.append(content.strip())
    return blocks


def parse_tracklist_content(html: str) -> list[dict] | None:
    """Parse tracklist from content_* div with plain text lines.

    Format: position\\n artist–\\n title\\n duration\\n <br/>
    Also handles: position artist– title duration on single lines after strip_html.
    """
    # Find the first content block that looks like a tracklist
    blocks = extract_content_blocks(html)

    for block in blocks:
        text = strip_html(block)
        if not text:
            continue

        lines = [l.strip() for l in text.split("\n") if l.strip()]
        if not lines:
            continue

        tracks = []
        i = 0
        while i < len(lines):
            line = lines[i]

            # Try multi-part format: "1-1" then "Artist–" then "Title" then "32:36"
            # Position pattern: A1, B2, 1-1, 2-10, etc.
            pos_match = re.match(r'^([A-Za-z]?\d+(?:-\d+)?)\s*$', line)
            if pos_match:
                pos = pos_match.group(1)
                artist = ""
                title = ""
                duration = None

                # Next line(s): artist (ends with –), title, duration
                j = i + 1
                while j < len(lines) and j < i + 5:
                    next_line = lines[j].strip()
                    if not next_line or next_line == '-':
                        j += 1
                        continue
                    # Artist line: ends with – or ndash
                    if next_line.endswith('–') or next_line.endswith('-'):
                        artist = next_line.rstrip('–-').strip()
                        if artist.endswith(' /'):
                            # Multi-artist: "A / B / C–"
                            pass
                    elif re.match(r'^\d+:\d+(?::\d+)?$', next_line):
                        duration = next_line
                    elif not title:
                        title = next_line
                    j += 1

                    # If we have title + duration (or hit next position), stop
                    if title and duration:
                        break
                    if j < len(lines) and re.match(r'^[A-Za-z]?\d+(?:-\d+)?\s*$', lines[j]):
                        break

                if title:
                    track = {"position": pos, "title": title}
                    if artist:
                        track["artist"] = artist
                    if duration:
                        track["duration"] = duration
                    tracks.append(track)
                    i = j
                    continue

            # Single-line format: "1-1 John Cage– 26' 1.1499" For A Stringplayer 32:36"
            single = re.match(
                r'^([A-Za-z]?\d+(?:-\d+)?)\s+'  # position
                r'(.+?)–\s*'                      # artist (before –)
                r'(.+?)'                          # title
                r'(?:\s+(\d+:\d+(?::\d+)?))?'     # optional duration at end
                r'\s*$',
                line
            )
            if single:
                pos = single.group(1)
                artist = single.group(2).strip()
                title = single.group(3).strip()
                duration = single.group(4)
                track = {"position": pos, "title": title, "artist": artist}
                if duration:
                    track["duration"] = duration
                tracks.append(track)
                i += 1
                continue

            # Simpler: "A1 Title 3:45" or "1 Title"
            simple = re.match(
                r'^([A-Za-z]?\d+(?:-\d+)?)\s+'
                r'(.+?)'
                r'(?:\s+(\d+:\d+(?::\d+)?))?'
                r'\s*$',
                line
            )
            if simple:
                pos = simple.group(1)
                title = simple.group(2).strip()
                duration = simple.group(3)
                # Skip if title looks like a duration or garbage
                if title and not re.match(r'^\d+:\d+$', title) and len(title) > 1:
                    track = {"position": pos, "title": title}
                    if duration:
                        track["duration"] = duration
                    tracks.append(track)

            i += 1

        # Only return if we found meaningful tracks
        if len(tracks) >= 2:
            return tracks

    return None


def parse_tracklist_table(html: str) -> list[dict] | None:
    """Parse tracklist from MUI table format with data-track-position."""
    rows = re.findall(
        r'<tr[^>]*data-track-position="([^"]*)"[^>]*>(.*?)</tr>',
        html, re.DOTALL | re.IGNORECASE
    )
    if not rows:
        return None

    track_data = {}
    for pos, row_html in rows:
        pos = pos.strip()
        if not pos:
            continue
        if pos not in track_data:
            track_data[pos] = {"position": pos, "title": "", "duration": None}

        title_m = re.search(r'trackTitle[^"]*"[^>]*>(?:<[^>]*>)*([^<]+)', row_html)
        if title_m:
            title = title_m.group(1).strip()
            if title and title != "&nbsp;":
                track_data[pos]["title"] = unescape(title)

        dur_m = re.search(r'duration[^"]*"[^>]*>(?:<[^>]*>)*(\d+:\d+)', row_html)
        if dur_m:
            track_data[pos]["duration"] = dur_m.group(1)

    tracks = []
    for pos in sorted(track_data.keys(), key=_sort_position):
        t = track_data[pos]
        if t["title"]:
            track = {"position": t["position"], "title": t["title"]}
            if t["duration"]:
                track["duration"] = t["duration"]
            tracks.append(track)

    return tracks if tracks else None


def parse_credits_ul(html: str) -> str | None:
    """Extract credits from <ul><li> format."""
    # Find all <li> items in the credits area
    blocks = extract_content_blocks(html)

    credits_parts = []
    for block in blocks:
        text = strip_html(block)
        if not text:
            continue
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        if not lines:
            continue

        # Skip blocks that look like tracklist:
        # - Lines that are just positions (1-1, A1, B2)
        # - Lines ending with – (artist names in tracklist: "John Cage–")
        # - Lines that are just durations (32:36)
        pos_only = sum(1 for l in lines if re.match(r'^[A-Za-z]?\d+(?:-\d+)?$', l))
        artist_dash = sum(1 for l in lines if l.endswith('–') or l.endswith('-'))
        duration_only = sum(1 for l in lines if re.match(r'^\d+:\d+(?::\d+)?$', l))
        if (pos_only + artist_dash + duration_only) > len(lines) * 0.3:
            continue

        # Credits block: has "Role – Name" patterns where – is a SEPARATOR (not at end)
        # e.g. "Composed By – Charlotte Moorman" vs "John Cage–" (tracklist artist)
        role_lines = [l for l in lines
                      if re.search(r'\s–\s', l)  # – surrounded by spaces = separator
                      and re.match(r'^[A-Za-z]', l)]
        if len(role_lines) >= 2:
            credits_parts.append("\n".join(lines))

    return "\n\n".join(credits_parts) if credits_parts else None


def parse_notes_div(html: str) -> str | None:
    """Extract notes from notes_* div."""
    m = re.search(r'class="notes_[^"]*"[^>]*>(.*?)</div>', html, re.DOTALL | re.IGNORECASE)
    if m:
        text = strip_html(m.group(1))
        return text if text else None
    return None


def parse_description_improved(html: str) -> dict:
    """Parse all structured data from description HTML (improved)."""
    result = {"tracklist": None, "credits": None, "notes": None}

    if not html or "<" not in html:
        return result

    # Try tracklist: table format first, then content blocks
    result["tracklist"] = parse_tracklist_table(html)
    if not result["tracklist"]:
        result["tracklist"] = parse_tracklist_content(html)

    # Credits
    result["credits"] = parse_credits_ul(html)

    # Notes
    result["notes"] = parse_notes_div(html)

    return result


def is_tracklist_broken(tracklist: list) -> bool:
    """Check if an existing tracklist looks broken (numeric-only positions, durations as titles)."""
    if not tracklist or len(tracklist) == 0:
        return False

    broken_count = 0
    for t in tracklist:
        pos = t.get("position", "")
        title = t.get("title", "")
        # Broken: position is just a number (like "26", "32") and title looks like ":36"
        if re.match(r'^\d+$', str(pos)) and (title.startswith(':') or len(title) <= 3):
            broken_count += 1

    return broken_count > len(tracklist) * 0.3


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--id", type=str, help="Process single release")
    args = parser.parse_args()

    start = time.time()
    print("=" * 60)
    print("Re-parse descriptions (improved parser)")
    print("=" * 60)

    pg_conn = get_pg_connection()
    pg_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    if args.id:
        pg_cur.execute("""
            SELECT id, description, tracklist, credits
            FROM "Release"
            WHERE id = %s AND description IS NOT NULL
        """, (args.id,))
    else:
        pg_cur.execute("""
            SELECT id, description, tracklist, credits
            FROM "Release"
            WHERE description IS NOT NULL
              AND description LIKE '%%<div%%'
              AND product_category = 'release'
            ORDER BY id
        """)

    rows = pg_cur.fetchall()
    print(f"  Found {len(rows)} releases with HTML description")

    update_cur = pg_conn.cursor()
    stats = {
        "tracklist_fixed": 0,
        "tracklist_new": 0,
        "credits_fixed": 0,
        "credits_new": 0,
        "notes_found": 0,
        "errors": 0,
    }

    for i, row in enumerate(rows):
        try:
            parsed = parse_description_improved(row["description"])

            updates = {}
            params = []

            # Tracklist: overwrite if broken, or set if new and parsed has tracks
            existing_tl = row["tracklist"]
            if parsed["tracklist"]:
                if existing_tl and is_tracklist_broken(existing_tl):
                    updates["tracklist"] = 'tracklist = %s::jsonb'
                    params.append(json.dumps(parsed["tracklist"]))
                    stats["tracklist_fixed"] += 1
                elif not existing_tl:
                    updates["tracklist"] = 'tracklist = %s::jsonb'
                    params.append(json.dumps(parsed["tracklist"]))
                    stats["tracklist_new"] += 1
                elif len(parsed["tracklist"]) > len(existing_tl):
                    updates["tracklist"] = 'tracklist = %s::jsonb'
                    params.append(json.dumps(parsed["tracklist"]))
                    stats["tracklist_fixed"] += 1

            # Credits: overwrite if current is truncated or missing
            existing_cr = row["credits"] or ""
            if parsed["credits"]:
                new_credits = parsed["credits"]
                # Add notes to credits
                if parsed["notes"]:
                    new_credits = new_credits + "\n\n" + parsed["notes"]
                    stats["notes_found"] += 1

                # Update if: no credits, or new credits are significantly longer
                if not existing_cr:
                    updates["credits"] = "credits = %s"
                    params.append(new_credits)
                    stats["credits_new"] += 1
                elif len(new_credits) > len(existing_cr) * 1.3:
                    updates["credits"] = "credits = %s"
                    params.append(new_credits)
                    stats["credits_fixed"] += 1
            elif parsed["notes"] and not existing_cr:
                updates["credits"] = "credits = %s"
                params.append(parsed["notes"])
                stats["notes_found"] += 1

            if not updates:
                continue

            if args.dry_run:
                print(f"\n  [{row['id']}] Would update: {list(updates.keys())}")
                if "tracklist" in updates:
                    tl = parsed["tracklist"]
                    print(f"    tracklist: {len(tl)} tracks")
                    for t in tl[:5]:
                        a = f" ({t['artist']})" if t.get('artist') else ""
                        d = f" [{t['duration']}]" if t.get('duration') else ""
                        print(f"      {t['position']}: {t['title']}{a}{d}")
                    if len(tl) > 5:
                        print(f"      ... and {len(tl)-5} more")
                if "credits" in updates:
                    idx = list(updates.keys()).index("credits")
                    print(f"    credits: {len(params[idx])} chars")
                    print(f"    preview: {params[idx][:200]}...")
                continue

            set_clause = ", ".join(updates.values()) + ', "updatedAt" = NOW()'
            params.append(row["id"])
            update_cur.execute(
                f'UPDATE "Release" SET {set_clause} WHERE id = %s',
                params,
            )

            if (i + 1) % 500 == 0:
                pg_conn.commit()
                print(f"  Processed {i + 1}/{len(rows)}...", end="\r")

        except Exception as e:
            stats["errors"] += 1
            if args.dry_run or args.id:
                print(f"\n  ERROR on {row['id']}: {e}")
                import traceback
                traceback.print_exc()

    if not args.dry_run:
        pg_conn.commit()

    pg_conn.close()

    elapsed = time.time() - start
    total_updated = (stats["tracklist_fixed"] + stats["tracklist_new"] +
                     stats["credits_fixed"] + stats["credits_new"])
    print(f"\n\n{'=' * 60}")
    print("RESULTS")
    print(f"{'=' * 60}")
    print(f"  Processed:           {len(rows)} releases")
    print(f"  Tracklist fixed:     {stats['tracklist_fixed']} (broken → reparsed)")
    print(f"  Tracklist new:       {stats['tracklist_new']}")
    print(f"  Credits fixed:       {stats['credits_fixed']} (truncated → full)")
    print(f"  Credits new:         {stats['credits_new']}")
    print(f"  Notes found:         {stats['notes_found']}")
    print(f"  Errors:              {stats['errors']}")
    print(f"  Duration:            {elapsed:.1f}s")
    if args.dry_run:
        print("  MODE: DRY RUN")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
