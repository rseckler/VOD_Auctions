-- POS Walk-in Sale: Extend transaction table + POS order number sequence
-- Adds columns for POS session tracking, TSE (KassenSichV), tax handling,
-- and export declaration tracking. All nullable — no breaking change for
-- existing online transactions.
--
-- Rollback:
--   ALTER TABLE transaction DROP COLUMN IF EXISTS pos_session_id;
--   ALTER TABLE transaction DROP COLUMN IF EXISTS tse_signature;
--   ALTER TABLE transaction DROP COLUMN IF EXISTS tse_transaction_number;
--   ALTER TABLE transaction DROP COLUMN IF EXISTS tse_signed_at;
--   ALTER TABLE transaction DROP COLUMN IF EXISTS tse_serial_number;
--   ALTER TABLE transaction DROP COLUMN IF EXISTS tax_mode;
--   ALTER TABLE transaction DROP COLUMN IF EXISTS tax_rate_percent;
--   ALTER TABLE transaction DROP COLUMN IF EXISTS tax_amount;
--   ALTER TABLE transaction DROP COLUMN IF EXISTS customer_country_code;
--   ALTER TABLE transaction DROP COLUMN IF EXISTS export_declaration_issued_at;
--   ALTER TABLE transaction DROP COLUMN IF EXISTS export_declaration_confirmed_at;
--   DROP SEQUENCE IF EXISTS pos_order_number_seq;

-- ─── POS Session Tracking ──────────────────────────────────────────────────
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS pos_session_id TEXT;

-- ─── TSE (KassenSichV) ────────────────────────────────────────────────────
-- In P0 (Dry-Run): tse_signature = 'DRY_RUN', rest NULL.
-- In P2 (TSE-Integration): populated by fiskaly/efsta Cloud-TSE API.
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS tse_signature TEXT;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS tse_transaction_number INTEGER;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS tse_signed_at TIMESTAMPTZ;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS tse_serial_number TEXT;

-- ─── Tax Handling ──────────────────────────────────────────────────────────
-- tax_mode: 'standard' (19% USt) | 'export_tax_free' (§6 UStG, Drittland)
-- In P0 (Dry-Run): always 'standard', toggle disabled in UI.
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS tax_mode TEXT DEFAULT 'standard';
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS tax_rate_percent NUMERIC(5,2);
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2);
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS customer_country_code TEXT;

-- ─── Export Declaration Tracking (§6 UStG) ─────────────────────────────────
-- issued_at: when Frank handed out the Ausfuhr-/Abnehmerbescheinigung
-- confirmed_at: when the customs stamp was received back
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS export_declaration_issued_at TIMESTAMPTZ;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS export_declaration_confirmed_at TIMESTAMPTZ;

-- ─── POS Order Number Sequence ─────────────────────────────────────────────
-- Separate sequence for POS orders: VOD-POS-000001, VOD-POS-000002, ...
-- Online orders keep using VOD-ORD-XXXXXX.
CREATE SEQUENCE IF NOT EXISTS pos_order_number_seq START 1;
