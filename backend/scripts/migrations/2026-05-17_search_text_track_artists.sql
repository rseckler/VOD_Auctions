-- search_text um Per-Track-Künstler erweitern (rc71.6).
--
-- Bisher: Release.search_text = title + catalogNumber + article_number +
-- Artist.name + Label.name. Bei Compilations ist Artist.name = "Various" →
-- eine Suche nach einem Track-Künstler ("David Jackman") fand den Sampler nicht.
--
-- rc71.6: search_text nimmt zusätzlich die Track-Künstler (Track.artist_name)
-- der Release auf. Plus ein Track-Trigger, der search_text der Parent-Release
-- bei Track-INSERT/UPDATE/DELETE neu kompiliert.
--
-- NUR auf Supabase anwenden (Trigger werden nicht logisch repliziert; die
-- search_text-Spalte selbst wird als Wert repliziert). Voraussetzung:
-- 2026-05-17_track_artist_name.sql ist bereits angewendet.

-- Release-Trigger-Funktion: Track-Künstler-Aggregat ergänzen.
CREATE OR REPLACE FUNCTION update_release_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := LOWER(CONCAT_WS(' ',
    NEW.title,
    NEW."catalogNumber",
    NEW.article_number,
    (SELECT name FROM "Artist" WHERE id = NEW."artistId"),
    (SELECT name FROM "Label" WHERE id = NEW."labelId"),
    (SELECT string_agg(DISTINCT artist_name, ' ')
       FROM "Track" WHERE "releaseId" = NEW.id AND artist_name IS NOT NULL)
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Track-Trigger: bei jeder Track-Änderung search_text der Parent-Release neu
-- kompilieren. Das UPDATE auf Release.search_text feuert den Release-Trigger
-- NICHT (der hört nur auf title/catalogNumber/article_number/artistId/labelId)
-- → keine Rekursion.
CREATE OR REPLACE FUNCTION track_update_release_search_text() RETURNS trigger AS $$
DECLARE
  rid text;
BEGIN
  rid := COALESCE(NEW."releaseId", OLD."releaseId");
  IF rid IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE "Release" SET search_text = LOWER(CONCAT_WS(' ',
    title,
    "catalogNumber",
    article_number,
    (SELECT name FROM "Artist" WHERE id = "Release"."artistId"),
    (SELECT name FROM "Label" WHERE id = "Release"."labelId"),
    (SELECT string_agg(DISTINCT artist_name, ' ')
       FROM "Track" WHERE "releaseId" = rid AND artist_name IS NOT NULL)
  ))
  WHERE id = rid;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS track_update_release_search_text ON "Track";
CREATE TRIGGER track_update_release_search_text
  AFTER INSERT OR UPDATE OR DELETE
  ON "Track" FOR EACH ROW EXECUTE FUNCTION track_update_release_search_text();
