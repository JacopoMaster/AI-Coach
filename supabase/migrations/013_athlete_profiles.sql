-- Migration 013: Athlete Profile (Coach AI 2.0 — Fase 1, task F1.2)
-- ────────────────────────────────────────────────────────────────────────────
-- Introduces the `athlete_profiles` table: one row per user holding the
-- RELATIVELY STABLE characteristics, constraints and preferences of the athlete
-- (identity, goals, experience, sustainable schedule, preferences, limitations,
-- lifestyle, adherence barriers, nutrition & coaching preferences).
--
-- Boundaries (see DECISIONS.md D012):
--   • NO prescriptions and NO current programming state here — training phase,
--     restart state, numeric calorie/macro targets live in workout_plans /
--     diet_plans / mesocycles / the future Training Strategy.
--   • body_measurements stays the source of truth for temporal physical metrics
--     (weight, body fat, masses, …). This table never duplicates measures.
--   • Profile completeness is DERIVED in the app layer (F1.3), never a persisted
--     boolean/column here.
--
-- Operational notes:
--   • Run MANUALLY in the Supabase SQL Editor (repo workflow — no CLI push).
--   • Prerequisite: migration 001 (auth.users FK target already in use project-wide).
--   • Idempotent & safe to re-run: CREATE TABLE IF NOT EXISTS, DROP POLICY/TRIGGER
--     IF EXISTS + CREATE, CREATE OR REPLACE FUNCTION. It performs NO DROP TABLE,
--     NO TRUNCATE, NO DELETE and NO data mutation.
--   • Creates NO profile rows: the per-user row is created lazily via upsert by
--     the API in F1.3. No real UUID/email/user data is inserted anywhere.
--   • POST-APPLY: run the read-only verification queries at the bottom and
--     confirm schema/RLS/policies/constraints/trigger BEFORE starting F1.3.
-- ────────────────────────────────────────────────────────────────────────────


-- ─── 1. GENERIC updated_at TRIGGER FUNCTION ─────────────────────────────────
-- No reusable updated_at trigger existed in the repo before this migration
-- (existing tables set updated_at from application code). This is the canonical,
-- reusable helper for any future table with an `updated_at` column.
-- CREATE OR REPLACE → idempotent.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


-- ─── 2. TABLE athlete_profiles ──────────────────────────────────────────────
-- One row per user. All fields except user_id / created_at / updated_at are
-- NULLABLE: the profile is filled progressively. Array columns have NO default,
-- preserving the semantic distinction required by the derived completeness:
--     NULL   = the user has not answered this question yet
--     '{}'   = explicit answer "none"
CREATE TABLE IF NOT EXISTS athlete_profiles (
  -- Identity
  user_id                            UUID        PRIMARY KEY
                                       REFERENCES auth.users(id) ON DELETE CASCADE,
  birth_date                         DATE,
  sex                                TEXT,
  height_cm                          SMALLINT,

  -- Goals
  primary_goal                       TEXT,
  secondary_goals                    TEXT[],
  goal_notes                         TEXT,

  -- Experience
  experience_level                   TEXT,
  years_training                     NUMERIC(3,1),

  -- Sustainable schedule (ideal vs minimum — D003/D004)
  target_sessions_per_week           SMALLINT,
  minimum_sessions_per_week          SMALLINT,
  preferred_training_days            TEXT[],
  preferred_session_duration_minutes SMALLINT,
  minimum_session_duration_minutes   SMALLINT,

  -- Training preferences
  preferred_exercises                TEXT[],
  avoided_exercises                  TEXT[],
  available_equipment                TEXT[],

  -- Limitations (self-reported, FUNCTIONAL — not clinical/diagnostic)
  training_limitations               TEXT[],
  injuries_or_pain_notes             TEXT,

  -- Lifestyle
  work_pattern                       TEXT,
  schedule_notes                     TEXT,
  daily_activity_level               TEXT,
  preferred_training_time            TEXT,

  -- Adherence / behaviour (why consistency is lost — D005)
  main_training_barriers             TEXT[],
  main_nutrition_barriers            TEXT[],

  -- Nutrition preferences (qualitative — numeric targets live in diet_plans)
  nutrition_goal                     TEXT,
  dietary_preferences                TEXT[],
  dietary_restrictions               TEXT[],
  allergies                          TEXT[],
  cooking_availability               TEXT,

  -- Coaching preferences
  coaching_style                     TEXT,
  explanation_detail                 TEXT,
  flexibility_preference             TEXT,

  -- Meta
  created_at                         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── Enum-like CHECKs (text + named CHECK, not native ENUM). All accept NULL. ──
  CONSTRAINT athlete_profiles_sex_chk
    CHECK (sex IS NULL OR sex IN ('male','female')),
  CONSTRAINT athlete_profiles_primary_goal_chk
    CHECK (primary_goal IS NULL OR primary_goal IN
      ('return_to_consistency','recomp','fat_loss','muscle_gain','strength','maintenance')),
  CONSTRAINT athlete_profiles_experience_level_chk
    CHECK (experience_level IS NULL OR experience_level IN
      ('beginner','intermediate','advanced')),
  CONSTRAINT athlete_profiles_work_pattern_chk
    CHECK (work_pattern IS NULL OR work_pattern IN
      ('fixed_daytime','shift','irregular','remote','student')),
  CONSTRAINT athlete_profiles_daily_activity_level_chk
    CHECK (daily_activity_level IS NULL OR daily_activity_level IN
      ('sedentary','light','moderate','active')),
  CONSTRAINT athlete_profiles_preferred_training_time_chk
    CHECK (preferred_training_time IS NULL OR preferred_training_time IN
      ('morning','afternoon','evening','variable')),
  CONSTRAINT athlete_profiles_nutrition_goal_chk
    CHECK (nutrition_goal IS NULL OR nutrition_goal IN
      ('fat_loss','maintenance','muscle_gain','recomp')),
  CONSTRAINT athlete_profiles_cooking_availability_chk
    CHECK (cooking_availability IS NULL OR cooking_availability IN
      ('none','low','medium','high')),
  CONSTRAINT athlete_profiles_coaching_style_chk
    CHECK (coaching_style IS NULL OR coaching_style IN
      ('supportive','direct','tough_love')),
  CONSTRAINT athlete_profiles_explanation_detail_chk
    CHECK (explanation_detail IS NULL OR explanation_detail IN
      ('minimal','standard','detailed')),
  CONSTRAINT athlete_profiles_flexibility_preference_chk
    CHECK (flexibility_preference IS NULL OR flexibility_preference IN
      ('strict','balanced','flexible')),

  -- ── Numeric range CHECKs (all accept NULL) ──
  CONSTRAINT athlete_profiles_height_cm_chk
    CHECK (height_cm IS NULL OR height_cm BETWEEN 100 AND 250),
  CONSTRAINT athlete_profiles_years_training_chk
    CHECK (years_training IS NULL OR (years_training >= 0 AND years_training <= 80)),
  CONSTRAINT athlete_profiles_target_sessions_chk
    CHECK (target_sessions_per_week IS NULL OR target_sessions_per_week BETWEEN 1 AND 7),
  CONSTRAINT athlete_profiles_minimum_sessions_chk
    CHECK (minimum_sessions_per_week IS NULL OR minimum_sessions_per_week BETWEEN 1 AND 7),
  CONSTRAINT athlete_profiles_pref_duration_chk
    CHECK (preferred_session_duration_minutes IS NULL
           OR preferred_session_duration_minutes BETWEEN 10 AND 240),
  CONSTRAINT athlete_profiles_min_duration_chk
    CHECK (minimum_session_duration_minutes IS NULL
           OR minimum_session_duration_minutes BETWEEN 10 AND 240),

  -- ── Cross-field coherence CHECKs (only enforced when BOTH sides are set) ──
  CONSTRAINT athlete_profiles_sessions_min_le_target_chk
    CHECK (minimum_sessions_per_week IS NULL
           OR target_sessions_per_week IS NULL
           OR minimum_sessions_per_week <= target_sessions_per_week),
  CONSTRAINT athlete_profiles_duration_min_le_pref_chk
    CHECK (minimum_session_duration_minutes IS NULL
           OR preferred_session_duration_minutes IS NULL
           OR minimum_session_duration_minutes <= preferred_session_duration_minutes),

  -- ── Constrained arrays (closed lists only where the vocabulary is fixed) ──
  -- `<@` = "is contained by": every element must be in the allowed set.
  -- Empty array '{}' is contained by anything → passes. NULL handled explicitly.
  CONSTRAINT athlete_profiles_preferred_training_days_chk
    CHECK (preferred_training_days IS NULL
           OR preferred_training_days <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']::TEXT[]),
  CONSTRAINT athlete_profiles_secondary_goals_chk
    CHECK (secondary_goals IS NULL
           OR secondary_goals <@ ARRAY['return_to_consistency','recomp','fat_loss','muscle_gain','strength','maintenance']::TEXT[])
  -- Open arrays (preferred_exercises, avoided_exercises, available_equipment,
  -- training_limitations, main_*_barriers, dietary_*, allergies) intentionally
  -- carry NO closed-list CHECK: their vocabulary must stay extensible. Finer
  -- application-level validation arrives in F1.3.
);


-- ─── 3. ROW LEVEL SECURITY ──────────────────────────────────────────────────
-- Follows the per-user pattern already used across the schema. No explicit
-- GRANT is issued: like every other app table, athlete_profiles relies on the
-- default Supabase privileges for the `authenticated` role, gated by RLS.
-- No DELETE policy — profile deletion is not a Fase 1 feature.
ALTER TABLE athlete_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own athlete profile" ON athlete_profiles;
CREATE POLICY "Users can read own athlete profile"
  ON athlete_profiles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own athlete profile" ON athlete_profiles;
CREATE POLICY "Users can insert own athlete profile"
  ON athlete_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE uses BOTH USING (row must already belong to the caller) and WITH CHECK
-- (the row AFTER update must still belong to the caller) → prevents changing
-- ownership to another user_id.
DROP POLICY IF EXISTS "Users can update own athlete profile" ON athlete_profiles;
CREATE POLICY "Users can update own athlete profile"
  ON athlete_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─── 4. updated_at TRIGGER ──────────────────────────────────────────────────
-- Keeps updated_at authoritative even for direct SQL updates. Idempotent.
DROP TRIGGER IF EXISTS trg_athlete_profiles_updated_at ON athlete_profiles;
CREATE TRIGGER trg_athlete_profiles_updated_at
  BEFORE UPDATE ON athlete_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- POST-APPLY VERIFICATION (read-only — run manually, they mutate nothing).
-- Confirm all of the following BEFORE starting F1.3.
-- ────────────────────────────────────────────────────────────────────────────
--
-- a) Table exists:
--   SELECT to_regclass('public.athlete_profiles') AS table_exists;  -- expect: athlete_profiles
--
-- b) Columns + types + nullability (35 columns; arrays must show NO default):
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'athlete_profiles'
--    ORDER BY ordinal_position;
--
-- c) RLS enabled:
--   SELECT relname, relrowsecurity
--     FROM pg_class WHERE relname = 'athlete_profiles';           -- expect relrowsecurity = true
--
-- d) Policies (expect exactly SELECT / INSERT / UPDATE, NO DELETE):
--   SELECT policyname, cmd, qual, with_check
--     FROM pg_policies WHERE schemaname = 'public' AND tablename = 'athlete_profiles'
--    ORDER BY policyname;
--
-- e) Named constraints (enum-like, numeric, coherence, array CHECKs):
--   SELECT conname, pg_get_constraintdef(oid) AS definition
--     FROM pg_constraint
--    WHERE conrelid = 'public.athlete_profiles'::regclass
--    ORDER BY conname;
--
-- f) updated_at trigger present + function exists:
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.athlete_profiles'::regclass AND NOT tgisinternal;
--   SELECT proname FROM pg_proc WHERE proname = 'set_updated_at';
--
-- g) No rows were created by this migration:
--   SELECT count(*) AS row_count FROM athlete_profiles;            -- expect: 0
-- ────────────────────────────────────────────────────────────────────────────
