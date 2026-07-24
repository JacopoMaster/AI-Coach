// Restart Assessment — server orchestration (F2.4). Reads only; NO writes.
//
// Ties the pure pieces to the RLS-protected data:
//   1) read the Athlete Profile (server-side) and derive completeness (F1);
//   2) gate on restart-readiness — if the profile is not ready, STOP before the
//      expensive baseline and return `profile_required`;
//   3) build the RestartBaseline (F2.2) — atomic & error-honest;
//   4) derive the minimal adaptive questions;
//   5) (POST) resolve answers → needs_answers / profile_update_required /
//      ready_for_strategy_proposal (all pure — resolve.ts).
//
// F2.4 NEVER inserts into restart_assessments and NEVER touches training_strategies
// / athlete_profiles / workout_plans / mesocycles — persistence is F2.6, after
// user confirmation (D007/D018). ERROR HONESTY: a real DB error PROPAGATES (the
// route maps it to a generic 500) and is never turned into profile_required or
// needs_answers; a missing profile row is `not_started` (→ profile_required), not
// an error. No try/catch that masks F2.2 errors as fallbacks.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAthleteProfile } from '@/lib/profile/server'
import { getProfileCompleteness, getMissingRestartFields } from '@/lib/profile/completeness'
import { buildRestartBaseline } from '@/lib/restart/baseline'
import type { AthleteProfile } from '@/lib/profile/types'
import { deriveRestartQuestions } from './questions'
import { buildAthleteProfileSnapshotV1 } from './profile-snapshot'
import { isRestartReady, resolveRestartPost } from './resolve'
import type {
  ProfileRequiredState,
  RestartAnswers,
  RestartGetState,
  RestartPostState,
} from './types'

// Internal: the profile gate outcome (shared by GET and POST).
type ProfileGate =
  | ProfileRequiredState
  | { status: 'ok'; profile: AthleteProfile; completeness: 'restart_ready' | 'complete' }

async function loadProfileGate(
  supabase: SupabaseClient,
  userId: string
): Promise<ProfileGate> {
  const profile = await getAthleteProfile(supabase, userId) // throws on real DB error
  const completeness = getProfileCompleteness(profile)

  if (!isRestartReady(completeness)) {
    return {
      status: 'profile_required',
      completeness: completeness as 'not_started' | 'partial',
      missing_restart_fields: getMissingRestartFields(profile),
    }
  }
  // restart_ready | complete ⇒ the row exists and the restart fields are present.
  return {
    status: 'ok',
    profile: profile as AthleteProfile,
    completeness: completeness as 'restart_ready' | 'complete',
  }
}

/** GET: profile gate → adaptive questions + bounded baseline context (no draft). */
export async function getRestartAssessment(
  supabase: SupabaseClient,
  userId: string
): Promise<RestartGetState> {
  const gate = await loadProfileGate(supabase, userId)
  if (gate.status === 'profile_required') return gate

  const baseline = await buildRestartBaseline(supabase, userId)
  const questions = deriveRestartQuestions(baseline)
  return {
    status: 'needs_answers',
    completeness: gate.completeness,
    questions,
    missing_answer_ids: [], // GET carries no answers; `questions` is what to ask
    baseline,
  }
}

/** POST: profile gate → build baseline + snapshot → resolve answers (no write). */
export async function postRestartAssessment(
  supabase: SupabaseClient,
  userId: string,
  answers: RestartAnswers
): Promise<RestartPostState> {
  const gate = await loadProfileGate(supabase, userId)
  if (gate.status === 'profile_required') return gate

  const baseline = await buildRestartBaseline(supabase, userId)
  const profileSnapshot = buildAthleteProfileSnapshotV1(gate.profile)
  return resolveRestartPost(baseline, profileSnapshot, answers)
}
