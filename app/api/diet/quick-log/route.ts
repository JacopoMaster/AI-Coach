import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { awardExp } from '@/lib/gamification/award-exp'
import { AI_MODELS } from '@/lib/ai/models'
import { toGamificationPayload } from '@/lib/gamification/payload'
import type { Reward } from '@/lib/gamification/types'
import { getAppDate } from '@/lib/date/app-date'

// Same per-entry budget used by /api/nutrition add_entry — quick-log writes
// to the same nutrition_entries table.
const NUTRITION_ENTRY_BASE_EXP = 10

const MacroSchema = z.object({
  name: z.string(),
  calories: z.number(),
  proteins: z.number(),
  carbs: z.number(),
  fats: z.number(),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text } = await request.json()
  if (!text?.trim()) return NextResponse.json({ error: 'Missing text' }, { status: 400 })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let macros
  try {
    const response = await client.messages.create({
      model: AI_MODELS.fast,
      max_tokens: 120,
      system:
        'Sei un assistente nutrizionale. Stima i macronutrienti da descrizioni di pasti. Rispondi SOLO con JSON valido.',
      messages: [
        {
          role: 'user',
          content: `Pasto: "${text}"\n\nRispondi SOLO con questo JSON (valori interi):\n{"name":"<nome breve del pasto>","calories":<kcal>,"proteins":<g proteine>,"carbs":<g carboidrati>,"fats":<g grassi>}`,
        },
      ],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    const match = rawText.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON found')
    macros = MacroSchema.parse(JSON.parse(match[0]))
  } catch {
    return NextResponse.json(
      { error: 'Estrazione macro fallita. Riprova con una descrizione più dettagliata.' },
      { status: 422 }
    )
  }

  // Meal belongs to the user's Europe/Rome calendar day (D002).
  const entryDate = getAppDate()

  const { data, error } = await supabase
    .from('nutrition_entries')
    .insert({
      user_id: user.id,
      date: entryDate,
      name: macros.name,
      calories: macros.calories,
      proteins: macros.proteins,
      carbs: macros.carbs,
      fats: macros.fats,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Gamification: same path as /api/nutrition add_entry, idempotent on
  //    the new nutrition_entries.id. Non-fatal.
  let reward: Reward | null = null
  try {
    reward = await awardExp(supabase, {
      userId: user.id,
      source: 'diet_log',
      sourceId: data.id,
      baseExp: NUTRITION_ENTRY_BASE_EXP,
      statTagged: 'resistenza',
      rationale: `Pasto loggato (quick): ${data.name}`,
    })
  } catch (err) {
    console.error('[gamification] diet quick-log award failed:', err)
  }

  return NextResponse.json({
    success: true,
    entry: data,
    macros,
    reward,
    gamification: toGamificationPayload(reward),
  })
}
