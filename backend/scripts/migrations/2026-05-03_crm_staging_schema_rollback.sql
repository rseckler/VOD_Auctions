-- Rollback für 2026-05-03_crm_staging_schema.sql
--
-- Vorsicht: löscht ALLE crm_staging_*-Daten + crm_imap_message + crm_pull_run.
-- Nur ausführen wenn Schema verworfen werden soll.
--
-- DROP-Reihenfolge folgt FK-Abhängigkeiten:
--   transaction_item → transaction
--   alle staging_* → pull_run
--   layout_review (kein FK)
--   imap_message → pull_run
--   pull_run zuletzt

DROP VIEW IF EXISTS crm_source_status;

DROP TABLE IF EXISTS crm_layout_review_queue;
DROP TABLE IF EXISTS crm_imap_message;
DROP TABLE IF EXISTS crm_staging_transaction_item;
DROP TABLE IF EXISTS crm_staging_transaction;
DROP TABLE IF EXISTS crm_staging_phone;
DROP TABLE IF EXISTS crm_staging_address;
DROP TABLE IF EXISTS crm_staging_email;
DROP TABLE IF EXISTS crm_staging_contact;
DROP TABLE IF EXISTS crm_pull_run;
