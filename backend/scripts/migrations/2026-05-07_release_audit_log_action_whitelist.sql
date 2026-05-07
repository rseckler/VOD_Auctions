-- 2026-05-07: erweitere chk_action_valid auf release_audit_log
--
-- Hintergrund: Frank meldete HTTP 500 beim Drag&Drop-Reorder (ohne Code-Trace).
-- VPS-Logs zeigten check-constraint-violation:
--   "new row for relation \"release_audit_log\" violates check constraint
--    \"chk_action_valid\""
--
-- Root Cause: chk_action_valid war im v1-Schema mit nur 7 Action-Werten
-- definiert (edit, revert, track_add/edit/delete, image_add/delete). Spätere
-- Code-Erweiterungen haben weitere action-Werte hinzugefügt, ohne den
-- Constraint mitzuziehen — Dual-Source-of-Truth-Drift zwischen Code und DB.
--
-- Betroffene Endpoints (alle warfen HTTP 500 vor diesem Fix):
--   - /admin/media/:id/images/reorder       (action=image_reorder)
--   - /admin/media/:id/images/:imageId/set-cover  (action=image_reorder)
--   - /admin/media/:id/unlock-field         (action=field_unlocked)
--   - /admin/media/:id/contributing-artists       (action=contributing_artist_add)
--   - /admin/media/:id/contributing-artists/:linkId  (action=contributing_artist_update/delete)
--
-- Diese sind seit rc52.x silent broken — niemand merkte's weil die häufigen
-- Aktionen (edit, image_add) den alten Constraint passierten. Frank hat es
-- heute aufgedeckt durch aktiven Drag&Drop-Test.
--
-- Idempotent: DROP+ADD im selben File. Falls schon migriert (nur 7 Werte) ist
-- der DROP No-Op-äquivalent (constraint heißt gleich).

ALTER TABLE release_audit_log DROP CONSTRAINT IF EXISTS chk_action_valid;

ALTER TABLE release_audit_log ADD CONSTRAINT chk_action_valid CHECK (
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
