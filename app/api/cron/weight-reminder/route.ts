// GET /api/cron/weight-reminder
//
// Saturday-morning cron — pings every user that hasn't logged a body weight
// during the current ISO week (Mon→Sat at trigger time). The weekly weigh-in
// is the only "always required" Perfect Week criterion (workouts scale with
// the active plan), so missing it on Saturday means the streak dies on Sunday
// at midnight unless the user steps on the scale today.
//
// Runs Saturday 05:00 Europe/Rome (vercel.json: "0 5 * * 6"). Treats the cron
// as if it were "now is Saturday morning"; we do NOT re-check the day-of-week
// here — the schedule is the authority, and a manual hit (e.g. for testing)
// should still run.
//
// AUTH: Bearer CRON_SECRET, identical to /api/cron/proactive-coach.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import webpush, { type PushSubscription, type WebPushError } from 'web-push'
import { z } from 'zod'
import { getAIProvider } from '@/lib/ai/provider'
import { AI_MODELS } from '@/lib/ai/models'
import { isWaifu, pickRandomCharacter, type Character } from '@/lib/coach/roster'
import { unlockMetricAchievements } from '@/lib/gamification/check-achievements'

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

interface CoachAIPayload {
  character: Character
  title: string
  body: string
}

const SYSTEM_PLACEHOLDER: Character = { name: 'Il Sistema', tags: [], lore: '' }

// ─── Configurazione ─────────────────────────────────────────────────────────

const ICONS = {
  icon: '/icons/icon-192.png',
  badge: '/icons/badge-72.png',
}

const FALLBACK_WEIGH_IN = {
  title: 'Sveglia! Manca solo la pesata',
  body: 'Sali sulla bilancia oggi: salva la streak della settimana.',
  tag: 'coach-weight-reminder',
  url: '/body',
}

const HAIKU_MODEL = AI_MODELS.fast

// ─── Generazione AI ──────────────────────────────────────────────────────────

const CoachPayloadSchema = z.object({
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

function buildSystemPrompt(selectedCharacter: Character): string {
  return `Sei ${selectedCharacter.name}.
IDENTITÀ E COMPORTAMENTO:
${selectedCharacter.lore}

VINCOLI LESSICALI ASSOLUTI (PENALITÀ CRITICA):
È severamente vietato e fuori personaggio usare parole terrene legate al fitness come 'palestra', 'workout', 'allenamento', 'scheda', 'ripetizioni', 'coach', 'esercizio'. Se usi la parola 'palestra' o simili rompi istantaneamente l'immersione. Sostituiscile SEMPRE con le metafore del tuo universo (es. 'campo di battaglia', 'dungeon', 'missione', 'scontro', 'sfida').

GRAMMATICA E LORE (GLOSSARIO):
Usa un italiano impeccabile e nativo. Rispetta rigorosamente il genere dei termini iconici.
- CORRETTO: 'La tua Spirale' (Femminile), 'L'Energia a Spirale' (Femminile), 'Il Giga Drill' (Maschile).
- ERRATO: 'Il tuo spirale', 'Lo spirale'.
Non sbagliare MAI il genere di queste parole. Mantieni la risposta breve, incisiva e adatta a una notifica push da leggere al volo.

VINCOLI DI OUTPUT (rigidi):
- SOLO JSON valido, nessun testo prima o dopo, nessun markdown.
- "character": copia-incolla esatto di "${selectedCharacter.name}".
- "title": frase d'urto, max 60 caratteri.
- "body": chiamata all'azione esplicita sulla pesata di oggi, max 120 caratteri.
- ZERO emoji, ZERO hashtag.

Schema: {"character":"${selectedCharacter.name}","title":"...","body":"..."}`
}

const USER_PROMPT = `È sabato mattina, l'utente non si è ancora pesato questa settimana. Genera la notifica push: deve farlo salire sulla bilancia OGGI per completare la missione settimanale e salvare la streak, FALLO CON LO STILE UNICO DEL PERSONAGGIO CHE LO MOTIVA A PRENDERSI CURA DI SÉ STESSO. Ricordati di fare sempre un riferimento al mondo di appartenenza del personaggio o alla sua storia, l'IMMERSIONE è TUTTO.`

async function generatePayload(): Promise<CoachAIPayload> {
  const fallback: CoachAIPayload = {
    character: SYSTEM_PLACEHOLDER,
    title: FALLBACK_WEIGH_IN.title,
    body: FALLBACK_WEIGH_IN.body,
  }

  const selectedCharacter = pickRandomCharacter()

  try {
    const ai = getAIProvider()
    const result = await ai.generateStructuredOutput(
      USER_PROMPT,
      buildSystemPrompt(selectedCharacter),
      CoachPayloadSchema,
      400,
      HAIKU_MODEL
    )
    return {
      character: selectedCharacter,
      title: result.title,
      body: result.body,
    }
  } catch (err) {
    console.error(
      '[weight-reminder] AI payload generation failed, using static fallback:',
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
 *  in `body_measurements.date`. */
function romeDateISO(offsetDays = 0): string {
  const now = new Date()
  now.setUTCDate(now.getUTCDate() + offsetDays)
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
}

/** Monday 00:00 (Europe/Rome) of the ISO week containing the current date,
 *  as YYYY-MM-DD. */
function romeIsoMonday(): string {
  const todayStr = romeDateISO(0)
  const today = new Date(`${todayStr}T00:00:00Z`)
  const dow = today.getUTCDay() // 0=Sun..6=Sat
  const offset = dow === 0 ? -6 : 1 - dow
  today.setUTCDate(today.getUTCDate() + offset)
  return today.toISOString().split('T')[0]
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

  // 2. VAPID
  const vapid = configureVapid()
  if (!vapid.ok) {
    return NextResponse.json({ error: vapid.error }, { status: 500 })
  }

  // 3. Service-role Supabase client
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

  // 4. Pull every push subscription, group by user.
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
    return NextResponse.json({ ok: true, candidates: 0, sent: 0 })
  }

  const subsByUser = new Map<string, PushSubRow[]>()
  for (const s of subs) {
    const arr = subsByUser.get(s.user_id) ?? []
    arr.push(s)
    subsByUser.set(s.user_id, arr)
  }
  const userIds = Array.from(subsByUser.keys())

  // 5. Preferences (left-join). Missing row = enabled.
  const { data: prefsRaw } = await supabase
    .from('user_notification_preferences')
    .select('user_id, evening_reports_enabled, summer_episode_active')
    .in('user_id', userIds)
  const prefsByUser = new Map<string, PreferencesRow>()
  for (const p of (prefsRaw as PreferencesRow[] | null) ?? []) {
    prefsByUser.set(p.user_id, p)
  }

  // 6. Per-user: did they weigh in this week?
  const weekStart = romeIsoMonday()
  const todayISO = romeDateISO(0)

  const targetUsers: string[] = []
  let skippedSummerEpisode = 0
  let skippedDisabled = 0
  let skippedAlreadyWeighed = 0

  for (const userId of userIds) {
    const pref = prefsByUser.get(userId)

    if (pref?.summer_episode_active) {
      skippedSummerEpisode += 1
      continue
    }
    if (pref && pref.evening_reports_enabled === false) {
      skippedDisabled += 1
      continue
    }

    const { count } = await supabase
      .from('body_measurements')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('date', weekStart)
      .lte('date', todayISO)
      .not('weight_kg', 'is', null)

    if ((count ?? 0) > 0) {
      skippedAlreadyWeighed += 1
      continue
    }
    targetUsers.push(userId)
  }

  if (targetUsers.length === 0) {
    return NextResponse.json({
      ok: true,
      candidates: userIds.length,
      decided: 0,
      sent: 0,
      week_start: weekStart,
      skipped_summer_episode: skippedSummerEpisode,
      skipped_disabled: skippedDisabled,
      skipped_already_weighed: skippedAlreadyWeighed,
    })
  }

  // 7. Generate per-user payload (parallel, isolated failures).
  const payloadByUser = new Map<string, CoachAIPayload>()
  await Promise.all(
    targetUsers.map(async (uid) => {
      const ai = await generatePayload()
      payloadByUser.set(uid, ai)
    })
  )

  // 8. Send pushes (parallel; per-endpoint failure isolated).
  let delivered = 0
  let failed = 0
  const expiredIds: string[] = []
  const deliveredUsers = new Set<string>()

  const sendOne = async (
    userId: string,
    sub: PushSubRow,
    payload: string
  ) => {
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
      deliveredUsers.add(userId)
    } catch (err) {
      failed += 1
      const status = (err as WebPushError)?.statusCode
      if (status === 404 || status === 410) {
        expiredIds.push(sub.id)
      } else {
        console.error('[weight-reminder] send failed:', status, err)
      }
    }
  }

  await Promise.all(
    targetUsers.flatMap((uid) => {
      const ai: CoachAIPayload = payloadByUser.get(uid) ?? {
        character: SYSTEM_PLACEHOLDER,
        title: FALLBACK_WEIGH_IN.title,
        body: FALLBACK_WEIGH_IN.body,
      }
      const payload = JSON.stringify({
        ...FALLBACK_WEIGH_IN,
        ...ICONS,
        title: ai.title,
        body: `${ai.body}\n— ${ai.character.name}`,
      })
      const userSubs = subsByUser.get(uid) ?? []
      return userSubs.map((sub) => sendOne(uid, sub, payload))
    })
  )

  // 8b. Bump anime_waifu_notifs for users whose delivered coach was a waifu.
  await Promise.all(
    targetUsers.map(async (uid) => {
      const ai = payloadByUser.get(uid)
      if (!ai || !isWaifu(ai.character)) return
      if (!deliveredUsers.has(uid)) return
      try {
        const { data: row } = await supabase
          .from('user_stats')
          .select('anime_waifu_notifs')
          .eq('user_id', uid)
          .single()
        const current = Number(
          (row as { anime_waifu_notifs?: number } | null)?.anime_waifu_notifs ?? 0
        )
        const next = current + 1
        await supabase
          .from('user_stats')
          .update({ anime_waifu_notifs: next })
          .eq('user_id', uid)
        await unlockMetricAchievements(
          supabase,
          uid,
          'anime_waifu_notifs',
          next
        )
      } catch (err) {
        console.error('[weight-reminder] waifu counter bump failed:', err)
      }
    })
  )

  // 9. Cleanup of dead endpoints + log.
  if (expiredIds.length > 0) {
    await supabase
      .from('user_push_subscriptions')
      .delete()
      .in('id', expiredIds)
  }

  if (delivered > 0) {
    const logRows = targetUsers.map((uid) => {
      const ai = payloadByUser.get(uid)
      return {
        user_id: uid,
        // Closest existing anomaly_type CHECK value (see migration 005). The
        // weekly weigh-in being skipped is functionally an inactivity risk —
        // the streak dies tomorrow if nothing is logged today.
        anomaly_type: 'inactive_streak' as const,
        anomaly_payload: { week_start: weekStart, today: todayISO, kind: 'weight_reminder' },
        message: ai
          ? `${ai.title} ${ai.body} — ${ai.character.name}`
          : `${FALLBACK_WEIGH_IN.title} ${FALLBACK_WEIGH_IN.body}`,
        delivered_count: subsByUser.get(uid)?.length ?? 0,
        failed_count: 0,
      }
    })
    await supabase.from('proactive_notifications_log').insert(logRows)
  }

  return NextResponse.json({
    ok: true,
    week_start: weekStart,
    today: todayISO,
    candidates: userIds.length,
    decided: targetUsers.length,
    sent: delivered,
    failed,
    pruned: expiredIds.length,
    skipped_summer_episode: skippedSummerEpisode,
    skipped_disabled: skippedDisabled,
    skipped_already_weighed: skippedAlreadyWeighed,
  })
}
