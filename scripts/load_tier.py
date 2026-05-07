"""load_tier — Helper für tier-aware Sync-Skripte.

Quelle der Wahrheit (Override-Hierarchie):
  CLI flag (--load-tier)  ↗ höchste
  ENV VOD_LOAD_TIER       ↗
  DB site_config.features.load_tier
  Default 'medium'        ↘ niedrigste

Pro Cron-Run wird einmal gelesen, kein Hot-Reload.

Konzept: docs/optimizing/LOAD_TIER_KONZEPT.md
"""
from __future__ import annotations

import os

# Tier-Configs für Mail-Import (siehe LOAD_TIER_KONZEPT.md Sektion 4.3)
MAIL_IMPORT_TIER_CONFIGS = {
    "low": {
        "batch_size": 50,            # Dedup-IDs pro SELECT
        "sleep_s": 1.5,              # Pause zwischen Batches
        "stmt_timeout_s": 120,       # statement_timeout per Connection
        "max_runtime_s": 1800,       # 30 Min Hard-Stop pro Run
        "dedup_strategy": "select_then_insert",  # SELECT, then filter, then INSERT
        "state_flush_every_n": 1,    # State-File nach jedem Batch flushen
        "connection_recycle_every_n_batches": 20,  # Connection alle 20 Batches schließen+neu
    },
    "medium": {
        "batch_size": 200,
        "sleep_s": 0.2,
        "stmt_timeout_s": 300,
        "max_runtime_s": 3600,
        "dedup_strategy": "on_conflict",  # INSERT … ON CONFLICT DO NOTHING
        "state_flush_every_n": 5,
        "connection_recycle_every_n_batches": 50,
    },
    "high": {
        "batch_size": 500,
        "sleep_s": 0.0,
        "stmt_timeout_s": 600,
        "max_runtime_s": 0,           # 0 = unlimited
        "dedup_strategy": "on_conflict",
        "state_flush_every_n": 20,
        "connection_recycle_every_n_batches": 200,
    },
}

# Tier-Configs für legacy_sync_v2 (Sektion 4.2 LOAD_TIER_KONZEPT)
LEGACY_SYNC_TIER_CONFIGS = {
    "low": {
        "batch_size": 100, "sleep_s": 1.5, "stmt_timeout": "2min",
        "skip_r2": True, "skip_validation": True, "skip_search_indexed_at": True,
    },
    "medium": {
        "batch_size": 500, "sleep_s": 0.2, "stmt_timeout": "5min",
        "skip_r2": False, "skip_validation": False, "skip_search_indexed_at": False,
    },
    "high": {
        "batch_size": 1000, "sleep_s": 0.0, "stmt_timeout": "10min",
        "skip_r2": False, "skip_validation": False, "skip_search_indexed_at": False,
    },
}

VALID_TIERS = ("low", "medium", "high")


def get_active_tier(pg_conn=None, cli_override: str | None = None) -> str:
    """Returnt den aktiven Tier mit Override-Hierarchie.

    Args:
        pg_conn: optional psycopg2 connection für DB-Lookup. Wenn None → kein DB-Read.
        cli_override: optional --load-tier CLI flag (höchste Priorität).
    """
    if cli_override and cli_override in VALID_TIERS:
        return cli_override

    env = os.getenv("VOD_LOAD_TIER")
    if env in VALID_TIERS:
        return env

    if pg_conn is not None:
        try:
            with pg_conn.cursor() as cur:
                cur.execute(
                    "SELECT features->>'load_tier' FROM site_config WHERE id='default'"
                )
                row = cur.fetchone()
                if row and row[0] in VALID_TIERS:
                    return row[0]
        except Exception:
            pass  # DB nicht verfügbar oder Spalte fehlt → Default

    return "medium"


def get_mail_import_config(tier: str) -> dict:
    """Returnt das Tier-Config-Dict für den Mail-Importer."""
    return MAIL_IMPORT_TIER_CONFIGS.get(tier, MAIL_IMPORT_TIER_CONFIGS["medium"])


def get_legacy_sync_config(tier: str) -> dict:
    return LEGACY_SYNC_TIER_CONFIGS.get(tier, LEGACY_SYNC_TIER_CONFIGS["medium"])
