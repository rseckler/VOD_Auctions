#!/usr/bin/env python3
"""Show top 20 articles by image count from legacy DB with tape-mag links."""
from shared import get_mysql_connection

conn = get_mysql_connection()
cur = conn.cursor(dictionary=True)

cur.execute(
    "SELECT bi.inid, bi.typ, COUNT(*) as img_count "
    "FROM bilder_1 bi "
    "WHERE bi.bild IS NOT NULL AND bi.bild <> '' "
    "GROUP BY bi.inid, bi.typ "
    "ORDER BY img_count DESC "
    "LIMIT 20"
)
rows = cur.fetchall()

TYPSET_MAP = {10: '8', 12: '7', 13: '5', 14: '6', 15: '6'}
TABLE_MAP = {
    10: ('3wadmin_tapes_releases', 'title', 'release'),
    12: ('3wadmin_tapes_pressorga_lit', 'title', 'pressorga_lit'),
    13: ('3wadmin_tapes_band_lit', 'title', 'band_lit'),
    14: ('3wadmin_tapes_labels_lit', 'title', 'labels_lit'),
    15: ('3wadmin_tapes_labels_lit', 'title', 'labels_lit'),
}

print(f"{'#':>3} {'Bilder':>6} {'Kategorie':<15} {'Titel':<55} {'tape-mag Link'}")
print("-" * 140)

for i, r in enumerate(rows, 1):
    inid = r['inid']
    typ = r['typ']
    img_count = r['img_count']

    info = TABLE_MAP.get(typ)
    if info:
        table, col, cat = info
        cur.execute(f"SELECT {col} FROM `{table}` WHERE id = %s", (inid,))
        row = cur.fetchone()
        title = row[col] if row else '?'
    else:
        title = '?'
        cat = f'typ={typ}'

    typset = TYPSET_MAP.get(typ, '8')
    url = f"https://tape-mag.com/index.php?navid=1&ln=1&detail={inid}&typset={typset}"
    print(f"{i:>3} {img_count:>6} {cat:<15} {title[:55]:<55} {url}")

conn.close()
