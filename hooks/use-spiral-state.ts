// Minimal SWR-like hook for /api/stats. No new dependency.
// - In-flight dedup + module-level cache
// - Revalidate on window focus
// - `mutate` helper for optimistic updates after EXP-awarding POSTs
//
// Intended lifecycle: one consumer per mount (HeroStatusStrip). The cache
// survives remounts within the same page lifetime, so navigating away and
// back doesn't re-flicker.

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ExpHistoryEntry,
  UserStats,
} from '@/lib/gamification/types'

export interface SpiralState {
  user_stats: UserStats | null
  recent_exp: ExpHistoryEntry[]
  stat_totals: { forza: number; resistenza: number; agilita: number }
  title: string
  tier: number
  progress: number
  exp_for_next_level: number
  on_vacation: boolean
  active_recent_24h: boolean
}

const DEDUP_MS = 10_000

let cache: SpiralState | null = null
let inFlight: Promise<SpiralState | null> | null = null
let lastFetch = 0
const subscribers = new Set<(s: SpiralState | null) => void>()

function notify(next: SpiralState | null) {
  cache = next
  for (const fn of subscribers) fn(next)
}

async function fetchStats(): Promise<SpiralState | null> {
  const res = await fetch('/api/stats', { cache: 'no-store' })
  if (!res.ok) return cache
  return (await res.json()) as SpiralState
}

async function revalidate(force = false): Promise<SpiralState | null> {
  const now = Date.now()
  if (!force && cache && now - lastFetch < DEDUP_MS) return cache
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const next = await fetchStats()
      lastFetch = Date.now()
      if (next) notify(next)
      return next
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

export function useSpiralState() {
  const [data, setData] = useState<SpiralState | null>(cache)
  const [isLoading, setIsLoading] = useState(!cache)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const sub = (next: SpiralState | null) => {
      if (mountedRef.current) setData(next)
    }
    subscribers.add(sub)

    if (!cache) {
      revalidate().finally(() => mountedRef.current && setIsLoading(false))
    } else {
      setIsLoading(false)
      // Background revalidate if stale.
      revalidate()
    }

    function onFocus() {
      revalidate()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      mountedRef.current = false
      subscribers.delete(sub)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  /** Force a refetch (e.g. after a POST that awarded EXP). */
  const refresh = useCallback(async () => {
    await revalidate(true)
  }, [])

  /** Optimistic update — caller applies a partial patch immediately. */
  const mutate = useCallback(
    (patch: Partial<SpiralState> | ((prev: SpiralState | null) => SpiralState | null)) => {
      const next =
        typeof patch === 'function'
          ? patch(cache)
          : cache
            ? { ...cache, ...patch }
            : null
      if (next) notify(next)
    },
    []
  )

  return { data, isLoading, refresh, mutate }
}
