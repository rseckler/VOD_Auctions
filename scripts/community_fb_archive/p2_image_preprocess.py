#!/usr/bin/env python3
"""
p2_image_preprocess.py — Phase P2 der FB-Migration-Pipeline (Annex §A10).

Liest die FB-Export-JSON, sammelt alle eindeutigen Media-URIs die in Posts
referenziert sind (skippt Shared-Posts ohne eigenen Inhalt), strippt EXIF,
konvertiert nach WebP (max 1200px, Q80) und lädt nach R2 unter
`tape-mag/community-fb/<fb-id>.webp`.

Manifest-Format: JSON-Lines unter
`/root/VOD_Auctions/data/fb_archive_2026-05-07/manifest_images.jsonl`
— append-only, resume-fähig (jeder Run skippt bereits hochgeladene Items
über die fb_id).

Decisions (Annex §A6.2):
  - GPS/EXIF: Nein — Standardverhalten von PIL beim WEBP-Save = strip
  - Shared-Posts: skippen (kein eigener Inhalt)

Usage (auf VPS):
    cd /root/VOD_Auctions/scripts
    source venv/bin/activate
    python3 -m community_fb_archive.p2_image_preprocess \\
        --source-dir /root/VOD_Auctions/data/fb_archive_2026-05-07 \\
        [--dry-run] [--limit 50] [--heartbeat-interval 30]

IO-Disziplin (Frank schützt):
  - 0 Catalog-DB-Reads. Nur Heartbeats in `background_job` (1× pro
    `heartbeat-interval` Sekunden, default 30s).
  - R2 hat eigenes Budget (Cloudflare), keine Supabase-Last.
  - Disk-Reads aus FB-Export-Ordner = lokaler VPS-Filesystem-Scan.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import boto3
from PIL import Image as PILImage

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from community_fb_archive.lib.job_tracker import JobTracker

# ─── Config ────────────────────────────────────────────────────────────────

R2_PUBLIC_BASE = "https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev"
R2_PREFIX = "tape-mag/community-fb/"
WEBP_MAX_DIM = 1200
WEBP_QUALITY = 80
DEFAULT_HEARTBEAT_INTERVAL = 30  # seconds — sparsam für 9-12h Jobs

# ─── R2 Client ─────────────────────────────────────────────────────────────


def make_r2_client():
    """Build a write-capable R2 client.

    Prefers R2_WRITE_* (scoped write-token created 2026-05-07 for the
    fb-archive pipeline). Falls back to R2_* for local dev / older scripts
    that share scope. Endpoint is account-level → identical for both.
    """
    endpoint = os.environ.get("R2_ENDPOINT")
    key = (
        os.environ.get("R2_WRITE_ACCESS_KEY_ID")
        or os.environ.get("R2_ACCESS_KEY_ID")
    )
    secret = (
        os.environ.get("R2_WRITE_SECRET_ACCESS_KEY")
        or os.environ.get("R2_SECRET_ACCESS_KEY")
    )
    if not all([endpoint, key, secret]):
        raise RuntimeError(
            "Missing R2 env vars: need R2_ENDPOINT plus either "
            "R2_WRITE_ACCESS_KEY_ID/R2_WRITE_SECRET_ACCESS_KEY (preferred) "
            "or R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY"
        )
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=key,
        aws_secret_access_key=secret,
        region_name="auto",
    )


def r2_bucket() -> str:
    bucket = os.environ.get("R2_BUCKET", "vod-images")
    return bucket


# ─── Manifest I/O ──────────────────────────────────────────────────────────


def load_manifest(path: Path) -> dict[str, dict]:
    """Read JSONL manifest into {fb_id: row} dict for resume."""
    if not path.exists():
        return {}
    rows: dict[str, dict] = {}
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
                rows[row["fb_id"]] = row
            except (json.JSONDecodeError, KeyError):
                pass  # skip corrupt lines silently
    return rows


def append_manifest(path: Path, row: dict) -> None:
    with path.open("a") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


# ─── Post-JSON parsing ─────────────────────────────────────────────────────


def collect_media_uris(posts_json_path: Path) -> dict[str, dict]:
    """Walk profile_posts_1.json, return {fb_id: {source_path, post_timestamps}}.

    Skips shared-posts (title contains 'Beitrag geteilt' AND no own text).
    """
    with posts_json_path.open() as f:
        posts = json.load(f)

    media: dict[str, dict] = {}
    skipped_shared = 0
    for p in posts:
        title = p.get("title", "")
        own_text = ""
        for d in p.get("data", []):
            if isinstance(d, dict) and "post" in d:
                own_text = d["post"]
                break
        # Skip shared-posts without own content (Annex §A6.2 #6)
        if "geteilt" in title.lower() and not own_text.strip():
            skipped_shared += 1
            continue

        ts = p.get("timestamp")
        for att in p.get("attachments", []):
            for d in att.get("data", []):
                if "media" not in d:
                    continue
                uri = d["media"].get("uri", "")
                if not uri:
                    continue
                fb_id = Path(uri).stem  # filename without extension
                if fb_id not in media:
                    media[fb_id] = {
                        "source_path": uri,
                        "post_timestamps": [],
                    }
                if ts:
                    media[fb_id]["post_timestamps"].append(ts)

    print(f"  collected {len(media)} unique media items "
          f"(skipped {skipped_shared} shared-posts)", flush=True)
    return media


# ─── Image processing ──────────────────────────────────────────────────────


def optimize_image(image_bytes: bytes) -> tuple[bytes, int, int, bool]:
    """Strip EXIF, convert to WebP, resize.

    Returns (webp_bytes, width, height, had_exif).
    PIL's default WEBP save does NOT carry EXIF unless explicitly passed.
    """
    img = PILImage.open(BytesIO(image_bytes))
    had_exif = bool(img.info.get("exif"))

    if img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGB")

    if img.width > WEBP_MAX_DIM or img.height > WEBP_MAX_DIM:
        img.thumbnail((WEBP_MAX_DIM, WEBP_MAX_DIM), PILImage.LANCZOS)

    out = BytesIO()
    img.save(out, format="WEBP", quality=WEBP_QUALITY, method=4)
    # Crucially: NO `exif=...` arg → EXIF is dropped (decision Annex §A6.2 #1)
    return out.getvalue(), img.width, img.height, had_exif


# ─── Main worker ───────────────────────────────────────────────────────────


def resolve_media_path(source_dir: Path, uri: str) -> Path | None:
    """Try multiple media-root locations for a given URI.

    The FB export ships TWO copies of the data: JSON variant under
    `this_profile's_activity_across_facebook/` and HTML variant under
    a separately rsync'd `this_profile_html/`. Both variants reference
    the same URI prefix in their JSON, but each contains a different
    SUBSET of the actual media files. We probe both before giving up.
    """
    # URI is like `this_profile's_activity_across_facebook/posts/media/Fotos_…/N.jpg`
    candidates = [
        source_dir / uri,  # JSON-variant native path
    ]
    if uri.startswith("this_profile's_activity_across_facebook/"):
        rest = uri[len("this_profile's_activity_across_facebook/"):]
        candidates.append(source_dir / "this_profile_html" / rest)
    for p in candidates:
        if p.exists():
            return p
    return None


def run(
    source_dir: Path,
    dry_run: bool = False,
    limit: int | None = None,
    heartbeat_interval: int = DEFAULT_HEARTBEAT_INTERVAL,
) -> int:
    posts_json = (
        source_dir
        / "this_profile's_activity_across_facebook"
        / "posts"
        / "profile_posts_1.json"
    )
    manifest_path = source_dir / "manifest_images.jsonl"

    if not posts_json.exists():
        print(f"FATAL: {posts_json} not found", file=sys.stderr)
        return 2

    print(f"Source:   {source_dir}", flush=True)
    print(f"Manifest: {manifest_path}", flush=True)
    print(f"Mode:     {'DRY-RUN' if dry_run else 'LIVE (will write to R2)'}", flush=True)
    print(f"Limit:    {limit or 'all'}", flush=True)
    print(flush=True)

    # 1) Plan
    print("Phase 1: scanning posts JSON for media URIs …", flush=True)
    media = collect_media_uris(posts_json)

    # 2) Resume: drop already-processed
    existing = load_manifest(manifest_path)
    todo = {k: v for k, v in media.items() if existing.get(k, {}).get("status") != "uploaded"}
    print(f"  manifest already has {len(existing)} uploaded "
          f"→ {len(todo)} remaining", flush=True)

    if limit is not None:
        todo_items = list(todo.items())[:limit]
        print(f"  --limit {limit} → processing only first {len(todo_items)}", flush=True)
    else:
        todo_items = list(todo.items())

    if not todo_items:
        print("Nothing to do. Exiting.", flush=True)
        return 0

    # 3) Setup R2 + JobTracker
    bucket = r2_bucket()
    r2 = None if dry_run else make_r2_client()

    payload = {
        "source_dir": str(source_dir),
        "total_media": len(media),
        "already_uploaded": len(existing),
        "to_process": len(todo_items),
        "dry_run": dry_run,
        "limit": limit,
        "r2_bucket": bucket,
        "r2_prefix": R2_PREFIX,
    }

    log_file = source_dir / "p2_image_preprocess.log"

    with JobTracker.start(
        kind="fb_import_p2_image_preprocess",
        display_name=(
            f"FB Image Preprocess (P2) — "
            f"{'DRY' if dry_run else 'LIVE'} {len(todo_items)} files"
        ),
        progress_total=len(todo_items),
        payload=payload,
        log_file_path=str(log_file),
        triggered_by="manual",
        heartbeat_interval=heartbeat_interval,
    ) as job:
        ok = 0
        skipped_missing = 0
        errors = 0
        had_exif_count = 0
        bytes_in = 0
        bytes_out = 0

        for idx, (fb_id, meta) in enumerate(todo_items, start=1):
            src_path = resolve_media_path(source_dir, meta["source_path"])
            if src_path is None:
                skipped_missing += 1
                row = {
                    "fb_id": fb_id,
                    "source_path": meta["source_path"],
                    "status": "missing",
                    "post_timestamps": meta["post_timestamps"],
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                }
                append_manifest(manifest_path, row)
                job.heartbeat(progress_done=idx)
                continue

            try:
                src_bytes = src_path.read_bytes()
                bytes_in += len(src_bytes)
                sha = hashlib.sha256(src_bytes).hexdigest()

                # Skip non-image files (videos etc.) — keep manifest entry
                ext = src_path.suffix.lower()
                if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
                    row = {
                        "fb_id": fb_id,
                        "source_path": meta["source_path"],
                        "source_size": len(src_bytes),
                        "source_sha256": sha,
                        "status": "skipped_non_image",
                        "ext": ext,
                        "post_timestamps": meta["post_timestamps"],
                    }
                    append_manifest(manifest_path, row)
                    job.heartbeat(progress_done=idx)
                    continue

                webp_bytes, w, h, had_exif = optimize_image(src_bytes)
                bytes_out += len(webp_bytes)
                if had_exif:
                    had_exif_count += 1

                r2_key = f"{R2_PREFIX}{fb_id}.webp"
                r2_url = f"{R2_PUBLIC_BASE}/{r2_key}"

                if not dry_run:
                    r2.put_object(
                        Bucket=bucket,
                        Key=r2_key,
                        Body=webp_bytes,
                        ContentType="image/webp",
                        CacheControl="public, max-age=31536000, immutable",
                    )

                row = {
                    "fb_id": fb_id,
                    "source_path": meta["source_path"],
                    "source_size": len(src_bytes),
                    "source_sha256": sha,
                    "r2_key": r2_key,
                    "r2_url": r2_url,
                    "new_size": len(webp_bytes),
                    "width": w,
                    "height": h,
                    "had_exif": had_exif,
                    "post_timestamps": meta["post_timestamps"],
                    "status": "uploaded" if not dry_run else "dry_run",
                    "uploaded_at": datetime.now(timezone.utc).isoformat(),
                }
                append_manifest(manifest_path, row)
                ok += 1

                if idx % 100 == 0 or idx == len(todo_items):
                    job.log(
                        f"{idx}/{len(todo_items)} ok={ok} miss={skipped_missing} "
                        f"err={errors} exif_seen={had_exif_count}"
                    )
                job.heartbeat(progress_done=idx)

            except Exception as e:
                errors += 1
                row = {
                    "fb_id": fb_id,
                    "source_path": meta["source_path"],
                    "status": "error",
                    "error": f"{type(e).__name__}: {e}",
                    "post_timestamps": meta["post_timestamps"],
                }
                append_manifest(manifest_path, row)
                job.log(f"  ERROR {fb_id}: {e}")
                job.heartbeat(progress_done=idx)

        result = {
            "processed": len(todo_items),
            "uploaded": ok,
            "missing": skipped_missing,
            "errors": errors,
            "had_exif_in_source": had_exif_count,
            "bytes_in_total": bytes_in,
            "bytes_out_total": bytes_out,
            "compression_ratio": (
                round(bytes_out / bytes_in, 3) if bytes_in else None
            ),
            "dry_run": dry_run,
        }
        job.log(f"Final: {result}")
        job.succeed(result_summary=result)
    return 0


# ─── CLI ───────────────────────────────────────────────────────────────────


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    p.add_argument(
        "--source-dir",
        type=Path,
        default=Path("/root/VOD_Auctions/data/fb_archive_2026-05-07"),
    )
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--limit", type=int, default=None)
    p.add_argument(
        "--heartbeat-interval",
        type=int,
        default=DEFAULT_HEARTBEAT_INTERVAL,
        help="Seconds between background_job heartbeats (default 30)",
    )
    args = p.parse_args()
    return run(
        source_dir=args.source_dir,
        dry_run=args.dry_run,
        limit=args.limit,
        heartbeat_interval=args.heartbeat_interval,
    )


if __name__ == "__main__":
    sys.exit(main())
