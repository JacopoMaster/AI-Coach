import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getCurrentWeek(startDate: string, durationWeeks: number): number {
  const start = new Date(startDate)
  const now = new Date()
  const days = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
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
    const from = new Date()
    from.setDate(from.getDate() - days)

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
      .gte('date', from.toISOString().split('T')[0])
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
      .select(`plan_exercise_id, sets_done, reps_done, weight_kg, session:workout_sessions!inner(date, user_id)`)
      .in('plan_exercise_id', ids)
      .eq('session.user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const result: Record<string, { sets_done: string; reps_done: string; weight_kg: string }> = {}
    const latestDates: Record<string, string> = {}
    for (const row of (data as any[] || [])) {
      const exId = row.plan_exercise_id
      const sessionObj = Array.isArray(row.session) ? row.session[0] : row.session
      const date = sessionObj?.date || ''
      if (!latestDates[exId] || date > latestDates[exId]) {
        result[exId] = {
          sets_done: row.sets_done != null ? String(row.sets_done) : '',
          reps_done: row.reps_done ?? '',
          weight_kg: row.weight_kg != null ? String(row.weight_kg) : '',
        }
        latestDates[exId] = date
      }
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

    // 3. All session_exercises for those IDs (RLS guarantees user scope)
    const { data: sessionExercises } = await supabase
      .from('session_exercises')
      .select('weight_kg, reps_done, rpe, plan_exercise_id, session:workout_sessions(date)')
      .in('plan_exercise_id', exerciseIds)
      .not('weight_kg', 'is', null)

    // Sort by session date ascending
    const sorted = (sessionExercises || []).sort((a, b) => {
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
      const days = Math.floor(
        (new Date(dateStr).getTime() - new Date(activeMeso.start_date).getTime()) /
          (1000 * 60 * 60 * 24)
      )
      if (days < 0) return null
      return Math.min(Math.floor(days / 7) + 1, activeMeso.duration_weeks)
    }

    // 5. Build chart points
    const chartData = sorted.map((item) => {
      const date = ((item as unknown as { session: { date: string } }).session?.date) ?? ''
      const d = new Date(date)
      const label = `${d.getDate()}/${d.getMonth() + 1}`
      const weekNum = getWeekForDate(date)
      const target = weekNum != null ? (targetByWeek.get(weekNum) ?? null) : null
      return {
        label,
        date,
        actual: item.weight_kg as number,
        target,
        rpe: (item as { rpe?: number | null }).rpe ?? null,
      }
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
      .update({ status: 'archived', end_date: new Date().toISOString().split('T')[0] })
      .eq('user_id', user.id)
      .eq('status', 'active')

    // 2. Determine meso number from total count
    const { count } = await supabase
      .from('mesocycles')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    const mesoNumber = (count ?? 0) + 1
    const now = new Date()
    const monthName = now.toLocaleDateString('it-IT', { month: 'long' })
    const mesoName = `Meso ${mesoNumber} - ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${now.getFullYear()}`

    await supabase.from('mesocycles').insert({
      user_id: user.id,
      workout_plan_id: plan.id,
      name: mesoName,
      start_date: now.toISOString().split('T')[0],
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

    if (exercises?.length) {
      const { error: exError } = await supabase
        .from('session_exercises')
        .insert(exercises.map((ex: Record<string, unknown>) => ({ ...ex, session_id: session.id })))

      if (exError) return NextResponse.json({ error: exError.message }, { status: 500 })
    }

    return NextResponse.json(session)
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
