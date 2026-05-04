#!/usr/bin/env python3
"""
Newsletter → CRM Hybrid Backfill (Phase 2 of NEWSLETTER_CRM_HYBRID_PLAN).

Imports the 3.634 active newsletter_subscribers into the CRM as
crm_master_communication_pref rows with channel='email_marketing'.

Coverage strategy (Robin-approved 2026-05-04, Q1 + Q2 + Q3):
  - 1.680 subscribers match an existing crm_master_contact via email
    → just insert/upsert their pref row
  - 1.954 subscribers have no master
    → auto-create a minimal master with lifecycle_stage='lead',
      acquisition_channel='newsletter_signup', tags=['newsletter_only'],
      then insert their pref row

Output of every run:
  - Counts: matched / new_master_created / prefs_inserted / prefs_updated / errors
  - Per-master audit row in crm_master_audit_log
    (action='comm_pref_backfilled', source='brevo_legacy_backfill')

Idempotency:
  - Re-runs find now-existing masters via JOIN, no duplicate auto-master
  - Prefs use ON CONFLICT ... WHERE IS DISTINCT FROM (no spurious trigger fires)
  - Audit-Log is only written for actual changes, not no-ops

Modes:
  --dry-run    Just count what would happen, no writes (default if no flag)
  --commit     Actually write to the database
  --limit N    Process only the first N subscribers (for staging tests)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Reuse the shared psycopg2/SUPABASE_DB_URL bootstrap
sys.path.insert(0, str(Path(__file__).parent))
from shared import get_pg_connection, _ensure_psycopg2  # noqa: E402

CHANNEL = "email_marketing"
SOURCE_LABEL = "brevo_legacy_backfill"
TAG_NEWSLETTER_ONLY = "newsletter_only"
LIFECYCLE_STAGE_LEAD = "lead"
ACQUISITION_NEWSLETTER = "newsletter_signup"


def split_name(name: str | None, fallback_email: str) -> tuple[str, str | None, str | None]:
    """Return (display_name, first_name, last_name) from a freetext name field."""
    if not name or not name.strip():
        return (fallback_email, None, None)
    name = name.strip()
    parts = name.split(maxsplit=1)
    if len(parts) == 2:
        return (name, parts[0], parts[1])
    return (name, name, None)


def fetch_subscribers(conn, limit: int | None) -> list[dict]:
    sql = """
        SELECT
            ns.id, ns.email, lower(trim(ns.email)) AS email_lower,
            ns.name, ns.brevo_contact_id, ns.subscribed_at, ns.source,
            me.master_id
        FROM newsletter_subscribers ns
        LEFT JOIN crm_master_email me ON me.email_lower = lower(trim(ns.email))
        WHERE ns.unsubscribed_at IS NULL AND ns.email IS NOT NULL
        ORDER BY ns.id
    """
    if limit:
        sql += f" LIMIT {int(limit)}"
    pg = _ensure_psycopg2()
    with conn.cursor(cursor_factory=pg.extras.RealDictCursor) as cur:
        cur.execute(sql)
        return cur.fetchall()


def run_backfill(conn, dry_run: bool, limit: int | None) -> dict:
    pg = _ensure_psycopg2()
    counts = {
        "total_active": 0,
        "matched_existing": 0,
        "new_master_created": 0,
        "prefs_inserted": 0,
        "prefs_updated_status": 0,
        "errors": 0,
    }

    print(f"\n[backfill] Mode: {'DRY-RUN' if dry_run else 'COMMIT'}", flush=True)

    subs = fetch_subscribers(conn, limit)
    counts["total_active"] = len(subs)
    print(f"[backfill] {len(subs)} active subscribers fetched", flush=True)

    matched = [s for s in subs if s["master_id"] is not None]
    unmatched = [s for s in subs if s["master_id"] is None]
    counts["matched_existing"] = len(matched)
    print(f"[backfill] {len(matched)} matched existing master, {len(unmatched)} need auto-master",
          flush=True)

    if dry_run:
        print(f"\n[backfill] DRY-RUN — no writes performed.")
        print(f"[backfill] Would create {len(unmatched)} new master_contacts (lifecycle=lead, tag=newsletter_only)")
        print(f"[backfill] Would write {len(subs)} prefs rows (channel={CHANNEL}, opted_in=true)")
        return counts

    # ── Real run from here on ──────────────────────────────────────────────

    with conn.cursor(cursor_factory=pg.extras.RealDictCursor) as cur:
        # 1. Auto-create masters for unmatched subscribers
        for sub in unmatched:
            display_name, first, last = split_name(sub["name"], sub["email"])
            try:
                cur.execute(
                    """
                    INSERT INTO crm_master_contact
                        (display_name, first_name, last_name,
                         primary_email, primary_email_lower,
                         lifecycle_stage, acquisition_channel, acquisition_date,
                         tags, manual_review_status,
                         created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s::date, %s, %s, now(), now())
                    RETURNING id
                    """,
                    (display_name, first, last,
                     sub["email"], sub["email_lower"],
                     LIFECYCLE_STAGE_LEAD, ACQUISITION_NEWSLETTER, sub["subscribed_at"],
                     [TAG_NEWSLETTER_ONLY], "auto"),
                )
                new_master_id = cur.fetchone()["id"]
                # Also create the email row as primary
                cur.execute(
                    """
                    INSERT INTO crm_master_email
                        (master_id, email, is_primary, is_verified,
                         source_count, source_list)
                    VALUES (%s, %s, true, false, 1, ARRAY[%s])
                    ON CONFLICT DO NOTHING
                    """,
                    (new_master_id, sub["email"], SOURCE_LABEL),
                )
                sub["master_id"] = new_master_id  # mutate so the next pass uses it
                counts["new_master_created"] += 1
            except Exception as e:
                counts["errors"] += 1
                print(f"[backfill] ERROR creating master for {sub['email']}: {e}",
                      file=sys.stderr, flush=True)
                conn.rollback()
                # Re-open cursor after rollback
                cur = conn.cursor(cursor_factory=pg.extras.RealDictCursor)
                continue

            if counts["new_master_created"] % 200 == 0:
                conn.commit()  # checkpoint every 200 to avoid mega-transaction
                print(f"[backfill] Auto-masters created so far: {counts['new_master_created']}",
                      flush=True)

        conn.commit()
        print(f"[backfill] Auto-masters total: {counts['new_master_created']}",
              flush=True)

        # 2. Insert/Upsert prefs for everyone
        # Re-fetch with master_ids guaranteed (the unmatched list now has them)
        all_subs = matched + unmatched
        for sub in all_subs:
            if sub["master_id"] is None:
                # Skip ones we couldn't auto-create (errors)
                continue
            try:
                # Note brevo_contact_id in audit details, not in pref.notes
                # (pref.notes is user-facing free text; brevo_contact_id is metadata)
                cur.execute(
                    """
                    INSERT INTO crm_master_communication_pref
                        (master_id, channel, opted_in, opted_in_at,
                         source, notes, created_at, updated_at)
                    VALUES (%s, %s, true, %s, %s, NULL, now(), now())
                    ON CONFLICT (master_id, channel) DO UPDATE
                    SET opted_in = EXCLUDED.opted_in,
                        opted_in_at = COALESCE(crm_master_communication_pref.opted_in_at,
                                               EXCLUDED.opted_in_at),
                        opted_out_at = NULL,
                        source = EXCLUDED.source,
                        updated_at = now()
                    WHERE crm_master_communication_pref.opted_in IS DISTINCT FROM EXCLUDED.opted_in
                       OR crm_master_communication_pref.opted_in_at IS NULL
                    RETURNING id, (xmax = 0) AS inserted
                    """,
                    (sub["master_id"], CHANNEL, sub["subscribed_at"], SOURCE_LABEL),
                )
                row = cur.fetchone()
                if row is None:
                    # No-op (already opted_in, no change needed) — skip audit
                    continue

                if row["inserted"]:
                    counts["prefs_inserted"] += 1
                else:
                    counts["prefs_updated_status"] += 1

                # Audit-log
                cur.execute(
                    """
                    INSERT INTO crm_master_audit_log
                        (master_id, action, details, source, admin_email)
                    VALUES (%s, %s, %s::jsonb, %s, %s)
                    """,
                    (sub["master_id"],
                     "comm_pref_backfilled",
                     pg.extras.Json({
                         "channel": CHANNEL,
                         "opted_in": True,
                         "brevo_contact_id": sub["brevo_contact_id"],
                         "subscriber_id": sub["id"],
                         "newsletter_source": sub["source"],
                     }),
                     SOURCE_LABEL,
                     "system_backfill"),
                )
            except Exception as e:
                counts["errors"] += 1
                print(f"[backfill] ERROR upserting pref for master {sub['master_id']}: {e}",
                      file=sys.stderr, flush=True)
                conn.rollback()
                cur = conn.cursor(cursor_factory=pg.extras.RealDictCursor)
                continue

            if (counts["prefs_inserted"] + counts["prefs_updated_status"]) % 500 == 0:
                conn.commit()
                done = counts["prefs_inserted"] + counts["prefs_updated_status"]
                print(f"[backfill] Prefs written so far: {done}", flush=True)

        conn.commit()

    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="Newsletter → CRM Hybrid Backfill")
    parser.add_argument("--commit", action="store_true",
                        help="Actually write to the DB. Without this, runs in dry-run mode.")
    parser.add_argument("--limit", type=int, default=None,
                        help="Process only the first N subscribers (testing).")
    args = parser.parse_args()

    dry_run = not args.commit
    conn = get_pg_connection()
    try:
        counts = run_backfill(conn, dry_run=dry_run, limit=args.limit)
    finally:
        conn.close()

    print("\n=== Backfill Report ===")
    for k, v in counts.items():
        print(f"  {k:25} {v:>8}")

    return 0 if counts["errors"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
