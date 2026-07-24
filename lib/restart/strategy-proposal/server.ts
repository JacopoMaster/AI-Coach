// Restart Strategy Proposal — server orchestration (F2.5). Reads only; NO writes.
//
// Reuses the F2.4 assessment layer verbatim: it calls postRestartAssessment and
// PROPAGATES every incomplete state unchanged (profile_required / needs_answers /
// profile_update_required / unexpected_answer) via resolveStrategyProposalFromPostState.
// The AI provider is invoked ONLY when F2.4 reaches `ready_for_strategy_proposal`
// — so no AI call happens on an incomplete profile, missing/unexpected answers, a
// profile-update block, or a Baseline/Profile error (those throw → generic 500).
//
// The provider is INJECTED (default = real Anthropic). F2.5 NEVER writes: no
// restart_assessments / training_strategies / athlete_profiles / workout_plans /
// mesocycles mutation. The returned proposal is EPHEMERAL. F2.6 will define the
// safe confirmation contract and the atomic transaction — and F2.6 MUST re-validate
// server-side, never persist client-supplied draft/proposal blindly.

import type { SupabaseClient } from '@supabase/supabase-js'
import { postRestartAssessment } from '@/lib/restart/assessment/server'
import type { RestartAnswers } from '@/lib/restart/assessment/types'
import { resolveStrategyProposalFromPostState } from './orchestrate'
import { getStrategyProvider } from './provider'
import type { RestartStrategyProposalState, StrategyProvider } from './types'

/** I/O entry point: F2.4 assessment (reads Profile + Baseline) → F2.5 proposal. */
export async function generateRestartStrategyProposal(
  supabase: SupabaseClient,
  userId: string,
  answers: RestartAnswers,
  provider: StrategyProvider = getStrategyProvider()
): Promise<RestartStrategyProposalState> {
  const post = await postRestartAssessment(supabase, userId, answers) // throws on DB error → 500
  return resolveStrategyProposalFromPostState(post, provider)
}
