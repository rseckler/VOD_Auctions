#!/usr/bin/env python3
"""
Generate AI-powered entity content for VOD_Auctions entity pages.

Uses Claude Haiku (Anthropic API) to generate background descriptions
for bands (artists), labels, and press organizations.

Usage:
    python3 generate_entity_content.py --type artist --priority 1 --limit 50
    python3 generate_entity_content.py --type all --priority all --dry-run
    python3 generate_entity_content.py --type label --priority 2 --force
"""

import argparse
import os
import sys
import time
import uuid
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path

# Load .env from parent directory (VOD_Auctions/.env)
load_dotenv(Path(__file__).parent.parent / ".env")

# Lazy import — only needed when not in --dry-run mode
_anthropic_client = None


def get_anthropic_client():
    """Lazy-init the Anthropic client."""
    global _anthropic_client
    if _anthropic_client is None:
        from anthropic import Anthropic
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            print("ERROR: ANTHROPIC_API_KEY not set in .env")
            sys.exit(1)
        _anthropic_client = Anthropic(api_key=api_key)
    return _anthropic_client


# ---------------------------------------------------------------------------
# Database connection (follows shared.py pattern)
# ---------------------------------------------------------------------------

def get_pg_conn():
    """Create PostgreSQL connection to Supabase."""
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("ERROR: SUPABASE_DB_URL not set in .env")
        print("Get it from: Supabase Dashboard -> Settings -> Database -> Connection String (URI)")
        sys.exit(1)
    return psycopg2.connect(db_url)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MODEL = "claude-haiku-4-5-20251001"
MAX_REQUESTS_PER_MINUTE = 50

ENTITY_TYPES = ["artist", "label", "press_orga"]

# Table and ID column mapping per entity type
ENTITY_CONFIG = {
    "artist": {
        "table": '"Artist"',
        "id_col": "id",
        "name_col": "name",
        "release_join": '"Release"."artistId"',
    },
    "label": {
        "table": '"Label"',
        "id_col": "id",
        "name_col": "name",
        "release_join": '"Release"."labelId"',
    },
    "press_orga": {
        "table": '"PressOrga"',
        "id_col": "id",
        "name_col": "name",
        "release_join": '"Release"."pressOrgaId"',
    },
}

# Word count targets per priority level
WORD_TARGETS = {
    1: (200, 400),  # P1: >10 releases
    2: (100, 200),  # P2: 3-10 releases
    3: (50, 100),   # P3: 1-2 releases
}

# Release count thresholds
PRIORITY_THRESHOLDS = {
    1: (11, None),   # >10
    2: (3, 10),      # 3-10
    3: (1, 2),       # 1-2
}


def generate_entity_id(entity_type: str) -> str:
    """Generate a unique ID for entity_content rows."""
    return f"ec-{entity_type[:3]}-{uuid.uuid4().hex[:16]}"


# ---------------------------------------------------------------------------
# Fetch entities with release counts, filtered by priority
# ---------------------------------------------------------------------------

def fetch_entities(pg_conn, entity_type: str, priority: int | None, limit: int | None, force: bool):
    """
    Fetch entities of the given type, filtered by priority (release count range).
    Returns list of dicts: {id, name, release_count}
    """
    cfg = ENTITY_CONFIG[entity_type]
    min_count, max_count = (1, None) if priority is None else PRIORITY_THRESHOLDS[priority]

    cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Build the query: entity + release count + optional exclusion of existing content
    having_clause = f"HAVING COUNT(\"Release\".\"id\") >= {min_count}"
    if max_count is not None:
        having_clause += f" AND COUNT(\"Release\".\"id\") <= {max_count}"

    skip_existing = ""
    if not force:
        skip_existing = f"""
            AND {cfg['table']}.{cfg['id_col']} NOT IN (
                SELECT entity_id FROM entity_content
                WHERE entity_type = %s
            )
        """

    query = f"""
        SELECT
            {cfg['table']}.{cfg['id_col']} AS id,
            {cfg['table']}.{cfg['name_col']} AS name,
            COUNT("Release"."id") AS release_count
        FROM {cfg['table']}
        JOIN "Release" ON {cfg['release_join']} = {cfg['table']}.{cfg['id_col']}
        WHERE 1=1
        {skip_existing}
        GROUP BY {cfg['table']}.{cfg['id_col']}, {cfg['table']}.{cfg['name_col']}
        {having_clause}
        ORDER BY COUNT("Release"."id") DESC
    """

    params = []
    if not force:
        params.append(entity_type)

    if limit:
        query += " LIMIT %s"
        params.append(limit)

    cur.execute(query, params)
    rows = cur.fetchall()
    cur.close()
    return rows


def get_sample_releases(pg_conn, entity_type: str, entity_id: str, limit: int = 10) -> list[dict]:
    """Fetch sample release titles/labels/years for context."""
    cfg = ENTITY_CONFIG[entity_type]
    cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute(f"""
        SELECT "Release"."title", "Release"."year", "Release"."country",
               "Release"."format", "Label"."name" AS label_name
        FROM "Release"
        LEFT JOIN "Label" ON "Release"."labelId" = "Label"."id"
        WHERE {cfg['release_join']} = %s
        ORDER BY "Release"."year" ASC NULLS LAST
        LIMIT %s
    """, (entity_id, limit))

    rows = cur.fetchall()
    cur.close()
    return rows


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

def build_prompt(entity_type: str, name: str, release_count: int, priority: int,
                 sample_releases: list[dict]) -> str:
    """Build the Claude prompt for content generation."""
    min_words, max_words = WORD_TARGETS[priority]

    # Format sample releases for context
    release_lines = []
    for r in sample_releases:
        parts = [r.get("title", "")]
        if r.get("year"):
            parts.append(f"({r['year']})")
        if r.get("label_name"):
            parts.append(f"on {r['label_name']}")
        if r.get("format"):
            parts.append(f"[{r['format']}]")
        release_lines.append(" ".join(parts))

    releases_text = "\n".join(f"  - {line}" for line in release_lines) if release_lines else "  (no release data available)"

    if entity_type == "artist":
        focus = (
            "Focus on their musical style, history, key releases, and influence on "
            "industrial, experimental, noise, dark ambient, or related underground music scenes. "
            "Mention notable collaborations or side projects if relevant."
        )
        entity_label = "artist/band"
    elif entity_type == "label":
        focus = (
            "Focus on the label's founding, philosophy, artist roster, notable releases, "
            "and its significance within the industrial, experimental, and underground music community. "
            "Mention the label's geographic base and format preferences (tapes, vinyl, CD) if apparent."
        )
        entity_label = "record label"
    else:  # press_orga
        focus = (
            "Focus on the publication type (magazine, fanzine, newsletter), its content focus, "
            "target audience, significance within the industrial/experimental music press landscape, "
            "and any notable features, interviews, or coverage areas."
        )
        entity_label = "press organization/publication"

    prompt = f"""Write a concise, informative background description for the {entity_label} "{name}".

{focus}

This entity has {release_count} release(s) in our archive. Here are some sample releases for context:
{releases_text}

Requirements:
- Write in English
- Write {min_words}-{max_words} words for the description
- Be factual; if you're uncertain about specific details, focus on what can be inferred from the release data
- Do not invent specific dates, member names, or facts unless you are confident they are correct
- Write in an encyclopedic, neutral tone suitable for a music archive/auction platform
- Do not use markdown formatting, just plain text paragraphs

Also provide a SHORT_DESCRIPTION: a single sentence (max 160 characters) summarizing the entity, suitable for SEO meta description.

Format your response exactly as:
DESCRIPTION:
[your description here]

SHORT_DESCRIPTION:
[your single sentence here]"""

    return prompt


# ---------------------------------------------------------------------------
# API call with rate limiting
# ---------------------------------------------------------------------------

_last_request_times: list[float] = []


def rate_limit_wait():
    """Enforce max 50 requests per minute."""
    global _last_request_times
    now = time.time()

    # Remove timestamps older than 60 seconds
    _last_request_times = [t for t in _last_request_times if now - t < 60]

    if len(_last_request_times) >= MAX_REQUESTS_PER_MINUTE:
        sleep_time = 60 - (now - _last_request_times[0]) + 0.1
        if sleep_time > 0:
            print(f"  Rate limit: sleeping {sleep_time:.1f}s...")
            time.sleep(sleep_time)

    _last_request_times.append(time.time())


def call_claude(prompt: str) -> tuple[str, str]:
    """
    Call Claude Haiku and return (description, short_description).
    Raises on API errors.
    """
    rate_limit_wait()

    client = get_anthropic_client()
    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()

    # Parse the structured response
    description = ""
    short_description = ""

    if "DESCRIPTION:" in text and "SHORT_DESCRIPTION:" in text:
        parts = text.split("SHORT_DESCRIPTION:")
        description = parts[0].replace("DESCRIPTION:", "").strip()
        short_description = parts[1].strip()
    else:
        # Fallback: use entire response as description
        description = text
        short_description = text[:157] + "..." if len(text) > 160 else text

    # Enforce short_description length
    if len(short_description) > 160:
        # Truncate at last space before 157 chars, add ...
        short_description = short_description[:157].rsplit(" ", 1)[0] + "..."

    return description, short_description


# ---------------------------------------------------------------------------
# Insert/upsert into entity_content
# ---------------------------------------------------------------------------

def upsert_entity_content(pg_conn, entity_type: str, entity_id: str,
                          description: str, short_description: str, force: bool):
    """Insert or update entity_content row."""
    cur = pg_conn.cursor()
    now = datetime.now(timezone.utc)
    content_id = generate_entity_id(entity_type)

    if force:
        # Upsert: update if exists, insert if not
        cur.execute("""
            INSERT INTO entity_content (id, entity_type, entity_id, description, short_description,
                                        is_published, ai_generated, ai_generated_at, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, true, true, %s, %s, %s)
            ON CONFLICT (entity_type, entity_id)
            DO UPDATE SET
                description = EXCLUDED.description,
                short_description = EXCLUDED.short_description,
                ai_generated = true,
                ai_generated_at = EXCLUDED.ai_generated_at,
                updated_at = EXCLUDED.updated_at
        """, (content_id, entity_type, entity_id, description, short_description,
              now, now, now))
    else:
        cur.execute("""
            INSERT INTO entity_content (id, entity_type, entity_id, description, short_description,
                                        is_published, ai_generated, ai_generated_at, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, true, true, %s, %s, %s)
        """, (content_id, entity_type, entity_id, description, short_description,
              now, now, now))

    pg_conn.commit()
    cur.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def determine_priority(release_count: int) -> int:
    """Determine priority level from release count."""
    if release_count > 10:
        return 1
    elif release_count >= 3:
        return 2
    else:
        return 3


def process_entities(pg_conn, entity_type: str, priority: int | None, limit: int | None,
                     dry_run: bool, force: bool):
    """Process all entities of a given type and priority."""
    priority_label = f"P{priority}" if priority else "all priorities"
    print(f"\n{'='*60}")
    print(f"Processing: {entity_type} ({priority_label})")
    print(f"{'='*60}")

    entities = fetch_entities(pg_conn, entity_type, priority, limit, force)
    total = len(entities)

    if total == 0:
        print(f"  No entities to process.")
        return 0, 0

    print(f"  Found {total} entities to process.")

    generated = 0
    errors = 0

    for i, entity in enumerate(entities, 1):
        name = entity["name"]
        entity_id = entity["id"]
        release_count = int(entity["release_count"])
        pri = determine_priority(release_count)

        if dry_run:
            print(f"  [{i}/{total}] DRY RUN: {name} (releases: {release_count}, P{pri})")
            generated += 1
            continue

        try:
            # Get sample releases for context
            samples = get_sample_releases(pg_conn, entity_type, entity_id, limit=10)

            # Build prompt and call API
            prompt = build_prompt(entity_type, name, release_count, pri, samples)
            description, short_description = call_claude(prompt)

            # Save to DB
            upsert_entity_content(pg_conn, entity_type, entity_id,
                                  description, short_description, force)

            generated += 1
            word_count = len(description.split())
            print(f"  Generated {generated}/{total} {entity_type}s ({priority_label}): "
                  f"{name} ({word_count} words, {len(short_description)} chars meta)")

        except Exception as e:
            errors += 1
            print(f"  ERROR [{i}/{total}] {name}: {e}")
            # Rollback any failed transaction
            try:
                pg_conn.rollback()
            except Exception:
                pass

    print(f"\n  Done: {generated} generated, {errors} errors out of {total} entities.")
    return generated, errors


def main():
    parser = argparse.ArgumentParser(
        description="Generate AI content for VOD_Auctions entity pages (bands, labels, press orgs)."
    )
    parser.add_argument(
        "--type",
        choices=["artist", "label", "press_orga", "all"],
        default="all",
        help="Entity type to process (default: all)",
    )
    parser.add_argument(
        "--priority",
        choices=["1", "2", "3", "all"],
        default="all",
        help="Priority level: 1 (>10 releases), 2 (3-10), 3 (1-2), all (default: all)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max number of entities to process per type/priority combination",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List entities without generating content",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate content even if it already exists",
    )

    args = parser.parse_args()

    # Determine types to process
    types = ENTITY_TYPES if args.type == "all" else [args.type]

    # Determine priorities to process
    if args.priority == "all":
        priorities = [1, 2, 3]
    else:
        priorities = [int(args.priority)]

    print(f"Entity Content Generator")
    print(f"  Model: {MODEL}")
    print(f"  Types: {', '.join(types)}")
    print(f"  Priorities: {', '.join(f'P{p}' for p in priorities)}")
    print(f"  Limit: {args.limit or 'none'}")
    print(f"  Dry run: {args.dry_run}")
    print(f"  Force regenerate: {args.force}")

    # Connect to database
    pg_conn = get_pg_conn()
    print(f"  Database: connected")

    total_generated = 0
    total_errors = 0

    try:
        for entity_type in types:
            for priority in priorities:
                gen, err = process_entities(
                    pg_conn, entity_type, priority, args.limit,
                    args.dry_run, args.force
                )
                total_generated += gen
                total_errors += err
    finally:
        pg_conn.close()

    print(f"\n{'='*60}")
    print(f"TOTAL: {total_generated} generated, {total_errors} errors")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
