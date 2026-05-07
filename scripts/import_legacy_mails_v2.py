#!/usr/bin/env python3
"""import_legacy_mails_v2 — Tier-aware, restartable, low-load Mail-Import.

Ersetzt den broken import_legacy_mails.py (v1).

Verbesserungen ggü. v1:
  1. Batch-Dedup statt row-by-row (200x weniger DB-Round-Trips)
  2. Time-Box (Max-Runtime per Lauf, exit 0 bei Time-Up)
  3. State-File für Crash-Recovery (resume from last successful line)
  4. Statement-Timeout-Backoff (5s + 1 retry, dann Batch skippen)
  5. Pre-flight: Skip wenn legacy_sync_v2 parallel läuft
  6. Kurzlebige Connections (recycle alle N Batches)
  7. atexit-Handler für saubere pull_run-Finalisierung
  8. Tier-aware: low/medium/high steuert alle Knobs (siehe load_tier.py)

CLI:
  --jsonl PATH                  Pfad zur JSONL.gz (required)
  --load-tier {low,medium,high} Override (default: read from DB / ENV / 'medium')
  --max-runtime SECS            Override Time-Box (default: from tier config)
  --state-file PATH             Override State-File-Pfad
  --pull-run-id UUID            Resume specific run (default: new run)
  --no-preflight                Skip parallel-job check (debug only)

Konzept: docs/optimizing/IMPORT_LEGACY_MAILS_PLAN.md (Teil 3)
         docs/optimizing/LOAD_TIER_KONZEPT.md (Sektion 4.3)
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

sys.path.insert(0, str(Path(__file__).parent))
from shared import get_pg_connection, _ensure_psycopg2  # noqa: E402
from load_tier import get_active_tier, get_mail_import_config  # noqa: E402

VOD_RECORDS_DOMAIN = "vod-records.com"
VOD_DEMAND_DOMAIN = "vinyl-on-demand.com"

EMAIL_RE = re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b")

DEFAULT_STATE_FILE = "/tmp/import_legacy_mails.state.json"


# ─── Helpers ─────────────────────────────────────────────────────────────────

def derive_account(from_str: str, to_str: str) -> str:
    blob = f"{from_str} {to_str}".lower()
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
    seen = []
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


# ─── State-File ──────────────────────────────────────────────────────────────

class State:
    """Persistenter State für Crash-Recovery + Resume."""

    def __init__(self, path: Path):
        self.path = path
        self.last_line = 0
        self.pull_run_id: str | None = None
        self.started_at: str | None = None
        self.counts = {
            "inserted": 0, "skipped_duplicate": 0, "skipped_no_date": 0,
            "skipped_error": 0, "batches_processed": 0,
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
                print(f"[warn] State-File corrupt, starting fresh: {e}", file=sys.stderr)
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


# ─── Pre-flight Checks ───────────────────────────────────────────────────────

def preflight_check(pg_conn) -> tuple[bool, str]:
    """Returnt (ok, reason) — wenn ok=False soll Run skippen."""
    pg = _ensure_psycopg2()
    try:
        with pg_conn.cursor() as cur:
            # Check 1: Läuft legacy_sync_v2 gerade?
            cur.execute("""
                SELECT id, started_at FROM crm_pull_run
                WHERE pipeline = 'legacy_sync_v2' AND status = 'running'
                  AND started_at > NOW() - INTERVAL '90 minutes'
                ORDER BY started_at DESC LIMIT 1
            """)
            row = cur.fetchone()
            if row:
                return (False, f"legacy_sync_v2 läuft noch (started {row[1]})")

            # Check 2: UNIQUE-Index auf message_id_header?
            cur.execute("""
                SELECT 1 FROM pg_indexes
                WHERE tablename = 'crm_imap_message'
                  AND indexname = 'idx_crm_imap_message_msgid_unique'
            """)
            if not cur.fetchone():
                return (False, "Pre-flight: UNIQUE-Index idx_crm_imap_message_msgid_unique fehlt — bitte migrieren")
    except Exception as e:
        return (False, f"Pre-flight DB-Read failed: {e}")

    return (True, "OK")


def get_or_create_pull_run(pg_conn, src_filename: str, state: State) -> str:
    """Returnt pull_run_id. Reuse wenn state.pull_run_id im RUNNING-State, sonst neu."""
    pg = _ensure_psycopg2()
    if state.pull_run_id:
        with pg_conn.cursor() as cur:
            cur.execute(
                "SELECT status FROM crm_pull_run WHERE id = %s",
                (state.pull_run_id,)
            )
            row = cur.fetchone()
            if row and row[0] == "running":
                return state.pull_run_id

    # Neu anlegen
    with pg_conn.cursor() as cur:
        cur.execute("""
            INSERT INTO crm_pull_run (source, pipeline, parser_version, status, notes)
            VALUES ('legacy_mail_archive', 'import_legacy_mails_v2', '2.0', 'running', %s)
            RETURNING id
        """, (f"src={src_filename}",))
        run_id = cur.fetchone()[0]
        pg_conn.commit()
    return str(run_id)


# ─── Batch-Logic ─────────────────────────────────────────────────────────────

def parse_record(rec: dict) -> dict | None:
    """Returnt parsed record oder None wenn skip (z.B. no date)."""
    msg_id = make_msg_id(rec)
    date_header = parse_iso_date(rec.get("date", ""))
    if not date_header:
        return {"_skip": "no_date", "msg_id": msg_id}

    from_emails, from_names = parse_addresses(rec.get("from", ""))
    to_emails, _ = parse_addresses(rec.get("to", ""))
    cc_emails, _ = parse_addresses(rec.get("cc", ""))
    body = rec.get("body") or ""
    body_excerpt = body[:5000] if body else None
    detected = extract_emails_from_body(body)
    fake_uid = "legacy:" + hashlib.sha256(msg_id.encode()).hexdigest()[:24]

    return {
        "msg_id": msg_id,
        "date_header": date_header,
        "account": derive_account(rec.get("from", ""), rec.get("to", "")),
        "msg_uid": fake_uid,
        "from_email": from_emails[0] if from_emails else "",
        "from_name": from_names[0] if from_names else "",
        "to_emails": to_emails,
        "cc_emails": cc_emails,
        "subject": (rec.get("subject") or "")[:500],
        "body_excerpt": body_excerpt,
        "detected_emails": detected,
    }


def process_batch(pg_conn, batch: list[dict], run_id: str, tier_cfg: dict,
                  counts: dict) -> int:
    """Returnt Anzahl erfolgreich inserted Records aus diesem Batch."""
    if not batch:
        return 0

    # Filter parsed-skipped records
    parsable = [b for b in batch if b and "_skip" not in b]
    skipped_no_date = sum(1 for b in batch if b and b.get("_skip") == "no_date")
    counts["skipped_no_date"] += skipped_no_date

    if not parsable:
        return 0

    msg_ids = [p["msg_id"] for p in parsable]

    if tier_cfg["dedup_strategy"] == "select_then_insert":
        # LOW-Tier-Pattern: erst SELECT um already-imported zu finden, dann INSERT
        with pg_conn.cursor() as cur:
            cur.execute(
                "SELECT message_id_header FROM crm_imap_message WHERE message_id_header = ANY(%s)",
                (msg_ids,)
            )
            existing = {row[0] for row in cur.fetchall()}
        new_records = [p for p in parsable if p["msg_id"] not in existing]
        counts["skipped_duplicate"] += len(parsable) - len(new_records)
    else:
        # ON-CONFLICT-Pattern: keine Vorab-SELECTs
        new_records = parsable

    if not new_records:
        return 0

    # Bulk INSERT
    sql = """
        INSERT INTO crm_imap_message (
            pull_run_id, account, msg_uid, uid_validity, folder,
            message_id_header, date_header,
            from_email, from_name, to_emails, cc_emails,
            subject, body_excerpt, detected_emails
        ) VALUES (%s, %s, %s, 0, 'LEGACY_ARCHIVE',
                  %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (message_id_header) DO NOTHING
    """
    inserted = 0
    with pg_conn.cursor() as cur:
        for rec in new_records:
            try:
                cur.execute(sql, (
                    run_id, rec["account"], rec["msg_uid"],
                    rec["msg_id"], rec["date_header"],
                    rec["from_email"], rec["from_name"],
                    rec["to_emails"], rec["cc_emails"],
                    rec["subject"], rec["body_excerpt"], rec["detected_emails"],
                ))
                if cur.rowcount > 0:
                    inserted += 1
                else:
                    counts["skipped_duplicate"] += 1
            except Exception as e:
                pg_conn.rollback()
                counts["skipped_error"] += 1
                print(f"  [err] {rec['msg_id'][:60]}: {e}", file=sys.stderr)
                continue
    pg_conn.commit()
    counts["inserted"] += inserted
    return inserted


def run_with_backoff(pg_conn, batch, run_id, tier_cfg, counts):
    """Wrapper für process_batch mit Statement-Timeout-Backoff."""
    pg = _ensure_psycopg2()
    try:
        return process_batch(pg_conn, batch, run_id, tier_cfg, counts)
    except pg.errors.QueryCanceled as e:
        # Statement-Timeout — sleep + retry once
        print(f"  [warn] Statement-Timeout, 5s Pause + Retry…", file=sys.stderr)
        try:
            pg_conn.rollback()
        except Exception:
            pass
        time.sleep(5.0)
        try:
            return process_batch(pg_conn, batch, run_id, tier_cfg, counts)
        except Exception as retry_e:
            print(f"  [err] Retry failed, batch geskippt: {retry_e}", file=sys.stderr)
            counts["skipped_error"] += len(batch)
            try:
                pg_conn.rollback()
            except Exception:
                pass
            return 0


def make_pg_conn(stmt_timeout_s: int):
    """Fresh Connection mit statement_timeout."""
    conn = get_pg_connection()
    with conn.cursor() as cur:
        cur.execute(f"SET statement_timeout = {int(stmt_timeout_s * 1000)}")
        cur.execute("SET idle_in_transaction_session_timeout = '60s'")
    conn.commit()
    return conn


# ─── atexit-Handler: pull_run finalisieren ───────────────────────────────────

_finalize_called = False


def make_finalizer(pg_url: str, state: State):
    def finalize():
        global _finalize_called
        if _finalize_called:
            return
        _finalize_called = True

        if not state.pull_run_id:
            return
        try:
            conn = get_pg_connection()
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE crm_pull_run
                    SET finished_at = COALESCE(finished_at, NOW()),
                        status = CASE WHEN status = 'running' THEN 'partial' ELSE status END,
                        rows_inserted = %s,
                        rows_skipped = %s,
                        notes = COALESCE(notes, '') ||
                                ' [v2 last-line=' || %s::text || ' batches=' || %s::text || ']'
                    WHERE id = %s
                """, (
                    state.counts["inserted"],
                    state.counts["skipped_duplicate"] + state.counts["skipped_no_date"],
                    state.last_line, state.counts["batches_processed"],
                    state.pull_run_id,
                ))
                conn.commit()
            conn.close()
        except Exception as e:
            print(f"[finalizer-err] {e}", file=sys.stderr)
        # State-File final flush
        try:
            state.flush()
        except Exception:
            pass

    return finalize


# ─── Main ────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jsonl", required=True, help="Pfad zur JSONL.gz")
    ap.add_argument("--load-tier", default=None, choices=["low", "medium", "high"])
    ap.add_argument("--max-runtime", type=int, default=None,
                    help="Override Time-Box in Sekunden (default: from tier)")
    ap.add_argument("--state-file", default=DEFAULT_STATE_FILE)
    ap.add_argument("--no-preflight", action="store_true")
    ap.add_argument("--pull-run-id", default=None,
                    help="Force resume specific pull_run (debug)")
    args = ap.parse_args()

    src = Path(args.jsonl)
    if not src.exists():
        print(f"ERROR: {src} not found", file=sys.stderr)
        return 1

    state_path = Path(args.state_file)
    state = State.load(state_path)

    # Tier ermitteln (mit DB-Read wenn kein CLI/ENV)
    pg_conn = make_pg_conn(stmt_timeout_s=10)  # short for tier-read
    tier = get_active_tier(pg_conn, cli_override=args.load_tier)
    cfg = get_mail_import_config(tier)
    max_runtime = args.max_runtime if args.max_runtime is not None else cfg["max_runtime_s"]

    print(f"[v2] Source: {src} ({src.stat().st_size / 1024 / 1024:.1f} MB)")
    print(f"[v2] Tier: {tier}")
    print(f"[v2] Config: batch={cfg['batch_size']} sleep={cfg['sleep_s']}s "
          f"stmt_timeout={cfg['stmt_timeout_s']}s max_runtime={max_runtime}s "
          f"dedup={cfg['dedup_strategy']}")
    print(f"[v2] State: {state_path} (last_line={state.last_line})")

    # Pre-flight
    if not args.no_preflight:
        ok, reason = preflight_check(pg_conn)
        if not ok:
            print(f"[v2] Pre-flight skipped run: {reason}")
            pg_conn.close()
            return 0
        print(f"[v2] Pre-flight: {reason}")

    # pull_run anlegen oder fortsetzen
    if args.pull_run_id:
        state.pull_run_id = args.pull_run_id
    state.pull_run_id = get_or_create_pull_run(pg_conn, src.name, state)
    if not state.started_at:
        state.started_at = datetime.utcnow().isoformat()
    state.flush()
    print(f"[v2] pull_run_id: {state.pull_run_id}")

    # Connection mit Tier-spezifischem statement_timeout neu öffnen
    pg_conn.close()
    pg_conn = make_pg_conn(stmt_timeout_s=cfg["stmt_timeout_s"])

    # atexit-Handler
    atexit.register(make_finalizer(os.getenv("DATABASE_URL", ""), state))

    # SIGTERM/SIGINT auch trigger atexit
    def _term_handler(signum, frame):
        print(f"\n[v2] Signal {signum} — clean shutdown", file=sys.stderr)
        sys.exit(143 if signum == signal.SIGTERM else 130)
    signal.signal(signal.SIGTERM, _term_handler)
    signal.signal(signal.SIGINT, _term_handler)

    # Batching-Loop
    t_start = time.time()
    batch: list[dict] = []
    cur_line = 0
    batches_since_recycle = 0

    print(f"[v2] Streaming JSONL, skip bis Line {state.last_line}…")

    with gzip.open(str(src), "rt", encoding="utf-8") as f:
        for cur_line, line in enumerate(f, 1):
            # Resume-Skip
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
            if parsed:
                batch.append(parsed)

            if len(batch) >= cfg["batch_size"]:
                run_with_backoff(pg_conn, batch, state.pull_run_id, cfg, state.counts)
                state.counts["batches_processed"] += 1
                batch = []
                state.last_line = cur_line
                batches_since_recycle += 1

                # State-Flush
                if state.counts["batches_processed"] % cfg["state_flush_every_n"] == 0:
                    state.flush()

                # Connection-Recycle
                if batches_since_recycle >= cfg["connection_recycle_every_n_batches"]:
                    pg_conn.close()
                    pg_conn = make_pg_conn(stmt_timeout_s=cfg["stmt_timeout_s"])
                    batches_since_recycle = 0

                # Time-Box-Check
                if max_runtime > 0 and (time.time() - t_start) > max_runtime:
                    print(f"\n[v2] Max-Runtime ({max_runtime}s) erreicht — clean shutdown")
                    break

                # Throttle
                if cfg["sleep_s"] > 0:
                    time.sleep(cfg["sleep_s"])

                # Progress
                if state.counts["batches_processed"] % 10 == 0:
                    print(f"  [{int(time.time()-t_start)}s] line={cur_line} "
                          f"inserted={state.counts['inserted']} "
                          f"skip_dup={state.counts['skipped_duplicate']} "
                          f"skip_nodate={state.counts['skipped_no_date']} "
                          f"err={state.counts['skipped_error']}", flush=True)

    # Letzten Batch-Rest
    if batch:
        run_with_backoff(pg_conn, batch, state.pull_run_id, cfg, state.counts)
        state.counts["batches_processed"] += 1
        state.last_line = cur_line
        state.flush()

    pg_conn.close()

    # Wenn wir hier ankommen ohne Time-Box-Break → Run komplett durch
    if max_runtime <= 0 or (time.time() - t_start) <= max_runtime:
        # Markiere pull_run als 'done'
        try:
            conn = make_pg_conn(stmt_timeout_s=10)
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE crm_pull_run SET status = 'done', finished_at = NOW(),
                           rows_inserted = %s,
                           rows_skipped = %s
                    WHERE id = %s
                """, (
                    state.counts["inserted"],
                    state.counts["skipped_duplicate"] + state.counts["skipped_no_date"],
                    state.pull_run_id,
                ))
                conn.commit()
            conn.close()
            global _finalize_called
            _finalize_called = True
            # State-File löschen — Lauf komplett durch
            try:
                state_path.unlink()
            except OSError:
                pass
        except Exception as e:
            print(f"[done-mark-err] {e}", file=sys.stderr)

    elapsed = time.time() - t_start
    print()
    print("=== IMPORT REPORT (v2) ===")
    print(f"  tier:                  {tier}")
    print(f"  pull_run_id:           {state.pull_run_id}")
    print(f"  last_line:             {state.last_line}")
    print(f"  batches:               {state.counts['batches_processed']}")
    print(f"  inserted:              {state.counts['inserted']}")
    print(f"  skipped_duplicate:     {state.counts['skipped_duplicate']}")
    print(f"  skipped_no_date:       {state.counts['skipped_no_date']}")
    print(f"  skipped_error:         {state.counts['skipped_error']}")
    print(f"  elapsed:               {int(elapsed//60)}m {int(elapsed%60)}s")
    print(f"  state_file:            {state_path} ({'gone' if not state_path.exists() else 'kept for resume'})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
