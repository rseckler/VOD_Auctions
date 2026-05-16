-- Discogs-Metadaten-Backfill Review-Tool — Staging-Tabelle.
-- Angewendet 2026-05-16 via Supabase MCP apply_migration (rc70.0).
--
-- WICHTIG (rc71.1): vod_auctions_pub ist schema-weit (FOR TABLES IN SCHEMA
-- public) — diese Tabelle wird automatisch publiziert. Dieselbe DDL MUSS daher
-- auch auf der pg17-replica (DB vod_auctions_replica) laufen, sonst crash-loopt
-- der Apply-Worker. Auf der Replica angewendet 2026-05-16 + REFRESH PUBLICATION
-- WITH (copy_data=false). Idempotent.
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
