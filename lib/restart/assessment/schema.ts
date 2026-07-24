// Restart Assessment — request/answer validation (F2.4). PURE (Zod + logic).
//
// Two layers of validation:
//   1) SHAPE (Zod, strict): the request body may contain ONLY an `answers`
//      object, whose keys are the four manual-answer fields with correct types.
//      strictObject rejects any other key — so a client can never smuggle
//      baseline_snapshot / profile_snapshot / data quality / counts / body
//      metrics / PlanFit / plan_id / mesocycle_id / user_id. Those are always
//      server-derived (see server.ts / draft.ts).
//   2) APPLICABILITY: the provided answers are checked against the server-derived
//      question set — every REQUIRED question must be answered, and no answer may
//      target a question that was not asked.

import { z } from 'zod'
import { PERCEIVED_STRENGTH_CHANGE_OPTIONS, type RestartQuestion, type RestartQuestionId } from './types'
import { askedQuestionIds, requiredQuestionIds } from './questions'

export const RestartAnswersSchema = z.strictObject({
  new_limitations_reported: z.boolean().optional(),
  availability_changed: z.boolean().optional(),
  perceived_strength_change: z.enum(PERCEIVED_STRENGTH_CHANGE_OPTIONS).optional(),
  readiness_score: z.number().int().min(1).max(5).optional(),
})

// The whole request body. strict → the ONLY accepted top-level key is `answers`;
// no analysis_date, no user_id, no snapshots — the server owns all of that.
export const RestartAssessmentRequestSchema = z.strictObject({
  answers: RestartAnswersSchema,
})

export type RestartAssessmentRequest = z.infer<typeof RestartAssessmentRequestSchema>

export interface AnswerValidationResult {
  ok: boolean
  missing: RestartQuestionId[] // required questions with no answer
  unexpected: string[] // answers for questions that were not asked
}

/**
 * Validate already-shape-valid answers against the questions the server decided
 * to ask. Pure. Missing required answers or answers to non-asked questions make
 * it not ok — the route maps that to a 400 without persisting anything.
 */
export function validateAnswersAgainstQuestions(
  questions: RestartQuestion[],
  answers: Record<string, unknown>
): AnswerValidationResult {
  const asked = askedQuestionIds(questions)
  const required = requiredQuestionIds(questions)
  const provided = new Set(Object.keys(answers))

  const missing = [...required].filter((id) => !provided.has(id)) as RestartQuestionId[]
  const unexpected = [...provided].filter((id) => !asked.has(id))

  return { ok: missing.length === 0 && unexpected.length === 0, missing, unexpected }
}
