// Perfect Week evaluator — updates resonance_mult on the user_stats row.
// Called by awardExp() after a save when the day crosses into a new ISO week,
// or by the /api/stats endpoint as a lazy tick if `resonance_last_tick` is stale.
//
// Definition of a Perfect Week (ISO Mon→Sun):
//   ≥ 3 workout_sessions
//   ≥ 5 diet_logs with protein_g ≥ 0.9 · active diet_plan.protein_g
//   ≥ 1 body_measurement with a non-null weight
//
// Vacation-aware: when V days of the week fall inside a vacation period, the
// thresholds scale proportionally (thresholdDaysInWeek := 7 - V). If all 7
// days are vacation, the week is a "bye": no increment, no break.

import type { SupabaseClient } from '@supabase/supabase-js'
import { vacationDaysInWeek } from './vacation'

const MS_PER_DAY = 1000 * 60 * 60 * 24
const RESONANCE_CAP = 3.0
const RESONANCE_STEP_UP = 0.25
const RESONANCE_DECAY_FACTOR = 0.5
const MIN_MULT = 1.0

/** Monday 00:00 of the ISO week containing `date`. */
function isoWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dow = d.getUTCDay() // 0=Sun..6=Sat
  const offset = dow === 0 ? -6 : 1 - dow
  d.setUTCDate(d.getUTCDate() + offset)
  return d
}

export interface PerfectWeekResult {
  weekStart: string
  isPerfect: boolean
  skipped: boolean
  newMultiplier: number
  streakAfter: number
}

/** Evaluates the ISO week ending on or before `asOfDate`.
 *  Returns the week outcome and (if `commit=true`) updates user_stats. */
export async function evaluateLastWeek(
  supabase: SupabaseClient,
  userId: string,
  asOfDate: Date,
  options: { commit: boolean } = { commit: true }
): Promise<PerfectWeekResult | null> {
  // Evaluate the week that just ENDED: Monday..Sunday prior to asOfDate.
  const thisWeekStart = isoWeekStart(asOfDate)
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * MS_PER_DAY)
  const lastWeekEnd = new Date(lastWeekStart.getTime() + 6 * MS_PER_DAY)
  const weekStartISO = lastWeekStart.toISOString().split('T')[0]
  const weekEndISO = lastWeekEnd.toISOString().split('T')[0]

  const vacDays = await vacationDaysInWeek(supabase, userId, weekStartISO)
  if (vacDays >= 7) {
    // Full-week bye — no change to resonance.
    return { weekStart: weekStartISO, isPerfect: false, skipped: true, newMultiplier: NaN, streakAfter: NaN }
  }
  const activeDays = 7 - vacDays
  const scale = activeDays / 7

  const [sessionsRes, dietPlanRes, logsRes, bodyRes, statsRes] = await Promise.all([
    supabase
      .from('workout_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('date', weekStartISO)
      .lte('date', weekEndISO),
    supabase
      .from('diet_plans')
      .select('protein_g')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('diet_logs')
      .select('protein_g')
      .eq('user_id', userId)
      .gte('date', weekStartISO)
      .lte('date', weekEndISO),
    supabase
      .from('body_measurements')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('date', weekStartISO)
      .lte('date', weekEndISO)
      .not('weight_kg', 'is', null),
    supabase.from('user_stats').select('resonance_mult, perfect_week_streak, longest_streak').eq('user_id', userId).single(),
  ])

  const sessions = sessionsRes.count ?? 0
  const proteinTarget = dietPlanRes.data?.protein_g ?? null
  const goodDietLogs = proteinTarget
    ? (logsRes.data ?? []).filter((l) => (l.protein_g ?? 0) >= 0.9 * proteinTarget).length
    : 0
  const measurements = bodyRes.count ?? 0

  const needSessions = Math.ceil(3 * scale)
  const needDietLogs = Math.ceil(5 * scale)
  const needMeasurements = activeDays >= 1 ? 1 : 0

  const isPerfect =
    sessions >= needSessions &&
    (proteinTarget ? goodDietLogs >= needDietLogs : false) &&
    measurements >= needMeasurements

  const currentMult = statsRes.data?.resonance_mult ?? MIN_MULT
  const currentStreak = statsRes.data?.perfect_week_streak ?? 0
  const currentLongest = statsRes.data?.longest_streak ?? 0

  let newMult: number
  let newStreak: number
  if (isPerfect) {
    newMult = Math.min(RESONANCE_CAP, Number(currentMult) + RESONANCE_STEP_UP)
    newStreak = currentStreak + 1
  } else {
    newMult = Math.max(MIN_MULT, Number(currentMult) * RESONANCE_DECAY_FACTOR)
    newStreak = 0
  }
  const newLongest = Math.max(currentLongest, newStreak)

  if (options.commit) {
    await supabase
      .from('user_stats')
      .update({
        resonance_mult: newMult,
        perfect_week_streak: newStreak,
        longest_streak: newLongest,
        resonance_last_tick: new Date().toISOString(),
      })
      .eq('user_id', userId)
  }

  return { weekStart: weekStartISO, isPerfect, skipped: false, newMultiplier: newMult, streakAfter: newStreak }
}

/** Lightweight "should we tick?" check — run at most once/day.
 *  True if user_stats.resonance_last_tick is NULL or older than 24h AND
 *  the current ISO week differs from the last ticked one. */
export async function shouldTickResonance(
  supabase: SupabaseClient,
  userId: string,
  now: Date
): Promise<boolean> {
  const { data } = await supabase
    .from('user_stats')
    .select('resonance_last_tick')
    .eq('user_id', userId)
    .single()

  const last = data?.resonance_last_tick ? new Date(data.resonance_last_tick) : null
  if (!last) return true
  const hours = (now.getTime() - last.getTime()) / (1000 * 60 * 60)
  return hours >= 24
}
