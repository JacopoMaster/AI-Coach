/**
 * Browser-side helpers for Web Push Notifications (VAPID).
 *
 * Call `enablePushNotifications()` from a user gesture (e.g. a Settings toggle):
 * browsers require an explicit user interaction before the permission prompt
 * can be shown.
 */

// ─── Base64url → Uint8Array ──────────────────────────────────────────────────
// The VAPID public key is distributed as a URL-safe base64 string but the
// PushManager wants the raw bytes. This conversion is the only browser-specific
// quirk of the whole subscription flow.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  // Allocate an ArrayBuffer (not SharedArrayBuffer) so the resulting view is a
  // valid BufferSource for PushManager.subscribe({ applicationServerKey }).
  const buffer = new ArrayBuffer(raw.length)
  const out = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export type PushSupport =
  | { supported: true }
  | { supported: false; reason: string }

export function checkPushSupport(): PushSupport {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'SSR' }
  }
  if (!('serviceWorker' in navigator)) {
    return { supported: false, reason: 'Service Worker non supportato' }
  }
  if (!('PushManager' in window)) {
    return { supported: false, reason: 'Push API non supportata' }
  }
  if (!('Notification' in window)) {
    return { supported: false, reason: 'Notifiche non supportate' }
  }
  return { supported: true }
}

async function getVapidPublicKey(): Promise<string> {
  const res = await fetch('/api/notifications/subscribe', { method: 'GET' })
  if (!res.ok) throw new Error('VAPID key non disponibile')
  const { publicKey } = (await res.json()) as { publicKey: string }
  return publicKey
}

async function persistSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  const res = await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Salvataggio subscription fallito')
  }
}

/**
 * Full subscribe flow: register the SW, ask for permission, subscribe, POST.
 * Returns the active subscription so callers can tell the user it worked.
 */
export async function enablePushNotifications(): Promise<PushSubscription> {
  const support = checkPushSupport()
  if (!support.supported) throw new Error(support.reason)

  const registration =
    (await navigator.serviceWorker.getRegistration()) ||
    (await navigator.serviceWorker.register('/sw.js'))

  // Wait until the SW is active — subscribing against a still-installing
  // worker occasionally fails silently on Safari.
  if (!registration.active) {
    await new Promise<void>((resolve) => {
      const worker = registration.installing || registration.waiting
      if (!worker) return resolve()
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') resolve()
      })
    })
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Permesso notifiche negato')
  }

  // If a subscription already exists, reuse it — requesting a new one would
  // invalidate the old endpoint server-side.
  const existing = await registration.pushManager.getSubscription()
  if (existing) {
    await persistSubscription(existing)
    return existing
  }

  const publicKey = await getVapidPublicKey()
  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true, // Required by Chrome — every push must show UI.
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
  await persistSubscription(sub)
  return sub
}

export async function disablePushNotifications(): Promise<void> {
  const support = checkPushSupport()
  if (!support.supported) return

  const registration = await navigator.serviceWorker.getRegistration()
  const sub = await registration?.pushManager.getSubscription()
  if (!sub) return

  await fetch(
    `/api/notifications/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`,
    { method: 'DELETE' }
  )
  await sub.unsubscribe()
}

export async function isPushEnabled(): Promise<boolean> {
  const support = checkPushSupport()
  if (!support.supported) return false
  if (Notification.permission !== 'granted') return false
  const registration = await navigator.serviceWorker.getRegistration()
  const sub = await registration?.pushManager.getSubscription()
  return !!sub
}
