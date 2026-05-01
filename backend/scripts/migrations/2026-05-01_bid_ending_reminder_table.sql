-- Tracking-Tabelle für ausgegangene Bid-Ending-Reminder-Mails.
--
-- Eindeutigkeit pro (block_item, user, reminder_type) — verhindert dass derselbe
-- User für denselben Lot mehrfach denselben Reminder bekommt, auch wenn das
-- Cron-Window (z.B. 23–25h vor Lot-Ende) mehrfach feuert.
--
-- Vorher (rc52.6.4 und älter): backend/src/jobs/bid-ending-reminder.ts hat dieses
-- CREATE TABLE jede Minute (`* * * * *`-Schedule) als ersten DDL-Befehl ausgeführt.
-- Idempotent, aber 1.440× DDL/Tag mit Catalog-Lock-Acquisition + Logging-Volume.
-- Mit dieser Migration als Source of Truth wird der DDL-Block aus dem Job entfernt.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS bid_ending_reminder (
  block_item_id text NOT NULL,
  user_id       text NOT NULL,
  reminder_type text NOT NULL,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (block_item_id, user_id, reminder_type)
);
