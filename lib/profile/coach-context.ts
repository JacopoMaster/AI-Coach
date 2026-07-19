// Athlete Profile → compact, read-only context block for the Coach (F1.5).
//
// PURE (no I/O). Renders the STABLE profile as descriptive DATA for the model:
//   • excludes user_id / created_at / updated_at (and every DB metadatum);
//   • includes only fields the user actually answered (null → omitted);
//   • preserves the null vs [] distinction: an explicit empty array is shown as
//     "nessuno indicato" (user answered "none"), never conflated with an
//     unanswered null (which is simply left out);
//   • never invents values.
// The block is DATA, not instructions — the interpretation rules and the
// prompt-injection guardrail live in the system prompt (system-prompt.ts).

import type { AthleteProfile } from './types'
import { getProfileCompleteness } from './completeness'

const HEADER = '=== PROFILO ATLETA (dato dichiarato dall\'utente, sola lettura) ==='

/** null/undefined → omit; otherwise the string value. */
function scalar(v: string | number | null): string | undefined {
  return v == null ? undefined : String(v)
}

/** Free text, quoted so its boundaries are unambiguous inside the data block. */
function text(v: string | null): string | undefined {
  return v == null ? undefined : `"${v}"`
}

/** null → omit; [] → explicit "none"; otherwise a comma list. */
function list(v: string[] | null): string | undefined {
  if (v == null) return undefined
  return v.length === 0 ? 'nessuno indicato' : v.join(', ')
}

type Pair = [string, string | undefined]

function group(label: string, pairs: Pair[]): string | undefined {
  const present = pairs.filter(([, v]) => v !== undefined) as [string, string][]
  if (present.length === 0) return undefined
  return `${label}: ${present.map(([k, v]) => `${k}=${v}`).join('; ')}`
}

/**
 * Build the Coach context block for the profile. A null profile yields a short
 * "not compiled" marker (so the model knows to ask instead of assuming), never
 * an empty/absent block.
 */
export function formatAthleteProfileForCoach(profile: AthleteProfile | null): string {
  if (!profile) {
    return `${HEADER}\nNon ancora compilato (profile_status: not_started).`
  }

  const p = profile
  const groups = [
    `profile_status: ${getProfileCompleteness(p)}`,
    group('Obiettivi', [
      ['principale', scalar(p.primary_goal)],
      ['secondari', list(p.secondary_goals)],
      ['note', text(p.goal_notes)],
    ]),
    group('Esperienza', [
      ['livello', scalar(p.experience_level)],
      ['anni', scalar(p.years_training)],
    ]),
    group('Sostenibilità', [
      ['sessioni_target/sett', scalar(p.target_sessions_per_week)],
      ['sessioni_minime/sett', scalar(p.minimum_sessions_per_week)],
      ['giorni_preferiti', list(p.preferred_training_days)],
      ['durata_ideale_min', scalar(p.preferred_session_duration_minutes)],
      ['durata_minima_min', scalar(p.minimum_session_duration_minutes)],
    ]),
    group('Allenamento', [
      ['attrezzatura', list(p.available_equipment)],
      ['preferiti', list(p.preferred_exercises)],
      ['da_evitare', list(p.avoided_exercises)],
      ['limitazioni', list(p.training_limitations)],
      ['note_infortuni', text(p.injuries_or_pain_notes)],
    ]),
    group('Lifestyle', [
      ['lavoro', scalar(p.work_pattern)],
      ['note_orari', text(p.schedule_notes)],
      ['attività_quotidiana', scalar(p.daily_activity_level)],
      ['momento_preferito', scalar(p.preferred_training_time)],
    ]),
    group('Barriere', [
      ['allenamento', list(p.main_training_barriers)],
      ['alimentazione', list(p.main_nutrition_barriers)],
    ]),
    group('Nutrizione', [
      ['obiettivo', scalar(p.nutrition_goal)],
      ['preferenze', list(p.dietary_preferences)],
      ['restrizioni', list(p.dietary_restrictions)],
      ['allergie', list(p.allergies)],
      ['cucina', scalar(p.cooking_availability)],
    ]),
    group('Coaching', [
      ['stile', scalar(p.coaching_style)],
      ['dettaglio_spiegazioni', scalar(p.explanation_detail)],
      ['flessibilità', scalar(p.flexibility_preference)],
    ]),
    group('Contesto_fisico', [
      ['data_nascita', scalar(p.birth_date)],
      ['sesso', scalar(p.sex)],
      ['altezza_cm', scalar(p.height_cm)],
    ]),
  ].filter((g): g is string => g !== undefined)

  return `${HEADER}\n${groups.join('\n')}`
}
