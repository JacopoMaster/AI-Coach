// Minimal client-side pub/sub for gamification cutscenes + flashes.
// Module-level listeners — no React context, no context-provider tree.
// Used by POST success handlers to fan events out to the overlay host
// mounted once in the app layout.

export interface GigaDrillPayload {
  exercise_name: string
  from_tonnage: number
  to_tonnage: number
  improvement_pct: number
  bonus_exp: number
}

export interface PerfectWeekPayload {
  streak: number
  resonance_mult: number
}

export type SpiralEvent =
  | { type: 'giga_drill'; data: GigaDrillPayload }
  | { type: 'perfect_week'; data: PerfectWeekPayload }

type Listener = (event: SpiralEvent) => void

const listeners = new Set<Listener>()

export function fireSpiralEvent(event: SpiralEvent): void {
  for (const fn of listeners) fn(event)
}

export function subscribeSpiralEvents(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

// Typed convenience emitters — keeps call-sites clean.
export function fireGigaDrill(data: GigaDrillPayload): void {
  fireSpiralEvent({ type: 'giga_drill', data })
}

export function firePerfectWeek(data: PerfectWeekPayload): void {
  fireSpiralEvent({ type: 'perfect_week', data })
}
