"""
Configuration for Entity Content Overhaul pipeline.
Loads API keys from .env, defines rate limits and thresholds.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from scripts directory
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)

# Also try backend .env for DATABASE_URL
_backend_env = Path(__file__).resolve().parent.parent.parent / "backend" / ".env"
load_dotenv(_backend_env)

# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "")

# ── API Keys ──────────────────────────────────────────────────────────────────
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
DISCOGS_TOKEN = os.getenv("DISCOGS_TOKEN", "")
LASTFM_API_KEY = os.getenv("LASTFM_API_KEY", "")
LASTFM_SHARED_SECRET = os.getenv("LASTFM_SHARED_SECRET", "")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")
BRAVE_API_KEY = os.getenv("BRAVE_API_KEY", "")

# ── Rate Limits (requests per minute) ─────────────────────────────────────────
RATE_LIMITS = {
    "discogs": 40,       # 60 official, we use 40 for safety
    "musicbrainz": 50,   # 1 req/sec = 60/min, we use 50
    "wikidata": 200,     # Very generous
    "wikipedia": 200,    # Very generous
    "lastfm": 200,       # 5 req/sec = 300/min
    "brave": 50,         # 1 req/sec = 60/min, we use 50
    "bandcamp": 30,      # Polite scraping, 2 req/sec max
    "internet_archive": 60,
    "youtube": 80,       # 10,000 units/day, 1 search = 100 units
    "openai": 500,       # Tier 1: 500 RPM
}

# ── Model Configuration ──────────────────────────────────────────────────────
MODELS = {
    "writer": "gpt-4o",
    "profiler": "gpt-4o-mini",
    "seo": "gpt-4o-mini",
    "quality": "gpt-4o-mini",
    "musician_mapper": "gpt-4o-mini",
}

# ── Quality Thresholds ────────────────────────────────────────────────────────
QUALITY_ACCEPT_THRESHOLD = 75    # Score >= 75: accept
QUALITY_REVISE_THRESHOLD = 50    # Score 50-74: revise (max 2 retries)
MAX_REVISIONS = 2

# ── Word Targets by Priority ─────────────────────────────────────────────────
WORD_TARGETS = {
    "P1": (300, 500),   # >10 releases
    "P2": (150, 250),   # 3-10 releases
    "P3": (50, 120),    # 1-2 releases
}

# ── Musician Confidence Thresholds ────────────────────────────────────────────
MUSICIAN_AUTO_INSERT = 0.70      # >= 0.70: auto-insert
MUSICIAN_REVIEW_FLAG = 0.40      # 0.40-0.69: insert with needs_review=true
# < 0.40: skip

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
LOGS_DIR = BASE_DIR / "logs"
TONE_EXAMPLES_DIR = BASE_DIR / "tone_examples"
PROGRESS_FILE = DATA_DIR / "entity_overhaul_progress.json"
REJECTS_FILE = DATA_DIR / "quality_rejects.json"
MUSICIAN_REVIEW_FILE = DATA_DIR / "musician_review_queue.json"

# ── User Agent for APIs ───────────────────────────────────────────────────────
USER_AGENT = "VODAuctions/1.0 (https://vod-auctions.com; robin@seckler.de)"

# Ensure directories exist
DATA_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)
