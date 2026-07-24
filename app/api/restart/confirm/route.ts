// Restart confirmation API (F2.6b) — POST only. Closes the Restart hybrid flow
// (D007/D018): the user confirms by sending ONLY a signed token; the server
// re-authenticates, verifies the token, rebuilds & re-validates the Assessment
// server-side, and persists via the F2.6a atomic/idempotent RPC (D021). It NEVER
// trusts a client-supplied draft/proposal/answers and NEVER calls Anthropic.
//
// Body (strict): { "confirmation_token": "..." } — nothing else is accepted.
//
// Error mapping (§21) — GENERIC bodies only; never leak Supabase message/SQLSTATE/
// stack/token payload/fingerprint/snapshot/user binding/secret/user_id:
//   401 Unauthorized                   — no session
//   400 invalid_confirmation_token     — malformed body / bad token / bad binding
//   410 confirmation_expired           — token past expiry (even on replay)
//   409 confirmation_stale             — assessment/Profile/baseline moved, or RPC stale
//   500 confirmation_failed            — config / non-stale DB-RPC error / bad RPC row / invariant

import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import { RestartConfirmRequestSchema } from '@/lib/restart/confirmation/schema'
import { confirmRestartStrategy } from '@/lib/restart/confirmation/confirm'
import {
  ConfirmationExpiredError,
  ConfirmationStaleError,
  InvalidConfirmationTokenError,
} from '@/lib/restart/confirmation/errors'

// Uses Node crypto (HMAC/SHA-256) → must run on the Node.js runtime, not Edge.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = RestartConfirmRequestSchema.safeParse(body)
  if (!parsed.success) {
    // A malformed body (extra keys, missing/oversized token) is an invalid token.
    return NextResponse.json({ error: 'invalid_confirmation_token' }, { status: 400 })
  }

  try {
    const result = await confirmRestartStrategy(supabase, user.id, parsed.data.confirmation_token)
    return NextResponse.json(result) // { status:'confirmed', assessment_id, strategy_id, created_new }
  } catch (err) {
    if (err instanceof InvalidConfirmationTokenError) {
      return NextResponse.json({ error: 'invalid_confirmation_token' }, { status: 400 })
    }
    if (err instanceof ConfirmationExpiredError) {
      return NextResponse.json({ error: 'confirmation_expired' }, { status: 410 })
    }
    if (err instanceof ConfirmationStaleError) {
      return NextResponse.json({ error: 'confirmation_stale' }, { status: 409 })
    }
    // ConfirmationConfigError / ConfirmationFailedError / DB error / anything else.
    console.error('[restart/confirm] POST failed')
    return NextResponse.json({ error: 'confirmation_failed' }, { status: 500 })
  }
}
