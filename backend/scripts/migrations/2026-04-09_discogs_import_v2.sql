-- Discogs Import v2: Erweiterte Datenübernahme
-- Applied: 2026-04-09 via Supabase MCP
-- Idempotent: IF NOT EXISTS auf allen Statements

-- 1. Image: Source-Tracking (legacy | discogs | manual)
ALTER TABLE "Image" ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'legacy';

-- 2. Release: Genres + Styles (PostgreSQL Arrays)
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS genres TEXT[];
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS styles TEXT[];

-- 3. Release: Discogs-Preis-History mit Zeitstempel + Quelle
-- Format: [{ "date": "ISO", "source": "discogs_collection_import", "lowest": N, "median": N, "highest": N, "num_for_sale": N, "have": N, "want": N }]
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS discogs_price_history JSONB;

-- 4. Release: Zusätzliche Labels (über das erste hinaus)
-- Format: [{ "name": "Label Name", "catno": "CAT-123", "discogs_id": 12345 }]
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS additional_labels JSONB;

-- 5. Release: Data-Source Marker (legacy | discogs_import | manual)
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS data_source TEXT DEFAULT 'legacy';
