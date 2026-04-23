// Giga Drill Break detector — awards a dynamic EXP bonus when the user
// sets a new all-time tonnage record on any exercise within a session.
//
// Bonus formula (see GAMIFICATION_PLAN.md §3.2):
//   pctOfNextLevel = min(0.10, 0.05 + improvement_pct)
//   bonus          = round(pctOfNextLevel · expForNextLevel(currentLevel))
// Bonus scales with the user's current level — meaningful at L10 and at L150.

import type { SupabaseClient } from '@supabase/supabase-js'
import { expForNextLevel } from './exp-curve'

export interface GigaDrillResult {
  triggered: boolean
  exercise_name: string
  plan_exercise_id: string
  from_tonnage: number
  to_tonnage: number
  improvement_pct: number
  bonus_exp: number
}

interface SessionExerciseInput {
  plan_exercise_id: string | null
  weight_kg: number | null
  sets_done: number | null
  reps_done: string | number | null
}

/** Parse reps_done which may be '8-12' style range or a single integer. */
function parseReps(reps: string | number | null): number {
  if (reps == null) return 0
  if (typeof reps === 'number') return reps
  const m = reps.match(/\d+/g)
  if (!m || m.length === 0) return 0
  // If it's a range "8-12", use the low end (conservative for PR detection).
  return parseInt(m[0], 10)
}

function computeTonnage(ex: SessionExerciseInput): number {
  const w = ex.weight_kg ?? 0
  const s = ex.sets_done ?? 0
  const r = parseReps(ex.reps_done)
  if (w <= 0 || s <= 0 || r <= 0) return 0
  return w * s * r
}

/** Scan a newly-logged session's exercises, update PRs, and return all
 *  Giga Drill events triggered. Caller is responsible for awarding EXP. */
export async function detectGigaDrills(
  supabase: SupabaseClient,
  userId: string,
  currentLevel: number,
  sessionId: string,
  exercises: SessionExerciseInput[]
): Promise<GigaDrillResult[]> {
  const results: GigaDrillResult[] = []
  if (exercises.length === 0) return results

  const validById = new Map<string, { tonnage: number; input: SessionExerciseInput }>()
  for (const ex of exercises) {
    if (!ex.plan_exercise_id) continue
    const tonnage = computeTonnage(ex)
    if (tonnage <= 0) continue
    // If the same plan_exercise_id appears multiple times in a session (rare
    // but possible — different sets of the same lift), keep the max tonnage.
    const prev = validById.get(ex.plan_exercise_id)
    if (!prev || tonnage > prev.tonnage) {
      validById.set(ex.plan_exercise_id, { tonnage, input: ex })
    }
  }
  if (validById.size === 0) return results

  const planExerciseIds = Array.from(validById.keys())

  // Resolve exercise names in one query.
  const { data: planExercises } = await supabase
    .from('plan_exercises')
    .select('id, name')
    .in('id', planExerciseIds)
  const nameById = new Map((planExercises ?? []).map((p) => [p.id, p.name]))

  // Load existing PRs for these exercises.
  const { data: existingPRs } = await supabase
    .from('personal_records')
    .select('plan_exercise_id, value')
    .eq('user_id', userId)
    .eq('record_type', 'max_tonnage')
    .in('plan_exercise_id', planExerciseIds)
  const prByExercise = new Map((existingPRs ?? []).map((p) => [p.plan_exercise_id, Number(p.value)]))

  const nextLevelCost = expForNextLevel(currentLevel)

  for (const [planExerciseId, { tonnage }] of validById) {
    const exerciseName = nameById.get(planExerciseId) ?? 'Esercizio'
    const existing = prByExercise.get(planExerciseId) ?? 0

    if (existing === 0) {
      // First record ever — seed silently, no cinematic.
      await supabase.from('personal_records').upsert(
        {
          user_id: userId,
          plan_exercise_id: planExerciseId,
          exercise_name: exerciseName,
          record_type: 'max_tonnage',
          value: tonnage,
          session_id: sessionId,
          achieved_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,plan_exercise_id,record_type' }
      )
      continue
    }

    if (tonnage > existing) {
      const improvement = (tonnage - existing) / existing
      const pct = Math.min(0.1, 0.05 + improvement)
      const bonus = Math.max(1, Math.round(pct * nextLevelCost))

      await supabase.from('personal_records').upsert(
        {
          user_id: userId,
          plan_exercise_id: planExerciseId,
          exercise_name: exerciseName,
          record_type: 'max_tonnage',
          value: tonnage,
          session_id: sessionId,
          achieved_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,plan_exercise_id,record_type' }
      )

      results.push({
        triggered: true,
        exercise_name: exerciseName,
        plan_exercise_id: planExerciseId,
        from_tonnage: existing,
        to_tonnage: tonnage,
        improvement_pct: Number(improvement.toFixed(3)),
        bonus_exp: bonus,
      })
    }
  }

  return results
}
