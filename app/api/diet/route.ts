import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { awardExp } from '@/lib/gamification/award-exp'
import type { Reward } from '@/lib/gamification/types'

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
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('diet_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data || null)
  }

  if (type === 'logs') {
    const days = parseInt(searchParams.get('days') || '30')
    const from = new Date()
    from.setDate(from.getDate() - days)

    const { data, error } = await supabase
      .from('diet_logs')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', from.toISOString().split('T')[0])
      .order('date', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
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
    const { date, calories, protein_g, carbs_g, fat_g, notes } = body
    const { data, error } = await supabase
      .from('diet_logs')
      .upsert(
        { user_id: user.id, date, calories, protein_g, carbs_g, fat_g, notes },
        { onConflict: 'user_id,date' }
      )
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // ── Gamification: award EXP for the diet log ─────────────────────────
    // Base 30 EXP, +20 bonus if protein hits 90% of the active plan target.
    // Idempotent via source_id = diet_logs.id (upsert preserves the id on
    // same-day re-log, so repeat edits on the same day don't double-pay).
    let reward: Reward | null = null
    try {
      const { data: plan } = await supabase
        .from('diet_plans')
        .select('protein_g')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()

      const proteinTarget = plan?.protein_g ?? null
      const hitProtein = proteinTarget ? (protein_g ?? 0) >= 0.9 * proteinTarget : false
      const baseExp = 30 + (hitProtein ? 20 : 0)

      reward = await awardExp(supabase, {
        userId: user.id,
        source: 'diet_log',
        sourceId: data.id,
        baseExp,
        statTagged: 'resistenza',
        rationale: hitProtein ? 'Log dieta + target proteico centrato' : 'Log dieta',
      })
    } catch (err) {
      console.error('[gamification] diet log award failed:', err)
    }

    return NextResponse.json({ ...data, reward })
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
