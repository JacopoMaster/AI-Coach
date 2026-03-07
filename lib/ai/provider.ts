/**
 * Model-Agnostic AI Provider Abstraction
 *
 * Pattern: Adapter — each concrete class adapts a specific SDK/API to the
 * shared AIProvider interface. The factory `getAIProvider()` reads
 * `process.env.AI_PROVIDER` and returns the correct instance.
 *
 * Supported providers:
 *   'anthropic'          → AnthropicProvider  (default)
 *   'openai_compatible'  → OpenAICompatibleProvider (OpenRouter, Groq, Ollama…)
 */

import Anthropic from '@anthropic-ai/sdk'
import { ZodSchema } from 'zod'

// ─── Shared constants ─────────────────────────────────────────────────────────

const MAX_RETRIES = 3

function retryNote(attempt: number, lastError: string): string {
  return attempt > 0
    ? `\n\nNota: il tentativo ${attempt} ha prodotto output non valido (${lastError}). Correggi e rispondi SOLO con JSON valido.`
    : ''
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface AIProvider {
  /**
   * Generate and validate structured JSON output from a text prompt.
   * Retries up to MAX_RETRIES times, feeding the Zod error back as a hint.
   */
  generateStructuredOutput<T>(
    prompt: string,
    systemPrompt: string,
    schema: ZodSchema<T>,
    maxTokens?: number
  ): Promise<T>

  /**
   * Extract and validate structured JSON from an image (base64-encoded).
   * Retries up to MAX_RETRIES times on parse failure.
   */
  analyzeImage<T>(
    imageBase64: string,
    mimeType: string,
    prompt: string,
    schema: ZodSchema<T>
  ): Promise<T>
}

// ─── Anthropic Provider ───────────────────────────────────────────────────────

export class AnthropicProvider implements AIProvider {
  private client: Anthropic

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  async generateStructuredOutput<T>(
    prompt: string,
    systemPrompt: string,
    schema: ZodSchema<T>,
    maxTokens = 3000
  ): Promise<T> {
    let lastError = ''

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const response = await this.client.messages.create({
        model: process.env.ANTHROPIC_TEXT_MODEL || 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [
          { role: 'user', content: prompt + retryNote(attempt, lastError) },
          { role: 'assistant', content: '{' }, // prefill — forces JSON-only output
        ],
      })

      try {
        const rawText = '{' + (response.content[0] as Anthropic.TextBlock).text
        return schema.parse(JSON.parse(rawText))
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Errore sconosciuto'
      }
    }

    throw new Error(`Analisi fallita dopo ${MAX_RETRIES} tentativi: ${lastError}`)
  }

  async analyzeImage<T>(
    imageBase64: string,
    mimeType: string,
    prompt: string,
    schema: ZodSchema<T>
  ): Promise<T> {
    type AnthropicMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
    let lastError = ''

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const userText =
        attempt > 0
          ? `${prompt}\n\nNota: il tentativo precedente ha prodotto JSON non valido (${lastError}). Correggi e rispondi SOLO con JSON.`
          : prompt

      const response = await this.client.messages.create({
        model: process.env.ANTHROPIC_VISION_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType as AnthropicMediaType,
                  data: imageBase64,
                },
              },
              { type: 'text', text: userText },
            ],
          },
          { role: 'assistant', content: '{' }, // prefill — forces JSON-only output
        ],
      })

      try {
        const rawText = '{' + (response.content[0] as Anthropic.TextBlock).text
        return schema.parse(JSON.parse(rawText))
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Errore sconosciuto'
      }
    }

    throw new Error(
      `Estrazione immagine fallita dopo ${MAX_RETRIES} tentativi: ${lastError}`
    )
  }
}

// ─── OpenAI-Compatible Provider ───────────────────────────────────────────────
// Works with OpenRouter (https://openrouter.ai/api/v1),
// Groq (https://api.groq.com/openai/v1),
// and Ollama (http://localhost:11434/v1).

interface OAIUserContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

interface OAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | OAIUserContentPart[]
}

interface OAIResponse {
  choices: Array<{ message: { content: string } }>
  error?: { message: string }
}

export class OpenAICompatibleProvider implements AIProvider {
  private baseUrl: string
  private apiKey: string
  private textModel: string
  private visionModel: string

  constructor() {
    this.baseUrl = (
      process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    ).replace(/\/$/, '')
    this.apiKey = process.env.OPENAI_API_KEY || ''
    this.textModel = process.env.OPENAI_TEXT_MODEL || 'gpt-4o'
    this.visionModel = process.env.OPENAI_VISION_MODEL || 'gpt-4o'
  }

  private async callCompletion(
    model: string,
    messages: OAIMessage[],
    maxTokens: number,
    forceJson: boolean
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages,
    }

    // response_format json_object is supported by OpenAI, OpenRouter, and most
    // OpenAI-compatible backends. For Ollama models that don't support it the
    // prompt already instructs JSON-only output, so the Zod parse will fail and
    // the retry loop will feed the error back as a correction hint.
    if (forceJson) {
      body.response_format = { type: 'json_object' }
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    const data: OAIResponse = await res.json()

    if (!res.ok || data.error) {
      throw new Error(
        data.error?.message ?? `API error ${res.status}`
      )
    }

    return data.choices[0].message.content
  }

  async generateStructuredOutput<T>(
    prompt: string,
    systemPrompt: string,
    schema: ZodSchema<T>,
    maxTokens = 3000
  ): Promise<T> {
    let lastError = ''

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const messages: OAIMessage[] = []
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
      messages.push({ role: 'user', content: prompt + retryNote(attempt, lastError) })

      try {
        const content = await this.callCompletion(
          this.textModel,
          messages,
          maxTokens,
          true
        )
        return schema.parse(JSON.parse(content))
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Errore sconosciuto'
      }
    }

    throw new Error(`Analisi fallita dopo ${MAX_RETRIES} tentativi: ${lastError}`)
  }

  async analyzeImage<T>(
    imageBase64: string,
    mimeType: string,
    prompt: string,
    schema: ZodSchema<T>
  ): Promise<T> {
    let lastError = ''

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const userText =
        attempt > 0
          ? `${prompt}\n\nNota: il tentativo precedente ha prodotto JSON non valido (${lastError}). Correggi e rispondi SOLO con JSON.`
          : prompt

      const messages: OAIMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
            { type: 'text', text: userText },
          ],
        },
      ]

      try {
        const content = await this.callCompletion(
          this.visionModel,
          messages,
          1024,
          true
        )
        return schema.parse(JSON.parse(content))
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Errore sconosciuto'
      }
    }

    throw new Error(
      `Estrazione immagine fallita dopo ${MAX_RETRIES} tentativi: ${lastError}`
    )
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────
// Module-level singleton — one instance per Next.js worker process.

let _provider: AIProvider | null = null

export function getAIProvider(): AIProvider {
  if (_provider) return _provider

  const providerName = process.env.AI_PROVIDER || 'anthropic'
  _provider =
    providerName === 'openai_compatible'
      ? new OpenAICompatibleProvider()
      : new AnthropicProvider()

  return _provider
}
