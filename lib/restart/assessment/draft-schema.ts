// Restart Assessment — draft runtime validation & invariants (F2.4). PURE.
//
// Two complementary checks, by design (spec §15):
//   1) A TARGETED Zod schema for the draft that mirrors the migration-014 CHECK
//      constraints (ISO dates, start<=end, analysis_date===end, snapshot versions
//      >= 1, snapshots are JSON objects, quality enums, non-negative counts,
//      weight>0, tracked-days 0..28, ratio 0..1, readiness 1..5, uuid|null links).
//      We do NOT re-validate the entire RestartBaseline shape here: that lives in
//      F2.2 and re-declaring it would be fragile duplication. The baseline enters
//      the draft by reference and is asserted only to be a JSON object.
//   2) APPLICATION INVARIANTS against the internally-produced baseline: every
//      scalar / quality / link in the draft must EQUAL what the baseline says, and
//      the profile snapshot must carry no metadata. This is what actually protects
//      against a client-supplied or drifted value — the draft is only trustworthy
//      if it is a faithful projection of the server's own baseline.

import { z } from 'zod'
import type { RestartBaseline } from '@/lib/restart/types'
import { PERCEIVED_STRENGTH_CHANGE_OPTIONS } from './types'
import type { RestartAssessmentDraft } from './types'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const QUALITY = ['insufficient', 'limited', 'sufficient'] as const

const isoDate = () => z.string().regex(ISO_DATE, 'must be an ISO date (YYYY-MM-DD)')
const uuidOrNull = () => z.string().regex(UUID, 'must be a UUID').nullable()

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ─── 1. Targeted Zod schema (mirrors migration-014 column CHECKs) ────────────
export const RestartAssessmentDraftSchema = z
  .strictObject({
    analysis_date: isoDate(),
    analysis_period_start: isoDate(),
    analysis_period_end: isoDate(),

    baseline_snapshot_version: z.number().int().min(1),
    baseline_snapshot: z.any().refine(isPlainObject, 'baseline_snapshot must be a JSON object'),
    profile_snapshot_version: z.number().int().min(1),
    profile_snapshot: z
      .any()
      .refine(
        (v) =>
          isPlainObject(v) &&
          !('user_id' in v) &&
          !('created_at' in v) &&
          !('updated_at' in v),
        'profile_snapshot must be a metadata-free JSON object'
      ),

    training_consistency_data_quality: z.enum(QUALITY),
    performance_data_quality: z.enum(QUALITY),
    body_data_quality: z.enum(QUALITY),
    nutrition_data_quality: z.enum(QUALITY),

    sessions_4w: z.number().int().min(0),
    sessions_8w: z.number().int().min(0),
    sessions_12w: z.number().int().min(0),
    last_session_date: isoDate().nullable(),
    days_since_last_session: z.number().int().min(0).nullable(),
    latest_weight_kg: z.number().gt(0).nullable(),
    latest_body_measurement_date: isoDate().nullable(),
    days_since_latest_body_measurement: z.number().int().min(0).nullable(),
    nutrition_tracked_days_28d: z.number().int().min(0).max(28),
    nutrition_tracked_days_ratio: z.number().min(0).max(1),

    readiness_score: z.number().int().min(1).max(5).nullable(),
    perceived_strength_change: z.enum(PERCEIVED_STRENGTH_CHANGE_OPTIONS).nullable(),
    availability_changed: z.boolean().nullable(),
    new_limitations_reported: z.boolean().nullable(),

    assessed_workout_plan_id: uuidOrNull(),
    assessed_mesocycle_id: uuidOrNull(),
  })
  .refine((d) => d.analysis_period_start <= d.analysis_period_end, {
    message: 'analysis_period_start must be <= analysis_period_end',
    path: ['analysis_period_start'],
  })
  .refine((d) => d.analysis_date === d.analysis_period_end, {
    message: 'analysis_date must equal analysis_period_end',
    path: ['analysis_date'],
  })

// ─── 2. Application invariants vs the internally-produced baseline ───────────
/**
 * Validate a draft: Zod shape first, then that every derived value FAITHFULLY
 * matches the baseline it claims to summarize. Returns null when valid, or a
 * short reason string on the first violation (the caller treats a violation as
 * an INTERNAL error → generic 500; it can only happen on a server bug/drift).
 */
export function validateDraft(
  draft: RestartAssessmentDraft,
  baseline: RestartBaseline
): string | null {
  const parsed = RestartAssessmentDraftSchema.safeParse(draft)
  if (!parsed.success) {
    return `draft shape invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
  }

  const tc = baseline.training_consistency
  const body = baseline.body
  const nutrition = baseline.nutrition
  const expectedPlanId = baseline.plan_fit.has_active_plan ? baseline.plan_fit.plan_id : null
  const expectedMesoId = baseline.mesocycle_context.active_mesocycle_exists
    ? baseline.mesocycle_context.active_mesocycle_id
    : null

  const checks: Array<[string, boolean]> = [
    ['analysis_date', draft.analysis_date === baseline.analysis_period.analysis_date],
    ['analysis_period_start', draft.analysis_period_start === baseline.analysis_period.start_12w],
    ['analysis_period_end', draft.analysis_period_end === baseline.analysis_period.end],
    ['training_consistency_data_quality', draft.training_consistency_data_quality === baseline.data_quality.training_consistency],
    ['performance_data_quality', draft.performance_data_quality === baseline.data_quality.performance],
    ['body_data_quality', draft.body_data_quality === baseline.data_quality.body],
    ['nutrition_data_quality', draft.nutrition_data_quality === baseline.data_quality.nutrition],
    ['sessions_4w', draft.sessions_4w === tc.window_4w.sessions_count],
    ['sessions_8w', draft.sessions_8w === tc.window_8w.sessions_count],
    ['sessions_12w', draft.sessions_12w === tc.window_12w.sessions_count],
    ['last_session_date', draft.last_session_date === tc.last_session_date],
    ['days_since_last_session', draft.days_since_last_session === tc.days_since_last_session],
    ['latest_weight_kg', draft.latest_weight_kg === body.latest_weight_kg],
    ['latest_body_measurement_date', draft.latest_body_measurement_date === body.latest_measurement_date],
    ['days_since_latest_body_measurement', draft.days_since_latest_body_measurement === body.days_since_latest_measurement],
    ['nutrition_tracked_days_28d', draft.nutrition_tracked_days_28d === nutrition.tracked_days],
    ['nutrition_tracked_days_ratio', draft.nutrition_tracked_days_ratio === nutrition.tracked_days_ratio],
    ['assessed_workout_plan_id', draft.assessed_workout_plan_id === expectedPlanId],
    ['assessed_mesocycle_id', draft.assessed_mesocycle_id === expectedMesoId],
    ['baseline_snapshot', draft.baseline_snapshot === baseline],
  ]

  const failed = checks.find(([, ok]) => !ok)
  if (failed) return `draft does not match baseline at: ${failed[0]}`

  return null
}
