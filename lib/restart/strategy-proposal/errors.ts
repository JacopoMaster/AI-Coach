// Restart Strategy Proposal — typed errors (F2.5). PURE.
//
// Two distinct failure classes so the route can map them precisely (§15) without
// ever exposing model text, prompts, snapshots, validation details or stack:
//   • StrategyProviderError  — provider/transport failure (SDK/network/API).
//   • InvalidAiOutputError   — the model's output stayed invalid after the single
//                              repair retry (`invalid_ai_output`).
// Both map to HTTP 502 with a GENERIC body. A ProposalInvariantError (server bug:
// the assembled proposal is not a faithful projection of the assessment) maps to
// 500 — it must NEVER happen on valid inputs and never returns a proposal.

export class StrategyProviderError extends Error {
  readonly code = 'strategy_provider_error' as const
  constructor(message = 'strategy provider failed') {
    super(message)
    this.name = 'StrategyProviderError'
  }
}

export class InvalidAiOutputError extends Error {
  readonly code = 'invalid_ai_output' as const
  constructor(message = 'AI output invalid after retry') {
    super(message)
    this.name = 'InvalidAiOutputError'
  }
}

export class ProposalInvariantError extends Error {
  readonly code = 'proposal_invariant_error' as const
  constructor(message = 'assembled proposal violates an internal invariant') {
    super(message)
    this.name = 'ProposalInvariantError'
  }
}
