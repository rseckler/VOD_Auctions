"""Country name → ISO-3166 alpha-2 lookup for Meilisearch sync.

Source of truth: `backend/src/api/store/catalog/route.ts` COUNTRY_ALIASES.
Entries here map ENGLISH country names (Postgres stores English strings,
often with typos or aliases that the Postgres-side alias-map resolves) to
their ISO-2 code.

Used by `scripts/meilisearch_sync.py` to populate `country_code` in the
Meili document. Frontend can then render flags.

If a country is missing from this map, sync returns `None` — not a bug,
the flag just isn't rendered for that doc.
"""

COUNTRY_TO_ISO: dict[str, str] = {
    # Major markets
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

    # Central / Eastern Europe
    "Hungary": "HU",
    "Czech Republic": "CZ",
    "Slovakia": "SK",
    "Slovenia": "SI",
    "Croatia": "HR",
    "Romania": "RO",
    "Bulgaria": "BG",
    "Yugoslavia": "YU",  # legacy code, still in DB for pre-1992 releases
    "Serbia": "RS",
    "Lithuania": "LT",
    "Latvia": "LV",
    "Estonia": "EE",
    "Ukraine": "UA",
    "Belarus": "BY",
    "Luxembourg": "LU",

    # Southern Europe
    "Greece": "GR",
    "Turkey": "TR",
    "Cyprus": "CY",
    "Malta": "MT",

    # Americas
    "Mexico": "MX",
    "Brazil": "BR",
    "Argentina": "AR",
    "Chile": "CL",
    "Peru": "PE",
    "Colombia": "CO",
    "Venezuela": "VE",
    "Uruguay": "UY",

    # Oceania
    "New Zealand": "NZ",

    # Asia
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

    # Africa
    "South Africa": "ZA",
    "Egypt": "EG",
    "Morocco": "MA",
    "Nigeria": "NG",
    "Kenya": "KE",
    "Tunisia": "TN",
    "Algeria": "DZ",

    # Russia / CIS
    "Russia": "RU",
    "Kazakhstan": "KZ",

    # Middle East
    "United Arab Emirates": "AE",
    "Saudi Arabia": "SA",
    "Lebanon": "LB",
    "Iran": "IR",

    # Pacific / Misc
    "Puerto Rico": "PR",
    "Jamaica": "JM",
    "Cuba": "CU",
    "Dominican Republic": "DO",
    "Costa Rica": "CR",
    "Panama": "PA",

    # Former states (still in legacy DB)
    "Soviet Union": "SU",
    "East Germany": "DD",
    "Czechoslovakia": "CS",
    "GDR": "DD",
}


def lookup_iso(country: str | None) -> str | None:
    """Resolve country name → ISO-2, case-insensitive. None if unknown."""
    if not country:
        return None
    trimmed = country.strip()
    if not trimmed:
        return None
    # Direct hit
    if trimmed in COUNTRY_TO_ISO:
        return COUNTRY_TO_ISO[trimmed]
    # Case-insensitive fallback
    lower = trimmed.lower()
    for name, iso in COUNTRY_TO_ISO.items():
        if name.lower() == lower:
            return iso
    return None
