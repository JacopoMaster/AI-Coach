// Restart Baseline — shared types (F2.2).
//
// A deterministic, SERIALIZABLE snapshot of the user's current situation, built
// by server-side error-honest aggregators. It contains FACTS only (no AI
// interpretation, D018/D028-scope): counts, trends, structural plan facts, and
// per-domain data quality. Never persisted here (that is F2.4+), never given to
// the AI here (F2.5). No Supabase clients, Error objects, or functions inside.

export type DataQualityLevel = 'insufficient' | 'limited' | 'sufficient'

// Purely factual comparison of the plan's distinct cycle days vs a frequency
// number. NOT a compatibility verdict: e.g. a 2-day A/B plan can be run 3×/week
// in rotation (A/B/A, B/A/B), so plan_day_count ≠ prescribed_sessions_per_week.
export type PlanDaysComparison = 'below' | 'equal' | 'above' | 'unknown'

/** Calendar windows relative to the analysis date, all in Europe/Rome (D002). */
export interface AnalysisPeriod {
  analysis_date: string // YYYY-MM-DD, the inclusive end of every window
  end: string // === analysis_date
  start_4w: string // 28-day inclusive window [start_4w, end]
  start_8w: string // 56-day inclusive window
  start_12w: string // 84-day inclusive window
  nutrition_window_days: number // 28
  timezone: 'Europe/Rome'
}

export interface WindowedCount {
  sessions_count: number // number of workout_session rows in the window
  training_days_count: number // distinct calendar days with ≥1 session
  sessions_per_week_average: number // sessions_count / (window_days / 7)
}

export interface WeeklyBucket {
  week_start: string // Monday (ISO) of the bucket, YYYY-MM-DD
  sessions_count: number // includes 0 for empty weeks
}

export interface TrainingConsistencyBaseline {
  window_4w: WindowedCount
  window_8w: WindowedCount
  window_12w: WindowedCount
  weekly_series_12w: WeeklyBucket[] // 12 buckets, oldest → newest, zeros included
  last_session_date: string | null // most recent session ≤ analysis_date
  days_since_last_session: number | null
  first_known_session_date: string | null // earliest session ≤ analysis_date
  target_sessions_per_week: number | null // from profile
  minimum_sessions_per_week: number | null // from profile
  data_quality: DataQualityLevel // historical COVERAGE, not consistency
  data_quality_evidence: {
    first_known_session_date: string | null
    history_span_days: number | null
    sessions_count_12w: number
  }
}

export interface PerfSetRef {
  weight_kg: number
  reps: number
  date: string
}

export interface PerfHistoryItem {
  date: string
  session_id: string
  highest_load_set: PerfSetRef | null // highest observed valid load (reps preserved)
  tonnage: number // volume proxy (NOT strength), reps-range → low bound
}

export interface ExercisePerformance {
  exercise_key: string // normalized name (grouping key)
  exercise_name: string // display name (first seen)
  recent_sessions_count: number // sessions with this exercise in the perf window
  comparable_recent_sessions: number // of those, with ≥1 valid set
  // Highest observed valid load in the perf window, with its reps/date preserved.
  // "Highest load" = max weight_kg (NOT weight*reps); ties broken by most recent date.
  highest_load_recent_set: PerfSetRef | null
  recent_history: PerfHistoryItem[] // bounded, newest → oldest
  // Heaviest valid set within the last 52 weeks (recomputed from session_exercises,
  // NOT personal_records, NOT unbounded history). Deliberately NOT called "all-time":
  // the AI must not read it as an absolute historical record.
  historical_reference_52w: PerfSetRef | null
  tonnage_recent_total: number | null // sum of tonnage in the perf window
  // NB: estimated 1RM is intentionally NOT produced in F2.2 — the schema has no
  // reliable load-type semantics (external vs per-dumbbell vs machine stack vs
  // assisted vs weighted-bodyweight), so an e1RM would be false precision.
  data_quality: DataQualityLevel // per-exercise
}

export interface PerformanceBaseline {
  performance_window_weeks: number // 8
  reference_window_weeks: number // 52 (bounds historical_reference_52w; NOT all-time)
  exercises: ExercisePerformance[] // bounded count
  notes: {
    reps_range_uses_low_bound: true
    tonnage_is_volume_not_strength: true
    historical_reference_bounded_to_52w: true
  }
}

export interface WeightChange {
  window_weeks: 4 | 8 | 12
  from_date: string
  to_date: string
  delta_kg: number // to.weight - from.weight (first vs last measurement in window)
}

export interface EstimatedBodyMetricChange {
  metric: 'body_fat_pct' | 'muscle_mass_kg'
  from_date: string
  to_date: string
  delta: number
}

export interface BodyBaseline {
  latest_measurement_date: string | null
  latest_weight_kg: number | null
  weight_change_4w: WeightChange | null
  weight_change_8w: WeightChange | null
  weight_change_12w: WeightChange | null
  weight_measurements_count_12w: number
  measurement_span_days_12w: number | null
  days_since_latest_measurement: number | null // freshness vs analysis_date
  // Bioimpedance/device-derived estimates — NOT clinical measurements.
  estimated_metrics: {
    device_derived: true
    source: 'scale_bioimpedance'
    body_fat_pct_change_12w: EstimatedBodyMetricChange | null
    muscle_mass_kg_change_12w: EstimatedBodyMetricChange | null
  }
  data_quality: DataQualityLevel
  data_quality_evidence: {
    measurements_count_12w: number
    span_days_12w: number | null
    days_since_latest_measurement: number | null
  }
}

export interface NutritionBaseline {
  window_days: number // 28
  tracked_days: number // days with ≥1 nutrition_entry (never inferred as 0 kcal)
  total_days_in_window: number // 28
  tracked_days_ratio: number
  first_tracked_date: string | null
  last_tracked_date: string | null
  tracked_span_days: number | null
  avg_calories_on_tracked_days: number | null
  avg_protein_on_tracked_days: number | null
  avg_carbs_on_tracked_days: number | null
  avg_fat_on_tracked_days: number | null
  active_diet_targets: {
    calories: number | null
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
  } | null
  data_quality: DataQualityLevel
  data_quality_evidence: {
    tracked_days: number
    tracked_span_days: number | null
  }
}

export interface PlanFitDay {
  day_name: string
  exercises_count: number
  total_planned_sets: number
}

export interface PlanConflict {
  plan_exercise_name: string
  matched_against: string // the avoided_exercise / limitation entry it relates to
  source: 'avoided_exercises' | 'training_limitations'
  reason: string
}

export interface PlanFitReport {
  has_active_plan: boolean
  plan_id: string | null
  plan_day_count: number
  target_sessions_per_week: number | null
  minimum_sessions_per_week: number | null
  // Factual comparison of plan_day_count vs target/minimum — NOT a verdict on
  // whether the plan is compatible with that frequency (see PlanDaysComparison).
  plan_days_vs_target: PlanDaysComparison
  plan_days_vs_minimum: PlanDaysComparison
  days: PlanFitDay[]
  confirmed_conflicts: PlanConflict[] // exact (normalized) match with avoided_exercises
  possible_conflicts: PlanConflict[] // ambiguous overlap — "to verify", never authoritative
  limitations: string[] | null // declared training_limitations (context, unmodified)
  // Session duration cannot be derived from current data (D017/D021).
  duration_assessability: 'unavailable'
}

export interface MesocycleContext {
  active_mesocycle_exists: boolean
  active_mesocycle_id: string | null
  start_date: string | null
  end_date: string | null
  status: string | null
}

export interface RestartBaseline {
  analysis_period: AnalysisPeriod
  training_consistency: TrainingConsistencyBaseline
  performance: PerformanceBaseline
  body: BodyBaseline
  nutrition: NutritionBaseline
  plan_fit: PlanFitReport
  mesocycle_context: MesocycleContext
  data_quality: {
    training_consistency: DataQualityLevel
    performance: DataQualityLevel // rolled up across exercises
    body: DataQualityLevel
    nutrition: DataQualityLevel
  }
}
