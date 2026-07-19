// Derived profile completeness (F1.3). PURE — no I/O, no DB.
//
// Completeness is NEVER persisted (D012): it is computed from which fields are
// answered. For arrays, "answered" means non-null — an explicit empty array
// `[]` ("none") counts as answered; only `null` means "not answered yet".

import type { AthleteProfile } from './types'

export type ProfileCompleteness = 'not_started' | 'partial' | 'restart_ready' | 'complete'

// Meta/ownership columns are never part of "meaningful" content.
const META_KEYS = ['user_id', 'created_at', 'updated_at'] as const

// Fields September Restart (Fase 2) needs. `training_limitations` must be
// explicitly answered ([] = "none" is valid). See CURRENT_STATE.md / D012.
export const RESTART_READY_KEYS = [
  'primary_goal',
  'experience_level',
  'target_sessions_per_week',
  'minimum_sessions_per_week',
  'preferred_training_days',
  'preferred_session_duration_minutes',
  'minimum_session_duration_minutes',
  'available_equipment',
  'training_limitations',
] as const satisfies readonly (keyof AthleteProfile)[]

export type RestartReadyKey = (typeof RESTART_READY_KEYS)[number]

// Additional fields required for a "complete" profile, on top of restart_ready.
// Deliberately EXCLUDES genuinely optional / sensitive / free-text fields
// (sex, years_training, goal_notes, injuries_or_pain_notes, schedule_notes,
// secondary_goals) so "complete" stays reachable without forcing disclosure.
const COMPLETE_EXTRA_KEYS = [
  'birth_date',
  'height_cm',
  'work_pattern',
  'daily_activity_level',
  'preferred_training_time',
  'preferred_exercises',
  'avoided_exercises',
  'main_training_barriers',
  'main_nutrition_barriers',
  'nutrition_goal',
  'dietary_preferences',
  'dietary_restrictions',
  'allergies',
  'cooking_availability',
  'coaching_style',
  'explanation_detail',
  'flexibility_preference',
] as const satisfies readonly (keyof AthleteProfile)[]

/** A field is "answered" when its value is not null/undefined. `[]` counts. */
function isAnswered(profile: AthleteProfile, key: keyof AthleteProfile): boolean {
  return profile[key] !== null && profile[key] !== undefined
}

function allAnswered(profile: AthleteProfile, keys: readonly (keyof AthleteProfile)[]): boolean {
  return keys.every((k) => isAnswered(profile, k))
}

/**
 * Classify a profile into a completeness tier. A missing row (null) is
 * `not_started`. Order matters: complete ⇒ restart_ready ⇒ (has content).
 */
export function getProfileCompleteness(
  profile: AthleteProfile | null
): ProfileCompleteness {
  if (!profile) return 'not_started'

  const metaSet = new Set<string>(META_KEYS)
  const hasAnyContent = (Object.keys(profile) as (keyof AthleteProfile)[]).some(
    (k) => !metaSet.has(k) && isAnswered(profile, k)
  )
  if (!hasAnyContent) return 'not_started'

  if (!allAnswered(profile, RESTART_READY_KEYS)) return 'partial'

  return allAnswered(profile, COMPLETE_EXTRA_KEYS) ? 'complete' : 'restart_ready'
}

/**
 * Restart-ready fields still unanswered (null). PURE, and the SAME source of
 * truth the tier logic uses — the UI reuses this only for a presentational
 * "N missing" hint; the authoritative tier still comes from the API's
 * `completeness`. A null profile ⇒ every restart field is missing.
 */
export function getMissingRestartFields(profile: AthleteProfile | null): RestartReadyKey[] {
  if (!profile) return [...RESTART_READY_KEYS]
  return RESTART_READY_KEYS.filter((k) => !isAnswered(profile, k))
}
