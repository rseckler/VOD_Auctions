-- ============================================================
-- VOD_Auctions: Schema Extension for Full Legacy Migration
-- Run against Supabase PostgreSQL
-- ============================================================

-- 1. New columns on Release table
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS legacy_price DECIMAL(10,2);
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS legacy_condition TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS legacy_availability INTEGER DEFAULT 0;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS tracklist JSONB;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS credits TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS legacy_format_detail TEXT;

-- Index for filtering by condition and price
CREATE INDEX IF NOT EXISTS idx_release_legacy_price ON "Release"(legacy_price) WHERE legacy_price IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_release_legacy_condition ON "Release"(legacy_condition) WHERE legacy_condition IS NOT NULL;

-- 2. ReleaseArtist table (Various Artists / Compilations M:N)
CREATE TABLE IF NOT EXISTS "ReleaseArtist" (
    id TEXT PRIMARY KEY,
    "releaseId" TEXT NOT NULL REFERENCES "Release"(id) ON DELETE CASCADE,
    "artistId" TEXT NOT NULL REFERENCES "Artist"(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'performer',
    "createdAt" TIMESTAMP DEFAULT NOW(),
    UNIQUE("releaseId", "artistId")
);
CREATE INDEX IF NOT EXISTS idx_release_artist_release ON "ReleaseArtist"("releaseId");
CREATE INDEX IF NOT EXISTS idx_release_artist_artist ON "ReleaseArtist"("artistId");

-- 3. Comment table (legacy user comments/ratings)
CREATE TABLE IF NOT EXISTS "Comment" (
    id TEXT PRIMARY KEY,
    "releaseId" TEXT NOT NULL REFERENCES "Release"(id) ON DELETE CASCADE,
    author TEXT,
    email TEXT,
    body TEXT,
    rating INTEGER,
    legacy_date TIMESTAMP,
    visible BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comment_release ON "Comment"("releaseId");

-- 4. ArtistLink table (band_lit - artist literature/external links)
CREATE TABLE IF NOT EXISTS "ArtistLink" (
    id TEXT PRIMARY KEY,
    "artistId" TEXT NOT NULL REFERENCES "Artist"(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    link_type TEXT DEFAULT 'website',
    "createdAt" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_artist_link_artist ON "ArtistLink"("artistId");

-- 5. LabelLink table (labels_lit - label literature/external links)
CREATE TABLE IF NOT EXISTS "LabelLink" (
    id TEXT PRIMARY KEY,
    "labelId" TEXT NOT NULL REFERENCES "Label"(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    link_type TEXT DEFAULT 'website',
    "createdAt" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_label_link_label ON "LabelLink"("labelId");

-- 6. Katalog table (catalog cross-reference entries)
CREATE TABLE IF NOT EXISTS "Katalog" (
    id TEXT PRIMARY KEY,
    "releaseId" TEXT REFERENCES "Release"(id) ON DELETE SET NULL,
    "artistId" TEXT REFERENCES "Artist"(id) ON DELETE SET NULL,
    "labelId" TEXT REFERENCES "Label"(id) ON DELETE SET NULL,
    title TEXT,
    catalog_number TEXT,
    format TEXT,
    year INTEGER,
    notes TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_katalog_release ON "Katalog"("releaseId");
CREATE INDEX IF NOT EXISTS idx_katalog_artist ON "Katalog"("artistId");

-- Done
SELECT 'Schema extension complete' as status;
