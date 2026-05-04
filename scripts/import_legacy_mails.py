#!/usr/bin/env python3
"""
import_legacy_mails — Import einer JSONL.gz von Frank's mail-archive scanner
nach crm_imap_message.

Quelle: /tmp/vod-mails-export.jsonl.gz (Frank → Robin → scp → VPS)

Workflow:
  1. Frank rennt scan-old-emails.sh auf Mac Studio
  2. Frank schickt JSONL.gz zu Robin (iCloud/WeTransfer/etc.)
  3. Robin scp-t nach VPS: /tmp/vod-mails-export.jsonl.gz
  4. Robin rennt: python3 scripts/import_legacy_mails.py /tmp/vod-mails-export.jsonl.gz [--commit]

Was passiert:
  - Liest JSONL.gz line-by-line
  - Pro Mail: Dedup-Check via message_id_header (skip wenn schon in DB)
  - INSERT in crm_imap_message mit:
      account = derived from From/To header (vinyl-on-demand vs vod-records)
      msg_uid = "legacy:<sha256-of-message_id>"  (fake-UID wegen kein echtes IMAP-UID)
      uid_validity = 0  (kein echtes IMAP)
      folder = "INBOX"  (default — original folder geht in raw_payload)
      from_email/from_email_lower/from_name aus parsed From
      to_emails (jsonb array)
      subject, body_excerpt = first 5000 chars of body
      detected_emails (jsonb array — alle email-addresses found in body)
  - Nach Done: Robin triggert Stage 4 Body-Match neu (separates skript)

Modes:
  --dry-run    Counts only, kein Insert
  --commit     Real INSERT
  --limit N    Nur N rows verarbeiten (für Tests)
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import sys
from datetime import datetime
from email.utils import parsedate_to_datetime, getaddresses
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from shared import get_pg_connection, _ensure_psycopg2  # noqa: E402

VOD_RECORDS_DOMAIN = "vod-records.com"
VOD_DEMAND_DOMAIN = "vinyl-on-demand.com"

EMAIL_RE = re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b")


def derive_account(from_str: str, to_str: str) -> str:
    """Bestimme welcher Frank-Account die Mail empfangen/gesendet hat."""
    blob = f"{from_str} {to_str}".lower()
    if VOD_DEMAND_DOMAIN in blob:
        return f"frank@{VOD_DEMAND_DOMAIN}"
    if VOD_RECORDS_DOMAIN in blob:
        return f"frank@{VOD_RECORDS_DOMAIN}"
    return "unknown"


def parse_addresses(addr_str: str) -> tuple[list[str], list[str]]:
    """RFC822 Address-Liste → ([emails], [names])."""
    if not addr_str:
        return [], []
    try:
        addrs = getaddresses([addr_str])
    except Exception:
        return [], []
    emails = [a[1].strip() for a in addrs if a[1]]
    names = [a[0].strip() for a in addrs if a[0]]
    return emails, names


def parse_iso_date(date_str: str) -> str | None:
    if not date_str:
        return None
    try:
        d = parsedate_to_datetime(date_str)
        if d is None:
            return None
        return d.isoformat()
    except Exception:
        return None


def extract_emails_from_body(body: str, max_count: int = 50) -> list[str]:
    """Find alle Email-Addressen im Body (für Stage-4-Body-Match)."""
    if not body:
        return []
    found = EMAIL_RE.findall(body)
    seen = []
    for e in found:
        e_lower = e.lower()
        if e_lower not in seen:
            seen.append(e_lower)
        if len(seen) >= max_count:
            break
    return seen


def import_one(cur, rec: dict) -> str:
    """INSERT one mail. Returns 'inserted' / 'skipped_duplicate' / 'error'."""
    msg_id = rec.get("message_id") or ""
    if not msg_id:
        # Fallback: hash des subject+date+from
        seed = f"{rec.get('subject','')}|{rec.get('date','')}|{rec.get('from','')}"
        msg_id = "synthetic:" + hashlib.sha256(seed.encode()).hexdigest()[:16]

    # Dedup: identische message_id_header schon da?
    cur.execute(
        "SELECT 1 FROM crm_imap_message WHERE message_id_header = %s LIMIT 1",
        (msg_id,),
    )
    if cur.fetchone():
        return "skipped_duplicate"

    from_emails, from_names = parse_addresses(rec.get("from", ""))
    to_emails, _ = parse_addresses(rec.get("to", ""))
    cc_emails, _ = parse_addresses(rec.get("cc", ""))

    from_email = from_emails[0] if from_emails else ""
    from_name = from_names[0] if from_names else ""

    body = rec.get("body") or ""
    body_excerpt = body[:5000] if body else None

    account = derive_account(rec.get("from", ""), rec.get("to", ""))
    fake_uid = "legacy:" + hashlib.sha256(msg_id.encode()).hexdigest()[:24]

    detected = extract_emails_from_body(body)

    cur.execute(
        """
        INSERT INTO crm_imap_message (
            account, msg_uid, uid_validity, folder,
            message_id_header, date_header,
            from_email, from_email_lower, from_name,
            to_emails, cc_emails,
            subject, body_excerpt,
            detected_emails
        ) VALUES (%s, %s, 0, 'LEGACY_ARCHIVE',
                  %s, %s,
                  %s, %s, %s,
                  %s::jsonb, %s::jsonb,
                  %s, %s,
                  %s::jsonb)
        """,
        (
            account, fake_uid,
            msg_id, parse_iso_date(rec.get("date", "")),
            from_email, from_email.lower(), from_name,
            json.dumps(to_emails), json.dumps(cc_emails),
            (rec.get("subject") or "")[:500], body_excerpt,
            json.dumps(detected),
        ),
    )
    return "inserted"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("jsonl", help="Pfad zur .jsonl.gz von Frank")
    ap.add_argument("--commit", action="store_true", help="Real-Insert (default: dry-run)")
    ap.add_argument("--limit", type=int, default=None, help="Nur N rows (Test)")
    args = ap.parse_args()

    src = Path(args.jsonl)
    if not src.exists():
        print(f"ERROR: {src} not found", file=sys.stderr)
        return 1

    print(f"[import] Source: {src} ({src.stat().st_size / 1024 / 1024:.1f} MB)")
    print(f"[import] Mode: {'COMMIT' if args.commit else 'DRY-RUN'}")

    conn = get_pg_connection()
    counts = {"inserted": 0, "skipped_duplicate": 0, "error": 0, "total": 0}

    try:
        with gzip.open(str(src), "rt", encoding="utf-8") as f:
            with conn.cursor() as cur:
                for i, line in enumerate(f, 1):
                    if args.limit and i > args.limit:
                        break
                    line = line.strip()
                    if not line:
                        continue
                    counts["total"] += 1
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        counts["error"] += 1
                        continue

                    if args.commit:
                        try:
                            result = import_one(cur, rec)
                            counts[result] += 1
                        except Exception as e:
                            counts["error"] += 1
                            print(f"  [err] line {i}: {e}", file=sys.stderr)
                            conn.rollback()
                    else:
                        # Dry-run: just count (don't actually check DB for dedup)
                        counts["inserted"] += 1

                    if counts["total"] % 500 == 0:
                        if args.commit:
                            conn.commit()
                        print(f"  [progress] {counts}", flush=True)

                if args.commit:
                    conn.commit()
    finally:
        conn.close()

    print()
    print("=== IMPORT REPORT ===")
    for k, v in counts.items():
        print(f"  {k:25} {v:>6}")

    if args.commit and counts["inserted"] > 0:
        print()
        print("Nächste Schritte:")
        print(f"  1. Verify: SELECT COUNT(*) FROM crm_imap_message WHERE folder='LEGACY_ARCHIVE';")
        print(f"  2. Re-run Stage 4 Body-Match — neue Email-Candidates für mo_pdf-Master ohne Email")
        print(f"     scripts/imap_indexer.py --stage4 (oder welcher entsprechende command)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
