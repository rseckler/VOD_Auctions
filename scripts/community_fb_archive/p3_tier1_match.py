#!/usr/bin/env python3
"""
p3_tier1_match.py — Phase P3 der FB-Migration-Pipeline (Annex §A10, §A3.3).

Matcht Frank's FB-Posts gegen das VOD-Catalog (Artist + Release) und schreibt
für jedes Bild einen Filename-Vorschlag im Format `{Artist} - {Release} FB.jpg`.

Liest:
  - profile_posts_1.json (Frank's Posts mit Text + Media-URIs)
  - manifest_images.jsonl (was P2 hochgeladen hat)
  - VPS-Replica (vod_auctions_replica DB) — NICHT Supabase!

Schreibt:
  - manifest_matches.jsonl (eine Zeile pro fb_id, mit Match-Vorschlag)

Entscheidungen pro fb_id:
  Tier 1 (auto-rename ok):  Single-Photo-Post + 1 strong Artist + 1 strong Release
  Tier 2 (P4 AI Vision):    Multi-Photo OR low confidence
  Tier 3 (Manual P5):       no match found

IO-Disziplin (Frank-Schutz):
  - DB-Reads gehen ausschließlich an die VPS-Replica (postgres@127.0.0.1:5433)
  - 2 batch-SELECTs (Artists, Releases), single connection, ~5-10s total DB-time
  - Danach in-memory matching via rapidfuzz, 0 weitere DB-Calls
  - Heartbeat 30s — sparsam für 5-30min Run
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras
from rapidfuzz import fuzz, process

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from community_fb_archive.lib.job_tracker import JobTracker

# ─── Config ────────────────────────────────────────────────────────────────

REPLICA_DB_NAME = "vod_auctions_replica"
REPLICA_HOST = "127.0.0.1"
REPLICA_PORT = 5433
REPLICA_PASS_FILE = "/root/pg17-replica-pass.txt"

DEFAULT_HEARTBEAT_INTERVAL = 30

# Match thresholds (rapidfuzz token_set_ratio, 0-100)
ARTIST_THRESHOLD_HIGH = 90
ARTIST_THRESHOLD_LOW = 75
RELEASE_THRESHOLD_HIGH = 88
RELEASE_THRESHOLD_LOW = 70

# Confidence calculation buckets
TIER1_MIN_CONFIDENCE = 0.80


# ─── DB connection ─────────────────────────────────────────────────────────


def connect_replica() -> psycopg2.extensions.connection:
    """Open read-only connection to the VPS-local pg17-replica.

    Uses /root/pg17-replica-pass.txt (Robin's pattern from
    scripts/backup/replication_health_check.sh).
    """
    pwd_path = Path(REPLICA_PASS_FILE)
    if not pwd_path.exists():
        raise RuntimeError(
            f"Replica password file not found: {REPLICA_PASS_FILE}. "
            "Cannot connect to vod_auctions_replica without it. "
            "Refusing to fall back to Supabase to protect Frank's prod DB."
        )
    password = pwd_path.read_text().strip()
    conn = psycopg2.connect(
        host=REPLICA_HOST,
        port=REPLICA_PORT,
        user="postgres",
        password=password,
        dbname=REPLICA_DB_NAME,
        connect_timeout=5,
        application_name="fb_archive_p3_tier1_match",
    )
    conn.set_session(readonly=True, autocommit=True)
    return conn


def load_artists(conn) -> list[dict]:
    """Read all Artists with normalized names. Read-only single SELECT."""
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as c:
        c.execute(
            'SELECT id, name FROM "Artist" '
            "WHERE name IS NOT NULL AND length(trim(name)) >= 2"
        )
        rows = c.fetchall()
    out = []
    for r in rows:
        nrm = normalize_for_match(r["name"])
        if nrm:
            out.append({"id": r["id"], "name": r["name"], "norm": nrm})
    return out


def load_releases(conn) -> list[dict]:
    """Read all Releases with title + main artist for filename.

    Release has a direct `artistId` column (main artist) and
    `artist_display_name` (denormalized display string). No
    ReleaseArtist-join needed.
    """
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as c:
        c.execute(
            """
            SELECT r.id                   AS release_id,
                   r.title                AS title,
                   r."catalogNumber"      AS catalog_number,
                   r.artist_display_name  AS artist_display_name,
                   r."artistId"           AS main_artist_id,
                   a.name                 AS main_artist_name
              FROM "Release" r
              LEFT JOIN "Artist" a ON a.id = r."artistId"
             WHERE r.title IS NOT NULL AND length(trim(r.title)) >= 2
            """
        )
        rows = c.fetchall()
    out = []
    for r in rows:
        nrm = normalize_for_match(r["title"])
        if nrm:
            # Prefer artist_display_name (denormalized, often "Various
            # Artists" or "Artist1 / Artist2"), fall back to joined Artist.name
            display = r["artist_display_name"] or r["main_artist_name"]
            out.append(
                {
                    "id": r["release_id"],
                    "title": r["title"],
                    "norm": nrm,
                    "catalog_number": r["catalog_number"],
                    "main_artist_name": display,
                    "main_artist_id": r["main_artist_id"],
                }
            )
    return out


# ─── Normalization ─────────────────────────────────────────────────────────

_PUNCT_RE = re.compile(r"[^\w\s\-']", flags=re.UNICODE)
_WS_RE = re.compile(r"\s+")


def normalize_for_match(s: str) -> str:
    """Lowercase, ASCII-folded, punctuation-stripped, whitespace-collapsed."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = s.encode("ascii", "ignore").decode("ascii")
    s = s.lower()
    s = _PUNCT_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def sanitize_filename_part(s: str) -> str:
    """Strip filesystem-unsafe chars but preserve umlauts."""
    if not s:
        return ""
    out = re.sub(r'[/\\:*?"<>|\x00-\x1f]', "-", s)
    out = re.sub(r"\s+", " ", out).strip()
    return out


# ─── Matching ──────────────────────────────────────────────────────────────


def find_artist_matches(post_norm: str, artists: list[dict]) -> list[dict]:
    """Return artists whose normalized name appears (substring or fuzzy) in
    the normalized post text. Sorted by score desc, max 5.
    """
    matches: list[dict] = []
    seen_ids: set[str] = set()

    # Stage 1 — direct substring match (very fast)
    for a in artists:
        # Word-boundary substring for short names so "TG" doesn't false-positive
        nm = a["norm"]
        if len(nm) < 4:
            # Require word-boundary match for very short names
            if re.search(rf"\b{re.escape(nm)}\b", post_norm):
                matches.append({**a, "score": 100.0, "match_type": "exact_substring"})
                seen_ids.add(a["id"])
        else:
            if nm in post_norm:
                matches.append({**a, "score": 100.0, "match_type": "exact_substring"})
                seen_ids.add(a["id"])

    if matches:
        # Have exact matches → don't bother with fuzzy
        matches.sort(key=lambda m: (-m["score"], len(m["norm"])))
        return matches[:5]

    # Stage 2 — fuzzy via rapidfuzz process.extract (only if no exact match)
    # Limit to artists whose norm shares at least one token with the post
    post_tokens = set(post_norm.split())
    candidate_artists = [
        a for a in artists if any(tok in post_tokens for tok in a["norm"].split())
    ]
    if not candidate_artists:
        return []

    norms = [a["norm"] for a in candidate_artists]
    res = process.extract(
        post_norm,
        norms,
        scorer=fuzz.token_set_ratio,
        limit=10,
        score_cutoff=ARTIST_THRESHOLD_LOW,
    )
    for matched_str, score, idx in res:
        a = candidate_artists[idx]
        if a["id"] in seen_ids:
            continue
        seen_ids.add(a["id"])
        matches.append({**a, "score": score, "match_type": "fuzzy"})

    matches.sort(key=lambda m: -m["score"])
    return matches[:5]


def find_release_matches(post_norm: str, releases: list[dict]) -> list[dict]:
    """Same idea as artists, but on Release titles."""
    matches: list[dict] = []
    seen_ids: set[str] = set()

    for r in releases:
        nm = r["norm"]
        if len(nm) < 4:
            if re.search(rf"\b{re.escape(nm)}\b", post_norm):
                matches.append({**r, "score": 100.0, "match_type": "exact_substring"})
                seen_ids.add(r["id"])
        else:
            if nm in post_norm:
                matches.append({**r, "score": 100.0, "match_type": "exact_substring"})
                seen_ids.add(r["id"])

    if matches:
        matches.sort(key=lambda m: (-m["score"], -len(m["norm"])))
        return matches[:5]

    # Fuzzy fallback — restrict to title-token-overlap candidates for speed
    post_tokens = set(post_norm.split())
    candidate_releases = [
        r for r in releases if any(tok in post_tokens for tok in r["norm"].split())
    ]
    if not candidate_releases:
        return []

    norms = [r["norm"] for r in candidate_releases]
    res = process.extract(
        post_norm,
        norms,
        scorer=fuzz.token_set_ratio,
        limit=10,
        score_cutoff=RELEASE_THRESHOLD_LOW,
    )
    for matched_str, score, idx in res:
        r = candidate_releases[idx]
        if r["id"] in seen_ids:
            continue
        seen_ids.add(r["id"])
        matches.append({**r, "score": score, "match_type": "fuzzy"})

    matches.sort(key=lambda m: -m["score"])
    return matches[:5]


def compute_confidence(
    artists: list[dict], releases: list[dict]
) -> tuple[float, str]:
    """Return (confidence 0..1, reason).

    Heuristic:
      both exact          → 0.95
      exact artist + fuzzy release ≥ HIGH → 0.85
      fuzzy artist + exact release  → 0.80
      both fuzzy ≥ HIGH   → 0.70
      only one side       → 0.40
      neither             → 0.0
    """
    if not artists or not releases:
        # Single side only (or none)
        if artists and not releases:
            return (0.40, "artist_only")
        if releases and not artists:
            return (0.40, "release_only")
        return (0.0, "no_match")

    a_score = artists[0]["score"]
    r_score = releases[0]["score"]
    a_exact = a_score >= 100.0
    r_exact = r_score >= 100.0

    if a_exact and r_exact:
        return (0.95, "both_exact")
    if a_exact and r_score >= RELEASE_THRESHOLD_HIGH:
        return (0.85, "exact_artist_fuzzy_release")
    if r_exact and a_score >= ARTIST_THRESHOLD_HIGH:
        return (0.80, "fuzzy_artist_exact_release")
    if a_score >= ARTIST_THRESHOLD_HIGH and r_score >= RELEASE_THRESHOLD_HIGH:
        return (0.70, "both_fuzzy_high")
    if a_score >= ARTIST_THRESHOLD_LOW and r_score >= RELEASE_THRESHOLD_LOW:
        return (0.50, "both_fuzzy_low")
    return (0.30, "weak")


def make_filename(
    artist_name: str,
    release_title: str,
    photo_index: int | None,
    photo_total: int,
) -> str:
    """Build `{Artist} - {Release} FB[-N].jpg` with sanitization."""
    a = sanitize_filename_part(artist_name)
    r = sanitize_filename_part(release_title)
    base = f"{a} - {r} FB"
    if photo_total > 1 and photo_index is not None:
        base += f"-{photo_index + 1}"
    return base + ".jpg"


# ─── Post inventory ────────────────────────────────────────────────────────


def collect_posts(posts_json_path: Path) -> list[dict]:
    """Walk profile_posts_1.json → list of {ts, text, fb_ids[], total_photos}.

    Skips shared posts without own content (consistent with P2).
    """
    with posts_json_path.open() as f:
        raw = json.load(f)

    out = []
    for p in raw:
        title = p.get("title", "")
        text = ""
        for d in p.get("data", []):
            if isinstance(d, dict) and "post" in d:
                text = d["post"]
                break
        if "geteilt" in title.lower() and not text.strip():
            continue

        fb_ids: list[str] = []
        for att in p.get("attachments", []):
            for d in att.get("data", []):
                if "media" not in d:
                    continue
                uri = d["media"].get("uri", "")
                if not uri:
                    continue
                fb_id = Path(uri).stem
                if fb_id not in fb_ids:
                    fb_ids.append(fb_id)
        out.append(
            {
                "ts": p.get("timestamp"),
                "text": text,
                "fb_ids": fb_ids,
                "total_photos": len(fb_ids),
            }
        )
    return out


def load_uploaded_fb_ids(manifest_path: Path) -> set[str]:
    """fb_ids that were successfully uploaded by P2."""
    if not manifest_path.exists():
        return set()
    out: set[str] = set()
    with manifest_path.open() as f:
        for line in f:
            try:
                row = json.loads(line)
                if row.get("status") == "uploaded":
                    out.add(row["fb_id"])
            except (json.JSONDecodeError, KeyError):
                pass
    return out


# ─── Main ──────────────────────────────────────────────────────────────────


def run(
    source_dir: Path,
    heartbeat_interval: int = DEFAULT_HEARTBEAT_INTERVAL,
    limit_posts: int | None = None,
) -> int:
    posts_json = (
        source_dir
        / "this_profile's_activity_across_facebook"
        / "posts"
        / "profile_posts_1.json"
    )
    manifest_images = source_dir / "manifest_images.jsonl"
    manifest_matches = source_dir / "manifest_matches.jsonl"

    if not posts_json.exists():
        print(f"FATAL: {posts_json} not found", file=sys.stderr)
        return 2

    print(f"Source:   {source_dir}", flush=True)
    print(f"Matches:  {manifest_matches}", flush=True)
    print(flush=True)

    # 1) Inventory
    posts = collect_posts(posts_json)
    uploaded_ids = load_uploaded_fb_ids(manifest_images)
    posts_with_uploaded = [
        p for p in posts if any(fb_id in uploaded_ids for fb_id in p["fb_ids"])
    ]
    print(f"  posts loaded:                 {len(posts)}", flush=True)
    print(f"  uploaded fb_ids in P2:        {len(uploaded_ids)}", flush=True)
    print(f"  posts with ≥1 uploaded image: {len(posts_with_uploaded)}", flush=True)

    if limit_posts:
        posts_with_uploaded = posts_with_uploaded[:limit_posts]
        print(f"  --limit-posts {limit_posts} → processing {len(posts_with_uploaded)}",
              flush=True)

    # 2) Pull catalog from VPS-Replica
    print("\nConnecting to VPS-Replica (vod_auctions_replica) …", flush=True)
    conn = connect_replica()
    print("  connection OK (read-only, application_name=fb_archive_p3_tier1_match)",
          flush=True)
    print("  loading Artists …", flush=True)
    artists = load_artists(conn)
    print(f"    {len(artists)} artists loaded", flush=True)
    print("  loading Releases (with main_artist via lateral join) …", flush=True)
    releases = load_releases(conn)
    print(f"    {len(releases)} releases loaded", flush=True)
    conn.close()

    # 3) Match + write manifest_matches.jsonl
    payload = {
        "source_dir": str(source_dir),
        "posts_to_process": len(posts_with_uploaded),
        "uploaded_images": len(uploaded_ids),
        "artists_loaded": len(artists),
        "releases_loaded": len(releases),
        "match_thresholds": {
            "artist_high": ARTIST_THRESHOLD_HIGH,
            "artist_low": ARTIST_THRESHOLD_LOW,
            "release_high": RELEASE_THRESHOLD_HIGH,
            "release_low": RELEASE_THRESHOLD_LOW,
            "tier1_min_confidence": TIER1_MIN_CONFIDENCE,
        },
        "limit_posts": limit_posts,
    }

    log_file = source_dir / "p3_tier1_match.log"

    # Truncate matches manifest for clean re-run (P3 is fast enough; if needed
    # later we can add resume-by-fb_id, but for now: clean writes are simpler).
    if manifest_matches.exists():
        manifest_matches.unlink()

    with JobTracker.start(
        kind="fb_import_p3_tier1_match",
        display_name=f"FB Tier-1 Match (P3) — {len(posts_with_uploaded)} posts",
        progress_total=len(posts_with_uploaded),
        payload=payload,
        log_file_path=str(log_file),
        triggered_by="manual",
        heartbeat_interval=heartbeat_interval,
    ) as job:
        n_tier1 = 0
        n_tier2 = 0
        n_tier3 = 0
        n_rows_written = 0

        with manifest_matches.open("w") as out_fh:
            for idx, post in enumerate(posts_with_uploaded, start=1):
                post_norm = normalize_for_match(post["text"])
                if not post_norm:
                    # No text — every photo gets tier 3
                    for photo_idx, fb_id in enumerate(post["fb_ids"]):
                        if fb_id not in uploaded_ids:
                            continue
                        row = {
                            "fb_id": fb_id,
                            "post_timestamp": post["ts"],
                            "photo_index": photo_idx,
                            "photo_total": post["total_photos"],
                            "tier": 3,
                            "confidence": 0.0,
                            "reason": "empty_text",
                            "artist_candidates": [],
                            "release_candidates": [],
                            "suggested_filename": None,
                            "needs_p4_ai_vision": False,
                        }
                        out_fh.write(json.dumps(row, ensure_ascii=False) + "\n")
                        n_rows_written += 1
                        n_tier3 += 1
                    job.heartbeat(progress_done=idx)
                    continue

                a_matches = find_artist_matches(post_norm, artists)
                r_matches = find_release_matches(post_norm, releases)
                conf, reason = compute_confidence(a_matches, r_matches)

                # Tier decision (per-post, applied to all photos in post)
                is_single_photo = post["total_photos"] == 1
                if conf >= TIER1_MIN_CONFIDENCE and is_single_photo and a_matches and r_matches:
                    tier = 1
                    needs_ai = False
                elif conf >= TIER1_MIN_CONFIDENCE and not is_single_photo and a_matches and r_matches:
                    # Multi-photo post with strong match — defer photo-disambiguation to AI
                    tier = 2
                    needs_ai = True
                elif a_matches or r_matches:
                    tier = 2
                    needs_ai = True
                else:
                    tier = 3
                    needs_ai = False

                # Build suggested filename
                primary_artist = (
                    a_matches[0]["name"] if a_matches else None
                ) or (
                    r_matches[0]["main_artist_name"] if r_matches and r_matches[0].get("main_artist_name") else None
                )
                primary_release = r_matches[0]["title"] if r_matches else None

                for photo_idx, fb_id in enumerate(post["fb_ids"]):
                    if fb_id not in uploaded_ids:
                        continue
                    if tier == 1 and primary_artist and primary_release:
                        suggested = make_filename(
                            primary_artist, primary_release,
                            photo_idx if not is_single_photo else None,
                            post["total_photos"],
                        )
                    elif tier in (2, 3) and primary_artist and primary_release:
                        suggested = make_filename(
                            primary_artist, primary_release,
                            photo_idx if not is_single_photo else None,
                            post["total_photos"],
                        )
                    else:
                        suggested = None

                    row = {
                        "fb_id": fb_id,
                        "post_timestamp": post["ts"],
                        "photo_index": photo_idx,
                        "photo_total": post["total_photos"],
                        "tier": tier,
                        "confidence": round(conf, 2),
                        "reason": reason,
                        "post_text_excerpt": post["text"][:200],
                        "artist_candidates": [
                            {
                                "id": a["id"],
                                "name": a["name"],
                                "score": round(a["score"], 1),
                                "match_type": a["match_type"],
                            }
                            for a in a_matches[:3]
                        ],
                        "release_candidates": [
                            {
                                "id": r["id"],
                                "title": r["title"],
                                "catalog_number": r.get("catalog_number"),
                                "main_artist_name": r.get("main_artist_name"),
                                "score": round(r["score"], 1),
                                "match_type": r["match_type"],
                            }
                            for r in r_matches[:3]
                        ],
                        "suggested_filename": suggested,
                        "needs_p4_ai_vision": needs_ai,
                    }
                    out_fh.write(json.dumps(row, ensure_ascii=False) + "\n")
                    n_rows_written += 1
                    if tier == 1:
                        n_tier1 += 1
                    elif tier == 2:
                        n_tier2 += 1
                    else:
                        n_tier3 += 1

                if idx % 100 == 0 or idx == len(posts_with_uploaded):
                    job.log(
                        f"{idx}/{len(posts_with_uploaded)} posts | "
                        f"rows={n_rows_written} t1={n_tier1} t2={n_tier2} t3={n_tier3}"
                    )
                job.heartbeat(progress_done=idx)

        result = {
            "posts_processed": len(posts_with_uploaded),
            "rows_written": n_rows_written,
            "tier1_auto_renameable": n_tier1,
            "tier2_needs_ai_vision": n_tier2,
            "tier3_no_match": n_tier3,
            "tier1_pct": round(n_tier1 / max(n_rows_written, 1) * 100, 1),
        }
        job.log(f"Final: {result}")
        job.succeed(result_summary=result)

    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    p.add_argument(
        "--source-dir",
        type=Path,
        default=Path("/root/VOD_Auctions/data/fb_archive_2026-05-07"),
    )
    p.add_argument(
        "--heartbeat-interval",
        type=int,
        default=DEFAULT_HEARTBEAT_INTERVAL,
    )
    p.add_argument(
        "--limit-posts",
        type=int,
        default=None,
        help="Process only first N posts (smoke-test)",
    )
    args = p.parse_args()
    return run(
        source_dir=args.source_dir,
        heartbeat_interval=args.heartbeat_interval,
        limit_posts=args.limit_posts,
    )


if __name__ == "__main__":
    sys.exit(main())
