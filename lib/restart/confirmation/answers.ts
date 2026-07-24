// Restart confirmation — normalized answers ⇄ F2.4 answers body (F2.6b). PURE.
//
// The token carries the four manual answers in a NORMALIZED, fully-explicit shape
// (both safety booleans always present; the two conditional answers as value|null)
// so the confirm step never has to trust the client for them.
//
//   normalizeAnswersFromDraft — from a ready RestartAssessmentDraft. In a
//     ready_for_strategy_proposal draft the two safety booleans were required and
//     answered false (a true value would have produced profile_update_required, a
//     missing one needs_answers) → they are non-null false. The conditional
//     answers are value or null (question not asked).
//   answersBodyFromNormalized — rebuild the EXACT F2.4 request body used to derive
//     the draft: keep the two booleans, include a conditional answer ONLY when
//     non-null (an omitted key = "not asked"). Re-running F2.4 with this body
//     reproduces the same draft when nothing changed, and naturally yields a
//     non-ready state (→ stale) when the adaptive question set moved.

import type { RestartAnswers, RestartAssessmentDraft } from '@/lib/restart/assessment/types'
import type { RestartConfirmationNormalizedAnswers } from './types'

export function normalizeAnswersFromDraft(
  draft: RestartAssessmentDraft
): RestartConfirmationNormalizedAnswers {
  return {
    // Coerce to a definite boolean: a ready draft always has these as false.
    new_limitations_reported: draft.new_limitations_reported === true,
    availability_changed: draft.availability_changed === true,
    perceived_strength_change: draft.perceived_strength_change,
    readiness_score: draft.readiness_score,
  }
}

export function answersBodyFromNormalized(
  normalized: RestartConfirmationNormalizedAnswers
): RestartAnswers {
  const body: RestartAnswers = {
    new_limitations_reported: normalized.new_limitations_reported,
    availability_changed: normalized.availability_changed,
  }
  if (normalized.perceived_strength_change !== null) {
    body.perceived_strength_change = normalized.perceived_strength_change
  }
  if (normalized.readiness_score !== null) {
    body.readiness_score = normalized.readiness_score
  }
  return body
}
