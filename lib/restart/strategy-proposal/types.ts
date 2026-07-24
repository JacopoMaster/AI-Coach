// Restart Strategy Proposal — application-layer types (F2.5). PURE (types only).
//
// F2.5 turns a VALIDATED RestartAssessmentDraft (F2.4) into a structured,
// explainable Training Strategy PROPOSAL. It is EPHEMERAL: never persisted, never
// written to any table. Persistence (Assessment + Strategy, atomically) is F2.6,
// after user confirmation (D007/D018).
//
// Split of responsibility (D018 steps 6–9):
//   • the AI produces ONLY RestartStrategyAiOutput (numbers + prose + a bounded
//     review_after_days enum) — never dates, never strategy_type;
//   • the SERVER derives strategy_type / start_date / review_date and assembles
//     the final RestartTrainingStrategyProposal, then re-validates everything.

import type { RestartAssessmentDraft } from '@/lib/restart/assessment/types'
import type {
  NeedsAnswersState,
  ProfileRequiredState,
  ProfileUpdateRequiredState,
  RestartAnswers,
  RestartQuestion,
  UnexpectedAnswerResult,
} from '@/lib/restart/assessment/types'

// ─── AI output (the ONLY thing the model returns) ────────────────────────────
export const REVIEW_AFTER_DAYS_OPTIONS = [28, 35, 42] as const
export type ReviewAfterDays = (typeof REVIEW_AFTER_DAYS_OPTIONS)[number]

export interface RestartStrategyAiOutput {
  target_sessions_per_week: number // 1..7
  minimum_sessions_per_week: number // 1..7, <= target
  review_after_days: ReviewAfterDays // 28 | 35 | 42
  primary_objective: string
  summary: string
  rationale: string
  priorities: string[]
  observations: string[]
  risks_uncertainties: string[]
}

// ─── Final proposal (core of training_strategies, NO identity/status/FK/ts) ───
export interface RestartTrainingStrategyProposal {
  strategy_type: 'restart'
  start_date: string // === assessment_draft.analysis_date (server-derived)
  review_date: string // start_date + review_after_days (server-derived, date-only)
  target_sessions_per_week: number
  minimum_sessions_per_week: number
  primary_objective: string
  summary: string
  rationale: string
  priorities: string[]
  observations: string[]
  risks_uncertainties: string[]
}

// ─── Bounded context handed to the model ─────────────────────────────────────
// Everything is server-derived from the assessment draft. NO user_id / cookies /
// tokens / auth metadata / extra DB ids beyond those already inside the snapshot.
export interface RestartStrategyContext {
  analysis_date: string
  baseline_snapshot_version: number
  profile_snapshot_version: number
  profile_snapshot: RestartAssessmentDraft['profile_snapshot']
  baseline_snapshot: RestartAssessmentDraft['baseline_snapshot']
  manual_answers: {
    readiness_score: number | null
    perceived_strength_change: RestartAssessmentDraft['perceived_strength_change']
    availability_changed: boolean | null
    new_limitations_reported: boolean | null
  }
}

// ─── Injectable provider (so orchestration is testable without real AI) ──────
export type StrategyToolFailureReason = 'tool_missing' | 'tool_wrong' | 'tool_ambiguous'

export interface StrategyToolResult {
  ok: boolean
  reason?: StrategyToolFailureReason
  toolInput?: unknown // the tool_use.input — validated downstream, never trusted
}

export interface StrategyProvider {
  /** One forced-tool call. Transport/SDK failures THROW (StrategyProviderError);
   *  a missing/wrong/ambiguous tool is a non-throwing {ok:false} (retryable). */
  propose(
    context: RestartStrategyContext,
    systemPrompt: string,
    repairHint?: string
  ): Promise<StrategyToolResult>
}

// ─── API application states ──────────────────────────────────────────────────
export interface ReadyForConfirmationState {
  status: 'ready_for_confirmation'
  assessment_draft: RestartAssessmentDraft
  strategy_proposal: RestartTrainingStrategyProposal
  questions: RestartQuestion[]
  answers: RestartAnswers
}

// Incomplete F2.4 states are propagated UNCHANGED (contract preserved).
export type RestartStrategyProposalState =
  | ProfileRequiredState
  | NeedsAnswersState
  | ProfileUpdateRequiredState
  | UnexpectedAnswerResult
  | ReadyForConfirmationState
