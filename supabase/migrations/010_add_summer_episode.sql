-- Migration 010: Summer Episode (Vacation Mode)
-- ────────────────────────────────────────────────────────────────────────────
-- Adds a per-user "vacation" toggle to user_notification_preferences. When
-- TRUE, the daily Vercel Cron at /api/cron/proactive-coach skips the user —
-- no training-day reminders, no missed-workout nags. The toggle does NOT
-- pause achievements / EXP / passive engagement; it's purely about silencing
-- proactive pushes while the user is on holiday.
--
-- Default FALSE so existing users keep getting notifications without having
-- to touch their settings.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS summer_episode_active BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN user_notification_preferences.summer_episode_active IS
  'When TRUE the proactive-coach cron skips the user. User-toggled from Settings → Episodio Estivo.';

-- Verify after running:
--   SELECT user_id, summer_episode_active FROM user_notification_preferences;
