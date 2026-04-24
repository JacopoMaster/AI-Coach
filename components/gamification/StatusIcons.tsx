// Icon lookup tables for the Status page.
// Keeps the page file free of a giant switch/import block.
// Works in both server and client components (no hooks, no state).

import {
  Activity,
  Beef,
  BookOpen,
  Calendar,
  ClipboardList,
  Dumbbell,
  Flame,
  Infinity as InfinityIcon,
  Layers,
  Link2,
  Orbit,
  Radio,
  Salad,
  Scale,
  Sparkle,
  Sparkles,
  Star,
  Sunrise,
  Swords,
  Telescope,
  Trophy,
  Utensils,
  Weight,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ExpHistoryEntry } from '@/lib/gamification/types'

// ── EXP source → Lucide icon ───────────────────────────────────────────────
const SOURCE_ICON: Record<ExpHistoryEntry['source'], LucideIcon> = {
  workout_session:  Dumbbell,
  diet_log:         Salad,
  weight_log:       Scale,
  body_measurement: Activity,
  weekly_checkin:   Calendar,
  meso_complete:    BookOpen,
  giga_drill_break: Swords,
  perfect_week:     Sparkles,
  achievement:      Trophy,
}

export function SourceIcon({
  source,
  className,
}: {
  source: ExpHistoryEntry['source']
  className?: string
}) {
  const Icon = SOURCE_ICON[source] ?? Zap
  return <Icon className={className ?? 'h-4 w-4'} aria-hidden />
}

// ── Achievement icon name → Lucide icon ────────────────────────────────────
// Keys here mirror the `icon` column values seeded in migration 008.
const ACHIEVEMENT_ICON: Record<string, LucideIcon> = {
  zap: Zap,
  utensils: Utensils,
  scale: Scale,
  flame: Flame,
  sparkles: Sparkles,
  sparkle: Sparkle,
  link: Link2,
  infinity: InfinityIcon,
  radio: Radio,
  sunrise: Sunrise,
  trophy: Trophy,
  weight: Weight,
  swords: Swords,
  'clipboard-list': ClipboardList,
  beef: Beef,
  activity: Activity,
  'book-open': BookOpen,
  layers: Layers,
  star: Star,
  orbit: Orbit,
  telescope: Telescope,
}

export function AchievementIcon({
  icon,
  className,
}: {
  icon: string
  className?: string
}) {
  const Icon = ACHIEVEMENT_ICON[icon] ?? Trophy
  return <Icon className={className ?? 'h-4 w-4'} aria-hidden />
}
