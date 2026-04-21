'use client'

/**
 * Best-effort replay of the offline sync queue from the main thread.
 *
 * Why it exists:
 *   Background Sync (the SW-driven path in `worker/index.js`) isn't
 *   supported on iOS Safari and is disabled in some hardened browsers.
 *   This hook guarantees the queue eventually drains — whenever the user
 *   reopens the app online, or when the OS fires the `online` event on
 *   a foregrounded tab.
 *
 * Rendered as null — it's a side-effect component mounted once in the
 * authenticated app layout.
 */

import { useEffect, useRef } from 'react'

export function OfflineSyncReplay() {
  const running = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function replay() {
      // Debounce concurrent triggers (mount + online event firing together).
      if (running.current) return
      if (typeof navigator === 'undefined') return
      if (navigator.onLine === false) return

      running.current = true
      try {
        const { flushQueue } = await import('@/lib/offline/sync-queue')
        const result = await flushQueue()
        if (!cancelled && result.sent > 0 && process.env.NODE_ENV !== 'production') {
          // Minimal breadcrumb during development — no user-facing UI here,
          // the workouts list will already show the newly synced session.
          console.info(
            `[offline-sync] flushed ${result.sent} queued request(s), ${result.remaining} left`
          )
        }
      } catch {
        // Swallow — the next `online` event or page load will retry.
      } finally {
        running.current = false
      }
    }

    replay()

    const onOnline = () => replay()
    // Some browsers only fire `online` once per transition; also replay on
    // tab becoming visible again to catch users who background the app
    // while offline and foreground it later with connectivity restored.
    const onVisible = () => {
      if (document.visibilityState === 'visible') replay()
    }

    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return null
}
