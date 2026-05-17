#!/usr/bin/env python3
"""
Anreicherung rc71.6-Follow-up — Per-Track-Künstler für Alt-Compilations.

~2.200 „Various"-Compilations haben Track-Rows, aber keinen Per-Track-Künstler
(Legacy-tape-mag-Daten ohne Künstler, nie sauber von Discogs gefetcht). Discogs
liefert die Künstler strukturiert. Dieses Skript zieht sie nach.

REIN ADDITIV: setzt nur `Track.artist_name` dort, wo es NULL ist und Discogs
einen Künstler für die passende `position` liefert. `title`/`duration` werden
NIE angefasst — kein Replace, keine Legacy-Daten zerstört.

Match: Discogs-Tracklist → {position: artist_name}; jede unserer Track-Rows
wird über `position` zugeordnet. Releases ohne Positions-Übereinstimmung
bleiben unverändert (werden gezählt + geloggt).

Pro angereicherter Release wird `search_indexed_at = NULL` gesetzt → der
Meili-Delta-Sync-Cron reindexed sie (track_artists-Feld).

Idempotent: Kandidaten-Query verlangt, dass die Release noch GAR KEINEN
Track-Künstler hat → fertige fallen raus. Default dry-run; --commit schreibt.

Usage:
    cd VOD_Auctions/scripts && source venv/bin/activate
    python3 enrich_compilation_track_artists.py                  # dry-run
    python3 enrich_compilation_track_artists.py --limit 5 --commit  # Sample
    python3 enrich_compilation_track_artists.py --commit            # voll
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

import psycopg2
import psycopg2.extras


# ─── Künstler-Komposition — Python-Spiegel von lib/discogs-tracklist.ts ──────

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


def discogs_position_artist_map(tracklist):
    """{position: artist_name} aus der Discogs-Tracklist (nur echte Tracks
    mit Per-Track-Künstler)."""
    out = {}
    for t in tracklist or []:
        if t.get("type_") and t["type_"] != "track":
            continue
        pos = (t.get("position") or "").strip()
        artist = compose_track_artist(t.get("artists"))
        if pos and artist:
            out[pos] = artist
    return out


# ─── Main ───────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true", help="artist_name wirklich schreiben")
    ap.add_argument("--limit", type=int, default=0, help="max. Releases (0 = alle)")
    args = ap.parse_args()

    if not SUPABASE_DB_URL:
        sys.exit("ERROR: SUPABASE_DB_URL not set")
    if not DISCOGS_TOKEN:
        sys.exit("ERROR: DISCOGS_TOKEN not set")

    mode = "COMMIT" if args.commit else "DRY-RUN"
    print(f"=== Compilation-Track-Künstler-Anreicherung ({mode}) ===\n")

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
          AND EXISTS (SELECT 1 FROM "Track" t WHERE t."releaseId" = r.id)
          AND NOT EXISTS (
            SELECT 1 FROM "Track" t WHERE t."releaseId" = r.id AND t.artist_name IS NOT NULL
          )
        ORDER BY r.article_number
        """
    )
    candidates = cur.fetchall()
    if args.limit:
        candidates = candidates[: args.limit]
    print(f"Kandidaten: {len(candidates)}\n")

    headers = {
        "Authorization": f"Discogs token={DISCOGS_TOKEN}",
        "User-Agent": "VODAuctions/1.0 +https://vod-auctions.com",
    }

    enriched_releases = no_match = errors = total_tracks = 0

    for c in candidates:
        rid, art, title, did = c["id"], c["article_number"], c["title"], c["discogs_id"]
        try:
            resp = requests.get(f"{DISCOGS_BASE}/releases/{did}", headers=headers, timeout=20)
            if resp.status_code != 200:
                print(f"  [ERR {resp.status_code}] {art} {title}")
                errors += 1
                time.sleep(RATE_LIMIT_S)
                continue
            dmap = discogs_position_artist_map(resp.json().get("tracklist"))
        except Exception as e:  # noqa: BLE001
            print(f"  [ERR] {art} {title}: {e}")
            errors += 1
            time.sleep(RATE_LIMIT_S)
            continue

        if not dmap:
            print(f"  [skip] {art} {title} — Discogs ohne Per-Track-Künstler")
            no_match += 1
            time.sleep(RATE_LIMIT_S)
            continue

        # Unsere Track-Rows per position zuordnen.
        cur.execute('SELECT id, position FROM "Track" WHERE "releaseId" = %s', (rid,))
        our_tracks = cur.fetchall()
        updates = [
            (dmap[(t["position"] or "").strip()], t["id"])
            for t in our_tracks
            if (t["position"] or "").strip() in dmap
        ]

        if not updates:
            print(f"  [skip] {art} {title} — keine Positions-Übereinstimmung")
            no_match += 1
            time.sleep(RATE_LIMIT_S)
            continue

        print(f"  [enrich] {art} {title} → {len(updates)}/{len(our_tracks)} Tracks")

        if args.commit:
            try:
                for artist_name, track_id in updates:
                    cur.execute(
                        'UPDATE "Track" SET artist_name = %s WHERE id = %s AND artist_name IS NULL',
                        (artist_name, track_id),
                    )
                cur.execute(
                    'UPDATE "Release" SET search_indexed_at = NULL, "updatedAt" = %s WHERE id = %s',
                    (datetime.now(timezone.utc), rid),
                )
                conn.commit()
            except Exception as e:  # noqa: BLE001
                conn.rollback()
                print(f"           [ERR beim Schreiben] {e}")
                errors += 1
                time.sleep(RATE_LIMIT_S)
                continue

        enriched_releases += 1
        total_tracks += len(updates)
        time.sleep(RATE_LIMIT_S)

    cur.close()
    conn.close()

    print(f"\n=== Ergebnis ({mode}) ===")
    print(f"  Releases angereichert{'' if args.commit else ' (würde)'}: {enriched_releases}")
    print(f"  Tracks mit Künstler gesetzt: {total_tracks}")
    print(f"  übersprungen (Discogs ohne Künstler / kein Positions-Match): {no_match}")
    print(f"  Fehler: {errors}")
    if not args.commit and enriched_releases:
        print("\n  → mit --commit erneut ausführen.")


if __name__ == "__main__":
    main()
