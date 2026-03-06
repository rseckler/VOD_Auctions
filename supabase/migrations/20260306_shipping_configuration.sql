-- RSE-103: Shipping Configuration — Weight-based shipping with zones and item types
-- Creates 4 new tables: shipping_item_type, shipping_zone, shipping_rate, shipping_config
-- Plus Release column: shipping_item_type_id

-- 1. Shipping Item Types (centralized weight management per article type)
CREATE TABLE IF NOT EXISTS shipping_item_type (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    default_weight_grams INTEGER NOT NULL,
    is_oversized BOOLEAN DEFAULT FALSE,
    format_group TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO shipping_item_type (id, name, slug, default_weight_grams, is_oversized, format_group, sort_order) VALUES
('sit-vinyl-lp', 'Vinyl LP (12")', 'vinyl-lp', 260, TRUE, 'LP', 1),
('sit-vinyl-dlp', 'Vinyl Double LP', 'vinyl-double-lp', 500, TRUE, 'DOUBLE_LP', 2),
('sit-vinyl-10', 'Vinyl 10"', 'vinyl-10', 170, TRUE, '10_INCH', 3),
('sit-vinyl-7', 'Vinyl 7" Single', 'vinyl-7', 80, FALSE, 'SEVEN_INCH', 4),
('sit-cassette', 'Cassette', 'cassette', 80, FALSE, 'CASSETTE', 5),
('sit-cd', 'CD (Jewel Case)', 'cd', 110, FALSE, 'CD', 6),
('sit-cd-digipak', 'CD (Digipak)', 'cd-digipak', 80, FALSE, 'CD_DIGIPAK', 7),
('sit-magazine', 'Magazine / Literature', 'magazine', 200, FALSE, 'MAGAZINE', 8),
('sit-postcard', 'Postcard', 'postcard', 15, FALSE, 'POSTCARD', 9),
('sit-photo', 'Photo / Print', 'photo', 80, FALSE, 'PHOTO', 10),
('sit-merchandise', 'Merchandise', 'merchandise', 250, FALSE, 'MERCHANDISE', 11),
('sit-reel', 'Reel / Tape', 'reel', 400, TRUE, 'REEL', 12),
('sit-other', 'Other', 'other', 150, FALSE, NULL, 99)
ON CONFLICT (id) DO NOTHING;

-- 2. Shipping Zones
CREATE TABLE IF NOT EXISTS shipping_zone (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    countries TEXT[],
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO shipping_zone (id, name, slug, countries, sort_order) VALUES
('zone-de', 'Germany', 'de', ARRAY['DE'], 1),
('zone-eu', 'European Union', 'eu', ARRAY['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'], 2),
('zone-world', 'Worldwide', 'world', NULL, 3)
ON CONFLICT (id) DO NOTHING;

-- 3. Shipping Rates (Zone x Weight Tier matrix with standard/oversized prices)
CREATE TABLE IF NOT EXISTS shipping_rate (
    id TEXT PRIMARY KEY,
    zone_id TEXT NOT NULL REFERENCES shipping_zone(id) ON DELETE CASCADE,
    weight_from_grams INTEGER NOT NULL,
    weight_to_grams INTEGER NOT NULL,
    price_standard DECIMAL(10,2) NOT NULL,
    price_oversized DECIMAL(10,2) NOT NULL,
    carrier_standard TEXT DEFAULT 'Deutsche Post',
    carrier_oversized TEXT DEFAULT 'DHL Paket',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(zone_id, weight_from_grams, weight_to_grams)
);

-- Germany
INSERT INTO shipping_rate (id, zone_id, weight_from_grams, weight_to_grams, price_standard, price_oversized, sort_order) VALUES
('sr-de-1', 'zone-de', 0, 500, 1.99, 6.49, 1),
('sr-de-2', 'zone-de', 501, 1000, 2.99, 6.49, 2),
('sr-de-3', 'zone-de', 1001, 2000, 5.49, 6.49, 3),
('sr-de-4', 'zone-de', 2001, 5000, 7.99, 7.99, 4),
('sr-de-5', 'zone-de', 5001, 10000, 10.99, 10.99, 5),
('sr-de-6', 'zone-de', 10001, 20000, 19.99, 19.99, 6)
ON CONFLICT (id) DO NOTHING;

-- EU
INSERT INTO shipping_rate (id, zone_id, weight_from_grams, weight_to_grams, price_standard, price_oversized, sort_order) VALUES
('sr-eu-1', 'zone-eu', 0, 1000, 7.99, 10.99, 1),
('sr-eu-2', 'zone-eu', 1001, 2000, 10.99, 10.99, 2),
('sr-eu-3', 'zone-eu', 2001, 5000, 17.99, 17.99, 3),
('sr-eu-4', 'zone-eu', 5001, 10000, 22.99, 22.99, 4),
('sr-eu-5', 'zone-eu', 10001, 20000, 28.99, 28.99, 5)
ON CONFLICT (id) DO NOTHING;

-- Worldwide
INSERT INTO shipping_rate (id, zone_id, weight_from_grams, weight_to_grams, price_standard, price_oversized, sort_order) VALUES
('sr-world-1', 'zone-world', 0, 1000, 12.99, 22.99, 1),
('sr-world-2', 'zone-world', 1001, 2000, 22.99, 22.99, 2),
('sr-world-3', 'zone-world', 2001, 5000, 48.99, 48.99, 3),
('sr-world-4', 'zone-world', 5001, 10000, 79.99, 79.99, 4)
ON CONFLICT (id) DO NOTHING;

-- 4. Shipping Config (global settings)
CREATE TABLE IF NOT EXISTS shipping_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    packaging_weight_grams INTEGER DEFAULT 200,
    packaging_weight_small_grams INTEGER DEFAULT 50,
    free_shipping_threshold DECIMAL(10,2),
    default_carrier TEXT DEFAULT 'DHL',
    margin_percent INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO shipping_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- 5. Release extension: optional shipping type override
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS shipping_item_type_id TEXT REFERENCES shipping_item_type(id);

-- 6. RLS policies
ALTER TABLE shipping_item_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_zone ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_config ENABLE ROW LEVEL SECURITY;

-- Allow read access for all (public shipping info)
CREATE POLICY "shipping_item_type_read" ON shipping_item_type FOR SELECT USING (true);
CREATE POLICY "shipping_zone_read" ON shipping_zone FOR SELECT USING (true);
CREATE POLICY "shipping_rate_read" ON shipping_rate FOR SELECT USING (true);
CREATE POLICY "shipping_config_read" ON shipping_config FOR SELECT USING (true);

-- Allow full access for service role (backend)
CREATE POLICY "shipping_item_type_admin" ON shipping_item_type FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "shipping_zone_admin" ON shipping_zone FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "shipping_rate_admin" ON shipping_rate FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "shipping_config_admin" ON shipping_config FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shipping_rate_zone ON shipping_rate(zone_id);
CREATE INDEX IF NOT EXISTS idx_shipping_item_type_format ON shipping_item_type(format_group);
CREATE INDEX IF NOT EXISTS idx_release_shipping_type ON "Release"(shipping_item_type_id);
