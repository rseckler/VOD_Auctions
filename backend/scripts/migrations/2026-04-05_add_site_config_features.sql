-- ────────────────────────────────────────────────────────────────────────────
-- 2026-04-05 — Feature Flag Infrastructure
-- ────────────────────────────────────────────────────────────────────────────
--
-- Adds a `features` JSONB column to `site_config` that holds the
-- "deploy early, activate when ready" feature flag registry.
--
-- Shape:
--   site_config.features = {
--     "ERP_INVOICING":   false,
--     "ERP_SENDCLOUD":   false,
--     "ERP_INVENTORY":   false,
--     "ERP_COMMISSION":  false,
--     "ERP_TAX_25A":     false,
--     "ERP_MARKETPLACE": false
--   }
--
-- Rationale for a single JSONB column (vs. individual columns or a flag table):
--   • Matches the existing monolithic `site_config` pattern (one row, many keys)
--   • Reuses existing cache + update paths
--   • Adding a new flag is a code-only change (registry in feature-flags.ts),
--     no schema migration needed
--   • Generic — not ERP-specific; future non-ERP flags live in the same column
--
-- Safety:
--   • Fully additive. Column is NOT NULL with default '{}'::jsonb
--   • Existing rows automatically get '{}' on first ALTER
--   • Idempotent — safe to re-run
--   • Rollback: ALTER TABLE site_config DROP COLUMN features;
--     (no data loss elsewhere; feature flags are a runtime toggle)
--
-- How to apply:
--   • Run once via Supabase SQL Editor on the live DB, OR
--   • psql "$DATABASE_URL" -f backend/scripts/migrations/2026-04-05_add_site_config_features.sql
--
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE site_config
    ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Seed the known ERP flag keys to `false` if they are not yet present.
-- Uses JSONB || concatenation so existing flag values are preserved.
UPDATE site_config
SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object(
    'ERP_INVOICING',   COALESCE(features->'ERP_INVOICING',   'false'::jsonb),
    'ERP_SENDCLOUD',   COALESCE(features->'ERP_SENDCLOUD',   'false'::jsonb),
    'ERP_INVENTORY',   COALESCE(features->'ERP_INVENTORY',   'false'::jsonb),
    'ERP_COMMISSION',  COALESCE(features->'ERP_COMMISSION',  'false'::jsonb),
    'ERP_TAX_25A',     COALESCE(features->'ERP_TAX_25A',     'false'::jsonb),
    'ERP_MARKETPLACE', COALESCE(features->'ERP_MARKETPLACE', 'false'::jsonb)
)
WHERE id = 'default';
