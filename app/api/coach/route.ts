import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { executeTool } from '@/lib/ai/tools'
import { buildSystemPrompt } from '@/lib/ai/system-prompt'
import { getAIProvider } from '@/lib/ai/provider'

// ─── Response schema ───────────────────────────────────────────────────────────
// The LLM returns a free-text reply AND optionally declares write actions.
// We execute those actions server-side after parsing — no provider-native tool-use
// API required, so this works with Anthropic, Ollama, OpenRouter, Groq, etc.

const CoachResponseSchema = z.object({
  reply: z.string(),
  actions: z
    .array(
      z.object({
        tool: z.enum([
          'update_workout_plan',
          'update_diet_plan',
          'add_session_note',
          'run_weekly_checkin',
        ]),
        params: z.record(z.string(), z.unknown()),
      })
    )
    .optional(),
})

type CoachResponse = z.infer<typeof CoachResponseSchema>

// ─── Context helpers ───────────────────────────────────────────────────────────

async function fetchUserContext(userId: string): Promise<string> {
  const [bodyMetrics, workoutPlan, workoutHistory, dietPlan, dietLogs] =
    await Promise.all([
      executeTool('get_body_metrics', { days: 30 }, userId),
      executeTool('get_workout_plan', {}, userId),
      executeTool('get_workout_history', { days: 30 }, userId),
      executeTool('get_diet_plan', {}, userId),
      executeTool('get_diet_logs', { days: 7 }, userId),
    ])

  return `=== DATI UTENTE ===

MISURAZIONI CORPOREE (ultimi 30 giorni):
${JSON.stringify(bodyMetrics, null, 2)}

SCHEDA DI ALLENAMENTO ATTIVA:
${JSON.stringify(workoutPlan, null, 2)}

STORICO ALLENAMENTI (ultimi 30 giorni):
${JSON.stringify(workoutHistory, null, 2)}

PIANO ALIMENTARE:
${JSON.stringify(dietPlan, null, 2)}

LOG DIETA (ultimi 7 giorni):
${JSON.stringify(dietLogs, null, 2)}`
}

function buildConversationText(
  messages: Array<{ role: string; content: string | unknown[] }>
): string {
  return messages
    .map((m) => {
      const role = m.role === 'user' ? 'UTENTE' : 'COACH'
      const content =
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      return `${role}: ${content}`
    })
    .join('\n\n')
}

// ─── POST: Chat ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages } = await request.json()

  // Split history from the latest user message
  const history = messages.slice(0, -1)
  const latestMessage = messages[messages.length - 1]
  const userInput =
    typeof latestMessage?.content === 'string'
      ? latestMessage.content
      : JSON.stringify(latestMessage?.content ?? '')

  // Pre-fetch all read-only context in parallel (replaces the agentic read-tool loop)
  const userContext = await fetchUserContext(user.id)

  const conversationBlock =
    history.length > 0
      ? `\n=== STORICO CONVERSAZIONE ===\n${buildConversationText(history)}\n`
      : ''

  const prompt = `${userContext}
${conversationBlock}
=== ISTRUZIONI ===
Rispondi al messaggio dell'utente. Se devi modificare dati (scheda, dieta, note, check-in), inserisci le azioni nell'array "actions".

AZIONI DISPONIBILI (ometti "actions" se non modifichi nulla):
- update_workout_plan  → params: { action: "update_exercise", exercise_id, updates: {sets?,reps?,weight_kg?,notes?} }
                       → params: { action: "create_plan", plan: {name,notes?,days:[{day_name,exercises:[{name,sets,reps,weight_kg?,order?}]}]} }
- update_diet_plan     → params: { calories?,protein_g?,carbs_g?,fat_g?,notes? }
- add_session_note     → params: { exercise_id, note }
- run_weekly_checkin   → params: { week_number, confirm_apply }

MESSAGGIO UTENTE: ${userInput}

Rispondi ESCLUSIVAMENTE con JSON valido:
{
  "reply": "<risposta in italiano, puoi usare markdown>",
  "actions": [{ "tool": "<nome>", "params": { ... } }]
}`

  // ── Call AI via abstract interface — zero provider-specific code ──────────────
  let coachResponse: CoachResponse
  try {
    coachResponse = await getAIProvider().generateStructuredOutput(
      prompt,
      buildSystemPrompt(user.email || 'utente', new Date().toISOString().split('T')[0]),
      CoachResponseSchema,
      4096
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Errore sconosciuto'
    const encoder = new TextEncoder()
    const errStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
        )
        controller.close()
      },
    })
    return new Response(errStream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  // ── Execute write actions declared by the LLM ─────────────────────────────────
  if (coachResponse.actions && coachResponse.actions.length > 0) {
    for (const action of coachResponse.actions) {
      await executeTool(
        action.tool,
        action.params as Record<string, unknown>,
        user.id
      )
    }
  }

  // ── Stream reply via SSE (word-by-word for chat-interface compatibility) ───────
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const words = coachResponse.reply.split(/(?<=\s)/)
      for (const word of words) {
        if (word) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: word })}\n\n`)
          )
        }
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// ─── GET: Load conversation history ───────────────────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('ai_conversations')
    .select('messages')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json(data?.messages || [])
}

// ─── PUT: Save conversation history ───────────────────────────────────────────

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages } = await request.json()

  await supabase.from('ai_conversations').upsert(
    { user_id: user.id, messages, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )

  return NextResponse.json({ success: true })
}
