-- Rollback für 2026-05-04_crm_master_note_audit_log.sql
-- WARNUNG: Daten in crm_master_note + crm_master_audit_log gehen verloren.

DROP TRIGGER IF EXISTS trigger_crm_master_note_updated_at ON crm_master_note;
DROP FUNCTION IF EXISTS crm_master_note_set_updated_at();
DROP TABLE IF EXISTS crm_master_audit_log;
DROP TABLE IF EXISTS crm_master_note;
