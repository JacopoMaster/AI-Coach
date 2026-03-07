import { z } from 'zod'

/**
 * Validates the structured JSON extracted by Claude Vision from a FitDays
 * body-composition share card.
 *
 * All fields except weight_kg are optional — they map to nullable columns in
 * body_measurements and will be null if the AI could not read them from the image.
 */
export const BodyScanSchema = z.object({
  /** ISO date YYYY-MM-DD read from the image; null if not visible → caller uses today */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .nullable()
    .optional(),

  // ── Mandatory ──────────────────────────────────────────────────────────────
  weight_kg: z.number().positive(),

  // ── Optional body metrics ──────────────────────────────────────────────────
  bmi: z.number().positive().nullable().optional(),
  body_fat_pct: z.number().min(0).max(100).nullable().optional(),
  muscle_mass_kg: z.number().positive().nullable().optional(),
  bone_mass_kg: z.number().positive().nullable().optional(),
  /** Body water percentage (Acqua del corpo %) */
  water_pct: z.number().min(0).max(100).nullable().optional(),
  /** Visceral fat rating (dimensionless number, not %) */
  visceral_fat: z.number().min(0).nullable().optional(),
  /** Basal metabolic rate in kcal */
  bmr: z.number().positive().nullable().optional(),
  /** Body/metabolic age in integer years */
  metabolic_age: z.number().int().positive().nullable().optional(),
})

export type BodyScanOutput = z.infer<typeof BodyScanSchema>
