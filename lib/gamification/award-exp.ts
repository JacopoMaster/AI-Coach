// awardExp — single entrypoint for all EXP grants across the app.
// Idempotent via exp_history.UNIQUE (source, source_id).
// Non-fatal by design: callers wrap this in try/catch; a failed EXP award
// must never break the parent POST (save workout, save meal, etc.).
//
// Responsibilities:
//   1. Apply the active resonance_mult to base_exp
//   2. Insert into exp_history (returns gracefully if already awarded)
//   3. Update user_stats (exp_total, level, tier, stage)
//   4. Write spiral_evolution_log entries for tier_up / stage_up / pierce
//   5. Trigger achievement checks
//   6. Return a Reward object for the parent response

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  levelFromTotalExp,
  stageFromLevel,
  tierFromLevel,
} from './exp-curve'
import { checkAchievements, unlockMetricAchievements } from './check-achievements'
import { tickResonanceIfNeeded } from './check-perfect-week'
import type {
  Achievement,
  ExpSource,
  Reward,
  SpiralStage,
  StatTag,
  UserStats,
} from './types'

/** Flat bonus awarded on top of the multiplier bump when a Perfect Week is
 *  confirmed — small, symbolic, also makes `source='perfect_week'` land in
 *  exp_history so the `perfect_spiral` achievement trigger can fire. */
const PERFECT_WEEK_BONUS_EXP = 100

export interface AwardExpInput {
  userId: string
  source: ExpSource
  sourceId: string | null
  baseExp: number
  statTagged?: StatTag
  rationale?: string
  /** If true, skip multiplier (used for flat-value awards like achievements). */
  skipMultiplier?: boolean
  /** If true, skip the lazy Perfect-Week tick (used for re-entrant awardExp
   *  calls inside the same request, e.g. the recursive Perfect-Week bonus). */
  skipResonanceTick?: boolean
  /** Context flags forwarded to checkAchievements. */
  justGigaDrill?: boolean
  justMesoClear?: boolean
  /** Sum of weight × sets × reps across the session's exercises. Required
   *  when source === 'workout_session' to feed `user_stats.total_tonnage`
   *  and the tonnage progress-bar achievements (migration 009). */
  workoutTonnage?: number
}

const ZERO_REWARD: Reward = {
  delta: 0,
  base_exp: 0,
  multiplier: 1,
  new_total: 0,
  new_level: 1,
  leveled_up: false,
}

export async function awardExp(
  supabase: SupabaseClient,
  input: AwardExpInput
): Promise<Reward> {
  const {
    userId,
    source,
    sourceId,
    baseExp,
    statTagged = null,
    rationale = null,
    skipMultiplier = false,
    skipResonanceTick = false,
    justGigaDrill = false,
    justMesoClear = false,
    workoutTonnage = 0,
  } = input

  if (baseExp <= 0) return ZERO_REWARD

  // 0. Lazy Perfect-Week tick — evaluates any fully-elapsed ISO weeks since
  //    the last tick. Runs BEFORE we load current stats so a fresh multiplier
  //    bump (or decay) already applies to this award. Any failure is
  //    non-fatal: the parent POST must never break because of gamification.
  let tickPerfectWeek: Reward['perfect_week'] | undefined
  if (!skipResonanceTick) {
    try {
      const tick = await tickResonanceIfNeeded(supabase, userId)
      if (tick.ticked && tick.lastResult && tick.lastResult.isPerfect) {
        tickPerfectWeek = {
          week_start: tick.lastResult.weekStart,
          streak: tick.lastResult.streakAfter,
          resonance_mult: tick.lastResult.newMultiplier,
        }
      }
    } catch (err) {
      console.error('[gamification] resonance tick failed:', err)
    }
  }

  // 1. Load current stats (also serves as existence check).
  const { data: stats, error: statsErr } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', userId)
    .single<UserStats>()

  // PGRST116 = "no rows returned" — handled below; anything else is a real
  // failure (RLS, network, ...) and must be visible in the logs.
  if (statsErr && (statsErr as { code?: string }).code !== 'PGRST116') {
    console.error('[gamification] load user_stats failed:', statsErr)
  }

  if (!stats) {
    // Trigger should have seeded, but handle defensively.
    const { error: seedErr } = await supabase
      .from('user_stats')
      .insert({ user_id: userId })
    if (seedErr) {
      console.error('[gamification] seed user_stats failed:', seedErr)
    }
    return { ...ZERO_REWARD, rationale: 'user_stats seeded' }
  }

  const multiplier = skipMultiplier ? 1 : Number(stats.resonance_mult ?? 1)
  const delta = Math.max(0, Math.round(baseExp * multiplier))

  // 2. Insert history row — idempotent via UNIQUE(source, source_id).
  //    If sourceId is null, we append a random suffix so concurrent awards
  //    from the same null-source don't collide.
  const resolvedSourceId = sourceId ?? crypto.randomUUID()
  const { error: histErr } = await supabase.from('exp_history').insert({
    user_id: userId,
    delta,
    base_exp: baseExp,
    multiplier,
    source,
    source_id: resolvedSourceId,
    stat_tagged: statTagged,
    rationale,
  })

  if (histErr) {
    // 23505 = unique violation → already awarded, no-op.
    if ((histErr as { code?: string }).code === '23505') return ZERO_REWARD
    console.error(
      '[gamification] exp_history insert failed (source=%s, source_id=%s, code=%s):',
      source,
      resolvedSourceId,
      (histErr as { code?: string }).code,
      histErr
    )
    throw histErr
  }

  // 3. Compute new totals + level/tier/stage transitions.
  const oldExp = Number(stats.exp_total ?? 0)
  const newExp = oldExp + delta
  const oldLevel = stats.level
  const newLevel = levelFromTotalExp(newExp)
  const oldTier = stats.core_drill_tier
  const newTier = Math.max(oldTier, tierFromLevel(newLevel))
  const oldStage = stats.spiral_stage as SpiralStage
  const newStage = stageFromLevel(newLevel)
  const pierced = !stats.pierced_the_heavens && newLevel >= 100

  // Long-term cumulative counters powering the progress-bar achievements
  // (migration 009). Only bumped on workout_session — diet/body sources
  // already drive their own one-shot achievements via checkAchievements.
  const isWorkoutSource = source === 'workout_session'
  const oldTotalWorkouts = Number(stats.total_workouts ?? 0)
  const oldTotalTonnage = Number(stats.total_tonnage ?? 0)
  const newTotalWorkouts = isWorkoutSource ? oldTotalWorkouts + 1 : oldTotalWorkouts
  const newTotalTonnage = isWorkoutSource
    ? oldTotalTonnage + Math.max(0, workoutTonnage)
    : oldTotalTonnage

  const update: Partial<UserStats> = {
    exp_total: newExp,
    level: newLevel,
    core_drill_tier: newTier,
    spiral_stage: newStage,
    updated_at: new Date().toISOString(),
  }
  if (pierced) {
    update.pierced_the_heavens = true
    update.pierced_at = new Date().toISOString()
  }
  if (isWorkoutSource) {
    update.total_workouts = newTotalWorkouts
    update.total_tonnage = newTotalTonnage
  }

  const { error: updateErr } = await supabase
    .from('user_stats')
    .update(update)
    .eq('user_id', userId)
  if (updateErr) {
    console.error('[gamification] user_stats update failed:', updateErr)
    throw updateErr
  }

  // 4. Queue cinematic events for new tier/stage/pierce transitions.
  const events: Array<{
    user_id: string
    event_type: string
    from_value: string | null
    to_value: string | null
    payload: Record<string, unknown> | null
  }> = []
  if (newTier > oldTier) {
    events.push({
      user_id: userId,
      event_type: 'tier_up',
      from_value: String(oldTier),
      to_value: String(newTier),
      payload: { level: newLevel },
    })
  }
  if (newStage !== oldStage) {
    events.push({
      user_id: userId,
      event_type: 'stage_up',
      from_value: oldStage,
      to_value: newStage,
      payload: { level: newLevel },
    })
  }
  if (pierced) {
    events.push({
      user_id: userId,
      event_type: 'pierce_the_heavens',
      from_value: null,
      to_value: 'celestial',
      payload: { level: newLevel },
    })
  }
  if (justMesoClear) {
    events.push({
      user_id: userId,
      event_type: 'meso_clear',
      from_value: null,
      to_value: null,
      payload: { level: newLevel, source_id: resolvedSourceId },
    })
  }
  if (events.length > 0) {
    const { error: evErr } = await supabase
      .from('spiral_evolution_log')
      .insert(events)
    if (evErr) {
      // Cinematic events are nice-to-have; log but don't break EXP flow.
      console.error('[gamification] spiral_evolution_log insert failed:', evErr)
    }
  }

  // 5. Achievements — event-driven (one-shots) + metric-driven (progress bars).
  const eventUnlocks = await checkAchievements(supabase, {
    userId,
    source,
    currentLevel: newLevel,
    perfectWeekStreak: stats.perfect_week_streak,
    resonanceMult: Number(stats.resonance_mult),
    justPierced: pierced,
    justGigaDrill,
    justMesoClear,
  })

  // Metric-bar evaluation runs only on the source(s) that just bumped a
  // counter — keeps the no-op path free of extra round-trips.
  const metricUnlocks: Achievement[] = []
  if (isWorkoutSource) {
    try {
      const [byCount, byTonnage] = await Promise.all([
        unlockMetricAchievements(
          supabase,
          userId,
          'total_workouts',
          newTotalWorkouts
        ),
        unlockMetricAchievements(
          supabase,
          userId,
          'total_tonnage',
          newTotalTonnage
        ),
      ])
      metricUnlocks.push(...byCount, ...byTonnage)
    } catch (err) {
      console.error('[gamification] metric achievement check failed:', err)
    }
  }

  const unlocked: Achievement[] = [...eventUnlocks, ...metricUnlocks]

  // Recursively award EXP for each achievement (source=achievement → no loop risk
  // because the checker short-circuits on already-unlocked codes, and
  // user_achievements PK prevents double-unlocks at the DB layer).
  let cumulativeBonus = 0
  const composedUnlocks: typeof unlocked = [...unlocked]
  for (const ach of unlocked) {
    if (ach.exp_reward > 0) {
      const sub = await awardExp(supabase, {
        userId,
        source: 'achievement',
        sourceId: crypto.randomUUID(),
        baseExp: ach.exp_reward,
        rationale: `Achievement: ${ach.name}`,
        skipMultiplier: true,
        skipResonanceTick: true,
      })
      cumulativeBonus += sub.delta
    }
  }

  // 5.5 Perfect Week follow-up grant — only at top-level calls (guard against
  //     loops: don't re-trigger on the recursive 'perfect_week' or 'achievement'
  //     grants). The flat PERFECT_WEEK_BONUS_EXP both celebrates the streak and
  //     makes `source='perfect_week'` land in exp_history so the perfect_spiral
  //     achievement trigger can fire inside the recursive call.
  if (
    tickPerfectWeek &&
    source !== 'perfect_week' &&
    source !== 'achievement'
  ) {
    try {
      const sub = await awardExp(supabase, {
        userId,
        source: 'perfect_week',
        sourceId: crypto.randomUUID(),
        baseExp: PERFECT_WEEK_BONUS_EXP,
        statTagged: 'all',
        rationale: `Perfect Week — streak ${tickPerfectWeek.streak}w`,
        skipMultiplier: true,
        skipResonanceTick: true,
      })
      cumulativeBonus += sub.delta
      if (sub.unlocked_achievements) {
        composedUnlocks.push(...sub.unlocked_achievements)
      }
    } catch (err) {
      console.error('[gamification] perfect week bonus failed:', err)
    }
  }

  // 6. Build Reward for caller.
  const finalTotal = newExp + cumulativeBonus
  const finalLevel = levelFromTotalExp(finalTotal)

  return {
    delta: delta + cumulativeBonus,
    base_exp: baseExp,
    multiplier,
    new_total: finalTotal,
    new_level: finalLevel,
    leveled_up: finalLevel > oldLevel,
    tier_up: newTier > oldTier ? { from: oldTier, to: newTier } : undefined,
    stage_up: newStage !== oldStage ? { from: oldStage, to: newStage } : undefined,
    pierced: pierced || undefined,
    perfect_week: tickPerfectWeek,
    unlocked_achievements: composedUnlocks.length > 0 ? composedUnlocks : undefined,
    rationale: rationale ?? undefined,
  }
}
