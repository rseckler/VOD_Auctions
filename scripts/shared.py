#!/usr/bin/env python3
"""
Shared utilities for VOD_Auctions scripts.

Provides common functions, constants, and database connections used by:
- legacy_sync.py (daily incremental sync from Legacy MySQL to Supabase)
- discogs_batch.py (initial batch matching against Discogs API)
- discogs_weekly_sync.py (weekly Discogs price updates)

All credentials loaded from VOD_Auctions/.env
"""

import os
import sys
import re
import html
import json
import time
import unicodedata
from collections import deque
from pathlib import Path

import requests as _requests
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# Load .env from parent directory (VOD_Auctions/.env)
load_dotenv(Path(__file__).parent.parent / ".env")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BATCH_SIZE = 500
IMAGE_BASE_URL = "https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/"
LEGACY_IMAGE_BASE_URL = "https://tape-mag.com/bilder/gross/"

# R2 Upload Configuration
R2_ENDPOINT = "https://98bed59e4077ace876d8c5870be1ad39.r2.cloudflarestorage.com"
R2_BUCKET = "vod-images"
R2_PREFIX = "tape-mag/standard/"
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")

_r2_client = None

def get_r2_client():
    """Lazy-init S3-compatible client for Cloudflare R2."""
    global _r2_client
    if _r2_client is not None:
        return _r2_client
    if not R2_ACCESS_KEY_ID or not R2_SECRET_ACCESS_KEY:
        return None
    try:
        import boto3
        _r2_client = boto3.client(
            "s3",
            endpoint_url=R2_ENDPOINT,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
        return _r2_client
    except ImportError:
        print("[shared] WARNING: boto3 not installed — R2 upload disabled")
        return None

def upload_image_to_r2(filename: str) -> bool:
    """Download image from tape-mag.com and upload to R2. Returns True on success."""
    client = get_r2_client()
    if not client:
        return False
    try:
        # Download from legacy source
        resp = _requests.get(LEGACY_IMAGE_BASE_URL + filename, timeout=30)
        if resp.status_code != 200:
            return False
        # Upload to R2
        content_type = "image/jpeg"
        if filename.lower().endswith(".png"):
            content_type = "image/png"
        elif filename.lower().endswith(".gif"):
            content_type = "image/gif"
        client.put_object(
            Bucket=R2_BUCKET,
            Key=R2_PREFIX + filename,
            Body=resp.content,
            ContentType=content_type,
        )
        return True
    except Exception as e:
        print(f"[r2-upload] Failed for {filename}: {e}")
        return False

def check_r2_exists(filename: str) -> bool:
    """Check if an image already exists in R2."""
    client = get_r2_client()
    if not client:
        return False
    try:
        client.head_object(Bucket=R2_BUCKET, Key=R2_PREFIX + filename)
        return True
    except Exception:
        return False

# Format name -> format_group mapping (string-based, used by map_format())
FORMAT_MAP = {
    # Release formats
    "tape": "CASSETTE",
    "tapes": "CASSETTE",
    "vinyl lp": "LP",
    'vinyl 7"': "LP",
    'vinyl 12"': "LP",
    'vinyl 10"': "LP",
    "video": "VHS",
    "reel": "REEL",
    "cd": "CD",
    "dvd": "VHS",
    "lp": "LP",
    "kassette": "CASSETTE",
    "mc": "CASSETTE",
    "buch": "BOOK",
    "book": "BOOK",
    "poster": "POSTER",
    "zine": "ZINE",
    "magazin": "ZINE",
    "box": "BOXSET",
    "boxset": "BOXSET",
    # Literature formats
    "mag/lit": "MAGAZINE",
    "picture": "PHOTO",
    "postcards": "POSTCARD",
    "t-shirt": "MERCHANDISE",
    "shirt": "MERCHANDISE",
}

# Valid ReleaseFormat enum values in Supabase
VALID_FORMATS = {
    "LP", "CD", "CASSETTE", "BOOK", "POSTER", "ZINE",
    "DIGITAL", "VHS", "BOXSET", "OTHER",
    "MAGAZINE", "PHOTO", "POSTCARD", "MERCHANDISE", "REEL",
}

# Legacy format ID -> format_group (direct ID-based mapping from Format table)
LEGACY_FORMAT_ID_MAP = {
    # Tapes (typ=1, kat=1)
    4: "CASSETTE", 5: "CASSETTE", 15: "CASSETTE", 16: "CASSETTE",
    17: "CASSETTE", 18: "CASSETTE", 19: "CASSETTE", 20: "CASSETTE",
    21: "CASSETTE", 23: "CASSETTE", 24: "CASSETTE", 35: "CASSETTE",
    # Other release formats (typ=1, kat=1)
    36: "REEL", 40: "VHS", 54: "CD",
    # Vinyl (typ=1, kat=2)
    41: "LP", 42: "LP", 43: "LP", 44: "LP", 45: "LP",
    46: "LP", 47: "LP", 48: "LP", 49: "LP", 50: "LP",
    51: "LP", 52: "LP", 53: "LP",
    # Literature formats (typ=2,3,4)
    26: "MAGAZINE", 27: "MAGAZINE", 32: "MAGAZINE",
    28: "PHOTO", 33: "PHOTO",
    29: "POSTCARD",
    30: "POSTER", 34: "POSTER",
    37: "BOOK",
    55: "MERCHANDISE", 56: "MERCHANDISE",
}

# ---------------------------------------------------------------------------
# Discogs API config
# ---------------------------------------------------------------------------

DISCOGS_TOKEN = "SWyMfyEwsjuacHWNeMTpAdeqjnuNcnibIrqIBdbV"
DISCOGS_BASE = "https://api.discogs.com"
DISCOGS_HEADERS = {
    "Authorization": f"Discogs token={DISCOGS_TOKEN}",
    "User-Agent": "VODAuctions/1.0 +https://vodauction.thehotshit.de",
}

# Map our ReleaseFormat enum to Discogs format search param
DISCOGS_FORMAT_MAP = {
    "LP": "Vinyl",
    "CD": "CD",
    "CASSETTE": "Cassette",
    "VHS": "DVD",
    "BOXSET": "Box Set",
    "DIGITAL": "File",
}

# Formats that should be skipped for Discogs matching (no music releases)
DISCOGS_SKIP_FORMATS = {"BOOK", "POSTER", "ZINE", "MAGAZINE", "PHOTO", "POSTCARD", "MERCHANDISE"}


# ---------------------------------------------------------------------------
# Text utilities
# ---------------------------------------------------------------------------

def slugify(text: str) -> str:
    """Generate URL-safe slug from text."""
    text = html.unescape(text)
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text.strip("-")[:200]


def decode_entities(text) -> str:
    """Decode HTML entities in text."""
    if text is None:
        return ""
    return html.unescape(str(text)).strip()


def map_format_by_id(format_id: int | None) -> str:
    """Map legacy format ID directly to ReleaseFormat enum value."""
    if format_id is None or format_id == 0:
        return "OTHER"
    return LEGACY_FORMAT_ID_MAP.get(format_id, "OTHER")


def map_format(format_name: str | None) -> str:
    """Map legacy format name to ReleaseFormat enum value."""
    if not format_name:
        return "OTHER"
    decoded = decode_entities(format_name)
    lower = decoded.lower().strip()
    # Strip multi-disc suffix (e.g. "Tape-2" -> "tape")
    base = re.sub(r"-\d+$", "", lower).strip()
    clean = re.sub(r"\s+c\d+$", "", base).strip()

    for key, value in FORMAT_MAP.items():
        if clean == key or base == key:
            return value
    for key, value in FORMAT_MAP.items():
        if key in clean:
            return value

    # If the decoded name itself matches a valid format
    upper = decoded.upper()
    if upper in VALID_FORMATS:
        return upper
    return "OTHER"


def parse_price(preis) -> float | None:
    """Parse legacy price field."""
    if preis is None:
        return None
    try:
        val = float(str(preis).replace(",", "."))
        return val if val > 0 else None
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Database connections
# ---------------------------------------------------------------------------

def get_mysql_connection():
    """Create MySQL connection to legacy DB."""
    import mysql.connector

    return mysql.connector.connect(
        host=os.getenv("LEGACY_DB_HOST"),
        port=int(os.getenv("LEGACY_DB_PORT", "3306")),
        user=os.getenv("LEGACY_DB_USER"),
        password=os.getenv("LEGACY_DB_PASSWORD"),
        database=os.getenv("LEGACY_DB_NAME"),
        charset="utf8mb4",
        use_unicode=True,
    )


def get_pg_connection():
    """Create PostgreSQL connection to Supabase."""
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("ERROR: SUPABASE_DB_URL not set in .env")
        print("Get it from: Supabase Dashboard -> Settings -> Database -> Connection String (URI)")
        sys.exit(1)
    return psycopg2.connect(db_url)


# ---------------------------------------------------------------------------
# Rate limiter (for Discogs API: 60 req/min authenticated)
# ---------------------------------------------------------------------------

class RateLimiter:
    """Token-bucket style rate limiter.

    Default: 55 calls per 60 seconds (leaves margin below Discogs' 60/min).
    """

    def __init__(self, max_calls: int = 55, period: int = 60):
        self.calls: deque = deque()
        self.max_calls = max_calls
        self.period = period

    def wait(self):
        """Block until a request slot is available."""
        now = time.time()
        # Discard calls outside the current window
        while self.calls and self.calls[0] < now - self.period:
            self.calls.popleft()
        # If at capacity, sleep until the oldest call exits the window
        if len(self.calls) >= self.max_calls:
            sleep_time = self.calls[0] + self.period - now + 0.1
            if sleep_time > 0:
                time.sleep(sleep_time)
        self.calls.append(time.time())


# ---------------------------------------------------------------------------
# Sync log helper
# ---------------------------------------------------------------------------

def log_sync(pg_conn, release_id, sync_type, changes, status="success", error_message=None):
    """Write an entry to the sync_log table.

    Args:
        pg_conn: psycopg2 connection to Supabase
        release_id: Release ID (or None for batch-level logs)
        sync_type: 'legacy', 'discogs_batch', or 'discogs_weekly'
        changes: dict describing what changed (stored as JSONB)
        status: 'success' or 'error'
        error_message: optional error description
    """
    cur = pg_conn.cursor()
    cur.execute(
        """INSERT INTO sync_log (release_id, sync_type, changes, status, error_message)
           VALUES (%s, %s, %s::jsonb, %s, %s)""",
        (
            release_id,
            sync_type,
            json.dumps(changes) if changes else None,
            status,
            error_message,
        ),
    )
    pg_conn.commit()
