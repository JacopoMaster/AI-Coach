-- Migration 007: Expand Core Drill tier cap 10 → 11 (Super Tengen Toppa)
-- ─────────────────────────────────────────────────────────────────────────────
-- The Spiral Drill progression was redistributed to span Lv 1..200, with an
-- 11th tier ("Super Tengen Toppa Gurren Lagann") unlocking at Lv 200. The
-- original CHECK constraint from migration 006 still caps core_drill_tier at
-- 10, which would cause awardExp() to fail for any user reaching Lv 200+.
-- Drop the inline constraint (auto-named by Postgres) and re-add with the new
-- upper bound.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- Find the auto-generated CHECK constraint on core_drill_tier. Postgres
  -- typically names inline column checks like `user_stats_core_drill_tier_check`
  -- but the lookup by pg_get_constraintdef is safer.
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'user_stats'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%core_drill_tier%BETWEEN%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE user_stats DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE user_stats
  ADD CONSTRAINT user_stats_core_drill_tier_check
  CHECK (core_drill_tier BETWEEN 1 AND 11);
