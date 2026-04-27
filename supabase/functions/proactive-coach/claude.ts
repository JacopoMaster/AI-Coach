// deno-lint-ignore-file no-explicit-any
import type { Anomaly } from './anomalies.ts'

const HAIKU_MODEL = 'claude-haiku-4-5'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MAX_CHARS = 100

// Italian system prompt — the user-facing app is entirely in Italian.
const SYSTEM_PROMPT = `Sei il coach fitness personale dell'utente. Scrivi un singolo messaggio di notifica push in italiano, MASSIMO 100 caratteri (incluso spazi e punteggiatura). Tono caldo, diretto, motivante, MAI giudicante. Nessun emoji. Nessuna virgolette. Usa "tu". Rispondi con SOLO il testo del messaggio, niente preamboli.`

/**
 * Build a short user-turn that describes the anomaly. We keep the prompt tiny
 * to stay well under Haiku's 200k window — every run costs $0.00025/1k input
 * and we have dozens of users × 365 days. Compact = cheap.
 */
function buildUserPrompt(anomaly: Anomaly): string {
  const ctx = JSON.stringify(anomaly.context)
  switch (anomaly.type) {
    case 'pending_checkin':
      return `L'utente ha un check-in settimanale in sospeso da ${
        (anomaly.context.days_pending as number) ?? 1
      } giorni. Invitalo a rivederlo. Contesto: ${ctx}`
    case 'missed_workout':
      return `L'utente non si allena da ${
        (anomaly.context.days_since_last as number) ?? 'diversi'
      } giorni. Incoraggialo a tornare in palestra. Contesto: ${ctx}`
    case 'calorie_deviation': {
      const dir = anomaly.context.direction === 'over' ? 'sopra' : 'sotto'
      return `Le calorie ultime 48h sono ${anomaly.context.deviation_pct}% ${dir} il target. Messaggio di richiamo gentile. Contesto: ${ctx}`
    }
    case 'inactive_streak':
      return `L'utente non apre l'app da ${anomaly.context.days_inactive} giorni. Messaggio di re-engagement. Contesto: ${ctx}`
  }
}

// Hand-written fallbacks used when the Anthropic call fails (rate limit,
// outage, bad JSON). The push still goes out — the proactive loop is more
// valuable than the message being LLM-polished.
const FALLBACKS: Record<Anomaly['type'], string> = {
  pending_checkin: 'Hai un check-in in sospeso: aggiornalo quando puoi.',
  missed_workout: 'Non molliamo: anche una sessione breve fa la differenza.',
  calorie_deviation: 'Occhio alle calorie di oggi: riequilibra se puoi.',
  inactive_streak: 'Rieccoti! Bastano 10 minuti per rimetterti in pista.',
}

export async function generateMessage(anomaly: Anomaly): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return FALLBACKS[anomaly.type]

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 80, // ~60 tokens of Italian = ~90-100 chars
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(anomaly) }],
      }),
    })

    if (!res.ok) return FALLBACKS[anomaly.type]

    const data = await res.json()
    const text: string = data?.content?.[0]?.text?.trim() ?? ''
    if (!text) return FALLBACKS[anomaly.type]

    // Enforce the length cap server-side — Haiku occasionally ignores it.
    // Truncate at the last whole word so we don't publish "Occhio a"
    const cleaned = text.replace(/^["'«»]|["'«»]$/g, '').trim()
    if (cleaned.length <= MAX_CHARS) return cleaned
    const truncated = cleaned.slice(0, MAX_CHARS)
    const lastSpace = truncated.lastIndexOf(' ')
    return (lastSpace > 60 ? truncated.slice(0, lastSpace) : truncated).trimEnd()
  } catch {
    return FALLBACKS[anomaly.type]
  }
}
