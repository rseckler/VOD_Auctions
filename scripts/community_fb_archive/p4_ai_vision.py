#!/usr/bin/env python3
"""
p4_ai_vision.py — Phase P4 der FB-Migration-Pipeline (Annex §A10, §A3.3).

Verarbeitet die Tier-2-Rows aus manifest_matches.jsonl (P3-Output) durch
Anthropic Claude Haiku 4.5 mit Vision + Tool-Use:

Pro POST (nicht pro Photo):
  - Lade alle Photos des Posts von R2
  - Hole Top-3 Artist-Kandidaten + Top-3 Release-Kandidaten aus dem
    Manifest (P3 hat sie schon vorgeschlagen)
  - Sende Post-Text + Foto-Thumbnails + Kandidaten-Liste an Haiku
  - Tool: identify_photo_releases — pro Photo-Index identifiziert das
    Modell `{artist_id, release_id, confidence, reason}` ODER
    `{unrelated: true}` falls das Foto nichts mit dem Catalog zu tun hat
  - Schreibt finale Suggestion + tier_after_ai (1=high-confidence,
    2=manual-review-needed, 3=unrelated) zurück ins Manifest

Output: manifest_matches_v2.jsonl (alle rows aus P3, mit AI-Annotations
        ergänzt für tier=2-Inputs)

Cost-Schätzung: ~3500 Tier-2 Posts × ~$0.005 = ~$17.50
Dauer: ~3-5h (Sequential Anthropic-Calls + R2-Downloads, ~3-5s/Post)

IO-Disziplin:
  - 0 Catalog-DB-Calls (alles aus dem Manifest)
  - R2: GET-Reads (kein Write), eigenes CF-Budget
  - Anthropic: pay-as-you-go
  - Heartbeat 30s in background_job
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any

import boto3
from PIL import Image as PILImage

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

import anthropic

from community_fb_archive.lib.job_tracker import JobTracker

# ─── Config ────────────────────────────────────────────────────────────────

MODEL = "claude-haiku-4-5-20251001"
DEFAULT_HEARTBEAT_INTERVAL = 30
THUMB_MAX_DIM = 512  # smaller thumbs = cheaper input tokens
THUMB_QUALITY = 75
MAX_PHOTOS_PER_CALL = 6  # safety cap on token cost
DEFAULT_MAX_TOKENS = 1024  # plenty for tool call

# Filename sanitization (mirrors P3)
import re

_PUNCT_RE = re.compile(r"[^\w\s\-']", flags=re.UNICODE)
_WS_RE = re.compile(r"\s+")


def sanitize_filename_part(s: str) -> str:
    if not s:
        return ""
    out = re.sub(r'[/\\:*?"<>|\x00-\x1f]', "-", s)
    out = re.sub(r"\s+", " ", out).strip()
    return out


def make_filename(artist: str, release: str, idx: int | None, total: int) -> str:
    a = sanitize_filename_part(artist)
    r = sanitize_filename_part(release)
    base = f"{a} - {r} FB"
    if total > 1 and idx is not None:
        base += f"-{idx + 1}"
    return base + ".jpg"


# ─── R2 client (read-only is fine — no write needed) ──────────────────────


def make_r2_client():
    endpoint = os.environ.get("R2_ENDPOINT")
    # P4 only reads — either key works
    key = (
        os.environ.get("R2_WRITE_ACCESS_KEY_ID")
        or os.environ.get("R2_ACCESS_KEY_ID")
    )
    secret = (
        os.environ.get("R2_WRITE_SECRET_ACCESS_KEY")
        or os.environ.get("R2_SECRET_ACCESS_KEY")
    )
    if not all([endpoint, key, secret]):
        raise RuntimeError("Missing R2 env vars")
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=key,
        aws_secret_access_key=secret,
        region_name="auto",
    )


def download_thumb(s3, bucket: str, r2_key: str) -> str:
    """Download R2 image, build downsized JPEG thumb, return base64-encoded."""
    obj = s3.get_object(Bucket=bucket, Key=r2_key)
    raw = obj["Body"].read()
    img = PILImage.open(BytesIO(raw))
    if img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGB")
    if img.width > THUMB_MAX_DIM or img.height > THUMB_MAX_DIM:
        img.thumbnail((THUMB_MAX_DIM, THUMB_MAX_DIM), PILImage.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=THUMB_QUALITY)
    return base64.standard_b64encode(buf.getvalue()).decode("ascii")


# ─── Manifest I/O ──────────────────────────────────────────────────────────


def group_by_post(matches_path: Path) -> dict[int, list[dict]]:
    """Group manifest_matches rows by post_timestamp."""
    by_post: dict[int, list[dict]] = defaultdict(list)
    with matches_path.open() as f:
        for line in f:
            try:
                r = json.loads(line)
                ts = r.get("post_timestamp")
                if ts is not None:
                    by_post[ts].append(r)
            except json.JSONDecodeError:
                pass
    # Stable order: photo_index ascending within a post
    for ts in by_post:
        by_post[ts].sort(key=lambda x: x.get("photo_index", 0))
    return by_post


def load_uploaded_index(images_path: Path) -> dict[str, str]:
    """fb_id → r2_key (for uploaded images only)."""
    out: dict[str, str] = {}
    with images_path.open() as f:
        for line in f:
            try:
                r = json.loads(line)
                if r.get("status") == "uploaded" and r.get("r2_key"):
                    out[r["fb_id"]] = r["r2_key"]
            except json.JSONDecodeError:
                pass
    return out


def load_already_processed(out_path: Path) -> set[int]:
    """Resume support: post_timestamps already in v2 output."""
    if not out_path.exists():
        return set()
    seen: set[int] = set()
    with out_path.open() as f:
        for line in f:
            try:
                r = json.loads(line)
                ts = r.get("post_timestamp")
                if ts is not None:
                    seen.add(ts)
            except json.JSONDecodeError:
                pass
    return seen


# ─── Anthropic call ────────────────────────────────────────────────────────


IDENTIFY_TOOL = {
    "name": "identify_photo_releases",
    "description": (
        "For each photo in the post, identify which Release (and main "
        "Artist) is shown — using the catalog candidates provided. "
        "Return one entry per photo, in the same order they appear. "
        "If a photo shows something unrelated to the catalog (e.g. a "
        "concert flyer, a portrait, a vinyl-shop scene), set "
        "unrelated=true and explain briefly."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "per_photo": {
                "type": "array",
                "description": "One entry per photo, in input order.",
                "items": {
                    "type": "object",
                    "properties": {
                        "photo_index": {
                            "type": "integer",
                            "description": "0-based index matching the input photo order",
                        },
                        "artist_id": {
                            "type": ["string", "null"],
                            "description": "id of best-matching artist from candidates, or null",
                        },
                        "release_id": {
                            "type": ["string", "null"],
                            "description": "id of best-matching release from candidates, or null",
                        },
                        "confidence": {
                            "type": "number",
                            "description": "0.0-1.0 — how sure the model is",
                        },
                        "reason": {
                            "type": "string",
                            "description": "1-sentence justification (visible text on cover, sleeve style, etc.)",
                        },
                        "unrelated": {
                            "type": "boolean",
                            "description": "true if photo doesn't show any of the catalog candidates",
                        },
                    },
                    "required": ["photo_index", "confidence", "reason"],
                },
            }
        },
        "required": ["per_photo"],
    },
}


def build_user_content(post_text: str, candidates: dict, photo_b64: list[str]) -> list[dict]:
    """Construct the multimodal user message: text + N images."""
    intro = (
        "You are matching photos from a Facebook post to entries in a music "
        "catalog. The post is about industrial / experimental / electronic "
        "music releases. For each photo, identify which Release and Artist "
        "from the candidate lists is shown. If a photo shows packaging, "
        "vinyl labels, sleeves, inserts, photos of artists, etc. — try to "
        "match. If a photo shows something unrelated (a concert flyer, "
        "Frank in his shop, scenery) → set unrelated=true.\n\n"
        f"Post text (German/English mix):\n\"\"\"\n{post_text[:2500]}\n\"\"\"\n\n"
        f"Candidate Artists ({len(candidates['artists'])}):\n"
    )
    for a in candidates["artists"]:
        intro += f"  - {a['id']}: {a['name']}\n"
    intro += f"\nCandidate Releases ({len(candidates['releases'])}):\n"
    for r in candidates["releases"]:
        cat = f" [{r['catalog_number']}]" if r.get("catalog_number") else ""
        ar = f" — {r['main_artist_name']}" if r.get("main_artist_name") else ""
        intro += f"  - {r['id']}: {r['title']}{cat}{ar}\n"
    intro += (
        f"\nPhotos in post (in order, {len(photo_b64)} total):\n"
        "Use the identify_photo_releases tool to record your decisions."
    )

    content: list[dict] = [{"type": "text", "text": intro}]
    for i, b64 in enumerate(photo_b64):
        content.append({
            "type": "text",
            "text": f"Photo #{i} (photo_index={i}):",
        })
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": b64,
            },
        })
    return content


def call_haiku(client, post_text: str, candidates: dict, photo_b64: list[str]) -> dict:
    """Single Anthropic call. Returns parsed tool-use input or raises."""
    content = build_user_content(post_text, candidates, photo_b64)
    resp = client.messages.create(
        model=MODEL,
        max_tokens=DEFAULT_MAX_TOKENS,
        tools=[IDENTIFY_TOOL],
        tool_choice={"type": "tool", "name": "identify_photo_releases"},
        messages=[{"role": "user", "content": content}],
    )
    for block in resp.content:
        if block.type == "tool_use" and block.name == "identify_photo_releases":
            return {
                "input": block.input,
                "usage": {
                    "input_tokens": resp.usage.input_tokens,
                    "output_tokens": resp.usage.output_tokens,
                },
            }
    raise RuntimeError("Model did not call identify_photo_releases tool")


# ─── Main ──────────────────────────────────────────────────────────────────


def run(
    source_dir: Path,
    limit_posts: int | None = None,
    heartbeat_interval: int = DEFAULT_HEARTBEAT_INTERVAL,
    dry_run: bool = False,
) -> int:
    matches_path = source_dir / "manifest_matches.jsonl"
    images_path = source_dir / "manifest_images.jsonl"
    out_path = source_dir / "manifest_matches_v2.jsonl"
    log_file = source_dir / "p4_ai_vision.log"

    if not matches_path.exists():
        print(f"FATAL: {matches_path} not found — run P3 first", file=sys.stderr)
        return 2
    if not images_path.exists():
        print(f"FATAL: {images_path} not found — run P2 first", file=sys.stderr)
        return 2

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("FATAL: ANTHROPIC_API_KEY not set in scripts/.env", file=sys.stderr)
        return 2

    print(f"Source:  {source_dir}", flush=True)
    print(f"Out:     {out_path}", flush=True)
    print(f"Mode:    {'DRY-RUN (no API calls)' if dry_run else 'LIVE'}", flush=True)
    print(flush=True)

    # 1) Group P3-output by post
    by_post = group_by_post(matches_path)
    uploaded_idx = load_uploaded_index(images_path)
    already = load_already_processed(out_path)

    # Build work queue: posts with at least one tier=2 row + photos uploaded.
    # For each such post we make ONE Anthropic call covering all its photos.
    work: list[tuple[int, list[dict]]] = []
    pass_through_count = 0
    for ts, rows in by_post.items():
        if ts in already:
            continue
        any_tier2 = any(r.get("tier") == 2 for r in rows)
        if not any_tier2:
            # Pass-through (tier 1 or tier 3): write unchanged to v2 output
            pass_through_count += len(rows)
            continue
        # Filter to rows whose fb_id was actually uploaded to R2
        usable = [r for r in rows if r["fb_id"] in uploaded_idx]
        if not usable:
            pass_through_count += len(rows)
            continue
        work.append((ts, usable))

    print(f"  posts grouped:          {len(by_post)}", flush=True)
    print(f"  already processed:      {len(already)}", flush=True)
    print(f"  pass-through (no t2):   {pass_through_count} rows", flush=True)
    print(f"  posts needing AI:       {len(work)}", flush=True)

    if limit_posts:
        work = work[:limit_posts]
        print(f"  --limit-posts → processing {len(work)}", flush=True)

    # 2) Resume: append-only output. Pass-through rows (unchanged) are
    # written first IF this is a fresh run.
    if not already:
        print("\nWriting pass-through (tier 1 + tier 3) rows to v2 …", flush=True)
        with out_path.open("w") as out_fh:
            for ts, rows in by_post.items():
                any_tier2 = any(r.get("tier") == 2 for r in rows)
                if not any_tier2:
                    for r in rows:
                        r["tier_after_ai"] = r["tier"]
                        r["ai_skipped_reason"] = "no_tier2_in_post"
                        out_fh.write(json.dumps(r, ensure_ascii=False) + "\n")
        # Re-load already (now includes pass-through)
        already = load_already_processed(out_path)

    if not work:
        print("\nNothing to process. Exiting.", flush=True)
        return 0

    # 3) Setup
    client = anthropic.Anthropic(api_key=api_key)
    r2 = make_r2_client()
    bucket = os.environ.get("R2_BUCKET", "vod-images")

    payload = {
        "model": MODEL,
        "thumb_max_dim": THUMB_MAX_DIM,
        "max_photos_per_call": MAX_PHOTOS_PER_CALL,
        "posts_to_process": len(work),
        "dry_run": dry_run,
    }

    with JobTracker.start(
        kind="fb_import_p4_ai_vision",
        display_name=f"FB AI Vision (P4) — {'DRY' if dry_run else 'LIVE'} {len(work)} posts",
        progress_total=len(work),
        payload=payload,
        log_file_path=str(log_file),
        triggered_by="manual",
        heartbeat_interval=heartbeat_interval,
    ) as job:
        n_high_conf = 0
        n_low_conf = 0
        n_unrelated = 0
        n_errors = 0
        total_input_tokens = 0
        total_output_tokens = 0

        with out_path.open("a") as out_fh:
            for idx, (ts, rows) in enumerate(work, start=1):
                # Cap photos per call
                rows_for_ai = rows[:MAX_PHOTOS_PER_CALL]
                rows_excess = rows[MAX_PHOTOS_PER_CALL:]

                # Build candidates dict — union of P3 candidates from all rows
                # in this post (deduped by id, top 3 each)
                artist_set: dict[str, dict] = {}
                release_set: dict[str, dict] = {}
                for r in rows_for_ai:
                    for a in r.get("artist_candidates", [])[:3]:
                        artist_set.setdefault(a["id"], a)
                    for rel in r.get("release_candidates", [])[:3]:
                        release_set.setdefault(rel["id"], rel)
                candidates = {
                    "artists": list(artist_set.values())[:8],
                    "releases": list(release_set.values())[:8],
                }

                post_text = rows_for_ai[0].get("post_text_excerpt", "") or ""
                photo_total = rows_for_ai[0].get("photo_total", len(rows_for_ai))

                if dry_run:
                    # Mock per_photo response for testing without API spend
                    ai_input = {
                        "per_photo": [
                            {
                                "photo_index": i,
                                "artist_id": None,
                                "release_id": None,
                                "confidence": 0.0,
                                "reason": "dry-run mock",
                                "unrelated": False,
                            }
                            for i in range(len(rows_for_ai))
                        ]
                    }
                    usage = {"input_tokens": 0, "output_tokens": 0}
                else:
                    try:
                        # Download thumbs
                        thumbs = []
                        for r in rows_for_ai:
                            r2_key = uploaded_idx.get(r["fb_id"])
                            if not r2_key:
                                thumbs.append(None)
                                continue
                            try:
                                thumbs.append(download_thumb(r2, bucket, r2_key))
                            except Exception as e:
                                job.log(
                                    f"  ts={ts} fb_id={r['fb_id']} thumb_dl_fail: {e}"
                                )
                                thumbs.append(None)
                        # Filter rows where thumb download failed
                        valid_rows = [
                            (i, r, t)
                            for i, (r, t) in enumerate(zip(rows_for_ai, thumbs))
                            if t is not None
                        ]
                        if not valid_rows:
                            n_errors += 1
                            for r in rows:
                                r["tier_after_ai"] = r["tier"]
                                r["ai_skipped_reason"] = "all_thumbs_failed"
                                out_fh.write(json.dumps(r, ensure_ascii=False) + "\n")
                            job.heartbeat(progress_done=idx)
                            continue

                        photo_b64 = [t for _, _, t in valid_rows]
                        result = call_haiku(client, post_text, candidates, photo_b64)
                        ai_input = result["input"]
                        usage = result["usage"]
                        total_input_tokens += usage["input_tokens"]
                        total_output_tokens += usage["output_tokens"]
                    except Exception as e:
                        n_errors += 1
                        job.log(f"  ts={ts} ai_call_fail: {type(e).__name__}: {e}")
                        for r in rows:
                            r["tier_after_ai"] = r["tier"]
                            r["ai_error"] = f"{type(e).__name__}: {e}"
                            out_fh.write(json.dumps(r, ensure_ascii=False) + "\n")
                        job.heartbeat(progress_done=idx)
                        continue

                # Map per_photo by photo_index
                per_photo = {p["photo_index"]: p for p in ai_input.get("per_photo", [])}

                # Resolve names from id (for filename)
                artist_by_id = {a["id"]: a["name"] for a in candidates["artists"]}
                release_by_id = {r["id"]: r for r in candidates["releases"]}

                for r in rows_for_ai:
                    pi = r.get("photo_index", 0)
                    ai = per_photo.get(pi)
                    if not ai:
                        r["tier_after_ai"] = r["tier"]
                        r["ai_skipped_reason"] = "no_per_photo_entry"
                    elif ai.get("unrelated"):
                        r["tier_after_ai"] = 3
                        r["ai_unrelated"] = True
                        r["ai_reason"] = ai.get("reason", "")
                        r["ai_confidence"] = float(ai.get("confidence", 0))
                        r["suggested_filename"] = None
                        n_unrelated += 1
                    else:
                        conf = float(ai.get("confidence", 0))
                        a_id = ai.get("artist_id")
                        rel_id = ai.get("release_id")
                        a_name = artist_by_id.get(a_id) if a_id else None
                        rel_obj = release_by_id.get(rel_id) if rel_id else None
                        rel_title = rel_obj["title"] if rel_obj else None
                        # Fallback to release.main_artist_name if AI didn't pick artist_id
                        if not a_name and rel_obj:
                            a_name = rel_obj.get("main_artist_name")

                        r["ai_artist_id"] = a_id
                        r["ai_release_id"] = rel_id
                        r["ai_confidence"] = conf
                        r["ai_reason"] = ai.get("reason", "")

                        if conf >= 0.7 and a_name and rel_title:
                            r["tier_after_ai"] = 1
                            r["suggested_filename"] = make_filename(
                                a_name,
                                rel_title,
                                pi if photo_total > 1 else None,
                                photo_total,
                            )
                            n_high_conf += 1
                        else:
                            r["tier_after_ai"] = 2
                            r["ai_skipped_reason"] = "low_confidence_or_no_match"
                            n_low_conf += 1
                    out_fh.write(json.dumps(r, ensure_ascii=False) + "\n")

                # Excess photos beyond MAX_PHOTOS_PER_CALL — pass through unchanged
                for r in rows_excess:
                    r["tier_after_ai"] = r["tier"]
                    r["ai_skipped_reason"] = "exceeded_max_photos_per_call"
                    out_fh.write(json.dumps(r, ensure_ascii=False) + "\n")

                if idx % 25 == 0 or idx == len(work):
                    job.log(
                        f"{idx}/{len(work)} | hi={n_high_conf} lo={n_low_conf} "
                        f"unrel={n_unrelated} err={n_errors} | "
                        f"tokens: in={total_input_tokens} out={total_output_tokens}"
                    )
                job.heartbeat(progress_done=idx)

        # Cost estimate (Haiku 4.5 indicative pricing): $1/M input + $5/M output
        cost_estimate_usd = round(
            total_input_tokens / 1_000_000 * 1.0
            + total_output_tokens / 1_000_000 * 5.0,
            4,
        )

        result = {
            "posts_processed": len(work),
            "high_confidence_renames": n_high_conf,
            "low_confidence_kept_tier2": n_low_conf,
            "unrelated_set_tier3": n_unrelated,
            "errors": n_errors,
            "input_tokens": total_input_tokens,
            "output_tokens": total_output_tokens,
            "cost_estimate_usd": cost_estimate_usd,
            "dry_run": dry_run,
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
        "--limit-posts",
        type=int,
        default=None,
        help="Process only first N tier-2 posts (smoke-test)",
    )
    p.add_argument(
        "--heartbeat-interval",
        type=int,
        default=DEFAULT_HEARTBEAT_INTERVAL,
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="No API calls, mock per_photo responses (free; tests pipeline)",
    )
    args = p.parse_args()
    return run(
        source_dir=args.source_dir,
        limit_posts=args.limit_posts,
        heartbeat_interval=args.heartbeat_interval,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    sys.exit(main())
