-- ============================================================================
-- 2026-05-07: background_job tracker (Annex §A11.1)
--
-- Universelles Schema für Long-Running-Jobs (FB-Migration-Pipeline,
-- Discogs-Sync, MO-PDF-AI, Meili-Drift, Master-Consolidation, …).
-- Foundation für Operations-Hub `/app/operations/jobs` und Heartbeat-basierte
-- Stale-Detection (Postmortem 2026-05-01: Sampler 5,6 Tage tot ohne Alarm).
--
-- Idempotent + additiv. Apply via Supabase MCP.
-- ============================================================================

CREATE TABLE IF NOT EXISTS background_job (
  id              text PRIMARY KEY,
  kind            text NOT NULL,
  display_name    text NOT NULL,
  status          text NOT NULL DEFAULT 'queued',
  progress_done   bigint NOT NULL DEFAULT 0,
  progress_total  bigint NULL,
  started_at      timestamptz NULL,
  finished_at     timestamptz NULL,
  last_heartbeat  timestamptz NULL,
  pid             integer NULL,
  hostname        text NULL,
  payload         jsonb NULL,
  result_summary  jsonb NULL,
  log_tail        text NULL,
  log_file_path   text NULL,
  triggered_by    text NULL,
  cancel_requested boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_background_job_status CHECK (status IN (
    'queued','running','paused','succeeded','failed','cancelled'
  ))
);

COMMENT ON TABLE background_job IS
  'Universelle Background-Job-Übersicht (Annex §A11, 2026-05-07). Tracked langlaufende Pipelines mit Heartbeat + Cancel-Signal.';
COMMENT ON COLUMN background_job.kind IS
  'Stable identifier wie ''fb_import_p2'', ''discogs_daily_sync'', ''mo_pdf_extract'' — keine UI-Strings, keine Versionen.';
COMMENT ON COLUMN background_job.cancel_requested IS
  'Admin-UI setzt das auf true. Worker pollt im heartbeat() und macht clean shutdown.';
COMMENT ON COLUMN background_job.last_heartbeat IS
  'Worker schreibt alle 10-30s. Stale-Cron markiert Jobs ohne Heartbeat seit >5min als failed.';

-- Aktive Jobs (Hub-Card + Detail-Page Default-Sicht)
CREATE INDEX IF NOT EXISTS idx_background_job_active
  ON background_job(status, started_at DESC)
  WHERE status IN ('running','paused','queued');

-- History (jüngste 50 für UI)
CREATE INDEX IF NOT EXISTS idx_background_job_recent
  ON background_job(created_at DESC);

-- Filter nach Job-Typ
CREATE INDEX IF NOT EXISTS idx_background_job_kind
  ON background_job(kind, created_at DESC);

-- Stale-Detection-Scan (Cron */2 * * * *)
CREATE INDEX IF NOT EXISTS idx_background_job_stale_scan
  ON background_job(last_heartbeat)
  WHERE status = 'running';

-- updated_at auto-pflegen
CREATE OR REPLACE FUNCTION background_job_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_background_job_set_updated_at ON background_job;
CREATE TRIGGER trg_background_job_set_updated_at
  BEFORE UPDATE ON background_job
  FOR EACH ROW
  EXECUTE FUNCTION background_job_set_updated_at();
