-- Catalog Admin sort indexes (rc43)
--
-- /admin/media Default-Sort ist ORDER BY "Release".title ASC. Ohne btree-Index
-- auf title machte Postgres einen Seq Scan + externen Sort auf 52k Rows —
-- spürbar in der Erstlade-Latenz. Der bestehende idx_release_title_trgm ist
-- GIN auf lower(title) für ILIKE-Matches, hilft bei ORDER BY nicht.
--
-- Analog: ORDER BY year für die year_asc/desc-Sorts, wird ebenfalls häufig
-- genutzt.
--
-- Beide Indexes sind additiv + CONCURRENTLY → kein Lock auf Release.
-- Migration ist idempotent.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_release_title_btree
  ON "Release" (title)
  WHERE title IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_release_year_btree
  ON "Release" (year)
  WHERE year IS NOT NULL;

-- Check:
--   EXPLAIN SELECT id, title FROM "Release" ORDER BY title ASC LIMIT 25;
--   → sollte "Index Scan using idx_release_title_btree" zeigen, nicht "Sort"
