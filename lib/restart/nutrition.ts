// Restart Baseline — nutrition aggregator (F2.2). PURE.
//
// Consumes per-day totals from getDailyNutritionTotals (source of truth
// nutrition_entries, D001; error-honest). A day WITHOUT entries is simply absent
// from the input — it is `untracked`, NEVER 0 kcal and NEVER "non-adherent"
// (D017). Averages are over TRACKED days only. Quality = tracking coverage.

import { diffCalendarDays } from '@/lib/date/app-date'
import type { DailyNutritionTotals } from '@/lib/diet/daily-totals'
import { classifyNutrition } from './data-quality'
import { NUTRITION_WINDOW_DAYS } from './thresholds'
import type { RawActiveDietPlan } from './queries'
import type { NutritionBaseline } from './types'

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

export function buildNutrition(params: {
  dailyTotals: DailyNutritionTotals[] // only tracked days, within the 28-day window
  dietPlan: RawActiveDietPlan | null
}): NutritionBaseline {
  const tracked = params.dailyTotals
  const trackedDates = tracked.map((d) => d.date).sort()
  const tracked_days = tracked.length
  const first = trackedDates[0] ?? null
  const last = trackedDates[trackedDates.length - 1] ?? null
  const tracked_span_days = first && last ? diffCalendarDays(first, last) : null

  return {
    window_days: NUTRITION_WINDOW_DAYS,
    tracked_days,
    total_days_in_window: NUTRITION_WINDOW_DAYS,
    tracked_days_ratio: Math.round((tracked_days / NUTRITION_WINDOW_DAYS) * 100) / 100,
    first_tracked_date: first,
    last_tracked_date: last,
    tracked_span_days,
    avg_calories_on_tracked_days: avg(tracked.map((d) => d.calories)),
    avg_protein_on_tracked_days: avg(tracked.map((d) => d.protein_g)),
    avg_carbs_on_tracked_days: avg(tracked.map((d) => d.carbs_g)),
    avg_fat_on_tracked_days: avg(tracked.map((d) => d.fat_g)),
    active_diet_targets: params.dietPlan
      ? {
          calories: params.dietPlan.calories,
          protein_g: params.dietPlan.protein_g,
          carbs_g: params.dietPlan.carbs_g,
          fat_g: params.dietPlan.fat_g,
        }
      : null,
    data_quality: classifyNutrition(tracked_days, tracked_span_days),
    data_quality_evidence: {
      tracked_days,
      tracked_span_days,
    },
  }
}
