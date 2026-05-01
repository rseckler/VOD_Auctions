#!/usr/bin/env python3
"""
Entity Content Overhaul — MiniMax M2 Pilot Test
Runs Write + Score pipeline for N entities using MiniMax-M2 instead of GPT-4o/mini.
NO DB writes. Results → docs/operations/entity_overhaul_m2_test_results.md for Frank's review.

Pipeline:
  Enrich (no LLM) → Profile (M2 fallback if no OPENAI_API_KEY) → Write (M2) → Score (M2) → .md

Usage (on VPS):
    cd /root/VOD_Auctions/scripts && source venv/bin/activate
    python3 entity_overhaul_m2_test.py               # 5 entities, all types
    python3 entity_overhaul_m2_test.py --limit 10    # more entities
    python3 entity_overhaul_m2_test.py --type artist # only artists
"""

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras

# ── Env + path ────────────────────────────────────────────────────────────────
_SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPT_DIR / "entity_overhaul"))

from dotenv import load_dotenv
for _p in [_SCRIPT_DIR / ".env", _SCRIPT_DIR.parent / "backend" / ".env"]:
    if _p.exists():
        load_dotenv(_p)

import os
DB_URL = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
MINIMAX_API_KEY = os.environ.get("MINIMAX_API_KEY", "")

from minimax_client import m2_chat, strip_thinking, M2Error
from enricher import enrich_entity
from tone_mapping import TONE_MAP, classify_tone
from config import TONE_EXAMPLES_DIR, WORD_TARGETS, QUALITY_ACCEPT_THRESHOLD, QUALITY_REVISE_THRESHOLD

# Try importing the GPT-4o-mini profiler; fall back to M2 if OPENAI_API_KEY missing
_OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
if _OPENAI_KEY:
    from profiler import profile_entity as _gpt_profile
    _USE_M2_PROFILER = False
else:
    print("[init] OPENAI_API_KEY not set — using M2 for profiling", flush=True)
    _USE_M2_PROFILER = True

OUT_PATH = _SCRIPT_DIR.parent / "docs" / "operations" / "entity_overhaul_m2_test_results.md"


# ── M2 Profiler (fallback when OPENAI_API_KEY not set) ───────────────────────

def profile_entity_m2(enriched: dict) -> dict:
    """M2-based profiler — classifies tone, genre, significance tier."""
    entity = enriched["entity"]
    internal = enriched.get("internal") or {}
    mb = enriched.get("musicbrainz") or {}
    wiki = enriched.get("wikipedia") or {}
    lastfm = enriched.get("lastfm") or {}
    merged_genres = enriched.get("merged_genres", [])

    # Rule-based tone as starting point
    tone_key = classify_tone(merged_genres)

    release_count = internal.get("release_count", 0)
    if release_count > 10:
        priority = "P1"
    elif release_count >= 3:
        priority = "P2"
    else:
        priority = "P3"

    context_lines = [
        f"Entity: {entity['name']} (type: {entity['type']})",
        f"Releases in archive: {release_count}",
    ]
    if merged_genres:
        context_lines.append(f"Genre tags: {', '.join(merged_genres[:15])}")
    if mb.get("area"):
        context_lines.append(f"Location: {mb['area']}")
    if mb.get("begin"):
        context_lines.append(f"Active from: {mb['begin']}")
    if lastfm.get("similar_artists"):
        context_lines.append(f"Similar artists: {', '.join(lastfm['similar_artists'][:8])}")
    if wiki.get("extract"):
        context_lines.append(f"Wikipedia: {wiki['extract'][:300]}")
    for rel in internal.get("releases", [])[:6]:
        parts = [rel.get("title", "")]
        if rel.get("year"):
            parts.append(f"({rel['year']})")
        context_lines.append(f"Release: {' '.join(parts)}")

    prompt = f"""Classify this music entity for a specialist industrial/experimental music platform.

DATA:
{chr(10).join(context_lines)}

Initial tone classification: {tone_key}

Return ONLY valid JSON:
{{
  "primary_genre": "single most accurate genre",
  "secondary_genres": ["2-3 secondary genres"],
  "tone_directive": "{tone_key} or corrected tone from: dark_ambient/power_electronics/industrial/noise/minimal_synth/experimental/neofolk/death_industrial/drone/ebm",
  "significance_tier": "iconic/significant/notable/obscure",
  "descriptors": ["3-5 style descriptors"],
  "emphasis": ["2-3 things to emphasize in writing"],
  "avoid": ["1-2 things to avoid"],
  "key_talking_points": ["2-3 concrete talking points from the data"]
}}"""

    try:
        result = m2_chat([{"role": "user", "content": prompt}], max_tokens=800, log_reasoning=False)
        clean = strip_thinking(result["content"])
        clean = re.sub(r"```(?:json)?", "", clean).strip()
        data = json.loads(clean)
        data["priority"] = priority
        # Extract member data from MusicBrainz (same as original profiler)
        data["member_data"] = [
            {"name": m.get("name"), "roles": m.get("roles", []),
             "begin": m.get("begin"), "end": m.get("end")}
            for m in mb.get("members", [])[:10]
        ]
        return data
    except Exception as e:
        # Minimal fallback — writing still works
        return {
            "tone_directive": tone_key, "primary_genre": merged_genres[0] if merged_genres else "experimental",
            "secondary_genres": merged_genres[1:3], "significance_tier": "obscure",
            "descriptors": [], "emphasis": [], "avoid": [],
            "key_talking_points": [], "priority": priority, "member_data": [],
        }


def profile_entity(enriched: dict) -> dict:
    """Route to GPT-4o-mini or M2 profiler depending on key availability."""
    if _USE_M2_PROFILER:
        return profile_entity_m2(enriched)
    return _gpt_profile(enriched)


# ── M2 Writer ─────────────────────────────────────────────────────────────────

def _build_context(enriched: dict, profile: dict) -> str:
    entity = enriched["entity"]
    internal = enriched.get("internal") or {}
    mb = enriched.get("musicbrainz") or {}
    wiki = enriched.get("wikipedia") or {}
    lastfm = enriched.get("lastfm") or {}

    lines = [
        f"ENTITY: {entity['name']}",
        f"TYPE: {entity['type']}",
        f"RELEASES IN ARCHIVE: {internal.get('release_count', 0)}",
    ]
    if mb.get("area"):
        lines.append(f"LOCATION: {mb['area']}")
    elif enriched.get("merged_country"):
        lines.append(f"LOCATION: {enriched['merged_country']}")

    yr = enriched.get("merged_year_range") or {}
    if yr.get("start"):
        lines.append(f"ACTIVE: {yr['start']}–{yr.get('end') or 'present'}")
    if mb.get("ended"):
        lines.append("STATUS: Dissolved/Inactive")
    if internal.get("formats"):
        lines.append(f"FORMAT DISTRIBUTION: {json.dumps(internal['formats'])}")
    if internal.get("labels_released_on"):
        lines.append(f"LABELS: {', '.join(l['name'] for l in internal['labels_released_on'][:12])}")
    if internal.get("key_artists"):
        key_artists_str = ", ".join(f"{a['name']} ({a['cnt']})" for a in internal["key_artists"][:10])
        lines.append(f"KEY ARTISTS: {key_artists_str}")
    if lastfm.get("similar_artists"):
        lines.append(f"SIMILAR ARTISTS: {', '.join(lastfm['similar_artists'][:8])}")
    if lastfm.get("listeners"):
        lines.append(f"LAST.FM LISTENERS: {lastfm['listeners']:,}")

    if profile.get("member_data"):
        lines.append("\nMEMBERS (from MusicBrainz):")
        for m in profile["member_data"]:
            roles = ", ".join(m.get("roles", [])) or "unknown role"
            lines.append(f"  - {m['name']} — {roles} ({m.get('begin', '?')}–{m.get('end') or 'present'})")

    if wiki.get("extract"):
        lines.append(f"\nWIKIPEDIA REFERENCE (use as factual source, do NOT copy):\n{wiki['extract'][:500]}")

    lines.append("\nSAMPLE RELEASES FROM ARCHIVE:")
    for rel in internal.get("releases", [])[:12]:
        parts = [rel.get("title", "")]
        if rel.get("year"):
            parts.append(f"({rel['year']})")
        if rel.get("label_name") or rel.get("artist_name"):
            parts.append(f"— {rel.get('artist_name') or rel.get('label_name', '')}")
        if rel.get("format_name"):
            parts.append(f"[{rel['format_name']}]")
        lines.append(f"  - {' '.join(parts)}")

    return "\n".join(lines)


def write_entity_m2(enriched: dict, profile: dict) -> dict:
    entity = enriched["entity"]
    tone_key = profile.get("tone_directive", "experimental")
    tone_info = TONE_MAP.get(tone_key, TONE_MAP["experimental"])
    priority = profile.get("priority", "P2")
    min_words, max_words = WORD_TARGETS.get(priority, (150, 250))

    # Load tone examples
    et = entity["type"]
    example_file = TONE_EXAMPLES_DIR / ("labels.txt" if et == "label" else "press_orgs.txt" if et == "press_orga" else tone_info["example_file"])
    examples = example_file.read_text()[:3000] if example_file.exists() else ""

    context = _build_context(enriched, profile)

    system_prompt = f"""You are writing for VOD Auctions, a specialist online platform for industrial and experimental music — vinyl, tapes, CDs, and publications. Your audience: collectors, DJs, scene veterans, and curious newcomers who know this music deeply.

Your writing voice for THIS entity is: {tone_key}.

STYLE RULES FOR "{tone_key}":
- Vocabulary palette: {', '.join(tone_info['vocabulary'])}
- Sentence rhythm: {tone_info['rhythm']}
- Perspective: {tone_info['perspective']}

ABSOLUTE RULES:
- DO NOT write like Wikipedia or an encyclopedia.
- DO NOT use banned phrases: "limited documentation exists", "broader landscape", "broader context", "characterized by", "formative period", "fundamentally shaped", "sonic exploration", "boundary-pushing", "it's worth noting", "unique blend", "tapestry of sound", "exploring the boundaries", "a testament to".
- DO NOT begin with "[Name] is a [type]..." — find a compelling opening.
- DO NOT pad sparse data with filler — if data is sparse, write LESS.
- DO NOT sanitize. If the music is harsh, say so.
- DO weave member names into the narrative naturally.
- DO reference specific releases from the catalog data.
- DO place the entity in its scene context (geographic, temporal, aesthetic).
- DO use the vocabulary palette naturally.

Write {min_words}–{max_words} words."""

    user_prompt = f"""Write a description for: {entity['name']}

{context}

PROFILE (from Profiler):
- Primary genre: {profile.get('primary_genre', 'experimental')}
- Descriptors: {', '.join(profile.get('descriptors', []))}
- Emphasis: {', '.join(profile.get('emphasis', []))}
- Avoid: {', '.join(profile.get('avoid', []))}
- Key talking points: {json.dumps(profile.get('key_talking_points', []))}
- Significance: {profile.get('significance_tier', 'unknown')}

FORMAT YOUR RESPONSE EXACTLY AS:
DESCRIPTION:
[plain text paragraphs, no markdown]

MEMBERS:
[one per line: "- Name — Role(s) (years)" or "No member data available"]"""

    messages = [{"role": "system", "content": system_prompt}]
    if examples:
        messages.append({"role": "user", "content": f"Example descriptions in the {tone_key} tone:\n\n{examples}"})
        messages.append({"role": "assistant", "content": "Understood. I'll match this tone and quality level."})
    messages.append({"role": "user", "content": user_prompt})

    try:
        result = m2_chat(messages, max_tokens=2500, log_reasoning=True)
    except M2Error as e:
        return {"description": None, "members_block": None, "error": str(e), "latency_ms": 0, "tokens": {}}

    clean = strip_thinking(result["content"])
    description, members_block = "", ""
    if "DESCRIPTION:" in clean:
        parts = clean.split("DESCRIPTION:", 1)[1]
        if "MEMBERS:" in parts:
            description, members_block = parts.split("MEMBERS:", 1)
        else:
            description = parts
    else:
        description = clean

    return {
        "description": description.strip(),
        "members_block": members_block.strip() if members_block else None,
        "error": None,
        "latency_ms": result["latency_ms"],
        "tokens": {
            "prompt": result["prompt_tokens"],
            "completion": result["completion_tokens"],
            "reasoning": result["reasoning_tokens"],
            "total": result["total_tokens"],
        },
    }


# ── M2 Quality Scorer ─────────────────────────────────────────────────────────

def score_entity_m2(entity_name: str, entity_type: str, description: str, profile: dict, enriched: dict) -> dict:
    tone_key = profile.get("tone_directive", "experimental")
    merged_genres = enriched.get("merged_genres", [])
    mb = enriched.get("musicbrainz") or {}
    member_names = [m["name"] for m in mb.get("members", [])[:6]]

    prompt = f"""You are a quality reviewer for VOD Auctions, a specialist industrial/experimental music platform.

Score this entity description. Be strict — generic AI-sounding text scores LOW.

ENTITY: {entity_name} ({entity_type})
ASSIGNED TONE: {tone_key}
EXPECTED GENRES: {', '.join(merged_genres[:8])}
HAS MEMBER DATA: {bool(mb.get('members'))}
MEMBER NAMES: {', '.join(member_names)}
SIGNIFICANCE: {profile.get('significance_tier', 'unknown')}

DESCRIPTION:
{description}

Score each criterion 0–100:
1. TONE_MATCH (25%): Does writing match the "{tone_key}" tone? Right vocabulary and rhythm?
2. FACTUAL_GROUNDING (20%): Are dates, names, releases verifiable? No hallucinated facts?
3. INDIVIDUALITY (20%): SWAP TEST — could this describe a different entity in the same genre? Unique opening?
4. STRUCTURAL_COMPLETENESS (15%): Key releases referenced? Members mentioned if data available?
5. SEO_QUALITY (10%): Unique searchable terms? Genre keywords present?
6. ANTI_AI_ISM (10%): No banned phrases ("characterized by", "sonic exploration", etc.)? Doesn't start with "[Name] is a [type]..."?

Return ONLY valid JSON (no markdown fences):
{{
  "total_score": weighted_average,
  "scores": {{
    "tone_match": 0-100,
    "factual_grounding": 0-100,
    "individuality": 0-100,
    "structural_completeness": 0-100,
    "seo_quality": 0-100,
    "anti_ai_ism": 0-100
  }},
  "feedback": ["2-4 specific issues or strengths"],
  "revision_instructions": "fix instructions or null if score >= {QUALITY_ACCEPT_THRESHOLD}"
}}"""

    try:
        result = m2_chat([{"role": "user", "content": prompt}], max_tokens=1500, log_reasoning=True)
        clean = strip_thinking(result["content"])
        clean = re.sub(r"```(?:json)?", "", clean).strip()
        data = json.loads(clean)
        score = data.get("total_score", 0)
        data["decision"] = "accept" if score >= QUALITY_ACCEPT_THRESHOLD else "revise" if score >= QUALITY_REVISE_THRESHOLD else "reject"
        data["latency_ms"] = result["latency_ms"]
        data["tokens"] = {
            "prompt": result["prompt_tokens"],
            "completion": result["completion_tokens"],
            "reasoning": result["reasoning_tokens"],
            "total": result["total_tokens"],
        }
        return data
    except (json.JSONDecodeError, M2Error) as e:
        return {
            "total_score": 0, "decision": "error", "scores": {},
            "feedback": [f"Scoring failed: {e}"],
            "revision_instructions": None, "latency_ms": 0, "tokens": {},
        }


# ── Entity Fetching ───────────────────────────────────────────────────────────

def fetch_entities(conn, entity_type: str, limit: int) -> list[dict]:
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    results = []

    type_configs = {
        "artist":     ('"Artist"',    '"artistId"'),
        "label":      ('"Label"',     '"labelId"'),
        "press_orga": ('"PressOrga"', '"pressOrgaId"'),
    }
    types = [entity_type] if entity_type != "all" else ["artist", "label", "press_orga"]
    per_type = max(1, limit // len(types))
    leftover = limit - per_type * len(types)

    for i, et in enumerate(types):
        table, fk = type_configs[et]
        n = per_type + (1 if i < leftover else 0)
        cur.execute(f"""
            SELECT e.id AS entity_id, e.name AS entity_name, '{et}' AS entity_type,
                   COUNT(r.id)::int AS release_count
            FROM {table} e
            LEFT JOIN "Release" r ON r.{fk} = e.id
            WHERE e.name != 'Various'
            GROUP BY e.id, e.name
            HAVING COUNT(r.id) > 3
            ORDER BY COUNT(r.id) DESC
            LIMIT %s
        """, (n,))
        results.extend([dict(r) for r in cur.fetchall()])

    cur.close()
    return results[:limit]


# ── .md Output ────────────────────────────────────────────────────────────────

def write_md(all_results: list[dict]) -> Path:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    ok = [r for r in all_results if not r.get("error") and r.get("write_result")]
    total_tokens = sum(
        r["write_result"]["tokens"].get("total", 0) + r["score_result"]["tokens"].get("total", 0)
        for r in ok
    )
    accepted = sum(1 for r in ok if r["score_result"]["decision"] == "accept")
    revised  = sum(1 for r in ok if r["score_result"]["decision"] == "revise")
    rejected = sum(1 for r in ok if r["score_result"]["decision"] in ("reject", "error"))
    avg_score = sum(r["score_result"]["total_score"] for r in ok) / max(len(ok), 1)

    lines = [
        "# Entity Content Overhaul — MiniMax M2 Pilot Test",
        "",
        f"**Date:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}  ",
        f"**Entities tested:** {len(all_results)}  ",
        f"**Total tokens:** {total_tokens:,} · **Kosten: €0** (Token Plan)  ",
        f"**Writer:** MiniMax-M2 · **Quality Scorer:** MiniMax-M2 · **Profiler:** {'MiniMax-M2' if _USE_M2_PROFILER else 'GPT-4o-mini'}  ",
        "",
        "> **Frank — bitte kurz reviewen:**",
        "> Für jede Entity am Ende deinen Daumen hinterlassen (👍 = veröffentlichbar / 👎 = nicht gut genug / 🤔 = geht so).",
        "> Hauptfrage: Würdest du diesen Text so auf vod-auctions.com zeigen?",
        "",
        "---",
        "",
        "## Zusammenfassung",
        "",
        "| | |",
        "|---|---|",
        f"| ✅ Accepted (Score ≥ 75) | {accepted}/{len(ok)} |",
        f"| 🟡 Revise (Score 50–74) | {revised}/{len(ok)} |",
        f"| ❌ Rejected (< 50) | {rejected}/{len(ok)} |",
        f"| Ø Score | **{avg_score:.1f}/100** |",
        "",
        "---",
        "",
    ]

    for r in all_results:
        entity = r["entity"]
        name  = entity["entity_name"]
        etype = entity["entity_type"]
        err   = r.get("error")

        lines += [f"## {name}", ""]

        profile = r.get("profile", {})
        lines.append(
            f"**Typ:** {etype} · "
            f"**Releases:** {entity['release_count']} · "
            f"**Tier:** {profile.get('significance_tier', '?')} · "
            f"**Tone:** `{profile.get('tone_directive', '?')}` · "
            f"**ID:** `{entity['entity_id']}`"
        )
        lines.append("")

        if err:
            lines += [f"> ⚠️ Fehler: `{err}`", "", "---", ""]
            continue

        wr = r["write_result"]
        sr = r["score_result"]

        # ── Description ───────────────────────────────────────────────────────
        desc = wr.get("description", "")
        word_count = len(desc.split()) if desc else 0
        lines += ["### Beschreibung", "", f"_{word_count} Wörter_", ""]
        lines.append(desc if desc else "_Kein Text generiert._")
        lines.append("")

        # ── Members ───────────────────────────────────────────────────────────
        members = wr.get("members_block", "")
        if members and members.strip() and "No member data" not in members:
            lines += ["### Members", "", members, ""]

        # ── Quality Score ─────────────────────────────────────────────────────
        scores   = sr.get("scores", {})
        decision = sr.get("decision", "?")
        total    = sr.get("total_score", 0)
        emoji    = {"accept": "✅", "revise": "🟡", "reject": "❌", "error": "⚠️"}.get(decision, "?")

        lines += [
            "### Quality Score (von M2 bewertet)",
            "",
            f"**{emoji} {decision.upper()} — {total}/100**",
            "",
            "| Kriterium | Gewicht | Score |",
            "|---|---|---|",
            f"| Tone Match | 25% | {scores.get('tone_match', '?')}/100 |",
            f"| Factual Grounding | 20% | {scores.get('factual_grounding', '?')}/100 |",
            f"| Individuality (Swap-Test) | 20% | {scores.get('individuality', '?')}/100 |",
            f"| Structural Completeness | 15% | {scores.get('structural_completeness', '?')}/100 |",
            f"| SEO Quality | 10% | {scores.get('seo_quality', '?')}/100 |",
            f"| Anti-AI-ism | 10% | {scores.get('anti_ai_ism', '?')}/100 |",
            "",
        ]

        feedback = sr.get("feedback", [])
        if feedback:
            lines.append("**M2 Feedback:**")
            for fb in feedback:
                lines.append(f"- {fb}")
            lines.append("")

        revision = sr.get("revision_instructions")
        if revision:
            lines += [f"**Revision nötig:** {revision}", ""]

        # ── Token Stats (collapsed) ────────────────────────────────────────────
        wt = wr.get("tokens", {})
        st = sr.get("tokens", {})
        lines += [
            "<details><summary>M2 Token-Details</summary>",
            "",
            "| | Writer (M2) | Scorer (M2) |",
            "|---|---|---|",
            f"| Latenz | {wr['latency_ms']:,}ms | {sr['latency_ms']:,}ms |",
            f"| Reasoning tokens | {wt.get('reasoning', 0):,} | {st.get('reasoning', 0):,} |",
            f"| Completion tokens | {wt.get('completion', 0):,} | {st.get('completion', 0):,} |",
            f"| Total | {wt.get('total', 0):,} | {st.get('total', 0):,} |",
            "",
            "</details>",
            "",
        ]

        # ── Frank's Review ────────────────────────────────────────────────────
        lines += [
            "### Frank's Review",
            "",
            "**👍 / 👎 / 🤔** ← _bitte ersetzen_",
            "",
            "_Kommentar (optional):_ …",
            "",
            "---",
            "",
        ]

    OUT_PATH.write_text("\n".join(lines), encoding="utf-8")
    return OUT_PATH


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="Entity Content Overhaul — MiniMax M2 Test")
    parser.add_argument("--limit", type=int, default=5, help="Number of entities to test (default: 5)")
    parser.add_argument("--type", choices=["artist", "label", "press_orga", "all"], default="all",
                        help="Entity type to test (default: all)")
    args = parser.parse_args()

    if not DB_URL:
        print("ERROR: SUPABASE_DB_URL / DATABASE_URL not set", file=sys.stderr)
        return 1
    if not MINIMAX_API_KEY:
        print("ERROR: MINIMAX_API_KEY not set", file=sys.stderr)
        return 1

    print(f"Entity Content Overhaul — MiniMax M2 Test")
    print(f"  Limit: {args.limit} · Type: {args.type}")
    print(f"  Output: {OUT_PATH}")
    print()

    conn = psycopg2.connect(DB_URL, connect_timeout=10)

    print(f"Fetching {args.limit} entities...")
    entities = fetch_entities(conn, args.type, args.limit)
    if not entities:
        print("No entities found.", file=sys.stderr)
        return 1
    print(f"Found {len(entities)} entities\n")

    all_results = []

    for i, entity in enumerate(entities, 1):
        name  = entity["entity_name"]
        etype = entity["entity_type"]
        rcount = entity["release_count"]
        print(f"[{i}/{len(entities)}] {name} ({etype}, {rcount} releases)")

        try:
            print("  [1/4] Enriching...")
            enriched = enrich_entity(conn, etype, entity["entity_id"], name)

            if name.lower() == "various" or enriched.get("internal", {}).get("release_count", 0) == 0:
                print("  Skipped (no releases or Various)")
                continue

            print("  [2/4] Profiling (GPT-4o-mini)...")
            profile = profile_entity(enriched)
            print(f"        tone={profile.get('tone_directive')} tier={profile.get('significance_tier')}")

            print("  [3/4] Writing (M2)...")
            write_result = write_entity_m2(enriched, profile)
            if write_result.get("error"):
                print(f"        ERROR: {write_result['error']}")
                all_results.append({"entity": entity, "profile": profile, "error": write_result["error"]})
                continue
            words = len(write_result["description"].split())
            print(f"        {words} words · {write_result['latency_ms']:,}ms · "
                  f"total={write_result['tokens']['total']} reasoning={write_result['tokens']['reasoning']}")

            print("  [4/4] Scoring (M2)...")
            score_result = score_entity_m2(name, etype, write_result["description"], profile, enriched)
            decision_emoji = {"accept": "✅", "revise": "🟡", "reject": "❌"}.get(score_result["decision"], "⚠️")
            print(f"        {decision_emoji} {score_result['total_score']}/100 → {score_result['decision']} "
                  f"({score_result['latency_ms']:,}ms)")

            all_results.append({
                "entity": entity,
                "profile": profile,
                "write_result": write_result,
                "score_result": score_result,
            })

        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            all_results.append({"entity": entity, "error": str(e)})

        print()

    conn.close()

    if not all_results:
        print("No results to write.", file=sys.stderr)
        return 1

    out_file = write_md(all_results)
    print(f"Results → {out_file}")

    print("\n── Summary ──────────────────────────────────────────────────")
    for r in all_results:
        name = r["entity"]["entity_name"]
        if r.get("error"):
            print(f"  {name[:42]:<42}  ⚠️  ERROR")
        else:
            score = r["score_result"]["total_score"]
            dec   = r["score_result"]["decision"]
            emoji = {"accept": "✅", "revise": "🟡", "reject": "❌"}.get(dec, "⚠️")
            print(f"  {name[:42]:<42}  {emoji}  {score:3d}/100  {dec}")
    print("──────────────────────────────────────────────────────────────")

    return 0


if __name__ == "__main__":
    sys.exit(main())
