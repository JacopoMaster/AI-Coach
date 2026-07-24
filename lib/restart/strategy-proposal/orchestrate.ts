// Restart Strategy Proposal — DB-free orchestration step (F2.5). No I/O, no writes.
//
// Turns an F2.4 result (RestartPostState) into an F2.5 state. It PROPAGATES every
// incomplete state unchanged and calls the injected provider ONLY for
// `ready_for_strategy_proposal`. Kept separate from the Supabase I/O wrapper
// (server.ts) so orchestration is fully testable without a database or real AI.

import type { RestartPostState } from '@/lib/restart/assessment/types'
import { runProposalPipeline } from './proposal'
import type { RestartStrategyProposalState, StrategyProvider } from './types'

export async function resolveStrategyProposalFromPostState(
  post: RestartPostState,
  provider: StrategyProvider
): Promise<RestartStrategyProposalState> {
  if (post.status !== 'ready_for_strategy_proposal') {
    // profile_required / needs_answers / profile_update_required / unexpected_answer
    return post
  }

  const strategy_proposal = await runProposalPipeline(post.assessment_draft, provider)

  return {
    status: 'ready_for_confirmation',
    assessment_draft: post.assessment_draft, // unchanged, echoed for the future confirm step
    strategy_proposal,
    questions: post.questions,
    answers: post.answers,
  }
}
