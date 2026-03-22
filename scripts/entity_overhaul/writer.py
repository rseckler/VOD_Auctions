"""
Writer Agent — generates genre-matched entity descriptions using GPT-4o.
This is the core creative agent. It receives enriched data + entity profile
and produces tone-matched prose with structured member blocks.
"""
import json
from pathlib import Path
from openai import OpenAI
from config import OPENAI_API_KEY, MODELS, WORD_TARGETS, TONE_EXAMPLES_DIR
from tone_mapping import TONE_MAP

client = OpenAI(api_key=OPENAI_API_KEY)

# Load ban list
_ban_list_path = TONE_EXAMPLES_DIR / "ban_list.txt"
BAN_LIST = ""
if _ban_list_path.exists():
    BAN_LIST = _ban_list_path.read_text()


def _load_tone_examples(tone_key: str) -> str:
    """Load few-shot examples for the given tone."""
    tone_info = TONE_MAP.get(tone_key, TONE_MAP["experimental"])
    example_file = TONE_EXAMPLES_DIR / tone_info["example_file"]
    if example_file.exists():
        return example_file.read_text()
    return ""


def _build_context(enriched_data: dict, profile: dict) -> str:
    """Build the data context section for the writer prompt."""
    entity = enriched_data["entity"]
    internal = enriched_data.get("internal") or {}
    mb = enriched_data.get("musicbrainz") or {}
    wiki = enriched_data.get("wikipedia") or {}
    lastfm = enriched_data.get("lastfm") or {}
    wikidata = enriched_data.get("wikidata") or {}

    lines = []
    lines.append(f"ENTITY: {entity['name']}")
    lines.append(f"TYPE: {entity['type']}")
    lines.append(f"RELEASES IN ARCHIVE: {internal.get('release_count', 0)}")

    if mb.get("area"):
        lines.append(f"LOCATION: {mb['area']}")
    elif enriched_data.get("merged_country"):
        lines.append(f"LOCATION: {enriched_data['merged_country']}")

    yr = enriched_data.get("merged_year_range") or {}
    if yr.get("start"):
        end = yr.get("end") or "present"
        lines.append(f"ACTIVE: {yr['start']}–{end}")

    if mb.get("ended"):
        lines.append("STATUS: Dissolved/Inactive")

    if internal.get("formats"):
        lines.append(f"FORMAT DISTRIBUTION: {json.dumps(internal['formats'])}")

    if internal.get("labels_released_on"):
        labels = [l["name"] for l in internal["labels_released_on"][:12]]
        lines.append(f"LABELS: {', '.join(labels)}")

    if internal.get("key_artists"):
        artists = [f"{a['name']} ({a['cnt']})" for a in internal["key_artists"][:10]]
        lines.append(f"KEY ARTISTS: {', '.join(artists)}")

    if lastfm.get("similar_artists"):
        lines.append(f"SIMILAR ARTISTS: {', '.join(lastfm['similar_artists'][:8])}")

    if lastfm.get("listeners"):
        lines.append(f"LAST.FM LISTENERS: {lastfm['listeners']:,}")

    # Members
    if profile.get("member_data"):
        lines.append("\nMEMBERS (from MusicBrainz):")
        for m in profile["member_data"]:
            roles = ", ".join(m.get("roles", [])) or "unknown role"
            years = f"{m.get('begin', '?')}–{m.get('end') or 'present'}"
            lines.append(f"  - {m['name']} — {roles} ({years})")

    # Wikipedia excerpt (reference only)
    if wiki.get("extract"):
        lines.append(f"\nWIKIPEDIA REFERENCE (use as factual source, do NOT copy):\n{wiki['extract'][:500]}")

    # Sample releases
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


def write_entity(enriched_data: dict, profile: dict, revision_feedback: str = None) -> dict:
    """
    Generate a description for an entity.
    Returns: {"description": str, "members_block": str | None}
    """
    entity = enriched_data["entity"]
    tone_key = profile.get("tone_directive", "experimental")
    tone_info = TONE_MAP.get(tone_key, TONE_MAP["experimental"])
    priority = profile.get("priority", "P2")
    min_words, max_words = WORD_TARGETS.get(priority, (150, 250))

    # Load examples
    examples = _load_tone_examples(tone_key)
    # Also load label/press examples if applicable
    if entity["type"] == "label":
        label_examples = _load_tone_examples("labels") if (TONE_EXAMPLES_DIR / "labels.txt").exists() else ""
        # Use label examples file directly
        lpath = TONE_EXAMPLES_DIR / "labels.txt"
        if lpath.exists():
            examples = lpath.read_text()
    elif entity["type"] == "press_orga":
        ppath = TONE_EXAMPLES_DIR / "press_orgs.txt"
        if ppath.exists():
            examples = ppath.read_text()

    context = _build_context(enriched_data, profile)

    # Build system prompt
    system_prompt = f"""You are writing for VOD Auctions, a specialist online platform for industrial and experimental music — vinyl, tapes, CDs, and publications. Your audience: collectors, DJs, scene veterans, and curious newcomers who know this music deeply.

Your writing voice for THIS entity is: {tone_key}.

STYLE RULES FOR "{tone_key}":
- Vocabulary palette: {', '.join(tone_info['vocabulary'])}
- Sentence rhythm: {tone_info['rhythm']}
- Perspective: {tone_info['perspective']}

ABSOLUTE RULES:
- DO NOT write like Wikipedia or an encyclopedia.
- DO NOT use any of these banned phrases: "limited documentation exists", "broader landscape", "broader context", "characterized by", "formative period", "fundamentally shaped", "sonic exploration", "boundary-pushing", "it's worth noting", "unique blend", "tapestry of sound", "exploring the boundaries", "a testament to".
- DO NOT begin with "[Name] is a [type]..." — find a more compelling opening.
- DO NOT pad sparse data with filler. If data is sparse, write LESS — not more. A 2-sentence factual description beats a 5-sentence apology.
- DO NOT sanitize. If the music is harsh, say so. If the aesthetic is transgressive, acknowledge it.
- DO weave member names into the narrative naturally (not as a list in prose).
- DO reference specific releases from the catalog data.
- DO place the entity in its scene context (geographic, temporal, aesthetic).
- DO use the vocabulary palette — these words should appear naturally in the text.

Write {min_words}-{max_words} words."""

    # Build user prompt
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
[your description here — plain text paragraphs, no markdown]

MEMBERS:
[structured member block, one per line: "- Name — Role(s) (years)" or "No member data available"]"""

    if revision_feedback:
        user_prompt += f"\n\nREVISION REQUESTED — fix these issues:\n{revision_feedback}"

    # Add few-shot examples
    messages = [{"role": "system", "content": system_prompt}]
    if examples:
        messages.append({"role": "user", "content": f"Here are example descriptions in the {tone_key} tone for reference:\n\n{examples[:3000]}"})
        messages.append({"role": "assistant", "content": "Understood. I'll match this tone and quality level."})
    messages.append({"role": "user", "content": user_prompt})

    try:
        response = client.chat.completions.create(
            model=MODELS["writer"],
            messages=messages,
            temperature=0.7,
            max_tokens=1500,
        )
        raw = response.choices[0].message.content.strip()
    except Exception as e:
        print(f"  [Writer] Error: {e}")
        return {"description": None, "members_block": None, "error": str(e)}

    # Parse response
    description = ""
    members_block = ""

    if "DESCRIPTION:" in raw:
        parts = raw.split("DESCRIPTION:", 1)[1]
        if "MEMBERS:" in parts:
            description, members_block = parts.split("MEMBERS:", 1)
        else:
            description = parts
    else:
        description = raw

    return {
        "description": description.strip(),
        "members_block": members_block.strip() if members_block else None,
    }


if __name__ == "__main__":
    import sys
    import psycopg2
    from config import DATABASE_URL
    from enricher import enrich_entity
    from profiler import profile_entity

    conn = psycopg2.connect(DATABASE_URL)
    name = sys.argv[1] if len(sys.argv) > 1 else "Merzbow"
    entity_type = sys.argv[2] if len(sys.argv) > 2 else "artist"

    cur = conn.cursor()
    table = {"artist": '"Artist"', "label": '"Label"', "press_orga": '"PressOrga"'}[entity_type]
    cur.execute(f'SELECT id, name FROM {table} WHERE name = %s LIMIT 1', (name,))
    row = cur.fetchone()
    if not row:
        cur.execute(f'SELECT id, name FROM {table} WHERE name ILIKE %s ORDER BY LENGTH(name) ASC LIMIT 1', (f"%{name}%",))
        row = cur.fetchone()
    cur.close()

    if not row:
        print(f"Entity '{name}' not found")
        sys.exit(1)

    entity_id, entity_name = row
    print(f"=== Enriching: {entity_name} ===")
    enriched = enrich_entity(conn, entity_type, entity_id, entity_name)

    print(f"\n=== Profiling ===")
    profile = profile_entity(enriched)
    print(f"Tone: {profile.get('tone_directive')}, Genre: {profile.get('primary_genre')}")
    print(f"Tier: {profile.get('significance_tier')}, Priority: {profile.get('priority')}")

    print(f"\n=== Writing ===")
    result = write_entity(enriched, profile)
    print(f"\nDESCRIPTION ({len(result['description'].split())} words):")
    print(result["description"])
    if result.get("members_block"):
        print(f"\nMEMBERS:")
        print(result["members_block"])

    conn.close()
