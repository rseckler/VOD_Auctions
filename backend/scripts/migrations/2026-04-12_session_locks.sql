-- Discogs Import Session Locks — Concurrent-Run Prevention
-- Applied: 2026-04-12 via Supabase MCP
-- Idempotent: IF NOT EXISTS
-- Plan: docs/architecture/DISCOGS_IMPORT_SESSION_LOCK_PLAN.md

CREATE TABLE IF NOT EXISTS session_locks (
  session_id    TEXT PRIMARY KEY REFERENCES import_session(id) ON DELETE CASCADE,
  owner_id      TEXT NOT NULL,
  phase         TEXT NOT NULL CHECK (phase IN ('fetching', 'analyzing', 'importing')),
  acquired_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heartbeat_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_locks_heartbeat ON session_locks(heartbeat_at);
CREATE INDEX IF NOT EXISTS idx_session_locks_phase ON session_locks(phase);

COMMENT ON TABLE session_locks IS
  'Exclusive ownership lock per import_session. One row = one active loop. '
  'Stale locks (heartbeat > 150s old) can be atomically taken over via acquireLock(). '
  'See docs/architecture/DISCOGS_IMPORT_SESSION_LOCK_PLAN.md';
