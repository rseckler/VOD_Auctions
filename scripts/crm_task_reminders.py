"""CRM Task Reminder-Cron — sendet Email-Reminder über Resend für fällige Tasks.

Findet alle offenen Tasks mit reminder_at <= NOW() AND reminder_sent_at IS NULL
und reminder_channel='email'. Sendet Resend-Email an assigned_to (oder created_by
als Fallback). Markiert reminder_sent_at.

Cron alle 5 Minuten:
    */5 * * * *  cd ~/VOD_Auctions/scripts && venv/bin/python3 crm_task_reminders.py >> crm_task_reminders.log 2>&1

ENV-Pflicht:
    SUPABASE_DB_URL    — Postgres connection
    RESEND_API_KEY     — für Email-Versand
    EMAIL_FROM         — z.B. noreply@vod-auctions.com (default)
"""
from __future__ import annotations
import os
import sys
import json
from urllib import request as urllib_request, error as urllib_error
from datetime import datetime, timezone
from pathlib import Path

# Bootstrap: .env laden
HERE = Path(__file__).resolve().parent
for env_file in (HERE / ".env", HERE.parent / "backend" / ".env"):
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

import psycopg2
import psycopg2.extras

DB_URL = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
RESEND_KEY = os.environ.get("RESEND_API_KEY")
FROM_EMAIL = os.environ.get("EMAIL_FROM", "noreply@vod-auctions.com")
ADMIN_BASE = os.environ.get("ADMIN_BASE_URL", "https://admin.vod-auctions.com")

if not DB_URL:
    print("[reminders] SUPABASE_DB_URL not set", file=sys.stderr)
    sys.exit(1)
if not RESEND_KEY:
    print("[reminders] RESEND_API_KEY not set — skipping email send", file=sys.stderr)


def send_email(to: str, subject: str, html: str, text: str) -> bool:
    if not RESEND_KEY:
        return False
    payload = json.dumps({
        "from": FROM_EMAIL,
        "to": [to],
        "subject": subject,
        "html": html,
        "text": text,
    }).encode("utf-8")
    req = urllib_request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_KEY}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib_request.urlopen(req, timeout=15) as resp:
            return resp.status == 200
    except urllib_error.HTTPError as e:
        print(f"[reminders] HTTP {e.code} sending to {to}: {e.read().decode()}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"[reminders] Error sending to {to}: {e}", file=sys.stderr)
        return False


def fmt_due(due_at: datetime) -> str:
    if due_at is None:
        return "(no due date)"
    return due_at.strftime("%a, %d %b %Y · %H:%M %Z")


def main() -> int:
    now = datetime.now(timezone.utc)
    sent = 0
    failed = 0
    skipped = 0

    with psycopg2.connect(DB_URL) as conn:
        conn.autocommit = False
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT t.id, t.master_id, t.title, t.description, t.due_at,
                       t.priority, t.assigned_to, t.created_by, t.reminder_at,
                       mc.display_name AS master_name
                FROM crm_master_task t
                JOIN crm_master_contact mc ON mc.id = t.master_id
                WHERE t.deleted_at IS NULL
                  AND mc.deleted_at IS NULL
                  AND t.status = 'open'
                  AND t.reminder_sent_at IS NULL
                  AND t.reminder_at IS NOT NULL
                  AND t.reminder_at <= NOW()
                  AND COALESCE(t.reminder_channel, 'email') = 'email'
                ORDER BY t.priority, t.reminder_at
                LIMIT 200
                """
            )
            tasks = cur.fetchall()

            print(f"[reminders] {len(tasks)} due tasks at {now.isoformat()}", flush=True)

            for t in tasks:
                to = t["assigned_to"] or t["created_by"]
                if not to or "@" not in to:
                    skipped += 1
                    continue

                deeplink = f"{ADMIN_BASE}/app/crm?contact={t['master_id']}#tasks"
                priority_label = {"urgent": "🚨 Urgent", "high": "🔴 High", "normal": "Normal", "low": "Low"}.get(t["priority"], "Normal")

                subject = f"⏰ Task reminder: {t['title']}"
                text = (
                    f"Reminder for task: {t['title']}\n\n"
                    f"Customer: {t['master_name']}\n"
                    f"Priority: {priority_label}\n"
                    f"Due: {fmt_due(t['due_at'])}\n"
                    + (f"\n{t['description']}\n" if t["description"] else "")
                    + f"\nOpen task: {deeplink}\n"
                )
                html = f"""
                <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">
                  <h2 style="margin:0 0 8px">⏰ Task reminder</h2>
                  <h3 style="margin:0 0 16px;color:#444">{t['title']}</h3>
                  <table style="font-size:14px;line-height:1.5">
                    <tr><td style="color:#888;padding-right:12px">Customer</td><td>{t['master_name']}</td></tr>
                    <tr><td style="color:#888;padding-right:12px">Priority</td><td>{priority_label}</td></tr>
                    <tr><td style="color:#888;padding-right:12px">Due</td><td>{fmt_due(t['due_at'])}</td></tr>
                  </table>
                  {f'<p style="font-size:14px;line-height:1.5;margin-top:16px;color:#333">{t["description"]}</p>' if t["description"] else ""}
                  <p style="margin-top:24px">
                    <a href="{deeplink}" style="background:#b8860b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Open task</a>
                  </p>
                  <p style="font-size:12px;color:#888;margin-top:32px">VOD Auctions CRM · automated reminder</p>
                </div>
                """

                ok = send_email(to, subject, html, text)
                if ok:
                    cur.execute(
                        "UPDATE crm_master_task SET reminder_sent_at = NOW() WHERE id = %s",
                        (t["id"],),
                    )
                    sent += 1
                else:
                    failed += 1

        conn.commit()

    print(f"[reminders] sent={sent} failed={failed} skipped={skipped}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
