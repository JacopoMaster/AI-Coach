// Athlete Profile — PATCH validation (F1.3).
//
// PATCH semantics preserved end-to-end:
//   • key OMITTED            → not in the parsed object → column left untouched;
//   • key present as `null`  → stays null → column set to NULL;
//   • array present as `[]`  → stays [] → explicit "none" stored.
// Every field is `.nullable().optional()` and nothing is transformed: no
// []→null, no null→undefined, no omitted→null, no silent dedup/reorder.
//
// The object is STRICT: user_id / created_at / updated_at and any unknown key
// are rejected (400). Ownership is derived server-side from the authenticated
// user, never from the body.

import { z } from 'zod'
import {
  PRIMARY_GOALS,
  EXPERIENCE_LEVELS,
  WEEKDAYS,
  WORK_PATTERNS,
  DAILY_ACTIVITY_LEVELS,
  PREFERRED_TRAINING_TIMES,
  NUTRITION_GOALS,
  COOKING_AVAILABILITIES,
  COACHING_STYLES,
  EXPLANATION_DETAILS,
  FLEXIBILITY_PREFERENCES,
  SEXES,
  type AthleteProfile,
} from './types'

const noDuplicates = <T>(arr: T[]) => new Set(arr).size === arr.length

// Open (extensible) string-array fields: validated as string arrays only, no
// closed vocabulary, no transformation of meaning. Finer rules stay out of F1.3.
const openStringArray = () => z.array(z.string()).nullable().optional()

export const AthleteProfilePatchSchema = z
  .strictObject({
    // Identity
    birth_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'birth_date must be an ISO date (YYYY-MM-DD)')
      .nullable()
      .optional(),
    sex: z.enum(SEXES).nullable().optional(),
    height_cm: z.number().int().min(100).max(250).nullable().optional(),

    // Goals
    primary_goal: z.enum(PRIMARY_GOALS).nullable().optional(),
    secondary_goals: z
      .array(z.enum(PRIMARY_GOALS))
      .refine(noDuplicates, 'secondary_goals must not contain duplicates')
      .nullable()
      .optional(),
    goal_notes: z.string().nullable().optional(),

    // Experience
    experience_level: z.enum(EXPERIENCE_LEVELS).nullable().optional(),
    years_training: z.number().min(0).max(80).nullable().optional(),

    // Sustainable schedule
    target_sessions_per_week: z.number().int().min(1).max(7).nullable().optional(),
    minimum_sessions_per_week: z.number().int().min(1).max(7).nullable().optional(),
    preferred_training_days: z
      .array(z.enum(WEEKDAYS))
      .refine(noDuplicates, 'preferred_training_days must not contain duplicates')
      .nullable()
      .optional(),
    preferred_session_duration_minutes: z.number().int().min(10).max(240).nullable().optional(),
    minimum_session_duration_minutes: z.number().int().min(10).max(240).nullable().optional(),

    // Training preferences (open arrays)
    preferred_exercises: openStringArray(),
    avoided_exercises: openStringArray(),
    available_equipment: openStringArray(),

    // Limitations
    training_limitations: openStringArray(),
    injuries_or_pain_notes: z.string().nullable().optional(),

    // Lifestyle
    work_pattern: z.enum(WORK_PATTERNS).nullable().optional(),
    schedule_notes: z.string().nullable().optional(),
    daily_activity_level: z.enum(DAILY_ACTIVITY_LEVELS).nullable().optional(),
    preferred_training_time: z.enum(PREFERRED_TRAINING_TIMES).nullable().optional(),

    // Adherence (open arrays)
    main_training_barriers: openStringArray(),
    main_nutrition_barriers: openStringArray(),

    // Nutrition
    nutrition_goal: z.enum(NUTRITION_GOALS).nullable().optional(),
    dietary_preferences: openStringArray(),
    dietary_restrictions: openStringArray(),
    allergies: openStringArray(),
    cooking_availability: z.enum(COOKING_AVAILABILITIES).nullable().optional(),

    // Coaching
    coaching_style: z.enum(COACHING_STYLES).nullable().optional(),
    explanation_detail: z.enum(EXPLANATION_DETAILS).nullable().optional(),
    flexibility_preference: z.enum(FLEXIBILITY_PREFERENCES).nullable().optional(),
  })
  // A no-op PATCH ({}) must not silently create/keep an empty row.
  .refine((v) => Object.keys(v).length > 0, {
    message: 'PATCH body must contain at least one field',
  })

export type AthleteProfilePatch = z.infer<typeof AthleteProfilePatchSchema>

export interface CoherenceError {
  field: string
  message: string
}

/**
 * Cross-field coherence, evaluated on the RESULTING profile (existing + patch),
 * not on the isolated payload — a PATCH may touch only one side of a pair.
 * A rule fires only when BOTH sides are present (non-null). Returns the first
 * violation, or null when coherent.
 */
export function validateProfileCoherence(
  merged: Partial<AthleteProfile>
): CoherenceError | null {
  const minSessions = merged.minimum_sessions_per_week
  const targetSessions = merged.target_sessions_per_week
  if (minSessions != null && targetSessions != null && minSessions > targetSessions) {
    return {
      field: 'minimum_sessions_per_week',
      message: 'minimum_sessions_per_week must be <= target_sessions_per_week',
    }
  }

  const minDuration = merged.minimum_session_duration_minutes
  const prefDuration = merged.preferred_session_duration_minutes
  if (minDuration != null && prefDuration != null && minDuration > prefDuration) {
    return {
      field: 'minimum_session_duration_minutes',
      message: 'minimum_session_duration_minutes must be <= preferred_session_duration_minutes',
    }
  }

  const primary = merged.primary_goal
  const secondary = merged.secondary_goals
  if (primary != null && Array.isArray(secondary) && secondary.includes(primary)) {
    return {
      field: 'secondary_goals',
      message: 'secondary_goals must not include primary_goal',
    }
  }

  return null
}
