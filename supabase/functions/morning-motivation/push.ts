// deno-lint-ignore-file no-explicit-any
/**
 * Web Push dispatcher — identical contract to proactive-coach/push.ts.
 * Duplicated (rather than imported across function dirs) because Supabase
 * Edge Functions resolve modules per-function and don't auto-share siblings.
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
  expiredIds: string[]
}

function configureVapid() {
  const subject = Deno.env.get('VAPID_SUBJECT')
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!subject || !publicKey || !privateKey) {
    throw new Error('VAPID env vars missing')
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

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60, urgency: 'normal' }
        )
        result.delivered++
      } catch (err: any) {
        const status = err?.statusCode ?? err?.response?.status ?? err?.status
        if (status === 404 || status === 410) result.expiredIds.push(s.id)
        result.failed++
      }
    })
  )

  return result
}
