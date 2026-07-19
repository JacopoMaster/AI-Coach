import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { awardExp } from '@/lib/gamification/award-exp'
import { toGamificationPayload } from '@/lib/gamification/payload'
import type { Reward } from '@/lib/gamification/types'
import { getAppDate } from '@/lib/date/app-date'

// Per-entry base EXP for nutrition_entries. Derived from the established
// daily diet target of 50 EXP (legacy diet_logs: 30 base + 20 protein bonus)
// at the design budget of ~5 meals/day → 10 EXP/entry. Idempotent via the
// entry uuid in exp_history.UNIQUE(source, source_id).
const NUTRITION_ENTRY_BASE_EXP = 10

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const AddFoodSchema = z.object({
  action: z.literal('add_food'),
  name: z.string().min(1),
  calories_per_100g: z.number().min(0),
  proteins_per_100g: z.number().min(0).default(0),
  carbs_per_100g: z.number().min(0).default(0),
  fats_per_100g: z.number().min(0).default(0),
})

const AddEntrySchema = z.object({
  action: z.literal('add_entry'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  food_id: z.string().uuid().nullable(),
  grams: z.number().positive().nullable(),
  name: z.string().min(1),
  calories: z.number().min(0),
  proteins: z.number().min(0).default(0),
  carbs: z.number().min(0).default(0),
  fats: z.number().min(0).default(0),
})

const DeleteEntrySchema = z.object({
  action: z.literal('delete_entry'),
  id: z.string().uuid(),
})

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  if (type === 'entries') {
    const date = searchParams.get('date') || getAppDate()
    const { data, error } = await supabase
      .from('nutrition_entries')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', date)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (type === 'foods') {
    const q = searchParams.get('q') ?? ''
    const { data, error } = await supabase
      .from('foods')
      .select('*')
      .eq('user_id', user.id)
      .ilike('name', `%${q}%`)
      .order('name')
      .limit(20)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  if (body.action === 'add_food') {
    const parsed = AddFoodSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { action: _, ...fields } = parsed.data
    const { data, error } = await supabase
      .from('foods')
      .insert({ user_id: user.id, ...fields })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (body.action === 'add_entry') {
    const parsed = AddEntrySchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { action: _, ...fields } = parsed.data
    const { data, error } = await supabase
      .from('nutrition_entries')
      .insert({ user_id: user.id, ...fields })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // ── Gamification: per-entry EXP via the unified engine ───────────────
    // Non-fatal: any failure here MUST NOT break the save.
    let reward: Reward | null = null
    try {
      reward = await awardExp(supabase, {
        userId: user.id,
        source: 'diet_log',
        sourceId: data.id,
        baseExp: NUTRITION_ENTRY_BASE_EXP,
        statTagged: 'resistenza',
        rationale: `Pasto loggato: ${data.name}`,
      })
    } catch (err) {
      console.error('[gamification] nutrition add_entry award failed:', err)
    }

    return NextResponse.json({
      ...data,
      success: true,
      reward,
      gamification: toGamificationPayload(reward),
    })
  }

  if (body.action === 'delete_entry') {
    const parsed = DeleteEntrySchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { error } = await supabase
      .from('nutrition_entries')
      .delete()
      .eq('id', parsed.data.id)
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
