"""IMAP PDF Inventory — was steckt an PDF-Anhängen in Frank's Mailboxen?

Sample-Run (read-only, no DB-write):
- Iteriert ausgewählte Folders (z.B. Sent)
- FETCH BODYSTRUCTURE pro Mail
- Counts: mails_with_pdf, total_pdf_count, size, distinct senders/recipients
- Sample 10 PDF-Filenames für Pattern-Erkennung

Usage on VPS:
    cd ~/VOD_Auctions/scripts && source venv/bin/activate
    python3 imap_pdf_inventory.py --account frank@vod-records.com --folder INBOX.Sent --max-mails 1000
"""
from __future__ import annotations
import os
import sys
import re
import imaplib
import argparse
import ssl
from pathlib import Path

HERE = Path(__file__).resolve().parent
for env_file in (HERE / ".env",):
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

IMAP_HOST = "mail.your-server.de"
IMAP_PORT = 993
ENV_KEY_FOR = {
    "frank@vod-records.com": "IMAP_PASSWORD_VOD_RECORDS",
    "frank@vinyl-on-demand.com": "IMAP_PASSWORD_VINYL_ON_DEMAND",
}


def imap_connect(account: str) -> imaplib.IMAP4_SSL:
    pwd = os.environ.get(ENV_KEY_FOR.get(account, ""))
    if not pwd:
        raise RuntimeError(f"No IMAP password for {account} in env")
    print(f"[inv] Connecting {IMAP_HOST}:{IMAP_PORT} as {account}", flush=True)
    ctx = ssl.create_default_context()
    imap = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT, ssl_context=ctx)
    imap.login(account, pwd)
    return imap


def parse_bodystructure(s: str) -> list[dict]:
    """Extracts info about all parts in BODYSTRUCTURE response.

    Returns list of dicts with keys: part_no, mime_type, filename, size_bytes.
    Pragmatic regex-based — doesn't handle every edge case but works for
    common multipart/mixed structures with PDF attachments.
    """
    parts: list[dict] = []
    # Find all (sub)entries that look like ("application" "pdf" ... "filename" "X.pdf" ...)
    pdf_re = re.compile(
        r'\("application"\s+"pdf".*?\("(?:name|filename)"\s+"([^"]+)"',
        re.IGNORECASE | re.DOTALL,
    )
    octet_re = re.compile(
        r'\("application"\s+"octet-stream".*?\("(?:name|filename)"\s+"([^"]+\.pdf)"',
        re.IGNORECASE | re.DOTALL,
    )
    for m in pdf_re.finditer(s):
        parts.append({"mime": "application/pdf", "filename": m.group(1)})
    for m in octet_re.finditer(s):
        parts.append({"mime": "application/octet-stream", "filename": m.group(1)})
    return parts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--account", required=True)
    ap.add_argument("--folder", required=True)
    ap.add_argument("--max-mails", type=int, default=1000)
    args = ap.parse_args()

    imap = imap_connect(args.account)
    try:
        folder = args.folder
        if " " in folder:
            imap.select(f'"{folder}"', readonly=True)
        else:
            imap.select(folder, readonly=True)

        typ, data = imap.uid("SEARCH", None, "ALL")
        if typ != "OK":
            print(f"[inv] SEARCH failed", file=sys.stderr)
            return 1
        all_uids = data[0].split()
        sample_uids = all_uids[-args.max_mails:] if len(all_uids) > args.max_mails else all_uids
        print(f"[inv] {len(all_uids)} total mails, sampling last {len(sample_uids)}", flush=True)

        mails_with_pdf = 0
        total_pdfs = 0
        sample_filenames: list[str] = []

        # Chunk-FETCH BODYSTRUCTURE
        CHUNK = 100
        for i in range(0, len(sample_uids), CHUNK):
            batch = sample_uids[i:i + CHUNK]
            uid_set = b",".join(batch).decode()
            typ, data = imap.uid("FETCH", uid_set, "(BODYSTRUCTURE)")
            if typ != "OK":
                continue
            for item in data:
                if not isinstance(item, bytes):
                    continue
                s = item.decode(errors="replace")
                pdfs = parse_bodystructure(s)
                if pdfs:
                    mails_with_pdf += 1
                    total_pdfs += len(pdfs)
                    for p in pdfs:
                        if len(sample_filenames) < 30:
                            sample_filenames.append(p["filename"])

        print(f"\n[inv] === Result ===", flush=True)
        print(f"[inv] Sampled mails: {len(sample_uids)}")
        print(f"[inv] Mails with ≥1 PDF: {mails_with_pdf} ({100 * mails_with_pdf / max(len(sample_uids), 1):.1f}%)")
        print(f"[inv] Total PDF attachments: {total_pdfs}")
        print(f"\n[inv] Sample filenames:")
        for f in sample_filenames[:30]:
            print(f"  {f}")

    finally:
        try: imap.logout()
        except Exception: pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
