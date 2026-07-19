// Restart Baseline — server entry point (F2.2).
//
// buildRestartBaseline(supabase, userId, analysisDate?) → a deterministic,
// serializable RestartBaseline. It reads (never writes) and is ATOMIC &
// error-honest: independent sources are read in parallel, but any real DB error
// rejects the whole baseline (no Promise.allSettled masking, D026). A successful
// query with zero rows is a valid "absence of data", not an error and not
// silently downgraded to `insufficient`. No AI, no persistence, no UI (D028).

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAppDate, subDays } from '@/lib/date/app-date'
import { getAthleteProfile } from '@/lib/profile/server'
import { getDailyNutritionTotals } from '@/lib/diet/daily-totals'
import { buildAnalysisPeriod } from './windows'
import { buildTrainingConsistency } from './training'
import { buildPerformance, rollUpPerformance } from './performance'
import { buildBody } from './body'
import { buildNutrition } from './nutrition'
import { buildPlanFit } from './plan-fit'
import {
  PERFORMANCE_WINDOW_DAYS,
  REFERENCE_WINDOW_DAYS,
  WEEK_DAYS,
} from './thresholds'
import {
  fetchSessionsInWindow,
  fetchFirstSessionDate,
  fetchLastSessionDate,
  fetchBodyInWindow,
  fetchLatestBody,
  fetchActivePlan,
  fetchActiveDietPlan,
  fetchActiveMesocycle,
} from './queries'
import { RestartBaselineQueryError } from './errors'
import type { MesocycleContext, RestartBaseline } from './types'

/** Tag an external error-honest helper with its stage, preserving the throw. */
function stage<T>(source: string, p: Promise<T>): Promise<T> {
  return p.catch((e) => {
    throw new RestartBaselineQueryError(source, e)
  })
}

export async function buildRestartBaseline(
  supabase: SupabaseClient,
  userId: string,
  analysisDate?: string
): Promise<RestartBaseline> {
  const date = analysisDate ?? getAppDate() // Europe/Rome calendar date (D002)
  const period = buildAnalysisPeriod(date)
  const start_ref = subDays(period.end, REFERENCE_WINDOW_DAYS - 1)

  // Parallel, error-honest reads. Any rejection aborts the whole baseline.
  const [
    sessionsRef,
    firstSessionDate,
    lastSessionDate,
    body12w,
    latestBody,
    dailyTotals,
    dietPlan,
    activePlan,
    activeMeso,
    profile,
  ] = await Promise.all([
    fetchSessionsInWindow(supabase, userId, start_ref, period.end),
    fetchFirstSessionDate(supabase, userId, period.end),
    fetchLastSessionDate(supabase, userId, period.end),
    fetchBodyInWindow(supabase, userId, period.start_12w, period.end),
    fetchLatestBody(supabase, userId, period.end),
    stage('nutrition_daily_totals', getDailyNutritionTotals(supabase, userId, period.start_4w, period.end)), // 28-day window
    fetchActiveDietPlan(supabase, userId),
    fetchActivePlan(supabase, userId),
    fetchActiveMesocycle(supabase, userId),
    stage('athlete_profile', getAthleteProfile(supabase, userId)), // throws on real error; null when absent
  ])

  const sessionDates = sessionsRef.map((s) => s.date)

  const training_consistency = buildTrainingConsistency({
    period,
    sessionDates,
    firstKnownSessionDate: firstSessionDate,
    lastSessionDate,
    targetSessionsPerWeek: profile?.target_sessions_per_week ?? null,
    minimumSessionsPerWeek: profile?.minimum_sessions_per_week ?? null,
  })

  const performance = buildPerformance({
    period,
    sessions: sessionsRef,
    performanceWindowStart: period.start_8w,
    performanceWindowWeeks: PERFORMANCE_WINDOW_DAYS / WEEK_DAYS,
    referenceWindowWeeks: REFERENCE_WINDOW_DAYS / WEEK_DAYS,
  })

  const body = buildBody({ period, measurements12w: body12w, latest: latestBody })

  const nutrition = buildNutrition({ dailyTotals, dietPlan })

  const plan_fit = buildPlanFit({
    plan: activePlan,
    targetSessionsPerWeek: profile?.target_sessions_per_week ?? null,
    minimumSessionsPerWeek: profile?.minimum_sessions_per_week ?? null,
    avoidedExercises: profile?.avoided_exercises ?? null,
    trainingLimitations: profile?.training_limitations ?? null,
  })

  const mesocycle_context: MesocycleContext = activeMeso
    ? {
        active_mesocycle_exists: true,
        active_mesocycle_id: activeMeso.id,
        start_date: activeMeso.start_date,
        end_date: activeMeso.end_date,
        status: activeMeso.status,
      }
    : {
        active_mesocycle_exists: false,
        active_mesocycle_id: null,
        start_date: null,
        end_date: null,
        status: null,
      }

  return {
    analysis_period: period,
    training_consistency,
    performance,
    body,
    nutrition,
    plan_fit,
    mesocycle_context,
    data_quality: {
      training_consistency: training_consistency.data_quality,
      performance: rollUpPerformance(performance.exercises.map((e) => e.data_quality)),
      body: body.data_quality,
      nutrition: nutrition.data_quality,
    },
  }
}
