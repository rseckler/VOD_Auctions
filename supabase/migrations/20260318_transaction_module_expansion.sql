-- Transaction Module Expansion Phase 1
-- Order numbers, fulfillment tracking, billing address, order events timeline

-- 1. Order number sequence + column
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS order_number TEXT UNIQUE;

-- 2. New columns on transaction
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS fulfillment_status TEXT DEFAULT 'unfulfilled';
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS internal_note TEXT;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS billing_name TEXT;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS billing_address_line1 TEXT;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS billing_city TEXT;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS billing_postal_code TEXT;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS billing_country TEXT;

-- 3. Order event table (timeline/audit log)
CREATE TABLE IF NOT EXISTS order_event (
    id TEXT PRIMARY KEY,
    order_group_id TEXT NOT NULL,
    transaction_id TEXT,
    event_type TEXT NOT NULL,  -- status_change | note | email_sent | refund | shipment | return | cancellation
    title TEXT NOT NULL,
    details JSONB,
    actor TEXT NOT NULL,  -- admin email or "system"
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_event_group ON order_event(order_group_id);
CREATE INDEX IF NOT EXISTS idx_order_event_type ON order_event(event_type);

-- 4. Backfill: Generate order_numbers for existing paid transactions
-- Group by order_group_id so all items in same order get the same number
DO $$
DECLARE
    rec RECORD;
    seq_val INTEGER;
    order_num TEXT;
BEGIN
    FOR rec IN
        SELECT DISTINCT order_group_id
        FROM transaction
        WHERE status = 'paid' AND order_number IS NULL AND order_group_id IS NOT NULL
        ORDER BY order_group_id
    LOOP
        seq_val := nextval('order_number_seq');
        order_num := 'VOD-ORD-' || LPAD(seq_val::TEXT, 6, '0');
        UPDATE transaction
        SET order_number = order_num
        WHERE order_group_id = rec.order_group_id AND order_number IS NULL;
    END LOOP;
END $$;

-- Backfill: Copy shipping_status to fulfillment_status for existing records
UPDATE transaction SET fulfillment_status = 'unfulfilled' WHERE shipping_status = 'pending' AND fulfillment_status = 'unfulfilled';
UPDATE transaction SET fulfillment_status = 'shipped' WHERE shipping_status = 'shipped';
UPDATE transaction SET fulfillment_status = 'delivered' WHERE shipping_status = 'delivered';

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_transaction_order_number ON transaction(order_number);
CREATE INDEX IF NOT EXISTS idx_transaction_fulfillment ON transaction(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_transaction_paid_at ON transaction(paid_at);

-- 6. RLS on order_event (enable, no policies = admin-only via service role)
ALTER TABLE order_event ENABLE ROW LEVEL SECURITY;
