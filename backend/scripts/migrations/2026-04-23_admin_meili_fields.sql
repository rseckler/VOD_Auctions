-- Admin-Meilisearch Phase 2 (rc48):
-- Erweitert Trigger-Coverage damit auch Admin-spezifische Felder (Import-
-- History, Warehouse-Assignments, Estimated-Value) den Meili-Delta-Sync
-- triggern. Bestehende Trigger aus 2026-04-22_meilisearch_sync_tables.sql
-- decken Release-Self + entity_content + erp_inventory_item bereits ab.
--
-- NEU:
--   (1) Trigger auf import_log AFTER INSERT → bumpe Release.search_indexed_at
--       damit neue Import-Collections im Admin-Filter "Import-Collection"
--       sofort beim nächsten Delta-Cron sichtbar sind.
--   (2) Whitelist um estimated_value + media_condition + sleeve_condition
--       erweitern (waren bisher nicht in der 22-Feld-Liste).
--
-- Idempotent: CREATE OR REPLACE überall.

-- ─── (1) import_log → Release-Bump ────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_release_indexed_at_import_log() RETURNS trigger AS $$
BEGIN
  IF NEW.release_id IS NOT NULL THEN
    UPDATE "Release"
       SET search_indexed_at = NULL
     WHERE id = NEW.release_id
       AND (search_indexed_at IS NULL OR search_indexed_at < NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_release_indexed_at_import_log ON import_log;
CREATE TRIGGER trg_release_indexed_at_import_log
  AFTER INSERT ON import_log
  FOR EACH ROW EXECUTE FUNCTION trigger_release_indexed_at_import_log();

-- ─── (2) Release-Self-Trigger um 3 Felder erweitern ──────────────────────
-- shop_price ist seit rc47.2 drin. Ergänzen: estimated_value, media_condition,
-- sleeve_condition — letztere beiden weil Admin-Detail-Form sie ändert und
-- das Catalog-Listing die Werte anzeigen soll.
CREATE OR REPLACE FUNCTION trigger_release_indexed_at_self() RETURNS trigger AS $$
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
     OR (NEW.shop_price IS DISTINCT FROM OLD.shop_price)
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
     OR (NEW.estimated_value IS DISTINCT FROM OLD.estimated_value)
     OR (NEW.media_condition IS DISTINCT FROM OLD.media_condition)
     OR (NEW.sleeve_condition IS DISTINCT FROM OLD.sleeve_condition)
  THEN
    NEW.search_indexed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Check:
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_release_indexed_at_import_log';
--   → sollte existieren
