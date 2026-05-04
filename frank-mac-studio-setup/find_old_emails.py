#!/usr/bin/env python3
"""find_old_emails — Pure-stdlib Email-Archiv-Scanner für Franks Mac Studio.

Findet alte E-Mails in:
  - ~/Library/Mail/V*/...                            (Apple Mail, klassisch)
  - ~/Library/Containers/com.apple.mail/Data/Library/Mail/V*/...  (Apple Mail sandboxed)
  - Beliebige externe Volumes (z.B. /Volumes/VOD BIGRAID/)

Erkennt File-Formate:
  - .emlx          (Apple Mail individual message — RFC822 mit Byte-Count-Header)
  - .eml           (Standard MIME message)
  - .mbox          (Unix mailbox flat-file)
  - mbox/-Packages (Apple Mail folder packages werden via .emlx innerhalb gefunden)

Outputs:
  - <output>.tsv           — Lightweight catalog: pfad, format, year, headers,
                             vod_relevant — für Sanity-Check
  - <output>.jsonl.gz      — Full export der VOD-relevanten Mails mit Body (gzipped),
                             ready zum Import ins CRM. Datenvolumen ~10-50MB für
                             ~10k Mails.

Pro Mail wird minimal-Header geparsed (Date, From, To, Subject) und ein
TSV-Eintrag erzeugt. VOD-relevante Mails (vinyl-on-demand.com / vod-records.com
in From/To/Cc) werden mit "YES" markiert UND der vollständige Body wird in
JSONL exportiert.

Pure stdlib — keine Dependencies (läuft auf Franks /usr/bin/python3 ohne pip).
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
import sys
from email import message_from_bytes
from email.parser import HeaderParser
from email.utils import parsedate_to_datetime
from pathlib import Path

VOD_DOMAINS = ("vinyl-on-demand.com", "vod-records.com", "vodrecords")

SKIP_DIR_PREFIXES = (".", "__pycache__")
SKIP_FILE_PREFIXES = (".",)
MIN_SIZE = 100             # Bytes — kleiner ist Müll
MAX_SIZE = 50 * 1024 * 1024  # 50MB — größer ist kein single message


def parse_eml_emlx(path: Path) -> dict | None:
    """Extrahiert minimal-Header. Liest nur die ersten 64KB."""
    try:
        with path.open("rb") as f:
            data = f.read(64 * 1024)
    except OSError:
        return None

    # .emlx: erste Zeile ist Byte-Count
    if path.suffix.lower() == ".emlx":
        nl = data.find(b"\n")
        if 0 < nl < 16:
            try:
                int(data[:nl].strip())
                data = data[nl + 1:]
            except ValueError:
                pass

    try:
        text = data.decode("utf-8", errors="replace")
    except Exception:
        return None

    parser = HeaderParser()
    try:
        headers = parser.parsestr(text)
    except Exception:
        return None

    return {
        "date": (headers.get("Date") or "").strip(),
        "from": (headers.get("From") or "").strip(),
        "to": (headers.get("To") or "").strip(),
        "cc": (headers.get("Cc") or "").strip(),
        "subject": (headers.get("Subject") or "").strip(),
    }


def extract_full_message(path: Path) -> dict | None:
    """Liest die ganze Datei + extrahiert Headers + best-effort plain-text body.

    Used für VOD-relevante Mails — wir wollen den Body für CRM-Import.
    Body wird auf max. 200 KB pro Mail gekappt (sehr lange Threads).
    """
    try:
        size = path.stat().st_size
    except OSError:
        return None
    if size > MAX_SIZE:
        return None
    try:
        with path.open("rb") as f:
            data = f.read()
    except OSError:
        return None

    if path.suffix.lower() == ".emlx":
        nl = data.find(b"\n")
        if 0 < nl < 16:
            try:
                int(data[:nl].strip())
                data = data[nl + 1:]
            except ValueError:
                pass

    try:
        msg = message_from_bytes(data)
    except Exception:
        return None

    body_parts: list[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            if ctype == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    try:
                        body_parts.append(payload.decode(charset, errors="replace"))
                    except (LookupError, UnicodeDecodeError):
                        body_parts.append(payload.decode("utf-8", errors="replace"))
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            try:
                body_parts.append(payload.decode(charset, errors="replace"))
            except (LookupError, UnicodeDecodeError):
                body_parts.append(payload.decode("utf-8", errors="replace"))

    body = "\n\n".join(body_parts).strip()
    if len(body) > 200 * 1024:
        body = body[: 200 * 1024] + "\n\n[...truncated]"

    # Minimal Header-Set + Body. Plus message-id (für dedup).
    return {
        "date": (msg.get("Date") or "").strip(),
        "message_id": (msg.get("Message-ID") or msg.get("Message-Id") or "").strip(),
        "from": (msg.get("From") or "").strip(),
        "to": (msg.get("To") or "").strip(),
        "cc": (msg.get("Cc") or "").strip(),
        "reply_to": (msg.get("Reply-To") or "").strip(),
        "subject": (msg.get("Subject") or "").strip(),
        "body": body,
    }


def is_vod_relevant(h: dict | None) -> bool:
    if not h:
        return False
    for fld in ("from", "to", "cc"):
        v = (h.get(fld) or "").lower()
        for dom in VOD_DOMAINS:
            if dom in v:
                return True
    return False


def year_from(h: dict | None) -> int | None:
    if not h or not h.get("date"):
        return None
    try:
        d = parsedate_to_datetime(h["date"])
        return d.year if d else None
    except Exception:
        return None


def detect_mbox(path: Path) -> bool:
    """Quick-Check ob File ein mbox ist (startet mit 'From ' line)."""
    try:
        with path.open("rb") as f:
            head = f.read(16)
        return head.startswith(b"From ")
    except OSError:
        return False


def safe_str(s: str, maxlen: int = 80) -> str:
    """TSV-safe: replace tab/newline, truncate."""
    return s.replace("\t", " ").replace("\n", " ").replace("\r", " ")[:maxlen]


def scan_root(root: Path, out_writer, jsonl_writer, counters: dict) -> None:
    """Walk root, write TSV pro found mail + JSONL für VOD-relevante mit Body."""
    print(f"\n=== Scanning: {root} ===", flush=True)
    last_progress = 0

    for dirpath, dirnames, filenames in os.walk(str(root), followlinks=False):
        # Skip versteckte / cache-Verzeichnisse
        dirnames[:] = [d for d in dirnames if not d.startswith(SKIP_DIR_PREFIXES)]

        for fn in filenames:
            if fn.startswith(SKIP_FILE_PREFIXES):
                continue

            full = Path(dirpath) / fn
            ext = full.suffix.lower()

            fmt = None
            if ext == ".emlx":
                fmt = "emlx"
            elif ext == ".eml":
                fmt = "eml"
            elif ext == ".mbox" and full.is_file():
                fmt = "mbox"
            elif fn == "mbox" and full.is_file() and detect_mbox(full):
                # Maildir-style mbox plain file
                fmt = "mbox"

            if fmt is None:
                continue

            try:
                size = full.stat().st_size
            except OSError:
                continue
            if size < MIN_SIZE or size > MAX_SIZE:
                continue

            headers = parse_eml_emlx(full)
            yr = year_from(headers)
            rel = is_vod_relevant(headers)

            counters[fmt] = counters.get(fmt, 0) + 1
            if rel:
                counters["vod_relevant"] += 1
            if yr:
                counters["with_date"] += 1

            row = "\t".join([
                str(full),
                fmt,
                str(yr) if yr else "",
                safe_str(headers.get("from", "") if headers else "", 100),
                safe_str(headers.get("to", "") if headers else "", 100),
                safe_str(headers.get("subject", "") if headers else "", 120),
                "YES" if rel else "no",
            ])
            out_writer.write(row + "\n")

            # JSONL-Export NUR für VOD-relevant (sonst zu viel Datenvolumen)
            if rel and jsonl_writer is not None:
                full_msg = extract_full_message(full)
                if full_msg:
                    record = {
                        "path": str(full),
                        "format": fmt,
                        "year": yr,
                        "size_bytes": size,
                        **full_msg,
                    }
                    try:
                        jsonl_writer.write(
                            (json.dumps(record, ensure_ascii=False) + "\n").encode("utf-8")
                        )
                        counters["jsonl_exported"] += 1
                    except Exception as e:
                        print(f"  [jsonl-write-err] {full}: {e}", file=sys.stderr)

            total = sum(v for k, v in counters.items() if k in ("eml", "emlx", "mbox"))
            if total - last_progress >= 2000:
                last_progress = total
                print(f"  scanned {total} mails so far ({counters['vod_relevant']} VOD-relevant, "
                      f"{counters['jsonl_exported']} body-exported)", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser(description="Scan filesystem for legacy email archives")
    ap.add_argument("--root", action="append", required=True,
                    help="Root directory to scan (kann mehrfach gesetzt werden)")
    ap.add_argument("--output", required=True, help="TSV output path")
    ap.add_argument("--jsonl", default=None,
                    help="JSONL.gz path für VOD-relevant Mails mit Body (optional)")
    args = ap.parse_args()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    jsonl_path = Path(args.jsonl).expanduser() if args.jsonl else None
    if jsonl_path:
        jsonl_path.parent.mkdir(parents=True, exist_ok=True)

    counters = {"eml": 0, "emlx": 0, "mbox": 0,
                "vod_relevant": 0, "with_date": 0, "jsonl_exported": 0}

    f = output.open("w", encoding="utf-8")
    jsonl_writer = gzip.open(str(jsonl_path), "wb") if jsonl_path else None

    try:
        f.write("path\tformat\tyear\tfrom\tto\tsubject\tvod_relevant\n")
        for r in args.root:
            p = Path(r).expanduser()
            if not p.exists():
                print(f"  skip (does not exist): {p}", file=sys.stderr)
                continue
            try:
                scan_root(p, f, jsonl_writer, counters)
            except KeyboardInterrupt:
                print("\n  interrupted, partial output saved", file=sys.stderr)
                break
    finally:
        f.close()
        if jsonl_writer is not None:
            jsonl_writer.close()

    print()
    print("=== SCAN COMPLETE ===")
    print(f"  TSV:               {output}")
    if jsonl_path:
        try:
            jsonl_size = jsonl_path.stat().st_size if jsonl_path.exists() else 0
            jsonl_mb = jsonl_size / (1024 * 1024)
            print(f"  JSONL.gz:          {jsonl_path}  ({jsonl_mb:.1f} MB)")
        except OSError:
            print(f"  JSONL.gz:          {jsonl_path}")
    print(f"  .emlx files:       {counters['emlx']:>6}")
    print(f"  .eml files:        {counters['eml']:>6}")
    print(f"  mbox files:        {counters['mbox']:>6}")
    print(f"  with date:         {counters['with_date']:>6}")
    print(f"  VOD-relevant:      {counters['vod_relevant']:>6}")
    if jsonl_path:
        print(f"  Body-exported:     {counters['jsonl_exported']:>6}")
    total = counters['eml'] + counters['emlx'] + counters['mbox']
    if total > 0 and counters['vod_relevant'] > 0:
        print(f"\n  → {counters['vod_relevant']} VOD-relevante Mails gefunden.")
        if jsonl_path:
            print(f"  → JSONL.gz an Robin senden (z.B. via WeTransfer/iCloud).")
            print(f"     Robin importiert → ~{counters['vod_relevant']} neue mail-rows in crm_imap_message.")
    elif total == 0:
        print("  → 0 Mails gefunden. Volumes-Selection prüfen.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
