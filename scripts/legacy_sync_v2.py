#!/usr/bin/env python3
"""
Legacy MySQL → Supabase Incremental Sync (v2).

Full rewrite of legacy_sync.py per SYNC_ROBUSTNESS_PLAN v2.2 phases A1–A3.
v1 remains available as legacy_sync.py until v2 has proven itself in
production (48h parallel operation).

Key improvements over v1:

1. **Full-field change detection.** v1 diffed only 4 fields
   (legacy_price, legacy_available, title, coverImage) out of the 14 fields
   the UPSERT actually writes. Every other field change was invisible to
   sync_change_log. v2 uses the LEGACY_SYNC_FIELDS contract to diff all
   14 fields for music releases and all 11 synced fields for literature.

2. **Accurate image insert counts.** v1 counted attempted inserts
   (image_count += len(image_values)) regardless of ON CONFLICT DO NOTHING
   skips. v2 uses INSERT ... RETURNING id to get the true new-row count.

3. **Honest run-summary metrics.** v2 writes structured metrics to the
   extended sync_log columns introduced in phase A2 (run_id, phase,
   started_at, ended_at, duration_ms, rows_source, rows_written,
   rows_changed, rows_inserted, images_inserted, validation_status,
   validation_errors). The legacy `changes` JSONB is still written for
   backward compat with existing admin UI queries, but carries only extras
   (errors, R2 stats, etc), not the primary metrics.

4. **Post-run validation.** After the main sync completes, v2 runs four
   validation checks (row-count parity, NOT-NULL integrity, referential
   integrity, sync-freshness) and writes results to validation_status /
   validation_errors. Warnings are non-fatal; errors mark the run as
   validation_failed but still commit the data.

5. **Dry-run mode.** --dry-run reads from MySQL, computes the full diff,
   prints a summary, but does not write to Supabase. Safe for testing
   against staging or production.

6. **Override connection URL.** --pg-url allows running v2 against a
   different Postgres target (e.g. staging) without editing .env.

7. **Structured run context.** Start and end of run are bracketed by
   explicit sync_log rows (phase='started' → 'success'/'failed'/'validation_failed').
   Crashes within the run update the existing row in the finally block
   rather than leaving it dangling.

8. **Script versioning.** SCRIPT_VERSION constant is written to sync_log
   so historical rows can be attributed to specific script versions.

Key unchanged from v1:

- All paths use Path(__file__) — cwd-independent, safe from the PM2
  cwd regression we hit on 2026-04-05.
- R2 progress file is still written to scripts/r2_sync_progress.json.
- The SHARED module (shared.py) is unchanged — v1 and v2 both use it.
- The upsert SQL is still hand-written per entity type (not
  contract-generated) because the ON CONFLICT DO UPDATE SET clause has
  per-field conditional logic (label_enriched guard) that is easier to
  read and debug as explicit SQL.
- Protected fields (discogs_*, auction_*, admin_* etc.) are never
  touched. See SYNC_ROBUSTNESS_PLAN v2.2 §6.1 for the full ownership matrix.

Usage:

    # Production (normal hourly cron)
    python3 legacy_sync_v2.py

    # Dry-run against production — computes diffs but writes nothing
    python3 legacy_sync_v2.py --dry-run

    # Dry-run against staging Supabase
    python3 legacy_sync_v2.py --dry-run --pg-url "$STAGING_URL"

    # Real write to staging Supabase (for schema testing)
    python3 legacy_sync_v2.py --pg-url "$STAGING_URL"

Requires .env in project root with LEGACY_DB_* and SUPABASE_DB_URL.
"""

import argparse
import json
import os
import re
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

import psycopg2
import psycopg2.extras

from shared import (
    BATCH_SIZE,
    IMAGE_BASE_URL,
    decode_entities,
    get_mysql_connection,
    map_format_by_id,
    parse_price,
    slugify,
    upload_image_to_r2,
    check_r2_exists,
)


# ─── Constants ───────────────────────────────────────────────────────────────

SCRIPT_VERSION = "legacy_sync.py v2.0.0"
SYNC_TYPE = "legacy"

# German → English country name mapping (same as v1)
COUNTRY_DE_TO_EN = {
    "Vereinigte Staaten von Amerika": "United States",
    "Deutschland": "Germany",
    "Vereinigtes Königreich von Großbritannien und Nordirland": "United Kingdom",
    "--": None,
    "Frankreich": "France",
    "Niederlande": "Netherlands",
    "Italien": "Italy",
    "Belgien": "Belgium",
    "Japan": "Japan",
    "Kanada": "Canada",
    "Schweiz": "Switzerland",
    "Australien": "Australia",
    "Spanien": "Spain",
    "Österreich": "Austria",
    "Schweden": "Sweden",
    "Norwegen": "Norway",
    "Polen": "Poland",
    "Europäische Union": "European Union",
    "Portugal": "Portugal",
    "Dänemark": "Denmark",
    "Deutsche Demokratische Republik": "East Germany (GDR)",
    "Jugoslawien": "Yugoslavia",
    "Slowenien": "Slovenia",
    "Ungarn": "Hungary",
    "Griechenland": "Greece",
    "Mexiko": "Mexico",
    "Neuseeland": "New Zealand",
    "Finnland": "Finland",
    "Südafrika, Republik": "South Africa",
    "Russische Föderation": "Russia",
    "Tschechische Republik": "Czech Republic",
    "Serbien und Montenegro": "Serbia and Montenegro",
    "Brasilien": "Brazil",
    "Argentinien": "Argentina",
    "Irland, Republik": "Ireland",
    "Israel": "Israel",
    "Island": "Iceland",
    "Uruguay": "Uruguay",
    "Indien": "India",
    "Slowakei": "Slovakia",
    "Hongkong": "Hong Kong",
    "Chile": "Chile",
    "Luxemburg": "Luxembourg",
    "Rumänien": "Romania",
    "Kroatien": "Croatia",
}


# ─── Field Contract ──────────────────────────────────────────────────────────
#
# The authoritative list of fields synced from Legacy MySQL → Supabase Release
# per entity type. Derived from Phase A1 audit, see SYNC_ROBUSTNESS_PLAN v2.1
# §6.2. Every field listed here is diffed against the existing Supabase state
# on each run; changes are counted into rows_changed and optionally into
# sync_change_log (Phase B, not yet).
#
# Fields NOT listed here are never diffed by v2. They are either:
#   a) Technical (updatedAt, legacy_last_synced — always NOW())
#   b) Insert-only (id, createdAt)
#   c) Computed (slug)
#   d) Owned by another sync (discogs_*, auction_*, admin_*)
#
# For literature, legacy_condition, legacy_available, and catalogNumber are
# deliberately omitted because the MySQL literature tables have no source
# columns for them.

DIFF_FIELDS_RELEASE = [
    "title",
    "description",
    "year",
    "format",
    "format_id",
    "catalogNumber",
    "country",
    "artistId",
    "labelId",
    "coverImage",
    "legacy_price",
    "legacy_condition",
    "legacy_format_detail",
    "legacy_available",
]

DIFF_FIELDS_LITERATURE = [
    "title",
    "description",
    "year",
    "format",
    "format_id",
    "country",
    "artistId",  # for band_lit only
    "labelId",   # for label_lit only
    "pressOrgaId",  # for press_lit only
    "coverImage",
    "legacy_price",
    "legacy_format_detail",
]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def translate_country(name):
    """Translate German country name to English."""
    if not name:
        return None
    return COUNTRY_DE_TO_EN.get(name, name)


def normalize_value(value):
    """Normalize a value for comparison in the diff loop.

    Decimal / Decimal-like fields are rounded to 2 decimals to avoid
    float/Decimal comparison noise (e.g. 10.00 vs Decimal('10.00')).
    None is returned as-is; empty string is kept as empty string.
    """
    if value is None:
        return None
    # Round numeric-like values to 2dp for stable comparison
    try:
        if hasattr(value, "quantize"):  # Decimal
            return round(float(value), 2)
        if isinstance(value, float):
            return round(value, 2)
    except Exception:
        pass
    return value


def compute_diff(old_row, new_values, fields):
    """Compute field-level deltas between old (dict from Supabase) and new
    (dict to be written). Returns dict of {field: {old, new}} for changed
    fields only. Returns empty dict if nothing changed.
    """
    deltas = {}
    for field in fields:
        old_v = normalize_value(old_row.get(field))
        new_v = normalize_value(new_values.get(field))
        if old_v != new_v:
            deltas[field] = {"old": old_v, "new": new_v}
    return deltas


def get_pg_connection(pg_url_override=None):
    """Create PostgreSQL connection to Supabase, optionally overriding
    the URL from environment. Used by --pg-url flag."""
    db_url = pg_url_override or os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("ERROR: SUPABASE_DB_URL not set in .env and no --pg-url override")
        sys.exit(1)
    return psycopg2.connect(db_url)


# ─── sync_log helpers ────────────────────────────────────────────────────────

def start_run(pg_conn, sync_type, dry_run=False):
    """Create a new sync_log row with phase='started' and return run context."""
    run_id = str(uuid.uuid4())
    ctx = {
        "run_id": run_id,
        "sync_log_id": None,
        "started_at": time.time(),
        "dry_run": dry_run,
    }
    if dry_run:
        # Don't write anything to sync_log in dry-run mode
        return ctx
    cur = pg_conn.cursor()
    cur.execute(
        """INSERT INTO sync_log
             (sync_type, sync_date, status, phase, run_id, script_version,
              started_at, changes)
           VALUES (%s, NOW(), 'success', 'started', %s, %s, NOW(), '{}'::jsonb)
           RETURNING id""",
        (sync_type, run_id, SCRIPT_VERSION),
    )
    ctx["sync_log_id"] = cur.fetchone()[0]
    pg_conn.commit()
    return ctx


def end_run(pg_conn, ctx, counters, phase="success", error_message=None,
            validation_status=None, validation_errors=None, extras=None):
    """Finalize a sync_log row with all accumulated metrics."""
    duration_ms = int((time.time() - ctx["started_at"]) * 1000)
    if ctx.get("dry_run"):
        return duration_ms
    if ctx.get("sync_log_id") is None:
        return duration_ms
    legacy_status = "success" if phase in ("success", "validation_failed") else "error"
    cur = pg_conn.cursor()
    cur.execute(
        """UPDATE sync_log SET
             phase = %s,
             status = %s,
             ended_at = NOW(),
             duration_ms = %s,
             rows_source = %s,
             rows_written = %s,
             rows_changed = %s,
             rows_inserted = %s,
             images_inserted = %s,
             validation_status = %s,
             validation_errors = %s::jsonb,
             error_message = %s,
             changes = %s::jsonb
           WHERE id = %s""",
        (
            phase,
            legacy_status,
            duration_ms,
            counters.get("rows_source"),
            counters.get("rows_written"),
            counters.get("rows_changed"),
            counters.get("rows_inserted"),
            counters.get("images_inserted"),
            validation_status,
            json.dumps(validation_errors) if validation_errors else None,
            error_message,
            json.dumps(extras or {}),
            ctx["sync_log_id"],
        ),
    )
    pg_conn.commit()
    return duration_ms


# ─── Artist / Label / PressOrga sync (mostly unchanged from v1) ───────────────

def fetch_legacy_artist_ids(mysql_conn):
    cursor = mysql_conn.cursor(dictionary=True)
    cursor.execute("SELECT id, name FROM 3wadmin_tapes_band ORDER BY id")
    rows = cursor.fetchall()
    cursor.close()
    return rows


def fetch_legacy_label_ids(mysql_conn):
    cursor = mysql_conn.cursor(dictionary=True)
    cursor.execute("SELECT id, label as name FROM 3wadmin_tapes_labels ORDER BY id")
    rows = cursor.fetchall()
    cursor.close()
    return rows


def fetch_existing_ids(pg_conn, table, prefix):
    cur = pg_conn.cursor()
    cur.execute(
        f'SELECT id FROM "{table}" WHERE id LIKE %s',
        (f"{prefix}%",),
    )
    ids = {row[0] for row in cur.fetchall()}
    cur.close()
    return ids


def sync_artists(mysql_conn, pg_conn, dry_run=False):
    """Insert new artists. Returns (inserted_count, source_count)."""
    print("\n=== Syncing Artists ===")
    legacy_rows = fetch_legacy_artist_ids(mysql_conn)
    existing_ids = fetch_existing_ids(pg_conn, "Artist", "legacy-artist-")
    new_rows = [r for r in legacy_rows if f"legacy-artist-{r['id']}" not in existing_ids]
    print(f"  Legacy: {len(legacy_rows)} | Supabase: {len(existing_ids)} | New: {len(new_rows)}")

    if not new_rows or dry_run:
        if dry_run and new_rows:
            print(f"  [dry-run] Would insert {len(new_rows)} new artists")
        return (0, len(legacy_rows))

    pg_cur = pg_conn.cursor()
    for i in range(0, len(new_rows), BATCH_SIZE):
        batch = new_rows[i : i + BATCH_SIZE]
        values = []
        for row in batch:
            name = decode_entities(row["name"]) or f"Unknown Artist #{row['id']}"
            slug = slugify(name) or f"artist-{row['id']}"
            aid = f"legacy-artist-{row['id']}"
            values.append((aid, slug + f"-{row['id']}", name))
        psycopg2.extras.execute_values(
            pg_cur,
            """INSERT INTO "Artist" (id, slug, name, "createdAt", "updatedAt")
               VALUES %s ON CONFLICT (id) DO NOTHING""",
            values,
            template="(%s, %s, %s, NOW(), NOW())",
        )
    pg_conn.commit()
    print(f"  Inserted {len(new_rows)} new artists.")
    return (len(new_rows), len(legacy_rows))


def sync_labels(mysql_conn, pg_conn, dry_run=False):
    print("\n=== Syncing Labels ===")
    legacy_rows = fetch_legacy_label_ids(mysql_conn)
    existing_ids = fetch_existing_ids(pg_conn, "Label", "legacy-label-")
    new_rows = [r for r in legacy_rows if f"legacy-label-{r['id']}" not in existing_ids]
    print(f"  Legacy: {len(legacy_rows)} | Supabase: {len(existing_ids)} | New: {len(new_rows)}")

    if not new_rows or dry_run:
        if dry_run and new_rows:
            print(f"  [dry-run] Would insert {len(new_rows)} new labels")
        return (0, len(legacy_rows))

    pg_cur = pg_conn.cursor()
    for i in range(0, len(new_rows), BATCH_SIZE):
        batch = new_rows[i : i + BATCH_SIZE]
        values = []
        for row in batch:
            name = decode_entities(row["name"]) or f"Unknown Label #{row['id']}"
            slug = slugify(name) or f"label-{row['id']}"
            lid = f"legacy-label-{row['id']}"
            values.append((lid, slug + f"-{row['id']}", name))
        psycopg2.extras.execute_values(
            pg_cur,
            """INSERT INTO "Label" (id, slug, name, "createdAt", "updatedAt")
               VALUES %s ON CONFLICT (id) DO NOTHING""",
            values,
            template="(%s, %s, %s, NOW(), NOW())",
        )
    pg_conn.commit()
    print(f"  Inserted {len(new_rows)} new labels.")
    return (len(new_rows), len(legacy_rows))


def sync_pressorga(mysql_conn, pg_conn, dry_run=False):
    print("\n=== Syncing PressOrga ===")
    cursor = mysql_conn.cursor(dictionary=True)
    cursor.execute("SELECT id, name FROM 3wadmin_tapes_pressorga ORDER BY id")
    legacy_rows = cursor.fetchall()
    cursor.close()

    existing_ids = fetch_existing_ids(pg_conn, "PressOrga", "legacy-pressorga-")
    new_rows = [r for r in legacy_rows if f"legacy-pressorga-{r['id']}" not in existing_ids]
    print(f"  Legacy: {len(legacy_rows)} | Supabase: {len(existing_ids)} | New: {len(new_rows)}")

    if not new_rows or dry_run:
        if dry_run and new_rows:
            print(f"  [dry-run] Would insert {len(new_rows)} new PressOrga")
        return (0, len(legacy_rows))

    pg_cur = pg_conn.cursor()
    for i in range(0, len(new_rows), BATCH_SIZE):
        batch = new_rows[i : i + BATCH_SIZE]
        values = []
        for row in batch:
            name = decode_entities(row["name"]) or f"PressOrga #{row['id']}"
            slug = slugify(name) or f"pressorga-{row['id']}"
            pid = f"legacy-pressorga-{row['id']}"
            values.append((pid, slug + f"-{row['id']}", name))
        psycopg2.extras.execute_values(
            pg_cur,
            """INSERT INTO "PressOrga" (id, slug, name, "createdAt", "updatedAt")
               VALUES %s ON CONFLICT (id) DO NOTHING""",
            values,
            template="(%s, %s, %s, NOW(), NOW())",
        )
    pg_conn.commit()
    print(f"  Inserted {len(new_rows)} new PressOrga.")
    return (len(new_rows), len(legacy_rows))


# ─── sync_releases v2 ────────────────────────────────────────────────────────

def sync_releases_v2(mysql_conn, pg_conn, run_id, dry_run=False):
    """Sync music releases from 3wadmin_tapes_releases.

    Returns a stats dict with ALL counters matching the extended sync_log
    schema: rows_source, rows_written, rows_changed, rows_inserted,
    images_inserted, plus errors and R2 metrics.
    """
    print("\n=== Syncing Releases (v2 full-field diff) ===")
    cursor = mysql_conn.cursor(dictionary=True)

    cursor.execute("SELECT COUNT(*) as cnt FROM 3wadmin_tapes_releases")
    total = cursor.fetchone()["cnt"]
    print(f"  Legacy releases: {total}")

    pg_cur = pg_conn.cursor()
    offset = 0
    processed = 0
    errors = 0
    rows_changed = 0
    rows_inserted = 0
    images_inserted = 0
    r2_uploaded = 0
    r2_failed = 0
    r2_checked = 0
    change_entries = []

    while offset < total:
        cursor.execute(
            """
            SELECT
                r.id, r.title, r.moreinfo, r.cataloguenumber, r.year,
                r.preis, r.frei, r.spezifikation, r.artist, r.label,
                r.format, r.country,
                b.name as band_name,
                l.label as label_name,
                f.name as format_name,
                c.name as country_name,
                (SELECT bi2.bild FROM bilder_1 bi2
                 WHERE bi2.inid = r.id AND bi2.typ = 10
                 ORDER BY bi2.rang, bi2.id LIMIT 1) as image_filename
            FROM 3wadmin_tapes_releases r
            LEFT JOIN 3wadmin_tapes_band b ON r.artist = b.id
            LEFT JOIN 3wadmin_tapes_labels l ON r.label = l.id
            LEFT JOIN 3wadmin_tapes_formate f ON r.format = f.id
            LEFT JOIN 3wadmin_shop_countries c ON r.country = c.id
            ORDER BY r.id ASC
            LIMIT %s OFFSET %s
            """,
            (BATCH_SIZE, offset),
        )
        rows = cursor.fetchall()
        if not rows:
            break

        # Build new-value dicts and release_values tuples in one pass
        new_values_by_id = {}
        release_values = []
        image_values = []

        # Pre-fetch existing coverImage for R2 deduplication
        batch_ids_r2 = [f"legacy-release-{r['id']}" for r in rows]
        existing_covers = {}
        try:
            fetch_cur = pg_conn.cursor()
            fetch_cur.execute(
                """SELECT id, "coverImage" FROM "Release" WHERE id = ANY(%s)""",
                (batch_ids_r2,),
            )
            for erow in fetch_cur.fetchall():
                existing_covers[erow[0]] = erow[1]
            fetch_cur.close()
        except Exception:
            pass

        for row in rows:
            try:
                title = decode_entities(row["title"]) or f"Release #{row['id']}"
                description = str(row["moreinfo"]) if row["moreinfo"] else None
                catalog_number = decode_entities(row["cataloguenumber"]) if row["cataloguenumber"] else None
                if catalog_number:
                    catalog_number = re.sub(r"[\r\n]+", " ", catalog_number).strip()
                year = row["year"] if row["year"] and row["year"] > 0 else None
                format_id = row["format"] if row["format"] and row["format"] > 0 else None
                format_enum = map_format_by_id(format_id)
                country = translate_country(row["country_name"])
                artist_name = decode_entities(row["band_name"]) if row["band_name"] else "unknown"
                slug = slugify(f"{artist_name} {title} {row['id']}") or f"release-{row['id']}"
                artist_id = f"legacy-artist-{row['artist']}" if row["artist"] else None
                label_id = f"legacy-label-{row['label']}" if row["label"] else None
                release_id = f"legacy-release-{row['id']}"

                cover_image = None
                if row.get("image_filename"):
                    filename = str(row["image_filename"])
                    new_cover_url = IMAGE_BASE_URL + filename
                    existing_cover = existing_covers.get(release_id)
                    if existing_cover != new_cover_url and not dry_run:
                        r2_checked += 1
                        if not check_r2_exists(filename):
                            if upload_image_to_r2(filename):
                                r2_uploaded += 1
                            else:
                                r2_failed += 1
                    cover_image = new_cover_url

                price = parse_price(row.get("preis"))
                condition = decode_entities(row.get("spezifikation")) if row.get("spezifikation") else None
                format_detail = decode_entities(row.get("format_name")) if row.get("format_name") else None
                frei = row.get("frei")
                legacy_available = (frei == 1)

                # Full-field new-value dict for diff comparison
                new_values_by_id[release_id] = {
                    "title": title,
                    "description": description,
                    "year": year,
                    "format": format_enum,
                    "format_id": format_id,
                    "catalogNumber": catalog_number,
                    "country": country,
                    "artistId": artist_id,
                    "labelId": label_id,
                    "coverImage": cover_image,
                    "legacy_price": price,
                    "legacy_condition": condition,
                    "legacy_format_detail": format_detail,
                    "legacy_available": legacy_available,
                }

                release_values.append((
                    release_id, slug, title, description, year,
                    format_enum, format_id, catalog_number, country,
                    artist_id, label_id, cover_image, price, condition,
                    format_detail, legacy_available,
                ))

                if cover_image:
                    image_id = f"legacy-image-{row['id']}"
                    image_values.append((image_id, cover_image, title, release_id))
            except Exception as e:
                errors += 1
                print(f"\n  ERROR on release #{row['id']}: {e}")

        # Pre-fetch existing state for ALL contract fields (for full-field diff)
        existing_state = {}
        if release_values:
            batch_ids = [rv[0] for rv in release_values]
            fetch_cur = pg_conn.cursor()
            fetch_cur.execute(
                """SELECT id, title, description, year, format::text, format_id,
                          "catalogNumber", country, "artistId", "labelId",
                          "coverImage", legacy_price, legacy_condition,
                          legacy_format_detail, legacy_available, label_enriched
                   FROM "Release" WHERE id = ANY(%s)""",
                (batch_ids,),
            )
            for frow in fetch_cur.fetchall():
                existing_state[frow[0]] = {
                    "title": frow[1],
                    "description": frow[2],
                    "year": frow[3],
                    "format": frow[4],
                    "format_id": frow[5],
                    "catalogNumber": frow[6],
                    "country": frow[7],
                    "artistId": frow[8],
                    "labelId": frow[9],
                    "coverImage": frow[10],
                    "legacy_price": frow[11],
                    "legacy_condition": frow[12],
                    "legacy_format_detail": frow[13],
                    "legacy_available": frow[14],
                    "label_enriched": frow[15],
                }
            fetch_cur.close()

        # UPSERT releases (same SQL as v1 — hand-written because of the
        # label_enriched guard on labelId that is awkward to generate)
        if release_values and not dry_run:
            psycopg2.extras.execute_values(
                pg_cur,
                """INSERT INTO "Release" (
                    id, slug, title, description, year, format, format_id,
                    "catalogNumber", country, "artistId", "labelId", "coverImage",
                    legacy_price, legacy_condition, legacy_format_detail, legacy_available,
                    "createdAt", "updatedAt", legacy_last_synced
                ) VALUES %s
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    year = EXCLUDED.year,
                    format = EXCLUDED.format,
                    format_id = EXCLUDED.format_id,
                    "catalogNumber" = EXCLUDED."catalogNumber",
                    country = EXCLUDED.country,
                    "artistId" = EXCLUDED."artistId",
                    "labelId" = CASE
                        WHEN "Release".label_enriched = TRUE THEN "Release"."labelId"
                        ELSE EXCLUDED."labelId"
                    END,
                    "coverImage" = EXCLUDED."coverImage",
                    legacy_price = EXCLUDED.legacy_price,
                    legacy_condition = EXCLUDED.legacy_condition,
                    legacy_format_detail = EXCLUDED.legacy_format_detail,
                    legacy_available = EXCLUDED.legacy_available,
                    "updatedAt" = NOW(),
                    legacy_last_synced = NOW()""",
                release_values,
                template="(%s, %s, %s, %s, %s, %s::\"ReleaseFormat\", %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), NOW())",
            )

        # Full-field diff: compare each new value against existing state
        for release_id, new_values in new_values_by_id.items():
            if release_id in existing_state:
                old_state = existing_state[release_id]
                # Respect label_enriched guard: if the flag is true, labelId
                # is NOT overwritten, so we must not report it as a change
                # even if the incoming MySQL value differs.
                fields_to_diff = list(DIFF_FIELDS_RELEASE)
                if old_state.get("label_enriched"):
                    fields_to_diff = [f for f in fields_to_diff if f != "labelId"]
                delta = compute_diff(old_state, new_values, fields_to_diff)
                if delta:
                    rows_changed += 1
                    for field_name, change in delta.items():
                        change_entries.append((
                            run_id, release_id, "updated",
                            psycopg2.extras.Json({field_name: change}),
                        ))
            else:
                rows_inserted += 1
                change_entries.append((
                    run_id, release_id, "inserted",
                    psycopg2.extras.Json({k: normalize_value(v) for k, v in new_values.items()}),
                ))

        # Write change entries to existing sync_change_log (v1 table, kept
        # for backward compat until Phase B1 introduces sync_change_log_v2)
        if change_entries and not dry_run:
            psycopg2.extras.execute_values(
                pg_cur,
                """INSERT INTO sync_change_log
                     (sync_run_id, release_id, change_type, changes, synced_at)
                   VALUES %s""",
                change_entries,
                template="(%s, %s, %s, %s, NOW())",
            )
            change_entries = []

        # Insert new images with RETURNING for accurate count
        if image_values and not dry_run:
            inserted_ids = psycopg2.extras.execute_values(
                pg_cur,
                """INSERT INTO "Image" (id, url, alt, "releaseId", "createdAt")
                   VALUES %s ON CONFLICT (id) DO NOTHING
                   RETURNING id""",
                image_values,
                template="(%s, %s, %s, %s, NOW())",
                fetch=True,
            )
            images_inserted += len(inserted_ids) if inserted_ids else 0

        if not dry_run:
            pg_conn.commit()
        processed += len(rows)
        offset += BATCH_SIZE
        print(f"  Synced {processed}/{total} releases ({errors} errors)...", end="\r")

    print(f"\n  Done: processed={processed} changed={rows_changed} inserted={rows_inserted} images_new={images_inserted} errors={errors}")
    print(f"  R2: checked={r2_checked} uploaded={r2_uploaded} failed={r2_failed}")
    cursor.close()
    return {
        "rows_source": total,
        "rows_written": processed,
        "rows_changed": rows_changed,
        "rows_inserted": rows_inserted,
        "images_inserted": images_inserted,
        "errors": errors,
        "r2_uploaded": r2_uploaded,
        "r2_failed": r2_failed,
        "r2_checked": r2_checked,
    }


# ─── sync_literature v2 ──────────────────────────────────────────────────────

def sync_literature_v2(mysql_conn, pg_conn, run_id, table, category,
                       id_prefix, ref_field, ref_prefix, bilder_typ, dry_run=False):
    """Sync a literature table (band_lit / label_lit / press_lit).

    Literature does not have catalogNumber, legacy_condition, or
    legacy_available columns in MySQL, so those fields are never diffed
    for literature entries.
    """
    print(f"\n=== Syncing {category} (v2) ===")
    cursor = mysql_conn.cursor(dictionary=True)

    if "band_lit" in table:
        entity_join = "LEFT JOIN 3wadmin_tapes_band e ON t.aid = e.id"
        entity_name_col = "e.name as entity_name"
    elif "labels_lit" in table:
        entity_join = "LEFT JOIN 3wadmin_tapes_labels e ON t.aid = e.id"
        entity_name_col = "e.label as entity_name"
    else:
        entity_join = "LEFT JOIN 3wadmin_tapes_pressorga e ON t.aid = e.id"
        entity_name_col = "e.name as entity_name"

    cursor.execute(f"""
        SELECT t.id, t.aid, t.title, t.text, t.country, t.year, t.format, t.preis,
               {entity_name_col},
               f.name as format_name,
               c.name as country_name,
               (SELECT bi2.bild FROM bilder_1 bi2
                WHERE bi2.inid = t.id AND bi2.typ = {bilder_typ}
                ORDER BY bi2.rang, bi2.id LIMIT 1) as image_filename,
               (SELECT bi2.id FROM bilder_1 bi2
                WHERE bi2.inid = t.id AND bi2.typ = {bilder_typ}
                ORDER BY bi2.rang, bi2.id LIMIT 1) as image_id
        FROM `{table}` t
        {entity_join}
        LEFT JOIN 3wadmin_tapes_formate f ON t.format = f.id
        LEFT JOIN 3wadmin_shop_countries c ON t.country = c.id
        ORDER BY t.id
    """)
    rows = cursor.fetchall()
    cursor.close()
    print(f"  Legacy: {len(rows)} items")

    pg_cur = pg_conn.cursor()
    processed = 0
    rows_changed = 0
    rows_inserted = 0
    images_inserted = 0
    errors = 0
    change_entries = []

    # Field set for this specific literature subtype (only the relevant FK field)
    fields_to_diff = [f for f in DIFF_FIELDS_LITERATURE
                      if f not in ("artistId", "labelId", "pressOrgaId")
                      or f == ref_field]

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        release_values = []
        image_values = []
        new_values_by_id = {}

        for r in batch:
            try:
                title = decode_entities(r["title"]) or f"Literature #{r['id']}"
                description = str(r["text"]) if r["text"] else None
                entity_name = decode_entities(r["entity_name"]) if r["entity_name"] else "unknown"

                year = None
                if r["year"]:
                    try:
                        y = int(str(r["year"]).strip())
                        if 0 < y <= 2100:
                            year = y
                    except (ValueError, TypeError):
                        pass

                format_id = r["format"] if r["format"] and r["format"] > 0 else None
                format_enum = map_format_by_id(format_id)
                country = translate_country(r["country_name"])
                format_detail = decode_entities(r["format_name"]) if r["format_name"] else None
                price = parse_price(r.get("preis"))
                slug = slugify(f"{entity_name} {title} {r['id']}") or f"{id_prefix}-{r['id']}"
                release_id = f"{id_prefix}-{r['id']}"
                ref_id = f"{ref_prefix}-{r['aid']}" if r["aid"] else None

                artist_id = ref_id if ref_field == "artistId" else None
                label_id = ref_id if ref_field == "labelId" else None
                pressorga_id = ref_id if ref_field == "pressOrgaId" else None

                cover_image = None
                if r.get("image_filename"):
                    cover_image = IMAGE_BASE_URL + str(r["image_filename"])

                new_values_by_id[release_id] = {
                    "title": title,
                    "description": description,
                    "year": year,
                    "format": format_enum,
                    "format_id": format_id,
                    "country": country,
                    "artistId": artist_id,
                    "labelId": label_id,
                    "pressOrgaId": pressorga_id,
                    "coverImage": cover_image,
                    "legacy_price": price,
                    "legacy_format_detail": format_detail,
                }

                release_values.append((
                    release_id, slug, title, description, year,
                    format_enum, format_id, country,
                    artist_id, label_id, pressorga_id,
                    cover_image, price, format_detail, category,
                ))

                if cover_image and r.get("image_id"):
                    image_values.append((
                        f"legacy-image-lit-{r['image_id']}",
                        cover_image, title, release_id,
                    ))
            except Exception as e:
                errors += 1
                print(f"\n  ERROR on {table} #{r['id']}: {e}")

        # Pre-fetch existing state for literature diff
        existing_state = {}
        if release_values:
            batch_ids = [rv[0] for rv in release_values]
            fetch_cur = pg_conn.cursor()
            fetch_cur.execute(
                """SELECT id, title, description, year, format::text, format_id,
                          country, "artistId", "labelId", "pressOrgaId",
                          "coverImage", legacy_price, legacy_format_detail,
                          label_enriched
                   FROM "Release" WHERE id = ANY(%s)""",
                (batch_ids,),
            )
            for frow in fetch_cur.fetchall():
                existing_state[frow[0]] = {
                    "title": frow[1],
                    "description": frow[2],
                    "year": frow[3],
                    "format": frow[4],
                    "format_id": frow[5],
                    "country": frow[6],
                    "artistId": frow[7],
                    "labelId": frow[8],
                    "pressOrgaId": frow[9],
                    "coverImage": frow[10],
                    "legacy_price": frow[11],
                    "legacy_format_detail": frow[12],
                    "label_enriched": frow[13],
                }
            fetch_cur.close()

        if release_values and not dry_run:
            psycopg2.extras.execute_values(
                pg_cur,
                """INSERT INTO "Release" (
                    id, slug, title, description, year, format, format_id,
                    country, "artistId", "labelId", "pressOrgaId", "coverImage",
                    legacy_price, legacy_format_detail, product_category,
                    "createdAt", "updatedAt", legacy_last_synced
                ) VALUES %s
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    year = EXCLUDED.year,
                    format = EXCLUDED.format,
                    format_id = EXCLUDED.format_id,
                    country = EXCLUDED.country,
                    "artistId" = EXCLUDED."artistId",
                    "labelId" = CASE
                        WHEN "Release".label_enriched = TRUE THEN "Release"."labelId"
                        ELSE EXCLUDED."labelId"
                    END,
                    "pressOrgaId" = EXCLUDED."pressOrgaId",
                    "coverImage" = EXCLUDED."coverImage",
                    legacy_price = EXCLUDED.legacy_price,
                    legacy_format_detail = EXCLUDED.legacy_format_detail,
                    "updatedAt" = NOW(),
                    legacy_last_synced = NOW()""",
                release_values,
                template="(%s, %s, %s, %s, %s, %s::\"ReleaseFormat\", %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), NOW())",
            )

        # Full-field diff for literature
        for release_id, new_values in new_values_by_id.items():
            if release_id in existing_state:
                old_state = existing_state[release_id]
                effective_fields = list(fields_to_diff)
                if old_state.get("label_enriched") and "labelId" in effective_fields:
                    effective_fields = [f for f in effective_fields if f != "labelId"]
                delta = compute_diff(old_state, new_values, effective_fields)
                if delta:
                    rows_changed += 1
                    for field_name, change in delta.items():
                        change_entries.append((
                            run_id, release_id, "updated",
                            psycopg2.extras.Json({field_name: change}),
                        ))
            else:
                rows_inserted += 1
                change_entries.append((
                    run_id, release_id, "inserted",
                    psycopg2.extras.Json({k: normalize_value(v) for k, v in new_values.items() if k in fields_to_diff}),
                ))

        if change_entries and not dry_run:
            psycopg2.extras.execute_values(
                pg_cur,
                """INSERT INTO sync_change_log
                     (sync_run_id, release_id, change_type, changes, synced_at)
                   VALUES %s""",
                change_entries,
                template="(%s, %s, %s, %s, NOW())",
            )
            change_entries = []

        if image_values and not dry_run:
            inserted_ids = psycopg2.extras.execute_values(
                pg_cur,
                """INSERT INTO "Image" (id, url, alt, "releaseId", "createdAt")
                   VALUES %s ON CONFLICT (id) DO NOTHING
                   RETURNING id""",
                image_values,
                template="(%s, %s, %s, %s, NOW())",
                fetch=True,
            )
            images_inserted += len(inserted_ids) if inserted_ids else 0

        if not dry_run:
            pg_conn.commit()
        processed += len(batch)

    print(f"  Done: processed={processed} changed={rows_changed} inserted={rows_inserted} images_new={images_inserted} errors={errors}")
    return {
        "rows_source": len(rows),
        "rows_written": processed,
        "rows_changed": rows_changed,
        "rows_inserted": rows_inserted,
        "images_inserted": images_inserted,
        "errors": errors,
    }


# ─── Post-run Validation ─────────────────────────────────────────────────────

def run_validation(mysql_conn, pg_conn):
    """Post-run validation checks per SYNC_ROBUSTNESS_PLAN v2.2 §7.1.

    Returns (status, errors) where status is 'ok' | 'warnings' | 'failed'.
    'warnings' = some V3/V4 checks failed but data is basically OK.
    'failed' = V1 or V2 failed, data has structural problems.
    """
    errors = []
    status = "ok"

    # V1: Row count source vs target (music releases only)
    try:
        mcur = mysql_conn.cursor()
        mcur.execute("SELECT COUNT(*) FROM 3wadmin_tapes_releases")
        mysql_count = mcur.fetchone()[0]
        mcur.close()

        pcur = pg_conn.cursor()
        pcur.execute("""SELECT COUNT(*) FROM "Release"
                        WHERE id LIKE 'legacy-release-%'""")
        pg_count = pcur.fetchone()[0]
        pcur.close()

        diff = abs(mysql_count - pg_count)
        if diff > 10:
            errors.append({
                "check": "V1_row_count_parity",
                "severity": "warning" if diff < 100 else "error",
                "mysql_count": mysql_count,
                "supabase_count": pg_count,
                "diff": diff,
            })
            if diff >= 100:
                status = "failed"
            elif status == "ok":
                status = "warnings"
    except Exception as e:
        errors.append({"check": "V1_row_count_parity", "severity": "error", "error": str(e)})
        status = "failed"

    # V2: NOT NULL integrity — title must never be NULL on legacy releases
    try:
        pcur = pg_conn.cursor()
        pcur.execute("""SELECT COUNT(*) FROM "Release"
                        WHERE id LIKE 'legacy-%' AND title IS NULL""")
        null_titles = pcur.fetchone()[0]
        pcur.close()
        if null_titles > 0:
            errors.append({
                "check": "V2_title_not_null",
                "severity": "error",
                "null_count": null_titles,
            })
            status = "failed"
    except Exception as e:
        errors.append({"check": "V2_title_not_null", "severity": "error", "error": str(e)})
        status = "failed"

    # V3: Referential integrity — artistId and labelId must resolve
    try:
        pcur = pg_conn.cursor()
        pcur.execute("""
            SELECT COUNT(*) FROM "Release" r
            WHERE r.id LIKE 'legacy-%'
              AND r."artistId" IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM "Artist" a WHERE a.id = r."artistId")
        """)
        orphan_artists = pcur.fetchone()[0]
        pcur.execute("""
            SELECT COUNT(*) FROM "Release" r
            WHERE r.id LIKE 'legacy-%'
              AND r."labelId" IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM "Label" l WHERE l.id = r."labelId")
        """)
        orphan_labels = pcur.fetchone()[0]
        pcur.close()
        if orphan_artists > 0 or orphan_labels > 0:
            errors.append({
                "check": "V3_referential_integrity",
                "severity": "warning",
                "orphan_artists": orphan_artists,
                "orphan_labels": orphan_labels,
            })
            if status == "ok":
                status = "warnings"
    except Exception as e:
        errors.append({"check": "V3_referential_integrity", "severity": "error", "error": str(e)})

    # V4: Sync freshness — all legacy releases should have
    # legacy_last_synced < 2x cron interval. Cron = 1h → 2h threshold.
    try:
        pcur = pg_conn.cursor()
        pcur.execute("""
            SELECT COUNT(*) FROM "Release"
            WHERE id LIKE 'legacy-%'
              AND (legacy_last_synced IS NULL
                   OR legacy_last_synced < NOW() - INTERVAL '2 hours')
        """)
        stale = pcur.fetchone()[0]
        pcur.close()
        if stale > 10:
            errors.append({
                "check": "V4_sync_freshness",
                "severity": "warning",
                "stale_rows": stale,
                "threshold_hours": 2,
            })
            if status == "ok":
                status = "warnings"
    except Exception as e:
        errors.append({"check": "V4_sync_freshness", "severity": "error", "error": str(e)})

    return (status, errors)


# ─── Main orchestration ──────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Legacy MySQL → Supabase sync (v2)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Compute diffs but do not write to Supabase")
    parser.add_argument("--pg-url", type=str, default=None,
                        help="Override SUPABASE_DB_URL (for staging)")
    parser.add_argument("--skip-validation", action="store_true",
                        help="Skip post-run validation phase")
    args = parser.parse_args()

    start_time = time.time()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print("=" * 60)
    print(f"Legacy MySQL → Supabase Sync ({SCRIPT_VERSION})")
    print(f"Started: {now_str}")
    if args.dry_run:
        print("MODE: DRY-RUN (no writes)")
    if args.pg_url:
        print(f"TARGET: override URL (staging?)")
    print("=" * 60)

    try:
        print("\nConnecting to Legacy MySQL...")
        mysql_conn = get_mysql_connection()
        print("  Connected!")
    except Exception as e:
        print(f"  FAILED: {e}")
        sys.exit(1)

    try:
        print("Connecting to Supabase PostgreSQL...")
        pg_conn = get_pg_connection(args.pg_url)
        print("  Connected!")
    except Exception as e:
        print(f"  FAILED: {e}")
        mysql_conn.close()
        sys.exit(1)

    run_ctx = start_run(pg_conn, SYNC_TYPE, dry_run=args.dry_run)
    print(f"  Run ID: {run_ctx['run_id']}")

    counters = {
        "rows_source": 0,
        "rows_written": 0,
        "rows_changed": 0,
        "rows_inserted": 0,
        "images_inserted": 0,
    }
    extras = {}
    phase = "success"
    error_message = None
    validation_status = None
    validation_errors = None

    try:
        # Artists / Labels / PressOrga — new inserts only
        new_artists, src_artists = sync_artists(mysql_conn, pg_conn, dry_run=args.dry_run)
        new_labels, src_labels = sync_labels(mysql_conn, pg_conn, dry_run=args.dry_run)
        new_pressorga, src_pressorga = sync_pressorga(mysql_conn, pg_conn, dry_run=args.dry_run)

        # Music releases — full-field diff
        release_stats = sync_releases_v2(mysql_conn, pg_conn, run_ctx["run_id"], dry_run=args.dry_run)

        # Literature — three subtypes
        band_lit = sync_literature_v2(
            mysql_conn, pg_conn, run_ctx["run_id"],
            table="3wadmin_tapes_band_lit", category="band_literature",
            id_prefix="legacy-bandlit", ref_field="artistId",
            ref_prefix="legacy-artist", bilder_typ=13, dry_run=args.dry_run,
        )
        labels_lit = sync_literature_v2(
            mysql_conn, pg_conn, run_ctx["run_id"],
            table="3wadmin_tapes_labels_lit", category="label_literature",
            id_prefix="legacy-labellit", ref_field="labelId",
            ref_prefix="legacy-label", bilder_typ=14, dry_run=args.dry_run,
        )
        press_lit = sync_literature_v2(
            mysql_conn, pg_conn, run_ctx["run_id"],
            table="3wadmin_tapes_pressorga_lit", category="press_literature",
            id_prefix="legacy-presslit", ref_field="pressOrgaId",
            ref_prefix="legacy-pressorga", bilder_typ=12, dry_run=args.dry_run,
        )

        # Aggregate counters
        all_stats = [release_stats, band_lit, labels_lit, press_lit]
        counters["rows_source"] = sum(s["rows_source"] for s in all_stats) + src_artists + src_labels + src_pressorga
        counters["rows_written"] = sum(s["rows_written"] for s in all_stats)
        counters["rows_changed"] = sum(s["rows_changed"] for s in all_stats)
        counters["rows_inserted"] = sum(s["rows_inserted"] for s in all_stats) + new_artists + new_labels + new_pressorga
        counters["images_inserted"] = sum(s["images_inserted"] for s in all_stats)

        total_errors = sum(s["errors"] for s in all_stats)

        extras = {
            "new_artists": new_artists,
            "new_labels": new_labels,
            "new_pressorga": new_pressorga,
            "music_releases": release_stats["rows_written"],
            "band_literature": band_lit["rows_written"],
            "label_literature": labels_lit["rows_written"],
            "press_literature": press_lit["rows_written"],
            "errors": total_errors,
            "r2_uploaded": release_stats.get("r2_uploaded", 0),
            "r2_failed": release_stats.get("r2_failed", 0),
            "r2_checked": release_stats.get("r2_checked", 0),
        }

        if total_errors > 0:
            error_message = f"{total_errors} row-level processing errors (non-fatal)"

        # Post-run validation
        if not args.skip_validation and not args.dry_run:
            print("\n=== Post-run validation ===")
            validation_status, validation_errors = run_validation(mysql_conn, pg_conn)
            if validation_status == "ok":
                print("  All checks passed.")
            else:
                print(f"  Status: {validation_status}")
                for err in validation_errors:
                    print(f"    - {err}")
                if validation_status == "failed":
                    phase = "validation_failed"

        # R2 progress file (Path(__file__) — cwd-safe)
        if not args.dry_run:
            try:
                r2_stats = {
                    "uploaded": release_stats.get("r2_uploaded", 0),
                    "failed": release_stats.get("r2_failed", 0),
                    "checked": release_stats.get("r2_checked", 0),
                    "skipped_unchanged": release_stats.get("rows_written", 0) - release_stats.get("r2_checked", 0),
                    "updated_at": datetime.now().isoformat(),
                    "run_id": run_ctx["run_id"],
                    "duration_seconds": round(time.time() - start_time, 1),
                    "script_version": SCRIPT_VERSION,
                }
                progress_path = Path(__file__).parent / "r2_sync_progress.json"
                with open(progress_path, "w") as f:
                    json.dump(r2_stats, f, indent=2)
            except Exception as e:
                print(f"  WARN: Could not write R2 progress file: {e}")

    except Exception as e:
        phase = "failed"
        error_message = str(e)
        print(f"\nFATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        duration_ms = end_run(
            pg_conn, run_ctx, counters,
            phase=phase, error_message=error_message,
            validation_status=validation_status,
            validation_errors=validation_errors,
            extras=extras,
        )

        # Summary
        elapsed = time.time() - start_time
        print(f"\n{'=' * 60}")
        print(f"SYNC SUMMARY ({SCRIPT_VERSION})")
        print(f"{'=' * 60}")
        print(f"  Run ID:            {run_ctx['run_id']}")
        print(f"  Phase:             {phase}")
        if args.dry_run:
            print(f"  DRY-RUN — no writes were committed")
        print(f"  rows_source:       {counters['rows_source']}")
        print(f"  rows_written:      {counters['rows_written']}")
        print(f"  rows_changed:      {counters['rows_changed']}")
        print(f"  rows_inserted:     {counters['rows_inserted']}")
        print(f"  images_inserted:   {counters['images_inserted']}")
        if validation_status:
            print(f"  validation_status: {validation_status}")
            if validation_errors:
                print(f"  validation_errors: {len(validation_errors)} issues")
        print(f"  duration:          {elapsed:.1f}s ({duration_ms}ms)")
        if error_message:
            print(f"  error:             {error_message}")
        print(f"{'=' * 60}")

        mysql_conn.close()
        pg_conn.close()

        if phase == "failed":
            sys.exit(2)
        if phase == "validation_failed":
            sys.exit(3)


if __name__ == "__main__":
    main()
