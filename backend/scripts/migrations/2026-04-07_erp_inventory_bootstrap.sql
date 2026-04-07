-- ────────────────────────────────────────────────────────────────────────────
-- 2026-04-07 — ERP Inventory Bootstrap (Phase 1 of INVENTUR_COHORT_A_KONZEPT)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Creates the three tables needed for the Cohort A stocktake:
--   1. erp_inventory_item     — per ERP-Konzept §10 + 4 stocktake extensions
--   2. erp_inventory_movement — per ERP-Konzept §10 (audit trail, every status change)
--   3. bulk_price_adjustment_log — idempotency guard for the +15% bulk operation
--
-- Schema follows ERP_WARENWIRTSCHAFT_KONZEPT.md §10 (lines 1683-1776) exactly,
-- with two deliberate deviations:
--   a) commission_owner FK is OMITTED (commission_owner table doesn't exist yet).
--      commission_owner_id is TEXT NULLABLE without FK constraint.
--   b) Four stocktake columns added to erp_inventory_item:
--      price_locked, price_locked_at, last_stocktake_at, last_stocktake_by
--
-- Safety:
--   • All CREATE TABLE IF NOT EXISTS — idempotent, safe to re-run
--   • No existing tables are modified
--   • Rollback: DROP TABLE erp_inventory_item, erp_inventory_movement, bulk_price_adjustment_log CASCADE;
--
-- How to apply:
--   psql "$DATABASE_URL" -f backend/scripts/migrations/2026-04-07_erp_inventory_bootstrap.sql
--
-- Test first on staging:
--   PGHOST=aws-0-eu-west-1.pooler.supabase.com PGPORT=5432 \
--   PGUSER=postgres.aebcwjjcextzvflrjgei PGDATABASE=postgres \
--   PGPASSWORD=$(op item get "Supabase 2. Account" --fields "Database password" --reveal) \
--   psql -f backend/scripts/migrations/2026-04-07_erp_inventory_bootstrap.sql
--
-- ────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. erp_inventory_item
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS erp_inventory_item (
    id TEXT PRIMARY KEY,
    release_id TEXT NOT NULL,

    -- Quelle und Eigentum
    source TEXT NOT NULL
        CHECK (source IN ('frank_collection', 'commission', 'vod_records')),
    commission_owner_id TEXT,           -- FK zu commission_owner(id) — constraint wird
                                        -- in einer späteren Migration nachgezogen wenn
                                        -- die commission_owner Tabelle existiert.
    seller_id TEXT,                      -- Strukturell für Marketplace, aktuell immer NULL.

    -- Einkauf (für §25a-Marge)
    purchase_price NUMERIC(10,2),       -- NULL = unbekannt (Franks alte Sammlung)
    purchase_date DATE,
    purchase_reference TEXT,

    -- Steuerschema
    tax_scheme TEXT NOT NULL DEFAULT 'margin_scheme_25a'
        CHECK (tax_scheme IN ('margin_scheme_25a', 'standard', 'exempt')),
    tax_scheme_override BOOLEAN DEFAULT false,
    tax_scheme_override_reason TEXT,

    -- Lager
    warehouse_location_id TEXT,         -- FK zu warehouse_location(id) wenn vorhanden
    condition TEXT
        CHECK (condition IN ('mint', 'near_mint', 'very_good_plus', 'very_good',
                             'good_plus', 'good', 'fair', 'poor', 'unknown')),

    -- Bestand
    quantity INTEGER NOT NULL DEFAULT 1,
    quantity_reserved INTEGER NOT NULL DEFAULT 0,
    quantity_available INTEGER GENERATED ALWAYS AS (quantity - quantity_reserved) STORED,

    -- Status
    status TEXT NOT NULL DEFAULT 'in_stock'
        CHECK (status IN ('in_stock', 'reserved', 'in_auction', 'sold', 'shipped',
                          'returned', 'damaged', 'written_off')),

    -- Provision (nur bei Commission)
    commission_rate NUMERIC(5,2),

    -- Metadaten
    notes TEXT,

    -- ─── Stocktake extensions (nicht in ERP-Konzept §10) ────────────────
    price_locked BOOLEAN NOT NULL DEFAULT false,
    price_locked_at TIMESTAMPTZ,
    last_stocktake_at TIMESTAMPTZ,
    last_stocktake_by TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT commission_requires_owner
        CHECK (source != 'commission' OR commission_owner_id IS NOT NULL)
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_erp_inventory_item_release
    ON erp_inventory_item(release_id);
CREATE INDEX IF NOT EXISTS idx_erp_inventory_item_source
    ON erp_inventory_item(source);
CREATE INDEX IF NOT EXISTS idx_erp_inventory_item_status
    ON erp_inventory_item(status);
CREATE INDEX IF NOT EXISTS idx_erp_inventory_item_price_locked
    ON erp_inventory_item(release_id)
    WHERE price_locked = true;
CREATE INDEX IF NOT EXISTS idx_erp_inventory_item_stocktake_pending
    ON erp_inventory_item(last_stocktake_at NULLS FIRST, release_id)
    WHERE last_stocktake_at IS NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. erp_inventory_movement
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS erp_inventory_movement (
    id TEXT PRIMARY KEY,
    inventory_item_id TEXT NOT NULL REFERENCES erp_inventory_item(id),

    type TEXT NOT NULL
        CHECK (type IN (
            'inbound',              -- Wareneingang (Einlagerung)
            'reservation',          -- Reservierung (Auktion/Warenkorb)
            'reservation_release',  -- Reservierung aufgehoben
            'sale',                 -- Verkauf (Payment confirmed)
            'shipment',             -- Versand (Label erstellt)
            'delivery',             -- Zustellung (Carrier-Bestätigung)
            'return_inbound',       -- Retoure eingegangen
            'return_processed',     -- Retoure verarbeitet
            'adjustment',           -- Manuelle Korrektur (Inventur, Preis, Beschädigung)
            'write_off'             -- Abschreibung
        )),

    quantity_change INTEGER NOT NULL,   -- positiv = Zugang, negativ = Abgang

    -- Referenzen
    transaction_id TEXT,                -- FK zu transaction(id)
    block_item_id TEXT,                 -- FK zu block_item(id)
    settlement_id TEXT,                 -- FK zu commission_settlement(id)

    reference TEXT,                     -- Freitext oder JSON: Beleg-Nr, alter Preis, etc.
    reason TEXT,                        -- Begründung (Pflicht bei adjustment/write_off)
    performed_by TEXT,                  -- Admin-Email oder 'system'

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_inventory_movement_item
    ON erp_inventory_movement(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_erp_inventory_movement_type
    ON erp_inventory_movement(type);
CREATE INDEX IF NOT EXISTS idx_erp_inventory_movement_transaction
    ON erp_inventory_movement(transaction_id)
    WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_erp_inventory_movement_created
    ON erp_inventory_movement(created_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. bulk_price_adjustment_log (Idempotenz-Guard für +15% Bulk)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bulk_price_adjustment_log (
    id TEXT PRIMARY KEY,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    executed_by TEXT NOT NULL,
    percentage INTEGER NOT NULL,
    affected_rows INTEGER,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'success', 'failed')),
    notes TEXT
);


-- ═══════════════════════════════════════════════════════════════════════════
-- Sanity check (uncomment to verify after apply):
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT 'erp_inventory_item' AS tbl, COUNT(*) FROM erp_inventory_item
-- UNION ALL SELECT 'erp_inventory_movement', COUNT(*) FROM erp_inventory_movement
-- UNION ALL SELECT 'bulk_price_adjustment_log', COUNT(*) FROM bulk_price_adjustment_log;
