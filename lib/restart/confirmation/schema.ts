// Restart confirmation — Zod schemas (F2.6b). PURE.
//
//   1) RestartConfirmRequestSchema — the confirm route body: STRICT, the ONLY
//      accepted key is `confirmation_token` (bounded string). A client can never
//      smuggle answers / draft / proposal / confirmation_id / expected active /
//      user_id / analysis_date — all of that lives (signed) inside the token.
//   2) RestartConfirmationTokenPayloadV1Schema — STRICT validation of the decoded
//      token payload, including the reused F2.5 final-proposal schema for the
//      embedded strategy_proposal. Shape only; freshness/binding are checked in
//      token.ts against the secret and the session user.

import { z } from 'zod'
import { RestartTrainingStrategyProposalSchema } from '@/lib/restart/strategy-proposal/schema'
import { PERCEIVED_STRENGTH_CHANGE_OPTIONS } from '@/lib/restart/assessment/types'
import {
  RESTART_CONFIRMATION_PURPOSE,
  RESTART_CONFIRMATION_TOKEN_MAX_BYTES,
  RESTART_CONFIRMATION_VERSION,
} from './types'

export const RestartConfirmRequestSchema = z.strictObject({
  confirmation_token: z.string().min(1).max(RESTART_CONFIRMATION_TOKEN_MAX_BYTES),
})

export type RestartConfirmRequest = z.infer<typeof RestartConfirmRequestSchema>

const NormalizedAnswersSchema = z.strictObject({
  new_limitations_reported: z.boolean(),
  availability_changed: z.boolean(),
  perceived_strength_change: z.enum(PERCEIVED_STRENGTH_CHANGE_OPTIONS).nullable(),
  readiness_score: z.number().int().min(1).max(5).nullable(),
})

// Strict payload schema — extra keys rejected, embedded proposal fully validated
// with the SAME F2.5 final schema (no duplication of guardrails/shape).
export const RestartConfirmationTokenPayloadV1Schema = z.strictObject({
  purpose: z.literal(RESTART_CONFIRMATION_PURPOSE),
  version: z.literal(RESTART_CONFIRMATION_VERSION),
  issued_at: z.number().int().nonnegative(),
  expires_at: z.number().int().nonnegative(),
  confirmation_id: z.string().uuid(),
  user_binding: z.string().min(1),
  normalized_answers: NormalizedAnswersSchema,
  assessment_fingerprint: z.string().min(1),
  strategy_proposal: RestartTrainingStrategyProposalSchema,
  expected_active_strategy_id: z.string().uuid().nullable(),
})
