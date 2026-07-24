-- Migration 015: Restart confirmation — idempotency + atomic RPC (Coach AI 2.0 — Fase 2, task F2.6a)
-- ════════════════════════════════════════════════════════════════════════════
-- Prepares the FIRST permanent write of the Restart flow. Adds the schema and the
-- single PostgreSQL RPC that persists — ATOMICALLY and IDEMPOTENTLY — a confirmed
-- Restart decision (D007/D018):
--
--   1. the immutable Restart Assessment (restart_assessments);
--   2. the supersede of the caller's currently-active Training Strategy (if any);
--   3. the new active Training Strategy (training_strategies);
--
-- all inside ONE transaction, with:
--   • idempotency on double-confirmation, keyed by a server-generated confirmation_id;
--   • per-user serialization (advisory transaction lock);
--   • an expected-active-strategy guard so a STALE proposal cannot silently
--     overwrite a newer strategy;
--   • no application/API change in this task (that is F2.6b).
--
-- What this migration does (F2.6a):
--   • restart_assessments: adds confirmation_id uuid NOT NULL UNIQUE (no default) →
--     31 columns. Immutability is UNCHANGED (no UPDATE/DELETE policy, no updated_at,
--     no trigger).
--   • training_strategies: adds a UNIQUE index (based_on_assessment_id) so one
--     Assessment yields at most one persisted Strategy.
--   • public.confirm_restart_strategy(...) — SECURITY INVOKER, VOLATILE, RLS-respecting.
--   • EXECUTE granted only to `authenticated` (revoked from PUBLIC/anon).
--
-- What this migration does NOT do:
--   • NO HMAC/confirmation-token logic (that is F2.6b).
--   • NO change to strategy-proposal API, NO confirm route, NO UI, NO AI call.
--   • NO seed / NO real data. NO DROP TABLE / TRUNCATE / DELETE of data.
--   • NO change to existing RLS policies, triggers, or the F2.3 composite FKs.
--
-- Boundaries / constraints treated as binding (D006/D007/D014/D015/D018):
--   • restart_assessments stays IMMUTABLE (write-once).
--   • training_strategies core stays immutable/versioned (F2.3 trigger); a
--     substantive change = a NEW superseding strategy.
--   • EXACTLY ONE active strategy per user (F2.3 partial unique index — NOT
--     deferrable → the RPC supersedes the old active BEFORE inserting the new one).
--   • Same-user composite FKs stay NO ACTION DEFERRABLE INITIALLY DEFERRED (F2.3).
--
-- Direct-write limitation (documented, NOT hidden — see §18/D020/D021):
--   confirm_restart_strategy is SECURITY INVOKER and therefore respects RLS. The
--   existing RLS policies still let an authenticated user INSERT/UPDATE their OWN
--   restart_assessments / training_strategies rows through the normal Supabase data
--   API, bypassing this RPC. F2.6b will only ever call this RPC and will not expose
--   a free draft/proposal write path, but it does NOT technically forbid a user from
--   manipulating their OWN data directly. This is a self-data concern only — never
--   cross-user access (RLS still scopes every row to auth.uid()). Hardening to
--   "RPC-only writes" would require a SEPARATE decision (likely SECURITY DEFINER or
--   contextual policies) and is intentionally NOT introduced here.
--
-- Operational notes:
--   • Run MANUALLY in the Supabase SQL Editor (repo workflow — no CLI push).
--   • Prerequisites: migration 014 (restart_assessments, training_strategies, the
--     partial unique active index, the enforce/updated_at triggers, the same-user
--     composite FKs). 015 is SEQUENTIAL after 014.
--   • Idempotent & safe to re-run: ADD COLUMN IF NOT EXISTS, CREATE UNIQUE INDEX IF
--     NOT EXISTS, CREATE OR REPLACE FUNCTION, guarded ADD CONSTRAINT, idempotent
--     GRANT/REVOKE. NO data mutation beyond a one-off backfill of a just-added
--     nullable column (no rows exist yet → a no-op in practice).
--   • Creates NO rows. POST-APPLY: run the read-only verification block at the
--     bottom BEFORE marking F2.6a verified.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- 1. restart_assessments.confirmation_id  — idempotency key (uuid NOT NULL UNIQUE)
-- ════════════════════════════════════════════════════════════════════════════
-- The confirmation flow (F2.6b) mints a UUID confirmation_id and hands it to the
-- RPC. It is the idempotency key: re-confirming with the same id returns the same
-- rows instead of creating duplicates. It must ALWAYS be supplied explicitly by the
-- flow → NO column default (a default would silently invent an id and defeat replay
-- detection). Uniqueness is GLOBAL: a server-generated UUID needs no per-user scope.
--
-- Robust, order-safe rollout even if unexpected rows existed:
--   (1) ADD COLUMN nullable if missing;
--   (2) backfill any NULLs with gen_random_uuid() (one-off — NOT a default);
--   (3) SET NOT NULL;
--   (4) add the named UNIQUE constraint;
--   (5) leave NO permanent default.
ALTER TABLE restart_assessments
  ADD COLUMN IF NOT EXISTS confirmation_id UUID;

-- One-off backfill so SET NOT NULL cannot fail on pre-existing rows. The table is
-- expected to be empty (nothing is persisted before F2.6), so in practice this
-- touches 0 rows; it exists only for robustness. gen_random_uuid() here is a
-- backfill value, NOT a column default.
UPDATE restart_assessments
   SET confirmation_id = gen_random_uuid()
 WHERE confirmation_id IS NULL;

ALTER TABLE restart_assessments
  ALTER COLUMN confirmation_id SET NOT NULL;

-- Named UNIQUE constraint (idempotent via pg_constraint guard). Global uniqueness.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'restart_assessments_confirmation_id_key'
       AND conrelid = 'public.restart_assessments'::regclass
  ) THEN
    ALTER TABLE restart_assessments
      ADD CONSTRAINT restart_assessments_confirmation_id_key UNIQUE (confirmation_id);
  END IF;
END$$;

-- NB: immutability is UNCHANGED — still NO UPDATE policy, NO DELETE policy, NO
-- updated_at, NO trigger on restart_assessments. confirmation_id is set once at
-- INSERT time by the RPC and never rewritten.


-- ════════════════════════════════════════════════════════════════════════════
-- 2. training_strategies — one persisted Strategy per Assessment
-- ════════════════════════════════════════════════════════════════════════════
-- A confirmed Assessment produces EXACTLY ONE persisted Strategy. This unique index
-- makes a second Strategy on the same Assessment impossible (e.g. a buggy retry that
-- slipped past the idempotency check). A genuinely new strategy requires a NEW
-- Assessment and supersedes_id — never a second strategy on the same Assessment.
-- The F2.3 composite same-user FK (based_on_assessment_id, user_id) is UNCHANGED.
CREATE UNIQUE INDEX IF NOT EXISTS training_strategies_one_per_assessment_uidx
  ON training_strategies (based_on_assessment_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 3. RPC public.confirm_restart_strategy  — atomic + idempotent persistence
-- ════════════════════════════════════════════════════════════════════════════
-- SECURITY INVOKER (RLS applies) · VOLATILE · SET search_path = public, pg_temp.
-- Identity is auth.uid() ONLY — user_id is NEVER a parameter and NEVER read from
-- the JSON. All identity/lifecycle/link columns (user_id, status,
-- based_on_assessment_id, supersedes_id, workout_plan_id, mesocycle_id) are decided
-- INTERNALLY; only the whitelisted content columns are read from the JSON via
-- explicit mapping (no jsonb_populate_record, no dynamic SQL, no SQL concatenation).
-- Extra JSON keys are ignored, never persisted.
--
-- created_new = true  → this call performed the persistence.
-- created_new = false → idempotent replay of an earlier confirmation (same rows).
--
-- Order (§16): auth → advisory xact lock → idempotency lookup → (JSON shape) →
-- current-active lookup → expected-active check → INSERT Assessment → UPDATE old
-- active → superseded → INSERT new active Strategy → return. The idempotency lookup
-- MUST precede the staleness check: a later replay sees the just-created strategy as
-- active, while the original token still carried the previous active — so replay is
-- resolved purely by confirmation_id, never by re-checking the active strategy.
CREATE OR REPLACE FUNCTION public.confirm_restart_strategy(
  p_confirmation_id             UUID,
  p_assessment                  JSONB,
  p_strategy                    JSONB,
  p_expected_active_strategy_id UUID
)
RETURNS TABLE (
  assessment_id UUID,
  strategy_id   UUID,
  created_new   BOOLEAN
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id                    UUID := auth.uid();
  v_existing_assessment_id     UUID;
  v_existing_strategy_id       UUID;
  v_current_active_strategy_id UUID;
  v_new_assessment_id          UUID;
  v_new_strategy_id            UUID;
  v_superseded_count           INTEGER;
BEGIN
  -- ── (auth) identity from the session only ──────────────────────────────────
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'restart_confirmation_no_auth: no authenticated user'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── (advisory lock) serialize concurrent confirmations of the SAME user ─────
  -- Transaction-scoped: auto-released at COMMIT/ROLLBACK. Different users hash to
  -- different keys → no cross-user blocking. Never a session-level lock.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('restart-confirm:' || v_user_id::text, 0)
  );

  -- ── (idempotency) replay lookup FIRST — before any staleness check ──────────
  SELECT id
    INTO v_existing_assessment_id
    FROM restart_assessments
   WHERE user_id = v_user_id
     AND confirmation_id = p_confirmation_id;

  IF v_existing_assessment_id IS NOT NULL THEN
    -- This confirmation already persisted. Return the SAME rows; do NOT re-check
    -- the current active strategy, do NOT update, do NOT insert.
    SELECT id
      INTO v_existing_strategy_id
      FROM training_strategies
     WHERE user_id = v_user_id
       AND based_on_assessment_id = v_existing_assessment_id;

    IF v_existing_strategy_id IS NULL THEN
      -- Internal integrity error: a completed confirm inserts Assessment AND
      -- Strategy in the same transaction, so an Assessment can never exist without
      -- its Strategy. If it does, something bypassed this RPC — fail loudly.
      RAISE EXCEPTION
        'restart_confirmation_integrity: assessment % has no strategy', v_existing_assessment_id
        USING ERRCODE = 'P0001';
    END IF;

    assessment_id := v_existing_assessment_id;
    strategy_id   := v_existing_strategy_id;
    created_new   := FALSE;
    RETURN NEXT;
    RETURN;
  END IF;

  -- ── (JSON shape) top-level guard before any INSERT ──────────────────────────
  -- Deep/structural validation stays in the application (F2.4/F2.6b). Here the DB
  -- casts + CHECKs + FKs + unique indexes + triggers are the last-line protection
  -- against an application bug. Only that the payloads are JSON OBJECTS is checked.
  IF jsonb_typeof(p_assessment) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'restart_confirmation_bad_assessment_json: assessment must be a JSON object'
      USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_strategy) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'restart_confirmation_bad_strategy_json: strategy must be a JSON object'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── (current active) at most one row (partial unique index guarantees it) ───
  SELECT id
    INTO v_current_active_strategy_id
    FROM training_strategies
   WHERE user_id = v_user_id
     AND status = 'active';

  -- ── (expected-active guard) NULL-safe; a stale proposal must NOT overwrite ──
  -- Cases: expected NULL & current NULL → ok; expected X & current X → ok;
  --        expected NULL & current X → stale; expected X & current NULL/Y → stale.
  IF v_current_active_strategy_id IS DISTINCT FROM p_expected_active_strategy_id THEN
    RAISE EXCEPTION 'restart_confirmation_stale: active strategy changed since the proposal'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── INSERT immutable Assessment (explicit whitelist mapping) ────────────────
  -- Identity (id/created_at) from DB defaults; user_id + confirmation_id from the
  -- session/parameter — NEVER from the JSON. Any confirmation_id inside the JSON is
  -- ignored. Missing required keys → NULL cast → NOT NULL / CHECK violation → rollback.
  INSERT INTO restart_assessments (
    user_id,
    confirmation_id,
    analysis_date,
    analysis_period_start,
    analysis_period_end,
    baseline_snapshot_version,
    baseline_snapshot,
    profile_snapshot_version,
    profile_snapshot,
    training_consistency_data_quality,
    performance_data_quality,
    body_data_quality,
    nutrition_data_quality,
    sessions_4w,
    sessions_8w,
    sessions_12w,
    last_session_date,
    days_since_last_session,
    latest_weight_kg,
    latest_body_measurement_date,
    days_since_latest_body_measurement,
    nutrition_tracked_days_28d,
    nutrition_tracked_days_ratio,
    readiness_score,
    perceived_strength_change,
    availability_changed,
    new_limitations_reported,
    assessed_workout_plan_id,
    assessed_mesocycle_id
  )
  VALUES (
    v_user_id,                                                            -- user_id (session)
    p_confirmation_id,                                                    -- confirmation_id (param)
    (p_assessment->>'analysis_date')::date,
    (p_assessment->>'analysis_period_start')::date,
    (p_assessment->>'analysis_period_end')::date,
    (p_assessment->>'baseline_snapshot_version')::smallint,
    (p_assessment->'baseline_snapshot'),                                  -- jsonb object (NOT ->>)
    (p_assessment->>'profile_snapshot_version')::smallint,
    (p_assessment->'profile_snapshot'),                                   -- jsonb object (NOT ->>)
    p_assessment->>'training_consistency_data_quality',
    p_assessment->>'performance_data_quality',
    p_assessment->>'body_data_quality',
    p_assessment->>'nutrition_data_quality',
    (p_assessment->>'sessions_4w')::smallint,
    (p_assessment->>'sessions_8w')::smallint,
    (p_assessment->>'sessions_12w')::smallint,
    (p_assessment->>'last_session_date')::date,                           -- nullable
    (p_assessment->>'days_since_last_session')::integer,                  -- nullable
    (p_assessment->>'latest_weight_kg')::numeric,                        -- nullable
    (p_assessment->>'latest_body_measurement_date')::date,               -- nullable
    (p_assessment->>'days_since_latest_body_measurement')::integer,      -- nullable
    (p_assessment->>'nutrition_tracked_days_28d')::smallint,
    (p_assessment->>'nutrition_tracked_days_ratio')::numeric,
    (p_assessment->>'readiness_score')::smallint,                        -- nullable ("not asked")
    p_assessment->>'perceived_strength_change',                          -- nullable ("not asked")
    (p_assessment->>'availability_changed')::boolean,                    -- nullable ("not asked")
    (p_assessment->>'new_limitations_reported')::boolean,                -- nullable ("not asked")
    (p_assessment->>'assessed_workout_plan_id')::uuid,                   -- nullable
    (p_assessment->>'assessed_mesocycle_id')::uuid                       -- nullable
  )
  RETURNING id INTO v_new_assessment_id;

  -- ── Supersede the current active BEFORE inserting the new active ────────────
  -- The one-active-per-user partial unique index is NOT deferrable, so the old
  -- active must leave 'active' before a new active row is inserted. The F2.3
  -- trigger permits active → superseded and touches no other column.
  IF v_current_active_strategy_id IS NOT NULL THEN
    UPDATE training_strategies
       SET status = 'superseded'
     WHERE id = v_current_active_strategy_id
       AND user_id = v_user_id
       AND status = 'active';

    GET DIAGNOSTICS v_superseded_count = ROW_COUNT;
    IF v_superseded_count <> 1 THEN
      -- Under the advisory lock this should be exactly 1; anything else means the
      -- active strategy moved underneath us → treat as stale, roll everything back.
      RAISE EXCEPTION 'restart_confirmation_stale: active strategy could not be superseded'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ── INSERT new active Strategy (explicit whitelist mapping) ─────────────────
  -- Server-decided: user_id, status='active', based_on_assessment_id (new one),
  -- supersedes_id (old active or NULL), workout_plan_id/mesocycle_id = NULL. From
  -- the JSON only the content columns. Arrays converted explicitly jsonb → text[].
  INSERT INTO training_strategies (
    user_id,
    status,
    based_on_assessment_id,
    supersedes_id,
    workout_plan_id,
    mesocycle_id,
    strategy_type,
    start_date,
    review_date,
    target_sessions_per_week,
    minimum_sessions_per_week,
    primary_objective,
    summary,
    rationale,
    priorities,
    observations,
    risks_uncertainties
  )
  VALUES (
    v_user_id,                                                            -- user_id (session)
    'active',                                                             -- status (server)
    v_new_assessment_id,                                                  -- based_on_assessment_id (server)
    v_current_active_strategy_id,                                         -- supersedes_id (old active or NULL)
    NULL,                                                                 -- workout_plan_id (server)
    NULL,                                                                 -- mesocycle_id (server)
    p_strategy->>'strategy_type',
    (p_strategy->>'start_date')::date,
    (p_strategy->>'review_date')::date,
    (p_strategy->>'target_sessions_per_week')::smallint,
    (p_strategy->>'minimum_sessions_per_week')::smallint,
    p_strategy->>'primary_objective',
    p_strategy->>'summary',
    p_strategy->>'rationale',
    -- Explicit jsonb-array → text[]. A missing/empty 'priorities' yields '{}',
    -- which fails the F2.3 cardinality CHECK (>= 1) → rollback. A non-array value
    -- raises "cannot extract elements" → rollback. Both are intended protection.
    ARRAY(SELECT jsonb_array_elements_text(p_strategy->'priorities')),
    ARRAY(SELECT jsonb_array_elements_text(p_strategy->'observations')),
    ARRAY(SELECT jsonb_array_elements_text(p_strategy->'risks_uncertainties'))
  )
  RETURNING id INTO v_new_strategy_id;

  assessment_id := v_new_assessment_id;
  strategy_id   := v_new_strategy_id;
  created_new   := TRUE;
  RETURN NEXT;
  RETURN;

  -- No EXCEPTION handler on purpose: any error must propagate and roll back the
  -- WHOLE transaction (Assessment insert + supersede + Strategy insert). Errors are
  -- never converted into a "success".
END;
$$;


-- ── Privileges: authenticated-only EXECUTE (revoke PUBLIC/anon) ──────────────
-- CREATE OR REPLACE FUNCTION grants EXECUTE to PUBLIC by default. Lock it down to
-- the authenticated role using the EXACT signature. SELECT privileges on the tables
-- are unchanged; no service-role path is added.
REVOKE ALL ON FUNCTION public.confirm_restart_strategy(UUID, JSONB, JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_restart_strategy(UUID, JSONB, JSONB, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_restart_strategy(UUID, JSONB, JSONB, UUID) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- POST-APPLY VERIFICATION (read-only — run manually, they mutate nothing).
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1) restart_assessments now has 31 columns:
--   SELECT count(*) AS column_count
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'restart_assessments';   -- expect: 31
--
-- 2) confirmation_id: uuid, NOT NULL, NO default:
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'restart_assessments'
--      AND column_name = 'confirmation_id';
--   -- expect: data_type=uuid, is_nullable='NO', column_default IS NULL
--
-- 3) UNIQUE constraint on confirmation_id present:
--   SELECT conname, pg_get_constraintdef(oid) AS definition
--     FROM pg_constraint
--    WHERE conrelid = 'public.restart_assessments'::regclass
--      AND conname = 'restart_assessments_confirmation_id_key';
--   -- expect: UNIQUE (confirmation_id)
--
-- 4) one-per-assessment unique index present:
--   SELECT indexname, indexdef
--     FROM pg_indexes
--    WHERE schemaname = 'public' AND tablename = 'training_strategies'
--      AND indexname = 'training_strategies_one_per_assessment_uidx';
--   -- indexdef must contain: UNIQUE ... (based_on_assessment_id)
--
-- 5) function confirm_restart_strategy present, SECURITY INVOKER, VOLATILE,
--    search_path set, correct params/return, NO user_id parameter:
--   SELECT p.proname,
--          p.prosecdef                              AS security_definer,   -- expect: false → SECURITY INVOKER
--          p.provolatile                            AS volatility,         -- expect: 'v' (VOLATILE)
--          p.proconfig                              AS config,             -- expect: {search_path=public,\ pg_temp}
--          pg_get_function_arguments(p.oid)         AS arguments,
--          pg_get_function_result(p.oid)            AS result
--     FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'confirm_restart_strategy';
--   -- arguments expect:
--   --   p_confirmation_id uuid, p_assessment jsonb, p_strategy jsonb, p_expected_active_strategy_id uuid
--   -- result expect:
--   --   TABLE(assessment_id uuid, strategy_id uuid, created_new boolean)
--   -- arguments must NOT contain any 'user_id' / 'p_user_id'.
--
-- 6) ACL — authenticated may EXECUTE; PUBLIC/anon may NOT:
--   SELECT n.nspname, p.proname, p.proacl
--     FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'confirm_restart_strategy';
--   -- proacl must contain 'authenticated=X/...' and must NOT contain '=X/' (PUBLIC)
--   --   nor 'anon=X/'. (A NULL proacl would mean default PUBLIC execute — must NOT
--   --   be NULL here.)
--   -- Equivalent boolean checks:
--   SELECT has_function_privilege('authenticated',
--            'public.confirm_restart_strategy(uuid,jsonb,jsonb,uuid)', 'EXECUTE') AS auth_exec,   -- expect: true
--          has_function_privilege('anon',
--            'public.confirm_restart_strategy(uuid,jsonb,jsonb,uuid)', 'EXECUTE') AS anon_exec;    -- expect: false
--
-- 7) F2.3 same-user composite FKs still NO ACTION + DEFERRABLE INITIALLY DEFERRED:
--   SELECT conname, confdeltype, condeferrable, condeferred
--     FROM pg_constraint
--    WHERE conrelid = 'public.training_strategies'::regclass
--      AND contype = 'f'
--      AND conname IN ('training_strategies_assessment_fk','training_strategies_supersedes_fk')
--    ORDER BY conname;
--   -- both rows: confdeltype='a', condeferrable=t, condeferred=t
--
-- 8) RLS still enabled; existing policies unchanged (assessment SELECT+INSERT only;
--    strategy SELECT+INSERT+UPDATE only; both {authenticated}); Strategy triggers
--    unchanged:
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('restart_assessments','training_strategies') ORDER BY relname;  -- both true
--   SELECT tablename, policyname, cmd, roles
--     FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('restart_assessments','training_strategies')
--    ORDER BY tablename, cmd, policyname;
--   -- restart_assessments: exactly SELECT + INSERT (NO UPDATE/DELETE)
--   -- training_strategies: exactly SELECT + INSERT + UPDATE (NO DELETE)
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.training_strategies'::regclass AND NOT tgisinternal
--    ORDER BY tgname;
--   -- expect: trg_training_strategies_enforce_update, trg_training_strategies_updated_at
--   SELECT count(*) FROM pg_trigger
--    WHERE tgrelid = 'public.restart_assessments'::regclass AND NOT tgisinternal;   -- expect: 0
--
-- 9) Still no rows:
--   SELECT (SELECT count(*) FROM restart_assessments) AS assessments_rows,   -- expect: 0
--          (SELECT count(*) FROM training_strategies) AS strategies_rows;    -- expect: 0
--
-- ════════════════════════════════════════════════════════════════════════════
-- TRANSACTIONAL BEHAVIOUR TESTS (manual, OPTIONAL — for the future F2.6b check).
-- NOT auto-executed; insert NO seed; use NO real data. Run as a REAL authenticated
-- user (so auth.uid() + RLS apply) and always ROLLBACK. Replace <...> placeholders
-- with owned, well-formed JSON built by the app. Each block is BEGIN/ROLLBACK.
--
-- Shape reminder (whitelisted keys only):
--   p_assessment := the RestartAssessmentDraft JSON (F2.4) — analysis_date,
--     analysis_period_start/end, *_snapshot_version, baseline_snapshot,
--     profile_snapshot, 4x *_data_quality, sessions_4w/8w/12w, last_session_date,
--     days_since_last_session, latest_weight_kg, latest_body_measurement_date,
--     days_since_latest_body_measurement, nutrition_tracked_days_28d,
--     nutrition_tracked_days_ratio, readiness_score, perceived_strength_change,
--     availability_changed, new_limitations_reported, assessed_workout_plan_id,
--     assessed_mesocycle_id.
--   p_strategy := the RestartTrainingStrategyProposal JSON (F2.5) — strategy_type,
--     start_date, review_date, target_sessions_per_week, minimum_sessions_per_week,
--     primary_objective, summary, rationale, priorities[], observations[],
--     risks_uncertainties[].
--
--   -- (a) FIRST confirmation → created_new = true, one Assessment + one active Strategy:
--   BEGIN;
--   SELECT * FROM public.confirm_restart_strategy(
--     gen_random_uuid(), '<ASSESSMENT_JSON>'::jsonb, '<STRATEGY_JSON>'::jsonb, NULL);
--   -- expect: 1 row, created_new = true; assessment_id + strategy_id returned.
--   -- SELECT status FROM training_strategies WHERE id = <strategy_id>;  -- expect: active
--   ROLLBACK;
--
--   -- (b) REPLAY of the same confirmation_id → same ids, created_new = false:
--   BEGIN;
--   -- reuse a FIXED confirmation_id C:
--   SELECT * FROM public.confirm_restart_strategy(
--     '<C>'::uuid, '<ASSESSMENT_JSON>'::jsonb, '<STRATEGY_JSON>'::jsonb, NULL);   -- created_new=true
--   SELECT * FROM public.confirm_restart_strategy(
--     '<C>'::uuid, '<ASSESSMENT_JSON>'::jsonb, '<STRATEGY_JSON>'::jsonb, NULL);   -- created_new=false, same ids
--   -- expect: no new Assessment, no new Strategy, no second supersede, no status change.
--   ROLLBACK;
--
--   -- (c) SUPERSEDE: with an existing active X, a new confirmation expecting X →
--   --     X becomes superseded, the new Strategy becomes the sole active:
--   BEGIN;
--   -- (first confirm with expected NULL to create active X, note <X>) ...
--   SELECT * FROM public.confirm_restart_strategy(
--     gen_random_uuid(), '<ASSESSMENT_JSON_2>'::jsonb, '<STRATEGY_JSON_2>'::jsonb, '<X>'::uuid);
--   -- expect: created_new=true; SELECT status ... WHERE id=<X> → superseded; exactly one active remains.
--   ROLLBACK;
--
--   -- (d) TWO active impossible: attempting a state with two active rows must fail on
--   --     training_strategies_one_active_per_user_uidx (unique_violation). The RPC
--   --     supersedes BEFORE inserting, so it never triggers this itself; a manual
--   --     double-active INSERT would.
--
--   -- (e) STALE: a different confirmation_id whose expected active no longer matches
--   --     the current active → restart_confirmation_stale, nothing written:
--   BEGIN;
--   -- (create active X) ... then with the CURRENT active = X, pass an OUTDATED expected:
--   SELECT * FROM public.confirm_restart_strategy(
--     gen_random_uuid(), '<ASSESSMENT_JSON_3>'::jsonb, '<STRATEGY_JSON_3>'::jsonb, NULL);  -- expected NULL but current=X
--   -- expect: ERROR P0001 restart_confirmation_stale; the pre-existing active X is untouched.
--   ROLLBACK;
--
--   -- (f) INVALID payload → complete rollback, no orphan Assessment, no Strategy
--   --     without an Assessment:
--   BEGIN;
--   SELECT * FROM public.confirm_restart_strategy(
--     gen_random_uuid(), '"not-an-object"'::jsonb, '<STRATEGY_JSON>'::jsonb, NULL);
--   -- expect: ERROR P0001 restart_confirmation_bad_assessment_json; nothing persisted.
--   SELECT * FROM public.confirm_restart_strategy(
--     gen_random_uuid(), '<ASSESSMENT_JSON>'::jsonb, '{"strategy_type":"restart"}'::jsonb, NULL);
--   -- expect: ERROR (NOT NULL/CHECK on missing strategy fields); FULL rollback → the
--   --   Assessment inserted moments earlier in THIS statement is rolled back too.
--   ROLLBACK;
--
--   -- (g) NO-AUTH: calling without an authenticated session → restart_confirmation_no_auth,
--   --     no write. (Cannot be exercised from the SQL editor as a role with auth.uid()=NULL
--   --     unless run as such; documented for completeness.)
-- ════════════════════════════════════════════════════════════════════════════
