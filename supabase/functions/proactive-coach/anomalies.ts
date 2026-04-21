// deno-lint-ignore-file no-explicit-any
/**
 * Anomaly-detection logic for the Proactive Coach.
 *
 * Pure functions — each takes the rows fetched from Supabase and returns
 * either a typed Anomaly or null. Kept free of DB / Claude / Push concerns
 * so they can be unit-tested and re-ordered without touching the dispatcher.
 *
 * Decision policy:
 *   • At most ONE anomaly per user per run (to avoid notification spam).
 *   • Priority: pending_checkin > missed_workout > calorie_deviation >
 *     inactive_streak. Check-ins and skipped sessions are time-sensitive;
 *     calorie drift is informational; inactive streak is a last-resort ping.
 */

export type AnomalyType =
  | 'missed_workout'
  | 'calorie_deviation'
  | 'pending_checkin'
  | 'inactive_streak'

export interface Anomaly {
  type: AnomalyType
  // Compact context passed to Claude Haiku for message generation.
  context: Record<string, unknown>
  // Deep-link target inside the PWA so the notification click opens the right tab.
  url: string
}

// ─── Inputs ──────────────────────────────────────────────────────────────────
export interface UserSnapshot {
  userId: string
  now: Date
  // Last 48h of activity — pre-fetched by the dispatcher.
  sessions: Array<{ id: string; date: string; created_at: string }>
  dietLogs: Array<{
    date: string
    calories: number | null
    protein_g: number | null
  }>
  nutritionEntries: Array<{ date: string; calories: number }>
  dietPlan: { calories: number | null } | null
  activeMeso: {
    id: string
    start_date: string
    duration_weeks: number
  } | null
  workoutPlanDays: Array<{ id: string; day_order: number }>
  pendingCheckIns: Array<{ id: string; week_number: number; check_in_date: string }>
  // Most-recent entry for any of the above, used for inactivity detection.
  lastActivityAt: Date | null
  // To avoid re-sending the same anomaly within 24h.
  recentAnomalyTypes: Set<AnomalyType>
}

// ─── Individual detectors ────────────────────────────────────────────────────

/**
 * A check-in becomes "pending" the moment it's inserted with applied=false.
 * If it's been sitting for ≥24h we nudge the user — this is the highest-value
 * notification because the AI has already done the work and is waiting.
 */
function detectPendingCheckIn(s: UserSnapshot): Anomaly | null {
  const stale = s.pendingCheckIns.find((c) => {
    const age = s.now.getTime() - new Date(c.check_in_date).getTime()
    return age >= 24 * 60 * 60 * 1000
  })
  if (!stale) return null

  return {
    type: 'pending_checkin',
    context: {
      week_number: stale.week_number,
      days_pending: Math.floor(
        (s.now.getTime() - new Date(stale.check_in_date).getTime()) / 86_400_000
      ),
    },
    url: '/workouts',
  }
}

/**
 * During an active mesocycle the user should log ≥1 session every 48h on
 * average (2-3/week minimum). We flag zero sessions in the last 48h AS LONG AS
 * we're past day 2 of the meso (so week 1 isn't a false positive on Day 2).
 */
function detectMissedWorkout(s: UserSnapshot): Anomaly | null {
  if (!s.activeMeso) return null

  const mesoStart = new Date(s.activeMeso.start_date)
  const daysIntoMeso = (s.now.getTime() - mesoStart.getTime()) / 86_400_000
  if (daysIntoMeso < 2) return null

  const windowStart = new Date(s.now.getTime() - 48 * 60 * 60 * 1000)
  const recentSessions = s.sessions.filter(
    (x) => new Date(x.created_at) >= windowStart
  )
  if (recentSessions.length > 0) return null

  // Find last session to include in context
  const last = s.sessions[0] // already sorted desc by caller
  return {
    type: 'missed_workout',
    context: {
      days_since_last: last
        ? Math.floor(
            (s.now.getTime() - new Date(last.created_at).getTime()) / 86_400_000
          )
        : null,
      weekly_target_days: s.workoutPlanDays.length,
    },
    url: '/workouts/log',
  }
}

/**
 * Sum today's calories from nutrition_entries (live tracker) and diet_logs
 * (legacy form). Flag if the rolling-48h average deviates ≥20% from the plan.
 * 20% is a deliberate threshold — anything tighter fires on meal-timing noise.
 */
function detectCalorieDeviation(s: UserSnapshot): Anomaly | null {
  const target = s.dietPlan?.calories
  if (!target || target <= 0) return null

  const yesterday = new Date(s.now.getTime() - 86_400_000)
  const yIso = yesterday.toISOString().slice(0, 10)
  const tIso = s.now.toISOString().slice(0, 10)

  const dayTotal = (iso: string): number => {
    const legacy = s.dietLogs
      .filter((d) => d.date === iso)
      .reduce((a, b) => a + (b.calories || 0), 0)
    const live = s.nutritionEntries
      .filter((e) => e.date === iso)
      .reduce((a, b) => a + b.calories, 0)
    return legacy + live
  }

  const days = [dayTotal(yIso), dayTotal(tIso)].filter((x) => x > 0)
  if (days.length === 0) return null

  const avg = days.reduce((a, b) => a + b, 0) / days.length
  const deviation = (avg - target) / target // signed: negative = under-eating
  if (Math.abs(deviation) < 0.2) return null

  return {
    type: 'calorie_deviation',
    context: {
      target_kcal: target,
      actual_kcal: Math.round(avg),
      deviation_pct: Math.round(deviation * 100),
      direction: deviation > 0 ? 'over' : 'under',
    },
    url: '/diet',
  }
}

/**
 * Catch-all: user hasn't opened the app / logged anything in 3+ days. We want
 * to re-engage without being preachy, so this runs last and only when nothing
 * else triggered.
 */
function detectInactiveStreak(s: UserSnapshot): Anomaly | null {
  if (!s.lastActivityAt) {
    // Brand-new account with zero data — don't spam the welcome flow.
    return null
  }
  const days = (s.now.getTime() - s.lastActivityAt.getTime()) / 86_400_000
  if (days < 3) return null

  return {
    type: 'inactive_streak',
    context: { days_inactive: Math.floor(days) },
    url: '/',
  }
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

const DETECTORS: Array<(s: UserSnapshot) => Anomaly | null> = [
  detectPendingCheckIn,
  detectMissedWorkout,
  detectCalorieDeviation,
  detectInactiveStreak,
]

/**
 * Returns the single highest-priority anomaly for the user, or null.
 * Skips any anomaly whose type was already notified in the last 24h
 * (enforced by the caller through `recentAnomalyTypes`).
 */
export function detectAnomaly(snapshot: UserSnapshot): Anomaly | null {
  for (const detector of DETECTORS) {
    const a = detector(snapshot)
    if (a && !snapshot.recentAnomalyTypes.has(a.type)) return a
  }
  return null
}
