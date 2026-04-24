// Shared types for the gamification layer.
// Mirrors the schema in supabase/migrations/006_spiral_energy.sql.

import type { SpiralStage } from './exp-curve'

export type { SpiralStage }

export type ExpSource =
  | 'workout_session'
  | 'diet_log'
  | 'weight_log'
  | 'body_measurement'
  | 'weekly_checkin'
  | 'meso_complete'
  | 'giga_drill_break'
  | 'perfect_week'
  | 'achievement'

export type StatTag = 'forza' | 'resistenza' | 'agilita' | 'all' | null

export interface UserStats {
  user_id: string
  level: number
  exp_total: number
  spiral_stage: SpiralStage
  core_drill_tier: number
  resonance_mult: number
  resonance_last_tick: string | null
  perfect_week_streak: number
  longest_streak: number
  pierced_the_heavens: boolean
  pierced_at: string | null
  baseline_tonnage: number | null
  updated_at: string
}

export interface ExpHistoryEntry {
  id: string
  user_id: string
  delta: number
  base_exp: number
  multiplier: number
  source: ExpSource
  source_id: string | null
  stat_tagged: StatTag
  rationale: string | null
  created_at: string
}

export interface PersonalRecord {
  id: string
  user_id: string
  plan_exercise_id: string | null
  exercise_name: string
  record_type: 'max_tonnage' | 'max_weight' | 'max_reps'
  value: number
  session_id: string | null
  achieved_at: string
}

export type SpiralEvolutionEventType =
  | 'tier_up'
  | 'stage_up'
  | 'pierce_the_heavens'
  | 'meso_clear'
  | 'giga_drill'

export interface SpiralEvolutionEvent {
  id: string
  user_id: string
  event_type: SpiralEvolutionEventType
  from_value: string | null
  to_value: string | null
  payload: Record<string, unknown> | null
  flavor_quote: string | null
  seen: boolean
  created_at: string
}

export interface VacationPeriod {
  id: string
  user_id: string
  start_date: string
  end_date: string
  reason: string | null
  created_at: string
}

export interface Achievement {
  code: string
  name: string
  description: string
  icon: string
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary'
  exp_reward: number
  hidden: boolean
}

export interface UserAchievement {
  user_id: string
  achievement_code: string
  unlocked_at: string
}

/** Returned inside the JSON body of any POST that awards EXP. */
export interface Reward {
  delta: number
  base_exp: number
  multiplier: number
  new_total: number
  new_level: number
  leveled_up: boolean
  tier_up?: { from: number; to: number }
  stage_up?: { from: SpiralStage; to: SpiralStage }
  pierced?: boolean
  giga_drill?: {
    exercise_name: string
    from_tonnage: number
    to_tonnage: number
    improvement_pct: number
    bonus_exp: number
  }
  /** Populated when the lazy Perfect-Week tick just credited a perfect week.
   *  Missed-week decays are not surfaced here — they update user_stats silently
   *  and the UI picks them up on the next refresh. */
  perfect_week?: {
    week_start: string
    streak: number
    resonance_mult: number
  }
  unlocked_achievements?: Achievement[]
  rationale?: string
}
