// Restart confirmation — types & constants (F2.6b). PURE (types only).
//
// The signed confirmation artifact (D020) that closes the Restart hybrid flow
// (D018): F2.5 produces the ephemeral draft + proposal; the server mints a short-
// lived HMAC token binding exactly what the confirm step needs — and NOTHING more.
// The token payload is client-READABLE (base64url) but NOT client-modifiable
// (HMAC-SHA256). It deliberately EXCLUDES: user_id (only an opaque user_binding),
// the full Assessment Draft, the profile/baseline snapshots, cookies, auth tokens,
// api keys. Persistence stays with the F2.6a RPC (D021).

import type { RestartTrainingStrategyProposal } from '@/lib/restart/strategy-proposal/types'
import type { PerceivedStrengthChange } from '@/lib/restart/assessment/types'

export const RESTART_CONFIRMATION_PURPOSE = 'restart_confirmation' as const
export const RESTART_CONFIRMATION_VERSION = 1 as const

// 15 minutes. Centralized — never taken from the client.
export const RESTART_CONFIRMATION_TTL_SECONDS = 15 * 60
// Accept tokens whose issued_at is at most this far in the future (clock skew).
export const CONFIRMATION_CLOCK_SKEW_SECONDS = 30
// Minimum real byte-length of RESTART_CONFIRMATION_SECRET.
export const RESTART_CONFIRMATION_SECRET_MIN_BYTES = 32
// Reasonable upper bound on the token string accepted by the confirm route.
export const RESTART_CONFIRMATION_TOKEN_MAX_BYTES = 16 * 1024

// Domain-separation labels for the two independent HMACs (token vs user binding).
export const TOKEN_SIGNATURE_DOMAIN = 'restart-confirmation:v1:'
export const USER_BINDING_DOMAIN = 'restart-confirmation:user:v1:'

// ─── Normalized answers carried in the token (all four keys, explicit null) ──
export interface RestartConfirmationNormalizedAnswers {
  new_limitations_reported: boolean
  availability_changed: boolean
  perceived_strength_change: PerceivedStrengthChange | null
  readiness_score: number | null
}

// ─── Token payload V1 ────────────────────────────────────────────────────────
export interface RestartConfirmationTokenPayloadV1 {
  purpose: typeof RESTART_CONFIRMATION_PURPOSE
  version: typeof RESTART_CONFIRMATION_VERSION
  issued_at: number // epoch seconds (integer)
  expires_at: number // issued_at + TTL
  confirmation_id: string // uuid — the RPC idempotency key
  user_binding: string // HMAC(secret, USER_BINDING_DOMAIN + userId), base64url
  normalized_answers: RestartConfirmationNormalizedAnswers
  assessment_fingerprint: string // sha256 hex of the canonical assessment draft
  strategy_proposal: RestartTrainingStrategyProposal
  expected_active_strategy_id: string | null
}

// ─── Confirm outcome (success) ───────────────────────────────────────────────
export interface RestartConfirmationResult {
  status: 'confirmed'
  assessment_id: string
  strategy_id: string
  created_new: boolean
}

// ─── Parameters passed to the F2.6a RPC (no user_id — auth.uid() decides) ─────
export interface ConfirmRestartStrategyRpcParams {
  p_confirmation_id: string
  p_assessment: unknown // the rebuilt & validated RestartAssessmentDraft
  p_strategy: RestartTrainingStrategyProposal
  p_expected_active_strategy_id: string | null
}
