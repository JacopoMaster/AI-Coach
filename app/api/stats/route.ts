import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  expForNextLevel,
  progressToNextLevel,
  titleFromLevel,
  tierFromLevel,
} from '@/lib/gamification/exp-curve'
import { isOnVacation } from '@/lib/gamification/vacation'
import { tickResonanceIfNeeded } from '@/lib/gamification/check-perfect-week'
import type { ExpHistoryEntry, UserStats } from '@/lib/gamification/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const todayISO = new Date().toISOString().split('T')[0]
  const since24hISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Lazy Perfect-Week evaluation on app open. Non-fatal: a stale read is
  // always preferable to a failed dashboard load. The result is surfaced as a
  // one-shot flag so the client HUD can flash without a separate POST.
  let lazyPerfectWeek: {
    week_start: string
    streak: number
    resonance_mult: number
  } | null = null
  try {
    const tick = await tickResonanceIfNeeded(supabase, user.id)
    if (tick.ticked && tick.lastResult && tick.lastResult.isPerfect) {
      lazyPerfectWeek = {
        week_start: tick.lastResult.weekStart,
        streak: tick.lastResult.streakAfter,
        resonance_mult: tick.lastResult.newMultiplier,
      }
    }
  } catch (err) {
    console.error('[gamification] /api/stats tick failed:', err)
  }

  const [statsRes, recentRes, statTotalsRes, recentActivityRes, vacationFlag] = await Promise.all([
    supabase.from('user_stats').select('*').eq('user_id', user.id).single<UserStats>(),
    supabase
      .from('exp_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
    // Aggregate EXP by stat tag across all time (used to build the three
    // stat bars). Pulled via a single SELECT sum(...) ... GROUP BY.
    supabase
      .from('exp_history')
      .select('stat_tagged, delta')
      .eq('user_id', user.id),
    supabase
      .from('exp_history')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since24hISO),
    isOnVacation(supabase, user.id, todayISO),
  ])

  const stats = statsRes.data
  if (!stats) {
    // Defensive: trigger should have seeded. Return a neutral object.
    return NextResponse.json({
      user_stats: null,
      recent_exp: [],
      stat_totals: { forza: 0, resistenza: 0, agilita: 0 },
      title: titleFromLevel(1),
      tier: 1,
      progress: 0,
      exp_for_next_level: expForNextLevel(1),
      on_vacation: false,
      active_recent_24h: false,
    })
  }

  const statTotals = { forza: 0, resistenza: 0, agilita: 0 }
  for (const row of (statTotalsRes.data ?? []) as Array<{ stat_tagged: string | null; delta: number }>) {
    const d = Number(row.delta ?? 0)
    if (row.stat_tagged === 'forza') statTotals.forza += d
    else if (row.stat_tagged === 'resistenza') statTotals.resistenza += d
    else if (row.stat_tagged === 'agilita') statTotals.agilita += d
    else if (row.stat_tagged === 'all') {
      // Spread generic awards equally across the three.
      const third = Math.floor(d / 3)
      statTotals.forza += third
      statTotals.resistenza += third
      statTotals.agilita += third
    }
  }

  return NextResponse.json({
    user_stats: stats,
    recent_exp: (recentRes.data ?? []) as ExpHistoryEntry[],
    stat_totals: statTotals,
    title: titleFromLevel(stats.level),
    tier: tierFromLevel(stats.level),
    progress: progressToNextLevel(Number(stats.exp_total)),
    exp_for_next_level: expForNextLevel(stats.level),
    on_vacation: vacationFlag,
    active_recent_24h: (recentActivityRes.count ?? 0) > 0,
    perfect_week: lazyPerfectWeek,
  })
}
