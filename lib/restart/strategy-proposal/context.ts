// Restart Strategy Proposal — AI context builder (F2.5). PURE, no I/O.
//
// buildRestartStrategyContext(draft) → the bounded, serializable object handed to
// the model. It is a projection of the ALREADY server-built assessment draft, so
// nothing new is computed and no client value is trusted. It deliberately carries
// NO user_id / cookies / tokens / auth metadata and does NOT re-flatten the scalar
// evidence — those already live inside baseline_snapshot (avoid duplication, §11).
// null / [] are preserved as they are in the draft (meaningful "unknown"/"none").

import type { RestartAssessmentDraft } from '@/lib/restart/assessment/types'
import type { RestartStrategyContext } from './types'

export function buildRestartStrategyContext(
  draft: RestartAssessmentDraft
): RestartStrategyContext {
  return {
    analysis_date: draft.analysis_date,
    baseline_snapshot_version: draft.baseline_snapshot_version,
    profile_snapshot_version: draft.profile_snapshot_version,
    profile_snapshot: draft.profile_snapshot,
    baseline_snapshot: draft.baseline_snapshot,
    manual_answers: {
      readiness_score: draft.readiness_score,
      perceived_strength_change: draft.perceived_strength_change,
      availability_changed: draft.availability_changed,
      new_limitations_reported: draft.new_limitations_reported,
    },
  }
}
