/* eslint-disable no-undef */
// Custom Service Worker entry compiled by next-pwa (v2.x).
// next-pwa reads `worker/index.js` from the project root and prepends it to
// the generated `/sw.js`, so anything registered here runs inside the SW
// global scope (self). No window / document access available.

import { get, update } from 'idb-keyval'

const QUEUE_KEY = 'offline_sync_queue'
const SYNC_TAG = 'workout-sync'

async function flushOfflineQueue() {
  const queue = (await get(QUEUE_KEY)) || []
  if (queue.length === 0) return

  const delivered = new Set()
  const dropped = new Set()
  let hadTransientFailure = false

  for (const item of queue) {
    try {
      const res = await fetch(item.endpoint, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: item.body,
        credentials: 'same-origin',
      })
      if (res.ok) {
        delivered.add(item.id)
      } else if (res.status >= 400 && res.status < 500) {
        // Server said "no" — drop so we don't retry forever.
        dropped.add(item.id)
      } else {
        // 5xx: stop; the browser will re-fire the sync event on a backoff.
        hadTransientFailure = true
        break
      }
    } catch {
      hadTransientFailure = true
      break
    }
  }

  const toRemove = new Set([...delivered, ...dropped])
  if (toRemove.size > 0) {
    await update(QUEUE_KEY, (prev) => (prev || []).filter((r) => !toRemove.has(r.id)))
  }

  // Re-throw so the Background Sync runtime knows this attempt didn't finish
  // and schedules a retry. Without this the remaining items would sit idle
  // until the user reopens the app.
  if (hadTransientFailure) {
    throw new Error('offline-queue: partial flush, retry later')
  }
}

// ─── Background Sync ─────────────────────────────────────────────────────────
// Fired by the browser once connectivity is back (Chrome, Edge, Android).
// iOS Safari ignores this — the main thread's OfflineSyncReplay hook handles
// those users on the next app load.
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(flushOfflineQueue())
  }
})

// ─── Push event ──────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  // Payload may be absent when the push service woke us up without data.
  // In that case we render a generic reminder rather than showing nothing.
  let payload = {
    title: 'AI Coach',
    body: 'Hai un aggiornamento dal tuo coach.',
    url: '/',
    tag: 'ai-coach-generic',
  }

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() }
    } catch {
      // Not JSON — fall back to the raw text as body.
      payload = { ...payload, body: event.data.text() }
    }
  }

  const { title, body, url, tag, anomaly_type } = payload

  const options = {
    body,
    tag: tag || 'ai-coach-generic',
    // renotify=true so a new anomaly of the same type overrides any still-visible
    // older one instead of being silently collapsed by the OS.
    renotify: true,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    lang: 'it',
    vibrate: [100, 50, 100],
    data: { url: url || '/', anomaly_type },
    actions: [
      { action: 'open', title: 'Apri' },
      { action: 'dismiss', title: 'Ignora' },
    ],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// ─── Notification click ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return

  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      // If the app is already open somewhere, focus it and navigate there
      // instead of spawning a second tab.
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client && client.url !== targetUrl) {
            try {
              await client.navigate(targetUrl)
            } catch {
              // Cross-origin navigate is blocked — ignore.
            }
          }
          return
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl)
      }
    })()
  )
})

// ─── Subscription change ────────────────────────────────────────────────────
// Fired when the push service rotates the subscription (e.g. browser cleanup).
// We re-subscribe silently and POST the new endpoint to our server.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const sub = await self.registration.pushManager.getSubscription()
        if (!sub) return
        await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        })
      } catch {
        // Silent — the client will reconcile on the next page load.
      }
    })()
  )
})
