#!/usr/bin/env python3
"""
ReleaseArtist Cleanup Script
=============================
Entfernt falsche Contributing-Artist-Verknüpfungen, bei denen der Artist-Name
lediglich als Beschreibungswort im Credits-Text vorkommt.

Regel: Wenn der Name des Artists (case-insensitive) im credits-Feld des
verknüpften Releases auftaucht → Verknüpfung ist Garbage → löschen.
Wenn nicht → echter Contributing Artist → behalten.

Usage:
    python3 cleanup_release_artists.py              # Dry-run (default)
    python3 cleanup_release_artists.py --commit      # Tatsächlich löschen
    python3 cleanup_release_artists.py --artist Logo # Nur einen Artist prüfen
"""

import json
import os
import sys
import argparse
from datetime import datetime, timezone

import psycopg2
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

DB_URL = os.getenv('SUPABASE_DB_URL')
BLACKLIST_PATH = os.path.join(os.path.dirname(__file__), 'garbage_artists_blacklist.json')


def load_blacklist(filter_artist=None):
    with open(BLACKLIST_PATH) as f:
        data = json.load(f)
    entries = data['blacklist']
    if filter_artist:
        entries = [e for e in entries if e['name'].lower() == filter_artist.lower()]
        if not entries:
            print(f"Artist '{filter_artist}' nicht in Blacklist gefunden.")
            sys.exit(1)
    return entries


def find_garbage_links(cur, artist_id, artist_name):
    """Find ReleaseArtist entries where artist name appears in release credits."""
    cur.execute('''
        SELECT ra.id, ra."releaseId", r.title
        FROM "ReleaseArtist" ra
        JOIN "Release" r ON ra."releaseId" = r.id
        WHERE ra."artistId" = %s
        AND r.credits IS NOT NULL
        AND LOWER(r.credits) LIKE LOWER(%s)
    ''', (artist_id, f'%{artist_name}%'))
    return cur.fetchall()


def main():
    parser = argparse.ArgumentParser(description='ReleaseArtist Garbage Cleanup')
    parser.add_argument('--commit', action='store_true', help='Tatsächlich löschen (ohne: nur dry-run)')
    parser.add_argument('--artist', type=str, help='Nur einen bestimmten Artist bearbeiten')
    args = parser.parse_args()

    blacklist = load_blacklist(args.artist)

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    total_found = 0
    total_deleted = 0
    results = []

    print(f"{'=' * 60}")
    print(f"ReleaseArtist Cleanup — {'COMMIT MODE' if args.commit else 'DRY RUN'}")
    print(f"Blacklist: {len(blacklist)} Artists")
    print(f"{'=' * 60}")
    print()

    for entry in blacklist:
        aid = entry['id']
        name = entry['name']

        garbage = find_garbage_links(cur, aid, name)
        count = len(garbage)
        total_found += count

        if count == 0:
            continue

        print(f"  {name:<15} — {count} Garbage-Links gefunden", end='')

        if args.commit:
            garbage_ids = [g[0] for g in garbage]
            # Delete in batches of 500
            for i in range(0, len(garbage_ids), 500):
                batch = garbage_ids[i:i+500]
                placeholders = ','.join(['%s'] * len(batch))
                cur.execute(f'DELETE FROM "ReleaseArtist" WHERE id IN ({placeholders})', batch)
            conn.commit()
            total_deleted += count
            print(f" → DELETED")
        else:
            print(f" → would delete")

        results.append({
            'artist_id': aid,
            'artist_name': name,
            'garbage_count': count,
            'deleted': args.commit
        })

    print()
    print(f"{'=' * 60}")
    print(f"Ergebnis: {total_found} Garbage-Links gefunden")
    if args.commit:
        print(f"          {total_deleted} Links gelöscht")
    else:
        print(f"          Nichts gelöscht (dry-run). Nutze --commit zum Löschen.")
    print(f"{'=' * 60}")

    # Verify remaining counts
    if args.commit:
        print()
        print("Verifikation nach Bereinigung:")
        cur.execute('SELECT COUNT(*) FROM "ReleaseArtist"')
        remaining = cur.fetchone()[0]
        print(f"  ReleaseArtist-Einträge vorher:  {remaining + total_deleted}")
        print(f"  Gelöscht:                       {total_deleted}")
        print(f"  ReleaseArtist-Einträge nachher: {remaining}")

    # Save log
    log_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'cleanup_release_artists_log.json')
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    log = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'mode': 'commit' if args.commit else 'dry-run',
        'total_found': total_found,
        'total_deleted': total_deleted if args.commit else 0,
        'results': results
    }
    with open(log_path, 'w') as f:
        json.dump(log, f, indent=2)
    print(f"\nLog gespeichert: {log_path}")

    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
