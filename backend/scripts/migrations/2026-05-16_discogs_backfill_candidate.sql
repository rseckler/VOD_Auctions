-- Discogs-Metadaten-Backfill Review-Tool — Staging-Tabelle.
-- Angewendet 2026-05-16 via Supabase MCP apply_migration (rc70.0).
--
-- Transiente Operations-Tabelle: bewusst NICHT in vod_auctions_pub aufgenommen
-- (Daten aus Discogs jederzeit rekonstruierbar, kein DR-Bedarf). Idempotent.
--
-- Konzept: docs/optimizing/DISCOGS_BACKFILL_TOOL_KONZEPT.md

CREATE TABLE IF NOT EXISTS discogs_backfill_candidate (
  id          text PRIMARY KEY,
  release_id  text NOT NULL UNIQUE,
  discogs_id  integer NOT NULL,
  status      text NOT NULL DEFAULT 'fetch_pending'
              CHECK (status IN ('fetch_pending','pending','applied','rejected','error')),
  gaps        text[] NOT NULL DEFAULT '{}',
  proposed    jsonb,
  error       text,
  fetched_at  timestamptz,
  applied_at  timestamptz,
  applied_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discogs_backfill_status
  ON discogs_backfill_candidate (status);
