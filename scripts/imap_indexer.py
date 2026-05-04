#!/usr/bin/env python3
"""
imap_indexer — F1 IMAP-Index-Service.

Quellen (Hetzner Mailbox-Hosting, mail.your-server.de:993 IMAPS):
  - frank@vod-records.com         (1Password mfcjmrompkjjxap6il5nbsd7pa)
  - frank@vinyl-on-demand.com     (1Password 7fos2enccq4p7moqnpkcjdlpgi)

Target: crm_imap_message (Header + Body-Excerpt + erkannte Customer-/Invoice-Refs)

Verwendung:
    cd VOD_Auctions/scripts
    source venv/bin/activate
    python3 imap_indexer.py --account frank@vod-records.com --probe         # Folder-Liste + Counts
    python3 imap_indexer.py --account frank@vod-records.com --folder INBOX  # Single Folder
    python3 imap_indexer.py --account frank@vod-records.com --full          # Alle Whitelist-Folder

Robin-Constraints (2026-05-03):
  - Folder-Whitelist: INBOX + Sent + Archive (KEIN Spam, KEIN Papierkorb)
  - BODY.PEEK[…] ZWINGEND — sonst wird \\Seen-Flag gesetzt
  - Body-Excerpt 5kb max
"""

from __future__ import annotations

import argparse
import imaplib
import os
import re
import ssl
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crm_staging_lib import pull_run, crm_log_progress, op_get  # noqa: E402

PARSER_VERSION = "v0.1-stub"

IMAP_HOST = "mail.your-server.de"
IMAP_PORT = 993

# Account → (Source-Tag, 1Password-Item-ID)
ACCOUNTS = {
    "frank@vod-records.com": {
        "source": "imap_vod_records",
        "op_item_id": "mfcjmrompkjjxap6il5nbsd7pa",
        "pipeline": "f1_imap",
    },
    "frank@vinyl-on-demand.com": {
        "source": "imap_vinyl_on_demand",
        "op_item_id": "7fos2enccq4p7moqnpkcjdlpgi",
        "pipeline": "f1_imap",
    },
}

# IMAP-Folder-Filter: arbeitet auf Folder-Flags (zuverlässiger als Name-Matching)
# Nehmen: INBOX selbst, \Sent-Flag, Archive-Pattern, weitere Sent-Varianten ohne Flag
# Skip: \Trash, \Junk, \Drafts, Spam-Pattern, Templates, Deleted, "Entw"-Drafts
FOLDER_SKIP_FLAGS = {"\\Trash", "\\Junk", "\\Drafts", "\\All", "\\Important", "\\Flagged"}
FOLDER_TAKE_FLAGS = {"\\Sent"}
FOLDER_TAKE_PATTERNS = [
    "INBOX",
    "INBOX.Archive",
    "INBOX.Sent",          # alle Sent-Varianten (Sent / Sent Messages / sent-mail)
    "INBOX.sent-mail",
]
FOLDER_SKIP_PATTERNS = [
    "INBOX.spambucket", "INBOX.Junk", "INBOX.Spam",
    "INBOX.Trash", "INBOX.Deleted",
    "INBOX.Drafts", "INBOX.Templates", "INBOX.Entw",
    "Papierkorb", "Gelöschte", "Gesendete Elemente.Junk",
]

# Regex für Customer-/Invoice-Ref-Detection
RE_ADR = re.compile(r"\bADR-\d{6}\b")
RE_INVOICE = re.compile(r"\b(?:RG|KR|PR|AR)-\d{4}-\d{6}\b")
RE_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")


def imap_connect(account: str):
    """IMAPS-Connect mit Cred-Lookup aus 1Password."""
    cfg = ACCOUNTS[account]
    pwd = op_get(cfg["op_item_id"], "Passwort")
    ctx = ssl.create_default_context()
    imap = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT, ssl_context=ctx)
    imap.login(account, pwd)
    return imap


def list_folders_filtered(imap) -> list[str]:
    """Liefert Folder-Liste, gefiltert per IMAP-Flag + Pattern.

    Strategie:
      1. Parse IMAP-LIST-Output zu (flags, name)-Pairs
      2. Skip wenn Folder einen FOLDER_SKIP_FLAGS-Flag hat (Trash/Junk/Drafts)
      3. Skip wenn Name mit FOLDER_SKIP_PATTERNS startet
      4. Take wenn Folder einen FOLDER_TAKE_FLAGS-Flag hat (Sent)
      5. Take wenn Name = oder mit FOLDER_TAKE_PATTERNS startet
    """
    import re as _re
    typ, data = imap.list()
    if typ != "OK":
        return []
    folders = []
    for raw in data:
        if raw is None:
            continue
        line = raw.decode() if isinstance(raw, bytes) else raw
        # Format: '(\HasChildren \Sent) "." "INBOX.Sent Messages"'
        m = _re.match(r"\(([^)]*)\)\s+\S+\s+(.+)$", line)
        if not m:
            continue
        flags_str, name_part = m.group(1), m.group(2).strip()
        flags = set(flags_str.split()) if flags_str else set()
        # Quote-stripping vom Namen
        name = name_part.strip()
        if name.startswith('"') and name.endswith('"'):
            name = name[1:-1]

        # Skip-Flags (\Trash, \Junk, \Drafts, \All etc.)
        if flags & FOLDER_SKIP_FLAGS:
            continue
        # Skip-Patterns (case-insensitive prefix-match)
        name_lower = name.lower()
        if any(name_lower.startswith(p.lower()) for p in FOLDER_SKIP_PATTERNS):
            continue
        # Take-Flags (\Sent)
        if flags & FOLDER_TAKE_FLAGS:
            folders.append(name)
            continue
        # Take-Patterns (exact oder als Parent-Folder)
        if any(name == p or name.startswith(p + ".") for p in FOLDER_TAKE_PATTERNS):
            folders.append(name)
            continue

    # Dedup-Pass: Sent-Aliase (Sent / Sent Messages) zeigen oft auf gleiche Mailbox.
    # Wenn `INBOX.Sent` UND `INBOX.Sent Messages` beide existieren, behalten wir nur den
    # mit \Sent-Flag (= preferred), da gleicher Storage. Das messen wir aber nicht hier;
    # erstmal alle behalten, der Indexer sieht via msg_uid + UIDVALIDITY ob Duplikate
    # bereits im selben Folder indexiert sind. UNIQUE(account, folder, msg_uid) verhindert
    # Cross-Folder-Dedup automatisch.
    return folders


def probe(account: str) -> None:
    """Stichproben-Probe: Folder + Mail-Counts."""
    imap = imap_connect(account)
    try:
        folders = list_folders_filtered(imap)
        print(f"[probe] {account} — whitelist-Folders: {folders}")
        for folder in folders:
            typ, data = imap.select(folder, readonly=True)   # readonly=True = doppelte Sicherheit
            if typ != "OK":
                print(f"  {folder}: SELECT failed")
                continue
            count = int(data[0]) if data and data[0] else 0
            print(f"  {folder}: {count} messages")
    finally:
        imap.logout()


def parse_email_header(name: str, value: str) -> tuple[str | None, str | None]:
    """Parse 'Display Name <email@dom.tld>' → (name, email_lower).

    Falls kein Email gefunden: (raw_value, None).
    """
    from email.utils import parseaddr
    if not value:
        return None, None
    n, addr = parseaddr(value)
    return (n or None), (addr.lower().strip() or None) if addr else (n or value, None)


def decode_header_value(value):
    """Robust Header-Decode für nicht-ASCII (Subject etc.)."""
    from email.header import decode_header, make_header
    if value is None:
        return None
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return value if isinstance(value, str) else value.decode("utf-8", errors="replace")


def extract_body_excerpt(msg, max_bytes: int = 5120) -> str:
    """Extrahiere ersten ~5kb plain-text Body. MIME-aware."""
    from email.iterators import body_line_iterator
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            if ctype == "text/plain":
                try:
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or "utf-8"
                        text = payload.decode(charset, errors="replace")
                        return text[:max_bytes]
                except Exception:
                    continue
        # Fallback: text/html stripped
        for part in msg.walk():
            if part.get_content_type() == "text/html":
                try:
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or "utf-8"
                        text = payload.decode(charset, errors="replace")
                        # Quick HTML strip
                        import re as _re
                        return _re.sub(r"<[^>]+>", " ", text)[:max_bytes]
                except Exception:
                    continue
        return ""
    # Single-part
    try:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            return payload.decode(charset, errors="replace")[:max_bytes]
    except Exception:
        pass
    return ""


def already_indexed_uids(conn_pg, account: str, folder: str) -> set[str]:
    cur = conn_pg.cursor()
    cur.execute(
        "SELECT msg_uid FROM crm_imap_message WHERE account=%s AND folder=%s",
        (account, folder),
    )
    result = {row[0] for row in cur.fetchall()}
    cur.close()
    return result


def index_folder(imap, conn_pg, run_id: str, account: str, folder: str) -> dict:
    """Indexiert einen IMAP-Folder via UID FETCH BODY.PEEK.

    KRITISCH: BODY.PEEK[…] — NIE BODY[…] — sonst wird \\Seen-Flag gesetzt.

    Konvention: source_record_id der erkannten Refs aus body_excerpt + headers,
    nicht volltext (Performance + 90d Anonymize).
    """
    import email
    from email.utils import parsedate_to_datetime
    import json

    typ, data = imap.select(folder, readonly=True)   # readonly = zusätzlicher Schutz
    if typ != "OK":
        return {"indexed": 0, "skipped": 0, "errors": 1, "error": "select failed"}
    msg_count = int(data[0]) if data and data[0] else 0

    # UIDVALIDITY für Inkrementell-Sync-Tracking
    typ, uv_data = imap.response("UIDVALIDITY")
    uid_validity = int(uv_data[0]) if (typ == "OK" and uv_data) else 0

    # Alle UIDs holen
    typ, uid_data = imap.uid("SEARCH", None, "ALL")
    if typ != "OK" or not uid_data or not uid_data[0]:
        return {"indexed": 0, "skipped": 0, "errors": 0, "msg_count": msg_count}
    all_uids = uid_data[0].decode().split()

    # Skip-already-indexed
    seen = already_indexed_uids(conn_pg, account, folder)
    new_uids = [u for u in all_uids if u not in seen]
    print(f"      [{folder}] {len(all_uids)} total, {len(seen)} already indexed, {len(new_uids)} new", flush=True)

    indexed = errors = 0
    cur = conn_pg.cursor()

    # Chunks à 200
    CHUNK = 200
    for ci in range(0, len(new_uids), CHUNK):
        chunk = new_uids[ci:ci + CHUNK]
        uid_set = ",".join(chunk)

        try:
            # BODY.PEEK[…] — kein \Seen-Flag wird gesetzt
            typ, fetch_data = imap.uid("FETCH", uid_set,
                                       "(UID BODY.PEEK[HEADER] BODY.PEEK[TEXT]<0.5120>)")
            if typ != "OK":
                errors += len(chunk)
                continue
        except Exception as e:
            print(f"      [{folder}] FETCH error chunk {ci}: {e}", flush=True)
            errors += len(chunk)
            continue

        # Pärchen aufdröseln: imaplib gibt Sequenz-of-Tuples zurück
        # Pattern: [(b'<seq> (UID <n> BODY[HEADER] {<size>}', b'<header-bytes>'), b')',
        #           (b'<seq> (UID <n> BODY[TEXT]<0> {<size>}', b'<body-bytes>'), b')', ...]
        # Wir parsen pragmatisch: nehme alle Bytestring-Tupel mit echtem Inhalt
        msgs_by_uid: dict[str, dict] = {}
        i = 0
        while i < len(fetch_data):
            entry = fetch_data[i]
            if isinstance(entry, tuple) and len(entry) == 2:
                meta_b, payload_b = entry
                meta = meta_b.decode(errors="replace") if isinstance(meta_b, bytes) else str(meta_b)
                # Extrahiere UID
                import re as _re
                m_uid = _re.search(r"UID (\d+)", meta)
                if m_uid:
                    uid = m_uid.group(1)
                    rec = msgs_by_uid.setdefault(uid, {})
                    if "BODY[HEADER]" in meta:
                        rec["header"] = payload_b
                    elif "BODY[TEXT]" in meta:
                        rec["body"] = payload_b
            i += 1

        for uid, parts in msgs_by_uid.items():
            try:
                header_bytes = parts.get("header", b"")
                body_bytes = parts.get("body", b"")

                # Header parsen
                hdr_msg = email.message_from_bytes(header_bytes)
                from_name, from_email = parse_email_header("From", hdr_msg.get("From"))
                to_raw = hdr_msg.get_all("To") or []
                cc_raw = hdr_msg.get_all("Cc") or []
                _rt_name, reply_to = parse_email_header("Reply-To", hdr_msg.get("Reply-To"))

                to_emails = []
                for raw in to_raw:
                    _, e = parse_email_header("To", raw)
                    if e:
                        to_emails.append(e)
                cc_emails = []
                for raw in cc_raw:
                    _, e = parse_email_header("Cc", raw)
                    if e:
                        cc_emails.append(e)

                subject = decode_header_value(hdr_msg.get("Subject"))
                msg_id_hdr = hdr_msg.get("Message-ID")

                # Date parsen
                date_hdr = hdr_msg.get("Date")
                date_dt = None
                try:
                    date_dt = parsedate_to_datetime(date_hdr) if date_hdr else None
                except Exception:
                    date_dt = None
                if date_dt is None:
                    # Fallback: jetzt (sollte selten passieren)
                    from datetime import datetime as _dt, timezone as _tz
                    date_dt = _dt.now(tz=_tz.utc)

                # Body decoden für Excerpt + Regex
                body_text = ""
                if body_bytes:
                    try:
                        # UTF-8 zuerst, sonst latin-1
                        body_text = body_bytes.decode("utf-8", errors="replace")
                    except Exception:
                        body_text = body_bytes.decode("latin-1", errors="replace")
                body_excerpt = body_text[:5120] if body_text else None

                # Regex-Detection auf Subject + Body
                search_text = (subject or "") + " " + body_text
                detected_emails = list(set(RE_EMAIL.findall(search_text)))
                detected_customer_refs = list(set(RE_ADR.findall(search_text)))
                detected_invoice_refs = list(set(RE_INVOICE.findall(search_text)))

                # Insert
                cur.execute(
                    """
                    INSERT INTO crm_imap_message (
                        pull_run_id, account, msg_uid, uid_validity, folder,
                        message_id_header, date_header, from_email, from_name,
                        to_emails, cc_emails, reply_to_email, subject,
                        body_excerpt,
                        detected_emails, detected_customer_refs, detected_invoice_refs,
                        raw_headers
                    ) VALUES (%s,%s,%s,%s,%s, %s,%s,%s,%s, %s,%s,%s,%s, %s, %s,%s,%s, %s)
                    ON CONFLICT (account, folder, msg_uid) DO UPDATE SET
                        pull_run_id = EXCLUDED.pull_run_id,
                        uid_validity = EXCLUDED.uid_validity,
                        body_excerpt = EXCLUDED.body_excerpt,
                        detected_emails = EXCLUDED.detected_emails,
                        detected_customer_refs = EXCLUDED.detected_customer_refs,
                        detected_invoice_refs = EXCLUDED.detected_invoice_refs,
                        indexed_at = NOW()
                    """,
                    (run_id, account, uid, uid_validity, folder,
                     msg_id_hdr, date_dt, from_email, from_name,
                     to_emails, cc_emails, reply_to, subject,
                     body_excerpt,
                     detected_emails, detected_customer_refs, detected_invoice_refs,
                     json.dumps(dict(hdr_msg.items())[:50] if False else {})),
                )
                indexed += 1
            except Exception as e:
                errors += 1
                print(f"      [{folder}] index error uid={uid}: {e}", flush=True)

        conn_pg.commit()
        print(f"      [{folder}] {indexed} indexed / {errors} errors (chunk {ci+len(chunk)}/{len(new_uids)})", flush=True)

    cur.close()
    return {
        "indexed": indexed,
        "skipped": len(seen),
        "errors": errors,
        "msg_count": msg_count,
        "uid_validity": uid_validity,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--account", required=True, choices=list(ACCOUNTS.keys()))
    ap.add_argument("--probe", action="store_true", help="Nur Folder-Liste + Counts (kein Index)")
    ap.add_argument("--folder", help="Nur dieser Folder")
    ap.add_argument("--full", action="store_true", help="Alle Whitelist-Folder indexieren")
    args = ap.parse_args()

    if args.probe:
        probe(args.account)
        return

    if not args.full and not args.folder:
        ap.error("--probe, --folder NAME oder --full angeben")

    cfg = ACCOUNTS[args.account]
    imap = imap_connect(args.account)
    try:
        folders = [args.folder] if args.folder else list_folders_filtered(imap)
        print(f"[f1_imap] {args.account} — folders to index: {folders}")

        with pull_run(cfg["source"], cfg["pipeline"], parser_version=PARSER_VERSION,
                      notes=f"account={args.account} folders={folders}") as (run_id, conn_pg):
            total_indexed = 0
            total_skipped = 0
            for folder in folders:
                stats = index_folder(imap, conn_pg, run_id, args.account, folder)
                total_indexed += stats.get("indexed", 0)
                total_skipped += stats.get("skipped", 0)
                conn_pg.commit()
                print(f"  {folder}: {stats}")
            crm_log_progress(conn_pg, run_id, rows_inserted=total_indexed, rows_skipped=total_skipped)
    finally:
        imap.logout()


if __name__ == "__main__":
    main()
