/* eslint-disable */
// ─── Web Push handler ─────────────────────────────────────────────────────────
// Imported by /sw.js via importScripts('/push-handler.js'). Keeping the push
// logic in its own file means the next-pwa workbox bundle can be regenerated
// without touching this handler.
//
// Contract:
//   • The server (supabase/functions/morning-motivation, /api/... etc.) sends a
//     JSON payload shaped like { title, body, url?, icon?, badge?, tag? }.
//   • We show a notification using that payload. On click we focus an existing
//     tab if possible, otherwise open a new one at `url` (default: '/').
//
// Everything is wrapped in try/catch so a malformed payload never kills the SW.

self.addEventListener('push', function (event) {
  const fallback = {
    title: 'Spirale',
    body: 'Hai una nuova notifica dal tuo Coach.',
    // PNG is the most portable choice across Android, iOS, and desktop push
    // services — some downsize or refuse SVG in notifications.
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    url: '/',
  }

  let payload = { ...fallback }
  if (event.data) {
    try {
      const json = event.data.json()
      payload = { ...fallback, ...json }
    } catch (_) {
      // Non-JSON payload: fall back to plain text body if available.
      try {
        const text = event.data.text()
        if (text) payload.body = text
      } catch (_) {}
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || fallback.icon,
    badge: payload.badge || fallback.badge,
    tag: payload.tag || undefined,
    // `data` rides along to the notificationclick handler below.
    data: { url: payload.url || fallback.url },
    // Renotify so the latest message replaces a prior one under the same tag
    // without silently disappearing (iOS/Chrome behave differently here).
    renotify: Boolean(payload.tag),
    // Required by Chrome — every push must display user-visible UI.
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(payload.title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()

  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    (async function () {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      // Prefer focusing an already-open tab on the target route.
      for (const client of allClients) {
        try {
          const url = new URL(client.url)
          if (url.pathname === targetUrl && 'focus' in client) {
            return client.focus()
          }
        } catch (_) {}
      }

      // Next-best: any tab of the app — navigate it to the target.
      for (const client of allClients) {
        if ('navigate' in client && 'focus' in client) {
          try {
            await client.navigate(targetUrl)
            return client.focus()
          } catch (_) {}
        }
      }

      // Finally, open a fresh window.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })()
  )
})

// When a subscription expires (server-side rotation or user revokes perms),
// browsers emit `pushsubscriptionchange`. Try to resubscribe silently — if
// that fails the next enable-in-UI flow will recover.
self.addEventListener('pushsubscriptionchange', function (event) {
  event.waitUntil(
    (async function () {
      try {
        const registration = self.registration
        const oldSub = event.oldSubscription
        const appServerKey = oldSub && oldSub.options && oldSub.options.applicationServerKey
        if (!appServerKey) return
        const newSub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        })
        await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: newSub.endpoint,
            keys: newSub.toJSON().keys,
            userAgent: self.navigator ? self.navigator.userAgent : undefined,
          }),
        })
      } catch (_) {
        // Next user interaction will recover via the enable flow.
      }
    })()
  )
})
