import { z } from 'zod'

// ─── Routing ──────────────────────────────────────────────────────────────────

export type CheckInType = 'weekly' | 'end_of_meso'

/**
 * Determines whether the current week triggers a regular weekly check-in
 * or an end-of-mesocycle review (when the final week is reached).
 */
export function detectCheckInType(currentWeek: number, durationWeeks: number): CheckInType {
  return currentWeek >= durationWeeks ? 'end_of_meso' : 'weekly'
}

// ─── Weekly check-in schemas ──────────────────────────────────────────────────

export const ExerciseUpdateSchema = z.object({
  plan_exercise_id: z.string().uuid(),
  exercise_name: z.string(),
  current_weight_kg: z.number(),
  current_reps: z.number().int(),
  recommended_weight_kg: z.number(),
  recommended_reps: z.number().int(),
  action: z.enum(['increase_reps', 'increase_weight', 'maintain', 'decrease']),
  rationale: z.string(),
})

export const DietFeedbackSchema = z.object({
  avg_calories: z.number(),
  avg_protein_g: z.number(),
  recommendation: z.string(),
})

export const WeeklyCheckInSchema = z.object({
  week_summary: z.object({
    sessions_completed: z.number().int(),
    overall_fatigue: z.enum(['low', 'medium', 'high']),
    overall_adherence: z.number().min(0).max(1),
    observations: z.string(),
  }),
  exercise_updates: z.array(ExerciseUpdateSchema),
  diet_feedback: DietFeedbackSchema.optional(),
})

export type WeeklyCheckInOutput = z.infer<typeof WeeklyCheckInSchema>
export type ExerciseUpdateOutput = z.infer<typeof ExerciseUpdateSchema>

// ─── End-of-mesocycle schemas ─────────────────────────────────────────────────

const KeepExerciseSchema = z.object({
  action: z.literal('keep'),
  plan_exercise_id: z.string().uuid(),
  exercise_name: z.string(),
  rationale: z.string(),
})

const ReplaceExerciseSchema = z.object({
  action: z.literal('replace'),
  old_exercise: z.object({
    plan_exercise_id: z.string().uuid(),
    name: z.string(),
  }),
  new_exercise: z.object({
    name: z.string(),
    sets: z.number().int(),
    // The AI outputs reps as a number; we coerce to string for DB compatibility
    reps: z.coerce.string(),
    weight_kg: z.number(),
  }),
  rationale: z.string(),
})

export const EndOfMesoExerciseChangeSchema = z.discriminatedUnion('action', [
  KeepExerciseSchema,
  ReplaceExerciseSchema,
])

export const EndOfMesoSchema = z.object({
  meso_summary: z.object({
    total_sessions: z.number().int(),
    avg_adherence: z.number().min(0).max(1),
    overall_progress: z.enum(['poor', 'fair', 'good', 'excellent']),
    narrative: z.string(),
  }),
  exercise_changes: z.array(EndOfMesoExerciseChangeSchema),
  new_meso_targets: z.object({
    duration_weeks: z.union([z.literal(6), z.literal(8)]),
    notes: z.string(),
  }),
})

export type EndOfMesoOutput = z.infer<typeof EndOfMesoSchema>
export type EndOfMesoExerciseChange = z.infer<typeof EndOfMesoExerciseChangeSchema>
