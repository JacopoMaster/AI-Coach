// Restart confirmation — orchestration (F2.6b). The ONLY write is the F2.6a RPC.
//
// NO Anthropic / no provider / no AI here (§24): the confirm step is fully
// deterministic. Flow (§15):
//   1) load & validate the secret (config → 500);
//   2) verify the token (structure/signature/schema/freshness/user binding);
//   3) rebuild the F2.4 answers body from the SIGNED normalized answers;
//   4) re-run postRestartAssessment server-side (fresh Profile + Baseline);
//   5) require ready_for_strategy_proposal — else the token is stale (409);
//   6) recompute the draft fingerprint and compare to the signed one (mismatch → 409);
//   7) re-validate the SIGNED strategy proposal against the CURRENT draft/Profile;
//   8) call ONLY supabase.rpc('confirm_restart_strategy', ...) — atomic + idempotent;
//   9) validate the RPC row and return the confirmation.
//
// Staleness vs internal error (§18): a mismatch attributable to CHANGED DATA
// (assessment no longer ready, fingerprint moved, proposal no longer within the
// current Profile/dates, or the RPC's own restart_confirmation_stale) → 409. An
// inconsistency NOT attributable to changed data (missing Profile availability on a
// ready draft, malformed RPC response) → 500.

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { diffCalendarDays } from '@/lib/date/app-date'
import { postRestartAssessment } from '@/lib/restart/assessment/server'
import type {
  RestartAnswers,
  RestartAssessmentDraft,
  RestartPostState,
} from '@/lib/restart/assessment/types'
import { RestartTrainingStrategyProposalSchema } from '@/lib/restart/strategy-proposal/schema'
import {
  REVIEW_AFTER_DAYS_OPTIONS,
  type RestartTrainingStrategyProposal,
} from '@/lib/restart/strategy-proposal/types'
import { getRestartConfirmationSecret } from './secret'
import { verifyRestartConfirmationToken } from './token'
import { answersBodyFromNormalized } from './answers'
import { fingerprintRestartAssessmentDraft } from './fingerprint'
import {
  ConfirmationFailedError,
  ConfirmationStaleError,
} from './errors'
import type {
  ConfirmRestartStrategyRpcParams,
  RestartConfirmationResult,
} from './types'

type RpcError = { message?: string | null; code?: string | null } | null

export interface ConfirmDeps {
  getSecret: () => string
  now: () => number // epoch seconds
  rebuild: (answers: RestartAnswers) => Promise<RestartPostState>
  callRpc: (
    params: ConfirmRestartStrategyRpcParams
  ) => Promise<{ data: unknown; error: RpcError }>
}

const REVIEW_AFTER_SET = new Set<number>(REVIEW_AFTER_DAYS_OPTIONS)

// The single RPC row shape (Supabase returns a TABLE result as an array).
const RpcRowSchema = z.object({
  assessment_id: z.string().uuid(),
  strategy_id: z.string().uuid(),
  created_new: z.boolean(),
})
const RpcResultSchema = z.array(RpcRowSchema).length(1)

type StrategyRevalidation = 'ok' | 'stale' | 'internal'

/** Re-validate the signed proposal against the freshly-rebuilt draft & Profile. */
export function revalidateStrategyAgainstDraft(
  proposal: RestartTrainingStrategyProposal,
  draft: RestartAssessmentDraft
): StrategyRevalidation {
  // Final F2.5 schema (already enforced at token verify; defensive here).
  if (!RestartTrainingStrategyProposalSchema.safeParse(proposal).success) return 'internal'

  // Profile availability must exist on a ready draft — else internal (not stale).
  const target = draft.profile_snapshot.target_sessions_per_week
  const minimum = draft.profile_snapshot.minimum_sessions_per_week
  if (typeof target !== 'number' || typeof minimum !== 'number') return 'internal'

  // Data-attributable mismatches → stale (Profile edited, day crossed, etc.).
  const dataChecks: boolean[] = [
    proposal.strategy_type === 'restart',
    proposal.start_date === draft.analysis_date,
    proposal.review_date > proposal.start_date,
    REVIEW_AFTER_SET.has(diffCalendarDays(proposal.start_date, proposal.review_date)),
    proposal.target_sessions_per_week <= target,
    proposal.minimum_sessions_per_week <= minimum,
    proposal.minimum_sessions_per_week <= proposal.target_sessions_per_week,
  ]
  return dataChecks.every(Boolean) ? 'ok' : 'stale'
}

function isRpcStaleError(error: NonNullable<RpcError>): boolean {
  // Recognize ONLY the F2.6a stale signal — never map all P0001 to stale.
  const msg = typeof error.message === 'string' ? error.message : ''
  return msg.includes('restart_confirmation_stale')
}

/** PURE orchestration (deps injected) — fully testable without DB/AI/crypto env. */
export async function runConfirmation(
  userId: string,
  token: string,
  deps: ConfirmDeps
): Promise<RestartConfirmationResult> {
  const secret = deps.getSecret() // ConfirmationConfigError → 500
  const payload = verifyRestartConfirmationToken(token, secret, userId, deps.now())
  // → InvalidConfirmationTokenError (400) / ConfirmationExpiredError (410)

  // Rebuild the exact F2.4 answers and re-derive the assessment server-side.
  const answers = answersBodyFromNormalized(payload.normalized_answers)
  const post = await deps.rebuild(answers) // DB error propagates → generic 500

  if (post.status !== 'ready_for_strategy_proposal') {
    // profile_required / needs_answers / profile_update_required / unexpected_answer
    throw new ConfirmationStaleError('assessment no longer ready')
  }

  const draft = post.assessment_draft
  if (fingerprintRestartAssessmentDraft(draft) !== payload.assessment_fingerprint) {
    throw new ConfirmationStaleError('assessment fingerprint changed')
  }

  const revalidation = revalidateStrategyAgainstDraft(payload.strategy_proposal, draft)
  if (revalidation === 'stale') throw new ConfirmationStaleError('strategy no longer compatible')
  if (revalidation === 'internal') throw new ConfirmationFailedError('strategy revalidation invariant')

  // The ONLY write in the whole confirm layer.
  const { data, error } = await deps.callRpc({
    p_confirmation_id: payload.confirmation_id,
    p_assessment: draft,
    p_strategy: payload.strategy_proposal,
    p_expected_active_strategy_id: payload.expected_active_strategy_id,
  })

  if (error) {
    if (isRpcStaleError(error)) throw new ConfirmationStaleError('rpc reported stale')
    throw new ConfirmationFailedError('rpc error')
  }

  const parsed = RpcResultSchema.safeParse(data)
  if (!parsed.success) {
    // empty / multiple / malformed → internal.
    throw new ConfirmationFailedError('malformed rpc response')
  }
  const row = parsed.data[0]

  return {
    status: 'confirmed',
    assessment_id: row.assessment_id,
    strategy_id: row.strategy_id,
    created_new: row.created_new,
  }
}

/** I/O entry point used by the confirm route. Builds the real deps. */
export async function confirmRestartStrategy(
  supabase: SupabaseClient,
  userId: string,
  token: string
): Promise<RestartConfirmationResult> {
  return runConfirmation(userId, token, {
    getSecret: getRestartConfirmationSecret,
    now: () => Math.floor(Date.now() / 1000),
    rebuild: (answers) => postRestartAssessment(supabase, userId, answers),
    callRpc: (params) =>
      supabase.rpc('confirm_restart_strategy', params) as unknown as Promise<{
        data: unknown
        error: RpcError
      }>,
  })
}
