// Restart Strategy Proposal — Zod schemas (F2.5). PURE (Zod + logic).
//
// Two schemas:
//   1) RestartStrategyAiOutputSchema — STRICT & BOUNDED validation of the model's
//      tool payload (§7). Strings are trimmed and length-capped; arrays are
//      cardinality-bounded WITHIN the migration-014 limits (priorities ≤10,
//      observations ≤20, risks ≤20 — we go stricter). No extra keys.
//   2) RestartTrainingStrategyProposalSchema — the assembled, server-owned final
//      proposal (§18): strategy_type literal, ISO dates, review_date > start_date,
//      1..7 with minimum <= target, non-empty bounded strings, no extra keys.
//
// A safe, VALUE-FREE repair hint is derived from Zod issues (path + code only) so
// a retry can nudge the model without ever echoing its output or the assessment.

import { z } from 'zod'
import { REVIEW_AFTER_DAYS_OPTIONS } from './types'

const boundedLine = (max: number) => z.string().trim().min(1).max(max)

export const RestartStrategyAiOutputSchema = z
  .strictObject({
    target_sessions_per_week: z.number().int().min(1).max(7),
    minimum_sessions_per_week: z.number().int().min(1).max(7),
    review_after_days: z.union([
      z.literal(REVIEW_AFTER_DAYS_OPTIONS[0]),
      z.literal(REVIEW_AFTER_DAYS_OPTIONS[1]),
      z.literal(REVIEW_AFTER_DAYS_OPTIONS[2]),
    ]),
    primary_objective: boundedLine(180),
    summary: boundedLine(800),
    rationale: boundedLine(2000),
    priorities: z.array(boundedLine(200)).min(2).max(6),
    observations: z.array(boundedLine(300)).min(1).max(12),
    risks_uncertainties: z.array(boundedLine(300)).min(1).max(10),
  })
  .refine((o) => o.minimum_sessions_per_week <= o.target_sessions_per_week, {
    message: 'minimum_sessions_per_week must be <= target_sessions_per_week',
    path: ['minimum_sessions_per_week'],
  })

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const isoDate = () => z.string().regex(ISO_DATE, 'must be an ISO date (YYYY-MM-DD)')

export const RestartTrainingStrategyProposalSchema = z
  .strictObject({
    strategy_type: z.literal('restart'),
    start_date: isoDate(),
    review_date: isoDate(),
    target_sessions_per_week: z.number().int().min(1).max(7),
    minimum_sessions_per_week: z.number().int().min(1).max(7),
    primary_objective: boundedLine(180),
    summary: boundedLine(800),
    rationale: boundedLine(2000),
    priorities: z.array(boundedLine(200)).min(2).max(6),
    observations: z.array(boundedLine(300)).min(1).max(12),
    risks_uncertainties: z.array(boundedLine(300)).min(1).max(10),
  })
  .refine((p) => p.minimum_sessions_per_week <= p.target_sessions_per_week, {
    message: 'minimum_sessions_per_week must be <= target_sessions_per_week',
    path: ['minimum_sessions_per_week'],
  })
  .refine((p) => p.review_date > p.start_date, {
    message: 'review_date must be after start_date',
    path: ['review_date'],
  })

/**
 * VALUE-FREE summary of Zod issues for a repair retry: only `path: code`, deduped
 * and capped. Never contains the model's actual values or any assessment data, so
 * it is safe to embed in the retry prompt (and it is never logged).
 */
export function safeIssueHint(error: z.ZodError): string {
  const parts = Array.from(
    new Set(error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.code}`))
  )
  return parts.slice(0, 12).join('; ')
}
