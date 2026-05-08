#!/usr/bin/env python3
"""import_legacy_mails_v3 — Bulk-INSERT, isoliert pro Batch, mit Test-Suite.

Ersetzt v1 (Per-Row-Dedup, in Statement-Timeouts gelaufen) und v2 (Bulk-Comment
aber row-by-row INSERT, mid-loop rollback verlor bestätigten Progress).

Was v3 anders macht:
  - Echter Bulk-INSERT via psycopg2.extras.execute_values mit RETURNING id
    (eine SQL-Roundtrip pro Batch, exakter Insert-Count via len(returning))
  - Per-Batch isolierte Transactions: bei Exception nur dieser Batch verloren,
    nicht der bisherige Run-Progress
  - In-Batch-Dedup auf message_id_header VOR INSERT (Postgres-Limit: gleicher
    Conflict-Key darf in einem ON CONFLICT-Statement nicht zweimal vorkommen)
  - Pre-flight refused-to-start ohne UNIQUE-Index idx_crm_imap_message_msgid_unique

Was v3 von v2 übernimmt:
  - Tier-aware Knobs (load_tier.py: low/medium/high)
  - State-File für Resume nach Crash / Time-Box
  - Pre-flight: parallel legacy_sync_v2 → skip
  - atexit + signal-Handler für saubere pull_run-Finalisierung
  - Connection-Recycle alle N Batches
  - Statement-Timeout + Backoff/Skip

CLI:
  --jsonl PATH                  Pfad zur JSONL.gz (required)
  --load-tier {low,medium,high} Override (default: DB → ENV → 'medium')
  --max-runtime SECS            Override Time-Box (default: aus tier config)
  --state-file PATH             Override State-File-Pfad
  --pull-run-id UUID            Resume specific run (default: neuer Run)
  --limit N                     Nur N Records prozessieren (Smoke-Test)
  --no-preflight                Skip parallel-job + Index-Check (NUR Tests)
"""
from __future__ import annotations

import argparse
import atexit
import gzip
import hashlib
import json
import os
import re
import signal
import sys
import time
from datetime import datetime
from email.utils import parsedate_to_datetime, getaddresses
from pathlib import Path
from typing import Any, Iterable

sys.path.insert(0, str(Path(__file__).parent))
from shared import get_pg_connection, _ensure_psycopg2  # noqa: E402
from load_tier import get_active_tier, get_mail_import_config  # noqa: E402

PARSER_VERSION = "3.0"
SOURCE_TAG = "legacy_mail_archive"
PIPELINE_TAG = "import_legacy_mails_v3"

VOD_RECORDS_DOMAIN = "vod-records.com"
VOD_DEMAND_DOMAIN = "vinyl-on-demand.com"

EMAIL_RE = re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b")

DEFAULT_STATE_FILE = "/tmp/import_legacy_mails_v3.state.json"
DONE_MARKER = Path("/tmp/import_legacy_mails_v3.done")


# ─── Pure Helpers (keine DB, getestet in import_legacy_mails_v3_test.py) ─────


def derive_account(from_str: str, to_str: str) -> str:
    blob = f"{from_str or ''} {to_str or ''}".lower()
    if VOD_DEMAND_DOMAIN in blob:
        return f"frank@{VOD_DEMAND_DOMAIN}"
    if VOD_RECORDS_DOMAIN in blob:
        return f"frank@{VOD_RECORDS_DOMAIN}"
    return "unknown"


def parse_addresses(addr_str: str) -> tuple[list[str], list[str]]:
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
    if not body:
        return []
    found = EMAIL_RE.findall(body)
    seen: list[str] = []
    for e in found:
        e_lower = e.lower()
        if e_lower not in seen:
            seen.append(e_lower)
        if len(seen) >= max_count:
            break
    return seen


def make_msg_id(rec: dict) -> str:
    msg_id = rec.get("message_id") or ""
    if msg_id:
        return msg_id
    seed = f"{rec.get('subject','')}|{rec.get('date','')}|{rec.get('from','')}"
    return "synthetic:" + hashlib.sha256(seed.encode()).hexdigest()[:16]


def strip_nul(s: str | None) -> str | None:
    """Postgres TEXT-Spalten lehnen NUL-Bytes (0x00) ab; emlx/Outlook-Mails
    enthalten gelegentlich welche im Body/Subject. Strippen ist die einzige
    Option — die Bytes sind in keinem realen Mail-Inhalt sinnvoll."""
    if s is None:
        return None
    return s.replace("\x00", "")


def parse_record(rec: dict) -> dict | None:
    """Returnt parsed record, None wenn skip wegen no-date."""
    msg_id = strip_nul(make_msg_id(rec))
    date_header = parse_iso_date(rec.get("date", ""))
    if not date_header:
        return None

    from_emails, from_names = parse_addresses(rec.get("from", ""))
    to_emails, _ = parse_addresses(rec.get("to", ""))
    cc_emails, _ = parse_addresses(rec.get("cc", ""))
    body = strip_nul(rec.get("body")) or ""
    body_excerpt = body[:5000] if body else None
    detected = extract_emails_from_body(body)
    fake_uid = "legacy:" + hashlib.sha256(msg_id.encode()).hexdigest()[:24]

    return {
        "msg_id": msg_id,
        "date_header": date_header,
        "account": derive_account(rec.get("from", ""), rec.get("to", "")),
        "msg_uid": fake_uid,
        "from_email": strip_nul(from_emails[0]) if from_emails else None,
        "from_name": strip_nul(from_names[0]) if from_names else None,
        "to_emails": [strip_nul(e) for e in to_emails],
        "cc_emails": [strip_nul(e) for e in cc_emails],
        "subject": strip_nul((rec.get("subject") or "")[:500]) or None,
        "body_excerpt": body_excerpt,
        "detected_emails": detected,
    }


def dedup_in_batch(parsed: Iterable[dict]) -> list[dict]:
    """Pre-INSERT in-batch dedup auf msg_id (Postgres ON CONFLICT erlaubt
    keine doppelten Conflict-Keys im selben VALUES-Set)."""
    seen: set[str] = set()
    out: list[dict] = []
    for p in parsed:
        if p["msg_id"] in seen:
            continue
        seen.add(p["msg_id"])
        out.append(p)
    return out


# ─── State-File ──────────────────────────────────────────────────────────────


class State:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.last_line = 0
        self.pull_run_id: str | None = None
        self.started_at: str | None = None
        self.counts = {
            "inserted": 0,
            "skipped_in_batch_dup": 0,
            "skipped_db_dup": 0,
            "skipped_no_date": 0,
            "skipped_error": 0,
            "batches_processed": 0,
        }

    @classmethod
    def load(cls, path: Path) -> "State":
        s = cls(path)
        if path.exists():
            try:
                data = json.loads(path.read_text())
                s.last_line = int(data.get("last_line", 0))
                s.pull_run_id = data.get("pull_run_id")
                s.started_at = data.get("started_at")
                if isinstance(data.get("counts"), dict):
                    s.counts.update(data["counts"])
            except Exception as e:
                print(f"[warn] state corrupt, starting fresh: {e}", file=sys.stderr)
        return s

    def flush(self) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps({
            "last_line": self.last_line,
            "pull_run_id": self.pull_run_id,
            "started_at": self.started_at,
            "counts": self.counts,
            "updated_at": datetime.utcnow().isoformat(),
        }, indent=2))
        tmp.replace(self.path)


# ─── DB-Connection + Pre-flight ──────────────────────────────────────────────


def make_pg_conn(stmt_timeout_s: int):
    conn = get_pg_connection()
    with conn.cursor() as cur:
        cur.execute(f"SET statement_timeout = {int(stmt_timeout_s * 1000)}")
        cur.execute("SET idle_in_transaction_session_timeout = '60s'")
    conn.commit()
    return conn


def preflight_check(pg_conn) -> tuple[bool, str]:
    """Returnt (ok, reason). ok=False → Run skippen."""
    try:
        with pg_conn.cursor() as cur:
            # 1) UNIQUE-Index Pflicht
            cur.execute("""
                SELECT 1 FROM pg_indexes
                WHERE tablename = 'crm_imap_message'
                  AND indexname = 'idx_crm_imap_message_msgid_unique'
            """)
            if not cur.fetchone():
                return (False, "Pre-flight: UNIQUE-Index idx_crm_imap_message_msgid_unique fehlt")

            # 2) legacy_sync_v2 parallel?
            cur.execute("""
                SELECT id, started_at FROM crm_pull_run
                WHERE pipeline = 'legacy_sync_v2' AND status = 'running'
                  AND started_at > NOW() - INTERVAL '90 minutes'
                ORDER BY started_at DESC LIMIT 1
            """)
            row = cur.fetchone()
            if row:
                return (False, f"Pre-flight: legacy_sync_v2 läuft (started {row[1]})")

            # 3) Self-Lock: schon ein import_legacy_mails_v3 am Laufen?
            cur.execute("""
                SELECT id, started_at FROM crm_pull_run
                WHERE pipeline = %s AND status = 'running'
                  AND started_at > NOW() - INTERVAL '90 minutes'
                ORDER BY started_at DESC LIMIT 1
            """, (PIPELINE_TAG,))
            row = cur.fetchone()
            if row:
                return (False, f"Pre-flight: {PIPELINE_TAG} läuft bereits (started {row[1]})")
    except Exception as e:
        return (False, f"Pre-flight DB-Read failed: {e}")

    return (True, "OK")


def get_or_create_pull_run(pg_conn, src_filename: str, state: State) -> str:
    """Reuse running pull_run aus State, sonst neu anlegen."""
    if state.pull_run_id:
        with pg_conn.cursor() as cur:
            cur.execute(
                "SELECT status FROM crm_pull_run WHERE id = %s",
                (state.pull_run_id,),
            )
            row = cur.fetchone()
            if row and row[0] == "running":
                return state.pull_run_id

    with pg_conn.cursor() as cur:
        cur.execute("""
            INSERT INTO crm_pull_run (source, pipeline, parser_version, status, notes)
            VALUES (%s, %s, %s, 'running', %s)
            RETURNING id
        """, (SOURCE_TAG, PIPELINE_TAG, PARSER_VERSION, f"src={src_filename}"))
        run_id = cur.fetchone()[0]
        pg_conn.commit()
    return str(run_id)


# ─── Bulk-INSERT (Kernoperation) ─────────────────────────────────────────────


INSERT_SQL = """
INSERT INTO crm_imap_message (
    pull_run_id, account, msg_uid, uid_validity, folder,
    message_id_header, date_header,
    from_email, from_name, to_emails, cc_emails,
    subject, body_excerpt, detected_emails
) VALUES %s
RETURNING id
"""


def insert_batch(pg_conn, run_id: str, parsed: list[dict],
                 counts: dict | None = None) -> int:
    """SELECT-then-INSERT: erst existing message_id_headers raussuchen, dann
    nur die neuen bulk-INSERTen. Per-Batch isolierte Transaction: bei
    Exception nur dieser Batch verloren, der Lauf läuft weiter.

    Postgres' ON CONFLICT mit Partial-Unique-Index (predicate-inferring) ist
    in der Praxis unzuverlässig — bei idx_crm_imap_message_msgid_unique
    schlägt die Inference fehl ('no unique or exclusion constraint matching').
    Pre-SELECT funktioniert mit jedem Index und gibt uns einen exakten
    db_dup-Count gratis.

    Returnt Anzahl inserted.
    """
    if not parsed:
        return 0

    pg = _ensure_psycopg2()
    msg_ids = [p["msg_id"] for p in parsed]

    # 1) Pre-SELECT: was ist schon in der DB?
    with pg_conn.cursor() as cur:
        cur.execute(
            "SELECT message_id_header FROM crm_imap_message "
            "WHERE message_id_header = ANY(%s)",
            (msg_ids,),
        )
        existing = {row[0] for row in cur.fetchall()}

    new = [p for p in parsed if p["msg_id"] not in existing]
    if counts is not None:
        counts["skipped_db_dup"] += len(existing)

    if not new:
        return 0

    rows = [
        (
            run_id, p["account"], p["msg_uid"], 0, "LEGACY_ARCHIVE",
            p["msg_id"], p["date_header"],
            p["from_email"], p["from_name"], p["to_emails"], p["cc_emails"],
            p["subject"], p["body_excerpt"], p["detected_emails"],
        )
        for p in new
    ]

    # 2) Bulk-INSERT der neuen Rows. Race-Condition (paralleler Import) wäre
    # eine UniqueViolation — sehr selten weil Pre-flight kein paralleles
    # Laufen erlaubt. Im Fall: ganzer Batch rolled-back, weiterlaufen.
    try:
        with pg_conn.cursor() as cur:
            result = pg.extras.execute_values(
                cur, INSERT_SQL, rows,
                template=None, page_size=200, fetch=True,
            )
        pg_conn.commit()
        return len(result or [])
    except pg.errors.UniqueViolation:
        pg_conn.rollback()
        if counts is not None:
            counts["skipped_error"] += len(new)
        return 0


def run_with_backoff(pg_conn, parsed: list[dict], run_id: str, counts: dict) -> int:
    """Wrapper: bei Statement-Timeout 5s Pause + 1 Retry, sonst Batch skippen."""
    if not parsed:
        return 0
    pg = _ensure_psycopg2()
    deduped = dedup_in_batch(parsed)
    counts["skipped_in_batch_dup"] += len(parsed) - len(deduped)

    try:
        inserted = insert_batch(pg_conn, run_id, deduped, counts)
    except pg.errors.QueryCanceled:
        print("  [warn] statement-timeout, 5s + retry", file=sys.stderr)
        try:
            pg_conn.rollback()
        except Exception:
            pass
        time.sleep(5.0)
        try:
            inserted = insert_batch(pg_conn, run_id, deduped, counts)
        except Exception as retry_e:
            print(f"  [err] retry failed, batch skipped: {retry_e}", file=sys.stderr)
            try:
                pg_conn.rollback()
            except Exception:
                pass
            counts["skipped_error"] += len(deduped)
            return 0
    except Exception as e:
        print(f"  [err] batch failed: {e}", file=sys.stderr)
        try:
            pg_conn.rollback()
        except Exception:
            pass
        counts["skipped_error"] += len(deduped)
        return 0

    counts["inserted"] += inserted
    return inserted


# ─── atexit / signal ─────────────────────────────────────────────────────────


_finalize_called = False


def make_finalizer(state: State):
    def finalize() -> None:
        global _finalize_called
        if _finalize_called or not state.pull_run_id:
            return
        _finalize_called = True
        try:
            conn = get_pg_connection()
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE crm_pull_run
                    SET finished_at = COALESCE(finished_at, NOW()),
                        status = CASE WHEN status = 'running' THEN 'partial' ELSE status END,
                        rows_inserted = %s,
                        rows_skipped = %s,
                        notes = COALESCE(notes,'') ||
                                ' [v3 last-line=' || %s::text ||
                                ' batches=' || %s::text || ']'
                    WHERE id = %s
                """, (
                    state.counts["inserted"],
                    (state.counts["skipped_in_batch_dup"]
                     + state.counts["skipped_db_dup"]
                     + state.counts["skipped_no_date"]),
                    state.last_line,
                    state.counts["batches_processed"],
                    state.pull_run_id,
                ))
                conn.commit()
            conn.close()
        except Exception as e:
            print(f"[finalizer-err] {e}", file=sys.stderr)
        try:
            state.flush()
        except Exception:
            pass

    return finalize


# ─── Main ────────────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jsonl", required=True)
    ap.add_argument("--load-tier", default=None, choices=["low", "medium", "high"])
    ap.add_argument("--max-runtime", type=int, default=None)
    ap.add_argument("--state-file", default=DEFAULT_STATE_FILE)
    ap.add_argument("--pull-run-id", default=None)
    ap.add_argument("--limit", type=int, default=None,
                    help="Nur N Records prozessieren (Smoke-Test)")
    ap.add_argument("--no-preflight", action="store_true")
    args = ap.parse_args()

    src = Path(args.jsonl)
    if not src.exists():
        print(f"ERROR: {src} not found", file=sys.stderr)
        return 1

    state_path = Path(args.state_file)
    state = State.load(state_path)

    pg_conn = make_pg_conn(stmt_timeout_s=10)
    tier = get_active_tier(pg_conn, cli_override=args.load_tier)
    cfg = get_mail_import_config(tier)
    max_runtime = args.max_runtime if args.max_runtime is not None else cfg["max_runtime_s"]

    print(f"[v3] source: {src} ({src.stat().st_size / 1024 / 1024:.1f} MB)")
    print(f"[v3] tier: {tier} batch={cfg['batch_size']} sleep={cfg['sleep_s']}s "
          f"stmt_timeout={cfg['stmt_timeout_s']}s max_runtime={max_runtime}s")
    print(f"[v3] state: {state_path} (last_line={state.last_line})")
    if args.limit is not None:
        print(f"[v3] LIMIT={args.limit} (smoke-test mode)")

    if not args.no_preflight:
        ok, reason = preflight_check(pg_conn)
        if not ok:
            print(f"[v3] preflight skipped run: {reason}")
            pg_conn.close()
            return 0
        print(f"[v3] preflight: {reason}")

    if args.pull_run_id:
        state.pull_run_id = args.pull_run_id
    state.pull_run_id = get_or_create_pull_run(pg_conn, src.name, state)
    if not state.started_at:
        state.started_at = datetime.utcnow().isoformat()
    state.flush()
    print(f"[v3] pull_run_id: {state.pull_run_id}")

    pg_conn.close()
    pg_conn = make_pg_conn(stmt_timeout_s=cfg["stmt_timeout_s"])

    atexit.register(make_finalizer(state))

    def _term(signum, frame):
        print(f"\n[v3] signal {signum} — clean shutdown", file=sys.stderr)
        sys.exit(143 if signum == signal.SIGTERM else 130)
    signal.signal(signal.SIGTERM, _term)
    signal.signal(signal.SIGINT, _term)

    t_start = time.time()
    batch: list[dict] = []
    cur_line = 0
    batches_since_recycle = 0
    processed_for_limit = 0
    eof_reached = False

    print(f"[v3] streaming JSONL, skip bis line {state.last_line}…")
    with gzip.open(str(src), "rt", encoding="utf-8") as f:
        for cur_line, line in enumerate(f, 1):
            if cur_line <= state.last_line:
                continue
            line = line.strip()
            if not line:
                continue

            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                state.counts["skipped_error"] += 1
                continue

            parsed = parse_record(rec)
            if parsed is None:
                state.counts["skipped_no_date"] += 1
            else:
                batch.append(parsed)

            processed_for_limit += 1
            if args.limit is not None and processed_for_limit >= args.limit:
                # Letzten Batch ausführen, dann break
                if batch:
                    run_with_backoff(pg_conn, batch, state.pull_run_id, state.counts)
                    state.counts["batches_processed"] += 1
                    state.last_line = cur_line
                    batch = []
                print(f"[v3] limit reached: {args.limit} records prozessiert")
                break

            if len(batch) >= cfg["batch_size"]:
                run_with_backoff(pg_conn, batch, state.pull_run_id, state.counts)
                state.counts["batches_processed"] += 1
                batch = []
                state.last_line = cur_line
                batches_since_recycle += 1

                if state.counts["batches_processed"] % cfg["state_flush_every_n"] == 0:
                    state.flush()

                if batches_since_recycle >= cfg["connection_recycle_every_n_batches"]:
                    pg_conn.close()
                    pg_conn = make_pg_conn(stmt_timeout_s=cfg["stmt_timeout_s"])
                    batches_since_recycle = 0

                if max_runtime > 0 and (time.time() - t_start) > max_runtime:
                    print(f"\n[v3] max-runtime ({max_runtime}s) reached — clean shutdown")
                    break

                if cfg["sleep_s"] > 0:
                    time.sleep(cfg["sleep_s"])

                if state.counts["batches_processed"] % 10 == 0:
                    print(f"  [{int(time.time()-t_start)}s] line={cur_line} "
                          f"inserted={state.counts['inserted']} "
                          f"db_dup={state.counts['skipped_db_dup']} "
                          f"in_batch_dup={state.counts['skipped_in_batch_dup']} "
                          f"no_date={state.counts['skipped_no_date']} "
                          f"err={state.counts['skipped_error']}", flush=True)
        else:
            # for-else: läuft nur wenn for natürlich beendet (kein break) →
            # JSONL ist vollständig durchgelaufen
            eof_reached = True

    if batch:
        run_with_backoff(pg_conn, batch, state.pull_run_id, state.counts)
        state.counts["batches_processed"] += 1
        state.last_line = cur_line
        state.flush()

    pg_conn.close()

    elapsed = time.time() - t_start

    # JSONL komplett durch? Pull-Run auf 'done', State-File löschen, DONE-
    # Marker für den Cron-Wrapper schreiben (triggers Self-Cleanup beim
    # nächsten Tick).
    completed = eof_reached and (args.limit is None)
    if completed:
        try:
            conn = make_pg_conn(stmt_timeout_s=10)
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE crm_pull_run SET status='done', finished_at=NOW(),
                           rows_inserted=%s, rows_skipped=%s
                    WHERE id=%s
                """, (
                    state.counts["inserted"],
                    (state.counts["skipped_in_batch_dup"]
                     + state.counts["skipped_db_dup"]
                     + state.counts["skipped_no_date"]),
                    state.pull_run_id,
                ))
                conn.commit()
            conn.close()
            global _finalize_called
            _finalize_called = True
            try:
                state_path.unlink()
            except OSError:
                pass
            try:
                DONE_MARKER.touch()
                print(f"[v3] DONE marker written: {DONE_MARKER}")
            except OSError as e:
                print(f"[v3] failed to write DONE marker: {e}", file=sys.stderr)
        except Exception as e:
            print(f"[done-mark-err] {e}", file=sys.stderr)

    print()
    print("=== IMPORT REPORT (v3) ===")
    print(f"  tier:                  {tier}")
    print(f"  pull_run_id:           {state.pull_run_id}")
    print(f"  last_line:             {state.last_line}")
    print(f"  batches:               {state.counts['batches_processed']}")
    print(f"  inserted:              {state.counts['inserted']}")
    print(f"  skipped_db_dup:        {state.counts['skipped_db_dup']}")
    print(f"  skipped_in_batch_dup:  {state.counts['skipped_in_batch_dup']}")
    print(f"  skipped_no_date:       {state.counts['skipped_no_date']}")
    print(f"  skipped_error:         {state.counts['skipped_error']}")
    print(f"  elapsed:               {int(elapsed//60)}m {int(elapsed%60)}s")
    print(f"  state_file:            {state_path} "
          f"({'gone' if not state_path.exists() else 'kept for resume'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
