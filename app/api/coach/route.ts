import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { toolDefinitions, executeTool } from '@/lib/ai/tools'
import { buildSystemPrompt } from '@/lib/ai/system-prompt'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages } = await request.json()

  const systemPrompt = buildSystemPrompt(
    user.email || 'utente',
    new Date().toISOString().split('T')[0]
  )

  // Agentic loop with tool use
  let currentMessages = [...messages]

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let continueLoop = true

        while (continueLoop) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: systemPrompt,
            tools: toolDefinitions,
            messages: currentMessages,
          })

          if (response.stop_reason === 'tool_use') {
            // Process tool calls
            const toolUseBlocks = response.content.filter(
              (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
            )

            // Add assistant message with tool calls
            currentMessages.push({
              role: 'assistant',
              content: response.content,
            })

            // Execute all tools and collect results
            const toolResults: Anthropic.ToolResultBlockParam[] = []
            for (const toolUse of toolUseBlocks) {
              const result = await executeTool(
                toolUse.name,
                toolUse.input as Record<string, unknown>,
                user.id
              )
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify(result),
              })
            }

            // Add tool results
            currentMessages.push({
              role: 'user',
              content: toolResults,
            })

            // Continue the loop
            continue
          }

          // Final response - stream it
          continueLoop = false

          for (const block of response.content) {
            if (block.type === 'text') {
              // Stream text in chunks
              const chunks = block.text.split(/(?<=\s)/)
              for (const chunk of chunks) {
                if (chunk) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
                  )
                }
              }
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Errore sconosciuto'
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
        )
        controller.close()
      }
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

// GET: Load conversation history
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('ai_conversations')
    .select('messages')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json(data?.messages || [])
}

// PUT: Save conversation history
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages } = await request.json()

  await supabase
    .from('ai_conversations')
    .upsert(
      { user_id: user.id, messages, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )

  return NextResponse.json({ success: true })
}
