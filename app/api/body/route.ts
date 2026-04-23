import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { awardExp } from '@/lib/gamification/award-exp'
import type { Reward } from '@/lib/gamification/types'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') || '30')

  const from = new Date()
  from.setDate(from.getDate() - days)

  const { data, error } = await supabase
    .from('body_measurements')
    .select('*')
    .eq('user_id', user.id)
    .gte('date', from.toISOString().split('T')[0])
    .order('date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Handle bulk insert (CSV import) — no EXP award here (historical backfill bypass).
  if (Array.isArray(body)) {
    const records = body.map((r) => ({ ...r, user_id: user.id }))
    const { data, error } = await supabase
      .from('body_measurements')
      .upsert(records, { onConflict: 'user_id,date' })
      .select()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabase
    .from('body_measurements')
    .upsert({ ...body, user_id: user.id }, { onConflict: 'user_id,date' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Gamification: award EXP for single-measurement upsert ──────────────
  // Idempotent via source_id = body_measurements.id. Upsert on (user_id,date)
  // keeps the id stable on same-day re-weigh → no double-pay.
  let reward: Reward | null = null
  try {
    const hasWeight = typeof data.weight_kg === 'number' && data.weight_kg > 0
    const source = hasWeight ? 'weight_log' : 'body_measurement'
    const baseExp = hasWeight ? 25 : 15
    reward = await awardExp(supabase, {
      userId: user.id,
      source,
      sourceId: data.id,
      baseExp,
      statTagged: 'agilita',
      rationale: hasWeight ? 'Peso registrato' : 'Misurazione corporea',
    })
  } catch (err) {
    console.error('[gamification] body measurement award failed:', err)
  }

  return NextResponse.json({ ...data, reward })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase
    .from('body_measurements')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
