#!/usr/bin/env python3
"""Diagnostics: DB-side state for sync_log, drift_log, replication, R2 backups."""
import os
import sys
import boto3
import psycopg2

print("=" * 78)
print("  R2 backup bucket (vod-backups) — latest per prefix")
print("=" * 78)
s = boto3.client(
    "s3",
    endpoint_url=os.environ["R2_ENDPOINT"],
    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    region_name="auto",
)
# Discover actual prefixes at bucket root first
top = s.list_objects_v2(Bucket="vod-backups", Delimiter="/", MaxKeys=100)
roots = sorted([cp["Prefix"] for cp in top.get("CommonPrefixes", [])])
print(f"  bucket root prefixes    : {roots}")
print()
prefixes_to_check = roots if roots else ["db/vod-auctions/", "images-mirror/"]
for prefix in prefixes_to_check:
    paginator = s.get_paginator("list_objects_v2")
    latest = None
    count = 0
    for page in paginator.paginate(Bucket="vod-backups", Prefix=prefix):
        for it in page.get("Contents", []):
            count += 1
            if latest is None or it["LastModified"] > latest["LastModified"]:
                latest = it
    if latest:
        print(f"  {prefix:25s} count={count:6d}  latest={latest['Key']}  size={latest['Size']:,}  mod={latest['LastModified']}")
    else:
        print(f"  {prefix:25s} NO OBJECTS")

print()
print("=" * 78)
print("  Postgres state (sync_log, drift_log, health_check, replication)")
print("=" * 78)
pg = psycopg2.connect(os.environ["SUPABASE_DB_URL"])
c = pg.cursor()


def get_columns(table):
    c.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name=%s ORDER BY ordinal_position",
        (table,),
    )
    return [r[0] for r in c.fetchall()]


def first_match(cols, candidates):
    for x in candidates:
        if x in cols:
            return x
    return None


# sync_log
sl_cols = get_columns("sync_log")
ts_col = first_match(sl_cols, ["started_at", "created_at", "timestamp", "run_at", "ran_at"])
print(f"  sync_log columns        : {sl_cols}")
if ts_col:
    c.execute(
        f"SELECT MAX({ts_col})::text, COUNT(*) FROM sync_log WHERE {ts_col} > NOW() - INTERVAL '24 hours'"
    )
    r = c.fetchone()
    print(f"  sync_log 24h latest     : {r[0]}  count={r[1]}")
    c.execute(
        f"SELECT {ts_col}::text, phase, validation_status, rows_written, duration_ms FROM sync_log WHERE phase = 'summary' OR validation_status IS NOT NULL ORDER BY {ts_col} DESC LIMIT 5"
    )
    for r in c.fetchall():
        print(f"     {r}")
else:
    print("  sync_log: no time column matched")

# drift_log
c.execute(
    "SELECT MAX(timestamp)::text, COUNT(*) FROM meilisearch_drift_log WHERE timestamp > NOW() - INTERVAL '24 hours'"
)
r = c.fetchone()
print()
print(f"  drift_log 24h latest    : {r[0]}  count={r[1]}")

# health_check_log
hc_cols = get_columns("health_check_log")
hc_ts = first_match(hc_cols, ["checked_at", "created_at", "timestamp", "ts"])
if hc_ts:
    c.execute(
        f"SELECT MAX({hc_ts})::text, COUNT(*) FROM health_check_log WHERE {hc_ts} > NOW() - INTERVAL '1 hour'"
    )
    r = c.fetchone()
    print(f"  health_check_log 1h     : latest={r[0]}  count={r[1]}  (ts_col={hc_ts})")
else:
    print(f"  health_check_log columns: {hc_cols}  (no time col matched)")

# import_session — stuck sessions
c.execute("SELECT COUNT(*) FROM import_session WHERE status NOT IN ('done','abandoned','error') AND created_at < NOW() - INTERVAL '6 hours'")
stuck = c.fetchone()[0]
print(f"  stuck import_sessions   : {stuck} (>6h non-terminal)")

# release: search_indexed_at backlog
c.execute('SELECT COUNT(*) FROM "Release" WHERE search_indexed_at IS NULL')
backlog = c.fetchone()[0]
print(f"  Meili search backlog    : {backlog} rows w/ search_indexed_at IS NULL")

# active alerts — find the right table
c.execute(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%alert%' ORDER BY 1"
)
alert_tables = [r[0] for r in c.fetchall()]
print(f"  alert-related tables    : {alert_tables}")
for t in alert_tables:
    cols = get_columns(t)
    if "status" in cols:
        try:
            c.execute(f"SELECT COUNT(*) FROM {t} WHERE status = 'fired'")
            fired = c.fetchone()[0]
            print(f"     {t}: fired={fired}")
        except Exception as e:
            pg.rollback()
            print(f"     {t}: query error {e}")

# pg_stat_subscription on Supabase side
try:
    c.execute("SELECT subname, subenabled FROM pg_subscription")
    print("  Supabase publications/subscriptions:")
    for r in c.fetchall():
        print(f"     {r}")
except psycopg2.errors.InsufficientPrivilege:
    pg.rollback()
    print("  pg_subscription: insufficient privilege (expected for non-superuser)")

pg.close()
print()
print("=" * 78)
print("  Done.")
print("=" * 78)
