-- Auto-assign Release.article_number on INSERT via BEFORE INSERT trigger.
--
-- Context: Until now, article_number was only set by the one-time bulk migration
-- scripts/generate_article_numbers.sql. tape-mag MySQL has no article_number
-- column, and neither legacy_sync_v2.py nor discogs-import/commit/route.ts set
-- one explicitly. Result: every new Release (tape-mag NEW or Discogs-import) lands
-- with article_number=NULL.
--
-- Fix: Postgres sequence + BEFORE INSERT trigger that auto-fills NULL inserts
-- with VOD-XXXXX. Race-condition-free, idempotent, covers ALL insert paths
-- (legacy_sync, discogs_import, future manual-add endpoints) without code changes.
--
-- Idempotent: safe to re-run.

-- 1) Sequence — start AFTER current MAX so no collisions with existing values
CREATE SEQUENCE IF NOT EXISTS release_article_number_seq
  AS BIGINT START WITH 1 INCREMENT BY 1 NO CYCLE;

-- Set sequence to MAX(existing VOD-XXXXX) — safe even on re-runs because
-- setval to a value <= current sequence position is allowed but doesn't
-- "rewind" already-issued numbers. We only adjust if existing data is ahead.
DO $$
DECLARE
  current_max INT;
BEGIN
  SELECT COALESCE(MAX(substring(article_number FROM 'VOD-(\d+)')::INT), 0)
    INTO current_max
    FROM "Release"
   WHERE article_number ~ '^VOD-\d+$';

  IF current_max > 0 THEN
    PERFORM setval('release_article_number_seq', current_max);
  END IF;
END $$;

-- 2) Trigger function — only assigns when NEW.article_number IS NULL.
-- Existing inserts that explicitly pass article_number (e.g. backfill scripts,
-- legacy_sync_v2 if it ever changes) are respected unchanged.
CREATE OR REPLACE FUNCTION assign_release_article_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.article_number IS NULL THEN
    NEW.article_number := 'VOD-' || LPAD(
      nextval('release_article_number_seq')::TEXT, 5, '0'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) BEFORE INSERT trigger
DROP TRIGGER IF EXISTS trg_release_article_number ON "Release";
CREATE TRIGGER trg_release_article_number
  BEFORE INSERT ON "Release"
  FOR EACH ROW EXECUTE FUNCTION assign_release_article_number();

-- 4) Backfill — assign VOD-XXXXX to all rows currently NULL.
-- Deterministic order via createdAt so a re-run with new NULL rows continues
-- the sequence cleanly. Uses nextval (not row_number) so the sequence advances
-- in lockstep and stays the single source of truth.
WITH to_fill AS (
  SELECT id, nextval('release_article_number_seq') AS seq_val
    FROM "Release"
   WHERE article_number IS NULL
   ORDER BY "createdAt" ASC
)
UPDATE "Release" r
   SET article_number = 'VOD-' || LPAD(to_fill.seq_val::TEXT, 5, '0')
  FROM to_fill
 WHERE r.id = to_fill.id;

-- 5) Verify — should be 0 NULL rows after migration
DO $$
DECLARE
  null_count INT;
  total_count INT;
BEGIN
  SELECT COUNT(*) INTO null_count FROM "Release" WHERE article_number IS NULL;
  SELECT COUNT(*) INTO total_count FROM "Release";
  RAISE NOTICE 'Backfill complete: % releases, % still NULL (should be 0)', total_count, null_count;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % NULL rows remain', null_count;
  END IF;
END $$;
