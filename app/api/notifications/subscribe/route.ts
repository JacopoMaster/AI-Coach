import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Shape of a PushSubscription.toJSON() serialization — this is exactly what the
// browser gives us on the client side.
const SubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  // Optional metadata so we can distinguish desktop/mobile rows during debugging.
  userAgent: z.string().max(500).optional(),
})

// ─── POST: upsert current-user's subscription ────────────────────────────────
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = SubscriptionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid subscription payload', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const { endpoint, keys, userAgent } = parsed.data

  // Upsert on the endpoint so re-subscribing from the same browser doesn't
  // create duplicate rows. If the endpoint was previously owned by a different
  // user (shared device) we rebind it to the current user.
  const { data, error } = await supabase
    .from('user_push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: userAgent ?? request.headers.get('user-agent'),
        failure_count: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    )
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id, success: true })
}

// ─── DELETE: unsubscribe (called from client when user revokes permission) ───
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get('endpoint')
  if (!endpoint) {
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
  }

  const { error } = await supabase
    .from('user_push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// ─── GET: expose the VAPID public key to the client ──────────────────────────
// Keeping this alongside /subscribe avoids a second round trip during setup.
export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) {
    return NextResponse.json(
      { error: 'VAPID public key not configured' },
      { status: 500 }
    )
  }
  return NextResponse.json({ publicKey })
}
