// Validate the Spiral Energy EXP curve against the design constraints in
// GAMIFICATION_PLAN.md §2. Runs as pure Node (no Next/Supabase needed) by
// re-declaring the curve inline. Keep in sync with lib/gamification/exp-curve.ts.
//
// Run with:   node scripts/validate-exp-curve.mjs

const PHASE_1_COEF = 1.56
const PHASE_1_EXP = 2.5
const PHASE_2_BASE = 580
const PHASE_2_GROWTH = 1.028
const BOUNDARY_LEVEL = 100
const BOUNDARY_EXP = 156_000

function totalExpForLevel(level) {
  if (level <= 1) return 0
  if (level <= BOUNDARY_LEVEL) return Math.floor(PHASE_1_COEF * Math.pow(level, PHASE_1_EXP))
  const r = PHASE_2_GROWTH
  const n = level - BOUNDARY_LEVEL
  const phase2Sum = (PHASE_2_BASE * r * (Math.pow(r, n) - 1)) / (r - 1)
  return Math.floor(BOUNDARY_EXP + phase2Sum)
}

function levelFromTotalExp(exp) {
  if (exp <= 0) return 1
  let lvl
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

function expForNextLevel(currentLevel) {
  return totalExpForLevel(currentLevel + 1) - totalExpForLevel(currentLevel)
}

const WEEKLY_RATE = 1500

// ── Assertions ──────────────────────────────────────────────────────────────
const results = []
function assert(label, actual, expected, tolerance = 0) {
  const ok = Math.abs(actual - expected) <= tolerance
  results.push({ label, actual, expected, tolerance, ok })
  return ok
}

const l100 = totalExpForLevel(100)
const l101 = totalExpForLevel(101)
const l200 = totalExpForLevel(200)
const weeksToL100 = l100 / WEEKLY_RATE
const weeksToL200 = l200 / WEEKLY_RATE
const yearsToL100 = weeksToL100 / 52
const yearsToL200 = weeksToL200 / 52

assert('totalExpForLevel(100) ≈ 156_000', l100, 156_000, 1500)
// L200 target: ~468k (±5k). The weeks-to-L200 invariant below is the
// load-bearing one; exact EXP number is a derived quantity.
assert('totalExpForLevel(200) ≈ 468_000', l200, 468_000, 5000)
assert('Weeks to L100 at 1500/wk ≈ 104', weeksToL100, 104, 5)
assert('Weeks to L200 at 1500/wk ≈ 312', weeksToL200, 312, 15)
assert('Round-trip: levelFromTotalExp(totalExpForLevel(50)) == 50', levelFromTotalExp(totalExpForLevel(50)), 50)
assert('Round-trip: levelFromTotalExp(totalExpForLevel(99)) == 99', levelFromTotalExp(totalExpForLevel(99)), 99)
assert('Round-trip: levelFromTotalExp(totalExpForLevel(150)) == 150', levelFromTotalExp(totalExpForLevel(150)), 150)
assert('L101 jump cheaper than L100 (new spiral opens)', l101 - l100 < totalExpForLevel(100) - totalExpForLevel(99), true)
assert('expForNextLevel monotonic-by-chunks in Phase 2', expForNextLevel(150) > expForNextLevel(101), true)

// ── Pretty print ────────────────────────────────────────────────────────────
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

console.log('\n╔══════════════════════════════════════════════════════════════╗')
console.log('║  Spiral Energy — EXP Curve Validation                        ║')
console.log('╚══════════════════════════════════════════════════════════════╝\n')

console.log(`${DIM}Phase 1 (1..100):  total_exp(n) = floor(1.56 · n^2.5)${RESET}`)
console.log(`${DIM}Phase 2 (101..∞):  exp_for(n)   = floor(580 · 1.028^(n-100))${RESET}`)
console.log(`${DIM}Earn rate assumption: ${WEEKLY_RATE} EXP/week${RESET}\n`)

console.log('┌─────────┬─────────────┬──────────────┬──────────────┐')
console.log('│ Level   │ Total EXP   │ For next lvl │ Weeks @1500  │')
console.log('├─────────┼─────────────┼──────────────┼──────────────┤')
for (const lvl of [1, 5, 10, 25, 50, 75, 99, 100, 101, 110, 125, 150, 175, 200, 250]) {
  const total = totalExpForLevel(lvl)
  const next = expForNextLevel(lvl)
  const wks = (total / WEEKLY_RATE).toFixed(1)
  console.log(
    `│ ${String(lvl).padStart(4)}    │ ${String(total).padStart(10)}  │ ${String(next).padStart(11)}  │ ${wks.padStart(11)}  │`
  )
}
console.log('└─────────┴─────────────┴──────────────┴──────────────┘\n')

console.log('┌─────────────────────────────────────────────────────────┬──────────┐')
console.log('│ Assertion                                               │ Result   │')
console.log('├─────────────────────────────────────────────────────────┼──────────┤')
for (const r of results) {
  const status = r.ok ? `${GREEN}  PASS  ${RESET}` : `${RED}  FAIL  ${RESET}`
  const label = r.label.padEnd(55)
  console.log(`│ ${label} │ ${status} │`)
  if (!r.ok) {
    console.log(`│   ${DIM}got ${r.actual}, expected ${r.expected} ±${r.tolerance}${RESET}`.padEnd(60) + '│          │')
  }
}
console.log('└─────────────────────────────────────────────────────────┴──────────┘\n')

console.log(`Key figures:`)
console.log(`  L100 cumulative: ${l100.toLocaleString()} EXP  (~${yearsToL100.toFixed(2)} years)`)
console.log(`  L200 cumulative: ${l200.toLocaleString()} EXP  (~${yearsToL200.toFixed(2)} years)`)
console.log(`  Boundary jump:   L100 costs ${(totalExpForLevel(100) - totalExpForLevel(99)).toLocaleString()} EXP → L101 costs ${(l101 - l100).toLocaleString()} EXP (new spiral opens)`)
console.log()

const allPass = results.every((r) => r.ok)
if (!allPass) {
  console.error(`${RED}✗ Some assertions failed. Tune coefficients.${RESET}`)
  process.exit(1)
}
console.log(`${GREEN}✓ All assertions passed.${RESET}\n`)
