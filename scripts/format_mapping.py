"""
Format Mapping — Python mirror of backend/src/lib/format-mapping.ts

KEEP IN SYNC with the TS lib. Tests in tests/test_format_mapping.py.

Decisions (Frank, 2026-04-25):
- Internal format values URL-safe (no `"`): `Vinyl-7-Inch` instead of `Vinyl-7"`
- Sub-format tags (Picture Disc, Test Pressing, Limited Edition, Reissue, Stereo, Mono)
  go in Release.format_descriptors jsonb, NOT in format value
- All 71 values exist in whitelist from day one (Option A)
"""
from __future__ import annotations

# ─────────────────────────────────────────────────────────────────────────────
# 1. Whitelist
# ─────────────────────────────────────────────────────────────────────────────

FORMAT_VALUES: tuple[str, ...] = (
    # Vinyl LP
    "Vinyl-LP", "Vinyl-LP-2", "Vinyl-LP-3", "Vinyl-LP-4", "Vinyl-LP-5",
    "Vinyl-LP-6", "Vinyl-LP-7", "Vinyl-LP-8", "Vinyl-LP-9", "Vinyl-LP-10",
    "Vinyl-LP-11", "Vinyl-LP-12",
    # Vinyl 7" / 10" / 12" (Boxes durch Discogs-Cache-Analyse erweitert)
    "Vinyl-7-Inch", "Vinyl-7-Inch-2", "Vinyl-7-Inch-3", "Vinyl-7-Inch-4",
    "Vinyl-7-Inch-5", "Vinyl-7-Inch-10",
    "Vinyl-10-Inch", "Vinyl-10-Inch-2", "Vinyl-10-Inch-3", "Vinyl-10-Inch-4",
    "Vinyl-12-Inch", "Vinyl-12-Inch-2", "Vinyl-12-Inch-3", "Vinyl-12-Inch-4",
    "Vinyl-12-Inch-12",
    # Vinyl Sonder
    "Flexi", "Lathe-Cut", "Lathe-Cut-2", "Acetate", "Shellac",
    # Cassette
    "Tape", "Tape-2", "Tape-3", "Tape-4", "Tape-5", "Tape-6", "Tape-7",
    "Tape-8", "Tape-10", "Tape-12", "Tape-26", "Tape-32", "Tapes",
    # Reel
    "Reel", "Reel-2",
    # CD
    "CD", "CD-2", "CD-3", "CD-4", "CD-5", "CD-8", "CD-10", "CD-16",
    "CDr", "CDr-2", "CDV",
    # Video
    "VHS", "DVD", "DVDr", "Blu-ray",
    # Digital
    "File", "Memory-Stick",
    # Literatur
    "Magazin", "Photo", "Postcard", "Poster", "Book", "T-Shirt",
    "Other",
)

_FORMAT_VALUE_SET = set(FORMAT_VALUES)


def is_valid_format(v: str | None) -> bool:
    return v is not None and v in _FORMAT_VALUE_SET


# ─────────────────────────────────────────────────────────────────────────────
# 2. Tape-mag legacy_id → format value (deterministic)
# ─────────────────────────────────────────────────────────────────────────────

LEGACY_FORMAT_ID_MAP: dict[int, str] = {
    # Vinyl-Lp (typ=1, kat=2)
    43: "Vinyl-LP", 42: "Vinyl-LP-2", 44: "Vinyl-LP-3",
    45: "Vinyl-LP-4", 41: "Vinyl-LP-5", 49: "Vinyl-LP-6", 50: "Vinyl-LP-7",
    # Vinyl 7"
    46: "Vinyl-7-Inch", 48: "Vinyl-7-Inch-2", 51: "Vinyl-7-Inch-3",
    # Vinyl 10" / 12"
    47: "Vinyl-10-Inch", 52: "Vinyl-10-Inch-2", 53: "Vinyl-12-Inch",
    # Cassette
    5: "Tape",
    16: "Tape-2", 18: "Tape-3", 20: "Tape-4", 21: "Tape-5",
    23: "Tape-6", 4: "Tape-7", 35: "Tape-8", 15: "Tape-10",
    17: "Tape-26", 19: "Tape-32", 24: "Tapes",
    # Sonstige
    36: "Reel",
    40: "VHS",   # tape-mag "Video" = 100% VHS (Frank, 2026-04-25)
    54: "CD",
    # Literatur
    26: "Magazin", 27: "Magazin", 32: "Magazin",
    28: "Photo", 33: "Photo",
    29: "Postcard",
    30: "Poster", 34: "Poster",
    37: "Book",
    55: "T-Shirt", 56: "T-Shirt",
}


def classify_tape_mag_format(format_id: int | None) -> str:
    if format_id is None or format_id == 0:
        return "Other"
    return LEGACY_FORMAT_ID_MAP.get(format_id, "Other")


# ─────────────────────────────────────────────────────────────────────────────
# 3. Discogs format → format value
# ─────────────────────────────────────────────────────────────────────────────

DESCRIPTOR_ONLY: set[str] = {
    "Album", "Compilation", "Reissue", "Repress", "Limited Edition", "Numbered",
    "Stereo", "Mono", "Quadraphonic", "Picture Disc", "Test Pressing",
    "White Label", "Promo", "Remastered", "Unofficial Release", "Special Edition",
    "Misprint", "Club Edition", "Etched", "Coloured", "Gatefold", "Single Sided",
    "33 ⅓ RPM", "45 RPM", "78 RPM", "Special Cut", "Enhanced", "Copy Protected",
    "Chrome", "Metal", "Dolby B/C", "Dolby System", "Dolby HX", "Dolby HX Pro",
}

DISCOGS_TOP_LEVEL: dict[str, str] = {
    "Vinyl": "VINYL_SUB",
    "Cassette": "Tape",
    "CD": "CD",
    "CDr": "CDr",
    "CDV": "CDV",
    "DVD": "DVD",
    "DVDr": "DVDr",
    "Blu-ray": "Blu-ray",
    "VHS": "VHS",
    "Reel-To-Reel": "Reel",
    "Flexi-disc": "Flexi",
    "Lathe Cut": "Lathe-Cut",
    "Acetate": "Acetate",
    "Shellac": "Shellac",
    "File": "File",
    "Memory Stick": "Memory-Stick",
    "Box Set": "BOX_CONTAINER",
    "All Media": "BOX_CONTAINER",
}


def _detect_vinyl_size(descs: list[str]) -> str:
    """Return one of: '7', '10', '12-Maxi', 'LP', 'unspecified'."""
    s = set(descs)
    if '7"' in s:
        return "7"
    if '10"' in s:
        return "10"
    # 12" with Album/LP/Mini-Album indicator = LP, else Maxi-Single
    has_12 = '12"' in s
    is_album_like = "LP" in s or "Album" in s or "Mini-Album" in s
    if has_12 and is_album_like:
        return "LP"
    if has_12:
        return "12-Maxi"
    if is_album_like:
        return "LP"
    # Sub-type indicators without explicit size (Frank's CSV defaults)
    if "EP" in s or "Single" in s:
        return "7"
    if "Maxi-Single" in s:
        return "12-Maxi"
    return "unspecified"


def _with_qty(base: str, qty: int) -> str:
    if qty <= 1:
        return base
    candidate = f"{base}-{qty}"
    if candidate in _FORMAT_VALUE_SET:
        return candidate
    return "Other"


def classify_discogs_format(formats: list[dict]) -> dict:
    """
    Returns: {format: str, descriptors: list[str], reason: str}

    formats: list of dicts with keys 'name', 'qty' (str/int), 'descriptions' (list[str])
    """
    if not formats:
        return {"format": "Other", "descriptors": [], "reason": "no formats array"}

    primary = None
    container_hint = ""
    for f in formats:
        mapped = DISCOGS_TOP_LEVEL.get(f.get("name", ""))
        if mapped == "BOX_CONTAINER":
            container_hint = f.get("name", "")
            continue
        primary = f
        break

    if primary is None:
        return {
            "format": "Other",
            "descriptors": [container_hint] if container_hint else [],
            "reason": f"only container formats: {container_hint or 'unknown'}",
        }

    try:
        qty = max(1, int(str(primary.get("qty", "1"))))
    except (ValueError, TypeError):
        qty = 1

    descs = primary.get("descriptions") or []
    name = primary.get("name", "")
    top_map = DISCOGS_TOP_LEVEL.get(name)

    if top_map == "VINYL_SUB":
        size = _detect_vinyl_size(descs)
        if size == "7":
            base = "Vinyl-7-Inch"
        elif size == "10":
            base = "Vinyl-10-Inch"
        elif size == "12-Maxi":
            base = "Vinyl-12-Inch"
        elif size == "LP":
            base = "Vinyl-LP"
        else:
            base = "Vinyl-LP"  # unspecified default per Frank's CSV
        fmt = _with_qty(base, qty)
        descriptors = [d for d in descs if d in DESCRIPTOR_ONLY]
        reason = f"Vinyl size={size}, qty={qty}"
        if container_hint:
            reason += f", in {container_hint}"
        return {"format": fmt, "descriptors": descriptors, "reason": reason}

    if isinstance(top_map, str):
        fmt = _with_qty(top_map, qty)
        descriptors = [d for d in descs if d in DESCRIPTOR_ONLY]
        reason = f"{name} → {top_map}, qty={qty}"
        if container_hint:
            reason += f", in {container_hint}"
        return {"format": fmt, "descriptors": descriptors, "reason": reason}

    return {
        "format": "Other",
        "descriptors": [d for d in descs if d in DESCRIPTOR_ONLY],
        "reason": f"unknown Discogs format: {name}",
    }
