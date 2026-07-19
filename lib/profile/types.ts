// Athlete Profile — domain types & shared vocabularies (Coach AI 2.0, F1.3).
//
// Single source of truth for the enum-like vocabularies: these `as const`
// arrays back BOTH the TypeScript union types (below) and the Zod schema
// (schema.ts), so the two can never drift from each other or from the DB
// CHECK constraints in migration 013.
//
// Boundaries (D012): this mirrors the STABLE `athlete_profiles` row — no
// prescriptions, no programming state, no physical measures. Completeness is
// derived (completeness.ts), never stored.

// ─── Enum-like vocabularies (must match the CHECK lists in migration 013) ────
export const PRIMARY_GOALS = [
  'return_to_consistency',
  'recomp',
  'fat_loss',
  'muscle_gain',
  'strength',
  'maintenance',
] as const

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export const WORK_PATTERNS = [
  'fixed_daytime',
  'shift',
  'irregular',
  'remote',
  'student',
] as const

export const DAILY_ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active'] as const

export const PREFERRED_TRAINING_TIMES = ['morning', 'afternoon', 'evening', 'variable'] as const

export const NUTRITION_GOALS = ['fat_loss', 'maintenance', 'muscle_gain', 'recomp'] as const

export const COOKING_AVAILABILITIES = ['none', 'low', 'medium', 'high'] as const

export const COACHING_STYLES = ['supportive', 'direct', 'tough_love'] as const

export const EXPLANATION_DETAILS = ['minimal', 'standard', 'detailed'] as const

export const FLEXIBILITY_PREFERENCES = ['strict', 'balanced', 'flexible'] as const

export const SEXES = ['male', 'female'] as const

// ─── Derived union types ─────────────────────────────────────────────────────
export type PrimaryGoal = (typeof PRIMARY_GOALS)[number]
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]
export type Weekday = (typeof WEEKDAYS)[number]
export type WorkPattern = (typeof WORK_PATTERNS)[number]
export type DailyActivityLevel = (typeof DAILY_ACTIVITY_LEVELS)[number]
export type PreferredTrainingTime = (typeof PREFERRED_TRAINING_TIMES)[number]
export type NutritionGoal = (typeof NUTRITION_GOALS)[number]
export type CookingAvailability = (typeof COOKING_AVAILABILITIES)[number]
export type CoachingStyle = (typeof COACHING_STYLES)[number]
export type ExplanationDetail = (typeof EXPLANATION_DETAILS)[number]
export type FlexibilityPreference = (typeof FLEXIBILITY_PREFERENCES)[number]
export type Sex = (typeof SEXES)[number]

/**
 * One full row of `athlete_profiles`, exactly mirroring migration 013.
 * Every field is nullable except `user_id` and the two timestamps — the profile
 * is filled progressively. For arrays: `null` = not answered yet,
 * `[]` = explicit "none".
 */
export interface AthleteProfile {
  // Identity
  user_id: string
  birth_date: string | null
  sex: Sex | null
  height_cm: number | null

  // Goals
  primary_goal: PrimaryGoal | null
  secondary_goals: PrimaryGoal[] | null
  goal_notes: string | null

  // Experience
  experience_level: ExperienceLevel | null
  years_training: number | null

  // Sustainable schedule
  target_sessions_per_week: number | null
  minimum_sessions_per_week: number | null
  preferred_training_days: Weekday[] | null
  preferred_session_duration_minutes: number | null
  minimum_session_duration_minutes: number | null

  // Training preferences
  preferred_exercises: string[] | null
  avoided_exercises: string[] | null
  available_equipment: string[] | null

  // Limitations (self-reported, functional — not clinical)
  training_limitations: string[] | null
  injuries_or_pain_notes: string | null

  // Lifestyle
  work_pattern: WorkPattern | null
  schedule_notes: string | null
  daily_activity_level: DailyActivityLevel | null
  preferred_training_time: PreferredTrainingTime | null

  // Adherence
  main_training_barriers: string[] | null
  main_nutrition_barriers: string[] | null

  // Nutrition
  nutrition_goal: NutritionGoal | null
  dietary_preferences: string[] | null
  dietary_restrictions: string[] | null
  allergies: string[] | null
  cooking_availability: CookingAvailability | null

  // Coaching
  coaching_style: CoachingStyle | null
  explanation_detail: ExplanationDetail | null
  flexibility_preference: FlexibilityPreference | null

  // Meta
  created_at: string
  updated_at: string
}
