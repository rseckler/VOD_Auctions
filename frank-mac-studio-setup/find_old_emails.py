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

Pro Mail wird minimal-Header geparsed (Date, From, To, Subject) und ein
TSV-Eintrag erzeugt. VOD-relevante Mails (vinyl-on-demand.com / vod-records.com
in From/To/Cc) werden mit "YES" markiert.

Pure stdlib — keine Dependencies (läuft auf Franks /usr/bin/python3 ohne pip).
"""
from __future__ import annotations

import argparse
import os
import sys
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


def scan_root(root: Path, out_writer, counters: dict) -> None:
    """Walk root, write TSV-Zeilen pro found mail."""
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

            total = sum(v for k, v in counters.items() if k in ("eml", "emlx", "mbox"))
            if total - last_progress >= 2000:
                last_progress = total
                print(f"  scanned {total} mails so far ({counters['vod_relevant']} VOD-relevant)",
                      flush=True)


def main() -> int:
    ap = argparse.ArgumentParser(description="Scan filesystem for legacy email archives")
    ap.add_argument("--root", action="append", required=True,
                    help="Root directory to scan (kann mehrfach gesetzt werden)")
    ap.add_argument("--output", required=True, help="TSV output path")
    args = ap.parse_args()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    counters = {"eml": 0, "emlx": 0, "mbox": 0, "vod_relevant": 0, "with_date": 0}

    with output.open("w", encoding="utf-8") as f:
        f.write("path\tformat\tyear\tfrom\tto\tsubject\tvod_relevant\n")
        for r in args.root:
            p = Path(r).expanduser()
            if not p.exists():
                print(f"  skip (does not exist): {p}", file=sys.stderr)
                continue
            try:
                scan_root(p, f, counters)
            except KeyboardInterrupt:
                print("\n  interrupted, partial output saved", file=sys.stderr)
                break

    print()
    print("=== SCAN COMPLETE ===")
    print(f"  TSV:           {output}")
    print(f"  .emlx files:   {counters['emlx']:>6}")
    print(f"  .eml files:    {counters['eml']:>6}")
    print(f"  mbox files:    {counters['mbox']:>6}")
    print(f"  with date:     {counters['with_date']:>6}")
    print(f"  VOD-relevant:  {counters['vod_relevant']:>6}")
    total = counters['eml'] + counters['emlx'] + counters['mbox']
    if total > 0 and counters['vod_relevant'] > 0:
        print(f"  → {counters['vod_relevant']} VOD-relevante Mails. TSV oben checken,")
        print(f"    dann Robin → Import nach crm_imap_message Pipeline.")
    elif total == 0:
        print("  → 0 Mails gefunden. Volumes-Selection prüfen.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
