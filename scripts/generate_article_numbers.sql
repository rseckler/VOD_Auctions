-- Generate article numbers for all releases that don't have one yet.
-- Format: VOD-XXXXX (zero-padded, sequential by createdAt)
-- Run against Supabase PostgreSQL.

-- First, add the column if it doesn't exist
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS article_number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_release_article_number ON "Release"(article_number) WHERE article_number IS NOT NULL;

-- Generate article numbers using row_number ordered by createdAt
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
  FROM "Release"
  WHERE article_number IS NULL
)
UPDATE "Release" r
SET article_number = 'VOD-' || LPAD(numbered.rn::TEXT, 5, '0')
FROM numbered
WHERE r.id = numbered.id;

-- Verify
SELECT
  COUNT(*) AS total_releases,
  COUNT(article_number) AS with_article_number,
  MIN(article_number) AS first_number,
  MAX(article_number) AS last_number
FROM "Release";
