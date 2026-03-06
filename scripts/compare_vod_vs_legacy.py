#!/usr/bin/env python3
"""
Compare 50 random VOD-Auctions articles against Legacy MySQL (tape-mag.com source).

Checks: title, image count, exact image filenames, credits, tracklist, coverImage.
Outputs a detailed comparison table + summary statistics.
"""

import random
import json
from shared import get_mysql_connection, get_pg_connection, decode_entities

IMAGE_BASE_URL = "https://tape-mag.com/bilder/gross/"

# Category config: (product_category, id_prefix, legacy_table, legacy_typ for images)
CATEGORIES = [
    ("release", "legacy-release-", "3wadmin_tapes_releases", 10),
    ("band_literature", "legacy-bandlit-", "3wadmin_tapes_band_lit", 13),
    ("label_literature", "legacy-labellit-", "3wadmin_tapes_labels_lit", 14),
    ("press_literature", "legacy-presslit-", "3wadmin_tapes_pressorga_lit", 12),
]

TYPSET_MAP = {10: "8", 12: "7", 13: "5", 14: "6"}


def get_legacy_id(supabase_id, prefix):
    """Extract numeric legacy ID from supabase ID."""
    return int(supabase_id.replace(prefix, ""))


def main():
    pg_conn = get_pg_connection()
    mysql_conn = get_mysql_connection()
    pg_cur = pg_conn.cursor()
    my_cur = mysql_conn.cursor(dictionary=True)

    # Step 1: Pick ~50 random releases from Supabase (mixed categories)
    # Weight: 30 releases, 8 band_lit, 5 label_lit, 7 press_lit
    samples_per_cat = {"release": 30, "band_literature": 8, "label_literature": 5, "press_literature": 7}

    all_samples = []

    for cat, prefix, legacy_table, img_typ in CATEGORIES:
        count = samples_per_cat[cat]
        pg_cur.execute(f"""
            SELECT id, title, "coverImage", credits, tracklist, "artistId"
            FROM "Release"
            WHERE product_category = %s
            ORDER BY random()
            LIMIT %s
        """, (cat, count))
        cols = [desc[0] for desc in pg_cur.description]
        rows = [dict(zip(cols, r)) for r in pg_cur.fetchall()]
        for r in rows:
            r["_cat"] = cat
            r["_prefix"] = prefix
            r["_legacy_table"] = legacy_table
            r["_img_typ"] = img_typ
        all_samples.extend(rows)

    random.shuffle(all_samples)
    print(f"Selected {len(all_samples)} random articles for comparison\n")

    # Step 2: For each sample, fetch VOD images + Legacy data + Legacy images
    results = []
    issues_found = 0

    for sample in all_samples:
        sid = sample["id"]
        cat = sample["_cat"]
        prefix = sample["_prefix"]
        legacy_table = sample["_legacy_table"]
        img_typ = sample["_img_typ"]
        legacy_id = get_legacy_id(sid, prefix)

        result = {
            "id": sid,
            "category": cat,
            "legacy_id": legacy_id,
            "issues": [],
        }

        # --- VOD-Auctions data (Supabase) ---
        vod_title = sample["title"] or ""
        vod_cover = sample["coverImage"] or ""
        vod_credits = sample["credits"] or ""
        vod_tracklist = sample["tracklist"]

        # Get VOD images
        pg_cur.execute("""
            SELECT url FROM "Image"
            WHERE "releaseId" = %s
            ORDER BY url
        """, (sid,))
        vod_images = [r[0] for r in pg_cur.fetchall()]
        vod_image_filenames = sorted([u.replace(IMAGE_BASE_URL, "") for u in vod_images])

        # --- Legacy MySQL data ---
        my_cur.execute(f"SELECT * FROM `{legacy_table}` WHERE id = %s", (legacy_id,))
        legacy_row = my_cur.fetchone()

        if not legacy_row:
            result["issues"].append("LEGACY_NOT_FOUND")
            result["vod_title"] = vod_title
            result["legacy_title"] = "NOT FOUND"
            result["vod_img_count"] = len(vod_images)
            result["legacy_img_count"] = 0
            result["img_match"] = False
            result["title_match"] = False
            result["cover_match"] = False
            results.append(result)
            issues_found += 1
            continue

        legacy_title = decode_entities(legacy_row.get("title", ""))

        # Get legacy images for correct typ
        my_cur.execute("""
            SELECT bild FROM bilder_1
            WHERE inid = %s AND typ = %s
              AND bild IS NOT NULL AND bild != ''
            ORDER BY rang, id
        """, (legacy_id, img_typ))
        legacy_images = [r["bild"] for r in my_cur.fetchall()]
        legacy_image_filenames = sorted(legacy_images)

        # --- Compare title ---
        title_match = vod_title.strip().lower() == legacy_title.strip().lower()

        # --- Compare image count ---
        img_count_match = len(vod_images) == len(legacy_images)

        # --- Compare exact images ---
        img_exact_match = vod_image_filenames == legacy_image_filenames

        # --- Compare coverImage ---
        legacy_first_img = legacy_images[0] if legacy_images else None
        expected_cover = IMAGE_BASE_URL + legacy_first_img if legacy_first_img else None
        cover_match = (vod_cover == expected_cover) if expected_cover else (not vod_cover)

        # --- Check for wrong images (from other typ) ---
        wrong_images = []
        if not img_exact_match and vod_image_filenames:
            vod_set = set(vod_image_filenames)
            legacy_set = set(legacy_image_filenames)
            extra_in_vod = vod_set - legacy_set
            missing_in_vod = legacy_set - vod_set
            if extra_in_vod:
                wrong_images = list(extra_in_vod)

        # --- Credits check ---
        # Legacy doesn't have structured credits, so just check if VOD has them
        has_credits = bool(vod_credits.strip()) if vod_credits else False

        # --- Tracklist check ---
        has_tracklist = bool(vod_tracklist) and len(vod_tracklist) > 0 if vod_tracklist else False

        # --- Build issues list ---
        if not title_match:
            result["issues"].append("TITLE_MISMATCH")
        if not img_count_match:
            result["issues"].append(f"IMG_COUNT({len(vod_images)}vs{len(legacy_images)})")
        if not img_exact_match and img_count_match:
            result["issues"].append("IMG_CONTENT_MISMATCH")
        if wrong_images:
            result["issues"].append(f"WRONG_IMGS({len(wrong_images)})")
        if not cover_match and expected_cover:
            result["issues"].append("COVER_WRONG")

        # Store result
        result["vod_title"] = vod_title[:60]
        result["legacy_title"] = legacy_title[:60]
        result["vod_img_count"] = len(vod_images)
        result["legacy_img_count"] = len(legacy_images)
        result["img_match"] = img_exact_match
        result["title_match"] = title_match
        result["cover_match"] = cover_match
        result["has_credits"] = has_credits
        result["has_tracklist"] = has_tracklist
        result["wrong_images"] = wrong_images[:3]  # max 3 samples
        result["missing_images"] = list(set(legacy_image_filenames) - set(vod_image_filenames))[:3]

        typset = TYPSET_MAP.get(img_typ, "8")
        result["tape_mag_url"] = f"https://tape-mag.com/index.php?navid=1&ln=1&detail={legacy_id}&typset={typset}"

        if result["issues"]:
            issues_found += 1

        results.append(result)

    # Step 3: Print comparison table
    print("=" * 160)
    print(f"{'#':>3} {'Category':<16} {'VOD Title':<45} {'Imgs VOD':>8} {'Imgs Leg':>8} {'Imgs OK':>7} {'Cover':>5} {'Title':>5} {'Issues'}")
    print("-" * 160)

    for i, r in enumerate(results, 1):
        img_ok = "OK" if r.get("img_match") else "FAIL"
        cover_ok = "OK" if r.get("cover_match") else "FAIL"
        title_ok = "OK" if r.get("title_match") else "FAIL"
        issues_str = ", ".join(r["issues"]) if r["issues"] else "-"

        print(f"{i:>3} {r['category']:<16} {r['vod_title']:<45} {r.get('vod_img_count', 0):>8} {r.get('legacy_img_count', 0):>8} {img_ok:>7} {cover_ok:>5} {title_ok:>5} {issues_str}")

    # Step 4: Print detailed issues
    print(f"\n{'=' * 160}")
    print("DETAILED ISSUES")
    print(f"{'=' * 160}")

    issue_items = [r for r in results if r["issues"]]
    if not issue_items:
        print("  No issues found! All 50 articles match perfectly.")
    else:
        for r in issue_items:
            print(f"\n  [{r['id']}] ({r['category']})")
            print(f"    tape-mag: {r.get('tape_mag_url', 'N/A')}")
            print(f"    Issues: {', '.join(r['issues'])}")
            if not r.get("title_match") and r.get("legacy_title"):
                print(f"    VOD Title:    {r['vod_title']}")
                print(f"    Legacy Title: {r['legacy_title']}")
            if r.get("wrong_images"):
                print(f"    Wrong images in VOD (not in legacy): {r['wrong_images']}")
            if r.get("missing_images"):
                print(f"    Missing in VOD (in legacy): {r['missing_images']}")

    # Step 5: Summary statistics
    total = len(results)
    title_ok = sum(1 for r in results if r.get("title_match"))
    img_ok = sum(1 for r in results if r.get("img_match"))
    cover_ok = sum(1 for r in results if r.get("cover_match"))
    no_issues = sum(1 for r in results if not r["issues"])

    # Image count analysis
    total_vod_imgs = sum(r.get("vod_img_count", 0) for r in results)
    total_legacy_imgs = sum(r.get("legacy_img_count", 0) for r in results)
    fewer_imgs = sum(1 for r in results if r.get("vod_img_count", 0) < r.get("legacy_img_count", 0))
    more_imgs = sum(1 for r in results if r.get("vod_img_count", 0) > r.get("legacy_img_count", 0))

    # Per-category stats
    cat_stats = {}
    for r in results:
        cat = r["category"]
        if cat not in cat_stats:
            cat_stats[cat] = {"total": 0, "ok": 0, "img_ok": 0, "title_ok": 0, "cover_ok": 0}
        cat_stats[cat]["total"] += 1
        cat_stats[cat]["ok"] += 1 if not r["issues"] else 0
        cat_stats[cat]["img_ok"] += 1 if r.get("img_match") else 0
        cat_stats[cat]["title_ok"] += 1 if r.get("title_match") else 0
        cat_stats[cat]["cover_ok"] += 1 if r.get("cover_match") else 0

    print(f"\n{'=' * 160}")
    print("SUMMARY")
    print(f"{'=' * 160}")
    print(f"  Total compared:      {total}")
    print(f"  Perfect matches:     {no_issues} ({no_issues/total*100:.0f}%)")
    print(f"  Title matches:       {title_ok}/{total} ({title_ok/total*100:.0f}%)")
    print(f"  Image exact match:   {img_ok}/{total} ({img_ok/total*100:.0f}%)")
    print(f"  Cover image match:   {cover_ok}/{total} ({cover_ok/total*100:.0f}%)")
    print(f"  With issues:         {issues_found}/{total} ({issues_found/total*100:.0f}%)")
    print(f"\n  Total images VOD:    {total_vod_imgs}")
    print(f"  Total images Legacy: {total_legacy_imgs}")
    print(f"  Fewer in VOD:        {fewer_imgs} articles")
    print(f"  More in VOD:         {more_imgs} articles (wrong images?)")

    print(f"\n  Per Category:")
    for cat, s in sorted(cat_stats.items()):
        print(f"    {cat:<20} {s['ok']}/{s['total']} perfect | imgs {s['img_ok']}/{s['total']} | title {s['title_ok']}/{s['total']} | cover {s['cover_ok']}/{s['total']}")

    print(f"{'=' * 160}")

    pg_conn.close()
    mysql_conn.close()


if __name__ == "__main__":
    main()
