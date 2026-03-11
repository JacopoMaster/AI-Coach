export interface BodyMeasurement {
  id: string
  user_id: string
  date: string
  weight_kg: number | null
  body_fat_pct: number | null
  muscle_mass_kg: number | null
  water_pct: number | null
  bone_mass_kg: number | null
  bmi: number | null
  bmr: number | null
  visceral_fat: number | null
  metabolic_age: number | null
  notes: string | null
}

export interface WorkoutPlan {
  id: string
  user_id: string
  name: string
  is_active: boolean
  notes: string | null
  created_at: string
  days?: WorkoutPlanDay[]
}

export interface WorkoutPlanDay {
  id: string
  plan_id: string
  day_name: string
  day_order: number
  exercises?: PlanExercise[]
}

export interface PlanExercise {
  id: string
  day_id: string
  name: string
  sets: number
  reps: string
  weight_kg: number | null
  notes: string | null
  order: number
}

export interface WorkoutSession {
  id: string
  user_id: string
  date: string
  plan_day_id: string | null
  overall_notes: string | null
  plan_day?: WorkoutPlanDay
  exercises?: SessionExercise[]
}

export interface SessionExercise {
  id: string
  session_id: string
  plan_exercise_id: string | null
  sets_done: number | null
  reps_done: string | null
  weight_kg: number | null
  notes: string | null
  rpe: number | null
  plan_exercise?: PlanExercise
}

export interface DietPlan {
  id: string
  user_id: string
  name: string
  is_active: boolean
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  notes: string | null
}

export interface DietLog {
  id: string
  user_id: string
  date: string
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  notes: string | null
}

export interface Food {
  id: string
  user_id: string
  name: string
  calories_per_100g: number
  proteins_per_100g: number
  carbs_per_100g: number
  fats_per_100g: number
  created_at: string
}

export interface NutritionEntry {
  id: string
  user_id: string
  date: string
  food_id: string | null
  grams: number | null
  name: string
  calories: number
  proteins: number
  carbs: number
  fats: number
  created_at: string
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

// ─── Mesocycle system (v1.1) ──────────────────────────────────────────────────

export interface Mesocycle {
  id: string
  user_id: string
  workout_plan_id: string
  name: string
  start_date: string          // ISO date "YYYY-MM-DD"
  end_date: string | null     // null while active
  duration_weeks: 6 | 8
  status: 'active' | 'completed' | 'archived'
  notes: string | null
  created_at: string
  // Computed client-side (not stored in DB)
  current_week?: number
}

export interface ExerciseProgression {
  id: string
  mesocycle_id: string
  plan_exercise_id: string
  week_number: number         // 1..8
  target_sets: number | null
  target_reps: number | null
  target_weight_kg: number | null
  notes: string | null
}

export interface WeeklyCheckIn {
  id: string
  user_id: string
  mesocycle_id: string
  week_number: number
  check_in_date: string       // ISO date
  check_in_type: 'weekly' | 'end_of_meso'
  session_data: Record<string, unknown> | null
  ai_analysis: WeeklyCheckInAnalysis | EndOfMesoAnalysis | null
  applied: boolean
  created_at: string
}

// ─── AI check-in analysis shapes (mirrors LLM JSON output) ───────────────────

export interface ExerciseUpdate {
  plan_exercise_id: string
  exercise_name: string
  current_weight_kg: number
  current_reps: number
  recommended_weight_kg: number
  recommended_reps: number
  action: 'increase_reps' | 'increase_weight' | 'maintain' | 'decrease'
  rationale: string
}

export interface DietFeedback {
  avg_calories: number
  avg_protein_g: number
  recommendation: string
}

export interface WeeklyCheckInAnalysis {
  week_summary: {
    sessions_completed: number
    overall_fatigue: 'low' | 'medium' | 'high'
    overall_adherence: number   // 0..1
    observations: string
  }
  exercise_updates: ExerciseUpdate[]
  diet_feedback?: DietFeedback
}

export interface EndOfMesoExerciseChange {
  action: 'keep' | 'replace'
  plan_exercise_id?: string       // present for 'keep'
  exercise_name?: string          // present for 'keep'
  rationale: string
  old_exercise?: {
    plan_exercise_id: string
    name: string
  }
  new_exercise?: {
    name: string
    sets: number
    reps: number
    weight_kg: number
  }
}

export interface EndOfMesoAnalysis {
  meso_summary: {
    total_sessions: number
    avg_adherence: number         // 0..1
    overall_progress: 'poor' | 'fair' | 'good' | 'excellent'
    narrative: string
  }
  exercise_changes: EndOfMesoExerciseChange[]
  new_meso_targets: {
    duration_weeks: 6 | 8
    notes: string
  }
}
