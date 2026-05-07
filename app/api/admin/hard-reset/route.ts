// Hard reset — wipes the gamification ledger for the currently authenticated
// user and rolls user_stats back to Day 1. The historical workout data
// (workout_sessions, session_exercises) is intentionally untouched: the user
// keeps every PR and weight log and only the EXP/level/achievement layer is
// rebooted.
//
// Requires migration 012 (RLS INSERT/UPDATE policies). DELETE on exp_history
// also needs an authenticated DELETE policy — added below in the migration
// catch-up step. Without it, this route silently no-ops.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[hard-reset] start userId=%s', user.id)

  // 1. Wipe exp_history (audit log → empty)
  const { error: histErr, count: histCount } = await supabase
    .from('exp_history')
    .delete({ count: 'exact' })
    .eq('user_id', user.id)
  if (histErr) {
    console.error('[hard-reset] exp_history delete failed:', histErr)
    return NextResponse.json(
      { error: 'exp_history delete failed', details: histErr.message, code: (histErr as { code?: string }).code },
      { status: 500 }
    )
  }
  console.log('[hard-reset] exp_history rows deleted=%d', histCount ?? 0)

  // 2. Wipe user_achievements (trophy unlocks → empty)
  const { error: achErr, count: achCount } = await supabase
    .from('user_achievements')
    .delete({ count: 'exact' })
    .eq('user_id', user.id)
  if (achErr) {
    console.error('[hard-reset] user_achievements delete failed:', achErr)
    return NextResponse.json(
      { error: 'user_achievements delete failed', details: achErr.message, code: (achErr as { code?: string }).code },
      { status: 500 }
    )
  }
  console.log('[hard-reset] user_achievements rows deleted=%d', achCount ?? 0)

  // 3. Roll user_stats back to Day 1.
  //    Note: the schema constrains spiral_stage to
  //    ('terrestrial','atmospheric','orbital','celestial','galactic','tengen_toppa').
  //    'terrestrial' is the Day-1 stage (also the column DEFAULT in migration 006).
  const { error: statsErr } = await supabase
    .from('user_stats')
    .update({
      level: 1,
      exp_total: 0,
      total_workouts: 0,
      total_tonnage: 0,
      max_perfect_streak: 0,
      anime_waifu_notifs: 0,
      spiral_stage: 'terrestrial',
      core_drill_tier: 1,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
  if (statsErr) {
    console.error('[hard-reset] user_stats update failed:', statsErr)
    return NextResponse.json(
      { error: 'user_stats update failed', details: statsErr.message, code: (statsErr as { code?: string }).code },
      { status: 500 }
    )
  }

  console.log('[hard-reset] done userId=%s', user.id)

  return NextResponse.json({
    success: true,
    message: 'Progression reset to Day 1',
    deleted: {
      exp_history: histCount ?? 0,
      user_achievements: achCount ?? 0,
    },
  })
}
