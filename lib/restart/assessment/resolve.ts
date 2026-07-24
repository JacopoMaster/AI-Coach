// Restart Assessment — pure POST resolution (F2.4). PURE, no I/O.
//
// Given the server-built baseline, the server-built profile snapshot and the
// SHAPE-valid answers, decide the POST outcome deterministically. Extracted from
// the I/O orchestration (server.ts) so the whole decision is unit-testable
// without a database. NO writes, ever.
//
// Order of checks (spec §12/§13/§10):
//   1) answers targeting a NON-asked question → unexpected_answer (route → 400);
//   2) a REQUIRED question left unanswered      → needs_answers (route → 200);
//   3) new_limitations_reported=true OR availability_changed=true
//        → profile_update_required (route → 200): the change belongs to the
//          Athlete Profile (source of truth), never duplicated into the Assessment;
//   4) otherwise → build + validate the draft → ready_for_strategy_proposal.

import type { ProfileCompleteness } from '@/lib/profile/completeness'
import type { RestartBaseline } from '@/lib/restart/types'
import { deriveRestartQuestions } from './questions'
import { validateAnswersAgainstQuestions } from './schema'
import { buildRestartAssessmentDraft } from './draft'
import { validateDraft } from './draft-schema'
import type {
  AthleteProfileSnapshotV1,
  ProfileUpdateBlocker,
  RestartAnswers,
  RestartPostState,
} from './types'

/** Profile is restart-ready (or better) ⇒ the Restart can proceed. PURE. */
export function isRestartReady(completeness: ProfileCompleteness): boolean {
  return completeness === 'restart_ready' || completeness === 'complete'
}

/**
 * Resolve a POST once the profile gate has passed and the baseline + profile
 * snapshot are built. Throws only on an INTERNAL invariant violation (draft not
 * a faithful projection of the baseline) — the route maps that to a generic 500.
 */
export function resolveRestartPost(
  baseline: RestartBaseline,
  profileSnapshot: AthleteProfileSnapshotV1,
  answers: RestartAnswers
): RestartPostState {
  const questions = deriveRestartQuestions(baseline)
  const { missing, unexpected } = validateAnswersAgainstQuestions(
    questions,
    answers as Record<string, unknown>
  )

  // 1) Answer to a question the server did not ask → hard client error.
  if (unexpected.length > 0) {
    return { status: 'unexpected_answer', unexpected }
  }

  // 2) A required question is unanswered → the flow is valid but incomplete.
  if (missing.length > 0) {
    return {
      status: 'needs_answers',
      completeness: 'restart_ready', // gate already passed; UI only needs the ids
      questions,
      missing_answer_ids: missing,
      baseline: null,
    }
  }

  // 3) A reported change belongs to the Athlete Profile, not the Assessment.
  const blockers: ProfileUpdateBlocker[] = []
  if (answers.new_limitations_reported === true) blockers.push('update_training_limitations')
  if (answers.availability_changed === true) blockers.push('update_schedule_availability')
  if (blockers.length > 0) {
    return { status: 'profile_update_required', blockers, questions }
  }

  // 4) Assemble and self-validate the persistence-ready draft (no write).
  const draft = buildRestartAssessmentDraft(baseline, profileSnapshot, answers)
  const invariantError = validateDraft(draft, baseline)
  if (invariantError) {
    // Server bug / drift — never a client fault. Route → generic 500.
    throw new Error(`restart assessment draft invalid: ${invariantError}`)
  }

  return {
    status: 'ready_for_strategy_proposal',
    assessment_draft: draft,
    questions,
    answers,
  }
}
