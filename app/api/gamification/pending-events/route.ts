// POST /api/gamification/pending-events
//
// Translates a server-side `Reward` (returned by /api/workouts, /api/diet,
// /api/body, etc.) into an ORDERED list of UniversalCutscene payloads ready
// to be drained on the client via `fireCutscene()`.
//
// Why a server route and not a pure client helper?
//   - Single source of truth for the "what shows when" rules — diet, body
//     and workout flows all converge here, so the ordering is consistent.
//   - The server can enrich rewards with achievement metadata (rarity →
//     colorOverride, name) without bloating the original Reward shape.
//   - Future-proof: when we add a `spiral_evolution_events` table the same
//     route grows a "drain unseen since X" mode without changing callers.
//
// Order of cutscenes (lowest priority → climax):
//   1. Giga Drill Break  (PR — earned in the moment)
//   2. Unlocked Achievements  (one cutscene each, common → legendary)
//   3. Level Up               (the climax; uses the new level for visuals)
//
// Notes:
//   - tier_up / stage_up / pierced are NOT separate cutscenes — they're all
//     forms of "level up", so we let UniversalCutscene's tier system pick
//     the right visual escalation from `level = reward.new_level`.
//   - perfect_week is intentionally absent — it's surfaced via a flash, not
//     a full-screen cutscene.

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { CutscenePayload } from '@/components/gamification/UniversalCutscene'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Input shape — a permissive subset of `Reward` ───────────────────────────
// We intentionally don't import Reward as a zod type because we want forward
// compatibility: extra unknown fields should be silently ignored, not 400'd.

const AchievementSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  rarity: z.enum(['common', 'uncommon', 'rare', 'legendary']).optional(),
  exp_reward: z.number().optional(),
  hidden: z.boolean().optional(),
})

const RewardSchema = z.object({
  new_level: z.number().int().nonnegative().optional(),
  leveled_up: z.boolean().optional(),
  tier_up: z.object({ from: z.number(), to: z.number() }).optional(),
  pierced: z.boolean().optional(),
  giga_drill: z
    .object({
      exercise_name: z.string(),
      from_tonnage: z.number(),
      to_tonnage: z.number(),
      improvement_pct: z.number(),
      bonus_exp: z.number(),
    })
    .optional(),
  unlocked_achievements: z.array(AchievementSchema).optional(),
})

const BodySchema = z.object({
  reward: RewardSchema.nullable().optional(),
})

// ─── Mapping helpers ────────────────────────────────────────────────────────

const RARITY_COLOR: Record<string, string> = {
  common: '#c8d8f0',
  uncommon: '#00f0ff',
  rare: '#ff40ff',
  legendary: '#ffcc40',
}

function gigaDrillEvent(
  giga: NonNullable<z.infer<typeof RewardSchema>['giga_drill']>,
  level: number
): CutscenePayload {
  const pct = Math.round(giga.improvement_pct * 1000) / 10
  return {
    type: 'giga_drill',
    title: 'GIGA DRILL BREAK',
    subtitle: `▸ ${giga.exercise_name} +${pct.toFixed(1)}%`,
    level,
  }
}

function achievementEvent(
  ach: z.infer<typeof AchievementSchema>,
  level: number
): CutscenePayload {
  return {
    type: 'achievement',
    title: 'TROFEO SBLOCCATO',
    subtitle: `▸ ${ach.name}`,
    level,
    colorOverride: ach.rarity ? RARITY_COLOR[ach.rarity] : '#00f0ff',
  }
}

function levelUpEvent(newLevel: number, pierced: boolean): CutscenePayload {
  return {
    type: 'level_up',
    title: pierced ? 'PIERCE THE HEAVENS' : 'LEVEL UP',
    subtitle: `▸ Spirale Lv ${newLevel}`,
    level: newLevel,
  }
}

// Common → uncommon → rare → legendary so the climax achievement plays last.
const RARITY_RANK: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  legendary: 3,
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth — we only return data scoped to the caller, but reward is supplied
  // by the client so anonymous callers should still be rejected to keep the
  // surface area minimal.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const reward = parsed.data.reward
  if (!reward) {
    return NextResponse.json({ events: [] satisfies CutscenePayload[] })
  }

  // Visual tier for cutscenes that don't carry a level themselves (Giga
  // Drill, achievements) — use new_level when present, otherwise fall back
  // to the user's current level so we don't render a steel drill when the
  // user is actually at tier 10.
  let baseLevel = reward.new_level ?? 1
  if (!reward.new_level) {
    const { data: stats } = await supabase
      .from('user_stats')
      .select('level')
      .eq('user_id', user.id)
      .maybeSingle()
    if (stats?.level) baseLevel = stats.level
  }

  const events: CutscenePayload[] = []

  // 1. Giga Drill Break (PR)
  if (reward.giga_drill) {
    events.push(gigaDrillEvent(reward.giga_drill, baseLevel))
  }

  // 2. Achievements — sorted ascending by rarity so legendary plays last.
  if (reward.unlocked_achievements && reward.unlocked_achievements.length > 0) {
    const sorted = [...reward.unlocked_achievements].sort((a, b) => {
      const ra = a.rarity ? RARITY_RANK[a.rarity] ?? 0 : 0
      const rb = b.rarity ? RARITY_RANK[b.rarity] ?? 0 : 0
      return ra - rb
    })
    for (const ach of sorted) events.push(achievementEvent(ach, baseLevel))
  }

  // 3. Level Up (climax). `pierced` upgrades the title to "Pierce the
  //    Heavens"; tier_up alone reuses the standard LEVEL UP framing because
  //    UniversalCutscene's tier system already escalates the visuals.
  if (reward.leveled_up && reward.new_level) {
    events.push(levelUpEvent(reward.new_level, Boolean(reward.pierced)))
  }

  return NextResponse.json({ events })
}
