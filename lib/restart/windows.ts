// Restart Baseline — analysis-period windows (F2.2). PURE, no I/O.
//
// Every boundary is a Europe/Rome calendar date (D002). Windows are inclusive
// day ranges ending on (and including) the analysis date:
//   4w  = [analysis_date - 27, analysis_date]  → 28 calendar days
//   8w  = [analysis_date - 55, analysis_date]  → 56 calendar days
//   12w = [analysis_date - 83, analysis_date]  → 84 calendar days
// The weekly series uses ISO (Monday-based) calendar weeks — a distinct,
// documented view from the rolling day-windows above.

import { subDays, addDays, getAppWeekStart } from '@/lib/date/app-date'
import type { AnalysisPeriod, WeeklyBucket } from './types'
import {
  WINDOW_4W_DAYS,
  WINDOW_8W_DAYS,
  WINDOW_12W_DAYS,
  WEEKLY_SERIES_WEEKS,
  NUTRITION_WINDOW_DAYS,
} from './thresholds'

export function buildAnalysisPeriod(analysisDate: string): AnalysisPeriod {
  return {
    analysis_date: analysisDate,
    end: analysisDate,
    start_4w: subDays(analysisDate, WINDOW_4W_DAYS - 1),
    start_8w: subDays(analysisDate, WINDOW_8W_DAYS - 1),
    start_12w: subDays(analysisDate, WINDOW_12W_DAYS - 1),
    nutrition_window_days: NUTRITION_WINDOW_DAYS,
    timezone: 'Europe/Rome',
  }
}

/** Inclusive: start <= d <= end, on YYYY-MM-DD strings (lexicographic = chronological). */
export function inWindow(d: string, start: string, end: string): boolean {
  return d >= start && d <= end
}

/**
 * 12 ISO-week buckets (Monday-based), oldest → newest, ending with the week that
 * contains `analysisDate`. Empty weeks are included with count 0. Sessions after
 * `analysisDate` are never counted.
 */
export function buildWeeklySeries(analysisDate: string, sessionDates: string[]): WeeklyBucket[] {
  const week0 = getAppWeekStart(analysisDate)
  const buckets: WeeklyBucket[] = []
  for (let k = WEEKLY_SERIES_WEEKS - 1; k >= 0; k--) {
    const ws = subDays(week0, k * 7)
    const we = addDays(ws, 6)
    const count = sessionDates.filter((d) => d >= ws && d <= we && d <= analysisDate).length
    buckets.push({ week_start: ws, sessions_count: count })
  }
  return buckets
}
