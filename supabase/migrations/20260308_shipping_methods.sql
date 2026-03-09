-- Feature C: Shipping Methods / Carrier Configuration
-- Adds shipping_method table for per-zone carrier/method management

-- 1. Create shipping_method table
CREATE TABLE IF NOT EXISTS shipping_method (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL REFERENCES shipping_zone(id) ON DELETE CASCADE,
  carrier_name TEXT NOT NULL,
  method_name TEXT NOT NULL,
  delivery_days_min INTEGER,
  delivery_days_max INTEGER,
  has_tracking BOOLEAN DEFAULT false,
  tracking_url_pattern TEXT,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shipping_method_zone ON shipping_method(zone_id);
CREATE INDEX IF NOT EXISTS idx_shipping_method_active ON shipping_method(is_active);

-- RLS
ALTER TABLE shipping_method ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on shipping_method" ON shipping_method FOR SELECT USING (true);
CREATE POLICY "Allow service role full access on shipping_method" ON shipping_method FOR ALL USING (true);

-- 2. Add shipping_method_id to shipping_rate
ALTER TABLE shipping_rate ADD COLUMN IF NOT EXISTS shipping_method_id TEXT REFERENCES shipping_method(id) ON DELETE SET NULL;

-- 3. Add shipping_method_id to transaction
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS shipping_method_id TEXT;

-- 4. Seed default shipping methods with carrier templates
-- Germany zone
INSERT INTO shipping_method (id, zone_id, carrier_name, method_name, delivery_days_min, delivery_days_max, has_tracking, tracking_url_pattern, is_default, is_active, sort_order)
VALUES
  ('sm-de-post-standard', (SELECT id FROM shipping_zone WHERE slug = 'de'), 'Deutsche Post', 'Warenpost', 2, 4, false, 'https://www.deutschepost.de/de/s/sendungsverfolgung.html?piececode={tracking}', true, true, 1),
  ('sm-de-dhl-paket', (SELECT id FROM shipping_zone WHERE slug = 'de'), 'DHL Paket', 'Standard', 1, 3, true, 'https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode={tracking}', false, true, 2)
ON CONFLICT (id) DO NOTHING;

-- EU zone
INSERT INTO shipping_method (id, zone_id, carrier_name, method_name, delivery_days_min, delivery_days_max, has_tracking, tracking_url_pattern, is_default, is_active, sort_order)
VALUES
  ('sm-eu-post-standard', (SELECT id FROM shipping_zone WHERE slug = 'eu'), 'Deutsche Post', 'International Standard', 5, 10, false, 'https://www.deutschepost.de/de/s/sendungsverfolgung.html?piececode={tracking}', true, true, 1),
  ('sm-eu-dhl-paket', (SELECT id FROM shipping_zone WHERE slug = 'eu'), 'DHL Paket', 'International', 3, 7, true, 'https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode={tracking}', false, true, 2)
ON CONFLICT (id) DO NOTHING;

-- World zone
INSERT INTO shipping_method (id, zone_id, carrier_name, method_name, delivery_days_min, delivery_days_max, has_tracking, tracking_url_pattern, is_default, is_active, sort_order)
VALUES
  ('sm-world-post-standard', (SELECT id FROM shipping_zone WHERE slug = 'world'), 'Deutsche Post', 'International Standard', 7, 21, false, 'https://www.deutschepost.de/de/s/sendungsverfolgung.html?piececode={tracking}', true, true, 1),
  ('sm-world-dhl-paket', (SELECT id FROM shipping_zone WHERE slug = 'world'), 'DHL Paket', 'International Premium', 5, 14, true, 'https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode={tracking}', false, true, 2)
ON CONFLICT (id) DO NOTHING;
