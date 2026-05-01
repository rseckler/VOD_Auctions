#!/usr/bin/env python3
"""
MiniMax Phase 5 Test — Genre/Style inference for 5 releases without Discogs cache.

Fetches 5 releases with NULL genres+styles, sends metadata to MiniMax-M2 as a
batched prompt (all 5 in one call — efficient with 1M context), and writes
results to docs/operations/minimax_phase5_test_results.md for review.

NO DB writes — dry-run only.

Usage:
    cd VOD_Auctions/scripts
    source venv/bin/activate
    python3 minimax_phase5_test.py
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# Load env: scripts/.env first, then backend/.env
_SCRIPT_DIR = Path(__file__).resolve().parent
for _p in [_SCRIPT_DIR / ".env", _SCRIPT_DIR.parent / "backend" / ".env"]:
    if _p.exists():
        load_dotenv(_p)

from minimax_client import m2_chat, strip_thinking

DB_URL = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
OUT_PATH = _SCRIPT_DIR.parent / "docs" / "operations" / "minimax_phase5_test_results.md"

GENRE_WHITELIST = [
    "Blues", "Brass & Military", "Children's", "Classical", "Electronic",
    "Folk, World, & Country", "Funk / Soul", "Hip Hop", "Jazz", "Latin",
    "Non-Music", "Pop", "Reggae", "Rock", "Stage & Screen",
]

SYSTEM_PROMPT = f"""You are a music metadata specialist. For each release, infer the best
genre(s) and style(s) based solely on the provided metadata (title, artist, label, format,
description, tracklist).

Genre rules:
- Choose 1–3 genres strictly from this whitelist: {json.dumps(GENRE_WHITELIST)}
- Most industrial/noise/experimental releases map to "Electronic" or "Rock"
- Do NOT invent new genres — only use values from the whitelist

Style rules:
- Choose 1–5 specific styles that describe the release (e.g. "Industrial", "Noise",
  "Dark Ambient", "EBM", "Power Electronics", "Minimal", "Techno", "Post-Punk")
- Styles are open — use your knowledge of music genres and the provided metadata
- Prefer established Discogs-style terms over invented ones

Output format — return ONLY valid JSON, no other text, no markdown fences:
[
  {{"release_id": "...", "genres": ["..."], "styles": ["...", "..."]}},
  ...
]
"""


def fetch_candidates(conn, limit: int = 5) -> list[dict]:
    """Fetch releases with NULL genres AND NULL styles, preferring ones with rich metadata."""
    sql = """
        SELECT
            r.id AS release_id,
            r.title,
            COALESCE(a."name", '') AS artist_name,
            COALESCE(l."name", '') AS label_name,
            COALESCE(r.format_v2, r."format"::text, '') AS format,
            COALESCE(r.description, '') AS description,
            COALESCE(r.credits, '') AS credits,
            r.year,
            r.country
        FROM "Release" r
        LEFT JOIN "Artist" a ON a.id = r."artistId"
        LEFT JOIN "Label" l ON l.id = r."labelId"
        WHERE COALESCE(array_length(r.genres, 1), 0) = 0
          AND COALESCE(array_length(r.styles, 1), 0) = 0
          AND r."product_category" = 'release'
          AND (r.description IS NOT NULL AND length(r.description) > 20
               OR r.credits IS NOT NULL AND length(r.credits) > 5)
        ORDER BY r."updatedAt" DESC
        LIMIT %s
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, (limit,))
        return [dict(r) for r in cur.fetchall()]


def fetch_tracks(conn, release_ids: list[str]) -> dict[str, list[str]]:
    """Fetch track titles per release."""
    if not release_ids:
        return {}
    sql = """
        SELECT "releaseId", COALESCE(title, '') AS title, position
        FROM "Track"
        WHERE "releaseId" = ANY(%s)
        ORDER BY "releaseId", COALESCE(position, ''), id
        LIMIT 200
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, (release_ids,))
        rows = cur.fetchall()

    result: dict[str, list[str]] = {}
    for row in rows:
        rid = row["releaseId"]
        label = f"{row['position']}. {row['title']}" if row["position"] else row["title"]
        result.setdefault(rid, []).append(label.strip())
    return result


def build_release_block(r: dict, tracks: list[str]) -> str:
    """Format one release as a text block for the prompt."""
    lines = [
        f"ID: {r['release_id']}",
        f"Title: {r['title']}",
        f"Artist: {r['artist_name'] or '(unknown)'}",
        f"Label: {r['label_name'] or '(unknown)'}",
        f"Format: {r['format'] or '(unknown)'}",
        f"Year: {r['year'] or '(unknown)'}",
        f"Country: {r['country'] or '(unknown)'}",
    ]
    if r["description"]:
        lines.append(f"Description: {r['description'][:500]}")
    if r["credits"]:
        lines.append(f"Credits: {r['credits'][:300]}")
    if tracks:
        lines.append(f"Tracklist: {' / '.join(tracks[:10])}")
    return "\n".join(lines)


def parse_m2_response(raw: str) -> list[dict]:
    """Strip thinking tags, then parse JSON from M2 response."""
    clean = strip_thinking(raw)
    # Remove any accidental markdown fences
    clean = re.sub(r"```(?:json)?", "", clean).strip()
    try:
        result = json.loads(clean)
        if isinstance(result, list):
            return result
    except json.JSONDecodeError as e:
        print(f"[warn] JSON parse failed: {e}\nRaw (first 500):\n{clean[:500]}", file=sys.stderr)
    return []


def write_md(releases: list[dict], proposals: list[dict], m2_result, raw_content: str, think_excerpt: str) -> Path:
    """Write results to .md file."""
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    proposal_map = {p["release_id"]: p for p in proposals}

    lines = [
        "# MiniMax Phase 5 Test — Genre/Style Inference",
        "",
        f"**Date:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}  ",
        f"**Model:** MiniMax-M2  ",
        f"**Releases tested:** {len(releases)}  ",
        f"**Tokens:** prompt={m2_result['prompt_tokens']} · completion={m2_result['completion_tokens']} · reasoning={m2_result['reasoning_tokens']} · total={m2_result['total_tokens']}  ",
        f"**Latency:** {m2_result['latency_ms']}ms  ",
        "",
        "---",
        "",
        "## Results",
        "",
    ]

    for r in releases:
        rid = r["release_id"]
        proposal = proposal_map.get(rid, {})
        genres = proposal.get("genres", [])
        styles = proposal.get("styles", [])

        lines += [
            f"### {r['title']}",
            f"**ID:** `{rid}`  ",
            f"**Artist:** {r['artist_name'] or '—'} · **Label:** {r['label_name'] or '—'} · **Format:** {r['format'] or '—'} · **Year:** {r['year'] or '—'}  ",
            "",
            f"**Proposed Genres:** {', '.join(genres) if genres else '_(none)_'}  ",
            f"**Proposed Styles:** {', '.join(styles) if styles else '_(none)_'}  ",
            "",
            "---",
            "",
        ]

    if think_excerpt:
        lines += [
            "## M2 Reasoning (first 600 chars of `<think>` block)",
            "",
            "```",
            think_excerpt[:600],
            "```",
            "",
        ]

    OUT_PATH.write_text("\n".join(lines), encoding="utf-8")
    return OUT_PATH


def main() -> int:
    if not DB_URL:
        print("ERROR: SUPABASE_DB_URL / DATABASE_URL not set", file=sys.stderr)
        return 1

    print("Connecting to DB…")
    conn = psycopg2.connect(DB_URL, connect_timeout=10)

    print("Fetching 5 candidate releases (NULL genres+styles, with metadata)…")
    releases = fetch_candidates(conn, limit=5)
    if not releases:
        print("No candidates found — all releases may already have genres/styles.", file=sys.stderr)
        return 1
    print(f"Found {len(releases)} releases")

    release_ids = [r["release_id"] for r in releases]
    tracks_by_release = fetch_tracks(conn, release_ids)
    conn.close()

    # Build batched prompt
    blocks = []
    for i, r in enumerate(releases, 1):
        tracks = tracks_by_release.get(r["release_id"], [])
        block = f"--- Release {i} ---\n{build_release_block(r, tracks)}"
        blocks.append(block)
        print(f"  {i}. {r['title']} ({r['artist_name']}) — {len(tracks)} tracks")

    user_content = "\n\n".join(blocks)

    print(f"\nSending {len(releases)} releases to MiniMax-M2 in one call…")
    m2_result = m2_chat(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        max_tokens=2000,
        log_reasoning=True,
    )

    print(f"Response: {m2_result['latency_ms']}ms · {m2_result['total_tokens']} tokens")

    # Extract thinking block for the report
    think_match = re.search(r"<think>([\s\S]*?)</think>", m2_result["content"])
    think_excerpt = think_match.group(1).strip() if think_match else ""

    proposals = parse_m2_response(m2_result["content"])
    print(f"Parsed {len(proposals)} proposals")

    out_file = write_md(releases, proposals, m2_result, m2_result["content"], think_excerpt)
    print(f"\nResults written to: {out_file}")

    # Console preview
    print("\n── Preview ───────────────────────────────────────────")
    proposal_map = {p["release_id"]: p for p in proposals}
    for r in releases:
        p = proposal_map.get(r["release_id"], {})
        print(f"  {r['title'][:45]:<45}  genres={p.get('genres',[])}  styles={p.get('styles',[])}")
    print("──────────────────────────────────────────────────────")

    return 0


if __name__ == "__main__":
    sys.exit(main())
