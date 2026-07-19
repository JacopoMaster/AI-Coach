// Restart Baseline — server-side data access (F2.2). ERROR-HONEST (D015/D025):
// every query distinguishes «succeeded with zero rows» (valid absence) from
// «failed» (throw). NEVER `return data || []` swallowing `error`. Error messages
// are generic (no PII, no raw Supabase text) with the original kept as `cause`
// server-side. These functions do only reads — no writes anywhere.

import type { SupabaseClient } from '@supabase/supabase-js'
import { RestartBaselineQueryError } from './errors'

// ─── Raw row shapes (type-only; consumed by the pure aggregators) ────────────
export interface RawSessionExercise {
  plan_exercise_id: string | null
  sets: unknown // JSONB — parsed via lib/workouts/tonnage helpers
  sets_done: number | null
  reps_done: string | null
  weight_kg: number | null
  // NB: `rpe` was DROPPED from session_exercises in migration 011 — it does not
  // exist in the real schema, so it is intentionally NOT selected/typed here.
  plan_exercise: { name: string } | null
}
export interface RawSession {
  id: string
  date: string
  session_exercises: RawSessionExercise[]
}
export interface RawBodyMeasurement {
  date: string
  weight_kg: number | null
  body_fat_pct: number | null
  muscle_mass_kg: number | null
}
export interface RawPlanExerciseRow {
  name: string
  sets: number | null
}
export interface RawPlanDayRow {
  day_name: string
  day_order: number
  plan_exercises: RawPlanExerciseRow[]
}
export interface RawActivePlan {
  id: string
  workout_plan_days: RawPlanDayRow[]
}
export interface RawActiveDietPlan {
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
}
export interface RawActiveMesocycle {
  id: string
  start_date: string
  end_date: string | null
  status: string
}

function fail(ctx: string, error: { message?: string; code?: string }): never {
  // Typed error: exposes the stage (`source`) + optional `code`; keeps the
  // original error as `cause` server-side. Never leaks the raw message/values.
  throw new RestartBaselineQueryError(ctx, error)
}

// Real columns only. `rpe` is deliberately excluded — dropped in migration 011.
// `sets` (JSONB) was added by migration 011; the flat legacy columns remain.
export const SESSIONS_SELECT =
  'id, date, session_exercises(plan_exercise_id, sets, sets_done, reps_done, weight_kg, plan_exercise:plan_exercises(name))'

/** Sessions (+ their exercises) within an inclusive [startDate, endDate] window. */
export async function fetchSessionsInWindow(
  supabase: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string
): Promise<RawSession[]> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select(SESSIONS_SELECT)
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })

  if (error) fail('sessions', error)
  return (data ?? []) as unknown as RawSession[]
}

async function fetchBoundarySessionDate(
  supabase: SupabaseClient,
  userId: string,
  endDate: string,
  ascending: boolean
): Promise<string | null> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('date')
    .eq('user_id', userId)
    .lte('date', endDate)
    .order('date', { ascending })
    .limit(1)
    .maybeSingle()

  if (error) fail('session boundary', error)
  return (data as { date: string } | null)?.date ?? null
}

export const fetchFirstSessionDate = (s: SupabaseClient, u: string, end: string) =>
  fetchBoundarySessionDate(s, u, end, true)
export const fetchLastSessionDate = (s: SupabaseClient, u: string, end: string) =>
  fetchBoundarySessionDate(s, u, end, false)

/** Body measurements within an inclusive [startDate, endDate] window. */
export async function fetchBodyInWindow(
  supabase: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string
): Promise<RawBodyMeasurement[]> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('date, weight_kg, body_fat_pct, muscle_mass_kg')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })

  if (error) fail('body measurements', error)
  return (data ?? []) as RawBodyMeasurement[]
}

/** Most recent body measurement at or before endDate (may be older than 12w). */
export async function fetchLatestBody(
  supabase: SupabaseClient,
  userId: string,
  endDate: string
): Promise<RawBodyMeasurement | null> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('date, weight_kg, body_fat_pct, muscle_mass_kg')
    .eq('user_id', userId)
    .lte('date', endDate)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) fail('latest body measurement', error)
  return (data as RawBodyMeasurement | null) ?? null
}

/** The active workout plan with its days and planned exercises. */
export async function fetchActivePlan(
  supabase: SupabaseClient,
  userId: string
): Promise<RawActivePlan | null> {
  const { data, error } = await supabase
    .from('workout_plans')
    .select('id, workout_plan_days(day_name, day_order, plan_exercises(name, sets))')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) fail('active plan', error)
  return (data as unknown as RawActivePlan | null) ?? null
}

/** The active diet plan targets, if any. */
export async function fetchActiveDietPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<RawActiveDietPlan | null> {
  const { data, error } = await supabase
    .from('diet_plans')
    .select('calories, protein_g, carbs_g, fat_g')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) fail('active diet plan', error)
  return (data as RawActiveDietPlan | null) ?? null
}

/** The active mesocycle, as a fact only — never modified here. */
export async function fetchActiveMesocycle(
  supabase: SupabaseClient,
  userId: string
): Promise<RawActiveMesocycle | null> {
  const { data, error } = await supabase
    .from('mesocycles')
    .select('id, start_date, end_date, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) fail('active mesocycle', error)
  return (data as RawActiveMesocycle | null) ?? null
}
