// Shared tonnage helpers — handle both the new per-set format
// (`sets: [{ reps, weight }]`) and the legacy flat format
// (`weight_kg`, `sets_done`, `reps_done`). All read paths that compute
// tonnage MUST go through these helpers so the gamification engine stays
// consistent across historical and current sessions.

import type { SessionSet } from '@/lib/types'

export interface TonnageInput {
  sets?: SessionSet[] | null
  weight_kg?: number | null
  sets_done?: number | null
  reps_done?: string | number | null
}

/** Parse legacy reps_done which may be '8-12' style range or a single integer.
 *  Ranges use the low end (conservative for PR / Giga Drill detection). */
export function parseLegacyReps(reps: string | number | null | undefined): number {
  if (reps == null) return 0
  if (typeof reps === 'number') return reps
  const m = reps.match(/\d+/)
  if (!m) return 0
  return parseInt(m[0], 10)
}

/** Coerce whatever shape Supabase / JSON returns into a typed SessionSet[]. */
export function normalizeSets(raw: unknown): SessionSet[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: SessionSet[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    const reps = Number(obj.reps)
    const weight = Number(obj.weight)
    if (!Number.isFinite(reps) || !Number.isFinite(weight)) continue
    const completed = obj.completed === undefined ? undefined : Boolean(obj.completed)
    out.push({ reps, weight, completed })
  }
  return out.length > 0 ? out : null
}

export function computeExerciseTonnage(ex: TonnageInput): number {
  const sets = normalizeSets(ex.sets)
  if (sets) {
    return sets.reduce((acc, s) => {
      const w = Number(s.weight) || 0
      const r = Number(s.reps) || 0
      if (w <= 0 || r <= 0) return acc
      return acc + w * r
    }, 0)
  }

  const w = Number(ex.weight_kg ?? 0)
  const s = Number(ex.sets_done ?? 0)
  const r = parseLegacyReps(ex.reps_done ?? null)
  if (w <= 0 || s <= 0 || r <= 0) return 0
  return w * s * r
}

/** Render a "3×8 @ 60kg" style summary line for any session exercise,
 *  regardless of which storage format the row uses. */
export function summarizeExercise(ex: TonnageInput): string {
  const sets = normalizeSets(ex.sets)
  if (sets) {
    const count = sets.length
    if (count === 0) return ''
    const reps = sets.map((s) => s.reps)
    const weights = sets.map((s) => s.weight).filter((w) => w > 0)
    const allSameReps = reps.every((r) => r === reps[0])
    const allSameWeight = weights.length === count && weights.every((w) => w === weights[0])
    if (allSameReps && allSameWeight) {
      return `${count}×${reps[0]} @ ${weights[0]}kg`
    }
    if (allSameReps) {
      return `${count}×${reps[0]}${weights.length > 0 ? ` (pesi variabili)` : ''}`
    }
    return sets
      .map((s) => `${s.reps}${s.weight > 0 ? `@${s.weight}kg` : ''}`)
      .join(', ')
  }

  const setsDone = ex.sets_done ?? null
  const repsDone = ex.reps_done ?? null
  const weight = ex.weight_kg ?? null
  if (setsDone == null && repsDone == null && weight == null) return ''
  const left = setsDone != null && repsDone != null ? `${setsDone}×${repsDone}` : `${setsDone ?? '—'}×${repsDone ?? '—'}`
  return weight != null ? `${left} @ ${weight}kg` : left
}
