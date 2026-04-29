#!/usr/bin/env python3
"""
Backfill: Mirror i.discogs.com hotlinks to R2 + repair gallery image-rows.

Background (rc52.5+ — 2026-04-29):
  POST /admin/media/:id ist als Apply-Sink für Discogs-Edit-Modal seit
  rc51.9.6 designed, externe Cover-URLs nach R2 zu mirrorieren. Auf VPS
  fehlten R2-Credentials im backend/.env → isR2Configured() = false →
  R2-Block wurde übersprungen → Hotlink-Fallback (i.discogs.com).
  Storefront rendert primär aus der Image-Tabelle, deshalb sah Frank
  auf der Public-Page weiterhin das alte Cover.

Was diese Script macht:
  • Findet alle Releases mit coverImage LIKE 'https://i.discogs.com/%'
  • Lädt das Bild von Discogs runter, optimiert (WebP, max 1200px, q=80)
  • Lädt nach R2 unter prefix tape-mag/discogs/ (selbe Konvention wie
    der Apply-Pfad)
  • Updatet Release.coverImage auf die R2-URL
  • Insert in Image-Tabelle (rang=0, source='admin_edit_backfill')
    damit das neue Cover auf der Storefront-Galerie an erster Stelle
    erscheint (orderBy rang ASC, id ASC)
  • Setzt Release.search_indexed_at = NULL → Meili-Delta-Sync zieht
    den neuen Cover nach (relevant für discovery-card-Image)

Nicht im Scope:
  • Cleanup von alten Image-Rows (rang=1..N) wenn discogs_id sich
    geändert hat — die bleiben als Galerie-Zusatzbilder erhalten.
    Cover (rang=0) ist die Hauptwirkung.

Usage:
  python3 backfill_hotlink_cover_images.py --dry-run
  python3 backfill_hotlink_cover_images.py --commit
  python3 backfill_hotlink_cover_images.py --commit --limit 1   # 1 Test
"""

import argparse
import hashlib
import io
import re
import sys
import time
from datetime import datetime

import requests
from PIL import Image as PILImage

from shared import (
    _ensure_psycopg2,
    get_r2_client,
    R2_BUCKET,
    IMAGE_BASE_URL as R2_TAPE_MAG_BASE,  # https://pub-...r2.dev/tape-mag/standard/
)
import os

R2_PUBLIC_BASE = "https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev"
R2_PREFIX_DISCOGS = "tape-mag/discogs/"

DB_URL = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
if not DB_URL:
    print("ERROR: SUPABASE_DB_URL/DATABASE_URL not set", file=sys.stderr)
    sys.exit(1)


def safe_release_id(release_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9-]", "_", release_id)


def optimize_image(buf: bytes, max_dim: int = 1200, quality: int = 80) -> bytes:
    img = PILImage.open(io.BytesIO(buf))
    img = img.convert("RGB") if img.mode in ("RGBA", "LA", "P") else img
    if max(img.size) > max_dim:
        img.thumbnail((max_dim, max_dim), PILImage.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="WEBP", quality=quality)
    return out.getvalue()


def download_optimize_upload(source_url: str, release_id: str, image_id: str) -> str | None:
    """Mirror of backend/src/lib/image-upload.ts::downloadOptimizeUpload.
    Returns public R2 URL or None on failure."""
    client = get_r2_client()
    if not client:
        return None
    try:
        resp = requests.get(source_url, timeout=15, headers={"User-Agent": "VOD-Auctions/1.0"})
        if resp.status_code != 200:
            print(f"  ✗ download failed ({resp.status_code}): {source_url[:80]}")
            return None
        try:
            optimized = optimize_image(resp.content)
        except Exception as e:
            print(f"  ✗ optimize failed: {e}")
            return None
        h = hashlib.md5(image_id.encode()).hexdigest()[:8]
        filename = f"{safe_release_id(release_id)}_{h}.webp"
        client.put_object(
            Bucket=R2_BUCKET,
            Key=R2_PREFIX_DISCOGS + filename,
            Body=optimized,
            ContentType="image/webp",
        )
        return f"{R2_PUBLIC_BASE}/{R2_PREFIX_DISCOGS}{filename}"
    except Exception as e:
        print(f"  ✗ exception: {e}")
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Show plan, don't write")
    parser.add_argument("--commit", action="store_true", help="Execute backfill")
    parser.add_argument("--limit", type=int, default=0, help="Process only N releases (0=all)")
    args = parser.parse_args()

    if not args.dry_run and not args.commit:
        print("Specify --dry-run or --commit", file=sys.stderr)
        sys.exit(2)

    pg = _ensure_psycopg2()
    conn = pg.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute("""
        SELECT id, title, "coverImage"
        FROM "Release"
        WHERE "coverImage" LIKE 'https://i.discogs.com/%'
        ORDER BY "updatedAt" DESC
    """)
    rows = cur.fetchall()
    if args.limit and args.limit > 0:
        rows = rows[: args.limit]
    print(f"Found {len(rows)} releases with i.discogs.com hotlinks")
    if not rows:
        return

    if args.dry_run:
        for rid, title, cover in rows:
            print(f"  • {rid:35s} {title[:50]:50s} {cover[:50]}")
        return

    # Test R2 client up-front
    if not get_r2_client():
        print("ERROR: R2 client not available — check R2_ACCESS_KEY_ID/SECRET", file=sys.stderr)
        sys.exit(3)

    success = 0
    failed = 0
    skipped = 0

    for rid, title, source_url in rows:
        print(f"→ {rid} — {title[:60]}")
        image_id = f"backfill-{rid}-{int(time.time() * 1000)}"
        r2_url = download_optimize_upload(source_url, rid, image_id)
        if not r2_url:
            print("  → skip (R2 upload failed)")
            failed += 1
            continue

        try:
            # Update Release.coverImage + bump search_indexed_at to NULL
            cur.execute(
                """UPDATE "Release"
                   SET "coverImage" = %s, search_indexed_at = NULL
                   WHERE id = %s""",
                (r2_url, rid),
            )
            # Insert Image row at rang=0 (cover position)
            cur.execute(
                """INSERT INTO "Image" (id, url, alt, "releaseId", rang, source, "createdAt")
                   VALUES (%s, %s, '', %s, 0, 'admin_edit_backfill', NOW())
                   ON CONFLICT (id) DO NOTHING""",
                (image_id, r2_url, rid),
            )
            conn.commit()
            print(f"  ✓ {r2_url[:80]}")
            success += 1
        except Exception as e:
            conn.rollback()
            print(f"  ✗ DB write failed: {e}")
            failed += 1

    print(f"\n──────")
    print(f"Backfill complete: {success} success, {failed} failed, {skipped} skipped")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
