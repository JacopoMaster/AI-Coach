// POST /api/push/test — fires a canned push to every endpoint registered for
// the authenticated user. Lives in its own route so the Settings page can
// offer a one-tap "does this actually work?" affordance without reaching
// into the Edge Function (which requires a separate trigger + cron access).
//
// Runtime note: `web-push` depends on Node crypto and cannot run in the Edge
// runtime. We pin the route to `nodejs` explicitly so a future Next default
// flip doesn't silently break it.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import webpush, { type PushSubscription, type WebPushError } from 'web-push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TEST_PAYLOAD = {
  title: 'Test Risonanza',
  body: 'Energia a Spirale connessa con successo!',
  url: '/status',
  tag: 'spiral-test',
  // Full-color logo shown at the top-left of the notification card.
  icon: '/icons/icon-192.png',
  // Android status-bar mark. Must be monochrome white-on-transparent; the
  // OS tints it itself. Ignored on iOS/desktop where the icon is reused.
  badge: '/icons/badge-72.png',
}

function configureVapid(): { ok: true } | { ok: false; error: string } {
  const publicKey =
    process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:coach@example.com'

  if (!publicKey || !privateKey) {
    return {
      ok: false,
      error:
        'VAPID keys non configurate sul server (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).',
    }
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  return { ok: true }
}

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const vapid = configureVapid()
  if (!vapid.ok) {
    return NextResponse.json({ error: vapid.error }, { status: 500 })
  }

  const { data: subs, error } = await supabase
    .from('user_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!subs || subs.length === 0) {
    return NextResponse.json(
      {
        error:
          'Nessuna subscription trovata. Attiva prima le notifiche da questo dispositivo.',
      },
      { status: 404 }
    )
  }

  const payload = JSON.stringify(TEST_PAYLOAD)
  let delivered = 0
  let failed = 0
  const expiredIds: string[] = []

  // Fire-and-forget in parallel — each failure is caught locally so one dead
  // endpoint can't prevent delivery to the others.
  await Promise.all(
    subs.map(async (sub) => {
      const subscription: PushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }
      try {
        await webpush.sendNotification(subscription, payload, { TTL: 60 })
        delivered += 1
      } catch (err) {
        failed += 1
        const status = (err as WebPushError)?.statusCode
        // 404/410 = subscription permanently gone (user revoked perms, uninstalled
        // PWA, etc.). Prune it so the next enable flow can re-register cleanly.
        if (status === 404 || status === 410) {
          expiredIds.push(sub.id)
        } else {
          console.error('[push/test] send failed:', status, err)
        }
      }
    })
  )

  if (expiredIds.length > 0) {
    await supabase
      .from('user_push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .in('id', expiredIds)
  }

  // Touch last_notified_at for delivered endpoints so we have a manual-test
  // timestamp visible when debugging scheduling issues.
  if (delivered > 0) {
    const deliveredIds = subs
      .filter((s) => !expiredIds.includes(s.id))
      .map((s) => s.id)
    if (deliveredIds.length > 0) {
      await supabase
        .from('user_push_subscriptions')
        .update({ last_notified_at: new Date().toISOString() })
        .in('id', deliveredIds)
    }
  }

  if (delivered === 0 && failed > 0) {
    return NextResponse.json(
      {
        error: `Invio fallito su tutti gli endpoint (${failed}). Riattiva le notifiche.`,
        delivered,
        failed,
        pruned: expiredIds.length,
      },
      { status: 502 }
    )
  }

  return NextResponse.json({
    success: true,
    delivered,
    failed,
    pruned: expiredIds.length,
    payload: TEST_PAYLOAD,
  })
}
