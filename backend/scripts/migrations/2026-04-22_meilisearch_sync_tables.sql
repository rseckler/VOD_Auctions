-- Meilisearch Sync Foundation — search_indexed_at + Triggers + State/Drift Tables
--
-- Creates the delta-detection layer that the Python sync-script uses to
-- figure out which Release rows need to be re-pushed to Meilisearch.
--
-- Architecture (see docs/optimizing/SEARCH_MEILISEARCH_PLAN.md §4.3):
--   1. Release.search_indexed_at = NULL  ==>  "needs reindex"
--   2. Trigger A (Release self)         — bumps NULL on any whitelisted field change
--   3. Trigger B (entity_content)       — bumps NULL on Artist/Label/PressOrga content change
--   4. Trigger C (erp_inventory_item)   — bumps NULL on exemplar/in_stock change
--   5. meilisearch_index_state          — hash-diff + indexed_at per release
--   6. meilisearch_drift_log            — 30-min drift-check log (§11(d))
--
-- Fully idempotent (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS for triggers).

-- ─── Step 1: search_indexed_at column + partial index ──────────────────────
ALTER TABLE "Release"
  ADD COLUMN IF NOT EXISTS search_indexed_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_release_search_indexed_at_null
  ON "Release"(search_indexed_at)
  WHERE search_indexed_at IS NULL;

-- ─── Step 2: Initial backfill — mark all rows as "needs reindex" ──────────
-- Only bumps rows that are currently non-NULL (prevents unnecessary churn
-- on re-runs of this migration).
UPDATE "Release"
   SET search_indexed_at = NULL
 WHERE search_indexed_at IS NOT NULL;

-- ─── Step 3: Trigger A — Release self-update whitelist ─────────────────────
-- Bumps search_indexed_at = NULL when any field that appears in the Meili
-- doc changes. Field whitelist must stay in sync with §3.2 of the plan.
CREATE OR REPLACE FUNCTION trigger_release_indexed_at_self()
RETURNS trigger AS $$
BEGIN
  IF (NEW.title IS DISTINCT FROM OLD.title)
     OR (NEW."catalogNumber" IS DISTINCT FROM OLD."catalogNumber")
     OR (NEW.article_number IS DISTINCT FROM OLD.article_number)
     OR (NEW.year IS DISTINCT FROM OLD.year)
     OR (NEW.country IS DISTINCT FROM OLD.country)
     OR (NEW.format IS DISTINCT FROM OLD.format)
     OR (NEW.format_id IS DISTINCT FROM OLD.format_id)
     OR (NEW.product_category IS DISTINCT FROM OLD.product_category)
     OR (NEW."coverImage" IS DISTINCT FROM OLD."coverImage")
     OR (NEW.legacy_price IS DISTINCT FROM OLD.legacy_price)
     OR (NEW.direct_price IS DISTINCT FROM OLD.direct_price)
     OR (NEW.legacy_available IS DISTINCT FROM OLD.legacy_available)
     OR (NEW.sale_mode IS DISTINCT FROM OLD.sale_mode)
     OR (NEW.auction_status IS DISTINCT FROM OLD.auction_status)
     OR (NEW."artistId" IS DISTINCT FROM OLD."artistId")
     OR (NEW."labelId" IS DISTINCT FROM OLD."labelId")
     OR (NEW."pressOrgaId" IS DISTINCT FROM OLD."pressOrgaId")
     OR (NEW.discogs_lowest_price IS DISTINCT FROM OLD.discogs_lowest_price)
     OR (NEW.discogs_median_price IS DISTINCT FROM OLD.discogs_median_price)
     OR (NEW.discogs_highest_price IS DISTINCT FROM OLD.discogs_highest_price)
     OR (NEW.discogs_num_for_sale IS DISTINCT FROM OLD.discogs_num_for_sale)
     OR (NEW.discogs_last_synced IS DISTINCT FROM OLD.discogs_last_synced)
  THEN
    NEW.search_indexed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS release_indexed_at_self ON "Release";
CREATE TRIGGER release_indexed_at_self
  BEFORE UPDATE ON "Release"
  FOR EACH ROW EXECUTE FUNCTION trigger_release_indexed_at_self();

-- ─── Step 4: Trigger B — entity_content (Artist/Label/PressOrga content) ──
-- When entity_content changes, bump search_indexed_at for all Releases that
-- reference that artist / label / press_orga. AFTER INSERT/UPDATE/DELETE.
CREATE OR REPLACE FUNCTION trigger_release_indexed_at_entity_content()
RETURNS trigger AS $$
DECLARE
  affected_id   TEXT;
  affected_type TEXT;
BEGIN
  affected_id   := COALESCE(NEW.entity_id,   OLD.entity_id);
  affected_type := COALESCE(NEW.entity_type, OLD.entity_type);
  IF affected_id IS NULL OR affected_type IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF affected_type = 'artist' THEN
    UPDATE "Release" SET search_indexed_at = NULL WHERE "artistId"    = affected_id;
  ELSIF affected_type = 'label' THEN
    UPDATE "Release" SET search_indexed_at = NULL WHERE "labelId"     = affected_id;
  ELSIF affected_type = 'press_orga' THEN
    UPDATE "Release" SET search_indexed_at = NULL WHERE "pressOrgaId" = affected_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS release_indexed_at_entity_content ON entity_content;
CREATE TRIGGER release_indexed_at_entity_content
  AFTER INSERT OR UPDATE OR DELETE ON entity_content
  FOR EACH ROW EXECUTE FUNCTION trigger_release_indexed_at_entity_content();

-- ─── Step 5: Trigger C — erp_inventory_item (exemplar_count, in_stock) ────
CREATE OR REPLACE FUNCTION trigger_release_indexed_at_inventory()
RETURNS trigger AS $$
DECLARE
  affected_release TEXT;
BEGIN
  affected_release := COALESCE(NEW.release_id, OLD.release_id);
  IF affected_release IS NOT NULL THEN
    UPDATE "Release" SET search_indexed_at = NULL WHERE id = affected_release;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS release_indexed_at_inventory ON erp_inventory_item;
CREATE TRIGGER release_indexed_at_inventory
  AFTER INSERT OR UPDATE OR DELETE ON erp_inventory_item
  FOR EACH ROW EXECUTE FUNCTION trigger_release_indexed_at_inventory();

-- ─── Step 6: meilisearch_index_state — hash-diff defense-in-depth ─────────
CREATE TABLE IF NOT EXISTS meilisearch_index_state (
  release_id TEXT PRIMARY KEY,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  doc_hash   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meili_state_indexed_at
  ON meilisearch_index_state(indexed_at);

-- ─── Step 7: meilisearch_drift_log — 30-min drift check (§11(d)) ──────────
CREATE TABLE IF NOT EXISTS meilisearch_drift_log (
  id          BIGSERIAL PRIMARY KEY,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  profile     TEXT        NOT NULL,
  db_count    INTEGER     NOT NULL,
  meili_count INTEGER     NOT NULL,
  diff_pct    NUMERIC(6,3) NOT NULL,
  severity    TEXT        NOT NULL CHECK (severity IN ('ok', 'warning', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_meili_drift_log_timestamp
  ON meilisearch_drift_log(timestamp DESC);
