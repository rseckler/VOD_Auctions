-- CRM-Staging-Schema (Phase 1 Foundation)
--
-- Hintergrund: 2-Schichten-CRM-Modell.
--   Schicht 1 (DIESE Migration): Roh-Daten pro Quelle, kein Dedup, kein Master.
--   Schicht 2 (späterer Sprint):  crm_contact-Master + Resolver, baut auf
--                                  diesen Staging-Tabellen auf.
--
-- Diese Migration legt 9 staging-Tabellen + 2 Audit-/Operations-Tabellen an.
-- Pipelines (D1 MO-PDFs, E1 Legacy-DBs, F1 IMAP) schreiben hier hinein.
--
-- Verbau-frei: rein additiv, keine Änderung an Medusa-Tabellen, kein Drop.
-- Idempotent: alle CREATE TABLE IF NOT EXISTS, kann beliebig oft re-runned werden.
-- Reversibel: Rollback-Script unter selbem Pfad mit '_rollback.sql' Suffix.
--
-- Konventionen:
--   - source-Spalte ist Pflicht: 'mo_pdf' | 'vod_records_db1' | 'vod_records_db11' |
--                                'vod_records_db2013' | 'vodtapes_members' |
--                                'imap_vod_records' | 'imap_vinyl_on_demand' |
--                                'tape_mag_brevo_list5'
--   - source_record_id ist die natürliche ID in der Quelle (Rechnungs-Nr,
--     DB-Row-ID, IMAP-msg-id, Brevo-Contact-ID)
--   - UNIQUE(source, source_record_id) garantiert Idempotenz bei Re-Runs
--   - raw_payload jsonb behält die unveränderten Quell-Daten zur Audit-Spur
--
-- Robin-Decisions 2026-05-03:
--   - 2-Schichten-Modell: Staging zuerst, Master später → ja
--   - Schema-Prefix crm_staging_*: ja
--   - Keine pwd-Hashes ziehen: ja
--   - Keine _kunden_bank ziehen: ja
--   - IMAP-Folder-Whitelist Inbox+Sent+Archive: ja
--   - 2003-2026 PDFs in /Monkey Office/Rechnungen/<Jahr>/: ja
--
-- Verwandte Doks:
--   - docs/optimizing/CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md (Sprint-Plan)
--   - docs/architecture/CRM_DATA_ARCHITECTURE_DECISIONS.md (Decision-Vorlage)
--   - docs/architecture/LEGACY_MYSQL_DATABASES.md (Quell-Schema-Inventar)

-- ============================================================================
-- 1. Pull-Audit (jeder Pipeline-Run loggt sich hier)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_pull_run (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text NOT NULL,
  pipeline        text NOT NULL,           -- 'd1_mo_pdf' | 'e1_legacy_db' | 'f1_imap'
  parser_version  text NULL,
  started_at      timestamptz NOT NULL DEFAULT NOW(),
  finished_at     timestamptz NULL,
  status          text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','done','failed','partial','abandoned')),
  files_total     int NULL,
  files_ok        int NULL,
  files_warning   int NULL,
  files_failed    int NULL,
  rows_inserted   int NULL,
  rows_updated    int NULL,
  rows_skipped    int NULL,
  notes           text NULL,
  error_message   text NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_pull_run_source ON crm_pull_run(source, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_pull_run_status ON crm_pull_run(status)
  WHERE status IN ('running','partial','failed');


-- ============================================================================
-- 2. Roh-Kontakte pro Quell-Erscheinung
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_staging_contact (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pull_run_id       uuid NOT NULL REFERENCES crm_pull_run(id) ON DELETE CASCADE,
  source            text NOT NULL,
  source_record_id  text NOT NULL,            -- ADR-XXXXXX | DB-id | IMAP-msg-id

  -- Identity
  display_name      text NULL,
  first_name        text NULL,
  last_name         text NULL,
  company           text NULL,
  contact_type      text NULL CHECK (contact_type IS NULL OR contact_type IN ('person','business')),

  -- Convenience-Indexes (denormalisiert aus _email/_address-Tabellen für Match)
  primary_email_lower text NULL,              -- LOWER(TRIM(email))
  country_code      text NULL,                -- ISO-2 wenn ableitbar

  -- Zeit-Indikatoren aus der Quelle
  source_created_at timestamptz NULL,         -- Anlegungs-Datum in Quelle
  source_last_seen_at timestamptz NULL,       -- letzter Touch in Quelle

  -- Roh-Daten zur Audit-Spur
  raw_payload       jsonb NULL,

  -- Pipeline-Meta
  pulled_at         timestamptz NOT NULL DEFAULT NOW(),

  UNIQUE(source, source_record_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_staging_contact_email ON crm_staging_contact(primary_email_lower)
  WHERE primary_email_lower IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_staging_contact_source ON crm_staging_contact(source);
CREATE INDEX IF NOT EXISTS idx_crm_staging_contact_pull_run ON crm_staging_contact(pull_run_id);


-- ============================================================================
-- 3. Emails pro Kontakt (1:N — eine Person kann mehrere Emails über Zeit haben)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_staging_email (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staging_contact_id uuid NOT NULL REFERENCES crm_staging_contact(id) ON DELETE CASCADE,
  source            text NOT NULL,
  source_record_id  text NULL,                -- z.B. IMAP-msg-id wenn Email aus Mining
  email             text NOT NULL,
  email_lower       text GENERATED ALWAYS AS (LOWER(TRIM(email))) STORED,
  is_primary        boolean DEFAULT false,
  is_verified       boolean DEFAULT false,
  confidence        numeric(3,2) NOT NULL DEFAULT 1.0,    -- 0.00-1.00

  -- Brevo-Webhook-Status (befüllt durch existierenden webhooks/brevo-Handler später)
  opted_out_at      timestamptz NULL,
  bounced_at        timestamptz NULL,
  bounce_type       text NULL,                -- 'hard' | 'soft' | 'complaint'

  pulled_at         timestamptz NOT NULL DEFAULT NOW(),
  raw_payload       jsonb NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_staging_email_lower ON crm_staging_email(email_lower);
CREATE INDEX IF NOT EXISTS idx_crm_staging_email_contact ON crm_staging_email(staging_contact_id);


-- ============================================================================
-- 4. Adressen pro Kontakt (1:N)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_staging_address (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staging_contact_id uuid NOT NULL REFERENCES crm_staging_contact(id) ON DELETE CASCADE,
  source            text NOT NULL,
  source_record_id  text NULL,

  -- Strukturierte Felder
  type              text NULL CHECK (type IS NULL OR type IN ('billing','shipping','home','business','other')),
  salutation        text NULL,
  title             text NULL,
  company           text NULL,
  first_name        text NULL,
  last_name         text NULL,
  street            text NULL,
  street_2          text NULL,                -- c/o, Apt, etc.
  postal_code       text NULL,
  city              text NULL,
  region            text NULL,
  country           text NULL,                -- raw country name from source
  country_code      text NULL,                -- ISO-2 if normalized

  -- Backup-Felder
  raw_address       text NULL,                -- Free-Text-Original
  raw_payload       jsonb NULL,

  -- Validity (eine Person kann Adressen wechseln)
  valid_from        timestamptz NULL,
  valid_to          timestamptz NULL,
  is_primary        boolean DEFAULT false,

  pulled_at         timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_staging_address_contact ON crm_staging_address(staging_contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_staging_address_postal ON crm_staging_address(postal_code, country_code)
  WHERE postal_code IS NOT NULL;


-- ============================================================================
-- 5. Telefon-Nummern pro Kontakt (1:N)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_staging_phone (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staging_contact_id uuid NOT NULL REFERENCES crm_staging_contact(id) ON DELETE CASCADE,
  source            text NOT NULL,
  source_record_id  text NULL,

  phone_raw         text NOT NULL,
  phone_normalized  text NULL,                -- E.164 wenn parsbar
  phone_type        text NULL CHECK (phone_type IS NULL OR phone_type IN ('mobile','landline','fax','other')),
  is_primary        boolean DEFAULT false,

  pulled_at         timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_staging_phone_contact ON crm_staging_phone(staging_contact_id);


-- ============================================================================
-- 6. Transaktionen (Rechnungen + Bestellungen aus allen Legacy-Quellen)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_staging_transaction (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pull_run_id       uuid NOT NULL REFERENCES crm_pull_run(id) ON DELETE CASCADE,
  source            text NOT NULL,
  source_record_id  text NOT NULL,            -- Rechnungs-Nr | Bestellungs-ID

  -- Customer-Bezug (über staging-Layer, nicht direkt FK auf master)
  customer_source       text NOT NULL,        -- 'mo_pdf' | 'vod_records_db1' | etc.
  customer_source_record_id text NOT NULL,    -- → crm_staging_contact.source_record_id

  -- Document-Type
  doc_type          text NOT NULL DEFAULT 'invoice'
                    CHECK (doc_type IN ('invoice','credit_note','proforma','partial','order','quote')),
  doc_number        text NULL,                -- z.B. RG-2024-001523, KR-..., PR-...
  external_reference text NULL,               -- Externe Referenz/Bestellnummer

  -- Daten
  doc_date          date NOT NULL,
  delivery_date     date NULL,

  -- Beträge
  total_gross       numeric(10,2) NULL,
  total_net         numeric(10,2) NULL,
  total_tax         numeric(10,2) NULL,
  shipping_cost     numeric(10,2) NULL,
  currency          text DEFAULT 'EUR',

  -- Status
  status            text NULL,                -- 'paid' | 'open' | 'cancelled' | etc. (Source-spezifisch)
  payment_method    text NULL,
  payment_terms     text NULL,
  package_tracking  text NULL,                -- paketnr aus db2013

  -- Rechnungs-Adress-Backup (Free-Text, Snapshot zum Bestell-Zeitpunkt)
  billing_address_raw  text NULL,
  shipping_address_raw text NULL,

  -- MO-PDF-spezifisch
  source_pdf_path   text NULL,
  source_pdf_hash   text NULL,
  parser_version   text NULL,

  -- Korrekturen
  correction_for_doc_number text NULL,        -- bei doc_type='credit_note'

  -- Audit
  notes_or_warnings text NULL,                -- Parse-Warnings

  raw_payload       jsonb NULL,
  pulled_at         timestamptz NOT NULL DEFAULT NOW(),

  UNIQUE(source, source_record_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_staging_tx_customer ON crm_staging_transaction(customer_source, customer_source_record_id);
CREATE INDEX IF NOT EXISTS idx_crm_staging_tx_date ON crm_staging_transaction(doc_date DESC);
CREATE INDEX IF NOT EXISTS idx_crm_staging_tx_pull_run ON crm_staging_transaction(pull_run_id);


-- ============================================================================
-- 7. Transaktions-Positionen (Items pro Rechnung/Bestellung)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_staging_transaction_item (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    uuid NOT NULL REFERENCES crm_staging_transaction(id) ON DELETE CASCADE,

  position          int NOT NULL,
  article_no        text NULL,                -- Artikelnummer aus Quelle
  article_name      text NOT NULL,            -- Beschreibung
  unit              text NULL,                -- Stk, kg, etc. wenn vorhanden

  quantity          numeric(10,3) NOT NULL DEFAULT 1,
  unit_price        numeric(10,2) NULL,
  vat_rate          numeric(5,2) NULL,        -- z.B. 19.00, 7.00
  line_total_gross  numeric(10,2) NULL,
  line_total_net    numeric(10,2) NULL,

  is_shipping       boolean DEFAULT false,    -- True wenn Zeile "Versand" o.ä. ist
  is_discount       boolean DEFAULT false,    -- True bei Negativbetrag/Rabatt-Zeile

  raw_line          text NULL,                -- Original-Zeile aus PDF/DB
  raw_payload       jsonb NULL,

  parse_warning     text NULL,                -- z.B. "preis fehlt", "menge unklar"

  UNIQUE(transaction_id, position)
);
CREATE INDEX IF NOT EXISTS idx_crm_staging_tx_item_tx ON crm_staging_transaction_item(transaction_id);
CREATE INDEX IF NOT EXISTS idx_crm_staging_tx_item_article ON crm_staging_transaction_item(article_no)
  WHERE article_no IS NOT NULL;


-- ============================================================================
-- 8. IMAP-Messages (eigenständig — Match auf Kontakt erfolgt im Resolver)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_imap_message (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pull_run_id       uuid NOT NULL REFERENCES crm_pull_run(id) ON DELETE CASCADE,

  account           text NOT NULL,            -- 'frank@vod-records.com' | 'frank@vinyl-on-demand.com'
  msg_uid           text NOT NULL,            -- IMAP UID innerhalb des Folders
  uid_validity      bigint NOT NULL,          -- IMAP UIDVALIDITY für inkrementellen Sync
  folder            text NOT NULL,            -- 'INBOX' | 'Sent' | 'Archive'

  -- Header
  message_id_header text NULL,
  date_header       timestamptz NOT NULL,
  from_email        text NULL,
  from_email_lower  text GENERATED ALWAYS AS (LOWER(TRIM(from_email))) STORED,
  from_name         text NULL,
  to_emails         text[] DEFAULT '{}',
  cc_emails         text[] DEFAULT '{}',
  reply_to_email    text NULL,
  subject           text NULL,

  -- Body-Excerpt (erste 2-5kb, nach 90d zu anonymisieren)
  body_excerpt      text NULL,
  body_anonymized_at timestamptz NULL,

  -- Erkannte Referenzen via Regex
  detected_emails   text[] DEFAULT '{}',
  detected_customer_refs text[] DEFAULT '{}',  -- ADR-XXXXXX
  detected_invoice_refs  text[] DEFAULT '{}',  -- RG-/KR-/PR-XXXXXX

  -- Audit
  raw_headers       jsonb NULL,
  indexed_at        timestamptz NOT NULL DEFAULT NOW(),

  UNIQUE(account, folder, msg_uid)
);
CREATE INDEX IF NOT EXISTS idx_crm_imap_from ON crm_imap_message(from_email_lower);
CREATE INDEX IF NOT EXISTS idx_crm_imap_account_folder ON crm_imap_message(account, folder);
CREATE INDEX IF NOT EXISTS idx_crm_imap_date ON crm_imap_message(date_header DESC);
CREATE INDEX IF NOT EXISTS idx_crm_imap_detected_emails ON crm_imap_message USING GIN(detected_emails);
CREATE INDEX IF NOT EXISTS idx_crm_imap_detected_customer_refs ON crm_imap_message USING GIN(detected_customer_refs);
CREATE INDEX IF NOT EXISTS idx_crm_imap_detected_invoice_refs ON crm_imap_message USING GIN(detected_invoice_refs);


-- ============================================================================
-- 9. Layout-Review-Queue (MO-PDF unbekannte Templates / Parse-Failures)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_layout_review_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source            text NOT NULL DEFAULT 'mo_pdf',
  source_file_path  text NOT NULL,
  source_file_hash  text NOT NULL,
  detected_layout   text NULL,                -- best-guess Template-Version
  review_reason     text NOT NULL
                    CHECK (review_reason IN ('unknown_layout','parse_error','sum_mismatch','missing_fields','encoding_issue','other')),
  raw_text          text NULL,                -- pdftotext-Output für Frank/Robin

  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','resolved','skipped','ignored')),
  resolution_note   text NULL,
  resolved_by       text NULL,
  resolved_at       timestamptz NULL,
  created_at        timestamptz NOT NULL DEFAULT NOW(),

  UNIQUE(source_file_hash)
);
CREATE INDEX IF NOT EXISTS idx_crm_layout_review_status ON crm_layout_review_queue(status, created_at DESC)
  WHERE status = 'open';


-- ============================================================================
-- 10. View: Aggregierter Pull-Status für Sources-Tab im Admin-UI
-- ============================================================================

CREATE OR REPLACE VIEW crm_source_status AS
SELECT
  source,
  pipeline,
  MAX(started_at) AS last_run_at,
  MAX(CASE WHEN status='done' THEN finished_at END) AS last_successful_run_at,
  COUNT(*) AS total_runs,
  COUNT(*) FILTER (WHERE status='done') AS successful_runs,
  COUNT(*) FILTER (WHERE status='failed') AS failed_runs,
  COUNT(*) FILTER (WHERE status='running' AND started_at > NOW() - INTERVAL '6 hours') AS active_runs,
  COUNT(*) FILTER (WHERE status='running' AND started_at < NOW() - INTERVAL '6 hours') AS stale_runs,
  SUM(rows_inserted) AS total_rows_inserted,
  SUM(rows_updated) AS total_rows_updated
FROM crm_pull_run
GROUP BY source, pipeline;


-- ============================================================================
-- DONE — 9 Tables + 1 View, 21 Indexes, alle additiv + idempotent
-- ============================================================================
