#!/usr/bin/env python3
"""Combine wantlist + sampled discographies → compute realistic Filter-Profile sizing.

Key insight from data: Major-Labels (Mute 30k+, London Records 431k, Polydor zigtausend)
distort linear extrapolation badly. Frank has individual releases from these — not
completist intent. We need to exclude over-large source entities to get realistic numbers.
"""
import json, sys, statistics
from collections import Counter, defaultdict
from pathlib import Path
from datetime import datetime, timezone

HERE = Path(__file__).parent
CACHE = HERE / "cache"
OUT = HERE / "output"

# Filter Profiles — include source-entity size cap
PROFILES = {
    "conservative": {
        "label": "Konservativ",
        "desc": "Vinyl LP/12\" + MC + CD-Album, ab 1980, exkl. Major-Label-Aggregation",
        "formats_allow": {"Vinyl", "Cassette", "CD"},
        "vinyl_must_be_lp_or_12": True,
        "year_min": 1980,
        "year_max": 2026,
        "exclude_descriptions": {"7\"", "Single", "Promo", "Test Pressing", "Unofficial", "Reissue", "Repress"},
        "master_dedupe": True,
        "exclude_appearance_role": True,
        "max_source_entity_size": 500,  # skip entities with > 500 total releases
        "min_wantlist_frequency": 3,    # source entity must appear ≥3× in wantlist
    },
    "medium": {
        "label": "Mittel",
        "desc": "Vinyl + MC + CD, ab 1970, alle Pressing-Varianten, exkl. extreme Mega-Labels",
        "formats_allow": {"Vinyl", "Cassette", "CD"},
        "vinyl_must_be_lp_or_12": False,
        "year_min": 1970,
        "year_max": 2026,
        "exclude_descriptions": {"Test Pressing", "Unofficial"},
        "master_dedupe": False,
        "exclude_appearance_role": True,
        "max_source_entity_size": 2000,
        "min_wantlist_frequency": 2,
    },
    "comprehensive": {
        "label": "Umfassend",
        "desc": "Alle Tonträger-Formate, alle Jahre, alle Versionen, nur Major-Mega-Aggregation aus",
        "formats_allow": None,
        "vinyl_must_be_lp_or_12": False,
        "year_min": 0,
        "year_max": 2026,
        "exclude_descriptions": set(),
        "master_dedupe": False,
        "exclude_appearance_role": False,
        "max_source_entity_size": 5000,
        "min_wantlist_frequency": 1,
    },
}

def passes_filter(release, profile):
    if release.get("type") == "master":
        return False
    if profile["exclude_appearance_role"] and release.get("role") and release["role"] != "Main":
        return False
    year = release.get("year") or 0
    if year and (year < profile["year_min"] or year > profile["year_max"]):
        return False
    fmt = (release.get("format") or "").lower()
    if profile["formats_allow"]:
        if not any(f.lower() in fmt for f in profile["formats_allow"]):
            return False
    if profile.get("vinyl_must_be_lp_or_12") and "vinyl" in fmt:
        if not any(s in fmt for s in ["lp", "12\"", "12 inch", "album"]):
            return False
    if profile["exclude_descriptions"]:
        if any(d.lower() in fmt for d in profile["exclude_descriptions"]):
            return False
    return True

def count_pass_rate(samples_dict, profile):
    """For a sample of entities, compute per-entity pass count + total releases.
    Returns (per_entity_pass_counts, per_entity_totals, dropped_due_to_size)."""
    per_entity_pass = []
    per_entity_total = []
    dropped_oversize = 0

    for eid, data in samples_dict.items():
        if "releases" not in data:
            continue
        # Use full estimate if capped, else actual
        full_est = data.get("total_releases_full_estimate") or data["total_releases"]
        # Apply max-source-entity-size filter
        if full_est > profile["max_source_entity_size"]:
            dropped_oversize += 1
            continue
        # Apply wantlist-frequency filter
        if data["want_count"] < profile["min_wantlist_frequency"]:
            continue

        master_seen = set()
        pass_count = 0
        for rel in data["releases"]:
            if passes_filter(rel, profile):
                if profile["master_dedupe"] and rel.get("main_release"):
                    if rel["main_release"] in master_seen:
                        continue
                    master_seen.add(rel["main_release"])
                pass_count += 1

        # If sample was capped, scale up the pass count proportionally
        if data.get("was_capped"):
            scale = full_est / max(data["total_releases"], 1)
            pass_count = int(pass_count * scale)

        per_entity_pass.append(pass_count)
        per_entity_total.append(full_est)

    return per_entity_pass, per_entity_total, dropped_oversize

def main():
    wantlist = json.loads((CACHE / "wantlist_full.json").read_text())
    discogs = json.loads((CACHE / "discographies_sample.json").read_text())

    artist_counter = Counter({int(k): v for k, v in wantlist["artist_counter"].items()})
    label_counter = Counter({int(k): v for k, v in wantlist["label_counter"].items()})
    artist_names = {int(k): v for k, v in wantlist["artist_names"].items()}
    label_names = {int(k): v for k, v in wantlist["label_names"].items()}

    artist_samples = {int(k): v for k, v in discogs["sampled_artists"].items()}
    label_samples = {int(k): v for k, v in discogs["sampled_labels"].items()}

    # === Per-profile projection ===
    profile_results = {}
    for pkey, profile in PROFILES.items():
        # Eligible entity counts in full population (not just sample)
        # Apply min_wantlist_frequency
        eligible_artists = [aid for aid, c in artist_counter.items()
                           if aid not in {0, 194, 355} and c >= profile["min_wantlist_frequency"]]
        eligible_labels = [lid for lid, c in label_counter.items()
                          if lid != 0 and label_names.get(lid, "").lower() != "not on label"
                          and c >= profile["min_wantlist_frequency"]]

        # Sample stats with this profile's filters
        artist_pass, artist_totals, artist_dropped = count_pass_rate(artist_samples, profile)
        label_pass, label_totals, label_dropped = count_pass_rate(label_samples, profile)

        # Median is more robust than mean for skewed distributions
        artist_median_pass = statistics.median(artist_pass) if artist_pass else 0
        label_median_pass = statistics.median(label_pass) if label_pass else 0
        artist_mean_pass = statistics.mean(artist_pass) if artist_pass else 0
        label_mean_pass = statistics.mean(label_pass) if label_pass else 0

        # Effective sample after entity-size cap
        artist_sample_eff = len(artist_pass)
        label_sample_eff = len(label_pass)

        # Project: assume our sample's avg-pass rate scales to the eligible population
        # but population already pre-filtered: how many of eligible_artists ALSO pass max_size?
        # Estimate: in our sample, X% were dropped due to oversize → apply same rate to population
        oversize_rate_artists = artist_dropped / max(len(artist_samples), 1) if artist_samples else 0
        oversize_rate_labels = label_dropped / max(len(label_samples), 1) if label_samples else 0
        post_size_artists = int(len(eligible_artists) * (1 - oversize_rate_artists))
        post_size_labels = int(len(eligible_labels) * (1 - oversize_rate_labels))

        # Project — use median (more robust against outliers)
        proj_from_artists_median = post_size_artists * artist_median_pass
        proj_from_labels_median = post_size_labels * label_median_pass
        proj_from_artists_mean = post_size_artists * artist_mean_pass
        proj_from_labels_mean = post_size_labels * label_mean_pass

        # Empirical artist↔label overlap (same release listed under both)
        # Without measurement, conservative 30%
        overlap_factor = 0.30
        gross_median = proj_from_artists_median + proj_from_labels_median
        gross_mean = proj_from_artists_mean + proj_from_labels_mean
        deduped_median = int(gross_median * (1 - overlap_factor))
        deduped_mean = int(gross_mean * (1 - overlap_factor))

        # Subtract already-wanted (estimate 8%)
        already_wanted_factor = 0.08
        net_new_median = max(0, int(deduped_median * (1 - already_wanted_factor)))
        net_new_mean = max(0, int(deduped_mean * (1 - already_wanted_factor)))

        # API time estimate
        # Discover phase: pages per eligible entity (after size cap)
        avg_pages_per_artist = sum(min(t, 7500) for t in artist_totals) / max(sum(artist_totals), 1) * 15 / 500 if artist_totals else 1
        avg_pages_per_artist = max(1, statistics.median([min(t, 7500) // 500 + 1 for t in artist_totals]) if artist_totals else 1)
        avg_pages_per_label = max(1, statistics.median([min(t, 7500) // 500 + 1 for t in label_totals]) if label_totals else 1)

        discover_calls = int(post_size_artists * avg_pages_per_artist + post_size_labels * avg_pages_per_label)
        wantlist_read_calls = (wantlist["total_items"] // 100) + 1
        apply_calls = net_new_median
        total_calls = wantlist_read_calls + discover_calls + apply_calls

        total_minutes = total_calls / 55  # 55 calls/min budget

        profile_results[pkey] = {
            "label": profile["label"],
            "desc": profile["desc"],
            "config": {
                "year_min": profile["year_min"],
                "max_source_entity_size": profile["max_source_entity_size"],
                "min_wantlist_frequency": profile["min_wantlist_frequency"],
                "vinyl_must_be_lp_or_12": profile["vinyl_must_be_lp_or_12"],
                "exclude_descriptions": list(profile["exclude_descriptions"]),
                "master_dedupe": profile["master_dedupe"],
            },
            "eligible_artists_after_freq_filter": len(eligible_artists),
            "eligible_labels_after_freq_filter": len(eligible_labels),
            "post_entity_size_cap_artists": post_size_artists,
            "post_entity_size_cap_labels": post_size_labels,
            "sample_artist_dropped_oversize": artist_dropped,
            "sample_label_dropped_oversize": label_dropped,
            "sample_artist_eff": artist_sample_eff,
            "sample_label_eff": label_sample_eff,
            "median_pass_per_artist": int(artist_median_pass),
            "median_pass_per_label": int(label_median_pass),
            "mean_pass_per_artist": int(artist_mean_pass),
            "mean_pass_per_label": int(label_mean_pass),
            "proj_from_artists_median": int(proj_from_artists_median),
            "proj_from_labels_median": int(proj_from_labels_median),
            "deduped_total_median": deduped_median,
            "deduped_total_mean": deduped_mean,
            "net_new_median": net_new_median,
            "net_new_mean": net_new_mean,
            "api_calls_total": total_calls,
            "api_calls_discover": discover_calls,
            "api_calls_apply": apply_calls,
            "api_minutes": int(total_minutes),
            "api_hours": round(total_minutes / 60, 1),
            "api_days_at_24h": round(total_minutes / 60 / 24, 1),
        }

    # === Top 20 entities ===
    top_20_artists = []
    for aid, count in sorted(artist_counter.items(), key=lambda x: -x[1]):
        if aid in {0, 194, 355}: continue
        top_20_artists.append({"id": aid, "name": artist_names.get(aid, "?"), "want_count": count})
        if len(top_20_artists) >= 20: break

    top_20_labels = []
    for lid, count in sorted(label_counter.items(), key=lambda x: -x[1]):
        if lid == 0: continue
        if label_names.get(lid, "").lower() == "not on label": continue
        top_20_labels.append({"id": lid, "name": label_names.get(lid, "?"), "want_count": count})
        if len(top_20_labels) >= 20: break

    # === Format/Year breakdown ===
    format_breakdown = sorted(
        [(k, v) for k, v in wantlist["format_counter"].items()],
        key=lambda x: -x[1]
    )[:20]

    year_buckets = defaultdict(int)
    for y, c in wantlist["year_counter"].items():
        y = int(y)
        if y == 0: year_buckets["unknown"] += c
        elif y < 1970: year_buckets["pre-1970"] += c
        elif y < 1980: year_buckets["1970s"] += c
        elif y < 1990: year_buckets["1980s"] += c
        elif y < 2000: year_buckets["1990s"] += c
        elif y < 2010: year_buckets["2000s"] += c
        elif y < 2020: year_buckets["2010s"] += c
        else: year_buckets["2020s"] += c

    # === Long-tail stats ===
    artist_tail = {
        "with_1": sum(1 for c in artist_counter.values() if c == 1),
        "with_2_5": sum(1 for c in artist_counter.values() if 2 <= c <= 5),
        "with_6_20": sum(1 for c in artist_counter.values() if 6 <= c <= 20),
        "with_21_plus": sum(1 for c in artist_counter.values() if c > 20),
    }
    label_tail = {
        "with_1": sum(1 for c in label_counter.values() if c == 1),
        "with_2_5": sum(1 for c in label_counter.values() if 2 <= c <= 5),
        "with_6_20": sum(1 for c in label_counter.values() if 6 <= c <= 20),
        "with_21_100": sum(1 for c in label_counter.values() if 21 <= c <= 100),
        "with_100_plus": sum(1 for c in label_counter.values() if c > 100),
    }

    # === Sampled-entity diagnostic ===
    artist_diag = []
    for aid, data in sorted(artist_samples.items(), key=lambda x: -x[1].get("want_count", 0)):
        if "error" in data:
            artist_diag.append({"name": data["name"], "want_count": data.get("want_count", 0), "error": data["error"]})
            continue
        full_est = data.get("total_releases_full_estimate") or data["total_releases"]
        artist_diag.append({
            "name": data["name"], "want_count": data["want_count"],
            "total_releases_estimate": full_est, "was_capped": data.get("was_capped", False),
            "fetched": data["total_releases"],
        })

    label_diag = []
    for lid, data in sorted(label_samples.items(), key=lambda x: -x[1].get("want_count", 0)):
        if "error" in data:
            label_diag.append({"name": data["name"], "want_count": data.get("want_count", 0), "error": data["error"]})
            continue
        full_est = data.get("total_releases_full_estimate") or data["total_releases"]
        label_diag.append({
            "name": data["name"], "want_count": data["want_count"],
            "total_releases_estimate": full_est, "was_capped": data.get("was_capped", False),
            "fetched": data["total_releases"],
        })

    analysis = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "username": "pripuzzi",
        "discogs_user_id": 39558,
        "wantlist_size": wantlist["total_items"],
        "wantlist_year_span": [
            min(int(y) for y in wantlist["year_counter"]),
            max(int(y) for y in wantlist["year_counter"]),
        ],
        "distinct_artists": len(artist_counter),
        "distinct_labels": len(label_counter),
        "artist_long_tail": artist_tail,
        "label_long_tail": label_tail,
        "top_20_artists": top_20_artists,
        "top_20_labels": top_20_labels,
        "format_breakdown": format_breakdown,
        "year_buckets": dict(year_buckets),
        "sample_artists_count": len(artist_samples),
        "sample_labels_count": len(label_samples),
        "sampled_artists_detail": artist_diag,
        "sampled_labels_detail": label_diag,
        "profile_projections": profile_results,
    }
    out_path = OUT / "analysis.json"
    with open(out_path, "w") as f:
        json.dump(analysis, f, indent=2)
    print(f"Saved analysis to {out_path}")

    # === Print summary ===
    print(f"\n=== Wantlist ===")
    print(f"Items: {analysis['wantlist_size']:,}")
    print(f"Distinct artists: {analysis['distinct_artists']:,}, labels: {analysis['distinct_labels']:,}")
    print(f"Year span: {analysis['wantlist_year_span'][0]} - {analysis['wantlist_year_span'][1]}")
    print(f"\n=== Long Tail ===")
    print(f"Artists with 1 want: {artist_tail['with_1']:,} ({artist_tail['with_1']/len(artist_counter)*100:.0f}%)")
    print(f"Artists with ≥3 wants: {sum(1 for c in artist_counter.values() if c >= 3):,}")
    print(f"Labels with 1 want: {label_tail['with_1']:,} ({label_tail['with_1']/len(label_counter)*100:.0f}%)")
    print(f"Labels with ≥3 wants: {sum(1 for c in label_counter.values() if c >= 3):,}")

    print(f"\n=== Profile Projections ===")
    for pkey, p in profile_results.items():
        print(f"\n  {p['label']:15} - {p['desc']}")
        print(f"    Eligible after freq filter: {p['eligible_artists_after_freq_filter']:,} artists / {p['eligible_labels_after_freq_filter']:,} labels")
        print(f"    After size cap (max {p['config']['max_source_entity_size']} releases/entity):")
        print(f"      → {p['post_entity_size_cap_artists']:,} artists / {p['post_entity_size_cap_labels']:,} labels")
        print(f"    Sample size cap drops: {p['sample_artist_dropped_oversize']}/{len(artist_samples)} artists, {p['sample_label_dropped_oversize']}/{len(label_samples)} labels")
        print(f"    Median passes per entity: {p['median_pass_per_artist']} per artist, {p['median_pass_per_label']} per label")
        print(f"    Mean passes (incl. tail outliers): {p['mean_pass_per_artist']} per artist, {p['mean_pass_per_label']} per label")
        print(f"    NET NEW WANTS (median proj): {p['net_new_median']:,}")
        print(f"    NET NEW WANTS (mean proj):   {p['net_new_mean']:,}")
        print(f"    API time: {p['api_hours']}h ({p['api_days_at_24h']} days at 24/7)")

if __name__ == "__main__":
    main()
