// Restart Baseline — centralized, documented data-quality thresholds (F2.2).
//
// These are DATA SUFFICIENCY thresholds ("do we have enough coverage to
// interpret X?"), NOT behavioural targets ("did the user train/eat enough?").
// D016: they must never conflate data quality with the quality of the user's
// consistency. Tunable in one place after real-data verification.

// ─── Windows ────────────────────────────────────────────────────────────────
export const WEEK_DAYS = 7
export const WINDOW_4W_DAYS = 28
export const WINDOW_8W_DAYS = 56
export const WINDOW_12W_DAYS = 84
export const WEEKLY_SERIES_WEEKS = 12
export const NUTRITION_WINDOW_DAYS = 28
// Performance "recent" window (D017) and the bounded reference window used to
// recompute historical_reference_52w from session_exercises (NOT personal_records,
// NOT unbounded history — deliberately not "all-time").
export const PERFORMANCE_WINDOW_DAYS = 56 // 8 weeks
export const REFERENCE_WINDOW_DAYS = 364 // 52 weeks — bounds historical_reference_52w

// ─── Training consistency data quality (historical COVERAGE) ─────────────────
// `sufficient` means we have enough HISTORY to interpret the recent windows,
// regardless of whether recent sessions are many or zero. A user with old
// history but zero recent sessions is HIGH quality data (we know they paused).
export const TRAINING_SUFFICIENT_MIN_HISTORY_SPAN_DAYS = 56 // ≥ 8 weeks of history

// ─── Performance data quality (per exercise) ─────────────────────────────────
// Based on comparable recent sessions (sessions with ≥1 valid set) in the perf window.
export const PERFORMANCE_LIMITED_MAX_SESSIONS = 2 // 1–2 → limited; ≥3 → sufficient; 0 → insufficient
export const MAX_RECENT_HISTORY_PER_EXERCISE = 8 // bounded output
export const MAX_EXERCISES_IN_PERFORMANCE = 40 // bounded output
// (estimated 1RM removed in F2.2 — no reliable load-type semantics.)

// ─── Body data quality ───────────────────────────────────────────────────────
// Needs several measurements distributed over time AND a recent latest reading:
// 3 weigh-ins on the same day are NOT a trend, and a months-old latest reading
// does not represent the CURRENT state.
export const BODY_SUFFICIENT_MIN_COUNT = 3
export const BODY_SUFFICIENT_MIN_SPAN_DAYS = 14
export const BODY_SUFFICIENT_MAX_STALENESS_DAYS = 28 // latest ≤ 28d for `sufficient`
export const BODY_STALE_MAX_DAYS = 84 // latest > 84d → `insufficient` (not current)

// ─── Nutrition tracking data quality (over the 28-day window) ────────────────
// Coverage of TRACKING, not diet adherence. Ratio alone is misleading when
// tracking just started, so span between first/last tracked day matters too.
export const NUTRITION_INSUFFICIENT_MAX_TRACKED_DAYS = 3
export const NUTRITION_SUFFICIENT_MIN_TRACKED_DAYS = 14
export const NUTRITION_SUFFICIENT_MIN_SPAN_DAYS = 21
