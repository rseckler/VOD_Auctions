#!/usr/bin/env python3
"""
rc71.6-Follow-up — Compilation-Tracklists aus Discogs neu aufbauen.

~2.200 „Various"-Compilations haben Track-Rows aus dem Legacy-tape-mag-Import,
deren `title` zusammengeklatschter Müll ist — Künstler + Titel + teils Dauer in
EINEM String, in mehreren inkonsistenten Formaten:
    "Supreme Cool Beings - Survival Of The Coolest - 4:56"
    "–Toshiaki Tozawa, … Onnyk             Code-Mission"
    "Jacky & Jacco–"

Es gibt keine saubere Legacy-Tracklist zu retten. Discogs liefert die Daten
strukturiert (position · title · artists · duration). Dieses Skript baut die
Track-Rows dieser Compilations **komplett aus Discogs neu auf** (DELETE +
INSERT) im rc71.6-Format: sauberer `title`, strukturiertes `artist_name`.

Sicherheit (Lifecycle-Trace 2026-05-17): KEIN Cron schreibt die `Track`-Tabelle
(`legacy_sync_v2.py`/`discogs_daily_sync.py` fassen sie nicht an) → der Rebuild
wird nicht zurückgeschrieben. `Track` ist Leaf (keine FK auf `Track.id`).

REPLACE nur wenn Discogs eine nicht-leere Tracklist liefert — sonst Skip (eine
leere Discogs-Antwort darf die vorhandenen Rows nicht wegwischen).

Pro Release: `search_indexed_at = NULL` → Meili-Delta-Sync reindexed.

Idempotent: Kandidaten-Query verlangt „kein Track mit artist_name" → fertige
fallen raus. Default dry-run; --commit schreibt.

Usage:
    cd VOD_Auctions/scripts && source venv/bin/activate
    python3 rebuild_compilation_tracklists.py                   # dry-run
    python3 rebuild_compilation_tracklists.py --limit 5 --commit # Sample
    python3 rebuild_compilation_tracklists.py --commit           # voll
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


# ─── buildTracklist — Python-Spiegel von lib/discogs-tracklist.ts (rc71.6) ───

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
    """→ [{position, title, duration, artist_name}] — title rein, artist_name strukturiert."""
    result = []
    for t in raw or []:
        type_ = t.get("type_")
        title = (t.get("title") or "").strip()
        if (type_ and type_ != "track") or not title:
            continue
        result.append({
            "position": (t.get("position") or "").strip(),
            "title": title,
            "duration": (t.get("duration") or "").strip(),
            "artist_name": compose_track_artist(t.get("artists")),
        })
    return result


# ─── Main ─────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true", help="Track-Rows wirklich ersetzen")
    ap.add_argument("--limit", type=int, default=0, help="max. Releases (0 = alle)")
    args = ap.parse_args()

    if not SUPABASE_DB_URL:
        sys.exit("ERROR: SUPABASE_DB_URL not set")
    if not DISCOGS_TOKEN:
        sys.exit("ERROR: DISCOGS_TOKEN not set")

    mode = "COMMIT" if args.commit else "DRY-RUN"
    print(f"=== Compilation-Tracklist-Rebuild ({mode}) ===\n")

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

    rebuilt = skipped = errors = total_tracks = with_artists = 0

    for c in candidates:
        rid, art, title, did = c["id"], c["article_number"], c["title"], c["discogs_id"]
        try:
            resp = requests.get(f"{DISCOGS_BASE}/releases/{did}", headers=headers, timeout=20)
            if resp.status_code != 200:
                print(f"  [ERR {resp.status_code}] {art} {title}")
                errors += 1
                time.sleep(RATE_LIMIT_S)
                continue
            tracks = build_tracklist(resp.json().get("tracklist"))
        except Exception as e:  # noqa: BLE001
            print(f"  [ERR] {art} {title}: {e}")
            errors += 1
            time.sleep(RATE_LIMIT_S)
            continue

        if not tracks:
            # Leere Discogs-Tracklist → bestehende (Müll-)Rows NICHT wegwischen.
            print(f"  [skip] {art} {title} — Discogs ohne Tracklist")
            skipped += 1
            time.sleep(RATE_LIMIT_S)
            continue

        n_artist = sum(1 for t in tracks if t["artist_name"])
        print(f"  [rebuild] {art} {title} → {len(tracks)} Tracks ({n_artist} mit Künstler)")
        print(f"            z.B. {tracks[0]['position']}: "
              f"{(tracks[0]['artist_name'] + ' – ') if tracks[0]['artist_name'] else ''}{tracks[0]['title']}")

        if args.commit:
            try:
                cur.execute('DELETE FROM "Track" WHERE "releaseId" = %s', (rid,))
                for idx, t in enumerate(tracks):
                    cur.execute(
                        'INSERT INTO "Track" (id, "releaseId", position, title, duration, artist_name) '
                        "VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
                        (f"tr-{rid}-{idx}", rid, t["position"], t["title"],
                         t["duration"], t["artist_name"]),
                    )
                cur.execute(
                    'UPDATE "Release" SET search_indexed_at = NULL, "updatedAt" = %s WHERE id = %s',
                    (datetime.now(timezone.utc), rid),
                )
                conn.commit()
            except Exception as e:  # noqa: BLE001
                conn.rollback()
                print(f"            [ERR beim Schreiben] {e}")
                errors += 1
                time.sleep(RATE_LIMIT_S)
                continue

        rebuilt += 1
        total_tracks += len(tracks)
        with_artists += n_artist
        time.sleep(RATE_LIMIT_S)

    cur.close()
    conn.close()

    print(f"\n=== Ergebnis ({mode}) ===")
    print(f"  Releases neu aufgebaut{'' if args.commit else ' (würde)'}: {rebuilt}")
    print(f"  Tracks gesamt: {total_tracks}  (davon mit Künstler: {with_artists})")
    print(f"  übersprungen (Discogs ohne Tracklist): {skipped}")
    print(f"  Fehler: {errors}")
    if not args.commit and rebuilt:
        print("\n  → mit --commit erneut ausführen.")


if __name__ == "__main__":
    main()
