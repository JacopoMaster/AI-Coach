-- Migration 006: Spiral Energy — gamification foundation (Fase 3)
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds user_stats, exp_history, personal_records, spiral_evolution_log,
-- vacation_periods, achievements catalog + unlocks. All tables RLS-enabled.
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. USER_STATS ──────────────────────────────────────────────────────────
-- One row per user. Updated server-side by the awardExp() helper.
-- Values are the authoritative snapshot; exp_history is the audit log.
CREATE TABLE IF NOT EXISTS user_stats (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  level                INT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 999),
  exp_total            BIGINT NOT NULL DEFAULT 0 CHECK (exp_total >= 0),
  spiral_stage         TEXT NOT NULL DEFAULT 'terrestrial'
    CHECK (spiral_stage IN ('terrestrial','atmospheric','orbital','celestial','galactic','tengen_toppa')),
  core_drill_tier      INT NOT NULL DEFAULT 1 CHECK (core_drill_tier BETWEEN 1 AND 10),
  resonance_mult       NUMERIC(3,2) NOT NULL DEFAULT 1.00
    CHECK (resonance_mult BETWEEN 1.00 AND 3.00),
  resonance_last_tick  TIMESTAMPTZ,
  perfect_week_streak  INT NOT NULL DEFAULT 0 CHECK (perfect_week_streak >= 0),
  longest_streak       INT NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  pierced_the_heavens  BOOLEAN NOT NULL DEFAULT FALSE,
  pierced_at           TIMESTAMPTZ,
  baseline_tonnage     NUMERIC(10,2),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own stats" ON user_stats;
CREATE POLICY "Users read own stats" ON user_stats
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own stats" ON user_stats;
CREATE POLICY "Users update own stats" ON user_stats
  FOR UPDATE USING (auth.uid() = user_id);
-- INSERT is only ever done by the trigger below (service-role path).

-- Seed user_stats for every new auth.users row.
CREATE OR REPLACE FUNCTION init_user_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_stats (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_created_init_stats ON auth.users;
CREATE TRIGGER on_user_created_init_stats
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION init_user_stats();

-- Backfill user_stats for any pre-existing users. Idempotent.
INSERT INTO user_stats (user_id)
  SELECT id FROM auth.users
  ON CONFLICT (user_id) DO NOTHING;


-- ─── 2. EXP_HISTORY ─────────────────────────────────────────────────────────
-- Append-only audit log. Source of truth for analytics + replay.
-- UNIQUE (source, source_id) provides idempotency on retried POSTs.
CREATE TABLE IF NOT EXISTS exp_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta        INT NOT NULL,              -- post-multiplier EXP actually credited
  base_exp     INT NOT NULL,              -- pre-multiplier amount (for audit)
  multiplier   NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  source       TEXT NOT NULL
    CHECK (source IN (
      'workout_session','diet_log','weight_log','body_measurement',
      'weekly_checkin','meso_complete','giga_drill_break',
      'perfect_week','achievement'
    )),
  source_id    UUID,
  stat_tagged  TEXT CHECK (stat_tagged IN ('forza','resistenza','agilita','all') OR stat_tagged IS NULL),
  rationale    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS exp_history_user_created_idx
  ON exp_history (user_id, created_at DESC);

ALTER TABLE exp_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own exp history" ON exp_history;
CREATE POLICY "Users read own exp history" ON exp_history
  FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies — only service role writes.


-- ─── 3. PERSONAL_RECORDS ────────────────────────────────────────────────────
-- Tracks all-time maxes per exercise for Giga Drill Break detection.
CREATE TABLE IF NOT EXISTS personal_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_exercise_id UUID REFERENCES plan_exercises(id) ON DELETE CASCADE,
  exercise_name    TEXT NOT NULL,
  record_type      TEXT NOT NULL
    CHECK (record_type IN ('max_tonnage','max_weight','max_reps')),
  value            NUMERIC(10,2) NOT NULL CHECK (value > 0),
  session_id       UUID REFERENCES workout_sessions(id) ON DELETE SET NULL,
  achieved_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, plan_exercise_id, record_type)
);

CREATE INDEX IF NOT EXISTS personal_records_user_idx
  ON personal_records (user_id, achieved_at DESC);

ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own PRs" ON personal_records;
CREATE POLICY "Users read own PRs" ON personal_records
  FOR SELECT USING (auth.uid() = user_id);


-- ─── 4. SPIRAL_EVOLUTION_LOG ────────────────────────────────────────────────
-- Queue of "cinematic events" pending to be shown to the user.
CREATE TABLE IF NOT EXISTS spiral_evolution_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL
    CHECK (event_type IN ('tier_up','stage_up','pierce_the_heavens','meso_clear','giga_drill')),
  from_value   TEXT,
  to_value     TEXT,
  payload      JSONB,                   -- flexible: improvement pct, exercise_name, etc.
  flavor_quote TEXT,
  seen         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS spiral_evolution_log_user_pending_idx
  ON spiral_evolution_log (user_id, seen, created_at DESC);

ALTER TABLE spiral_evolution_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own evolution log" ON spiral_evolution_log;
CREATE POLICY "Users read own evolution log" ON spiral_evolution_log
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users mark own events seen" ON spiral_evolution_log;
CREATE POLICY "Users mark own events seen" ON spiral_evolution_log
  FOR UPDATE USING (auth.uid() = user_id);


-- ─── 5. VACATION_PERIODS ────────────────────────────────────────────────────
-- "Modalità Episodio in Spiaggia" — user-declared vacation windows.
-- Pauses resonance decay + Perfect Week evaluation (see checkPerfectWeek).
CREATE TABLE IF NOT EXISTS vacation_periods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL CHECK (end_date >= start_date),
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date - start_date <= 14)
);

CREATE INDEX IF NOT EXISTS vacation_periods_user_range_idx
  ON vacation_periods (user_id, start_date, end_date);

ALTER TABLE vacation_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own vacations" ON vacation_periods;
CREATE POLICY "Users read own vacations" ON vacation_periods
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own vacations" ON vacation_periods;
CREATE POLICY "Users insert own vacations" ON vacation_periods
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own vacations" ON vacation_periods;
CREATE POLICY "Users update own vacations" ON vacation_periods
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own vacations" ON vacation_periods;
CREATE POLICY "Users delete own vacations" ON vacation_periods
  FOR DELETE USING (auth.uid() = user_id);


-- ─── 6. ACHIEVEMENTS (static catalog) + USER_ACHIEVEMENTS (unlocks) ─────────
CREATE TABLE IF NOT EXISTS achievements (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL,           -- lucide-react name or emoji glyph
  rarity      TEXT NOT NULL CHECK (rarity IN ('common','uncommon','rare','legendary')),
  exp_reward  INT  NOT NULL DEFAULT 0,
  hidden      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read catalog" ON achievements;
CREATE POLICY "Authenticated read catalog" ON achievements
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_code TEXT NOT NULL REFERENCES achievements(code) ON DELETE CASCADE,
  unlocked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_code)
);

CREATE INDEX IF NOT EXISTS user_achievements_user_idx
  ON user_achievements (user_id, unlocked_at DESC);

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own unlocks" ON user_achievements;
CREATE POLICY "Users read own unlocks" ON user_achievements
  FOR SELECT USING (auth.uid() = user_id);


-- ─── 7. V1 ACHIEVEMENT SEED ─────────────────────────────────────────────────
-- Curated starter set. Extend in Step 4 up to ~20 achievements.
INSERT INTO achievements (code, name, description, icon, rarity, exp_reward, hidden) VALUES
  ('first_spark',    'Prima Scintilla',      'Prima sessione loggata.',                         'zap',          'common',    50,  false),
  ('iron_will',      'Volontà di Ferro',     '4 settimane consecutive con 3+ sessioni.',        'flame',        'uncommon',  200, false),
  ('perfect_spiral', 'Spirale Perfetta',     'Prima Perfect Week (allenamento + dieta + peso).','sparkles',     'uncommon',  150, false),
  ('infinite_spiral','Spirale Infinita',     'Resonance a x3.00 per la prima volta.',           'infinity',     'rare',      500, false),
  ('century_press',  'Centurione',           'Tonnellaggio di un esercizio supera 100 kg.',     'trophy',       'uncommon',  150, false),
  ('giga_drill',     'Giga Drill Break',     'Primo Giga Drill Break (nuovo PR di tonnellaggio).','swords',     'rare',      250, false),
  ('chapter_clear',  'Capitolo Concluso',    'Completato un mesociclo.',                        'book-open',    'rare',      500, false),
  ('triple_chapter', 'Tripla Spirale',       '3 mesocicli completati.',                         'layers',       'rare',      750, false),
  ('dawn_patrol',    'Pattuglia dell''Alba', '10 allenamenti registrati prima delle 10:00.',    'sunrise',      'uncommon',  200, false),
  ('pierce_heavens', 'Sfonda il Cielo',      'Raggiunto il Livello 100.',                       'star',         'legendary', 1000, true),
  ('tengen_toppa',   'Tengen Toppa',         'Raggiunto il Livello 200.',                       'telescope',    'legendary', 2500, true)
ON CONFLICT (code) DO NOTHING;


-- ─── 8. VISIBILITY / DIAGNOSTICS ─────────────────────────────────────────────
-- Verify manually after migration:
--   SELECT user_id, level, exp_total, spiral_stage FROM user_stats;
--   SELECT COUNT(*), source FROM exp_history GROUP BY source;
--   SELECT code, name FROM achievements ORDER BY code;
