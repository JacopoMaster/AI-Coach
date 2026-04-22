-- Migration 005: Morning Motivation Reminders
-- ────────────────────────────────────────────────────────────────────────────
-- Adds a per-user preferences table so users can independently opt out of
-- morning motivation pushes without disabling the evening proactive report,
-- extends the proactive log CHECK constraint to accept a new anomaly_type,
-- and schedules the `morning-motivation` Edge Function at 09:00 Europe/Rome.
--
-- Prereq: migration 004 already enabled pg_cron + pg_net and set the
-- `app.settings.project_url` / `app.settings.service_role_key` GUCs.
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Per-user notification preferences. Separate from user_push_subscriptions
--    because subscriptions are per-device; preferences are per-user.
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  evening_reports_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  morning_motivation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notification preferences"
  ON user_notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own notification preferences"
  ON user_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences"
  ON user_notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- 2. Extend the proactive_notifications_log CHECK to accept morning_motivation.
--    The original constraint from migration 003 is anonymous, so drop by
--    recreating the column-level check via ALTER.
ALTER TABLE proactive_notifications_log
  DROP CONSTRAINT IF EXISTS proactive_notifications_log_anomaly_type_check;

ALTER TABLE proactive_notifications_log
  ADD CONSTRAINT proactive_notifications_log_anomaly_type_check
  CHECK (anomaly_type IN (
    'missed_workout',
    'calorie_deviation',
    'pending_checkin',
    'inactive_streak',
    'morning_motivation'
  ));

-- 3. Schedule the Edge Function to fire before the user's 17:00/18:00 training
--    slot. The remote pg_cron on Supabase doesn't accept the `CRON_TZ=` prefix
--    (it silently errors out), so we pin the schedule to UTC and pick 15:00 UTC
--    which is 17:00 Italy during CEST. Known trade-off: during CET (winter)
--    this fires at 16:00 Rome — acceptable given the alternative is hourly
--    polling with an internal gate.
SELECT cron.unschedule('morning-motivation-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'morning-motivation-daily'
);
SELECT cron.unschedule('pre-workout-motivation-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'pre-workout-motivation-daily'
);

SELECT cron.schedule(
  'pre-workout-motivation-daily',
  '0 15 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.settings.project_url') || '/functions/v1/morning-motivation',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Verify with:
--   SELECT jobname, schedule, active FROM cron.job
--     WHERE jobname IN ('proactive-coach-daily', 'pre-workout-motivation-daily');
