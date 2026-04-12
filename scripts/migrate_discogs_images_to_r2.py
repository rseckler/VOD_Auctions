#!/usr/bin/env python3
"""
Migrate Discogs hotlinked images to Cloudflare R2.

Eliminates 35,737 hotlinks on i.discogs.com by:
1. Downloading each image from Discogs CDN
2. Optimizing with Pillow (resize max 1200px, WebP 80%)
3. Uploading to R2 (vod-images bucket)
4. Updating Image.url + Release.coverImage in Supabase

Idempotent: skips images already migrated (url starts with R2 public URL).
Rate-limited: 5 req/s to Discogs CDN (respectful crawling).
Resume-safe: processes in batches, commits per batch.
Progress: writes progress to scripts/data/discogs_image_migration_progress.json

Usage:
    cd VOD_Auctions/scripts
    source venv/bin/activate
    python3 migrate_discogs_images_to_r2.py                    # full run
    python3 migrate_discogs_images_to_r2.py --dry-run          # preview only
    python3 migrate_discogs_images_to_r2.py --batch-size 100   # smaller batches
    python3 migrate_discogs_images_to_r2.py --limit 50         # test with N images
"""

import os
import sys
import json
import time
import hashlib
import argparse
from io import BytesIO
from pathlib import Path
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

# Load .env from parent dir
load_dotenv(Path(__file__).parent.parent / ".env")

# ─── Config ─────────────────────────────────────────────────────────────────

R2_ENDPOINT = os.getenv("R2_ENDPOINT", "https://98bed59e4077ace876d8c5870be1ad39.r2.cloudflarestorage.com")
R2_BUCKET = os.getenv("R2_BUCKET", "vod-images")
R2_PREFIX = "tape-mag/discogs/"  # Separate prefix from legacy images
R2_PUBLIC_URL = "https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev"
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")

SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL", "")

RATE_LIMIT_PER_SEC = 5  # Max requests to Discogs CDN per second
BATCH_SIZE = 200
PROGRESS_FILE = Path(__file__).parent / "data" / "discogs_image_migration_progress.json"

# ─── Dependencies ───────────────────────────────────────────────────────────

try:
    import boto3
except ImportError:
    print("ERROR: boto3 not installed. Run: pip install boto3")
    sys.exit(1)

try:
    from PIL import Image as PILImage
except ImportError:
    print("ERROR: Pillow not installed. Run: pip install Pillow")
    sys.exit(1)

# DB driver: prefer psycopg2 (VPS/Python 3.12), fallback to psycopg v3 (local/Python 3.14)
psycopg2 = None
psycopg3 = None
try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    try:
        import psycopg as psycopg3
    except ImportError:
        print("ERROR: No PostgreSQL driver. Run: pip install psycopg2-binary (or psycopg)")
        sys.exit(1)

# ─── R2 Client ──────────────────────────────────────────────────────────────

def get_r2_client():
    if not R2_ACCESS_KEY_ID or not R2_SECRET_ACCESS_KEY:
        print("ERROR: R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY not set")
        sys.exit(1)
    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
    )

# ─── Image Processing ──────────────────────────────────────────────────────

def optimize_image(image_bytes: bytes) -> tuple[bytes, str]:
    """
    Optimize image: resize max 1200px, convert to WebP 80%.
    Returns (optimized_bytes, content_type).
    """
    img = PILImage.open(BytesIO(image_bytes))

    # Convert RGBA/P to RGB for WebP
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    # Resize if larger than 1200px on either dimension
    max_dim = 1200
    if img.width > max_dim or img.height > max_dim:
        img.thumbnail((max_dim, max_dim), PILImage.LANCZOS)

    # Save as WebP
    out = BytesIO()
    img.save(out, format="WEBP", quality=80, method=4)
    return out.getvalue(), "image/webp"

# ─── URL Generation ─────────────────────────────────────────────────────────

def generate_r2_key(image_id: str, release_id: str) -> str:
    """Generate a unique R2 key for this image."""
    # Use image ID hash for uniqueness, release for grouping
    short_hash = hashlib.md5(image_id.encode()).hexdigest()[:8]
    safe_release = release_id.replace("/", "_")
    return f"{R2_PREFIX}{safe_release}_{short_hash}.webp"

# ─── Progress ───────────────────────────────────────────────────────────────

def load_progress() -> dict:
    if PROGRESS_FILE.exists():
        return json.loads(PROGRESS_FILE.read_text())
    return {"migrated": 0, "failed": 0, "skipped": 0, "last_image_id": None, "started_at": None}

def save_progress(progress: dict):
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
    PROGRESS_FILE.write_text(json.dumps(progress, indent=2, default=str))

# ─── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Migrate Discogs images to R2")
    parser.add_argument("--dry-run", action="store_true", help="Preview only, no changes")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE, help=f"Batch size (default {BATCH_SIZE})")
    parser.add_argument("--limit", type=int, default=0, help="Process only N images (0=all)")
    parser.add_argument("--reset", action="store_true", help="Reset progress and start from scratch")
    args = parser.parse_args()

    if not SUPABASE_DB_URL:
        print("ERROR: SUPABASE_DB_URL not set in .env")
        sys.exit(1)

    print(f"=== Discogs Image Migration to R2 ===")
    print(f"  Dry-run: {args.dry_run}")
    print(f"  Batch size: {args.batch_size}")
    print(f"  Rate limit: {RATE_LIMIT_PER_SEC}/s")
    print(f"  Limit: {args.limit or 'all'}")
    print()

    # Connect
    if psycopg2:
        conn = psycopg2.connect(SUPABASE_DB_URL)
    else:
        conn = psycopg3.connect(SUPABASE_DB_URL)
    conn.autocommit = False
    r2 = get_r2_client() if not args.dry_run else None

    # Progress
    progress = load_progress() if not args.reset else {"migrated": 0, "failed": 0, "skipped": 0, "last_image_id": None, "started_at": None}
    if not progress.get("started_at"):
        progress["started_at"] = datetime.now(timezone.utc).isoformat()

    # Count remaining
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM \"Image\" WHERE url LIKE '%i.discogs.com%'")
    total_remaining = cur.fetchone()[0]
    print(f"  Total Discogs hotlinks remaining: {total_remaining}")
    print()

    if total_remaining == 0:
        print("Nothing to migrate — all done!")
        return

    # Process in batches
    processed = 0
    batch_num = 0
    rate_limiter = []  # timestamps of recent requests

    while True:
        # Fetch batch
        cur.execute("""
            SELECT id, url, "releaseId", rang
            FROM "Image"
            WHERE url LIKE '%%i.discogs.com%%'
            ORDER BY rang ASC, id ASC
            LIMIT %s
        """, (args.batch_size,))
        rows = cur.fetchall()

        if not rows:
            break

        batch_num += 1
        print(f"--- Batch {batch_num}: {len(rows)} images ---")

        batch_migrated = 0
        batch_failed = 0
        batch_skipped = 0

        for row in rows:
            image_id, discogs_url, release_id, rang = row

            if args.limit and processed >= args.limit:
                print(f"\n  Limit reached ({args.limit}), stopping.")
                save_progress(progress)
                conn.close()
                return

            processed += 1

            # Rate limiting
            now = time.time()
            rate_limiter = [t for t in rate_limiter if now - t < 1.0]
            if len(rate_limiter) >= RATE_LIMIT_PER_SEC:
                sleep_time = 1.0 - (now - rate_limiter[0])
                if sleep_time > 0:
                    time.sleep(sleep_time)
            rate_limiter.append(time.time())

            # Download from Discogs
            try:
                resp = requests.get(discogs_url, timeout=30, headers={
                    "User-Agent": "VOD-Auctions-ImageMigration/1.0 (+https://vod-auctions.com)"
                })
                if resp.status_code != 200:
                    print(f"  SKIP {image_id}: HTTP {resp.status_code}")
                    batch_skipped += 1
                    progress["skipped"] += 1
                    continue
            except Exception as e:
                print(f"  FAIL {image_id}: download error: {e}")
                batch_failed += 1
                progress["failed"] += 1
                continue

            original_size = len(resp.content)

            # Optimize
            try:
                optimized, content_type = optimize_image(resp.content)
                optimized_size = len(optimized)
            except Exception as e:
                print(f"  FAIL {image_id}: optimize error: {e}")
                batch_failed += 1
                progress["failed"] += 1
                continue

            # Generate R2 key + public URL
            r2_key = generate_r2_key(image_id, release_id)
            public_url = f"{R2_PUBLIC_URL}/{r2_key}"

            if args.dry_run:
                compression = round((1 - optimized_size / max(original_size, 1)) * 100)
                print(f"  DRY {image_id}: {original_size // 1024}KB → {optimized_size // 1024}KB ({compression}%) → {r2_key}")
                batch_migrated += 1
                progress["migrated"] += 1
                continue

            # Upload to R2
            try:
                r2.put_object(
                    Bucket=R2_BUCKET,
                    Key=r2_key,
                    Body=optimized,
                    ContentType=content_type,
                )
            except Exception as e:
                print(f"  FAIL {image_id}: R2 upload error: {e}")
                batch_failed += 1
                progress["failed"] += 1
                continue

            # Update DB: Image.url
            try:
                up_cur = conn.cursor()
                up_cur.execute(
                    'UPDATE "Image" SET url = %s WHERE id = %s',
                    (public_url, image_id)
                )

                # Update Release.coverImage if this was the cover
                if rang <= 1:
                    up_cur.execute(
                        'UPDATE "Release" SET "coverImage" = %s, "updatedAt" = NOW() WHERE id = %s AND "coverImage" = %s',
                        (public_url, release_id, discogs_url)
                    )

                up_cur.close()
            except Exception as e:
                print(f"  FAIL {image_id}: DB update error: {e}")
                conn.rollback()
                batch_failed += 1
                progress["failed"] += 1
                continue

            compression = round((1 - optimized_size / max(original_size, 1)) * 100)
            batch_migrated += 1
            progress["migrated"] += 1
            progress["last_image_id"] = image_id

            if batch_migrated % 50 == 0:
                print(f"    ... {batch_migrated}/{len(rows)} in batch ({progress['migrated']} total)")

        # Commit batch
        if not args.dry_run:
            conn.commit()

        print(f"  Batch {batch_num}: migrated={batch_migrated} failed={batch_failed} skipped={batch_skipped}")
        save_progress(progress)

        if args.limit and processed >= args.limit:
            break

    # Final stats
    conn.close()
    save_progress(progress)

    print()
    print(f"=== Migration Complete ===")
    print(f"  Total migrated: {progress['migrated']}")
    print(f"  Total failed:   {progress['failed']}")
    print(f"  Total skipped:  {progress['skipped']}")
    print(f"  Started:        {progress['started_at']}")
    print(f"  Progress file:  {PROGRESS_FILE}")


if __name__ == "__main__":
    main()
