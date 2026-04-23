// Vacation Mode helpers — "Modalità Episodio in Spiaggia".
// Pauses resonance decay + scales Perfect Week thresholds when the user is
// inside a declared vacation window. Opt-in only; we never guess.

import type { SupabaseClient } from '@supabase/supabase-js'

const MS_PER_DAY = 1000 * 60 * 60 * 24

/** Returns true if `dateISO` (YYYY-MM-DD) falls inside any vacation window. */
export async function isOnVacation(
  supabase: SupabaseClient,
  userId: string,
  dateISO: string
): Promise<boolean> {
  const { data } = await supabase
    .from('vacation_periods')
    .select('id')
    .eq('user_id', userId)
    .lte('start_date', dateISO)
    .gte('end_date', dateISO)
    .limit(1)

  return !!data && data.length > 0
}

/** Count of days inside [weekStart, weekStart+6] that are on vacation.
 *  Used by checkPerfectWeek to scale thresholds proportionally. */
export async function vacationDaysInWeek(
  supabase: SupabaseClient,
  userId: string,
  weekStartISO: string
): Promise<number> {
  const weekStart = new Date(weekStartISO)
  const weekEnd = new Date(weekStart.getTime() + 6 * MS_PER_DAY)
  const weekEndISO = weekEnd.toISOString().split('T')[0]

  const { data } = await supabase
    .from('vacation_periods')
    .select('start_date, end_date')
    .eq('user_id', userId)
    .lte('start_date', weekEndISO)
    .gte('end_date', weekStartISO)

  if (!data || data.length === 0) return 0

  const daysCovered = new Set<string>()
  for (const v of data) {
    const vStart = new Date(Math.max(new Date(v.start_date).getTime(), weekStart.getTime()))
    const vEnd = new Date(Math.min(new Date(v.end_date).getTime(), weekEnd.getTime()))
    const days = Math.floor((vEnd.getTime() - vStart.getTime()) / MS_PER_DAY)
    for (let i = 0; i <= days; i++) {
      const d = new Date(vStart.getTime() + i * MS_PER_DAY)
      daysCovered.add(d.toISOString().split('T')[0])
    }
  }
  return daysCovered.size
}

/** Validates whether the user is allowed to start a new vacation.
 *  Max 14 days per vacation (DB constraint). Max 2 active-or-recent vacations
 *  per rolling 90-day window — business rule enforced here. */
export async function canStartVacation(
  supabase: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string
): Promise<{ ok: boolean; reason?: string }> {
  const durationDays = Math.floor(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / MS_PER_DAY
  )
  if (durationDays < 0) return { ok: false, reason: 'end_date precedente a start_date' }
  if (durationDays > 14) return { ok: false, reason: 'Massimo 14 giorni per periodo' }

  const ninetyDaysAgo = new Date(Date.now() - 90 * MS_PER_DAY).toISOString().split('T')[0]
  const { count } = await supabase
    .from('vacation_periods')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('start_date', ninetyDaysAgo)

  if ((count ?? 0) >= 2) {
    return { ok: false, reason: 'Massimo 2 vacanze nei 90 giorni precedenti' }
  }
  return { ok: true }
}
