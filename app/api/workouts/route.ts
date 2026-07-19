import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { awardExp } from '@/lib/gamification/award-exp'
import { detectGigaDrills } from '@/lib/gamification/check-giga-drill'
import { levelFromTotalExp } from '@/lib/gamification/exp-curve'
import { toGamificationPayload } from '@/lib/gamification/payload'
import type { Reward } from '@/lib/gamification/types'
import { computeExerciseTonnage, normalizeSets } from '@/lib/workouts/tonnage'
import type { SessionSet } from '@/lib/types'
import { getAppDate, getAppDateDaysAgo, diffCalendarDays } from '@/lib/date/app-date'

function getCurrentWeek(startDate: string, durationWeeks: number): number {
  // Calendar-day difference in Europe/Rome (D002): the week number must roll over
  // at Rome midnight, not 1–2h later due to a UTC millisecond anchor.
  const days = diffCalendarDays(startDate, getAppDate())
  return Math.min(Math.max(Math.floor(days / 7) + 1, 1), durationWeeks)
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'plan'

  if (type === 'plan') {
    const { data, error } = await supabase
      .from('workout_plans')
      .select(`
        *,
        days:workout_plan_days (
          *,
          exercises:plan_exercises (*)
        )
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (data?.days) {
      data.days = data.days
        .sort((a: { day_order: number }, b: { day_order: number }) => a.day_order - b.day_order)
      data.days.forEach((day: { exercises: { order: number }[] }) => {
        day.exercises = day.exercises?.sort((a, b) => a.order - b.order)
      })
    }

    return NextResponse.json(data || null)
  }

  if (type === 'sessions') {
    const days = parseInt(searchParams.get('days') || '30')

    // Range lower bound: N days before today-in-Rome (D002).
    const { data, error } = await supabase
      .from('workout_sessions')
      .select(`
        *,
        plan_day:workout_plan_days (day_name),
        exercises:session_exercises (
          *,
          plan_exercise:plan_exercises (name)
        )
      `)
      .eq('user_id', user.id)
      .gte('date', getAppDateDaysAgo(days))
      .order('date', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  }

  if (type === 'previous_notes') {
    const ids = (searchParams.get('exercise_ids') || '').split(',').filter(Boolean)
    if (ids.length === 0) return NextResponse.json({})

    const { data, error } = await supabase
      .from('session_exercises')
      .select(`plan_exercise_id, notes, session:workout_sessions!inner(date, user_id)`)
      .in('plan_exercise_id', ids)
      .eq('session.user_id', user.id)
      .not('notes', 'is', null)
      .neq('notes', '')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Per ogni esercizio, tieni solo la nota della sessione più recente
    const result: Record<string, string> = {}
    const latestDates: Record<string, string> = {}
    for (const row of (data as any[] || [])) {
      const exId = row.plan_exercise_id
      const sessionObj = Array.isArray(row.session) ? row.session[0] : row.session
      const date = sessionObj?.date || ''
      if (!latestDates[exId] || date > latestDates[exId]) {
        result[exId] = row.notes
        latestDates[exId] = date
      }
    }
    return NextResponse.json(result)
  }

  if (type === 'previous_performance') {
    const ids = (searchParams.get('exercise_ids') || '').split(',').filter(Boolean)
    if (ids.length === 0) return NextResponse.json({})

    const { data, error } = await supabase
      .from('session_exercises')
      .select(`plan_exercise_id, sets, sets_done, reps_done, weight_kg, session:workout_sessions!inner(date, user_id)`)
      .in('plan_exercise_id', ids)
      .eq('session.user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // The "Copy from last time" hint surfaces a flat (sets/reps/weight)
    // summary even when the row is stored in the new per-set format —
    // pick the heaviest set as the representative payload.
    const result: Record<string, { sets_done: string; reps_done: string; weight_kg: string }> = {}
    const latestDates: Record<string, string> = {}
    for (const row of (data as any[] || [])) {
      const exId = row.plan_exercise_id
      const sessionObj = Array.isArray(row.session) ? row.session[0] : row.session
      const date = sessionObj?.date || ''
      if (latestDates[exId] && date <= latestDates[exId]) continue

      const sets = normalizeSets(row.sets)
      let summary: { sets_done: string; reps_done: string; weight_kg: string }
      if (sets && sets.length > 0) {
        const top = sets.reduce((a, b) => (b.weight > a.weight ? b : a))
        summary = {
          sets_done: String(sets.length),
          reps_done: String(top.reps),
          weight_kg: String(top.weight),
        }
      } else {
        summary = {
          sets_done: row.sets_done != null ? String(row.sets_done) : '',
          reps_done: row.reps_done ?? '',
          weight_kg: row.weight_kg != null ? String(row.weight_kg) : '',
        }
      }
      result[exId] = summary
      latestDates[exId] = date
    }
    return NextResponse.json(result)
  }

  if (type === 'all_plans') {
    const { data, error } = await supabase
      .from('workout_plans')
      .select(`*, days:workout_plan_days(*, exercises:plan_exercises(*))`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  }

  if (type === 'mesocycle') {
    const { data: meso, error } = await supabase
      .from('mesocycles')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!meso) return NextResponse.json(null)

    const currentWeek = getCurrentWeek(meso.start_date, meso.duration_weeks)

    const { data: progressions } = await supabase
      .from('exercise_progressions')
      .select('*')
      .eq('mesocycle_id', meso.id)
      .eq('week_number', currentWeek)

    return NextResponse.json({
      mesocycle: { ...meso, current_week: currentWeek },
      progressions: progressions || [],
    })
  }

  // ── exercise_progress ────────────────────────────────────────────────────────
  if (type === 'exercise_progress') {
    const exerciseId = searchParams.get('exercise_id')
    if (!exerciseId) return NextResponse.json({ error: 'Missing exercise_id' }, { status: 400 })

    // 1. Get exercise name
    const { data: exercise } = await supabase
      .from('plan_exercises')
      .select('name')
      .eq('id', exerciseId)
      .single()

    if (!exercise) return NextResponse.json({ error: 'Esercizio non trovato' }, { status: 404 })

    // 2. Collect all plan_exercise_ids with the same name across the user's plans
    //    (cross-meso history support)
    const { data: userPlans } = await supabase
      .from('workout_plans')
      .select('id')
      .eq('user_id', user.id)

    const planIds = (userPlans || []).map((p: { id: string }) => p.id)

    const { data: userDays } = await supabase
      .from('workout_plan_days')
      .select('id')
      .in('plan_id', planIds)

    const dayIds = (userDays || []).map((d: { id: string }) => d.id)

    const { data: sameNameExercises } = await supabase
      .from('plan_exercises')
      .select('id')
      .in('day_id', dayIds)
      .eq('name', exercise.name)

    const exerciseIds = (sameNameExercises || []).map((e: { id: string }) => e.id)

    // 3. All session_exercises for those IDs (RLS guarantees user scope).
    //    Pull both the legacy flat columns and the new `sets` JSONB so we
    //    can render a unified chart across history.
    const { data: sessionExercises } = await supabase
      .from('session_exercises')
      .select('weight_kg, reps_done, sets, plan_exercise_id, session:workout_sessions(date)')
      .in('plan_exercise_id', exerciseIds)

    // Keep only rows that have *some* weight data — either flat or per-set.
    const withWeight = (sessionExercises || []).filter((row) => {
      const sets = normalizeSets((row as { sets?: unknown }).sets)
      if (sets && sets.some((s) => s.weight > 0)) return true
      return (row as { weight_kg: number | null }).weight_kg != null
    })

    // Sort by session date ascending
    const sorted = withWeight.sort((a, b) => {
      const da = ((a as unknown as { session: { date: string } }).session?.date) ?? ''
      const db = ((b as unknown as { session: { date: string } }).session?.date) ?? ''
      return da.localeCompare(db)
    })

    // 4. Active meso + progressions for target line
    const { data: activeMeso } = await supabase
      .from('mesocycles')
      .select('id, start_date, duration_weeks')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const { data: progressions } = activeMeso
      ? await supabase
          .from('exercise_progressions')
          .select('week_number, target_weight_kg')
          .eq('plan_exercise_id', exerciseId)
      : { data: [] }

    const targetByWeek = new Map<number, number>()
    for (const p of (progressions || [])) {
      if (p.target_weight_kg != null) targetByWeek.set(p.week_number, p.target_weight_kg)
    }

    function getWeekForDate(dateStr: string): number | null {
      if (!activeMeso) return null
      // Both are DATE strings — count calendar days deterministically (D002).
      const days = diffCalendarDays(activeMeso.start_date, dateStr)
      if (days < 0) return null
      return Math.min(Math.floor(days / 7) + 1, activeMeso.duration_weeks)
    }

    // 5. Build chart points. For per-set rows, surface the heaviest set's
    //    weight (a working set is a better progression signal than an avg).
    const chartData = sorted.map((item) => {
      const row = item as unknown as {
        session: { date: string }
        weight_kg: number | null
        sets?: unknown
      }
      const date = row.session?.date ?? ''
      const d = new Date(date)
      const label = `${d.getDate()}/${d.getMonth() + 1}`
      const weekNum = getWeekForDate(date)
      const target = weekNum != null ? (targetByWeek.get(weekNum) ?? null) : null
      const sets = normalizeSets(row.sets)
      const actual = sets && sets.length > 0
        ? Math.max(...sets.map((s) => s.weight))
        : (row.weight_kg as number)
      return { label, date, actual, target }
    })

    return NextResponse.json({ exercise_name: exercise.name, chart_data: chartData })
  }

  // ── meso_history ─────────────────────────────────────────────────────────────
  if (type === 'meso_history') {
    const { data, error } = await supabase
      .from('mesocycles')
      .select(`
        *,
        plan:workout_plans(
          name, notes,
          days:workout_plan_days(
            day_name, day_order,
            exercises:plan_exercises(name, sets, reps, weight_kg, "order")
          )
        )
      `)
      .eq('user_id', user.id)
      .in('status', ['completed', 'archived'])
      .order('start_date', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Sort days and exercises
    const sorted = (data || []).map((meso: Record<string, unknown>) => {
      const plan = meso.plan as { days?: { day_order: number; exercises?: { order: number }[] }[] } | null
      if (plan?.days) {
        plan.days = [...plan.days].sort((a, b) => a.day_order - b.day_order)
        plan.days.forEach((day) => {
          if (day.exercises) {
            day.exercises = [...day.exercises].sort((a, b) => a.order - b.order)
          }
        })
      }
      return meso
    })

    return NextResponse.json(sorted)
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action } = body

  if (action === 'create_plan') {
    const { name, notes, days } = body

    // Deactivate existing plans
    await supabase
      .from('workout_plans')
      .update({ is_active: false })
      .eq('user_id', user.id)

    const { data: plan, error } = await supabase
      .from('workout_plans')
      .insert({ user_id: user.id, name, notes, is_active: true })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Create days and exercises
    for (const day of (days || [])) {
      const { data: planDay } = await supabase
        .from('workout_plan_days')
        .insert({ plan_id: plan.id, day_name: day.day_name, day_order: day.day_order || 0 })
        .select()
        .single()

      if (planDay && day.exercises) {
        for (const ex of day.exercises) {
          await supabase.from('plan_exercises').insert({
            day_id: planDay.id,
            name: ex.name,
            sets: ex.sets || 3,
            reps: ex.reps || '8-12',
            weight_kg: ex.weight_kg || null,
            notes: ex.notes || null,
            order: ex.order || 0,
          })
        }
      }
    }

    // Auto-create mesocycle
    // 1. Archive any currently active mesocycle
    await supabase
      .from('mesocycles')
      .update({ status: 'archived', end_date: getAppDate() })
      .eq('user_id', user.id)
      .eq('status', 'active')

    // 2. Determine meso number from total count
    const { count } = await supabase
      .from('mesocycles')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    const mesoNumber = (count ?? 0) + 1
    const now = new Date()
    const monthName = now.toLocaleDateString('it-IT', { month: 'long' }) // display label only
    const mesoName = `Meso ${mesoNumber} - ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${now.getFullYear()}`

    await supabase.from('mesocycles').insert({
      user_id: user.id,
      workout_plan_id: plan.id,
      name: mesoName,
      start_date: getAppDate(), // Europe/Rome calendar date (D002)
      duration_weeks: 6,
      status: 'active',
    })

    return NextResponse.json(plan)
  }

  if (action === 'log_session') {
    const { date, plan_day_id, overall_notes, exercises } = body

    const { data: session, error } = await supabase
      .from('workout_sessions')
      .insert({ user_id: user.id, date, plan_day_id, overall_notes })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Normalize the incoming exercises into the shape `session_exercises`
    // expects. The new client always sends `sets: [{ reps, weight }]`; the
    // offline replay queue may still send the legacy flat shape from older
    // app versions, so we accept both.
    type IncomingExercise = {
      plan_exercise_id: string | null
      sets?: SessionSet[] | null
      sets_done?: number | null
      reps_done?: string | null
      weight_kg?: number | null
      notes?: string | null
    }

    const incoming = (exercises ?? []) as IncomingExercise[]
    const rowsToInsert = incoming.map((ex) => {
      const sets = normalizeSets(ex.sets)
      return {
        session_id: session.id,
        plan_exercise_id: ex.plan_exercise_id ?? null,
        sets: sets, // null for legacy payloads — flat columns carry the data
        sets_done: ex.sets_done ?? null,
        reps_done: ex.reps_done ?? null,
        weight_kg: ex.weight_kg ?? null,
        notes: ex.notes ?? null,
      }
    })

    if (rowsToInsert.length > 0) {
      const { error: exError } = await supabase
        .from('session_exercises')
        .insert(rowsToInsert)

      if (exError) return NextResponse.json({ error: exError.message }, { status: 500 })
    }

    // ── Gamification: award EXP for the session + detect Giga Drill PRs ───
    // Non-fatal: any error here MUST NOT break the save.
    let reward: Reward | null = null
    try {
      const baseSessionExp = 100 + incoming.length * 15
      // Tonnage = Σ across exercises of computeExerciseTonnage(ex). The
      // helper picks the per-set sum when `sets` is present, otherwise
      // falls back to the legacy weight×sets×reps formula. Same helper
      // backs Giga Drill detection so the two stay in lock-step.
      const sessionTonnage = incoming.reduce(
        (acc, ex) => acc + computeExerciseTonnage(ex),
        0
      )

      reward = await awardExp(supabase, {
        userId: user.id,
        source: 'workout_session',
        sourceId: session.id,
        baseExp: baseSessionExp,
        statTagged: 'forza',
        rationale: `Sessione loggata (${incoming.length} esercizi)`,
        workoutTonnage: sessionTonnage,
      })

      // Giga Drill detection — use the level AFTER the session EXP is applied
      // so the bonus scales against the user's current station.
      const currentLevel = levelFromTotalExp(reward.new_total)
      const gigaDrills = await detectGigaDrills(
        supabase,
        user.id,
        currentLevel,
        session.id,
        incoming
      )

      for (const gd of gigaDrills) {
        const gigaReward = await awardExp(supabase, {
          userId: user.id,
          source: 'giga_drill_break',
          sourceId: session.id,
          baseExp: gd.bonus_exp,
          statTagged: 'forza',
          rationale: `Giga Drill: ${gd.exercise_name} +${(gd.improvement_pct * 100).toFixed(1)}%`,
          justGigaDrill: true,
        })
        if (reward) {
          reward.delta += gigaReward.delta
          reward.new_total = gigaReward.new_total
          reward.new_level = gigaReward.new_level
          reward.leveled_up = reward.leveled_up || gigaReward.leveled_up
          reward.giga_drill = {
            exercise_name: gd.exercise_name,
            from_tonnage: gd.from_tonnage,
            to_tonnage: gd.to_tonnage,
            improvement_pct: gd.improvement_pct,
            bonus_exp: gigaReward.delta,
          }
        }
      }
    } catch (err) {
      console.error('[gamification] log_session award failed:', err)
    }

    return NextResponse.json({
      ...session,
      success: true,
      reward,
      gamification: toGamificationPayload(reward),
    })
  }

  if (action === 'update_exercise') {
    const { id, ...updates } = body
    delete updates.action

    const { data, error } = await supabase
      .from('plan_exercises')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('session')

  if (sessionId) {
    const { error } = await supabase
      .from('workout_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Missing parameter' }, { status: 400 })
}
