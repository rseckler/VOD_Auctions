-- ============================================================================
-- Country-ISO Migration Follow-up (RSE-324) — PressOrga + LabelPerson
-- ============================================================================
--
-- Reference: docs/optimizing/COUNTRY_ISO_MIGRATION_PLAN.md
-- Linear: RSE-324
-- Parent Migration: 2026-05-11_country_iso_backfill.sql (Release.country)
--
-- Scope:
--   PressOrga.country    — 1.983 Rows, 21 distinct (alle deutsche Vollformen + "--")
--   LabelPerson.country  — 458 Rows, 19 distinct (alle deutsche Vollformen + "--")
--
-- Methode identisch zu rc54.0 Release.country:
--   Step 0a: "--" / empty / whitespace → NULL
--   Step 0b: Trim leading/trailing whitespace
--   Step 1:  Mapping-UPDATE deutsche Vollform → ISO (case-insensitive)
--   Step 2:  Already-ISO case-normalize (defensive, sollte 0 Rows treffen
--            für PressOrga; LabelPerson hat 11 ISO-Pattern aus früheren manual-edits)
--   Verify:  leftover_dirty MUSS 0 sein
--   Plus:    CHECK-Constraints anlegen
--
-- Rollback:
--   UPDATE "PressOrga" p SET country = b.country_pre, "updatedAt" = b.updatedat_pre
--   FROM backup_pressorga_country_pre_iso b WHERE p.id = b.id;
--   UPDATE "LabelPerson" l SET country = b.country_pre
--   FROM backup_labelperson_country_pre_iso b WHERE l.id = b.id;
--
-- ============================================================================

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PressOrga.country                                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Step 0a: "--" Placeholder + empty/whitespace → NULL
UPDATE "PressOrga"
SET country = NULL, "updatedAt" = NOW()
WHERE country = '' OR country = '--' OR trim(country) = '' OR trim(country) = '--';

-- Step 0b: Trim whitespace
UPDATE "PressOrga"
SET country = trim(country), "updatedAt" = NOW()
WHERE country IS NOT NULL AND country <> trim(country);

-- Step 1: Mapping-UPDATE (deutsche Vollformen → ISO, case-insensitive)
UPDATE "PressOrga"
SET country = m.iso_code, "updatedAt" = NOW()
FROM (VALUES
  ('Deutschland', 'DE'),
  ('Vereinigtes Königreich von Großbritannien und Nordirland', 'GB'),
  ('Vereinigte Staaten von Amerika', 'US'),
  ('Frankreich', 'FR'),
  ('Italien', 'IT'),
  ('Niederlande', 'NL'),
  ('Schweiz', 'CH'),
  ('Belgien', 'BE'),
  ('Österreich', 'AT'),
  ('Kanada', 'CA'),
  ('Japan', 'JP'),
  ('Spanien', 'ES'),
  ('Schweden', 'SE'),
  ('Australien', 'AU'),
  ('Norwegen', 'NO'),
  ('Polen', 'PL'),
  ('Jugoslawien', 'YU'),
  ('Ungarn', 'HU'),
  ('Griechenland', 'GR'),
  ('Finnland', 'FI'),
  ('Slowenien', 'SI'),
  -- LabelPerson-only Werte (für identische SQL-Datei, harmlos auf PressOrga)
  ('Mexiko', 'MX'),
  ('Portugal', 'PT'),
  ('Serbien und Montenegro', 'CS')
) AS m(source, iso_code)
WHERE LOWER("PressOrga".country) = LOWER(m.source);

-- Step 2: Already-ISO defensive case-normalize
UPDATE "PressOrga"
SET country = upper(country), "updatedAt" = NOW()
WHERE country IS NOT NULL
  AND length(country) = 2
  AND country ~ '^[a-zA-Z]{2}$'
  AND country <> upper(country);

-- Verify
SELECT
  'PressOrga' AS tbl,
  COUNT(*) FILTER (WHERE country IS NULL) AS null_rows,
  COUNT(*) FILTER (WHERE country ~ '^[A-Z]{2}$') AS iso_rows,
  COUNT(*) FILTER (WHERE country IS NOT NULL AND country !~ '^[A-Z]{2}$') AS leftover_dirty,
  COUNT(DISTINCT country) FILTER (WHERE country IS NOT NULL) AS distinct_iso
FROM "PressOrga";


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  LabelPerson.country                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Step 0a: "--" / empty / whitespace → NULL
UPDATE "LabelPerson"
SET country = NULL
WHERE country = '' OR country = '--' OR trim(country) = '' OR trim(country) = '--';

-- Step 0b: Trim
UPDATE "LabelPerson"
SET country = trim(country)
WHERE country IS NOT NULL AND country <> trim(country);

-- Step 1: Mapping-UPDATE (deutsche Vollformen → ISO)
UPDATE "LabelPerson"
SET country = m.iso_code
FROM (VALUES
  ('Deutschland', 'DE'),
  ('Vereinigtes Königreich von Großbritannien und Nordirland', 'GB'),
  ('Vereinigte Staaten von Amerika', 'US'),
  ('Frankreich', 'FR'),
  ('Niederlande', 'NL'),
  ('Belgien', 'BE'),
  ('Australien', 'AU'),
  ('Japan', 'JP'),
  ('Italien', 'IT'),
  ('Spanien', 'ES'),
  ('Kanada', 'CA'),
  ('Schweiz', 'CH'),
  ('Schweden', 'SE'),
  ('Österreich', 'AT'),
  ('Norwegen', 'NO'),
  ('Serbien und Montenegro', 'CS'),
  ('Mexiko', 'MX'),
  ('Portugal', 'PT')
) AS m(source, iso_code)
WHERE LOWER("LabelPerson".country) = LOWER(m.source);

-- Step 2: Already-ISO normalize
UPDATE "LabelPerson"
SET country = upper(country)
WHERE country IS NOT NULL
  AND length(country) = 2
  AND country ~ '^[a-zA-Z]{2}$'
  AND country <> upper(country);

-- Verify
SELECT
  'LabelPerson' AS tbl,
  COUNT(*) FILTER (WHERE country IS NULL) AS null_rows,
  COUNT(*) FILTER (WHERE country ~ '^[A-Z]{2}$') AS iso_rows,
  COUNT(*) FILTER (WHERE country IS NOT NULL AND country !~ '^[A-Z]{2}$') AS leftover_dirty,
  COUNT(DISTINCT country) FILTER (WHERE country IS NOT NULL) AS distinct_iso
FROM "LabelPerson";


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  CHECK-Constraints — nur ausführen wenn beide Verifies leftover_dirty=0  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ALTER TABLE "PressOrga"
--   ADD CONSTRAINT pressorga_country_iso_format
--   CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
--
-- ALTER TABLE "LabelPerson"
--   ADD CONSTRAINT labelperson_country_iso_format
--   CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
--
-- -- Auch für Artist + Label + musician (0 Non-NULL Rows — nur Constraint, kein Backfill)
-- ALTER TABLE "Artist"
--   ADD CONSTRAINT artist_country_iso_format
--   CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
--
-- ALTER TABLE "Label"
--   ADD CONSTRAINT label_country_iso_format
--   CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
--
-- ALTER TABLE musician
--   ADD CONSTRAINT musician_country_iso_format
--   CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
