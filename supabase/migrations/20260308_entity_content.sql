-- Migration: Entity Content for SEO Entity Pages (Bands, Labels, Press Orga)
-- Date: 2026-03-08
-- Purpose: CMS-editable content for /band/:slug, /label/:slug, /press/:slug pages

CREATE TABLE IF NOT EXISTS entity_content (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,              -- 'artist' | 'label' | 'press_orga'
    entity_id TEXT NOT NULL,                -- FK to Artist.id / Label.id / PressOrga.id

    -- CMS Content
    description TEXT,                       -- Main text (AI-generated, manually editable)
    short_description TEXT,                 -- Meta description (max 300 chars)

    -- Additional metadata
    country TEXT,
    founded_year TEXT,
    genre_tags TEXT[],                      -- Array of genre tags
    external_links JSONB,                   -- { website, discogs, bandcamp, wikipedia }

    -- Status
    is_published BOOLEAN DEFAULT false,
    ai_generated BOOLEAN DEFAULT false,
    ai_generated_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(entity_type, entity_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entity_content_type ON entity_content(entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_content_entity ON entity_content(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_content_published ON entity_content(is_published);
CREATE INDEX IF NOT EXISTS idx_entity_content_type_published ON entity_content(entity_type, is_published);

-- RLS
ALTER TABLE entity_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entity_content_read" ON entity_content FOR SELECT USING (true);
CREATE POLICY "entity_content_admin" ON entity_content FOR ALL USING (true) WITH CHECK (true);
