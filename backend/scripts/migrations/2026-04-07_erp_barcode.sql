-- ────────────────────────────────────────────────────────────────────────────
-- 2026-04-07 — ERP Barcode/Labeling Extension
-- ────────────────────────────────────────────────────────────────────────────
--
-- Adds barcode support to erp_inventory_item for the stocktake workflow.
-- Barcodes are assigned during Verify (Stocktake Session) and printed as
-- Code128 labels on Brother QL-810W.
--
-- Schema: VOD-000001 through VOD-041500 (10-char Code128, human-readable)
-- Sequence: erp_barcode_seq generates the numeric part.
--
-- Reference: ERP_WARENWIRTSCHAFT_KONZEPT.md §10.7, INVENTUR_COHORT_A_KONZEPT.md §14
--
-- Safety:
--   • ALTER TABLE ADD COLUMN IF NOT EXISTS — idempotent, safe to re-run
--   • No existing columns modified
--   • Rollback: ALTER TABLE erp_inventory_item DROP COLUMN barcode, DROP COLUMN barcode_printed_at;
--              DROP SEQUENCE IF EXISTS erp_barcode_seq;
--
-- How to apply:
--   psql "$DATABASE_URL" -f backend/scripts/migrations/2026-04-07_erp_barcode.sql
--
-- Test first on staging:
--   PGHOST=aws-0-eu-west-1.pooler.supabase.com PGPORT=5432 \
--   PGUSER=postgres.aebcwjjcextzvflrjgei PGDATABASE=postgres \
--   PGPASSWORD=$(op item get "Supabase 2. Account" --fields "Database password" --reveal) \
--   psql -f backend/scripts/migrations/2026-04-07_erp_barcode.sql
--
-- ────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Barcode column on erp_inventory_item
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE erp_inventory_item
    ADD COLUMN IF NOT EXISTS barcode TEXT,
    ADD COLUMN IF NOT EXISTS barcode_printed_at TIMESTAMPTZ;

-- Unique index (partial — only non-NULL barcodes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_inventory_item_barcode
    ON erp_inventory_item(barcode)
    WHERE barcode IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Barcode sequence (VOD-000001 ... VOD-041500)
-- ═══════════════════════════════════════════════════════════════════════════

-- CREATE SEQUENCE has no IF NOT EXISTS before PG 10, but Supabase is PG 15+
DO $$
BEGIN
    CREATE SEQUENCE erp_barcode_seq START WITH 1 INCREMENT BY 1;
EXCEPTION
    WHEN duplicate_table THEN
        -- Sequence already exists, idempotent
        NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Sanity check (uncomment to verify after apply):
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'erp_inventory_item' AND column_name IN ('barcode', 'barcode_printed_at');
--
-- SELECT sequencename FROM pg_sequences WHERE sequencename = 'erp_barcode_seq';
