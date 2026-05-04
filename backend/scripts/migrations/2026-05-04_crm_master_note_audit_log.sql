-- ============================================================================
-- Sprint S1 — Decision 5A (Robin Seckler, 2026-05-04):
-- Notes + Audit-Log direkt im ersten Schema-Wurf, nicht erst S6.
--
-- Naming-Konsistenz mit Live-Schema: crm_master_* (statt crm_contact_* aus
-- der Vorlage in CRM_DATA_ARCHITECTURE_DECISIONS.md Anhang A).
--
-- Idempotent + reversibel + additiv. Bereits via Supabase MCP angewendet
-- (Migration `crm_master_note_audit_log_2026_05_04`).
-- ============================================================================

-- ========================
-- crm_master_note — User-Notes pro Master-Contact
-- ========================
CREATE TABLE IF NOT EXISTS crm_master_note (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id       uuid NOT NULL REFERENCES crm_master_contact(id) ON DELETE CASCADE,
  body            text NOT NULL,
  pinned          boolean NOT NULL DEFAULT false,
  author_email    text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  deleted_at      timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_crm_master_note_master ON crm_master_note(master_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_master_note_pinned ON crm_master_note(master_id, pinned DESC, created_at DESC) WHERE deleted_at IS NULL;

COMMENT ON TABLE crm_master_note IS 'User-Notes pro Master-Contact (Decision 5A, Sprint S1, 2026-05-04)';

-- ========================
-- crm_master_audit_log — Audit-Trail für alle relevanten Aktionen
-- ========================
CREATE TABLE IF NOT EXISTS crm_master_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id       uuid NOT NULL REFERENCES crm_master_contact(id) ON DELETE CASCADE,
  action          text NOT NULL,
    -- 'merge_from'|'merge_to'|'split'
    -- |'tier_set'|'tier_recalc'
    -- |'tag_added'|'tag_removed'
    -- |'block'|'unblock'|'is_test_set'|'is_test_unset'
    -- |'note_added'|'note_updated'|'note_deleted'
    -- |'email_added'|'email_removed'|'email_primary_changed'
    -- |'address_added'|'address_removed'|'address_primary_changed'
    -- |'phone_added'|'phone_removed'
    -- |'medusa_customer_linked'|'medusa_customer_unlinked'
    -- |'sync_to_brevo'|'sync_from_brevo'
    -- |'gdpr_export'|'gdpr_anonymize'
    -- |'lifetime_revenue_recalc'
    -- |'manual_review_resolved'
  details         jsonb NULL,
  source          text NULL,
    -- 'admin_ui'|'system'|'resolver_auto'|'resolver_manual'|'cron'|'webhook_brevo'
  admin_email     text NULL,
  created_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_master_audit_master ON crm_master_audit_log(master_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_master_audit_action ON crm_master_audit_log(action, created_at DESC);

COMMENT ON TABLE crm_master_audit_log IS 'Audit-Log für alle Aktionen am Master-Contact (Decision 5A, Sprint S1, 2026-05-04)';

-- ========================
-- Trigger: updated_at auf crm_master_note
-- ========================
CREATE OR REPLACE FUNCTION crm_master_note_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_crm_master_note_updated_at ON crm_master_note;
CREATE TRIGGER trigger_crm_master_note_updated_at
  BEFORE UPDATE ON crm_master_note
  FOR EACH ROW
  WHEN (OLD.body IS DISTINCT FROM NEW.body OR OLD.pinned IS DISTINCT FROM NEW.pinned)
  EXECUTE FUNCTION crm_master_note_set_updated_at();
