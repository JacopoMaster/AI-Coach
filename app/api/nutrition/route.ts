import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

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
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
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
    return NextResponse.json(data)
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
