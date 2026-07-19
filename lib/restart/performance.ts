// Restart Baseline — performance aggregator (F2.2). PURE.
//
// Per-exercise, never a single "strength score" (D008/D017). Set parsing reuses
// the shared tonnage helpers (new per-set JSONB AND legacy flat columns) — no
// duplicate parser. personal_records is NOT read; references are recomputed from
// session_exercises. highest_load_recent_set preserves the raw {weight, reps,
// date} (max weight, ties → most recent date). tonnage is a VOLUME proxy, not
// strength. No estimated 1RM (no reliable load-type semantics → false precision).

import { normalizeSets, parseLegacyReps, computeExerciseTonnage, type TonnageInput } from '@/lib/workouts/tonnage'
import { classifyPerformance, rollUpPerformance } from './data-quality'
import { normalizeExerciseName } from './normalize'
import { MAX_EXERCISES_IN_PERFORMANCE, MAX_RECENT_HISTORY_PER_EXERCISE } from './thresholds'
import type { RawSession, RawSessionExercise } from './queries'
import type {
  AnalysisPeriod,
  DataQualityLevel,
  ExercisePerformance,
  PerfHistoryItem,
  PerfSetRef,
  PerformanceBaseline,
} from './types'

interface RawSet {
  weight: number
  reps: number
}

/** Heaviest valid set of one exercise row (new or legacy format), or null. */
function bestSetOf(ex: RawSessionExercise): RawSet | null {
  const sets = normalizeSets(ex.sets)
  if (sets) {
    let best: RawSet | null = null
    for (const s of sets) {
      const w = Number(s.weight) || 0
      const r = Number(s.reps) || 0
      if (w > 0 && r > 0 && (!best || w > best.weight)) best = { weight: w, reps: r }
    }
    return best
  }
  const w = Number(ex.weight_kg ?? 0)
  const r = parseLegacyReps(ex.reps_done ?? null) // reps-range → low bound (documented)
  return w > 0 && r > 0 ? { weight: w, reps: r } : null
}

interface Entry {
  date: string
  session_id: string
  highest_load_set: PerfSetRef | null
  tonnage: number
  recent: boolean
}

interface Group {
  display_name: string
  entries: Entry[]
}

export function buildPerformance(params: {
  period: AnalysisPeriod
  sessions: RawSession[] // within the reference window (52w)
  performanceWindowStart: string // start_8w
  referenceWindowWeeks: number
  performanceWindowWeeks: number
}): PerformanceBaseline {
  const { period, sessions, performanceWindowStart } = params
  const groups = new Map<string, Group>()

  for (const session of sessions) {
    for (const ex of session.session_exercises ?? []) {
      const name = ex.plan_exercise?.name
      if (!name) continue // unresolved exercise identity → cannot group (documented limit)
      const key = normalizeExerciseName(name)
      if (!key) continue
      const group = groups.get(key) ?? { display_name: name, entries: [] }
      const raw = bestSetOf(ex)
      const highest_load_set: PerfSetRef | null = raw
        ? { weight_kg: raw.weight, reps: raw.reps, date: session.date }
        : null
      group.entries.push({
        date: session.date,
        session_id: session.id,
        highest_load_set,
        tonnage: computeExerciseTonnage(ex as unknown as TonnageInput),
        recent: session.date >= performanceWindowStart,
      })
      groups.set(key, group)
    }
  }

  const exercises: ExercisePerformance[] = []
  for (const [key, group] of groups) {
    const recentEntries = group.entries.filter((e) => e.recent)
    const recentSessions = new Set(recentEntries.map((e) => e.session_id))
    const comparableSessions = new Set(
      recentEntries.filter((e) => e.highest_load_set != null).map((e) => e.session_id)
    )

    const highest_load_recent_set = highestLoad(recentEntries)
    const historical_reference_52w = highestLoad(group.entries)

    const recent_history: PerfHistoryItem[] = [...recentEntries]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)) // newest → oldest
      .slice(0, MAX_RECENT_HISTORY_PER_EXERCISE)
      .map((e) => ({
        date: e.date,
        session_id: e.session_id,
        highest_load_set: e.highest_load_set,
        tonnage: e.tonnage,
      }))

    const tonnage_recent_total = recentEntries.length
      ? Math.round(recentEntries.reduce((acc, e) => acc + e.tonnage, 0))
      : null

    const quality: DataQualityLevel = classifyPerformance(comparableSessions.size)

    exercises.push({
      exercise_key: key,
      exercise_name: group.display_name,
      recent_sessions_count: recentSessions.size,
      comparable_recent_sessions: comparableSessions.size,
      highest_load_recent_set,
      recent_history,
      historical_reference_52w,
      tonnage_recent_total,
      data_quality: quality,
    })
  }

  // Bound output: prioritize exercises with the most comparable recent data.
  exercises.sort(
    (a, b) =>
      b.comparable_recent_sessions - a.comparable_recent_sessions ||
      b.recent_sessions_count - a.recent_sessions_count ||
      a.exercise_key.localeCompare(b.exercise_key)
  )
  const bounded = exercises.slice(0, MAX_EXERCISES_IN_PERFORMANCE)

  return {
    performance_window_weeks: params.performanceWindowWeeks,
    reference_window_weeks: params.referenceWindowWeeks,
    exercises: bounded,
    notes: {
      reps_range_uses_low_bound: true,
      tonnage_is_volume_not_strength: true,
      historical_reference_bounded_to_52w: true,
    },
  }
}

/**
 * Highest valid load across entries: max weight_kg (NOT weight*reps). On equal
 * weight the more recent date wins (deterministic tie-break). Reps are preserved.
 */
function highestLoad(entries: Entry[]): PerfSetRef | null {
  let best: PerfSetRef | null = null
  for (const e of entries) {
    const s = e.highest_load_set
    if (!s) continue
    if (!best || s.weight_kg > best.weight_kg || (s.weight_kg === best.weight_kg && s.date > best.date)) {
      best = s
    }
  }
  return best
}

export { rollUpPerformance }
