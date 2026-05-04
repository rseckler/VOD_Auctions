#!/usr/bin/env python3
"""End-to-end connection probe for credentials in scripts/.env. Diagnostics-only."""
import os
import sys
import re
import time

results = []


def probe(name, fn):
    start = time.time()
    try:
        ok, info = fn()
        ms = int((time.time() - start) * 1000)
        results.append({"service": name, "ok": ok, "info": info, "ms": ms})
        marker = "OK  " if ok else "FAIL"
        print(f"  [{marker}] {name:30s} {ms:5d}ms  {info}")
    except Exception as e:
        ms = int((time.time() - start) * 1000)
        results.append({"service": name, "ok": False, "info": f"EXC {type(e).__name__}: {e}", "ms": ms})
        print(f"  [FAIL] {name:30s} {ms:5d}ms  EXC {type(e).__name__}: {e}")


print("=" * 78)
print("  ENV-Inventur scripts/.env")
print("=" * 78)

REQUIRED = [
    "DATABASE_URL", "SUPABASE_DB_URL", "ANTHROPIC_API_KEY",
    "MINIMAX_API_KEY", "MINIMAX_API_HOST",
    "MEILI_ADMIN_API_KEY", "MEILI_URL",
    "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET",
    "LEGACY_DB_HOST", "LEGACY_DB_PORT", "LEGACY_DB_USER", "LEGACY_DB_PASSWORD", "LEGACY_DB_NAME",
    "BRAVE_API_KEY", "DISCOGS_TOKEN", "SENTRY_DSN", "SUPABASE_SERVICE_ROLE_KEY",
]
for k in REQUIRED:
    v = os.getenv(k)
    if v:
        masked = (v[:4] + "..." + v[-4:]) if len(v) > 8 else "(short)"
        print(f"  {k:32s} SET      {masked}")
    else:
        print(f"  {k:32s} MISSING")

print()
print("=" * 78)
print("  Service Connection Probes")
print("=" * 78)


def p_postgres():
    import psycopg2
    pg = psycopg2.connect(os.environ["SUPABASE_DB_URL"])
    c = pg.cursor()
    c.execute("SELECT version()")
    v = c.fetchone()[0]
    c.execute('SELECT COUNT(*) FROM "Release"')
    rel = c.fetchone()[0]
    pg.close()
    return True, f"PG {v.split()[1]} - Release count={rel}"
probe("Postgres (Supabase)", p_postgres)


def p_mysql():
    import mysql.connector
    conn = mysql.connector.connect(
        host=os.environ["LEGACY_DB_HOST"],
        port=int(os.environ.get("LEGACY_DB_PORT", "3306")),
        user=os.environ["LEGACY_DB_USER"],
        password=os.environ["LEGACY_DB_PASSWORD"],
        database=os.environ["LEGACY_DB_NAME"],
        connection_timeout=5,
    )
    c = conn.cursor()
    c.execute("SELECT VERSION()")
    v = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM releases")
    rel = c.fetchone()[0]
    conn.close()
    return True, f"MySQL {v} - releases count={rel}"
probe("MySQL (tape-mag)", p_mysql)


def p_meili():
    import requests
    r = requests.get(f"{os.environ['MEILI_URL']}/health", timeout=5)
    h = r.json()
    r2 = requests.get(
        f"{os.environ['MEILI_URL']}/version",
        headers={"Authorization": f"Bearer {os.environ['MEILI_ADMIN_API_KEY']}"},
        timeout=5,
    )
    v = r2.json()
    return h.get("status") == "available", f"status={h.get('status')} - v={v.get('pkgVersion','?')}"
probe("Meilisearch", p_meili)


def p_r2():
    import boto3
    s = boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    r = s.list_objects_v2(Bucket=os.environ["R2_BUCKET"], MaxKeys=1)
    return True, f"bucket={os.environ['R2_BUCKET']} - KeyCount={r.get('KeyCount', 0)}"
probe("R2 (Cloudflare)", p_r2)


def p_anthropic():
    import requests
    r = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 8,
            "messages": [{"role": "user", "content": "ping"}],
        },
        timeout=15,
    )
    if r.status_code != 200:
        return False, f"HTTP {r.status_code}: {r.text[:120]}"
    j = r.json()
    return True, f"model={j.get('model','?')} - stop={j.get('stop_reason','?')}"
probe("Anthropic (Claude)", p_anthropic)


def p_minimax():
    import requests
    base = os.environ.get("MINIMAX_API_HOST", "https://api.minimax.io")
    if not base.startswith("http"):
        base = "https://" + base
    r = requests.post(
        f"{base}/v1/text/chatcompletion_v2",
        headers={
            "Authorization": f"Bearer {os.environ['MINIMAX_API_KEY']}",
            "Content-Type": "application/json",
        },
        json={
            "model": "MiniMax-M2",
            "messages": [{"role": "user", "content": "Reply with exactly: pong"}],
            "max_tokens": 400,
        },
        timeout=20,
    )
    if r.status_code != 200:
        return False, f"HTTP {r.status_code}: {r.text[:160]}"
    j = r.json()
    base_resp = j.get("base_resp", {})
    if base_resp.get("status_code") not in (0, None):
        return False, f"base_resp={base_resp}"
    return True, f"model={j.get('model','?')} - base_resp.status_code={base_resp.get('status_code', 0)}"
probe("MiniMax (M2)", p_minimax)


def p_brave():
    import requests
    r = requests.get(
        "https://api.search.brave.com/res/v1/web/search",
        headers={"X-Subscription-Token": os.environ["BRAVE_API_KEY"], "Accept": "application/json"},
        params={"q": "test", "count": 1},
        timeout=10,
    )
    if r.status_code != 200:
        return False, f"HTTP {r.status_code}: {r.text[:120]}"
    j = r.json()
    return True, f"results={len(j.get('web', {}).get('results', []))}"
probe("Brave Search", p_brave)


def p_discogs():
    import requests
    r = requests.get(
        "https://api.discogs.com/oauth/identity",
        headers={
            "Authorization": f"Discogs token={os.environ['DISCOGS_TOKEN']}",
            "User-Agent": "VOD_Auctions/1.0",
        },
        timeout=10,
    )
    if r.status_code != 200:
        return False, f"HTTP {r.status_code}: {r.text[:120]}"
    j = r.json()
    return True, f"username={j.get('username','?')}"
probe("Discogs API", p_discogs)


def p_supabase_rest():
    import requests
    db = os.environ["SUPABASE_DB_URL"]
    m = re.search(r"postgres\.([a-z0-9]+)", db) or re.search(r"db\.([a-z0-9]+)\.supabase", db)
    if not m:
        return False, "could not derive project ref from DATABASE_URL"
    ref = m.group(1)
    r = requests.get(
        f"https://{ref}.supabase.co/rest/v1/Release?select=id&limit=1",
        headers={
            "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
            "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}",
        },
        timeout=10,
    )
    return r.status_code == 200, f"HTTP {r.status_code} - ref={ref}"
probe("Supabase REST (svc role)", p_supabase_rest)


def p_sentry():
    dsn = os.environ.get("SENTRY_DSN", "")
    if not dsn.startswith("https://"):
        return False, "DSN format invalid"
    m = re.match(r"https://([^@]+)@([^/]+)/(\d+)", dsn)
    if not m:
        return False, "DSN regex no match"
    return True, f"host={m.group(2)} project={m.group(3)} (format valid; no live ping)"
probe("Sentry (DSN format)", p_sentry)

print()
print("=" * 78)
ok_count = sum(1 for r in results if r["ok"])
print(f"  Summary: {ok_count}/{len(results)} services OK")
print("=" * 78)
sys.exit(0 if all(r["ok"] for r in results) else 1)
