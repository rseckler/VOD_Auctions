-- Single Source of Truth für ENUM-artige CHECK-Constraints, die im Code
-- referenziert werden und sich ändern können (z.B. neue action-Werte).
--
-- WARUM dieses File existiert:
-- Am 2026-05-07 hat Frank's Drag&Drop einen HTTP 500 ausgelöst, weil
-- release_audit_log.chk_action_valid den Code-Wert "image_reorder" nicht
-- kannte. Dazu kam ein zweiter Auto-generierter Constraint mit dem
-- Postgres-Default-Namen "release_audit_log_action_check", der seit der
-- v1-Migration still parallel lebte. Beide Constraints sind separat
-- gefixt und gedroppt worden, aber das Drift-Risiko bleibt — sobald
-- jemand einen neuen action-/status-Wert im Code einfügt, muss der
-- Constraint mit-migriert werden.
--
-- Dieses File ist kein historischer Migration-Step (siehe die separaten
-- 2026-05-07_*-Files dafür). Es ist ein **idempotenter Reference-Snapshot**
-- des aktuellen Live-Zustands. Disziplin:
--   1. Code-Change fügt einen neuen Wert hinzu? → diese Datei aktualisieren.
--   2. Bei jedem Schema-Restore (DR / Branch / lokale Setup) wird dieses
--      File ausgeführt — DROP IF EXISTS + ADD CONSTRAINT, idempotent.
--   3. CI / Pre-Deploy-Smoke kann die Constraints aus DB pullen und mit
--      diesem File diffen, bevor neuer Code deployed wird (Backlog).
--
-- Lesson dahinter: in zukünftigen Knex-/SQL-Migrations CHECK-Constraints
-- IMMER explizit benennen (`ADD CONSTRAINT chk_<name> CHECK (...)`).
-- Postgres-Default-Namen wie `<table>_<column>_check` sind unsichtbar
-- gefährlich, weil sie zu still co-existierenden Duplikaten führen.

BEGIN;

-- release_audit_log.action — Whitelist aller im Code verwendeten Action-Werte.
-- Bei jedem neuen Action-Wert in backend/src/api/admin/...,
-- backend/src/lib/release-audit.ts oder anderen audit-loggern: hier ergänzen.
ALTER TABLE release_audit_log
  DROP CONSTRAINT IF EXISTS chk_action_valid;
ALTER TABLE release_audit_log
  ADD CONSTRAINT chk_action_valid CHECK (
    action = ANY (ARRAY[
      'edit'::text,
      'revert'::text,
      'track_add'::text,
      'track_edit'::text,
      'track_delete'::text,
      'image_add'::text,
      'image_delete'::text,
      'image_reorder'::text,
      'field_unlocked'::text,
      'contributing_artist_add'::text,
      'contributing_artist_update'::text,
      'contributing_artist_delete'::text
    ])
  );

-- release_audit_log: Reverted-Felder (reverted_at, reverted_by) sind alle
-- entweder gesetzt oder beide null. Verhindert orphan-Halbzustand wenn
-- jemand einen revert markiert ohne actor-Info.
ALTER TABLE release_audit_log
  DROP CONSTRAINT IF EXISTS chk_revert_consistency;
ALTER TABLE release_audit_log
  ADD CONSTRAINT chk_revert_consistency CHECK (
    (reverted_at IS NULL AND reverted_by IS NULL)
    OR (reverted_at IS NOT NULL AND reverted_by IS NOT NULL)
  );

-- release_audit_log: revert-Action hat IMMER eine parent_audit_id (zeigt
-- auf den ursprünglichen Audit-Entry der zurückgenommen wurde).
ALTER TABLE release_audit_log
  DROP CONSTRAINT IF EXISTS chk_revert_has_parent;
ALTER TABLE release_audit_log
  ADD CONSTRAINT chk_revert_has_parent CHECK (
    action <> 'revert' OR parent_audit_id IS NOT NULL
  );

-- Auto-generierte Postgres-Default-Constraints, die historisch parallel zu
-- den expliziten chk_*-Namen entstanden sind. Idempotent droppen falls bei
-- einem Schema-Restore wieder generiert.
ALTER TABLE release_audit_log
  DROP CONSTRAINT IF EXISTS release_audit_log_action_check;

COMMIT;

-- ─── Country-ISO-Format Constraints (rc54.0 + RSE-324) ─────────────────────
-- Erzwingen ISO-3166-1 alpha-2 Format auf allen country-Feldern.
-- Erlaubt: 249 reguläre ISO + 4 deprecated ISO-3166-3 (YU/DD/CS/SU) + 2 reserved (EU/WO).
--
-- Backfill-Migrations:
-- - backend/scripts/migrations/2026-05-11_country_iso_backfill.sql (Release)
-- - backend/scripts/migrations/2026-05-11_pressorga_labelperson_country_iso_backfill.sql
-- Konzept-Doku: docs/optimizing/COUNTRY_ISO_MIGRATION_PLAN.md
--
-- ALTER TABLE "Release"     ADD CONSTRAINT release_country_iso_format     CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
-- ALTER TABLE "PressOrga"   ADD CONSTRAINT pressorga_country_iso_format   CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
-- ALTER TABLE "LabelPerson" ADD CONSTRAINT labelperson_country_iso_format CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
-- ALTER TABLE "Artist"      ADD CONSTRAINT artist_country_iso_format      CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
-- ALTER TABLE "Label"       ADD CONSTRAINT label_country_iso_format       CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
-- ALTER TABLE musician      ADD CONSTRAINT musician_country_iso_format    CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');

-- TODO (Backlog, niedrige Priorität): andere Tabellen mit Inline-CHECK-
-- Constraints ohne expliziten Namen sollten ebenfalls explizite chk_*-
-- Namen bekommen, sobald ihre Werte sich erweitern könnten:
--   - supabase/migrations/20260315_promo_codes.sql:5
--   - backend/scripts/migrations/2026-05-03_crm_staging_schema.sql:50
--   - backend/scripts/migrations/2026-04-07_erp_inventory_bootstrap.sql:44
-- Aktuell kein aktueller Drift, aber Future-Risk-Pattern (Codex-Review
-- 2026-05-07 task-mov4dj5a-upvl0t).
