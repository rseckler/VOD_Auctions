"""
Enricher Agent — gathers data from internal DB + 9 external sources.
Returns a unified data package for the Profiler and Writer agents.
"""
import json
import time
import re
import requests
import psycopg2
import psycopg2.extras
import musicbrainzngs
from typing import Any
from config import (
    DATABASE_URL, DISCOGS_TOKEN, LASTFM_API_KEY, BRAVE_API_KEY,
    YOUTUBE_API_KEY, USER_AGENT, RATE_LIMITS
)

# ── Rate Limiter ──────────────────────────────────────────────────────────────

_request_times: dict[str, list[float]] = {}

def rate_limit(source: str):
    """Enforce per-source rate limiting."""
    now = time.time()
    if source not in _request_times:
        _request_times[source] = []
    _request_times[source] = [t for t in _request_times[source] if now - t < 60]
    limit = RATE_LIMITS.get(source, 60)
    if len(_request_times[source]) >= limit:
        sleep_time = 60 - (now - _request_times[source][0]) + 0.1
        if sleep_time > 0:
            time.sleep(sleep_time)
    _request_times[source].append(time.time())


def _get(url: str, source: str, headers: dict = None, params: dict = None, timeout: int = 15) -> dict | None:
    """HTTP GET with rate limiting and error handling."""
    rate_limit(source)
    try:
        h = {"User-Agent": USER_AGENT}
        if headers:
            h.update(headers)
        resp = requests.get(url, headers=h, params=params, timeout=timeout)
        if resp.status_code == 200:
            return resp.json()
        if resp.status_code == 429:
            time.sleep(5)
            return None
        return None
    except Exception:
        return None


# ── MusicBrainz Setup ─────────────────────────────────────────────────────────
musicbrainzngs.set_useragent("VODAuctions", "1.0", "robin@seckler.de")


# ── Internal DB ───────────────────────────────────────────────────────────────

def enrich_internal(pg_conn, entity_type: str, entity_id: str) -> dict:
    """Gather all internal data about an entity."""
    cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    result = {
        "releases": [],
        "release_count": 0,
        "earliest_year": None,
        "latest_year": None,
        "formats": {},
        "labels_released_on": [],
        "credits_roles": [],
        "genre_tags_internal": [],
    }

    if entity_type == "artist":
        # Releases
        cur.execute("""
            SELECT r.title, r.year, r."coverImage", r.legacy_price, r.credits,
                   l.name as label_name, l.slug as label_slug,
                   f.name as format_name, f.format_group
            FROM "Release" r
            LEFT JOIN "Label" l ON r."labelId" = l.id
            LEFT JOIN "Format" f ON r.format_id = f.id
            WHERE r."artistId" = %s
            ORDER BY r.year DESC NULLS LAST
            LIMIT 25
        """, (entity_id,))
        releases = cur.fetchall()
        result["releases"] = [dict(r) for r in releases]
        result["release_count"] = len(releases)

        # Full count
        cur.execute('SELECT COUNT(*)::int FROM "Release" WHERE "artistId" = %s', (entity_id,))
        result["release_count"] = cur.fetchone()["count"]

        # Year range
        cur.execute("""
            SELECT MIN(year) as earliest, MAX(year) as latest
            FROM "Release" WHERE "artistId" = %s AND year IS NOT NULL
        """, (entity_id,))
        yr = cur.fetchone()
        result["earliest_year"] = yr["earliest"]
        result["latest_year"] = yr["latest"]

        # Format distribution
        cur.execute("""
            SELECT f.format_group, COUNT(*)::int as cnt
            FROM "Release" r LEFT JOIN "Format" f ON r.format_id = f.id
            WHERE r."artistId" = %s AND f.format_group IS NOT NULL
            GROUP BY f.format_group ORDER BY cnt DESC
        """, (entity_id,))
        result["formats"] = {r["format_group"]: r["cnt"] for r in cur.fetchall()}

        # Labels released on
        cur.execute("""
            SELECT DISTINCT l.name, l.slug
            FROM "Release" r JOIN "Label" l ON r."labelId" = l.id
            WHERE r."artistId" = %s
            ORDER BY l.name
        """, (entity_id,))
        result["labels_released_on"] = [{"name": r["name"], "slug": r["slug"]} for r in cur.fetchall()]

        # Extract roles from credits text
        for rel in releases[:10]:
            if rel.get("credits"):
                roles = _parse_roles_from_credits(rel["credits"])
                result["credits_roles"].extend(roles)
        result["credits_roles"] = list(set(result["credits_roles"]))

    elif entity_type == "label":
        cur.execute('SELECT COUNT(*)::int as count FROM "Release" WHERE "labelId" = %s', (entity_id,))
        result["release_count"] = cur.fetchone()["count"]

        cur.execute("""
            SELECT r.title, r.year, a.name as artist_name, f.name as format_name
            FROM "Release" r
            LEFT JOIN "Artist" a ON r."artistId" = a.id
            LEFT JOIN "Format" f ON r.format_id = f.id
            WHERE r."labelId" = %s
            ORDER BY r.year DESC NULLS LAST LIMIT 20
        """, (entity_id,))
        result["releases"] = [dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT MIN(year) as earliest, MAX(year) as latest
            FROM "Release" WHERE "labelId" = %s AND year IS NOT NULL
        """, (entity_id,))
        yr = cur.fetchone()
        result["earliest_year"] = yr["earliest"]
        result["latest_year"] = yr["latest"]

        cur.execute("""
            SELECT f.format_group, COUNT(*)::int as cnt
            FROM "Release" r LEFT JOIN "Format" f ON r.format_id = f.id
            WHERE r."labelId" = %s AND f.format_group IS NOT NULL
            GROUP BY f.format_group ORDER BY cnt DESC
        """, (entity_id,))
        result["formats"] = {r["format_group"]: r["cnt"] for r in cur.fetchall()}

        # Key artists
        cur.execute("""
            SELECT a.name, a.slug, COUNT(*)::int as cnt
            FROM "Release" r JOIN "Artist" a ON r."artistId" = a.id
            WHERE r."labelId" = %s
            GROUP BY a.name, a.slug ORDER BY cnt DESC LIMIT 15
        """, (entity_id,))
        result["key_artists"] = [dict(r) for r in cur.fetchall()]

    elif entity_type == "press_orga":
        cur.execute('SELECT COUNT(*)::int as count FROM "Release" WHERE "pressOrgaId" = %s', (entity_id,))
        result["release_count"] = cur.fetchone()["count"]

        cur.execute("""
            SELECT r.title, r.year, f.name as format_name
            FROM "Release" r LEFT JOIN "Format" f ON r.format_id = f.id
            WHERE r."pressOrgaId" = %s ORDER BY r.year DESC NULLS LAST LIMIT 15
        """, (entity_id,))
        result["releases"] = [dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT MIN(year) as earliest, MAX(year) as latest
            FROM "Release" WHERE "pressOrgaId" = %s AND year IS NOT NULL
        """, (entity_id,))
        yr = cur.fetchone()
        result["earliest_year"] = yr["earliest"]
        result["latest_year"] = yr["latest"]

    cur.close()
    return result


def _parse_roles_from_credits(credits_text: str) -> list[str]:
    """Extract role names from credits text (e.g., 'Produced by X')."""
    if not credits_text:
        return []
    roles = set()
    patterns = [
        r"(Vocals|Guitar|Bass|Drums|Synthesizer|Electronics|Keyboards|Percussion|"
        r"Saxophone|Trumpet|Violin|Cello|Flute|Producer|Engineer|Mastering|"
        r"Mixed by|Recorded by|Design|Photography|Artwork)\s*[-–:by]",
    ]
    for pat in patterns:
        for m in re.finditer(pat, credits_text, re.IGNORECASE):
            roles.add(m.group(1).strip().title())
    return list(roles)


# ── Discogs ───────────────────────────────────────────────────────────────────

def enrich_discogs_artist(discogs_id: int) -> dict | None:
    """Fetch artist profile, members, groups from Discogs."""
    if not DISCOGS_TOKEN or not discogs_id:
        return None
    data = _get(
        f"https://api.discogs.com/artists/{discogs_id}",
        "discogs",
        headers={"Authorization": f"Discogs token={DISCOGS_TOKEN}"}
    )
    if not data:
        return None
    return {
        "profile": data.get("profile", ""),
        "real_name": data.get("realname"),
        "members": [
            {"name": m.get("name"), "id": m.get("id"), "active": m.get("active", True)}
            for m in data.get("members", [])
        ],
        "groups": [
            {"name": g.get("name"), "id": g.get("id")}
            for g in data.get("groups", [])
        ],
        "urls": data.get("urls", []),
        "name_variations": data.get("namevariations", []),
    }


def enrich_discogs_label(discogs_id: int) -> dict | None:
    """Fetch label profile, sublabels from Discogs."""
    if not DISCOGS_TOKEN or not discogs_id:
        return None
    data = _get(
        f"https://api.discogs.com/labels/{discogs_id}",
        "discogs",
        headers={"Authorization": f"Discogs token={DISCOGS_TOKEN}"}
    )
    if not data:
        return None
    return {
        "profile": data.get("profile", ""),
        "contact_info": data.get("contact_info"),
        "sublabels": [
            {"name": s.get("name"), "id": s.get("id")}
            for s in data.get("sublabels", [])
        ],
        "parent_label": data.get("parent_label"),
        "urls": data.get("urls", []),
    }


def find_discogs_id(pg_conn, entity_type: str, entity_id: str) -> int | None:
    """Try to find a Discogs ID from release data."""
    cur = pg_conn.cursor()
    if entity_type == "artist":
        cur.execute("""
            SELECT DISTINCT discogs_id FROM "Release"
            WHERE "artistId" = %s AND discogs_id IS NOT NULL LIMIT 1
        """, (entity_id,))
    elif entity_type == "label":
        cur.execute("""
            SELECT DISTINCT discogs_id FROM "Release"
            WHERE "labelId" = %s AND discogs_id IS NOT NULL LIMIT 1
        """, (entity_id,))
    else:
        cur.close()
        return None
    row = cur.fetchone()
    cur.close()
    # Note: this gives us a release discogs_id, not the artist/label discogs_id
    # We'd need to resolve via the Discogs release API — skipped for now
    return None  # TODO: resolve artist/label ID from release ID


# ── MusicBrainz ───────────────────────────────────────────────────────────────

def enrich_musicbrainz(name: str, entity_type: str) -> dict | None:
    """Search and fetch MusicBrainz data for an entity."""
    try:
        if entity_type == "artist":
            rate_limit("musicbrainz")
            results = musicbrainzngs.search_artists(artist=name, limit=5)
            artists = results.get("artist-list", [])
            if not artists:
                return None

            # Find best match (exact name match preferred)
            best = None
            for a in artists:
                if a.get("name", "").lower() == name.lower():
                    best = a
                    break
            if not best:
                best = artists[0]
                if best.get("ext:score", "0") and int(best.get("ext:score", "0")) < 80:
                    return None

            mbid = best.get("id")
            if not mbid:
                return None

            # Fetch full details
            rate_limit("musicbrainz")
            detail = musicbrainzngs.get_artist_by_id(
                mbid, includes=["artist-rels", "url-rels", "tags"]
            )
            artist_data = detail.get("artist", {})

            # Extract members
            members = []
            for rel in artist_data.get("artist-relation-list", []):
                if rel.get("type") in ("member of band", "is person"):
                    members.append({
                        "name": rel.get("target", {}).get("name") if isinstance(rel.get("target"), dict) else rel.get("artist", {}).get("name", ""),
                        "mbid": rel.get("target", {}).get("id") if isinstance(rel.get("target"), dict) else rel.get("artist", {}).get("id"),
                        "type": rel.get("type"),
                        "begin": rel.get("begin"),
                        "end": rel.get("end"),
                        "attributes": rel.get("attribute-list", []),
                    })

            # Extract tags
            tags = [t.get("name") for t in artist_data.get("tag-list", []) if t.get("count", 0) > 0]

            return {
                "mbid": mbid,
                "type": artist_data.get("type"),
                "area": artist_data.get("area", {}).get("name") if artist_data.get("area") else None,
                "begin": artist_data.get("life-span", {}).get("begin"),
                "end": artist_data.get("life-span", {}).get("end"),
                "ended": artist_data.get("life-span", {}).get("ended") == "true",
                "tags": tags[:10],
                "members": members,
                "disambiguation": artist_data.get("disambiguation"),
            }

        elif entity_type == "label":
            rate_limit("musicbrainz")
            results = musicbrainzngs.search_labels(label=name, limit=3)
            labels = results.get("label-list", [])
            if not labels:
                return None
            best = labels[0]
            if best.get("ext:score", "0") and int(best.get("ext:score", "0")) < 80:
                return None
            return {
                "mbid": best.get("id"),
                "type": best.get("type"),
                "area": best.get("area", {}).get("name") if best.get("area") else None,
                "begin": best.get("life-span", {}).get("begin") if best.get("life-span") else None,
                "end": best.get("life-span", {}).get("end") if best.get("life-span") else None,
            }

    except Exception as e:
        return None
    return None


# ── Wikidata ──────────────────────────────────────────────────────────────────

def enrich_wikidata(name: str, entity_type: str) -> dict | None:
    """Search Wikidata for structured facts about an entity."""
    search_type = "Q215380" if entity_type == "artist" else "Q18127"  # musical group / record label
    params = {
        "action": "wbsearchentities",
        "search": name,
        "language": "en",
        "limit": 3,
        "format": "json",
    }
    data = _get("https://www.wikidata.org/w/api.php", "wikidata", params=params)
    if not data or not data.get("search"):
        return None

    qid = data["search"][0].get("id")
    if not qid:
        return None

    # Fetch entity claims
    claims_data = _get(
        f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json",
        "wikidata"
    )
    if not claims_data:
        return None

    entity = claims_data.get("entities", {}).get(qid, {})
    claims = entity.get("claims", {})
    sitelinks = entity.get("sitelinks", {})

    def get_claim_value(prop: str) -> str | None:
        if prop not in claims:
            return None
        try:
            return claims[prop][0]["mainsnak"]["datavalue"]["value"]
        except (KeyError, IndexError):
            return None

    def get_time_value(prop: str) -> str | None:
        val = get_claim_value(prop)
        if isinstance(val, dict) and "time" in val:
            return val["time"][:5].lstrip("+")  # "+1982-01-01" -> "1982"
        return None

    return {
        "qid": qid,
        "inception": get_time_value("P571"),
        "dissolution": get_time_value("P576"),
        "country_qid": get_claim_value("P17"),
        "has_wikipedia": "enwiki" in sitelinks,
        "wikipedia_title": sitelinks.get("enwiki", {}).get("title"),
        "description": entity.get("descriptions", {}).get("en", {}).get("value"),
    }


# ── Wikipedia ─────────────────────────────────────────────────────────────────

def enrich_wikipedia(title: str) -> dict | None:
    """Fetch Wikipedia summary for an entity (only if Wikidata confirms it exists)."""
    if not title:
        return None
    safe_title = title.replace(" ", "_")
    data = _get(
        f"https://en.wikipedia.org/api/rest_v1/page/summary/{safe_title}",
        "wikipedia"
    )
    if not data or data.get("type") == "disambiguation":
        return None
    return {
        "extract": data.get("extract", ""),
        "url": data.get("content_urls", {}).get("desktop", {}).get("page"),
        "description": data.get("description"),
    }


# ── Last.fm ───────────────────────────────────────────────────────────────────

def enrich_lastfm(name: str, entity_type: str) -> dict | None:
    """Fetch Last.fm tags, similar artists, listener counts."""
    if not LASTFM_API_KEY or entity_type != "artist":
        return None
    params = {
        "method": "artist.getinfo",
        "artist": name,
        "api_key": LASTFM_API_KEY,
        "format": "json",
    }
    data = _get("http://ws.audioscrobbler.com/2.0/", "lastfm", params=params)
    if not data or "artist" not in data:
        return None
    artist = data["artist"]

    # Get similar artists
    similar = []
    sim_data = _get("http://ws.audioscrobbler.com/2.0/", "lastfm", params={
        "method": "artist.getsimilar",
        "artist": name,
        "api_key": LASTFM_API_KEY,
        "format": "json",
        "limit": 10,
    })
    if sim_data and "similarartists" in sim_data:
        for s in sim_data["similarartists"].get("artist", [])[:10]:
            similar.append(s.get("name"))

    tags = [t.get("name") for t in artist.get("tags", {}).get("tag", [])]
    return {
        "listeners": int(artist.get("stats", {}).get("listeners", 0)),
        "playcount": int(artist.get("stats", {}).get("playcount", 0)),
        "tags": tags,
        "similar_artists": similar,
        "bio_summary": artist.get("bio", {}).get("summary", ""),
        "url": artist.get("url"),
    }


# ── Brave Search ──────────────────────────────────────────────────────────────

def enrich_brave_search(name: str, entity_type: str) -> dict | None:
    """Search for web presence, Bandcamp URL, social profiles."""
    if not BRAVE_API_KEY:
        return None
    type_hint = {"artist": "band", "label": "record label", "press_orga": "music magazine"}
    query = f'"{name}" {type_hint.get(entity_type, "")} music'
    data = _get(
        "https://api.search.brave.com/res/v1/web/search",
        "brave",
        headers={"X-Subscription-Token": BRAVE_API_KEY},
        params={"q": query, "count": 5},
    )
    if not data:
        return None

    results = data.get("web", {}).get("results", [])
    bandcamp_url = None
    social_profiles = []
    relevant_urls = []

    for r in results:
        url = r.get("url", "")
        title = r.get("title", "")
        if "bandcamp.com" in url:
            bandcamp_url = url
        elif any(s in url for s in ["facebook.com", "instagram.com", "twitter.com", "x.com"]):
            social_profiles.append(url)
        relevant_urls.append({"url": url, "title": title})

    return {
        "bandcamp_url": bandcamp_url,
        "social_profiles": social_profiles[:3],
        "web_results": relevant_urls[:5],
    }


# ── Bandcamp ──────────────────────────────────────────────────────────────────

def enrich_bandcamp(bandcamp_url: str) -> dict | None:
    """Scrape basic info from a Bandcamp page."""
    if not bandcamp_url:
        return None
    try:
        rate_limit("bandcamp")
        resp = requests.get(bandcamp_url, headers={"User-Agent": USER_AGENT}, timeout=10)
        if resp.status_code != 200:
            return None
        html = resp.text

        # Extract bio from meta description
        bio_match = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', html)
        bio = bio_match.group(1) if bio_match else None

        # Extract location
        loc_match = re.search(r'"location"\s*:\s*"([^"]*)"', html)
        location = loc_match.group(1) if loc_match else None

        return {
            "url": bandcamp_url,
            "bio": bio,
            "location": location,
        }
    except Exception:
        return None


# ── Internet Archive ──────────────────────────────────────────────────────────

def enrich_internet_archive(name: str, entity_type: str) -> dict | None:
    """Search Internet Archive for archived pages (mainly for press orgs)."""
    if entity_type != "press_orga":
        return None
    params = {
        "q": f'"{name}" music magazine fanzine',
        "output": "json",
        "rows": 5,
    }
    data = _get(
        "https://archive.org/advancedsearch.php",
        "internet_archive",
        params=params,
    )
    if not data:
        return None
    docs = data.get("response", {}).get("docs", [])
    return {
        "items": [
            {"title": d.get("title"), "year": d.get("year"), "identifier": d.get("identifier")}
            for d in docs[:5]
        ]
    }


# ── YouTube ───────────────────────────────────────────────────────────────────

def enrich_youtube(name: str, entity_type: str) -> dict | None:
    """Search YouTube for live performances, interviews."""
    if not YOUTUBE_API_KEY or entity_type != "artist":
        return None
    params = {
        "part": "snippet",
        "q": f"{name} live performance industrial music",
        "type": "video",
        "maxResults": 3,
        "key": YOUTUBE_API_KEY,
    }
    data = _get(
        "https://www.googleapis.com/youtube/v3/search",
        "youtube",
        params=params,
    )
    if not data:
        return None
    return {
        "videos": [
            {
                "title": item["snippet"]["title"],
                "video_id": item["id"].get("videoId"),
                "channel": item["snippet"]["channelTitle"],
            }
            for item in data.get("items", [])
            if item["id"].get("videoId")
        ]
    }


# ── Main Enrichment Function ─────────────────────────────────────────────────

def enrich_entity(pg_conn, entity_type: str, entity_id: str, entity_name: str) -> dict:
    """
    Full enrichment pipeline for a single entity.
    Returns unified data package with all available information.
    """
    package = {
        "entity": {
            "type": entity_type,
            "id": entity_id,
            "name": entity_name,
        },
        "internal": None,
        "discogs": None,
        "musicbrainz": None,
        "wikidata": None,
        "wikipedia": None,
        "lastfm": None,
        "brave_search": None,
        "bandcamp": None,
        "internet_archive": None,
        "youtube": None,
        "merged_genres": [],
        "merged_country": None,
        "merged_year_range": None,
    }

    # Phase 1: Internal DB (always)
    package["internal"] = enrich_internal(pg_conn, entity_type, entity_id)

    # Phase 2: Discogs (if we can find an ID)
    # TODO: resolve discogs artist/label ID from release discogs_ids
    # For now, skip direct Discogs entity lookup (we don't store entity-level discogs IDs)

    # Phase 3: MusicBrainz
    package["musicbrainz"] = enrich_musicbrainz(entity_name, entity_type)

    # Phase 4: Wikidata
    package["wikidata"] = enrich_wikidata(entity_name, entity_type)

    # Phase 5: Wikipedia (only if Wikidata found a Wikipedia link)
    if package["wikidata"] and package["wikidata"].get("wikipedia_title"):
        package["wikipedia"] = enrich_wikipedia(package["wikidata"]["wikipedia_title"])

    # Phase 6: Last.fm (artists only)
    if entity_type == "artist":
        package["lastfm"] = enrich_lastfm(entity_name, entity_type)

    # Phase 7: Brave Search (discover web presence)
    package["brave_search"] = enrich_brave_search(entity_name, entity_type)

    # Phase 8: Bandcamp (if URL found via Brave)
    if package["brave_search"] and package["brave_search"].get("bandcamp_url"):
        package["bandcamp"] = enrich_bandcamp(package["brave_search"]["bandcamp_url"])

    # Phase 9: Internet Archive (press orgs only)
    if entity_type == "press_orga":
        package["internet_archive"] = enrich_internet_archive(entity_name, entity_type)

    # Phase 10: YouTube (artists only, low priority)
    if entity_type == "artist":
        package["youtube"] = enrich_youtube(entity_name, entity_type)

    # Merge genre signals from all sources
    genres = set()
    if package["musicbrainz"] and package["musicbrainz"].get("tags"):
        genres.update(package["musicbrainz"]["tags"])
    if package["lastfm"] and package["lastfm"].get("tags"):
        genres.update(package["lastfm"]["tags"])
    if package["internal"] and package["internal"].get("genre_tags_internal"):
        genres.update(package["internal"]["genre_tags_internal"])
    package["merged_genres"] = sorted(genres)

    # Merge country
    if package["musicbrainz"] and package["musicbrainz"].get("area"):
        package["merged_country"] = package["musicbrainz"]["area"]
    elif package["bandcamp"] and package["bandcamp"].get("location"):
        package["merged_country"] = package["bandcamp"]["location"]

    # Merge year range
    internal = package["internal"]
    if internal:
        package["merged_year_range"] = {
            "start": internal.get("earliest_year"),
            "end": internal.get("latest_year"),
        }
        # Override with MusicBrainz begin/end if available
        mb = package["musicbrainz"]
        if mb and mb.get("begin"):
            try:
                package["merged_year_range"]["start"] = int(mb["begin"][:4])
            except (ValueError, TypeError):
                pass

    return package


# ── Test ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    conn = psycopg2.connect(DATABASE_URL)

    # Test with a well-known artist
    name = sys.argv[1] if len(sys.argv) > 1 else "Throbbing Gristle"
    entity_type = sys.argv[2] if len(sys.argv) > 2 else "artist"

    # Find entity ID
    cur = conn.cursor()
    table = {"artist": '"Artist"', "label": '"Label"', "press_orga": '"PressOrga"'}[entity_type]
    # Try exact match first, then fuzzy (shortest name = best match)
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
    print(f"Enriching: {entity_name} ({entity_type}, {entity_id})")
    print("=" * 60)

    result = enrich_entity(conn, entity_type, entity_id, entity_name)

    # Pretty print
    for source, data in result.items():
        if source in ("entity", "merged_genres", "merged_country", "merged_year_range"):
            print(f"\n{source}: {json.dumps(data, default=str)}")
        elif data is not None:
            keys = list(data.keys()) if isinstance(data, dict) else []
            print(f"\n{source}: {len(keys)} fields")
            if isinstance(data, dict):
                for k, v in data.items():
                    val_str = str(v)[:100]
                    print(f"  {k}: {val_str}")
        else:
            print(f"\n{source}: None")

    conn.close()
