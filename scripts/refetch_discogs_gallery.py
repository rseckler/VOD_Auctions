#!/usr/bin/env python3
"""
Re-fetch a release's Discogs gallery images (skip primary, only secondaries).

Use case: Frank korrigiert in /app/media die discogs_id (z.B. von einer
Reissue auf das Original). Der bestehende Discogs-Apply-Pfad updated nur
das Cover, nicht die Galerie. Dieses Script holt die secondary-Bilder
nach, optimiert sie (WebP Q80, max 1200px), lädt sie nach R2 unter
tape-mag/discogs/<release_id>_<hash>.webp und legt Image-Rows mit
source='discogs' bei rang 31+ an.

Idempotent: skip wenn Image.id (deterministisch aus Discogs-URL gehasht)
schon existiert. Default ist dry-run; --commit muss explizit gesetzt sein.

Usage:
    cd VOD_Auctions/scripts
    source venv/bin/activate
    python3 refetch_discogs_gallery.py --release-id discogs-release-212200 --discogs-id 583045
    python3 refetch_discogs_gallery.py --release-id discogs-release-212200 --discogs-id 583045 --commit
"""

import os
import sys
import time
import hashlib
import argparse
from io import BytesIO
from pathlib import Path
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

R2_ENDPOINT = os.getenv("R2_ENDPOINT", "https://98bed59e4077ace876d8c5870be1ad39.r2.cloudflarestorage.com")
R2_BUCKET = os.getenv("R2_BUCKET", "vod-images")
R2_PREFIX = "tape-mag/discogs/"
R2_PUBLIC_URL = "https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev"
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")

SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL", "")
DISCOGS_TOKEN = os.getenv("DISCOGS_TOKEN", "")

GALLERY_START_RANG = 31  # rang 0 = cover, 1-30 reserved for admin_edit slots, 31+ = discogs gallery

import boto3
from PIL import Image as PILImage

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 missing. Run: pip install psycopg2-binary")
    sys.exit(1)


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


def optimize_image(image_bytes: bytes) -> bytes:
    img = PILImage.open(BytesIO(image_bytes))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    if img.width > 1200 or img.height > 1200:
        img.thumbnail((1200, 1200), PILImage.LANCZOS)
    out = BytesIO()
    img.save(out, format="WEBP", quality=80, method=4)
    return out.getvalue()


def fetch_discogs_release(discogs_id: int) -> dict:
    if not DISCOGS_TOKEN:
        print("ERROR: DISCOGS_TOKEN not set")
        sys.exit(1)
    headers = {
        "Authorization": f"Discogs token={DISCOGS_TOKEN}",
        "User-Agent": "VODAuctions/1.0 +https://vod-auctions.com",
    }
    r = requests.get(f"https://api.discogs.com/releases/{discogs_id}", headers=headers, timeout=15)
    r.raise_for_status()
    return r.json()


def main():
    p = argparse.ArgumentParser(description="Re-fetch Discogs gallery secondaries for a release")
    p.add_argument("--release-id", required=True, help="Release.id (e.g. discogs-release-212200)")
    p.add_argument("--discogs-id", required=True, type=int, help="Discogs release ID")
    p.add_argument("--commit", action="store_true", help="Apply changes (default: dry-run)")
    p.add_argument("--include-primary", action="store_true",
                   help="Also re-upload primary image (default: skip — use existing cover)")
    args = p.parse_args()

    if not SUPABASE_DB_URL:
        print("ERROR: SUPABASE_DB_URL not set")
        sys.exit(1)

    mode = "COMMIT" if args.commit else "DRY-RUN"
    print(f"[refetch-gallery] mode={mode} release={args.release_id} discogs={args.discogs_id}")

    # Fetch Discogs metadata
    print(f"[refetch-gallery] fetching api.discogs.com/releases/{args.discogs_id} ...")
    data = fetch_discogs_release(args.discogs_id)
    images = data.get("images", []) or []
    print(f"[refetch-gallery] discogs returned {len(images)} images")
    for i, im in enumerate(images):
        print(f"  [{i}] type={im.get('type')} uri={im.get('uri', '')[:80]}...")

    # Filter to gallery candidates (skip primary unless --include-primary)
    candidates = []
    for i, im in enumerate(images):
        if im.get("type") == "primary" and not args.include_primary:
            print(f"[refetch-gallery] skip primary [{i}] (cover already set; use --include-primary to override)")
            continue
        uri = im.get("uri")
        if not uri:
            continue
        candidates.append((i, im))

    if not candidates:
        print("[refetch-gallery] no candidate images, exit")
        return

    # Connect DB
    conn = psycopg2.connect(SUPABASE_DB_URL)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # Verify release exists
    cur.execute('SELECT id FROM "Release" WHERE id = %s', (args.release_id,))
    if not cur.fetchone():
        print(f"ERROR: Release {args.release_id} not found")
        sys.exit(1)

    # Get existing image IDs to avoid dupes
    cur.execute('SELECT id, url FROM "Image" WHERE "releaseId" = %s', (args.release_id,))
    existing_ids = {r["id"] for r in cur.fetchall()}
    print(f"[refetch-gallery] existing image rows on this release: {len(existing_ids)}")

    r2 = get_r2_client()
    inserted = 0
    skipped = 0
    rang = GALLERY_START_RANG

    for idx, im in candidates:
        uri = im["uri"]
        # Deterministic image ID: discogs-image-<discogs_id>-<idx>
        image_id = f"discogs-image-{args.discogs_id}-{idx + 1}"
        if image_id in existing_ids:
            print(f"[refetch-gallery] skip existing {image_id}")
            skipped += 1
            rang += 1
            continue

        # R2 key: short hash from URI for cache-busting
        short_hash = hashlib.md5(uri.encode()).hexdigest()[:8]
        r2_key = f"{R2_PREFIX}{args.release_id}_{short_hash}.webp"
        public_url = f"{R2_PUBLIC_URL}/{r2_key}"

        if args.commit:
            # Download
            print(f"[refetch-gallery] downloading {uri[:60]}...")
            try:
                resp = requests.get(uri, timeout=30, headers={"User-Agent": "VODAuctions/1.0"})
                resp.raise_for_status()
            except Exception as e:
                print(f"  ERROR download: {e}")
                continue

            # Optimize
            try:
                webp_bytes = optimize_image(resp.content)
            except Exception as e:
                print(f"  ERROR optimize: {e}")
                continue

            # Upload to R2
            try:
                r2.put_object(
                    Bucket=R2_BUCKET,
                    Key=r2_key,
                    Body=webp_bytes,
                    ContentType="image/webp",
                    CacheControl="public, max-age=31536000",
                )
            except Exception as e:
                print(f"  ERROR R2 upload: {e}")
                continue

            # Insert Image row
            cur.execute(
                '''INSERT INTO "Image" (id, url, "releaseId", rang, "position", source, "createdAt")
                   VALUES (%s, %s, %s, %s, %s, %s, NOW())''',
                (image_id, public_url, args.release_id, rang, 0, "discogs"),
            )
            print(f"  ✓ inserted rang={rang} url={public_url}")
            time.sleep(0.2)  # gentle to discogs CDN
        else:
            print(f"[refetch-gallery] WOULD insert rang={rang} id={image_id} url={public_url}")

        inserted += 1
        rang += 1

    if args.commit:
        # Bump search reindex
        cur.execute(
            'UPDATE "Release" SET search_indexed_at = NULL, "updatedAt" = NOW() WHERE id = %s',
            (args.release_id,),
        )
        conn.commit()
        print(f"[refetch-gallery] DB committed: inserted={inserted} skipped={skipped}")
    else:
        conn.rollback()
        print(f"[refetch-gallery] DRY-RUN: would insert={inserted} skipped={skipped}")
        print("[refetch-gallery] re-run with --commit to apply")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
