// Restart confirmation — token EMISSION wrapper (F2.6b). Reads only; NO writes.
//
// Wraps the F2.5 proposal generator (§13) so the AI core stays free of crypto:
//   1) call generateRestartStrategyProposal (F2.5);
//   2) propagate every non-success state UNCHANGED (profile_required /
//      needs_answers / profile_update_required / unexpected_answer) — WITHOUT
//      reading the active strategy or signing anything;
//   3) only for ready_for_confirmation: read the current active strategy (§11),
//      normalize the answers, fingerprint the draft, mint a confirmation_id, sign
//      a short-lived token, and attach confirmation_token + confirmation_expires_at.
//
// The Assessment Draft and Strategy Proposal STAY in the response (for display);
// the confirm route trusts ONLY the token (§12).

import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateRestartStrategyProposal } from '@/lib/restart/strategy-proposal/server'
import type {
  RestartStrategyProposalState,
  StrategyProvider,
  ReadyForConfirmationState,
} from '@/lib/restart/strategy-proposal/types'
import type { RestartAnswers } from '@/lib/restart/assessment/types'
import { getRestartConfirmationSecret } from './secret'
import { readActiveStrategyId } from './active-strategy'
import { normalizeAnswersFromDraft } from './answers'
import { fingerprintRestartAssessmentDraft } from './fingerprint'
import { computeUserBinding, signRestartConfirmationToken } from './token'
import {
  RESTART_CONFIRMATION_PURPOSE,
  RESTART_CONFIRMATION_TTL_SECONDS,
  RESTART_CONFIRMATION_VERSION,
  type RestartConfirmationTokenPayloadV1,
} from './types'

export interface IssuedReadyForConfirmationState extends ReadyForConfirmationState {
  confirmation_token: string
  confirmation_expires_at: string // ISO 8601 (for the future UI)
}

export type IssuedStrategyProposalState =
  | Exclude<RestartStrategyProposalState, ReadyForConfirmationState>
  | IssuedReadyForConfirmationState

export interface IssueConfirmationDeps {
  userId: string
  readActive: () => Promise<string | null>
  getSecret: () => string
  now: () => number // epoch seconds
  newConfirmationId: () => string
}

/**
 * PURE augmentation step (fully testable): pass non-success states through
 * untouched (no active-strategy read, no signing); mint a token for the ready
 * state. Any thrown error (secret config, active lookup) propagates to the caller.
 */
export async function augmentWithConfirmation(
  state: RestartStrategyProposalState,
  deps: IssueConfirmationDeps
): Promise<IssuedStrategyProposalState> {
  if (state.status !== 'ready_for_confirmation') {
    return state
  }

  // Validate config first (cheap) so a misconfiguration fails before the DB read.
  const secret = deps.getSecret()
  // Read the active strategy immediately before signing (§11) — error-honest.
  const expected_active_strategy_id = await deps.readActive()

  const issued_at = deps.now()
  const expires_at = issued_at + RESTART_CONFIRMATION_TTL_SECONDS

  const payload: RestartConfirmationTokenPayloadV1 = {
    purpose: RESTART_CONFIRMATION_PURPOSE,
    version: RESTART_CONFIRMATION_VERSION,
    issued_at,
    expires_at,
    confirmation_id: deps.newConfirmationId(),
    user_binding: computeUserBinding(deps.userId, secret),
    normalized_answers: normalizeAnswersFromDraft(state.assessment_draft),
    assessment_fingerprint: fingerprintRestartAssessmentDraft(state.assessment_draft),
    strategy_proposal: state.strategy_proposal,
    expected_active_strategy_id,
  }

  const confirmation_token = signRestartConfirmationToken(payload, secret)

  return {
    ...state,
    confirmation_token,
    confirmation_expires_at: new Date(expires_at * 1000).toISOString(),
  }
}

/** I/O entry point used by the strategy-proposal route. */
export async function issueRestartStrategyProposal(
  supabase: SupabaseClient,
  userId: string,
  answers: RestartAnswers,
  provider?: StrategyProvider
): Promise<IssuedStrategyProposalState> {
  const state = await generateRestartStrategyProposal(supabase, userId, answers, provider)
  return augmentWithConfirmation(state, {
    userId,
    readActive: () => readActiveStrategyId(supabase, userId),
    getSecret: getRestartConfirmationSecret,
    now: () => Math.floor(Date.now() / 1000),
    newConfirmationId: () => randomUUID(),
  })
}
