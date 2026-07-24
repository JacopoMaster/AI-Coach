// Restart Strategy Proposal API (F2.5) — POST only. Turns the F2.4 assessment
// draft into an EPHEMERAL, structured Training Strategy proposal via a single
// forced-tool AI call. READ-ONLY: NEVER writes restart_assessments /
// training_strategies / athlete_profiles / workout_plans / mesocycles. Persistence
// is F2.6, after user confirmation (D007/D018) and a fresh server-side validation.
//
// Security & semantics:
//   • auth required (401 anonymous); user_id from the session, never the body;
//   • the body is the SAME strict F2.4 schema — only `{ answers }` (4 manual
//     fields). A client can never send assessment_draft / strategy_proposal /
//     baseline / snapshots / analysis_date / target|minimum / plan|meso id /
//     user_id: all server-derived;
//   • states: 200 + `status` (profile_required / needs_answers /
//     profile_update_required / ready_for_confirmation); 400 malformed body or
//     unexpected_answer; 502 AI provider failure or invalid AI output after retry;
//     500 other internal errors. GENERIC bodies only — no Anthropic text, no
//     validation details, no stack, no prompt, no snapshots, no api key, no user_id.
//     Nothing sensitive (prompt / assessment / AI response / manual answers) logged.

import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import { RestartAssessmentRequestSchema } from '@/lib/restart/assessment/schema'
import { generateRestartStrategyProposal } from '@/lib/restart/strategy-proposal/server'
import { InvalidAiOutputError, StrategyProviderError } from '@/lib/restart/strategy-proposal/errors'

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
  const parsed = RestartAssessmentRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid restart assessment request', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  try {
    const result = await generateRestartStrategyProposal(supabase, user.id, parsed.data.answers)

    // An answer to a question the server did not ask is a hard client error.
    if (result.status === 'unexpected_answer') {
      return NextResponse.json(
        { error: 'Unexpected answer', code: 'unexpected_answer', unexpected: result.unexpected },
        { status: 400 }
      )
    }

    // profile_required / needs_answers / profile_update_required / ready_for_confirmation
    return NextResponse.json(result)
  } catch (err) {
    // AI provider failure OR invalid AI output after the single retry → 502 generic.
    if (err instanceof StrategyProviderError || err instanceof InvalidAiOutputError) {
      console.error('[restart/strategy-proposal] generation failed:', err.code)
      return NextResponse.json({ error: 'strategy_generation_failed' }, { status: 502 })
    }
    // Anything else (DB error, internal invariant) → generic 500.
    console.error('[restart/strategy-proposal] POST failed')
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
