// Restart Baseline — PlanFitReport (F2.2). PURE. Deterministic STRUCTURAL facts
// about the active plan; it never concludes "wrong plan" (D020) and never
// modifies anything. Frequency fit is a neutral state. Session duration is NOT
// derivable from current data (D021) → duration_assessability: 'unavailable'.
//
// Conflicts (D022):
//   • confirmed_conflicts: plan exercise whose normalized name EXACTLY equals a
//     normalized avoided_exercises entry. High confidence only.
//   • possible_conflicts: ambiguous overlap (shared significant token / substring)
//     with avoided_exercises OR with free-text training_limitations. "To verify",
//     never authoritative, never a reason to auto-modify a plan. No fuzzy libs.

import { normalizeExerciseName, significantTokens } from './normalize'
import type { RawActivePlan } from './queries'
import type { PlanDaysComparison, PlanConflict, PlanFitDay, PlanFitReport } from './types'

// Purely factual: compares the count of DISTINCT plan cycle days to a frequency
// number. It does NOT decide whether the plan is compatible with that frequency
// (a 2-day A/B plan can be run 3×/week in rotation). The AI interprets later.
function compareDays(dayCount: number, target: number | null): PlanDaysComparison {
  if (target == null) return 'unknown'
  if (dayCount === target) return 'equal'
  return dayCount < target ? 'below' : 'above'
}

export function buildPlanFit(params: {
  plan: RawActivePlan | null
  targetSessionsPerWeek: number | null
  minimumSessionsPerWeek: number | null
  avoidedExercises: string[] | null
  trainingLimitations: string[] | null
}): PlanFitReport {
  const { plan, targetSessionsPerWeek, minimumSessionsPerWeek } = params

  if (!plan) {
    return {
      has_active_plan: false,
      plan_id: null,
      plan_day_count: 0,
      target_sessions_per_week: targetSessionsPerWeek,
      minimum_sessions_per_week: minimumSessionsPerWeek,
      plan_days_vs_target: 'unknown',
      plan_days_vs_minimum: 'unknown',
      days: [],
      confirmed_conflicts: [],
      possible_conflicts: [],
      limitations: params.trainingLimitations,
      duration_assessability: 'unavailable',
    }
  }

  const sortedDays = [...(plan.workout_plan_days ?? [])].sort((a, b) => a.day_order - b.day_order)
  const days: PlanFitDay[] = sortedDays.map((d) => ({
    day_name: d.day_name,
    exercises_count: d.plan_exercises?.length ?? 0,
    total_planned_sets: (d.plan_exercises ?? []).reduce((acc, e) => acc + (e.sets ?? 0), 0),
  }))
  const plan_day_count = days.length

  // Unique plan exercise display names.
  const planExercises = new Map<string, string>() // normalized → display
  for (const d of sortedDays) {
    for (const e of d.plan_exercises ?? []) {
      const norm = normalizeExerciseName(e.name)
      if (norm && !planExercises.has(norm)) planExercises.set(norm, e.name)
    }
  }

  const avoided = params.avoidedExercises ?? []
  const avoidedNorm = avoided.map((a) => ({ raw: a, norm: normalizeExerciseName(a) }))
  const limitations = params.trainingLimitations ?? []

  const confirmed: PlanConflict[] = []
  const possible: PlanConflict[] = []

  for (const [norm, display] of planExercises) {
    // Confirmed: exact normalized match with an avoided exercise.
    const exact = avoidedNorm.find((a) => a.norm && a.norm === norm)
    if (exact) {
      confirmed.push({
        plan_exercise_name: display,
        matched_against: exact.raw,
        source: 'avoided_exercises',
        reason: 'exact normalized match with an avoided exercise',
      })
      continue // an exact conflict is not also reported as possible
    }

    const planTokens = new Set(significantTokens(display))

    // Possible: token/substring overlap with an avoided exercise.
    for (const a of avoidedNorm) {
      if (!a.norm) continue
      const overlap =
        a.norm.includes(norm) ||
        norm.includes(a.norm) ||
        significantTokens(a.raw).some((t) => planTokens.has(t))
      if (overlap) {
        possible.push({
          plan_exercise_name: display,
          matched_against: a.raw,
          source: 'avoided_exercises',
          reason: 'ambiguous overlap with an avoided exercise — verify',
        })
      }
    }

    // Possible: shared significant token with a free-text limitation.
    for (const lim of limitations) {
      if (significantTokens(lim).some((t) => planTokens.has(t))) {
        possible.push({
          plan_exercise_name: display,
          matched_against: lim,
          source: 'training_limitations',
          reason: 'possible relation to a declared limitation — verify',
        })
      }
    }
  }

  return {
    has_active_plan: true,
    plan_id: plan.id,
    plan_day_count,
    target_sessions_per_week: targetSessionsPerWeek,
    minimum_sessions_per_week: minimumSessionsPerWeek,
    plan_days_vs_target: compareDays(plan_day_count, targetSessionsPerWeek),
    plan_days_vs_minimum: compareDays(plan_day_count, minimumSessionsPerWeek),
    days,
    confirmed_conflicts: confirmed,
    possible_conflicts: dedupeConflicts(possible),
    limitations: params.trainingLimitations,
    duration_assessability: 'unavailable',
  }
}

function dedupeConflicts(conflicts: PlanConflict[]): PlanConflict[] {
  const seen = new Set<string>()
  const out: PlanConflict[] = []
  for (const c of conflicts) {
    const k = `${c.plan_exercise_name}|${c.matched_against}|${c.source}`
    if (!seen.has(k)) {
      seen.add(k)
      out.push(c)
    }
  }
  return out
}
