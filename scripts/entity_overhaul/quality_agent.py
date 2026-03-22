"""
Quality Agent — scores generated content against quality criteria.
Uses GPT-4o-mini with rubric-based evaluation.
Returns score (0-100) + feedback + accept/revise/reject decision.
"""
import json
from openai import OpenAI
from config import OPENAI_API_KEY, MODELS, QUALITY_ACCEPT_THRESHOLD, QUALITY_REVISE_THRESHOLD

client = OpenAI(api_key=OPENAI_API_KEY)


def review_content(
    entity_name: str,
    entity_type: str,
    description: str,
    short_description: str,
    profile: dict,
    enriched_data: dict,
) -> dict:
    """
    Score and validate generated content.
    Returns:
    {
        "total_score": int (0-100),
        "decision": "accept" | "revise" | "reject",
        "scores": { criterion: score },
        "feedback": [str],
        "revision_instructions": str | None
    }
    """
    tone_key = profile.get("tone_directive", "experimental")
    merged_genres = enriched_data.get("merged_genres", [])
    mb = enriched_data.get("musicbrainz") or {}
    has_member_data = bool(mb.get("members"))

    prompt = f"""You are a quality reviewer for VOD Auctions, a specialist industrial/experimental music platform.

Score this entity description on 6 criteria. Be strict — generic AI-sounding text should score LOW.

ENTITY: {entity_name} ({entity_type})
ASSIGNED TONE: {tone_key}
EXPECTED GENRES: {', '.join(merged_genres[:8])}
HAS MEMBER DATA IN SOURCE: {has_member_data}
MEMBER NAMES IN SOURCE: {', '.join([m['name'] for m in mb.get('members', [])[:6]])}
SIGNIFICANCE: {profile.get('significance_tier', 'unknown')}

DESCRIPTION TO REVIEW:
{description}

SHORT DESCRIPTION:
{short_description}

Score each criterion 0-100:

1. TONE_MATCH (weight 25%): Does the writing match the "{tone_key}" tone? Would swapping in different tone-words break the text? Does it use the right vocabulary and rhythm?

2. FACTUAL_GROUNDING (weight 20%): Are mentioned dates, names, releases verifiable against the source data? No hallucinated facts?

3. INDIVIDUALITY (weight 20%): SWAP TEST — could this text describe a different entity in the same genre? If yes, score LOW. Is the opening hook unique?

4. STRUCTURAL_COMPLETENESS (weight 15%): Are required sections present? Are members mentioned (if data available)? Key releases referenced?

5. SEO_QUALITY (weight 10%): Is the short_description under 160 chars? Does it contain unique, searchable terms? Are genre keywords present?

6. ANTI_AI_ISM (weight 10%): Does the text contain banned AI phrases like "limited documentation exists", "broader landscape", "characterized by", "fundamentally shaped", "sonic exploration"? Does it start with "[Name] is a [type]..."? Any "delve into", "tapestry of sound", "it's worth noting"?

Return ONLY valid JSON:
{{
  "total_score": weighted_average_of_all_criteria,
  "scores": {{
    "tone_match": 0-100,
    "factual_grounding": 0-100,
    "individuality": 0-100,
    "structural_completeness": 0-100,
    "seo_quality": 0-100,
    "anti_ai_ism": 0-100
  }},
  "feedback": ["list of 2-4 specific issues or strengths"],
  "revision_instructions": "specific instructions for the writer to fix issues, or null if score >= {QUALITY_ACCEPT_THRESHOLD}"
}}"""

    try:
        response = client.chat.completions.create(
            model=MODELS["quality"],
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=600,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"  [Quality] Error: {e}")
        return {
            "total_score": 70,
            "decision": "accept",
            "scores": {},
            "feedback": [f"Quality check failed: {e}"],
            "revision_instructions": None,
        }

    score = result.get("total_score", 0)

    # Determine decision
    if score >= QUALITY_ACCEPT_THRESHOLD:
        decision = "accept"
        result["revision_instructions"] = None
    elif score >= QUALITY_REVISE_THRESHOLD:
        decision = "revise"
    else:
        decision = "reject"

    result["decision"] = decision
    return result
