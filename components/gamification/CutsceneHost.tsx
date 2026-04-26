'use client'

// CutsceneHost — single mount point for every gamification cutscene.
//
//   • Subscribes once to the spiral-events bus.
//   • Translates incoming events into UniversalCutscene payloads.
//   • Buffers them in a FIFO queue so two simultaneous events (e.g. a
//     Giga Drill + a Level Up on the same workout-save) don't stomp on
//     each other — the second one waits, then plays after the first
//     calls `onComplete`.
//   • Mounts ONE UniversalCutscene at a time. When it finishes, the
//     active slot clears and the queue effect promotes the next item.

import { useEffect, useState } from 'react'
import {
  type CutscenePayload,
  UniversalCutscene,
} from './UniversalCutscene'
import {
  type SpiralEvent,
  subscribeSpiralEvents,
} from '@/lib/gamification/spiral-events'

export function CutsceneHost() {
  const [queue, setQueue] = useState<CutscenePayload[]>([])
  const [active, setActive] = useState<CutscenePayload | null>(null)

  // Bus subscription: fan-in of all cutscene-worthy events into the queue.
  useEffect(() => {
    return subscribeSpiralEvents((event) => {
      const payload = mapEventToPayload(event)
      if (payload) setQueue((q) => [...q, payload])
    })
  }, [])

  // Promotion: whenever no cutscene is playing and the queue has work,
  // dequeue the head into the active slot.
  useEffect(() => {
    if (active || queue.length === 0) return
    setActive(queue[0])
    setQueue((q) => q.slice(1))
  }, [active, queue])

  if (!active) return null

  return (
    <UniversalCutscene
      // Re-mount per payload so the phase timeline restarts cleanly.
      key={`${active.type}:${active.title}:${active.subtitle}`}
      payload={active}
      onComplete={() => setActive(null)}
    />
  )
}

/** Translate a generic SpiralEvent into the universal cutscene shape.
 *  Returns null when an event is informational only (no cutscene). */
function mapEventToPayload(event: SpiralEvent): CutscenePayload | null {
  switch (event.type) {
    case 'cutscene':
      return event.data

    case 'giga_drill': {
      const pct = Math.round(event.data.improvement_pct * 1000) / 10
      return {
        type: 'giga_drill',
        title: 'GIGA DRILL BREAK',
        subtitle: `▸ ${event.data.exercise_name} +${pct.toFixed(1)}%`,
        // No user level on the giga_drill payload — pick a mid-tier visual
        // (Golden Fury). Callers wanting tier-correct visuals can use
        // `fireCutscene()` directly with an explicit `level`.
        level: 50,
      }
    }

    // perfect_week is currently surfaced via flashes/banners, not as a
    // full cutscene. Returning null keeps the host idle for that event.
    case 'perfect_week':
      return null

    default:
      return null
  }
}
