#!/usr/bin/env python3
"""
mark_stale_jobs.py — Cron-Script (Annex §A11.3).

Markiert background_job-Rows als 'failed', deren Heartbeat seit >5 Minuten
ausgeblieben ist. Hintergrund: Wenn ein Worker crasht oder das VPS rebootet
während ein Job 'running' ist, bleibt der Status sonst für immer 'running'
und das Operations-Hub zeigt einen Geist-Job.

Lehre aus dem System-Health-Outage 2026-05-01: Sampler war 5,6 Tage tot,
weil keine Stale-Detection lief. Genau das verhindert dieses Script.

Crontab (VPS):
    */2 * * * * cd /root/VOD_Auctions/scripts && venv/bin/python3 mark_stale_jobs.py >> mark_stale_jobs.log 2>&1

Idempotent (UPDATE matcht nur frische Stale-Rows; mehrfache Runs sind no-op).
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

import psycopg2

STALE_THRESHOLD_SEC = 5 * 60  # 5 Minuten ohne Heartbeat → stale

QUERY = """
UPDATE background_job
   SET status = 'failed',
       finished_at = NOW(),
       result_summary = COALESCE(result_summary, '{}'::jsonb)
                        || jsonb_build_object(
                             'error', 'heartbeat_stale',
                             'stale_threshold_sec', %s,
                             'last_heartbeat', last_heartbeat,
                             'marked_at', NOW()
                           )
 WHERE status = 'running'
   AND last_heartbeat < NOW() - make_interval(secs => %s)
RETURNING id, kind, display_name, last_heartbeat;
"""


def main() -> int:
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        print("FATAL: SUPABASE_DB_URL not set", file=sys.stderr)
        return 1

    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    try:
        with conn.cursor() as c:
            c.execute(QUERY, (STALE_THRESHOLD_SEC, STALE_THRESHOLD_SEC))
            stale = c.fetchall()
    finally:
        conn.close()

    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if not stale:
        print(f"[{ts}] no stale jobs")
        return 0

    print(f"[{ts}] marked {len(stale)} stale job(s) as failed:")
    for row in stale:
        job_id, kind, display_name, last_hb = row
        print(f"  - {job_id} kind={kind!r} name={display_name!r} last_hb={last_hb}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
