"""
Musician Mapper Agent — extracts, validates, and structures member data for the musician DB.
Merges data from MusicBrainz, Discogs, credits parsing, and AI inference.
"""
import json
import re
import psycopg2
from config import MUSICIAN_AUTO_INSERT, MUSICIAN_REVIEW_FLAG


def map_musicians(enriched_data: dict, profile: dict, pg_conn) -> list[dict]:
    """
    Extract musician data from enriched sources and prepare DB records.
    Returns list of musician records with roles, ready for insert.
    """
    entity = enriched_data["entity"]
    if entity["type"] != "artist":
        return []  # Only map musicians for artist/band entities

    artist_id = entity["id"]
    mb = enriched_data.get("musicbrainz") or {}
    internal = enriched_data.get("internal") or {}

    musicians = []
    seen_names = set()

    # Source 1: MusicBrainz members (highest confidence)
    for member in mb.get("members", []):
        name = member.get("name", "").strip()
        if not name or name.lower() in seen_names:
            continue
        seen_names.add(name.lower())

        roles = member.get("attributes", [])
        if not roles:
            roles = ["member"]

        musicians.append({
            "name": name,
            "mbid": member.get("mbid"),
            "roles": roles,
            "active_from": _parse_year(member.get("begin")),
            "active_to": _parse_year(member.get("end")),
            "is_founder": member.get("begin") is not None and _is_early_member(member.get("begin"), mb.get("begin")),
            "confidence": 0.95,
            "source": "musicbrainz",
            "needs_review": False,
        })

    # Source 2: Profile member_data (from Profiler, which may have Discogs data)
    for member in profile.get("member_data", []):
        name = member.get("name", "").strip()
        if not name or name.lower() in seen_names:
            continue
        seen_names.add(name.lower())

        roles = member.get("roles", [])
        if not roles:
            roles = ["member"]

        musicians.append({
            "name": name,
            "mbid": member.get("mbid"),
            "roles": roles,
            "active_from": _parse_year(member.get("begin")),
            "active_to": _parse_year(member.get("end")),
            "is_founder": False,
            "confidence": member.get("confidence", 0.80),
            "source": member.get("source", "discogs"),
            "needs_review": member.get("confidence", 0.80) < MUSICIAN_AUTO_INSERT,
        })

    # Source 3: Credits parsing (lower confidence)
    for role_name in internal.get("credits_roles", []):
        # Credits give us roles but not always specific people
        # This is handled at a higher level — we just note the roles exist
        pass

    # Filter by confidence threshold
    result = []
    for m in musicians:
        if m["confidence"] >= MUSICIAN_REVIEW_FLAG:
            result.append(m)
        # Below 0.40: skip entirely

    return result


def save_musicians(musicians: list[dict], artist_id: str, pg_conn) -> dict:
    """
    Save mapped musicians to the database.
    Creates/updates musician records and musician_role links.
    Returns: {"created": int, "linked": int, "skipped": int}
    """
    cur = pg_conn.cursor()
    created = 0
    linked = 0
    skipped = 0

    for m in musicians:
        name = m["name"]
        slug = _make_slug(name)

        # Check if musician already exists (by name or mbid)
        existing_id = None
        if m.get("mbid"):
            cur.execute("SELECT id FROM musician WHERE musicbrainz_id = %s", (m["mbid"],))
            row = cur.fetchone()
            if row:
                existing_id = row[0]

        if not existing_id:
            cur.execute("SELECT id FROM musician WHERE slug = %s", (slug,))
            row = cur.fetchone()
            if row:
                existing_id = row[0]

        if not existing_id:
            # Create new musician
            musician_id = f"mus-{abs(hash(name + artist_id)) % 10**12}"
            try:
                cur.execute("""
                    INSERT INTO musician (id, name, slug, musicbrainz_id, data_source, confidence, needs_review)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (slug) DO UPDATE SET
                        musicbrainz_id = COALESCE(musician.musicbrainz_id, EXCLUDED.musicbrainz_id),
                        updated_at = NOW()
                    RETURNING id
                """, (musician_id, name, slug, m.get("mbid"), m["source"], m["confidence"], m["needs_review"]))
                existing_id = cur.fetchone()[0]
                created += 1
            except Exception as e:
                print(f"  [MusicianMapper] Error creating {name}: {e}")
                pg_conn.rollback()
                skipped += 1
                continue

        # Create role links
        for role in m["roles"]:
            role_id = f"mr-{abs(hash(existing_id + artist_id + role)) % 10**12}"
            try:
                cur.execute("""
                    INSERT INTO musician_role (id, musician_id, artist_id, role, active_from, active_to, is_founder)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (musician_id, artist_id, role) DO NOTHING
                """, (role_id, existing_id, artist_id, role, m.get("active_from"), m.get("active_to"), m.get("is_founder", False)))
                linked += 1
            except Exception as e:
                print(f"  [MusicianMapper] Error linking {name}/{role}: {e}")
                pg_conn.rollback()
                skipped += 1

    pg_conn.commit()
    cur.close()
    return {"created": created, "linked": linked, "skipped": skipped}


def _parse_year(date_str: str | None) -> int | None:
    """Extract year from a date string like '1975-09-03' or '1975'."""
    if not date_str:
        return None
    try:
        return int(str(date_str)[:4])
    except (ValueError, TypeError):
        return None


def _is_early_member(member_begin: str | None, group_begin: str | None) -> bool:
    """Check if a member joined within the first year of the group's formation."""
    if not member_begin or not group_begin:
        return False
    try:
        m_year = int(str(member_begin)[:4])
        g_year = int(str(group_begin)[:4])
        return m_year <= g_year + 1
    except (ValueError, TypeError):
        return False


def _make_slug(name: str) -> str:
    """Generate a URL-safe slug from a name."""
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug or "unknown"
