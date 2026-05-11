"""Country name → ISO-3166 alpha-2 lookup — Python-Pendant zu backend/src/admin/data/country-iso.ts.

Beide Implementierungen MÜSSEN identische Outputs liefern (siehe Memory
`feedback_app_db_hash_formula_must_match`). Wenn hier was geändert wird,
auch country-iso.ts + country-normalize.ts synchron halten.

Source of truth Reihenfolge (rc54.0):
1. ALL_VALID_CODES — der Set aller Codes die als ISO durchgehen
2. COUNTRY_TO_ISO — Name (en + de + Discogs-Aliase + Multi-Region) → ISO
3. lookup_iso() — defensiv: Identity-Passthrough für gültige ISO, sonst Name-Lookup
4. normalize_country_to_iso() — wie lookup_iso, plus None für leere Inputs

Used by:
- scripts/meilisearch_sync.py (country_code Feld)
- scripts/legacy_sync_v2.py (translate_country)
- scripts/build_country_synonyms.py (Synonym-Generator für Meili)
"""
from __future__ import annotations


# ─────────────────────────────────────────────────────────────────────────────
# 1. ALL_VALID_CODES — alle 249 regulären ISO-3166-1 alpha-2 Codes plus die
#    deprecated ISO-3166-3 Codes (YU, DD, CS, SU) plus reserved (EU, WO).
# ─────────────────────────────────────────────────────────────────────────────

# Reguläre ISO-3166-1 Codes (249 Stück, Stand 2024)
REGULAR_ISO_CODES: set[str] = {
    "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT",
    "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI",
    "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY",
    "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
    "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM",
    "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK",
    "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL",
    "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM",
    "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR",
    "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN",
    "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS",
    "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK",
    "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW",
    "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP",
    "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM",
    "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
    "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM",
    "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF",
    "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW",
    "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
    "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
}

# Deprecated ISO-3166-3 — historische Codes die wir für alte Pressungen behalten
DEPRECATED_ISO_CODES: set[str] = {"YU", "DD", "CS", "SU"}

# Reserved Codes für Multi-Region (rc54.0)
# - EU: ISO-3166-1 exceptionally-reserved für European Union
# - WO: nicht ISO-zugewiesen, VOD-intern für „Worldwide"
RESERVED_ISO_CODES: set[str] = {"EU", "WO"}

ALL_VALID_CODES: set[str] = REGULAR_ISO_CODES | DEPRECATED_ISO_CODES | RESERVED_ISO_CODES


# ─────────────────────────────────────────────────────────────────────────────
# 2. COUNTRY_TO_ISO — Name (en + Discogs-Aliase + Multi-Region) → ISO
# ─────────────────────────────────────────────────────────────────────────────

COUNTRY_TO_ISO: dict[str, str] = {
    # ── Major markets ──
    "Germany": "DE",
    "United States": "US",
    "United Kingdom": "GB",
    "Japan": "JP",
    "France": "FR",
    "Italy": "IT",
    "Netherlands": "NL",
    "Belgium": "BE",
    "Canada": "CA",
    "Switzerland": "CH",
    "Australia": "AU",
    "Spain": "ES",
    "Austria": "AT",
    "Sweden": "SE",
    "Norway": "NO",
    "Poland": "PL",
    "Denmark": "DK",
    "Finland": "FI",
    "Ireland": "IE",
    "Iceland": "IS",
    "Portugal": "PT",

    # ── Central / Eastern Europe ──
    "Hungary": "HU",
    "Czech Republic": "CZ",
    "Czechia": "CZ",
    "Slovakia": "SK",
    "Slovenia": "SI",
    "Croatia": "HR",
    "Romania": "RO",
    "Bulgaria": "BG",
    "Yugoslavia": "YU",  # ISO-3166-3 deprecated
    "Serbia": "RS",
    "Lithuania": "LT",
    "Latvia": "LV",
    "Estonia": "EE",
    "Ukraine": "UA",
    "Belarus": "BY",
    "Luxembourg": "LU",

    # ── Southern Europe ──
    "Greece": "GR",
    "Turkey": "TR",  # offizieller ISO-Name seit 2022 ist "Türkiye"; Discogs nutzt "Turkey"
    "Türkiye": "TR",
    "Cyprus": "CY",
    "Malta": "MT",

    # ── Americas ──
    "Mexico": "MX",
    "Brazil": "BR",
    "Argentina": "AR",
    "Chile": "CL",
    "Peru": "PE",
    "Colombia": "CO",
    "Venezuela": "VE",
    "Uruguay": "UY",
    "Guatemala": "GT",

    # ── Oceania ──
    "New Zealand": "NZ",
    "Papua New Guinea": "PG",

    # ── Asia ──
    "China": "CN",
    "Hong Kong": "HK",
    "Taiwan": "TW",
    "South Korea": "KR",
    "Korea": "KR",
    "India": "IN",
    "Indonesia": "ID",
    "Thailand": "TH",
    "Malaysia": "MY",
    "Singapore": "SG",
    "Philippines": "PH",
    "Vietnam": "VN",
    "Israel": "IL",
    "Lebanon": "LB",

    # ── Africa ──
    "South Africa": "ZA",
    "Egypt": "EG",
    "Morocco": "MA",
    "Nigeria": "NG",
    "Kenya": "KE",
    "Tunisia": "TN",
    "Algeria": "DZ",

    # ── Russia / CIS ──
    "Russia": "RU",
    "Kazakhstan": "KZ",

    # ── Middle East ──
    "United Arab Emirates": "AE",
    "Saudi Arabia": "SA",
    "Iran": "IR",

    # ── Pacific / Misc ──
    "Puerto Rico": "PR",
    "Jamaica": "JM",
    "Cuba": "CU",
    "Dominican Republic": "DO",
    "Costa Rica": "CR",
    "Panama": "PA",

    # ── Deprecated ISO-3166-3 (für historische Releases) ──
    "Soviet Union": "SU",
    "USSR": "SU",
    "East Germany": "DD",
    "East Germany (GDR)": "DD",
    "German Democratic Republic": "DD",
    "German Democratic Republic (GDR)": "DD",
    "GDR": "DD",
    "Czechoslovakia": "CS",
    "Serbia and Montenegro": "CS",

    # ── Discogs-Aliase ──
    "UK": "GB",
    "USA": "US",

    # ── Multi-Region: Pure-Europe → EU ──
    "Europe": "EU",
    "European Union": "EU",

    # ── Multi-Region: Worldwide → WO ──
    "Worldwide": "WO",

    # ── Multi-Region: Region-Sammelnamen → primary country ──
    "Benelux": "NL",
    "Scandinavia": "SE",

    # ── Multi-Region: Compound → primary-country-first ──
    # UK-primary
    "UK & Europe": "GB",
    "UK & US": "GB",
    "UK & Ireland": "GB",
    "UK & Germany": "GB",
    "UK & France": "GB",
    "UK, Europe & US": "GB",
    # USA-primary
    "USA & Europe": "US",
    "USA & Canada": "US",
    "USA, Canada & Europe": "US",
    "USA, Canada & UK": "US",
    # DE-primary
    "Germany, Austria, & Switzerland": "DE",
    "Germany & Switzerland": "DE",
    # FR-primary
    "France & Benelux": "FR",
    # AU-primary (entdeckt im Discogs-Cache-Audit 2026-05-11)
    "Australia & New Zealand": "AU",
}


# ─────────────────────────────────────────────────────────────────────────────
# 3. lookup_iso — defensiv mit Identity-Passthrough
# ─────────────────────────────────────────────────────────────────────────────

def lookup_iso(country: str | None) -> str | None:
    """Resolve country name → ISO-2, case-insensitive. None if unknown.

    NEU (rc54.0): ISO-2 Codes als Identity-Passthrough akzeptieren. KRITISCH
    für die Migration — sonst bricht Meili-Sync zwischen Phase 4 (Backfill,
    DB enthält dann ISO) und Phase 6 (Code-Update), weil das alte Sync-Code-
    File `lookup_iso(row["country"])` ruft und für „DE" sonst None returnt
    → Meili-Docs bekommen country_code: null → Storefront-Filter tot.
    """
    if not country:
        return None
    trimmed = country.strip()
    if not trimmed:
        return None
    # Identity-Passthrough für valide ISO-Codes (case-insensitive)
    if len(trimmed) == 2:
        upper = trimmed.upper()
        if upper in ALL_VALID_CODES:
            return upper
    # Direct hit (exact case)
    if trimmed in COUNTRY_TO_ISO:
        return COUNTRY_TO_ISO[trimmed]
    # Case-insensitive Name-Lookup
    lower = trimmed.lower()
    for name, iso in COUNTRY_TO_ISO.items():
        if name.lower() == lower:
            return iso
    return None


# ─────────────────────────────────────────────────────────────────────────────
# 4. normalize_country_to_iso — Mirror der TS-Version
# ─────────────────────────────────────────────────────────────────────────────

def normalize_country_to_iso(raw: str | None) -> str | None:
    """Mirror of backend/src/lib/country-normalize.ts::normalizeCountryToIso.

    Funktional identisch zu lookup_iso(), nur expliziter Name für Write-Pfade
    (siehe legacy_sync_v2.py::translate_country).
    """
    return lookup_iso(raw)
