// Restart Assessment — draft assembly (F2.4). PURE, no I/O, no persistence.
//
// buildRestartAssessmentDraft(baseline, profileSnapshot, answers) maps the
// server-built inputs onto a RestartAssessmentDraft that is column-for-column
// ready for a future INSERT into restart_assessments (migration 014) — MINUS
// id/user_id/created_at, which the DB / F2.6 own. F2.4 returns this object and
// stops: NO write happens here (D007/D018).
//
// Every value comes from the server (baseline + profile snapshot) or the
// validated manual answers. A manual field absent from `answers` (its question
// was not asked) maps to NULL — the meaningful "not asked" DB null.

import type { RestartBaseline } from '@/lib/restart/types'
import {
  RESTART_BASELINE_SNAPSHOT_VERSION,
  ATHLETE_PROFILE_SNAPSHOT_VERSION,
} from './versions'
import type {
  AthleteProfileSnapshotV1,
  RestartAnswers,
  RestartAssessmentDraft,
} from './types'

export function buildRestartAssessmentDraft(
  baseline: RestartBaseline,
  profileSnapshot: AthleteProfileSnapshotV1,
  answers: RestartAnswers
): RestartAssessmentDraft {
  const period = baseline.analysis_period
  const tc = baseline.training_consistency
  const body = baseline.body
  const nutrition = baseline.nutrition

  return {
    // Analysis period (analysis_date === end; period_start === widest window).
    analysis_date: period.analysis_date,
    analysis_period_start: period.start_12w,
    analysis_period_end: period.end,

    // Versioned snapshots.
    baseline_snapshot_version: RESTART_BASELINE_SNAPSHOT_VERSION,
    baseline_snapshot: baseline,
    profile_snapshot_version: ATHLETE_PROFILE_SNAPSHOT_VERSION,
    profile_snapshot: profileSnapshot,

    // Per-domain data quality (mirrors the rolled-up baseline quality).
    training_consistency_data_quality: baseline.data_quality.training_consistency,
    performance_data_quality: baseline.data_quality.performance,
    body_data_quality: baseline.data_quality.body,
    nutrition_data_quality: baseline.data_quality.nutrition,

    // Denormalized scalar evidence (1:1 with the snapshot).
    sessions_4w: tc.window_4w.sessions_count,
    sessions_8w: tc.window_8w.sessions_count,
    sessions_12w: tc.window_12w.sessions_count,
    last_session_date: tc.last_session_date,
    days_since_last_session: tc.days_since_last_session,
    latest_weight_kg: body.latest_weight_kg,
    latest_body_measurement_date: body.latest_measurement_date,
    days_since_latest_body_measurement: body.days_since_latest_measurement,
    nutrition_tracked_days_28d: nutrition.tracked_days,
    nutrition_tracked_days_ratio: nutrition.tracked_days_ratio,

    // Manual answers — absent (question not asked) → null (meaningful DB null).
    readiness_score: answers.readiness_score ?? null,
    perceived_strength_change: answers.perceived_strength_change ?? null,
    availability_changed: answers.availability_changed ?? null,
    new_limitations_reported: answers.new_limitations_reported ?? null,

    // Factual links to the concrete prescription at assessment time (own data,
    // server-derived — never trusted from the client). Guarded on the presence
    // flags so a stale id can never leak when there is no active plan/mesocycle.
    assessed_workout_plan_id: baseline.plan_fit.has_active_plan
      ? baseline.plan_fit.plan_id
      : null,
    assessed_mesocycle_id: baseline.mesocycle_context.active_mesocycle_exists
      ? baseline.mesocycle_context.active_mesocycle_id
      : null,
  }
}
