-- Migration 012: Fix gamification RLS — restore INSERT/UPDATE for authenticated
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 006 commented "INSERT is only ever done by the trigger / service
-- role" on every gamification table, but the API routes use the SSR Supabase
-- client (anon key + JWT cookie), which means writes run as role=authenticated.
-- RLS therefore silently rejected every awardExp() insert with code 42501,
-- leaving exp_history completely empty and stats frozen.
--
-- This migration adds the missing user-scoped INSERT/UPDATE policies. Pattern
-- mirrors migrations 002/003: the row's user_id must match auth.uid(). All
-- statements are idempotent (DROP IF EXISTS + CREATE).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. exp_history — append-only audit log ─────────────────────────────────
DROP POLICY IF EXISTS "Users insert own exp history" ON exp_history;
CREATE POLICY "Users insert own exp history" ON exp_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ─── 2. user_stats — defensive seed inside awardExp() ───────────────────────
-- The on_user_created_init_stats trigger seeds rows via SECURITY DEFINER, but
-- awardExp() also has a defensive INSERT path for users that somehow lack a
-- row. Without an INSERT policy that path fails under authenticated role.
DROP POLICY IF EXISTS "Users insert own stats" ON user_stats;
CREATE POLICY "Users insert own stats" ON user_stats
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ─── 3. spiral_evolution_log — cinematic events queue ───────────────────────
DROP POLICY IF EXISTS "Users insert own evolution log" ON spiral_evolution_log;
CREATE POLICY "Users insert own evolution log" ON spiral_evolution_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ─── 4. personal_records — Giga Drill PR upserts ────────────────────────────
DROP POLICY IF EXISTS "Users insert own PRs" ON personal_records;
CREATE POLICY "Users insert own PRs" ON personal_records
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own PRs" ON personal_records;
CREATE POLICY "Users update own PRs" ON personal_records
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─── 5. user_achievements — unlock upserts ──────────────────────────────────
DROP POLICY IF EXISTS "Users insert own unlocks" ON user_achievements;
CREATE POLICY "Users insert own unlocks" ON user_achievements
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ─── 6. Diagnostics ─────────────────────────────────────────────────────────
-- After running, verify policies are in place:
--   SELECT tablename, policyname, cmd
--   FROM   pg_policies
--   WHERE  tablename IN ('exp_history','user_stats','spiral_evolution_log',
--                        'personal_records','user_achievements')
--   ORDER  BY tablename, cmd;
--
-- Then confirm awardExp() can write end-to-end:
--   - log a workout via the UI
--   - SELECT * FROM exp_history WHERE user_id = auth.uid() ORDER BY created_at DESC;
