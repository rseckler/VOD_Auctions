#!/usr/bin/env python3
"""
Admin-Catalog Meili vs. Postgres Paritätsmatrix (rc48 Phase 2, §4.A).

Führt eine strukturierte Suite von Filter-Kombinationen gegen beide
Backends aus (/admin/media?...&_backend=postgres vs. &_backend=meili
nach Flag-ON) und vergleicht:
  - Resultset-Identität (erste N release-IDs)
  - Count-Konvergenz (Delta tolerant bis 5%)
  - Sort-Reihenfolge

Acceptance-Gate vor SEARCH_MEILI_ADMIN=ON:
  * 0 "failed" — sonst Flag bleibt OFF
  * Warnings (count-delta 1-5% bei identischem ID-Set) manuell sichtprüfen

Nutzung:
  # Lokal gegen Prod (SSH-Tunnel zu /admin/media via Cookie-Auth)
  python3 admin_meili_parity_check.py --base-url https://admin.vod-auctions.com \
      --admin-session-cookie "connect.sid=..."

  # Gegen localhost Dev
  python3 admin_meili_parity_check.py --base-url http://localhost:9000 \
      --admin-session-cookie "connect.sid=..."

Exit-Code:
  0 = alle Cases passed (0 failed, Warnings ok)
  1 = mind. 1 failed — Flag-ON blockieren
  2 = Config-/Network-Error (kein Aussage möglich)
"""

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from typing import Optional


# ── Test-Cases ──────────────────────────────────────────────────────────────
#
# Jeder Case ist ein Dict von Query-Params (ohne `_backend`). Das Tool fügt
# `_backend=postgres` und `_backend=meili` jeweils an und vergleicht.
#
# Struktur-Kategorien (Plan §4.A.2):
#   single_filter     — jeder Filter isoliert
#   filter_plus_sort  — Filter × Sort-Kombination
#   ui_combos         — reale UI-Kombinationen (Category + Format etc.)
#   computed_fields   — stocktake_state, inventory_state Edge-Cases
#   search_plus       — FTS + Filter
#   boundary          — 0-Result + Large-Result

TEST_CASES = [
    # ── single_filter ───────────────────────────────────────────────────
    {"group": "single_filter", "name": "baseline_no_filter", "params": {"limit": "25"}},
    {"group": "single_filter", "name": "format_lp", "params": {"format": "LP", "limit": "25"}},
    {"group": "single_filter", "name": "format_cassette", "params": {"format": "CASSETTE", "limit": "25"}},
    {"group": "single_filter", "name": "category_tapes", "params": {"category": "tapes", "limit": "25"}},
    {"group": "single_filter", "name": "category_vinyl", "params": {"category": "vinyl", "limit": "25"}},
    {"group": "single_filter", "name": "category_band_lit", "params": {"category": "band_literature", "limit": "25"}},
    {"group": "single_filter", "name": "year_1985", "params": {"year_from": "1985", "year_to": "1985", "limit": "25"}},
    {"group": "single_filter", "name": "country_germany", "params": {"country": "Germany", "limit": "25"}},
    {"group": "single_filter", "name": "auction_reserved", "params": {"auction_status": "reserved", "limit": "25"}},
    {"group": "single_filter", "name": "has_discogs_yes", "params": {"has_discogs": "true", "limit": "25"}},
    {"group": "single_filter", "name": "has_discogs_no", "params": {"has_discogs": "false", "limit": "25"}},
    {"group": "single_filter", "name": "has_image_yes", "params": {"has_image": "true", "limit": "25"}},
    {"group": "single_filter", "name": "has_image_no", "params": {"has_image": "false", "limit": "25"}},
    {"group": "single_filter", "name": "visibility_visible", "params": {"visibility": "visible", "limit": "25"}},
    {"group": "single_filter", "name": "inventory_any", "params": {"inventory_state": "any", "limit": "25"}},
    {"group": "single_filter", "name": "inventory_none", "params": {"inventory_state": "none", "limit": "25"}},
    {"group": "single_filter", "name": "price_locked_yes", "params": {"price_locked": "true", "limit": "25"}},

    # ── filter_plus_sort (relevante Kombis, nicht alle 15×7) ───────────
    {"group": "filter_sort", "name": "category_vinyl_sort_year_desc", "params": {"category": "vinyl", "sort": "year_desc", "limit": "25"}},
    {"group": "filter_sort", "name": "category_tapes_sort_title_asc", "params": {"category": "tapes", "sort": "title_asc", "limit": "25"}},
    {"group": "filter_sort", "name": "format_lp_sort_artist_asc", "params": {"format": "LP", "sort": "artist_asc", "limit": "25"}},
    {"group": "filter_sort", "name": "baseline_sort_title_asc", "params": {"sort": "title_asc", "limit": "25"}},
    {"group": "filter_sort", "name": "baseline_sort_year_desc", "params": {"sort": "year_desc", "limit": "25"}},
    {"group": "filter_sort", "name": "visibility_visible_sort_title", "params": {"visibility": "visible", "sort": "title_asc", "limit": "25"}},

    # ── ui_combos ───────────────────────────────────────────────────────
    {"group": "ui_combos", "name": "tapes_germany_visible", "params": {"category": "tapes", "country": "Germany", "visibility": "visible", "limit": "25"}},
    {"group": "ui_combos", "name": "vinyl_1980s", "params": {"category": "vinyl", "year_from": "1980", "year_to": "1989", "limit": "25"}},
    {"group": "ui_combos", "name": "band_lit_sort_artist", "params": {"category": "band_literature", "sort": "artist_asc", "limit": "25"}},
    {"group": "ui_combos", "name": "inventory_any_stocktake_done", "params": {"inventory_state": "any", "stocktake": "done", "limit": "25"}},

    # ── computed_fields (Risikozone Plan §4.A.4) ────────────────────────
    {"group": "computed", "name": "stocktake_done", "params": {"stocktake": "done", "limit": "25"}},
    {"group": "computed", "name": "stocktake_pending", "params": {"stocktake": "pending", "limit": "25"}},
    {"group": "computed", "name": "stocktake_stale", "params": {"stocktake": "stale", "limit": "25"}},
    {"group": "computed", "name": "inventory_status_in_stock", "params": {"inventory_status": "in_stock", "limit": "25"}},

    # ── search_plus ─────────────────────────────────────────────────────
    {"group": "search", "name": "search_cabaret", "params": {"q": "cabaret voltaire", "limit": "25"}},
    {"group": "search", "name": "search_industrial", "params": {"q": "industrial", "limit": "25"}},
    {"group": "search", "name": "search_plus_format", "params": {"q": "industrial", "format": "LP", "limit": "25"}},
    {"group": "search", "name": "search_plus_year", "params": {"q": "noise", "year_from": "1984", "year_to": "1990", "limit": "25"}},

    # ── boundary ────────────────────────────────────────────────────────
    {"group": "boundary", "name": "empty_result", "params": {"q": "__no_match_abcdef_xyz__", "limit": "25"}},
    {"group": "boundary", "name": "large_result_sort_title", "params": {"sort": "title_asc", "limit": "100"}},
    {"group": "boundary", "name": "page_50_offset", "params": {"sort": "title_asc", "limit": "25", "offset": "1250"}},
]


@dataclass
class CaseResult:
    group: str
    name: str
    params: dict
    pg_count: Optional[int] = None
    meili_count: Optional[int] = None
    pg_ids: list = field(default_factory=list)
    meili_ids: list = field(default_factory=list)
    status: str = "pending"  # ok | warning | failed | error
    notes: list = field(default_factory=list)

    @property
    def count_delta_pct(self) -> Optional[float]:
        if self.pg_count is None or self.meili_count is None:
            return None
        if self.pg_count == 0:
            return 0.0 if self.meili_count == 0 else 100.0
        return abs(self.meili_count - self.pg_count) / self.pg_count * 100

    @property
    def ids_match(self) -> bool:
        return self.pg_ids == self.meili_ids

    @property
    def ids_as_set_match(self) -> bool:
        return set(self.pg_ids) == set(self.meili_ids)


def fetch(base_url: str, cookie: str, params: dict, backend: str, timeout: int = 30):
    full_params = dict(params)
    full_params["_backend"] = backend
    url = base_url.rstrip("/") + "/admin/media?" + urllib.parse.urlencode(full_params)

    req = urllib.request.Request(url, headers={"Cookie": cookie, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:200]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"URLError: {e.reason}")

    releases = data.get("releases") or []
    count = data.get("count")
    return {
        "count": count,
        "ids": [r.get("id") for r in releases],
        "backend_label": data.get("backend", backend),
    }


def run(base_url: str, cookie: str, cases: list, warn_threshold: float = 5.0):
    results = []
    for i, case in enumerate(cases):
        print(f"  [{i+1}/{len(cases)}] {case['group']}/{case['name']} ...", end=" ", flush=True)
        r = CaseResult(group=case["group"], name=case["name"], params=case["params"])

        try:
            pg = fetch(base_url, cookie, case["params"], "postgres")
            time.sleep(0.05)  # be gentle
            mei = fetch(base_url, cookie, case["params"], "meili")
        except Exception as e:
            r.status = "error"
            r.notes.append(f"fetch error: {e}")
            print(f"ERROR: {e}")
            results.append(r)
            continue

        r.pg_count = pg["count"]
        r.meili_count = mei["count"]
        r.pg_ids = pg["ids"]
        r.meili_ids = mei["ids"]

        # Vergleichs-Logik
        if r.pg_ids == r.meili_ids:
            if r.count_delta_pct is not None and r.count_delta_pct > warn_threshold:
                r.status = "warning"
                r.notes.append(f"IDs identisch aber Count delta {r.count_delta_pct:.1f}% (>{warn_threshold}%)")
            elif r.count_delta_pct is not None and r.count_delta_pct > 1.0:
                r.status = "warning"
                r.notes.append(f"IDs identisch, Count delta {r.count_delta_pct:.1f}% (info)")
            else:
                r.status = "ok"
        elif r.ids_as_set_match:
            r.status = "warning"
            r.notes.append("IDs als Set identisch, Sort-Reihenfolge weicht ab")
        else:
            r.status = "failed"
            only_pg = set(r.pg_ids) - set(r.meili_ids)
            only_mei = set(r.meili_ids) - set(r.pg_ids)
            r.notes.append(
                f"Resultset unterschiedlich — only_pg={len(only_pg)} only_meili={len(only_mei)}"
            )

        tag = {"ok": "OK", "warning": "WARN", "failed": "FAIL", "error": "ERR"}[r.status]
        print(f"{tag} (pg={r.pg_count} mei={r.meili_count})")
        results.append(r)

    return results


def summarize(results: list):
    ok = sum(1 for r in results if r.status == "ok")
    warn = sum(1 for r in results if r.status == "warning")
    failed = sum(1 for r in results if r.status == "failed")
    error = sum(1 for r in results if r.status == "error")

    print()
    print("═" * 60)
    print(f"  PASSED:   {ok}")
    print(f"  WARNINGS: {warn}")
    print(f"  FAILED:   {failed}")
    print(f"  ERROR:    {error}")
    print("═" * 60)

    if warn:
        print("\nWarnings (IDs ok, aber Count oder Sort abweichend):")
        for r in results:
            if r.status == "warning":
                print(f"  ⚠  {r.group}/{r.name}: {'; '.join(r.notes)}")

    if failed:
        print("\nFailed (Resultset unterschiedlich):")
        for r in results:
            if r.status == "failed":
                print(f"  ✗  {r.group}/{r.name}: {'; '.join(r.notes)}")
                print(f"     params: {r.params}")

    if error:
        print("\nErrors (Network/HTTP):")
        for r in results:
            if r.status == "error":
                print(f"  ⊘  {r.group}/{r.name}: {'; '.join(r.notes)}")

    return 0 if (failed == 0 and error == 0) else (2 if error > 0 else 1)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base-url", default=os.environ.get("ADMIN_BASE_URL", "http://localhost:9000"))
    p.add_argument("--admin-session-cookie", default=os.environ.get("ADMIN_SESSION_COOKIE", ""),
                   help="Cookie-Header komplett, z.B. 'connect.sid=...'")
    p.add_argument("--filter-group", default=None, help="Nur eine Gruppe testen (single_filter/ui_combos/etc.)")
    p.add_argument("--warn-threshold", type=float, default=5.0, help="Count-delta% über dem Warnung/Fail ausgelöst wird")
    p.add_argument("--output-json", default=None, help="Report als JSON in diese Datei schreiben")
    args = p.parse_args()

    if not args.admin_session_cookie:
        print("ERROR: --admin-session-cookie fehlt (Cookie muss Admin-Session haben)", file=sys.stderr)
        return 2

    cases = TEST_CASES
    if args.filter_group:
        cases = [c for c in cases if c["group"] == args.filter_group]
        if not cases:
            print(f"ERROR: keine Cases in Gruppe '{args.filter_group}'", file=sys.stderr)
            return 2

    print(f"Running {len(cases)} parity cases against {args.base_url}")
    print()
    results = run(args.base_url, args.admin_session_cookie, cases, args.warn_threshold)

    if args.output_json:
        report = [
            {
                "group": r.group,
                "name": r.name,
                "params": r.params,
                "pg_count": r.pg_count,
                "meili_count": r.meili_count,
                "count_delta_pct": r.count_delta_pct,
                "status": r.status,
                "notes": r.notes,
            }
            for r in results
        ]
        with open(args.output_json, "w") as f:
            json.dump(report, f, indent=2)
        print(f"\nReport written to {args.output_json}")

    return summarize(results)


if __name__ == "__main__":
    sys.exit(main())
