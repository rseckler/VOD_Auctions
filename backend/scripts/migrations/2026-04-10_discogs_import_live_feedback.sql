-- Discogs Import Live Feedback: Progress tracking, cancel/pause, event log
-- Applied: 2026-04-10 via Supabase MCP
-- Idempotent: IF NOT EXISTS on all statements
-- Referenz: docs/DISCOGS_IMPORT_LIVE_FEEDBACK_PLAN.md

-- 1. Extended progress fields on import_session
ALTER TABLE import_session ADD COLUMN IF NOT EXISTS parse_progress JSONB;
ALTER TABLE import_session ADD COLUMN IF NOT EXISTS analyze_progress JSONB;
ALTER TABLE import_session ADD COLUMN IF NOT EXISTS commit_progress JSONB;
ALTER TABLE import_session ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE import_session ADD COLUMN IF NOT EXISTS last_error JSONB;

-- 2. Control flags: cancel + pause
ALTER TABLE import_session ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN DEFAULT false;
ALTER TABLE import_session ADD COLUMN IF NOT EXISTS pause_requested BOOLEAN DEFAULT false;

-- 3. Event log table for live log + replay
CREATE TABLE IF NOT EXISTS import_event (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_import_event_session ON import_event(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_event_created ON import_event(created_at);

-- 4. FK constraint (separate so it can be added later if import_session exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'import_event_session_id_fkey'
  ) THEN
    ALTER TABLE import_event
      ADD CONSTRAINT import_event_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES import_session(id) ON DELETE CASCADE;
  END IF;
END$$;
