import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getDailyNutritionTotals } from '@/lib/diet/daily-totals'
import { getAppDate, getAppDateDaysAgo } from '@/lib/date/app-date'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'today'

  if (type === 'plan') {
    const { data, error } = await supabase
      .from('diet_plans')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data || null)
  }

  if (type === 'today') {
    // Source of truth: nutrition_entries, aggregated to a single day (D001/D011).
    // "Today" is the Europe/Rome calendar date (D002), not the UTC date.
    // A DB error propagates from the helper and is surfaced as 500 (not masked as
    // "no meals"); a genuinely empty day yields null.
    const today = getAppDate()
    try {
      const totals = await getDailyNutritionTotals(supabase, user.id, today, today)
      return NextResponse.json(totals[0] || null)
    } catch {
      // DB error propagates here (never masked as empty diet) → generic 500.
      // Internal/Supabase details are intentionally NOT exposed to the client.
      return NextResponse.json({ error: 'Errore lettura dieta' }, { status: 500 })
    }
  }

  if (type === 'logs') {
    // Per-day totals aggregated from nutrition_entries (D001/D011). Same shape
    // as before (date, calories, protein_g, carbs_g, fat_g) plus entries_count.
    // Range lower bound is N days before today-in-Rome (D002).
    // A DB error is surfaced as 500; an empty range yields [].
    const days = parseInt(searchParams.get('days') || '30')

    try {
      const totals = await getDailyNutritionTotals(
        supabase,
        user.id,
        getAppDateDaysAgo(days)
      )
      return NextResponse.json(totals)
    } catch {
      // DB error propagates here (never masked as empty diet) → generic 500.
      // Internal/Supabase details are intentionally NOT exposed to the client.
      return NextResponse.json({ error: 'Errore lettura dieta' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action } = body

  if (action === 'log') {
    // DEPRECATED & DISABLED (D001/D011). The legacy daily-aggregate writer into
    // `diet_logs` is retired: `diet_logs` is empty in production and no longer a
    // source of truth. Meals are written per-entry to `nutrition_entries` via
    // /api/nutrition (add_entry, NutritionTracker) and /api/diet/quick-log.
    //
    // The legacy payload ({date, calories, protein_g, carbs_g, fat_g, notes}) is a
    // per-DAY aggregate and is NOT semantically equivalent to a per-MEAL
    // nutrition_entries row (proteins/carbs/fats, name, optional food/grams), so
    // it is intentionally NOT auto-redirected. This action has no active caller.
    //
    // Preserved (D011): the `diet_logs` table, its migration, and the /api/diet
    // route itself all remain — only this write action is disabled.
    // 410 Gone: the action existed and is now permanently unavailable.
    return NextResponse.json(
      {
        error: 'deprecated',
        message:
          "L'azione 'log' di /api/diet è deprecata e disattivata. Registra i pasti su nutrition_entries via /api/nutrition (add_entry) o /api/diet/quick-log.",
      },
      { status: 410 }
    )
  }

  if (action === 'save_plan') {
    const { name, calories, protein_g, carbs_g, fat_g, notes } = body

    // Deactivate existing plans
    await supabase
      .from('diet_plans')
      .update({ is_active: false })
      .eq('user_id', user.id)

    const { data, error } = await supabase
      .from('diet_plans')
      .insert({ user_id: user.id, name, calories, protein_g, carbs_g, fat_g, notes, is_active: true })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'update_plan') {
    const { id, calories, protein_g, carbs_g, fat_g, notes } = body
    const { data, error } = await supabase
      .from('diet_plans')
      .update({ calories, protein_g, carbs_g, fat_g, notes })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
