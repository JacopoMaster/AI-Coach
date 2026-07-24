// Restart Assessment — application-layer types (F2.4). PURE (types only).
//
// F2.4 produces a RestartAssessmentDraft: a persistence-READY object that maps
// 1:1 to the INSERTable columns of restart_assessments (migration 014) MINUS the
// server-owned identity columns (id / user_id / created_at). F2.4 NEVER writes
// it — persistence is F2.6, atomically, after user confirmation (D007/D018).
//
// Everything here is derived server-side from: the authenticated user, the
// server-read Athlete Profile, the server-built RestartBaseline (F2.2), and the
// validated manual answers. The client can never SUPPLY snapshots, data quality,
// counts, body metrics, PlanFit, plan/meso ids or user_id — see server.ts.

import type { AthleteProfile } from '@/lib/profile/types'
import type { DataQualityLevel, RestartBaseline } from '@/lib/restart/types'

// ─── Athlete Profile snapshot (V1) ───────────────────────────────────────────
// The Athlete Profile row minus the metadata columns (user_id/created_at/
// updated_at). Bounded and serializable; preserves null (not answered) vs []
// (explicitly none). Built by buildAthleteProfileSnapshotV1 (profile-snapshot.ts).
export type AthleteProfileSnapshotV1 = Omit<
  AthleteProfile,
  'user_id' | 'created_at' | 'updated_at'
>

// ─── Adaptive manual questions ───────────────────────────────────────────────
// Question ids are exactly the four manual-answer columns of restart_assessments,
// so a question maps unambiguously to the column it fills.
export type RestartQuestionId =
  | 'new_limitations_reported'
  | 'availability_changed'
  | 'perceived_strength_change'
  | 'readiness_score'

export type RestartQuestionInputType = 'boolean' | 'single_choice' | 'scale_1_5'

export const PERCEIVED_STRENGTH_CHANGE_OPTIONS = [
  'lower',
  'same',
  'higher',
  'unsure',
] as const
export type PerceivedStrengthChange = (typeof PERCEIVED_STRENGTH_CHANGE_OPTIONS)[number]

export interface RestartQuestion {
  id: RestartQuestionId
  // Always true for an emitted question: F2.4 emits ONLY the questions that are
  // actually necessary (D013 minimal friction). The flag is kept explicit so a
  // future revision could emit optional questions without changing the shape.
  required: boolean
  // Why this question is being asked, in neutral terms (D006 explainability).
  reason: string
  input_type: RestartQuestionInputType
  // Present only for single_choice.
  options?: readonly string[]
}

// ─── Validated manual answers ────────────────────────────────────────────────
// Only the keys for questions that were actually asked may be present (enforced
// in schema.ts against the derived question set). A missing key = "not asked /
// not answered" and maps to NULL in the draft (the meaningful DB null, 014).
// null is NEVER accepted from the client to simulate "not asked" — omit instead.
export interface RestartAnswers {
  new_limitations_reported?: boolean
  availability_changed?: boolean
  perceived_strength_change?: PerceivedStrengthChange
  readiness_score?: number // 1..5
}

// ─── The draft (persistence-ready, NOT persisted in F2.4) ────────────────────
// Column-for-column mirror of restart_assessments MINUS id/user_id/created_at.
export interface RestartAssessmentDraft {
  // Analysis period (Europe/Rome, D002) — from RestartBaseline.analysis_period.
  analysis_date: string
  analysis_period_start: string // === baseline.analysis_period.start_12w
  analysis_period_end: string // === analysis_date

  // Versioned decision-time snapshots.
  baseline_snapshot_version: number
  baseline_snapshot: RestartBaseline
  profile_snapshot_version: number
  profile_snapshot: AthleteProfileSnapshotV1

  // Per-domain data quality (queryable scalars mirroring the snapshot).
  training_consistency_data_quality: DataQualityLevel
  performance_data_quality: DataQualityLevel
  body_data_quality: DataQualityLevel
  nutrition_data_quality: DataQualityLevel

  // Denormalized scalar evidence.
  sessions_4w: number
  sessions_8w: number
  sessions_12w: number
  last_session_date: string | null
  days_since_last_session: number | null
  latest_weight_kg: number | null
  latest_body_measurement_date: string | null
  days_since_latest_body_measurement: number | null
  nutrition_tracked_days_28d: number
  nutrition_tracked_days_ratio: number

  // Manual answers (null = question not asked / not answered).
  readiness_score: number | null
  perceived_strength_change: PerceivedStrengthChange | null
  availability_changed: boolean | null
  new_limitations_reported: boolean | null

  // Factual links to the concrete prescription at assessment time (own data,
  // from the server-built baseline; nullable UUIDs, no client input).
  assessed_workout_plan_id: string | null
  assessed_mesocycle_id: string | null
}

// ─── Application states (discriminated by `status`) ──────────────────────────
// Clean narrowing for the future client — never ambiguous boolean combinations.

/** A change to limitations/availability must be applied to the Athlete Profile
 *  (source of truth), NOT duplicated into the Assessment — so the flow blocks. */
export type ProfileUpdateBlocker =
  | 'update_training_limitations' // new_limitations_reported = true
  | 'update_schedule_availability' // availability_changed = true

export interface ProfileRequiredState {
  status: 'profile_required'
  completeness: 'not_started' | 'partial'
  missing_restart_fields: string[]
}

export interface NeedsAnswersState {
  status: 'needs_answers'
  completeness: 'restart_ready' | 'complete'
  questions: RestartQuestion[]
  // Required questions still unanswered. On GET (no answers yet) this is [] — the
  // `questions` list is what the caller renders. Populated only on POST.
  missing_answer_ids: RestartQuestionId[]
  // The bounded, serializable baseline used to derive the questions. Present on
  // GET (context for the UI); null on POST (the draft, when produced, carries it).
  baseline: RestartBaseline | null
}

export interface ProfileUpdateRequiredState {
  status: 'profile_update_required'
  blockers: ProfileUpdateBlocker[]
  questions: RestartQuestion[]
}

export interface ReadyForStrategyProposalState {
  status: 'ready_for_strategy_proposal'
  assessment_draft: RestartAssessmentDraft
  questions: RestartQuestion[]
  answers: RestartAnswers // normalized (exactly what was validated)
}

/** POST-only: an answer targeted a question the server did not ask → HTTP 400. */
export interface UnexpectedAnswerResult {
  status: 'unexpected_answer'
  unexpected: string[]
}

export type RestartGetState = ProfileRequiredState | NeedsAnswersState

export type RestartPostState =
  | ProfileRequiredState
  | NeedsAnswersState
  | ProfileUpdateRequiredState
  | ReadyForStrategyProposalState
  | UnexpectedAnswerResult
