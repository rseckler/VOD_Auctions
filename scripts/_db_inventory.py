"""Quick inventory script — list tables with row counts in legacy MySQL DBs.

Usage on VPS:
    cd ~/VOD_Auctions/scripts && source venv/bin/activate
    python3 _db_inventory.py vod_records_db2013
    python3 _db_inventory.py vodtapes_members
    python3 _db_inventory.py vod_records_db1
"""
import sys
from legacy_db_pull import get_mysql_connection

if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "vod_records_db2013"
    conn = get_mysql_connection(src)
    cur = conn.cursor()
    cur.execute("SHOW TABLES")
    tables = [r[0] for r in cur.fetchall()]
    print(f"=== {src}: {len(tables)} tables ===")
    rows = []
    for t in tables:
        try:
            cur.execute("SELECT COUNT(*) FROM `" + t + "`")
            n = cur.fetchone()[0]
            rows.append((t, n))
        except Exception as e:
            rows.append((t, f"ERROR: {e}"))
    rows.sort(key=lambda x: -x[1] if isinstance(x[1], int) else -1)
    for t, n in rows:
        if isinstance(n, int) and n > 0:
            print(f"  {t:55s} {n:>10}")
        elif isinstance(n, str):
            print(f"  {t:55s} {n}")
