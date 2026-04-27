// GET /api/cron/proactive-coach
//
// Daily Vercel Cron — replaces the Supabase pg_cron + Edge Function pair from
// migrations 004/005, which we found unreliable (silent run skips, no logs).
// Vercel Cron hits this route, we authenticate it via a shared secret, then
// fan out per-user push notifications based on the user's training schedule.
//
// SCHEDULE (Kamina logic — Italy time):
//   Sat / Sun  → no-op (rest)
//   Mon/Wed/Fri → "training day" push if the user hasn't logged today
//   Tue / Thu  → "you skipped yesterday, recover today" push if no session
//                yesterday; otherwise skip (rest day earned)
//
// AUTH:
//   Vercel Cron automatically sets `Authorization: Bearer <CRON_SECRET>` when
//   the `CRON_SECRET` env var is defined on the project. We reject any other
//   caller. (Vercel Cron also restricts inbound requests to its own IP range
//   in production — the secret is the second layer.)

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import webpush, { type PushSubscription, type WebPushError } from 'web-push'
import { z } from 'zod'
import { getAIProvider } from '@/lib/ai/provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── Tipi locali ────────────────────────────────────────────────────────────

interface PushSubRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

interface PreferencesRow {
  user_id: string
  evening_reports_enabled: boolean
  summer_episode_active: boolean
}

type AnomalyType = 'missed_workout' | 'morning_motivation'

interface CoachDecision {
  userId: string
  anomalyType: AnomalyType
  payload: {
    title: string
    body: string
    url: string
    tag: string
    icon: string
    badge: string
  }
}

// ─── Configurazione ─────────────────────────────────────────────────────────

const ICONS = {
  icon: '/icons/icon-192.png',
  badge: '/icons/badge-72.png',
}

// Testi statici di fallback — usati solo se la chiamata Haiku fallisce.
// Il `tag` e `url` restano stabili: servono al Service Worker per dedup e routing.
const FALLBACK_TRAINING_DAY = {
  title: 'È giorno di allenamento!',
  body: 'Hai chiuso la giornata, ora muoviti: scendi in palestra.',
  tag: 'coach-training-day',
  url: '/workouts',
}

const FALLBACK_MISSED = {
  title: 'Ieri hai saltato l’allenamento!',
  body: 'Niente scuse: recuperiamo stasera, prima che la giornata finisca.',
  tag: 'coach-missed-yesterday',
  url: '/workouts',
}

// ─── Generazione dinamica dei testi via AI (Haiku) ──────────────────────────
// "Multiverse Coach": il personaggio viene scelto in TypeScript con un sorteggio
// uniforme dal roster, poi iniettato nel system prompt come ruolo imperativo.
// Spostiamo la random fuori dall'LLM perché Haiku, lasciato libero, tende a
// pescare sempre i protagonisti più rappresentati nei dati di pre-training.

const HAIKU_MODEL = 'claude-haiku-4-5'

// Roster fisso. La proporzione tra opere determina la frequenza di apparizione:
// se vuoi spingere un'opera, aggiungi più personaggi per quella serie.
const COACH_ROSTER: readonly string[] = [
  // One Piece
  'Monkey D. Rufy (One Piece)',
  'Roronoa Zoro (One Piece)',
  'Sanji (One Piece)',
  // Dragon Ball
  'Son Goku (Dragon Ball)',
  'Vegeta (Dragon Ball)',
  'Piccolo (Dragon Ball)',
  // Naruto
  'Naruto Uzumaki (Naruto)',
  'Kakashi Hatake (Naruto)',
  'Might Guy (Naruto)',
  // Bleach
  'Ichigo Kurosaki (Bleach)',
  'Kenpachi Zaraki (Bleach)',
  // JoJo
  'Jotaro Kujo (JoJo)',
  'Joseph Joestar (JoJo)',
  // L'Attacco dei Giganti
  'Levi Ackerman (L\'Attacco dei Giganti)',
  'Eren Yeager (L\'Attacco dei Giganti)',
  // My Hero Academia
  'All Might (My Hero Academia)',
  'Katsuki Bakugo (My Hero Academia)',
  // Hunter x Hunter
  'Gon Freecss (Hunter x Hunter)',
  'Hisoka (Hunter x Hunter)',
  // Gurren Lagann
  'Kamina (Gurren Lagann)',
  'Simon (Gurren Lagann)',
  // Gundam
  'Char Aznable (Gundam)',
  'Amuro Ray (Gundam)',
  // Eureka Seven
  'Holland Novak (Eureka Seven)',
  // Evangelion
  'Asuka Langley (Evangelion)',
  'Misato Katsuragi (Evangelion)',
  // Re:Zero
  'Subaru Natsuki (Re:Zero)',
  'Rem (Re:Zero)',
  // Gintama
  'Sakata Gintoki (Gintama)',
  'Toshiro Hijikata (Gintama)',
  // Konosuba
  'Aqua (Konosuba)',
  'Megumin (Konosuba)',
  'Kazuma Sato (Konosuba)',
  // Lovely Complex
  'Risa Koizumi (Lovely Complex)',
  // Toradora
  'Taiga Aisaka (Toradora)',
  // Code Geass
  'Lelouch vi Britannia (Code Geass)',
  'Suzaku Kururugi (Code Geass)',
  // Mirai Nikki
  'Yuno Gasai (Mirai Nikki)',
  // Final Fantasy
  'Cloud Strife (Final Fantasy VII)',
  'Sephiroth (Final Fantasy VII)',
  'Tidus (Final Fantasy X)',
  // Persona
  'Joker (Persona 5)',
  'Makoto Yuki (Persona 3)',
  // Kingdom Hearts
  'Sora (Kingdom Hearts)',
  'Riku (Kingdom Hearts)',
  // Nier
  '2B (Nier Automata)',
  '9S (Nier Automata)',
  // Dragon Quest
  'Erdrick (Dragon Quest)',
  // Zelda
  'Link (The Legend of Zelda)',
  'Ganondorf (The Legend of Zelda)',
  // Yakuza
  'Kazuma Kiryu (Yakuza)',
  'Goro Majima (Yakuza)',
  'Ichiban Kasuga (Yakuza: Like a Dragon)',
  // Professor Layton
  'Professor Layton (Professor Layton)',
]

function pickRandomCharacter(): string {
  return COACH_ROSTER[Math.floor(Math.random() * COACH_ROSTER.length)]
}

const CoachPayloadSchema = z.object({
  // L'AI deve riecheggiare ESATTAMENTE il character ricevuto in input.
  // Lo usiamo per validare che Haiku abbia rispettato il ruolo assegnato; per
  // i log, però, la fonte di verità resta il valore scelto in TypeScript.
  character: z
    .string()
    .min(1)
    .max(80)
    .describe(
      "Riepiloga lo stesso identico nome del personaggio passato nel system prompt, formato 'Nome Cognome (Opera)'."
    ),
  title: z.string().min(1).max(60),
  body: z.string().min(1).max(120),
})

function buildCoachSystemPrompt(selectedCharacter: string): string {
  return `Sei il "Multiverse Coach". Parli italiano.

Il tuo ruolo: sei ${selectedCharacter}. Scrivi il messaggio assumendo rigorosamente la sua identità, i suoi modi di dire, le sue iconiche frasi e la sua attitudine. Non interpretare nessun altro personaggio.

CONTESTO TEMPORALE: la notifica arriva tra le 17:00 e le 18:00. La giornata di lavoro/studio sta finendo, è il momento di scendere in palestra.

TONO PER CATEGORIA (adatta in base all'opera del tuo personaggio):
- Shonen / Epic (One Piece, Dragon Ball, Naruto, Bleach, MHA, HxH, Gurren Lagann, AoT, JoJo): superamento dei limiti, risvegli e trasformazioni (Gear 5, Bankai, Energia a Spirale, Stand, Nen, Quirk).
- JRPG (FF, Persona, KH, Nier, DQ, Zelda, Yakuza, Layton): Level Up, Heat Action, Confidant/Social Link, Boss Fight, Save Point, enigmi.
- Comedy (Gintama, Konosuba, Lovely Complex, Toradora): ironia tagliente, sarcasmo sulla pigrizia, rotture della quarta parete.
- Mecha / Sci-Fi (Gundam, Eureka Seven, Evangelion, Code Geass, Mirai Nikki, Re:Zero): terminologia tecnica, sincronizzazione, manutenzione del "frame" (il corpo come unità da tenere efficiente).

Parla in PRIMA persona, inizia subito in character — niente preamboli tipo "Ciao, sono...".

VINCOLI DI OUTPUT (rigidi):
- SOLO JSON valido, nessun testo prima o dopo, nessun markdown.
- "character": copia-incolla esatto di "${selectedCharacter}".
- "title": frase d'urto, max 60 caratteri.
- "body": chiamata all'azione esplicita, max 120 caratteri.
- ZERO emoji, ZERO hashtag.

Schema: {"character":"${selectedCharacter}","title":"...","body":"..."}`
}

function buildCoachUserPrompt(anomaly: AnomalyType): string {
  if (anomaly === 'morning_motivation') {
    return `Sono circa le 17:30. L'utente ha appena chiuso la giornata di lavoro/studio e oggi era previsto allenamento, ma non ha ancora messo piede in palestra.
Genera la notifica push: deve farlo alzare dalla scrivania e portarlo in palestra ADESSO, prima che la sera si allunghi e perda lo slancio.`
  }
  // missed_workout
  return `Sono circa le 17:30. Ieri l'utente ha saltato l'allenamento programmato. Oggi era teoricamente un giorno di recupero, ma il debito va pagato stasera.
Genera la notifica push: richiamo all'ordine senza scuse, recupero immediato. Tono incalzante, mai sconfitto.`
}

interface CoachAIPayload {
  character: string
  title: string
  body: string
}

async function generateCoachPayload(anomaly: AnomalyType): Promise<CoachAIPayload> {
  const fallback: CoachAIPayload =
    anomaly === 'morning_motivation'
      ? {
          character: 'Il Sistema',
          title: FALLBACK_TRAINING_DAY.title,
          body: FALLBACK_TRAINING_DAY.body,
        }
      : {
          character: 'Il Sistema',
          title: FALLBACK_MISSED.title,
          body: FALLBACK_MISSED.body,
        }

  const selectedCharacter = pickRandomCharacter()

  try {
    const ai = getAIProvider()
    const result = await ai.generateStructuredOutput(
      buildCoachUserPrompt(anomaly),
      buildCoachSystemPrompt(selectedCharacter),
      CoachPayloadSchema,
      400,
      HAIKU_MODEL
    )
    // Usiamo il character scelto in TS (fonte di verità per i log) anche se
    // l'AI lo riecheggia: evita drift se Haiku riformatta o abbrevia il nome.
    return {
      character: selectedCharacter,
      title: result.title,
      body: result.body,
    }
  } catch (err) {
    console.error(
      '[proactive-coach] AI payload generation failed, using static fallback:',
      err
    )
    return fallback
  }
}

// ─── VAPID setup ────────────────────────────────────────────────────────────

function configureVapid(): { ok: true } | { ok: false; error: string } {
  const publicKey =
    process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:coach@example.com'

  if (!publicKey || !privateKey) {
    return {
      ok: false,
      error:
        'VAPID keys missing on the server (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).',
    }
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return { ok: true }
}

// ─── Helpers data Italia ────────────────────────────────────────────────────

/** Returns YYYY-MM-DD for "today" in Europe/Rome — matches the format stored
 *  in `workout_sessions.date` (a DATE column written from the user's logs). */
function romeDateISO(offsetDays = 0): string {
  const now = new Date()
  now.setUTCDate(now.getUTCDate() + offsetDays)
  // 'en-CA' formats as YYYY-MM-DD, which is what we need.
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
}

/** Day of week in Europe/Rome. 0 = Sun, 1 = Mon, ..., 6 = Sat. */
function romeDayOfWeek(): number {
  const weekday = new Date().toLocaleDateString('en-US', {
    timeZone: 'Europe/Rome',
    weekday: 'short',
  })
  // 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  return map[weekday] ?? new Date().getUTCDay()
}

// ─── Algoritmo di scheduling ────────────────────────────────────────────────

function decideForUser(
  userId: string,
  dow: number,
  todayISO: string,
  yesterdayISO: string,
  lastSessionDate: string | null
): CoachDecision | null {
  // Mon / Wed / Fri  → spinta di apertura giornata
  if (dow === 1 || dow === 3 || dow === 5) {
    if (lastSessionDate === todayISO) return null  // already trained today
    return {
      userId,
      anomalyType: 'morning_motivation',
      payload: { ...FALLBACK_TRAINING_DAY, ...ICONS },
    }
  }

  // Tue / Thu  → recupero solo se ha saltato ieri
  if (dow === 2 || dow === 4) {
    if (lastSessionDate === yesterdayISO) return null  // earned the rest day
    return {
      userId,
      anomalyType: 'missed_workout',
      payload: { ...FALLBACK_MISSED, ...ICONS },
    }
  }

  // Sat / Sun (0, 6) — no push
  return null
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // 1. Auth
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured on the server.' },
      { status: 500 }
    )
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Skip weekend immediately — saves a DB roundtrip.
  const dow = romeDayOfWeek()
  if (dow === 0 || dow === 6) {
    return NextResponse.json({
      ok: true,
      skipped: 'weekend',
      day_of_week: dow,
    })
  }

  // 3. VAPID
  const vapid = configureVapid()
  if (!vapid.ok) {
    return NextResponse.json({ error: vapid.error }, { status: 500 })
  }

  // 4. Service-role Supabase client (bypasses RLS for cross-user reads).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: 'Supabase service-role env vars missing.' },
      { status: 500 }
    )
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 5. Pull every push subscription, then filter by preferences.
  const { data: subsRaw, error: subsErr } = await supabase
    .from('user_push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')

  if (subsErr) {
    return NextResponse.json(
      { error: `Reading subscriptions failed: ${subsErr.message}` },
      { status: 500 }
    )
  }
  const subs: PushSubRow[] = subsRaw ?? []
  if (subs.length === 0) {
    return NextResponse.json({ ok: true, day_of_week: dow, decided: 0, sent: 0 })
  }

  // Group subscriptions per user — one user can have multiple devices.
  const subsByUser = new Map<string, PushSubRow[]>()
  for (const s of subs) {
    const arr = subsByUser.get(s.user_id) ?? []
    arr.push(s)
    subsByUser.set(s.user_id, arr)
  }
  const userIds = Array.from(subsByUser.keys())

  // 6. Preferences — left-join semantics. Missing row = enabled by default.
  const { data: prefsRaw } = await supabase
    .from('user_notification_preferences')
    .select('user_id, evening_reports_enabled, summer_episode_active')
    .in('user_id', userIds)
  const prefsByUser = new Map<string, PreferencesRow>()
  for (const p of (prefsRaw as PreferencesRow[] | null) ?? []) {
    prefsByUser.set(p.user_id, p)
  }

  // 7. Per-user decision
  const todayISO = romeDateISO(0)
  const yesterdayISO = romeDateISO(-1)
  const decisions: CoachDecision[] = []
  let skippedSummerEpisode = 0
  let skippedDisabled = 0

  for (const userId of userIds) {
    const pref = prefsByUser.get(userId)

    // Vacation mode wins over everything else: silence the user entirely.
    if (pref?.summer_episode_active) {
      skippedSummerEpisode += 1
      continue
    }
    if (pref && pref.evening_reports_enabled === false) {
      skippedDisabled += 1
      continue
    }

    const { data: lastSession } = await supabase
      .from('workout_sessions')
      .select('date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()

    const lastDate = (lastSession as { date: string } | null)?.date ?? null

    const decision = decideForUser(userId, dow, todayISO, yesterdayISO, lastDate)
    if (decision) decisions.push(decision)
  }

  if (decisions.length === 0) {
    return NextResponse.json({
      ok: true,
      day_of_week: dow,
      decided: 0,
      sent: 0,
      candidates: userIds.length,
      skipped_summer_episode: skippedSummerEpisode,
      skipped_disabled: skippedDisabled,
    })
  }

  // 8a. Riempi i payload con i testi generati dall'AI (Multiverse Coach via Haiku).
  // Titolo pulito (Android tronca attorno ai 50 char). Il personaggio diventa
  // firma in calce al body, così resta visibile senza rubare spazio al titolo.
  // Le chiamate vanno in parallelo: la latenza totale è quella della più lenta,
  // ed eventuali fallimenti sono isolati per-decisione (fallback "Il Sistema").
  await Promise.all(
    decisions.map(async (decision) => {
      const ai = await generateCoachPayload(decision.anomalyType)
      decision.payload.title = ai.title
      decision.payload.body = `${ai.body}\n— ${ai.character}`
    })
  )

  // 8b. Send pushes (parallel; per-endpoint failure isolated).
  let delivered = 0
  let failed = 0
  const expiredIds: string[] = []

  const sendOne = async (sub: PushSubRow, payload: string) => {
    const subscription: PushSubscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    }
    try {
      await webpush.sendNotification(subscription, payload, {
        headers: { urgency: 'high' },
        TTL: 43200,
      })
      delivered += 1
    } catch (err) {
      failed += 1
      const status = (err as WebPushError)?.statusCode
      if (status === 404 || status === 410) {
        expiredIds.push(sub.id)
      } else {
        console.error('[proactive-coach] send failed:', status, err)
      }
    }
  }

  await Promise.all(
    decisions.flatMap((decision) => {
      const userSubs = subsByUser.get(decision.userId) ?? []
      const payload = JSON.stringify(decision.payload)
      return userSubs.map((sub) => sendOne(sub, payload))
    })
  )

  // 9. Cleanup of dead endpoints + log success.
  if (expiredIds.length > 0) {
    await supabase
      .from('user_push_subscriptions')
      .delete()
      .in('id', expiredIds)
  }

  if (delivered > 0) {
    const logRows = decisions.map((d) => ({
      user_id: d.userId,
      anomaly_type: d.anomalyType,
      anomaly_payload: { day_of_week: dow, today: todayISO },
      message: `${d.payload.title} ${d.payload.body}`,
      delivered_count: subsByUser.get(d.userId)?.length ?? 0,
      failed_count: 0,
    }))
    await supabase.from('proactive_notifications_log').insert(logRows)
  }

  return NextResponse.json({
    ok: true,
    day_of_week: dow,
    candidates: userIds.length,
    decided: decisions.length,
    sent: delivered,
    failed,
    pruned: expiredIds.length,
    skipped_summer_episode: skippedSummerEpisode,
    skipped_disabled: skippedDisabled,
  })
}
