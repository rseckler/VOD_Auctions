-- ERP Printer Management (Phase 2.5 — Stage A)
--
-- Drei neue Tabellen:
--   printer             — Drucker-Inventar (IP, Modell, Standort)
--   bridge_host         — Mac-Identitäten (Pairing-Grundlage, Stage C)
--   bridge_pairing_token — Einmal-Codes für Mac-Onboarding (Stage C)
--
-- Alle Tabellen sind additiv — keine bestehende Tabelle wird geändert.
-- bridge_host.api_token_hash ist nullable für Stage A (Placeholder-Wert
-- für Frank/David die noch im rc52-env-var-Modus laufen).
-- Idempotent: safe to re-run.

-- ─── printer ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS printer (
  id                      TEXT        PRIMARY KEY,
  warehouse_location_id   TEXT        NOT NULL REFERENCES warehouse_location(id),
  manufacturer            TEXT        NOT NULL DEFAULT 'Brother',
  model                   TEXT        NOT NULL,
  ip_address              TEXT        NOT NULL,
  port                    INTEGER     NOT NULL DEFAULT 9100,
  label_type              TEXT        NOT NULL DEFAULT '29',
  brother_ql_model        TEXT,
  is_active               BOOLEAN     NOT NULL DEFAULT true,
  is_default_for_location BOOLEAN     NOT NULL DEFAULT false,
  use_for                 JSONB       NOT NULL DEFAULT '["labels"]'::jsonb,
  mac_address             TEXT,
  hostname                TEXT,
  display_name            TEXT,
  notes                   TEXT,
  sort_order              INTEGER     NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT printer_ip_per_location UNIQUE (warehouse_location_id, ip_address),
  CONSTRAINT printer_port_range CHECK (port > 0 AND port < 65536)
);

CREATE INDEX IF NOT EXISTS idx_printer_warehouse_active
  ON printer(warehouse_location_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_printer_default
  ON printer(warehouse_location_id, is_default_for_location)
  WHERE is_active AND is_default_for_location;

-- ─── bridge_host ─────────────────────────────────────────────────────────────
-- Stage A: api_token_hash nullable (Stage C setzt echte Tokens via Pairing-Flow).
-- Placeholder-Wert 'rc52-env-var-mode' für Frank/David bis Stage E/F-Cutover.

CREATE TABLE IF NOT EXISTS bridge_host (
  id                    TEXT        PRIMARY KEY,
  bridge_uuid           TEXT        UNIQUE NOT NULL,
  api_token_hash        TEXT,           -- sha256 des Bearer-Tokens; NULL bis Stage-C-Pairing
  api_token_issued_at   TIMESTAMPTZ,
  api_token_revoked_at  TIMESTAMPTZ,
  person_label          TEXT        NOT NULL,
  display_name          TEXT        NOT NULL,
  notes                 TEXT,
  is_mobile             BOOLEAN     NOT NULL DEFAULT false,
  default_location_id   TEXT        REFERENCES warehouse_location(id),
  hostname              TEXT,
  mac_address           TEXT,
  platform              TEXT,
  bridge_version        TEXT,
  last_known_ip         TEXT,
  last_seen_at          TIMESTAMPTZ,
  last_print_at         TIMESTAMPTZ,
  last_location_used    TEXT,
  paired_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  paired_by_admin_id    TEXT,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bridge_host_active
  ON bridge_host(is_active, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_bridge_host_uuid
  ON bridge_host(bridge_uuid)
  WHERE is_active;

-- ─── bridge_pairing_token ────────────────────────────────────────────────────
-- Einmal-Codes für Mac-Onboarding (Crockford-Base32, TTL 30min).
-- Wird erst in Stage C genutzt, jetzt schon angelegt für Schema-Konsistenz.

CREATE TABLE IF NOT EXISTS bridge_pairing_token (
  id                    TEXT        PRIMARY KEY,
  pairing_code          TEXT        UNIQUE NOT NULL,
  person_label          TEXT        NOT NULL,
  display_name          TEXT        NOT NULL,
  is_mobile             BOOLEAN     NOT NULL DEFAULT false,
  default_location_id   TEXT        REFERENCES warehouse_location(id),
  notes                 TEXT,
  expires_at            TIMESTAMPTZ NOT NULL,
  used_at               TIMESTAMPTZ,
  used_by_bridge_uuid   TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_admin_id   TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pairing_token_active
  ON bridge_pairing_token(pairing_code)
  WHERE used_at IS NULL;

-- ─── Initiale Daten ───────────────────────────────────────────────────────────
-- 2 Drucker aus rc52-State + 2 bridge_host-Placeholder-Rows für Frank/David.
-- IDs sind stabile Bezeichner (kein ULID), Stage-C/E/F ersetzt die Placeholder-Felder.

INSERT INTO printer (
  id, warehouse_location_id, manufacturer, model,
  ip_address, port, label_type, brother_ql_model,
  is_default_for_location, display_name, notes,
  created_at, updated_at
)
SELECT
  'prn_alpenstrasse',
  wl.id,
  'Brother', 'QL-820NWB',
  '10.1.1.136', 9100, '29', 'QL-820NWB',
  true,
  'Etiketten-Drucker Alpenstraße',
  'Hauptlager. Statische IP per DHCP-Reservation empfohlen.',
  now(), now()
FROM warehouse_location wl
WHERE wl.code = 'ALPENSTRASSE'
  AND NOT EXISTS (SELECT 1 FROM printer WHERE id = 'prn_alpenstrasse');

INSERT INTO printer (
  id, warehouse_location_id, manufacturer, model,
  ip_address, port, label_type, brother_ql_model,
  is_default_for_location, display_name, notes,
  created_at, updated_at
)
SELECT
  'prn_eugenstrasse',
  wl.id,
  'Brother', 'QL-820NWB',
  '192.168.1.124', 9100, '29', 'QL-820NWB',
  true,
  'Etiketten-Drucker Eugenstraße',
  '2. Standort. DHCP-Reservation Pflicht — rc52: IP .140→.124 gewechselt.',
  now(), now()
FROM warehouse_location wl
WHERE wl.code = 'EUGENSTRASSE'
  AND NOT EXISTS (SELECT 1 FROM printer WHERE id = 'prn_eugenstrasse');

INSERT INTO bridge_host (
  id, bridge_uuid, api_token_hash,
  person_label, display_name, is_mobile, default_location_id,
  notes, paired_at, created_at, updated_at
)
SELECT
  'brd_frank',
  'rc52-pre-pair-FRANK',
  'rc52-env-var-mode',
  'Frank', 'Frank-Mac-Studio', false, wl.id,
  'Mac Studio, stationär. bridge_uuid + api_token_hash wird in Stage E (Frank-Cutover) ersetzt.',
  now(), now(), now()
FROM warehouse_location wl
WHERE wl.code = 'ALPENSTRASSE'
  AND NOT EXISTS (SELECT 1 FROM bridge_host WHERE id = 'brd_frank');

INSERT INTO bridge_host (
  id, bridge_uuid, api_token_hash,
  person_label, display_name, is_mobile, default_location_id,
  notes, paired_at, created_at, updated_at
)
SELECT
  'brd_david',
  'rc52-pre-pair-DAVID',
  'rc52-env-var-mode',
  'David', 'David-MBA', true, wl.id,
  'MacBook Air, mobil. bridge_uuid + api_token_hash wird in Stage F (David-Cutover) ersetzt.',
  now(), now(), now()
FROM warehouse_location wl
WHERE wl.code = 'EUGENSTRASSE'
  AND NOT EXISTS (SELECT 1 FROM bridge_host WHERE id = 'brd_david');
