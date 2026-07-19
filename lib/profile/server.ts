// Athlete Profile — server-side data helpers (F1.3).
//
// Thin wrappers over the RLS-protected `athlete_profiles` table. They take a
// server Supabase client (like getDailyNutritionTotals / awardExp) and THROW on
// a real DB error so the caller can map it to a generic 500 — errors are never
// masked as an empty profile. RLS guarantees a caller only ever touches its own
// row; these helpers additionally scope every query by user_id.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AthleteProfile } from './types'
import type { AthleteProfilePatch } from './schema'

// Explicit column list (mirrors migration 013) — avoids leaking any future
// column implicitly via `*`.
const PROFILE_COLUMNS =
  'user_id, birth_date, sex, height_cm, ' +
  'primary_goal, secondary_goals, goal_notes, ' +
  'experience_level, years_training, ' +
  'target_sessions_per_week, minimum_sessions_per_week, preferred_training_days, ' +
  'preferred_session_duration_minutes, minimum_session_duration_minutes, ' +
  'preferred_exercises, avoided_exercises, available_equipment, ' +
  'training_limitations, injuries_or_pain_notes, ' +
  'work_pattern, schedule_notes, daily_activity_level, preferred_training_time, ' +
  'main_training_barriers, main_nutrition_barriers, ' +
  'nutrition_goal, dietary_preferences, dietary_restrictions, allergies, cooking_availability, ' +
  'coaching_style, explanation_detail, flexibility_preference, ' +
  'created_at, updated_at'

/** Read the caller's profile, or null when no row exists yet. Throws on DB error. */
export async function getAthleteProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<AthleteProfile | null> {
  const { data, error } = await supabase
    .from('athlete_profiles')
    .select(PROFILE_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(`getAthleteProfile: ${error.message}`)
  return (data as unknown as AthleteProfile | null) ?? null
}

/**
 * Upsert the caller's profile with a validated partial patch. The row is created
 * lazily on first write (no auth.users trigger). `user_id` is forced from the
 * authenticated caller — never from the body. `updated_at` is left to the DB
 * (DEFAULT now() on insert, trg_athlete_profiles_updated_at on update).
 * Only the keys present in `patch` are written, preserving null vs [] vs omitted.
 */
export async function upsertAthleteProfile(
  supabase: SupabaseClient,
  userId: string,
  patch: AthleteProfilePatch
): Promise<AthleteProfile> {
  const { data, error } = await supabase
    .from('athlete_profiles')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
    .select(PROFILE_COLUMNS)
    .single()

  if (error) throw new Error(`upsertAthleteProfile: ${error.message}`)
  return data as unknown as AthleteProfile
}
