'use client'

// Vacation-mode toggle. When ON, the daily Vercel Cron at
// /api/cron/proactive-coach skips this user — no training-day reminders, no
// missed-workout nags. EXP / achievements / passive flows are untouched.

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Palmtree } from 'lucide-react'

export function SummerEpisodeCard() {
  const [active, setActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/notifications/preferences')
      .then((r) => (r.ok ? r.json() : null))
      .then((prefs: { summer_episode_active?: boolean } | null) => {
        if (prefs?.summer_episode_active !== undefined) {
          setActive(Boolean(prefs.summer_episode_active))
        }
      })
      .catch(() => {
        // Silent — defaults to "off" which is the safe fallback.
      })
      .finally(() => setLoading(false))
  }, [])

  async function toggle() {
    const next = !active
    setSaving(true)
    setError(null)
    setActive(next)  // optimistic
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summer_episode_active: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Salvataggio fallito')
      }
      const body = (await res.json()) as { summer_episode_active?: boolean }
      if (typeof body.summer_episode_active === 'boolean') {
        setActive(body.summer_episode_active)
      }
    } catch (err) {
      setActive(!next)  // rollback
      setError(err instanceof Error ? err.message : 'Errore sconosciuto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/[0.02]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Palmtree className="h-4 w-4 text-amber-500" />
          🏖️ Episodio Estivo (Pausa Vacanza)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Sospendi temporaneamente le notifiche proattive del Coach. EXP,
          trofei e progressi restano attivi.
        </p>

        <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
          <span className="text-sm">Attiva pausa vacanza</span>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <input
              type="checkbox"
              checked={active}
              disabled={saving}
              onChange={toggle}
              className="h-4 w-4 accent-amber-500"
              aria-label="Episodio Estivo"
            />
          )}
        </label>

        {active && !loading && (
          <p className="text-xs text-amber-500/90">
            La trivella è in ricarica. Le notifiche proattive del Coach sono
            sospese per farti riposare.
          </p>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}
      </CardContent>
    </Card>
  )
}
