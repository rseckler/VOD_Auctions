"""Print column schemas for chosen tables."""
import sys
from legacy_db_pull import get_mysql_connection

if __name__ == "__main__":
    src = sys.argv[1]
    tables = sys.argv[2:]
    conn = get_mysql_connection(src)
    cur = conn.cursor()
    for t in tables:
        print(f"\n=== {t} ===")
        cur.execute("DESCRIBE `" + t + "`")
        for row in cur.fetchall():
            print(f"  {row[0]:30s} {row[1]:30s} {row[2] or '':10s} {row[3] or '':10s} {row[4] or '':15s}")
        cur.execute("SELECT * FROM `" + t + "` LIMIT 2")
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        if rows:
            print("  --- Sample row ---")
            for col, val in zip(cols, rows[0]):
                vs = str(val)[:80]
                print(f"  {col:30s} {vs}")
