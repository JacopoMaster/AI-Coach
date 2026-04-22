-- Migration 003: Web Push Subscriptions
-- Stores browser push-subscription objects for the Proactive Coach.
-- One user can have multiple endpoints (desktop + mobile + PWA installed).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. USER_PUSH_SUBSCRIPTIONS
--    endpoint          — unique URL provided by the browser's push service
--    p256dh / auth     — cryptographic keys used by the VAPID payload encryption
--    user_agent        — informational, helps debugging per-device issues
--    last_notified_at  — updated on successful push; used to rate-limit sends
--    failure_count     — incremented on 4xx/5xx to prune stale endpoints later
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_push_subscriptions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint         TEXT        NOT NULL UNIQUE,
  p256dh           TEXT        NOT NULL,
  auth             TEXT        NOT NULL,
  user_agent       TEXT,
  last_notified_at TIMESTAMPTZ,
  failure_count    INT         NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_push_subscriptions_user_idx ON user_push_subscriptions (user_id);

ALTER TABLE user_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own push subscriptions" ON user_push_subscriptions;
CREATE POLICY "Users can read own push subscriptions"
  ON user_push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own push subscriptions" ON user_push_subscriptions;
CREATE POLICY "Users can insert own push subscriptions"
  ON user_push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own push subscriptions" ON user_push_subscriptions;
CREATE POLICY "Users can update own push subscriptions"
  ON user_push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own push subscriptions" ON user_push_subscriptions;
CREATE POLICY "Users can delete own push subscriptions"
  ON user_push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PROACTIVE_NOTIFICATIONS_LOG
--    Audit trail of every push the Edge Function sends.
--    Prevents re-sending the same anomaly twice in 24h and lets us inspect
--    what Haiku produced without pulling endpoint logs.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proactive_notifications_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anomaly_type    TEXT        NOT NULL
    CHECK (anomaly_type IN ('missed_workout', 'calorie_deviation', 'pending_checkin', 'inactive_streak')),
  anomaly_payload JSONB,
  message         TEXT        NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_count INT         NOT NULL DEFAULT 0,
  failed_count    INT         NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS proactive_notifications_log_user_sent_idx
  ON proactive_notifications_log (user_id, sent_at DESC);

ALTER TABLE proactive_notifications_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own notification history (e.g. in-app activity feed).
DROP POLICY IF EXISTS "Users can read own notification log" ON proactive_notifications_log;
CREATE POLICY "Users can read own notification log"
  ON proactive_notifications_log FOR SELECT
  USING (auth.uid() = user_id);

-- Only the service role (Edge Function) writes to this table, so we intentionally
-- do NOT grant INSERT to authenticated users.
