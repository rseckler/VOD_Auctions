-- Discogs Import Refactoring: Sessions + Cache → PostgreSQL, pg_trgm Fuzzy-Matching
-- Applied: 2026-04-10 via Supabase MCP
-- Idempotent: IF NOT EXISTS auf allen Statements
-- Referenz: docs/DISCOGS_IMPORT_REFACTORING_PLAN.md

-- 1. PostgreSQL Extensions für Fuzzy-Matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- 2. Import Session (ersetzt In-Memory Map)
CREATE TABLE IF NOT EXISTS import_session (
    id TEXT PRIMARY KEY,
    collection_name TEXT NOT NULL,
    filename TEXT NOT NULL,
    rows JSONB NOT NULL,
    row_count INTEGER NOT NULL,
    unique_count INTEGER NOT NULL,
    format_detected TEXT,
    export_type TEXT,
    status TEXT DEFAULT 'uploaded',
    fetch_progress JSONB,
    analysis_result JSONB,
    import_settings JSONB,
    selected_ids JSONB,
    run_id TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_import_session_status ON import_session(status);
CREATE INDEX IF NOT EXISTS idx_import_session_created ON import_session(created_at);

-- 3. Discogs API Cache (ersetzt JSON-Datei)
CREATE TABLE IF NOT EXISTS discogs_api_cache (
    discogs_id INTEGER PRIMARY KEY,
    api_data JSONB NOT NULL,
    suggested_prices JSONB,
    is_error BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);
CREATE INDEX IF NOT EXISTS idx_discogs_cache_expires ON discogs_api_cache(expires_at);

-- 4. GIN-Index für Trigram-Matching auf Release.title
CREATE INDEX IF NOT EXISTS idx_release_title_trgm
    ON "Release" USING GIN ((lower(title)) gin_trgm_ops);
