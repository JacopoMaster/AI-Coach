// deno-lint-ignore-file no-explicit-any
/**
 * Web Push sender for Deno / Supabase Edge Functions.
 *
 * Uses the official `web-push` npm package via Deno's `npm:` specifier,
 * which Supabase Edge Functions support natively. VAPID details are set
 * once per invocation from env vars.
 */

import webpush from 'npm:web-push@3.6.7'

export interface StoredSubscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  anomaly_type?: string
}

export interface DispatchResult {
  delivered: number
  failed: number
  // IDs of subscriptions that returned 404/410 so the caller can prune them.
  expiredIds: string[]
}

function configureVapid() {
  const subject = Deno.env.get('VAPID_SUBJECT') // e.g. "mailto:coach@example.com"
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!subject || !publicKey || !privateKey) {
    throw new Error('VAPID env vars missing (VAPID_SUBJECT / _PUBLIC_KEY / _PRIVATE_KEY)')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
}

export async function dispatch(
  subs: StoredSubscription[],
  payload: PushPayload
): Promise<DispatchResult> {
  configureVapid()
  const result: DispatchResult = { delivered: 0, failed: 0, expiredIds: [] }
  const body = JSON.stringify(payload)

  // Fan out in parallel but catch each promise so one failure doesn't kill
  // the batch. A typical user has 1-3 subs so this is cheap.
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          body,
          { TTL: 60 * 60, urgency: 'normal' }
        )
        result.delivered++
      } catch (err: any) {
        // 404 Not Found / 410 Gone mean the push service dropped the endpoint —
        // the browser unsubscribed or uninstalled the PWA. Mark for pruning.
        // `web-push` surfaces the HTTP status on `err.statusCode`.
        const status = err?.statusCode ?? err?.response?.status ?? err?.status
        if (status === 404 || status === 410) {
          result.expiredIds.push(s.id)
        }
        result.failed++
      }
    })
  )

  return result
}
