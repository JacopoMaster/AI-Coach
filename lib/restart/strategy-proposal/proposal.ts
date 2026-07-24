// Restart Strategy Proposal — validation, guardrails, assembly & retry (F2.5).
// PURE except the injected provider call. NO persistence.
//
// Pipeline (§14): provider tool call → Zod parse → Profile guardrails → assemble
// final proposal (server-derived dates) → final invariant validation. At most ONE
// repair retry, triggered only by AI-OUTPUT problems (missing/wrong/ambiguous
// tool, invalid Zod, minimum>target, values above Profile availability, unbounded
// output). Provider/transport failures throw straight through (StrategyProviderError,
// no retry). A missing Profile availability on a restart-ready draft, or a final
// invariant mismatch, is an INTERNAL error (ProposalInvariantError → 500), never a
// retry and never a returned proposal. The retry hint is VALUE-FREE (no output,
// no assessment) and nothing here is logged.

import { addDays } from '@/lib/date/app-date'
import type { RestartAssessmentDraft } from '@/lib/restart/assessment/types'
import { buildRestartStrategyContext } from './context'
import { RESTART_STRATEGY_SYSTEM_PROMPT } from './prompt'
import {
  RestartStrategyAiOutputSchema,
  RestartTrainingStrategyProposalSchema,
  safeIssueHint,
} from './schema'
import { InvalidAiOutputError, ProposalInvariantError } from './errors'
import type {
  RestartStrategyAiOutput,
  RestartTrainingStrategyProposal,
  StrategyProvider,
} from './types'

interface ProfileBounds {
  target: number
  minimum: number
}

/** Profile availability must exist on a restart-ready draft — else internal error. */
function readProfileBounds(draft: RestartAssessmentDraft): ProfileBounds {
  const target = draft.profile_snapshot.target_sessions_per_week
  const minimum = draft.profile_snapshot.minimum_sessions_per_week
  if (typeof target !== 'number' || typeof minimum !== 'number') {
    throw new ProposalInvariantError('profile availability missing on a restart-ready draft')
  }
  return { target, minimum }
}

/** Returns a value-free retry hint when the AI exceeds the declared availability,
 *  or null when within bounds. Proposing LOWER values is allowed (gradual return). */
export function checkProfileGuardrails(
  ai: RestartStrategyAiOutput,
  bounds: ProfileBounds
): string | null {
  const violations: string[] = []
  if (ai.target_sessions_per_week > bounds.target) violations.push('target_sessions_per_week: above_profile')
  if (ai.minimum_sessions_per_week > bounds.minimum) violations.push('minimum_sessions_per_week: above_profile')
  if (ai.minimum_sessions_per_week > ai.target_sessions_per_week) violations.push('minimum_sessions_per_week: gt_target')
  return violations.length ? violations.join('; ') : null
}

/** Assemble the final proposal — server owns strategy_type and the ISO dates. */
export function buildProposalFromAiOutput(
  draft: RestartAssessmentDraft,
  ai: RestartStrategyAiOutput
): RestartTrainingStrategyProposal {
  const start_date = draft.analysis_date
  return {
    strategy_type: 'restart',
    start_date,
    review_date: addDays(start_date, ai.review_after_days), // date-only, no TZ shift
    target_sessions_per_week: ai.target_sessions_per_week,
    minimum_sessions_per_week: ai.minimum_sessions_per_week,
    primary_objective: ai.primary_objective,
    summary: ai.summary,
    rationale: ai.rationale,
    priorities: ai.priorities,
    observations: ai.observations,
    risks_uncertainties: ai.risks_uncertainties,
  }
}

/** Final validation (§18): schema + invariants vs the draft/AI output & Profile.
 *  Returns null when valid, or a short reason (→ internal error, never returned). */
export function validateFinalProposal(
  proposal: RestartTrainingStrategyProposal,
  draft: RestartAssessmentDraft,
  ai: RestartStrategyAiOutput,
  bounds: ProfileBounds
): string | null {
  const parsed = RestartTrainingStrategyProposalSchema.safeParse(proposal)
  if (!parsed.success) return `proposal shape invalid: ${safeIssueHint(parsed.error)}`

  const checks: Array<[string, boolean]> = [
    ['strategy_type', proposal.strategy_type === 'restart'],
    ['start_date_eq_analysis', proposal.start_date === draft.analysis_date],
    ['review_date_derivation', proposal.review_date === addDays(proposal.start_date, ai.review_after_days)],
    ['review_after_start', proposal.review_date > proposal.start_date],
    ['target_within_profile', proposal.target_sessions_per_week <= bounds.target],
    ['minimum_within_profile', proposal.minimum_sessions_per_week <= bounds.minimum],
    ['minimum_le_target', proposal.minimum_sessions_per_week <= proposal.target_sessions_per_week],
  ]
  const failed = checks.find(([, ok]) => !ok)
  return failed ? `proposal invariant violated: ${failed[0]}` : null
}

/**
 * Full pipeline with a single repair retry (max 2 provider calls). Injected
 * provider ⇒ testable without real AI. Throws InvalidAiOutputError after two bad
 * outputs, StrategyProviderError on transport failure, ProposalInvariantError on
 * an internal inconsistency.
 */
export async function runProposalPipeline(
  draft: RestartAssessmentDraft,
  provider: StrategyProvider
): Promise<RestartTrainingStrategyProposal> {
  const context = buildRestartStrategyContext(draft)
  const bounds = readProfileBounds(draft) // internal error BEFORE any AI call if missing

  let hint: string | undefined
  const MAX_ATTEMPTS = 2

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = await provider.propose(context, RESTART_STRATEGY_SYSTEM_PROMPT, hint)

    if (!result.ok) {
      hint = `tool: ${result.reason}`
      continue
    }

    const parsed = RestartStrategyAiOutputSchema.safeParse(result.toolInput)
    if (!parsed.success) {
      hint = safeIssueHint(parsed.error)
      continue
    }

    const guardHint = checkProfileGuardrails(parsed.data, bounds)
    if (guardHint) {
      hint = guardHint
      continue
    }

    const proposal = buildProposalFromAiOutput(draft, parsed.data)
    const invalid = validateFinalProposal(proposal, draft, parsed.data, bounds)
    if (invalid) throw new ProposalInvariantError(invalid) // internal → 500, no retry

    return proposal
  }

  throw new InvalidAiOutputError()
}
