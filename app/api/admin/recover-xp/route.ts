// One-shot recovery route — replays awardExp() across every workout_session
// the current user has logged. Safe to call any number of times: each award
// is keyed by (source='workout_session', source_id=session.id) and the
// UNIQUE constraint on exp_history collapses repeats to a no-op.
//
// SCOPE: this route operates exclusively on the authenticated admin's OWN
// sessions and stats (`.eq('user_id', user.id)`). It does not accept a userId
// and cannot recover XP for other users.
//
// SECURITY (P0.3):
//  - method is POST only (no GET mutation, no GET→POST redirect);
//  - requires an authenticated Supabase user (else 401);
//  - requires that user to be in the ADMIN_USER_IDS allowlist (else 403);
//  - requires an explicit JSON body confirmation `{ "confirm": "RECOVER_XP" }`
//    (else 400). Rationale: although each award is idempotent, a single call
//    can bulk-mutate the whole EXP/level/stage ledger, so it must be an
//    intentional, body-only action — never triggerable by a bare GET/query.
//
// Use this AFTER migration 012 has been applied, otherwise every insert
// will still be rejected by RLS (code 42501) and the recovery will fail
// in exactly the same way as the live writes did.
//
// Logging is intentional but PII-free: it carries only generic technical
// messages and aggregate counters — never user ids, session ids, dates,
// stat values, request body, or raw Supabase/SQL error details. The JSON
// response carries a per-session breakdown scoped to the authenticated admin;
// internal failures are surfaced as a controlled generic value, never a raw
// database message.

import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { NextResponse } from 'next/server'
import { awardExp } from '@/lib/gamification/award-exp'
import { computeExerciseTonnage } from '@/lib/workouts/tonnage'

export const dynamic = 'force-dynamic'

const CONFIRM_PHRASE = 'RECOVER_XP'

interface RecoverEntry {
  // session_id is the AUTHENTICATED ADMIN's own session id and the precise key
  // to locate a failed row. The response is admin-scoped (never cross-user), so
  // returning it here is not a leak. `error`, when present, is a controlled
  // generic label — never a raw Supabase/SQL message or code.
  session_id: string
  date: string
  exercises: number
  tonnage: number
  base_exp: number
  status: 'awarded' | 'already_awarded' | 'failed'
  delta?: number
  new_total?: number
  new_level?: number
  error?: 'recovery_failed'
}

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

  // Explicit, body-only confirmation for a bulk XP mutation.
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

  console.log('[recover-xp] ── start ──')

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
    console.error('[recover-xp] fetch sessions failed')
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }

  const total = sessions?.length ?? 0
  console.log('[recover-xp] found %d sessions', total)

  const results: RecoverEntry[] = []
  let awarded = 0
  let alreadyAwarded = 0
  let failed = 0

  let i = 0
  for (const session of sessions ?? []) {
    i++
    const { data: exercises, error: exErr } = await supabase
      .from('session_exercises')
      .select('sets, sets_done, reps_done, weight_kg, plan_exercise_id')
      .eq('session_id', session.id)

    if (exErr) {
      console.error('[recover-xp] fetch exercises failed for session %d/%d', i, total)
      results.push({
        session_id: session.id,
        date: session.date,
        exercises: 0,
        tonnage: 0,
        base_exp: 0,
        status: 'failed',
        error: 'recovery_failed',
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

    console.log('[recover-xp] processing session %d/%d', i, total)

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

      console.log('[recover-xp]   ↳ session %d/%d %s', i, total, status)

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
    } catch {
      console.error('[recover-xp] awardExp failed for session %d/%d', i, total)
      failed++
      results.push({
        session_id: session.id,
        date: session.date,
        exercises: exList.length,
        tonnage,
        base_exp: baseExp,
        status: 'failed',
        error: 'recovery_failed',
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
    console.error('[recover-xp] final stats fetch failed')
  }

  console.log(
    '[recover-xp] ── done awarded=%d already=%d failed=%d ──',
    awarded,
    alreadyAwarded,
    failed
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
