#!/usr/bin/env python3
"""
Meilisearch Drift Check — compares Postgres Release count against Meili
numberOfDocuments per profile. Writes a row into meilisearch_drift_log per
run. Alerts on warning/critical thresholds.

Source of truth: Release WHERE coverImage IS NOT NULL  (matches the
storefront-visible set — coverImage-less rows are not indexed in Meili).

Thresholds (§11(d) of SEARCH_MEILISEARCH_PLAN.md):
  <  0.5 %  → ok       (normal sync lag, no alert)
  0.5-2 %   → warning  (Slack-Notification if SLACK_OPS_WEBHOOK is set)
  >  2 %    → critical (Sentry alert if SENTRY_DSN is set)

Cron:
  */30 * * * * cd /root/VOD_Auctions/scripts && venv/bin/python3 meilisearch_drift_check.py >> meilisearch_drift.log 2>&1
"""

import json
import os
import sys

import psycopg2
import requests


PROFILES = ("commerce", "discovery")
WARN_PCT = 0.5
CRITICAL_PCT = 2.0

# Backlog thresholds for search_indexed_at=NULL rows — if the Meili sync
# can't keep up, these fire even while the db/meili counts still match
# (because only search_indexed_at is behind, not the row existence).
BACKLOG_WARN = 1_000
BACKLOG_CRITICAL = 10_000

# Statement timeout for this script's connection. COUNT(*) on "Release" is
# an Index Only Scan (cost ~1100, sub-100ms), so 60s is far more than
# enough and surfaces real DB problems quickly rather than hanging 2min.
CONNECTION_STATEMENT_TIMEOUT = "60s"


def main():
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        sys.exit("ERROR: SUPABASE_DB_URL not set")

    meili_key = os.getenv("MEILI_ADMIN_API_KEY")
    if not meili_key:
        sys.exit("ERROR: MEILI_ADMIN_API_KEY not set")

    meili_base = os.getenv("MEILI_URL", "http://127.0.0.1:7700")
    headers = {"Authorization": f"Bearer {meili_key}"}

    pg = psycopg2.connect(db_url)
    try:
        cur = pg.cursor()
        cur.execute(f"SET statement_timeout = '{CONNECTION_STATEMENT_TIMEOUT}'")
        # Must match what meilisearch_sync.py actually pushes to Meili
        # (all Release rows, no coverImage filter — visibility is handled
        # by Meili filter `has_cover: true` at query time, not at index time).
        cur.execute('SELECT COUNT(*) FROM "Release"')
        db_count = cur.fetchone()[0]

        # Backlog: rows flagged for reindex that meilisearch_sync hasn't
        # processed yet. Uses the partial index idx_release_search_indexed_at_null.
        cur.execute(
            'SELECT COUNT(*) FROM "Release" WHERE search_indexed_at IS NULL'
        )
        backlog_count = cur.fetchone()[0]

        if backlog_count >= BACKLOG_CRITICAL:
            backlog_severity = "critical"
        elif backlog_count >= BACKLOG_WARN:
            backlog_severity = "warning"
        else:
            backlog_severity = "ok"

        backlog_entry = {
            "event": "meili_backlog_check",
            "backlog_count": backlog_count,
            "severity": backlog_severity,
        }
        print(json.dumps(backlog_entry))

        if backlog_severity == "warning":
            slack_url = os.getenv("SLACK_OPS_WEBHOOK")
            if slack_url:
                try:
                    requests.post(
                        slack_url,
                        json={
                            "text": (
                                f":warning: Meili backlog WARN: "
                                f"{backlog_count} rows flagged for reindex "
                                f"(search_indexed_at IS NULL)"
                            )
                        },
                        timeout=5,
                    )
                except Exception as e:
                    print(json.dumps({
                        "event": "slack_notify_failed",
                        "error": str(e),
                    }))
        elif backlog_severity == "critical":
            sentry_dsn = os.getenv("SENTRY_DSN")
            if sentry_dsn:
                try:
                    import sentry_sdk
                    sentry_sdk.init(sentry_dsn)
                    sentry_sdk.capture_message(
                        f"Meili backlog CRITICAL: {backlog_count} rows "
                        f"flagged for reindex — sync loop likely stuck",
                        level="error",
                    )
                except Exception as e:
                    print(json.dumps({
                        "event": "sentry_capture_failed",
                        "error": str(e),
                    }))

        for profile in PROFILES:
            index = f"releases-{profile}"
            try:
                r = requests.get(
                    f"{meili_base}/indexes/{index}/stats",
                    headers=headers, timeout=10,
                )
                r.raise_for_status()
                meili_count = r.json().get("numberOfDocuments", 0)
            except Exception as e:
                # If Meili is unreachable, log and continue to next profile
                print(json.dumps({
                    "event": "meili_drift_check_error",
                    "profile": profile,
                    "error": str(e),
                }))
                continue

            diff = abs(db_count - meili_count)
            diff_pct = (diff / db_count * 100) if db_count > 0 else 0.0

            if diff_pct >= CRITICAL_PCT:
                severity = "critical"
            elif diff_pct >= WARN_PCT:
                severity = "warning"
            else:
                severity = "ok"

            cur.execute(
                """INSERT INTO meilisearch_drift_log
                     (timestamp, profile, db_count, meili_count, diff_pct, severity)
                   VALUES (NOW(), %s, %s, %s, %s, %s)""",
                (profile, db_count, meili_count, round(diff_pct, 3), severity),
            )
            pg.commit()

            log_entry = {
                "event": "meili_drift_check",
                "profile": profile,
                "db_count": db_count,
                "meili_count": meili_count,
                "diff": diff,
                "diff_pct": round(diff_pct, 3),
                "severity": severity,
            }
            print(json.dumps(log_entry))

            if severity == "warning":
                slack_url = os.getenv("SLACK_OPS_WEBHOOK")
                if slack_url:
                    try:
                        requests.post(
                            slack_url,
                            json={
                                "text": (
                                    f":warning: Meili drift WARN ({profile}): "
                                    f"{diff_pct:.2f}% ({diff} docs "
                                    f"— db={db_count}, meili={meili_count})"
                                )
                            },
                            timeout=5,
                        )
                    except Exception as e:
                        print(json.dumps({
                            "event": "slack_notify_failed",
                            "error": str(e),
                        }))
            elif severity == "critical":
                sentry_dsn = os.getenv("SENTRY_DSN")
                if sentry_dsn:
                    try:
                        import sentry_sdk  # optional dep — only imported on critical
                        sentry_sdk.init(sentry_dsn)
                        sentry_sdk.capture_message(
                            f"Meili drift CRITICAL ({profile}): "
                            f"{diff_pct:.2f}% ({diff} docs — db={db_count}, "
                            f"meili={meili_count})",
                            level="error",
                        )
                    except Exception as e:
                        print(json.dumps({
                            "event": "sentry_capture_failed",
                            "error": str(e),
                        }))

        cur.close()
    finally:
        pg.close()


if __name__ == "__main__":
    main()
