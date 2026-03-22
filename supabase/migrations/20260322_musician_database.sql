-- ============================================================================
-- MUSICIAN DATABASE — Phase 3 of Entity Content Overhaul (RSE-227)
-- Creates musician, musician_role, musician_project tables
-- Enables structured member data for bands + future /musician/[slug] pages
-- ============================================================================

-- 1. Musician table — individual persons
CREATE TABLE IF NOT EXISTS musician (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    real_name TEXT,
    birth_year INTEGER,
    death_year INTEGER,
    country TEXT,
    bio TEXT,
    photo_url TEXT,
    discogs_id INTEGER,
    musicbrainz_id TEXT,
    short_description TEXT,
    data_source TEXT,                  -- 'discogs' | 'musicbrainz' | 'credits' | 'ai' | 'manual'
    confidence DECIMAL(3,2) DEFAULT 1.00,
    needs_review BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Musician Role — links musicians to bands/artists in our DB
CREATE TABLE IF NOT EXISTS musician_role (
    id TEXT PRIMARY KEY,
    musician_id TEXT NOT NULL REFERENCES musician(id) ON DELETE CASCADE,
    artist_id TEXT NOT NULL REFERENCES "Artist"(id) ON DELETE CASCADE,
    role TEXT NOT NULL,                -- 'vocals', 'electronics', 'guitar', etc.
    active_from INTEGER,              -- Year joined
    active_to INTEGER,                -- Year left (NULL = current)
    is_founder BOOLEAN DEFAULT false,
    UNIQUE(musician_id, artist_id, role)
);

-- 3. Musician Project — cross-project links (musician in multiple bands)
CREATE TABLE IF NOT EXISTS musician_project (
    id TEXT PRIMARY KEY,
    musician_id TEXT NOT NULL REFERENCES musician(id) ON DELETE CASCADE,
    project_name TEXT NOT NULL,
    project_artist_id TEXT REFERENCES "Artist"(id) ON DELETE SET NULL,
    role TEXT,
    years TEXT,                        -- e.g. "1982-1995"
    UNIQUE(musician_id, project_name)
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_musician_slug ON musician(slug);
CREATE INDEX IF NOT EXISTS idx_musician_discogs ON musician(discogs_id) WHERE discogs_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_musician_musicbrainz ON musician(musicbrainz_id) WHERE musicbrainz_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_musician_needs_review ON musician(needs_review) WHERE needs_review = true;
CREATE INDEX IF NOT EXISTS idx_musician_role_artist ON musician_role(artist_id);
CREATE INDEX IF NOT EXISTS idx_musician_role_musician ON musician_role(musician_id);
CREATE INDEX IF NOT EXISTS idx_musician_project_musician ON musician_project(musician_id);

-- 5. RLS
ALTER TABLE musician ENABLE ROW LEVEL SECURITY;
ALTER TABLE musician_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE musician_project ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read musician" ON musician FOR SELECT USING (true);
CREATE POLICY "Allow admin musician" ON musician FOR ALL USING (true);
CREATE POLICY "Allow read musician_role" ON musician_role FOR SELECT USING (true);
CREATE POLICY "Allow admin musician_role" ON musician_role FOR ALL USING (true);
CREATE POLICY "Allow read musician_project" ON musician_project FOR SELECT USING (true);
CREATE POLICY "Allow admin musician_project" ON musician_project FOR ALL USING (true);

-- Done
SELECT 'Musician database created: 3 tables, 7 indexes, RLS enabled' as status;
