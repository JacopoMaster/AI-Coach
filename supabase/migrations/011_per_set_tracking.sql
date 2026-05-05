-- Per-set workout tracking + RPE removal.
--
-- New writes populate `session_exercises.sets` with a JSONB array of
--   [{ reps: number, weight: number, completed?: boolean }]
-- shaped objects (one per actual set executed). Legacy rows continue to use
-- the flat `sets_done` / `reps_done` / `weight_kg` columns; we keep those
-- columns in place so historical sessions render correctly.
--
-- The `rpe` column is dropped — it has been removed from the UI, the API,
-- and the gamification engine.

alter table session_exercises
  add column if not exists sets jsonb;

alter table session_exercises
  drop column if exists rpe;
