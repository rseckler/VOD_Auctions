"""IMAP Body-Backfill — fügt body_excerpt für existing crm_imap_message-Rows nach.

Bug-Fix: Original-Indexer parst BODY[TEXT]-Tuple in der imaplib-FETCH-Response
nicht korrekt → 100% body_excerpt=NULL bei 153k Mails. Statt Re-Index der
ganzen Mailbox ziehen wir nur die TEXT-Section nach (separater FETCH-Call).

Plus: Recompute der detected_emails / detected_customer_refs / detected_invoice_refs
auf Subject + Body.

Args:
    --account <email>      e.g. frank@vod-records.com (default: alle)
    --folder <name>        e.g. INBOX (default: alle)
    --batch-size <n>       default 100
    --max-mails <n>        default unlimited
    --dry-run              fetch + parse, kein DB-update

Run via SSH-Tunnel oder direkt auf VPS mit IMAP-Credentials in 1Password.
"""
from __future__ import annotations
import os
import sys
import re
import email
import imaplib
import argparse
import time
import psycopg2
import psycopg2.extras
from email.header import decode_header
from pathlib import Path

# Bootstrap .env
HERE = Path(__file__).resolve().parent
for env_file in (HERE / ".env", HERE.parent / "backend" / ".env"):
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

DB_URL = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
if not DB_URL:
    print("[backfill] SUPABASE_DB_URL not set", file=sys.stderr)
    sys.exit(1)

# IMAP-Credentials aus 1Password — gleiche IDs wie imap_indexer.py
def op_get(item: str, field: str) -> str | None:
    import subprocess
    try:
        out = subprocess.run(
            ["op", "item", "get", item, "--fields", field, "--reveal"],
            capture_output=True, text=True, timeout=15,
        )
        if out.returncode == 0:
            return out.stdout.strip()
    except FileNotFoundError:
        pass
    return None


IMAP_HOST = "mail.your-server.de"
IMAP_PORT = 993

IMAP_CONFIGS = {
    "frank@vod-records.com": {
        "op_item": "mfcjmrompkjjxap6il5nbsd7pa",
        "op_field": "Passwort",
    },
    "frank@vinyl-on-demand.com": {
        "op_item": "7fos2enccq4p7moqnpkcjdlpgi",
        "op_field": "Passwort",
    },
}


# Regex für Detection
RE_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
RE_ADR = re.compile(r"\bADR-\d{4,7}\b")
RE_INVOICE = re.compile(r"\b(?:RG|KR|PR|AB)-?\d{4,8}\b")


ENV_KEY_FOR = {
    "frank@vod-records.com": "IMAP_PASSWORD_VOD_RECORDS",
    "frank@vinyl-on-demand.com": "IMAP_PASSWORD_VINYL_ON_DEMAND",
}

def imap_connect(account: str) -> imaplib.IMAP4_SSL:
    import ssl
    cfg = IMAP_CONFIGS[account]
    # Reihenfolge: ENV-Var (für VPS) → 1Password CLI (für Mac)
    pwd = os.environ.get(ENV_KEY_FOR.get(account, ""))
    if not pwd:
        pwd = op_get(cfg["op_item"], cfg["op_field"])
    if not pwd:
        raise RuntimeError(
            f"No IMAP password for {account}. Set {ENV_KEY_FOR.get(account, 'IMAP_PASSWORD_*')} "
            "as env var or in scripts/.env, or install op-CLI."
        )

    print(f"[backfill] Connecting {IMAP_HOST}:{IMAP_PORT} as {account}", flush=True)
    ctx = ssl.create_default_context()
    imap = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT, ssl_context=ctx)
    imap.login(account, pwd)
    return imap


def select_folder_readonly(imap: imaplib.IMAP4_SSL, folder: str) -> None:
    # Quote folder if has spaces
    if " " in folder:
        imap.select(f'"{folder}"', readonly=True)
    else:
        imap.select(folder, readonly=True)


def fetch_bodies_for_uids(
    imap: imaplib.IMAP4_SSL,
    uids: list[str],
) -> dict[str, str]:
    """Fetcht für eine UID-Liste die ersten 5120 Bytes von BODY[TEXT].

    Returns {uid: body_text}
    """
    if not uids:
        return {}
    uid_set = ",".join(uids)
    try:
        typ, data = imap.uid("FETCH", uid_set, "(BODY.PEEK[TEXT]<0.5120>)")
    except Exception as e:
        print(f"[backfill] FETCH error: {e}", file=sys.stderr)
        return {}
    if typ != "OK":
        return {}

    results: dict[str, str] = {}
    # Pattern: [(b'<seq> (UID <n> BODY[TEXT]<0> {<size>}', b'<body-bytes>'), b')']
    # Bei nur EINER Section pro Mail ist das stable
    for entry in data:
        if isinstance(entry, tuple) and len(entry) == 2:
            meta_b, payload_b = entry
            meta = meta_b.decode(errors="replace") if isinstance(meta_b, bytes) else str(meta_b)
            m_uid = re.search(r"UID (\d+)", meta)
            if m_uid and isinstance(payload_b, (bytes, bytearray)):
                uid = m_uid.group(1)
                try:
                    text = payload_b.decode("utf-8", errors="replace")
                except Exception:
                    text = payload_b.decode("latin-1", errors="replace")
                results[uid] = text
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--account", default=None)
    ap.add_argument("--folder", default=None)
    ap.add_argument("--batch-size", type=int, default=100)
    ap.add_argument("--max-mails", type=int, default=0)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False

    # Bestimme welche (account, folder)-Kombos zu processen sind
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT account, folder, COUNT(*)
            FROM crm_imap_message
            WHERE body_excerpt IS NULL
            GROUP BY account, folder
            ORDER BY account, folder
            """
        )
        all_combos = cur.fetchall()

    target_combos = [
        (a, f, n) for (a, f, n) in all_combos
        if (not args.account or a == args.account)
        and (not args.folder or f == args.folder)
    ]

    print(f"[backfill] {len(target_combos)} (account, folder) combos to process:", flush=True)
    for a, f, n in target_combos:
        print(f"  {a:30s} · {f:30s} · {n:>7} mails", flush=True)

    total_processed = 0
    total_updated = 0

    for account, folder, n_mails in target_combos:
        if account not in IMAP_CONFIGS:
            print(f"[backfill] Skipping unknown account {account}", flush=True)
            continue

        if args.max_mails and total_processed >= args.max_mails:
            break

        try:
            imap = imap_connect(account)
        except Exception as e:
            print(f"[backfill] Cannot connect {account}: {e}", file=sys.stderr)
            continue

        try:
            print(f"\n[backfill] === {account} / {folder} ({n_mails} mails) ===", flush=True)
            select_folder_readonly(imap, folder)

            # Iteriere in Batches durch alle Mails ohne Body
            offset = 0
            while True:
                if args.max_mails and total_processed >= args.max_mails:
                    break

                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute(
                        """
                        SELECT id, msg_uid, subject
                        FROM crm_imap_message
                        WHERE account = %s AND folder = %s AND body_excerpt IS NULL
                        ORDER BY date_header DESC
                        LIMIT %s OFFSET %s
                        """,
                        (account, folder, args.batch_size, offset),
                    )
                    rows = cur.fetchall()
                if not rows:
                    break

                uid_to_id = {r["msg_uid"]: (r["id"], r["subject"]) for r in rows}
                uids = list(uid_to_id.keys())

                t0 = time.time()
                bodies = fetch_bodies_for_uids(imap, uids)
                fetch_time = time.time() - t0

                if not bodies:
                    print(f"[backfill] No bodies returned for batch (offset={offset}, n={len(uids)}). Skipping batch + advancing offset.", flush=True)
                    offset += args.batch_size
                    total_processed += len(uids)
                    continue

                if args.dry_run:
                    sample_uid = list(bodies.keys())[0]
                    print(f"[backfill] DRY: {len(bodies)}/{len(uids)} bodies got, fetch={fetch_time:.1f}s. Sample uid={sample_uid}, len={len(bodies[sample_uid])}", flush=True)
                    print(f"[backfill] DRY Sample preview: {bodies[sample_uid][:200]!r}", flush=True)
                else:
                    # Update DB
                    with conn.cursor() as cur:
                        for uid, body_text in bodies.items():
                            row_id, subject = uid_to_id[uid]
                            search_text = (subject or "") + " " + body_text
                            detected_emails = list(set(RE_EMAIL.findall(search_text)))
                            detected_adr = list(set(RE_ADR.findall(search_text)))
                            detected_inv = list(set(RE_INVOICE.findall(search_text)))
                            cur.execute(
                                """
                                UPDATE crm_imap_message
                                SET body_excerpt = %s,
                                    detected_emails = %s,
                                    detected_customer_refs = %s,
                                    detected_invoice_refs = %s
                                WHERE id = %s
                                """,
                                (body_text[:5120], detected_emails, detected_adr, detected_inv, row_id),
                            )
                        conn.commit()
                    total_updated += len(bodies)

                total_processed += len(uids)
                print(f"[backfill] {account}/{folder} batch n={len(uids)} bodies={len(bodies)} fetch={fetch_time:.1f}s · running total: processed={total_processed} updated={total_updated}", flush=True)

                # Wenn nicht dry-run: offset ist 0 weil wir die ge-updateten Rows beim nächsten Query nicht mehr sehen (body_excerpt IS NULL filter)
                if args.dry_run:
                    offset += args.batch_size
                # Sonst: bleib bei offset=0, weil die updated rows raus sind aus der WHERE-Clause

        finally:
            try:
                imap.logout()
            except Exception:
                pass

    conn.close()
    print(f"\n[backfill] DONE · processed={total_processed} updated={total_updated}", flush=True)


if __name__ == "__main__":
    main()
