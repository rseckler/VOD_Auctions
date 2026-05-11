#!/usr/bin/env python3
"""Generiert bi-direktionale Country-Synonyms für Meili (rc54.0).

Hintergrund: Nach der Country-ISO-Migration enthalten Release-Docs nur noch
ISO-Codes ("DE", "GB", "US") statt Vollnamen. Damit Storefront-Volltextsuche
weiterhin „germany"/„deutschland"/„england" finden kann, brauchen wir
Meili-Synonyms die alle Aliase auf den ISO-Code mappen — und umgekehrt.

Output:
    Erweitert meilisearch_settings.json um ~300 Synonym-Einträge.
    Bestehende Synonyms (Genres/Styles: industrial, noise, ebm, ...) bleiben.

Run:
    cd VOD_Auctions/scripts
    python3 build_country_synonyms.py [--dry-run]

Idempotent — kann beliebig oft laufen. Bei Konflikten zwischen Country-
Synonyms und existing Genre-Synonyms gewinnt der existing-Wert (Country-
Generator schreibt nur fehlende Keys).
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

# Pfad zur scripts/data hinzufügen
sys.path.insert(0, str(Path(__file__).parent))
from data.country_iso import COUNTRY_TO_ISO  # noqa: E402


def build_synonyms() -> dict[str, list[str]]:
    """Bi-direktionale Synonym-Map: jeder Alias → alle anderen Aliase + ISO.

    Algorithmus:
        1. Gruppiere alle Source-Strings nach Target-ISO (z.B. "DE" → ["Germany", "deutschland"])
        2. Pro Gruppe: ISO selbst dazu (lowercase für Meili-Konsistenz)
        3. Für jeden String der Gruppe: returne alle anderen Strings der Gruppe als Synonym

    Beispiel-Output:
        "germany":     ["de", "deutschland"]
        "deutschland": ["de", "germany"]
        "de":          ["germany", "deutschland"]
    """
    # Schritt 1: Group by ISO
    iso_to_aliases: dict[str, set[str]] = defaultdict(set)
    for name, iso in COUNTRY_TO_ISO.items():
        iso_to_aliases[iso].add(name.lower())

    # Schritt 2: ISO selbst als Alias dazu (lowercase)
    for iso, aliases in iso_to_aliases.items():
        aliases.add(iso.lower())

    # Schritt 3: Zusätzliche deutsche/Discogs-Aliase die nicht im COUNTRY_TO_ISO
    # sind aber für Suche kritisch sind (User tippt deutsch — Meili expandiert
    # auf ISO).
    EXTRA_DE_ALIASES: dict[str, list[str]] = {
        "DE": ["deutschland", "german"],
        "GB": ["england", "great britain", "großbritannien", "grossbritannien",
               "vereinigtes königreich", "vereinigtes koenigreich"],
        "US": ["america", "amerika", "vereinigte staaten"],
        "FR": ["frankreich"],
        "IT": ["italien"],
        "NL": ["holland", "niederlande"],
        "BE": ["belgien"],
        "ES": ["spanien"],
        "CH": ["schweiz", "suisse"],
        "AT": ["österreich", "oesterreich"],
        "SE": ["schweden", "sverige"],
        "NO": ["norwegen", "norge"],
        "DK": ["dänemark", "daenemark"],
        "FI": ["finnland", "suomi"],
        "PL": ["polen", "polska"],
        "PT": ["portugal"],
        "IE": ["irland"],
        "IS": ["island"],
        "JP": ["japan"],
        "CA": ["kanada"],
        "AU": ["australien"],
        "BR": ["brasilien"],
        "AR": ["argentinien"],
        "MX": ["mexiko"],
        "RU": ["russland"],
        "CN": ["china"],
        "CZ": ["tschechien"],
        "HU": ["ungarn"],
        "GR": ["griechenland"],
        "RO": ["rumänien", "rumaenien"],
        "ZA": ["südafrika", "suedafrika"],
        "IL": ["israel"],
        "EU": ["europa", "europe"],
        "WO": ["worldwide", "weltweit", "world", "welt"],
        "YU": ["jugoslawien", "yugoslavia"],
        "DD": ["ddr", "east germany", "deutsche demokratische republik"],
        "SU": ["ussr", "soviet union", "sowjetunion"],
    }
    for iso, extras in EXTRA_DE_ALIASES.items():
        if iso in iso_to_aliases:
            for x in extras:
                iso_to_aliases[iso].add(x.lower())

    # Schritt 4: Bi-direktional flatten — jeder Alias → alle anderen
    synonyms: dict[str, list[str]] = {}
    for iso, aliases in iso_to_aliases.items():
        if len(aliases) < 2:
            continue  # nichts zu mappen wenn nur ein einziger Term
        for term in aliases:
            others = sorted(aliases - {term})
            synonyms[term] = others

    return synonyms


def merge_into_settings(settings_path: Path, country_synonyms: dict[str, list[str]],
                        dry_run: bool = False) -> tuple[int, int]:
    """Mergt Country-Synonyms in meilisearch_settings.json.

    Returns:
        (added_count, total_synonyms) — wieviele neu dazukamen + Gesamt-Count.

    Konflikt-Strategie: existing Synonyms (Genres/Styles) gewinnen — Country-
    Generator schreibt nur Keys die noch nicht existieren.
    """
    with settings_path.open() as f:
        settings = json.load(f)

    existing = settings.get("synonyms", {})
    added = 0
    for term, others in country_synonyms.items():
        if term not in existing:
            existing[term] = others
            added += 1

    settings["synonyms"] = existing

    if not dry_run:
        with settings_path.open("w") as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
            f.write("\n")

    return added, len(existing)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="Nur Output zeigen, nicht in settings.json schreiben")
    args = parser.parse_args()

    settings_path = Path(__file__).parent / "meilisearch_settings.json"
    if not settings_path.exists():
        print(f"ERROR: {settings_path} nicht gefunden", file=sys.stderr)
        sys.exit(1)

    country_synonyms = build_synonyms()
    print(f"Generierte {len(country_synonyms)} Country-Synonym-Einträge aus COUNTRY_TO_ISO")

    # Sample-Output
    print("\nSample (10 Einträge):")
    for term in sorted(country_synonyms.keys())[:10]:
        print(f"  {term!r}: {country_synonyms[term]}")

    added, total = merge_into_settings(settings_path, country_synonyms, dry_run=args.dry_run)
    action = "would add" if args.dry_run else "added"
    print(f"\n{action}: {added} neue Synonyms (Gesamt nach Merge: {total})")
    if not args.dry_run:
        print(f"Updated: {settings_path}")
        print("\nNächster Schritt: python3 meilisearch_sync.py --apply-settings")


if __name__ == "__main__":
    main()
