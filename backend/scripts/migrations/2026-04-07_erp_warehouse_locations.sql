-- ERP: Warehouse Locations
-- Configurable storage locations for inventory management.
-- Table is empty at creation — managed via Admin UI (/app/erp/locations).
--
-- Rollback: DROP TABLE IF EXISTS warehouse_location;
--           DROP INDEX IF EXISTS warehouse_location_one_default;
--           DROP INDEX IF EXISTS warehouse_location_active;

CREATE TABLE IF NOT EXISTS warehouse_location (
  id            TEXT        PRIMARY KEY,
  code          TEXT        UNIQUE NOT NULL,     -- Short identifier, e.g. "FRANK_MAIN", "ROBIN_KELLER"
  name          TEXT        NOT NULL,            -- Human-readable display name
  description   TEXT,                            -- Optional details about this location
  address       TEXT,                            -- Physical address (free-text, optional)
  contact_name  TEXT,                            -- Responsible person (optional)
  contact_email TEXT,                            -- Contact email (optional)
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  is_default    BOOLEAN     NOT NULL DEFAULT false,  -- Exactly one location can be the default
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce single default: only one row can have is_default = true at any time.
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_location_one_default
  ON warehouse_location (is_default)
  WHERE is_default = true;

-- For efficient active-sorted listing.
CREATE INDEX IF NOT EXISTS warehouse_location_active
  ON warehouse_location (is_active, sort_order, name);
