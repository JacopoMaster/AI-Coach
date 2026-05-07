// One-shot recovery route — replays awardExp() across every workout_session
// the current user has logged. Safe to call any number of times: each award
// is keyed by (source='workout_session', source_id=session.id) and the
// UNIQUE constraint on exp_history collapses repeats to a no-op.
//
// Use this AFTER migration 012 has been applied, otherwise every insert
// will still be rejected by RLS (code 42501) and the recovery will fail
// in exactly the same way as the live writes did.
//
// Heavy logging is intentional — read the dev server terminal to diagnose
// any remaining issue. The JSON response carries a per-session breakdown.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { awardExp } from '@/lib/gamification/award-exp'
import { computeExerciseTonnage } from '@/lib/workouts/tonnage'

export const dynamic = 'force-dynamic'

interface RecoverEntry {
  session_id: string
  date: string
  exercises: number
  tonnage: number
  base_exp: number
  status: 'awarded' | 'already_awarded' | 'failed'
  delta?: number
  new_total?: number
  new_level?: number
  error?: string
  error_code?: string
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[recover-xp] ── start userId=%s ──', user.id)

  // Oldest-first so awardExp processes sessions in chronological order. This
  // matters: tier_up / stage_up cinematic events are emitted on transition,
  // and Perfect Week ticks are computed against the user's current row state.
  const { data: sessions, error: sessErr } = await supabase
    .from('workout_sessions')
    .select('id, date, created_at')
    .eq('user_id', user.id)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true })

  if (sessErr) {
    console.error('[recover-xp] fetch sessions failed:', sessErr)
    return NextResponse.json(
      { error: sessErr.message, code: (sessErr as { code?: string }).code },
      { status: 500 }
    )
  }

  console.log('[recover-xp] found %d sessions', sessions?.length ?? 0)

  const results: RecoverEntry[] = []
  let awarded = 0
  let alreadyAwarded = 0
  let failed = 0

  for (const session of sessions ?? []) {
    const { data: exercises, error: exErr } = await supabase
      .from('session_exercises')
      .select('sets, sets_done, reps_done, weight_kg, plan_exercise_id')
      .eq('session_id', session.id)

    if (exErr) {
      console.error(
        '[recover-xp] fetch exercises failed for session=%s:',
        session.id,
        exErr
      )
      results.push({
        session_id: session.id,
        date: session.date,
        exercises: 0,
        tonnage: 0,
        base_exp: 0,
        status: 'failed',
        error: exErr.message,
        error_code: (exErr as { code?: string }).code,
      })
      failed++
      continue
    }

    const exList = exercises ?? []
    // computeExerciseTonnage handles BOTH the new JSONB `sets` shape and the
    // legacy weight_kg × sets_done × reps_done flat columns — same helper the
    // live workout POST uses, so the recovered tonnage is identical.
    const tonnage = exList.reduce(
      (acc, ex) => acc + computeExerciseTonnage(ex),
      0
    )
    const baseExp = 100 + exList.length * 15

    console.log(
      '[recover-xp] session=%s date=%s exercises=%d tonnage=%d baseExp=%d',
      session.id,
      session.date,
      exList.length,
      tonnage,
      baseExp
    )

    try {
      const reward = await awardExp(supabase, {
        userId: user.id,
        source: 'workout_session',
        sourceId: session.id,
        baseExp,
        statTagged: 'forza',
        rationale: `Recovery: sessione ${session.date}`,
        workoutTonnage: tonnage,
        // Skip the lazy Perfect-Week tick on every iteration — it would
        // re-evaluate the same week N times and only the FIRST tick of any
        // batch should run. The live grant flow will tick on its own next
        // time the user logs a real session.
        skipResonanceTick: true,
      })

      const status: RecoverEntry['status'] =
        reward.delta === 0 ? 'already_awarded' : 'awarded'
      if (status === 'awarded') awarded++
      else alreadyAwarded++

      console.log(
        '[recover-xp]   ↳ %s delta=%d new_total=%d level=%d',
        status,
        reward.delta,
        reward.new_total,
        reward.new_level
      )

      results.push({
        session_id: session.id,
        date: session.date,
        exercises: exList.length,
        tonnage,
        base_exp: baseExp,
        status,
        delta: reward.delta,
        new_total: reward.new_total,
        new_level: reward.new_level,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const code = (err as { code?: string }).code
      console.error(
        '[recover-xp]   ↳ awardExp threw for session=%s code=%s message=%s',
        session.id,
        code,
        message,
        err
      )
      failed++
      results.push({
        session_id: session.id,
        date: session.date,
        exercises: exList.length,
        tonnage,
        base_exp: baseExp,
        status: 'failed',
        error: message,
        error_code: code,
      })
    }
  }

  // Final stats snapshot so the caller can verify the recovery landed.
  const { data: finalStats, error: statsErr } = await supabase
    .from('user_stats')
    .select(
      'level, exp_total, total_workouts, total_tonnage, spiral_stage, core_drill_tier, resonance_mult'
    )
    .eq('user_id', user.id)
    .single()

  if (statsErr) {
    console.error('[recover-xp] final stats fetch failed:', statsErr)
  }

  console.log(
    '[recover-xp] ── done awarded=%d already=%d failed=%d → level=%s exp=%s ──',
    awarded,
    alreadyAwarded,
    failed,
    finalStats?.level,
    finalStats?.exp_total
  )

  return NextResponse.json({
    user_id: user.id,
    summary: {
      sessions_total: results.length,
      awarded,
      already_awarded: alreadyAwarded,
      failed,
    },
    final_stats: finalStats,
    entries: results,
  })
}
