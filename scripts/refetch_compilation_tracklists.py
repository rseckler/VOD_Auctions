#!/usr/bin/env python3
"""
Remediation rc71.4 — Per-Track-Künstler bei Compilations wiederherstellen.

Hintergrund: rc69.0 Fix 2 hat den Discogs-Tracklist-Fetch eingeführt, aber
`buildTracklist` zog nur position/title/duration — NICHT das Per-Track-
`artists`-Array. Ein Refetch einer „Various"-Compilation hat damit
`"Algebra Suicide – Somewhat Bleecker Street"` durch `"Somewhat Bleecker
Street"` ersetzt. rc71.4 fixt `buildTracklist`; dieses Script repariert die
Releases, die zwischen dem rc69-Deploy (2026-05-16) und jetzt regressed sind.

Kandidaten: `artist = Various%`, `discogs_id` gesetzt, `discogs_last_synced
>= 2026-05-16`, Track-Rows vorhanden, KEIN Track-Titel enthält ' – '.

Pro Kandidat: Discogs-Release ziehen, Tracklist MIT Künstler-Komposition
bauen. Liefert Discogs Per-Track-Künstler (= mind. ein Titel enthält ' – '),
werden die Track-Rows ersetzt (DELETE + INSERT). Liefert Discogs keine
Per-Track-Künstler, wird übersprungen (echtes Single-Artist-Release).

Idempotent (zweiter Lauf findet die reparierten nicht mehr — sie haben dann
' – '). Default ist dry-run; --commit muss explizit gesetzt sein.

Usage:
    cd VOD_Auctions/scripts && source venv/bin/activate
    python3 refetch_compilation_tracklists.py            # dry-run
    python3 refetch_compilation_tracklists.py --commit
"""

import os
import re
import sys
import time
import argparse
from pathlib import Path
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(Path(__file__).parent / ".env", override=False)

SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL", "")
DISCOGS_TOKEN = os.getenv("DISCOGS_TOKEN", "")
DISCOGS_BASE = "https://api.discogs.com"
RATE_LIMIT_S = 1.2
SYNCED_SINCE = "2026-05-16"

import psycopg2
import psycopg2.extras

# ─── Tracklist-Builder — Python-Spiegel von lib/discogs-tracklist.ts ──────────

TRACK_ARTIST_SEP = " – "  # En-Dash mit Spaces — Legacy-tape-mag-Konvention


def strip_suffix(name):
    return re.sub(r"\s*\(\d+\)$", "", name or "").strip()


def compose_track_artist(artists):
    if not artists:
        return None
    out = ""
    for i, a in enumerate(artists):
        display = strip_suffix(a.get("anv") or a.get("name") or "")
        if not display:
            continue
        out += display
        if i < len(artists) - 1:
            sep = (a.get("join") or "").strip()
            out += ", " if sep in ("", ",") else f" {sep} "
    out = re.sub(r"\s+", " ", out).strip()
    return out or None


def build_tracklist(raw):
    result = []
    for t in raw or []:
        type_ = t.get("type_")
        title = (t.get("title") or "").strip()
        if (type_ and type_ != "track") or not title:
            continue
        artist = compose_track_artist(t.get("artists"))
        result.append({
            "position": (t.get("position") or "").strip(),
            "title": f"{artist}{TRACK_ARTIST_SEP}{title}" if artist else title,
            "duration": (t.get("duration") or "").strip(),
        })
    return result


# ─── Main ─────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true", help="Track-Rows wirklich ersetzen")
    ap.add_argument("--limit", type=int, default=0, help="max. Kandidaten (0 = alle)")
    args = ap.parse_args()

    if not SUPABASE_DB_URL:
        sys.exit("ERROR: SUPABASE_DB_URL not set")
    if not DISCOGS_TOKEN:
        sys.exit("ERROR: DISCOGS_TOKEN not set")

    mode = "COMMIT" if args.commit else "DRY-RUN"
    print(f"=== Compilation-Tracklist-Remediation ({mode}) ===\n")

    conn = psycopg2.connect(SUPABASE_DB_URL)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute(
        """
        SELECT r.id, r.article_number, r.title, r.discogs_id
        FROM "Release" r
        LEFT JOIN "Artist" a ON a.id = r."artistId"
        WHERE COALESCE(r.artist_display_name, a.name) ILIKE 'various%%'
          AND r.discogs_id IS NOT NULL
          AND r.discogs_last_synced >= %s
          AND EXISTS (SELECT 1 FROM "Track" t WHERE t."releaseId" = r.id)
          AND NOT EXISTS (
            SELECT 1 FROM "Track" t WHERE t."releaseId" = r.id AND t.title LIKE '%% – %%'
          )
        ORDER BY r.article_number
        """,
        (SYNCED_SINCE,),
    )
    candidates = cur.fetchall()
    if args.limit:
        candidates = candidates[: args.limit]
    print(f"Kandidaten: {len(candidates)}\n")

    headers = {
        "Authorization": f"Discogs token={DISCOGS_TOKEN}",
        "User-Agent": "VODAuctions/1.0 +https://vod-auctions.com",
    }

    repaired = skipped_no_artist = errors = 0

    for c in candidates:
        rid, art, title, did = c["id"], c["article_number"], c["title"], c["discogs_id"]
        try:
            resp = requests.get(f"{DISCOGS_BASE}/releases/{did}", headers=headers, timeout=20)
            if resp.status_code != 200:
                print(f"  [ERR {resp.status_code}] {art} {title} (discogs {did})")
                errors += 1
                time.sleep(RATE_LIMIT_S)
                continue
            tracks = build_tracklist(resp.json().get("tracklist"))
        except Exception as e:  # noqa: BLE001
            print(f"  [ERR] {art} {title}: {e}")
            errors += 1
            time.sleep(RATE_LIMIT_S)
            continue

        has_artist = any(TRACK_ARTIST_SEP in t["title"] for t in tracks)
        if not tracks or not has_artist:
            print(f"  [skip] {art} {title} — Discogs ohne Per-Track-Künstler")
            skipped_no_artist += 1
            time.sleep(RATE_LIMIT_S)
            continue

        print(f"  [fix ] {art} {title} → {len(tracks)} Tracks mit Künstler")
        print(f"         z.B. {tracks[0]['position']}: {tracks[0]['title']}")

        if args.commit:
            try:
                cur.execute('DELETE FROM "Track" WHERE "releaseId" = %s', (rid,))
                for idx, t in enumerate(tracks):
                    cur.execute(
                        'INSERT INTO "Track" (id, "releaseId", position, title, duration) '
                        "VALUES (%s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
                        (f"tr-{rid}-{idx}", rid, t["position"], t["title"], t["duration"]),
                    )
                # Meili-Reindex anstoßen.
                cur.execute(
                    'UPDATE "Release" SET search_indexed_at = NULL, "updatedAt" = %s WHERE id = %s',
                    (datetime.now(timezone.utc), rid),
                )
                conn.commit()
            except Exception as e:  # noqa: BLE001
                conn.rollback()
                print(f"         [ERR beim Schreiben] {e}")
                errors += 1
                time.sleep(RATE_LIMIT_S)
                continue

        repaired += 1
        time.sleep(RATE_LIMIT_S)

    cur.close()
    conn.close()

    print(f"\n=== Ergebnis ({mode}) ===")
    print(f"  repariert{'    ' if args.commit else ' (würde)'}: {repaired}")
    print(f"  übersprungen (Discogs ohne Künstler): {skipped_no_artist}")
    print(f"  Fehler: {errors}")
    if not args.commit and repaired:
        print("\n  → mit --commit erneut ausführen, um zu schreiben.")


if __name__ == "__main__":
    main()
