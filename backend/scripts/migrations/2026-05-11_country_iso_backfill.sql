-- ============================================================================
-- Country-ISO Migration (rc54.0) — Phase 4 Backfill + Phase 5 Constraint
-- ============================================================================
--
-- Reference: docs/optimizing/COUNTRY_ISO_MIGRATION_PLAN.md
--            docs/optimizing/COUNTRY_ISO_MIGRATION_IMPLEMENTATION.md (Variante A-Express)
--
-- Strategie: Single-Session Cutover. Backfill schreibt alle 48.743 Non-NULL-
-- Rows auf ISO-3166-1 alpha-2 um (+ deprecated YU/DD/CS/SU + reserved EU/WO).
-- Snapshot-Backup `backup_release_country_pre_iso_migration` ist Rollback-Pfad.
--
-- Reihenfolge (kritisch):
--   Step 0a: empty + whitespace cleanup
--   Step 0b: trim leading/trailing whitespace
--   Step 1:  Mapping-UPDATE (case-insensitive WHERE LOWER(...) = LOWER(...))
--   Step 2:  Already-ISO case-normalize (defensive, sollte 0 Rows treffen)
--   Verify:  leftover_dirty MUSS 0 sein, sonst stoppen
--   Phase 5: CHECK-Constraint hinzufügen
--
-- Erkenntnisse aus Phase 0.5 Sandbox-Test (2026-05-11):
--   - case-insensitive Matching ist defensiv nötig
--   - Backfill MUSS als EIN execute_sql laufen (Supabase MCP rollback-Verhalten)
--   - 2 Mappings ergänzt nach Discogs-Cache-Audit:
--     ('UK & France', 'GB') + ('Australia & New Zealand', 'AU')
--
-- Rollback (wenn Verify fail't):
--   UPDATE "Release" r SET country = b.country_pre, "updatedAt" = b.updatedat_pre
--   FROM backup_release_country_pre_iso_migration b WHERE r.id = b.id;
--
-- ============================================================================

-- ── Step 0a: Empty-Strings + reine Whitespace-Strings auf NULL ──────────────
-- Phase 5 CHECK-Constraint erlaubt nur NULL oder ^[A-Z]{2}$ — empty würde
-- failen. ~49 Rows betroffen.
UPDATE "Release"
SET country = NULL,
    "updatedAt" = NOW()
WHERE country = '' OR trim(country) = '';

-- ── Step 0b: Whitespace trimmen ──────────────────────────────────────────────
-- Vereinzelt liefert Discogs strings mit trailing/leading space.
UPDATE "Release"
SET country = trim(country),
    "updatedAt" = NOW()
WHERE country IS NOT NULL AND country <> trim(country);

-- ── Step 1: Mapping-UPDATE (76 explizite Source-Target-Tupel) ────────────────
-- Case-insensitive Matching: defensive. Prod-Daten haben aktuell kein lowercase
-- (verifiziert 2026-05-11), aber für absolute Robustheit.
UPDATE "Release"
SET country = m.iso_code,
    "updatedAt" = NOW()
FROM (VALUES
  -- ── Major markets ──
  ('Germany', 'DE'),
  ('United States', 'US'),
  ('United Kingdom', 'GB'),
  ('France', 'FR'),
  ('UK', 'GB'),
  ('Netherlands', 'NL'),
  ('Italy', 'IT'),
  ('Belgium', 'BE'),
  ('Japan', 'JP'),
  ('Canada', 'CA'),
  ('Switzerland', 'CH'),
  ('Australia', 'AU'),
  ('Austria', 'AT'),
  ('Spain', 'ES'),
  ('Sweden', 'SE'),
  ('Norway', 'NO'),
  ('Poland', 'PL'),
  ('Denmark', 'DK'),
  ('Portugal', 'PT'),
  ('Iceland', 'IS'),
  ('Hungary', 'HU'),
  ('Greece', 'GR'),
  ('Slovenia', 'SI'),
  ('Finland', 'FI'),
  ('New Zealand', 'NZ'),
  ('Mexico', 'MX'),
  ('South Africa', 'ZA'),
  ('Russia', 'RU'),
  ('Ireland', 'IE'),
  ('Brazil', 'BR'),
  ('Czech Republic', 'CZ'),
  ('Argentina', 'AR'),
  ('Romania', 'RO'),
  ('Israel', 'IL'),
  ('India', 'IN'),
  ('Slovakia', 'SK'),
  ('Turkey', 'TR'),
  ('Peru', 'PE'),
  ('Uruguay', 'UY'),
  ('Colombia', 'CO'),
  ('Venezuela', 'VE'),
  ('Luxembourg', 'LU'),
  ('Philippines', 'PH'),
  ('Hong Kong', 'HK'),
  ('Thailand', 'TH'),
  ('Papua New Guinea', 'PG'),
  ('Chile', 'CL'),
  ('Malaysia', 'MY'),
  ('China', 'CN'),
  ('Guatemala', 'GT'),
  ('Serbia', 'RS'),
  ('Croatia', 'HR'),
  ('Lebanon', 'LB'),
  ('Indonesia', 'ID'),
  ('Lithuania', 'LT'),
  ('Latvia', 'LV'),
  -- ── Multi-Region: Pure-Europe → EU (ISO-exceptionally-reserved) ──
  ('Europe', 'EU'),
  ('European Union', 'EU'),
  -- ── Multi-Region: Worldwide → WO (VOD-intern) ──
  ('Worldwide', 'WO'),
  -- ── Multi-Region: Region-Sammelnamen → primary country ──
  ('Benelux', 'NL'),
  ('Scandinavia', 'SE'),
  -- ── Multi-Region: Compound → primary-country-first ──
  ('UK & Europe', 'GB'),
  ('UK & US', 'GB'),
  ('UK & Ireland', 'GB'),
  ('UK & Germany', 'GB'),
  ('UK & France', 'GB'),                       -- Discogs-Cache-Audit 2026-05-11
  ('UK, Europe & US', 'GB'),
  ('USA & Europe', 'US'),
  ('USA & Canada', 'US'),
  ('USA, Canada & Europe', 'US'),
  ('USA, Canada & UK', 'US'),
  ('Germany, Austria, & Switzerland', 'DE'),
  ('Germany & Switzerland', 'DE'),
  ('France & Benelux', 'FR'),
  ('Australia & New Zealand', 'AU'),           -- Discogs-Cache-Audit 2026-05-11
  -- ── Deprecated ISO-3166-3 (historische Releases) ──
  ('Yugoslavia', 'YU'),
  ('East Germany (GDR)', 'DD'),
  ('German Democratic Republic (GDR)', 'DD'),
  ('USSR', 'SU'),
  ('Czechoslovakia', 'CS'),
  ('Serbia and Montenegro', 'CS')
) AS m(source, iso_code)
WHERE LOWER("Release".country) = LOWER(m.source);

-- ── Step 2: Already-ISO case-normalize (defensive, sollte ~0 Rows treffen) ──
UPDATE "Release"
SET country = upper(country),
    "updatedAt" = NOW()
WHERE country IS NOT NULL
  AND length(country) = 2
  AND country ~ '^[a-zA-Z]{2}$'
  AND country <> upper(country);

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Diese SELECTs sollten zeigen:
--   leftover_dirty = 0
--   iso_rows ≈ 48.694 (Snapshot-Count, minus die jetzt-NULL aus Step 0a)
--   null_rows wurde um ~49 erhöht (war 4.094, jetzt ~4.143)

SELECT
  COUNT(*) FILTER (WHERE country IS NULL) AS null_rows,
  COUNT(*) FILTER (WHERE country ~ '^[A-Z]{2}$') AS iso_rows,
  COUNT(*) FILTER (WHERE country IS NOT NULL AND country !~ '^[A-Z]{2}$') AS leftover_dirty,
  COUNT(DISTINCT country) FILTER (WHERE country IS NOT NULL) AS distinct_iso_codes,
  COUNT(*) AS total_rows
FROM "Release";

-- Falls leftover_dirty > 0: zeige welche
SELECT country, COUNT(*) AS n
FROM "Release"
WHERE country IS NOT NULL AND country !~ '^[A-Z]{2}$'
GROUP BY country
ORDER BY n DESC
LIMIT 20;

-- ── Phase 5: CHECK-Constraint hinzufügen ────────────────────────────────────
-- NUR ausführen wenn Verify oben leftover_dirty = 0 zeigt.
-- Sonst würde der ALTER TABLE failen + die UPDATE-Statements bleiben gültig.
--
-- ALTER TABLE "Release"
--   ADD CONSTRAINT release_country_iso_format
--   CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
--
-- Verify nach Constraint-Add:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conname = 'release_country_iso_format';
