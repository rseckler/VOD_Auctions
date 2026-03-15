-- Email verification table
CREATE TABLE IF NOT EXISTS customer_verification (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  verified_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_verification_token ON customer_verification(token);
CREATE INDEX IF NOT EXISTS idx_customer_verification_customer ON customer_verification(customer_id);

-- Add email_verified column to customer
ALTER TABLE customer ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
