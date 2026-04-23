// Spiral Energy — EXP curve (Fase 3)
//
// Two-phase design calibrated against ~1500 EXP/week earn rate:
//   Phase 1 (levels 1..100):  polynomial   total_exp(n) = 1.56 · n^2.5
//                             → Level 100 at ~156_000 EXP (~2 years)
//   Phase 2 (levels 101..∞):  exponential  exp_for(n)   = 580 · 1.028^(n-100)
//                             → Level 200 at ~468_000 EXP (~6 years total)
//
// The boundary at L100 is intentionally discontinuous: L100 costs ~4900 EXP,
// L101 costs ~596 EXP. This is the "new spiral opens" breakthrough — without
// it, either the 2y-to-L100 or +4y-to-L200 constraint must give. See
// GAMIFICATION_PLAN.md §2.

export type SpiralStage =
  | 'terrestrial'
  | 'atmospheric'
  | 'orbital'
  | 'celestial'
  | 'galactic'
  | 'tengen_toppa'

const PHASE_1_COEF = 1.56
const PHASE_1_EXP = 2.5
const PHASE_2_BASE = 580
const PHASE_2_GROWTH = 1.028
const BOUNDARY_LEVEL = 100
const BOUNDARY_EXP = 156_000 // floor(1.56 · 100^2.5)

/** Cumulative EXP required to BE at `level`. level=1 returns 0. */
export function totalExpForLevel(level: number): number {
  if (level <= 1) return 0
  if (level <= BOUNDARY_LEVEL) {
    return Math.floor(PHASE_1_COEF * Math.pow(level, PHASE_1_EXP))
  }
  const r = PHASE_2_GROWTH
  const n = level - BOUNDARY_LEVEL
  const phase2Sum = (PHASE_2_BASE * r * (Math.pow(r, n) - 1)) / (r - 1)
  return Math.floor(BOUNDARY_EXP + phase2Sum)
}

/** Inverse: derive the level from a total EXP count.
 *  The forward direction applies floor(), which makes a naive analytic
 *  inverse underflow by 1. We seed with the analytic estimate and step
 *  up while totalExpForLevel(lvl+1) ≤ exp (at most 1-2 iterations). */
export function levelFromTotalExp(exp: number): number {
  if (exp <= 0) return 1
  let lvl: number
  if (exp < BOUNDARY_EXP) {
    lvl = Math.max(1, Math.floor(Math.pow(exp / PHASE_1_COEF, 1 / PHASE_1_EXP)))
  } else {
    const r = PHASE_2_GROWTH
    const remaining = exp - BOUNDARY_EXP
    const inner = (remaining * (r - 1)) / (PHASE_2_BASE * r) + 1
    const n = Math.log(inner) / Math.log(r)
    lvl = Math.min(BOUNDARY_LEVEL + Math.floor(n), 999)
  }
  while (lvl < 999 && totalExpForLevel(lvl + 1) <= exp) lvl++
  return lvl
}

/** EXP marginally needed to go from `currentLevel` → `currentLevel + 1`. */
export function expForNextLevel(currentLevel: number): number {
  return totalExpForLevel(currentLevel + 1) - totalExpForLevel(currentLevel)
}

/** Progress 0..1 toward the next level, for the HUD bar. */
export function progressToNextLevel(totalExp: number): number {
  const level = levelFromTotalExp(totalExp)
  const floorExp = totalExpForLevel(level)
  const ceilExp = totalExpForLevel(level + 1)
  if (ceilExp === floorExp) return 0
  return Math.max(0, Math.min(1, (totalExp - floorExp) / (ceilExp - floorExp)))
}

/** Core Drill tier (1..11). Drives the SVG variant of the avatar.
 *  Breakpoints must stay in sync with `TIERS[].minLevel` in
 *  `components/gamification/SpiralDrill.tsx`. */
const TIER_BREAKPOINTS = [1, 10, 25, 45, 65, 85, 95, 100, 125, 175, 200] as const

export function tierFromLevel(level: number): number {
  for (let i = TIER_BREAKPOINTS.length - 1; i >= 0; i--) {
    if (level >= TIER_BREAKPOINTS[i]) return i + 1
  }
  return 1
}

/** Spiral stage — drives the global theme palette. */
export function stageFromLevel(level: number): SpiralStage {
  if (level < 25) return 'terrestrial'
  if (level < 60) return 'atmospheric'
  if (level < 100) return 'orbital'
  if (level < 150) return 'celestial'
  if (level < 200) return 'galactic'
  return 'tengen_toppa'
}

const TIER_TITLES = [
  'Lo Scavabuchi',                     // tier 1  (lvl 1..9)
  'Ereditiere della Volontà',          // tier 2  (lvl 10..24)
  'Membro della Brigata Dai-Gurren',   // tier 3  (lvl 25..44)
  'Leader della Resistenza',           // tier 4  (lvl 45..64)
  'Spirito Indomabile',                // tier 5  (lvl 65..84)
  'Perforatore dei Cieli',             // tier 6  (lvl 85..94)
  'Eroe della Galassia',               // tier 7  (lvl 95..99)
  'Massa Critica',                     // tier 8  (lvl 100..124)
  'Signore della Spirale',             // tier 9  (lvl 125..174)
  'Tengen Toppa',                      // tier 10 (lvl 175..199)
  'Super Tengen Toppa Gurren Lagann',  // tier 11 (lvl 200+)
] as const

/** Flavor title for the current level. */
export function titleFromLevel(level: number): string {
  return TIER_TITLES[tierFromLevel(level) - 1]
}
