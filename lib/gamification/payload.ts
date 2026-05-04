// Lightweight projection of the full Reward object into the
// `{ gainedXp, isLevelUp, currentLevel, newTotalXp }` shape consumed by the
// frontend save actions. The full Reward (tier_up, achievements, perfect_week)
// is still returned alongside under `reward` so the cutscene host keeps working.

import type { Reward } from './types'

export interface GamificationPayload {
  gainedXp: number
  isLevelUp: boolean
  currentLevel: number
  newTotalXp: number
}

export function toGamificationPayload(
  reward: Reward | null | undefined
): GamificationPayload {
  if (!reward) {
    return { gainedXp: 0, isLevelUp: false, currentLevel: 1, newTotalXp: 0 }
  }
  return {
    gainedXp: reward.delta,
    isLevelUp: reward.leveled_up,
    currentLevel: reward.new_level,
    newTotalXp: reward.new_total,
  }
}
