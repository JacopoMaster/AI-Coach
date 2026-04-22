-- Migration 004: Schedule the Proactive Coach Edge Function via pg_cron.
-- ────────────────────────────────────────────────────────────────────────────
-- Requires Supabase project on the Pro plan (or self-hosted) — pg_cron and
-- pg_net are NOT available on the free tier.
--
-- IMPORTANT: Before running this migration, set two project-level secrets in
-- Supabase: `app.settings.project_url` and `app.settings.service_role_key`.
-- They feed the HTTP call below. Example (run once in the SQL editor):
--
--   ALTER DATABASE postgres SET app.settings.project_url = 'https://<ref>.supabase.co';
--   ALTER DATABASE postgres SET app.settings.service_role_key = '<service_role_jwt>';
--   -- Re-open the SQL editor session for the GUC to be visible.
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Enable the extensions. On Supabase Pro they are pre-installed into the
--    `extensions` schema; omit WITH SCHEMA so re-running won't trip the
--    "dependent privileges exist" guard (SQLSTATE 2BP01).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Remove any previous schedule with the same name so re-running is idempotent.
SELECT cron.unschedule('proactive-coach-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'proactive-coach-daily'
);

-- 3. Schedule: every day at 20:00 UTC (≈22:00 Europe/Rome during CEST,
--    21:00 during CET). If you want an exact local-clock time, run the job
--    hourly and gate inside the Edge Function on the user's timezone.
--    Cron string is: minute hour day month dow
SELECT cron.schedule(
  'proactive-coach-daily',
  '0 20 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.settings.project_url') || '/functions/v1/proactive-coach',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000  -- 2 min; function batches 5 users at a time
  );
  $$
);

-- 4. Visibility helpers — grant read access so the logged-in dashboard user
--    can inspect job runs without using the service role.
GRANT USAGE  ON SCHEMA cron TO postgres;
GRANT SELECT ON cron.job           TO postgres;
GRANT SELECT ON cron.job_run_details TO postgres;

-- Verify afterwards with:
--   SELECT jobname, schedule, active FROM cron.job;
--   SELECT * FROM cron.job_run_details
--     WHERE jobname = 'proactive-coach-daily' ORDER BY start_time DESC LIMIT 10;
