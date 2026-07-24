-- Migration 014: Restart Assessment + Training Strategy (Coach AI 2.0 — Fase 2, task F2.3)
-- ════════════════════════════════════════════════════════════════════════════
-- Introduces the two persistent entities of the September Restart (D014):
--
--   • public.restart_assessments  — the FACTUAL, AUDITABLE snapshot of "what we
--     knew when the decision was taken". IMMUTABLE after insert (INSERT once,
--     never UPDATE/DELETE via RLS). No updated_at, no trigger.
--
--   • public.training_strategies  — the ACTIVE, VERSIONED decision of "what we
--     are doing and why". Has a lifecycle status; EXACTLY ONE `active` strategy
--     per user is enforced at the DB level via a partial unique index. Its CORE
--     content is immutable after insert (a BEFORE UPDATE trigger restricts UPDATEs
--     to status/review_date/plan/meso links only); a substantive change must
--     create a NEW superseding strategy, not rewrite history.
--
-- Historical-integrity choices (audited 2026-07-24, F2.3 review round 2):
--   • restart_assessments.assessed_workout_plan_id / assessed_mesocycle_id carry
--     NO foreign key: ON DELETE SET NULL is forbidden (it would mutate an immutable
--     Assessment), and the app performs no in-app hard delete of plans/mesocycles,
--     so an FK would only add auth.users-cascade fragility. baseline_snapshot is
--     the authoritative historical record; ownership is validated in F2.4/F2.6.
--   • training_strategies UPDATEs are additionally gated by a core-immutability
--     trigger with explicit allowed status transitions (see §ENFORCEMENT below).
--   • All RLS policies are scoped TO authenticated.
--
-- Boundaries (D012 / D014):
--   • Athlete Profile (chi è l'utente) is NOT touched by this migration.
--   • A Strategy MAY link to the concrete prescription (workout_plan / mesocycle)
--     but NEVER contains exercises/sets/reps: those stay in workout_plans /
--     plan_exercises / mesocycles.
--   • The Assessment stores the decision-time snapshot as bounded JSONB
--     (baseline_snapshot, profile_snapshot) + a small set of denormalized scalars
--     for cheap audit/timeline/Decision-Center queries — NOT every metric.
--
-- Persistence timing (D007 / D018):
--   • NOTHING is persisted here. Baseline and AI proposal remain application
--     state until the user CONFIRMS the hybrid flow (D018). Only then does the
--     app INSERT the immutable Assessment and the active Strategy. This migration
--     only creates the schema that will hold them.
--
-- Operational notes:
--   • Run MANUALLY in the Supabase SQL Editor (repo workflow — no CLI push).
--   • Prerequisites: migration 001 (auth.users, workout_plans), 002 (mesocycles),
--     013 (public.set_updated_at()). 014 is SEQUENTIAL after 013 and REUSES the
--     existing set_updated_at() function — it is NOT redefined here (013 is DONE
--     and verified on the real DB; redefining it would be needless duplication).
--   • Idempotent & safe to re-run: CREATE TABLE IF NOT EXISTS, CREATE [UNIQUE]
--     INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION, DROP POLICY/TRIGGER IF
--     EXISTS + CREATE. NO DROP TABLE, NO TRUNCATE, NO DELETE, NO INSERT, NO data
--     mutation. A new function public.enforce_training_strategy_update() is added.
--   • Creates NO rows: assessments/strategies are inserted by the app in F2.4/F2.6.
--   • POST-APPLY: run the read-only verification queries at the bottom and confirm
--     schema/RLS/policies/index/trigger BEFORE marking F2.3 DONE.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- 1. TABLE restart_assessments  — IMMUTABLE factual snapshot
-- ════════════════════════════════════════════════════════════════════════════
-- One row per confirmed Restart decision (D008/D018). Once inserted it is a
-- historical fact: there is NO updated_at, NO trigger, and RLS exposes only
-- SELECT + INSERT (no UPDATE/DELETE policy) → immutable for the authenticated
-- user.
--
-- Analysis period semantics mirror F2.2 RestartBaseline.AnalysisPeriod exactly:
--   analysis_period_end   === RestartBaseline.analysis_period.end === analysis_date
--                             (inclusive end of every window)
--   analysis_period_start === RestartBaseline.analysis_period.start_12w
--                             (start of the widest, 12-week/84-day window)
-- Hence analysis_date = analysis_period_end (enforced) and start <= end.
CREATE TABLE IF NOT EXISTS restart_assessments (
  -- ── Identity ──
  id                                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                               UUID        NOT NULL
                                          REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at                            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NB: intentionally NO updated_at — the Assessment is immutable after insert.

  -- ── Analysis period (Europe/Rome calendar dates, D002) ──
  analysis_date                         DATE        NOT NULL,
  analysis_period_start                 DATE        NOT NULL,  -- start_12w (widest window)
  analysis_period_end                   DATE        NOT NULL,  -- === analysis_date

  -- ── Decision-time snapshots (bounded, serializable JSONB) ──
  -- baseline_snapshot: the exact RestartBaseline (F2.2) used for the decision.
  -- profile_snapshot:  the decision-relevant Athlete Profile fields (built by the
  --   app in F2.4/F2.6). MUST exclude user_id/created_at/updated_at and any DB
  --   metadata. Structural/Zod validation is APPLICATION-side (F2.4/F2.6); the DB
  --   only guarantees the value is a JSON object, not its inner shape.
  baseline_snapshot_version             SMALLINT    NOT NULL DEFAULT 1,
  baseline_snapshot                     JSONB       NOT NULL,
  profile_snapshot_version              SMALLINT    NOT NULL DEFAULT 1,
  profile_snapshot                      JSONB       NOT NULL,

  -- ── Per-domain data quality (queryable without parsing the JSONB) ──
  -- Mirrors RestartBaseline.data_quality (DataQualityLevel).
  training_consistency_data_quality     TEXT        NOT NULL,
  performance_data_quality              TEXT        NOT NULL,
  body_data_quality                     TEXT        NOT NULL,
  nutrition_data_quality                TEXT        NOT NULL,

  -- ── Small set of denormalized scalar evidence (audit/timeline/query) ──
  -- Intentional denormalization of the snapshot: the full baseline stays in
  -- baseline_snapshot; only cheaply-queryable scalars are surfaced here.
  sessions_4w                           SMALLINT    NOT NULL,   -- training_consistency.window_4w.sessions_count
  sessions_8w                           SMALLINT    NOT NULL,   -- window_8w.sessions_count
  sessions_12w                          SMALLINT    NOT NULL,   -- window_12w.sessions_count
  last_session_date                     DATE,                   -- training_consistency.last_session_date
  days_since_last_session               INTEGER,                -- training_consistency.days_since_last_session
  latest_weight_kg                      NUMERIC(5,2),           -- body.latest_weight_kg
  latest_body_measurement_date          DATE,                   -- body.latest_measurement_date
  days_since_latest_body_measurement    INTEGER,                -- body.days_since_latest_measurement
  nutrition_tracked_days_28d            SMALLINT    NOT NULL,   -- nutrition.tracked_days
  nutrition_tracked_days_ratio          NUMERIC     NOT NULL,   -- nutrition.tracked_days_ratio (0..1)

  -- ── Manual (adaptive) Restart answers — nullable = question NOT asked ──
  -- NULL is meaningful: the question was not posed / no answer available. No
  -- defaults that would erase the "not asked" vs "answered" distinction.
  -- New limitations text is NOT stored here: if any, it is confirmed/updated on
  -- the Athlete Profile (source of truth) and captured via profile_snapshot.
  readiness_score                       SMALLINT,               -- 1..5 when asked
  perceived_strength_change             TEXT,                   -- lower/same/higher/unsure
  availability_changed                  BOOLEAN,
  new_limitations_reported              BOOLEAN,

  -- ── Optional factual links to concrete prescription at assessment time ──
  -- Plain nullable UUIDs with NO foreign key. Rationale (audited 2026-07-24):
  --   • The Assessment is IMMUTABLE: ON DELETE SET NULL is FORBIDDEN here because
  --     deleting the referenced row would silently mutate a persisted Assessment.
  --   • The app performs NO in-app hard delete of workout_plans/mesocycles — they
  --     are only lifecycle-flagged (is_active=false / status archived|completed).
  --     The only delete path is the auth.users ON DELETE CASCADE (account removal).
  --   • ON DELETE RESTRICT would be needless (no in-app delete) AND fragile: in the
  --     auth.users multi-path cascade, workout_plans/mesocycles (FKs from 001/002)
  --     are cascade-deleted alongside restart_assessments (FK from 014); RESTRICT is
  --     non-deferrable and checked immediately, so if a plan/meso row is deleted
  --     before the still-referencing assessment row, account deletion would abort.
  --   • baseline_snapshot (plan_fit.plan_id, mesocycle_context.*) remains the
  --     AUTHORITATIVE historical record; these columns are a query convenience.
  -- Therefore: no FK. Existence/ownership is validated in the app (F2.4/F2.6).
  assessed_workout_plan_id              UUID,
  assessed_mesocycle_id                 UUID,

  -- ── Composite-unique target for the same-user FK from training_strategies ──
  -- id is already unique (PK); this pair-uniqueness exists ONLY so a composite FK
  -- (based_on_assessment_id, user_id) can reference (id, user_id) and thereby
  -- guarantee a Strategy can never point at another user's Assessment.
  CONSTRAINT restart_assessments_id_user_uniq UNIQUE (id, user_id),

  -- ── Analysis-period coherence (F2.2 semantics) ──
  CONSTRAINT restart_assessments_period_order_chk
    CHECK (analysis_period_start <= analysis_period_end),
  CONSTRAINT restart_assessments_analysis_date_eq_end_chk
    CHECK (analysis_date = analysis_period_end),

  -- ── Snapshot guards (shallow only — deep validation is app/Zod, F2.4/F2.6) ──
  CONSTRAINT restart_assessments_baseline_snapshot_version_chk
    CHECK (baseline_snapshot_version >= 1),
  CONSTRAINT restart_assessments_baseline_snapshot_object_chk
    CHECK (jsonb_typeof(baseline_snapshot) = 'object'),
  CONSTRAINT restart_assessments_profile_snapshot_version_chk
    CHECK (profile_snapshot_version >= 1),
  CONSTRAINT restart_assessments_profile_snapshot_object_chk
    CHECK (jsonb_typeof(profile_snapshot) = 'object'),

  -- ── Data-quality enum-like CHECKs (DataQualityLevel) ──
  CONSTRAINT restart_assessments_training_dq_chk
    CHECK (training_consistency_data_quality IN ('insufficient','limited','sufficient')),
  CONSTRAINT restart_assessments_performance_dq_chk
    CHECK (performance_data_quality IN ('insufficient','limited','sufficient')),
  CONSTRAINT restart_assessments_body_dq_chk
    CHECK (body_data_quality IN ('insufficient','limited','sufficient')),
  CONSTRAINT restart_assessments_nutrition_dq_chk
    CHECK (nutrition_data_quality IN ('insufficient','limited','sufficient')),

  -- ── Scalar-evidence range CHECKs ──
  CONSTRAINT restart_assessments_sessions_4w_chk
    CHECK (sessions_4w >= 0),
  CONSTRAINT restart_assessments_sessions_8w_chk
    CHECK (sessions_8w >= 0),
  CONSTRAINT restart_assessments_sessions_12w_chk
    CHECK (sessions_12w >= 0),
  CONSTRAINT restart_assessments_days_since_last_session_chk
    CHECK (days_since_last_session IS NULL OR days_since_last_session >= 0),
  CONSTRAINT restart_assessments_latest_weight_kg_chk
    CHECK (latest_weight_kg IS NULL OR latest_weight_kg > 0),
  CONSTRAINT restart_assessments_days_since_body_meas_chk
    CHECK (days_since_latest_body_measurement IS NULL OR days_since_latest_body_measurement >= 0),
  CONSTRAINT restart_assessments_nutrition_tracked_days_chk
    CHECK (nutrition_tracked_days_28d BETWEEN 0 AND 28),
  CONSTRAINT restart_assessments_nutrition_ratio_chk
    CHECK (nutrition_tracked_days_ratio >= 0 AND nutrition_tracked_days_ratio <= 1),

  -- ── Manual-answer enum/range CHECKs (all accept NULL = "not asked") ──
  CONSTRAINT restart_assessments_readiness_score_chk
    CHECK (readiness_score IS NULL OR readiness_score BETWEEN 1 AND 5),
  CONSTRAINT restart_assessments_perceived_strength_change_chk
    CHECK (perceived_strength_change IS NULL
           OR perceived_strength_change IN ('lower','same','higher','unsure'))
);

-- ── Indices (avoid premature JSONB GIN — snapshots are NOT indexed in F2.3) ──
CREATE INDEX IF NOT EXISTS restart_assessments_user_created_idx
  ON restart_assessments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS restart_assessments_user_analysis_date_idx
  ON restart_assessments (user_id, analysis_date DESC);


-- ── RLS: SELECT + INSERT only → immutable (no UPDATE, no DELETE policy) ──
ALTER TABLE restart_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own restart assessments" ON restart_assessments;
CREATE POLICY "Users can read own restart assessments"
  ON restart_assessments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own restart assessments" ON restart_assessments;
CREATE POLICY "Users can insert own restart assessments"
  ON restart_assessments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
-- Deliberately NO UPDATE and NO DELETE policy → the Assessment is write-once.
-- Deliberately NO updated_at trigger → nothing to touch on an immutable row.


-- ════════════════════════════════════════════════════════════════════════════
-- 2. TABLE training_strategies  — active, versioned decision
-- ════════════════════════════════════════════════════════════════════════════
-- The interpretive decision (D014): what we do and why. Has a lifecycle status
-- and EXACTLY ONE `active` per user (partial unique index below). Links to the
-- Assessment it is based on (same-user, FK-enforced) and optionally to the
-- concrete prescription. Contains NO exercises/sets/reps.
CREATE TABLE IF NOT EXISTS training_strategies (
  -- ── Identity ──
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID        NOT NULL
                              REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── Lifecycle ──
  status                    TEXT        NOT NULL,   -- active | superseded | completed
  strategy_type             TEXT        NOT NULL,   -- restart (only type for now)

  -- ── Period (Europe/Rome calendar dates, D002) ──
  start_date                DATE        NOT NULL,
  review_date               DATE        NOT NULL,

  -- ── Prescription-level frequency targets of THIS strategy ──
  -- May be informed by the Athlete Profile but are the (temporary) decision, not
  -- necessarily identical to the profile's stable preference.
  target_sessions_per_week  SMALLINT    NOT NULL,
  minimum_sessions_per_week SMALLINT    NOT NULL,

  -- ── Explainability (D006) — each field a distinct facet ──
  primary_objective         TEXT        NOT NULL,          -- the single main aim
  summary                   TEXT        NOT NULL,          -- what we are doing
  rationale                 TEXT        NOT NULL,          -- why
  priorities                TEXT[]      NOT NULL,          -- operative order (>=1)
  observations              TEXT[]      NOT NULL DEFAULT '{}',  -- what the data showed
  risks_uncertainties       TEXT[]      NOT NULL DEFAULT '{}',  -- what could change it

  -- ── Links ──
  -- based_on_assessment_id: a Strategy cannot exist without an Assessment.
  --   Same-user is DB-enforced via the composite FK below (see §21 rationale).
  based_on_assessment_id    UUID        NOT NULL,
  -- supersedes_id: the previous Strategy this one replaces (same user, self-FK).
  supersedes_id             UUID,
  -- Optional links to the concrete prescription (survive its deletion, SET NULL).
  -- Same-user NOT FK-enforced here (would require composite UNIQUE on existing
  -- tables — out of scope, §23); F2.6 validates ownership before linking.
  workout_plan_id           UUID        REFERENCES workout_plans(id) ON DELETE SET NULL,
  mesocycle_id              UUID        REFERENCES mesocycles(id) ON DELETE SET NULL,

  -- ── Composite-unique target for the same-user self-FK (supersedes_id) ──
  -- id is already unique (PK); this pair-uniqueness exists ONLY as the FK target.
  CONSTRAINT training_strategies_id_user_uniq UNIQUE (id, user_id),

  -- ── Same-user FK: Strategy → Assessment (§21) ──
  -- References restart_assessments(id, user_id). Because both columns are NOT
  -- NULL the FK is always enforced, so a Strategy of user A can only reference an
  -- Assessment of user A (same-user integrity, unchanged).
  -- ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED (audited 2026-07-24, round 3):
  -- the referential check is deferred to COMMIT instead of firing immediately. In
  -- normal use there is no DELETE path via RLS, so this behaves like RESTRICT. But
  -- deleting an auth.users account cascades to BOTH restart_assessments and
  -- training_strategies via their user_id FKs; that multi-path cascade may delete a
  -- referenced Assessment before the referencing Strategy within the same statement.
  -- An immediate RESTRICT would abort the account deletion depending on cascade
  -- order; a DEFERRED NO ACTION lets the whole cascade run and re-checks at COMMIT,
  -- by when both rows are gone → the account deletion succeeds. An ISOLATED delete
  -- that truly leaves a dangling reference still fails (at COMMIT).
  CONSTRAINT training_strategies_assessment_fk
    FOREIGN KEY (based_on_assessment_id, user_id)
    REFERENCES restart_assessments (id, user_id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED,

  -- ── Same-user self-FK: Strategy → superseded Strategy (§22) ──
  -- References training_strategies(id, user_id). MATCH SIMPLE: when supersedes_id
  -- IS NULL the FK is not checked (a first strategy has no predecessor); when set,
  -- both columns are non-null so same-user is enforced (unchanged).
  -- ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED (round 3): same rationale — an
  -- auth.users cascade can delete an old (superseded) Strategy before the newer one
  -- that points at it via supersedes_id; deferring the check to COMMIT lets the full
  -- cascade complete, while an isolated dangling delete still fails at COMMIT.
  CONSTRAINT training_strategies_supersedes_fk
    FOREIGN KEY (supersedes_id, user_id)
    REFERENCES training_strategies (id, user_id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED,

  -- ── Lifecycle enum CHECKs ──
  CONSTRAINT training_strategies_status_chk
    CHECK (status IN ('active','superseded','completed')),
  CONSTRAINT training_strategies_strategy_type_chk
    CHECK (strategy_type IN ('restart')),

  -- ── Period CHECK (product preference: strictly after start) ──
  CONSTRAINT training_strategies_review_after_start_chk
    CHECK (review_date > start_date),

  -- ── Frequency-target range + coherence CHECKs ──
  CONSTRAINT training_strategies_target_sessions_chk
    CHECK (target_sessions_per_week BETWEEN 1 AND 7),
  CONSTRAINT training_strategies_minimum_sessions_chk
    CHECK (minimum_sessions_per_week BETWEEN 1 AND 7),
  CONSTRAINT training_strategies_min_le_target_chk
    CHECK (minimum_sessions_per_week <= target_sessions_per_week),

  -- ── Explainability non-emptiness + bounded cardinality CHECKs ──
  CONSTRAINT training_strategies_primary_objective_nonempty_chk
    CHECK (btrim(primary_objective) <> ''),
  CONSTRAINT training_strategies_summary_nonempty_chk
    CHECK (btrim(summary) <> ''),
  CONSTRAINT training_strategies_rationale_nonempty_chk
    CHECK (btrim(rationale) <> ''),
  CONSTRAINT training_strategies_priorities_cardinality_chk
    CHECK (cardinality(priorities) BETWEEN 1 AND 10),
  CONSTRAINT training_strategies_observations_cardinality_chk
    CHECK (cardinality(observations) <= 20),
  CONSTRAINT training_strategies_risks_cardinality_chk
    CHECK (cardinality(risks_uncertainties) <= 20),

  -- ── Self-reference guard (no arbitrary-cycle check here — that is app-side) ──
  CONSTRAINT training_strategies_supersedes_not_self_chk
    CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

-- ── Indices ──
-- EXACTLY ONE active strategy per user — the fundamental DB invariant (§16).
-- A partial unique index (not a table constraint: partial uniqueness cannot be a
-- constraint) → cannot be DEFERRABLE, so the future supersede transaction (F2.6)
-- must UPDATE old→superseded BEFORE INSERTing the new active row.
CREATE UNIQUE INDEX IF NOT EXISTS training_strategies_one_active_per_user_uidx
  ON training_strategies (user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS training_strategies_user_created_idx
  ON training_strategies (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS training_strategies_user_review_date_idx
  ON training_strategies (user_id, review_date);
CREATE INDEX IF NOT EXISTS training_strategies_based_on_assessment_idx
  ON training_strategies (based_on_assessment_id);


-- ── RLS: SELECT + INSERT + UPDATE (status/review lifecycle), NO DELETE ──
ALTER TABLE training_strategies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own training strategies" ON training_strategies;
CREATE POLICY "Users can read own training strategies"
  ON training_strategies FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own training strategies" ON training_strategies;
CREATE POLICY "Users can insert own training strategies"
  ON training_strategies FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE uses BOTH USING (row must already belong to the caller) and WITH CHECK
-- (the row AFTER update must still belong to the caller) → prevents re-owning.
-- NB: this policy governs OWNERSHIP only. WHICH columns/transitions an UPDATE may
-- perform is restricted independently by the enforce_training_strategy_update()
-- trigger below — the policy being satisfied is necessary but not sufficient.
DROP POLICY IF EXISTS "Users can update own training strategies" ON training_strategies;
CREATE POLICY "Users can update own training strategies"
  ON training_strategies FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
-- Deliberately NO DELETE policy → strategies are never hard-deleted via RLS;
-- lifecycle transitions are active → superseded/completed (UPDATE only).


-- ── CORE-IMMUTABILITY ENFORCEMENT (partial immutability of a versioned row) ──
-- The Strategy is VERSIONED: a substantive change must create a NEW strategy
-- (supersedes_id) rather than rewrite the historical content of an existing row.
-- The UPDATE RLS policy alone would allow rewriting everything, so this trigger
-- restricts an UPDATE to ONLY:
--     status, review_date, workout_plan_id, mesocycle_id
--   (+ updated_at, which is stamped by set_updated_at() and intentionally ignored
--    here — the check never looks at updated_at, so trigger order is irrelevant).
-- Every other column is IMMUTABLE after INSERT. It also enforces the allowed
-- status transitions. Comparisons use IS DISTINCT FROM (NULL-safe). Fires on
-- UPDATE only → the initial INSERT is never affected.
CREATE OR REPLACE FUNCTION public.enforce_training_strategy_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- 1) Immutable core — any change ⇒ reject (create a new superseding strategy).
  IF NEW.id                        IS DISTINCT FROM OLD.id
     OR NEW.user_id                IS DISTINCT FROM OLD.user_id
     OR NEW.created_at             IS DISTINCT FROM OLD.created_at
     OR NEW.strategy_type          IS DISTINCT FROM OLD.strategy_type
     OR NEW.start_date             IS DISTINCT FROM OLD.start_date
     OR NEW.target_sessions_per_week  IS DISTINCT FROM OLD.target_sessions_per_week
     OR NEW.minimum_sessions_per_week IS DISTINCT FROM OLD.minimum_sessions_per_week
     OR NEW.primary_objective      IS DISTINCT FROM OLD.primary_objective
     OR NEW.summary                IS DISTINCT FROM OLD.summary
     OR NEW.rationale              IS DISTINCT FROM OLD.rationale
     OR NEW.priorities             IS DISTINCT FROM OLD.priorities
     OR NEW.observations           IS DISTINCT FROM OLD.observations
     OR NEW.risks_uncertainties    IS DISTINCT FROM OLD.risks_uncertainties
     OR NEW.based_on_assessment_id IS DISTINCT FROM OLD.based_on_assessment_id
     OR NEW.supersedes_id          IS DISTINCT FROM OLD.supersedes_id
  THEN
    RAISE EXCEPTION
      'training_strategies %: core content is immutable — create a new strategy with supersedes_id instead of rewriting it',
      OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2) Allowed status transitions. active→active is not a change (skipped here);
  --    the only permitted CHANGES are active→superseded and active→completed.
  --    superseded and completed are TERMINAL: any change from them is rejected.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'active' AND NEW.status IN ('superseded','completed')) THEN
      RAISE EXCEPTION
        'training_strategies %: illegal status transition % -> % (allowed: active->superseded, active->completed)',
        OLD.id, OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Enforcement runs BEFORE the updated_at stamp. BEFORE-row triggers fire in name
-- order: 'trg_training_strategies_enforce_update' < '..._updated_at' → enforce
-- validates the intended change first, then set_updated_at() stamps now(). Order
-- is not correctness-critical (enforce ignores updated_at) but is deterministic.
DROP TRIGGER IF EXISTS trg_training_strategies_enforce_update ON training_strategies;
CREATE TRIGGER trg_training_strategies_enforce_update
  BEFORE UPDATE ON training_strategies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_training_strategy_update();


-- ── updated_at TRIGGER (reuses public.set_updated_at() from migration 013) ──
-- 014 is sequential after 013; the function already exists and is verified on the
-- real DB, so it is NOT redefined here. restart_assessments gets NO trigger AT ALL
-- (immutable — verified below). Only training_strategies has updated_at.
DROP TRIGGER IF EXISTS trg_training_strategies_updated_at ON training_strategies;
CREATE TRIGGER trg_training_strategies_updated_at
  BEFORE UPDATE ON training_strategies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ════════════════════════════════════════════════════════════════════════════
-- POST-APPLY VERIFICATION (read-only — run manually, they mutate nothing).
-- Confirm all of the following BEFORE marking F2.3 DONE.
-- Reminder: pg_policies exposes the column as `policyname` (NOT `polname`).
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1) Both tables exist in schema public:
--   SELECT to_regclass('public.restart_assessments')  AS assessments,   -- expect: restart_assessments
--          to_regclass('public.training_strategies')  AS strategies;    -- expect: training_strategies
--
-- 2) Column counts (expect restart_assessments = 30, training_strategies = 20):
--   SELECT table_name, count(*) AS column_count
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name IN ('restart_assessments','training_strategies')
--    GROUP BY table_name ORDER BY table_name;
--
--   -- full column list + types + nullability + defaults:
--   SELECT table_name, column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name IN ('restart_assessments','training_strategies')
--    ORDER BY table_name, ordinal_position;
--
-- 3) RLS enabled on both:
--   SELECT relname, relrowsecurity
--     FROM pg_class
--    WHERE relname IN ('restart_assessments','training_strategies')
--    ORDER BY relname;                                            -- expect relrowsecurity = true (both)
--
-- 4) restart_assessments policies (expect exactly SELECT + INSERT; NO UPDATE, NO
--    DELETE) AND all scoped to the `authenticated` role (roles = {authenticated}):
--   SELECT policyname, cmd, roles, qual, with_check
--     FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'restart_assessments'
--    ORDER BY cmd, policyname;
--    -- expect 2 rows: SELECT + INSERT; roles must read {authenticated} (NOT {public}).
--
-- 5) training_strategies policies (expect SELECT + INSERT + UPDATE; NO DELETE) AND
--    all scoped to the `authenticated` role:
--   SELECT policyname, cmd, roles, qual, with_check
--     FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'training_strategies'
--    ORDER BY cmd, policyname;
--    -- expect 3 rows: SELECT + INSERT + UPDATE; roles must read {authenticated}.
--
-- 6) Partial unique index enforcing one active strategy per user:
--   SELECT indexname, indexdef
--     FROM pg_indexes
--    WHERE schemaname = 'public' AND tablename = 'training_strategies'
--      AND indexname = 'training_strategies_one_active_per_user_uidx';
--   -- indexdef must contain: UNIQUE ... (user_id) WHERE (status = 'active')
--
-- 7) Triggers on training_strategies — BOTH present, in name (firing) order:
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.training_strategies'::regclass AND NOT tgisinternal
--    ORDER BY tgname;
--    -- expect exactly 2, in this order:
--    --   trg_training_strategies_enforce_update   (core-immutability enforcement)
--    --   trg_training_strategies_updated_at       (updated_at stamp)
--
-- 8) Enforcement function + reused updated_at function both exist:
--   SELECT proname FROM pg_proc
--    WHERE proname IN ('enforce_training_strategy_update','set_updated_at')
--    ORDER BY proname;
--    -- expect both: enforce_training_strategy_update, set_updated_at (set_updated_at from 013)
--
-- 9) NO mutating trigger on restart_assessments (immutable table):
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.restart_assessments'::regclass AND NOT tgisinternal;
--    -- expect: 0 rows
--
-- 10) Foreign keys — assessed_* must have NO FK (SET NULL removed), and the
--     same-user FKs must be present:
--   SELECT conrelid::regclass AS table, conname, pg_get_constraintdef(oid) AS definition
--     FROM pg_constraint
--    WHERE contype = 'f'
--      AND conrelid IN ('public.restart_assessments'::regclass,
--                       'public.training_strategies'::regclass)
--    ORDER BY conrelid::regclass::text, conname;
--   -- restart_assessments: expect ONLY the auth.users FK (user_id). NO FK whose
--   --   definition mentions workout_plans / mesocycles, and NO 'ON DELETE SET NULL'
--   --   anywhere on this table (assessed_workout_plan_id / assessed_mesocycle_id are
--   --   plain UUIDs — existence/ownership validated in the app, F2.4/F2.6).
--   -- training_strategies: expect
--   --   training_strategies_assessment_fk  → restart_assessments(id, user_id)
--   --   training_strategies_supersedes_fk  → training_strategies(id, user_id)
--   --   (workout_plan_id / mesocycle_id keep ON DELETE SET NULL — Strategy is NOT immutable.)
--
-- 10b) The two SAME-USER composite FKs must be NO ACTION + DEFERRABLE INITIALLY
--      DEFERRED (round 3 — survives the auth.users multi-path cascade):
--   SELECT conname,
--          confdeltype,      -- expect 'a' = NO ACTION  (NOT 'r' RESTRICT, NOT 'n' SET NULL)
--          condeferrable,    -- expect true
--          condeferred       -- expect true  (INITIALLY DEFERRED)
--     FROM pg_constraint
--    WHERE conrelid = 'public.training_strategies'::regclass
--      AND contype = 'f'
--      AND conname IN ('training_strategies_assessment_fk',
--                      'training_strategies_supersedes_fk')
--    ORDER BY conname;
--   -- Both rows must read: confdeltype='a', condeferrable=t, condeferred=t.
--   -- (For contrast, the plan/meso FKs training_strategies_*_fk on workout_plan_id/
--   --  mesocycle_id remain confdeltype='n' (SET NULL), condeferrable=f.)
--
--   -- (optional) all named CHECK/UNIQUE constraints:
--   SELECT conrelid::regclass AS table, conname, contype, pg_get_constraintdef(oid) AS definition
--     FROM pg_constraint
--    WHERE conrelid IN ('public.restart_assessments'::regclass,
--                       'public.training_strategies'::regclass)
--    ORDER BY conrelid::regclass::text, contype, conname;
--
-- 11) No rows were created by this migration:
--   SELECT (SELECT count(*) FROM restart_assessments) AS assessments_rows,   -- expect: 0
--          (SELECT count(*) FROM training_strategies) AS strategies_rows;    -- expect: 0
--
-- ════════════════════════════════════════════════════════════════════════════
-- TRANSACTIONAL BEHAVIOUR TESTS (manual, OPTIONAL — run ONLY after applying, with
-- a REAL authenticated session and a controlled test row, then ROLLBACK). These
-- are NOT auto-executed and insert NO seed data. Run them as the owning user so
-- RLS + triggers both apply. Replace <ASSESSMENT_ID> with a real owned assessment.
-- Each block is wrapped in BEGIN/ROLLBACK so nothing persists.
--
-- Setup (inside one transaction you will ROLLBACK):
--   BEGIN;
--   INSERT INTO training_strategies (
--     user_id, status, strategy_type, start_date, review_date,
--     target_sessions_per_week, minimum_sessions_per_week,
--     primary_objective, summary, rationale, priorities, based_on_assessment_id)
--   VALUES (
--     auth.uid(), 'active', 'restart', current_date, current_date + 28,
--     3, 2, 'Rebuild consistency', 'Ease back in', 'Post-break restart',
--     ARRAY['consistency'], '<ASSESSMENT_ID>')
--   RETURNING id;   -- note the returned id as <STRAT_ID>
--
--   -- (a) ALLOWED: update review_date + link on an active strategy →
--   UPDATE training_strategies
--      SET review_date = current_date + 35, workout_plan_id = NULL
--    WHERE id = '<STRAT_ID>';                         -- expect: UPDATE 1 (success)
--
--   -- (b) ALLOWED: active → completed →
--   UPDATE training_strategies SET status = 'completed'
--    WHERE id = '<STRAT_ID>';                         -- expect: UPDATE 1 (success)
--   ROLLBACK;
--
--   -- (c) BLOCKED: modify rationale (immutable core) →
--   BEGIN;
--   -- (re-insert as above to get <STRAT_ID>) ...
--   UPDATE training_strategies SET rationale = 'changed'
--    WHERE id = '<STRAT_ID>';   -- expect: ERROR check_violation "core content is immutable"
--   ROLLBACK;
--
--   -- (d) BLOCKED: modify target_sessions_per_week (immutable core) →
--   BEGIN;
--   -- (re-insert) ...
--   UPDATE training_strategies SET target_sessions_per_week = 4
--    WHERE id = '<STRAT_ID>';   -- expect: ERROR check_violation "core content is immutable"
--   ROLLBACK;
--
--   -- (e) BLOCKED: completed → active (terminal state) →
--   BEGIN;
--   -- (re-insert, then set status='completed') ...
--   UPDATE training_strategies SET status = 'active'
--    WHERE id = '<STRAT_ID>' AND status = 'completed';
--                              -- expect: ERROR check_violation "illegal status transition"
--   ROLLBACK;
--
--   -- (f) BLOCKED (invariant): a SECOND active strategy for the same user →
--   BEGIN;
--   -- with one active strategy already present, INSERT another active one →
--   --   expect: ERROR unique_violation on training_strategies_one_active_per_user_uidx
--   ROLLBACK;
--
--   -- (g) DEFERRED same-user FK — CONCEPTUAL, safe (no real account deletion):
--   --   demonstrates that a dangling reference is caught at COMMIT, not immediately,
--   --   which is exactly what lets the auth.users cascade complete. Uses ONLY the
--   --   test rows created above and is ALWAYS rolled back — it deletes NO auth.users
--   --   row and touches NO real account.
--   BEGIN;
--   --   Insert Assessment A_test + Strategy S_test (S_test.based_on_assessment_id = A_test.id),
--   --   both for auth.uid(). Then, in the SAME transaction, delete A_test while S_test
--   --   still references it:
--   --     DELETE FROM restart_assessments WHERE id = '<A_test>';
--   --       -- succeeds IMMEDIATELY here (check is DEFERRED, not fired yet)
--   --   COMMIT;   -- at COMMIT the deferred FK fires → ERROR foreign_key_violation
--   --             --   (proves the dangling reference is still rejected — same-user
--   --             --    integrity preserved). With RESTRICT this would have failed at
--   --             --    the DELETE line, which is what broke the account cascade.
--   -- NOTE: to observe the account cascade succeeding, deleting the whole
--   --   auth.uid() row would remove BOTH A_test and S_test in one statement; the
--   --   deferred check at COMMIT then sees no dangling rows and passes. Do NOT run a
--   --   real auth.users delete here — that is destructive. This block stays a
--   --   ROLLBACK-only illustration.
--   ROLLBACK;
-- ════════════════════════════════════════════════════════════════════════════
