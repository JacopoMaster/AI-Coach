// deno-lint-ignore-file no-explicit-any
/**
 * Pre-Workout Motivation — Haiku prompt builder.
 *
 * Fires at 17:00 Europe/Rome to hype the user RIGHT BEFORE their 17:00/18:00
 * training slot. Generates a single push-notification line in Italian that
 * quotes an anime or JRPG character from the user's approved roster, adapts
 * the tone to comedy vs. serious source material, and varies language based
 * on training vs. rest day.
 *
 * Output is hard-capped at 120 characters — Web Push tiles on iOS/Android
 * truncate anything longer in the notification shade.
 */

const HAIKU_MODEL = 'claude-haiku-4-5'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MAX_CHARS = 120

export type DayType = 'training' | 'rest'

export interface MotivationContext {
  dayType: DayType
  // ISO weekday name in Italian — helps Haiku vary tone across the week.
  weekday: string
}

// System prompt. Kept tight: the model pays per input token × users × 365.
const SYSTEM_PROMPT = `Sei il coach fitness personale dell'utente. Genera UN singolo messaggio di notifica push in italiano, MASSIMO 120 caratteri (spazi e punteggiatura inclusi).

CONTESTO TEMPORALE:
Siamo alle 17:00. La giornata lavorativa sta finendo e tra poco (17:00/18:00) l'utente si allena. Il messaggio è un PRE-WORKOUT: deve trasformare la stanchezza di fine giornata in hype per la palestra. NON parlare di mattina o risveglio.

ROSTER AUTORIZZATO — cita UN personaggio / opera da questa lista, nient'altro:
- Anime epici/serious: One Piece, Dragon Ball, Naruto, Bleach, JoJo, L'Attacco dei Giganti, My Hero Academia, Hunter x Hunter, Gurren Lagann, Gundam, Eureka Seven, Evangelion, Re:Zero, Code Geass, Mirai Nikki.
- Anime comedy/romance (tono PIÙ IRONICO, irriverente, ma sempre spingi verso la palestra): Gintama, Konosuba, Lovely Complex, Toradora.
- JRPG: Final Fantasy, Persona, Kingdom Hearts, Nier, Dragon Quest, Zelda, Yakuza, Professor Layton.

TERMINOLOGIA DA SFRUTTARE sui JRPG (usala quando cali il riferimento giusto):
- Yakuza → "Heat Action", "modalità Dragon of Dojima"
- Persona → "Confidant", "All-Out Attack", "show your resolve"
- Final Fantasy / Dragon Quest / Zelda → "Level Up", "LIMIT BREAK", "ultima dungeon"
- Kingdom Hearts → "Keyblade", "il cuore guida la forza"
- Nier → "androidi non mollano", glitch/dati
- Professor Layton → "ogni puzzle ha una soluzione"

REGOLE ASSOLUTE:
- Varia il personaggio/opera ogni volta: sorprendi l'utente, non ripetere sempre Luffy o Cloud.
- Tono: epico ma non cringe. Per le opere comedy permetti ironia/slapstick ma chiudi sempre con la chiamata all'azione.
- Usa "tu". Niente emoji. Niente virgolette doppie. Niente preamboli tipo "Ecco:".
- Rispondi con SOLO il testo del messaggio.

Esempi:
- (training, Gurren Lagann) La giornata ti ha spremuto? Kamina direbbe: trapana il tuo limite. Alle 18:00 si buca il cielo.
- (training, Yakuza) Timbra il cartellino e attiva la Heat Action: Kiryu non salta un allenamento, neanche tu.
- (training, Konosuba) Aqua piange, Megumin esplode, tu vai in palestra. Il party ti aspetta, muoviti.
- (rest, Persona) Oggi niente dungeon: è una serata Confidant. Recupero, cena pulita, domani All-Out Attack.
- (rest, Evangelion) Shinji sale sull'Eva domani. Stasera riposa il corpo: il recupero è parte della missione.`

function buildUserPrompt(ctx: MotivationContext): string {
  if (ctx.dayType === 'training') {
    return `Oggi è ${ctx.weekday}, sono le 17:00 e la giornata lavorativa sta finendo. Tra poco si allena. Genera un messaggio PRE-WORKOUT che attivi l'utente.`
  }
  return `Oggi è ${ctx.weekday}, sono le 17:00: giornata di RIPOSO. Genera un messaggio sulla disciplina del recupero serale prima di tornare a spingere domani.`
}

// Hand-written fallbacks. Used when Anthropic is unreachable — the push still
// goes out because the daily habit is more valuable than a perfect quote.
// Tutti riformulati in chiave pre-workout/tardo pomeriggio.
const TRAINING_FALLBACKS = [
  'Kamina direbbe: trapana il tuo limite. Giornata finita, alle 18:00 si buca il cielo.',
  'Kiryu non salta un allenamento: timbra il cartellino e attiva la Heat Action.',
  'Goku sente il ki salire. Prepara la borsa: fra poco Super Saiyan in palestra.',
  'Joker: show your resolve. Stacca dal lavoro, è ora del tuo All-Out Attack.',
  'Konosuba insegna: il party ti aspetta. Smetti di procrastinare, si va in palestra.',
]

const REST_FALLBACKS = [
  'Guts ripone la Dragonslayer stasera. Recupero attivo, domani si torna a spingere.',
  'Serata Confidant: cena pulita, idratati, dormi. Il prossimo dungeon è domani.',
  'Shinji scende dall\'Eva: stasera riposo. Il recupero è parte della missione.',
  'Link ricarica i cuori alla locanda. Fai lo stesso: rest day pieno, non vuoto.',
  'Layton direbbe: ogni puzzle ha la sua pausa. Oggi recupero, domani Level Up.',
]

function pickFallback(dayType: DayType): string {
  const pool = dayType === 'training' ? TRAINING_FALLBACKS : REST_FALLBACKS
  return pool[Math.floor(Math.random() * pool.length)]
}

export async function generateMotivation(ctx: MotivationContext): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return pickFallback(ctx.dayType)

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
        max_tokens: 120, // ~90-110 chars of Italian including accents
        temperature: 0.9, // Higher than evening report — we WANT variety
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(ctx) }],
      }),
    })

    if (!res.ok) return pickFallback(ctx.dayType)

    const data = await res.json()
    const text: string = data?.content?.[0]?.text?.trim() ?? ''
    if (!text) return pickFallback(ctx.dayType)

    // Strip any stray quotes/guillemets the model sometimes adds around the line.
    const cleaned = text.replace(/^["'«»]+|["'«»]+$/g, '').trim()
    if (cleaned.length <= MAX_CHARS) return cleaned

    // Truncate at the last whole word to avoid cutting mid-name ("Luf…").
    const truncated = cleaned.slice(0, MAX_CHARS)
    const lastSpace = truncated.lastIndexOf(' ')
    return (lastSpace > 80 ? truncated.slice(0, lastSpace) : truncated).trimEnd()
  } catch {
    return pickFallback(ctx.dayType)
  }
}
