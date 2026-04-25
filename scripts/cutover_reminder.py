#!/usr/bin/env python3
"""
Format-V2 Cutover-Reminder

Sendet einmalig (idempotent via Marker-File) eine E-Mail an Robin sobald
der Stichtag erreicht ist. Email enthält einen Live-Status-Check der DB:
- NULL-Count auf format_v2 (sollte 0 sein)
- format vs. format_v2 Drift (Items wo alter Enum != mappings(format_v2))
- Anzahl Items pro distinct format_v2-Wert (Top 10)
- Constraint-Status (Whitelist-Werte abgleichen)
- Empfehlung Cutover GO/NO-GO

Stichtag: 2026-05-19 (3.5 Wochen nach rc51.7-Deploy 2026-04-25)
Empfänger: rseckler@gmail.com
Marker-File: scripts/.cutover_reminder_sent

Cron (VPS, daily): siehe install_cron() oder docs/architecture/CHANGELOG.md rc51.7

Usage:
  python3 cutover_reminder.py          # Normal-Modus (Datum + Marker prüfen)
  python3 cutover_reminder.py --force  # Sofort senden (Test/Manual)
  python3 cutover_reminder.py --dry-run  # Status zeigen, KEINE Email
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

# .env von Project-Root + backend/.env (Resend lebt da)
PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(PROJECT_ROOT / "backend" / ".env", override=True)

# ─── Config ────────────────────────────────────────────────────────────────
RESEND_API_KEY = os.getenv("RESEND_API_KEY")
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")
RECIPIENT = "rseckler@gmail.com"
FROM_EMAIL = "VOD Auctions <noreply@vod-auctions.com>"
TRIGGER_DATE = date(2026, 5, 19)  # 3.5 Wochen nach rc51.7
MARKER_FILE = Path(__file__).parent / ".cutover_reminder_sent"


# ─── Status Check ──────────────────────────────────────────────────────────
def fetch_status():
    """Query Live-DB für Cutover-Readiness-Indikatoren."""
    conn = psycopg2.connect(SUPABASE_DB_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # 1. NULL-Count + Total
    cur.execute("""
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE format_v2 IS NULL) AS null_count,
               COUNT(*) FILTER (WHERE format_v2 = 'Other') AS other_count,
               COUNT(*) FILTER (WHERE format_descriptors IS NOT NULL) AS with_descriptors
          FROM "Release"
    """)
    base = dict(cur.fetchone())

    # 2. Verteilung Top-15 + Other
    cur.execute("""
        SELECT format_v2, COUNT(*) AS n
          FROM "Release"
         WHERE format_v2 IS NOT NULL
         GROUP BY 1
         ORDER BY 2 DESC
         LIMIT 15
    """)
    top = [(r["format_v2"], r["n"]) for r in cur.fetchall()]

    # 3. Drift-Check: format (Enum) vs format_v2 Mapping-Konsistenz
    cur.execute("""
        SELECT COUNT(*) AS drift_count
          FROM "Release"
         WHERE format IS NOT NULL AND format_v2 IS NOT NULL
           AND NOT (
               (format::text = 'LP' AND format_v2 LIKE 'Vinyl-%') OR
               (format::text = 'CASSETTE' AND (format_v2 LIKE 'Tape%' OR format_v2 = 'Tapes')) OR
               (format::text = 'CD' AND format_v2 LIKE 'CD%') OR
               (format::text = 'REEL' AND format_v2 LIKE 'Reel%') OR
               (format::text = 'VHS' AND format_v2 IN ('VHS','DVD','DVDr','Blu-ray')) OR
               (format::text = 'MAGAZINE' AND format_v2 = 'Magazin') OR
               (format::text = 'PHOTO' AND format_v2 = 'Photo') OR
               (format::text = 'POSTCARD' AND format_v2 = 'Postcard') OR
               (format::text = 'POSTER' AND format_v2 = 'Poster') OR
               (format::text = 'BOOK' AND format_v2 = 'Book') OR
               (format::text = 'MERCHANDISE' AND format_v2 = 'T-Shirt') OR
               (format::text = 'BOXSET' AND format_v2 LIKE 'Vinyl-LP%') OR
               (format::text = 'BOXSET' AND format_v2 LIKE 'CD%') OR
               (format::text = 'BOXSET' AND format_v2 IN ('Flexi','Vinyl-7-Inch-4')) OR
               (format::text = 'OTHER' AND format_v2 IN ('Other','Flexi','Lathe-Cut','Lathe-Cut-2','Acetate','VHS','DVDr','CDr','CDr-2','Vinyl-LP','Tape')) OR
               (format::text = 'DIGITAL' AND format_v2 = 'Other') OR
               (format::text = 'ZINE' AND format_v2 = 'Magazin')
           )
    """)
    drift = cur.fetchone()["drift_count"]

    # 4. Sync-Aktivität letzten 24h
    cur.execute("""
        SELECT COUNT(*) AS recent_sync_count
          FROM "Release"
         WHERE legacy_last_synced > NOW() - INTERVAL '24 hours'
    """)
    recent_sync = cur.fetchone()["recent_sync_count"]

    # 5. Constraint-Existenz prüfen
    cur.execute("""
        SELECT COUNT(*) AS c FROM pg_constraint
         WHERE conname = 'release_format_v2_whitelist'
    """)
    constraint_active = cur.fetchone()["c"] > 0

    cur.close()
    conn.close()
    return {
        **base,
        "top_formats": top,
        "drift_count": drift,
        "recent_sync_count": recent_sync,
        "constraint_active": constraint_active,
    }


def render_email_html(status: dict) -> tuple[str, str]:
    """Baut Subject + HTML-Body aus dem Status-Dict."""
    null_count = status["null_count"]
    drift = status["drift_count"]
    total = status["total"]

    if null_count == 0 and drift == 0 and status["constraint_active"]:
        verdict_short = "✅ GO"
        verdict_html = "✅ <b>GO</b> — Cutover risikoarm. NULL=0, Drift=0, Constraint aktiv."
        verdict_color = "#15803d"
    elif null_count > 0 or drift > 0:
        verdict_short = "⚠️ NO-GO"
        verdict_html = f"⚠️ <b>NO-GO</b> — {null_count} NULL-Rows + {drift} Drift-Rows. Erst untersuchen."
        verdict_color = "#dc2626"
    else:
        verdict_short = "🟡 PARTIAL"
        verdict_html = "🟡 <b>PARTIAL</b> — Constraint inaktiv? Manuell prüfen."
        verdict_color = "#d97706"

    subject = f"VOD Format-V2 Cutover-Reminder · {verdict_short}"

    top_rows = "".join(
        f'<tr><td style="padding:4px 12px 4px 0;font-family:monospace;">{f}</td><td style="text-align:right;color:#666;">{n:,}</td></tr>'
        for f, n in status["top_formats"]
    )

    html = f"""<!DOCTYPE html>
<html><body style="font-family:-apple-system,sans-serif;max-width:600px;margin:24px auto;padding:0 16px;color:#1c1915;">
<h2 style="margin:0 0 16px 0;">Format-V2 Cutover-Reminder</h2>
<p style="margin:0 0 16px 0;color:#666;">Stichtag {TRIGGER_DATE.isoformat()} erreicht. rc51.7 ist seit dem 25.04.2026 live (3.5 Wochen Beobachtung).</p>

<div style="padding:16px;background:#f5f5f4;border-left:4px solid {verdict_color};margin:16px 0;">
{verdict_html}
</div>

<h3 style="margin:24px 0 8px 0;font-size:15px;">Live-Status</h3>
<table style="width:100%;border-collapse:collapse;font-size:14px;">
<tr><td style="padding:4px 12px 4px 0;">Total Releases</td><td style="text-align:right;font-weight:600;">{total:,}</td></tr>
<tr><td style="padding:4px 12px 4px 0;">format_v2 NULL</td><td style="text-align:right;font-weight:600;color:{'#dc2626' if null_count>0 else '#15803d'};">{null_count}</td></tr>
<tr><td style="padding:4px 12px 4px 0;">format vs format_v2 Drift</td><td style="text-align:right;font-weight:600;color:{'#dc2626' if drift>0 else '#15803d'};">{drift}</td></tr>
<tr><td style="padding:4px 12px 4px 0;">Other-Bucket</td><td style="text-align:right;">{status['other_count']}</td></tr>
<tr><td style="padding:4px 12px 4px 0;">mit format_descriptors</td><td style="text-align:right;">{status['with_descriptors']:,}</td></tr>
<tr><td style="padding:4px 12px 4px 0;">Sync-Aktivität letzten 24h</td><td style="text-align:right;">{status['recent_sync_count']:,}</td></tr>
<tr><td style="padding:4px 12px 4px 0;">Whitelist-Constraint aktiv</td><td style="text-align:right;">{'✅' if status['constraint_active'] else '❌'}</td></tr>
</table>

<h3 style="margin:24px 0 8px 0;font-size:15px;">Top-15 Verteilung</h3>
<table style="width:100%;border-collapse:collapse;font-size:13px;">
{top_rows}
</table>

<h3 style="margin:24px 0 8px 0;font-size:15px;">Cutover-Schritte</h3>
<ol style="color:#444;line-height:1.6;font-size:14px;">
<li>Schreib-Pfade: <code>legacy_sync_v2.py</code> + <code>discogs-import/commit/route.ts</code> + <code>media/[id]/route.ts</code> nur noch <code>format_v2</code> setzen lassen</li>
<li>Migration: <code>ALTER TABLE "Release" DROP COLUMN format</code> + <code>DROP TYPE "ReleaseFormat"</code></li>
<li>Optional: <code>ALTER TABLE "Release" RENAME COLUMN format_v2 TO format</code></li>
<li><code>scripts/shared.py</code> Cleanup (FORMAT_MAP, LEGACY_FORMAT_ID_MAP, map_format_by_id raus)</li>
<li>Storefront/Admin: <code>pickFormatLabel</code>-Fallbacks auf <code>format_name || format</code> entfernen</li>
<li>Meili-Index: <code>format</code>-Spalte aus Doc-Schema raus, Full-Rebuild</li>
<li>CHANGELOG + Release-Tag</li>
</ol>

<p style="margin:24px 0 0 0;font-size:12px;color:#999;">
Doku: <a href="https://github.com/rseckler/VOD_Auctions/blob/main/docs/architecture/FORMAT_MAPPING_ANALYSIS.md" style="color:#666;">FORMAT_MAPPING_ANALYSIS.md</a> ·
Plan-Doc-Section: „Schritt-Status → bewusst zurückgehalten"
</p>
</body></html>"""
    return subject, html


def send_email(subject: str, html: str) -> bool:
    """Sendet via Resend API. Returns True bei Erfolg."""
    if not RESEND_API_KEY:
        print("ERROR: RESEND_API_KEY not set", file=sys.stderr)
        return False
    r = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
        json={"from": FROM_EMAIL, "to": [RECIPIENT], "subject": subject, "html": html},
        timeout=30,
    )
    if r.status_code in (200, 201, 202):
        print(f"✓ Email sent to {RECIPIENT} (Resend ID: {r.json().get('id')})")
        return True
    print(f"✗ Resend error {r.status_code}: {r.text}", file=sys.stderr)
    return False


# ─── Main ──────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="Trigger date check umgehen")
    ap.add_argument("--dry-run", action="store_true", help="Status zeigen, keine Email")
    args = ap.parse_args()

    today = date.today()

    # Datums-Gate
    if not args.force and today < TRIGGER_DATE:
        days_left = (TRIGGER_DATE - today).days
        print(f"Trigger date {TRIGGER_DATE.isoformat()} not reached yet ({days_left} days left). Skipping.")
        return 0

    # Marker-Gate (idempotent)
    if not args.force and not args.dry_run and MARKER_FILE.exists():
        print(f"Marker file exists ({MARKER_FILE}). Reminder already sent. Skipping.")
        return 0

    print("Fetching live status from Supabase…")
    status = fetch_status()
    print(f"  total={status['total']:,} null={status['null_count']} drift={status['drift_count']} other={status['other_count']}")

    subject, html = render_email_html(status)
    print(f"Subject: {subject}")

    if args.dry_run:
        print("\n--- HTML PREVIEW (first 500 chars) ---")
        print(html[:500])
        print("--- END ---\n[dry-run] Email NOT sent.")
        return 0

    if send_email(subject, html):
        MARKER_FILE.write_text(f"sent={today.isoformat()}\n")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
