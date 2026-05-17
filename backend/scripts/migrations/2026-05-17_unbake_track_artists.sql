-- Un-Bake: gebackene "Artist – Titel" → strukturiertes Track.artist_name (rc71.6).
--
-- rc71.4/rc71.5 hatten den Per-Track-Künstler bei Compilations als "Artist – Titel"
-- in `Track.title` gebacken. rc71.6 macht `artist_name` zu einem eigenen Feld —
-- dieses Skript zieht die bereits gebackenen Werte auseinander:
--   artist_name = Teil vor dem ersten " – "
--   title       = Rest dahinter (reiner Songtitel)
--
-- Nur auf "Various"-Compilations: dort gilt die Bake-Konvention. Bei Single-
-- Artist-Alben könnte ein " – " ein legitimer Bestandteil des Songtitels sein —
-- die werden bewusst NICHT angefasst.
--
-- Idempotent: nach dem Lauf ist `artist_name` gesetzt → `artist_name IS NULL`
-- matcht die Zeile nicht mehr.
--
-- Supabase-only (Track.artist_name wird repliziert; der Track-Trigger aus
-- 2026-05-17_search_text_track_artists.sql kompiliert search_text neu).
-- Voraussetzung: 2026-05-17_track_artist_name.sql ist angewendet.

UPDATE "Track" t
SET artist_name = split_part(t.title, ' – ', 1),
    title       = substring(t.title FROM position(' – ' IN t.title) + 3)
FROM "Release" r
LEFT JOIN "Artist" a ON a.id = r."artistId"
WHERE t."releaseId" = r.id
  AND t.artist_name IS NULL
  AND t.title LIKE '% – %'
  AND COALESCE(r.artist_display_name, a.name) ILIKE 'various%';
