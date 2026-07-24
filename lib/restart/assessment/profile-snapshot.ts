// Restart Assessment — Athlete Profile snapshot builder (F2.4). PURE, no I/O.
//
// buildAthleteProfileSnapshotV1(profile) → a bounded, serializable snapshot of
// the DECISION-RELEVANT profile fields, for audit "what we knew" (D008/D014).
// It is a STRUCTURED snapshot, NOT the Coach-facing formatted string
// (formatAthleteProfileForCoach) — that stays in F1.5.
//
// Rules:
//   • EXCLUDE metadata: user_id, created_at, updated_at (never leak them).
//   • Preserve null (not answered) vs [] (explicitly "none").
//   • years_training must be number | null — never a string (PostgREST can
//     return NUMERIC as a string). An unparseable non-null value is an INTERNAL
//     ERROR (throw), never silently invented.

import type { AthleteProfile } from '@/lib/profile/types'
import type { AthleteProfileSnapshotV1 } from './types'

/**
 * Coerce a NUMERIC-ish value to number | null. null/undefined → null; a finite
 * number passes through; a numeric string is parsed. Anything else (NaN,
 * non-numeric string, object) throws — the caller maps it to a generic 500.
 */
function coerceDecimalOrNull(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`profile snapshot: ${field} is not finite`)
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const n = Number(trimmed)
    if (trimmed === '' || !Number.isFinite(n)) {
      throw new Error(`profile snapshot: ${field} is not a valid number`)
    }
    return n
  }
  throw new Error(`profile snapshot: ${field} has unexpected type ${typeof value}`)
}

export function buildAthleteProfileSnapshotV1(
  profile: AthleteProfile
): AthleteProfileSnapshotV1 {
  // Explicit field-by-field construction (NOT `delete`/spread) so no future
  // athlete_profiles column — least of all a metadata one — can leak implicitly.
  return {
    // Identity (physical, stable)
    birth_date: profile.birth_date,
    sex: profile.sex,
    height_cm: profile.height_cm,

    // Goals
    primary_goal: profile.primary_goal,
    secondary_goals: profile.secondary_goals,
    goal_notes: profile.goal_notes,

    // Experience
    experience_level: profile.experience_level,
    years_training: coerceDecimalOrNull(profile.years_training, 'years_training'),

    // Sustainable schedule
    target_sessions_per_week: profile.target_sessions_per_week,
    minimum_sessions_per_week: profile.minimum_sessions_per_week,
    preferred_training_days: profile.preferred_training_days,
    preferred_session_duration_minutes: profile.preferred_session_duration_minutes,
    minimum_session_duration_minutes: profile.minimum_session_duration_minutes,

    // Training preferences
    preferred_exercises: profile.preferred_exercises,
    avoided_exercises: profile.avoided_exercises,
    available_equipment: profile.available_equipment,

    // Limitations (self-reported, functional — not clinical)
    training_limitations: profile.training_limitations,
    injuries_or_pain_notes: profile.injuries_or_pain_notes,

    // Lifestyle
    work_pattern: profile.work_pattern,
    schedule_notes: profile.schedule_notes,
    daily_activity_level: profile.daily_activity_level,
    preferred_training_time: profile.preferred_training_time,

    // Adherence
    main_training_barriers: profile.main_training_barriers,
    main_nutrition_barriers: profile.main_nutrition_barriers,

    // Nutrition
    nutrition_goal: profile.nutrition_goal,
    dietary_preferences: profile.dietary_preferences,
    dietary_restrictions: profile.dietary_restrictions,
    allergies: profile.allergies,
    cooking_availability: profile.cooking_availability,

    // Coaching
    coaching_style: profile.coaching_style,
    explanation_detail: profile.explanation_detail,
    flexibility_preference: profile.flexibility_preference,
  }
}
