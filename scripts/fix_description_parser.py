#!/usr/bin/env python3
"""
Parse structured data from Release.description HTML and populate:
- tracklist (JSONB) — overwrite if HTML has more tracks than existing
- credits (TEXT)
- notes (TEXT) — stored in description field after cleaning, or new column
- companies (TEXT)

Handles 3 HTML variants from Discogs scrapes:
1. Classic: <div class="section tracklist/credits/notes/companies">
2. MUI Table: <table class="tracklist_*"> with data-track-position
3. Simple div: <div class="content_*"> with plain text + <br/>

Usage:
    cd VOD_Auctions/scripts
    python3 fix_description_parser.py [--dry-run] [--id legacy-release-4104]
"""

import re
import sys
import json
import time
import argparse
from html import unescape

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")

from shared import get_pg_connection

BATCH_SIZE = 500


def strip_html(text: str) -> str:
    """Remove HTML tags and clean up whitespace."""
    if not text:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = unescape(text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"\xa0", " ", text)
    # Collapse multiple spaces on same line
    text = re.sub(r"[^\S\n]+", " ", text)
    # Collapse multiple newlines
    text = re.sub(r"\n\s*\n+", "\n", text)
    return text.strip()


def extract_section_classic(html: str, section_id: str) -> str | None:
    """Extract content from classic Discogs format:
    <div id="section_id" class="section ...">Title<div class="section_content">CONTENT</div></div>
    """
    # Try matching by id first, then by class
    patterns = [
        rf'<div[^>]*id="{section_id}"[^>]*>.*?<div[^>]*class="section_content[^"]*"[^>]*>(.*?)</div>\s*</div>',
        rf'<div[^>]*class="section\s+{section_id}[^"]*"[^>]*>.*?<div[^>]*class="section_content[^"]*"[^>]*>(.*?)</div>\s*</div>',
    ]
    for pattern in patterns:
        m = re.search(pattern, html, re.DOTALL | re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return None


def parse_tracklist_classic(html: str) -> list[dict] | None:
    """Parse tracklist from classic Discogs section_content HTML."""
    content = extract_section_classic(html, "tracklist")
    if not content:
        return None

    text = strip_html(content)
    if not text:
        return None

    tracks = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        # Match: position (e.g. A1, B, C2, 1, 2) followed by title
        m = re.match(r"^([A-Za-z]?\d*)\s+(.+?)(?:\s+(\d+:\d+))?\s*$", line)
        if m:
            pos = m.group(1).strip()
            title = m.group(2).strip()
            duration = m.group(3) if m.group(3) else None
            if pos and title:
                track = {"position": pos, "title": title}
                if duration:
                    track["duration"] = duration
                tracks.append(track)
        else:
            # Might be a title-only line or header text like "Tracklist"
            if line.lower() not in ("tracklist", ""):
                # Try as position-less track
                tracks.append({"position": "", "title": line})

    return tracks if tracks else None


def parse_tracklist_table(html: str) -> list[dict] | None:
    """Parse tracklist from MUI table format with data-track-position."""
    # Find all rows with data-track-position
    rows = re.findall(
        r'<tr[^>]*data-track-position="([^"]*)"[^>]*>(.*?)</tr>',
        html, re.DOTALL | re.IGNORECASE
    )
    if not rows:
        return None

    # First pass: collect position -> title and position -> duration
    track_data = {}
    for pos, row_html in rows:
        pos = pos.strip()
        if not pos:
            continue

        if pos not in track_data:
            track_data[pos] = {"position": pos, "title": "", "duration": None}

        # Extract title from trackTitle class
        title_m = re.search(r'class="trackTitle[^"]*"[^>]*>(?:<[^>]*>)*([^<]+)', row_html)
        if title_m:
            title = title_m.group(1).strip()
            if title and title != "&nbsp;":
                track_data[pos]["title"] = unescape(title)

        # Extract duration from duration class
        dur_m = re.search(r'class="duration[^"]*"[^>]*>(?:<[^>]*>)*(\d+:\d+)', row_html)
        if dur_m:
            track_data[pos]["duration"] = dur_m.group(1)

    # Build sorted track list
    tracks = []
    for pos in sorted(track_data.keys(), key=_sort_position):
        t = track_data[pos]
        if t["title"]:
            track = {"position": t["position"], "title": t["title"]}
            if t["duration"]:
                track["duration"] = t["duration"]
            tracks.append(track)

    return tracks if tracks else None


def parse_tracklist_simple(html: str) -> list[dict] | None:
    """Parse tracklist from simple div format (content_* class)."""
    m = re.search(r'class="content_[^"]*"[^>]*>(.*?)</div>', html, re.DOTALL | re.IGNORECASE)
    if not m:
        return None

    text = strip_html(m.group(1))
    if not text:
        return None

    tracks = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        # Match: position title [duration]
        match = re.match(r"^([A-Za-z]?\d*)\s+(.+?)(?:\s+(\d+:\d+))?\s*$", line)
        if match:
            pos = match.group(1).strip()
            title = match.group(2).strip()
            duration = match.group(3)
            if pos and title:
                track = {"position": pos, "title": title}
                if duration:
                    track["duration"] = duration
                tracks.append(track)

    return tracks if tracks else None


def _sort_position(pos: str) -> tuple:
    """Sort key for track positions like A1, A2, B, B1, C1."""
    m = re.match(r"^([A-Za-z]*)(\d*)$", pos)
    if m:
        letter = m.group(1) or ""
        num = int(m.group(2)) if m.group(2) else 0
        return (letter.upper(), num)
    return (pos, 0)


def parse_credits(html: str) -> str | None:
    """Extract credits text from description HTML."""
    content = extract_section_classic(html, "credits")
    if not content:
        return None
    text = strip_html(content)
    # Clean up: each credit on its own line
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    return "\n".join(lines) if lines else None


def parse_notes(html: str) -> str | None:
    """Extract notes text from description HTML."""
    content = extract_section_classic(html, "notes")
    if not content:
        return None
    text = strip_html(content)
    return text if text else None


def parse_companies(html: str) -> str | None:
    """Extract companies text from description HTML."""
    content = extract_section_classic(html, "companies")
    if not content:
        return None
    text = strip_html(content)
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    return "\n".join(lines) if lines else None


def parse_description(html: str) -> dict:
    """Parse all structured data from a description HTML field.
    Returns dict with keys: tracklist, credits, notes, companies
    """
    result = {
        "tracklist": None,
        "credits": None,
        "notes": None,
        "companies": None,
    }

    if not html or "<" not in html:
        return result

    # Try tracklist parsing in order of specificity
    result["tracklist"] = parse_tracklist_classic(html)
    if not result["tracklist"]:
        result["tracklist"] = parse_tracklist_table(html)
    if not result["tracklist"]:
        result["tracklist"] = parse_tracklist_simple(html)

    # Credits, notes, companies (classic format only)
    result["credits"] = parse_credits(html)
    result["notes"] = parse_notes(html)
    result["companies"] = parse_companies(html)

    return result


def should_update_tracklist(existing: list | None, parsed: list | None) -> bool:
    """Only update tracklist if parsed has more tracks than existing."""
    if not parsed:
        return False
    if not existing:
        return True
    return len(parsed) > len(existing)


def main():
    parser = argparse.ArgumentParser(description="Parse description HTML into structured fields")
    parser.add_argument("--dry-run", action="store_true", help="Don't write to DB, just show results")
    parser.add_argument("--id", type=str, help="Process single release by ID (e.g. legacy-release-4104)")
    args = parser.parse_args()

    start = time.time()
    print("=" * 60)
    print("Description HTML Parser")
    print("=" * 60)

    pg_conn = get_pg_connection()
    pg_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Fetch releases with HTML description
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
    stats = {"tracklist_updated": 0, "credits_updated": 0, "notes_updated": 0, "companies_updated": 0, "errors": 0}

    for i, row in enumerate(rows):
        try:
            parsed = parse_description(row["description"])

            updates = {}
            params = []

            # Tracklist: only update if parsed has more tracks
            if should_update_tracklist(row["tracklist"], parsed["tracklist"]):
                updates["tracklist"] = "tracklist = %s::jsonb"
                params.append(json.dumps(parsed["tracklist"]))
                stats["tracklist_updated"] += 1

            # Credits: only update if currently NULL
            if parsed["credits"] and not row["credits"]:
                updates["credits"] = "credits = %s"
                params.append(parsed["credits"])
                stats["credits_updated"] += 1

            # Notes: store in notes column (we may need to add it)
            # For now, append to credits if notes exist
            if parsed["notes"]:
                stats["notes_updated"] += 1

            if parsed["companies"]:
                stats["companies_updated"] += 1

            # Build combined credits+notes+companies text
            if not row["credits"]:
                parts = []
                if parsed["credits"]:
                    parts.append(parsed["credits"])
                if parsed["companies"]:
                    parts.append(parsed["companies"])
                if parsed["notes"]:
                    parts.append(parsed["notes"])
                if parts and "credits" not in updates:
                    combined = "\n\n".join(parts)
                    updates["credits"] = "credits = %s"
                    params.append(combined)
                    stats["credits_updated"] += 1
                elif parts and "credits" in updates:
                    # Replace the credits param with combined
                    combined_parts = [parsed["credits"]] if parsed["credits"] else []
                    if parsed["companies"]:
                        combined_parts.append(parsed["companies"])
                    if parsed["notes"]:
                        combined_parts.append(parsed["notes"])
                    params[list(updates.keys()).index("credits")] = "\n\n".join(combined_parts)

            if not updates:
                continue

            if args.dry_run:
                print(f"\n  [{row['id']}] Would update:")
                if "tracklist" in updates:
                    print(f"    tracklist: {len(parsed['tracklist'])} tracks")
                    for t in parsed["tracklist"]:
                        dur = f" ({t['duration']})" if t.get("duration") else ""
                        print(f"      {t['position']}: {t['title']}{dur}")
                if "credits" in updates:
                    idx = list(updates.keys()).index("credits")
                    print(f"    credits: {params[idx][:200]}...")
                continue

            # Execute update
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
            print(f"\n  ERROR on {row['id']}: {e}")

    if not args.dry_run:
        pg_conn.commit()

    pg_conn.close()

    elapsed = time.time() - start
    print(f"\n\n{'=' * 60}")
    print("RESULTS")
    print(f"{'=' * 60}")
    print(f"  Processed:          {len(rows)} releases")
    print(f"  Tracklist updated:  {stats['tracklist_updated']}")
    print(f"  Credits updated:    {stats['credits_updated']}")
    print(f"  Notes found:        {stats['notes_updated']}")
    print(f"  Companies found:    {stats['companies_updated']}")
    print(f"  Errors:             {stats['errors']}")
    print(f"  Duration:           {elapsed:.1f}s")
    if args.dry_run:
        print("  MODE: DRY RUN (no changes written)")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
