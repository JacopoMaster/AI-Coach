// Hard reset — wipes the gamification ledger for the currently authenticated
// user and rolls user_stats back to Day 1. The historical workout data
// (workout_sessions, session_exercises) is intentionally untouched: the user
// keeps every PR and weight log and only the EXP/level/achievement layer is
// rebooted.
//
// SCOPE: this route operates exclusively on the authenticated admin's OWN
// rows (`.eq('user_id', user.id)`). It does not accept a userId and cannot
// touch other users' data.
//
// SECURITY (P0.3):
//  - method is POST only (no GET mutation, no GET→POST redirect);
//  - requires an authenticated Supabase user (else 401);
//  - requires that user to be in the ADMIN_USER_IDS allowlist (else 403);
//  - requires an explicit JSON body confirmation `{ "confirm": "HARD_RESET" }`
//    that cannot be supplied via a query string (else 400).
//
// Requires migration 012 (RLS INSERT/UPDATE policies). DELETE on exp_history
// also needs an authenticated DELETE policy — added below in the migration
// catch-up step. Without it, this route silently no-ops.

import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const CONFIRM_PHRASE = 'HARD_RESET'

export async function POST(request: Request) {
  const supabase = await createClient()

  const admin = await requireAdmin(supabase)
  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: admin.status }
    )
  }
  const user = admin.user

  // Explicit, body-only confirmation. A destructive reset must never be
  // triggerable by a bare request or by a query string.
  let confirm: unknown
  try {
    const body = await request.json()
    confirm = (body as { confirm?: unknown })?.confirm
  } catch {
    confirm = undefined
  }
  if (confirm !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `Confirmation required: send { "confirm": "${CONFIRM_PHRASE}" } in the JSON body.` },
      { status: 400 }
    )
  }

  console.log('[hard-reset] start')

  // 1. Wipe exp_history (audit log → empty)
  const { error: histErr, count: histCount } = await supabase
    .from('exp_history')
    .delete({ count: 'exact' })
    .eq('user_id', user.id)
  if (histErr) {
    console.error('[hard-reset] exp_history delete failed')
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
  console.log('[hard-reset] exp_history rows deleted=%d', histCount ?? 0)

  // 2. Wipe user_achievements (trophy unlocks → empty)
  const { error: achErr, count: achCount } = await supabase
    .from('user_achievements')
    .delete({ count: 'exact' })
    .eq('user_id', user.id)
  if (achErr) {
    console.error('[hard-reset] user_achievements delete failed')
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
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
    console.error('[hard-reset] user_stats update failed')
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }

  console.log('[hard-reset] done')

  return NextResponse.json({
    success: true,
    message: 'Progression reset to Day 1',
    deleted: {
      exp_history: histCount ?? 0,
      user_achievements: achCount ?? 0,
    },
  })
}
