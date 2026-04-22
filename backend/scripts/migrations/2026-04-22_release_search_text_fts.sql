-- Release Multi-Word Search via Postgres Full-Text-Search (FTS).
--
-- Kontext: Die bisherige Multi-Column-ILIKE-OR Query (UNION ueber trgm-Indizes)
-- funktioniert fuer Single-Word-Queries mit ~130ms Latenz, aber **nicht** fuer
-- Multi-Word-Queries. Beispiel: "music various" wird als Substring "music
-- various" gesucht, findet deshalb NICHT den Release VOD-16530 (Various,
-- Music, Vanity Records), obwohl der semantisch genau passt.
--
-- Plus: INTERSECT-based AND ueber trgm-Indizes ist bei generischen Tokens
-- langsam (13s bei "music & various" wegen ~5k Rows via Artist-JOIN).
--
-- Loesung: Denormalisierte `Release.search_text` Spalte mit title +
-- catalogNumber + article_number + artist.name + label.name, plus GIN
-- tsvector Index. Query via `@@ to_tsquery('token1:* & token2:*')` nutzt
-- den Index direkt (Bitmap Heap Scan), ~20ms Latenz auch bei Multi-Word.
--
-- Trigger sorgt fuer automatische Re-Kompilation bei Release INSERT/UPDATE.
-- LIMITATION: Artist/Label-Namensaenderungen triggern KEIN search_text-
-- Update — kommt bei VOD praktisch nicht vor, aber ggf. via periodischem
-- Reindex-Script nachziehen.

-- Step 1: Spalte + Backfill
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS search_text TEXT;

UPDATE "Release" r
SET search_text = LOWER(CONCAT_WS(' ',
  r.title,
  r."catalogNumber",
  r.article_number,
  (SELECT name FROM "Artist" WHERE id = r."artistId"),
  (SELECT name FROM "Label" WHERE id = r."labelId")
))
WHERE r.search_text IS NULL;  -- idempotent: nur neu-unbefuellte Rows

-- Step 2: GIN tsvector Index (COALESCE damit NULL-Rows weggefiltert werden)
CREATE INDEX IF NOT EXISTS idx_release_search_fts
  ON "Release" USING gin (to_tsvector('simple', coalesce(search_text, '')));

-- Step 3: Trigger fuer automatische Pflege bei Release INSERT/UPDATE
CREATE OR REPLACE FUNCTION update_release_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := LOWER(CONCAT_WS(' ',
    NEW.title,
    NEW."catalogNumber",
    NEW.article_number,
    (SELECT name FROM "Artist" WHERE id = NEW."artistId"),
    (SELECT name FROM "Label" WHERE id = NEW."labelId")
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS release_update_search_text ON "Release";
CREATE TRIGGER release_update_search_text
  BEFORE INSERT OR UPDATE OF title, "catalogNumber", article_number, "artistId", "labelId"
  ON "Release" FOR EACH ROW EXECUTE FUNCTION update_release_search_text();

-- Verifikation:
--   SELECT COUNT(*) FROM "Release" WHERE search_text IS NOT NULL;     -- == total
--   EXPLAIN SELECT id FROM "Release" WHERE to_tsvector('simple', coalesce(search_text,''))
--     @@ to_tsquery('simple','music:* & various:*');  -- zeigt idx_release_search_fts
--   SELECT id, title FROM "Release"
--     WHERE to_tsvector('simple', coalesce(search_text,'')) @@ to_tsquery('simple','music:* & various:* & vanity:*');
--     -- → legacy-release-20267 als Top-Treffer
