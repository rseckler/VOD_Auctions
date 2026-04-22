-- Performance-Fix fuer die Admin Inventur-Search-Route.
--
-- Hintergrund: /admin/erp/inventory/search hatte 5-7s Latenz bei 52k+ Releases,
-- weil die Multi-Column-OR-ILIKE-Query zu einem Seq Scan der Release-Tabelle
-- zwang. Der bestehende idx_release_title_trgm (gin auf lower(title)) wurde
-- nicht genutzt, weil das SQL `title ILIKE ?` statt `lower(title) LIKE ?`
-- benutzte. Ausserdem fehlten trgm-Indizes fuer Artist.name, catalogNumber
-- und article_number komplett.
--
-- Fix zwei-teilig (SQL-Seite hier):
--   1) 3 neue GIN trgm Indizes: Artist.name, Release.catalogNumber,
--      Release.article_number — alle auf lower(col) wie der bestehende
--      title-Index.
--   2) Search-Route in backend/src/api/admin/erp/inventory/search/route.ts
--      auf UNION-ueber-4-Queries umgestellt, damit alle 4 Indizes via
--      BitmapOr kombiniert werden.
--
-- Ergebnis (EXPLAIN ANALYZE gemessen): ~128ms statt ~6000ms — Faktor 47x.
--
-- Idempotent: IF NOT EXISTS. Kann auf Staging + Prod + Local laufen.
-- Keine Downtime: Indizes erstellen blockiert Reads nicht. Fuer ganz grosse
-- Tabellen lieber CREATE INDEX CONCURRENTLY (hier bei 52k Rows nicht noetig).

-- pg_trgm Extension ist auf Prod + Staging schon aktiv (v1.6).
-- Defensiv: nochmal sicherstellen.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Artist.name (64k Rows)
CREATE INDEX IF NOT EXISTS idx_artist_name_trgm
  ON "Artist" USING gin (lower(name) gin_trgm_ops);

-- Release.catalogNumber (52k Rows, Partial-Index da NULL-heavy)
CREATE INDEX IF NOT EXISTS idx_release_catno_trgm
  ON "Release" USING gin (lower("catalogNumber") gin_trgm_ops)
  WHERE "catalogNumber" IS NOT NULL;

-- Release.article_number (Partial-Index aus gleichem Grund)
CREATE INDEX IF NOT EXISTS idx_release_article_trgm
  ON "Release" USING gin (lower(article_number) gin_trgm_ops)
  WHERE article_number IS NOT NULL;

-- Verifikation (kommt als separate Query, hier als Dokumentation):
--   SELECT indexname FROM pg_indexes WHERE tablename IN ('Release','Artist')
--     AND indexname LIKE '%trgm%';
--   → idx_artist_name_trgm
--   → idx_release_article_trgm
--   → idx_release_catno_trgm
--   → idx_release_title_trgm (bestand schon)
