// deno-lint-ignore-file no-explicit-any
/**
 * Proactive Coach — Supabase Edge Function
 * ─────────────────────────────────────────
 * Invoked by pg_cron once a day (configurable). For each active user it:
 *   1. Pulls the last 48h of activity (sessions, diet logs, pending check-ins).
 *   2. Runs priority-ordered anomaly detectors.
 *   3. If something fires, asks Claude Haiku for a <100-char Italian message.
 *   4. Pushes the message to every registered browser subscription.
 *   5. Writes an audit row to proactive_notifications_log.
 *
 * Auth: expects the cron job to send the Supabase service-role JWT in the
 * Authorization header. Any other caller gets 401.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { detectAnomaly, type Anomaly, type UserSnapshot } from './anomalies.ts'
import { generateMessage } from './claude.ts'
import { dispatch, type StoredSubscription } from './push.ts'

// ─── Config ──────────────────────────────────────────────────────────────────
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

// ─── Service-role client (bypasses RLS, required for cross-user scan) ────────
function buildAdminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// ─── User snapshot builder ───────────────────────────────────────────────────
async function buildSnapshot(
  supabase: ReturnType<typeof buildAdminClient>,
  userId: string,
  now: Date
): Promise<UserSnapshot> {
  const windowStart = new Date(now.getTime() - FORTY_EIGHT_HOURS_MS).toISOString()
  const sinceDate = new Date(now.getTime() - FORTY_EIGHT_HOURS_MS)
    .toISOString()
    .slice(0, 10)

  // Kick off every query in parallel — they're all independent single-user reads.
  const [
    sessionsRes,
    dietLogsRes,
    nutritionRes,
    dietPlanRes,
    mesoRes,
    checkInsRes,
    recentNotifRes,
  ] = await Promise.all([
    supabase
      .from('workout_sessions')
      .select('id, date, created_at')
      .eq('user_id', userId)
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false }),
    supabase
      .from('diet_logs')
      .select('date, calories, protein_g')
      .eq('user_id', userId)
      .gte('date', sinceDate),
    supabase
      .from('nutrition_entries')
      .select('date, calories')
      .eq('user_id', userId)
      .gte('date', sinceDate),
    supabase
      .from('diet_plans')
      .select('calories')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('mesocycles')
      .select('id, start_date, duration_weeks, workout_plan_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('weekly_check_ins')
      .select('id, week_number, check_in_date')
      .eq('user_id', userId)
      .eq('applied', false)
      .order('check_in_date', { ascending: false })
      .limit(5),
    supabase
      .from('proactive_notifications_log')
      .select('anomaly_type')
      .eq('user_id', userId)
      .gte('sent_at', new Date(now.getTime() - TWENTY_FOUR_HOURS_MS).toISOString()),
  ])

  // Plan days are only needed if a mesocycle is active (used for target count).
  let workoutPlanDays: Array<{ id: string; day_order: number }> = []
  if (mesoRes.data?.workout_plan_id) {
    const { data } = await supabase
      .from('workout_plan_days')
      .select('id, day_order')
      .eq('plan_id', mesoRes.data.workout_plan_id)
    workoutPlanDays = data ?? []
  }

  // "Last activity" = most recent of any write we care about.
  const candidates: number[] = []
  if (sessionsRes.data?.[0]?.created_at) {
    candidates.push(new Date(sessionsRes.data[0].created_at).getTime())
  }
  if (nutritionRes.data?.length) {
    const maxDate = nutritionRes.data
      .map((e: any) => new Date(e.date).getTime())
      .reduce((a: number, b: number) => Math.max(a, b), 0)
    if (maxDate) candidates.push(maxDate)
  }
  const lastActivityAt =
    candidates.length > 0 ? new Date(Math.max(...candidates)) : null

  return {
    userId,
    now,
    sessions: sessionsRes.data ?? [],
    dietLogs: dietLogsRes.data ?? [],
    nutritionEntries: nutritionRes.data ?? [],
    dietPlan: dietPlanRes.data ?? null,
    activeMeso: mesoRes.data ?? null,
    workoutPlanDays,
    pendingCheckIns: checkInsRes.data ?? [],
    lastActivityAt,
    recentAnomalyTypes: new Set(
      (recentNotifRes.data ?? []).map((r: any) => r.anomaly_type)
    ),
  }
}

// ─── Per-user pipeline ───────────────────────────────────────────────────────
async function processUser(
  supabase: ReturnType<typeof buildAdminClient>,
  userId: string,
  now: Date
): Promise<{ userId: string; anomaly: Anomaly | null; notified: boolean }> {
  // Skip users with no push subscriptions at all — no point running detection.
  const { data: subs } = await supabase
    .from('user_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subs || subs.length === 0) {
    return { userId, anomaly: null, notified: false }
  }

  const snapshot = await buildSnapshot(supabase, userId, now)
  const anomaly = detectAnomaly(snapshot)
  if (!anomaly) return { userId, anomaly: null, notified: false }

  const message = await generateMessage(anomaly)

  const result = await dispatch(subs as StoredSubscription[], {
    title: 'AI Coach',
    body: message,
    url: anomaly.url,
    tag: `coach-${anomaly.type}`,
    anomaly_type: anomaly.type,
  })

  // Prune 404/410 endpoints so we don't keep retrying dead subscriptions.
  if (result.expiredIds.length > 0) {
    await supabase
      .from('user_push_subscriptions')
      .delete()
      .in('id', result.expiredIds)
  }

  // Update last_notified_at on delivered subs (drives future rate-limiting).
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
    anomaly_type: anomaly.type,
    anomaly_payload: anomaly.context,
    message,
    delivered_count: result.delivered,
    failed_count: result.failed,
  })

  return { userId, anomaly, notified: result.delivered > 0 }
}

// ─── Active-user query ───────────────────────────────────────────────────────
// "Active" = has at least one push subscription. Anyone without a subscription
// cannot receive a notification anyway, so running the expensive per-user
// pipeline would just burn Haiku calls.
async function fetchActiveUserIds(
  supabase: ReturnType<typeof buildAdminClient>
): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_push_subscriptions')
    .select('user_id')
  if (error) throw error
  const unique = new Set<string>((data ?? []).map((r: any) => r.user_id))
  return Array.from(unique)
}

// ─── HTTP entry point ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  // Minimal auth — require a shared secret OR the service-role JWT.
  // pg_cron jobs pass the service role via the Authorization header.
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
    const userIds = await fetchActiveUserIds(supabase)

    // Cap parallelism at 5 — Anthropic rate limits + Supabase connection
    // budget. For most deployments (≤500 users) this finishes in <60s.
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

    const notified = results.filter((r) => r.notified).length
    return new Response(
      JSON.stringify({
        scanned: userIds.length,
        notified,
        breakdown: results.reduce(
          (acc, r) => {
            if (r.anomaly) {
              acc[r.anomaly.type] = (acc[r.anomaly.type] ?? 0) + 1
            }
            return acc
          },
          {} as Record<string, number>
        ),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('proactive-coach error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
