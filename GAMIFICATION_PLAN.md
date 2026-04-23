# AI Coach — Phase 3: "Energia della Spirale"

**Status:** Approved — implementation started 2026-04-23
**Theme:** Gurren Lagann × JRPG. Unified progression (no classes). Every workout, meal log and check-in feeds the user's **Core Drill** through **Spiral Energy (EXP)**.
**Target user:** Single user, ~3 workouts/week, daily diet logging, ~1500 EXP/week earning rate.
**North star:** The user should feel that their training literally evolves an avatar — from a small iron drill to a galactic one that pierces the heavens.

---

## 0 · Decisions Log (resolved)

| # | Question | Decision |
|---|---|---|
| 1 | Spiral Resonance cap pace | 8 consecutive Perfect Weeks → ×3.00 cap, +0.25/week. 50% decay/week on miss |
| 2 | Giga Drill Break EXP cap | **Dynamic**: `round(min(0.10, 0.05 + improvement_pct) × exp_for_next_level)`. No flat cap |
| 3 | Spiral stages | 6 stages: `terrestrial` (1–24), `atmospheric` (25–59), `orbital` (60–99), `celestial` (100–149), `galactic` (150–199), **`tengen_toppa`** (200+) |
| 4 | Backfill | **No backfill.** Start fresh from Step 1 ship date; historical logs are ignored for EXP/level purposes (they remain in their source tables, just not replayed) |
| 5 | Vacation Mode | Manual opt-in. Pauses resonance decay + Perfect Week eval. See §4 |

---

## 1 · Guiding Principles

1. **Data-first.** Every EXP value and stat derives from tables we already write to: `workout_sessions`, `session_exercises`, `diet_logs`, `body_measurements`, `mesocycles`, `weekly_check_ins`. No new manual inputs.
2. **Zero friction.** Users log what they already log. Gamification reads, never asks.
3. **Forgiveness by design.** Resonance decays 50%/week instead of reset. Vacation Mode preserves state. Missing a single day never wipes weeks of work.
4. **Narrative coherence.** The AI Coach (see `supabase/functions/morning-motivation/claude.ts`) already speaks Italian with anime/JRPG flavor. Every UI string adopts that voice.

---

## 2 · The Spiral Curve — EXP Math

### 2.1 Two-phase design

**Constraints:** at ~1500 EXP/week:
- Level 100 in ~2 years → **156,000 EXP cumulative**
- Level 200 in ~6 years → **468,000 EXP cumulative** (+312,000 for Phase 2)

**Phase 1 (1 → 100): polynomial**
```
total_exp(n) = floor(1.56 · n^2.5)   // n ∈ [1, 100]
total_exp(100) = 156_000
```

**Phase 2 (101 → ∞): pure exponential (compounding per-level)**
```
exp_for_level_n = floor(580 · 1.028^(n-100))   // n ∈ [101, ∞)
Σ from 101 to 200 ≈ 312,800   // ≈4 years at 1500 EXP/week
```

**Boundary discontinuity is intentional:** Level 100 costs ~4,900 EXP, Level 101 costs ~596 EXP. This is the "**new spiral opening**" moment — the user feels immediately rewarded for piercing the heavens before the exponential starts biting. Purely mathematical: any smoother boundary violates either the 2y or 4y timing constraint.

**Level 200:** the `tengen_toppa` stage. Cosmetic-only beyond L200 (curve continues compounding; no level cap but past 999 we stop tracking).

### 2.2 Authoritative TypeScript reference

See `lib/gamification/exp-curve.ts` (Step 1 deliverable). Public surface:

```typescript
totalExpForLevel(level: number): number
levelFromTotalExp(exp: number): number
expForNextLevel(currentLevel: number): number
progressToNextLevel(totalExp: number): number    // 0..1 for UI bar
tierFromLevel(level: number): number             // 1..10, drives SVG variant
stageFromLevel(level: number): SpiralStage       // drives theme palette
```

Validation script `scripts/validate-exp-curve.ts` asserts:
- `totalExpForLevel(100) ≈ 156_000` (±1k)
- `totalExpForLevel(200) ≈ 468_000` (±2k)
- Weeks-to-L100 ≈ 104 at 1500/week
- Weeks-to-L200 ≈ 312 at 1500/week

---

## 3 · Core Gamification Mechanics

### 3.1 Spiral Resonance — streak multiplier

**Signals:** `workout_sessions`, `diet_logs`, `body_measurements` within an ISO week.

**Perfect Week** = ALL three:
- ≥ 3 `workout_sessions`
- ≥ 5 `diet_logs` with `protein_g ≥ 0.9 × diet_plan.protein_g`
- ≥ 1 body measurement with weight

**Multiplier rules:**
- Each consecutive Perfect Week: `resonance_mult += 0.25` (capped at **3.00**, reached after 8 weeks)
- Missed week: `resonance_mult := max(1.00, resonance_mult × 0.5)` — half-life forgiveness
- Applied to every EXP award post-Step 1

**Narrative UI:** golden ring around Core Drill, pulse rate proportional to `resonance_mult`.

### 3.2 Giga Drill Break — tonnage PR

**Signal:** `session_exercises.weight_kg × sets_done × reps_done` vs `personal_records`.

**Trigger:** new all-time max tonnage for a given `plan_exercise_id` during a logged session.

**EXP bonus (dynamic):**
```typescript
const improvement = (newTonnage - oldTonnage) / oldTonnage    // e.g. 0.12
const pctOfNextLevel = Math.min(0.10, 0.05 + improvement)     // 5% base, +% improvement, cap 10%
const bonus = Math.round(pctOfNextLevel × expForNextLevel(currentLevel))
```

So at Level 30 (`exp_for_next_level ≈ 300`): a 5% PR awards +15 EXP; a 10% PR awards +30. At Level 100 (`exp_for_next_level ≈ 4900`): the same PR awards 245-490. The bonus **scales with the user's station**, staying meaningful throughout the journey.

**Cinematic:** 2.5s full-screen overlay, Core Drill impales a boss silhouette, flavor quote generated by Haiku (cached per session).

**First-ever session:** silently seeds `personal_records`; no cinematic (avoids onboarding spam).

### 3.3 Manifest Galaxy — Chapter Clear

**Signal:** `mesocycles.status` flip to `completed`.

**Power Ledger** computed on flip: total tonnage, session count, diet adherence %, check-ins applied, Giga Drill count, weight delta. Compared to previous mesocycle → delta arrows.

**Reward:**
- 1,000 EXP base
- +250 per improved metric vs prior meso (cap +1,500)
- +500 if first mesocycle
- `core_drill_tier` +1 (cap 10)
- Every 3rd tier-up triggers `spiral_stage` advancement
- Insert `spiral_evolution_log` row for the cutscene queue

**Cinematic:** 4s cutscene with expanding nebula SVG, new tier centered with glow, Power Ledger card in JRPG menu frame.

### 3.4 Pierce the Heavens (L100 breakthrough)

Orthogonal to mechanics above. Triggered when `levelFromTotalExp` returns 100 for the first time and `user_stats.pierced_the_heavens = false`.

- Flag set, timestamp stored
- Theme palette swaps live from `orbital` to `celestial` (CSS variable replacement, no reload)
- Screen-crack overlay animation (clip-path pseudo-element, ~2s)
- Core Drill model upgrades to galactic variant
- Unlock title "Colui che Ha Sfondato"

Implementation in Step 5.

---

## 4 · Vacation Mode ("Modalità Episodio in Spiaggia")

### 4.1 Problem

The user goes on holiday for 10 days. They don't train, don't log meals, don't step on the scale. Without protection:
- Perfect Week streak breaks → resonance decays
- Streak counter resets
- The user returns to the app with a punishment, not a welcome

### 4.2 Mechanic

**Opt-in, not automatic.** Detecting vacation from gaps alone conflates holidays with laziness; the user is the only reliable signal. Add a Settings toggle.

**Rules:**
- User activates Vacation Mode with a `start_date` and `end_date` (default 7 days, max 14).
- Max 2 active vacations per 90-day window (prevents gaming).
- While `now` is between `start_date` and `end_date`:
  - Resonance decay is **paused**. `resonance_mult` frozen at the value it had when vacation started.
  - Perfect Week evaluation: if an ISO week is **entirely** inside the vacation window → skipped (no break, no increment). If **partially** overlapping → thresholds scale proportionally to non-vacation days (e.g. 4 non-vacation days in the week → need ≥ 2 workouts + ≥ 3 logs + ≥ 1 body measurement to count).
  - Streak counter pauses (no increment, no break).
  - EXP is **still awarded** for any activity logged during vacation (training on holiday still counts, nothing is blocked).
  - The Core Drill HUD shows a discreet beach-ball icon overlay.
- On `end_date + 1`:
  - Vacation record stays for audit.
  - Normal evaluation resumes from that week.
  - One-time motivational push: *"L'episodio in spiaggia è finito. Torna la spirale — ripartiamo più forti."*

### 4.3 Schema (part of migration 006)

```sql
CREATE TABLE vacation_periods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL CHECK (end_date >= start_date),
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date - start_date <= 14)
);
CREATE INDEX vacation_periods_user_range_idx ON vacation_periods (user_id, start_date, end_date);
```

Helper: `lib/gamification/vacation.ts`:
```typescript
isOnVacation(userId, date): Promise<boolean>
vacationDaysInWeek(userId, isoWeekStart): Promise<number>  // 0..7, for scaling thresholds
canStartVacation(userId, startDate, endDate): Promise<{ ok: boolean; reason?: string }>
```

Used by `checkPerfectWeek()` to scale thresholds, and by `awardExp()` → `tickResonance()` to skip decay.

### 4.4 UX

- Settings → new section "**Modalità Episodio in Spiaggia**" with a start/end date picker.
- Active vacation shows a dismissible banner on the Dashboard.
- History of past vacations visible in Settings (so the user knows the 90-day budget).

---

## 5 · Database Schema (Migration 006)

All tables created with `IF NOT EXISTS`, policies with `DROP IF EXISTS` + `CREATE POLICY`.

### 5.1 `user_stats` (one row per user)
- `level INT` (1..999)
- `exp_total BIGINT` (monotonic)
- `spiral_stage TEXT` — CHECK includes `tengen_toppa`
- `core_drill_tier INT` (1..10)
- `resonance_mult NUMERIC(3,2)` (1.00..3.00)
- `resonance_last_tick TIMESTAMPTZ`
- `perfect_week_streak INT`, `longest_streak INT`
- `pierced_the_heavens BOOLEAN`, `pierced_at TIMESTAMPTZ`
- `baseline_tonnage NUMERIC(10,2)`
- Trigger on `auth.users INSERT` to seed.

### 5.2 `exp_history` (append-only)
- `delta INT`, `base_exp INT`, `multiplier NUMERIC(4,2)`
- `source` (enum CHECK)
- `source_id UUID` (polymorphic, nullable)
- `stat_tagged` (optional)
- `rationale TEXT`
- `UNIQUE (source, source_id)` → idempotency on POST retries

### 5.3 `personal_records`
- `(user_id, plan_exercise_id, record_type) UNIQUE`
- `record_type IN ('max_tonnage', 'max_weight', 'max_reps')`

### 5.4 `spiral_evolution_log`
- `event_type IN ('tier_up', 'stage_up', 'pierce_the_heavens', 'meso_clear', 'giga_drill')`
- `seen BOOLEAN` — drives cutscene queue

### 5.5 `vacation_periods`
(see §4.3)

### 5.6 `achievements` + `user_achievements`
Static seed + unlock table. 20 achievements in v1. Full catalog in Step 4.

### 5.7 TypeScript types
Added to `lib/types.ts` in Step 1:
- `SpiralStage`, `UserStats`, `ExpHistoryEntry`, `PersonalRecord`, `SpiralEvolutionEvent`, `VacationPeriod`, `Reward`

---

## 6 · Frontend Architecture

### 6.1 Single state source
`GET /api/stats` returns `{ user_stats, recent_exp: ExpHistoryEntry[], pending_events: SpiralEvolutionEvent[], on_vacation: boolean }`.

Client hook (Step 2):
```typescript
const { data } = useSpiralState()   // SWR-based, 10s dedup, revalidate on focus
```

### 6.2 Optimistic updates
Every EXP-awarding POST returns `{ ..., reward: Reward }`. Client calls `mutate('/api/stats', …)` locally; no round-trip for EXP bar animation.

### 6.3 `SpiralDrill.tsx` avatar
Pure SVG + CSS. Props: `{ tier, resonance, stage, leveling?, piercing? }`. 10 tier variants as `<symbol>`, crossfade 800ms on tier-up. GPU-friendly (transform + opacity only).

---

## 7 · Roadmap

| Step | Target week | Deliverable |
|---|---|---|
| **1** | Week 1 (now) | Migration 006 (incl. `vacation_periods`) + `lib/gamification/*` (incl. `vacation.ts`) + wired into 3 POST routes + validation script. Vacation Mode **backend only** (table + helpers + `tickResonance()` respects it). **No UI yet.** EXP accrues silently from ship date — no historical backfill |
| 2 | Week 2 | Hero Status Strip + SpiralDrill.tsx tier 1–4 + `/api/stats` + `+N EXP` floater |
| 3 | Week 3 | Full palette restyle + tier 5–10 + spiral-stage theme swap |
| 4 | Week 4 | Giga Drill Break cutscene + Perfect Week UI + Status page + achievements |
| 5 | Week 5 | Chapter Clear cutscene + Pierce-the-Heavens breakthrough + **Vacation Mode UI** (Settings section + Dashboard banner + history) + Coach integration + onboarding tutorial |

---

## 8 · Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Gamification failure breaks existing save flows | `awardExp()` wrapped in try/catch at call site; EXP errors logged, never fail the parent POST |
| POST retry creates duplicate EXP entries | `exp_history.UNIQUE (source, source_id)` makes `awardExp()` idempotent by construction |
| Fresh-start feels empty on Day 1 | First session/log triggers onboarding cutscene (Step 5); until then, the `+N EXP` floater + rising bar carry the payoff |
| Performance regressions on POST handlers | All checks budgeted <50ms; indexes on `(user_id, plan_exercise_id)`, `(user_id, date)` already exist |
| User gaming vacation mode | Max 14 days per vacation, max 2 per 90-day window |
| Resonance feels too punishing | 50% decay instead of reset; vacation mode; easy re-climb (0.25/week) |
| Level math drift | `scripts/validate-exp-curve.ts` run as CI-style check before each deploy |

---

**Owner:** Jacopo
**Designer / Lead Architect:** Claude
**Kickoff:** 2026-04-23
**First deliverable:** Step 1 (same day)
