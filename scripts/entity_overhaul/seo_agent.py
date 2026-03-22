"""
SEO Agent — generates short_description, genre_tags, and keywords.
Uses GPT-4o-mini for structured metadata extraction.
"""
import json
from openai import OpenAI
from config import OPENAI_API_KEY, MODELS

client = OpenAI(api_key=OPENAI_API_KEY)


def generate_seo(enriched_data: dict, profile: dict, description: str) -> dict:
    """
    Generate SEO metadata based on entity profile and written description.
    Returns: {"short_description", "genre_tags", "seo_keywords"}
    """
    entity = enriched_data["entity"]
    internal = enriched_data.get("internal") or {}
    merged_genres = enriched_data.get("merged_genres", [])

    prompt = f"""Generate SEO metadata for this music entity on VOD Auctions (industrial/experimental music platform).

ENTITY: {entity['name']} (type: {entity['type']})
RELEASES: {internal.get('release_count', 0)}
GENRES: {', '.join(merged_genres[:10])}
PRIMARY GENRE: {profile.get('primary_genre', 'experimental')}
LOCATION: {enriched_data.get('merged_country') or 'unknown'}

DESCRIPTION:
{description[:500]}

Return ONLY valid JSON:
{{
  "short_description": "A single sentence, max 155 characters. Must be specific to THIS entity. Include: name, genre, location or era, and what makes them distinct. Never use 'influential' or 'innovative' without specifics.",
  "genre_tags": ["5-8 genre tags, most specific first. Use standard genre names (Dark Ambient, not dark-ambient). Include sub-genres."],
  "seo_keywords": ["5-8 long-tail SEO keywords someone might search for, e.g. '{entity['name']} discography', '{entity['name']} vinyl records'"]
}}"""

    try:
        response = client.chat.completions.create(
            model=MODELS["seo"],
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=400,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)

        # Validate short_description length
        sd = result.get("short_description", "")
        if len(sd) > 160:
            sd = sd[:157] + "..."
        result["short_description"] = sd

        return result
    except Exception as e:
        print(f"  [SEO] Error: {e}")
        # Fallback
        return {
            "short_description": f"{entity['name']} — {profile.get('primary_genre', 'experimental')} music on VOD Auctions.",
            "genre_tags": merged_genres[:6],
            "seo_keywords": [f"{entity['name']} discography"],
        }
