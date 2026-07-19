// Athlete Profile — Italian UI labels & option lists (F1.4).
//
// UI-only module (no server deps): maps the enum-like vocabularies from
// types.ts to user-friendly Italian labels, and provides suggested (NOT closed)
// options for the open text[] fields. The DB/API vocabulary is unchanged; these
// are presentation concerns.

import type {
  PrimaryGoal,
  ExperienceLevel,
  Weekday,
  WorkPattern,
  DailyActivityLevel,
  PreferredTrainingTime,
  NutritionGoal,
  CookingAvailability,
  CoachingStyle,
  ExplanationDetail,
  FlexibilityPreference,
  Sex,
} from './types'
import type { RestartReadyKey } from './completeness'

export interface Option<T extends string> {
  value: T
  label: string
  description?: string
}

export const PRIMARY_GOAL_OPTIONS: Option<PrimaryGoal>[] = [
  { value: 'return_to_consistency', label: 'Tornare costante' },
  { value: 'recomp', label: 'Ricomposizione corporea' },
  { value: 'fat_loss', label: 'Perdere grasso' },
  { value: 'muscle_gain', label: 'Aumentare massa muscolare' },
  { value: 'strength', label: 'Aumentare la forza' },
  { value: 'maintenance', label: 'Mantenimento' },
]

export const EXPERIENCE_LEVEL_OPTIONS: Option<ExperienceLevel>[] = [
  { value: 'beginner', label: 'Principiante' },
  { value: 'intermediate', label: 'Intermedio' },
  { value: 'advanced', label: 'Avanzato' },
]

export const WEEKDAY_OPTIONS: Option<Weekday>[] = [
  { value: 'mon', label: 'Lun' },
  { value: 'tue', label: 'Mar' },
  { value: 'wed', label: 'Mer' },
  { value: 'thu', label: 'Gio' },
  { value: 'fri', label: 'Ven' },
  { value: 'sat', label: 'Sab' },
  { value: 'sun', label: 'Dom' },
]

export const WORK_PATTERN_OPTIONS: Option<WorkPattern>[] = [
  { value: 'fixed_daytime', label: 'Orario fisso' },
  { value: 'shift', label: 'Turni' },
  { value: 'irregular', label: 'Orari irregolari' },
  { value: 'remote', label: 'Lavoro da remoto' },
  { value: 'student', label: 'Studio' },
]

export const DAILY_ACTIVITY_LEVEL_OPTIONS: Option<DailyActivityLevel>[] = [
  { value: 'sedentary', label: 'Sedentario' },
  { value: 'light', label: 'Leggermente attivo' },
  { value: 'moderate', label: 'Moderatamente attivo' },
  { value: 'active', label: 'Attivo' },
]

export const PREFERRED_TRAINING_TIME_OPTIONS: Option<PreferredTrainingTime>[] = [
  { value: 'morning', label: 'Mattina' },
  { value: 'afternoon', label: 'Pomeriggio' },
  { value: 'evening', label: 'Sera' },
  { value: 'variable', label: 'Variabile' },
]

export const NUTRITION_GOAL_OPTIONS: Option<NutritionGoal>[] = [
  { value: 'fat_loss', label: 'Perdere grasso' },
  { value: 'maintenance', label: 'Mantenimento' },
  { value: 'muscle_gain', label: 'Aumentare massa muscolare' },
  { value: 'recomp', label: 'Ricomposizione corporea' },
]

export const COOKING_AVAILABILITY_OPTIONS: Option<CookingAvailability>[] = [
  { value: 'none', label: 'Non cucino' },
  { value: 'low', label: 'Poco tempo' },
  { value: 'medium', label: 'Tempo moderato' },
  { value: 'high', label: 'Cucino volentieri' },
]

export const COACHING_STYLE_OPTIONS: Option<CoachingStyle>[] = [
  { value: 'supportive', label: 'Supportivo', description: 'Incoraggiante e paziente.' },
  { value: 'direct', label: 'Diretto', description: 'Chiaro e sintetico, senza troppi giri.' },
  { value: 'tough_love', label: 'Motivante e severo', description: 'Ti spinge a non mollare.' },
]

export const EXPLANATION_DETAIL_OPTIONS: Option<ExplanationDetail>[] = [
  { value: 'minimal', label: 'Solo indicazioni essenziali' },
  { value: 'standard', label: 'Spiegazione equilibrata' },
  {
    value: 'detailed',
    label: 'Voglio capire il perché',
    description: 'Il Coach motiverà maggiormente le decisioni importanti.',
  },
]

export const FLEXIBILITY_PREFERENCE_OPTIONS: Option<FlexibilityPreference>[] = [
  { value: 'strict', label: 'Preferisco una struttura rigida' },
  { value: 'balanced', label: 'Equilibrio tra struttura e adattamento' },
  { value: 'flexible', label: 'Preferisco adattabilità' },
]

export const SEX_OPTIONS: Option<Sex>[] = [
  { value: 'male', label: 'Maschile' },
  { value: 'female', label: 'Femminile' },
]

// ─── Suggested (NON-closed) options for open text[] fields ───────────────────
export const EQUIPMENT_SUGGESTIONS = [
  'Palestra completa',
  'Bilanciere',
  'Manubri',
  'Macchine',
  'Cavi',
  'Corpo libero',
  'Cardio',
]

export const TRAINING_BARRIER_SUGGESTIONS = [
  'Tempo',
  'Lavoro',
  'Energia',
  'Motivazione',
  'Caldo',
  'Viaggi',
  'Routine instabile',
]

export const NUTRITION_BARRIER_SUGGESTIONS = [
  'Poco tempo',
  'Stanchezza',
  'Mangiare fuori',
  'Voglie/fame',
  'Fatica nel tracciare',
  'Routine lavorativa',
]

export const DIETARY_PREFERENCE_SUGGESTIONS = [
  'Onnivoro',
  'Vegetariano',
  'Vegano',
  'Alto apporto proteico',
]

// Italian labels for the restart-ready fields, used to phrase the "missing"
// hint without exposing technical column names.
export const RESTART_FIELD_LABELS: Record<RestartReadyKey, string> = {
  primary_goal: 'Obiettivo principale',
  experience_level: 'Livello di esperienza',
  target_sessions_per_week: 'Sessioni settimanali ideali',
  minimum_sessions_per_week: 'Sessioni settimanali minime',
  preferred_training_days: 'Giorni preferiti',
  preferred_session_duration_minutes: 'Durata ideale della sessione',
  minimum_session_duration_minutes: 'Durata minima utile',
  available_equipment: 'Attrezzatura disponibile',
  training_limitations: 'Limitazioni di allenamento',
}
