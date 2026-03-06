-- RSE-102: Add feedback columns to transaction table
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS feedback_email_sent BOOLEAN DEFAULT false;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS feedback_rating INTEGER;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS feedback_comment TEXT;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;
