-- Promo Code / Discount System
CREATE TABLE IF NOT EXISTS promo_code (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value DECIMAL(10,2) NOT NULL,
  min_order_amount DECIMAL(10,2) DEFAULT 0,
  max_discount_amount DECIMAL(10,2),
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promo_code_code ON promo_code(code);
ALTER TABLE promo_code ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON promo_code TO service_role USING (true) WITH CHECK (true);

ALTER TABLE transaction ADD COLUMN IF NOT EXISTS promo_code_id TEXT REFERENCES promo_code(id);
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;
