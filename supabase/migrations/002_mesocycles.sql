-- Migration 002: Mesocycle system
-- Adds mesocycles, exercise_progressions, and weekly_check_ins tables.
-- Run this in the Supabase SQL editor AFTER 001_initial_schema.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. MESOCYCLES
--    Temporal container linking a workout_plan to a fixed training block.
--    duration_weeks: 6 or 8
--    status: active (in progress) | completed (ended) | archived (hidden)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE mesocycles (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_plan_id UUID        NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  start_date      DATE        NOT NULL,
  end_date        DATE,                                  -- NULL while active
  duration_weeks  INT         NOT NULL DEFAULT 6
    CHECK (duration_weeks IN (6, 8)),
  status          TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'archived')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX mesocycles_user_status_idx ON mesocycles (user_id, status);

ALTER TABLE mesocycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own mesocycles"
  ON mesocycles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own mesocycles"
  ON mesocycles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own mesocycles"
  ON mesocycles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own mesocycles"
  ON mesocycles FOR DELETE
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. EXERCISE_PROGRESSIONS
--    Weekly weight/reps targets for each exercise within a mesocycle.
--    One row per (plan_exercise, week_number) pair.
--    Populated either by the AI check-in or manually by the user.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE exercise_progressions (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  mesocycle_id     UUID         NOT NULL REFERENCES mesocycles(id) ON DELETE CASCADE,
  plan_exercise_id UUID         NOT NULL REFERENCES plan_exercises(id) ON DELETE CASCADE,
  week_number      INT          NOT NULL CHECK (week_number BETWEEN 1 AND 8),
  target_sets      INT,
  target_reps      INT,
  target_weight_kg NUMERIC(6,2),
  notes            TEXT,
  UNIQUE (plan_exercise_id, week_number)
);

CREATE INDEX exercise_progressions_meso_idx ON exercise_progressions (mesocycle_id);

ALTER TABLE exercise_progressions ENABLE ROW LEVEL SECURITY;

-- Access is granted transitively through the mesocycle owner.
CREATE POLICY "Users can read own exercise progressions"
  ON exercise_progressions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mesocycles m
      WHERE m.id = mesocycle_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own exercise progressions"
  ON exercise_progressions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mesocycles m
      WHERE m.id = mesocycle_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own exercise progressions"
  ON exercise_progressions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM mesocycles m
      WHERE m.id = mesocycle_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own exercise progressions"
  ON exercise_progressions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM mesocycles m
      WHERE m.id = mesocycle_id
        AND m.user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. WEEKLY_CHECK_INS
--    Audit log of every AI check-in (weekly or end-of-meso).
--    session_data: snapshot of the week's workout logs fed to the LLM.
--    ai_analysis:  structured JSON returned by the LLM (validated via Zod).
--    applied:      true once the user confirms and changes are written to DB.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE weekly_check_ins (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mesocycle_id   UUID        NOT NULL REFERENCES mesocycles(id) ON DELETE CASCADE,
  week_number    INT         NOT NULL CHECK (week_number BETWEEN 1 AND 8),
  check_in_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
  check_in_type  TEXT        NOT NULL DEFAULT 'weekly'
    CHECK (check_in_type IN ('weekly', 'end_of_meso')),
  session_data   JSONB,
  ai_analysis    JSONB,
  applied        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX weekly_check_ins_user_meso_idx ON weekly_check_ins (user_id, mesocycle_id);

ALTER TABLE weekly_check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own check-ins"
  ON weekly_check_ins FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own check-ins"
  ON weekly_check_ins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own check-ins"
  ON weekly_check_ins FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own check-ins"
  ON weekly_check_ins FOR DELETE
  USING (auth.uid() = user_id);
