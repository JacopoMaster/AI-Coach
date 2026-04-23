// Achievement checker — runs after every EXP award and evaluates only the
// triggers relevant to the action source (≤3 queries per source).
// Grants any newly-met achievements with a dedicated EXP entry.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Achievement, ExpSource } from './types'

interface CheckContext {
  userId: string
  source: ExpSource
  currentLevel: number
  perfectWeekStreak: number
  resonanceMult: number
  justPierced?: boolean
  justGigaDrill?: boolean
  justMesoClear?: boolean
}

/** Main entry. Returns the set of newly-unlocked achievements. */
export async function checkAchievements(
  supabase: SupabaseClient,
  ctx: CheckContext
): Promise<Achievement[]> {
  const unlockedCodes = new Set<string>()
  const { data: alreadyUnlocked } = await supabase
    .from('user_achievements')
    .select('achievement_code')
    .eq('user_id', ctx.userId)
  for (const row of alreadyUnlocked ?? []) unlockedCodes.add(row.achievement_code)

  const candidates: string[] = []

  // Always-check triggers (cheap, based on cached stats).
  if (!unlockedCodes.has('infinite_spiral') && ctx.resonanceMult >= 3.0) {
    candidates.push('infinite_spiral')
  }
  if (!unlockedCodes.has('pierce_heavens') && ctx.justPierced) {
    candidates.push('pierce_heavens')
  }
  if (!unlockedCodes.has('tengen_toppa') && ctx.currentLevel >= 200) {
    candidates.push('tengen_toppa')
  }

  // Source-specific cheap triggers.
  if (ctx.source === 'workout_session' && !unlockedCodes.has('first_spark')) {
    // first_spark = first ever workout session
    const { count } = await supabase
      .from('workout_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
    if ((count ?? 0) >= 1) candidates.push('first_spark')
  }

  if (ctx.source === 'workout_session' && !unlockedCodes.has('iron_will')) {
    // 4 consecutive weeks with ≥3 sessions each
    if (await hasFourWeekIronWill(supabase, ctx.userId)) candidates.push('iron_will')
  }

  if (ctx.source === 'workout_session' && !unlockedCodes.has('century_press')) {
    // Any session_exercise with weight_kg ≥ 100
    const { count } = await supabase
      .from('session_exercises')
      .select('id, session:workout_sessions!inner(user_id)', { count: 'exact', head: true })
      .gte('weight_kg', 100)
      .eq('session.user_id', ctx.userId)
    if ((count ?? 0) >= 1) candidates.push('century_press')
  }

  if (ctx.source === 'workout_session' && !unlockedCodes.has('dawn_patrol')) {
    // 10 workouts logged before 10:00 local — approximated via created_at UTC
    // hour < 8 (Italy is UTC+1/+2, so 10:00 local ≈ 8-9 UTC). Good enough for v1.
    const { count } = await supabase
      .from('workout_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .lt('created_at', '2100-01-01T08:00:00Z') // placeholder, see note below
    // NOTE: Supabase PostgREST can't do `EXTRACT(HOUR FROM created_at)` via the
    // client filter. A DB-side function or materialized view would be cleaner;
    // we skip this one for v1 unless we have a server-side evaluator. Remove
    // the placeholder so we don't falsely unlock:
    if (false && (count ?? 0) >= 10) candidates.push('dawn_patrol')
  }

  if (ctx.source === 'giga_drill_break' && !unlockedCodes.has('giga_drill')) {
    candidates.push('giga_drill')
  }

  if (ctx.source === 'perfect_week' && !unlockedCodes.has('perfect_spiral')) {
    if (ctx.perfectWeekStreak >= 1) candidates.push('perfect_spiral')
  }

  if (ctx.source === 'meso_complete') {
    if (!unlockedCodes.has('chapter_clear') && ctx.justMesoClear) {
      candidates.push('chapter_clear')
    }
    if (!unlockedCodes.has('triple_chapter')) {
      const { count } = await supabase
        .from('mesocycles')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', ctx.userId)
        .eq('status', 'completed')
      if ((count ?? 0) >= 3) candidates.push('triple_chapter')
    }
  }

  if (candidates.length === 0) return []

  const { data: achievementRows } = await supabase
    .from('achievements')
    .select('*')
    .in('code', candidates)

  const toUnlock = (achievementRows ?? []) as Achievement[]
  if (toUnlock.length === 0) return []

  const { data: actuallyInserted } = await supabase
    .from('user_achievements')
    .upsert(
      toUnlock.map((a) => ({ user_id: ctx.userId, achievement_code: a.code })),
      { onConflict: 'user_id,achievement_code', ignoreDuplicates: true }
    )
    .select('achievement_code')

  // Only return achievements we actually unlocked (avoids double EXP on races).
  const insertedCodes = new Set((actuallyInserted ?? []).map((r) => r.achievement_code))
  return toUnlock.filter((a) => insertedCodes.has(a.code))
}

async function hasFourWeekIronWill(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  // Pull the last 30 days of sessions — enough to evaluate 4 recent weeks.
  const from = new Date()
  from.setDate(from.getDate() - 30)
  const { data } = await supabase
    .from('workout_sessions')
    .select('date')
    .eq('user_id', userId)
    .gte('date', from.toISOString().split('T')[0])
    .order('date', { ascending: false })

  if (!data || data.length === 0) return false

  // Bucket sessions by ISO week (yyyy-Www).
  const buckets = new Map<string, number>()
  for (const row of data) {
    const d = new Date(row.date)
    const dow = d.getUTCDay() || 7
    const monday = new Date(d)
    monday.setUTCDate(d.getUTCDate() - (dow - 1))
    const key = monday.toISOString().split('T')[0]
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }

  // Walk back week-by-week from current week; need 4 consecutive with ≥3.
  const now = new Date()
  const dow = now.getUTCDay() || 7
  const thisMonday = new Date(now)
  thisMonday.setUTCDate(now.getUTCDate() - (dow - 1))

  let consecutive = 0
  for (let i = 0; i < 5; i++) {
    const wk = new Date(thisMonday.getTime() - i * 7 * 24 * 60 * 60 * 1000)
    const key = wk.toISOString().split('T')[0]
    if ((buckets.get(key) ?? 0) >= 3) consecutive++
    else {
      if (i === 0) continue // grace for in-progress current week
      break
    }
    if (consecutive >= 4) return true
  }
  return false
}
