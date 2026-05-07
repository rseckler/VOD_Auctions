"""
job_tracker.py — Universeller Background-Job-Tracker (Annex §A11).

Pattern für alle langlaufenden Pipelines auf dem VPS. Schreibt Heartbeats
in `background_job` und respektiert Cancel-Signal aus dem Admin-UI.

Usage:
    from community_fb_archive.lib.job_tracker import JobTracker

    with JobTracker.start(
        kind='fb_import_p2',
        display_name='Facebook Image Pre-Processing (P2)',
        progress_total=6369,
        payload={'source_dir': '/root/.../fb_archive_2026-05-07'},
        log_file_path='/root/.../logs/fb_import_p2.log',
    ) as job:
        for i, item in enumerate(items):
            process(item)
            job.heartbeat(progress_done=i + 1)
            # heartbeat() raises JobCancelledError if admin clicked Cancel

        job.succeed(result_summary={'images_uploaded': 6369, 'cost_usd': 0.0})

Environment:
    SUPABASE_DB_URL must be set (Session Pooler URL preferred).

Idempotent design:
    - Same `kind`+`payload` can be retried after a crash; create a new
      JobTracker.start() — old run gets stale-marked by mark_stale_jobs.py
      after 5 min. Pipelines should themselves be resumable (skip already-
      processed items via a manifest), tracker only records progress.
"""
from __future__ import annotations

import os
import socket
import sys
import time
import traceback
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

import psycopg2
import psycopg2.extras

try:
    from dotenv import load_dotenv as _load_dotenv

    _load_dotenv()
except ImportError:
    pass


def _resolve_db_url() -> str:
    """Resolve Postgres URL from env, accepting both VOD legacy names.

    Canonical: SUPABASE_DB_URL (used by all newer scripts).
    Legacy fallback: DATABASE_URL (current name on VPS .env file).
    """
    for var in ("SUPABASE_DB_URL", "DATABASE_URL"):
        val = os.environ.get(var)
        if val:
            return val
    raise RuntimeError(
        "Neither SUPABASE_DB_URL nor DATABASE_URL is set — "
        "check scripts/.env or pass db_url= explicitly."
    )


DEFAULT_HEARTBEAT_INTERVAL_SEC = 15
LOG_TAIL_MAX_CHARS = 5000


class JobCancelledError(RuntimeError):
    """Raised by heartbeat() when admin requested cancel via UI."""


class JobTracker:
    """One row in `background_job` mapped to one Python process."""

    def __init__(self, conn, job_id: str, heartbeat_interval: int):
        self._conn = conn
        self.job_id = job_id
        self._heartbeat_interval = heartbeat_interval
        self._last_heartbeat_ts = 0.0
        self._log_buffer: list[str] = []

    # ----- lifecycle --------------------------------------------------------

    @classmethod
    @contextmanager
    def start(
        cls,
        kind: str,
        display_name: str,
        progress_total: int | None = None,
        payload: dict[str, Any] | None = None,
        log_file_path: str | None = None,
        triggered_by: str = "cron",
        heartbeat_interval: int = DEFAULT_HEARTBEAT_INTERVAL_SEC,
        db_url: str | None = None,
    ) -> Iterator["JobTracker"]:
        """Context manager: registers job, runs body, marks succeed/fail."""
        conn = psycopg2.connect(db_url or _resolve_db_url())
        conn.autocommit = True
        job_id = _generate_id()
        try:
            with conn.cursor() as c:
                c.execute(
                    """
                    INSERT INTO background_job (
                      id, kind, display_name, status,
                      progress_done, progress_total,
                      started_at, last_heartbeat,
                      pid, hostname, payload,
                      log_file_path, triggered_by
                    ) VALUES (
                      %s, %s, %s, 'running',
                      0, %s,
                      NOW(), NOW(),
                      %s, %s, %s::jsonb,
                      %s, %s
                    )
                    """,
                    (
                        job_id,
                        kind,
                        display_name,
                        progress_total,
                        os.getpid(),
                        socket.gethostname(),
                        psycopg2.extras.Json(payload) if payload else None,
                        log_file_path,
                        triggered_by,
                    ),
                )
            tracker = cls(conn, job_id, heartbeat_interval)
            try:
                yield tracker
            except JobCancelledError:
                tracker.cancel("worker observed cancel_requested=true")
                raise
            except BaseException as e:
                tracker.fail(f"{type(e).__name__}: {e}", traceback.format_exc())
                raise
            else:
                # Auto-succeed only if the body did not call succeed/fail itself.
                tracker._auto_succeed_if_running()
        finally:
            conn.close()

    # ----- progress + heartbeat ---------------------------------------------

    def heartbeat(self, progress_done: int | None = None, force: bool = False) -> None:
        """Write heartbeat (rate-limited) and check cancel flag.

        Call frequently (every iteration). The interval-throttle keeps DB
        load low. `force=True` bypasses the throttle (useful right before
        long-blocking work like an HTTP call).
        """
        now = time.monotonic()
        if not force and (now - self._last_heartbeat_ts) < self._heartbeat_interval:
            return
        self._last_heartbeat_ts = now

        with self._conn.cursor() as c:
            if progress_done is not None:
                c.execute(
                    """
                    UPDATE background_job
                       SET last_heartbeat = NOW(),
                           progress_done  = %s,
                           log_tail       = COALESCE(%s, log_tail)
                     WHERE id = %s
                 RETURNING cancel_requested
                    """,
                    (progress_done, self._render_log_tail(), self.job_id),
                )
            else:
                c.execute(
                    """
                    UPDATE background_job
                       SET last_heartbeat = NOW(),
                           log_tail       = COALESCE(%s, log_tail)
                     WHERE id = %s
                 RETURNING cancel_requested
                    """,
                    (self._render_log_tail(), self.job_id),
                )
            row = c.fetchone()
            if row and row[0]:
                raise JobCancelledError(self.job_id)

    def log(self, line: str) -> None:
        """Append a line to the in-memory tail (flushed on next heartbeat).

        Also echoes to stdout so nohup-logs stay readable.
        """
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        formatted = f"[{ts}] {line}"
        print(formatted, flush=True)
        self._log_buffer.append(formatted)
        # Keep buffer bounded (roughly LOG_TAIL_MAX_CHARS worth)
        joined_len = sum(len(s) + 1 for s in self._log_buffer)
        while joined_len > LOG_TAIL_MAX_CHARS and len(self._log_buffer) > 1:
            joined_len -= len(self._log_buffer.pop(0)) + 1

    # ----- terminal states --------------------------------------------------

    def succeed(self, result_summary: dict[str, Any] | None = None) -> None:
        self._finish("succeeded", result_summary=result_summary)

    def fail(self, error: str, trace: str | None = None) -> None:
        summary: dict[str, Any] = {"error": error}
        if trace:
            summary["traceback"] = trace
        self._finish("failed", result_summary=summary)

    def cancel(self, reason: str = "user requested") -> None:
        self._finish("cancelled", result_summary={"reason": reason})

    def _auto_succeed_if_running(self) -> None:
        with self._conn.cursor() as c:
            c.execute(
                "SELECT status FROM background_job WHERE id = %s", (self.job_id,)
            )
            row = c.fetchone()
            if row and row[0] == "running":
                self.succeed()

    def _finish(self, status: str, result_summary: dict[str, Any] | None) -> None:
        with self._conn.cursor() as c:
            # On successful completion snap progress_done to progress_total
            # (heartbeat-throttling can leave progress_done lagging on fast jobs).
            progress_clause = (
                "progress_done = COALESCE(progress_total, progress_done),"
                if status == "succeeded"
                else ""
            )
            c.execute(
                f"""
                UPDATE background_job
                   SET status         = %s,
                       {progress_clause}
                       finished_at    = NOW(),
                       last_heartbeat = NOW(),
                       result_summary = %s::jsonb,
                       log_tail       = COALESCE(%s, log_tail)
                 WHERE id = %s
                """,
                (
                    status,
                    psycopg2.extras.Json(result_summary) if result_summary else None,
                    self._render_log_tail(),
                    self.job_id,
                ),
            )

    # ----- helpers ----------------------------------------------------------

    def _render_log_tail(self) -> str | None:
        if not self._log_buffer:
            return None
        joined = "\n".join(self._log_buffer)
        return joined[-LOG_TAIL_MAX_CHARS:]


def _generate_id() -> str:
    """ULID-ish id: timestamp-prefixed, sortable, no collision risk."""
    # job_<26-char ULID-like>. Format compatible with Medusa-side display.
    # Falls Medusa's generateEntityId() später konsumiert wird, kann das
    # Prefix angepasst werden — der Tracker selbst gibt sich mit text-PK zufrieden.
    ts = int(time.time() * 1000)
    rnd = uuid.uuid4().hex[:16]
    return f"job_{ts:013x}{rnd}"


# ---------------------------------------------------------------------------
# Smoke-Test (manuell): python3 -m community_fb_archive.lib.job_tracker
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("Smoke-test job_tracker against SUPABASE_DB_URL …", flush=True)
    with JobTracker.start(
        kind="job_tracker_smoke",
        display_name="Smoke-Test job_tracker",
        progress_total=5,
        payload={"source": "manual"},
        triggered_by="manual",
        heartbeat_interval=1,
    ) as job:
        for i in range(5):
            time.sleep(0.5)
            job.log(f"step {i + 1}/5")
            job.heartbeat(progress_done=i + 1)
        job.succeed(result_summary={"steps": 5})
    print("OK — check `SELECT * FROM background_job ORDER BY created_at DESC LIMIT 1;`")
    sys.exit(0)
