#!/usr/bin/env python3
"""
Comprehensive moreinfo parser — fills gaps left by fix_description_parser.py
and fix_reparse_descriptions.py.

Targets releases that STILL have no tracklist or credits despite having a
description. Handles formats the previous parsers missed:

1. Discogs V1: <table class="playlist"> with <td class="tracklist_track_pos">
2. Simple div-wrapped tracklists: <div>A1 Title</div> or A1 : Artist - Title <br/>
3. Classic sections with <h3 class="group">Tracklist</h3> variant
4. Plain text tracklists (no HTML at all)
5. Credits from <ul class="list_no_style"> in classic format
6. Notes extraction from section HTML

Usage:
    cd VOD_Auctions/scripts
    python3 fix_moreinfo_comprehensive.py [--dry-run] [--id legacy-release-XXXX]
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


def strip_html(text: str) -> str:
    """Remove HTML tags and normalize whitespace."""
    if not text:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<li[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = unescape(text)
    text = text.replace("&nbsp;", " ").replace("\xa0", " ")
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


# ─────────────────────────────────────────────────────────────
# TRACKLIST PARSERS
# ─────────────────────────────────────────────────────────────

def parse_tracklist_v1_table(html: str) -> list[dict] | None:
    """Discogs V1: <table class="playlist"> with tracklist_track_pos/title/duration classes."""
    if 'class="playlist"' not in html:
        return None

    # Extract the playlist table
    table_m = re.search(r'<table[^>]*class="playlist"[^>]*>(.*?)</table>', html, re.DOTALL | re.IGNORECASE)
    if not table_m:
        return None

    table_html = table_m.group(1)

    # Find all TR rows with data-track-position OR tracklist_track_pos cells
    tracks = []

    # Method 1: data-track-position attribute on TR
    rows = re.findall(r'<tr[^>]*data-track-position="([^"]*)"[^>]*>(.*?)</tr>', table_html, re.DOTALL)
    if rows:
        for pos, row_html in rows:
            pos = pos.strip()
            if not pos:
                continue
            # Title from tracklist_track_title span
            title_m = re.search(r'tracklist_track_title"[^>]*>([^<]+)', row_html)
            if not title_m:
                title_m = re.search(r'itemprop="name"[^>]*>([^<]+)', row_html)
            title = unescape(title_m.group(1).strip()) if title_m else ""

            # Duration
            dur_m = re.search(r'tracklist_track_duration[^>]*>(?:<[^>]*>)*\s*(\d+:\d+)', row_html)
            if not dur_m:
                dur_m = re.search(r'<span>(\d+:\d+)</span>', row_html)
            duration = dur_m.group(1) if dur_m else None

            if title and title != "&nbsp;":
                track = {"position": pos, "title": title}
                if duration:
                    track["duration"] = duration
                tracks.append(track)

    # Method 2: No data-track-position, parse from TD cells
    if not tracks:
        rows2 = re.findall(r'<tr[^>]*>(.*?)</tr>', table_html, re.DOTALL)
        for row_html in rows2:
            pos_m = re.search(r'tracklist_track_pos[^>]*>([^<]+)', row_html)
            if not pos_m:
                continue
            pos = pos_m.group(1).strip()

            title_m = re.search(r'tracklist_track_title"[^>]*>([^<]+)', row_html)
            if not title_m:
                title_m = re.search(r'itemprop="name"[^>]*>([^<]+)', row_html)
            title = unescape(title_m.group(1).strip()) if title_m else ""

            dur_m = re.search(r'tracklist_track_duration[^>]*>(?:<[^>]*>)*\s*(\d+:\d+)', row_html)
            if not dur_m:
                dur_m = re.search(r'<span>(\d+:\d+)</span>', row_html)
            duration = dur_m.group(1) if dur_m else None

            if pos and title and title != "&nbsp;":
                track = {"position": pos, "title": title}
                if duration:
                    track["duration"] = duration
                tracks.append(track)

    return tracks if tracks else None


def parse_tracklist_v2_table(html: str) -> list[dict] | None:
    """Discogs V2/V3: <table class="tracklist_*"> or data-track-position with MUI classes."""
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

        # Title — try multiple class patterns
        title_m = re.search(r'trackTitle[^"]*"[^>]*>(?:<[^>]*>)*([^<]+)', row_html)
        if not title_m:
            title_m = re.search(r'tracklist_track_title"[^>]*>([^<]+)', row_html)
        if not title_m:
            title_m = re.search(r'itemprop="name"[^>]*>([^<]+)', row_html)
        if title_m:
            title = title_m.group(1).strip()
            if title and title != "&nbsp;":
                track_data[pos]["title"] = unescape(title)

        # Duration
        dur_m = re.search(r'duration[^"]*"[^>]*>(?:<[^>]*>)*(\d+:\d+)', row_html)
        if not dur_m:
            dur_m = re.search(r'<span>(\d+:\d+)</span>', row_html)
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


def parse_tracklist_section_text(html: str) -> list[dict] | None:
    """Parse tracklist from section content or plain div text.

    Handles:
    - <div id="tracklist" ...>...<div class="section_content">TEXT</div>
    - <h3 class="group">Tracklist</h3>...<div class="section_content">TEXT</div>
    - Tracklist\n<div>&nbsp;</div>\nA1 Title <br/>
    """
    # Try multiple extraction patterns
    content = None

    # Pattern 1: section_content div inside tracklist section
    patterns = [
        r'id="tracklist"[^>]*>.*?<div[^>]*class="section_content[^"]*"[^>]*>(.*?)</div>\s*</div>',
        r'class="section\s+tracklist[^"]*"[^>]*>.*?<div[^>]*class="section_content[^"]*"[^>]*>(.*?)</div>\s*</div>',
        r'release-tracklist[^>]*>.*?<div[^>]*class="content_[^"]*"[^>]*>(.*?)</div>',
    ]
    for p in patterns:
        m = re.search(p, html, re.DOTALL | re.IGNORECASE)
        if m:
            content = m.group(1)
            break

    # Pattern 2: "Tracklist" keyword followed by content (simple div wraps)
    if not content:
        m = re.search(
            r'Tracklist\+?\s*(?:<div[^>]*>&nbsp;</div>\s*)?'
            r'((?:\s*(?:<div[^>]*>)?[A-Za-z]\d*.*?(?:</div>|<br\s*/?>).*?)+)',
            html, re.DOTALL | re.IGNORECASE
        )
        if m:
            content = m.group(1)

    if not content:
        return None

    text = strip_html(content)
    if not text:
        return None

    return _parse_track_lines(text)


def parse_tracklist_simple_divs(html: str) -> list[dict] | None:
    """Parse simple <div>A1 Title</div> format (no Discogs classes)."""
    # Check if it's simple div-wrapped content
    if 'class="playlist"' in html or 'class="tracklist_' in html:
        return None

    # Extract all text between the outermost <div> and </div>
    m = re.search(r'^<div>(.*)</div>$', html.strip(), re.DOTALL)
    if not m:
        return None

    text = strip_html(m.group(1))
    if not text:
        return None

    # Remove "Tracklist" header if present
    text = re.sub(r'^Tracklist\+?\s*\n?', '', text, flags=re.IGNORECASE)

    return _parse_track_lines(text)


def parse_tracklist_colon_format(html: str) -> list[dict] | None:
    """Parse 'A1 : Artist - Title - <br/>' format."""
    # Must have the " : " pattern
    if ' : ' not in html:
        return None

    text = strip_html(html)
    tracks = []
    for line in text.split("\n"):
        line = line.strip().rstrip('-').strip()
        if not line:
            continue
        # A1 : Artist - Title
        m = re.match(r'^([A-Za-z]\d*|\d+)\s*:\s*(.+?)\s*-\s*(.+?)(?:\s*-\s*)?$', line)
        if m:
            pos = m.group(1)
            artist = m.group(2).strip()
            title = m.group(3).strip()
            track = {"position": pos, "title": title}
            if artist:
                track["artist"] = artist
            tracks.append(track)

    return tracks if len(tracks) >= 2 else None


def parse_tracklist_plain_text(description: str) -> list[dict] | None:
    """Parse tracklist from plain text (no HTML at all)."""
    if '<' in description:
        return None

    return _parse_track_lines(description)


def _parse_track_lines(text: str) -> list[dict] | None:
    """Shared logic: parse track lines from cleaned text."""
    tracks = []
    for line in text.split("\n"):
        line = line.strip()
        if not line or line.lower() in ("tracklist", "tracklist+", ""):
            continue

        # Skip headers / section names
        if line.lower() in ("credits", "notes", "companies", "other"):
            break

        # Pattern: "A1 Title 3:45" or "1 Title" or "A Title" or "B Untitled"
        # Position can be: A1, B2, 1, A, B, 1-1, etc.
        m = re.match(
            r'^([A-Za-z]\d*(?:-\d+)?|\d+(?:-\d+)?)\s+'  # position (letter+opt digits, or digits)
            r'(.+?)'                          # title (non-greedy)
            r'(?:\s+(\d{1,3}:\d{2}(?::\d{2})?))?'  # optional duration
            r'\s*$',
            line
        )
        if m:
            pos = m.group(1).strip()
            title = m.group(2).strip()
            duration = m.group(3)

            # Skip if title looks like garbage
            if not title or len(title) <= 1:
                continue
            # Skip if title is just a duration
            if re.match(r'^\d+:\d+$', title):
                continue
            # Skip if title is just "&nbsp;" leftovers
            if title in ("&nbsp;", " "):
                continue

            # Handle "–Artist Title" pattern (artist dash at start of title)
            # Strip leading dash — artist is embedded in title, can't reliably split
            artist = None
            if title.startswith('–') or title.startswith('-'):
                title = title.lstrip('–- ').strip()

            track = {"position": pos, "title": title}
            if artist:
                track["artist"] = artist
            if duration:
                track["duration"] = duration
            tracks.append(track)
        else:
            # Check for position-less entry (just a title line) — only if we already have tracks
            if tracks and not re.match(r'^[A-Za-z]?\d', line):
                # Might be a subsection header like "Cycle One: Seasons" — skip
                pass

    return tracks if len(tracks) >= 2 else None


# ─────────────────────────────────────────────────────────────
# CREDITS PARSERS
# ─────────────────────────────────────────────────────────────

def parse_credits_classic(html: str) -> str | None:
    """Extract credits from classic Discogs section HTML.
    <div id="credits" ...><div class="section_content">...<ul class="list_no_style"><li>...</li></ul>
    """
    patterns = [
        r'id="credits"[^>]*>.*?<div[^>]*class="section_content[^"]*"[^>]*>(.*?)</div>\s*</div>',
        r'class="section\s+credits[^"]*"[^>]*>.*?<div[^>]*class="section_content[^"]*"[^>]*>(.*?)</div>\s*</div>',
        r'release-credits[^>]*>.*?<div[^>]*class="content_[^"]*"[^>]*>(.*?)</div>',
    ]
    for p in patterns:
        m = re.search(p, html, re.DOTALL | re.IGNORECASE)
        if m:
            text = strip_html(m.group(1))
            lines = [l.strip() for l in text.split("\n") if l.strip()]
            if lines:
                return "\n".join(lines)
    return None


def parse_credits_ul(html: str) -> str | None:
    """Extract credits from <ul class="list_no_style"><li>Role – Name</li>...</ul>."""
    # Find all UL blocks with list_no_style class
    ul_blocks = re.findall(
        r'<ul[^>]*class="list_no_style"[^>]*>(.*?)</ul>',
        html, re.DOTALL | re.IGNORECASE
    )
    if not ul_blocks:
        return None

    all_lines = []
    for block in ul_blocks:
        text = strip_html(block)
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        # Must have role–name pattern
        role_lines = [l for l in lines if re.search(r'\s–\s', l)]
        if role_lines:
            all_lines.extend(lines)

    return "\n".join(all_lines) if all_lines else None


def parse_notes_all(html: str) -> str | None:
    """Extract notes from any format."""
    # Try classic section
    patterns = [
        r'id="notes"[^>]*>.*?<div[^>]*class="section_content[^"]*"[^>]*>(.*?)</div>\s*</div>',
        r'class="section\s+notes[^"]*"[^>]*>.*?<div[^>]*class="section_content[^"]*"[^>]*>(.*?)</div>\s*</div>',
        r'class="notes_[^"]*"[^>]*>(.*?)</div>',
        r'release-notes[^>]*>.*?<div[^>]*class="content_[^"]*"[^>]*>(.*?)</div>',
    ]
    for p in patterns:
        m = re.search(p, html, re.DOTALL | re.IGNORECASE)
        if m:
            text = strip_html(m.group(1))
            if text:
                return text
    return None


# ─────────────────────────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────────────────────────

def parse_all(description: str) -> dict:
    """Try all parsers in order of specificity. Returns {tracklist, credits, notes}."""
    result = {"tracklist": None, "credits": None, "notes": None}

    if not description:
        return result

    has_html = "<" in description

    # ── Tracklist ──
    if has_html:
        # V1: class="playlist" table (schema.org)
        result["tracklist"] = parse_tracklist_v1_table(description)
        # V2/V3: data-track-position tables (MUI / modern Discogs)
        if not result["tracklist"]:
            result["tracklist"] = parse_tracklist_v2_table(description)
        # Section text (classic + h3 variant)
        if not result["tracklist"]:
            result["tracklist"] = parse_tracklist_section_text(description)
        # Colon format: A1 : Artist - Title
        if not result["tracklist"]:
            result["tracklist"] = parse_tracklist_colon_format(description)
        # Simple div wraps
        if not result["tracklist"]:
            result["tracklist"] = parse_tracklist_simple_divs(description)
    else:
        # Plain text
        result["tracklist"] = parse_tracklist_plain_text(description)

    # ── Credits ──
    if has_html:
        result["credits"] = parse_credits_ul(description)
        if not result["credits"]:
            result["credits"] = parse_credits_classic(description)

    # ── Notes ──
    if has_html:
        result["notes"] = parse_notes_all(description)

    return result


def main():
    parser = argparse.ArgumentParser(description="Comprehensive moreinfo parser — fill gaps")
    parser.add_argument("--dry-run", action="store_true", help="Don't write to DB")
    parser.add_argument("--id", type=str, help="Process single release by ID")
    parser.add_argument("--all", action="store_true", help="Process ALL releases (not just gaps)")
    args = parser.parse_args()

    start = time.time()
    print("=" * 60)
    print("Comprehensive moreinfo parser")
    print("=" * 60)

    pg_conn = get_pg_connection()
    pg_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    if args.id:
        pg_cur.execute("""
            SELECT id, description, tracklist, credits
            FROM "Release"
            WHERE id = %s AND description IS NOT NULL AND description != ''
        """, (args.id,))
    elif args.all:
        pg_cur.execute("""
            SELECT id, description, tracklist, credits
            FROM "Release"
            WHERE description IS NOT NULL AND description != ''
              AND product_category = 'release'
            ORDER BY id
        """)
    else:
        # Only target releases that are MISSING tracklist or credits
        pg_cur.execute("""
            SELECT id, description, tracklist, credits
            FROM "Release"
            WHERE description IS NOT NULL AND description != ''
              AND product_category = 'release'
              AND (
                tracklist IS NULL OR tracklist::text = '[]' OR tracklist::text = 'null'
                OR credits IS NULL OR credits = ''
              )
            ORDER BY id
        """)

    rows = pg_cur.fetchall()
    print(f"  Found {len(rows)} releases to process")

    update_cur = pg_conn.cursor()
    stats = {
        "tracklist_new": 0,
        "tracklist_improved": 0,
        "credits_new": 0,
        "credits_improved": 0,
        "notes_added": 0,
        "skipped": 0,
        "errors": 0,
    }

    for i, row in enumerate(rows):
        try:
            parsed = parse_all(row["description"])

            updates = {}
            params = []

            # ── Tracklist ──
            existing_tl = row["tracklist"]
            has_existing_tl = existing_tl and isinstance(existing_tl, list) and len(existing_tl) > 0

            if parsed["tracklist"]:
                if not has_existing_tl:
                    updates["tracklist"] = 'tracklist = %s::jsonb'
                    params.append(json.dumps(parsed["tracklist"]))
                    stats["tracklist_new"] += 1
                elif len(parsed["tracklist"]) > len(existing_tl):
                    updates["tracklist"] = 'tracklist = %s::jsonb'
                    params.append(json.dumps(parsed["tracklist"]))
                    stats["tracklist_improved"] += 1

            # ── Credits ──
            existing_cr = row["credits"] or ""

            if parsed["credits"] or parsed["notes"]:
                new_parts = []
                if parsed["credits"]:
                    new_parts.append(parsed["credits"])
                if parsed["notes"]:
                    new_parts.append(parsed["notes"])
                    stats["notes_added"] += 1
                new_credits = "\n\n".join(new_parts)

                if not existing_cr:
                    updates["credits"] = "credits = %s"
                    params.append(new_credits)
                    stats["credits_new"] += 1
                elif len(new_credits) > len(existing_cr) * 1.3:
                    updates["credits"] = "credits = %s"
                    params.append(new_credits)
                    stats["credits_improved"] += 1

            if not updates:
                stats["skipped"] += 1
                continue

            if args.dry_run:
                print(f"\n  [{row['id']}] Would update: {list(updates.keys())}")
                if "tracklist" in updates:
                    tl = parsed["tracklist"]
                    print(f"    tracklist: {len(tl)} tracks (existing: {len(existing_tl) if has_existing_tl else 0})")
                    for t in tl[:5]:
                        a = f" ({t['artist']})" if t.get('artist') else ""
                        d = f" [{t['duration']}]" if t.get('duration') else ""
                        print(f"      {t['position']}: {t['title']}{a}{d}")
                    if len(tl) > 5:
                        print(f"      ... and {len(tl)-5} more")
                if "credits" in updates:
                    idx = list(updates.keys()).index("credits")
                    preview = params[idx][:200]
                    print(f"    credits: {len(params[idx])} chars — {preview}...")
                continue

            set_clause = ", ".join(updates.values()) + ', "updatedAt" = NOW()'
            params.append(row["id"])
            update_cur.execute(
                f'UPDATE "Release" SET {set_clause} WHERE id = %s',
                params,
            )

            if (i + 1) % 500 == 0:
                pg_conn.commit()
                elapsed = time.time() - start
                print(f"  Processed {i + 1}/{len(rows)} ({elapsed:.0f}s)...", end="\r")

        except Exception as e:
            stats["errors"] += 1
            print(f"\n  ERROR on {row['id']}: {e}")
            if args.dry_run or args.id:
                import traceback
                traceback.print_exc()
            try:
                pg_conn.rollback()
            except Exception:
                pass

    if not args.dry_run:
        pg_conn.commit()

    pg_conn.close()

    elapsed = time.time() - start
    total_updates = (stats["tracklist_new"] + stats["tracklist_improved"] +
                     stats["credits_new"] + stats["credits_improved"])
    print(f"\n\n{'=' * 60}")
    print("RESULTS")
    print(f"{'=' * 60}")
    print(f"  Processed:            {len(rows)} releases")
    print(f"  Tracklist new:        {stats['tracklist_new']}")
    print(f"  Tracklist improved:   {stats['tracklist_improved']}")
    print(f"  Credits new:          {stats['credits_new']}")
    print(f"  Credits improved:     {stats['credits_improved']}")
    print(f"  Notes added:          {stats['notes_added']}")
    print(f"  Skipped (no change):  {stats['skipped']}")
    print(f"  Errors:               {stats['errors']}")
    print(f"  Total updates:        {total_updates}")
    print(f"  Duration:             {elapsed:.1f}s")
    if args.dry_run:
        print("  MODE: DRY RUN (no changes written)")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
