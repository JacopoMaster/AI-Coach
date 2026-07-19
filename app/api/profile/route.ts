// Athlete Profile API (F1.3) — GET (read own + derived completeness) and
// PATCH (partial, progressive update of own profile).
//
// Security & semantics:
//   • auth required (401 anonymous); the row is always scoped to the
//     authenticated user — user_id is taken from the session, never the body;
//   • PATCH is validated by a STRICT Zod schema (unknown keys, incl. user_id/
//     created_at/updated_at → 400) that preserves omitted vs null vs [];
//   • cross-field coherence is checked on the RESULTING profile (existing +
//     patch) → 400 on violation, no write;
//   • DB failures return a GENERIC 500 (P0.3 style) — no raw Supabase/SQL text.
// Not exposed to the Coach here (that is F1.5).

import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import { getAthleteProfile, upsertAthleteProfile } from '@/lib/profile/server'
import { AthleteProfilePatchSchema, validateProfileCoherence } from '@/lib/profile/schema'
import { getProfileCompleteness } from '@/lib/profile/completeness'
import type { AthleteProfile } from '@/lib/profile/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const profile = await getAthleteProfile(supabase, user.id)
    return NextResponse.json({
      profile,
      completeness: getProfileCompleteness(profile),
    })
  } catch (err) {
    console.error('[profile] GET failed:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = AthleteProfilePatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid profile patch', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  try {
    // Coherence is evaluated on existing + patch, since a PATCH may change only
    // one side of a min/target (or primary/secondary) relationship.
    const existing = await getAthleteProfile(supabase, user.id)
    const merged: Partial<AthleteProfile> = { ...(existing ?? {}), ...parsed.data }

    const coherence = validateProfileCoherence(merged)
    if (coherence) {
      return NextResponse.json(
        { error: 'Incoherent profile', field: coherence.field, message: coherence.message },
        { status: 400 }
      )
    }

    const profile = await upsertAthleteProfile(supabase, user.id, parsed.data)
    return NextResponse.json({
      profile,
      completeness: getProfileCompleteness(profile),
    })
  } catch (err) {
    console.error('[profile] PATCH failed:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
