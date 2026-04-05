-- ────────────────────────────────────────────────────────────────────────────
-- 2026-04-05 — sync_log Schema Extension (Phase A2 of SYNC_ROBUSTNESS_PLAN v2.1)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Purpose: extend sync_log so future sync scripts can write a structured,
-- honest run-summary instead of stuffing everything into the `changes` JSONB
-- field. See docs/architecture/SYNC_ROBUSTNESS_PLAN.md §5.1 for the design.
--
-- This migration is STRICTLY ADDITIVE:
--   • All new columns are NULLABLE
--   • No existing rows are modified
--   • The existing legacy_sync.py script continues writing to sync_type,
--     sync_date, status, changes, error_message unchanged
--   • A3 (upcoming Python script rewrite) will start populating the new
--     columns. Until then, they stay NULL for new rows written by v1 script
--   • Rollback: DROP COLUMN per column. All harmless (columns NULL).
--
-- How to apply:
--   psql "$DATABASE_URL" -f backend/scripts/migrations/2026-04-05_sync_log_schema_extension.sql
--
-- Test procedure: applied to staging (aebcwjjcextzvflrjgei) first, then
-- production (bofblwqieuvmqybzxapx). Both runs verified via \d sync_log.
--
-- ────────────────────────────────────────────────────────────────────────────

-- Unique run identifier (UUID, one value per script invocation).
-- Multiple sync_log rows MAY share a run_id when the script writes both a
-- per-run summary row and per-entity detail rows.
ALTER TABLE sync_log
  ADD COLUMN IF NOT EXISTS run_id TEXT;

-- Script version string, e.g. 'legacy_sync.py v2.1.0'. Incremented by
-- developers on script changes so post-hoc analysis can attribute rows to
-- specific script versions when debugging old runs.
ALTER TABLE sync_log
  ADD COLUMN IF NOT EXISTS script_version TEXT;

-- Lifecycle phase: 'started' | 'running' | 'success' | 'failed' | 'validation_failed'
-- The existing `status` column stays as-is (backward compat) but uses a
-- different taxonomy. New scripts should prefer `phase`; old scripts keep
-- `status`. Post-A3 cleanup will reconcile.
ALTER TABLE sync_log
  ADD COLUMN IF NOT EXISTS phase TEXT;

-- Precise timing. The existing `sync_date` column remains and can be read as
-- "row-was-created-at". New scripts populate started_at/ended_at/duration_ms
-- explicitly.
ALTER TABLE sync_log
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
ALTER TABLE sync_log
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP;
ALTER TABLE sync_log
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

-- Honest row-counting metrics. The existing `changes` JSONB stays for
-- backward compat and script-specific extras, but the Main metrics live in
-- dedicated columns:
--   rows_source:     how many rows in the MySQL source for this run
--   rows_written:    how many UPSERTs the script issued against Supabase
--   rows_changed:    how many of those had actual field-level deltas (insert or update)
--   rows_inserted:   subset of rows_changed that were net-new rows
--   images_inserted: actual new Image rows (RETURNING-verified, not attempted inserts)
ALTER TABLE sync_log
  ADD COLUMN IF NOT EXISTS rows_source INTEGER;
ALTER TABLE sync_log
  ADD COLUMN IF NOT EXISTS rows_written INTEGER;
ALTER TABLE sync_log
  ADD COLUMN IF NOT EXISTS rows_changed INTEGER;
ALTER TABLE sync_log
  ADD COLUMN IF NOT EXISTS rows_inserted INTEGER;
ALTER TABLE sync_log
  ADD COLUMN IF NOT EXISTS images_inserted INTEGER;

-- Post-run validation results.
-- validation_status: 'ok' | 'warnings' | 'failed'
-- validation_errors: JSONB array of error objects when status ≠ 'ok'
ALTER TABLE sync_log
  ADD COLUMN IF NOT EXISTS validation_status TEXT;
ALTER TABLE sync_log
  ADD COLUMN IF NOT EXISTS validation_errors JSONB;

-- Index for run_id lookups (will be joined with sync_change_log_v2 in Phase B1).
-- Partial index: only index non-NULL values (existing v1 rows have NULL).
CREATE INDEX IF NOT EXISTS idx_sync_log_run_id
  ON sync_log(run_id)
  WHERE run_id IS NOT NULL;

-- Index for phase filtering ("show failed runs last 7 days")
CREATE INDEX IF NOT EXISTS idx_sync_log_phase
  ON sync_log(phase)
  WHERE phase IS NOT NULL;

-- Sanity check: if applied correctly, this query should succeed with all
-- new columns present.
-- SELECT run_id, phase, rows_written, rows_changed, validation_status
-- FROM sync_log LIMIT 1;
