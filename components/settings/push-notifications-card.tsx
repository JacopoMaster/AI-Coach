'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Bell, BellOff, Loader2, Sparkles } from 'lucide-react'
import {
  checkPushSupport,
  disablePushNotifications,
  enablePushNotifications,
  isPushEnabled,
} from '@/lib/push/client'

export function PushNotificationsCard() {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unsupported, setUnsupported] = useState<string | null>(null)

  const [morningEnabled, setMorningEnabled] = useState(true)
  const [morningSaving, setMorningSaving] = useState(false)

  useEffect(() => {
    const support = checkPushSupport()
    if (!support.supported) {
      setUnsupported(support.reason)
      setLoading(false)
      return
    }
    Promise.all([
      isPushEnabled(),
      fetch('/api/notifications/preferences')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([isOn, prefs]) => {
        setEnabled(isOn)
        if (prefs?.morning_motivation_enabled !== undefined) {
          setMorningEnabled(Boolean(prefs.morning_motivation_enabled))
        }
      })
      .finally(() => setLoading(false))
  }, [])

  async function toggle() {
    setError(null)
    setLoading(true)
    try {
      if (enabled) {
        await disablePushNotifications()
        setEnabled(false)
      } else {
        await enablePushNotifications()
        setEnabled(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto')
    } finally {
      setLoading(false)
    }
  }

  async function toggleMorning() {
    const next = !morningEnabled
    setMorningSaving(true)
    setError(null)
    setMorningEnabled(next) // optimistic
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ morning_motivation_enabled: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Salvataggio preferenze fallito')
      }
      // Confirm against the server's returned value — the PATCH route echoes
      // the row that actually landed in DB, so we stay coherent even if a
      // migration/rename ever tweaks the column defaults.
      const body = (await res.json()) as { morning_motivation_enabled?: boolean }
      if (typeof body.morning_motivation_enabled === 'boolean') {
        setMorningEnabled(body.morning_motivation_enabled)
      }
    } catch (err) {
      setMorningEnabled(!next) // rollback
      setError(err instanceof Error ? err.message : 'Errore sconosciuto')
    } finally {
      setMorningSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Notifiche Coach Proattivo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Ricevi promemoria quando salti un allenamento, sforati le calorie o
          hai un check-in in sospeso.
        </p>

        {unsupported ? (
          <p className="text-sm text-amber-500">
            Notifiche non disponibili su questo browser ({unsupported}).
          </p>
        ) : (
          <>
            <Button
              onClick={toggle}
              disabled={loading}
              variant={enabled ? 'outline' : 'default'}
              className="w-full"
            >
              {loading ? (
                <Loader2 className="animate-spin h-4 w-4" />
              ) : enabled ? (
                <BellOff className="h-4 w-4" />
              ) : (
                <Bell className="h-4 w-4" />
              )}
              {enabled ? 'Disattiva notifiche' : 'Attiva notifiche'}
            </Button>

            {enabled && (
              // The DB column is still `morning_motivation_enabled` for
              // backwards compatibility (existing cron + migrations key off
              // that name). The user-facing label is "Pomeridiani" per the
              // scheduling behaviour we settled on.
              <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                <span className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  Promemoria Motivazionali Pomeridiani
                </span>
                <input
                  type="checkbox"
                  checked={morningEnabled}
                  disabled={morningSaving}
                  onChange={toggleMorning}
                  className="h-4 w-4 accent-primary"
                  aria-label="Promemoria Motivazionali Pomeridiani"
                />
              </label>
            )}
          </>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
      </CardContent>
    </Card>
  )
}
