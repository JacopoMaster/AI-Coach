// Spiral — the app's splash / hero home. Strips away any widget noise and
// gives the Core Drill the whole stage. Taps through to /status for detail;
// /today holds the quick-action hub that used to live here.

import { HeroStatusStrip } from '@/components/gamification/HeroStatusStrip'

export default function SpiraleHome() {
  return (
    // 5rem matches the `pb-20` on <main> which reserves space for BottomNav.
    // `dvh` tracks the visible viewport so the hero is perfectly framed on
    // mobile even when the URL bar collapses/expands.
    <div className="flex min-h-[calc(100dvh-5rem)] w-full items-center justify-center p-4">
      <div className="w-full">
        <HeroStatusStrip />
      </div>
    </div>
  )
}
