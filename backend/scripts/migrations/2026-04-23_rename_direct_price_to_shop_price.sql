-- Rename Release.direct_price → Release.shop_price
--
-- Begriffswechsel: Der Inventory-Process-Preis ist ab jetzt der einzige
-- "Shop-Preis". legacy_price (aus tape-mag MySQL) ist nur noch historische
-- Info, kein Shop-Preis mehr. discogs_lowest_price bleibt ebenfalls reine
-- Marktreferenz.
--
-- Diese Migration ist idempotent: wenn shop_price schon existiert (Teil-
-- Deploy oder Rerun) wird der Rename-Schritt übersprungen.

-- 1) Column Rename
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'Release'
               AND column_name = 'direct_price')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'Release'
                       AND column_name = 'shop_price') THEN
    ALTER TABLE "Release" RENAME COLUMN direct_price TO shop_price;
  END IF;
END $$;

-- 2) Backfill: verifizierte Items die shop_price IS NULL oder 0 haben aber
--    legacy_price > 0 — shop_price = legacy_price, sale_mode = 'both'
--    (nur wo aktuell 'auction_only' oder NULL, nie 'direct_purchase' überschreiben)
UPDATE "Release" r
SET
  shop_price = r.legacy_price,
  sale_mode = CASE
    WHEN r.sale_mode IS NULL OR r.sale_mode = 'auction_only' THEN 'both'
    ELSE r.sale_mode
  END,
  "updatedAt" = NOW()
WHERE EXISTS (
    SELECT 1 FROM erp_inventory_item ii
    WHERE ii.release_id = r.id
      AND ii.last_stocktake_at IS NOT NULL
      AND ii.price_locked = true
  )
  AND (r.shop_price IS NULL OR r.shop_price = 0)
  AND r.legacy_price IS NOT NULL
  AND r.legacy_price > 0;

-- 3) Reassign Warehouse-Default ALPENSTRASSE für verifizierte Items ohne Location
UPDATE erp_inventory_item ii
SET warehouse_location_id = (
  SELECT id FROM warehouse_location WHERE is_default = true AND is_active = true LIMIT 1
),
updated_at = NOW()
WHERE ii.source = 'frank_collection'
  AND ii.last_stocktake_at IS NOT NULL
  AND ii.warehouse_location_id IS NULL
  AND EXISTS (SELECT 1 FROM warehouse_location WHERE is_default = true AND is_active = true);

-- 4) Check
--    SELECT shop_price, sale_mode, COUNT(*)
--    FROM "Release" r
--    WHERE EXISTS (SELECT 1 FROM erp_inventory_item ii
--                  WHERE ii.release_id = r.id
--                    AND ii.last_stocktake_at IS NOT NULL
--                    AND ii.price_locked = true)
--    GROUP BY 1, 2 ORDER BY 3 DESC;
