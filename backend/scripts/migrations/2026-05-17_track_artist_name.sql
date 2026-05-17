-- Per-Track-Künstler — strukturierte Spalte (rc71.6).
--
-- Bei Compilations liefert Discogs pro Track ein eigenes artists[]-Array.
-- rc71.4 hatte den Künstler als "Artist – Titel" in Track.title gebacken —
-- das machte ihn sichtbar, aber nicht suchbar und nicht klickbar. rc71.6 macht
-- ihn zu einem eigenen Feld; `title` wird wieder der reine Songtitel.
--
-- REIHENFOLGE: ZUERST auf der pg17-replica (DB vod_auctions_replica) anwenden,
-- DANN auf Supabase. `Track` ist im public-Schema → schema-weite Publication
-- `vod_auctions_pub` → die Spalte MUSS auf der Replica existieren, bevor
-- Supabase-DML sie streamt, sonst crash-loopt der Apply-Worker (vgl. rc71.1).
--
-- Konzept: docs/optimizing/TRACK_ARTIST_STRUKTURIERT_KONZEPT.md

ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS artist_name text;
