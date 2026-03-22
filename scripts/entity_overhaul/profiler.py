"""
Profiler Agent — classifies entity's aesthetic profile and determines tone/style for writing.
Uses GPT-4o-mini for structured classification.
"""
import json
from openai import OpenAI
from config import OPENAI_API_KEY, MODELS
from tone_mapping import classify_tone, TONE_MAP

client = OpenAI(api_key=OPENAI_API_KEY)


def profile_entity(enriched_data: dict) -> dict:
    """
    Analyze enriched data and produce an entity profile with tone directive,
    emphasis points, and member data.
    """
    entity = enriched_data["entity"]
    internal = enriched_data.get("internal") or {}
    mb = enriched_data.get("musicbrainz") or {}
    wiki = enriched_data.get("wikipedia") or {}
    lastfm = enriched_data.get("lastfm") or {}
    merged_genres = enriched_data.get("merged_genres", [])

    # Step 1: Rule-based tone classification from genres
    tone_key = classify_tone(merged_genres)

    # Step 2: Build context for GPT classification refinement
    context_parts = []
    context_parts.append(f"Entity: {entity['name']} (type: {entity['type']})")
    context_parts.append(f"Releases in archive: {internal.get('release_count', 0)}")

    if internal.get("formats"):
        context_parts.append(f"Formats: {json.dumps(internal['formats'])}")
    if internal.get("labels_released_on"):
        labels = [l["name"] for l in internal["labels_released_on"][:10]]
        context_parts.append(f"Labels: {', '.join(labels)}")
    if merged_genres:
        context_parts.append(f"Genre tags: {', '.join(merged_genres[:15])}")
    if mb.get("area"):
        context_parts.append(f"Location: {mb['area']}")
    if mb.get("begin"):
        context_parts.append(f"Active from: {mb['begin']}")
    if mb.get("end"):
        context_parts.append(f"Active until: {mb['end']}")
    if lastfm.get("similar_artists"):
        context_parts.append(f"Similar artists: {', '.join(lastfm['similar_artists'][:8])}")
    if wiki.get("extract"):
        context_parts.append(f"Wikipedia excerpt: {wiki['extract'][:400]}")

    # Sample releases
    for rel in internal.get("releases", [])[:8]:
        parts = [rel.get("title", "")]
        if rel.get("year"):
            parts.append(f"({rel['year']})")
        if rel.get("label_name"):
            parts.append(f"on {rel['label_name']}")
        if rel.get("format_name"):
            parts.append(f"[{rel['format_name']}]")
        context_parts.append(f"Release: {' '.join(parts)}")

    context = "\n".join(context_parts)

    # Step 3: GPT-4o-mini for refined classification
    tone_info = TONE_MAP.get(tone_key, TONE_MAP["experimental"])

    prompt = f"""You are classifying a music entity for a specialist industrial/experimental music auction platform.

Based on the data below, provide a JSON profile. Be specific and concrete.

DATA:
{context}

INITIAL TONE CLASSIFICATION: {tone_key}
(You may change this if the data strongly suggests a different tone.)

Return ONLY valid JSON with these fields:
{{
  "primary_genre": "the single most accurate genre label",
  "secondary_genres": ["2-4 secondary genre tags"],
  "descriptors": ["4-6 sonic/aesthetic descriptors specific to this entity"],
  "tone_directive": "{tone_key}",
  "emphasis": ["3-5 aspects to emphasize in the description (e.g., 'founding_members', 'label_network', 'sonic_evolution', 'political_dimension', 'format_preference')"],
  "avoid": ["2-3 things to avoid in the description"],
  "key_talking_points": ["3-5 specific, concrete talking points for the writer"],
  "active_status": "active" or "dissolved" or "unknown",
  "significance_tier": "foundational" or "significant" or "notable" or "minor" or "obscure"
}}

Rules:
- descriptors must be SPECIFIC to this entity, not generic ("experimental" is too vague)
- key_talking_points must reference SPECIFIC releases, people, or facts from the data
- avoid must include entity-specific pitfalls (e.g., "don't sanitize the political dimension" for Laibach)
- if data is sparse, significance_tier should be "minor" or "obscure" and emphasis should be shorter"""

    try:
        response = client.chat.completions.create(
            model=MODELS["profiler"],
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=800,
            response_format={"type": "json_object"},
        )
        profile = json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"  [Profiler] Error: {e}")
        # Fallback profile
        profile = {
            "primary_genre": merged_genres[0] if merged_genres else "experimental",
            "secondary_genres": merged_genres[1:4] if len(merged_genres) > 1 else [],
            "descriptors": tone_info["vocabulary"][:4],
            "tone_directive": tone_key,
            "emphasis": ["sonic_identity"],
            "avoid": ["generic_framing"],
            "key_talking_points": [],
            "active_status": "unknown",
            "significance_tier": "obscure",
        }

    # Ensure tone_directive is valid
    if profile.get("tone_directive") not in TONE_MAP:
        profile["tone_directive"] = tone_key

    # Add member data from MusicBrainz
    profile["member_data"] = []
    if mb.get("members"):
        for m in mb["members"]:
            profile["member_data"].append({
                "name": m.get("name", ""),
                "mbid": m.get("mbid"),
                "roles": m.get("attributes", []),
                "begin": m.get("begin"),
                "end": m.get("end"),
                "confidence": 0.95,
                "source": "musicbrainz",
            })

    # Determine priority tier
    rc = internal.get("release_count", 0)
    profile["priority"] = "P1" if rc > 10 else "P2" if rc >= 3 else "P3"

    return profile


if __name__ == "__main__":
    # Test with pre-built enriched data
    import sys
    import psycopg2
    from config import DATABASE_URL
    from enricher import enrich_entity

    conn = psycopg2.connect(DATABASE_URL)
    name = sys.argv[1] if len(sys.argv) > 1 else "Merzbow"
    entity_type = sys.argv[2] if len(sys.argv) > 2 else "artist"

    cur = conn.cursor()
    table = {"artist": '"Artist"', "label": '"Label"', "press_orga": '"PressOrga"'}[entity_type]
    cur.execute(f'SELECT id, name FROM {table} WHERE name = %s LIMIT 1', (name,))
    row = cur.fetchone()
    cur.close()

    if not row:
        print(f"Entity '{name}' not found")
        sys.exit(1)

    entity_id, entity_name = row
    print(f"Profiling: {entity_name} ({entity_type})")

    enriched = enrich_entity(conn, entity_type, entity_id, entity_name)
    profile = profile_entity(enriched)
    print(json.dumps(profile, indent=2))
    conn.close()
