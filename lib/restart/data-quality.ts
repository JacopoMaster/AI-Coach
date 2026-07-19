// Restart Baseline — per-domain data-quality classifiers (F2.2). PURE.
//
// Each classifier turns raw evidence (already computed by a domain aggregator)
// into a category. D016: quality = "can we trust a specific conclusion?", NOT
// "did the user do enough?". The aggregators always expose the raw evidence too.

import type { DataQualityLevel } from './types'
import {
  TRAINING_SUFFICIENT_MIN_HISTORY_SPAN_DAYS,
  PERFORMANCE_LIMITED_MAX_SESSIONS,
  BODY_SUFFICIENT_MIN_COUNT,
  BODY_SUFFICIENT_MIN_SPAN_DAYS,
  BODY_SUFFICIENT_MAX_STALENESS_DAYS,
  BODY_STALE_MAX_DAYS,
  NUTRITION_INSUFFICIENT_MAX_TRACKED_DAYS,
  NUTRITION_SUFFICIENT_MIN_TRACKED_DAYS,
  NUTRITION_SUFFICIENT_MIN_SPAN_DAYS,
} from './thresholds'

/**
 * Training consistency = historical COVERAGE. Zero recent sessions can still be
 * `sufficient` if we know the user has enough training history (they simply
 * paused). Only a total absence of known history is `insufficient`.
 */
export function classifyTrainingConsistency(historySpanDays: number | null): DataQualityLevel {
  if (historySpanDays == null) return 'insufficient'
  return historySpanDays >= TRAINING_SUFFICIENT_MIN_HISTORY_SPAN_DAYS ? 'sufficient' : 'limited'
}

/** Per-exercise: based on comparable recent sessions (with ≥1 valid set). */
export function classifyPerformance(comparableRecentSessions: number): DataQualityLevel {
  if (comparableRecentSessions <= 0) return 'insufficient'
  return comparableRecentSessions <= PERFORMANCE_LIMITED_MAX_SESSIONS ? 'limited' : 'sufficient'
}

/** Rolls per-exercise qualities into one: best available signal across exercises. */
export function rollUpPerformance(levels: DataQualityLevel[]): DataQualityLevel {
  if (levels.includes('sufficient')) return 'sufficient'
  if (levels.includes('limited')) return 'limited'
  return 'insufficient'
}

/**
 * Needs several measurements distributed over time (span) AND a recent latest
 * reading (freshness vs analysis_date):
 *   insufficient → ≤1 useful measurement, OR latest older than the stale limit
 *                  (a months-old reading does not represent the current state);
 *   sufficient   → ≥3 distinct dates, span ≥ 14d, latest ≤ 28d old;
 *   limited      → otherwise (≥2 useful measurements, latest ≤ 84d old).
 */
export function classifyBody(
  count: number,
  spanDays: number | null,
  daysSinceLatest: number | null
): DataQualityLevel {
  if (count <= 1) return 'insufficient'
  if (daysSinceLatest == null || daysSinceLatest > BODY_STALE_MAX_DAYS) return 'insufficient'
  if (
    count >= BODY_SUFFICIENT_MIN_COUNT &&
    (spanDays ?? 0) >= BODY_SUFFICIENT_MIN_SPAN_DAYS &&
    daysSinceLatest <= BODY_SUFFICIENT_MAX_STALENESS_DAYS
  ) {
    return 'sufficient'
  }
  return 'limited'
}

/** Tracking coverage over the window: tracked-day count AND their temporal span. */
export function classifyNutrition(trackedDays: number, spanDays: number | null): DataQualityLevel {
  if (trackedDays <= NUTRITION_INSUFFICIENT_MAX_TRACKED_DAYS) return 'insufficient'
  if (
    trackedDays >= NUTRITION_SUFFICIENT_MIN_TRACKED_DAYS &&
    (spanDays ?? 0) >= NUTRITION_SUFFICIENT_MIN_SPAN_DAYS
  ) {
    return 'sufficient'
  }
  return 'limited'
}
