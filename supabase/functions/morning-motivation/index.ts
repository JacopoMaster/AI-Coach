// deno-lint-ignore-file no-explicit-any
/**
 * Morning Motivation — Supabase Edge Function
 * ───────────────────────────────────────────
 * Invoked by pg_cron every day at 09:00 Europe/Rome. For each user who has:
 *   (a) at least one push subscription, AND
 *   (b) morning_motivation_enabled = TRUE in user_notification_preferences
 *       (default TRUE if the preference row doesn't exist yet)
 * we:
 *   1. Decide whether today is a training or rest day (Mon/Wed/Fri = training
 *      by default; overridden by the user's active workout plan if available).
 *   2. Ask Claude Haiku for a ≤120-char anime/JRPG motivational line.
 *   3. Push it to every registered subscription with tag `coach-morning_motivation`
 *      so it doesn't overwrite evening-report notifications.
 *   4. Log the send to proactive_notifications_log for the shared 24h dedup.
 *
 * Auth: service-role JWT or PROACTIVE_COACH_CRON_SECRET, same pattern as
 * proactive-coach.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { generateMotivation, type DayType } from './claude.ts'
import { dispatch, type StoredSubscription } from './push.ts'

const SIX_HOURS_MS = 6 * 60 * 60 * 1000

function buildAdminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// ─── Day classification ──────────────────────────────────────────────────────
// Default: Mon (1), Wed (3), Fri (5) = training. If the user has an active
// workout plan, we instead use day_order matching today's weekday index so
// personalised schedules (e.g. PPL) are respected.
const ITALIAN_WEEKDAYS = [
  'domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato',
]
const DEFAULT_TRAINING_DOW = new Set([1, 3, 5])

async function classifyDay(
  supabase: ReturnType<typeof buildAdminClient>,
  userId: string,
  now: Date
): Promise<{ dayType: DayType; weekday: string }> {
  const dow = now.getDay() // 0=Sun … 6=Sat — local to the server but cron pins 09:00 Europe/Rome
  const weekday = ITALIAN_WEEKDAYS[dow]

  // Try the user's active workout plan first.
  const { data: meso } = await supabase
    .from('mesocycles')
    .select('workout_plan_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (meso?.workout_plan_id) {
    const { data: planDays } = await supabase
      .from('workout_plan_days')
      .select('day_order')
      .eq('plan_id', meso.workout_plan_id)
    // day_order is 1..N where 1=Mon in our schema. If today's dow (Mon=1)
    // is listed, it's a training day.
    const orders = new Set((planDays ?? []).map((d: any) => d.day_order))
    if (orders.size > 0) {
      return {
        dayType: orders.has(dow === 0 ? 7 : dow) ? 'training' : 'rest',
        weekday,
      }
    }
  }

  return {
    dayType: DEFAULT_TRAINING_DOW.has(dow) ? 'training' : 'rest',
    weekday,
  }
}

// ─── Per-user pipeline ───────────────────────────────────────────────────────
async function processUser(
  supabase: ReturnType<typeof buildAdminClient>,
  userId: string,
  now: Date
): Promise<{ userId: string; sent: boolean; reason?: string }> {
  // Dedup: skip if we already sent a morning_motivation in the last 6h. Guards
  // against double-fire if the cron is retried or the function is invoked
  // manually while the scheduled run is still in flight.
  const { data: recent } = await supabase
    .from('proactive_notifications_log')
    .select('id')
    .eq('user_id', userId)
    .eq('anomaly_type', 'morning_motivation')
    .gte('sent_at', new Date(now.getTime() - SIX_HOURS_MS).toISOString())
    .limit(1)

  if (recent && recent.length > 0) {
    return { userId, sent: false, reason: 'already_sent_today' }
  }

  const { data: subs } = await supabase
    .from('user_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subs || subs.length === 0) {
    return { userId, sent: false, reason: 'no_subscriptions' }
  }

  const { dayType, weekday } = await classifyDay(supabase, userId, now)
  const message = await generateMotivation({ dayType, weekday })

  const result = await dispatch(subs as StoredSubscription[], {
    title: 'AI Coach',
    body: message,
    url: dayType === 'training' ? '/workouts' : '/',
    tag: 'coach-morning_motivation',
    anomaly_type: 'morning_motivation',
  })

  if (result.expiredIds.length > 0) {
    await supabase
      .from('user_push_subscriptions')
      .delete()
      .in('id', result.expiredIds)
  }

  const deliveredIds = (subs as StoredSubscription[])
    .filter((s) => !result.expiredIds.includes(s.id))
    .map((s) => s.id)
  if (deliveredIds.length > 0) {
    await supabase
      .from('user_push_subscriptions')
      .update({ last_notified_at: now.toISOString() })
      .in('id', deliveredIds)
  }

  await supabase.from('proactive_notifications_log').insert({
    user_id: userId,
    anomaly_type: 'morning_motivation',
    anomaly_payload: { dayType, weekday },
    message,
    delivered_count: result.delivered,
    failed_count: result.failed,
  })

  return { userId, sent: result.delivered > 0 }
}

// ─── Audience query ──────────────────────────────────────────────────────────
// Fetch all distinct user_ids that (a) have a push sub and (b) haven't opted
// out of morning motivation. Users without a preference row are treated as
// opted-in (default TRUE) — matches the DEFAULT on the table.
async function fetchEligibleUserIds(
  supabase: ReturnType<typeof buildAdminClient>
): Promise<string[]> {
  const { data: subs, error: subErr } = await supabase
    .from('user_push_subscriptions')
    .select('user_id')
  if (subErr) throw subErr
  const userIds = Array.from(new Set((subs ?? []).map((r: any) => r.user_id)))
  if (userIds.length === 0) return []

  const { data: prefs, error: prefErr } = await supabase
    .from('user_notification_preferences')
    .select('user_id, morning_motivation_enabled')
    .in('user_id', userIds)
  if (prefErr) throw prefErr

  const disabled = new Set(
    (prefs ?? [])
      .filter((p: any) => p.morning_motivation_enabled === false)
      .map((p: any) => p.user_id)
  )
  return userIds.filter((id) => !disabled.has(id))
}

// ─── HTTP entry point ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const authHeader = req.headers.get('authorization') ?? ''
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const cronSecret = Deno.env.get('PROACTIVE_COACH_CRON_SECRET')
  const bearer = authHeader.replace(/^Bearer\s+/i, '')

  const authorized =
    (serviceRole && bearer === serviceRole) ||
    (cronSecret && bearer === cronSecret)

  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = buildAdminClient()
  const now = new Date()

  try {
    const userIds = await fetchEligibleUserIds(supabase)

    const results: Array<Awaited<ReturnType<typeof processUser>>> = []
    const batchSize = 5
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize)
      const settled = await Promise.allSettled(
        batch.map((id) => processUser(supabase, id, now))
      )
      for (const s of settled) {
        if (s.status === 'fulfilled') results.push(s.value)
      }
    }

    return new Response(
      JSON.stringify({
        scanned: userIds.length,
        sent: results.filter((r) => r.sent).length,
        skipped: results.filter((r) => !r.sent).length,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('morning-motivation error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
