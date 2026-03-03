#!/usr/bin/env python3
"""
Re-parse all tracklists from the description (moreinfo) HTML field.

Fixes:
- Missing first track when it follows a <div> tag
- Trailing &nbsp; and whitespace in track titles

Usage:
    cd VOD_Auctions/scripts
    python3 fix_tracklists.py
"""

import json
import re
import html as html_lib

import psycopg2
import psycopg2.extras

from shared import BATCH_SIZE, get_pg_connection


def parse_moreinfo(raw_html):
    """Parse legacy moreinfo HTML into structured tracklist + credits."""
    if not raw_html or not raw_html.strip():
        return None, None

    text = str(raw_html)
    tracklist = []
    credits_parts = []

    # Strategy 1: Discogs-style HTML with class names
    track_pattern = re.compile(
        r'<span[^>]*class="[^"]*trackPos[^"]*"[^>]*>([^<]*)</span>'
        r'.*?'
        r'<span[^>]*class="[^"]*trackTitle[^"]*"[^>]*>([^<]*)</span>'
        r'(?:.*?<span[^>]*class="[^"]*trackDuration[^"]*"[^>]*>([^<]*)</span>)?',
        re.DOTALL | re.IGNORECASE,
    )

    matches = track_pattern.findall(text)
    if matches:
        for pos, title, duration in matches:
            entry = {}
            pos = pos.strip()
            title = html_lib.unescape(title.strip()).replace('\xa0', '').strip()
            duration = duration.strip() if duration else None
            if pos:
                entry["position"] = pos
            if title:
                entry["title"] = title
            if duration:
                entry["duration"] = duration
            if entry.get("title"):
                tracklist.append(entry)

    # Strategy 2: Simple list patterns
    if not tracklist:
        line_pattern = re.compile(
            r'(?:^|<br\s*/?>|<p>|<li>|<div[^>]*>)\s*'
            r'([A-Z]?\d+\.?\s*[-–.]?\s*)'
            r'(.+?)(?=<br|<p>|<li>|</|$)',
            re.IGNORECASE | re.MULTILINE,
        )
        for pos_match, title_match in line_pattern.findall(text):
            title = re.sub(r'<[^>]+>', '', title_match).strip()
            title = html_lib.unescape(title)
            title = title.replace('\xa0', '').strip()
            pos = pos_match.strip().rstrip('.-– ')
            if title and len(title) > 1 and len(title) < 200:
                entry = {"title": title}
                if pos:
                    entry["position"] = pos
                tracklist.append(entry)

    # Extract credits
    credit_pattern = re.compile(
        r'(?:Written|Composed|Produced|Recorded|Mixed|Mastered|Engineered|'
        r'Artwork|Design|Photography|Liner Notes|Notes|Executive Producer|'
        r'Performer|Vocals?|Guitar|Bass|Drums?|Keyboards?|Synthesizer|'
        r'Published)\s*(?:by|:)\s*([^<\n]{2,100})',
        re.IGNORECASE,
    )
    for match in credit_pattern.finditer(text):
        credit_text = html_lib.unescape(match.group(0).strip())
        credit_text = re.sub(r'<[^>]+>', '', credit_text).strip()
        if credit_text:
            credits_parts.append(credit_text)

    return (tracklist if tracklist else None, "\n".join(credits_parts) if credits_parts else None)


def main():
    print("=== Re-parsing tracklists from description HTML ===")
    pg_conn = get_pg_connection()
    pg_cur = pg_conn.cursor()

    # Fetch all at once in batches
    pg_cur.execute(
        'SELECT COUNT(*) FROM "Release" WHERE description IS NOT NULL AND description != \'\''
    )
    total = pg_cur.fetchone()[0]
    print(f"  Releases with description: {total}")

    offset = 0
    updated = 0
    batch_size = 500

    while offset < total:
        pg_cur.execute(
            'SELECT id, description, tracklist FROM "Release" '
            'WHERE description IS NOT NULL AND description != \'\' '
            'ORDER BY id LIMIT %s OFFSET %s',
            (batch_size, offset)
        )
        rows = pg_cur.fetchall()
        if not rows:
            break

        update_values = []
        for release_id, description, old_tracklist in rows:
            tracklist, credits = parse_moreinfo(description)

            if tracklist:
                new_json = json.dumps(tracklist, ensure_ascii=False)
                old_json = json.dumps(old_tracklist, ensure_ascii=False) if old_tracklist else None
                if new_json != old_json:
                    update_values.append((json.dumps(tracklist), credits, release_id))

        # Batch update
        if update_values:
            psycopg2.extras.execute_batch(
                pg_cur,
                'UPDATE "Release" SET tracklist = %s::jsonb, '
                'credits = COALESCE(%s, credits) '
                'WHERE id = %s',
                update_values,
            )
            pg_conn.commit()
            updated += len(update_values)

        offset += batch_size
        print(f"  Processed {min(offset, total)}/{total} ({updated} updated)...", end="\r")

    pg_conn.commit()
    pg_cur.close()
    pg_conn.close()

    print(f"\n  Updated: {updated} releases")
    print("Done!")


if __name__ == "__main__":
    main()
