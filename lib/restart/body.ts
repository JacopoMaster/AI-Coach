// Restart Baseline — body aggregator (F2.2). PURE. Uses body_measurements only
// (D009: no waist, no new metric). Trend = simple, explainable first-vs-last in
// the window (no linear regression, no false precision). body_fat/muscle are
// bioimpedance ESTIMATES, marked device-derived — never treated as clinical.

import { diffCalendarDays } from '@/lib/date/app-date'
import { inWindow } from './windows'
import { classifyBody } from './data-quality'
import type { RawBodyMeasurement } from './queries'
import type {
  AnalysisPeriod,
  BodyBaseline,
  EstimatedBodyMetricChange,
  WeightChange,
} from './types'

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function firstLastWithValue(
  measurements: RawBodyMeasurement[],
  key: 'weight_kg' | 'body_fat_pct' | 'muscle_mass_kg'
): { from: RawBodyMeasurement; to: RawBodyMeasurement } | null {
  const withVal = measurements.filter((m) => m[key] != null)
  if (withVal.length < 2) return null
  return { from: withVal[0], to: withVal[withVal.length - 1] } // measurements are date-ascending
}

function weightChange(
  all12w: RawBodyMeasurement[],
  start: string,
  end: string,
  windowWeeks: 4 | 8 | 12
): WeightChange | null {
  const inWin = all12w.filter((m) => inWindow(m.date, start, end))
  const fl = firstLastWithValue(inWin, 'weight_kg')
  if (!fl) return null
  return {
    window_weeks: windowWeeks,
    from_date: fl.from.date,
    to_date: fl.to.date,
    delta_kg: round1((fl.to.weight_kg as number) - (fl.from.weight_kg as number)),
  }
}

function estChange(
  all12w: RawBodyMeasurement[],
  key: 'body_fat_pct' | 'muscle_mass_kg',
  metric: EstimatedBodyMetricChange['metric']
): EstimatedBodyMetricChange | null {
  const fl = firstLastWithValue(all12w, key)
  if (!fl) return null
  return {
    metric,
    from_date: fl.from.date,
    to_date: fl.to.date,
    delta: round1((fl.to[key] as number) - (fl.from[key] as number)),
  }
}

export function buildBody(params: {
  period: AnalysisPeriod
  measurements12w: RawBodyMeasurement[] // date-ascending, within 12w
  latest: RawBodyMeasurement | null // most recent ≤ end (may be older than 12w)
}): BodyBaseline {
  const { period, measurements12w, latest } = params

  const weightRows = measurements12w.filter((m) => m.weight_kg != null)
  const distinctWeightDates = [...new Set(weightRows.map((m) => m.date))].sort()
  const span_days_12w =
    distinctWeightDates.length >= 2
      ? diffCalendarDays(distinctWeightDates[0], distinctWeightDates[distinctWeightDates.length - 1])
      : distinctWeightDates.length === 1
        ? 0
        : null
  const count = distinctWeightDates.length
  const days_since_latest_measurement =
    latest?.date != null ? diffCalendarDays(latest.date, period.analysis_date) : null

  return {
    latest_measurement_date: latest?.date ?? null,
    latest_weight_kg: latest?.weight_kg ?? null,
    weight_change_4w: weightChange(measurements12w, period.start_4w, period.end, 4),
    weight_change_8w: weightChange(measurements12w, period.start_8w, period.end, 8),
    weight_change_12w: weightChange(measurements12w, period.start_12w, period.end, 12),
    weight_measurements_count_12w: count,
    measurement_span_days_12w: span_days_12w,
    days_since_latest_measurement,
    estimated_metrics: {
      device_derived: true,
      source: 'scale_bioimpedance',
      body_fat_pct_change_12w: estChange(measurements12w, 'body_fat_pct', 'body_fat_pct'),
      muscle_mass_kg_change_12w: estChange(measurements12w, 'muscle_mass_kg', 'muscle_mass_kg'),
    },
    data_quality: classifyBody(count, span_days_12w, days_since_latest_measurement),
    data_quality_evidence: {
      measurements_count_12w: count,
      span_days_12w,
      days_since_latest_measurement,
    },
  }
}
