// Restart Assessment API (F2.4) — GET (adaptive questions + bounded baseline) and
// POST (assemble a persistence-ready draft). READ-ONLY: this route NEVER writes
// to restart_assessments and NEVER touches training_strategies / athlete_profiles
// / workout_plans / mesocycles. Persistence is F2.6, atomically, after user
// confirmation (D007/D018).
//
// Security & semantics (P0.3 / profile-route style):
//   • auth required (401 anonymous); everything is scoped to the authenticated
//     user — user_id comes from the session, never the body;
//   • the POST body is validated by a STRICT Zod schema whose only accepted key
//     is `answers` (the four manual fields) — a client can never supply
//     snapshots / data quality / counts / body metrics / PlanFit / plan_id /
//     mesocycle_id / user_id / analysis_date; those are always server-derived;
//   • application states are 200 + a `status` discriminant (profile_required /
//     needs_answers / profile_update_required / ready_for_strategy_proposal);
//     a malformed body or an answer to a non-asked question is 400; DB / internal
//     failures are a GENERIC 500 (no raw Supabase/SQL text, stack, cause, user_id,
//     token or cookie). Nothing sensitive (snapshot / baseline / answers) logged.

import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import { RestartAssessmentRequestSchema } from '@/lib/restart/assessment/schema'
import { getRestartAssessment, postRestartAssessment } from '@/lib/restart/assessment/server'

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
    const result = await getRestartAssessment(supabase, user.id)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[restart/assessment] GET failed:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = RestartAssessmentRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid restart assessment request', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  try {
    const result = await postRestartAssessment(supabase, user.id, parsed.data.answers)

    // An answer to a question the server did not ask is a hard client error.
    if (result.status === 'unexpected_answer') {
      return NextResponse.json(
        { error: 'Unexpected answer', code: 'unexpected_answer', unexpected: result.unexpected },
        { status: 400 }
      )
    }

    // profile_required / needs_answers / profile_update_required /
    // ready_for_strategy_proposal — all valid application states, 200. No write.
    return NextResponse.json(result)
  } catch (err) {
    console.error('[restart/assessment] POST failed:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
