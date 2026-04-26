import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Shape of a single row in `user_notification_preferences`. Kept inline (not
// in lib/types.ts) because only the GET/PATCH route and the cron consume it.
export interface NotificationPreferencesRow {
  evening_reports_enabled: boolean
  morning_motivation_enabled: boolean
  summer_episode_active: boolean
}

const PreferencesSchema = z.object({
  evening_reports_enabled: z.boolean().optional(),
  morning_motivation_enabled: z.boolean().optional(),
  summer_episode_active: z.boolean().optional(),
})

const DEFAULTS: NotificationPreferencesRow = {
  evening_reports_enabled: true,
  morning_motivation_enabled: true,
  summer_episode_active: false,
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_notification_preferences')
    .select('evening_reports_enabled, morning_motivation_enabled, summer_episode_active')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // No row yet → return the schema defaults so the UI can render the toggles
  // in their canonical state without a second roundtrip to insert defaults.
  return NextResponse.json(data ?? DEFAULTS)
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = PreferencesSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid preferences payload', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('user_notification_preferences')
    .upsert(
      {
        user_id: user.id,
        ...parsed.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('evening_reports_enabled, morning_motivation_enabled, summer_episode_active')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
