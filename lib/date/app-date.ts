// Application calendar-date helper — single source of truth for "what day is it"
// in the app's timezone (D002: Europe/Rome).
//
// WHY: the server (Vercel) runs in UTC, so `new Date().toISOString().slice(0,10)`
// yields the UTC calendar date. Between 00:00 and ~02:00 Italian time that is the
// PREVIOUS day, so a meal/weight/workout logged just after midnight would land on
// the wrong day, and "today"/"last N days"/week windows would disagree across the
// app. This module makes every *calendar date* (a user-facing day) resolve in
// Europe/Rome, consistently, everywhere.
//
// SCOPE: this is only for calendar dates (DATE columns, "today", day ranges, week
// boundaries). Technical instants — created_at/updated_at/sent_at/audit timestamps
// — stay UTC ISO and must NOT go through here.
//
// No dependencies: native Intl + Date only. Date arithmetic is done on YYYY-MM-DD
// strings anchored at UTC midnight, so it is deterministic and DST-safe (no local
// timezone leaks, no double shifts).

export const APP_TIME_ZONE = 'Europe/Rome'

// en-CA renders as YYYY-MM-DD; formatToParts avoids any locale ordering surprises.
const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Calendar date (YYYY-MM-DD) of `date` in Europe/Rome.
 * Defaults to the current instant → "today" for the user.
 */
export function getAppDate(date: Date = new Date()): string {
  const parts = ymdFormatter.formatToParts(date)
  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  const d = parts.find((p) => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}

/**
 * Add `days` (can be negative) to a YYYY-MM-DD string, returning YYYY-MM-DD.
 * Pure date-only arithmetic anchored at UTC midnight — independent of the
 * server/browser timezone and safe across DST transitions and year boundaries.
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Subtract `days` from a YYYY-MM-DD string. Convenience wrapper over addDays. */
export function subDays(dateStr: string, days: number): string {
  return addDays(dateStr, -days)
}

/**
 * Whole-day difference `toDate - fromDate` between two YYYY-MM-DD strings.
 * Positive when `toDate` is after `fromDate`. Pure date-only arithmetic anchored
 * at UTC midnight, so it counts calendar days (no timezone/DST/millisecond drift)
 * and never depends on the wall-clock time of day.
 */
export function diffCalendarDays(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split('-').map(Number)
  const [ty, tm, td] = toDate.split('-').map(Number)
  const fromMs = Date.UTC(fy, fm - 1, fd)
  const toMs = Date.UTC(ty, tm - 1, td)
  return Math.round((toMs - fromMs) / 86_400_000)
}

/**
 * Calendar date `days` before today-in-Rome, as YYYY-MM-DD.
 * The canonical way to build a "last N days" lower bound.
 */
export function getAppDateDaysAgo(days: number, from: Date = new Date()): string {
  return subDays(getAppDate(from), days)
}

/**
 * Monday (ISO week start, Mon→Sun) of the week containing `dateStr`, as
 * YYYY-MM-DD. Pure date-only, so it matches the calendar dates stored in DATE
 * columns without any timezone drift.
 */
export function getAppWeekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=Sun..6=Sat
  const offset = dow === 0 ? -6 : 1 - dow
  return addDays(dateStr, offset)
}

/**
 * Day of week of `date` in Europe/Rome: 0 = Sunday … 6 = Saturday.
 * Derived from the Rome calendar date, so it never disagrees with getAppDate.
 */
export function getAppDayOfWeek(date: Date = new Date()): number {
  const [y, m, d] = getAppDate(date).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}
