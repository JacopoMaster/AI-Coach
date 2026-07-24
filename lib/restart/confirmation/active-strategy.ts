// Restart confirmation — active Strategy lookup (F2.6b). READ-ONLY, error-honest.
//
// Reads the caller's currently-active Training Strategy id, to be embedded (signed)
// as expected_active_strategy_id in the token. The partial unique index
// (training_strategies_one_active_per_user_uidx) guarantees at most one row.
//
// ERROR HONESTY (D015): "query succeeded, no row" → null; a real DB error THROWS
// (never turned into null). RLS scopes the read to the caller. The RPC remains the
// definitive authority on staleness at confirm time — this value is only the
// snapshot observed when the proposal was made.

import type { SupabaseClient } from '@supabase/supabase-js'

export class ActiveStrategyLookupError extends Error {
  readonly code = 'active_strategy_lookup_error' as const
  constructor(message = 'active strategy lookup failed') {
    super(message)
    this.name = 'ActiveStrategyLookupError'
  }
}

export async function readActiveStrategyId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('training_strategies')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    // Do NOT mask a DB error as "no active strategy".
    throw new ActiveStrategyLookupError(error.message)
  }
  return data?.id ?? null
}
