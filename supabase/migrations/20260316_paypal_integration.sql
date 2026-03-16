-- PayPal Direct Integration: Add payment provider tracking to transactions
ALTER TABLE transaction ADD COLUMN payment_provider TEXT NOT NULL DEFAULT 'stripe';
ALTER TABLE transaction ADD COLUMN paypal_order_id TEXT;
ALTER TABLE transaction ADD COLUMN paypal_capture_id TEXT;

-- Index for PayPal order lookups
CREATE INDEX idx_transaction_paypal_order_id ON transaction (paypal_order_id) WHERE paypal_order_id IS NOT NULL;
CREATE INDEX idx_transaction_payment_provider ON transaction (payment_provider);
