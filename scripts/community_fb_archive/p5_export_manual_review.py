#!/usr/bin/env python3
"""
p5_export_manual_review.py — Phase P5 der FB-Migration-Pipeline (Annex §A10).

Liest manifest_matches_v2.jsonl (P4-Output) und exportiert eine
Frank-freundliche CSV mit allen Tier-2-Photos die manuelle Klassifikation
brauchen. Frank kann die CSV in Numbers/Excel öffnen, pro Zeile entscheiden:
  (a) AI-Vorschlag ok → Spalte "manual_decision" auf "ok" setzen
  (b) anderer Filename → in "manual_filename" eintragen
  (c) skip/unrelated → "manual_decision" auf "skip"

Spalten (semicolon-separated für Excel/Numbers DE-Locale):
  fb_id                     | unique FB-Photo-ID, key gegen R2 + manifest
  r2_url                    | Cloudflare-URL zum WebP, im Browser direkt öffnen
  post_date                 | YYYY-MM-DD aus post_timestamp
  photo_pos                 | "3/11" wenn Multi-Photo-Post
  post_text                 | erste ~200 Zeichen des Posts
  current_filename_suggest  | aktueller Vorschlag (oder leer)
  ai_confidence             | 0.0-1.0 (oder leer)
  ai_artist_name            | aufgelöster Name aus P3-Kandidaten
  ai_release_title          | aufgelöster Title aus P3-Kandidaten
  ai_reason                 | 1-Satz-Begründung der AI
  artist_candidates_top3    | "Name1 / Name2 / Name3"
  release_candidates_top3   | "Title1 / Title2 / Title3"
  manual_decision           | LEER, Frank füllt: ok | skip | edit
  manual_filename           | LEER, Frank füllt bei edit

Reihenfolge: nach AI-Confidence DESC, sodass Frank die wahrscheinlichsten
Treffer zuerst durchwinkt + die unsichersten am Ende manuell entscheidet.

IO-Last: 0 DB-Calls, 0 API-Calls, reines Filesystem-Read + CSV-Write.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def fmt_date(ts: int | None) -> str:
    if not ts:
        return ""
    try:
        return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
    except (ValueError, OSError):
        return ""


def fmt_pos(idx: int | None, total: int | None) -> str:
    if total is None or total <= 1:
        return ""
    if idx is None:
        return f"?/{total}"
    return f"{idx + 1}/{total}"


def shorten(s: str, n: int) -> str:
    if not s:
        return ""
    s = s.replace("\n", " ").replace("\r", " ").replace(";", ",").strip()
    if len(s) > n:
        s = s[: n - 1] + "…"
    return s


def join_top3(items: list[dict], key: str) -> str:
    if not items:
        return ""
    parts = []
    for it in items[:3]:
        v = it.get(key)
        if v:
            parts.append(str(v).replace(";", ","))
    return " / ".join(parts)


def run(source_dir: Path, include_tier1: bool = False) -> int:
    src = source_dir / "manifest_matches_v2.jsonl"
    out = source_dir / "manual_review_frank.csv"

    if not src.exists():
        print(f"FATAL: {src} not found — run P4 first", file=sys.stderr)
        return 2

    rows = []
    with src.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                pass

    # Decide what goes into the review CSV.
    #   Default: only Tier-2-after-AI (need manual decision)
    #   With --include-tier1: also Tier-1 (let Frank double-check the high-conf ones)
    targets = []
    for r in rows:
        tier_after = r.get("tier_after_ai", r.get("tier"))
        if tier_after == 2:
            targets.append(r)
        elif include_tier1 and tier_after == 1:
            targets.append(r)

    # Sort: most-confident first, so Frank can rapidly accept obvious wins
    targets.sort(
        key=lambda r: (-(r.get("ai_confidence") or r.get("confidence") or 0),
                       r.get("post_timestamp") or 0),
    )

    print(f"Source:    {src}")
    print(f"Output:    {out}")
    print(f"  total manifest rows:         {len(rows)}")
    print(f"  exporting (Tier 2{'+1' if include_tier1 else ''}): {len(targets)}")

    fieldnames = [
        "fb_id",
        "r2_url",
        "post_date",
        "photo_pos",
        "post_text",
        "current_filename_suggest",
        "ai_confidence",
        "ai_artist_name",
        "ai_release_title",
        "ai_reason",
        "artist_candidates_top3",
        "release_candidates_top3",
        "manual_decision",  # ok | skip | edit — leer für Frank
        "manual_filename",  # leer für Frank
    ]

    with out.open("w", newline="", encoding="utf-8-sig") as fh:
        # utf-8-sig = BOM, sodass Excel auf Mac/Windows die UTF-8-Datei korrekt
        # liest (ohne BOM würden Umlaute auf Excel-Mac kaputt gehen).
        w = csv.DictWriter(fh, fieldnames=fieldnames, delimiter=";")
        w.writeheader()
        for r in targets:
            artist_cands = r.get("artist_candidates", []) or []
            release_cands = r.get("release_candidates", []) or []
            # AI nailed an artist/release? Resolve names from candidates.
            ai_a_id = r.get("ai_artist_id")
            ai_r_id = r.get("ai_release_id")
            ai_a_name = next(
                (a.get("name") for a in artist_cands if a.get("id") == ai_a_id),
                "",
            )
            ai_r_title = next(
                (rl.get("title") for rl in release_cands if rl.get("id") == ai_r_id),
                "",
            )
            w.writerow({
                "fb_id": r.get("fb_id", ""),
                "r2_url": f"https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/community-fb/{r['fb_id']}.webp"
                          if r.get("fb_id") else "",
                "post_date": fmt_date(r.get("post_timestamp")),
                "photo_pos": fmt_pos(r.get("photo_index"), r.get("photo_total")),
                "post_text": shorten(r.get("post_text_excerpt", ""), 200),
                "current_filename_suggest": r.get("suggested_filename") or "",
                "ai_confidence": (
                    f"{r['ai_confidence']:.2f}"
                    if isinstance(r.get("ai_confidence"), (int, float))
                    else ""
                ),
                "ai_artist_name": ai_a_name,
                "ai_release_title": ai_r_title,
                "ai_reason": shorten(r.get("ai_reason", ""), 180),
                "artist_candidates_top3": join_top3(artist_cands, "name"),
                "release_candidates_top3": join_top3(release_cands, "title"),
                "manual_decision": "",
                "manual_filename": "",
            })

    print(f"\n  wrote {len(targets)} rows to {out}")
    print(f"  size:  {out.stat().st_size / 1024:.1f} kB")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    p.add_argument(
        "--source-dir",
        type=Path,
        default=Path("/root/VOD_Auctions/data/fb_archive_2026-05-07"),
    )
    p.add_argument(
        "--include-tier1",
        action="store_true",
        help="Auch die 1.524 Tier-1-Treffer mit-exportieren (für Spot-Check)",
    )
    args = p.parse_args()
    return run(source_dir=args.source_dir, include_tier1=args.include_tier1)


if __name__ == "__main__":
    sys.exit(main())
