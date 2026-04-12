-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Exemplar-Modell für erp_inventory_item
-- Datum: 2026-04-12
-- Zweck: Erweitert erp_inventory_item um per-Exemplar Felder (Zustand,
--         individueller Preis, Kopie-Nummer). Ermöglicht N physische
--         Exemplare pro Release mit eigenem Barcode + Zustand.
-- Abhängigkeit: 2026-04-07_erp_inventory_bootstrap.sql
-- Idempotent: Ja (IF NOT EXISTS / IF EXISTS checks)
-- Abwärtskompatibel: Ja (bestehende 13.107 Rows = copy_number=1 Default)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Zustandsbewertung: Media + Sleeve (Goldmine/Discogs-Grading)
ALTER TABLE erp_inventory_item
  ADD COLUMN IF NOT EXISTS condition_media TEXT;

ALTER TABLE erp_inventory_item
  ADD COLUMN IF NOT EXISTS condition_sleeve TEXT;

-- CHECK Constraints separat (idempotent via DO-Block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_condition_media'
  ) THEN
    ALTER TABLE erp_inventory_item
      ADD CONSTRAINT chk_condition_media
      CHECK (condition_media IN ('M','NM','VG+','VG','G+','G','F','P'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_condition_sleeve'
  ) THEN
    ALTER TABLE erp_inventory_item
      ADD CONSTRAINT chk_condition_sleeve
      CHECK (condition_sleeve IN ('M','NM','VG+','VG','G+','G','F','P'));
  END IF;
END $$;

-- 2. Kopie-Nummer: Welches Exemplar dieses Release ist das? (1, 2, 3, ...)
ALTER TABLE erp_inventory_item
  ADD COLUMN IF NOT EXISTS copy_number INTEGER NOT NULL DEFAULT 1;

-- 3. Individueller Exemplar-Preis
-- NULL = Release.legacy_price gilt (Standard für Exemplar #1)
-- Gesetzt wenn Frank bei Inventur einen abweichenden Preis vergibt
-- oder bei Exemplar #2+ (anderer Zustand = anderer Preis)
ALTER TABLE erp_inventory_item
  ADD COLUMN IF NOT EXISTS exemplar_price NUMERIC(10,2);

-- 4. UNIQUE Constraint: (release_id, copy_number)
-- Verhindert doppelte copy_number pro Release
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_release_copy'
  ) THEN
    ALTER TABLE erp_inventory_item
      ADD CONSTRAINT uq_release_copy UNIQUE (release_id, copy_number);
  END IF;
END $$;

-- 5. Verification
-- Erwartung: 13.107 bestehende Rows haben copy_number=1 (Default)
-- SELECT count(*), count(DISTINCT release_id), min(copy_number), max(copy_number)
-- FROM erp_inventory_item;
-- → 13107, 13107, 1, 1
