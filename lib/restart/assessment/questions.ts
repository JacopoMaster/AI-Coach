// Restart Assessment — adaptive manual questions (F2.4). PURE, no I/O.
//
// deriveRestartQuestions(baseline) returns ONLY the manual questions that are
// actually necessary for THIS user right now (D013 minimal friction, D018 hybrid
// flow). The set is derived deterministically from the server-built baseline —
// never from client input — so the server always owns which questions apply.
//
// The decision is a PURE function of the RestartBaseline. The Athlete Profile /
// completeness are already REFLECTED in the baseline (target/minimum sessions,
// avoided exercises, limitations feed training_consistency & plan_fit), and none
// of the §8/§9 rules need a profile field the baseline does not already carry —
// so the baseline is the single input. If a future rule genuinely needs a raw
// profile field, add it as an explicit parameter then (documented deviation).
//
// Mapping to D018 / spec §8–§9:
//   • SAFETY (always asked): new limitations/pain, availability change. A change
//     is NOT captured as new profile data here — the boolean only FLAGS it; the
//     actual update is proposed against the Athlete Profile (source of truth) via
//     the profile_update_required state (resolve.ts). The Assessment stores only
//     the flag, and only when it is false.
//   • CONDITIONAL: perceived strength change — asked when performance data is not
//     sufficient, where self-report adds real signal (D008: an old PR must not set
//     the restart load). Readiness — asked when the user is genuinely returning
//     after a gap, i.e. when it can change the proposal's calibration.

import type { RestartBaseline } from '@/lib/restart/types'
import {
  PERCEIVED_STRENGTH_CHANGE_OPTIONS,
  type RestartQuestion,
} from './types'

// A gap of ≥ 2 weeks since the last session means "returning after a break":
// readiness self-report then meaningfully calibrates the restart. Below it, the
// user is effectively still training and readiness adds little friction-value.
// Centralized here (single source) with an explicit, documented name.
export const READINESS_RECALIBRATION_GAP_DAYS = 14

/** Performance signal is not sufficient → perceived strength change is worth asking. */
function isPerformanceSignalNotSufficient(baseline: RestartBaseline): boolean {
  return baseline.data_quality.performance !== 'sufficient'
}

/** The user is returning after a real break (or has no recorded session). */
function isReturningAfterGap(baseline: RestartBaseline): boolean {
  const { days_since_last_session } = baseline.training_consistency
  if (days_since_last_session === null) return true
  return days_since_last_session >= READINESS_RECALIBRATION_GAP_DAYS
}

export function deriveRestartQuestions(baseline: RestartBaseline): RestartQuestion[] {
  const questions: RestartQuestion[] = []

  // ── Safety (always) — validate the Profile is still current ──
  questions.push({
    id: 'new_limitations_reported',
    required: true,
    reason:
      'Domanda di sicurezza: dall’ultimo aggiornamento del profilo sono comparsi nuovi dolori o limitazioni da considerare?',
    input_type: 'boolean',
  })

  questions.push({
    id: 'availability_changed',
    required: true,
    reason:
      'La tua disponibilità settimanale è cambiata rispetto al Profilo Atleta? Serve a proporre una frequenza sostenibile.',
    input_type: 'boolean',
  })

  // ── Conditional: perceived strength change (performance signal not sufficient) ──
  if (isPerformanceSignalNotSufficient(baseline)) {
    questions.push({
      id: 'perceived_strength_change',
      required: true,
      reason:
        'I dati di performance recenti non sono sufficienti: la tua percezione sulla forza aiuta a stimare il punto di ripartenza senza fingere precisione né assumere i vecchi carichi.',
      input_type: 'single_choice',
      options: PERCEIVED_STRENGTH_CHANGE_OPTIONS,
    })
  }

  // ── Conditional: readiness (returning after a real break) ──
  if (isReturningAfterGap(baseline)) {
    questions.push({
      id: 'readiness_score',
      required: true,
      reason:
        'Stai rientrando dopo una pausa: il tuo livello di prontezza percepito (1–5) calibra l’intensità della ripartenza. Non è una diagnosi.',
      input_type: 'scale_1_5',
    })
  }

  return questions
}

/** The set of REQUIRED question ids, for validating answers against them. */
export function requiredQuestionIds(questions: RestartQuestion[]): Set<string> {
  return new Set(questions.filter((q) => q.required).map((q) => q.id))
}

/** All ASKED question ids (superset of required — currently equal). */
export function askedQuestionIds(questions: RestartQuestion[]): Set<string> {
  return new Set(questions.map((q) => q.id))
}
