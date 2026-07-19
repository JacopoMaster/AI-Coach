// Restart Baseline — training consistency aggregator (F2.2). PURE.
//
// sessions_count = number of workout_session rows in the window.
// training_days_count = distinct calendar days with ≥1 session (NOT assumed
// equal to sessions_count — two sessions on the same day count as 1 day, 2 sessions).
// Zero sessions from a successful query is a valid fact, never an error.

import { diffCalendarDays } from '@/lib/date/app-date'
import { buildWeeklySeries, inWindow } from './windows'
import { classifyTrainingConsistency } from './data-quality'
import { WINDOW_4W_DAYS, WINDOW_8W_DAYS, WINDOW_12W_DAYS, WEEK_DAYS } from './thresholds'
import type { AnalysisPeriod, TrainingConsistencyBaseline, WindowedCount } from './types'

function windowedCount(dates: string[], start: string, end: string, windowDays: number): WindowedCount {
  const inRange = dates.filter((d) => inWindow(d, start, end))
  const distinctDays = new Set(inRange).size
  const weeks = windowDays / WEEK_DAYS
  return {
    sessions_count: inRange.length,
    training_days_count: distinctDays,
    sessions_per_week_average: round1(inRange.length / weeks),
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function buildTrainingConsistency(params: {
  period: AnalysisPeriod
  sessionDates: string[] // dates of sessions within (at least) the 12w window
  firstKnownSessionDate: string | null
  lastSessionDate: string | null
  targetSessionsPerWeek: number | null
  minimumSessionsPerWeek: number | null
}): TrainingConsistencyBaseline {
  const { period, sessionDates } = params

  const window_4w = windowedCount(sessionDates, period.start_4w, period.end, WINDOW_4W_DAYS)
  const window_8w = windowedCount(sessionDates, period.start_8w, period.end, WINDOW_8W_DAYS)
  const window_12w = windowedCount(sessionDates, period.start_12w, period.end, WINDOW_12W_DAYS)

  const days_since_last_session =
    params.lastSessionDate != null
      ? diffCalendarDays(params.lastSessionDate, period.analysis_date)
      : null

  const historySpanDays =
    params.firstKnownSessionDate != null
      ? diffCalendarDays(params.firstKnownSessionDate, period.analysis_date)
      : null

  return {
    window_4w,
    window_8w,
    window_12w,
    weekly_series_12w: buildWeeklySeries(period.analysis_date, sessionDates),
    last_session_date: params.lastSessionDate,
    days_since_last_session,
    first_known_session_date: params.firstKnownSessionDate,
    target_sessions_per_week: params.targetSessionsPerWeek,
    minimum_sessions_per_week: params.minimumSessionsPerWeek,
    data_quality: classifyTrainingConsistency(historySpanDays),
    data_quality_evidence: {
      first_known_session_date: params.firstKnownSessionDate,
      history_span_days: historySpanDays,
      sessions_count_12w: window_12w.sessions_count,
    },
  }
}
